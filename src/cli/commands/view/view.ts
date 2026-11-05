// `thunderjar view`: a local web page for browsing the run data store. A Bun server answers a small
// JSON API from the store, and serves a client-rendered React app that reads it. The store is
// read afresh on each request, so a reload shows runs recorded since the page opened.
import { Command, Option } from "commander";
import { type RunDataStore, RunDataStoreError, sqliteStore } from "../../../store/runDataStore.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { dataDirOption, storeFileOf } from "../../dataDir.ts";
import app from "./app/index.html";

export const DEFAULT_PORT = 4300;

/** What `read` returns, as JSON: a Response as it is, or the store's error as a 500. */
async function json(read: () => Promise<unknown>): Promise<Response> {
  try {
    const body = await read();
    return body instanceof Response ? body : Response.json(body);
  } catch (error) {
    if (!(error instanceof RunDataStoreError)) throw error;
    return Response.json({ error: `Can't read ${error.path}: ${error.message}` }, { status: 500 });
  }
}

/**
 * Serves the viewer of `store` on `port`, 0 for any free one.
 *
 *   GET /                                       the app
 *   GET /api/executions                         every ExecutionRecord, newest first
 *   GET /api/executions/:id                     { execution, containerRuns }, or a 404
 */
export function startViewServer(store: RunDataStore, port: number) {
  return Bun.serve({
    port,
    development: false,
    routes: {
      "/": app,
      "/api/executions": () => json(() => store.listExecutions()),
      "/api/executions/:id": (req) =>
        json(async () => {
          const { id } = req.params;
          const execution = (await store.listExecutions()).find((e) => e.executionId === id);
          if (execution === undefined) return Response.json({ error: `No execution ${id} recorded.` }, { status: 404 });
          return { execution, containerRuns: await store.containerRunsOf(id) };
        }),
      "/api/*": () => Response.json({ error: "Not found." }, { status: 404 }),
    },
    fetch: () => new Response("Not found.", { status: 404 }),
  });
}

async function view(cwd: string, port: number, dataDir?: string): Promise<void> {
  const store = await storeFileOf(cwd, dataDir);
  // Built into dist/, Bun finds the app's files relative to the working directory rather than to
  // the bundle, on every request. So serve from the bundle's folder. The store's path is absolute.
  process.chdir(import.meta.dir);
  const server = startViewServer(sqliteStore(store), port);
  console.log(`Viewing ${store}`);
  console.log(`Open ${server.url}`);
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
