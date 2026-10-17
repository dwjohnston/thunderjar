// `thunderjar build <test case>` — builds each permutation's prerun image that doesn't exist
// yet, then stops: nothing is run and nothing is recorded. spec/080-docker-execution.md#process,
// as far as "Prerun image ready".
//
// Before the first build it checks that Docker can be reached, and, if any fragment reads
// commits through ctx.git, that the repository has every one of them
// (spec/062-code-state.md#where-the-commit-comes-from), so a missing commit fails before
// anything is built. A project whose fragments read no commits needs no repository at all. An
// image that already exists is reused, and its commits aren't read. Each build context is
// kept, so a failed build can be inspected:
//
//   <root dir>/builds/prerun-h4f9a21c8/
//     Dockerfile
//     parameters/<role>/          each folder parameter, as its ctx.dir
//     git/<commit>.bundle         what ctx.git asked for
//     git/<commit>/<path>

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
  renderPrerun,
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

  // Rendering every Dockerfile first finds the commits the builds read, so they're checked before any build.
  const gitNeeds = [...parameters.values()].flatMap((p) => renderPrerun(p).git);
  let repo: Repository | undefined;
  if (gitNeeds.length > 0) {
    const projectDir = dirname(root);
    repo = await findRepository(projectDir);
    if (!repo) {
      const [{ owner, commit }] = gitNeeds as [(typeof gitNeeds)[number]];
      throw new Error(`error: ${projectDir} is not in a git repository, but ${owner} reads commit ${commit} from it.`);
    }
    await checkCommits(gitNeeds, repo);
  }
  if (toBuild.length > 0) {
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
    await assembleBuildContext(declared, repo, contextDir);
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
