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
import type { Line } from "../../frames.ts";
import { elapsed } from "../../waitingLine.ts";
import type { BuildState } from "./buildState.ts";

export type RenderOptions = {
  /** Whether it's drawn on a terminal, where a line can count up in place. */
  terminal: boolean;
  /** The app's clock, now: what a building image counts up to. */
  now?: number;
  /** Colour, on a terminal. Plain by default. */
  paint?: Paint;
};

/**
 * The lines `state` draws: the runtime it builds on, a line for each image built, and each push,
 * then, once every one is done, a count.
 */
export function renderBuild(state: BuildState, options: RenderOptions): Line[] {
  return [...headerLines(state, options), ...imageLines(state, options), ...pushLines(state, options), ...summaryLines(state, options)];
}

/** Which runtime it builds on, if not the local Docker daemon. */
export function headerLines(state: BuildState, { paint = plain }: RenderOptions): string[] {
  return state.runtime === undefined ? [] : [paint.dim(`Building with \`${state.runtime}\``)];
}

/**
 * `<label> ... done`, or `failed`, for what's ended, and, for what's going, on a terminal how long
 * it has been, in place of `done`, and piped an open line, finished when it ends.
 */
function waitingLines(
  entries: { label: string; status: string; since?: number }[],
  going: string,
  ended: string,
  { terminal, now = 0, paint = plain }: RenderOptions,
): Line[] {
  return entries.flatMap<Line>(({ label, status, since }) => {
    const start = `${label} ${paint.dim("...")} `;
    if (status === ended) return [`${start}${paint.green("done")}`];
    if (status === "failed") return [`${start}${paint.red("failed")}`];
    if (status === going) return [terminal ? `${start}${paint.dim(elapsed(now - (since as number)))}` : { open: start }];
    return [];
  });
}

/**
 * `Building <image> ... done` for each image built, in plan's order, or `failed`, and, for the one
 * building, on a terminal how long it has been, in place of `done`, and piped its label.
 */
export function imageLines(state: BuildState, options: RenderOptions): Line[] {
  const paint = options.paint ?? plain;
  const entries = state.images.map((entry) => ({ label: `Building ${paint.cyan(entry.image)}`, status: entry.status, since: "since" in entry ? entry.since : undefined }));
  return waitingLines(entries, "building", "built", options);
}

/** `Pushing <reference> ... done` for each push, in plan's order, as imageLines does for builds. */
export function pushLines(state: BuildState, options: RenderOptions): Line[] {
  const paint = options.paint ?? plain;
  const entries = (state.pushes ?? []).map((entry) => ({ label: `Pushing ${paint.cyan(entry.reference)}`, status: entry.status, since: "since" in entry ? entry.since : undefined }));
  return waitingLines(entries, "pushing", "pushed", options);
}

/** Once every image is present or built, and every push pushed: how many of each. */
export function summaryLines(state: BuildState, { paint = plain }: RenderOptions): string[] {
  // No images: it isn't known yet which it needs.
  if (state.images.length === 0) return [];
  if (!state.images.every(({ status }) => status === "present" || status === "built")) return [];
  if (!(state.pushes ?? []).every(({ status }) => status === "pushed")) return [];
  const count = (status: string) => state.images.filter((entry) => entry.status === status).length;
  return [
    [
      paint.green(`${count("built")} built`),
      paint.dim(`${count("present")} already present`),
      ...(state.pushes === undefined ? [] : [paint.green(`${state.pushes.length} pushed`)]),
    ].join(paint.dim(", ")),
  ];
}
