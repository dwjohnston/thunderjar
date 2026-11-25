import type { Clock, TimerHandle } from "../Clock/Clock";
import type { ContainerProcess, ContainerState, ContainerStop, Docker, ExecResult, ImageBuildOptions, LocalRemoval, RunContainerOptions, ShellSession } from "./Docker";
import { DockerBuildError, DockerContainerError, DockerLoginError, DockerPullError, DockerPushError } from "./errors";
import { FakeRegistry, type ImageFiles } from "./FakeRegistry";

/**
 * What a scripted container is given: the fake clock; `start()`, to print its start marker; what it
 * was run from and with; and `read` and `write`, for the files in its container.
 */
export type ContainerScriptContext = {
  clock: Clock;
  name: string;
  /** `spawnRun`'s arguments. For a container started by `run`: `run --name <name> <image> -c <script>`. */
  args: string[];
  /** The image it was run from, and the script and options `run` was given. Empty for one started by `spawnRun`. */
  image: string;
  script: string;
  options: RunContainerOptions;
  start(): void;
  /** A file in its container: the image's, or one written since. */
  read(path: string): string | undefined;
  /** Leaves a file in its container. Nothing is written once the container has ended, e.g. after it was killed. */
  write(path: string, text: string): void;
};

/** A scripted container's behaviour: resolves to its exit code, or that and its stderr. */
export type ContainerScript = (context: ContainerScriptContext) => Promise<number | { exitCode: number; stderr: string }>;

/** What a shell handler is given besides the command: the session it was sent to, and its container's files. */
export type ShellContext = {
  image: string;
  name: string;
  env: string[];
  stdin: string;
  read(path: string): string | undefined;
  write(path: string, text: string): void;
};

/** Answers a command sent to a shell session, or returns undefined to leave it to the next handler. */
export type ShellHandler = (command: string, context: ShellContext) => ExecResult | undefined | Promise<ExecResult | undefined>;

/** A container as a test sees it. */
export type FakeContainer = { name: string; image: string; script: string; options: RunContainerOptions; files: ImageFiles; running: boolean; exitCode: number };

/** A shell session that was opened, and what was sent to it. */
export type FakeShell = { image: string; name: string; env: string[]; commands: { command: string; stdin: string }[]; closed: boolean };

type Ended = { exitCode: number; stderr: string };

type Container = {
  name: string;
  image: string;
  script: string;
  options: RunContainerOptions;
  files: Map<string, string>;
  running: boolean;
  exitCode: number;
  /** Its output: what `followLogs` and `stderrTail` give. */
  logs: string[];
  ended: PromiseWithResolvers<Ended>;
};

/**
 * Docker in memory, on a fake clock: one daemon's images and containers, over a FakeRegistry that
 * other FakeDockers can share. Nothing is built or run for real:
 *
 * - an image is a name and the files it holds: `addImage` or `build` puts one here;
 * - a container runs the script chosen by the end of its name (`on`); one with no script starts at
 *   once and exits 0. It stays, with its files, until it is removed;
 * - a shell session answers from `onShell`'s handlers.
 *
 * Every call is kept in `calls`. `run` stops as the real `runContainer` does; `spawnRun`,
 * `killContainer` and `removeContainer` are its steps, which the real one can be run on.
 */
export class FakeDocker implements Docker {
  /** Every call, in order, with its arguments, defaults filled in. */
  readonly calls: { method: keyof Docker; args: unknown[] }[] = [];
  /** Every build asked for, in order, the failed ones too. */
  readonly builds: { contextDir: string; image: string; options: ImageBuildOptions }[] = [];
  /** The containers `killContainer` was asked to kill, in order. */
  readonly killed: string[] = [];
  /** The containers `removeContainer` was asked to remove, in order. */
  readonly removed: string[] = [];
  /** Every shell session opened, in order. */
  readonly shells: FakeShell[] = [];
  private readonly scripts: [string, ContainerScript][] = [];
  private readonly shellHandlers: ShellHandler[] = [];
  private readonly stored = new Map<string, ImageFiles>();
  private readonly running = new Map<string, Container>();
  private readonly failedBuilds = new Map<string, string>();
  private readonly failedPushes = new Map<string, string>();
  private readonly failures = new Map<keyof Docker, Error>();
  private readonly loggedOut = new Set<string>();
  private readonly durations = new Map<"build" | "push" | "pull", number>();

  constructor(
    private readonly clock: Clock,
    /** The registry it pushes to and pulls from. Its own, unless one is given to share. */
    readonly registry: FakeRegistry = new FakeRegistry(),
  ) {}

  // Setting it up

  /** Runs `script` for each container whose name ends in `suffix`. The first that matches wins. */
  on(suffix: string, script: ContainerScript): this {
    this.scripts.push([suffix, script]);
    return this;
  }

