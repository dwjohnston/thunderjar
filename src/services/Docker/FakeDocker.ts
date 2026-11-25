import type { Clock } from "../Clock/Clock";
import type { ContainerProcess, Docker } from "./Docker";

/** What a scripted container is given: the fake clock, and `start()`, to print its start marker. */
export type ContainerScriptContext = { clock: Clock; name: string; args: string[]; start(): void };

/** A scripted container's behaviour: resolves to its exit code, or that and its stderr. */
export type ContainerScript = (context: ContainerScriptContext) => Promise<number | { exitCode: number; stderr: string }>;

/**
 * Docker in memory, on a fake clock. Only running containers is faked so far: `spawnRun`,
 * `killContainer` and `removeContainer`, which the real `runContainer` runs on. Each container runs
 * the script chosen by the end of its name; one with no script starts at once and exits 0. Every
 * other method throws.
 */
export class FakeDocker implements Docker {
  /** The containers `killContainer` was asked to kill, in order. */
  readonly killed: string[] = [];
  /** The containers `removeContainer` was asked to remove, in order. */
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

  spawnRun(args: string[], _startMarker?: string): ContainerProcess {
    const name = args[args.indexOf("--name") + 1] ?? "";
    const script = this.scripts.find(([suffix]) => name.endsWith(suffix))?.[1] ?? noScript;
    const started = Promise.withResolvers<void>();
    const ended = Promise.withResolvers<{ exitCode: number; stderr: string }>();
    const end = () => ended.resolve({ exitCode: KILLED, stderr: "" });
    this.enders.set(name, end);
    const ran = Promise.race([
      script({ clock: this.clock, name, args, start: () => started.resolve() }).then((result) => (typeof result === "number" ? { exitCode: result, stderr: "" } : result)),
      ended.promise,
    ]);
    return { started: started.promise, exited: ran.then((result) => result.exitCode), stderr: ran.then((result) => result.stderr), kill: end };
  }

  async killContainer(name: string): Promise<void> {
    this.killed.push(name);
    this.enders.get(name)?.();
  }

  async removeContainer(name: string): Promise<void> {
    this.removed.push(name);
    this.enders.get(name)?.();
  }

  build = notFaked("build");
  imagesIn = notFaked("imagesIn");
  removeLocalImage = notFaked("removeLocalImage");
  checkLogin = notFaked("checkLogin");
  login = notFaked("login");
  push = notFaked("push");
  pull = notFaked("pull");
  inRegistry = notFaked("inRegistry");
  run = notFaked("run");
  commit = notFaked("commit");
  removeContainersNamed = notFaked("removeContainersNamed");
  startDetached = notFaked("startDetached");
  stop = notFaked("stop");
  containerState = notFaked("containerState");
  readFile = notFaked("readFile");
  writeFile = notFaked("writeFile");
  followLogs = notFaked("followLogs");
  stderrTail = notFaked("stderrTail");
  openShellSession = notFaked("openShellSession");
  diskUsage = notFaked("diskUsage");
}

/** A method FakeDocker doesn't fake yet: it throws, so a test that reaches it says so. */
function notFaked(method: string): (..._args: unknown[]) => never {
  return () => {
    throw new Error(`FakeDocker: ${method} isn't faked yet`);
  };
}

const noScript: ContainerScript = async ({ start }) => {
  start();
  return 0;
};

/** The exit code of a process ended by SIGKILL. */
const KILLED = 137;
