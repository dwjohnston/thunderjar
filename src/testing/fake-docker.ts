#!/usr/bin/env bun
// A stand-in for the `docker` CLI — spec/120-test-boundaries.md#2-cli-with-recording-adapters.
// Point THUNDERJAR_DOCKER at this file and Thunderjar runs it in place of `docker`: nothing
// reaches a real daemon, and each command it would have run is recorded.
//
// Its state is a directory, FAKE_DOCKER_DIR, which a test reads and writes:
//
//   commands      appended to: one line per command, `docker <args…>`
//   images        the image refs that exist, one per line; `build` adds its tag
//   unreachable   if present, the daemon can't be reached
//   fail-build    if present, every build fails
//
// Without FAKE_DOCKER_DIR the daemon is reachable, no image exists, and nothing is recorded.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Docker } from "../adapters/docker/docker.ts";

/** This file's path: set THUNDERJAR_DOCKER to it. */
export const FAKE_DOCKER = import.meta.path;

/**
 * The same, in-process, for tests that call a command directly: `images` exist, builds add
 * theirs. It runs no containers: a test of `run` gives it a host runner.
 */
export function memoryDocker(images: string[] = []): Docker & { builds: string[] } {
  const builds: string[] = [];
  const noContainers = () => Promise.reject(new Error("memoryDocker runs no containers"));
  return {
    builds,
    unreachable: async () => undefined,
    imageExists: async (ref) => images.includes(ref) || builds.includes(ref),
    async build(_contextDir, ref) {
      builds.push(ref);
    },
    run: noContainers,
    commit: noContainers,
    create: noContainers,
    copyFrom: noContainers,
    removeContainer: noContainers,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dir = process.env.FAKE_DOCKER_DIR;
  const has = (name: string) => dir !== undefined && existsSync(join(dir, name));
  const images = () => (has("images") ? readFileSync(join(dir!, "images"), "utf8").split("\n").filter(Boolean) : []);
  const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
  };

  if (dir) appendFileSync(join(dir, "commands"), `docker ${args.join(" ")}\n`);

  const [command, ...rest] = args;
  if (command === "version") {
    if (has("unreachable")) fail("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?");
    console.log("0.0.0-fake");
  } else if (command === "image" && rest[0] === "inspect") {
    const ref = rest.at(-1)!;
    if (!images().includes(ref)) fail(`Error: No such image: ${ref}`);
    console.log("sha256:fake");
  } else if (command === "build") {
    const ref = rest[rest.indexOf("--tag") + 1]!;
    const context = rest.at(-1)!;
    if (!existsSync(join(context, "Dockerfile"))) fail(`fake docker: no Dockerfile in ${context}`);
    if (has("fail-build")) fail("fake docker: the build failed");
    if (dir) appendFileSync(join(dir, "images"), `${ref}\n`);
  } else {
    fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
  }
}
