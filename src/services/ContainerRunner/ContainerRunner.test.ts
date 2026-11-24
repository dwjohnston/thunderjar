import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeContainerRunner } from "./FakeContainerRunner";

const args = (name: string) => ["run", "--name", name, "image", "-c", "script"];

describe("FakeContainerRunner", () => {
  test("a container with no script starts at once and exits 0", async () => {
    const runner = new FakeContainerRunner(new FakeClock());

    const container = runner.spawn(args("tj-1-1"), "STARTED");

    await container.started;
    expect(await container.exited).toBe(0);
    expect(await container.stderr).toBe("");
  });

  test("a scripted container runs on the fake clock, chosen by the end of its name", async () => {
    const clock = new FakeClock();
    const runner = new FakeContainerRunner(clock).on("-3-1", async ({ clock, start }) => {
      await clock.sleep(3_000);
      start();
      await clock.sleep(1_000);
      return { exitCode: 2, stderr: "boom" };
    });
    const container = runner.spawn(args("tj-3-1"), "STARTED");
    let startedAt: number | undefined;
    void container.started.then(() => (startedAt = clock.now()));

    await clock.advance(2_000);
    expect(startedAt).toBeUndefined();
    await clock.advance(2_000);

    expect(startedAt).toBe(3_000);
    expect(await container.exited).toBe(2);
    expect(await container.stderr).toBe("boom");
  });

  test("kill ends a hanging container with 137, and records it", async () => {
    const clock = new FakeClock();
    const runner = new FakeContainerRunner(clock).on("-1-1", async ({ clock, start }) => {
      start();
      await clock.sleep(300_000);
      return 0;
    });
    const container = runner.spawn(args("tj-1-1"), "STARTED");
    await container.started;

    await runner.kill("tj-1-1");

    expect(await Promise.race([container.exited, clock.advance(0).then(() => "still running")])).toBe(137);
    expect(runner.killed).toEqual(["tj-1-1"]);
  });

  test("remove ends a container that never started with 137, and records it", async () => {
    const clock = new FakeClock();
    const runner = new FakeContainerRunner(clock).on("-2-1", async ({ clock }) => {
      await clock.sleep(300_000);
      return 0;
    });
    const container = runner.spawn(args("tj-2-1"), "STARTED");

    await runner.remove("tj-2-1");

    expect(await Promise.race([container.exited, clock.advance(0).then(() => "still running")])).toBe(137);
    expect(runner.removed).toEqual(["tj-2-1"]);
  });

  test("killing the docker run process ends it with 137, without killing or removing the container", async () => {
    const clock = new FakeClock();
    const runner = new FakeContainerRunner(clock).on("-1-1", async ({ clock }) => {
      await clock.sleep(300_000);
      return 0;
    });
    const container = runner.spawn(args("tj-1-1"), "STARTED");

    container.kill();

    expect(await Promise.race([container.exited, clock.advance(0).then(() => "still running")])).toBe(137);
    expect({ killed: runner.killed, removed: runner.removed }).toEqual({ killed: [], removed: [] });
  });
});
