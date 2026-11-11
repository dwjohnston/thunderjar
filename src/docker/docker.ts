// Everything Thunderjar asks of Docker goes through here: building images, and running a container
// from one, reading files out of it, running commands in it and committing it. It runs the
// `docker` CLI, or the executable THUNDERJAR_DOCKER names in its place: tests point that at
// src/testing/fakeDocker.ts.
//
// Container commands can go to a runtime instead: a command that takes the `docker` CLI's
// arguments, e.g. `docker --context cloud`. Builds, and pushes of prerun images, are always local.
import { $ } from "bun";
import type { BuildOptions } from "../api/declarations.ts";

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

/** The last line of a failed command's stderr: where Docker puts its reason. */
const reasonOf = (stderr: { toString(): string }) => stderr.toString().trim().split("\n").at(-1);

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
  const result = await $`${binary} build ${secrets} ${ssh} -t ${image} ${contextDir}`.env({ ...Bun.env, DOCKER_BUILDKIT: "1" }).quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new DockerBuildError(reasonOf(result.stderr) || `\`${binary} build\` exited ${result.exitCode}`, image);
  }
}

/** The tagged images in `repository`, as `<repository>:<tag>`. Throws a DockerUnavailableError. */
export async function imagesIn(repository: string): Promise<Set<string>> {
  const binary = dockerBinary();
  const result = await $`${binary} image ls --format ${"{{.Repository}}:{{.Tag}}"} ${repository}`.quiet().nothrow();
  if (result.exitCode !== 0) {
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
  for (const args of [["tag", image, reference], ["push", "--quiet", reference]]) {
    const result = await $`${runtime.command} ${args}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      throw new DockerPushError(reasonOf(result.stderr) || `${named(runtime, args[0])} exited ${result.exitCode}`, reference);
    }
  }
}

/**
 * Pulls `reference` from its registry into `runtime`. Throws a DockerPullError with Docker's
 * reason, e.g. that the runtime can't reach the registry or has no login for it.
 */
export async function pullImage(reference: string, runtime: DockerRuntime): Promise<void> {
  const result = await $`${runtime.command} pull --quiet ${reference}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new DockerPullError(reasonOf(result.stderr) || `${named(runtime, "pull")} exited ${result.exitCode}`, reference);
  }
}

/** Runs `binary args…`, throwing a DockerContainerError with Docker's reason if it fails. */
async function mustRun(args: string[], runtime: DockerRuntime = localRuntime()): Promise<string> {
  const result = await $`${runtime.command} ${args}`.quiet().nothrow();
  if (result.exitCode !== 0) {
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
  const child = Bun.spawn([...runtime.command, ...args], { env: { ...Bun.env }, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  let killing: Promise<number | undefined> | undefined;
  const timer =
    timeoutSeconds === undefined
      ? undefined
      : setTimeout(() => {
          const killedAt = Date.now();
          // If it finished just as the time ran out, there's nothing to kill: it didn't time out.
          killing = mustRun(["kill", name], runtime).then(
            () => killedAt,
            () => undefined,
          );
        }, timeoutSeconds * 1000);
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  clearTimeout(timer);
  const killedAt = await killing;
  if (killedAt !== undefined) return { timedOut: true, killedAt };
  if (exitCode !== 0) {
    throw new DockerContainerError(reasonOf(stderr) || `${named(runtime, "run")} exited ${exitCode}`);
  }
  return { timedOut: false };
}

/**
 * The text of the file at `path` in the container `name`, or undefined if there's no such file.
 * Throws a DockerContainerError if Docker fails otherwise.
 */
export async function readContainerFile(name: string, path: string, runtime: DockerRuntime = localRuntime()): Promise<string | undefined> {
  const dir = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-cp-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  try {
    const result = await $`${runtime.command} cp ${`${name}:${path}`} ${dir}/file`.quiet().nothrow();
    if (result.exitCode !== 0) {
      const reason = reasonOf(result.stderr);
      if (reason?.includes("Could not find the file")) return undefined;
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
  await mustRun(["commit", ...changes.flatMap((change) => ["--change", change]), name, image], runtime);
}

/** Removes the container `name`, stopped or not. Throws a DockerContainerError. */
export async function removeContainer(name: string, runtime: DockerRuntime = localRuntime()): Promise<void> {
  await mustRun(["rm", "--force", name], runtime);
}

/**
 * Starts a new container `name` from the local image `image`, in place of its entrypoint, that
 * keeps running, doing nothing, until it's removed: for `execInContainer`. Throws a
 * DockerContainerError.
 */
export async function startContainer(image: string, name: string, runtime: DockerRuntime = localRuntime()): Promise<void> {
  await mustRun(["run", "--detach", "--name", name, "--pull", runtime.pull, "--entrypoint", "sh", image, "-c", "exec sleep 2147483647"], runtime);
}

export type ExecResult = { stdout: string; stderr: string; exitCode: number };

/**
 * Runs `command` (a program and its arguments) in the running container `name`, in `workdir`,
 * with `stdin` as its input if given, and returns how it went, however it exited. Throws a
 * DockerContainerError if Docker itself fails, e.g. there's no such container.
 */
export async function execInContainer(
  name: string,
  workdir: string,
  command: string[],
  stdin?: string,
  runtime: DockerRuntime = localRuntime(),
): Promise<ExecResult> {
  const binary = runtime.command;
  const args = ["exec", ...(stdin === undefined ? [] : ["--interactive"]), "--workdir", workdir, name, ...command];
  const result =
    stdin === undefined
      ? await $`${binary} ${args}`.quiet().nothrow()
      : await $`${binary} ${args} < ${new Response(stdin)}`.quiet().nothrow();
  // `docker exec` exits as the command did, or 1 or 127 when Docker fails, saying why.
  if (result.exitCode !== 0 && /^(Error response from daemon|OCI runtime exec failed|Cannot connect to the Docker daemon)/.test(result.stderr.toString())) {
    throw new DockerContainerError(reasonOf(result.stderr) || `${named(runtime, "exec")} exited ${result.exitCode}`);
  }
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode };
}
