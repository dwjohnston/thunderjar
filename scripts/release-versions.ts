#!/usr/bin/env bun
// AI-generated script. Review before relying on it.
import { $, file, write } from "bun";
import getReleasePlan from "@changesets/get-release-plan";
import { Command } from "commander";

type ReleasePlan = Awaited<ReturnType<typeof getReleasePlan>>;

const REPO_ROOT = Bun.fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const RC_FILE = ".release/rc.json";
const SHORT_SHA_LENGTH = 7;
const BUMP_TYPES = ["major", "minor", "patch"] as const;

export type BumpType = (typeof BUMP_TYPES)[number];
export type RcChangeset = { id: string; type: BumpType; summary: string };
export type RcFile = { version: string; changesets: RcChangeset[] };
export type RcDecision = { action: "open"; rc: RcFile } | { action: "close" };

function help() {
  return `
Version helpers for release candidates and previews. See AGENTS.md, "Releases".

Release candidates (RCs) are tracked in ${RC_FILE}. The RC PR only changes that
file. Merging it publishes the version in it with the npm "rc" tag.

- prepare-rc     Decide whether the RC PR should be open. If so, write
                 ${RC_FILE} and the PR body, and print {"action":"open","version":...}.
                 Otherwise print {"action":"close"}.
- rc-to-publish  Print the RC version in ${RC_FILE} if it has no git tag yet,
                 and is not stale (its stable version is unreleased, and its
                 changesets are still pending). Otherwise print nothing.
- rc-notes       Print the release notes for the RC in ${RC_FILE}.
- preview        Print the preview version for a commit: <next>-preview-<short sha>.

<next> is the version the pending changesets would release. With no pending
changesets, it is a patch bump of the current version.
`;
}

if (import.meta.main) {
  const program = new Command()
    // 👇
    .description(help())
    .showHelpAfterError();

  program
    .command("prepare-rc")
    .description(`write ${RC_FILE} and the PR body if a new RC is needed`)
    .requiredOption("--body-file <path>", "where to write the RC PR body")
    .action(async (opts: { bodyFile: string }) => {
      const decision = await prepareRc(REPO_ROOT, opts.bodyFile);
      console.log(JSON.stringify(decision.action === "open" ? { action: "open", version: decision.rc.version } : decision));
    });

  program
    .command("rc-to-publish")
    .description(`print the version in ${RC_FILE} if it is not yet tagged`)
    .action(async () => {
      const version = await rcToPublish(REPO_ROOT);
      if (version) console.log(version);
    });

  program
    .command("rc-notes")
    .description(`print the release notes for ${RC_FILE}`)
    .action(async () => {
      console.log(renderNotes(await readRcFile(REPO_ROOT)));
    });

  program
    .command("preview")
    .description("print the preview version for a commit")
    .requiredOption("--sha <sha>", "full or short commit sha the preview is built from")
    .action(async (opts: { sha: string }) => {
      console.log(previewVersion(await nextVersion(REPO_ROOT), opts.sha));
    });

  await program.parseAsync();
}

export async function prepareRc(repoRoot: string, bodyFile: string): Promise<RcDecision> {
  const plan = await getReleasePlan(repoRoot);
  const name = await packageName(repoRoot);
  const pending = pendingChangesets(plan, name);
  const previous = await readRcFileIfExists(repoRoot);
  const decision = decideRc({
    pending,
    nextVersion: plan.releases.find((release) => release.name === name)?.newVersion,
    previous,
    tags: await gitTags(repoRoot),
  });

  if (decision.action === "open") {
    await write(`${repoRoot}/${RC_FILE}`, `${JSON.stringify(decision.rc, null, 2)}\n`);
    await write(bodyFile, renderPrBody(decision.rc));
  }
  return decision;
}

export async function rcToPublish(repoRoot: string): Promise<string | undefined> {
  const rc = await readRcFileIfExists(repoRoot);
  if (!rc) return undefined;

  const plan = await getReleasePlan(repoRoot);
  const decision = decideRcToPublish(rc, await gitTags(repoRoot), plan.changesets.map((c) => c.id));
  if ("skip" in decision) {
    console.error(decision.skip);
    return undefined;
  }
  return decision.version;
}

