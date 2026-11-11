import { describe, expect, test } from "bun:test";
import { elapsed, waitingLine } from "./waitingLine.ts";

/** An output that records what's written to it, a clock, and a ticker that's ticked by hand. */
function setup(isTTY: boolean, transient = false) {
  const written: string[] = [];
  let time = 0;
  let tick: (() => void) | undefined;
  let stopped = false;
  const line = waitingLine("Building img ... ", {
    transient,
    out: { isTTY, write: (text) => written.push(text) },
    ticker: (t) => {
      tick = t;
      return () => {
        stopped = true;
      };
    },
    now: () => time,
  });
  return {
    line,
    written,
    isStopped: () => stopped,
    hasTicker: () => tick !== undefined,
    /** Moves the clock on `ms`, then ticks. */
    advance: (ms: number) => {
      time += ms;
      tick?.();
    },
  };
}

describe("waitingLine", () => {
  test("not a terminal: the label, then how it ended, and no count", () => {
    const { line, written, hasTicker } = setup(false);

    line.finish("done");

    expect(written.join("")).toBe("Building img ... done\n");
    expect(hasTicker()).toBe(false);
  });

  test("a terminal: counts up after the label, each count replacing the last", () => {
    const { written, advance } = setup(true);

    advance(1000);
    advance(9000);

    expect(written).toEqual(["Building img ... ", "0s", "\x1b[2D\x1b[K1s", "\x1b[2D\x1b[K10s"]);
  });

  test("a terminal: failing replaces the count with failed, and stops counting", () => {
    const { line, written, advance, isStopped } = setup(true);
    advance(65_000);

    line.fail();

    expect(written.at(-1)).toBe("\x1b[6D\x1b[Kfailed\n");
    expect(isStopped()).toBe(true);
  });

  test("a terminal: stopping leaves the line as it is", () => {
    const { line, written, isStopped } = setup(true);

    line.stop();

    expect(written).toEqual(["Building img ... ", "0s"]);
    expect(isStopped()).toBe(true);
  });
});

describe("a transient waitingLine", () => {
  test("not a terminal: only what it's finished with is written", () => {
    const { line, written } = setup(false, true);

    line.finish("    passes: true");

    expect(written.join("")).toBe("    passes: true\n");
  });

  test("not a terminal: failing writes nothing", () => {
    const { line, written } = setup(false, true);

    line.fail();

    expect(written).toEqual([]);
  });

  test("a terminal: counts, then what it's finished with replaces the whole line", () => {
    const { line, written, advance } = setup(true, true);
    advance(3000);

    line.finish("    passes: true");

    expect(written).toEqual(["Building img ... ", "0s", "\x1b[2D\x1b[K3s", "\x1b[2D\x1b[K\r\x1b[2K    passes: true\n"]);
  });

  test("a terminal: failing ends the line with failed", () => {
    const { line, written } = setup(true, true);

    line.fail();

    expect(written.at(-1)).toBe("\x1b[2D\x1b[Kfailed\n");
  });
});

describe("elapsed", () => {
  test.each([
    [0, "0s"],
    [999, "0s"],
    [59_000, "59s"],
    [65_000, "1m 05s"],
    [3_725_000, "1h 02m 05s"],
  ])("%dms is %s", (ms, text) => {
    expect(elapsed(ms)).toBe(text);
  });
});
