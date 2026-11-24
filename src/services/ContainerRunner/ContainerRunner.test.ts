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
});
