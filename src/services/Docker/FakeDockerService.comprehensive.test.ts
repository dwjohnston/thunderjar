/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock.ts";
import { FakeDockerService } from "./FakeDockerService.ts";

describe(FakeDockerService, () => {
  test("a build adds the image, and a push puts it in the registry the host sees too", async () => {
    const registry = new Set<string>();
    const host = new FakeDockerService(new FakeClock(), registry);
    const runtime = new FakeDockerService(new FakeClock(), registry);

    await runtime.build("/context", "thunderjar-prerun:abc");
    await runtime.push("thunderjar-prerun:abc", "ghcr.io/acme/images:prerun-habc");

    expect(await runtime.imagesIn("thunderjar-prerun")).toEqual(new Set(["thunderjar-prerun:abc"]));
    expect(await host.inRegistry("ghcr.io/acme/images:prerun-habc")).toBe(true);
    expect(await host.imagesIn("thunderjar-prerun")).toEqual(new Set());
    expect(runtime.calls).toEqual(["build thunderjar-prerun:abc", "push thunderjar-prerun:abc ghcr.io/acme/images:prerun-habc", "imagesIn thunderjar-prerun"]);
  });

  test("a container run exits at once by default, leaving how it ran", async () => {
    const docker = new FakeDockerService(new FakeClock());

    expect(await docker.run("image", "container-1", "script")).toEqual({ outcome: "exited" });
    expect(JSON.parse((await docker.readFile("container-1", "/thunderjar/run.json")) as string)).toMatchObject({ exitCode: 0 });
  });

  test("a scripted run stops as its script says, and leaves the files it gives", async () => {
    const docker = new FakeDockerService(new FakeClock()).onRun("-1", () => ({ stop: { outcome: "timedOut", killedAt: 5 }, files: { "/a": "left" } }));

    expect(await docker.run("image", "container-1", "script")).toEqual({ outcome: "timedOut", killedAt: 5 });
    expect(await docker.readFile("container-1", "/a")).toBe("left");
    expect(await docker.readFile("container-1", "/b")).toBeUndefined();
  });

  test("failNext makes the next call of a method throw, once", async () => {
    const docker = new FakeDockerService(new FakeClock()).failNext("commit", new Error("no space"));

    expect(docker.commit("container", "image")).rejects.toThrow("no space");
    await docker.commit("container", "image");
    expect(docker.images.has("image")).toBe(true);
  });
});
