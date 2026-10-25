import getReleasePlan from "@changesets/get-release-plan";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { changesetFingerprint, latestRcVersion, rcPrVersion, stableVersionFromTag } from "./release-policy.ts";

const root = join(import.meta.dir, "../..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

async function currentChangesets(): Promise<{ path: string; content: string }[]> {
  const names = (await readdir(join(root, ".changeset"))).filter((name) => name.endsWith(".md") && name !== "README.md");
  return Promise.all(names.map(async (name) => ({
    path: `.changeset/${name}`,
    content: await readFile(join(root, ".changeset", name), "utf8"),
  })));
}

function taggedChangesets(tag: string): { path: string; content: string }[] {
  const paths = git("ls-tree", "-r", "--name-only", tag, "--", ".changeset")
    .split("\n")
    .filter((path) => /^\.changeset\/[^/]+\.md$/.test(path) && path !== ".changeset/README.md");
  return paths.map((path) => ({
    path,
    content: execFileSync("git", ["show", `${tag}:${path}`], { cwd: root, encoding: "utf8" }),
  }));
}

async function publishedVersions(): Promise<string[]> {
  const response = await fetch("https://registry.npmjs.org/thunderjar", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
  const metadata = await response.json() as { versions?: Record<string, unknown> };
  return Object.keys(metadata.versions ?? {});
}

async function output(values: Record<string, string>) {
  const path = process.env.GITHUB_OUTPUT;
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  const delimiter = `END_${randomUUID()}`;
  await appendFile(path, Object.entries(values).map(([name, value]) =>
    `${name}<<${delimiter}\n${value}\n${delimiter}\n`).join(""));
}

async function main() {
  const plan = await getReleasePlan(root);
  const release = plan.releases.find((item) => item.name === "thunderjar");
  if (!release || plan.changesets.length === 0) {
    await output({ create: "false" });
    return;
  }
  const stableVersion = release.newVersion;
  if (!stableVersionFromTag(`v${stableVersion}`)) {
    throw new Error(`Changesets did not calculate a stable version: ${stableVersion}`);
  }
  const versions = [...new Set([
    ...await publishedVersions(),
    ...git("tag", "--list", `v${stableVersion}-rc.*`).split("\n").filter(Boolean).map((tag) => tag.slice(1)),
  ])];
  const previous = latestRcVersion(stableVersion, versions);
  const current = changesetFingerprint(await currentChangesets());
  let previousFingerprint: string | undefined;
  if (previous) {
    const tag = `v${previous}`;
    if (!git("tag", "--list", tag).split("\n").includes(tag)) {
      throw new Error(`Published RC ${previous} has no Git tag`);
    }
    previousFingerprint = changesetFingerprint(taggedChangesets(tag));
  }
  const version = rcPrVersion(stableVersion, versions, current, previousFingerprint);
  if (!version) {
    await output({ create: "false" });
    return;
  }
  const packagePath = join(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version: string };
  packageJson.version = version;
  await writeFile(packagePath, JSON.stringify(packageJson, null, 2) + "\n");
  const summaries = plan.changesets.map((changeset) => `- ${changeset.summary.trim().replaceAll("\n", "\n  ")}`).join("\n");
  await output({
    create: "true",
    version,
    title: `Release candidate v${version}`,
    body: `Merge this PR to publish \`thunderjar@${version}\` under npm's \`rc\` tag.\n\nPending changesets remain available for the stable release PR.\n\n${summaries}`,
  });
}

if (import.meta.main) await main();
