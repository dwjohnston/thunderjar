import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFixtureProject, linkThunderjar, stub } from "../testing/fixture-project.ts";
import { executions } from "./executions.ts";
import { run } from "./run.ts";

const tmp = () => mkdtemp(join(tmpdir(), "thunderjar-executions-"));

const cli = resolve(import.meta.dir, "..", "cli", "index.ts");

async function fixture() {
  const dir = await tmp();
  await createFixtureProject(dir, {
    "test-cases/fake-twice.ts": stub("declareTestCase", `{
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-agent@1.0.0/fake"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
}`),
  });
  await linkThunderjar(dir);
  return dir;
}

/** Runs `name` for real, quietly, as execution `id` with a clock starting at `startedAt`. */
async function runAt(dir: string, name: string, id: string, startedAt: string) {
  let t = Date.parse(startedAt);
  await run(name, {
    dryRun: false,
    cwd: dir,
    newExecutionId: () => id,
    now: () => (t += 40),
    rootDir: await tmp(),
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

const FIRST = "01k4x9j2e8mqz3abcdefghjkmn";
const SECOND = "01k4xb7q0c2tnvabcdefghjkmn";
const THIRD = "01k4xc0000000000000000000a";

test("lists nothing before anything has run", async () => {
  const dir = await fixture();
  expect(await executions(undefined, dir)).toBe("No executions recorded.");
  expect(await executions("fake-is-prime", dir)).toBe("No executions recorded for fake-is-prime.");
});

test("`run` twice, then `executions` lists both, newest first", async () => {
  const dir = await fixture();
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  await runAt(dir, "fake-is-prime", SECOND, "2026-09-29T15:02:10Z");

  expect(await executions(undefined, dir)).toBe(`${SECOND}  fake-is-prime  2026-09-29 15:02
${FIRST}  fake-is-prime  2026-09-29 14:30`);
});

test("`thunderjar executions [<test case>]` lists every test case's executions, or one's", async () => {
  const dir = await fixture();
  await runAt(dir, "fake-is-prime", FIRST, "2026-09-29T14:30:55Z");
  await runAt(dir, "fake-twice", SECOND, "2026-09-29T15:02:10Z");
  await runAt(dir, "fake-is-prime", THIRD, "2026-09-30T08:00:00Z");

  expect(await spawnCli(dir, "executions")).toEqual({
    stdout: `${THIRD}  fake-is-prime  2026-09-30 08:00
${SECOND}  fake-twice     2026-09-29 15:02
${FIRST}  fake-is-prime  2026-09-29 14:30
`,
    stderr: "",
    exitCode: 0,
  });
  expect(await spawnCli(dir, "executions", "fake-is-prime")).toEqual({
    stdout: `${THIRD}  fake-is-prime  2026-09-30 08:00
${FIRST}  fake-is-prime  2026-09-29 14:30
`,
    stderr: "",
    exitCode: 0,
  });
});

test("prints usage for extra arguments or a flag", async () => {
  const dir = await fixture();
  for (const args of [["executions", "a", "b"], ["executions", "--json"]]) {
    const { stderr, exitCode } = await spawnCli(dir, ...args);
    expect(stderr).toBe("usage: thunderjar executions [<test case>]\n");
    expect(exitCode).toBe(1);
  }
});
