import type { ContainerProcess } from "../Docker/Docker";
import { FakeDocker } from "../Docker/FakeDocker";
import type { ContainerRunner } from "./ContainerRunner";

export type { ContainerScript, ContainerScriptContext } from "../Docker/FakeDocker";

/**
 * @deprecated Use FakeDocker. A FakeDocker under ContainerRunner's names, kept only while
 * FakeContainerRunner.humans.test.ts and runContainer.humans.test.ts use it.
 */
export class FakeContainerRunner extends FakeDocker implements ContainerRunner {
  spawn(args: string[], startMarker?: string): ContainerProcess {
    return this.spawnRun(args, startMarker);
  }

  kill(name: string): Promise<void> {
    return this.killContainer(name);
  }

  remove(name: string): Promise<void> {
    return this.removeContainer(name);
  }
}
