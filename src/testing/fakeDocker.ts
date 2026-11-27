#!/usr/bin/env bun
// oxlint-disable no-console -- it prints what `docker` would print, so it writes with `console`, which src/ otherwise bans.
// A stand-in for the `docker` CLI. Set THUNDERJAR_DOCKER to this file and Thunderjar runs it in
// place of `docker`: nothing reaches a real daemon, and each command is recorded.
//
// Its state is a folder, FAKE_DOCKER_DIR, which a test writes and reads:
//
//   images        the images that exist, `<repository>:<tag>`, one per line; a build or commit adds one
//   removed       appended to: each image removed with `image rm`, which no longer exists, unless added to images again since
//   unreachable   if present, the daemon can't be reached
//   pull-denied   if present, every pull fails, as for a runtime with no login for the registry
//   manifest-unavailable  if present, every `manifest inspect` fails, as if the registry can't be reached
//   failing       the images whose build or commit fails, and the references whose push or pull fails, one per line
//   slow          the images whose build takes a second, one per line
//   slow-start    `<suffix> <seconds>` lines: `run` of a container whose name ends with `<suffix>` waits that
//                 long before it makes the container, as a slow runtime might
//   logins        the registry hosts Docker holds a valid login for, one per line
//   pushed        appended to: each reference pushed, one per line
//   commands      appended to: one line per command, `docker <args…>`, a newline in an argument as `\n`
//   contexts/     a copy of each build's context, by image, e.g. contexts/thunderjar-prerun:f64ca35b/
//   containers/   each container not yet removed, by name, e.g. containers/<name>/:
//     image         the image it was run from
//     root/         its files: only what was written to /workspace and /thunderjar
//   filesystems/  the root/ of each committed container, by image (URI-encoded)
//   env/          the environment of each image that has one, by image (URI-encoded), as JSON `NAME=value`
//                 entries; a container's is in containers/<name>/env.json
//
// `build` takes `--secret id=<id>,env=<env>`, failing as Docker does if `<env>` is unset in its own
// environment, and `--ssh default`.
//
// `run` runs the container's script on the host, with /workspace and /thunderjar in it mapped to
// the container's root/, as is a lone `/`, e.g. in `cd /`, and root/workspace its working directory. Its environment is only the
// container's (see below), beside PATH and HOME, as a container sees only what it's given. While it runs, `kill` stops it, and everything it started, as if the
// container had been killed. A built image's container
// starts with only the files its Dockerfile writes with `COPY <<'EOF' <path>` heredocs, as
// writeFile does, under /workspace or /thunderjar: no RUN is run. A script that runs /thunderjar/thunderjar-run.sh runs a
// copy of it with its paths mapped too. A committed image's starts with the files of the
// container it was committed from. So a fake harness's `cli` really runs, its result file is
// really read, and what it left is in its postrun image. `run --detach` starts a container
// without running its script, and `exec` runs a command in it the way `run` runs a script,
// always in root/workspace. `login <host>` succeeds only for a host in logins/, failing as Docker
// does with its input closed. `tag` adds an image; `push` records it, if its host is logged in.
//
// A leading `--context <name>`, as a runtime's command may give, is recorded and otherwise ignored:
// the runtime shares the fake's state. Only `info --format {{.ID}}` tells them apart: with a
// context, it gives another daemon's ID. `run` takes `--pull missing` as well as `--pull never`.
// `ps --all --filter name=<text> --format {{.Names}}` lists the containers not yet removed whose
// name has `<text>` in it. `rm --force <name>…` kills a running container's script first.
// `pull --quiet <reference>` and `manifest inspect <reference>` succeed only for a reference that was pushed: a pull adds it to images. `image rm <image>…`
// removes tags from images, failing for one that doesn't exist or is in failing, or for any if
// FAKE_DOCKER_FAIL_IMAGE_RM is set. `system df`
// reports made-up sizes: 100MB an image. `run --rm --interactive` runs a shell session, as
// src/docker/shellSession.ts speaks to one, each command with only the container's environment,
// as `run` gives one; it fails to start for a container named in failing.
//
// An image's environment comes from its Dockerfile's `ENV` lines, or `fakeDocker({ env })`. A
// container's is its image's, with each `-e`/`--env` given to `run`: `NAME`, from the fake's own
// environment, skipped if unset there, or `NAME=value`.
// `container inspect --format <format> <name>` prints the names of its variables as a JSON array,
// whatever the format. `image inspect --format <format> <image>` prints the image's entrypoint and
// command, both null, then, if the format asks for `.Config.Env`, its environment, between tabs.
// `commit` saves the container's environment with each `--change ENV …` applied, read as Docker
// reads one: quotes, `\` escapes, and `$NAME` expanded. `tag` copies an image's.
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
  /** The environment of `image`, as `NAME=value` entries, or undefined if it has none. */
  envOf: (image: string) => Promise<string[] | undefined>;
  /** The text of the file at `path`, from the container's root, in the committed image `image`, or undefined if there's none. */
  fileIn: (image: string, path: string) => Promise<string | undefined>;
  /** Deletes its state. */
  remove: () => Promise<void>;
};

