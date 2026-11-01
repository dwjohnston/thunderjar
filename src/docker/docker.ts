// Everything Thunderjar asks of Docker goes through here: building images, and running a container
// from one, reading files out of it and committing it. It runs the `docker` CLI, or the
// executable THUNDERJAR_DOCKER names in its place: tests point that at src/testing/fakeDocker.ts.
import { $ } from "bun";

/** Thrown when the Docker CLI can't be run, or can't reach its daemon. */
export class DockerUnavailableError extends Error {}

/** Thrown when `docker build` fails: the message is Docker's reason. */
export class DockerBuildError extends Error {}

/** Thrown when running, reading from, committing or removing a container fails: the message is Docker's reason. */
export class DockerContainerError extends Error {}

const dockerBinary = () => Bun.env.THUNDERJAR_DOCKER || "docker";

/** The last line of a failed command's stderr: where Docker puts its reason. */
const reasonOf = (stderr: Buffer) => stderr.toString().trim().split("\n").at(-1);

/**
 * Builds the Dockerfile at the root of the build context `contextDir`, and tags the image `image`.
 * Throws a DockerBuildError if the build fails.
 */
export async function buildImage(contextDir: string, image: string): Promise<void> {
  const binary = dockerBinary();
  const result = await $`${binary} build -t ${image} ${contextDir}`.quiet().nothrow();
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

/** Runs `binary args…`, throwing a DockerContainerError with Docker's reason if it fails. */
async function mustRun(args: string[]): Promise<string> {
  const binary = dockerBinary();
  const result = await $`${binary} ${args}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new DockerContainerError(reasonOf(result.stderr) || `\`${binary} ${args[0]}\` exited ${result.exitCode}`);
  }
  return result.stdout.toString();
}

/**
 * Runs `script` with `sh -c`, in place of the image's entrypoint, in a new container `name` from
 * the local image `image`, and leaves the container once it stops. Its output is discarded.
 * Throws a DockerContainerError if the script, or Docker, fails.
 */
export async function runContainer(image: string, name: string, script: string): Promise<void> {
  await mustRun(["run", "--name", name, "--pull", "never", "--entrypoint", "sh", image, "-c", script]);
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
