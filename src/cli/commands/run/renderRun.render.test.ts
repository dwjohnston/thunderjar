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
// How run's state looks, drawn from hand-built states: no Docker, no scenario.
import { expect, test } from "bun:test";
import { renderRun } from "./renderRun.ts";
import type { ContainerRunState, RunState } from "./runState.ts";

const T0 = 1_767_225_600_000;

/** 0204's misbehaving test case, its sleeper timed out and its crasher exited 1, and its silent agent `silent`. */
const misbehaving = (silent: ContainerRunState): RunState => ({
  executionId: "00000000000000000000000001",
  containers: [
    {
      permutation: [1, 3],
      iteration: [1, 1],
      label: "fake-sleeper | plain",
      run: { status: "timedOut", timeoutSeconds: 2, ms: 2_000, measures: { isPrimeTsExists: { outcome: "measured", data: false } } },
    },
    {
      permutation: [2, 3],
      iteration: [1, 1],
      label: "fake-crasher | plain",
      run: { status: "exited", exitCode: 1, resultFile: true, ms: 0, measures: { isPrimeTsExists: { outcome: "measured", data: false } } },
    },
    { permutation: [3, 3], iteration: [1, 1], label: "fake-silent | plain", run: silent },
  ],
});

test("timed out, exited non-zero, and done without a result file each say so, with their measures under them", () => {
  const state = misbehaving({ status: "done", resultFile: false, ms: 0, measures: { isPrimeTsExists: { outcome: "measured", data: true } } });

  expect(renderRun(state, { now: T0 + 5_000, terminal: false })).toEqual([
    "Execution 00000000000000000000000001",
    " 1/3  iteration 1/1  fake-sleeper | plain  ... timed out after 2s",
    "      isPrimeTsExists: false",
    " 2/3  iteration 1/1  fake-crasher | plain  ... exited 1 (0ms)",
    "      isPrimeTsExists: false",
    " 3/3  iteration 1/1  fake-silent | plain  ... done, no result file (0ms)",
    "      isPrimeTsExists: true",
  ]);
});

test("on a terminal, a container still starting past its agent's timeout counts up, and says it's starting", () => {
  const state = misbehaving({ status: "starting", since: T0 + 2_000 });

  expect(renderRun(state, { now: T0 + 4_900, terminal: true })).toEqual([
    "Execution 00000000000000000000000001",
    " 1/3  iteration 1/1  fake-sleeper | plain  ... timed out after 2s",
    "      isPrimeTsExists: false",
    " 2/3  iteration 1/1  fake-crasher | plain  ... exited 1 (0ms)",
    "      isPrimeTsExists: false",
    " 3/3  iteration 1/1  fake-silent | plain  ... starting 2s",
  ]);
});
