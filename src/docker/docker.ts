// Everything Thunderjar asks of Docker goes through here. It runs the `docker` CLI, or the
// executable THUNDERJAR_DOCKER names in its place: tests point that at src/testing/fakeDocker.ts.
import { $ } from "bun";

/** Thrown when the Docker CLI can't be run, or can't reach its daemon. */
export class DockerUnavailableError extends Error {}

/** Thrown when `docker build` fails: the message is Docker's reason. */
export class DockerBuildError extends Error {}

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
