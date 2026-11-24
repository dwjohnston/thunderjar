/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Docker, as a service. Code that asks Docker for something takes a DockerService, so a test can
// give it a FakeDockerService (src/fakes/fakeDockerService.ts), in memory. `cliDockerService`, in
// docker.ts, is the real one, over the `docker` CLI.
//
// It has the calls `build` makes. More methods arrive with the commands that need them.
import type { BuildOptions } from "../api/declarations.ts";

/** What an image is built from. The service assembles the build context: callers never touch a temporary folder. */
export type BuildContext = {
  /** The image's tag, e.g. `thunderjar-prerun:ded54607`. */
  image: string;
  /** The Dockerfile, at the context's root. */
  dockerfile: string;
  /**
   * Folders copied into the context, following symlinks: each `from`, an absolute path, if it
   * exists, to `to`, relative to the context's root.
   */
  folders: { from: string; to: string }[];
  /** Its secrets and SSH agent. */
  options?: BuildOptions;
};

export interface DockerService {
  /** The tagged images in `repository`, as `<repository>:<tag>`. Throws a DockerUnavailableError. */
  imagesIn(repository: string): Promise<Set<string>>;
  /** Builds and tags `context.image`. Throws a DockerBuildError. */
  build(context: BuildContext): Promise<void>;
  /**
   * Checks that Docker holds a valid login for the registry `host`. Always the local `docker`.
   * Throws a DockerLoginError, or a DockerUnavailableError.
   */
  checkLogin(host: string): Promise<void>;
  /** Tags `image` as `reference` and pushes it. Throws a DockerPushError. */
  push(image: string, reference: string): Promise<void>;
  /** The same Docker, with its commands sent to the daemon `command` reaches, e.g. `["docker", "--context", "cloud"]`. */
  on(command: string[]): DockerService;
}
