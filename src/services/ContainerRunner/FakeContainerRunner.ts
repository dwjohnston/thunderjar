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
  /** Ends each running container, by name, as Docker's SIGKILL would. */
  private readonly enders = new Map<string, () => void>();

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
    const ended = Promise.withResolvers<{ exitCode: number; stderr: string }>();
    this.enders.set(name, () => ended.resolve({ exitCode: KILLED, stderr: "" }));
    const ran = Promise.race([
      script({ clock: this.clock, name, args, start: () => started.resolve() }).then((result) => (typeof result === "number" ? { exitCode: result, stderr: "" } : result)),
      ended.promise,
    ]);
    return { started: started.promise, exited: ran.then((result) => result.exitCode), stderr: ran.then((result) => result.stderr), kill: () => {} };
  }

  async kill(name: string): Promise<void> {
    this.killed.push(name);
    this.enders.get(name)?.();
  }

  async remove(name: string): Promise<void> {
    this.removed.push(name);
    this.enders.get(name)?.();
  }
}

const noScript: ContainerScript = async ({ start }) => {
  start();
  return 0;
};

/** The exit code of a process ended by SIGKILL. */
const KILLED = 137;
