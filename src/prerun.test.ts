import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleBuildContext, checkCommits, MissingCommitsError, renderPrerunDockerfile, type PrerunParameters } from "./prerun.ts";
import { findRepository } from "./repository.ts";
import { SEED_COMMITS, seedRepo } from "./testing/seed-repo.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-prerun-"));

/** The fixture permutation's parameters: spec/060-test-case-parameters.md's example, with the fake harness. */
const PARAMETERS: PrerunParameters = {
  baseImage: { applyParameter: () => `FROM node:20-bookworm` },
  codeState: { name: "baseline", commit: SEED_COMMITS.baseline, applyParameter: () => `RUN npm ci` },
  promptSet: {
    name: "snerk",
    commit: SEED_COMMITS.prompts,
    files: { "prompts/snerk.md": "FAKE_INSTRUCTIONS.md" },
    applyParameter: () => ``,
  },
  harness: { version: "1.0.0", applyParameter: (ctx) => `RUN echo "install fake-harness-alpha@${ctx.version}"` },
  initialPrompt: { applyParameter: () => `` },
};

// --- renderPrerunDockerfile: layer 1 ---

test("renders 060's fragment order: base image, checkout, code state, prompt files, harness", () => {
  expect(renderPrerunDockerfile(PARAMETERS)).toBe(`FROM node:20-bookworm
COPY code.bundle /tmp/code.bundle
RUN git clone --quiet /tmp/code.bundle /workspace \\
  && git -C /workspace checkout --quiet --detach ${SEED_COMMITS.baseline} \\
  && git -C /workspace remote remove origin \\
  && git -C /workspace config user.name "Thunderjar agent" \\
  && git -C /workspace config user.email agent@thunderjar.invalid \\
  && rm /tmp/code.bundle
WORKDIR /workspace
RUN npm ci
COPY prompt-set/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md
RUN echo "install fake-harness-alpha@1.0.0"
`);
});

test("a fragment from every parameter lands in its place", () => {
  const dockerfile = renderPrerunDockerfile({
    ...PARAMETERS,
    promptSet: { ...PARAMETERS.promptSet, applyParameter: () => `RUN echo prompt-set` },
    initialPrompt: { applyParameter: () => `RUN echo initial-prompt` },
  });
  const lines = dockerfile.split("\n");
  const at = (line: string) => lines.indexOf(line);
  expect(at("RUN npm ci")).toBeGreaterThan(at("WORKDIR /workspace"));
  expect(at("COPY prompt-set/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md")).toBeGreaterThan(at("RUN npm ci"));
  expect(at("RUN echo prompt-set")).toBeGreaterThan(at("COPY prompt-set/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md"));
  expect(at(`RUN echo "install fake-harness-alpha@1.0.0"`)).toBeGreaterThan(at("RUN echo prompt-set"));
  expect(at("RUN echo initial-prompt")).toBeGreaterThan(at(`RUN echo "install fake-harness-alpha@1.0.0"`));
});

test("an empty fragment adds no line", () => {
  const dockerfile = renderPrerunDockerfile({
    ...PARAMETERS,
    codeState: { ...PARAMETERS.codeState, applyParameter: () => `  \n` },
  });
  expect(dockerfile).not.toContain("npm ci");
  expect(dockerfile).not.toMatch(/\n\s*\n/);
});

test("the harness fragment sees the pair's resolved version as ctx.version", () => {
  const dockerfile = renderPrerunDockerfile({ ...PARAMETERS, harness: { ...PARAMETERS.harness, version: "2.1.283" } });
  expect(dockerfile).toContain(`RUN echo "install fake-harness-alpha@2.1.283"`);
});

test("prompt files go to their destination in /workspace, in JSON form when a path has a space", () => {
  const dockerfile = renderPrerunDockerfile({
    ...PARAMETERS,
    promptSet: { ...PARAMETERS.promptSet, files: { "a.md": ".claude/skills/x/SKILL.md", "b.md": "My Notes.md" } },
  });
  expect(dockerfile).toContain("COPY prompt-set/.claude/skills/x/SKILL.md /workspace/.claude/skills/x/SKILL.md\n");
  expect(dockerfile).toContain(`COPY ["prompt-set/My Notes.md","/workspace/My Notes.md"]\n`);
});

