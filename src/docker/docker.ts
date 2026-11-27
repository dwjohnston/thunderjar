// Everything Thunderjar asks of Docker goes through here: building images, and running a container
// from one, reading files out of it, running commands in it and committing it. It runs the
// `docker` CLI, or the executable THUNDERJAR_DOCKER names in its place: tests point that at
// src/testing/fakeDocker.ts.
//
// Commands can go to a runtime instead: a command that takes the `docker` CLI's arguments, e.g.
// `docker --context cloud`. With one, images are built on its daemon too, and pushed from there.
import { $ } from "bun";
import type { BuildOptions } from "../api/declarations.ts";
import { moduleLogger } from "../log/logger.ts";
import { type Clock, createClockService, type TimerHandle } from "../services/Clock/Clock.ts";
import type { ContainerRunner } from "../services/ContainerRunner/ContainerRunner.ts";
import type { ContainerProcess, ContainerRuns, ContainerStop, ExecResult } from "../services/Docker/Docker.ts";

export type { ContainerStop, ExecResult };

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

/** Whether `where` is a DockerRuntime, not a DockerService, which has a `pull` too: a method. */
export const isRuntime = (where: object): where is DockerRuntime => typeof (where as { pull?: unknown }).pull === "string";

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
 * in `runtime`, the local daemon by default, given `options`' secrets, by the variables they're
 * read from, and the SSH agent. The context, secrets and agent are the client's, here: the
 * runtime's daemon is sent them. Throws a DockerBuildError if the build fails.
 *
 * Plain `docker build`, not `docker buildx build`: with BuildKit, which it uses by default since
 * Docker Engine 23, and with DOCKER_BUILDKIT=1 before, it takes `--secret` and `--ssh`. Where the
 * buildx plugin is installed, `docker build` is buildx's, with the builder that loads the image into
 * the local daemon, where `run` finds it. `docker buildx build` would fail without the plugin, and
 * with a `docker-container` builder would leave the image in the builder unless asked to `--load` it.
 */
export async function buildImage(contextDir: string, image: string, options: BuildOptions = {}, runtime: DockerRuntime = localRuntime()): Promise<void> {
  const secrets = (options.secrets ?? []).flatMap(({ id, env }) => ["--secret", `id=${id},env=${env}`]);
  const ssh = options.ssh ? ["--ssh", "default"] : [];
  // BuildKit, which --secret and --ssh need: the default builder since Docker Engine 23, and
  // asked for here for older engines.
  log.info({ image, contextDir, runtime: runtime.command, secrets: (options.secrets ?? []).map(({ id }) => id), ssh: !!options.ssh }, "building image");
  const startedAt = Date.now();
  const result = await $`${runtime.command} build ${secrets} ${ssh} -t ${image} ${contextDir}`.env({ ...Bun.env, DOCKER_BUILDKIT: "1" }).quiet().nothrow();
  const ms = Date.now() - startedAt;
  if (result.exitCode !== 0) {
    // The user is told only the last line of Docker's output: the whole of it is here.
    log.error({ image, exitCode: result.exitCode, ms, stderr: result.stderr.toString() }, "image build failed");
    throw new DockerBuildError(buildFailureReason(result.stderr.toString()) || `${named(runtime, "build")} exited ${result.exitCode}`, image);
  }
  log.info({ image, ms }, "built image");
}

/**
 * The tagged images in `repository`, as `<repository>:<tag>`, in `runtime`, the local daemon by
 * default. One command, however many there are. Throws a DockerUnavailableError.
 */
