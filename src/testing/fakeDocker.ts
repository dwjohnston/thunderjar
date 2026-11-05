#!/usr/bin/env bun
// A stand-in for the `docker` CLI. Set THUNDERJAR_DOCKER to this file and Thunderjar runs it in
// place of `docker`: nothing reaches a real daemon, and each command is recorded.
//
// Its state is a folder, FAKE_DOCKER_DIR, which a test writes and reads:
//
//   images        the images that exist, `<repository>:<tag>`, one per line; a build or commit adds one
//   unreachable   if present, the daemon can't be reached
//   failing       the images whose build or commit fails, and the references whose push fails, one per line
//   logins        the registry hosts Docker holds a valid login for, one per line
//   pushed        appended to: each reference pushed, one per line
//   commands      appended to: one line per command, `docker <args…>`, a newline in an argument as `\n`
//   contexts/     a copy of each build's context, by image, e.g. contexts/thunderjar-prerun:f64ca35b/
//   containers/   each container not yet removed, by name, e.g. containers/<name>/:
//     image         the image it was run from
//     root/         its files: only what was written to /workspace and /thunderjar
//   filesystems/  the root/ of each committed container, by image (URI-encoded)
//
// `run` runs the container's script on the host, with /workspace and /thunderjar in it mapped to
// the container's root/, and root/workspace its working directory. Its environment is only the
// variables passed with `-e NAME`, from the fake's own, beside PATH and HOME, as a container sees
// only what it's given. While it runs, `kill` stops it, and everything it started, as if the
// container had been killed. A built image's container
// starts empty: nothing of the image is in it. A committed image's starts with the files of the
// container it was committed from. So a fake harness's `cli` really runs, its result file is
// really read, and what it left is in its postrun image. `run --detach` starts a container
// without running its script, and `exec` runs a command in it the way `run` runs a script,
// always in root/workspace. `login <host>` succeeds only for a host in logins/, failing as Docker
// does with its input closed. `tag` adds an image; `push` records it, if its host is logged in.
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
  /** The references pushed, in order. */
  pushed: () => Promise<string[]>;
  /** The names of the containers not yet removed. */
  containers: () => Promise<string[]>;
  /** The text of the file at `path`, from the container's root, in the committed image `image`, or undefined if there's none. */
  fileIn: (image: string, path: string) => Promise<string | undefined>;
  /** Deletes its state. */
  remove: () => Promise<void>;
};

const lines = (values: string[]) => values.map((value) => `${value}\n`).join("");

/**
 * State for the fake, in which `images` exist, building or committing the `failing` images, or
 * pushing the `failing` references, fails, Docker is logged in to the registry hosts `loggedIn`,
 * or the daemon is `unreachable`. Remove it when done, or declare it with `await using`.
 */
