import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { DockerBuildError, DockerContainerError, DockerPullError } from "./errors";
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
});

const START = 1_000_000;

describe("FakeDocker, images", () => {
    test("It has the images added to it, with their files, and lists those of one repository", async () => {
        const docker = new FakeDocker(new FakeClock());

        docker.addImage("shop:cart", { "/notes.txt": "milk" });
        docker.addImage("shop:till");
        docker.addImage("shopping:list");

        expect(docker.images()).toEqual(["shop:cart", "shop:till", "shopping:list"]);
        expect(await docker.imagesIn("shop")).toEqual(new Set(["shop:cart", "shop:till"]));
        expect(docker.imageFiles("shop:cart")).toEqual({ "/notes.txt": "milk" });
        expect(docker.imageFiles("shop:door")).toBeUndefined();
    });

    test("A build adds the image, and is recorded with what it was given", async () => {
        const docker = new FakeDocker(new FakeClock());

        await docker.build("/tmp/context", "shop:cart", { ssh: true });

        expect(docker.images()).toEqual(["shop:cart"]);
        expect(docker.builds).toEqual([{ contextDir: "/tmp/context", image: "shop:cart", options: { ssh: true } }]);
    });

    test("failBuild makes that image's build throw a DockerBuildError, and adds no image", async () => {
        const docker = new FakeDocker(new FakeClock()).failBuild("shop:cart", "no space left on device");

        const error = await docker.build("/tmp/context", "shop:cart").catch((caught) => caught);

        expect(error).toBeInstanceOf(DockerBuildError);
        expect(error.message).toBe("no space left on device");
        expect(error.image).toBe("shop:cart");
        expect(docker.images()).toEqual([]);
        expect(docker.builds.map((build) => build.image)).toEqual(["shop:cart"]);
    });

    test("Builds take as long as they were told to, so two at once overlap", async () => {
        const clock = new FakeClock();
        const docker = new FakeDocker(clock).takes("build", 10_000);

        const both = Promise.all([docker.build("/tmp/one", "shop:cart"), docker.build("/tmp/two", "shop:till")]);

        await clock.advance(9_999);
        expect(docker.builds).toHaveLength(2);
        expect(docker.images()).toEqual([]);
        await clock.advance(1);
        await both;
        expect(docker.images()).toEqual(["shop:cart", "shop:till"]);
    });

    test("A run can take a while to create its container, as on a slow runtime: until then there is none to remove", async () => {
        const clock = new FakeClock();
        const docker = new FakeDocker(clock).addImage("shop:cart").takes("run", 3_000).on("", hangs);

        const running = docker.run("shop:cart", "shop-1", "script");
        await clock.advance(2_999);
        expect(docker.containers()).toEqual([]);
        expect(await docker.removeContainersNamed("shop-")).toEqual([]);

        await clock.advance(1);
        expect(docker.containers()).toEqual(["shop-1"]);
        expect(await docker.removeContainersNamed("shop-")).toEqual(["shop-1"]);
        await running.catch(() => {});
    });

    test("Removing a local image says whether it was there", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart");

        expect(await docker.removeLocalImage("shop:cart")).toEqual({ outcome: "deleted" });
        expect(await docker.removeLocalImage("shop:cart")).toEqual({ outcome: "absent" });
        expect(docker.images()).toEqual([]);
    });
});