export async function imagesIn(repository: string, runtime: DockerRuntime = localRuntime()): Promise<Set<string>> {
  log.debug({ repository, runtime: runtime.command }, "listing images");
  const result = await $`${runtime.command} image ls --format ${"{{.Repository}}:{{.Tag}}"} ${repository}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    log.debug({ repository, exitCode: result.exitCode, stderr: result.stderr.toString() }, "listing images failed");
    throw new DockerUnavailableError(reasonOf(result.stderr) || `${named(runtime, "image ls")} exited ${result.exitCode}`);
  }
  return new Set(result.stdout.toString().split("\n").filter(Boolean));
}

/**
 * The ID of `runtime`'s Docker daemon: two runtime commands that reach the same daemon give the
 * same one. Undefined if it can't be asked.
 */
export async function daemonId(runtime: DockerRuntime): Promise<string | undefined> {
  const result = await $`${runtime.command} info --format ${"{{.ID}}"}`.quiet().nothrow();
  log.debug({ runtime: runtime.command, exitCode: result.exitCode, stderr: result.stderr.toString() }, "asked for the daemon's ID");
  const id = result.stdout.toString().trim();
  return result.exitCode === 0 && id !== "" ? id : undefined;
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
export async function pushImage(image: string, reference: string, runtime: DockerRuntime = localRuntime(), signal?: AbortSignal): Promise<void> {
  log.info({ image, reference, runtime: runtime.command }, "pushing image");
  const startedAt = Date.now();
  const failed = (args: string[], exitCode: number | null, stderr: string): never => {
    log.error({ args, exitCode, ms: Date.now() - startedAt, stderr }, "pushing image failed");
    throw new DockerPushError(reasonOf(stderr) || `${named(runtime, args[0])} exited ${exitCode}`, reference);
  };
  const tag = ["tag", image, reference];
  const tagged = await $`${runtime.command} ${tag}`.quiet().nothrow();
  if (tagged.exitCode !== 0) failed(tag, tagged.exitCode, tagged.stderr.toString());
  // Spawned, not $, so `signal` can kill the client: the daemon cancels a push whose client goes.
  if (signal?.aborted) throw new DockerPushError("cancelled", reference);
  const push = ["push", "--quiet", reference];
  const child = Bun.spawn([...runtime.command, ...push], { env: { ...Bun.env }, stdin: "ignore", stdout: "ignore", stderr: "pipe", signal });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  if (signal?.aborted) {
    log.warn({ reference, ms: Date.now() - startedAt }, "push cancelled");
    throw new DockerPushError("cancelled", reference);
  }
  if (exitCode !== 0) failed(push, exitCode, stderr);
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

/**
 * The steps of `runContainer` on `runtime`: `docker run`, `docker kill` and `docker rm`. A
 * process's stdout is read to its end, so `docker run` never waits on it, and its `stderr` resolves
 * once both its stdout and stderr have ended.
 */
export function containerRuns(runtime: DockerRuntime): ContainerRuns {
  return {
    spawnRun(args, startMarker) {
      // Docker copies each `-e NAME` variable's value from this environment.
      const child = Bun.spawn([...runtime.command, ...args], {
        env: { ...Bun.env },
        stdin: "ignore",
        stdout: startMarker === undefined ? "ignore" : "pipe",
        stderr: "pipe",
      });
      const started = Promise.withResolvers<void>();
      const watching =
        startMarker === undefined ? (started.resolve(), Promise.resolve()) : watchFor(child.stdout as ReadableStream<Uint8Array>, startMarker, () => started.resolve()).catch(() => {});
      const stderr = Promise.all([new Response(child.stderr).text(), watching]).then(([text]) => text);
      return { started: started.promise, exited: child.exited, stderr, kill: () => child.kill("SIGKILL") };
    },
    killContainer: async (name) => {
      await mustRun(["kill", name], runtime);
    },
    removeContainer: (name) => removeContainer(name, runtime),
  };
}

/** A ContainerRunner as the steps of `runContainer`. Only until runContainer.humans.test.ts passes a FakeDocker. */
const fromRunner = (runner: ContainerRunner): ContainerRuns => ({
  spawnRun: (args, startMarker) => runner.spawn(args, startMarker),
  killContainer: (name) => runner.kill(name),
  removeContainer: (name) => runner.remove(name),
});

/**
 * How long a container given a `startMarker` may take to start, in seconds, before it's given up
 * on: THUNDERJAR_START_TIMEOUT_SECONDS, or 600. Generous, as a remote runtime can be slow to start
 * one, e.g. while it pulls an image, and that time isn't the agent's.
 */
export const startTimeoutSeconds = (): number => {
  const seconds = Number(Bun.env.THUNDERJAR_START_TIMEOUT_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 600;
};

/**
 * Reads `stream` to its end, so whatever writes to it never waits, and calls `onSeen` once, as soon
 * as a line of it is `marker`. Resolves once it ends.
 */
async function watchFor(stream: ReadableStream<Uint8Array>, marker: string, onSeen: () => void): Promise<void> {
  const decoder = new TextDecoder();
  let pending = "";
  let seen = false;
  for await (const chunk of stream) {
    if (seen) continue;
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = (lines.pop() as string).slice(-marker.length);
    if (lines.includes(marker)) {
      seen = true;
      onSeen();
    }
  }
}

/**
 * Runs `script` with `sh -c`, in place of the image's entrypoint, in a new container `name` from
 * the local image `image`, and leaves the container once it stops. Its output is discarded. Each
 * variable named in `env` is passed in with `-e NAME`, so Docker copies its value from Thunderjar's
 * own environment, and the value is never on a command line. `runOptions` are more `docker run`
 * options, before the image. `setEnv`'s variables, which aren't secret, are passed with their
 * values, `-e NAME=value`, and `secretEnv`'s by name, as `env`'s are, both after `runOptions`, so
 * they win over a variable `runOptions` also sets.
 *
 * If it's still running after `timeoutSeconds`, it's killed with `docker kill`, which stops every
 * process in it, whatever the image has installed, and it's left stopped, like one that finished.
 *
 * Given a `startMarker`, a line `script` prints to stdout once it has started, the timeout runs from
 * when that line arrives, not from `docker run`: so the time a slow runtime takes to start the
 * container isn't the script's. No extra command is needed to tell: the line comes back on `docker
 * run`'s own output. If it hasn't arrived within `startTimeoutSeconds()`, or `docker run` fails
 * before it does, the container never started: that's returned, with why, rather than thrown.
 *
 * Throws a DockerContainerError if the script, or Docker, fails.
 */
export async function runContainer(
  image: string,
  name: string,
  script: string,
  {
    env = [],
    runOptions = [],
    setEnv = {},
    secretEnv = [],
    timeoutSeconds,
    startMarker,
    runtime = localRuntime(),
    // TODO: injected by every caller, once they have a Clock: services are built only at entry points.
    clock = createClockService(),
    runner,
    docker = runner === undefined ? containerRuns(runtime) : fromRunner(runner),
  }: {
    env?: string[];
    runOptions?: string[];
    setEnv?: Record<string, string>;
    secretEnv?: string[];
    timeoutSeconds?: number;
    startMarker?: string;
    runtime?: DockerRuntime;
    /** Where its timeouts' time comes from. Tests pass a FakeClock. */
    clock?: Clock;
    /** What runs `docker run`, `docker kill` and `docker rm`. Tests pass a FakeDocker. */
    docker?: ContainerRuns;
    /** @deprecated The same, as a ContainerRunner: pass `docker`. Kept while runContainer.humans.test.ts passes one. */
    runner?: ContainerRunner;
  } = {},
): Promise<ContainerStop> {
  const byName = (names: string[]) => names.flatMap((variable) => ["-e", variable]);
  const set = Object.entries(setEnv).flatMap(([variable, value]) => ["-e", `${variable}=${value}`]);
  const args = ["run", "--name", name, "--pull", runtime.pull, ...byName(env), ...runOptions, ...set, ...byName(secretEnv), "--entrypoint", "sh", image, "-c", script];
  // Only the secret variables' names: their values are never logged. setEnv's aren't secret.
  log.info({ image, container: name, env, secretEnv, setEnv, runOptions, timeoutSeconds, runtime: runtime.command }, "running container");
  log.trace({ container: name, script }, "container script");
  const startedAt = clock.now();
  const child = docker.spawnRun(args, startMarker);
  let killing: Promise<number | undefined> | undefined;
  /** Why it was given up on before it started, once it has been. */
  let notStarted: string | undefined;
  let started = startMarker === undefined;
  const timeOut = () => {
    if (timeoutSeconds === undefined) return undefined;
    return clock.setTimeout(() => {
      log.warn({ container: name, timeoutSeconds }, "container timed out, killing it");
      killing = killTimedOut(name, child, docker, clock);
    }, timeoutSeconds * 1000);
  };
  let timer: TimerHandle | undefined;
  if (startMarker === undefined) {
    timer = timeOut();
  } else {
    const startSeconds = startTimeoutSeconds();
    timer = clock.setTimeout(() => {
      notStarted = `it didn't start within ${startSeconds}s`;
      log.warn({ container: name, startSeconds }, "container didn't start in time, giving up on it");
      killing = giveUpStarting(name, child, docker, clock);
    }, startSeconds * 1000);
    void child.started.then(() => {
      if (notStarted !== undefined) return;
      started = true;
      clock.clearTimeout(timer);
      log.debug({ container: name, ms: clock.now() - startedAt }, "container started");
      timer = timeOut();
    });
  }
  const exitCode = await child.exited;
  // Once it has exited, its output is read for at most a few seconds more: when it was killed, a
  // process it started, such as the ssh that reaches a remote runtime, may still hold it open.
  let waiting: TimerHandle | undefined;
  const stderr = await Promise.race([child.stderr, new Promise<string>((resolve) => (waiting = clock.setTimeout(() => resolve(""), 5000)))]);
  clock.clearTimeout(waiting);
  clock.clearTimeout(timer);
  const killedAt = await killing;
  const ms = clock.now() - startedAt;
  if (notStarted !== undefined || (!started && exitCode !== 0)) {
    const reason = notStarted ?? (reasonOf(stderr) || `${named(runtime, "run")} exited ${exitCode}`);
    log.error({ container: name, exitCode, ms, stderr }, "container didn't start");
    return { outcome: "notStarted", reason, spawnedAt: startedAt, gaveUpAt: clock.now() };
  }
  if (killedAt !== undefined) {
    log.info({ container: name, ms }, "container killed");
    return { outcome: "timedOut", killedAt };
  }
  if (exitCode !== 0) {
    log.error({ container: name, exitCode, ms, stderr }, "container failed");
    throw new DockerContainerError(reasonOf(stderr) || `${named(runtime, "run")} exited ${exitCode}`);
  }
  log.info({ container: name, ms }, "container finished");
  return { outcome: "exited" };
}