/** The images of `added` that still exist: each added more times than it's in `removed`, once each, in order. */
function existing(added: string[], removed: string[]): string[] {
  const count = (list: string[], image: string) => list.filter((each) => each === image).length;
  return [...new Set(added)].filter((image) => count(added, image) > count(removed, image));
}

/** The process `pid`, and every process under it. */
async function processTree(pid: string): Promise<string[]> {
  const children = (await $`pgrep -P ${pid}`.quiet().nothrow().text()).split("\n").filter(Boolean);
  return [pid, ...(await Promise.all(children.map(processTree))).flat()];
}

const lines = (values: string[]) => values.map((value) => `${value}\n`).join("");

/** Where the environment of `image` is kept, in the fake's state `dir`. */
const envFile = (dir: string, image: string) => `${dir}/env/${encodeURIComponent(image)}.json`;

const REFERENCE = /^\$(\{\w+\}|\w+)/;

/**
 * The variables a Dockerfile `ENV` instruction sets, given the text after `ENV `, read as Docker
 * reads it: split at unquoted spaces, quotes removed, `\` escapes undone (in double quotes, only
 * of `\`, `"` and `$`), and `$NAME` or `${NAME}` outside single quotes expanded from `env`.
 */
export function parseEnvInstruction(text: string, env: Map<string, string>): [string, string][] {
  const words: string[] = [];
  let i = 0;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i] as string)) i++;
    if (i >= text.length) break;
    let word = "";
    let quote: string | undefined;
    for (; i < text.length; i++) {
      const c = text[i] as string;
      const reference = REFERENCE.exec(text.slice(i));
      if (quote === undefined && /\s/.test(c)) break;
      if (c === "\\" && quote !== "'" && i + 1 < text.length && (quote === undefined || /[\\"$]/.test(text[i + 1] as string))) {
        word += text[++i];
      } else if (c === quote) {
        quote = undefined;
      } else if (quote === undefined && (c === '"' || c === "'")) {
        quote = c;
      } else if (quote !== "'" && reference) {
        word += env.get(reference[0].replace(/^\$\{?|\}$/g, "")) ?? "";
        i += reference[0].length - 1;
      } else {
        word += c;
      }
    }
    words.push(word);
  }
  return words.map((word) => [word.slice(0, word.indexOf("=")), word.slice(word.indexOf("=") + 1)]);
}

/** `entries`, each `NAME=value`, as a map. */
const envMap = (entries: string[]) => new Map(entries.map((entry): [string, string] => [entry.slice(0, entry.indexOf("=")), entry.slice(entry.indexOf("=") + 1)]));
const envEntries = (env: Map<string, string>) => [...env].map(([name, value]) => `${name}=${value}`);

/**
 * State for the fake, in which `images` exist, building or committing the `failing` images, or
 * pushing the `failing` references, fails, building the `slow` images takes a second, Docker is logged in to the registry hosts `loggedIn`,
 * or the daemon is `unreachable`. Remove it when done, or declare it with `await using`.
 */
