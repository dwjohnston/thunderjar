// `thunderjar run --dry-run`, through the CLI, in the checked-in fixtureTests/ scenarios, in place.
// Each asserts on stdout, with the new execution ID replaced by ID. Any of these can be run by hand:
//
//   bun run fixture scenario_2 run two-pairs --dry-run
//
// Below them, the real-run tests still work on generated projects, in process.

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashMeasurement } from "../../../matrix/hashing.ts";
import type { AggregationResult, ContainerRunRecord } from "../../../store/run-data-store.ts";
import { createHostMeasurementOpener, createHostRunner, type ContainerRunner } from "../../../running/runner.ts";
import { fakeDocker, scenario, thunderjar } from "../../../testing/cli.ts";
import { memoryDocker } from "../../../testing/fake-docker.ts";
import { createFixtureProject, linkThunderjar, stub } from "../../../testing/fixture-project.ts";
import { run, type RunOptions } from "./run.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-run-"));

const ID = "01k4x9j2e8mqz3abcdefghjkmn";
const newExecutionId = () => ID;

const ULID = /^[0-9a-hjkmnp-tv-z]{26}$/;

const idOf = (stdout: string) => /^Execution (\S+) /.exec(stdout)?.[1];

/** `thunderjar run <args…>` in `fixtures`, with the execution ID it printed, and stdout with that ID replaced by ID. */
async function runCli(fixtures: string, args: string[], env: Record<string, string> = {}) {
  const result = await thunderjar(fixtures, ["run", ...args], env);
  const id = idOf(result.stdout);
  return { ...result, id, stdout: id ? result.stdout.replaceAll(id, ID) : result.stdout };
}

/** Each fake harness's cli, as the dry run prints it. */
const ALPHA_CLI = (prompt: string, model: string) =>
  `printf '%s\\n' '// ${prompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"${model}"}' > /thunderjar/result.json`;
const BETA_CLI = (prompt: string, model: string) =>
  `printf '%s\\n' '// ${prompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts && echo '{"model":"${model}"}' > /thunderjar/result.json`;

const TERSE = "isPrime.ts: export a primality test.";
const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";

/** The top level of `dir` and everything under `.thunderjar/`, so a test can show nothing was written. */
const listTree = (dir: string) => [
  ...readdirSync(dir),
  ...readdirSync(join(dir, ".thunderjar"), { recursive: true }).map(String),
].toSorted();