  /** Answers shell session commands with `handler`. With several, the first to return a result wins. */
  onShell(handler: ShellHandler): this {
    this.shellHandlers.push(handler);
    return this;
  }

  /** Puts an image on this daemon, holding `files`. */
  addImage(name: string, files: ImageFiles = {}): this {
    this.stored.set(name, { ...files });
    return this;
  }

  /** Makes each build of `image` throw a DockerBuildError. */
  failBuild(image: string, message: string): this {
    this.failedBuilds.set(image, message);
    return this;
  }

  /** Makes each push to `reference` throw a DockerPushError. */
  failPush(reference: string, message: string): this {
    this.failedPushes.set(reference, message);
    return this;
  }

  /** Makes every call of `method` throw `error`, e.g. a daemon that went away. `undefined` clears it. */
  failOn(method: keyof Docker, error: Error | undefined): this {
    if (error === undefined) this.failures.delete(method);
    else this.failures.set(method, error);
    return this;
  }

  /** Makes each build, push or pull take `ms` on the clock, so several can be seen to overlap. */
  takes(method: "build" | "push" | "pull", ms: number): this {
    this.durations.set(method, ms);
    return this;
  }

  /** Makes `checkLogin(host)` throw a DockerLoginError, until `login`. */
  logOut(host: string): this {
    this.loggedOut.add(host);
    return this;
  }

  /** Adds lines to a container's output. */
  log(name: string, ...lines: string[]): this {
    this.running.get(name)?.logs.push(...lines);
    return this;
  }

  // Looking at it

  /** The images on this daemon, in the order each first arrived. */
  images(): string[] {
    return [...this.stored.keys()];
  }

  /** The files `image` holds, or undefined if it isn't on this daemon. */
  imageFiles(image: string): ImageFiles | undefined {
    const files = this.stored.get(image);
    return files === undefined ? undefined : { ...files };
  }

  /** The names of the containers on this daemon, running or stopped, in the order they were started. */
  containers(): string[] {
    return [...this.running.keys()];
  }

  container(name: string): FakeContainer | undefined {
    const container = this.running.get(name);
    if (container === undefined) return undefined;
    const { image, script, options, running, exitCode } = container;
    return { name, image, script, options, files: Object.fromEntries(container.files), running, exitCode };
  }

  /** The arguments of each call of `method`, in order. */
  called(method: keyof Docker): unknown[][] {
    return this.calls.filter((call) => call.method === method).map((call) => call.args);
  }

  // Images

  async build(contextDir: string, image: string, options: ImageBuildOptions = {}): Promise<void> {
    this.record("build", contextDir, image, options);
    this.builds.push({ contextDir, image, options });
    await this.spend("build");
    const failure = this.failedBuilds.get(image);
    if (failure !== undefined) throw new DockerBuildError(failure, image);
    this.addImage(image);
  }

  async imagesIn(repository: string): Promise<Set<string>> {
    this.record("imagesIn", repository);
    return new Set(this.images().filter((image) => image.startsWith(`${repository}:`)));
  }

  async removeLocalImage(image: string): Promise<LocalRemoval> {
    this.record("removeLocalImage", image);
    return { outcome: this.stored.delete(image) ? "deleted" : "absent" };
  }

  // Registry

  async checkLogin(host: string): Promise<void> {
    this.record("checkLogin", host);
    if (this.loggedOut.has(host)) throw new DockerLoginError(`not logged in to ${host}`);
  }

  async login(host: string, username: string, password: string): Promise<void> {
    this.record("login", host, username, password);
    this.loggedOut.delete(host);
  }

  async push(image: string, reference: string): Promise<void> {
    this.record("push", image, reference);
    const files = this.stored.get(image);
    if (files === undefined) throw new DockerPushError(`No such image: ${image}`, reference);
    await this.spend("push");
    const failure = this.failedPushes.get(reference);
    if (failure !== undefined) throw new DockerPushError(failure, reference);
    this.addImage(reference, files);
    this.registry.add(reference, files);
  }

  async pull(reference: string): Promise<void> {
    this.record("pull", reference);
    await this.spend("pull");
    const files = this.registry.files(reference);
    if (files === undefined) throw new DockerPullError(`manifest for ${reference} not found`, reference);
    this.addImage(reference, files);
  }

  async inRegistry(reference: string): Promise<boolean> {
    this.record("inRegistry", reference);
    return this.registry.has(reference);
  }

  // Containers