export async function fakeDocker({
  images = [],
  failing = [],
  slow = [],
  loggedIn = [],
  unreachable = false,
  pullDenied = false,
  stored = [],
  slowStart = {},
  env = {},
}: {
  images?: string[];
  failing?: string[];
  slow?: string[];
  loggedIn?: string[];
  unreachable?: boolean;
  pullDenied?: boolean;
  /** References already in the registry, as if pushed before. */
  stored?: string[];
  /** How many seconds `run` waits before it makes a container, by the end of its name, e.g. `{ "-1-1": 3 }`. */
  slowStart?: Record<string, number>;
  /** The environment of each image that has one, as `NAME=value` entries, by image. */
  env?: Record<string, string[]>;
} = {}): Promise<FakeDocker> {
  const dir = `${FIXTURES_DIR}/.tmp/docker-${crypto.randomUUID()}`;
  await Bun.write(`${dir}/images`, lines(images));
  await Bun.write(`${dir}/failing`, lines(failing));
  await Bun.write(`${dir}/slow`, lines(slow));
  await Bun.write(`${dir}/slow-start`, lines(Object.entries(slowStart).map(([suffix, seconds]) => `${suffix} ${seconds}`)));
  await Bun.write(`${dir}/logins`, lines(loggedIn));
  if (unreachable) await Bun.write(`${dir}/unreachable`, "");
  if (pullDenied) await Bun.write(`${dir}/pull-denied`, "");
  if (stored.length > 0) await Bun.write(`${dir}/pushed`, lines(stored));
  for (const [image, entries] of Object.entries(env)) await Bun.write(envFile(dir, image), JSON.stringify(entries));
  // A new Bun.file each time: one read caches the file's size, so a second would miss what was appended since.
  const commandsFile = () => Bun.file(`${dir}/commands`);
  const listOf = async (file: string) => (await Bun.file(file).text()).split("\n").filter(Boolean);
  const remove = async () => {
    // A container still running, e.g. an agent whose run was abandoned, would write into its
    // folder while it's removed: it's killed first, with everything it started.
    const pidFiles = await Array.fromAsync(new Glob("containers/*/pid").scan({ cwd: dir })).catch(() => []);
    for (const pidFile of pidFiles) {
      const pid = (await Bun.file(`${dir}/${pidFile}`).text().catch(() => "")).trim();
      if (pid !== "") await $`kill -KILL ${await processTree(pid)}`.quiet().nothrow();
    }
    await $`rm -rf ${dir}`.quiet();
  };
  return {
    env: { THUNDERJAR_DOCKER: FAKE_DOCKER, FAKE_DOCKER_DIR: dir },
    commands: async () => ((await commandsFile().exists()) ? (await commandsFile().text()).split("\n").filter(Boolean) : []),
    contextOf: (image) => `${dir}/contexts/${image}`,
    images: async () => {
      return existing(await listOf(`${dir}/images`), (await Bun.file(`${dir}/removed`).exists()) ? await listOf(`${dir}/removed`) : []);
    },
    pushed: async () => ((await Bun.file(`${dir}/pushed`).exists()) ? listOf(`${dir}/pushed`) : []),
    containers: async () =>
      // A folder: Bun.file's exists() is false for one.
      (await $`test -d ${dir}/containers`.quiet().nothrow()).exitCode === 0
        ? (await Array.fromAsync(new Glob("*/image").scan({ cwd: `${dir}/containers` }))).map((file) => file.slice(0, -"/image".length)).sort()
        : [],
    envOf: async (image) => {
      const file = Bun.file(envFile(dir, image));
      return (await file.exists()) ? ((await file.json()) as string[]) : undefined;
    },
    fileIn: async (image, path) => {
      const file = Bun.file(`${dir}/filesystems/${encodeURIComponent(image)}${path}`);
      return (await file.exists()) ? file.text() : undefined;
    },
    remove,
    [Symbol.asyncDispose]: remove,
  };
}

