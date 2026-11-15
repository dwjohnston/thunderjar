// `thunderjar view`: a local web page for browsing the run data store. A Bun server answers a small
// JSON API from the store, and serves a client-rendered React app that reads it. The store is
// read afresh on each request, so a reload shows runs recorded since the page opened.
import { Command, Option } from "commander";
import { ConfigError, findThunderjarRoot } from "../../../config/loader.ts";
import { loadMeasurements, type Measurement } from "../../../config/measurements.ts";
import { AXES, type Axis } from "../../../config/permutations.ts";
import { type ExecutionSummary as Summary, summariseExecution } from "../../../execution/executionSummary.ts";
import { type ContainerRunRecord, type ExecutionRecord, type RunDataStore, RunDataStoreError } from "../../../store/runDataStore.ts";
import { painter } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { type RunTotals, runTotals } from "../../format.ts";
import { dataDirOption, openStore } from "../../dataDir.ts";
import app from "./app/index.html";
import { print } from "../../output.ts";

export const DEFAULT_PORT = 4300;

/** An execution as the list shows it: its record, and its container runs' tokens and cost. */
export type ExecutionSummary = ExecutionRecord & { totals: RunTotals };

/**
 * A parameter as a container run recorded it. One name can have several hashes, e.g. a code
 * state that resolves to a different commit in each execution, so the viewer shows both.
 */
export type Parameter = { name: string; parameterHash: string };

/** Each permutation's parameters, in matrix order, as its first container run recorded them, or null if none was. */
export type PermutationParameters = (Record<Axis, Parameter> | null)[];

/** One execution as its page shows it: its summary, as `show --json` prints it, its permutations' parameters, and its container runs. */
export type ExecutionPage = { summary: Summary; parameters: PermutationParameters; containerRuns: ContainerRunRecord[] };

/** One execution as its task's history shows it: its summary, its permutations' parameters, and its container runs' totals. */
export type TaskExecution = { summary: Summary; parameters: PermutationParameters; totals: RunTotals };

/** A task as the list of tasks shows it: the test cases that ran it, and its executions. */
export type TaskSummary = {
  task: string;
  /** Newest first, by the execution they last ran in. */
  testCases: string[];
  executions: number;
  /** The newest of its executions. */
  latest: ExecutionRecord;
};

/** The parameters of each of an execution's `permutations`, from its first container run in `runs`. */
export function permutationParameters(permutations: number, runs: ContainerRunRecord[]): PermutationParameters {
  return Array.from({ length: permutations }, (_, i) => {
    const first = runs.find((run) => run.permutation === i + 1);
    if (first === undefined) return null;
    return Object.fromEntries(
      AXES.map((axis) => [axis, { name: first.parameters[axis].name, parameterHash: first.parameters[axis].parameterHash }]),
    ) as Record<Axis, Parameter>;
  });
}

/** Every task of `executions`, which are newest first, newest first by its newest execution. */
export function summariseTasks(executions: ExecutionRecord[]): TaskSummary[] {
  const tasks = new Map<string, TaskSummary>();
  for (const execution of executions) {
    const task = tasks.get(execution.task);
    if (task === undefined) {
      tasks.set(execution.task, { task: execution.task, testCases: [execution.testCase], executions: 1, latest: execution });
      continue;
    }
    task.executions += 1;
    if (!task.testCases.includes(execution.testCase)) task.testCases.push(execution.testCase);
  }
  return [...tasks.values()];
}

/** The measurements of `task`, as declared today. */
export type MeasurementsOf = (task: string) => Promise<Measurement[]>;

/** What `read` returns, as JSON: a Response as it is, or the store's or the task's config error as a 500. */
async function json(read: () => Promise<unknown>): Promise<Response> {
  try {
    const body = await read();
    return body instanceof Response ? body : Response.json(body);
  } catch (error) {
    if (error instanceof ConfigError) return Response.json({ error: error.message }, { status: 500 });
    if (!(error instanceof RunDataStoreError)) throw error;
    return Response.json({ error: `Can't read ${error.path}: ${error.message}` }, { status: 500 });
  }
}

