// Everything Thunderjar asks of Docker goes through here: building images, and running a container
// from one, reading files out of it, running commands in it and committing it. It runs the
// `docker` CLI, or the executable THUNDERJAR_DOCKER names in its place: tests point that at
// src/testing/fakeDocker.ts.
import { $ } from "bun";
import type { BuildOptions } from "../api/declarations.ts";

/** Thrown when the Docker CLI can't be run, or can't reach its daemon. */
export class DockerUnavailableError extends Error {}

/** Thrown when `docker build` fails: the message is Docker's reason. */
export class DockerBuildError extends Error {}

/** Thrown when `docker login` finds no valid login for a registry: the message is Docker's reason. */
export class DockerLoginError extends Error {}

/** Thrown when tagging or pushing an image fails: the message is Docker's reason. */
export class DockerPushError extends Error {}

/** Thrown when running, reading from, committing or removing a container fails: the message is Docker's reason. */
export class DockerContainerError extends Error {}

const dockerBinary = () => Bun.env.THUNDERJAR_DOCKER || "docker";

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
    throw new DockerBuildError(reasonOf(result.stderr) || `\`${binary} build\` exited ${result.exitCode}`);
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
export async function pushImage(image: string, reference: string): Promise<void> {
  const binary = dockerBinary();
  for (const args of [["tag", image, reference], ["push", "--quiet", reference]]) {
    const result = await $`${binary} ${args}`.quiet().nothrow();
    if (result.exitCode !== 0) {
      throw new DockerPushError(reasonOf(result.stderr) || `\`${binary} ${args[0]}\` exited ${result.exitCode}`);
    }
  }
}

/** Runs `binary args…`, throwing a DockerContainerError with Docker's reason if it fails. */
async function mustRun(args: string[]): Promise<string> {
  const binary = dockerBinary();
  const result = await $`${binary} ${args}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new DockerContainerError(reasonOf(result.stderr) || `\`${binary} ${args[0]}\` exited ${result.exitCode}`);
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
  { env = [], runOptions = [], timeoutSeconds }: { env?: string[]; runOptions?: string[]; timeoutSeconds?: number } = {},
): Promise<ContainerStop> {
  const binary = dockerBinary();
  const passed = env.flatMap((variable) => ["-e", variable]);
  const args = ["run", "--name", name, "--pull", "never", ...passed, ...runOptions, "--entrypoint", "sh", image, "-c", script];
  const child = Bun.spawn([binary, ...args], { env: { ...Bun.env }, stdin: "ignore", stdout: "ignore", stderr: "pipe" });
  let killing: Promise<number | undefined> | undefined;
  const timer =
    timeoutSeconds === undefined
      ? undefined
      : setTimeout(() => {
          const killedAt = Date.now();
          // If it finished just as the time ran out, there's nothing to kill: it didn't time out.
          killing = mustRun(["kill", name]).then(
            () => killedAt,
            () => undefined,
          );
        }, timeoutSeconds * 1000);
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
  clearTimeout(timer);
  const killedAt = await killing;
  if (killedAt !== undefined) return { timedOut: true, killedAt };
  if (exitCode !== 0) {
    throw new DockerContainerError(reasonOf(stderr) || `\`${binary} run\` exited ${exitCode}`);
  }
  return { timedOut: false };
}

/**
 * The text of the file at `path` in the container `name`, or undefined if there's no such file.
 * Throws a DockerContainerError if Docker fails otherwise.
 */
export async function readContainerFile(name: string, path: string): Promise<string | undefined> {
  const dir = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-cp-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  try {
    const binary = dockerBinary();
    const result = await $`${binary} cp ${`${name}:${path}`} ${dir}/file`.quiet().nothrow();
    if (result.exitCode !== 0) {
      const reason = reasonOf(result.stderr);
      if (reason?.includes("Could not find the file")) return undefined;
      throw new DockerContainerError(reason || `\`${binary} cp\` exited ${result.exitCode}`);
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
export async function commitContainer(name: string, image: string, like: string): Promise<void> {
  const inspected = await mustRun(["image", "inspect", "--format", "{{json .Config.Entrypoint}}\t{{json .Config.Cmd}}", like]);
  const [entrypoint, cmd] = inspected.trim().split("\t");
  // `ENTRYPOINT []` is ignored; `[""]` clears it.
  const changes = [`ENTRYPOINT ${entrypoint === "null" ? '[""]' : entrypoint}`, `CMD ${cmd === "null" ? '["sh"]' : cmd}`];
  await mustRun(["commit", ...changes.flatMap((change) => ["--change", change]), name, image]);
}

/** Removes the container `name`, stopped or not. Throws a DockerContainerError. */
export async function removeContainer(name: string): Promise<void> {
  await mustRun(["rm", "--force", name]);
}

/**
 * Starts a new container `name` from the local image `image`, in place of its entrypoint, that
 * keeps running, doing nothing, until it's removed: for `execInContainer`. Throws a
 * DockerContainerError.
 */
export async function startContainer(image: string, name: string): Promise<void> {
  await mustRun(["run", "--detach", "--name", name, "--pull", "never", "--entrypoint", "sh", image, "-c", "exec sleep 2147483647"]);
}

export type ExecResult = { stdout: string; stderr: string; exitCode: number };

/**
 * Runs `command` (a program and its arguments) in the running container `name`, in `workdir`, or
 * its image's working directory if undefined,
 * with `stdin` as its input if given, and returns how it went, however it exited. Throws a
 * DockerContainerError if Docker itself fails, e.g. there's no such container.
 */
export async function execInContainer(name: string, workdir: string | undefined, command: string[], stdin?: string): Promise<ExecResult> {
  const binary = dockerBinary();
  const args = ["exec", ...(stdin === undefined ? [] : ["--interactive"]), ...(workdir === undefined ? [] : ["--workdir", workdir]), name, ...command];
  const result =
    stdin === undefined
      ? await $`${binary} ${args}`.quiet().nothrow()
      : await $`${binary} ${args} < ${new Response(stdin)}`.quiet().nothrow();
  // `docker exec` exits as the command did, or 1 or 127 when Docker fails, saying why.
  if (result.exitCode !== 0 && /^(Error response from daemon|OCI runtime exec failed|Cannot connect to the Docker daemon)/.test(result.stderr.toString())) {
    throw new DockerContainerError(reasonOf(result.stderr) || `\`${binary} exec\` exited ${result.exitCode}`);
  }
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode };
}
