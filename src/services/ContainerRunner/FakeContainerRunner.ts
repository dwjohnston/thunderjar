import type { Clock } from "../Clock/Clock";
import type { ContainerProcess, ContainerRunner } from "./ContainerRunner";

/** What a scripted container is given: the fake clock, and `start()`, to print its start marker. */
export type ContainerScriptContext = { clock: Clock; name: string; args: string[]; start(): void };

/** A scripted container's behaviour: resolves to its exit code, or that and its stderr. */
export type ContainerScript = (context: ContainerScriptContext) => Promise<number | { exitCode: number; stderr: string }>;

/**
 * A ContainerRunner whose containers run scripts on a fake clock, chosen by the end of their name.
 * One with no script starts at once and exits 0.
 */
export class FakeContainerRunner implements ContainerRunner {
  readonly killed: string[] = [];
  readonly removed: string[] = [];

  constructor(private readonly clock: Clock) {}

  /** Runs `script` for each container whose name ends in `suffix`. */
  on(_suffix: string, _script: ContainerScript): this {
    return this;
  }

  spawn(_args: string[], _startMarker?: string): ContainerProcess {
    return { started: Promise.resolve(), exited: Promise.resolve(1), stderr: Promise.resolve(""), kill: () => {} };
  }

  async kill(_name: string): Promise<void> {}

  async remove(_name: string): Promise<void> {}
}
