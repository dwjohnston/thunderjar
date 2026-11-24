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
  private readonly scripts: [string, ContainerScript][] = [];

  constructor(private readonly clock: Clock) {}

  /** Runs `script` for each container whose name ends in `suffix`. */
  on(suffix: string, script: ContainerScript): this {
    this.scripts.push([suffix, script]);
    return this;
  }

  spawn(args: string[], _startMarker?: string): ContainerProcess {
    const name = args[args.indexOf("--name") + 1] ?? "";
    const script = this.scripts.find(([suffix]) => name.endsWith(suffix))?.[1] ?? noScript;
    const started = Promise.withResolvers<void>();
    const ran = script({ clock: this.clock, name, args, start: () => started.resolve() }).then((result) =>
      typeof result === "number" ? { exitCode: result, stderr: "" } : result,
    );
    return { started: started.promise, exited: ran.then((result) => result.exitCode), stderr: ran.then((result) => result.stderr), kill: () => {} };
  }

  async kill(_name: string): Promise<void> {}

  async remove(_name: string): Promise<void> {}
}

const noScript: ContainerScript = async ({ start }) => {
  start();
  return 0;
};