describe("scenario_2_typical_project", () => {
  const fixtures = scenario("scenario_2_typical_project");

  test("run two-pairs --dry-run prints each permutation's prerun image, then each iteration's postrun image and harness command, and writes nothing", async () => {
    const before = listTree(fixtures);

    const { stdout, stderr, exitCode, id } = await runCli(fixtures, ["two-pairs", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(id).toMatch(ULID);
    // The prerun hashes are those `plan` shows for the same permutations (src/cli/commands/plan/plan.test.ts).
    expect(stdout).toBe(`Execution ${ID} (dry run, 2 permutations × 2 iterations)

Permutation 1/2  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | terse
  prerun-hefe85dda (will build)
  iteration 1/2  postrun-e${ID}-hefe85dda-i00
    ${ALPHA_CLI(TERSE, "fake-model-small-001")}
  iteration 2/2  postrun-e${ID}-hefe85dda-i01
    ${ALPHA_CLI(TERSE, "fake-model-small-001")}

Permutation 2/2  node20 | baseline | snerk | fake-harness-beta@1.0.0/fake-model-large  | terse
  prerun-h56ea4852 (will build)
  iteration 1/2  postrun-e${ID}-h56ea4852-i00
    ${BETA_CLI(TERSE, "fake-model-large-001")}
  iteration 2/2  postrun-e${ID}-h56ea4852-i01
    ${BETA_CLI(TERSE, "fake-model-large-001")}
`);
    expect(listTree(fixtures)).toEqual(before);
  });

  test("each invocation gets its own execution ID", async () => {
    const first = await runCli(fixtures, ["two-pairs", "--dry-run"]);
    const second = await runCli(fixtures, ["two-pairs", "--dry-run"]);
    expect(first.id).toMatch(ULID);
    expect(second.id).toMatch(ULID);
    expect(first.id).not.toBe(second.id);
  });

  test("run is-prime-baseline --dry-run walks permutations in plan's order, with every iteration inside each", async () => {
    const { stdout, exitCode } = await runCli(fixtures, ["is-prime-baseline", "--dry-run"]);
    const lines = stdout.split("\n");

    expect(exitCode).toBe(0);
    expect(lines[0]).toBe(`Execution ${ID} (dry run, 8 permutations × 5 iterations)`);
    // The prerun images, in the order `plan is-prime-baseline` lists them (src/cli/commands/plan/plan.test.ts).
    expect(stdout.match(/prerun-h[0-9a-f]{8}/g)).toEqual([
      "prerun-h8ffdda6e",
      "prerun-hefe85dda",
      "prerun-h8baa2cff",
      "prerun-h56ea4852",
      "prerun-hfaa55eaf",
      "prerun-h3e2038b8",
      "prerun-h09fa95b9",
      "prerun-he7379c79",
    ]);

    // Each permutation header is followed by its prerun image and five iterations, i00 to i04.
    const permutationLines = lines.filter((line) => line.startsWith("Permutation "));
    expect(permutationLines.map((line) => line.split("  ")[0])).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Permutation ${n}/8`),
    );
    const iterationLines = lines.filter((line) => line.startsWith("  iteration "));
    expect(iterationLines).toHaveLength(40);
    iterationLines.forEach((line, i) => {
      expect(line).toContain(`iteration ${(i % 5) + 1}/5  postrun-e${ID}-h`);
      expect(line).toEndWith(`-i0${i % 5}`);
    });

    expect(lines.slice(2, 6).join("\n")).toBe(`Permutation 1/8  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  prerun-h8ffdda6e (will build)
  iteration 1/5  postrun-e${ID}-h8ffdda6e-i00
    ${ALPHA_CLI(PLAIN, "fake-model-small-001")}`);
  });

  test("run version-cli-override --dry-run uses the selected version's cli override, and indents every line of a multi-line command", async () => {
    const { stdout, stderr, exitCode } = await runCli(fixtures, ["version-cli-override", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution ${ID} (dry run, 1 permutation × 1 iteration)

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.1.0/fake-model-large | terse
  prerun-h1fef9cf7 (will build)
  iteration 1/1  postrun-e${ID}-h1fef9cf7-i00
    echo "fake-harness-alpha@1.1.0" > version.txt
    ${ALPHA_CLI(TERSE, "fake-model-large-001")}
`);
  });

  test("prints usage for a missing test case name or an unknown flag", async () => {
    for (const args of [
      [],
      ["--dry-run"],
      ["is-prime-baseline", "--dry-run", "--json"],
      ["is-prime-baseline", "--dry-run", "--image-prefix"],
      ["is-prime-baseline", "--dry-run", "--data-dir"],
      ["is-prime-baseline", "--data-dir", "a", "--data-dir", "b"],
    ]) {
      const { stderr, exitCode } = await runCli(fixtures, args);
      expect(stderr).toBe("usage: thunderjar run <test case> [--dry-run] [--image-prefix <name>] [--data-dir <dir>]\n");
      expect(exitCode).toBe(1);
    }
  });

  test("run two-pairs --dry-run --image-prefix looks up each prerun image under the prefix", async () => {
    const docker = await fakeDocker(["throwaway:prerun-hefe85dda"]);

    const { stdout, stderr, exitCode } = await runCli(fixtures, ["two-pairs", "--dry-run", "--image-prefix", "throwaway"], docker.env);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain("  prerun-hefe85dda (exists, reused)\n");
    expect(stdout).toContain("  prerun-h56ea4852 (will build)\n");
    expect(docker.commands()).toEqual([
      "docker version --format {{.Server.Version}}",
      "docker image inspect --format {{.Id}} throwaway:prerun-hefe85dda",
      "docker image inspect --format {{.Id}} throwaway:prerun-h56ea4852",
    ]);
  });

  test("run two-pairs with a data dir writes the run data store only under it, leaving .thunderjar/.data/ untouched", async () => {
    const before = listTree(fixtures);
    const dataDir = join(await tmp(), "data");

    const stdout = await printed("two-pairs", { dryRun: false, cwd: fixtures, newExecutionId, dataDir, ...onHost(await tmp()) });

    expect(stdout).toContain(`Execution ${ID} (2 permutations × 2 iterations)`);
    expect(readdirSync(dataDir)).toEqual(["runs.json"]);
    const { containerRuns } = JSON.parse(readFileSync(join(dataDir, "runs.json"), "utf8")) as { containerRuns: ContainerRunRecord[] };
    expect(containerRuns.map((r) => r.executionId)).toEqual([ID, ID, ID, ID]);
    expect(listTree(fixtures)).toEqual(before);
  });

  test("reports an unknown test case as a configuration error", async () => {
    const { stderr, exitCode } = await runCli(fixtures, ["no-such-test-case", "--dry-run"]);
    expect(stderr).toContain(`no test case named "no-such-test-case"`);
    expect(exitCode).toBe(1);
  });
});

/** Everything `run` prints, as one string. */
async function printed(name: string, options: RunOptions) {
  const blocks: string[] = [];
  await run(name, { ...options, log: (text) => blocks.push(text) });
  return blocks.join("\n");
}

async function fixture(changes: Record<string, string | null> = {}) {
  const dir = await tmp();
  await createFixtureProject(dir, changes);
  await linkThunderjar(dir);
  return dir;
}

// --- Running for real, with the fake agent (fake-harness-alpha@1.0.0/fake-model-small) ---
// In a container on the host in place of Docker, with prerun images "built" by an in-memory
// Docker: what `run` does around each container run, not Docker itself. Real Docker runs are in
// fixtureTests/*/run.docker.test.ts.

/** A clock that moves 40 ms each time it is read, so every container run takes 0.04s. */
const stubClock = () => {
  let t = 1790692255104;
  return () => (t += 40);
};

/** Runs each container run on the host under `rootDir`, timed by `now`, and builds prerun images in memory. */
const onHost = (rootDir: string, now: () => number = Date.now) => ({
  rootDir,
  now,
  docker: memoryDocker(),
  runner: createHostRunner(rootDir, now),
  measurementOpener: createHostMeasurementOpener(rootDir),
});

/** Runs `name` for real with the ID and clock stubbed, keeping container runs under a fresh root. */
async function runForReal(dir: string, name: string) {
  const rootDir = await tmp();
  const stdout = await printed(name, { dryRun: false, cwd: dir, newExecutionId, ...onHost(rootDir, stubClock()) });
  return { stdout, rootDir, executionDir: join(rootDir, ID) };
}

/** The host's stand-in for one postrun image: what the fake agent left, and run.json. */
const containerRun = (executionDir: string, tag: string) => {
  const dir = join(executionDir, tag);
  const read = (rel: string) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), "utf8") : undefined);
  return {
    workspace: readdirSync(join(dir, "workspace")).toSorted(),
    fakeAgentFile: read("workspace/isPrime.ts"),
    result: read("thunderjar/result.json"),
    run: JSON.parse(read("thunderjar/run.json")!) as { startedAt: number; finishedAt: number; exitCode: number },
  };
};

