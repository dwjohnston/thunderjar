// Everything Thunderjar asks of Docker goes through here: building images, and running a container
// from one, reading files out of it, running commands in it and committing it. It runs the
// `docker` CLI, or the executable THUNDERJAR_DOCKER names in its place: tests point that at
// src/testing/fakeDocker.ts.
//
// Container commands can go to a runtime instead: a command that takes the `docker` CLI's
// arguments, e.g. `docker --context cloud`. Builds, and pushes of prerun images, are always local.
import { $ } from "bun";
import type { BuildOptions } from "../api/declarations.ts";
import { moduleLogger } from "../log/logger.ts";

const log = moduleLogger("docker");

/** Thrown when the Docker CLI can't be run, or can't reach its daemon. */
export class DockerUnavailableError extends Error {}

/** Thrown when `docker build` fails: the message is Docker's reason, and `image` the image it was building. */
export class DockerBuildError extends Error {
  constructor(
    message: string,
    readonly image = "",
  ) {
    super(message);
  }
}

/** Thrown when `docker login` finds no valid login for a registry: the message is Docker's reason. */
export class DockerLoginError extends Error {}

/** Thrown when tagging or pushing an image fails: the message is Docker's reason, and `reference` where it was pushing to. */
export class DockerPushError extends Error {
  constructor(
    message: string,
    readonly reference = "",
  ) {
    super(message);
  }
}

/** Thrown when running, reading from, committing or removing a container fails: the message is Docker's reason. */
export class DockerContainerError extends Error {}

/** Thrown when a runtime can't pull an image from the image store: the message is Docker's reason, and `reference` the image. */
export class DockerPullError extends Error {
  constructor(
    message: string,
    readonly reference = "",
  ) {
    super(message);
  }
}

const dockerBinary = () => Bun.env.THUNDERJAR_DOCKER || "docker";

/**
 * Where containers run: the command put in front of each `docker` subcommand, and whether `run`
 * may pull a missing image. The local daemon never pulls: its images are built here. A remote
 * one pulls them from the image store.
 */
export type DockerRuntime = { command: string[]; pull: "never" | "missing" };

/** The local Docker daemon. */
export const localRuntime = (): DockerRuntime => ({ command: [dockerBinary()], pull: "never" });

/** A runtime given by `command`, e.g. `["docker", "--context", "cloud"]`, pulling images it doesn't have. */
export const remoteRuntime = (command: string[]): DockerRuntime => ({ command, pull: "missing" });

/** How a failed command is named in an error: `docker run`, or the runtime's command and its subcommand. */
const named = (runtime: DockerRuntime, subcommand: string | undefined) => `\`${[...runtime.command, subcommand].join(" ")}\``;

/** How much of a connection error is shown: it quotes the whole command and URL that failed. */
const CONNECT_REASON_LENGTH = 400;

/**
 * Why a command failed, from its stderr: its last line, where Docker puts its reason. Unless the
 * daemon couldn't be reached: then the line that says so, since what follows it is the output of
 * whatever was connecting, e.g. an SSH proxy's hints, whose last line says nothing.
 */
export function reasonOf(stderr: { toString(): string }): string | undefined {
  const lines = stderr.toString().trim().split("\n");
  const connect = lines.find((line) => /^(error during connect|Cannot connect to the Docker daemon)/.test(line));
  if (connect === undefined) return lines.at(-1);
  return connect.length <= CONNECT_REASON_LENGTH ? connect : `${connect.slice(0, CONNECT_REASON_LENGTH - 1)}…`;
}

/** How many lines of a failed build step's output are shown with Docker's reason. */
const BUILD_STEP_LINES = 5;

/**
 * Why a build failed, from its stderr: Docker's last line, which only names the step and its exit
 * code, then the end of what that step wrote, which says why, e.g. npm's `getaddrinfo EAI_AGAIN`.
 * BuildKit repeats a failed step's output between `------` lines, under ` > [2/7] RUN …:`, each
 * line starting with its time, which is dropped. Without that block, just the last line.
 */