  async run(image: string, name: string, script: string, options: RunContainerOptions = {}): Promise<ContainerStop> {
    this.record("run", image, name, script, options);
    const spawnedAt = this.clock.now();
    const notStarted = (reason: string): ContainerStop => ({ outcome: "notStarted", reason, spawnedAt, gaveUpAt: this.clock.now() });
    const files = this.stored.get(image);
    if (files === undefined) return notStarted(`No such image: ${image}`);
    if (this.running.has(name)) return notStarted(`The container name "${name}" is already in use`);
    const container = this.create(name, image, script, options, files);

    let started = options.startMarker === undefined;
    let gaveUp: string | undefined;
    let killedAt: number | undefined;
    let timer: TimerHandle | undefined;
    const timeOut = () =>
      options.timeoutSeconds === undefined
        ? undefined
        : this.clock.setTimeout(() => {
            killedAt = this.clock.now();
            this.finish(container, KILLED);
          }, options.timeoutSeconds * 1000);
    // As the real one: without a start marker it counts as started at once, and with one it is
    // given up on, and removed, if the marker doesn't come.
    if (started) {
      timer = timeOut();
    } else {
      timer = this.clock.setTimeout(() => {
        gaveUp = `it didn't start within ${START_TIMEOUT_SECONDS}s`;
        this.finish(container, KILLED);
        this.running.delete(name);
      }, START_TIMEOUT_SECONDS * 1000);
    }
    const process = this.start(container, ["run", "--name", name, image, "-c", script], () => {
      if (started || gaveUp !== undefined) return;
      started = true;
      this.clock.clearTimeout(timer);
      timer = timeOut();
    });
    try {
      const exitCode = await process.exited;
      const stderr = await process.stderr;
      if (gaveUp !== undefined || (!started && exitCode !== 0)) return notStarted(gaveUp ?? (stderr || `docker run exited ${exitCode}`));
      if (killedAt !== undefined) return { outcome: "timedOut", killedAt };
      if (exitCode !== 0) throw new DockerContainerError(stderr || `docker run exited ${exitCode}`);
      return { outcome: "exited" };
    } finally {
      this.clock.clearTimeout(timer);
    }
  }

  async commit(name: string, image: string, like: string, kept: Record<string, string> = {}): Promise<void> {
    this.record("commit", name, image, like, kept);
    this.addImage(image, Object.fromEntries(this.existing(name).files));
  }

  async removeContainer(name: string): Promise<void> {
    this.record("removeContainer", name);
    this.removed.push(name);
    this.discard(name);
  }

  async removeContainersNamed(prefix: string): Promise<string[]> {
    this.record("removeContainersNamed", prefix);
    const names = this.containers().filter((name) => name.startsWith(prefix));
    for (const name of names) this.discard(name);
    return names;
  }

  /** Runs until it is stopped, killed or removed. As a runtime does, it pulls an image it doesn't have. */
  async startDetached(image: string, name: string, runOptions: string[]): Promise<void> {
    this.record("startDetached", image, name, runOptions);
    if (!this.stored.has(image)) {
      const files = this.registry.files(image);
      if (files === undefined) throw new DockerPullError(`manifest for ${image} not found`, image);
      this.addImage(image, files);
    }
    if (this.running.has(name)) throw new DockerContainerError(`The container name "${name}" is already in use`);
    this.create(name, image, "", { runOptions }, this.stored.get(image) ?? {});
  }

  async stop(name: string, graceSeconds: number): Promise<void> {
    this.record("stop", name, graceSeconds);
    const container = this.running.get(name);
    if (container !== undefined) this.finish(container, { exitCode: 0, stderr: "" });
  }

  async containerState(name: string): Promise<ContainerState | undefined> {
    this.record("containerState", name);
    const container = this.running.get(name);
    return container === undefined ? undefined : { running: container.running, exitCode: container.exitCode };
  }

  // The steps of `run`

  spawnRun(args: string[], _startMarker?: string): ContainerProcess {
    this.record("spawnRun", args);
    const name = args[args.indexOf("--name") + 1] ?? "";
    return this.start(this.create(name, "", "", {}, {}), args, () => {});
  }

  async killContainer(name: string): Promise<void> {
    this.record("killContainer", name);
    this.killed.push(name);
    const container = this.running.get(name);
    if (container !== undefined) this.finish(container, KILLED);
  }

  // Container files and output

  async readFile(name: string, path: string): Promise<string | undefined> {
    this.record("readFile", name, path);
    return this.existing(name).files.get(path);
  }

  async writeFile(name: string, path: string, text: string): Promise<void> {
    this.record("writeFile", name, path, text);
    this.existing(name).files.set(path, text);
  }

  /** Gives `onLine` the container's output so far, then resolves to its exit code once it ends, or `signal` aborts. */
  async followLogs(name: string, onLine: (line: string) => void, signal?: AbortSignal): Promise<number> {
    this.record("followLogs", name);
    const container = this.existing(name);
    for (const line of container.logs) onLine(line);
    const aborted = Promise.withResolvers<void>();
    signal?.addEventListener("abort", () => aborted.resolve(), { once: true });
    if (signal?.aborted !== true) await Promise.race([container.ended.promise, aborted.promise]);
    return container.exitCode;
  }