const FAKE = `postrun-e${ID}-h`;

test("builds the prerun image, then runs each container run, leaving the agent's files, its result and run.json, and measures it", async () => {
  const dir = await fixture();
  const { stdout, rootDir, executionDir } = await runForReal(dir, "fake-is-prime");

  const tag = /iteration 1\/2  (\S+)/.exec(stdout)![1]!;
  const hash = tag.slice(FAKE.length, -"-i00".length);
  expect(stdout).toBe(`Execution ${ID} (1 permutation × 2 iterations)
Images in thunderjar
Build contexts in ${join(rootDir, "builds")}

Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain
  prerun-h${hash}  built (0.04s)
  iteration 1/2  ${FAKE}${hash}-i00  exit 0  0.04s
    isPrimeTemplateTest  {passed: 3, failed: 2}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1
  iteration 2/2  ${FAKE}${hash}-i01  exit 0  0.04s
    isPrimeTemplateTest  {passed: 3, failed: 2}
    isPrimeTsExists      true
    readmeExists         false
    tsIgnoreCount        1

2 container runs: 2 exited 0
Recorded in .thunderjar/.data/runs.json`);

  expect(readdirSync(executionDir).toSorted()).toEqual([`${FAKE}${hash}-i00`, `${FAKE}${hash}-i01`]);
  for (const tag of readdirSync(executionDir)) {
    const { workspace, fakeAgentFile, result, run } = containerRun(executionDir, tag);
    // Only what the agent left: no test rendered while measuring.
    expect(workspace).toEqual(["isPrime.ts"]);
    expect(fakeAgentFile).toBe(`// ${PLAIN}
// @ts-ignore
export const isPrime = (n: number) => n > 1 && n % 2 !== 0;
`);
    expect(result).toBe(`{"model":"fake-model-small-001"}\n`);
    expect(run.exitCode).toBe(0);
    expect(run.finishedAt - run.startedAt).toBe(40);
  }
});