export function buildFailureReason(stderr: string): string | undefined {
  const last = reasonOf(stderr);
  const lines = stderr.split("\n");
  const start = lines.findLastIndex((line) => /^ > \[.*\].*:$/.test(line));
  if (start === -1) return last;
  const end = lines.indexOf("------", start);
  const output = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .map((line) => line.replace(/^\d+\.\d+ /, "").trimEnd())
    .filter((line) => line !== "")
    .slice(-BUILD_STEP_LINES);
  if (output.length === 0) return last;
  return [last, ...output.map((line) => `  ${line}`)].join("\n");
}

/**
 * Builds the Dockerfile at the root of the build context `contextDir`, and tags the image `image`,
 * given `options`' secrets, by the variables they're read from, and the SSH agent. Throws a
 * DockerBuildError if the build fails.
 *
 * Plain `docker build`, not `docker buildx build`: with BuildKit, which it uses by default since
 * Docker Engine 23, and with DOCKER_BUILDKIT=1 before, it takes `--secret` and `--ssh`. Where the
 * buildx plugin is installed, `docker build` is buildx's, with the builder that loads the image into
 * the local daemon, where `run` finds it. `docker buildx build` would fail without the plugin, and
 * with a `docker-container` builder would leave the image in the builder unless asked to `--load` it.
 */
export async function buildImage(contextDir: string, image: string, options: BuildOptions = {}): Promise<void> {
  const binary = dockerBinary();
  const secrets = (options.secrets ?? []).flatMap(({ id, env }) => ["--secret", `id=${id},env=${env}`]);
  const ssh = options.ssh ? ["--ssh", "default"] : [];
  // BuildKit, which --secret and --ssh need: the default builder since Docker Engine 23, and
  // asked for here for older engines.
  log.info({ image, contextDir, secrets: (options.secrets ?? []).map(({ id }) => id), ssh: !!options.ssh }, "building image");
  const startedAt = Date.now();
  const result = await $`${binary} build ${secrets} ${ssh} -t ${image} ${contextDir}`.env({ ...Bun.env, DOCKER_BUILDKIT: "1" }).quiet().nothrow();
  const ms = Date.now() - startedAt;
  if (result.exitCode !== 0) {
    // The user is told only the last line of Docker's output: the whole of it is here.
    log.error({ image, exitCode: result.exitCode, ms, stderr: result.stderr.toString() }, "image build failed");
    throw new DockerBuildError(buildFailureReason(result.stderr.toString()) || `\`${binary} build\` exited ${result.exitCode}`, image);
  }
  log.info({ image, ms }, "built image");
}

/** The tagged images in `repository`, as `<repository>:<tag>`. Throws a DockerUnavailableError. */
export async function imagesIn(repository: string): Promise<Set<string>> {
  const binary = dockerBinary();
  log.debug({ repository }, "listing images");
  const result = await $`${binary} image ls --format ${"{{.Repository}}:{{.Tag}}"} ${repository}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    log.debug({ repository, exitCode: result.exitCode, stderr: result.stderr.toString() }, "listing images failed");
    throw new DockerUnavailableError(reasonOf(result.stderr) || `\`${binary} image ls\` exited ${result.exitCode}`);
  }
  return new Set(result.stdout.toString().split("\n").filter(Boolean));
}

const DAEMON_UNREACHABLE = /Cannot connect to the Docker daemon|error during connect/;

/**
 * Checks that Docker holds a valid login for the registry `host`, e.g. `ghcr.io`. With stored
 * credentials, `docker login <host>` checks them with the registry. Without, it would prompt for
 * them, but its input is closed, so it fails instead: it never waits for anyone to type.
 *
 * Throws a DockerLoginError if there's no valid login, or a DockerUnavailableError if Docker
 * can't be reached.
 */