/** How many times, and how far apart, `docker kill` is tried on a container that timed out. */
export const KILL_ATTEMPTS = 3;
const KILL_RETRY_MS = 2000;

/**
 * Kills the container `name`, which timed out, run by the `docker run` process `child`, and returns
 * when, or undefined if it had already finished: then it didn't time out. `docker kill` is tried
 * KILL_ATTEMPTS times: if it never succeeds, e.g. the runtime can't be reached, `child` is killed
 * instead, so the run doesn't wait on it forever, and the container is left to be removed. So it is
 * at once if there's no such container, as when the runtime hasn't made it yet.
 */
async function killTimedOut(name: string, child: ContainerProcess, docker: ContainerRuns, clock: Clock): Promise<number | undefined> {
  const killedAt = clock.now();
  let finished = false;
  void child.exited.then(() => (finished = true));
  for (let attempt = 1; attempt <= KILL_ATTEMPTS; attempt++) {
    try {
      await docker.killContainer(name);
      return killedAt;
    } catch (error) {
      // It finished just as the time ran out: there's nothing to kill.
      if (finished || (error instanceof Error && /is not running/.test(error.message))) return undefined;
      if (error instanceof Error && /No such container/i.test(error.message)) {
        log.warn({ container: name }, "no such container to kill: stopped waiting for it");
        break;
      }
      log.warn({ container: name, attempt, err: error }, "couldn't kill the timed-out container");
      if (attempt < KILL_ATTEMPTS) await clock.sleep(KILL_RETRY_MS);
      else log.error({ container: name }, "gave up killing the timed-out container: stopped waiting for it");
    }
  }
  child.kill();
  return killedAt;
}

