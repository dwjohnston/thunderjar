import { expect, test } from "bun:test";
import { listDir, makeDir, makeTempDir, readTextSync } from "../platform/fs.ts";
import { join } from "../platform/path.ts";
import { checkoutCommit } from "../api/fragments.ts";
import { assembleBuildContext, checkCommits, MissingCommitsError, renderPrerun, type PrerunParameters } from "./prerun.ts";
import { findRepository } from "./repository.ts";
import { SEED_COMMITS, seedRepo } from "../testing/seed-repo.ts";

const tmp = () => makeTempDir("thunderjar-prerun-");

/** A folder parameter whose folder holds `files`. */
async function folder(owner: string, files: Record<string, string> = {}) {
  const dir = await tmp();
  for (const [path, contents] of Object.entries(files)) {
    await Bun.write(join(dir, path), contents);
  }
  return { owner, dir, config: undefined as unknown };
}

/** The fixture permutation's parameters: each copies files beside its declaration, as fixtureTests/ do. */
async function parameters(): Promise<PrerunParameters> {
  return {
    baseImage: { ...(await folder(`base image "node20"`)), applyParameter: () => `FROM node:20-bookworm` },
    harness: {
      ...(await folder(`harness/model pair "fake-harness-alpha@1.0.0/fake-model-small"`, {
        "index.ts": "",
        "models.ts": "",
        "versions.ts": "",
        "collectTokenCosts.ts": "",
      })),
      exclude: ["models.ts", "versions.ts", "collectTokenCosts.ts"],
      version: "1.0.0",
      applyParameter: (_config, ctx) => `RUN echo "install fake-harness-alpha@${ctx.version}"`,
    },
    codeState: {
      ...(await folder(`code state "baseline"`, { "index.ts": "", "files/package.json": "{}\n" })),
      applyParameter: (_config, ctx) => `COPY ${ctx.dir}/files/ /workspace/\nRUN npm ci`,
    },
    promptSet: {
      ...(await folder(`prompt set "snerk"`, { "index.ts": "", "FAKE_INSTRUCTIONS.md": "# Snerk\n" })),
      applyParameter: (_config, ctx) => `COPY ${ctx.dir}/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md`,
    },
    initialPrompt: { owner: `initial prompt "plain"`, config: undefined, applyParameter: () => `` },
  };
}

// --- renderPrerun: layer 1 ---

test("renders the fragments in order: base image, harness, Thunderjar's WORKDIR, code state, prompt set", async () => {
  expect(renderPrerun(await parameters())).toEqual({
    dockerfile: `FROM node:20-bookworm
RUN echo "install fake-harness-alpha@1.0.0"
WORKDIR /workspace
COPY parameters/codeState/files/ /workspace/
RUN npm ci
COPY parameters/promptSet/FAKE_INSTRUCTIONS.md /workspace/FAKE_INSTRUCTIONS.md
`,
    git: [],
  });
});

test("the initial prompt's fragment comes last", async () => {
  const { dockerfile } = renderPrerun({
    ...(await parameters()),
    initialPrompt: { owner: `initial prompt "plain"`, config: undefined, applyParameter: () => `RUN echo initial-prompt` },
  });
  expect(dockerfile).toEndWith("FAKE_INSTRUCTIONS.md\nRUN echo initial-prompt\n");
});

test("an empty fragment adds no line", async () => {
  const p = await parameters();
  const { dockerfile } = renderPrerun({ ...p, codeState: { ...p.codeState, applyParameter: () => `  \n` } });
  expect(dockerfile).not.toContain("npm ci");
  expect(dockerfile).not.toMatch(/\n\s*\n/);
});

test("each fragment gets its declaration's config, as written, as its first argument", async () => {
  const p = await parameters();
  const { dockerfile } = renderPrerun({
    ...p,
    codeState: { ...p.codeState, config: { script: "npm ci --ignore-scripts" }, applyParameter: (config) => `RUN ${(config as { script: string }).script}` },
  });
  expect(dockerfile).toContain("\nRUN npm ci --ignore-scripts\n");
});

