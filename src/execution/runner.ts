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

// The runner: Thunderjar on the runtime, running one execution a host submitted (see
// onRuntime.ts), in a container from the runner image (see runnerImage.ts), with the runtime's
// Docker socket. It runs every container on that socket, measures it, pushes its postrun image
// and writes the run data store, and tells whoever follows it what it does, an event a line.
import { $ } from "bun";
import { registryHost, type ProjectConfig } from "../config/projectConfig.ts";
import { ConfigError } from "../config/loader.ts";
import { localRuntime, login } from "../docker/docker.ts";
import { moduleLogger } from "../log/logger.ts";
import { type ExecutionRecord, postgresStore, type RunDataStore, sqliteStore } from "../store/runDataStore.ts";
import { runExecution } from "./runExecution.ts";
import { eventHooks, failureOf, type RunnerEvent } from "./runnerEvents.ts";
import { hydratePlan, type Submission, summaryOf } from "./runnerSpec.ts";

const log = moduleLogger("runner");

/** How long a runner waits for its submission before it gives up. */
export const SUBMISSION_WAIT_MS = 120_000;

/**
 * Waits for the submission to be written at `path`, reads it, and deletes it, so its variables'
 * values are only in this process. Throws if none arrives within `waitMs`.
 */
export async function receiveSubmission(path: string, waitMs = SUBMISSION_WAIT_MS): Promise<Submission> {
  const deadline = Date.now() + waitMs;
  // A new Bun.file each time: one keeps what it first learnt of the file, that there was none.
  while (!(await Bun.file(path).exists())) {
    if (Date.now() > deadline) throw new Error(`No submission arrived at ${path} within ${Math.round(waitMs / 1000)}s.`);
    await Bun.sleep(100);
  }
  const submission = (await Bun.file(path).json()) as Submission;
  await $`rm -f ${path}`.quiet().nothrow();
  return submission;
}

/** The run data store `declared`, of the project whose `.thunderjar/` folder is `root`, and where it is. */
export function openRunnerStore(declared: ProjectConfig["runDataStore"], root: string, env: Record<string, string | undefined> = Bun.env): { store: RunDataStore; where: string } {
  if (declared.kind === "postgres") {
    const url = env[declared.urlEnv];
    if (!url) throw new ConfigError(`The run data store is Postgres, at the URL in ${declared.urlEnv}, which the runner wasn't given.`);
    const where = `Postgres at $${declared.urlEnv}`;
    return { store: postgresStore(url, where), where };
  }
  const where = declared.path.startsWith("/") ? declared.path : `${root.slice(0, root.lastIndexOf("/"))}/${declared.path.replace(/^\.\//, "")}`;
  return { store: sqliteStore(where), where };
}

/**
 * Runs `submission`, with the project whose `.thunderjar/` folder is `root`, giving `emit` each
 * event, the last of them `finished` or `failed`. Its variables are put in this process's
 * environment first, so the containers it runs are given them. Returns the execution's record,
 * or undefined if it stopped on an error. `running` is given the execution as it starts, for a
 * caller that stops it.
 */
export async function runSubmission(
  root: string,
  submission: Submission,
  emit: (event: RunnerEvent) => void,
  running?: (execution: Promise<ExecutionRecord>) => void,
): Promise<ExecutionRecord | undefined> {
  // Only the names: the values are never logged.
  log.info({ executionId: submission.plan.executionId, testCase: submission.name, env: Object.keys(submission.env) }, "submission received");
  for (const [name, value] of Object.entries(submission.env)) Bun.env[name] = value;
  emit({ event: "started", submission: summaryOf(submission) });
  try {
    const { registryLogin, imageStore } = submission;
    if (registryLogin !== undefined) {
      await login(registryHost(imageStore.repository), Bun.env[registryLogin.usernameEnv] ?? "", Bun.env[registryLogin.passwordEnv] ?? "");
    }
    const { store, where } = openRunnerStore(submission.runDataStore, root);
    await store.check();
    const plan = await hydratePlan(root, submission.plan);
    const executing = runExecution(
      {
        root,
        name: submission.name,
        testCase: submission.testCase,
        plan,
        imagePrefix: submission.imagePrefix,
        imageStore,
        // The runtime's own Docker daemon, on its socket: what a host reaches with the runtime's command.
        runtime: { command: localRuntime().command, keepPostrunImages: submission.keepPostrunImages },
        concurrency: submission.concurrency,
        prerunFromStore: true,
      },
      store,
      eventHooks(emit),
    );
    running?.(executing);
    const execution = await executing;
    emit({ event: "finished", execution, recordedIn: where, containerRuns: await store.containerRunsOf(execution.executionId) });
    return execution;
  } catch (error) {
    log.error({ err: error }, "the execution stopped on an error");
    emit({ event: "failed", failure: failureOf(error) });
    return undefined;
  }
}