export async function fakeDocker({
  images = [],
  failing = [],
  loggedIn = [],
  unreachable = false,
}: { images?: string[]; failing?: string[]; loggedIn?: string[]; unreachable?: boolean } = {}): Promise<FakeDocker> {
  const dir = `${FIXTURES_DIR}/.tmp/docker-${crypto.randomUUID()}`;
  await Bun.write(`${dir}/images`, lines(images));
  await Bun.write(`${dir}/failing`, lines(failing));
  await Bun.write(`${dir}/logins`, lines(loggedIn));
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
    pushed: async () => ((await Bun.file(`${dir}/pushed`).exists()) ? listOf(`${dir}/pushed`) : []),
    containers: async () =>
      (await Bun.file(`${dir}/containers`).exists())
        ? (await Array.fromAsync(new Glob("*/image").scan({ cwd: `${dir}/containers` }))).map((file) => file.slice(0, -"/image".length)).sort()
        : [],
    fileIn: async (image, path) => {
      const file = Bun.file(`${dir}/filesystems/${encodeURIComponent(image)}${path}`);
      return (await file.exists()) ? file.text() : undefined;
    },
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

  const filesystemOf = (image: string) => `${dir}/filesystems/${encodeURIComponent(image)}`;

  /**
   * Runs `program` on the host as if in `container`, its /workspace and /thunderjar mapped to the
   * container's root/, in root/workspace.
   */
  const inContainer = (container: string, program: string[], stdin?: string, env?: Record<string, string>) => {
    const mapped = program.map((arg) => arg.replace(/\/(workspace|thunderjar)\b/g, (_, folder: string) => `${container}/root/${folder}`));
    const shell = $`${mapped} < ${new Response(stdin ?? "")}`.cwd(`${container}/root/workspace`).quiet().nothrow();
    return env ? shell.env(env) : shell;
  };

  /**
   * `docker run [--detach] --name <name> --pull never [-e <NAME>]… [<option>]… --entrypoint sh <image> -c <script>`,
   * parsed. Other options are recorded in `commands`, and otherwise ignored.
   */
  const parseRun = (runArgs: string[]) => {
    const detach = runArgs[0] === "--detach";
    const rest = detach ? runArgs.slice(1) : runArgs;
    if (rest[0] !== "--name" || rest[2] !== "--pull" || rest[3] !== "never") return undefined;
    const env: string[] = [];
    let i = 4;
    while (rest[i] === "-e" && rest[i + 1] !== undefined) {
      env.push(rest[i + 1] as string);
      i += 2;
    }
    // The options end at the --entrypoint five from the end.
    i = rest.length - 5;
    if (i < 4 || rest[i] !== "--entrypoint" || rest[i + 1] !== "sh" || rest[i + 3] !== "-c") return undefined;
    return { detach, name: rest[1] as string, env, image: rest[i + 2] as string, script: rest[i + 4] as string };
  };

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
  } else if (command === "run" && parseRun(args.slice(1))) {
    // docker run [--detach] --name <name> --pull never [-e <NAME>]… [<option>]… --entrypoint sh <image> -c <script>
    const { detach, name, env, image, script } = parseRun(args.slice(1))!;
    if (!dir) fail("fake docker: running a container needs FAKE_DOCKER_DIR");
    if (!(await list("images")).includes(image)) fail(`docker: Error response from daemon: No such image: ${image}`);
    const container = `${dir}/containers/${name}`;
    if (await state(`containers/${name}/image`).exists()) fail(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use.`);
    await Bun.write(`${container}/image`, `${image}\n`);
    await $`mkdir -p ${container}/root/workspace ${container}/root/thunderjar`.quiet();
    await $`if [ -d ${filesystemOf(image)} ]; then cp -R ${filesystemOf(image)}/. ${container}/root; fi`.quiet();
    if (detach) {
      console.log(crypto.randomUUID().replaceAll("-", ""));
    } else {
      const passed = Object.fromEntries(env.flatMap((variable) => (Bun.env[variable] === undefined ? [] : [[variable, Bun.env[variable] as string]])));
      const mapped = script.replace(/\/(workspace|thunderjar)\b/g, (_, folder: string) => `${container}/root/${folder}`);
      const child = Bun.spawn(["sh", "-c", mapped], {
        cwd: `${container}/root/workspace`,
        env: { PATH: Bun.env.PATH ?? "/usr/bin:/bin", HOME: `${container}/root`, ...passed },
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      });
      await Bun.write(`${container}/pid`, String(child.pid));
      const exitCode = await child.exited;
      await $`rm -f ${container}/pid`.quiet();
      // Killed, it exits as Docker reports a killed container: 128 + SIGKILL.
      process.exit(child.signalCode ? 137 : exitCode);
    }
  } else if (command === "exec") {
    // docker exec [--interactive] --workdir <dir> <name> <command…>
    const interactive = subcommand === "--interactive";
    const [flag, , name, ...program] = args.slice(interactive ? 2 : 1) as [string, string, string, ...string[]];
    if (flag !== "--workdir" || program.length === 0) fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
    if (!dir || !(await state(`containers/${name}/image`).exists())) fail(`Error response from daemon: No such container: ${name}`);
    const result = await inContainer(`${dir}/containers/${name}`, program, interactive ? await Bun.stdin.text() : undefined);
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
    await $`mkdir -p ${filesystemOf(image)} && cp -R ${dir}/containers/${name}/root/. ${filesystemOf(image)}`.quiet();
    await Bun.write(state("images"), lines([...(await list("images")), image]));
  } else if (command === "kill" && rest.length === 0) {
    // docker kill <name>
    const pidFile = state(`containers/${subcommand}/pid`);
    if (!dir || !(await pidFile.exists())) fail(`Error response from daemon: cannot kill container: ${subcommand}: container is not running`);
    // The script's process, and every process under it.
    const tree = async (pid: string): Promise<string[]> => {
      const children = (await $`pgrep -P ${pid}`.quiet().nothrow().text()).split("\n").filter(Boolean);
      return [pid, ...(await Promise.all(children.map(tree))).flat()];
    };
    const pids = await tree((await pidFile.text()).trim());
    await $`kill -KILL ${pids}`.quiet().nothrow();
    console.log(subcommand);
  } else if (command === "login" && subcommand !== undefined && rest.length === 0) {
    // docker login <host>, its input closed
    if (!(await list("logins")).includes(subcommand)) fail("Error: Cannot perform an interactive login from a non TTY device");
    console.log("Login Succeeded");
  } else if (command === "tag" && rest.length === 1) {
    // docker tag <image> <reference>
    const images = await list("images");
    if (!images.includes(subcommand as string)) fail(`Error response from daemon: No such image: ${subcommand}`);
    if (dir && !images.includes(rest[0] as string)) await Bun.write(state("images"), lines([...images, rest[0] as string]));
  } else if (command === "push" && subcommand === "--quiet" && rest.length === 1) {
    // docker push --quiet <reference>
    const reference = rest[0] as string;
    const host = reference.split("/")[0] as string;
    if (!(await list("images")).includes(reference)) fail(`Error response from daemon: No such image: ${reference}`);
    if (!(await list("logins")).includes(host) || (await list("failing")).includes(reference)) {
      fail("denied: permission_denied: The token provided does not match expected scopes.");
    }
    if (dir) await Bun.write(state("pushed"), lines([...(await list("pushed")), reference]));
    console.log(reference);
  } else if (command === "rm" && subcommand === "--force" && rest.length === 1) {
    // docker rm --force <name>
    if (dir) await $`rm -rf ${dir}/containers/${rest[0] as string}`.quiet();
  } else {
    fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
  }
}
