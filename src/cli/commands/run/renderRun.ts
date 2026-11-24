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
import type { Paint } from "../../colour.ts";
import type { RunState } from "./runState.ts";

export type RenderOptions = {
  /** The app's clock, now: what a container run still going counts up to. */
  now: number;
  /** Whether it's drawn on a terminal, where a line can count up in place. */
  terminal: boolean;
  /** Colour, on a terminal. Plain by default. */
  paint?: Paint;
};

/** The lines `state` draws: the execution, then a line for each container run, with its measures under it. */
export function renderRun(_state: RunState, _options: RenderOptions): string[] {
  return [];
}