describe("FakeDocker, run", () => {
    test("A container with no script exits at once, and stays until it is removed", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart", { "/notes.txt": "milk" });

        const stop = await docker.run("shop:cart", "example-container", "echo hello", { setEnv: { COLOUR: "red" } });

        expect(stop).toEqual({ outcome: "exited" });
        expect(docker.containers()).toEqual(["example-container"]);
        expect(await docker.containerState("example-container")).toEqual({ running: false, exitCode: 0 });
        expect(await docker.readFile("example-container", "/notes.txt")).toBe("milk");
        expect(docker.container("example-container")).toMatchObject({ image: "shop:cart", script: "echo hello", options: { setEnv: { COLOUR: "red" } } });

        await docker.removeContainer("example-container");
        expect(docker.containers()).toEqual([]);
        expect(await docker.containerState("example-container")).toBeUndefined();
    });

    test("A script is chosen by the end of the name, sees what it was run with, and leaves files in its container", async () => {
        const clock = new FakeClock();
        const docker = new FakeDocker(clock).on("-writer", async ({ clock, start, write, read, options, image, script }) => {
            start();
            await clock.sleep(1_000);
            write("/report.txt", `${image} ran ${script} with ${options.env?.join(",")} after reading ${read("/notes.txt")}`);
            return 0;
        });
        docker.addImage("shop:cart", { "/notes.txt": "milk" });

        const stop = docker.run("shop:cart", "example-writer", "sh run.sh", { env: ["TOKEN"] });
        await clock.advance(1_000);

        expect(await stop).toEqual({ outcome: "exited" });
        expect(await docker.readFile("example-writer", "/report.txt")).toBe("shop:cart ran sh run.sh with TOKEN after reading milk");
        expect(await docker.readFile("example-writer", "/missing.txt")).toBeUndefined();
        // The image itself is unchanged.
        expect(docker.imageFiles("shop:cart")).toEqual({ "/notes.txt": "milk" });
    });

    test("An image this daemon doesn't have: the container never starts", async () => {
        const clock = new FakeClock(START);
        const docker = new FakeDocker(clock);

        const stop = await docker.run("shop:cart", "example-container", "echo hello");

        expect(stop).toEqual({ outcome: "notStarted", reason: "No such image: shop:cart", spawnedAt: START, gaveUpAt: START });
        expect(docker.containers()).toEqual([]);
    });

    test("A name already in use: the container never starts", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart");
        await docker.run("shop:cart", "example-container", "echo hello");

        const stop = await docker.run("shop:cart", "example-container", "echo again");

        expect(stop).toMatchObject({ outcome: "notStarted", reason: 'The container name "example-container" is already in use' });
        expect(docker.container("example-container")?.script).toBe("echo hello");
    });

    test("A container that hangs after starting is killed when the timeout runs out, and what it would have written is lost", async () => {
        const clock = new FakeClock(START);
        const docker = new FakeDocker(clock).on("-hangs", async ({ clock, start, write }) => {
            start();
            write("/started.txt", "yes");
            await clock.sleep(300_000);
            write("/finished.txt", "yes");
            return 0;
        });
        docker.addImage("shop:cart");

        const stop = docker.run("shop:cart", "example-hangs", "sleep", { timeoutSeconds: 2, startMarker: "STARTED" });

        await clock.advance(1_999);
        expect(peek.status(stop)).toBe("pending");
        expect(await docker.containerState("example-hangs")).toEqual({ running: true, exitCode: 0 });
        await clock.advance(1);
        expect(await stop).toEqual({ outcome: "timedOut", killedAt: START + 2_000 });
        expect(await docker.containerState("example-hangs")).toEqual({ running: false, exitCode: 137 });

        await clock.advance(300_000);
        expect(await docker.readFile("example-hangs", "/started.txt")).toBe("yes");
        expect(await docker.readFile("example-hangs", "/finished.txt")).toBeUndefined();
    });

    test("With a start marker, the timeout runs from when the script starts", async () => {
        const clock = new FakeClock(START);
        const docker = new FakeDocker(clock).on("-slow", async ({ clock, start }) => {
            await clock.sleep(3_000);
            start();
            await clock.sleep(1_000);
            return 0;
        });
        docker.addImage("shop:cart");

        const stop = docker.run("shop:cart", "example-slow", "sleep", { timeoutSeconds: 2, startMarker: "STARTED" });
        await clock.advance(4_000);

        expect(await stop).toEqual({ outcome: "exited" });
    });

    test("With no start marker, the timeout runs from the start", async () => {
        const clock = new FakeClock(START);
        const docker = new FakeDocker(clock).on("-slow", async ({ clock }) => {
            await clock.sleep(3_000);
            return 0;
        });
        docker.addImage("shop:cart");

        const stop = docker.run("shop:cart", "example-slow", "sleep", { timeoutSeconds: 2 });
        await clock.advance(2_000);

        expect(await stop).toEqual({ outcome: "timedOut", killedAt: START + 2_000 });
    });

    test("A container that never prints its start marker is given up on, and removed", async () => {
        const clock = new FakeClock(START);
        const docker = new FakeDocker(clock).on("-never", async ({ clock }) => {
            await clock.sleep(3_600_000);
            return 0;
        });
        docker.addImage("shop:cart");

        const stop = docker.run("shop:cart", "example-never", "sleep", { timeoutSeconds: 2, startMarker: "STARTED" });
        await clock.advance(600_000);

        expect(await stop).toEqual({ outcome: "notStarted", reason: "it didn't start within 600s", spawnedAt: START, gaveUpAt: START + 600_000 });
        expect(docker.containers()).toEqual([]);
    });

    test("As the real one does: `docker run` failing before the start is not started, and after it throws", async () => {
        const docker = new FakeDocker(new FakeClock(START))
            .on("-refused", async () => ({ exitCode: 125, stderr: "no such device" }))
            .on("-crashes", async ({ start }) => {
                start();
                return { exitCode: 1, stderr: "it fell over" };
            });
        docker.addImage("shop:cart");

        const refused = await docker.run("shop:cart", "example-refused", "true", { startMarker: "STARTED" });
        const crashed = await docker.run("shop:cart", "example-crashes", "true", { startMarker: "STARTED" }).catch((caught) => caught);

        expect(refused).toEqual({ outcome: "notStarted", reason: "no such device", spawnedAt: START, gaveUpAt: START });
        expect(crashed).toBeInstanceOf(DockerContainerError);
        expect(crashed.message).toBe("it fell over");
    });

    test("A script that throws makes run throw that error, and leaves the container stopped", async () => {
        const docker = new FakeDocker(new FakeClock()).on("-broken", async () => {
            throw new Error("the daemon went away");
        });
        docker.addImage("shop:cart");

        expect(docker.run("shop:cart", "example-broken", "true")).rejects.toThrow("the daemon went away");
        expect(await docker.containerState("example-broken")).toEqual({ running: false, exitCode: 1 });
    });

    test("Removing containers by the start of their name ends the running ones, and leaves the others", async () => {
        const docker = new FakeDocker(new FakeClock()).on("-hangs", hangs);
        docker.addImage("shop:cart");
        const hanging = docker.run("shop:cart", "queue-1-hangs", "sleep", { startMarker: "STARTED" }).catch((caught) => caught);
        await docker.run("shop:cart", "queue-2", "true");
        await docker.run("shop:cart", "other-1", "true");

        const removed = await docker.removeContainersNamed("queue-");

        expect(removed).toEqual(["queue-1-hangs", "queue-2"]);
        expect(docker.containers()).toEqual(["other-1"]);
        // Killed under it: `docker run` exits 137, which the real `run` throws for.
        expect(await hanging).toBeInstanceOf(DockerContainerError);
    });
});