test("records a failing cli's exit code, and still runs the remaining iterations", async () => {
  const dir = await fixture({
    // 1.0.1 writes its file, then fails.
    "test-case-parameters/harnessModels/fake-harness-alpha/versions.ts": stub("declareHarnessVersions", `{
  "1.0.0": { version: "1.0.0" },
  "1.0.1": { version: "1.0.1", cli: () => \`touch isPrime.ts && exit 3\` },
}`),
    "test-cases/fake-fails.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-alpha@1.0.1/fake-model-small", "fake-harness-alpha@1.0.0/fake-model-small"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 2,
}`),
  });
  const { stdout, executionDir } = await runForReal(dir, "fake-fails");

  const lines = stdout.split("\n");
  const exits = lines.filter((line) => line.startsWith("  iteration ")).map((line) => / exit (\d+) /.exec(line)![1]);
  const failing = lines.findIndex((line) => line.includes("fake-harness-alpha@1.0.1/fake-model-small"));
  expect(exits).toEqual(failing === 4 ? ["3", "3", "0", "0"] : ["0", "0", "3", "3"]);
  expect(lines.at(-2)).toBe("4 container runs: 2 exited 0, 2 exited 3");

  const runs = readdirSync(executionDir).map((tag) => containerRun(executionDir, tag));
  expect(runs).toHaveLength(4);
  expect(runs.map(({ run }) => run.exitCode).toSorted()).toEqual([0, 0, 3, 3]);
  // Every run left its file, including those after the failures.
  for (const { workspace } of runs) expect(workspace).toEqual(["isPrime.ts"]);

  // Every run is recorded too, the failures with exit code 3.
  const recorded = recordedRuns(dir);
  expect(recorded).toHaveLength(4);
  for (const { harnessModel, execution } of recorded) {
    expect(execution.exitCode).toBe(harnessModel.version === "1.0.1" ? 3 : 0);
  }
});

/** Every container run recorded in the fixture project's run data store. */
const recordedRuns = (dir: string) =>
  (JSON.parse(readFileSync(join(dir, ".thunderjar", ".data", "runs.json"), "utf8")) as {
    containerRuns: ContainerRunRecord[];
  }).containerRuns;

const HASH = /^[0-9a-f]{64}$/;

const TEMPLATE_TEST_CONFIG = { subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" };

const measurementsDir = (dir: string) => join(dir, ".thunderjar", "test-case-parameters", "tasks", "is-prime", "measurements");

test("records each container run, with its execution as in its run.json and every measure as its result", async () => {
  const dir = await fixture();
  const { executionDir } = await runForReal(dir, "fake-is-prime");

  const recorded = recordedRuns(dir);
  expect(recorded.map((r) => r.postrunImage)).toEqual(readdirSync(executionDir).toSorted());
  recorded.forEach((record, iteration) => {
    const { permutationHash, parameters } = record;
    expect(permutationHash).toMatch(HASH);
    for (const { parameterHash } of Object.values(parameters)) expect(parameterHash).toMatch(HASH);
    const { run } = containerRun(executionDir, record.postrunImage);
    expect(record).toEqual({
      executionId: ID,
      testCase: "fake-is-prime",
      task: "is-prime",
      permutationHash,
      iteration,
      postrunImage: `${FAKE}${permutationHash.slice(0, 8)}-i0${iteration}`,
      ranAt: new Date(run.startedAt).toISOString(),
      parameters: {
        baseImage: { name: "node20", parameterHash: parameters.baseImage.parameterHash },
        codeState: { name: "baseline", parameterHash: parameters.codeState.parameterHash },
        promptSet: { name: "snerk", parameterHash: parameters.promptSet.parameterHash },
        harnessModel: { name: "fake-harness-alpha@1.0.0/fake-model-small", parameterHash: parameters.harnessModel.parameterHash },
        initialPrompt: { name: "plain", parameterHash: parameters.initialPrompt.parameterHash },
      },
      harnessModel: { family: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" },
      result: {
        isPrimeTemplateTest: {
          instrument: "templateTest",
          contentHash: hashMeasurement({ instrument: "templateTest", config: TEMPLATE_TEST_CONFIG, dir: measurementsDir(dir) }),
          measuredAt: record.result.isPrimeTemplateTest!.measuredAt,
          outcome: { outcome: "measured", data: { passed: 3, failed: 2 } },
        },
        isPrimeTsExists: {
          instrument: "fileCreated",
          contentHash: hashMeasurement({ instrument: "fileCreated", config: { glob: "**/isPrime.ts" } }),
          measuredAt: record.result.isPrimeTsExists!.measuredAt,
          outcome: { outcome: "measured", data: true },
        },
        readmeExists: {
          instrument: "fileCreated",
          contentHash: hashMeasurement({ instrument: "fileCreated", config: { glob: "**/README.md" } }),
          measuredAt: record.result.readmeExists!.measuredAt,
          outcome: { outcome: "measured", data: false },
        },
        tsIgnoreCount: {
          instrument: "grep",
          contentHash: hashMeasurement({ instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" } }),
          measuredAt: record.result.tsIgnoreCount!.measuredAt,
          outcome: { outcome: "measured", data: 1 },
        },
      },
      execution: run,
    });
    // Measured after the agent finished, by the same clock.
    for (const { measuredAt } of Object.values(record.result)) {
      expect(Date.parse(measuredAt)).toBeGreaterThan(run.finishedAt);
    }
  });
  // The second iteration started after the first finished.
  expect(recorded[1]!.execution.startedAt).toBeGreaterThan(recorded[0]!.execution.finishedAt);
});

test("keeps the runs recorded before a crash", async () => {
  const dir = await fixture();
  let calls = 0;
  const rootDir = await tmp();
  const host = createHostRunner(rootDir, stubClock());
  const runner: ContainerRunner = {
    runContainer: (planned) => (++calls === 2 ? Promise.reject(new Error("docker went away")) : host.runContainer(planned)),
  };

  const options = { dryRun: false, cwd: dir, newExecutionId, log: () => {}, ...onHost(rootDir), runner };
  await expect(run("fake-is-prime", options)).rejects.toThrow("docker went away");
  expect(recordedRuns(dir).map((r) => r.iteration)).toEqual([0]);
  expect(Object.keys(recordedRuns(dir)[0]!.result)).toEqual(["isPrimeTemplateTest", "isPrimeTsExists", "readmeExists", "tsIgnoreCount"]);
});

test("a crash while measuring leaves the container run recorded with an empty result", async () => {
  const dir = await fixture();
  const rootDir = await tmp();
  const options = {
    dryRun: false,
    cwd: dir,
    newExecutionId,
    log: () => {},
    ...onHost(rootDir),
    measurementOpener: { openMeasurementContext: () => Promise.reject(new Error("measurement container went away")) },
  };
  await expect(run("fake-is-prime", options)).rejects.toThrow("measurement container went away");
  expect(recordedRuns(dir).map((r) => [r.iteration, r.result])).toEqual([[0, {}]]);
});

test("an instrument that throws is recorded as erroredWhileMeasuring, and every other measure is still taken", async () => {
  const dir = await fixture();
  const rootDir = await tmp();
  const host = createHostMeasurementOpener(rootDir);
  // A context whose glob throws for one pattern only.
  const measurementOpener = {
    async openMeasurementContext(tag: string) {
      const ctx = await host.openMeasurementContext(tag);
      return {
        ...ctx,
        glob: (pattern: string) => (pattern.includes("README") ? Promise.reject(new Error("disk on fire")) : ctx.glob(pattern)),
      };
    },
  };
  const stdout = await printed("fake-is-prime", { dryRun: false, cwd: dir, newExecutionId, ...onHost(rootDir, stubClock()), measurementOpener });

  expect(stdout.split("\n").filter((line) => line.startsWith("    "))).toEqual([
    "    isPrimeTemplateTest  {passed: 3, failed: 2}",
    "    isPrimeTsExists      true",
    "    readmeExists         erroredWhileMeasuring: disk on fire",
    "    tsIgnoreCount        1",
    "    isPrimeTemplateTest  {passed: 3, failed: 2}",
    "    isPrimeTsExists      true",
    "    readmeExists         erroredWhileMeasuring: disk on fire",
    "    tsIgnoreCount        1",
  ]);
  expect(stdout.split("\n").at(-2)).toBe("2 container runs: 2 exited 0");
  for (const { result } of recordedRuns(dir)) {
    expect(result.isPrimeTsExists!.outcome).toEqual({ outcome: "measured", data: true });
    expect(result.readmeExists!.outcome).toEqual({ outcome: "erroredWhileMeasuring", error: { message: "disk on fire" } });
    expect(result.readmeExists!.instrument).toBe("fileCreated");
    expect(result.readmeExists!.contentHash).toMatch(HASH);
  }
});

test("runs that exit non-zero are still measured", async () => {
  const dir = await fixture({
    "test-case-parameters/harnessModels/fake-harness-alpha/index.ts": stub("declareHarness", `{
  applyParameter: () => \`\`,
  cli: () => \`touch README.md && exit 3\`,
}`),
  });
  const { stdout } = await runForReal(dir, "fake-is-prime");
  // With no isPrime.ts and no .ts file at all, there is nothing to test or count.
  expect(stdout.split("\n").filter((line) => line.startsWith("    "))).toEqual([
    "    isPrimeTemplateTest  skipped",
    "    isPrimeTsExists      false",
    "    readmeExists         true",
    "    tsIgnoreCount        skipped",
    "    isPrimeTemplateTest  skipped",
    "    isPrimeTsExists      false",
    "    readmeExists         true",
    "    tsIgnoreCount        skipped",
  ]);
});

