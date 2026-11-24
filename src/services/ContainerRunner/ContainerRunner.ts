/** A `docker run` process started by a ContainerRunner. */
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

/** What `runContainer` asks of Docker, so a test can pass a FakeContainerRunner in its place. */
export interface ContainerRunner {
  /** Starts `docker run` with `args`, the container's name among them. */
  spawn(args: string[], startMarker?: string): ContainerProcess;
  /** `docker kill`s the container `name`. */
  kill(name: string): Promise<void>;
  /** `docker rm --force`s the container `name`. */
  remove(name: string): Promise<void>;
}
