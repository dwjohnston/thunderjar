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

// A DockerService for tests: one Docker daemon, in memory. No subprocess, no files, no real time.
// Builds take no time unless a test says so with `onBuild`, e.g. `docker.onBuild(() => clock.sleep(10_000))`.
//
// Containers run on the test's clock, and each has its own files, in memory. A container that runs
// `timedRun()`, as each container run does, behaves as that script does: it writes RUN_PATH,
// removes the result file, says it has started, runs the agent the test gives with `onExec`, and
// writes its stderr to STDERR_PATH. A test says how long a container takes to start with `onStart`.
// Timeouts are not the fake's: runContainerOn kills a container that runs too long, with `kill`.

import { DockerContainerError, DockerLoginError, DockerPushError, type ExecResult } from "../docker/docker.ts";
import type { BuildContext, DockerService, RunningContainer, RunSpec } from "../docker/dockerService.ts";
import type { ShellSession } from "../docker/shellSession.ts";
import { LIST_FILES, WORKDIR } from "../execution/measurementContext.ts";
import { RESULT_PATH, RUN_PATH, STDERR_PATH, timedRun } from "../execution/runScript.ts";
import type { Clock } from "../time/clock.ts";

/** A container's files, by absolute path, e.g. `/workspace/isPrime.ts`. */
export type Files = Map<string, string>;

/** What a fake agent is given: the clock, its container's files, and its stderr. */
export type AgentContext = {
  clock: Clock;
  /** Aborted when its container is killed or removed. */
  signal: AbortSignal;
  /** Its container's files: what it leaves there, its postrun image keeps. */
  files: Files;
  /** Writes a line to its run script's stderr. */
  stderr(line: string): void;
};

/** A fake agent: its run script. Exits 0 unless it says otherwise. */
export type Agent = (ctx: AgentContext) => void | { exitCode: number } | Promise<void | { exitCode: number }>;

/** How starting a container goes, before its script runs, e.g. `({ clock }) => clock.sleep(3_000)`. */
export type Start = (ctx: { clock: Clock; signal: AbortSignal }) => Promise<void> | void;

export type FakeDockerOptions = {
  /** The images the daemon has to begin with, e.g. `thunderjar-prerun:ded54607`. */
  images?: string[];
  /** The registry hosts Docker holds a valid login for, e.g. `ghcr.io`. */
  loggedIn?: string[];
  /** What containers run on. Needed to run one. */
  clock?: Clock;
};

type Exit = { exitCode: number; stderr: string; reason: string };

/** A container the daemon has: its image, its files, and whether it's running. */
type Container = {
  files: Files;
  running: boolean;
  /** Aborted when it's killed or removed. */
  stop: AbortController;
  /** Ends it, with `exit`, if it's running. */
  end(exit: Exit): void;
};

const noSuchContainer = (name: string) => new DockerContainerError(`Error response from daemon: No such container: ${name}`);

export class FakeDockerService implements DockerService {
  /** Each image built, in the order its build finished. */
  readonly built: string[] = [];
  /** Each reference pushed, in the order pushed. */
  readonly pushed: string[] = [];
  /** Each container killed, in the order killed. */
  readonly killed: string[] = [];
  /** Each image, and its files. */
  readonly #images = new Map<string, Files>();
  readonly #loggedIn: Set<string>;
  readonly #clock: Clock | undefined;
  /** Images whose build has started and not finished, in the order they started. */
  readonly #building: string[] = [];
  readonly #containers = new Map<string, Container>();
  readonly #starts = new Map<string, Start>();
  readonly #agents = new Map<string, Agent>();
  #onBuild: (context: BuildContext) => Promise<void> | void = () => {};

  constructor({ images = [], loggedIn = [], clock }: FakeDockerOptions = {}) {
    for (const image of images) this.#images.set(image, new Map());
    this.#loggedIn = new Set(loggedIn);
    this.#clock = clock;
  }

