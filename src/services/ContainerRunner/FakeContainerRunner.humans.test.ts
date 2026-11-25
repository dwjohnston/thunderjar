import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { FakeContainerRunner } from "./FakeContainerRunner";

const args = (name: string) => ["run", "--name", name, "image", "-c", "script"];

describe(FakeContainerRunner, () => {
    test("a container with no script starts at once and exits 0", async () => {
        const runner = new FakeContainerRunner(new FakeClock());

        const container = runner.spawn(args("example-container"), "STARTED");



        await container.started;
        expect(await container.exited).toBe(0);
        expect(await container.stderr).toBe("");
    });

    test("A container starts, waits 30 seconds, and then errors", async () => {
        const clock = new FakeClock();
        const runner = new FakeContainerRunner(clock).on("example-container", async ({ clock, start }) => {
            start();
            await clock.sleep(30_000);
            return { exitCode: 2, stderr: "boom" };
        });

        const container = runner.spawn(args("example-container"), "STARTED");

        await container.started;
        expect(peek.status(container.exited)).toBe("pending");

        await clock.advance(29_999);
        expect(peek.status(container.exited)).toBe("pending");

        await clock.advance(1);
        expect(await container.exited).toBe(2);
        expect(await container.stderr).toBe("boom");
    });


    /**
     * 🙋‍♂️Container's stdout is not exposed, but it can exit 0 and output info via std err 
     */
    test("A container exits successfully, having written to stderr", async () => {
        const runner = new FakeContainerRunner(new FakeClock()).on("example-container", async ({ start }) => {
            start();
            return { exitCode: 0, stderr: "warning: something to note" };
        });

        const container = runner.spawn(args("example-container"), "STARTED");

        await container.started;
        expect(await container.exited).toBe(0);
        expect(await container.stderr).toBe("warning: something to note");
    });


});
