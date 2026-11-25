export type { ContainerProcess } from "../Docker/Docker";
import type { ContainerProcess } from "../Docker/Docker";

/**
 * @deprecated Folded into Docker: `spawn`, `kill` and `remove` are its `spawnRun`, `killContainer`
 * and `removeContainer`. Kept only while runContainer.humans.test.ts passes a FakeContainerRunner.
 */
export interface ContainerRunner {
  /** Starts `docker run` with `args`, the container's name among them. */
  spawn(args: string[], startMarker?: string): ContainerProcess;
  /** `docker kill`s the container `name`. */
  kill(name: string): Promise<void>;
  /** `docker rm --force`s the container `name`. */
  remove(name: string): Promise<void>;
}
