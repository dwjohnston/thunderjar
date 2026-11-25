/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { FakeClock } from "../Clock/FakeClock";
import { DockerLoginError, DockerPullError, DockerPushError } from "./errors";
import { FakeDocker } from "./FakeDocker";
import { FakeRegistry } from "./FakeRegistry";

describe(FakeRegistry, () => {
  test("It holds what was added, in the order it was added, with its files", () => {
    const registry = new FakeRegistry();

    registry.add("registry.example/shop:cart", { "/notes.txt": "milk" });
    registry.add("registry.example/shop:till");

    expect(registry.references()).toEqual(["registry.example/shop:cart", "registry.example/shop:till"]);
    expect(registry.has("registry.example/shop:cart")).toBe(true);
    expect(registry.has("registry.example/shop:door")).toBe(false);
    expect(registry.files("registry.example/shop:cart")).toEqual({ "/notes.txt": "milk" });
    expect(registry.files("registry.example/shop:door")).toBeUndefined();
  });

  test("A removed reference is gone", () => {
    const registry = new FakeRegistry();
    registry.add("registry.example/shop:cart");

    registry.remove("registry.example/shop:cart");

    expect(registry.has("registry.example/shop:cart")).toBe(false);
  });

  test("What one Docker pushes, another over the same registry can see and pull, with its files", async () => {
    const registry = new FakeRegistry();
    const laptop = new FakeDocker(new FakeClock(), registry);
    const server = new FakeDocker(new FakeClock(), registry);
    server.addImage("shop:cart", { "/notes.txt": "milk" });

    await server.push("shop:cart", "registry.example/shop:cart");

    expect(await laptop.inRegistry("registry.example/shop:cart")).toBe(true);
    expect(laptop.images()).toEqual([]);
    await laptop.pull("registry.example/shop:cart");
    expect(laptop.images()).toEqual(["registry.example/shop:cart"]);
    expect(laptop.imageFiles("registry.example/shop:cart")).toEqual({ "/notes.txt": "milk" });
    // Pushing tags the reference on the daemon that pushed, as `docker tag` does.
    expect(server.images()).toEqual(["shop:cart", "registry.example/shop:cart"]);
  });

  test("Two Dockers with no registry given don't share one", async () => {
    const one = new FakeDocker(new FakeClock());
    const other = new FakeDocker(new FakeClock());
    one.addImage("shop:cart");

    await one.push("shop:cart", "registry.example/shop:cart");

    expect(await other.inRegistry("registry.example/shop:cart")).toBe(false);
    expect(one.registry.references()).toEqual(["registry.example/shop:cart"]);
  });

  test("Pushing an image the daemon doesn't have throws a DockerPushError, and adds nothing", async () => {
    const docker = new FakeDocker(new FakeClock());

    const pushed = docker.push("shop:cart", "registry.example/shop:cart");

    expect(pushed).rejects.toBeInstanceOf(DockerPushError);
    expect(await pushed.catch((error) => error.reference)).toBe("registry.example/shop:cart");
    expect(docker.registry.references()).toEqual([]);
  });

  test("failPush makes pushing to that reference throw, with its message", async () => {
    const docker = new FakeDocker(new FakeClock());
    docker.addImage("shop:cart");
    docker.failPush("registry.example/shop:cart", "denied: no write access");

    const error = await docker.push("shop:cart", "registry.example/shop:cart").catch((caught) => caught);

    expect(error).toBeInstanceOf(DockerPushError);
    expect(error.message).toBe("denied: no write access");
    expect(docker.registry.references()).toEqual([]);
    await docker.push("shop:cart", "registry.example/shop:other");
    expect(docker.registry.references()).toEqual(["registry.example/shop:other"]);
  });

  test("Pulling what the registry doesn't have throws a DockerPullError", async () => {
    const docker = new FakeDocker(new FakeClock());

    const error = await docker.pull("registry.example/shop:cart").catch((caught) => caught);

    expect(error).toBeInstanceOf(DockerPullError);
    expect(error.reference).toBe("registry.example/shop:cart");
    expect(docker.images()).toEqual([]);
  });

  test("A push takes as long as it was told to, on the clock", async () => {
    const clock = new FakeClock();
    const docker = new FakeDocker(clock).takes("push", 4_000);
    docker.addImage("shop:cart");

    const pushed = docker.push("shop:cart", "registry.example/shop:cart");

    await clock.advance(3_999);
    expect(docker.registry.references()).toEqual([]);
    await clock.advance(1);
    await pushed;
    expect(docker.registry.references()).toEqual(["registry.example/shop:cart"]);
  });

  test("The login check passes until the host is logged out, and again after logging in", async () => {
    const docker = new FakeDocker(new FakeClock());

    await docker.checkLogin("registry.example");
    docker.logOut("registry.example");

    expect(docker.checkLogin("registry.example")).rejects.toBeInstanceOf(DockerLoginError);
    await docker.checkLogin("other.example");
    await docker.login("registry.example", "sam", "password");
    await docker.checkLogin("registry.example");
  });
});