export function decideRcToPublish(
  rc: RcFile,
  tags: string[],
  pendingIds: string[],
): { version: string } | { skip: string } {
  if (tags.includes(`v${rc.version}`)) return { skip: `${rc.version} is already tagged.` };

  const stable = rc.version.replace(/-rc\.\d+$/, "");
  if (tags.includes(`v${stable}`)) {
    return { skip: `Skipping ${rc.version}: v${stable} is already released.` };
  }

  const pending = new Set(pendingIds);
  const consumed = rc.changesets.filter((c) => !pending.has(c.id)).map((c) => c.id);
  if (consumed.length > 0) {
    return { skip: `Skipping ${rc.version}: changesets ${consumed.join(", ")} were already released.` };
  }
  return { version: rc.version };
}

export async function nextVersion(repoRoot: string): Promise<string> {
  const plan = await getReleasePlan(repoRoot);
  const name = await packageName(repoRoot);
  const release = plan.releases.find((r) => r.name === name);
  if (release && release.type !== "none") return release.newVersion;

  const { version } = await file(`${repoRoot}/package.json`).json();
  return bumpPatch(version);
}

export function decideRc(input: {
  pending: RcChangeset[];
  nextVersion: string | undefined;
  previous: RcFile | undefined;
  tags: string[];
}): RcDecision {
  const { pending, nextVersion, previous, tags } = input;
  if (pending.length === 0 || !nextVersion) return { action: "close" };

  const released = new Set(previous?.changesets.map((c) => c.id) ?? []);
  const previousBase = previous?.version.replace(/-rc\.\d+$/, "");
  const alreadyInRc = previousBase === nextVersion && pending.every((c) => released.has(c.id));
  if (alreadyInRc) return { action: "close" };

  return { action: "open", rc: { version: `${nextVersion}-rc.${nextRcNumber(tags, nextVersion)}`, changesets: pending } };
}

export function nextRcNumber(tags: string[], version: string): number {
  const prefix = `v${version}-rc.`;
  const numbers = tags
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .filter((n) => /^\d+$/.test(n))
    .map(Number);
  return numbers.length === 0 ? 0 : Math.max(...numbers) + 1;
}

export function previewVersion(base: string, sha: string): string {
  if (!/^[0-9a-f]{7,40}$/.test(sha)) {
    throw new Error(`Not a commit sha: ${sha}`);
  }
  return `${base}-preview-${sha.slice(0, SHORT_SHA_LENGTH)}`;
}

export function bumpPatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Expected a stable x.y.z version, got ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export function pendingChangesets(plan: ReleasePlan, name: string): RcChangeset[] {
  return plan.changesets.flatMap((changeset) => {
    const type = changeset.releases.find((r) => r.name === name)?.type;
    if (!type || type === "none") return [];
    return [{ id: changeset.id, type, summary: changeset.summary.trim() }];
  });
}

export function renderNotes(rc: RcFile): string {
  const titles: Record<BumpType, string> = { major: "Major Changes", minor: "Minor Changes", patch: "Patch Changes" };
  return BUMP_TYPES.flatMap((type) => {
    const changesets = rc.changesets.filter((c) => c.type === type);
    if (changesets.length === 0) return [];
    const items = changesets.map((c) => `- ${c.summary.replace(/\n/g, "\n  ")}`);
    return [`### ${titles[type]}\n\n${items.join("\n")}\n`];
  }).join("\n");
}

function renderPrBody(rc: RcFile): string {
  return `Merging this PR publishes \`${rc.version}\` to npm with the \`rc\` tag, and creates a GitHub pre-release.

It only changes \`${RC_FILE}\`. Versions on \`main\` are left alone, so the stable "Version Packages" PR is unaffected. This PR is updated whenever a PR with changesets is merged to \`main\`, and closed once a stable release uses them.

## ${rc.version}

${renderNotes(rc)}`;
}

async function readRcFile(repoRoot: string): Promise<RcFile> {
  const rc = await readRcFileIfExists(repoRoot);
  if (!rc) throw new Error(`${RC_FILE} does not exist`);
  return rc;
}

async function readRcFileIfExists(repoRoot: string): Promise<RcFile | undefined> {
  const rcFile = file(`${repoRoot}/${RC_FILE}`);
  if (!(await rcFile.exists())) return undefined;
  return (await rcFile.json()) as RcFile;
}

async function packageName(repoRoot: string): Promise<string> {
  const { name } = await file(`${repoRoot}/package.json`).json();
  return name;
}

async function gitTags(repoRoot: string): Promise<string[]> {
  return (await $`git tag --list ${"v*"}`.cwd(repoRoot).text()).split("\n").filter(Boolean);
}
