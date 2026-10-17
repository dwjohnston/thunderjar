// Shared by the scenarios' tests: run the CLI against a scenario's fixtures/ project, the way a
// developer would by hand (`bun run fixture <scenario> …`), and read back what it left.
//
// What varies from run to run (the execution ID, $TMPDIR and durations) is replaced with
// placeholders, so expected output reads like what is printed. Real runs work on a copy of
// fixtures/, because they write .thunderjar/.data/; dry runs run in fixtures/ itself.
//
// Running the CLI against the fake Docker is src/testing/cli.ts's, shared with src/commands/'s
// tests, which run it in these scenarios too.

import { expect } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AggregationResult, ContainerRunRecord } from "../src/store/run-data-store.ts";
import { copyOfFixtures, thunderjar } from "../src/testing/cli.ts";

export { copyOfFixtures, fakeDocker, thunderjar } from "../src/testing/cli.ts";

export const ULID = /^[0-9a-hjkmnp-tv-z]{26}$/;

/** A scenario's fixtures/ project. `thunderjar` resolves from it through fixtureTests/node_modules. */
export const scenarioFixtures = (scenarioDir: string) => join(scenarioDir, "fixtures");

export const executionIdOf = (stdout: string) => /^Execution (\S+) /.exec(stdout)![1]!;

/** The output with its execution ID, $TMPDIR and durations replaced by placeholders. */
export const normalise = (stdout: string, tmpDir?: string) => {
  const id = executionIdOf(stdout);
  expect(id).toMatch(ULID);
  let text = stdout.replaceAll(id, "<id>").replace(/ exit (\d+) {2}\d+\.\d\ds$/gm, " exit $1  <t>s");
  if (tmpDir) text = text.replaceAll(tmpDir, "$TMPDIR");
  return text;
};

/** The top level of `dir` and everything under `.thunderjar/`, so a test can show nothing was written. */
export const listTree = (dir: string) => [
  ...readdirSync(dir),
  ...readdirSync(join(dir, ".thunderjar"), { recursive: true }).map(String),
].toSorted();

/**
 * Runs `testCase` for real in a copy of `fixtures`, with container runs kept under a fresh
 * $TMPDIR, and checks it wrote only the run data store and left no scratch copies behind.
 */
export async function runForReal(fixtures: string, testCase: string) {
  const dir = await copyOfFixtures(fixtures);
  const tmpDir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-tmp-"));
  const before = listTree(dir);
  const { stdout, stderr, exitCode } = await thunderjar(dir, ["run", testCase], { TMPDIR: tmpDir });
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  const executionDir = join(tmpDir, "thunderjar", executionIdOf(stdout));
  const store = JSON.parse(readFileSync(join(dir, ".thunderjar", ".data", "runs.json"), "utf8")) as {
    containerRuns: ContainerRunRecord[];
    aggregationResults?: AggregationResult[];
  };
  expect(listTree(dir)).toEqual([...before, ".data", join(".data", "runs.json")].toSorted());
  expect(readdirSync(tmpDir).filter((name) => name.startsWith("thunderjar-measure-"))).toEqual([]);
  return { output: normalise(stdout, tmpDir), executionDir, store };
}

/** The host's stand-in for one postrun image: what the agent left, its result and run.json. */
export const containerRun = (executionDir: string, tag: string) => {
  const dir = join(executionDir, tag);
  const read = (rel: string) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : undefined);
  return {
    workspace: readdirSync(join(dir, "workspace")).toSorted(),
    read: (rel: string) => read(join("workspace", rel)),
    result: read("thunderjar/result.json"),
    run: JSON.parse(read("thunderjar/run.json")!) as { startedAt: number; finishedAt: number; exitCode: number },
  };
};

/** Each container run's tag, in order. */
export const tagsIn = (executionDir: string) => readdirSync(executionDir).toSorted();
