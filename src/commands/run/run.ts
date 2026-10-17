// `thunderjar run <test case>` — spec/100-cli-reference.md#run and spec/080-docker-execution.md#process.
// Creates an execution ID, checks that Docker can be reached and that every commit a missing
// prerun image reads is there, then walks every permutation in order. A permutation's prerun
// image is built first if it doesn't exist, the way `build` builds it
// (src/images/prerun-builds.ts). Then each iteration's container run goes to a
// ContainerRunner, by default one that runs it in a container from the prerun image and
// commits it into its postrun image, both under `--image-prefix`. Each prints its exit code
// and duration as it finishes, then a summary. Each container run is recorded in the run data
// store, under `--data-dir` if given, as soon as it finishes, so the runs that finished before
// a crash are kept. Then the task's measurements are taken against it, through
// a MeasurementOpener, printed, and merged into its record — so a crash while measuring leaves
// it recorded with an empty Result. After each, its permutation's aggregation result is
// recomputed and stored, though not printed. Runs that exit non-zero are measured too, for now.
// `--dry-run` prints the container run each would be instead — its prerun image and whether
// it exists or would be built, its postrun image and the harness command — without building or
// running anything.

import { join, relative } from "node:path";
import { dockerCli, type Docker } from "../../adapters/docker/docker.ts";
import { recomputeAggregationResult } from "../../measuring/aggregate.ts";
import { findThunderjarRoot, loadMeasurements, loadTestCase } from "../../project/config.ts";
import { planExecution, type PlannedExecution } from "../../matrix/execution.ts";
import { measureContainerRun } from "../../measuring/measure.ts";
import { permutationRows } from "../../matrix/permutations.ts";
import { LOCAL_REPOSITORY, prerunStatuses, showPrerunStatus, unreachableNote } from "../../images/prerun.ts";
import { preparePrerunBuilds } from "../../images/prerun-builds.ts";
import { jsonFileStore, runDataStorePath, type RecordedOutcome } from "../../store/run-data-store.ts";
import {
  createDockerMeasurementOpener,
  createDockerRunner,
  defaultRootDir,
  type ContainerRunner,
  type MeasurementOpener,
} from "../../running/runner.ts";
import { ulid } from "../../matrix/ulid.ts";
import { count, duration, seconds, showValue } from "../format.ts";

export interface RunOptions {
  dryRun: boolean;
  cwd?: string;
  /** Receives the output a block at a time, as it is produced. */
  log?: (text: string) => void;
  /** Makes the execution ID; stubbed in tests so output is deterministic. */
  newExecutionId?: () => string;
  /** The clock for timing container runs; stubbed in tests so output is deterministic. */
  now?: () => number;
  /** Prerun build contexts are kept under `<rootDir>/builds/`. Defaults to `$TMPDIR/thunderjar`. */
  rootDir?: string;
  /** Runs each container run. Defaults to one in a container from its prerun image, through `docker`. */
  runner?: ContainerRunner;
  /** Gives each container run's measurement context. Defaults to one over its postrun image, through `docker`. */
  measurementOpener?: MeasurementOpener;
  /** Builds missing prerun images, and is asked, on a dry run, whether each exists. */
  docker?: Docker;
  /** The run data store goes under this folder, `--data-dir`, in place of `.thunderjar/.data/`. */
  dataDir?: string;
  /** The image repository prerun and postrun images are tagged in, `--image-prefix`. */
  repository?: string;
}

const indent = (text: string, spaces: number) =>
  text
    .split("\n")
    .map((line) => " ".repeat(spaces) + line)
    .join("\n");

/** `n/total`, with `n` padded to the width of `total` so the lines line up. */
const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

/** A measure as `run` prints it: its value, or what kept it from having one. */
const showOutcome = (outcome: RecordedOutcome) =>
  outcome.outcome === "measured"
    ? showValue(outcome.data)
    : outcome.outcome === "skipped"
      ? "skipped"
      : `erroredWhileMeasuring: ${outcome.error.message}`;

const shape = ({ permutations, iterations }: PlannedExecution) =>
  `${count(permutations.length, "permutation")} × ${count(iterations, "iteration")}`;

