import { $ } from "bun";
import { FAKE_DOCKER } from "./fakeDocker.ts";
import { applyPlaceholders, type PathPlaceholders } from "./placeholders.ts";
import { FIXTURES_DIR, REPO_ROOT, scenario } from "./scenario.ts";

export { applyPlaceholders, type PathPlaceholders } from "./placeholders.ts";

const CLI = `${REPO_ROOT}/src/cli/index.ts`;
// Inside fixtures/, so copies resolve `thunderjar` through fixtures/node_modules, as scenarios do.
const COPIES_DIR = `${FIXTURES_DIR}/.tmp`;

export type CliResult = { stdout: string; stderr: string; exitCode: number };

export type CliOptions = {
  /** More environment variables. Docker is the fake, with no images, unless these say otherwise: see `fakeDocker`. */
  env?: Record<string, string>;
  /** More paths to replace, e.g. `{ "<TMP>": dataDir }`. `<PROJECT>` (the cwd) and `<REPO>` are always replaced. */
  paths?: PathPlaceholders;
};

/**
 * Runs `thunderjar <args…>` in `cwd`, usually `scenario("0201")` or a copy of it, as a user would.
 * Its output has placeholders for what changes between runs: see `applyPlaceholders`.
 */
export async function thunderjar(cwd: string, args: string[], options: CliOptions = {}): Promise<CliResult> {
  const result = await $`bun ${CLI} ${args}`
    .cwd(cwd)
    .env({ ...Bun.env, THUNDERJAR_DOCKER: FAKE_DOCKER, FAKE_DOCKER_DIR: "", ...options.env })
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
  const dir = `${COPIES_DIR}/${id}-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  await $`cp -R ${source}/. ${dir}`.quiet();
  const remove = async () => {
    await $`rm -rf ${dir}`.quiet();
  };
  return { dir, remove, [Symbol.asyncDispose]: remove };
}
