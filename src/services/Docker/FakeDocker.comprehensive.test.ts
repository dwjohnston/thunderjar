import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { type ContainerScriptContext, FakeDocker } from "./FakeDocker";

const args = (name: string) => ["run", "--name", name, "image", "-c", "script"];

const hangs = async ({ clock, start }: ContainerScriptContext) => {
    start();
    await clock.sleep(300_000);
    return 0;
};

describe(FakeDocker, () => {
    test("A container's script is chosen by the end of its name, and it starts when the script says", async () => {
        const clock = new FakeClock();
        const docker = new FakeDocker(clock).on("-slow", async ({ clock, start }) => {
            await clock.sleep(3_000);
            start();
            return 0;
        });

        const slow = docker.spawnRun(args("example-container-slow"), "STARTED");
        const other = docker.spawnRun(args("example-container"), "STARTED");

        await clock.advance(2_999);
        expect(peek.status(slow.started)).toBe("pending");
        expect(peek.status(other.started)).toBe("fulfilled");

        await clock.advance(1);
        expect(peek.status(slow.started)).toBe("fulfilled");
    });

    test("kill ends a hanging container with 137, and records it", async () => {
        const docker = new FakeDocker(new FakeClock()).on("example-container", hangs);
        const container = docker.spawnRun(args("example-container"), "STARTED");

        await docker.killContainer("example-container");

        expect(await container.exited).toBe(137);
        expect(docker.killed).toEqual(["example-container"]);
    });

    test("remove ends a container that never started with 137, and records it", async () => {
        const docker = new FakeDocker(new FakeClock()).on("example-container", async ({ clock }) => {
            await clock.sleep(300_000);
            return 0;
        });
        const container = docker.spawnRun(args("example-container"), "STARTED");

        await docker.removeContainer("example-container");

        expect(peek.status(container.started)).toBe("pending");
        expect(await container.exited).toBe(137);
        expect(docker.removed).toEqual(["example-container"]);
    });

    test("Killing the docker run process ends it with 137, without killing or removing the container", async () => {
        const docker = new FakeDocker(new FakeClock()).on("example-container", hangs);
        const container = docker.spawnRun(args("example-container"), "STARTED");

        container.kill();

        expect(await container.exited).toBe(137);
        expect({ killed: docker.killed, removed: docker.removed }).toEqual({ killed: [], removed: [] });
    });

    test("Every method but running containers throws, naming itself", () => {
        const docker = new FakeDocker(new FakeClock());

        expect(() => docker.build("context", "image")).toThrow("FakeDocker: build isn't faked yet");
        expect(() => docker.readFile("example-container", "/file")).toThrow("FakeDocker: readFile isn't faked yet");
    });
});
