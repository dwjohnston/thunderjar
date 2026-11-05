#!/usr/bin/env bun
// A stand-in for the `docker` CLI. Set THUNDERJAR_DOCKER to this file and Thunderjar runs it in
// place of `docker`: nothing reaches a real daemon, and each command is recorded.
//
// Its state is a folder, FAKE_DOCKER_DIR, which a test writes and reads:
//
//   images        the images that exist, `<repository>:<tag>`, one per line; a build adds one
//   unreachable   if present, the daemon can't be reached
//   failing       the images whose build fails, one per line
//   commands      appended to: one line per command, `docker <args…>`
//   contexts/     a copy of each build's context, by image, e.g. contexts/thunderjar-prerun:45bcf0be/
//
// Without FAKE_DOCKER_DIR the daemon is reachable, no image exists, and nothing is recorded.
// Tests make its state with `fakeDocker()`.

import { $ } from "bun";
import { FIXTURES_DIR } from "./scenario.ts";

/** This file's path: set THUNDERJAR_DOCKER to it. */
export const FAKE_DOCKER = import.meta.path;

export type FakeDocker = AsyncDisposable & {
  /** Pass to `thunderjar(cwd, args, { env })`. */
  env: Record<string, string>;
  /** The commands the fake was given, so far, each `docker <args…>`. */
  commands: () => Promise<string[]>;
  /** Where the copy of the build context of `image` is, once it has been built. */
  contextOf: (image: string) => string;
  /** Deletes its state. */
  remove: () => Promise<void>;
};

const lines = (values: string[]) => values.map((value) => `${value}\n`).join("");

/**
 * State for the fake, in which `images` exist, building the `failing` images fails, or the
 * daemon is `unreachable`. Remove it when done, or declare it with `await using`.
 */
export async function fakeDocker({
  images = [],
  failing = [],
  unreachable = false,
}: { images?: string[]; failing?: string[]; unreachable?: boolean } = {}): Promise<FakeDocker> {
  const dir = `${FIXTURES_DIR}/.tmp/docker-${crypto.randomUUID()}`;
  await Bun.write(`${dir}/images`, lines(images));
  await Bun.write(`${dir}/failing`, lines(failing));
  if (unreachable) await Bun.write(`${dir}/unreachable`, "");
  const commandsFile = Bun.file(`${dir}/commands`);
  const remove = async () => {
    await $`rm -rf ${dir}`.quiet();
  };
  return {
    env: { THUNDERJAR_DOCKER: FAKE_DOCKER, FAKE_DOCKER_DIR: dir },
    commands: async () => ((await commandsFile.exists()) ? (await commandsFile.text()).split("\n").filter(Boolean) : []),
    contextOf: (image) => `${dir}/contexts/${image}`,
    remove,
    [Symbol.asyncDispose]: remove,
  };
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const dir = Bun.env.FAKE_DOCKER_DIR;
  const state = (name: string) => Bun.file(`${dir}/${name}`);
  const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
  };

  if (dir) {
    const commands = state("commands");
    const before = (await commands.exists()) ? await commands.text() : "";
    await Bun.write(commands, `${before}docker ${args.join(" ")}\n`);
  }
  if (dir && (await state("unreachable").exists())) {
    fail("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?");
  }

  const list = async (name: string) => (dir && (await state(name).exists()) ? (await state(name).text()).split("\n").filter(Boolean) : []);

  const [command, subcommand, ...rest] = args;
  if (command === "image" && subcommand === "ls" && rest[0] === "--format" && rest.length === 3) {
    // docker image ls --format {{.Repository}}:{{.Tag}} <repository>
    const repository = rest[2] as string;
    for (const image of await list("images")) {
      if (image.slice(0, image.lastIndexOf(":")) === repository) console.log(image);
    }
  } else if (command === "build" && subcommand === "-t" && rest.length === 2) {
    // docker build -t <image> <context>
    const [image, context] = rest as [string, string];
    if (!(await Bun.file(`${context}/Dockerfile`).exists())) fail(`fake docker: no Dockerfile in the build context ${context}`);
    if ((await list("failing")).includes(image)) {
      fail(`ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1`);
    }
    if (dir) {
      await $`mkdir -p ${dir}/contexts/${image} && cp -R ${context}/. ${dir}/contexts/${image}`.quiet();
      await Bun.write(state("images"), lines([...(await list("images")), image]));
    }
  } else {
    fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
  }
}
