// One container run: its prerun image's `thunderjar-run.sh`, run in a container from the image,
// in the image's working directory, then committed into its postrun image. The container is
// removed afterwards, whatever happens.
import type { DockerService } from "../services/Docker/Docker.ts";
import type { Execution } from "../store/runDataStore.ts";
import { RESULT_PATH, RUN_PATH, START_MARKER, STDERR_PATH, timedRun } from "./runScript.ts";
import { parseExecution } from "./run/parseExecution.ts";
import { type SecretSearch, searchableSecrets, searchForSecrets } from "./secretSearch.ts";
import { type Timer, untimed } from "./timings.ts";

export { NOW_MS_FUNCTION, RUN_PATH, STDERR_PATH } from "./runScript.ts";
// Moved to run/parseExecution.ts; still exported from here until this file goes.
export { parseExecution } from "./run/parseExecution.ts";

export type ContainerRun = {
  prerunImage: string;
  postrunImage: string;
  /** The names of the environment variables passed into the container, from Thunderjar's own. */
  env: string[];
  /** More `docker run` options, from its base image. */
  runOptions: string[];
  /** Variables set with these values, from its test case's `env`: its postrun image keeps them. */
  testCaseEnv?: Record<string, string>;
  /** The names of more variables passed in, from its test case's `secretEnv`, as `env`'s are. */
  secretEnv?: string[];
  /** How long its run script may run before it's killed. */
  timeoutSeconds: number;
  /** The container's name. */
  container: string;
  /** The Docker it runs on. */
  docker: DockerService;
  /** Times its phases: the agent, collecting what it left, and the commit. */
  time?: Timer;
};

export type ContainerRunOutcome = {
  execution: Execution;
  /** The text of its result file, or null if it left none. */
  harnessResult: string | null;
  /** The run script's standard error, or null if it never ran. */
  stderr: string | null;
  /** Whether its container was committed into its postrun image: not if it never started. */
  committed: boolean;
  /** What searching its postrun image's files for its secret values came to. Absent if it had none to search for. */
  secrets?: SecretSearch;
};

/**
 * Runs `run`, commits its container into its postrun image, even when the agent exits
 * non-zero or is killed for taking longer than its timeout, and removes the container. A container
 * that never started is an outcome too, with `failedToStart`, and nothing to commit. Throws a
 * DockerContainerError if Docker fails otherwise.
 */
export async function runInContainer(run: ContainerRun): Promise<ContainerRunOutcome> {
  const { docker } = run;
  const time = run.time ?? untimed;
  try {
    const stop = await time("agent", () =>
      docker.run(run.prerunImage, run.container, timedRun(), {
        env: run.env,
        runOptions: run.runOptions,
        setEnv: run.testCaseEnv,
        secretEnv: run.secretEnv,
        timeoutSeconds: run.timeoutSeconds,
        startMarker: START_MARKER,
      }),
    );
    if (stop.outcome === "notStarted") {
      const execution: Execution = {
        startedAt: stop.spawnedAt,
        finishedAt: stop.gaveUpAt,
        exitCode: null,
        timedOut: false,
        timeoutSeconds: run.timeoutSeconds,
        failedToStart: stop.reason,
      };
      return { execution, harnessResult: null, stderr: null, committed: false };
    }
    const killedAt = stop.outcome === "timedOut" ? stop.killedAt : undefined;
    const [execution, harnessResult, stderr] = await time("collect", async () => [
      parseExecution(await docker.readFile(run.container, RUN_PATH), run.timeoutSeconds, killedAt),
      (await docker.readFile(run.container, RESULT_PATH)) ?? null,
      (await docker.readFile(run.container, STDERR_PATH)) ?? null,
    ] as const);
    await time("commit", () => docker.commit(run.container, run.postrunImage, run.prerunImage, run.testCaseEnv));
    // Before the postrun image is pushed: in the files it would push, for the values of the
    // variables the agent was given by name. Not at all, and not timed, if there are none.
    const secretNames = searchableSecrets([...run.env, ...(run.secretEnv ?? [])]);
    const secrets =
      secretNames.length === 0 ? undefined : await time("secretSearch", () => searchForSecrets(run.postrunImage, `${run.container}-secrets`, secretNames, docker));
    return { execution, harnessResult, stderr, committed: true, ...(secrets !== undefined && { secrets }) };
  } finally {
    await docker.removeContainer(run.container).catch(() => {});
  }
}
