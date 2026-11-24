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

import { type Paint, plain } from "../../colour.ts";
import type { BuildState } from "./buildState.ts";

export type RenderOptions = {
  /** Whether it's drawn on a terminal, where a line can count up in place. */
  terminal: boolean;
  /** The app's clock, now: what a building image counts up to. */
  now?: number;
  /** Colour, on a terminal. Plain by default. */
  paint?: Paint;
};

/** The lines `state` draws: a line for each image built, then, once every one is there, a count. */
export function renderBuild(state: BuildState, options: RenderOptions): string[] {
  return [...imageLines(state, options), ...summaryLines(state, options)];
}

/** `Building <image> ... done` for each image built, in plan's order. */
export function imageLines(state: BuildState, { paint = plain }: RenderOptions): string[] {
  return state.images.flatMap((entry) =>
    entry.status === "built" ? [`Building ${paint.cyan(entry.image)} ${paint.dim("...")} ${paint.green("done")}`] : [],
  );
}

/** Once every image is present or built: how many of each. */
export function summaryLines(state: BuildState, { paint = plain }: RenderOptions): string[] {
  if (!state.images.every(({ status }) => status === "present" || status === "built")) return [];
  const count = (status: string) => state.images.filter((entry) => entry.status === status).length;
  return [[paint.green(`${count("built")} built`), paint.dim(`${count("present")} already present`)].join(paint.dim(", "))];
}