// --- checkCommits and assembleBuildContext, against the seed repository ---

async function seeded() {
  const dir = await tmp();
  await seedRepo(dir);
  return (await findRepository(dir))!;
}

test("checkCommits gives each declared commit's full hash, abbreviated or not", async () => {
  const repository = await seeded();
  const short = { ...PARAMETERS, codeState: { ...PARAMETERS.codeState, commit: SEED_COMMITS.baseline.slice(0, 7) } };
  const resolved = await checkCommits([short], repository);
  expect(resolved.get(SEED_COMMITS.baseline.slice(0, 7))).toBe(SEED_COMMITS.baseline);
  expect(resolved.get(SEED_COMMITS.prompts)).toBe(SEED_COMMITS.prompts);
});

test("a missing commit fails with 062's message, naming the parameter that needs it, once", async () => {
  const repository = await seeded();
  const missing = { ...PARAMETERS, codeState: { ...PARAMETERS.codeState, commit: "a1b2c3" } };
  const check = checkCommits([missing, missing], repository);
  await expect(check).rejects.toThrow(MissingCommitsError);
  await expect(check).rejects.toThrow(
    new MissingCommitsError(
      `error: commit a1b2c3 (code state "baseline") is not in this repository.\nFetch it, or check that it has been pushed.`,
    ),
  );
});

test("a prompt file missing at its commit fails, as does one whose commit is missing", async () => {
  const repository = await seeded();
  // prompts/snerk.md is added after baseline.
  const early = { ...PARAMETERS, promptSet: { ...PARAMETERS.promptSet, commit: SEED_COMMITS.baseline } };
  await expect(checkCommits([early], repository)).rejects.toThrow(
    `error: prompts/snerk.md is not in commit ${SEED_COMMITS.baseline} (prompt set "snerk").`,
  );
  const gone = { ...PARAMETERS, promptSet: { ...PARAMETERS.promptSet, commit: "e4f5a6" } };
  await expect(checkCommits([gone], repository)).rejects.toThrow(`error: commit e4f5a6 (prompt set "snerk") is not in this repository.`);
});

const git = (cwd: string, ...args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout.trim();

test("the build context holds the Dockerfile, a bundle of the code state's history only, and the prompt files", async () => {
  const repository = await seeded();
  const dir = join(await tmp(), "prerun-h4f9a21c8");
  await assembleBuildContext(PARAMETERS, repository, dir);

  expect(readdirSync(dir, { recursive: true }).map(String).toSorted()).toEqual([
    "Dockerfile",
    "code.bundle",
    "prompt-set",
    join("prompt-set", "FAKE_INSTRUCTIONS.md"),
  ]);
  expect(readFileSync(join(dir, "Dockerfile"), "utf8")).toBe(renderPrerunDockerfile(PARAMETERS));
  expect(readFileSync(join(dir, "prompt-set", "FAKE_INSTRUCTIONS.md"), "utf8")).toStartWith("# Snerk\n");

  // Cloned as the Dockerfile clones it, the bundle has the code state's commit and nothing after it.
  const clone = join(await tmp(), "clone");
  spawnSync("git", ["clone", "--quiet", join(dir, "code.bundle"), clone]);
  expect(git(clone, "log", "--all", "--format=%H")).toBe(SEED_COMMITS.baseline);
});

test("assembling again replaces what was there", async () => {
  const repository = await seeded();
  const dir = join(await tmp(), "prerun-h4f9a21c8");
  await assembleBuildContext(
    { ...PARAMETERS, promptSet: { ...PARAMETERS.promptSet, files: { "prompts/glurk.md": "OTHER.md" } } },
    repository,
    dir,
  );
  await assembleBuildContext(PARAMETERS, repository, dir);
  expect(readdirSync(join(dir, "prompt-set"))).toEqual(["FAKE_INSTRUCTIONS.md"]);
});
