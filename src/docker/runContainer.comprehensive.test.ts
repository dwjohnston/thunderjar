import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeClock } from "../services/Clock/FakeClock.ts";
import { FakeDocker } from "../services/Docker/FakeDocker.ts";
import { DockerContainerError, runContainer } from "./docker.ts";

// runContainer's timing, on a fake clock: each test runs in milliseconds.

const START = 1_000_000;
const MARKER = "STARTED";

const run = (clock: FakeClock, docker: FakeDocker, name: string, timeoutSeconds: number) =>
  runContainer("example-image", name, "script", { timeoutSeconds, startMarker: MARKER, clock, docker });

describe("runContainer, with a start marker and a timeout", () => {
  test("A container that never prints its start marker is given up on, and removed, after the start timeout", async () => {
    const clock = new FakeClock(START);
    const docker = new FakeDocker(clock).on("-never", async ({ clock }) => {
      await clock.sleep(10_000_000);
      return 0;
    });

    const stop = run(clock, docker, "example-never", 2);

    await clock.advance(599_999);
    expect(peek.status(stop)).toBe("pending");

    await clock.advance(1);
    expect(await stop).toEqual({ outcome: "notStarted", reason: "it didn't start within 600s", spawnedAt: START, gaveUpAt: START + 600_000 });
    expect(docker.removed).toEqual(["example-never"]);
    expect(docker.killed).toEqual([]);
  });

  test("A container whose `docker run` fails before its start marker never started, and says why", async () => {
    const clock = new FakeClock(START);
    const docker = new FakeDocker(clock).on("-fails", async () => ({ exitCode: 125, stderr: "docker: Error response from daemon: No such image: example-image" }));

    const stop = await run(clock, docker, "example-fails", 2);

    expect(stop).toMatchObject({ outcome: "notStarted", reason: "docker: Error response from daemon: No such image: example-image" });
  });

  test("A container that exits non-zero after starting, within its timeout, throws a DockerContainerError with its reason", async () => {
    const clock = new FakeClock(START);
    const docker = new FakeDocker(clock).on("-crashes", async ({ clock, start }) => {
      start();
      await clock.sleep(1_000);
      return { exitCode: 1, stderr: "agent crashed" };
    });

    const stop = run(clock, docker, "example-crashes", 2);
    const settled = stop.catch((error: unknown) => error);

    await clock.advance(1_000);
    const error = await settled;
    expect(error).toBeInstanceOf(DockerContainerError);
    expect((error as Error).message).toBe("agent crashed");
    expect(docker.killed).toEqual([]);
  });
});
