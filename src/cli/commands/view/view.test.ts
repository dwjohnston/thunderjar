// `thunderjar view`: a server over the run data store. It only reads the store, so it runs on
// 0203's checked-in store unchanged. Most tests start the server in this process, on a free
// port; one starts it through the CLI, as a user would. Run it by hand with
// `bun run fixture 0203 view`.
import { afterEach, describe, expect, test } from "bun:test";
import { fileStore } from "../../../store/runDataStore.ts";
import { scenario } from "../../../testing/scenario.ts";
import { thunderjar } from "../../../testing/cli.ts";
import { startViewServer } from "./view.ts";

const STORE = () => `${scenario("0203")}/.thunderjar/.data`;

const servers: ReturnType<typeof startViewServer>[] = [];

/** A viewer of `dataDir`'s store on a free port, stopped after the test. */
function serve(dataDir = STORE()) {
  const server = startViewServer(fileStore(dataDir), 0);
  servers.push(server);
  return (path: string) => fetch(new URL(path, server.url));
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
});

describe("0203 recorded executions", () => {
  test("/ is the app's page, with its script", async () => {
    const res = await serve()("/");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain('<div id="root"></div>');
    expect(html).toMatch(/<script type="module"[^>]* src="[^"]+\.js"/);
  });

  test("/api/executions: every execution, newest first", async () => {
    const executions = (await (await serve()("/api/executions")).json()) as { executionId: string; testCase: string }[];

    expect(executions.map(({ executionId, testCase }) => [executionId, testCase])).toEqual([
      ["01m430hgt00w0g80g80m3g2102", "two-harnesses"],
      ["01m40g5972dza3k7g3d36k55zw", "example"],
      ["01m3ygz4g89aqh8yey8em0twpq", "two-harnesses"],
      ["01m3vf68s54p5eyn5s3t1ygkdj", "is-prime-baseline"],
    ]);
  });

  test("/api/executions/:id: the execution, and its container runs by permutation then iteration", async () => {
    const body = (await (await serve()("/api/executions/01m3vf68s54p5eyn5s3t1ygkdj")).json()) as {
      execution: { testCase: string; status: string };
      containerRuns: { permutation: number; iteration: number }[];
    };

    expect(body.execution).toMatchObject({ testCase: "is-prime-baseline", status: "complete" });
    expect(body.containerRuns).toHaveLength(40);
    expect(body.containerRuns.slice(0, 6).map(({ permutation, iteration }) => `${permutation}-${iteration}`)).toEqual(["1-1", "1-2", "1-3", "1-4", "1-5", "2-1"]);
  });

  test("/api/executions/:id of an execution not recorded is a 404", async () => {
    const res = await serve()("/api/executions/nope");

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No execution nope recorded." });
  });

  test("an unknown path is a 404", async () => {
    const get = serve();

    expect((await get("/api/nope")).status).toBe(404);
    expect((await get("/nope")).status).toBe(404);
  });
});

describe("a store that doesn't exist", () => {
  test("is empty", async () => {
    const res = await serve(`${scenario("0203")}/no-such-store`)("/api/executions");

    expect(await res.json()).toEqual([]);
  });
});

describe("through the CLI", () => {
  test("serves the project's store, and says where", async () => {
    const proc = Bun.spawn(["bun", `${import.meta.dir}/../../index.ts`, "view", "--port", "0"], { cwd: scenario("0203"), stdout: "pipe", stderr: "pipe" });
    try {
      const reader = proc.stdout.getReader();
      let stdout = "";
      while (!stdout.includes("Open ")) {
        const { value, done } = await reader.read();
        if (done) break;
        stdout += new TextDecoder().decode(value);
      }
      const [viewing, open] = stdout.trim().split("\n");

      expect(viewing).toBe(`Viewing ${STORE()}`);
      expect(open).toMatch(/^Open http:\/\/localhost:\d+\/$/);
      const executions = (await (await fetch(`${open!.slice("Open ".length)}api/executions`)).json()) as unknown[];
      expect(executions).toHaveLength(4);
    } finally {
      proc.kill();
      await proc.exited;
    }
  });

  test("--port that isn't a port is an error", async () => {
    const { stderr, exitCode } = await thunderjar(scenario("0203"), ["view", "--port", "http"]);

    expect(stderr).toContain("Invalid port: http");
    expect(exitCode).not.toBe(0);
  });
});
