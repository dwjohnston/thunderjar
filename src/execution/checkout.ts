/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Checking out a past container run: its end state, from its postrun image, as a local branch, or
// a shell in that image.
import { $ } from "bun";
import { abbreviateHash } from "../config/permutations.ts";
import { DockerContainerError, type DockerRuntime, reasonOf } from "../docker/docker.ts";
import { moduleLogger } from "../log/logger.ts";
import type { ContainerRunRecord } from "../store/runDataStore.ts";

const log = moduleLogger("checkout");

/** A container run's iteration as its ID gives it: counting from 0, two digits at least, e.g. `i00`. */
const iterationIndex = (iteration: number) => `i${String(iteration - 1).padStart(2, "0")}`;

/** A container run within its execution: its permutation's abbreviated hash and its iteration, e.g. `h4f9a21c8-i00`. */
const runInExecution = ({ permutationHash, iteration }: Pick<ContainerRunRecord, "permutationHash" | "iteration">) =>
  `h${abbreviateHash(permutationHash)}-${iterationIndex(iteration)}`;

/** A container run's ID, e.g. `01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00`. */
export const containerRunId = (record: Pick<ContainerRunRecord, "executionId" | "permutationHash" | "iteration">) =>
  `${record.executionId}-${runInExecution(record)}`;

/** A container run's ID, split into its execution's ID and the run within it, or undefined if it isn't one. */
export function parseContainerRunId(id: string): { executionId: string; hash: string; iteration: number } | undefined {
  const match = /^(.+)-h([0-9a-f]{8})-i(\d{2,})$/.exec(id);
  if (!match) return undefined;
  return { executionId: match[1]!, hash: match[2]!, iteration: Number(match[3]) + 1 };
}

/** The container run of `runs` that `id` names, or undefined if none. */
export function findContainerRun(runs: ContainerRunRecord[], id: string): ContainerRunRecord | undefined {
  return runs.find((run) => containerRunId(run) === id);
}

/**
 * The branch a container run is checked out to: `thunderjar/run/<test case>/<execution>/<run>`.
 * `run/` is the kind of branch, as `capture/` is of `thunderjar/capture/<session>`.
 */
export const runBranch = (record: ContainerRunRecord) => `thunderjar/run/${record.testCase}/${record.executionId}/${runInExecution(record)}`;

/** Why `record` can't be checked out, or undefined if it can. */
export function unavailableReason(record: ContainerRunRecord): string | undefined {
  if (record.execution.failedToStart !== undefined) return "it never started";
  if (record.postrunPurge !== undefined) return "its postrun image was purged";
  return undefined;
}

/**
 * Run in a container from a postrun image, in its working directory: commits anything the agent
 * left uncommitted, in a new repository if the workspace isn't one, and writes a bundle of HEAD, the
 * whole end state, to stdout. The container is removed after, so the commit reaches no image.
 */
const BUNDLE_SCRIPT = [
  "set -e",
  `g() { git -c 'safe.directory=*' -c user.name=Thunderjar -c user.email=checkout@thunderjar.invalid "$@"; }`,
  `command -v git >/dev/null || { echo "git isn't installed in the postrun image" >&2; exit 1; }`,
  `if top=$(g rev-parse --show-toplevel 2>/dev/null); then cd "$top"; else g init --quiet; fi`,
  "g add --all",
  `if ! g rev-parse --quiet --verify HEAD >/dev/null || ! g diff --cached --quiet; then g commit --quiet --no-verify --allow-empty -m "Thunderjar: what the agent left uncommitted"; fi`,
  "g bundle create --quiet - HEAD",
].join("\n");

/**
 * A git bundle of `record`'s end state: the agent's commits, and a commit of what it left
 * uncommitted, dated when it ran, so checking it out again makes the same commit. Throws a
 * DockerContainerError if its postrun image can't be run.
 */
export async function endStateBundle(record: ContainerRunRecord, runtime: DockerRuntime): Promise<Uint8Array> {
  const dates = ["GIT_AUTHOR_DATE", "GIT_COMMITTER_DATE"].flatMap((name) => ["--env", `${name}=${record.ranAt}`]);
  const args = ["run", "--rm", "--pull", runtime.pull, ...dates, "--entrypoint", "sh", record.postrunImage, "-c", BUNDLE_SCRIPT];
  const result = await $`${runtime.command} ${args}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString();
    log.error({ image: record.postrunImage, exitCode: result.exitCode, stderr }, "bundling the end state failed");
    throw new DockerContainerError(reasonOf(stderr) || `\`docker run\` exited ${result.exitCode}`);
  }
  return result.stdout;
}

/** Why `branch` couldn't be checked out in the repository at `cwd`. */
export class CheckoutError extends Error {}

/** The repository's git folder, absolute, or undefined if `cwd` isn't in a git repository. */
export async function gitDir(cwd: string): Promise<string | undefined> {
  const result = await $`git -C ${cwd} rev-parse --absolute-git-dir`.quiet().nothrow();
  return result.exitCode === 0 ? result.text().trim() : undefined;
}

/**
 * Makes `branch` from the HEAD of `bundle`, in the repository at `cwd`, and switches to it. A branch
 * already there at the same commit is switched to; one at another is left, with a CheckoutError.
 */
export async function checkoutBundle(cwd: string, bundle: Uint8Array, branch: string): Promise<void> {
  const dir = await gitDir(cwd);
  if (dir === undefined) throw new CheckoutError(`${cwd} isn't in a git repository`);
  const path = `${dir}/thunderjar-checkout-${crypto.randomUUID()}.bundle`;
  await Bun.write(path, bundle);
  try {
    const git = async (args: string[]) => {
      const result = await $`git -C ${cwd} ${args}`.quiet().nothrow();
      log.debug({ args, exitCode: result.exitCode, stderr: result.stderr.toString() }, "git");
      if (result.exitCode !== 0) throw new CheckoutError(reasonOf(result.stderr) || `\`git ${args[0]}\` exited ${result.exitCode}`);
      return result.text().trim();
    };
    await git(["fetch", "--quiet", "--no-tags", path, "HEAD"]);
    const commit = await git(["rev-parse", "FETCH_HEAD"]);
    const existing = await $`git -C ${cwd} rev-parse --quiet --verify ${`refs/heads/${branch}`}`.quiet().nothrow();
    if (existing.exitCode !== 0) await git(["branch", branch, commit]);
    else if (existing.text().trim() !== commit) throw new CheckoutError(`branch ${branch} already exists, at another commit`);
    await git(["switch", "--quiet", branch]);
  } finally {
    await Bun.file(path).delete();
  }
}

/**
 * Opens an interactive shell in a container from `record`'s postrun image, in its working
 * directory, removed when the shell ends: bash if it has it, else sh. Returns the shell's exit code.
 */
export async function openShell(record: ContainerRunRecord, runtime: DockerRuntime): Promise<number> {
  const args = ["run", "--rm", "--interactive", "--tty", "--pull", runtime.pull, "--entrypoint", "sh", record.postrunImage, "-c", "command -v bash >/dev/null && exec bash || exec sh"];
  log.info({ image: record.postrunImage, runtime: runtime.command }, "opening a shell");
  const shell = Bun.spawn([...runtime.command, ...args], { stdio: ["inherit", "inherit", "inherit"] });
  return shell.exited;
}
