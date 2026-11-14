/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// The runner image: Thunderjar, as this process is running it, and a project's `.thunderjar/`
// folder, so a container from it on the runtime can run the project's executions (see runner.ts)
// at exactly this version. Built from a context assembled in a temporary folder:
//
//   Dockerfile
//   thunderjar/             this package: its package.json, and its source or its built CLI
//   project/.thunderjar/    the project's declarations, without its run data and logs
//
// It's tagged by a hash of all of it, in the image store, so it's built and pushed once per
// version of Thunderjar and of the project's declarations, and found there after.
import { $, CryptoHasher, Glob } from "bun";
import { abbreviateHash } from "../config/permutations.ts";
import { buildImage, inRegistry, remoteRuntime } from "../docker/docker.ts";
import { moduleLogger } from "../log/logger.ts";
import { type PushHooks, pushToStore } from "./imageStore.ts";
import type { PrerunBuildHooks } from "./prerunBuilds.ts";

const log = moduleLogger("runnerImage");

/** Where a runner's container is sent its submission: a tmpfs, so it's never on the runtime's disk. */
export const SUBMISSION_DIR = "/run/thunderjar";
export const SUBMISSION_PATH = `${SUBMISSION_DIR}/submission.json`;

/** Where a runner writes its diagnostic log, in its container. */
export const RUNNER_LOG_PATH = "/var/log/thunderjar-runner.log";

/** Where the runner image is pushed, and pulled from: `<repository>:runner-h<abbreviated hash>`. */
export const storedRunnerImage = (repository: string, hash: string) => `${repository}:runner-h${abbreviateHash(hash)}`;

/** What of a project's `.thunderjar/` folder a runner isn't sent: its run data, logs, and anything installed. */
const NOT_SENT = /^(\.data|logs|node_modules)\//;

/** This package's folder: the nearest folder above this file with a package.json. */
async function packageRoot(): Promise<string> {
  for (let dir = import.meta.dir; dir !== ""; dir = dir.slice(0, dir.lastIndexOf("/"))) {
    if (await Bun.file(`${dir}/package.json`).exists()) return dir;
  }
  throw new Error(`No package.json above ${import.meta.dir}.`);
}

/**
 * The names a project's declarations import Thunderjar by: `thunderjar`, and any alias of it in
 * the dependencies of the nearest package.json at or above `projectDir`, e.g.
 * `"thunderjar-published": "npm:thunderjar@0.3.0"`.
 */
export async function thunderjarNames(projectDir: string): Promise<string[]> {
  const names = new Set(["thunderjar"]);
  for (let dir = projectDir; dir !== ""; dir = dir.slice(0, dir.lastIndexOf("/"))) {
    const file = Bun.file(`${dir}/package.json`);
    if (!(await file.exists())) continue;
    try {
      const { dependencies, devDependencies } = (await file.json()) as Record<string, Record<string, string> | undefined>;
      for (const [name, range] of Object.entries({ ...devDependencies, ...dependencies })) {
        if (typeof range === "string" && range.startsWith("npm:thunderjar@")) names.add(name);
      }
    } catch {
      // Not JSON: it names no alias.
    }
    break;
  }
  return [...names].toSorted();
}

/** The runner image's Dockerfile, for a CLI at `entry` in the package, imported by `names`, run by Bun `bunVersion`. */
export function runnerDockerfile(entry: string, names: string[], bunVersion: string = Bun.version): string {
  const links = names.map((name) => `ln -s /opt/thunderjar /project/node_modules/${name}`).join(" && ");
  return `FROM docker:cli AS docker
FROM oven/bun:${bunVersion}
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY thunderjar/package.json /opt/thunderjar/package.json
RUN cd /opt/thunderjar && bun install --production
COPY thunderjar/ /opt/thunderjar/
COPY project/ /project/
RUN mkdir -p /project/node_modules && ${links}
WORKDIR /project
ENV DOCKER_CONFIG=${SUBMISSION_DIR}/docker
ENTRYPOINT ["bun", "/opt/thunderjar/${entry}", "--log-file", "${RUNNER_LOG_PATH}", "runner", "--submission", "${SUBMISSION_PATH}"]
`;
}

/** A runner image's build context, not yet written: each file's path in it, and where it's copied from, or its text. */
export type RunnerContext = { files: { path: string; from?: string; text?: string }[]; hash: string };

/**
 * The build context of the runner image for the project whose `.thunderjar/` folder is `root`,
 * and its hash: of every file's path and contents.
 */
export async function runnerContext(root: string): Promise<RunnerContext> {
  const packageDir = await packageRoot();
  // From a checkout, its source. Installed, its built CLI, and the API the project's declarations import.
  const fromSource = await Bun.file(`${packageDir}/src/cli/index.ts`).exists();
  const entry = fromSource ? "src/cli/index.ts" : "dist/index.js";
  const packaged = fromSource
    ? [...new Glob("src/**").scanSync({ cwd: packageDir })].filter((path) => !path.startsWith("src/gauntlet/") && !/\.test\.tsx?$/.test(path))
    : [...new Glob("{dist,src/api}/**").scanSync({ cwd: packageDir })];
  const declared = [...new Glob("**").scanSync({ cwd: root, dot: true })].filter((path) => !NOT_SENT.test(path));
  const projectDir = root.slice(0, root.lastIndexOf("/"));
  const files: RunnerContext["files"] = [
    { path: "Dockerfile", text: runnerDockerfile(entry, await thunderjarNames(projectDir)) },
    { path: "thunderjar/package.json", from: `${packageDir}/package.json` },
    ...packaged.toSorted().map((path) => ({ path: `thunderjar/${path}`, from: `${packageDir}/${path}` })),
    ...declared.toSorted().map((path) => ({ path: `project/.thunderjar/${path}`, from: `${root}/${path}` })),
  ];
  const hasher = new CryptoHasher("sha256");
  for (const { path, from, text } of files) {
    hasher.update(`${path}\0`);
    hasher.update(text ?? (await Bun.file(from as string).arrayBuffer()));
    hasher.update("\0");
  }
  return { files, hash: hasher.digest("hex") };
}

/**
 * Makes sure the image store `repository` has the runner image for the project whose
 * `.thunderjar/` folder is `root`, building it on the runtime's daemon, which `command` reaches,
 * and pushing it from there, if it isn't there, calling `hooks`, and returns its reference.
 * Throws a DockerBuildError or a DockerPushError.
 */
export async function storeRunnerImage(root: string, repository: string, command: string[], hooks: PrerunBuildHooks & PushHooks = {}): Promise<string> {
  const runtime = remoteRuntime(command);
  const context = await runnerContext(root);
  const reference = storedRunnerImage(repository, context.hash);
  if (await inRegistry(reference)) {
    log.info({ reference }, "runner image already in the image store: not built or pushed");
    return reference;
  }
  const contextDir = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-runner-${crypto.randomUUID()}`;
  try {
    for (const { path, from, text } of context.files) await Bun.write(`${contextDir}/${path}`, text ?? Bun.file(from as string));
    hooks.onBuilding?.(reference);
    await buildImage(contextDir, reference, {}, runtime);
    hooks.onBuilt?.(reference);
  } finally {
    await $`rm -rf ${contextDir}`.quiet();
  }
  await pushToStore(reference, reference, hooks, runtime);
  return reference;
}
