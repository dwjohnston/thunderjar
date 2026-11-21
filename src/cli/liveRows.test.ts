import { describe, expect, test } from "bun:test";
import { liveRows } from "./liveRows.ts";

/** A terminal that records what's written to it, a clock, and a ticker that's ticked by hand. */
function setup(columns?: number) {
  const written: string[] = [];
  let time = 0;
  let tick: (() => void) | undefined;
  let stopped = false;
  const rows = liveRows({
    colour: false,
    out: { isTTY: true, columns, write: (text) => written.push(text) },
    ticker: (t) => {
      tick = t;
      return () => {
        stopped = true;
      };
    },
    now: () => time,
  });
  return {
    rows,
    written,
    last: () => written.at(-1),
    isStopped: () => stopped,
    advance: (ms: number) => {
      time += ms;
      tick?.();
    },
  };
}

describe("liveRows", () => {
  test("a row counts up after its text, each tick redrawing every row in place", () => {
    const { rows, written, advance } = setup();

    rows.add("a  running ");
    rows.add("b  running ");
    advance(3000);

    expect(written).toEqual(["a  running 0s\n", "\x1b[1F\x1b[Ja  running 0s\nb  running 0s\n", "\x1b[2F\x1b[Ja  running 3s\nb  running 3s\n"]);
  });

  test("set changes a row in place, restarting its count only if counting", () => {
    const { rows, last, advance } = setup();
    const a = rows.add("a  running ");
    advance(5000);

    a.set("a  done  measuring ", true);
    expect(last()).toBe("\x1b[1F\x1b[Ja  done  measuring 0s\n");

    a.set("a  done");
    advance(5000);
    expect(last()).toBe("\x1b[1F\x1b[Ja  done\n");
  });

  test("a row that's done is left once no row above it is still going", () => {
    const { rows, last } = setup();
    const a = rows.add("a ");
    const b = rows.add("b ");

    b.done();
    // Still redrawn: a is above it and going.
    expect(last()).toBe("\x1b[2F\x1b[Ja 0s\nb \n");

    a.done();
    // Both written a last time, and no longer redrawn.
    expect(last()).toBe("\x1b[2F\x1b[Ja \nb \n");
    rows.add("c ");
    expect(last()).toBe("c 0s\n");
  });

  test("a line wider than the terminal counts as each line it wraps onto", () => {
    const { rows, last, advance } = setup(10);
    rows.add("123456789012345 ");

    advance(1000);

    expect(last()).toBe("\x1b[2F\x1b[J123456789012345 1s\n");
  });

  test("stop draws once more, stops counting, and writes nothing after", () => {
    const { rows, written, isStopped } = setup();
    const a = rows.add("a ");

    rows.stop();
    const count = written.length;
    a.set("a changed");
    rows.stop();

    expect(isStopped()).toBe(true);
    expect(written.length).toBe(count);
  });
});
