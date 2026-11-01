import { $ } from "bun";
import { FAKE_DOCKER } from "./fakeDocker.ts";
import { applyPlaceholders, type PathPlaceholders } from "./placeholders.ts";
import { FIXTURES_DIR, REPO_ROOT, scenario } from "./scenario.ts";

export { applyPlaceholders, type PathPlaceholders } from "./placeholders.ts";

const CLI = `${REPO_ROOT}/src/cli/index.ts`;
// Copies of scenario projects and other temporary files. Inside fixtures/, so copies resolve
// `thunderjar` through fixtures/node_modules, as scenarios do.
export const TMP_DIR = `${FIXTURES_DIR}/.tmp`;

export type CliResult = { stdout: string; stderr: string; exitCode: number };

export type CliOptions = {
  /**
   * The fake Docker, by default, with no images unless `env` says otherwise (see `fakeDocker`),
   * or real Docker, for `*.docker.test.ts` tests only.
   */
  docker?: "fake" | "real";
  /** More environment variables. */
  env?: Record<string, string>;
  /** More paths to replace, e.g. `{ "<TMP>": dataDir }`. `<PROJECT>` (the cwd) and `<REPO>` are always replaced. */
  paths?: PathPlaceholders;
};

/**
 * Runs `thunderjar <args…>` in `cwd`, usually `scenario("0201")` or a copy of it, as a user would.
 * Its output has placeholders for what changes between runs: see `applyPlaceholders`. Its
 * temporary files, such as build contexts, go under fixtures/.tmp/.
 */
export async function thunderjar(cwd: string, args: string[], options: CliOptions = {}): Promise<CliResult> {
  await $`mkdir -p ${TMP_DIR}`.quiet();
  const docker = options.docker === "real" ? { THUNDERJAR_DOCKER: "docker" } : { THUNDERJAR_DOCKER: FAKE_DOCKER, FAKE_DOCKER_DIR: "" };
  const result = await $`bun ${CLI} ${args}`
    .cwd(cwd)
    .env({ ...Bun.env, TMPDIR: TMP_DIR, ...docker, ...options.env })
    .quiet()
    .nothrow();
  const paths = { "<PROJECT>": cwd, "<REPO>": REPO_ROOT, ...options.paths };
  return {
    stdout: applyPlaceholders(result.stdout.toString(), paths),
    stderr: applyPlaceholders(result.stderr.toString(), paths),
    exitCode: result.exitCode,
  };
}

export type ProjectCopy = AsyncDisposable & {
  /** The copy of the project: run commands that write files here. */
  dir: string;
  /** Deletes the copy. */
  remove: () => Promise<void>;
};

/**
 * A fresh copy of scenario `id`'s `project/`, for commands that write files.
 * Remove it when done, or declare it with `await using`.
 */
export async function copyScenarioProject(id: string): Promise<ProjectCopy> {
  const source = scenario(id);
  const dir = `${TMP_DIR}/${id}-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  await $`cp -R ${source}/. ${dir}`.quiet();
  const remove = async () => {
    await $`rm -rf ${dir}`.quiet();
  };
  return { dir, remove, [Symbol.asyncDispose]: remove };
}