describe("FakeDocker, container files and commit", () => {
    test("A file written to a container can be read back, and committing it makes an image holding its files", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart", { "/notes.txt": "milk" });
        await docker.run("shop:cart", "example-container", "true");

        await docker.writeFile("example-container", "/extra.txt", "eggs");
        await docker.commit("example-container", "shop:cart-after", "shop:cart", { COLOUR: "red" });

        expect(await docker.readFile("example-container", "/extra.txt")).toBe("eggs");
        expect(docker.imageFiles("shop:cart-after")).toEqual({ "/notes.txt": "milk", "/extra.txt": "eggs" });
        expect(docker.imageFiles("shop:cart")).toEqual({ "/notes.txt": "milk" });
    });

    test("A container that isn't there can't be committed, read or written", async () => {
        const docker = new FakeDocker(new FakeClock());

        expect(docker.commit("example-container", "shop:after", "shop:cart")).rejects.toBeInstanceOf(DockerContainerError);
        expect(docker.readFile("example-container", "/notes.txt")).rejects.toBeInstanceOf(DockerContainerError);
        expect(docker.writeFile("example-container", "/notes.txt", "milk")).rejects.toBeInstanceOf(DockerContainerError);
    });
});

describe("FakeDocker, shell sessions", () => {
    test("A session answers each command from the handler, which can read the image's files", async () => {
        const docker = new FakeDocker(new FakeClock()).onShell((command, { read, stdin, env, name }) => {
            if (command === "cat /notes.txt") return { stdout: read("/notes.txt") ?? "", stderr: "", exitCode: 0 };
            if (command === "whoami") return { stdout: `${name} ${env.join(",")} ${stdin}`, stderr: "", exitCode: 0 };
            return undefined;
        });
        docker.addImage("shop:cart", { "/notes.txt": "milk" });

        const session = await docker.openShellSession("shop:cart", "example-shell", ["TOKEN"]);

        expect(session.workdir).toBe("/workspace");
        expect(await session.run("cat /notes.txt")).toEqual({ stdout: "milk", stderr: "", exitCode: 0 });
        expect(await session.run("whoami", "typed")).toEqual({ stdout: "example-shell TOKEN typed", stderr: "", exitCode: 0 });
        // No handler answers it: an empty success.
        expect(await session.run("ls")).toEqual({ stdout: "", stderr: "", exitCode: 0 });
        expect(docker.shells).toEqual([
            {
                image: "shop:cart",
                name: "example-shell",
                env: ["TOKEN"],
                commands: [{ command: "cat /notes.txt", stdin: "" }, { command: "whoami", stdin: "typed" }, { command: "ls", stdin: "" }],
                closed: false,
            },
        ]);
    });

    test("With no handler, every command is an empty success", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart");

        const session = await docker.openShellSession("shop:cart", "example-shell");

        expect(await session.run("ls")).toEqual({ stdout: "", stderr: "", exitCode: 0 });
    });

    test("A closed session throws for the next command", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart");
        const session = await docker.openShellSession("shop:cart", "example-shell");

        await session.close();

        expect(session.run("ls")).rejects.toBeInstanceOf(DockerContainerError);
        expect(docker.shells[0]?.closed).toBe(true);
    });

    test("An image this daemon doesn't have can't be opened", async () => {
        const docker = new FakeDocker(new FakeClock());

        expect(docker.openShellSession("shop:cart", "example-shell")).rejects.toBeInstanceOf(DockerContainerError);
    });
});

