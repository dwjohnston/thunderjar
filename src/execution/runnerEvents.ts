/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// What a runner (see runner.ts) writes as it runs an execution: one event a line, as JSON. Whoever
// follows it turns them back into the hooks an execution run here would call, so `run` writes the
// same lines either way.
import { ConfigError } from "../config/loader.ts";
import { DockerContainerError, DockerLoginError, DockerPullError, DockerPushError, DockerUnavailableError } from "../docker/docker.ts";
import { type ContainerRunRecord, type ExecutionRecord, type RecordedMeasure, RunDataStoreError } from "../store/runDataStore.ts";
import type { PlannedIteration, PlannedPermutation } from "./planExecution.ts";
import type { RunHooks } from "./runExecution.ts";
import type { PlanData, SubmissionSummary } from "./runnerSpec.ts";
import type { ExecutionTimings } from "./timings.ts";

/** Why a runner's execution stopped: the kind of error it was, and what it carried. */
export type RunnerFailure = {
  kind: "unavailable" | "pull" | "push" | "container" | "store" | "config" | "other";
  message: string;
  /** The image a pull or push failed on. */
  reference?: string;
  /** The store that couldn't be used. */
  path?: string;
};

export type RunnerEvent =
  /** First: the execution it's about to run. */
  | { event: "started"; submission: SubmissionSummary }
  | { event: "pulling" | "pulled"; reference: string }
  | { event: "pushing" | "pushed"; image: string; reference: string }
  | { event: "running" | "measuring" | "done"; permutation: number; iteration: number }
  | { event: "ran"; permutation: number; iteration: number; record: ContainerRunRecord }
  | { event: "measured"; permutation: number; iteration: number; result: Record<string, RecordedMeasure> }
  | { event: "timings"; timings: ExecutionTimings }
  /** Last, if the execution was recorded as ended: its record, where, and its container runs' records. */
  | { event: "finished"; execution: ExecutionRecord; recordedIn: string; containerRuns: ContainerRunRecord[] }
  /** Last, if it stopped on an error. */
  | { event: "failed"; failure: RunnerFailure };

/** Whether `event` is the last a runner writes. */
export const isLast = (event: RunnerEvent): event is Extract<RunnerEvent, { event: "finished" | "failed" }> =>
  event.event === "finished" || event.event === "failed";

/** Hooks that give `emit` an event for each thing an execution does. */
export function eventHooks(emit: (event: RunnerEvent) => void): RunHooks {
  const at = (permutation: PlannedPermutation, iteration: PlannedIteration) => ({ permutation: permutation.number, iteration: iteration.number });
  return {
    onPulling: (reference) => emit({ event: "pulling", reference }),
    onPulled: (reference) => emit({ event: "pulled", reference }),
    onPushing: (image, reference) => emit({ event: "pushing", image, reference }),
    onPushed: (image, reference) => emit({ event: "pushed", image, reference }),
    onRunning: (permutation, iteration) => emit({ event: "running", ...at(permutation, iteration) }),
    onRan: (permutation, iteration, record) => emit({ event: "ran", ...at(permutation, iteration), record }),
    onMeasuring: (permutation, iteration) => emit({ event: "measuring", ...at(permutation, iteration) }),
    onMeasured: (permutation, iteration, result) => emit({ event: "measured", ...at(permutation, iteration), result }),
    onDone: (permutation, iteration) => emit({ event: "done", ...at(permutation, iteration) }),
    onTimings: (timings) => emit({ event: "timings", timings }),
  };
}

/**
 * Calls the hook of `hooks` that `event` stands for, with the permutation and iteration of `plan`
 * it names. Does nothing for `started`, `finished` and `failed`, or for one that names no iteration of `plan`.
 */
export function replayEvent(event: RunnerEvent, hooks: RunHooks, plan: PlanData): void {
  switch (event.event) {
    case "pulling":
      return hooks.onPulling?.(event.reference);
    case "pulled":
      return hooks.onPulled?.(event.reference);
    case "pushing":
      return hooks.onPushing?.(event.image, event.reference);
    case "pushed":
      return hooks.onPushed?.(event.image, event.reference);
    case "timings":
      return hooks.onTimings?.(event.timings);
    case "started":
    case "finished":
    case "failed":
      return;
  }
  // The hooks read only a permutation's data, never its harness's functions, which aren't sent.
  const permutation = plan.permutations.find(({ number }) => number === event.permutation) as PlannedPermutation | undefined;
  const iteration = permutation?.iterations.find(({ number }) => number === event.iteration);
  if (permutation === undefined || iteration === undefined) return;
  switch (event.event) {
    case "running":
      return hooks.onRunning?.(permutation, iteration);
    case "ran":
      return hooks.onRan?.(permutation, iteration, event.record);
    case "measuring":
      return hooks.onMeasuring?.(permutation, iteration);
    case "measured":
      return hooks.onMeasured?.(permutation, iteration, event.result);
    case "done":
      return hooks.onDone?.(permutation, iteration);
  }
}

/** `error`, as a runner reports it. */
export function failureOf(error: unknown): RunnerFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof DockerUnavailableError) return { kind: "unavailable", message };
  if (error instanceof DockerPullError) return { kind: "pull", message, reference: error.reference };
  if (error instanceof DockerPushError) return { kind: "push", message, reference: error.reference };
  if (error instanceof DockerContainerError) return { kind: "container", message };
  if (error instanceof RunDataStoreError) return { kind: "store", message, path: error.path };
  if (error instanceof ConfigError || error instanceof DockerLoginError) return { kind: "config", message };
  return { kind: "other", message };
}

/** Thrown for a runner's failure of a kind no other error stands for: the message is the runner's. */
export class RunnerError extends Error {}

/** `failure` as the error the runner stopped on, so it's reported as one thrown here would be. */
export function errorOf({ kind, message, reference, path }: RunnerFailure): Error {
  if (kind === "unavailable") return new DockerUnavailableError(message);
  if (kind === "pull") return new DockerPullError(message, reference);
  if (kind === "push") return new DockerPushError(message, reference);
  if (kind === "container") return new DockerContainerError(message);
  if (kind === "store") return new RunDataStoreError(path ?? "the run data store", message);
  if (kind === "config") return new ConfigError(message);
  return new RunnerError(message);
}
