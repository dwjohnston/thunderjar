/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Remeasuring a past container run: its task's measurements, as they are now, taken in a new
// measurement container from its postrun image, as `run` took them, without running its agent again.
import type { Reply } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import { type DockerRuntime, localRuntime } from "../docker/docker.ts";
import type { ContainerRunRecord, RecordedMeasure } from "../store/runDataStore.ts";
import { containerName } from "./images.ts";
import { measureContainerRun } from "./measure.ts";
import { openMeasurementContext, type Recorded, recordedContext } from "./measurementContext.ts";

/**
 * The local daemon, pulling a postrun image it doesn't have: one recorded by its image store
 * reference may only be there.
 */
export const remeasureRuntime = (): DockerRuntime => ({ ...localRuntime(), pull: "missing" });

/** What was recorded of `record` that an instrument can read: as `run` gave it, from the record. */
function recordedOf({ harnessResult, reply, turns }: ContainerRunRecord): Recorded {
  // Recorded before replies were.
  const last: Reply = reply ?? { outcome: "unavailable", reason: "not recorded" };
  return { harnessResult: harnessResult ?? "", reply: last, replies: turns ? turns.map((turn) => turn.reply) : [last] };
}

/**
 * Takes `measurements` of `record`, each that needs one in a measurement container from its
 * postrun image, named after its container run's container, under `imagePrefix`. Its secret
 * variables are passed in by name, from Thunderjar's own environment, as for `run`. Throws a
 * DockerContainerError if a container can't be started, e.g. its postrun image is gone.
 */
export async function remeasureContainerRun(
  record: ContainerRunRecord,
  measurements: Measurement[],
  imagePrefix?: string,
  runtime: DockerRuntime = remeasureRuntime(),
): Promise<Record<string, RecordedMeasure>> {
  const container = containerName(record.executionId, record.permutation, record.iteration, imagePrefix);
  const recorded = recordedOf(record);
  const secretEnv = [...new Set([...(record.harnessEnv ?? []), ...(record.secretEnv ?? [])])];
  let opened = 0;
  return measureContainerRun(measurements, async (usesContainer) =>
    usesContainer ? openMeasurementContext(record.postrunImage, `${container}-remeasure-${++opened}`, recorded, runtime, secretEnv) : recordedContext(recorded),
  );
}

/** `record` with `result` its latest measures, and those it had kept beside them, as an earlier version. */
export const withNewResult = (record: ContainerRunRecord, result: Record<string, RecordedMeasure>): ContainerRunRecord => ({
  ...record,
  result,
  earlierResults: [...(record.earlierResults ?? []), record.result],
});
