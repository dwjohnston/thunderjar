// `thunderjar view`: a local web page for browsing the run data store. A Bun server answers a small
// JSON API from the store, and serves a client-rendered React app that reads it. The store is
// read afresh on each request, so a reload shows runs recorded since the page opened.
import { Command, Option } from "commander";
import { ConfigError, findThunderjarRoot } from "../../../config/loader.ts";
import { loadMeasurements, type Measurement } from "../../../config/measurements.ts";
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

/** One execution as its page shows it: its summary, as `show --json` prints it, and its container runs. */
export type ExecutionPage = { summary: Summary; containerRuns: ContainerRunRecord[] };

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
 *   GET /api/executions                         every ExecutionSummary, newest first
 *   GET /api/executions/:id                     an ExecutionPage, or a 404
 */
export function startViewServer(store: RunDataStore, port: number, measurementsOf: MeasurementsOf) {
  return Bun.serve({
    port,
    development: false,
    routes: {
      "/": app,
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
          const page: ExecutionPage = { summary: summariseExecution(execution, containerRuns, await measurementsOf(execution.task)), containerRuns };
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
    .description("Start a local web page for browsing the executions and container runs in the run data store. Runs until stopped.")
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
