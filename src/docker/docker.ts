// Everything Thunderjar asks of Docker goes through here. It runs the `docker` CLI, or the
// executable THUNDERJAR_DOCKER names in its place: tests point that at src/testing/fakeDocker.ts.
import { $ } from "bun";

/** Thrown when the Docker CLI can't be run, or can't reach its daemon. */
export class DockerUnavailableError extends Error {}

const dockerBinary = () => Bun.env.THUNDERJAR_DOCKER || "docker";

/** The tagged images in `repository`, as `<repository>:<tag>`. Throws a DockerUnavailableError. */
export async function imagesIn(repository: string): Promise<Set<string>> {
  const binary = dockerBinary();
  const result = await $`${binary} image ls --format ${"{{.Repository}}:{{.Tag}}"} ${repository}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    const reason = result.stderr.toString().trim().split("\n").at(-1);
    throw new DockerUnavailableError(reason || `\`${binary} image ls\` exited ${result.exitCode}`);
  }
  return new Set(result.stdout.toString().split("\n").filter(Boolean));
}
