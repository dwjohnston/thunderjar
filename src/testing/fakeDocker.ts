#!/usr/bin/env bun
// A stand-in for the `docker` CLI. Set THUNDERJAR_DOCKER to this file and Thunderjar runs it in
// place of `docker`: nothing reaches a real daemon, and each command is recorded.
//
// Its state is a folder, FAKE_DOCKER_DIR, which a test writes and reads:
//
//   images        the images that exist, `<repository>:<tag>`, one per line; a build or commit adds one
//   unreachable   if present, the daemon can't be reached
//   failing       the images whose build or commit fails, one per line
//   commands      appended to: one line per command, `docker <args…>`, a newline in an argument as `\n`
//   contexts/     a copy of each build's context, by image, e.g. contexts/thunderjar-prerun:45bcf0be/
//   containers/   each container not yet removed, by name, e.g. containers/<name>/:
//     image         the image it was run from
//     root/         its files: only what its script wrote to /workspace and /thunderjar
//
// `run` runs the container's script on the host, with /workspace and /thunderjar in it mapped to
// the container's root/, and root/workspace its working directory. It starts empty: nothing of
// the image is in it. So a fake harness's `cli` really runs, and its result file is really read.
//
// Without FAKE_DOCKER_DIR the daemon is reachable, no image exists, nothing is recorded, and no
// container can run. Tests make its state with `fakeDocker()`.

import { $, Glob } from "bun";
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
  /** The images that exist. */
  images: () => Promise<string[]>;
  /** The names of the containers not yet removed. */
  containers: () => Promise<string[]>;
  /** Deletes its state. */
  remove: () => Promise<void>;
};

const lines = (values: string[]) => values.map((value) => `${value}\n`).join("");

/**
 * State for the fake, in which `images` exist, building or committing the `failing` images
 * fails, or the daemon is `unreachable`. Remove it when done, or declare it with `await using`.
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
  const listOf = async (file: string) => (await Bun.file(file).text()).split("\n").filter(Boolean);
  const remove = async () => {
    await $`rm -rf ${dir}`.quiet();
  };
  return {
    env: { THUNDERJAR_DOCKER: FAKE_DOCKER, FAKE_DOCKER_DIR: dir },
    commands: async () => ((await commandsFile.exists()) ? (await commandsFile.text()).split("\n").filter(Boolean) : []),
    contextOf: (image) => `${dir}/contexts/${image}`,
    images: () => listOf(`${dir}/images`),
    containers: async () =>
      (await Bun.file(`${dir}/containers`).exists())
        ? (await Array.fromAsync(new Glob("*/image").scan({ cwd: `${dir}/containers` }))).map((file) => file.slice(0, -"/image".length)).sort()
        : [],
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
    await Bun.write(commands, `${before}docker ${args.join(" ").replaceAll("\n", "\\n")}\n`);
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
  } else if (command === "run" && subcommand === "--name" && rest.length === 8) {
    // docker run --name <name> --pull never --entrypoint sh <image> -c <script>
    const [name, , , , , image, , script] = rest as [string, string, string, string, string, string, string, string];
    if (!dir) fail("fake docker: running a container needs FAKE_DOCKER_DIR");
    if (!(await list("images")).includes(image)) fail(`docker: Error response from daemon: No such image: ${image}`);
    const container = `${dir}/containers/${name}`;
    if (await state(`containers/${name}/image`).exists()) fail(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use.`);
    await Bun.write(`${container}/image`, `${image}\n`);
    await $`mkdir -p ${container}/root/workspace ${container}/root/thunderjar`.quiet();
    const mapped = script.replace(/\/(workspace|thunderjar)\b/g, (_, folder: string) => `${container}/root/${folder}`);
    const result = await $`sh -c ${mapped}`.cwd(`${container}/root/workspace`).quiet().nothrow();
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.exitCode);
  } else if (command === "cp" && rest.length === 1) {
    // docker cp <name>:<path> <destination>
    const [source, destination] = [subcommand as string, rest[0] as string];
    const [name, path] = [source.slice(0, source.indexOf(":")), source.slice(source.indexOf(":") + 1)];
    if (!dir || !(await state(`containers/${name}/image`).exists())) fail(`Error response from daemon: No such container: ${name}`);
    const file = state(`containers/${name}/root${path}`);
    if (!(await file.exists())) fail(`Error response from daemon: Could not find the file ${path} in container ${name}`);
    await Bun.write(destination, file);
  } else if (command === "image" && subcommand === "inspect" && rest[0] === "--format" && rest.length === 3) {
    // docker image inspect --format <format> <image>
    if (!(await list("images")).includes(rest[2] as string)) fail(`Error: No such image: ${rest[2]}`);
    console.log("null\tnull");
  } else if (command === "commit" && rest.length >= 2) {
    // docker commit [--change <change>]… <name> <image>
    const [name, image] = args.slice(-2) as [string, string];
    if (!dir || !(await state(`containers/${name}/image`).exists())) fail(`Error response from daemon: No such container: ${name}`);
    if ((await list("failing")).includes(image)) fail(`Error response from daemon: failed to commit ${name} as ${image}`);
    await Bun.write(state("images"), lines([...(await list("images")), image]));
  } else if (command === "rm" && subcommand === "--force" && rest.length === 1) {
    // docker rm --force <name>
    if (dir) await $`rm -rf ${dir}/containers/${rest[0] as string}`.quiet();
  } else {
    fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
  }
}
