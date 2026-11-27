// What Thunderjar asks of Docker. Two interfaces, while code moves from one to the other:
//
// - `Docker`, the old path: the functions in src/docker/ as one service, so a test can pass a
//   FakeDocker in their place. The types each method takes and returns live here, and src/docker/
//   re-exports them under their old names.
// - `DockerService`, the new path: what `runNext` uses. There
//   are two, built in src/cli/index.ts: `hostDocker` and `runtimeDocker` (see src/cli/HUMANS.md).

import {
  buildImage,
  checkLogin,
  commitContainer,
  diskUsage,
  type DockerRuntime,
  imagesIn,
  inRegistry,
  pullImage,
  pushImage,
  readContainerFile,
  removeContainer,
  removeContainersNamed,
  runContainer,
} from "../../docker/docker.ts";
import { openShellSession } from "../../docker/shellSession.ts";


/** A `docker run` process started by `Docker.spawnRun`. */
export type ContainerProcess = {
  /** Resolves once the start marker is seen on its stdout. Never resolves if it isn't. */
  started: Promise<void>;
  /** Its exit code. */
  exited: Promise<number>;
  /** Its stderr, once it's done writing it. */
  stderr: Promise<string>;
  /** SIGKILLs the `docker run` process, not the container. */
  kill(): void;
};

/** What `build` is given: the build's secrets, by the variables they're read from, and whether it gets the SSH agent. */
export type ImageBuildOptions = { secrets?: { id: string; env: string }[]; ssh?: boolean };

/** How removing one local image went: removed, already gone, or failed, with Docker's reason. */
export type LocalRemoval = { outcome: "deleted" | "absent" } | { outcome: "failed"; reason: string };

/** How a container run by `run` stopped. */
export type ContainerStop =
  | { outcome: "exited" }
  | { outcome: "timedOut"; /** Epoch ms, when it was killed. */ killedAt: number }
  | {
      /** It never started: `docker run` failed, or gave no sign of starting in time, before its script did. */
      outcome: "notStarted";
      reason: string;
      /** Epoch ms, when `docker run` was started, and when it was given up on. */
      spawnedAt: number;
      gaveUpAt: number;
    };

/** What `run` is given, besides the image, the container's name and its script. See `runContainer` in src/docker/docker.ts. */
export type RunContainerOptions = {
  env?: string[];
  runOptions?: string[];
  setEnv?: Record<string, string>;
  secretEnv?: string[];
  timeoutSeconds?: number;
  startMarker?: string;
};

/** Whether a container is running, and the code it exited with if not. */

export type ExecResult = { stdout: string; stderr: string; exitCode: number };

/** A shell session in a running container. */
export type ShellSession = {
  /** The image's working directory, where each command runs. */
  workdir: string;
  /** Runs `command` with `sh`, with `stdin` as its input, after any command already sent. Throws a DockerContainerError if the session has ended. */
  run(command: string, stdin?: string): Promise<ExecResult>;
  /** Ends the session: its container is removed. */
  close(): Promise<void>;
};

/**
 * Everything Thunderjar asks of Docker, each method one of src/docker/'s functions, with the
 * runtime bound when the service is built. See those functions for what each does and throws.
 *
 * Commands that pass variables by name, `-e NAME` (`run`, `openShellSession`, and `build`'s
 * secrets), have Docker copy their values from Thunderjar's own environment: the real one spawns
 * `docker` with `Bun.env`. Once `Env` is wired in, the real one will need to take `Env.variables`
 * and spawn `docker` with those instead.
 */
export interface Docker {
  // Images

  /** `buildImage`: builds the Dockerfile in `contextDir`, tagged `image`. */
  build(contextDir: string, image: string, options?: ImageBuildOptions): Promise<void>;
  /** The tagged images in `repository`, as `<repository>:<tag>`. */
  imagesIn(repository: string): Promise<Set<string>>;
  /** Removes the tag `image` from the local daemon, whatever the runtime. */
  removeLocalImage(image: string): Promise<LocalRemoval>;

