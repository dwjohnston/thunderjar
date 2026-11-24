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


// How build's state looks, drawn from hand-built states: no Docker, no scenario.
import { expect, test } from "bun:test";
import type { BuildState } from "./buildState.ts";
import { renderBuild } from "./renderBuild.ts";

test("a line per image built, then a count of built and already present", () => {
  const state: BuildState = {
    images: [
      { image: "thunderjar-prerun:aaaaaaaa", status: "present" },
      { image: "thunderjar-prerun:bbbbbbbb", status: "built", ms: 4_000 },
      { image: "thunderjar-prerun:cccccccc", status: "built", ms: 6_000 },
    ],
  };

  expect(renderBuild(state, { terminal: false })).toEqual([
    "Building thunderjar-prerun:bbbbbbbb ... done",
    "Building thunderjar-prerun:cccccccc ... done",
    "2 built, 1 already present",
  ]);
});
