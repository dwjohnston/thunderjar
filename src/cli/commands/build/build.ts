// `thunderjar build <test case>` — builds each permutation's prerun image that doesn't exist
// yet, then stops: nothing is run and nothing is recorded. spec/080-docker-execution.md#process,
// as far as "Prerun image ready".
//
// What it checks before the first build, and where it keeps each build context, are
// src/images/prerun-builds.ts's, which `run` builds through too.
//
// `--dry-run` prints the Dockerfile each permutation's prerun image would be built from, for
// every permutation, whether or not its image exists. It builds nothing, writes nothing, and
// doesn't ask Docker anything, nor read any commit, so what it prints doesn't depend on either.

import { join } from "node:path";
import { dockerCli, type Docker } from "../../../adapters/docker/docker.ts";
import { findThunderjarRoot, loadTestCase } from "../../../project/config.ts";
import { permutationRows } from "../../../matrix/permutations.ts";
import { LOCAL_REPOSITORY, loadPrerunParameters, prerunImageRef, renderPrerun } from "../../../images/prerun.ts";
import { preparePrerunBuilds } from "../../../images/prerun-builds.ts";
import { resolveTestCase } from "../../../matrix/resolve.ts";
import { defaultRootDir } from "../../../running/runner.ts";
import { count, seconds } from "../format.ts";

export interface BuildOptions {
  cwd?: string;
  /** Receives the output a block at a time, as it is produced. */
  log?: (text: string) => void;
  docker?: Docker;
  /** Print each permutation's Dockerfile instead of building, `--dry-run`. */
  dryRun?: boolean;
  /** The image repository prerun images are tagged in, `--image-prefix`. Tests use a throwaway one. */
  repository?: string;
  /** Build contexts are kept under `<rootDir>/builds/`. Defaults to `$TMPDIR/thunderjar`. */
  rootDir?: string;
  /** The clock for timing builds; stubbed in tests so output is deterministic. */
  now?: () => number;
}

export async function build(name: string, options: BuildOptions = {}): Promise<void> {
  const {
    cwd = process.cwd(),
    log = (text) => console.log(text),
    docker = dockerCli(),
    dryRun = false,
    repository = LOCAL_REPOSITORY,
    rootDir = defaultRootDir(),
    now = Date.now,
  } = options;

  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const { permutations } = await resolveTestCase(root, testCase);
  const rows = permutationRows(permutations);
  const numberWidth = Math.max(2, String(permutations.length).length);
  const pad = " ".repeat(numberWidth + 2);

  if (dryRun) {
    log(`Dockerfiles for ${name} (${count(permutations.length, "permutation")}). Nothing is built.`);
    for (const [n, permutation] of permutations.entries()) {
      const { dockerfile } = renderPrerun(await loadPrerunParameters(root, testCase.task, permutation));
      log("");
      log(`${String(n + 1).padStart(numberWidth)}  ${rows[n]}`);
      log(`${pad}${prerunImageRef(repository, permutation.hash)}`);
      log("");
      log(dockerfile.trimEnd().replace(/^(?=.)/gm, pad));
    }
    return;
  }

  const builds = await preparePrerunBuilds({
    root,
    task: testCase.task,
    permutations,
    docker,
    repository,
    rootDir,
    purpose: "Building prerun images",
  });
  const toBuild = builds.missing.size;
  if (toBuild > 0) {
    log(`Building ${count(toBuild, "prerun image")} for ${name} (${count(permutations.length, "permutation")})`);
    log(`Build contexts in ${join(rootDir, "builds")}`);
  } else {
    log(`Every prerun image for ${name} exists (${count(permutations.length, "permutation")})`);
  }

  for (const [n, permutation] of permutations.entries()) {
    const ref = prerunImageRef(repository, permutation.hash);
    log("");
    log(`${String(n + 1).padStart(numberWidth)}  ${rows[n]}`);
    if (!builds.missing.has(permutation.hash)) {
      log(`${pad}${ref}  reused`);
      continue;
    }
    const started = now();
    await builds.build(permutation.hash);
    log(`${pad}${ref}  built (${seconds(now() - started)})`);
  }

  log("");
  log(
    `${count(permutations.length, "prerun image")}: ${toBuild} built, ${permutations.length - toBuild} reused`,
  );
}
