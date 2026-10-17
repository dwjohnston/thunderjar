// `thunderjar run <test case>` — spec/100-cli-reference.md#run. Creates an execution ID, then
// walks every permutation and iteration in order and hands each container run to a
// ContainerRunner, printing its exit code and duration as it finishes, then a summary. Each
// container run is recorded in the run data store as soon as it finishes, so the runs that
// finished before a crash are kept. Then the task's measurements are taken against it, through
// a MeasurementOpener, printed, and merged into its record — so a crash while measuring leaves
// it recorded with an empty Result. After each, its permutation's aggregation result is
// recomputed and stored, though not printed. Runs that exit non-zero are measured too, for now.
// `--dry-run` prints the container run each would be instead — its prerun image and whether
// it exists or would be built, its postrun image and the harness command — without running
// anything. `run` itself doesn't build prerun images yet; `build` does.

import { relative } from "node:path";
import { dockerCli, type Docker } from "../adapters/docker/docker.ts";
import { recomputeAggregationResult } from "../aggregate.ts";
import { findThunderjarRoot, loadMeasurements, loadTestCase } from "../config.ts";
import { planExecution, type PlannedExecution } from "../execution.ts";
import { measureContainerRun } from "../measure.ts";
import { permutationRows } from "../permutations.ts";
import { LOCAL_REPOSITORY, prerunStatuses, showPrerunStatus, unreachableNote } from "../prerun.ts";
import { defaultRunDataStorePath, jsonFileStore, type RecordedOutcome } from "../run-data-store.ts";
import {
  createHostMeasurementOpener,
  createHostRunner,
  defaultRootDir,
  executionDir,
  type ContainerRunner,
  type MeasurementOpener,
} from "../runner.ts";
import { ulid } from "../ulid.ts";
import { count } from "./plan.ts";

export interface RunOptions {
  dryRun: boolean;
  cwd?: string;
  /** Receives the output a block at a time, as it is produced. */
  log?: (text: string) => void;
  /** Makes the execution ID; stubbed in tests so output is deterministic. */
  newExecutionId?: () => string;
  /** The clock for timing container runs; stubbed in tests so output is deterministic. */
  now?: () => number;
  /** Where the host runner keeps container runs. Defaults to `$TMPDIR/thunderjar`. */
  rootDir?: string;
  /** Runs each container run. Defaults to the host runner under `rootDir`. */
  runner?: ContainerRunner;
  /** Gives each container run's measurement context. Defaults to the host one under `rootDir`. */
  measurementOpener?: MeasurementOpener;
  /** Asked, on a dry run, whether each prerun image exists. */
  docker?: Docker;
  /** The image repository prerun images are looked up in. */
  repository?: string;
}

const indent = (text: string, spaces: number) =>
  text
    .split("\n")
    .map((line) => " ".repeat(spaces) + line)
    .join("\n");

/** `n/total`, with `n` padded to the width of `total` so the lines line up. */
const ordinal = (n: number, total: number) => `${String(n).padStart(String(total).length)}/${total}`;

/** A measured value as `run` prints it: JSON, but with an object's keys unquoted, `{passed: 4, failed: 1}`. */
export const showValue = (value: unknown): string =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? `{${Object.entries(value)
        .map(([key, v]) => `${key}: ${showValue(v)}`)
        .join(", ")}}`
    : (JSON.stringify(value) ?? String(value));

/** How long a container run took, as `run` prints it: `0.04s`. */
export const duration = ({ startedAt, finishedAt }: { startedAt: number; finishedAt: number }) =>
  seconds(finishedAt - startedAt);

/** Milliseconds as `run` prints a duration: `0.04s`. */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

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
    runner = createHostRunner(rootDir, now),
    measurementOpener = createHostMeasurementOpener(rootDir),
    docker = dockerCli(),
    repository = LOCAL_REPOSITORY,
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
  const storePath = defaultRunDataStorePath(root);
  const store = jsonFileStore(storePath);

  log(`Execution ${executionId} (${shape(execution)})`);
  log(`Output in ${executionDir(rootDir, executionId)}`);

  // How many container runs exited with each code. A failing agent is a result, not an error:
  // the remaining runs still run, and every run is recorded.
  const exitCodes = new Map<number, number>();
  for (const [n, { permutation, parameters, harnessModel, runs }] of permutations.entries()) {
    log("");
    log(permutationLine(n));
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
