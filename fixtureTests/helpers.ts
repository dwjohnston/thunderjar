// Shared by the scenarios' tests: run the CLI against a scenario's fixtures/ project, the way a
// developer would by hand (`bun run fixture <scenario> …`), and read back what it left.
//
// What varies from run to run (the execution ID, $TMPDIR and durations) is replaced with
// placeholders, so expected output reads like what is printed. Real runs work on a copy of
// fixtures/, because they write .thunderjar/.data/; dry runs run in fixtures/ itself. Real runs
// use real Docker, with their images under a throwaway prefix, so they sit in
// `run.docker.test.ts` files and run under `bun run test:docker` only.
//
// Running the CLI against the fake Docker is src/testing/cli.ts's, shared with src/cli/commands/'s
// tests, which run it in these scenarios too.

import { expect } from "bun:test";
import { listDir, makeTempDir } from "../src/platform/fs.ts";
import { join } from "../src/platform/path.ts";
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
  ...listDir(dir),
  ...listDir(join(dir, ".thunderjar"), { recursive: true }),
].toSorted();

/** Runs `script` with sh in a throwaway container from the image `ref`, returning its stdout. */
export function inImage(ref: string, script: string) {
  const result = Bun.spawnSync(["docker", "run", "--rm", ref, "sh", "-c", script], { stdout: "pipe", stderr: "pipe" });
  expect(result.stderr.toString()).toBe("");
  return result.stdout.toString();
}

/** Every image tagged under `prefix`, as `<prefix>:<tag>`. */
export const imagesUnder = (prefix: string) =>
  Bun.spawnSync(["docker", "image", "ls", "--format", "{{.Repository}}:{{.Tag}}", prefix], { stdout: "pipe", stderr: "pipe" })
    .stdout.toString()
    .split("\n")
    .filter(Boolean)
    .toSorted();

/** The throwaway image prefixes real runs used; `removeTestImages` deletes every image under them. */
const prefixes: string[] = [];

/** Deletes every image a real run in this test file tagged. Call it in `afterAll`. */
export function removeTestImages() {
  const images = prefixes.flatMap(imagesUnder);
  if (images.length > 0) Bun.spawnSync(["docker", "image", "rm", "--force", ...images], { stdout: "ignore", stderr: "ignore" });
}

/**
 * Runs `testCase` for real, against real Docker, in a copy of `fixtures`, with its images under
 * a throwaway prefix of its own, so every prerun image is built. Checks it wrote only the run
 * data store into the project, and left no scratch copies behind.
 */
export async function runForReal(fixtures: string, testCase: string) {
  const dir = await copyOfFixtures(fixtures);
  const tmpDir = await makeTempDir("thunderjar-fixture-tmp-");
  const prefix = `thunderjar-test-${process.pid}-${prefixes.length}-${Date.now()}`;
  prefixes.push(prefix);
  const before = listTree(dir);
  const { stdout, exitCode } = await thunderjar(dir, ["run", testCase, "--image-prefix", prefix], {
    TMPDIR: tmpDir,
    THUNDERJAR_DOCKER: "docker",
  });
  expect(exitCode).toBe(0);
  const store = (await Bun.file(join(dir, ".thunderjar", ".data", "runs.json")).json()) as {
    containerRuns: ContainerRunRecord[];
    aggregationResults?: AggregationResult[];
  };
  expect(listTree(dir)).toEqual([...before, ".data", join(".data", "runs.json")].toSorted());
  expect(listDir(tmpDir).filter((name) => name.startsWith("thunderjar-measure-"))).toEqual([]);
  const output = normalise(stdout, tmpDir)
    .replaceAll(prefix, "<prefix>")
    .replace(/ built \(\d+\.\d\ds\)$/gm, " built (<t>s)");
  return { output, prefix, store, images: imagesUnder(prefix) };
}

/**
 * One container run's postrun image, `<prefix>:<tag>`: what the agent left in /workspace (each
 * file its prerun image didn't have), its result file and run.json.
 */
export const containerRun = (prefix: string, tag: string) => {
  const ref = `${prefix}:${tag}`;
  const prerun = `${prefix}:prerun-h${/-h([0-9a-f]{8})-i/.exec(tag)![1]}`;
  const files = (image: string) => inImage(image, "ls -A /workspace").split("\n").filter(Boolean);
  const before = new Set(files(prerun));
  return {
    workspace: files(ref).filter((file) => !before.has(file)),
    read: (rel: string) => inImage(ref, `cat /workspace/${rel}`),
    result: inImage(ref, "cat /thunderjar/result.json 2>/dev/null || true") || undefined,
    run: JSON.parse(inImage(ref, "cat /thunderjar/run.json")) as { startedAt: number; finishedAt: number; exitCode: number },
  };
};

/** Each container run's postrun tag, in the order they were recorded. */
export const tagsIn = (store: { containerRuns: ContainerRunRecord[] }) => store.containerRuns.map((r) => r.postrunImage);