test("the harness fragment sees the pair's resolved version as ctx.version", async () => {
  const p = await parameters();
  expect(renderPrerun({ ...p, harness: { ...p.harness, version: "2.1.283" } }).dockerfile).toContain(
    `RUN echo "install fake-harness-alpha@2.1.283"`,
  );
});

test("ctx.dir names each folder parameter by its role, not its folder", async () => {
  const p = await parameters();
  const dirs: string[] = [];
  const recordDir = (_config: unknown, ctx: { dir: string }) => (dirs.push(ctx.dir), "");
  renderPrerun({
    baseImage: { ...p.baseImage, applyParameter: recordDir },
    harness: { ...p.harness, applyParameter: recordDir },
    codeState: { ...p.codeState, applyParameter: recordDir },
    promptSet: { ...p.promptSet, applyParameter: recordDir },
    initialPrompt: p.initialPrompt,
  });
  expect(dirs).toEqual(["parameters/baseImage", "parameters/harnessModel", "parameters/codeState", "parameters/promptSet"]);
});

test("ctx.git records each commit a fragment reads, and gives the path to COPY it from", async () => {
  const p = await parameters();
  const { dockerfile, git } = renderPrerun({
    ...p,
    codeState: { ...p.codeState, applyParameter: (_config, ctx) => `${checkoutCommit(ctx, SEED_COMMITS.baseline)}\nRUN npm ci` },
    promptSet: {
      ...p.promptSet,
      applyParameter: (_config, ctx) => `COPY ${ctx.git.show(SEED_COMMITS.prompts, "prompts/./snerk.md")} /workspace/CLAUDE.md`,
    },
  });
  expect(dockerfile).toContain(`WORKDIR /workspace
COPY git/${SEED_COMMITS.baseline}.bundle /tmp/code.bundle
RUN git clone --quiet /tmp/code.bundle /workspace \\
  && git -C /workspace checkout --quiet --detach ${SEED_COMMITS.baseline} \\
  && git -C /workspace branch --quiet --delete --force code-state \\
  && git -C /workspace remote remove origin \\
  && git -C /workspace config user.name "Thunderjar agent" \\
  && git -C /workspace config user.email agent@thunderjar.invalid \\
  && rm /tmp/code.bundle
RUN npm ci
COPY git/${SEED_COMMITS.prompts}/prompts/snerk.md /workspace/CLAUDE.md
`);
  expect(git).toEqual([
    { kind: "bundle", owner: `code state "baseline"`, commit: SEED_COMMITS.baseline, path: `git/${SEED_COMMITS.baseline}.bundle` },
    {
      kind: "file",
      owner: `prompt set "snerk"`,
      commit: SEED_COMMITS.prompts,
      file: "prompts/snerk.md",
      path: `git/${SEED_COMMITS.prompts}/prompts/snerk.md`,
    },
  ]);
});

test("ctx.git takes only a commit hash, and a path inside the repository", async () => {
  const p = await parameters();
  const reading = (read: (git: { bundle(c: string): string; show(c: string, f: string): string }) => string) =>
    renderPrerun({ ...p, codeState: { ...p.codeState, applyParameter: (_config, ctx) => read(ctx.git) } });
  expect(() => reading((git) => git.bundle("main"))).toThrow(
    `error: code state "baseline": ctx.git.bundle needs a commit hash, got "main".`,
  );
  expect(() => reading((git) => git.show(SEED_COMMITS.prompts, "../secrets.md"))).toThrow(
    `error: code state "baseline": ctx.git.show needs a path inside the repository, got "../secrets.md".`,
  );
});

// --- checkCommits and assembleBuildContext, against the seed repository ---

async function seeded() {
  const dir = await tmp();
  await seedRepo(dir);
  return (await findRepository(dir))!;
}

const need = (commit: string, owner = `code state "baseline"`) =>
  ({ kind: "bundle", owner, commit, path: `git/${commit}.bundle` }) as const;