export async function run(name: string, options: RunOptions): Promise<void> {
  const {
    dryRun,
    cwd = process.cwd(),
    log = (text) => console.log(text),
    now = Date.now,
    newExecutionId = () => ulid(now()),
    rootDir = defaultRootDir(),
    docker = dockerCli(),
    repository = LOCAL_REPOSITORY,
    runner = createDockerRunner(docker, repository),
    measurementOpener = createDockerMeasurementOpener(docker, repository),
    dataDir,
  } = options;

  const root = findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const execution = await planExecution(root, testCase, newExecutionId());
  const { executionId, permutations, iterations } = execution;
  const rows = permutationRows(permutations.map((p) => p.permutation));
  const permutationLine = (n: number) => `Permutation ${ordinal(n + 1, permutations.length)}  ${rows[n]}`;

  if (dryRun) {
    // Each permutation: its number and five names, its prerun image, then each iteration's
    // postrun image with the harness command below it.
    const found = await prerunStatuses(docker, repository, permutations.map((p) => p.permutation));
    log(`Execution ${executionId} (dry run, ${shape(execution)})`);
    if ("unreachable" in found) log(unreachableNote(found.unreachable));
    permutations.forEach(({ permutation, prerunTag, runs }, n) => {
      log("");
      log(
        [
          permutationLine(n),
          `  ${prerunTag}${"statuses" in found ? showPrerunStatus(found.statuses.get(permutation.hash)) : ""}`,
          ...runs.map(
            ({ iterationIndex, postrunTag, command }) =>
              `  iteration ${ordinal(iterationIndex + 1, iterations)}  ${postrunTag}\n${indent(command, 4)}`,
          ),
        ].join("\n"),
      );
    });
    return;
  }

  const measurements = await loadMeasurements(root, testCase.task);
  const nameWidth = Math.max(0, ...measurements.map((m) => m.name.length));
  const storePath = runDataStorePath(cwd, dataDir);
  const store = jsonFileStore(storePath);
  const builds = await preparePrerunBuilds({
    root,
    task: testCase.task,
    permutations: permutations.map((p) => p.permutation),
    docker,
    repository,
    rootDir,
    purpose: "Running a test case",
  });

  log(`Execution ${executionId} (${shape(execution)})`);
  log(`Images in ${repository}`);
  if (builds.missing.size > 0) log(`Build contexts in ${join(rootDir, "builds")}`);

  // How many container runs exited with each code. A failing agent is a result, not an error:
  // the remaining runs still run, and every run is recorded.
  const exitCodes = new Map<number, number>();
  for (const [n, { permutation, parameters, harnessModel, prerunTag, runs }] of permutations.entries()) {
    log("");
    log(permutationLine(n));
    if (builds.missing.has(permutation.hash)) {
      const started = now();
      await builds.build(permutation.hash);
      log(`  ${prerunTag}  built (${seconds(now() - started)})`);
    } else {
      log(`  ${prerunTag}  reused`);
    }
    for (const containerRun of runs) {
      const { startedAt, finishedAt, exitCode } = await runner.runContainer(containerRun);
      await store.recordContainerRun({
        executionId,
        testCase: name,
        task: testCase.task,
        permutationHash: permutation.hash,
        iteration: containerRun.iterationIndex,
        postrunImage: containerRun.postrunTag,
        ranAt: new Date(startedAt).toISOString(),
        parameters,
        harnessModel,
        result: {},
        execution: { startedAt, finishedAt, exitCode },
      });
      exitCodes.set(exitCode, (exitCodes.get(exitCode) ?? 0) + 1);
      log(
        `  iteration ${ordinal(containerRun.iterationIndex + 1, iterations)}  ${containerRun.postrunTag}` +
          `  exit ${exitCode}  ${duration({ startedAt, finishedAt })}`,
      );

      if (measurements.length > 0) {
        const open = () => measurementOpener.openMeasurementContext(containerRun.postrunTag);
        const result = await measureContainerRun(measurements, open, now);
        await store.recordMeasures(containerRun.postrunTag, result);
        log(
          Object.entries(result)
            .map(([name, { outcome }]) => `    ${name.padEnd(nameWidth)}  ${showOutcome(outcome)}`)
            .join("\n"),
        );
      }
      // With no measurements there is still a duration to aggregate.
      await recomputeAggregationResult(store, executionId, permutation.hash, measurements);
    }
  }

  const total = permutations.length * iterations;
  const byCode = [...exitCodes].toSorted(([a], [b]) => a - b).map(([code, n]) => `${n} exited ${code}`);
  log("");
  log(`${count(total, "container run")}: ${byCode.join(", ")}`);
  log(`Recorded in ${relative(cwd, storePath)}`);
}
