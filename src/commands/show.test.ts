import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ContainerRunRecord } from "../run-data-store.ts";
import { createHostMeasurementOpener, type MeasurementOpener } from "../runner.ts";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";
import { run } from "./run.ts";
import { show } from "./show.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-show-"));

const cli = resolve(import.meta.dir, "..", "cli", "index.ts");

async function fixture(changes: Record<string, string | null> = {}) {
  const dir = await tmp();
  await createFixtureProject(dir, changes);
  await linkThunderjar(dir);
  return dir;
}

/**
 * Runs `name` for real, quietly, as execution `id` with a clock starting at `startedAt` that
 * moves 40 ms each read, so every container run takes 0.04s.
 */
async function runAt(
  dir: string,
  name: string,
  id: string,
  startedAt: string,
  measurementOpener?: (rootDir: string) => MeasurementOpener,
) {
  let t = Date.parse(startedAt);
  const rootDir = await tmp();
  await run(name, {
    dryRun: false,
    cwd: dir,
    newExecutionId: () => id,
    now: () => (t += 40),
    rootDir,
    measurementOpener: measurementOpener?.(rootDir),
    log: () => {},
  });
}

async function spawnCli(dir: string, ...args: string[]) {
  const proc = Bun.spawn(["bun", cli, ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

const storePath = (dir: string) => join(dir, ".thunderjar", ".data", "runs.json");

/** Every container run recorded in the fixture project's run data store. */
const recordedRuns = (dir: string) =>
  (JSON.parse(readFileSync(storePath(dir), "utf8")) as { containerRuns: ContainerRunRecord[] }).containerRuns;

/** The abbreviated permutation hash and each parameter's shown hash, from the first run recorded for `id`. */
const hashesOf = (dir: string, id: string) => {
  const { permutationHash, parameters } = recordedRuns(dir).find((r) => r.executionId === id)!;
  return {
    hash: permutationHash.slice(0, 8),
    p: Object.fromEntries(Object.entries(parameters).map(([axis, { parameterHash }]) => [axis, parameterHash.slice(0, 4)])),
  };
};

const FIRST = "01k4x9j2e8mqz3abcdefghjkmn";
const SECOND = "01k4xb7q0c2tnvabcdefghjkmn";

const MEASURES_TABLE = `  MEASURE              i1                      i2
  isPrimeTemplateTest  {passed: 4, failed: 1}  {passed: 4, failed: 1}
  isPrimeTsExists      true                    true
  readmeExists         false                   false
  tsIgnoreCount        1                       1

  exit                 0                       0
  duration             0.04s                   0.04s`;

test("`show <test case>` shows its latest execution, a table of every measure in each iteration", async () => {
  const dir = await fixture();
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  await runAt(dir, "fake-is-prime", SECOND, "2026-09-29T15:02:10Z");
  const { hash } = hashesOf(dir, SECOND);

  expect(await show("fake-is-prime", dir)).toBe(`Execution  ${SECOND}  (latest of fake-is-prime)
Test case  fake-is-prime
Task       is-prime
Date       2026-09-29 15:02

Permutation ${hash}  (2 iterations)
  node20 | baseline | snerk | fake-agent@1.0.0/fake | plain

${MEASURES_TABLE}`);
});

test("`thunderjar show <execution ID>` shows that execution, even when it isn't the latest", async () => {
  const dir = await fixture();
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  await runAt(dir, "fake-is-prime", SECOND, "2026-09-29T15:02:10Z");
  const { hash } = hashesOf(dir, FIRST);

  expect(await spawnCli(dir, "show", FIRST)).toEqual({
    stdout: `Execution  ${FIRST}
Test case  fake-is-prime
Task       is-prime
Date       2026-09-29 14:30

Permutation ${hash}  (2 iterations)
  node20 | baseline | snerk | fake-agent@1.0.0/fake | plain

${MEASURES_TABLE}
`,
    stderr: "",
    exitCode: 0,
  });
});

test("`thunderjar show <container run>` shows its parameters, measures, duration and exit code", async () => {
  const dir = await fixture();
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  const { hash, p } = hashesOf(dir, FIRST);
  const tag = `postrun-e${FIRST}-h${hash}-i01`;

  expect(await spawnCli(dir, "show", tag)).toEqual({
    stdout: `Container run  ${tag}
Execution      ${FIRST}  (fake-is-prime)
Permutation    ${hash}, iteration 2
Ran at         2026-09-29 14:30

Parameters
  baseImage      node20                 ${p.baseImage}
  codeState      baseline               ${p.codeState}
  promptSet      snerk                  ${p.promptSet}
  harnessModel   fake-agent@1.0.0/fake  ${p.harnessModel}
  initialPrompt  plain                  ${p.initialPrompt}

Measures
  isPrimeTemplateTest  {passed: 4, failed: 1}
  isPrimeTsExists      true
  readmeExists         false
  tsIgnoreCount        1

Duration  0.04s   exit code 0
`,
    stderr: "",
    exitCode: 0,
  });
});

test("a run whose cli exits 3 shows its exit code, its measures, and why each skipped one was skipped", async () => {
  const dir = await fixture({
    "test-case-parameters/harnessModels/fake-agent/index.ts": stub("declareHarness", `{
  applyParameter: () => \`\`,
  cli: () => \`touch README.md && exit 3\`,
}`),
  });
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  const { hash, p } = hashesOf(dir, FIRST);

  expect(await show(FIRST, dir)).toBe(`Execution  ${FIRST}
Test case  fake-is-prime
Task       is-prime
Date       2026-09-29 14:30

Permutation ${hash}  (2 iterations)
  node20 | baseline | snerk | fake-agent@1.0.0/fake | plain

  MEASURE              i1       i2
  isPrimeTemplateTest  skipped  skipped
  isPrimeTsExists      false    false
  readmeExists         true     true
  tsIgnoreCount        skipped  skipped

  exit                 3        3
  duration             0.04s    0.04s`);

  expect(await show(`postrun-e${FIRST}-h${hash}-i00`, dir)).toBe(`Container run  postrun-e${FIRST}-h${hash}-i00
Execution      ${FIRST}  (fake-is-prime)
Permutation    ${hash}, iteration 1
Ran at         2026-09-29 14:30

Parameters
  baseImage      node20                 ${p.baseImage}
  codeState      baseline               ${p.codeState}
  promptSet      snerk                  ${p.promptSet}
  harnessModel   fake-agent@1.0.0/fake  ${p.harnessModel}
  initialPrompt  plain                  ${p.initialPrompt}

Measures
  isPrimeTemplateTest  skipped  (no file matches **/isPrime.ts)
  isPrimeTsExists      false
  readmeExists         true
  tsIgnoreCount        skipped  (no file matches **/*.ts)

Duration  0.04s   exit code 3`);
});

test("an instrument that throws shows `error` in the table, and its message in the container run view", async () => {
  const dir = await fixture();
  // A context whose glob throws for one pattern only.
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z", (rootDir) => {
    const host = createHostMeasurementOpener(rootDir);
    return {
      async openMeasurementContext(tag) {
        const ctx = await host.openMeasurementContext(tag);
        return {
          ...ctx,
          glob: (pattern) => (pattern.includes("README") ? Promise.reject(new Error("disk on fire")) : ctx.glob(pattern)),
        };
      },
    };
  });
  const { hash } = hashesOf(dir, FIRST);

  expect((await show(FIRST, dir)).split("\n").slice(8)).toEqual([
    "  MEASURE              i1                      i2",
    "  isPrimeTemplateTest  {passed: 4, failed: 1}  {passed: 4, failed: 1}",
    "  isPrimeTsExists      true                    true",
    "  readmeExists         error                   error",
    "  tsIgnoreCount        1                       1",
    "",
    "  exit                 0                       0",
    "  duration             0.04s                   0.04s",
  ]);
  expect((await show(`postrun-e${FIRST}-h${hash}-i00`, dir)).split("\n").slice(12, 17)).toEqual([
    "Measures",
    "  isPrimeTemplateTest  {passed: 4, failed: 1}",
    "  isPrimeTsExists      true",
    "  readmeExists         error  (disk on fire)",
    "  tsIgnoreCount        1",
  ]);
});

test("a measure one run doesn't have shows —, and a run with no measures shows none", async () => {
  const dir = await fixture();
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  // As if readmeExists had been added after the first iteration was measured, and the second
  // had been measured for it alone.
  const containerRuns = recordedRuns(dir);
  delete containerRuns[0]!.result.readmeExists;
  containerRuns[1]!.result = { readmeExists: containerRuns[1]!.result.readmeExists! };
  writeFileSync(storePath(dir), JSON.stringify({ containerRuns }));

  expect((await show(FIRST, dir)).split("\n").slice(8, 13)).toEqual([
    "  MEASURE              i1                      i2",
    "  isPrimeTemplateTest  {passed: 4, failed: 1}  —",
    "  isPrimeTsExists      true                    —",
    "  readmeExists         —                       false",
    "  tsIgnoreCount        1                       —",
  ]);

  containerRuns[1]!.result = {};
  writeFileSync(storePath(dir), JSON.stringify({ containerRuns }));
  expect((await show(containerRuns[1]!.postrunImage, dir)).split("\n").slice(12)).toEqual([
    "Measures",
    "  none",
    "",
    "Duration  0.04s   exit code 0",
  ]);
});

test("an unknown argument is an error that names it, with a non-zero exit", async () => {
  const dir = await fixture();
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  for (const target of ["nope", "fake-twice", `postrun-e${FIRST}-h00000000-i00`]) {
    expect(await spawnCli(dir, "show", target)).toEqual({
      stdout: "",
      stderr: `${target} is not a recorded container run, execution or test case\n`,
      exitCode: 1,
    });
  }
});

test("prints usage for no argument, extra arguments or a flag", async () => {
  const dir = await fixture();
  for (const args of [["show"], ["show", "a", "b"], ["show", "--json"]]) {
    const { stderr, exitCode } = await spawnCli(dir, ...args);
    expect(stderr).toBe("usage: thunderjar show <test case | execution | container run>\n");
    expect(exitCode).toBe(1);
  }
});
