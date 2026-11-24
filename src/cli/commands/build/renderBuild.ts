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


// How `build` looks: the lines its state draws. Nothing here reads the clock or writes: build's
// `frames` draws what this returns, piped or on a terminal.

import type { Paint } from "../../colour.ts";
import type { BuildState } from "./buildState.ts";

export type RenderOptions = {
  /** Whether it's drawn on a terminal, where a line can count up in place. */
  terminal: boolean;
  /** The app's clock, now: what a building image counts up to. */
  now?: number;
  /** Colour, on a terminal. Plain by default. */
  paint?: Paint;
};

/** The lines `state` draws. */
export function renderBuild(_state: BuildState, _options: RenderOptions): string[] {
  return [];
}