  // Registry: `checkLogin` and `inRegistry` use the local `docker` CLI, whatever the runtime.

  checkLogin(host: string): Promise<void>;
  /** `pushImage`: tags `image` as `reference`, and pushes it. */
  push(image: string, reference: string): Promise<void>;
  /** `pullImage`. */
  pull(reference: string): Promise<void>;
  inRegistry(reference: string): Promise<boolean>;

  // Containers

  /** `runContainer`: runs `script` in a new container `name` from `image`, until it stops or times out. */
  run(image: string, name: string, script: string, options?: RunContainerOptions): Promise<ContainerStop>;
  /** `commitContainer`. */
  commit(name: string, image: string, like: string, kept?: Record<string, string>): Promise<void>;
  /** `docker rm --force`s the container `name`. */
  removeContainer(name: string): Promise<void>;
  removeContainersNamed(prefix: string): Promise<string[]>;

  // The steps of `run`, so a fake can stand in for them under the real `runContainer`.

  /** Starts `docker run` with `args`, the container's name among them. */
  spawnRun(args: string[], startMarker?: string): ContainerProcess;
  /** `docker kill`s the container `name`. */
  killContainer(name: string): Promise<void>;

  // Container files and output

  /** `readContainerFile`. */
  readFile(name: string, path: string): Promise<string | undefined>;

  // Interactive

  openShellSession(image: string, name: string, env?: string[]): Promise<ShellSession>;

  // Daemon

  diskUsage(): Promise<string[]>;
}

/** The part of Docker that `runContainer` runs on: what it spawns, kills and removes. */
export type ContainerRuns = Pick<Docker, "spawnRun" | "killContainer" | "removeContainer">;

/**
 * Docker on the new path: what `runNext` asks of one daemon. There are two, built in
 * src/cli/index.ts: `hostDocker` and `runtimeDocker` (see src/cli/HUMANS.md). `checkLogin` and
 * `inRegistry` are asked of the host's; everything else of the runtime's.
 */
export interface DockerService
  extends Pick<
    Docker,
    | "build"
    | "imagesIn"
    | "checkLogin"
    | "push"
    | "pull"
    | "inRegistry"
    | "run"
    | "commit"
    | "removeContainer"
    | "removeContainersNamed"
    | "readFile"
    | "openShellSession"
    | "diskUsage"
  > {
  /** The command it runs Docker with, e.g. `["docker"]`: for messages and logs only. */
  readonly command: readonly string[];
}

/**
 * Docker reached by running `command`, e.g. `["docker"]`, or a runtime's `["docker", "--context", "cloud"]`.
 * A `remote` one may pull an image its `run` is given; a local one never does.
 */
export function createDockerService(command: string[], { remote = false }: { remote?: boolean } = {}): DockerService {
  const runtime: DockerRuntime = { command, pull: remote ? "missing" : "never" };
  return {
    command,
    build: (contextDir, image, options) => buildImage(contextDir, image, options, runtime),
    imagesIn: (repository) => imagesIn(repository, runtime),
    checkLogin: (host) => checkLogin(host),
    push: (image, reference) => pushImage(image, reference, runtime),
    pull: (reference) => pullImage(reference, runtime),
    inRegistry: (reference) => inRegistry(reference),
    run: (image, name, script, options) => runContainer(image, name, script, { ...options, runtime }),
    commit: (name, image, like, kept) => commitContainer(name, image, like, runtime, kept),
    removeContainer: (name) => removeContainer(name, runtime),
    removeContainersNamed: (prefix) => removeContainersNamed(prefix, runtime),
    readFile: (name, path) => readContainerFile(name, path, runtime),
    openShellSession: (image, name, env) => openShellSession(image, name, runtime, env),
    diskUsage: () => diskUsage(runtime),
  };
}