test("a task without measurements prints and records none", async () => {
  const dir = await fixture({
    "test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts": null,
    "test-case-parameters/tasks/is-prime/measurements/readmeExists.ts": null,
    "test-case-parameters/tasks/is-prime/measurements/tsIgnoreCount.ts": null,
    "test-case-parameters/tasks/is-prime/measurements/isPrimeTemplateTest.ts": null,
  });
  const { stdout } = await runForReal(dir, "fake-is-prime");
  expect(stdout.split("\n").filter((line) => line.startsWith("    "))).toEqual([]);
  for (const { result } of recordedRuns(dir)) expect(result).toEqual({});
});

test("kills a cli that runs past the initial prompt's timeoutSeconds, recording exit code 124", async () => {
  const dir = await fixture({
    "test-case-parameters/tasks/is-prime/initial-prompts/plain.ts": stub("declareInitialPrompt", `{
  prompt: "Take your time.",
  timeoutSeconds: 1,
  applyParameter: () => \`\`,
}`),
    "test-case-parameters/harnessModels/fake-harness-alpha/index.ts": stub("declareHarness", `{
  applyParameter: () => \`\`,
  cli: () => \`touch started.txt && sleep 2 && touch finished.txt\`,
}`),
  });
  const rootDir = await tmp();
  const startedAt = Date.now();
  const stdout = await printed("fake-is-prime", { dryRun: false, cwd: dir, newExecutionId, ...onHost(rootDir) });
  const elapsed = Date.now() - startedAt;

  // Each of the two iterations is killed at about a second, well before `sleep 2` ends.
  expect(elapsed).toBeLessThan(3500);
  expect(stdout.split("\n").at(-2)).toBe("2 container runs: 2 exited 124");
  await Bun.sleep(1500); // past when `sleep 2` would have finished
  const executionDir = join(rootDir, ID);
  for (const tag of readdirSync(executionDir)) {
    const { workspace, run } = containerRun(executionDir, tag);
    expect(workspace).toEqual(["started.txt"]);
    expect(run.exitCode).toBe(124);
    expect(run.finishedAt - run.startedAt).toBeGreaterThanOrEqual(1000);
    expect(run.finishedAt - run.startedAt).toBeLessThan(1900);
  }
});

