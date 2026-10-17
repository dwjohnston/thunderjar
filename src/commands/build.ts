// `thunderjar build <test case>` — builds each permutation's prerun image that doesn't exist
// yet, then stops: nothing is run and nothing is recorded. spec/080-docker-execution.md#process,
// as far as "Prerun image ready".
//
// Before the first build it checks that Docker can be reached, and that the repository has
// every commit the builds need (spec/062-code-state.md#where-the-commit-comes-from), so a
// missing commit fails before anything is built. An image that already exists is reused, and
// its commits aren't read. Each build context is kept, so a failed build can be inspected:
//
//   <root dir>/builds/prerun-h4f9a21c8/
//     Dockerfile
//     code.bundle
//     prompt-set/<dest>

import { dirname, join } from "node:path";
import { dockerCli, DockerBuildError, type Docker } from "../adapters/docker/docker.ts";
import { findThunderjarRoot, loadTestCase } from "../config.ts";
import { permutationRows } from "../permutations.ts";
import {
  assembleBuildContext,
  checkCommits,
  LOCAL_REPOSITORY,
  loadPrerunParameters,
  prerunImageRef,
  prerunStatuses,
  type PrerunParameters,
} from "../prerun.ts";
import { findRepository, type Repository } from "../repository.ts";
import { resolveTestCase } from "../resolve.ts";
import { defaultRootDir } from "../runner.ts";
import { prerunTag } from "../tags.ts";
import { count } from "./plan.ts";
import { seconds } from "./run.ts";

export interface BuildOptions {
  cwd?: string;
  /** Receives the output a block at a time, as it is produced. */
  log?: (text: string) => void;
  docker?: Docker;
  /** The image repository prerun images are tagged in. Tests use a throwaway one. */
  repository?: string;
  /** Build contexts are kept under `<rootDir>/builds/`. Defaults to `$TMPDIR/thunderjar`. */
  rootDir?: string;
  /** The clock for timing builds; stubbed in tests so output is deterministic. */
  now?: () => number;
}

/** The directory a prerun image's build context is kept in. */
export const buildContextDir = (rootDir: string, permutationHash: string) =>
  join(rootDir, "builds", prerunTag(permutationHash));

export async function build(name: string, options: BuildOptions = {}): Promise<void> {
  const {
    cwd = process.cwd(),
    log = (text) => console.log(text),
    docker = dockerCli(),
    repository = LOCAL_REPOSITORY,
    rootDir = defaultRootDir(),
    now = Date.now,
  } = options;

  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const { permutations } = await resolveTestCase(root, testCase);

  const found = await prerunStatuses(docker, repository, permutations);
  if ("unreachable" in found) {
    throw new Error(`error: Docker can't be reached (${found.unreachable}). Building prerun images needs Docker.`);
  }
  const { statuses } = found;

  const toBuild = permutations.filter((p) => statuses.get(p.hash) === "missing");
  const parameters = new Map<string, PrerunParameters>();
  for (const permutation of toBuild) {
    parameters.set(permutation.hash, await loadPrerunParameters(root, testCase.task, permutation));
  }

  let repo: Repository | undefined;
  let commits = new Map<string, string>();
  if (toBuild.length > 0) {
    const projectDir = dirname(root);
    repo = await findRepository(projectDir);
    if (!repo) {
      throw new Error(
        `error: ${projectDir} is not in a git repository. Prerun images are built from code state and prompt set commits in it.`,
      );
    }
    commits = await checkCommits([...parameters.values()], repo);
    log(`Building ${count(toBuild.length, "prerun image")} for ${name} (${count(permutations.length, "permutation")})`);
    log(`Build contexts in ${join(rootDir, "builds")}`);
  } else {
    log(`Every prerun image for ${name} exists (${count(permutations.length, "permutation")})`);
  }

  const rows = permutationRows(permutations);
  const numberWidth = Math.max(2, String(permutations.length).length);
  const pad = " ".repeat(numberWidth + 2);
  for (const [n, permutation] of permutations.entries()) {
    const ref = prerunImageRef(repository, permutation.hash);
    log("");
    log(`${String(n + 1).padStart(numberWidth)}  ${rows[n]}`);
    const declared = parameters.get(permutation.hash);
    if (!declared) {
      log(`${pad}${ref}  reused`);
      continue;
    }
    const contextDir = buildContextDir(rootDir, permutation.hash);
    const started = now();
    await assembleBuildContext(
      { ...declared, codeState: { ...declared.codeState, commit: commits.get(declared.codeState.commit)! } },
      repo!,
      contextDir,
    );
    try {
      await docker.build(contextDir, ref);
    } catch (error) {
      if (!(error instanceof DockerBuildError)) throw error;
      throw new Error(
        `error: building ${ref} failed (docker build exited ${error.exitCode}).\nIts build context is kept in ${contextDir}`,
      );
    }
    log(`${pad}${ref}  built (${seconds(now() - started)})`);
  }

  log("");
  log(
    `${count(permutations.length, "prerun image")}: ${toBuild.length} built, ${permutations.length - toBuild.length} reused`,
  );
}
