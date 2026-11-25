import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeClock } from "../services/Clock/FakeClock.ts";
import { FakeContainerRunner } from "../services/ContainerRunner/FakeContainerRunner.ts";
import { runContainer } from "./docker.ts";

// How runContainer's timeout works, on a fake clock: each test runs in milliseconds.

const START = 1_000_000;
const MARKER = "STARTED";

const run = (clock: FakeClock, runner: FakeContainerRunner, name: string, timeoutSeconds: number) =>
  runContainer("example-image", name, "script", { timeoutSeconds, startMarker: MARKER, clock, runner });

describe("runContainer, with a start marker and a timeout", () => {
  test("The timeout runs from the start marker: a container 3s slow to start, past a 2s timeout, still exits", async () => {
    const clock = new FakeClock(START);
    const runner = new FakeContainerRunner(clock).on("-slow", async ({ clock, start }) => {
      await clock.sleep(3_000);
      start();
      await clock.sleep(1_000);
      return 0;
    });

    const stop = run(clock, runner, "example-slow", 2);

    await clock.advance(3_999);
    expect(peek.status(stop)).toBe("pending");

    await clock.advance(1);
    expect(await stop).toEqual({ outcome: "exited" });
    expect(runner.killed).toEqual([]);
  });

  test("A container that hangs after starting is killed when the timeout runs out", async () => {
    const clock = new FakeClock(START);
    const runner = new FakeContainerRunner(clock).on("-hangs", async ({ clock, start }) => {
      start();
      await clock.sleep(300_000);
      return 0;
    });

    const stop = run(clock, runner, "example-hangs", 2);

    await clock.advance(1_999);
    expect(peek.status(stop)).toBe("pending");
    expect(runner.killed).toEqual([]);

    await clock.advance(1);
    expect(await stop).toEqual({ outcome: "timedOut", killedAt: START + 2_000 });
    expect(runner.killed).toEqual(["example-hangs"]);
  });
});