  async stderrTail(name: string, lines = 20): Promise<string> {
    this.record("stderrTail", name, lines);
    return (this.running.get(name)?.logs ?? []).slice(-lines).join("\n");
  }

  // Interactive

  async openShellSession(image: string, name: string, env: string[] = []): Promise<ShellSession> {
    this.record("openShellSession", image, name, env);
    const stored = this.stored.get(image);
    if (stored === undefined) throw new DockerContainerError(`No such image: ${image}`);
    const files = new Map(Object.entries(stored));
    const shell: FakeShell = { image, name, env, commands: [], closed: false };
    this.shells.push(shell);
    return {
      workdir: "/workspace",
      run: async (command, stdin = "") => {
        if (shell.closed) throw new DockerContainerError(`the shell session in ${name} has ended`);
        shell.commands.push({ command, stdin });
        const context: ShellContext = { image, name, env, stdin, read: (path) => files.get(path), write: (path, text) => void files.set(path, text) };
        for (const handler of this.shellHandlers) {
          const result = await handler(command, context);
          if (result !== undefined) return result;
        }
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      close: async () => {
        shell.closed = true;
      },
    };
  }

  // Daemon

  async diskUsage(): Promise<string[]> {
    this.record("diskUsage");
    return [];
  }

  /** Logs the call, and throws if `failOn` said this method should. */
  private record(method: keyof Docker, ...args: unknown[]): void {
    this.calls.push({ method, args });
    const failure = this.failures.get(method);
    if (failure !== undefined) throw failure;
  }

  private async spend(method: "build" | "push" | "pull"): Promise<void> {
    const ms = this.durations.get(method) ?? 0;
    if (ms > 0) await this.clock.sleep(ms);
  }

  private existing(name: string): Container {
    const container = this.running.get(name);
    if (container === undefined) throw new DockerContainerError(`No such container: ${name}`);
    return container;
  }

  private create(name: string, image: string, script: string, options: RunContainerOptions, files: ImageFiles): Container {
    const container: Container = { name, image, script, options, files: new Map(Object.entries(files)), running: true, exitCode: 0, logs: [], ended: Promise.withResolvers() };
    this.running.set(name, container);
    return container;
  }

  /** Ends a container, once: as it exited, or as Docker's SIGKILL would. */
  private finish(container: Container, ended: Ended): void {
    if (!container.running) return;
    container.running = false;
    container.exitCode = ended.exitCode;
    container.ended.resolve(ended);
  }

  private discard(name: string): void {
    const container = this.running.get(name);
    if (container === undefined) return;
    this.finish(container, KILLED);
    this.running.delete(name);
  }

  /** Runs the container's script. Whichever comes first ends it: the script returning, or `finish`. */
  private start(container: Container, args: string[], onStart: () => void): ContainerProcess {
    const { name, image, script, options } = container;
    const behaviour = this.scripts.find(([suffix]) => name.endsWith(suffix))?.[1] ?? noScript;
    const started = Promise.withResolvers<void>();
    const context: ContainerScriptContext = {
      clock: this.clock,
      name,
      args,
      image,
      script,
      options,
      start: () => {
        onStart();
        started.resolve();
      },
      read: (path) => container.files.get(path),
      write: (path, text) => {
        if (container.running) container.files.set(path, text);
      },
    };
    const scripted = behaviour(context).then(
      (result) => this.finish(container, typeof result === "number" ? { exitCode: result, stderr: "" } : result),
      (error) => {
        // A script that throws stands for `docker run` itself failing: the container is left stopped, and the error is the caller's.
        this.finish(container, { exitCode: 1, stderr: String(error) });
        throw error;
      },
    );
    const ran = Promise.race([scripted, container.ended.promise]).then(() => container.ended.promise);
    const exited = ran.then((ended) => ended.exitCode);
    const stderr = ran.then((ended) => ended.stderr);
    // A caller that awaits only one of them still gets the script's error, and the other isn't left unhandled.
    exited.catch(() => {});
    stderr.catch(() => {});
    return {
      started: started.promise,
      exited,
      stderr,
      kill: () => this.finish(container, KILLED),
    };
  }
}

const noScript: ContainerScript = async ({ start }) => {
  start();
  return 0;
};

/** How a process ended by SIGKILL ends: exit code 137. */
const KILLED: Ended = { exitCode: 137, stderr: "" };

/** How long `run` waits for a start marker: the real one's default. */
const START_TIMEOUT_SECONDS = 600;