test("checkCommits accepts commits in the repository, abbreviated or not", async () => {
  const repository = await seeded();
  await checkCommits([need(SEED_COMMITS.baseline.slice(0, 7)), need(SEED_COMMITS.prompts)], repository);
});

test("a missing commit fails with 062's message, naming the parameter that needs it, once", async () => {
  const repository = await seeded();
  const check = checkCommits([need("a1b2c3"), need("a1b2c3")], repository);
  await expect(check).rejects.toThrow(MissingCommitsError);
  await expect(check).rejects.toThrow(
    new MissingCommitsError(
      `error: commit a1b2c3 (code state "baseline") is not in this repository.\nFetch it, or check that it has been pushed.`,
    ),
  );
});

test("a file missing at its commit fails, naming the parameter", async () => {
  const repository = await seeded();
  // prompts/snerk.md is added after baseline.
  const file = { kind: "file", owner: `prompt set "snerk"`, commit: SEED_COMMITS.baseline, file: "prompts/snerk.md", path: "x" } as const;
  await expect(checkCommits([file], repository)).rejects.toThrow(
    `error: prompts/snerk.md is not in commit ${SEED_COMMITS.baseline} (prompt set "snerk").`,
  );
});

const git = (cwd: string, ...args: string[]) => Bun.spawnSync(["git", ...args], { cwd }).stdout.toString().trim();
const tree = (dir: string) => listDir(dir, { recursive: true }).toSorted();

test("the build context holds the Dockerfile and each folder parameter, less the harness's map files", async () => {
  const p = await parameters();
  const dir = join(await tmp(), "prerun-h4f9a21c8");
  await assembleBuildContext(p, undefined, dir);

  expect(tree(dir)).toEqual(
    [
      "Dockerfile",
      "parameters",
      join("parameters", "baseImage"),
      join("parameters", "codeState"),
      join("parameters", "codeState", "files"),
      join("parameters", "codeState", "files", "package.json"),
      join("parameters", "codeState", "index.ts"),
      join("parameters", "harnessModel"),
      join("parameters", "harnessModel", "index.ts"),
      join("parameters", "promptSet"),
      join("parameters", "promptSet", "FAKE_INSTRUCTIONS.md"),
      join("parameters", "promptSet", "index.ts"),
    ].toSorted(),
  );
  expect(readTextSync(join(dir, "Dockerfile"))).toBe(renderPrerun(p).dockerfile);
});

test("what ctx.git asked for is in the build context: a bundle of the commit's history only, and the file", async () => {
  const repository = await seeded();
  const p = await parameters();
  const dir = join(await tmp(), "prerun-h4f9a21c8");
  await assembleBuildContext(
    {
      ...p,
      codeState: { ...p.codeState, applyParameter: (_config, ctx) => checkoutCommit(ctx, SEED_COMMITS.baseline.slice(0, 10)) },
      promptSet: { ...p.promptSet, applyParameter: (_config, ctx) => `COPY ${ctx.git.show(SEED_COMMITS.prompts, "prompts/snerk.md")} /workspace/` },
    },
    repository,
    dir,
  );

  expect(readTextSync(join(dir, "git", SEED_COMMITS.prompts, "prompts", "snerk.md"))).toStartWith("# Snerk\n");
  // Cloned as checkoutCommit clones it, the bundle has the commit and nothing after it.
  const clone = join(await tmp(), "clone");
  Bun.spawnSync(["git", "clone", "--quiet", join(dir, "git", `${SEED_COMMITS.baseline.slice(0, 10)}.bundle`), clone]);
  expect(git(clone, "log", "--all", "--format=%H")).toBe(SEED_COMMITS.baseline);
});

test("assembling again replaces what was there", async () => {
  const p = await parameters();
  const dir = join(await tmp(), "prerun-h4f9a21c8");
  await makeDir(join(dir, "stale"));
  await assembleBuildContext(p, undefined, dir);
  expect(listDir(dir).toSorted()).toEqual(["Dockerfile", "parameters"]);
});