/**
 * Serves the viewer of `store` on `port`, 0 for any free one. An execution's measures are
 * aggregated by `measurementsOf` its task, the project's as declared today, as `show` does.
 *
 *   GET /                                       the app
 *   GET /api/tasks                              every TaskSummary, newest first
 *   GET /api/tasks/:task                        each TaskExecution of the task, newest first, or a 404
 *   GET /api/executions                         every ExecutionSummary, newest first
 *   GET /api/executions/:id                     an ExecutionPage, or a 404
 */
export function startViewServer(store: RunDataStore, port: number, measurementsOf: MeasurementsOf) {
  return Bun.serve({
    port,
    development: false,
    routes: {
      "/": app,
      "/api/tasks": () => json(async () => summariseTasks(await store.listExecutions())),
      "/api/tasks/:task": (req) =>
        json(async () => {
          const { task } = req.params;
          const executions = (await store.listExecutions()).filter((e) => e.task === task);
          if (executions.length === 0) return Response.json({ error: `No execution of task ${task} recorded.` }, { status: 404 });
          const measurements = await measurementsOf(task);
          return Promise.all(
            executions.map(async (execution): Promise<TaskExecution> => {
              const runs = await store.containerRunsOf(execution.executionId);
              return {
                summary: summariseExecution(execution, runs, measurements),
                parameters: permutationParameters(execution.matrix.permutations, runs),
                totals: runTotals(runs),
              };
            }),
          );
        }),
      "/api/executions": () =>
        json(async () => {
          const executions = await store.listExecutions();
          return Promise.all(
            executions.map(async (e): Promise<ExecutionSummary> => ({ ...e, totals: runTotals(await store.containerRunsOf(e.executionId)) })),
          );
        }),
      "/api/executions/:id": (req) =>
        json(async () => {
          const { id } = req.params;
          const execution = (await store.listExecutions()).find((e) => e.executionId === id);
          if (execution === undefined) return Response.json({ error: `No execution ${id} recorded.` }, { status: 404 });
          const containerRuns = await store.containerRunsOf(id);
          const page: ExecutionPage = {
            summary: summariseExecution(execution, containerRuns, await measurementsOf(execution.task)),
            parameters: permutationParameters(execution.matrix.permutations, containerRuns),
            containerRuns,
          };
          return page;
        }),
      "/api/*": () => Response.json({ error: "Not found." }, { status: 404 }),
    },
    fetch: () => new Response("Not found.", { status: 404 }),
  });
}

/**
 * Serves the viewer on `port`. Like `show`, it needs the project's `.thunderjar/` folder, in `cwd`
 * or above it, for the measurements that aggregate an execution's measures, even with `dataDir`.
 */
async function view(cwd: string, port: number, dataDir?: string): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { store, where } = await openStore(cwd, dataDir, root);
  // Built into dist/, Bun finds the app's files relative to the working directory rather than to
  // the bundle, on every request. So serve from the bundle's folder. The store's path is absolute.
  process.chdir(import.meta.dir);
  const server = startViewServer(store, port, (task) => loadMeasurements(root, task));
  const paint = painter();
  print(`${paint.dim("Viewing")} ${paint.cyan(where)}`);
  print(`${paint.dim("Open")} ${paint.bold(paint.cyan(String(server.url)))}`);
}

export function createViewCommand(): Command {
  return new Command("view")
    .description("Start a local web page for browsing the tasks, executions and container runs in the run data store. Runs until stopped.")
    .addOption(dataDirOption())
    .addOption(new Option("--port <port>", "the port to serve on, 0 for any free one").default(DEFAULT_PORT).argParser((value) => {
      const port = Number(value);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid port: ${value}`);
      return port;
    }))
    .action(
      reportingConfigErrors(async (options: { dataDir?: string; port: number }) => {
        await view(process.cwd(), options.port, options.dataDir);
      }),
    );
}