/**
 * Gives up on the container `name`, run by the `docker run` process `child`, which hasn't started:
 * removes it, if it exists yet, whether it's only created or now running, and stops `child`.
 * `docker kill` won't do: a container that's created but not yet started "is not running". One
 * the runtime makes later still is removed once the execution ends. Returns when.
 */
async function giveUpStarting(name: string, child: ContainerProcess, docker: ContainerRuns, clock: Clock): Promise<number> {
  const gaveUpAt = clock.now();
  await docker.removeContainer(name).catch((error: unknown) => log.warn({ container: name, err: error }, "couldn't remove the container that didn't start"));
  child.kill();
  return gaveUpAt;
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

/** An image's entrypoint, command and environment, each as JSON, between tabs. */
export const IMAGE_CONFIG_FORMAT = "{{json .Config.Entrypoint}}\t{{json .Config.Cmd}}\t{{json .Config.Env}}";

/**
 * The names of a container's environment variables, as a JSON array: never their values, which
 * stay in Docker.
 */
export const ENV_NAMES_FORMAT = '[{{range $i, $e := .Config.Env}}{{if $i}},{{end}}{{json (index (split $e "=") 0)}}{{end}}]';

/**
 * `word` as a Dockerfile's `ENV` reads it back, byte for byte: in double quotes, with `\`, `"` and
 * `$` escaped, so nothing in it is expanded. A newline can't be written in one: a `--change` ends
 * at it. Throws a DockerContainerError for one, naming `variable`, never the value.
 */
function envWord(word: string, variable: string): string {
  if (/[\r\n]/.test(word)) throw new DockerContainerError(`the environment variable ${JSON.stringify(variable)} can't be written in an ENV instruction: it has a newline`);
  return `"${word.replace(/[\\"$]/g, (c) => `\\${c}`)}"`;
}

/**
 * The `ENV` changes that leave a committed container's environment holding nothing from the time
 * it ran, given its image's environment, `imageEnv`, as `NAME=value` entries, and the names of the
 * container's variables, `containerNames`. Every variable the image doesn't have, e.g. one passed
 * with `-e`, is blanked; every one it has gets the image's value back, whatever it was run with.
 *
 * By rule, not by list: so it covers a harness's `requiredEnv`, a test case's `secretEnv`, `-e`
 * and `--env-file` in a base image's `runOptions`, and whatever else gave the container a
 * variable. Docker can't remove a variable from a commit's config, only set it, so one blanked is
 * left set to "".
 *
 * Then each of `kept`, variables that aren't secret, e.g. a test case's `env`, is set to its value
 * there, over the image's.
 */
export function scrubbedEnvChanges(imageEnv: string[], containerNames: string[], kept: Record<string, string> = {}): string[] {
  const image = imageEnv.map((entry) => {
    const at = entry.indexOf("=");
    return at === -1 ? ([entry, ""] as const) : ([entry.slice(0, at), entry.slice(at + 1)] as const);
  });
  const imageNames = new Set(image.map(([variable]) => variable));
  const blanked = [...new Set(containerNames)].filter((variable) => variable !== "" && !imageNames.has(variable) && !Object.hasOwn(kept, variable));
  return [
    ...blanked.map((variable) => `ENV ${envWord(variable, variable)}=`),
    ...image.map(([variable, value]) => `ENV ${envWord(variable, variable)}=${envWord(value, variable)}`),
    ...Object.entries(kept).map(([variable, value]) => `ENV ${envWord(variable, variable)}=${envWord(value, variable)}`),
  ];
}

/**
 * Commits the stopped container `name` into the image `image`, with the entrypoint and command of
 * the image `like`, the one it ran from, so starting the new image doesn't run the container's
 * script again.
 *
 * Its environment is `like`'s, so it holds nothing from the time the container ran: `docker
 * commit` would otherwise save every variable the container was given, e.g. an agent's API key,
 * into the image's config, which is pushed with it. See scrubbedEnvChanges. Only the variables'
 * names are read from the container: their values never leave Docker.
 *
 * `kept`'s variables, which aren't secret, e.g. a test case's `env`, are set to their values over
 * that, so the image keeps them.
 *
 * Throws a DockerContainerError, also if `like`'s environment can't be written back.
 */
export async function commitContainer(
  name: string,
  image: string,
  like: string,
  runtime: DockerRuntime = localRuntime(),
  kept: Record<string, string> = {},
): Promise<void> {
  const inspected = await mustRun(["image", "inspect", "--format", IMAGE_CONFIG_FORMAT, like], runtime);
  const [entrypoint, cmd, env] = inspected.trim().split("\t");
  const containerNames = JSON.parse(await mustRun(["container", "inspect", "--format", ENV_NAMES_FORMAT, name], runtime)) as string[];
  // The image's own variables aren't secret: they're in `like`, and in its Dockerfile.
  const imageEnv = (JSON.parse(env ?? "null") as string[] | null) ?? [];
  // `ENTRYPOINT []` is ignored; `[""]` clears it.
  const changes = [
    `ENTRYPOINT ${entrypoint === "null" ? '[""]' : entrypoint}`,
    `CMD ${cmd === "null" ? '["sh"]' : cmd}`,
    ...scrubbedEnvChanges(imageEnv, containerNames, kept),
  ];
  const startedAt = Date.now();
  await mustRun(["commit", ...changes.flatMap((change) => ["--change", change]), name, image], runtime);
  // Only the names: the values of the image's variables are in the command, logged at debug.
  log.info({ container: name, image, variables: containerNames, ms: Date.now() - startedAt }, "committed container");
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