/** Every aggregation result stored in the fixture project's run data store. */
const storedAggregations = (dir: string) =>
  (JSON.parse(readFileSync(join(dir, ".thunderjar", ".data", "runs.json"), "utf8")) as {
    aggregationResults?: AggregationResult[];
  }).aggregationResults;

test("stores each permutation's aggregation result beside its runs, by each measurement's aggregate", async () => {
  const dir = await fixture();
  await runForReal(dir, "fake-is-prime");
  const [{ permutationHash }] = recordedRuns(dir) as [ContainerRunRecord];

  expect(storedAggregations(dir)).toEqual([
    {
      executionId: ID,
      permutationHash,
      iterations: 2,
      measures: {
        isPrimeTemplateTest: { measured: 2, sum: { passed: 6, failed: 4 } },
        isPrimeTsExists: { measured: 2, rate: 1 },
        readmeExists: { measured: 2, rate: 0 },
        tsIgnoreCount: { measured: 2, mean: 1, max: 1 },
      },
      duration: { mean: 40, max: 40 },
    },
  ]);
});

test("recomputes the aggregation result after each container run, so a crash leaves it up to date", async () => {
  const dir = await fixture();
  let calls = 0;
  const rootDir = await tmp();
  const host = createHostRunner(rootDir, stubClock());
  const runner: ContainerRunner = {
    runContainer: (planned) => (++calls === 2 ? Promise.reject(new Error("docker went away")) : host.runContainer(planned)),
  };

  await expect(run("fake-is-prime", { dryRun: false, cwd: dir, newExecutionId, log: () => {}, ...onHost(rootDir), runner })).rejects.toThrow(
    "docker went away",
  );
  expect(storedAggregations(dir)!.map(({ iterations, measures }) => [iterations, measures.isPrimeTsExists])).toEqual([
    [1, { measured: 1, rate: 1 }],
  ]);
});

