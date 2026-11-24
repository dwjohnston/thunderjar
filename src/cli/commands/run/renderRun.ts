/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
// How `run` looks: the lines its state draws. Nothing here reads the clock or writes.
import { agentEnd } from "../../../execution/runFacts.ts";
import type { Execution } from "../../../store/runDataStore.ts";
import { type Paint, plain } from "../../colour.ts";
import { elapsed } from "../../waitingLine.ts";
import { duration, ordinal, showOutcomes } from "./runDisplay.ts";
import type { ContainerRunState, ContainerState, RunState } from "./runState.ts";

export type RenderOptions = {
  /** The app's clock, now: what a container run still going counts up to. */
  now: number;
  /** Whether it's drawn on a terminal, where a line can count up in place. */
  terminal: boolean;
  /** Colour, on a terminal. Plain by default. */
  paint?: Paint;
};

/**
 * The lines `state` draws: the execution, then a line for each container run that has ended, how
 * it ended, with its measures under it. The same lines `run` writes, one container at a time. On a
 * terminal, a container run still going has a line too, counting up to `now`: how long it has
 * been starting, or its agent running. One queued has none.
 */
export function renderRun(state: RunState, options: RenderOptions): string[] {
  const { paint = plain } = options;
  return [`${paint.dim("Execution")} ${paint.bold(state.executionId)}`, ...state.containers.flatMap((container) => containerLines(container, options))];
}

/** A container run's line, once it has ended or, on a terminal, while it's going, and its measures' under it, lined up with it. */
function containerLines({ permutation: [number, permutations], iteration: [iteration, iterations], label, run }: ContainerState, options: RenderOptions): string[] {
  const { paint = plain } = options;
  const ended = endOf(run, paint) ?? (options.terminal ? going(run, options.now, paint) : undefined);
  if (ended === undefined) return [];
  const head = ` ${paint.bold(ordinal(number, permutations))}  iteration ${paint.bold(ordinal(iteration, iterations))}  ${paint.magenta(label)}  ${paint.dim("...")} `;
  const under = " ".repeat(ordinal(number, permutations).length + 3);
  const measures = "measures" in run && run.measures !== undefined ? [`${under}${showOutcomes(run.measures, paint)}`] : [];
  return [`${head}${ended}`, ...measures];
}

/** How a container run ended, as agentEnd says it, with how long its agent took if it ran to its end. Undefined if it hasn't. */
function endOf(run: ContainerRunState, paint: Paint): string | undefined {
  switch (run.status) {
    case "failedToStart":
    case "timedOut":
      return paint.red(agentEnd(executionOf(run), null));
    case "exited":
    case "done": {
      const clean = run.status === "done" && run.resultFile;
      const end = agentEnd(executionOf(run), run.resultFile ? "" : null);
      return `${(clean ? paint.green : paint.red)(end)} ${paint.dim(`(${duration(run.ms)})`)}`;
    }
    default:
      return undefined;
  }
}

/** How long a container run still going has been starting, or running, if it has begun. */
function going(run: ContainerRunState, now: number, paint: Paint): string | undefined {
  switch (run.status) {
    case "starting":
      return paint.dim(`starting ${elapsed(now - run.since)}`);
    case "running":
      return paint.dim(elapsed(now - run.since));
    default:
      return undefined;
  }
}

/** Enough of an Execution, for agentEnd, so its wording is the one `run` uses everywhere. */
function executionOf(run: ContainerRunState & { status: "failedToStart" | "timedOut" | "exited" | "done" }): Execution {
  const ms = "ms" in run ? run.ms : 0;
  const exitCode = run.status === "exited" ? run.exitCode : run.status === "done" ? 0 : null;
  return {
    startedAt: 0,
    finishedAt: ms,
    exitCode,
    timedOut: run.status === "timedOut",
    ...(run.status === "timedOut" && { timeoutSeconds: run.timeoutSeconds }),
    ...(run.status === "failedToStart" && { failedToStart: run.reason }),
  };
}
