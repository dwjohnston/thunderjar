/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// The fake's containers, on the fake clock: what the timeline tests of `run` rest on.
import { describe, expect, test } from "bun:test";
import { DockerContainerError } from "../docker/docker.ts";
import { LIST_FILES } from "../execution/measurementContext.ts";
import { RESULT_PATH, RUN_PATH, STDERR_PATH, timedRun } from "../execution/runScript.ts";
import { FakeClock } from "./fakeClock.ts";
import { FakeDockerService } from "./fakeDockerService.ts";

const T0 = 1_767_225_600_000;
const IMAGE = "thunderjar-prerun:aaaaaaaa";
const spec = (name = "c1") => ({ image: IMAGE, name, script: timedRun() });

describe("a container running timedRun()", () => {
  test("says it started, runs its agent on the clock, and writes RUN_PATH and STDERR_PATH as the script does", async () => {
    const clock = new FakeClock(T0);
    const docker = new FakeDockerService({ clock, images: [IMAGE] });
    docker.onExec(IMAGE, async ({ clock, files, stderr }) => {
      await clock.sleep(1_500);
      files.set("/workspace/isPrime.ts", "export {};\n");
      stderr("warning: a thing");
      return { exitCode: 3 };
    });

    const running = docker.run(spec());
    await running.started;
    const atStart = await docker.readFile("c1", RUN_PATH);
    await clock.advance(1_500);

    expect(await running.exited).toEqual({ exitCode: 0, stderr: "", reason: "" });
    expect(atStart).toBe(`{"startedAt":${T0}}\n`);
    expect(await docker.readFile("c1", RUN_PATH)).toBe(`{"startedAt":${T0},"finishedAt":${T0 + 1_500},"exitCode":3}\n`);
    expect(await docker.readFile("c1", STDERR_PATH)).toBe("warning: a thing\n");
    expect(await docker.readFile("c1", "/workspace/isPrime.ts")).toBe("export {};\n");
    expect(docker.containers()).toEqual(["c1"]);
  });

  test("removes any result file before its agent runs, and runs an agent that exits 0 at once by default", async () => {
    const clock = new FakeClock(T0);
    const docker = new FakeDockerService({ clock, images: [IMAGE] });
    const first = docker.run(spec("c1"));
    await first.exited;
    await docker.commit("c1", "with-result");
    docker.onExec("with-result", () => {});

    const second = docker.run({ ...spec("c2"), image: "with-result" });

    expect(await second.exited).toEqual({ exitCode: 0, stderr: "", reason: "" });
    expect(await docker.readFile("c2", RESULT_PATH)).toBeUndefined();
    expect(await docker.readFile("c2", RUN_PATH)).toBe(`{"startedAt":${T0},"finishedAt":${T0},"exitCode":0}\n`);
  });

  test("starts as late as onStart says", async () => {
    const clock = new FakeClock(T0);
    const docker = new FakeDockerService({ clock, images: [IMAGE] });
    docker.onStart(IMAGE, ({ clock }) => clock.sleep(3_000));
    let startedAt: number | undefined;

    void docker.run(spec()).started.then(() => (startedAt = clock.now()));
    await clock.advance(2_999);
    const before = startedAt;
    await clock.advance(1);

    expect({ before, startedAt }).toEqual({ before: undefined, startedAt: T0 + 3_000 });
  });

  test("killed, its agent is aborted, it exits 137, and RUN_PATH says only when it started", async () => {
    const clock = new FakeClock(T0);
    const docker = new FakeDockerService({ clock, images: [IMAGE] });
    docker.onExec(IMAGE, ({ clock, signal }) => clock.sleep(Infinity, { signal }));
    const running = docker.run(spec());
    await running.started;

    await docker.kill("c1");

    expect(await running.exited).toEqual({ exitCode: 137, stderr: "", reason: "" });
    expect(docker.killed).toEqual(["c1"]);
    expect(await docker.readFile("c1", RUN_PATH)).toBe(`{"startedAt":${T0}}\n`);
    await expect(docker.kill("c1")).rejects.toThrow("is not running");
    await expect(docker.kill("c2")).rejects.toThrow("No such container: c2");
  });

  test("removed while starting, its agent never runs", async () => {
    const clock = new FakeClock(T0);
    const docker = new FakeDockerService({ clock, images: [IMAGE] });
    docker.onStart(IMAGE, ({ clock }) => clock.sleep(3_000));
    let ran = false;
    docker.onExec(IMAGE, () => void (ran = true));
    const running = docker.run(spec());

    await docker.removeContainer("c1");
    await clock.advance(3_000);

    expect(await running.exited).toEqual({ exitCode: 137, stderr: "", reason: "" });
    expect({ ran, containers: docker.containers(), killed: docker.killed }).toEqual({ ran: false, containers: [], killed: [] });
  });
});

describe("what isn't a container that runs", () => {
  test("no such image, or a name in use, exits 125 as docker run does; any script but timedRun() fails loudly", async () => {
    const docker = new FakeDockerService({ clock: new FakeClock(T0), images: [IMAGE] });
    docker.onExec(IMAGE, ({ clock, signal }) => clock.sleep(Infinity, { signal }));
    docker.run(spec());

    expect((await docker.run({ ...spec("c2"), image: "nope" }).exited).exitCode).toBe(125);
    expect((await docker.run(spec("c1")).exited).reason).toContain('The container name "/c1" is already in use');
    await expect(docker.run({ ...spec("c3"), script: "echo hi" }).exited).rejects.toThrow("fake docker: no behaviour for this script");
  });

  test("a file of a container that doesn't exist is a DockerContainerError", async () => {
    const docker = new FakeDockerService({ clock: new FakeClock(T0) });

    await expect(docker.readFile("c1", RUN_PATH)).rejects.toBeInstanceOf(DockerContainerError);
  });
});

describe("a shell session, for measurements", () => {
  test("lists the files under /workspace of the image it's from, as LIST_FILES does, and is removed once closed", async () => {
    const clock = new FakeClock(T0);
    const docker = new FakeDockerService({ clock, images: [IMAGE] });
    docker.onExec(IMAGE, ({ files }) => {
      files.set("/workspace/src/b.ts", "");
      files.set("/workspace/a.ts", "");
      files.set("/thunderjar/notes.txt", "");
    });
    await docker.run(spec()).exited;
    await docker.commit("c1", "thunderjar-postrun:1-1");
    await docker.removeContainer("c1");

    const session = await docker.openShellSession("thunderjar-postrun:1-1", "m1");
    const listed = await session.run(LIST_FILES);
    const other = await session.run("cat a.ts");
    const open = docker.containers();
    await session.close();

    expect(session.workdir).toBe("/workspace");
    expect(listed).toEqual({ exitCode: 0, stdout: "./a.ts\n./src/b.ts\n", stderr: "" });
    expect(other.exitCode).toBe(127);
    expect({ open, closed: docker.containers() }).toEqual({ open: ["m1"], closed: [] });
  });

  test("removeContainersNamed removes each container whose name starts with the prefix", async () => {
    const docker = new FakeDockerService({ clock: new FakeClock(T0), images: [IMAGE] });
    for (const name of ["run-1-1", "run-2-1", "other"]) await docker.run(spec(name)).exited;

    expect(await docker.removeContainersNamed("run-")).toEqual(["run-1-1", "run-2-1"]);
    expect(docker.containers()).toEqual(["other"]);
  });
});