if (import.meta.main) {
  const recorded = Bun.argv.slice(2);
  const args = recorded[0] === "--context" ? recorded.slice(2) : recorded;
  const dir = Bun.env.FAKE_DOCKER_DIR;
  const state = (name: string) => Bun.file(`${dir}/${name}`);
  // Appended to, never rewritten, so containers running at once don't lose each other's lines.
  const append = (name: string, line: string) => $`sh -c ${'cat >> "$0"'} ${`${dir}/${name}`} < ${new Response(`${line}\n`)}`.quiet();
  const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
  };

  if (dir) {
    await append("commands", `docker ${recorded.join(" ").replaceAll("\n", "\\n")}`);
  }
  if (dir && (await state("unreachable").exists())) {
    fail("Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?");
  }

  const listed = async (name: string) => (dir && (await state(name).exists()) ? (await state(name).text()).split("\n").filter(Boolean) : []);
  /** The lines of the state file `name`. For `images`: without those removed with `image rm`. */
  const list = async (name: string) => {
    if (name !== "images") return listed(name);
    return existing(await listed("images"), await listed("removed"));
  };

  const filesystemOf = (image: string) => `${dir}/filesystems/${encodeURIComponent(image)}`;
  /** The environment kept in `file`, empty if there's none. */
  const envIn = async (file: string) => envMap((await Bun.file(file).exists()) ? ((await Bun.file(file).json()) as string[]) : []);
  /**
   * Keeps the environment of the container `name`: its image's, with each `-e`/`--env` of `runArgs`
   * before `--entrypoint`, from the fake's own environment for a bare `NAME`, as Docker does,
   * skipping one that's unset there.
   */
  const keepContainerEnv = async (name: string, image: string, runArgs: string[]) => {
    const env = await envIn(envFile(dir as string, image));
    for (let i = 0; i < runArgs.length && runArgs[i] !== "--entrypoint"; i++) {
      const arg = runArgs[i] as string;
      const given = arg === "-e" || arg === "--env" ? runArgs[++i] : arg.startsWith("--env=") ? arg.slice("--env=".length) : undefined;
      if (given === undefined) continue;
      if (given.includes("=")) env.set(given.slice(0, given.indexOf("=")), given.slice(given.indexOf("=") + 1));
      else if (Bun.env[given] !== undefined) env.set(given, Bun.env[given] as string);
    }
    await Bun.write(`${dir}/containers/${name}/env.json`, JSON.stringify(envEntries(env)));
  };

  /**
   * Runs `program` on the host as if in `container`, its /workspace and /thunderjar mapped to the
   * container's root/, in root/workspace.
   */
  const inContainer = (container: string, program: string[], stdin?: string, env?: Record<string, string>) => {
    const mapped = program.map((arg) => arg.replace(/\/(workspace|thunderjar)(?![\w.-])/g, (_, folder: string) => `${container}/root/${folder}`));
    const shell = $`${mapped} < ${new Response(stdin ?? "")}`.cwd(`${container}/root/workspace`).quiet().nothrow();
    return env ? shell.env(env) : shell;
  };

  /**
   * `docker run [--detach] --name <name> --pull never [-e <NAME>]… [<option>]… --entrypoint sh <image> -c <script>`,
   * parsed. Options but `-e` and `--env`, which keepContainerEnv reads, are recorded in `commands`,
   * and otherwise ignored.
   */
  const parseRun = (runArgs: string[]) => {
    const detach = runArgs[0] === "--detach";
    const rest = detach ? runArgs.slice(1) : runArgs;
    if (rest[0] !== "--name" || rest[2] !== "--pull" || (rest[3] !== "never" && rest[3] !== "missing")) return undefined;
    // The options end at the --entrypoint five from the end.
    const i = rest.length - 5;
    if (i < 4 || rest[i] !== "--entrypoint" || rest[i + 1] !== "sh" || rest[i + 3] !== "-c") return undefined;
    return { detach, name: rest[1] as string, image: rest[i + 2] as string, script: rest[i + 4] as string };
  };

  const [command, subcommand, ...rest] = args;
  if (command === "image" && subcommand === "ls" && rest[0] === "--format" && rest.length === 3) {
    // docker image ls --format {{.Repository}}:{{.Tag}} <repository>
    const repository = rest[2] as string;
    for (const image of await list("images")) {
      if (image.slice(0, image.lastIndexOf(":")) === repository) console.log(image);
    }
  } else if (command === "build" && args.at(-3) === "-t") {
    // docker build [--secret id=<id>,env=<env>]… [--ssh default] -t <image> <context>
    const [image, context] = args.slice(-2) as [string, string];
    const options = args.slice(1, -3);
    for (let i = 0; i < options.length; i += 2) {
      const [flag, value] = [options[i], options[i + 1] ?? ""];
      const secret = flag === "--secret" && /^id=[^,]+,env=([A-Za-z_]\w*)$/.exec(value);
      if (secret && !Bun.env[secret[1] as string]) fail(`ERROR: failed to build: secret ${value}: env ${secret[1]} is not set`);
      if (!secret && !(flag === "--ssh" && value === "default")) fail(`fake docker: unknown build option ${flag} ${value}`);
    }
    if (!(await Bun.file(`${context}/Dockerfile`).exists())) fail(`fake docker: no Dockerfile in the build context ${context}`);
    if (dir && (await list("slow")).includes(image)) await Bun.sleep(1000);
    if ((await list("failing")).includes(image)) {
      fail(`ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1`);
    }
    if (dir) {
      await $`mkdir -p ${dir}/contexts/${image} && cp -R ${context}/. ${dir}/contexts/${image}`.quiet();
      // COPY [--chmod=…] <<'DELIM' <path>, then its lines, up to DELIM.
      const dockerfile = (await Bun.file(`${context}/Dockerfile`).text()).split("\n");
      const env = new Map<string, string>();
      for (const line of dockerfile.filter((each) => each.startsWith("ENV "))) {
        for (const [variable, value] of parseEnvInstruction(line.slice("ENV ".length), env)) env.set(variable, value);
      }
      if (env.size > 0) await Bun.write(envFile(dir, image), JSON.stringify(envEntries(env)));
      for (let i = 0; i < dockerfile.length; i++) {
        const copy = /^COPY (?:--\S+ )*<<'?(\w+)'? (\/(?:workspace|thunderjar)\/\S+)$/.exec(dockerfile[i] as string);
        if (!copy) continue;
        const end = dockerfile.indexOf(copy[1] as string, i + 1);
        await Bun.write(`${filesystemOf(image)}${copy[2]}`, `${dockerfile.slice(i + 1, end).join("\n")}\n`);
        i = end;
      }
      if (!(await list("images")).includes(image)) await append("images", image);
    }
  } else if (command === "run" && subcommand === "--rm" && rest[0] === "--interactive" && parseRun(rest.slice(1))) {
    // docker run --rm --interactive --name <name> --pull <pull> --entrypoint sh <image> -c <session script>: a
    // shell session, as src/docker/shellSession.ts speaks to one. Each command runs as `docker exec` would
    // run it, its paths mapped into the container, and the container is removed once stdin ends.
    const { name, image } = parseRun(rest.slice(1))!;
    if (!dir) fail("fake docker: running a container needs FAKE_DOCKER_DIR");
    if (!(await list("images")).includes(image)) fail(`docker: Error response from daemon: No such image: ${image}`);
    if ((await list("failing")).includes(name)) fail(`docker: Error response from daemon: failed to start container ${name}`);
    const container = `${dir}/containers/${name}`;
    await Bun.write(`${container}/image`, `${image}\n`);
    await keepContainerEnv(name, image, rest.slice(1));
    // Each command sees only the container's environment, beside PATH and HOME, as `run` does.
    const sessionEnv = { PATH: Bun.env.PATH ?? "/usr/bin:/bin", HOME: `${container}/root`, ...Object.fromEntries(await envIn(`${container}/env.json`)) };
    await $`mkdir -p ${container}/root/workspace ${container}/root/thunderjar`.quiet();
    await $`if [ -d ${filesystemOf(image)} ]; then cp -R ${filesystemOf(image)}/. ${container}/root; fi`.quiet();
    const input = Bun.stdin.stream().getReader();
    let buffered = new Uint8Array(0);
    const fill = async (length: number) => {
      while (buffered.length < length) {
        const { done, value } = await input.read();
        if (done) return false;
        const joined = new Uint8Array(buffered.length + value.length);
        joined.set(buffered);
        joined.set(value, buffered.length);
        buffered = joined;
      }
      return true;
    };
    const take = (length: number) => {
      const taken = buffered.slice(0, length);
      buffered = buffered.slice(length);
      return new TextDecoder().decode(taken);
    };
    process.stdout.write("ready /workspace\n");
    for (;;) {
      while (buffered.indexOf(10) === -1) if (!(await fill(buffered.length + 1))) break;
      const newline = buffered.indexOf(10);
      if (newline === -1) break;
      const [commandLength, stdinLength] = take(newline + 1).trim().split(" ").map(Number) as [number, number];
      if (!(await fill(commandLength + stdinLength))) break;
      const [script, stdin] = [take(commandLength), take(stdinLength)];
      const result = await inContainer(container, ["sh", "-c", script], stdin, sessionEnv);
      const [out, err] = [result.stdout, result.stderr];
      process.stdout.write(`${result.exitCode} ${out.length} ${err.length}\n`);
      process.stdout.write(out);
      process.stdout.write(err);
    }
    await $`rm -rf ${container}`.quiet();
  } else if (command === "run" && parseRun(args.slice(1))) {
    // docker run [--detach] --name <name> --pull never [-e <NAME>]… [<option>]… --entrypoint sh <image> -c <script>
    const { detach, name, image, script } = parseRun(args.slice(1))!;
    if (!dir) fail("fake docker: running a container needs FAKE_DOCKER_DIR");
    if (!(await list("images")).includes(image)) fail(`docker: Error response from daemon: No such image: ${image}`);
    for (const line of await list("slow-start")) {
      const [suffix, seconds] = line.split(" ") as [string, string];
      if (name.endsWith(suffix)) await Bun.sleep(Number(seconds) * 1000);
    }
    const container = `${dir}/containers/${name}`;
    if (await state(`containers/${name}/image`).exists()) fail(`docker: Error response from daemon: Conflict. The container name "/${name}" is already in use.`);
    await Bun.write(`${container}/image`, `${image}\n`);
    await keepContainerEnv(name, image, args.slice(1));
    await $`mkdir -p ${container}/root/workspace ${container}/root/thunderjar`.quiet();
    await $`if [ -d ${filesystemOf(image)} ]; then cp -R ${filesystemOf(image)}/. ${container}/root; fi`.quiet();
    if (detach) {
      console.log(crypto.randomUUID().replaceAll("-", ""));
    } else {
      const passed = Object.fromEntries(await envIn(`${container}/env.json`));
      // A lone `/`, e.g. `cd /`, is the container's root, its root/.
      const map = (text: string) =>
        text
          .replace(/\/(workspace|thunderjar)(?![\w.-])/g, (_, folder: string) => `${container}/root/${folder}`)
          .replace(/(?<=^|[\s;&|('"])\/(?=$|[\s;&|)'"])/g, `${container}/root/`);
      let mapped = map(script);
      const runScript = `${container}/root/thunderjar/thunderjar-run.sh`;
      if (mapped.includes(runScript) && (await Bun.file(runScript).exists())) {
        await Bun.write(`${container}/thunderjar-run.sh`, map(await Bun.file(runScript).text()));
        mapped = mapped.replaceAll(runScript, `${container}/thunderjar-run.sh`);
      }
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
    // docker exec [--interactive] [--workdir <dir>] <name> <command…>, always in root/workspace; `sh -c pwd` prints /workspace
    const interactive = subcommand === "--interactive";
    const afterFlags = args.slice(interactive ? 2 : 1);
    const [name, ...program] = (afterFlags[0] === "--workdir" ? afterFlags.slice(2) : afterFlags) as [string, ...string[]];
    if (afterFlags[0]?.startsWith("-") && afterFlags[0] !== "--workdir") fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
    if (program.length === 0) fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
    if (program.join(" ") === "sh -c pwd") {
      console.log("/workspace");
      process.exit(0);
    }
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
    const env = await envIn(envFile(dir as string, rest[2] as string));
    console.log((rest[1] as string).includes(".Config.Env") ? `null\tnull\t${JSON.stringify(env.size > 0 ? envEntries(env) : null)}` : "null\tnull");
  } else if (command === "container" && subcommand === "inspect" && rest[0] === "--format" && rest.length === 3) {
    // docker container inspect --format <format> <name>: the names of its variables, never their values
    const name = rest[2] as string;
    if (!dir || !(await state(`containers/${name}/image`).exists())) fail(`Error response from daemon: No such container: ${name}`);
    console.log(JSON.stringify([...(await envIn(`${dir}/containers/${name}/env.json`)).keys()]));
  } else if (command === "commit" && rest.length >= 2) {
    // docker commit [--change <change>]… <name> <image>
    const [name, image] = args.slice(-2) as [string, string];
    if (!dir || !(await state(`containers/${name}/image`).exists())) fail(`Error response from daemon: No such container: ${name}`);
    if ((await list("failing")).includes(image)) fail(`Error response from daemon: failed to commit ${name} as ${image}`);
    await $`mkdir -p ${filesystemOf(image)} && cp -R ${dir}/containers/${name}/root/. ${filesystemOf(image)}`.quiet();
    // The container's environment, with each `--change ENV …` applied: Docker reads a change up to a newline.
    const env = await envIn(`${dir}/containers/${name}/env.json`);
    const options = args.slice(1, -2);
    for (let i = 0; i < options.length; i += 2) {
      const change = options[i + 1] ?? "";
      if (options[i] !== "--change") fail(`fake docker: unknown commit option ${options[i]}`);
      if (/[\r\n]/.test(change)) fail(`Error response from daemon: ${change.split(/[\r\n]/).at(-1)} is not a valid change command`);
      if (change.startsWith("ENV ")) for (const [variable, value] of parseEnvInstruction(change.slice("ENV ".length), env)) env.set(variable, value);
    }
    await Bun.write(envFile(dir as string, image), JSON.stringify(envEntries(env)));
    if (!(await list("images")).includes(image)) await append("images", image);
  } else if (command === "kill" && rest.length === 0) {
    // docker kill <name>; a container named in `failing` can't be killed, as if the daemon couldn't be reached.
    if ((await list("failing")).includes(subcommand as string)) fail("error during connect: the runtime can't be reached");
    const pidFile = state(`containers/${subcommand}/pid`);
    if (!dir || !(await state(`containers/${subcommand}/image`).exists())) fail(`Error response from daemon: No such container: ${subcommand}`);
    if (!(await pidFile.exists())) fail(`Error response from daemon: cannot kill container: ${subcommand}: container is not running`);
    const pids = await processTree((await pidFile.text()).trim());
    await $`kill -KILL ${pids}`.quiet().nothrow();
    console.log(subcommand);
  } else if (command === "info" && subcommand === "--format" && rest.length === 1) {
    // docker info --format {{.ID}}: a daemon's ID. One with a --context is another daemon's, though it shares this state.
    console.log(recorded[0] === "--context" ? `fake-daemon-${recorded[1]}` : "fake-daemon");
  } else if (command === "login" && subcommand !== undefined && rest.length === 0) {
    // docker login <host>, its input closed
    if (!(await list("logins")).includes(subcommand)) fail("Error: Cannot perform an interactive login from a non TTY device");
    console.log("Login Succeeded");
  } else if (command === "tag" && rest.length === 1) {
    // docker tag <image> <reference>
    const images = await list("images");
    if (!images.includes(subcommand as string)) fail(`Error response from daemon: No such image: ${subcommand}`);
    if (dir && !images.includes(rest[0] as string)) await append("images", rest[0] as string);
    // The tag names the same image, so it has the same files, e.g. the run script a build wrote.
    if (dir) await $`if [ -d ${filesystemOf(subcommand as string)} ]; then mkdir -p ${filesystemOf(rest[0] as string)} && cp -R ${filesystemOf(subcommand as string)}/. ${filesystemOf(rest[0] as string)}; fi`.quiet();
    if (dir && (await Bun.file(envFile(dir, subcommand as string)).exists())) await Bun.write(envFile(dir, rest[0] as string), Bun.file(envFile(dir, subcommand as string)));
  } else if (command === "push" && subcommand === "--quiet" && rest.length === 1) {
    // docker push --quiet <reference>
    const reference = rest[0] as string;
    const host = reference.split("/")[0] as string;
    if (!(await list("images")).includes(reference)) fail(`Error response from daemon: No such image: ${reference}`);
    if (!(await list("logins")).includes(host) || (await list("failing")).includes(reference)) {
      fail("denied: permission_denied: The token provided does not match expected scopes.");
    }
    if (dir) await append("pushed", reference);
    console.log(reference);
  } else if (command === "pull" && subcommand === "--quiet" && rest.length === 1) {
    // docker pull --quiet <reference>
    const reference = rest[0] as string;
    if (!(await list("pushed")).includes(reference) || (await list("failing")).includes(reference) || (dir && (await state("pull-denied").exists()))) {
      fail(`Error response from daemon: pull access denied for ${reference}, repository does not exist or may require 'docker login'`);
    }
    // It's now in the runtime, which shares this state.
    if (dir && !(await list("images")).includes(reference)) await append("images", reference);
    console.log(reference);
  } else if (command === "manifest" && subcommand === "inspect" && rest.length === 1) {
    // docker manifest inspect <reference>: found if it was pushed, unless the registry can't be asked
    if (dir && (await state("manifest-unavailable").exists())) fail("Get \"https://ghcr.io/v2/\": net/http: TLS handshake timeout");
    if (!(await list("pushed")).includes(rest[0] as string)) fail(`no such manifest: ${rest[0]}`);
    console.log("{}");
  } else if (command === "image" && subcommand === "rm" && rest.length > 0) {
    // docker image rm <image>…
    const images = await list("images");
    for (const image of rest) {
      if (!images.includes(image)) fail(`Error response from daemon: No such image: ${image}`);
      if (Bun.env.FAKE_DOCKER_FAIL_IMAGE_RM || (await list("failing")).includes(image)) {
        fail(`Error response from daemon: conflict: unable to remove repository reference "${image}" (must force)`);
      }
    }
    // Appended, like images: never rewritten, so commands running at once don't lose each other's lines.
    for (const image of rest) if (dir) await append("removed", image);
    for (const image of rest) console.log(`Untagged: ${image}`);
  } else if (command === "system" && subcommand === "df" && rest[0] === "--format") {
    // docker system df --format <template>
    console.log(`Images: ${(await list("images")).length * 100}MB (0B (0%) reclaimable)`);
    console.log("Containers: 0B (0B reclaimable)");
  } else if (command === "ps" && subcommand === "--all" && rest[0] === "--filter" && rest[2] === "--format" && rest.length === 4) {
    // docker ps --all --filter name=<text> --format {{.Names}}
    const text = (rest[1] as string).replace(/^name=/, "");
    if (dir && (await $`test -d ${dir}/containers`.quiet().nothrow()).exitCode === 0) {
      for await (const file of new Glob("*/image").scan({ cwd: `${dir}/containers` })) {
        const name = file.slice(0, -"/image".length);
        if (name.includes(text)) console.log(name);
      }
    }
  } else if (command === "rm" && subcommand === "--force" && rest.length >= 1) {
    // docker rm --force <name>…: a running container's script is killed first, with everything it started.
    for (const name of rest) {
      const pidFile = state(`containers/${name}/pid`);
      if (dir && (await pidFile.exists())) await $`kill -KILL ${await processTree((await pidFile.text()).trim())}`.quiet().nothrow();
      if (dir) await $`rm -rf ${dir}/containers/${name}`.quiet();
    }
  } else {
    fail(`fake docker: unsupported command: docker ${args.join(" ")}`);
  }
}
