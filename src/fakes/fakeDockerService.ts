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

// A DockerService for tests: one Docker daemon, in memory. No subprocess, no files. Builds take no
// time unless a test says so with `onBuild`, e.g. `docker.onBuild(() => clock.sleep(10_000))`.

import { DockerLoginError, DockerPushError } from "../docker/docker.ts";
import type { BuildContext, DockerService, RunningContainer } from "../docker/dockerService.ts";
import type { ShellSession } from "../docker/shellSession.ts";

/** What a test can't ask of the fake yet: loud, never silently wrong. */
const notYet = (what: string) => new Error(`fake docker: ${what} isn't faked yet`);

export type FakeDockerOptions = {
  /** The images the daemon has to begin with, e.g. `thunderjar-prerun:ded54607`. */
  images?: string[];
  /** The registry hosts Docker holds a valid login for, e.g. `ghcr.io`. */
  loggedIn?: string[];
};

export class FakeDockerService implements DockerService {
  /** Each image built, in the order its build finished. */
  readonly built: string[] = [];
  /** Each reference pushed, in the order pushed. */
  readonly pushed: string[] = [];
  readonly #images: Set<string>;
  readonly #loggedIn: Set<string>;
  /** Images whose build has started and not finished, in the order they started. */
  readonly #building: string[] = [];
  #onBuild: (context: BuildContext) => Promise<void> | void = () => {};

  constructor({ images = [], loggedIn = [] }: FakeDockerOptions = {}) {
    this.#images = new Set(images);
    this.#loggedIn = new Set(loggedIn);
  }

  /** Images whose build has started and not finished, in the order they started. */
  building(): string[] {
    return [...this.#building];
  }

  /** The images the daemon has. */
  images(): string[] {
    return [...this.#images];
  }

  /** Runs `fn` during every build, e.g. `() => clock.sleep(10_000)`. If it throws, the build fails with what it throws. */
  onBuild(fn: (context: BuildContext) => Promise<void> | void): void {
    this.#onBuild = fn;
  }

  async imagesIn(repository: string): Promise<Set<string>> {
    return new Set([...this.#images].filter((image) => image.startsWith(`${repository}:`)));
  }

  async build(context: BuildContext): Promise<void> {
    this.#building.push(context.image);
    try {
      await this.#onBuild(context);
    } finally {
      this.#building.splice(this.#building.indexOf(context.image), 1);
    }
    this.#images.add(context.image);
    this.built.push(context.image);
  }

  async checkLogin(host: string): Promise<void> {
    if (!this.#loggedIn.has(host)) throw new DockerLoginError("Cannot perform an interactive login from a non TTY device");
  }

  async push(image: string, reference: string): Promise<void> {
    if (!this.#images.has(image)) throw new DockerPushError(`Error response from daemon: No such image: ${image}`, reference);
    const host = reference.split("/")[0] as string;
    if (!this.#loggedIn.has(host)) throw new DockerPushError("denied: permission_denied: The token provided does not match expected scopes.", reference);
    this.#images.add(reference);
    this.pushed.push(reference);
  }

  run(): RunningContainer {
    throw notYet("run");
  }

  async kill(): Promise<void> {
    throw notYet("kill");
  }

  async readFile(): Promise<string | undefined> {
    throw notYet("readFile");
  }

  async commit(): Promise<void> {
    throw notYet("commit");
  }

  async removeContainer(): Promise<void> {
    throw notYet("removeContainer");
  }

  async removeContainersNamed(): Promise<string[]> {
    throw notYet("removeContainersNamed");
  }

  async openShellSession(): Promise<ShellSession> {
    throw notYet("openShellSession");
  }

  /** This one: a test has one daemon, wherever commands are sent. */
  on(_command: string[]): DockerService {
    return this;
  }
}
