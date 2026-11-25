/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// A DockerService that runs nothing: it keeps the images it's told it has, and a list of what it
// was asked to do, and each container run does what a test scripts for it.
import type { Clock } from "../Clock/Clock.ts";
import type { ContainerStop, DockerService, ExecResult, RunContainerOptions, ShellSession } from "./Docker.ts";

/** What a scripted container run is given. */
export type FakeRunContext = { image: string; name: string; script: string; options: RunContainerOptions; clock: Clock };

/** How a scripted container run went: how it stopped, `exited` by default, and the files it left, by path. */
export type FakeRun = { stop?: ContainerStop; files?: Record<string, string> };

export type FakeRunScript = (context: FakeRunContext) => FakeRun | Promise<FakeRun>;

type Method = keyof Omit<DockerService, "command">;

/** Where the timed run records how the agent ran: see src/execution/runScript.ts. */
const RUN_PATH = "/thunderjar/run.json";

export class FakeDockerService implements DockerService {
  readonly command = ["fake-docker"];
  /** What it was asked to do, in order, e.g. `build thunderjar-prerun:abc`, `push <image> <reference>`. */
  readonly calls: string[] = [];
  /** The images in this daemon, as `<repository>:<tag>`. */
  readonly images = new Set<string>();
  private readonly scripts: [string, FakeRunScript][] = [];
  private readonly failures = new Map<Method, unknown[]>();
  private readonly files = new Map<string, Record<string, string>>();

  /**
   * `registry` is the references the image store has: pass the same set to the host's and the
   * runtime's, as they see the same registry.
   */
  constructor(
    private readonly clock: Clock,
    readonly registry: Set<string> = new Set(),
  ) {}

  /** Runs `script` for each container whose name ends in `suffix`. Without one, a run exits 0 at once, leaving its RUN_PATH. */
  onRun(suffix: string, script: FakeRunScript): this {
    this.scripts.push([suffix, script]);
    return this;
  }

  /** Makes the next call of `method` throw `error`. */
  failNext(method: Method, error: unknown): this {
    this.failures.set(method, [...(this.failures.get(method) ?? []), error]);
    return this;
  }

  private called(method: Method, ...what: string[]): void {
    this.calls.push([method, ...what].join(" "));
    const error = this.failures.get(method)?.shift();
    if (error !== undefined) throw error;
  }

  async build(_contextDir: string, image: string): Promise<void> {
    this.called("build", image);
    this.images.add(image);
  }

  async imagesIn(repository: string): Promise<Set<string>> {
    this.called("imagesIn", repository);
    return new Set([...this.images].filter((image) => image.startsWith(`${repository}:`)));
  }

  async checkLogin(host: string): Promise<void> {
    this.called("checkLogin", host);
  }

  async push(image: string, reference: string): Promise<void> {
    this.called("push", image, reference);
    this.images.add(reference);
    this.registry.add(reference);
  }

  async pull(reference: string): Promise<void> {
    this.called("pull", reference);
    this.images.add(reference);
  }

  async inRegistry(reference: string): Promise<boolean> {
    this.called("inRegistry", reference);
    return this.registry.has(reference);
  }

  async run(image: string, name: string, script: string, options: RunContainerOptions = {}): Promise<ContainerStop> {
    this.called("run", image, name);
    const scripted = this.scripts.find(([suffix]) => name.endsWith(suffix))?.[1];
    const startedAt = this.clock.now();
    const { stop = { outcome: "exited" }, files } = scripted ? await scripted({ image, name, script, options, clock: this.clock }) : {};
    this.files.set(name, files ?? { [RUN_PATH]: JSON.stringify({ startedAt: startedAt + 1e12, finishedAt: this.clock.now() + 1e12, exitCode: 0 }) });
    return stop;
  }

  async commit(name: string, image: string): Promise<void> {
    this.called("commit", name, image);
    this.images.add(image);
  }

  async removeContainer(name: string): Promise<void> {
    this.called("removeContainer", name);
    this.files.delete(name);
  }

  async removeContainersNamed(prefix: string): Promise<string[]> {
    this.called("removeContainersNamed", prefix);
    const names = [...this.files.keys()].filter((name) => name.startsWith(prefix));
    for (const name of names) this.files.delete(name);
    return names;
  }

  async readFile(name: string, path: string): Promise<string | undefined> {
    this.called("readFile", name, path);
    return this.files.get(name)?.[path];
  }

  async openShellSession(image: string, name: string): Promise<ShellSession> {
    this.called("openShellSession", image, name);
    const ok: ExecResult = { stdout: "", stderr: "", exitCode: 0 };
    return { workdir: "/workspace", run: async () => ok, close: async () => {} };
  }

  async diskUsage(): Promise<string[]> {
    this.called("diskUsage");
    return [];
  }
}
