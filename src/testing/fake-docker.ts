#!/usr/bin/env bun
// A stand-in for the `docker` CLI — spec/120-test-boundaries.md#2-cli-with-recording-adapters.
// Point THUNDERJAR_DOCKER at this file and Thunderjar runs it in place of `docker`: nothing
// reaches a real daemon, and each command it would have run is recorded.
//
// Its state is a directory, FAKE_DOCKER_DIR, which a test reads and writes:
//
//   commands      appended to: one line per command, `docker <args…>`
//   images        the image refs that exist, one per line; `build` adds its tag
//   postruns      `<image ref>\t<dir>` per line: the saved files of a postrun image, laid out
//                 as a kept run is, `<dir>/workspace/` and maybe `<dir>/thunderjar/result.json`
//   containers    `<name>\t<image ref>` per line: `create` adds one, `rm --force` removes it
//   unreachable   if present, the daemon can't be reached
//   fail-build    if present, every build fails
//
// Without FAKE_DOCKER_DIR the daemon is reachable, no image exists, and nothing is recorded.
//
// A container's files are only ever its image's saved files, which `cp` copies out: it never
// runs, so no agent or command runs in it, and nothing is committed.

import { appendFileSync, cpSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
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
  const lines = (name: string) => (has(name) ? readFileSync(join(dir!, name), "utf8").split("\n").filter(Boolean) : []);
  const images = () => lines("images");
  /** The rows of a tab-separated state file, keyed by their first column. */
  const table = (name: string) => new Map(lines(name).map((line) => line.split("\t") as [string, string]));
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
  } else if (command === "create" && rest[0] === "--name") {
    // docker create --name <name> --entrypoint sh <ref>
    const name = rest[1]!;
    const ref = rest.at(-1)!;
    if (!table("postruns").has(ref)) fail(`Error: No such image: ${ref} (fake docker: no saved postrun files for it)`);
    if (table("containers").has(name)) fail(`Error response from daemon: Conflict. The container name "/${name}" is already in use`);
    appendFileSync(join(dir!, "containers"), `${name}\t${ref}\n`);
  } else if (command === "cp" && rest.length === 2 && rest[0]!.includes(":")) {
    // docker cp <name>:<path> <dest>, where <path> ending in /. copies a folder's contents.
    const [source, dest] = rest as [string, string];
    const name = source.slice(0, source.indexOf(":"));
    const path = source.slice(source.indexOf(":") + 1);
    const ref = table("containers").get(name) ?? fail(`Error response from daemon: No such container: ${name}`);
    const from = join(table("postruns").get(ref)!, path);
    if (!existsSync(from)) fail(`Error response from daemon: Could not find the file ${path} in container ${name}`);
    const into = existsSync(dest) && statSync(dest).isDirectory() && !path.endsWith("/.") ? join(dest, basename(from)) : dest;
    cpSync(from, into, { recursive: true, verbatimSymlinks: true });
  } else if (command === "rm" && rest[0] === "--force") {
    // docker rm --force <name>, which succeeds even if there's no such container.
    const name = rest[1]!;
    const containers = [...table("containers")].filter(([other]) => other !== name);
    if (dir) writeFileSync(join(dir, "containers"), containers.map((row) => `${row.join("\t")}\n`).join(""));
  } else {
    fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
  }
}
