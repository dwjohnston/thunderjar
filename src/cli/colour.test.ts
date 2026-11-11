/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 59b8836a-3b3e-41c0-9575-a82add14e327
 * Supervising engineer: blacksheep-bot
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { afterEach, describe, expect, test } from "bun:test";
import { colourFor, padEnd, padStart, painter, plain, unstyled, visibleLength } from "./colour.ts";

const saved = { NO_COLOR: process.env.NO_COLOR, FORCE_COLOR: process.env.FORCE_COLOR, TERM: process.env.TERM };

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Sets the colour variables, leaving out any not given. */
function env(vars: { NO_COLOR?: string; FORCE_COLOR?: string; TERM?: string }) {
  for (const key of ["NO_COLOR", "FORCE_COLOR", "TERM"] as const) {
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
}

describe("colourFor", () => {
  test("a terminal is coloured, and anything else isn't", () => {
    env({ TERM: "xterm-256color" });

    expect(colourFor({ isTTY: true })).toBe(true);
    expect(colourFor({ isTTY: false })).toBe(false);
    expect(colourFor({})).toBe(false);
  });

  test("a dumb terminal isn't coloured", () => {
    env({ TERM: "dumb" });

    expect(colourFor({ isTTY: true })).toBe(false);
  });

  test("NO_COLOR turns colour off, even with FORCE_COLOR", () => {
    env({ NO_COLOR: "1", FORCE_COLOR: "1" });

    expect(colourFor({ isTTY: true })).toBe(false);
  });

  test("FORCE_COLOR turns colour on, unless it's 0", () => {
    env({ FORCE_COLOR: "1" });
    expect(colourFor({ isTTY: false })).toBe(true);

    env({ FORCE_COLOR: "0" });
    expect(colourFor({ isTTY: false })).toBe(false);
  });
});

describe("painter", () => {
  test("wraps text in a style's codes, each turned off after it", () => {
    const paint = painter({}, true);

    expect(paint.green("done")).toBe("\x1b[32mdone\x1b[39m");
    expect(paint.error("Error:")).toBe("\x1b[31m\x1b[1mError:\x1b[22m\x1b[39m");
  });

  test("leaves text as it is when colour is off", () => {
    const paint = painter({}, false);

    expect(paint.green("done")).toBe("done");
    expect(paint.error("Error:")).toBe("Error:");
  });
});

describe("padding coloured text", () => {
  const paint = painter({}, true);

  test("counts only what's shown, not the colour codes", () => {
    const done = paint.green("done");

    expect(visibleLength(done)).toBe(4);
    expect(unstyled(done)).toBe("done");
    expect(unstyled(padEnd(done, 6))).toBe("done  ");
    expect(unstyled(padStart(done, 6))).toBe("  done");
  });

  test("leaves text that's already as wide as it is", () => {
    expect(padEnd(paint.red("failed"), 3)).toBe(paint.red("failed"));
  });

  test("the plain painter leaves text as it is", () => {
    expect(plain.bold("x")).toBe("x");
  });
});