export async function checkLogin(host: string): Promise<void> {
  const binary = dockerBinary();
  const child = Bun.spawn([binary, "login", host], { env: { ...Bun.env }, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  log.debug({ host, exitCode, stderr }, "checked registry login");
  if (exitCode === 0) return;
  const reason = reasonOf(stderr)?.replace(/^error: /i, "") || `\`${binary} login\` exited ${exitCode}`;
  if (DAEMON_UNREACHABLE.test(stderr)) throw new DockerUnavailableError(reason);
  throw new DockerLoginError(reason);
}

/**
 * Tags the local image `image` as `reference`, in a registry repository, and pushes it there.
 * Throws a DockerPushError with Docker's reason.
 */
export async function pushImage(image: string, reference: string, runtime: DockerRuntime = localRuntime()): Promise<void> {
  log.info({ image, reference, runtime: runtime.command }, "pushing image");
  const startedAt = Date.now();
  for (const args of [["tag", image, reference], ["push", "--quiet", reference]]) {
    const result = await $`${runtime.command} ${args}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      log.error({ args, exitCode: result.exitCode, ms: Date.now() - startedAt, stderr: result.stderr.toString() }, "pushing image failed");
      throw new DockerPushError(reasonOf(result.stderr) || `${named(runtime, args[0])} exited ${result.exitCode}`, reference);
    }
  }
  log.info({ reference, ms: Date.now() - startedAt }, "pushed image");
}

/**
 * Whether the registry has `reference`, asked with `docker manifest inspect`, which reads only its
 * manifest. False if it can't tell, e.g. it can't reach the registry: then it's built and pushed as
 * if it weren't there.
 */
export async function inRegistry(reference: string): Promise<boolean> {
  const result = await $`${dockerBinary()} manifest inspect ${reference}`.quiet().nothrow();
  log.debug({ reference, exitCode: result.exitCode, stderr: result.stderr.toString() }, "asked the registry for an image");
  return result.exitCode === 0;
}

/**
 * Pulls `reference` from its registry into `runtime`. Throws a DockerPullError with Docker's
 * reason, e.g. that the runtime can't reach the registry or has no login for it.
 */
export async function pullImage(reference: string, runtime: DockerRuntime): Promise<void> {
  log.info({ reference, runtime: runtime.command }, "pulling image into the runtime");
  const startedAt = Date.now();
  const result = await $`${runtime.command} pull --quiet ${reference}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    log.error({ reference, exitCode: result.exitCode, ms: Date.now() - startedAt, stderr: result.stderr.toString() }, "pulling image failed");
    throw new DockerPullError(reasonOf(result.stderr) || `${named(runtime, "pull")} exited ${result.exitCode}`, reference);
  }
  log.info({ reference, ms: Date.now() - startedAt }, "pulled image");
}

/** Runs `binary args…`, throwing a DockerContainerError with Docker's reason if it fails. */
async function mustRun(args: string[], runtime: DockerRuntime = localRuntime()): Promise<string> {
  const startedAt = Date.now();
  const result = await $`${runtime.command} ${args}`.quiet().nothrow();
  log.debug({ command: [...runtime.command, ...args], exitCode: result.exitCode, ms: Date.now() - startedAt }, "ran docker");
  if (result.exitCode !== 0) {
    // At warn, so the default log level keeps Docker's whole reason: the error carries only its last line.
    log.warn({ command: [...runtime.command, ...args], exitCode: result.exitCode, stderr: result.stderr.toString() }, "docker failed");
    throw new DockerContainerError(reasonOf(result.stderr) || `${named(runtime, args[0])} exited ${result.exitCode}`);
  }
  return result.stdout.toString();
}

/** How a container run by `runContainer` stopped. */
export type ContainerStop = { timedOut: false } | { timedOut: true; /** Epoch ms, when it was killed. */ killedAt: number };

/**
 * Runs `script` with `sh -c`, in place of the image's entrypoint, in a new container `name` from
 * the local image `image`, and leaves the container once it stops. Its output is discarded. Each
 * variable named in `env` is passed in with `-e NAME`, so Docker copies its value from Thunderjar's
 * own environment, and the value is never on a command line. `runOptions` are more `docker run`
 * options, before the image.
 *
 * If it's still running after `timeoutSeconds`, it's killed with `docker kill`, which stops every
 * process in it, whatever the image has installed, and it's left stopped, like one that finished.
 * Throws a DockerContainerError if the script, or Docker, fails.
 */
export async function runContainer(
  image: string,
  name: string,
  script: string,
  {
    env = [],
    runOptions = [],
    timeoutSeconds,
    runtime = localRuntime(),
  }: { env?: string[]; runOptions?: string[]; timeoutSeconds?: number; runtime?: DockerRuntime } = {},
): Promise<ContainerStop> {
  const passed = env.flatMap((variable) => ["-e", variable]);
  const args = ["run", "--name", name, "--pull", runtime.pull, ...passed, ...runOptions, "--entrypoint", "sh", image, "-c", script];
  // Only the variables' names: their values are never logged.
  log.info({ image, container: name, env, runOptions, timeoutSeconds, runtime: runtime.command }, "running container");
  log.trace({ container: name, script }, "container script");
  const startedAt = Date.now();
  const child = Bun.spawn([...runtime.command, ...args], { env: { ...Bun.env }, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  let killing: Promise<number | undefined> | undefined;
  const timer =
    timeoutSeconds === undefined
      ? undefined
      : setTimeout(() => {
          log.warn({ container: name, timeoutSeconds }, "container timed out, killing it");
          killing = killTimedOut(name, child, runtime);
        }, timeoutSeconds * 1000);
  const reading = new Response(child.stderr).text();
  const exitCode = await child.exited;
  // Once it has exited, its stderr is read for at most a few seconds more: when it was killed, a
  // process it started, such as the ssh that reaches a remote runtime, may still hold it open.
  let waiting: ReturnType<typeof setTimeout> | undefined;
  const stderr = await Promise.race([reading, new Promise<string>((resolve) => (waiting = setTimeout(() => resolve(""), 5000)))]);
  clearTimeout(waiting);
  clearTimeout(timer);
  const killedAt = await killing;
  const ms = Date.now() - startedAt;
  if (killedAt !== undefined) {
    log.info({ container: name, ms }, "container killed");
    return { timedOut: true, killedAt };
  }
  if (exitCode !== 0) {
    log.error({ container: name, exitCode, ms, stderr }, "container failed");
    throw new DockerContainerError(reasonOf(stderr) || `${named(runtime, "run")} exited ${exitCode}`);
  }
  log.info({ container: name, ms }, "container finished");
  return { timedOut: false };
}

/** How many times, and how far apart, `docker kill` is tried on a container that timed out. */
export const KILL_ATTEMPTS = 3;
const KILL_RETRY_MS = 2000;

/**
 * Kills the container `name`, which timed out, run by the `docker run` process `child`, and returns
 * when, or undefined if it had already finished: then it didn't time out. `docker kill` is tried
 * KILL_ATTEMPTS times: if it never succeeds, e.g. the runtime can't be reached, `child` is killed
 * instead, so the run doesn't wait on it forever, and the container is left to be removed.
 */
async function killTimedOut(name: string, child: { exited: Promise<number>; kill(signal?: number | NodeJS.Signals): void }, runtime: DockerRuntime): Promise<number | undefined> {
  const killedAt = Date.now();
  let finished = false;
  void child.exited.then(() => (finished = true));
  for (let attempt = 1; attempt <= KILL_ATTEMPTS; attempt++) {
    try {
      await mustRun(["kill", name], runtime);
      return killedAt;
    } catch (error) {
      // It finished just as the time ran out: there's nothing to kill.
      if (finished || (error instanceof Error && /is not running/.test(error.message))) return undefined;
      log.warn({ container: name, attempt, err: error }, "couldn't kill the timed-out container");
      if (attempt < KILL_ATTEMPTS) await Bun.sleep(KILL_RETRY_MS);
    }
  }
  log.error({ container: name }, "gave up killing the timed-out container: stopped waiting for it");
  child.kill("SIGKILL");
  return killedAt;
}

/**
 * The text of the file at `path` in the container `name`, or undefined if there's no such file.
 * Throws a DockerContainerError if Docker fails otherwise.
 */
export async function readContainerFile(name: string, path: string, runtime: DockerRuntime = localRuntime()): Promise<string | undefined> {
  const dir = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-cp-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  try {
    log.debug({ container: name, path }, "reading file from container");
    const result = await $`${runtime.command} cp ${`${name}:${path}`} ${dir}/file`.quiet().nothrow();
    if (result.exitCode !== 0) {
      const reason = reasonOf(result.stderr);
      if (reason?.includes("Could not find the file")) {
        log.debug({ container: name, path }, "no such file in container");
        return undefined;
      }
      throw new DockerContainerError(reason || `${named(runtime, "cp")} exited ${result.exitCode}`);
    }
    return await Bun.file(`${dir}/file`).text();
  } finally {
    await $`rm -rf ${dir}`.quiet();
  }
}

/**
 * Commits the stopped container `name` into the image `image`, with the entrypoint and command of
 * the image `like`, the one it ran from, so starting the new image doesn't run the container's
 * script again. Throws a DockerContainerError.
 */
export async function commitContainer(name: string, image: string, like: string, runtime: DockerRuntime = localRuntime()): Promise<void> {
  const inspected = await mustRun(["image", "inspect", "--format", "{{json .Config.Entrypoint}}\t{{json .Config.Cmd}}", like], runtime);
  const [entrypoint, cmd] = inspected.trim().split("\t");
  // `ENTRYPOINT []` is ignored; `[""]` clears it.
  const changes = [`ENTRYPOINT ${entrypoint === "null" ? '[""]' : entrypoint}`, `CMD ${cmd === "null" ? '["sh"]' : cmd}`];
  const startedAt = Date.now();
  await mustRun(["commit", ...changes.flatMap((change) => ["--change", change]), name, image], runtime);
  log.info({ container: name, image, ms: Date.now() - startedAt }, "committed container");
}

/** Removes the images `references`, tags of images in `runtime`. Throws a DockerContainerError. */
export async function removeImages(references: string[], runtime: DockerRuntime = localRuntime()): Promise<void> {
  await mustRun(["image", "rm", ...references], runtime);
  log.debug({ references }, "removed images");
}

/** Removes the container `name`, stopped or not. Throws a DockerContainerError. */
export async function removeContainer(name: string, runtime: DockerRuntime = localRuntime()): Promise<void> {
  await mustRun(["rm", "--force", name], runtime);
}

/**
 * Removes every container in `runtime`, running or stopped, whose name starts with `prefix`, and
 * returns their names. A running one is killed first. Throws a DockerContainerError.
 */
export async function removeContainersNamed(prefix: string, runtime: DockerRuntime = localRuntime()): Promise<string[]> {
  // Docker's name filter matches anywhere in a name, so the start is checked here.
  const listed = await mustRun(["ps", "--all", "--filter", `name=${prefix}`, "--format", "{{.Names}}"], runtime);
  const names = listed.split("\n").filter((name) => name.startsWith(prefix));
  if (names.length > 0) await mustRun(["rm", "--force", ...names], runtime);
  return names;
}

/**
 * How much disk `runtime`'s Docker uses, as `docker system df` reports it: a line per kind, e.g.
 * `Images: 37.33GB (25.4GB (68%) reclaimable)`. Throws a DockerContainerError.
 */
export async function diskUsage(runtime: DockerRuntime = localRuntime()): Promise<string[]> {
  const out = await mustRun(["system", "df", "--format", "{{.Type}}: {{.Size}} ({{.Reclaimable}} reclaimable)"], runtime);
  return out.split("\n").filter(Boolean);
}

export type ExecResult = { stdout: string; stderr: string; exitCode: number };


/**
 * Starts a container `name` from `image` in `runtime`, running the image's own entrypoint, and
 * leaves it running: `docker run --detach`. `runOptions` are more `docker run` options, before
 * the image. Throws a DockerPullError if the runtime can't pull `image`, or a DockerContainerError.
 */
export async function startDetached(image: string, name: string, runOptions: string[], runtime: DockerRuntime): Promise<void> {
  const args = ["run", "--detach", "--name", name, "--pull", "missing", ...runOptions, image];
  log.info({ image, container: name, runOptions, runtime: runtime.command }, "starting detached container");
  const result = await $`${runtime.command} ${args}`.quiet().nothrow();
  if (result.exitCode === 0) return;
  const stderr = result.stderr.toString();
  log.error({ container: name, exitCode: result.exitCode, stderr }, "starting detached container failed");
  const reason = reasonOf(stderr) || `${named(runtime, "run")} exited ${result.exitCode}`;
  if (/pull access denied|manifest unknown|not found: manifest|unauthorized|denied:/.test(stderr)) throw new DockerPullError(reason, image);
  throw new DockerContainerError(reason);
}

/**
 * Writes `text` to the file `path` in the running container `name`, whole or not at all: to a
 * file beside it, then renamed. `text` goes over the command's input, never on its command line.
 * Throws a DockerContainerError.
 */
export async function writeContainerFile(name: string, path: string, text: string, runtime: DockerRuntime): Promise<void> {
  const args = ["exec", "--interactive", name, "sh", "-c", `cat > ${path}.part && mv ${path}.part ${path}`];
  const result = await $`${runtime.command} ${args} < ${new Response(text)}`.quiet().nothrow();
  log.debug({ command: [...runtime.command, ...args], exitCode: result.exitCode, bytes: text.length }, "wrote file into container");
  if (result.exitCode !== 0) {
    log.warn({ container: name, path, exitCode: result.exitCode, stderr: result.stderr.toString() }, "writing a file into a container failed");
    throw new DockerContainerError(reasonOf(result.stderr) || `${named(runtime, "exec")} exited ${result.exitCode}`);
  }
}

/** Stops the container `name`, giving it `graceSeconds` to stop itself before it's killed. Throws a DockerContainerError. */
export async function stopContainer(name: string, graceSeconds: number, runtime: DockerRuntime): Promise<void> {
  await mustRun(["stop", "--time", String(graceSeconds), name], runtime);
}

/** Whether a container is running, and the code it exited with if not. */
export type ContainerState = { running: boolean; exitCode: number };

/**
 * The state of the container `name` in `runtime`, or undefined if there's no such container.
 * Throws a DockerContainerError if Docker can't be asked.
 */
export async function containerState(name: string, runtime: DockerRuntime): Promise<ContainerState | undefined> {
  const result = await $`${runtime.command} inspect --format ${"{{.State.Running}} {{.State.ExitCode}}"} ${name}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    const reason = reasonOf(result.stderr);
    if (reason !== undefined && /No such (object|container)/i.test(reason)) return undefined;
    throw new DockerContainerError(reason || `${named(runtime, "inspect")} exited ${result.exitCode}`);
  }
  const [running, exitCode] = result.stdout.toString().trim().split(" ");
  return { running: running === "true", exitCode: Number(exitCode) };
}

/**
 * Follows what the container `name` writes to its stdout, from its start, calling `onLine` with
 * each whole line, until the container stops, the connection to `runtime` drops, or `signal`
 * aborts. Returns how `docker logs --follow` exited: 0 once the container has stopped.
 */
export async function followLogs(name: string, runtime: DockerRuntime, onLine: (line: string) => void, signal?: AbortSignal): Promise<number> {
  const child = Bun.spawn([...runtime.command, "logs", "--follow", name], { env: { ...Bun.env }, stdin: "ignore", stdout: "pipe", stderr: "ignore" });
  const abort = () => child.kill();
  signal?.addEventListener("abort", abort);
  if (signal?.aborted) abort();
  try {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of child.stdout) {
      const lines = (rest + decoder.decode(chunk, { stream: true })).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    }
    return await child.exited;
  } finally {
    signal?.removeEventListener("abort", abort);
  }
}

/** The last `lines` lines the container `name` wrote to its stderr, or "" if they can't be read. */
export async function stderrTail(name: string, runtime: DockerRuntime, lines = 20): Promise<string> {
  const result = await $`${runtime.command} logs --tail ${String(lines)} ${name}`.quiet().nothrow();
  return result.exitCode === 0 ? result.stderr.toString().trim() : "";
}

/**
 * Logs Docker in to the registry `host` as `username`, with `password` given on its input, never
 * on a command line. Docker keeps the login in its config folder, DOCKER_CONFIG. Throws a DockerLoginError.
 */
export async function login(host: string, username: string, password: string): Promise<void> {
  const binary = dockerBinary();
  const result = await $`${binary} login ${host} --username ${username} --password-stdin < ${new Response(password)}`.quiet().nothrow();
  log.debug({ host, exitCode: result.exitCode }, "logged in to registry");
  if (result.exitCode !== 0) throw new DockerLoginError(reasonOf(result.stderr)?.replace(/^error: /i, "") || `\`${binary} login\` exited ${result.exitCode}`);
}