test("a task without measurements still stores an aggregation result, of its durations", async () => {
  const dir = await fixture({
    "test-case-parameters/tasks/is-prime/measurements/isPrimeTsExists.ts": null,
    "test-case-parameters/tasks/is-prime/measurements/readmeExists.ts": null,
    "test-case-parameters/tasks/is-prime/measurements/tsIgnoreCount.ts": null,
    "test-case-parameters/tasks/is-prime/measurements/isPrimeTemplateTest.ts": null,
  });
  await runForReal(dir, "fake-is-prime");
  expect(storedAggregations(dir)!.map(({ iterations, measures, duration }) => ({ iterations, measures, duration }))).toEqual([
    { iterations: 2, measures: {}, duration: { mean: 40, max: 40 } },
  ]);
});

test("builds each missing prerun image once, under --image-prefix, and reuses one that exists", async () => {
  const dir = await fixture();
  const rootDir = await tmp();
  const host = onHost(rootDir, stubClock());
  const options = { dryRun: false, cwd: dir, newExecutionId, ...host, repository: "thunderjar-test-prefix" };

  const first = await printed("fake-is-prime", options);
  expect(host.docker.builds).toEqual([expect.stringMatching(/^thunderjar-test-prefix:prerun-h[0-9a-f]{8}$/)]);
  expect(first).toContain("Images in thunderjar-test-prefix\n");

  const second = await printed("fake-is-prime", options);
  expect(host.docker.builds).toHaveLength(1);
  const tag = host.docker.builds[0]!.split(":")[1]!;
  expect(second.split("\n").slice(0, 5)).toEqual([
    `Execution ${ID} (1 permutation × 2 iterations)`,
    "Images in thunderjar-test-prefix",
    "",
    "Permutation 1/1  node20 | baseline | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain",
    `  ${tag}  reused`,
  ]);
});

test("fails before running anything when Docker can't be reached", async () => {
  const dir = await fixture();
  const rootDir = await tmp();
  const docker = { ...memoryDocker(), unreachable: async () => "no daemon" };
  const options = { dryRun: false, cwd: dir, newExecutionId, log: () => {}, ...onHost(rootDir), docker };
  await expect(run("fake-is-prime", options)).rejects.toThrow(
    "error: Docker can't be reached (no daemon). Running a test case needs Docker.",
  );
  expect(existsSync(join(dir, ".thunderjar", ".data"))).toBe(false);
});
