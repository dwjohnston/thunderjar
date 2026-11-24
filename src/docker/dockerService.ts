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
// It has the calls `build` and `run` make. More methods arrive with the commands that need them.
import type { BuildOptions } from "../api/declarations.ts";
import type { ShellSession } from "./shellSession.ts";

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

/**
 * A container to run: `script`, with `sh -c`, in place of the image's entrypoint, in a new
 * container `name` from the image `image`.
 */
export type RunSpec = {
  image: string;
  name: string;
  script: string;
  /**
   * Variables passed in by name, `-e NAME`, so Docker copies each value from the service's
   * environment, and the value is never on a command line.
   */
  env?: string[];
  /** More `docker run` options, before the image. */
  runOptions?: string[];
  /** Variables that aren't secret, passed with their values, after `runOptions`, so they win over one it sets. */
  setEnv?: Record<string, string>;
  /** More variables passed in by name, as `env`'s are, after `runOptions`. */
  secretEnv?: string[];
  /** A line `script` prints on stdout once it has started. */
  startMarker?: string;
};

/** A container started by `run`: like the `docker run` process that runs it. */
export type RunningContainer = {
  /** Resolves once the script prints its `startMarker`, or at once without one. Never, if it never does. */
  started: Promise<void>;
  /**
   * Resolves once `docker run` ends: its exit code, its stderr, and Docker's reason, from the
   * stderr, for when it failed.
   */
  exited: Promise<{ exitCode: number; stderr: string; reason: string }>;
  /** Stops waiting on it: ends the `docker run` that waits for it, not the container. */
  abandon(): void;
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
  /** Starts `spec`'s container. See runContainerOn, in docker.ts, for running one to its end. */
  run(spec: RunSpec): RunningContainer;
  /** `docker kill`. Throws a DockerContainerError: e.g. it "is not running", or "No such container". */
  kill(name: string): Promise<void>;
  /** The text of the file at `path` in the container `name`, or undefined if there's none. Throws a DockerContainerError. */
  readFile(name: string, path: string): Promise<string | undefined>;
  /**
   * Commits the stopped container `name` into `image`, with the entrypoint, command and
   * environment of the image `like`, and `kept`'s variables. Throws a DockerContainerError.
   */
  commit(name: string, image: string, like: string, kept?: Record<string, string>): Promise<void>;
  /** Removes the container `name`, stopped or not. Throws a DockerContainerError. */
  removeContainer(name: string): Promise<void>;
  /** Removes every container whose name starts with `prefix`, and returns their names. Throws a DockerContainerError. */
  removeContainersNamed(prefix: string): Promise<string[]>;
  /**
   * Starts the container `name` from `image`, running a shell session, with `env`'s variables
   * passed in by name. Throws a DockerContainerError.
   */
  openShellSession(image: string, name: string, env?: string[]): Promise<ShellSession>;
  /** The same Docker, with its commands sent to the daemon `command` reaches, e.g. `["docker", "--context", "cloud"]`. */
  on(command: string[]): DockerService;
}
