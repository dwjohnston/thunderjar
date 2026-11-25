/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { DockerContainerError, DockerLoginError, DockerPullError } from "../../docker/docker.ts";
import type { Clock } from "../Clock/Clock.ts";
import type { ContainerStop, DockerService, ImageBuildOptions, RunContainerOptions, ShellSession } from "./Docker.ts";

/** What a scripted container does: how it stops, and the files it leaves, by path. */
export type FakeContainer = { stop?: ContainerStop; files?: Record<string, string>; /** How long it runs, on the fake clock. */ ms?: number };

type Method = "build" | "imagesIn" | "checkLogin" | "inRegistry" | "push" | "pull" | "run" | "commit" | "removeContainer" | "removeContainersNamed" | "readFile" | "openShellSession";

/**
 * A DockerService in memory: one daemon's images and containers, and a registry it shares with any
 * other fake given the same `registry` set. It records every call, as `<method> <arguments>`, so a
 * test can check which daemon each operation went to. A container with no script exits at once
 * and leaves no files.
 *
 * It refuses what a real daemon would: `checkLogin` for a host not in `logins`, a `pull` of a
 * reference the registry lacks, and a `commit` of a container that doesn't exist.
 */
export class FakeDockerService implements DockerService {
  readonly command: readonly string[];
  /** The images in this daemon. */
  readonly images = new Set<string>();
  /** The references in the registry. */
  readonly registry: Set<string>;
  /** The registry hosts this machine is logged in to. */
  readonly logins = new Set<string>();
  /** Every call, in order. */
  readonly calls: string[] = [];
  /** Every container run, in order, with the options it was given. */
  readonly runs: { image: string; name: string; script: string; options: RunContainerOptions }[] = [];
  /** Every build, in order, with the options it was given. */
  readonly builds: { contextDir: string; image: string; options: ImageBuildOptions }[] = [];
  /** The containers that exist: run and not yet removed. */
  readonly containers = new Map<string, Record<string, string>>();
  private readonly scripts: [string, FakeContainer | ((image: string, options: RunContainerOptions) => FakeContainer)][] = [];
  private readonly failures: { method: Method; matching: string; error: Error }[] = [];

  constructor(
    private readonly clock: Clock,
    { command = ["docker"], registry = new Set<string>() }: { command?: string[]; registry?: Set<string> } = {},
  ) {
    this.command = command;
    this.registry = registry;
  }

  /**
   * Each container whose name ends in `suffix` does what `container` says. `""` is every
   * container. If several match, the longest suffix wins, and of
   * two scripts for one suffix, the later.
   */
  on(suffix: string, container: FakeContainer | ((image: string, options: RunContainerOptions) => FakeContainer)): this {
    this.scripts.push([suffix, container]);
    return this;
  }

  /** Each call of `method` whose arguments include `matching` throws `error`. */
  fail(method: Method, error: Error, matching = ""): this {
    this.failures.push({ method, matching, error });
    return this;
  }

  /** The arguments of each call of `method`, in order, e.g. `callsOf("build")` is the images built. */
  callsOf(method: Method): string[] {
    return this.calls.filter((call) => call === method || call.startsWith(`${method} `)).map((call) => call.slice(method.length + 1));
  }

  private called(method: Method, ...args: string[]): void {
    const call = [method, ...args].join(" ");
    this.calls.push(call);
    const failure = this.failures.find((f) => f.method === method && args.join(" ").includes(f.matching));
    if (failure) throw failure.error;
  }

  async build(contextDir: string, image: string, options: ImageBuildOptions = {}): Promise<void> {
    this.builds.push({ contextDir, image, options });
    this.called("build", image);
    this.images.add(image);
  }

  async imagesIn(repository: string): Promise<Set<string>> {
    this.called("imagesIn", repository);
    return new Set([...this.images].filter((image) => image.startsWith(`${repository}:`)));
  }

  async checkLogin(host: string): Promise<void> {
    this.called("checkLogin", host);
    if (!this.logins.has(host)) throw new DockerLoginError(`not logged in to ${host}`);
  }

  async inRegistry(reference: string): Promise<boolean> {
    this.called("inRegistry", reference);
    return this.registry.has(reference);
  }

  async push(image: string, reference: string): Promise<void> {
    this.called("push", image, reference);
    this.images.add(reference);
    this.registry.add(reference);
  }

  async pull(reference: string): Promise<void> {
    this.called("pull", reference);
    if (!this.registry.has(reference)) throw new DockerPullError(`manifest for ${reference} not found`, reference);
    this.images.add(reference);
  }

  async run(image: string, name: string, script: string, options: RunContainerOptions = {}): Promise<ContainerStop> {
    this.runs.push({ image, name, script, options });
    this.called("run", image, name);
    const scripted = this.scripts.filter(([suffix]) => name.endsWith(suffix)).reverse().sort(([a], [b]) => b.length - a.length)[0]?.[1];
    const { stop = { outcome: "exited" }, files = {}, ms = 0 } = (typeof scripted === "function" ? scripted(image, options) : scripted) ?? {};
    if (ms > 0) await this.clock.sleep(ms);
    if (stop.outcome !== "notStarted") this.containers.set(name, files);
    return stop;
  }

  async commit(name: string, image: string, like: string): Promise<void> {
    this.called("commit", name, image, like);
    if (!this.containers.has(name)) throw new DockerContainerError(`No such container: ${name}`);
    this.images.add(image);
  }

  async removeContainer(name: string): Promise<void> {
    this.called("removeContainer", name);
    this.containers.delete(name);
  }

  async removeContainersNamed(prefix: string): Promise<string[]> {
    this.called("removeContainersNamed", prefix);
    const names = [...this.containers.keys()].filter((name) => name.startsWith(prefix));
    for (const name of names) this.containers.delete(name);
    return names;
  }

  async readFile(name: string, path: string): Promise<string | undefined> {
    this.called("readFile", name, path);
    return this.containers.get(name)?.[path];
  }

  async openShellSession(image: string, name: string): Promise<ShellSession> {
    this.called("openShellSession", image, name);
    this.containers.set(name, {});
    return {
      workdir: "/workspace",
      run: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      close: async () => void this.containers.delete(name),
    };
  }

  async diskUsage(): Promise<string[]> {
    return [];
  }
}