describe("FakeDocker, detached containers", () => {
    test("A detached container runs until it is stopped, and its logs can be followed", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart");

        await docker.startDetached("shop:cart", "example-server", ["--network", "none"]);
        docker.log("example-server", "listening", "served one");
        const lines: string[] = [];
        const followed = docker.followLogs("example-server", (line) => lines.push(line));

        expect(await docker.containerState("example-server")).toEqual({ running: true, exitCode: 0 });
        expect(await docker.stderrTail("example-server", 1)).toBe("served one");
        await docker.stop("example-server", 10);
        expect(await followed).toBe(0);
        expect(lines).toEqual(["listening", "served one"]);
        expect(await docker.containerState("example-server")).toEqual({ running: false, exitCode: 0 });
    });

    test("Starting one from an image only the registry has pulls it; from one nowhere throws a DockerPullError", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.registry.add("registry.example/shop:cart");

        await docker.startDetached("registry.example/shop:cart", "example-server", []);

        expect(docker.images()).toEqual(["registry.example/shop:cart"]);
        expect(docker.startDetached("registry.example/shop:door", "example-other", [])).rejects.toBeInstanceOf(DockerPullError);
    });
});

describe("FakeDocker, what it was asked", () => {
    test("Every call is logged, in order, so a test can tell which of two Dockers each went to", async () => {
        const clock = new FakeClock();
        const laptop = new FakeDocker(clock);
        const server = new FakeDocker(clock, laptop.registry);

        await laptop.inRegistry("registry.example/shop:cart");
        await server.build("/tmp/context", "shop:cart", {});
        await server.push("shop:cart", "registry.example/shop:cart");
        await server.run("shop:cart", "example-container", "true");
        expect(await server.diskUsage()).toEqual([]);

        expect(laptop.calls).toEqual([{ method: "inRegistry", args: ["registry.example/shop:cart"] }]);
        expect(server.calls).toEqual([
            { method: "build", args: ["/tmp/context", "shop:cart", {}] },
            { method: "push", args: ["shop:cart", "registry.example/shop:cart"] },
            { method: "run", args: ["shop:cart", "example-container", "true", {}] },
            { method: "diskUsage", args: [] },
        ]);
        expect(server.called("push")).toEqual([["shop:cart", "registry.example/shop:cart"]]);
    });

    test("failOn makes every call of one method throw the error given, until it is cleared", async () => {
        const docker = new FakeDocker(new FakeClock());
        docker.addImage("shop:cart");
        await docker.run("shop:cart", "example-container", "true");
        docker.failOn("commit", new DockerContainerError("the daemon went away"));

        expect(docker.commit("example-container", "shop:after", "shop:cart")).rejects.toThrow("the daemon went away");
        expect(docker.called("commit")).toHaveLength(1);

        docker.failOn("commit", undefined);
        await docker.commit("example-container", "shop:after", "shop:cart");
        expect(docker.images()).toEqual(["shop:cart", "shop:after"]);
    });
});