  /** Images whose build has started and not finished, in the order they started. */
  building(): string[] {
    return [...this.#building];
  }

  /** The images the daemon has. */
  images(): string[] {
    return [...this.#images.keys()];
  }

  /** The containers the daemon has, running or not: those not yet removed. */
  containers(): string[] {
    return [...this.#containers.keys()];
  }

  /** The files of the image `image`, e.g. a postrun image, as its container left them. Undefined if there's no such image. */
  filesOf(image: string): Files | undefined {
    const files = this.#images.get(image);
    return files === undefined ? undefined : new Map(files);
  }

  /** Runs `fn` during every build, e.g. `() => clock.sleep(10_000)`. If it throws, the build fails with what it throws. */
  onBuild(fn: (context: BuildContext) => Promise<void> | void): void {
    this.#onBuild = fn;
  }

  /** How a container from `image` starts, before its script runs: at once, unless this says otherwise. */
  onStart(image: string, start: Start): void {
    this.#starts.set(image, start);
  }

  /** The agent a container from `image` runs: by default, one that exits 0 at once. */
  onExec(image: string, agent: Agent): void {
    this.#agents.set(image, agent);
  }

  async imagesIn(repository: string): Promise<Set<string>> {
    return new Set(this.images().filter((image) => image.startsWith(`${repository}:`)));
  }

  async build(context: BuildContext): Promise<void> {
    this.#building.push(context.image);
    try {
      await this.#onBuild(context);
    } finally {
      this.#building.splice(this.#building.indexOf(context.image), 1);
    }
    this.#images.set(context.image, new Map());
    this.built.push(context.image);
  }

  async checkLogin(host: string): Promise<void> {
    if (!this.#loggedIn.has(host)) throw new DockerLoginError("Cannot perform an interactive login from a non TTY device");
  }

  async push(image: string, reference: string): Promise<void> {
    const files = this.#images.get(image);
    if (files === undefined) throw new DockerPushError(`Error response from daemon: No such image: ${image}`, reference);
    const host = reference.split("/")[0] as string;
    if (!this.#loggedIn.has(host)) throw new DockerPushError("denied: permission_denied: The token provided does not match expected scopes.", reference);
    this.#images.set(reference, new Map(files));
    this.pushed.push(reference);
  }

  /**
   * Starts a container from `spec.image`. Its script must be `timedRun()`: any other fails, loudly.
   * Fails as `docker run` does, with 125, if there's no such image, or a container already has its name.
   */
  run(spec: RunSpec): RunningContainer {
    const exited = Promise.withResolvers<Exit>();
    const started = Promise.withResolvers<void>();
    const running: RunningContainer = { started: started.promise, exited: exited.promise, abandon: () => exited.resolve({ exitCode: 137, stderr: "", reason: "" }) };
    const failed = (reason: string) => {
      exited.resolve({ exitCode: 125, stderr: `docker: ${reason}\n`, reason });
      return running;
    };
    if (!this.#images.has(spec.image)) return failed(`Error response from daemon: No such image: ${spec.image}`);
    if (this.#containers.has(spec.name)) return failed(`Error response from daemon: Conflict. The container name "/${spec.name}" is already in use.`);
    if (spec.script !== timedRun()) {
      exited.reject(new Error(`fake docker: no behaviour for this script, only timedRun()'s:\n${spec.script}`));
      return running;
    }
    const clock = this.#clockFor("run");
    const container = this.#create(spec.name, spec.image, (exit) => exited.resolve(exit));
    void this.#timedRun(clock, spec.image, container, () => started.resolve()).catch((error: unknown) => exited.reject(error));
    return running;
  }

  /** What `timedRun()` does, in `container`: see the top of this file. */
  async #timedRun(clock: Clock, image: string, container: Container, started: () => void): Promise<void> {
    const { files, stop } = container;
    const { signal } = stop;
    await this.#starts.get(image)?.({ clock, signal });
    if (signal.aborted) return;
    const startedAt = clock.now();
    files.set(RUN_PATH, `{"startedAt":${startedAt}}\n`);
    files.delete(RESULT_PATH);
    started();
    const stderr: string[] = [];
    const agent = this.#agents.get(image) ?? (() => {});
    let exitCode = 0;
    try {
      exitCode = (await agent({ clock, signal, files, stderr: (line) => stderr.push(`${line}\n`) }))?.exitCode ?? 0;
    } catch (error) {
      // Killed, or removed: it ended there.
      if (signal.aborted) return;
      throw error;
    }
    if (signal.aborted) return;
    files.set(STDERR_PATH, stderr.join(""));
    files.set(RUN_PATH, `{"startedAt":${startedAt},"finishedAt":${clock.now()},"exitCode":${exitCode}}\n`);
    // The timed run always exits 0: how its script exited is in RUN_PATH.
    container.end({ exitCode: 0, stderr: "", reason: "" });
  }

  async kill(name: string): Promise<void> {
    const container = this.#containers.get(name);
    if (container === undefined) throw noSuchContainer(name);
    if (!container.running) throw new DockerContainerError(`Error response from daemon: Cannot kill container: ${name}: container is not running`);
    this.killed.push(name);
    container.stop.abort(new Error(`fake docker: ${name} was killed`));
    container.end({ exitCode: 137, stderr: "", reason: "" });
  }

  async readFile(name: string, path: string): Promise<string | undefined> {
    const container = this.#containers.get(name);
    if (container === undefined) throw noSuchContainer(name);
    return container.files.get(path);
  }

  /** Copies the container's files into the image `image`. */
  async commit(name: string, image: string): Promise<void> {
    const container = this.#containers.get(name);
    if (container === undefined) throw noSuchContainer(name);
    this.#images.set(image, new Map(container.files));
  }

  async removeContainer(name: string): Promise<void> {
    const container = this.#containers.get(name);
    if (container === undefined) throw noSuchContainer(name);
    container.stop.abort(new Error(`fake docker: ${name} was removed`));
    container.end({ exitCode: 137, stderr: "", reason: "" });
    this.#containers.delete(name);
  }

  async removeContainersNamed(prefix: string): Promise<string[]> {
    const names = this.containers().filter((name) => name.startsWith(prefix));
    for (const name of names) await this.removeContainer(name);
    return names;
  }

  /**
   * A shell session in a new container `name` from `image`, working in /workspace. It answers
   * `LIST_FILES`, from the container's files. Any other command exits 127: say what it should do
   * here before a test needs it.
   */
  async openShellSession(image: string, name: string): Promise<ShellSession> {
    if (!this.#images.has(image)) throw new DockerContainerError(`Unable to find image '${image}' locally`);
    if (this.#containers.has(name)) throw new DockerContainerError(`Conflict. The container name "/${name}" is already in use.`);
    const { files } = this.#create(name, image, () => {});
    return {
      workdir: WORKDIR,
      run: async (command): Promise<ExecResult> => {
        if (!this.#containers.has(name)) throw new DockerContainerError(`the shell session in ${name} has ended`);
        if (command === LIST_FILES) {
          const under = `${WORKDIR}/`;
          const listed = [...files.keys()].filter((path) => path.startsWith(under)).map((path) => `./${path.slice(under.length)}\n`);
          return { exitCode: 0, stdout: listed.toSorted().join(""), stderr: "" };
        }
        return { exitCode: 127, stdout: "", stderr: `fake docker: \`${command}\` isn't answered in a shell session yet\n` };
      },
      close: () => this.removeContainer(name).catch(() => {}),
    };
  }

  /** This one: a test has one daemon, wherever commands are sent. */
  on(_command: string[]): DockerService {
    return this;
  }

  /** A new, running container `name`, with a copy of `image`'s files. */
  #create(name: string, image: string, onEnd: (exit: Exit) => void): Container {
    const container: Container = {
      files: new Map(this.#images.get(image)),
      running: true,
      stop: new AbortController(),
      end: (exit) => {
        if (!container.running) return;
        container.running = false;
        onEnd(exit);
      },
    };
    this.#containers.set(name, container);
    return container;
  }

  #clockFor(what: string): Clock {
    if (this.#clock === undefined) throw new Error(`fake docker: ${what} needs a clock: new FakeDockerService({ clock })`);
    return this.#clock;
  }
}
