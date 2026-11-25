/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// How to use FakeDockerService: script its containers, pass it where a DockerService goes, then
// read its images, its registry and the calls it was given.
import { peek } from "bun";
import { describe, expect, test } from "bun:test";
import { DockerBuildError, DockerContainerError, DockerLoginError, DockerPullError } from "../../docker/docker.ts";
import { FakeClock } from "../Clock/FakeClock.ts";
import { FakeDockerService } from "./FakeDockerService.ts";

describe(FakeDockerService, () => {
  describe("images", () => {
    test("a built image is in the daemon", async () => {
      const docker = new FakeDockerService(new FakeClock());

      await docker.build("/context", "cake:1");

      expect(docker.images.has("cake:1")).toBe(true);
      expect(await docker.imagesIn("cake")).toEqual(new Set(["cake:1"]));
    });

    test("imagesIn lists only the images of that repository", async () => {
      const docker = new FakeDockerService(new FakeClock());
      docker.images.add("cake:1").add("cake:2").add("cakes:1").add("bread:1");

      expect(await docker.imagesIn("cake")).toEqual(new Set(["cake:1", "cake:2"]));
    });

    test("keeps what each build was given", async () => {
      const docker = new FakeDockerService(new FakeClock());

      await docker.build("/context", "cake:1", { ssh: true });

      expect(docker.builds).toEqual([{ contextDir: "/context", image: "cake:1", options: { ssh: true } }]);
    });
  });

  describe("the registry", () => {
    test("a pushed image is in the registry, and tagged in the daemon as its reference", async () => {
      const docker = new FakeDockerService(new FakeClock());

      await docker.push("cake:1", "shop.example.com/cake:1");

      expect(await docker.inRegistry("shop.example.com/cake:1")).toBe(true);
      expect(docker.images.has("shop.example.com/cake:1")).toBe(true);
    });

    test("two daemons given the same registry share it: one pushes, the other pulls", async () => {
      const registry = new Set<string>();
      const kitchen = new FakeDockerService(new FakeClock(), { registry });
      const shop = new FakeDockerService(new FakeClock(), { registry });

      await kitchen.push("cake:1", "shop.example.com/cake:1");
      await shop.pull("shop.example.com/cake:1");

      expect(shop.images).toEqual(new Set(["shop.example.com/cake:1"]));
      expect(kitchen.images.has("cake:1")).toBe(false);
    });

    test("pulling a reference the registry lacks throws a DockerPullError", async () => {
      const docker = new FakeDockerService(new FakeClock());

      await expect(docker.pull("shop.example.com/cake:9")).rejects.toBeInstanceOf(DockerPullError);
    });

    test("checkLogin passes only for a host in `logins`", async () => {
      const docker = new FakeDockerService(new FakeClock());
      docker.logins.add("shop.example.com");

      await docker.checkLogin("shop.example.com");
      await expect(docker.checkLogin("other.example.com")).rejects.toBeInstanceOf(DockerLoginError);
    });
  });

  describe("containers", () => {
    test("a container with no script exits at once, and leaves no files", async () => {
      const docker = new FakeDockerService(new FakeClock());

      expect(await docker.run("cake:1", "oven", "bake")).toEqual({ outcome: "exited" });
      expect(await docker.readFile("oven", "/note.txt")).toBeUndefined();
    });

    test("a scripted container leaves its files, readable until it's removed", async () => {
      const docker = new FakeDockerService(new FakeClock()).on("oven", { files: { "/note.txt": "done" } });

      await docker.run("cake:1", "oven", "bake");
      expect(await docker.readFile("oven", "/note.txt")).toBe("done");

      await docker.removeContainer("oven");
      expect(await docker.readFile("oven", "/note.txt")).toBeUndefined();
    });

    test("a script matches each container whose name ends with its suffix; the longest suffix wins", async () => {
      const docker = new FakeDockerService(new FakeClock())
        .on("", { files: { "/note.txt": "any" } })
        .on("-2", { files: { "/note.txt": "second" } });

      await docker.run("cake:1", "oven-1", "bake");
      await docker.run("cake:1", "oven-2", "bake");

      expect(await docker.readFile("oven-1", "/note.txt")).toBe("any");
      expect(await docker.readFile("oven-2", "/note.txt")).toBe("second");
    });

    test("a container that runs for a while stops only once the clock has moved that far", async () => {
      const clock = new FakeClock();
      const docker = new FakeDockerService(clock).on("oven", { ms: 30_000 });

      const stopped = docker.run("cake:1", "oven", "bake");
      await clock.advance(29_999);
      expect(peek.status(stopped)).toBe("pending");

      await clock.advance(1);
      expect(await stopped).toEqual({ outcome: "exited" });
    });

    test("a script can be a function of what the container was run with", async () => {
      const docker = new FakeDockerService(new FakeClock()).on("oven", (image, options) => ({ files: { "/note.txt": `${image} for ${options.timeoutSeconds}s` } }));

      await docker.run("cake:1", "oven", "bake", { timeoutSeconds: 40 });

      expect(await docker.readFile("oven", "/note.txt")).toBe("cake:1 for 40s");
    });

    test("a container that times out says when it was killed, and still exists", async () => {
      const docker = new FakeDockerService(new FakeClock()).on("oven", { stop: { outcome: "timedOut", killedAt: 5_000 } });

      expect(await docker.run("cake:1", "oven", "bake")).toEqual({ outcome: "timedOut", killedAt: 5_000 });
      expect(docker.containers.has("oven")).toBe(true);
    });

    test("a container that never started doesn't exist", async () => {
      const stop = { outcome: "notStarted", reason: "no gas", spawnedAt: 0, gaveUpAt: 1_000 } as const;
      const docker = new FakeDockerService(new FakeClock()).on("oven", { stop });

      expect(await docker.run("cake:1", "oven", "bake")).toEqual(stop);
      expect(docker.containers.has("oven")).toBe(false);
    });

    test("keeps what each container was run with", async () => {
      const docker = new FakeDockerService(new FakeClock());

      await docker.run("cake:1", "oven", "bake", { env: ["RECIPE"] });

      expect(docker.runs).toEqual([{ image: "cake:1", name: "oven", script: "bake", options: { env: ["RECIPE"] } }]);
    });

    test("committing a container makes an image; one that doesn't exist can't be committed", async () => {
      const docker = new FakeDockerService(new FakeClock());
      await docker.run("cake:1", "oven", "bake");

      await docker.commit("oven", "baked:1", "cake:1");

      expect(docker.images.has("baked:1")).toBe(true);
      await expect(docker.commit("fridge", "chilled:1", "cake:1")).rejects.toBeInstanceOf(DockerContainerError);
    });

    test("removeContainersNamed removes each container with the prefix, and names them", async () => {
      const docker = new FakeDockerService(new FakeClock());
      for (const name of ["oven-1", "oven-2", "fridge"]) await docker.run("cake:1", name, "bake");

      expect(await docker.removeContainersNamed("oven-")).toEqual(["oven-1", "oven-2"]);
      expect([...docker.containers.keys()]).toEqual(["fridge"]);
    });

    test("a shell session is a container until it's closed", async () => {
      const docker = new FakeDockerService(new FakeClock());

      const session = await docker.openShellSession("cake:1", "taster");
      expect(docker.containers.has("taster")).toBe(true);
      expect(await session.run("ls")).toEqual({ stdout: "", stderr: "", exitCode: 0 });

      await session.close();
      expect(docker.containers.has("taster")).toBe(false);
    });
  });

  describe("calls", () => {
    test("records every call, in order, so a test can check which daemon was asked what", async () => {
      const registry = new Set<string>();
      const host = new FakeDockerService(new FakeClock(), { registry });
      const runtime = new FakeDockerService(new FakeClock(), { registry });

      if (!(await host.inRegistry("shop.example.com/cake:1"))) {
        await runtime.build("/context", "cake:1");
        await runtime.push("cake:1", "shop.example.com/cake:1");
      }

      expect(host.calls).toEqual(["inRegistry shop.example.com/cake:1"]);
      expect(runtime.calls).toEqual(["build cake:1", "push cake:1 shop.example.com/cake:1"]);
      expect(runtime.callsOf("push")).toEqual(["cake:1 shop.example.com/cake:1"]);
    });

    test("says the command it was built with", () => {
      expect(new FakeDockerService(new FakeClock()).command).toEqual(["docker"]);
      expect(new FakeDockerService(new FakeClock(), { command: ["docker", "--context", "cloud"] }).command).toEqual(["docker", "--context", "cloud"]);
    });
  });

  describe("failures", () => {
    test("a method set to fail throws the error, and the call is still recorded", async () => {
      const docker = new FakeDockerService(new FakeClock()).fail("build", new DockerBuildError("out of flour"));

      await expect(docker.build("/context", "cake:1")).rejects.toThrow("out of flour");

      expect(docker.calls).toEqual(["build cake:1"]);
      expect(docker.images.size).toBe(0);
    });

    test("with `matching`, only the calls whose arguments include it fail", async () => {
      const docker = new FakeDockerService(new FakeClock()).fail("build", new DockerBuildError("out of flour"), "cake");

      await docker.build("/context", "bread:1");
      await expect(docker.build("/context", "cake:1")).rejects.toBeInstanceOf(DockerBuildError);

      expect(docker.images).toEqual(new Set(["bread:1"]));
    });
  });
});
