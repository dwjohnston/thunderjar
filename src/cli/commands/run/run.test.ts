// `thunderjar run`, through the CLI. `--dry-run` only reads the project, so it runs on the scenarios
// unchanged. A real run goes to the fake Docker, which runs each container's script on the host
// (see src/testing/fakeDocker.ts), and writes its store under a temporary `--data-dir`, or into a
// copy of the scenario. Any of these can be run by hand, e.g.
// `bun run fixture 0202 run is-prime-baseline --dry-run`. For real Docker, see run.docker.test.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { $, Glob } from "bun";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure, RecordedOutcome } from "../../../store/runDataStore.ts";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";
const TERSE = "isPrime.ts: export a primality test.";

const ALPHA = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"fake-model-small-001"}' > /thunderjar/result.json`;
const BETA = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts && echo '{"model":"fake-model-large-001"}' > /thunderjar/result.json`;

/** The dry run's lines for permutation `n`, with its `iterations`, each running `command`. */
const permutation = (n: number, hash: string, iterations: number, command: string) =>
  [
    `Permutation ${n}: prerun image thunderjar-prerun:${hash}`,
    ...Array.from({ length: iterations }, (_, i) => [
      `  Iteration ${i + 1}: postrun image thunderjar-postrun:<ULID>-${n}-${i + 1}`,
      `    ${command}`,
    ]).flat(),
  ].join("\n");

const filesIn = (dir: string) => [...new Glob("**").scanSync({ cwd: dir, dot: true })].sort();

describe("0202 typical project", () => {
  test("example: the execution's ID, then its one permutation's prerun image, and its iteration's postrun image and harness command", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "5650e1a8", 1, ALPHA(PLAIN))}
`);
  });

  test("is-prime-baseline: every permutation in plan's order, with its hash, and every iteration inside it", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "5650e1a8", 5, ALPHA(PLAIN))}

${permutation(2, "8ff151b1", 5, ALPHA(TERSE))}

${permutation(3, "de78e815", 5, BETA(PLAIN))}

${permutation(4, "4437033b", 5, BETA(TERSE))}

${permutation(5, "69114039", 5, ALPHA(PLAIN))}

${permutation(6, "050f83dc", 5, ALPHA(TERSE))}

${permutation(7, "db4da990", 5, BETA(PLAIN))}

${permutation(8, "b36f0c54", 5, BETA(TERSE))}
`);
  });

  test("the prerun images carry the hashes plan shows", async () => {
    const run = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"]);
    const plan = await thunderjar(scenario("0202"), ["plan", "is-prime-baseline"]);

    const hashes = plan.stdout.match(/\b[0-9a-f]{8}(?=  \w+$)/gm);
    expect(run.stdout.match(/(?<=thunderjar-prerun:)[0-9a-f]{8}/g)).toEqual(hashes);
  });

  test("--image-prefix starts every image name with it", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run", "--image-prefix", "throwaway"]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "5650e1a8", 1, ALPHA(PLAIN)).replaceAll("thunderjar-", "throwaway-")}
`);
  });

  test("writes nothing", async () => {
    const before = filesIn(scenario("0202"));

    await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"]);

    expect(filesIn(scenario("0202"))).toEqual(before);
  });

  test("an unknown test case is a configuration error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "missing", "--dry-run"]);

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: No test case named "missing": expected .thunderjar/test-cases/missing.ts.\n');
    expect(exitCode).toBe(1);
  });

  test("two-harnesses: one permutation per fake harness, one iteration each", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run"]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "5650e1a8", 1, ALPHA(PLAIN))}

${permutation(2, "de78e815", 1, BETA(PLAIN))}
`);
  });
});

const dataDirs: string[] = [];
/** A fresh folder for `--data-dir`, removed after the test. */
const dataDir = () => {
  const dir = `${TMP_DIR}/data-${crypto.randomUUID()}`;
  dataDirs.push(dir);
  return dir;
};

afterEach(async () => {
  for (const dir of dataDirs.splice(0)) await $`rm -rf ${dir}`.quiet();
});

/** The execution record and container run records in the store under `dir`, for its one execution. */
async function readStore(dir: string) {
  const [executionDir] = [...new Glob("runs/*").scanSync({ cwd: dir, onlyFiles: false })];
  const containerRuns = [...new Glob("container-runs/*.json").scanSync({ cwd: `${dir}/${executionDir}` })].sort();
  return {
    files: filesIn(dir),
    execution: (await Bun.file(`${dir}/${executionDir}/execution.json`).json()) as ExecutionRecord,
    containerRuns: (await Promise.all(
      containerRuns.map((file) => Bun.file(`${dir}/${executionDir}/${file}`).json()),
    )) as ContainerRunRecord[],
  };
}

/** The commands the fake Docker was given for containers, the script and `cp` destination elided. */
const containerCommands = async (docker: FakeDocker) =>
  (await docker.commands())
    .filter((command) => !command.startsWith("docker image ls") && !command.startsWith("docker build"))
    .map((command) => command.replace(/ -c [\s\S]*$/, " -c <script>").replace(/^(docker cp \S+) .*$/, "$1 <destination>"));

const ISO = expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
const SHA = expect.stringMatching(/^[0-9a-f]{64}$/);

/** The measures line of a fake agent's container run, in 0202's is-prime task. */
const ALPHA_MEASURES = "      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1";
const BETA_MEASURES = "      isPrimeTemplateTest: {passed: 5, failed: 0}   isPrimeTsExists: true   tsIgnoreCount: 0";

/** A measure as recorded, taken by `instrument`, with `outcome`. */
const measure = (instrument: string, outcome: RecordedOutcome): RecordedMeasure => ({ instrument, contentHash: SHA, measuredAt: ISO, outcome });
const measured = (instrument: string, data: unknown) => measure(instrument, { outcome: "measured", data });

describe("run, against the fake Docker", () => {
  test("0202 two-harnesses: builds the missing prerun images, runs each iteration in a container, and records it", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>
Building thunderjar-prerun:5650e1a8 ... done
Building thunderjar-prerun:de78e815 ... done
 1/2  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
${ALPHA_MEASURES}
 2/2  iteration 1/1  fake-harness-beta | plain  ... done (<duration>)
${BETA_MEASURES}
Wrote <DATA>/runs/<ULID>/
`);

    const store = await readStore(data);
    const id = store.execution.executionId;
    expect(store.files).toEqual([`runs/${id}/container-runs/1-1.json`, `runs/${id}/container-runs/2-1.json`, `runs/${id}/execution.json`]);
    expect(store.execution).toEqual({
      executionId: expect.stringMatching(/^[0-7][0-9a-z]{25}$/),
      testCase: "two-harnesses",
      task: "is-prime",
      startedAt: ISO,
      finishedAt: ISO,
      status: "complete",
      matrix: { shape: [1, 1, 1, 2, 1], permutations: 2, iterations: 1 },
    });
    const [alpha, beta] = store.containerRuns as [ContainerRunRecord, ContainerRunRecord];
    expect(alpha).toEqual({
      executionId: id,
      testCase: "two-harnesses",
      task: "is-prime",
      permutation: 1,
      permutationHash: expect.stringMatching(/^5650e1a8[0-9a-f]{56}$/),
      iteration: 1,
      postrunImage: `thunderjar-postrun:${id}-1-1`,
      ranAt: new Date(alpha.execution.startedAt).toISOString(),
      parameters: {
        baseImage: { name: "node20", parameterHash: SHA },
        codeState: { name: "baseline", parameterHash: SHA },
        promptSet: { name: "snerk", parameterHash: SHA },
        harnessModel: { name: "fake-harness-alpha@1.0.0/fake-model-small", parameterHash: SHA },
        initialPrompt: { name: "plain", parameterHash: SHA },
      },
      harnessModel: { harness: "fake-harness-alpha", version: "1.0.0", model: "fake-model-small", modelId: "fake-model-small-001" },
      execution: { startedAt: expect.any(Number), finishedAt: expect.any(Number), exitCode: 0 },
      harnessResult: '{"model":"fake-model-small-001"}\n',
      result: {
        isPrimeTemplateTest: measured("templateTest", { passed: 3, failed: 2 }),
        isPrimeTsExists: measured("fileCreated", true),
        tsIgnoreCount: measured("grep", 1),
      },
    });
    expect(alpha.execution.finishedAt).toBeGreaterThanOrEqual(alpha.execution.startedAt);
    expect(beta.permutationHash).toStartWith("de78e815");
    expect(beta.harnessModel.modelId).toBe("fake-model-large-001");
    expect(beta.harnessResult).toBe('{"model":"fake-model-large-001"}\n');
    expect(beta.parameters.baseImage).toEqual(alpha.parameters.baseImage);
    expect(beta.parameters.harnessModel).not.toEqual(alpha.parameters.harnessModel);
    expect(beta.result).toEqual({
      isPrimeTemplateTest: measured("templateTest", { passed: 5, failed: 0 }),
      isPrimeTsExists: measured("fileCreated", true),
      tsIgnoreCount: measured("grep", 0),
    });
    // The same measurements took both runs' measures.
    for (const name of Object.keys(alpha.result)) {
      expect(beta.result[name]?.contentHash).toBe(alpha.result[name]?.contentHash as string);
    }

    // Each container ran from its prerun image, then was committed into its postrun image and removed.
    const container = (n: number) => `thunderjar-run-${id}-${n}-1`;
    const prerun = (n: number) => `thunderjar-prerun:${n === 1 ? "5650e1a8" : "de78e815"}`;
    const commands = await containerCommands(docker);
    expect(commands.filter((command) => !command.includes("-measure-"))).toEqual(
      [1, 2].flatMap((n) => [
        `docker run --name ${container(n)} --pull never --entrypoint sh ${prerun(n)} -c <script>`,
        `docker cp ${container(n)}:/thunderjar/run.json <destination>`,
        `docker cp ${container(n)}:/thunderjar/result.json <destination>`,
        `docker image inspect --format {{json .Config.Entrypoint}}\t{{json .Config.Cmd}} ${prerun(n)}`,
        `docker commit --change ENTRYPOINT [""] --change CMD ["sh"] ${container(n)} thunderjar-postrun:${id}-${n}-1`,
        `docker rm --force ${container(n)}`,
      ]),
    );
    // Then each measure was taken in a container of its own, from the postrun image, then removed.
    for (const n of [1, 2]) {
      for (const k of [1, 2, 3]) {
        const measuring = commands.filter((command) => command.includes(` ${container(n)}-measure-${k}`));
        expect(measuring[0]).toBe(
          `docker run --detach --name ${container(n)}-measure-${k} --pull never --entrypoint sh thunderjar-postrun:${id}-${n}-1 -c <script>`,
        );
        expect(measuring.slice(1, -1)).not.toBeEmpty();
        expect(measuring.slice(1, -1).every((command) => command.startsWith(`docker exec `))).toBe(true);
        expect(measuring.at(-1)).toBe(`docker rm --force ${container(n)}-measure-${k}`);
        expect(commands.indexOf(measuring[0] as string)).toBeGreaterThan(commands.indexOf(`docker rm --force ${container(n)}`));
      }
    }
    expect(await docker.images()).toEqual([
      "thunderjar-prerun:5650e1a8",
      "thunderjar-prerun:de78e815",
      `thunderjar-postrun:${id}-1-1`,
      `thunderjar-postrun:${id}-2-1`,
    ]);
    expect(await docker.containers()).toEqual([]);
  });

  test("by default, the store is .thunderjar/.data/, and existing prerun images are reused", async () => {
    await using copy = await copyScenarioProject("0202");
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:5650e1a8"] });

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
${ALPHA_MEASURES}
Wrote .thunderjar/.data/runs/<ULID>/
`);
    const store = await readStore(`${copy.dir}/.thunderjar/.data`);
    expect(store.execution.status).toBe("complete");
    expect(store.containerRuns).toHaveLength(1);
  });

  test("is-prime-baseline: each line names what tells its permutation apart, and counts its iterations", async () => {
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--data-dir", dataDir()], {
      env: docker.env,
    });

    expect(exitCode).toBe(0);
    const lines = stdout.split("\n").filter((line) => line.includes("iteration"));
    expect(lines).toHaveLength(40);
    expect(lines.slice(0, 6)).toEqual([
      " 1/8  iteration 1/5  snerk | fake-harness-alpha | plain  ... done (<duration>)",
      " 1/8  iteration 2/5  snerk | fake-harness-alpha | plain  ... done (<duration>)",
      " 1/8  iteration 3/5  snerk | fake-harness-alpha | plain  ... done (<duration>)",
      " 1/8  iteration 4/5  snerk | fake-harness-alpha | plain  ... done (<duration>)",
      " 1/8  iteration 5/5  snerk | fake-harness-alpha | plain  ... done (<duration>)",
      " 2/8  iteration 1/5  snerk | fake-harness-alpha | terse  ... done (<duration>)",
    ]);
    expect(lines.at(-1)).toBe(" 8/8  iteration 5/5  glurk | fake-harness-beta | terse  ... done (<duration>)");
    // Permutations 1, 2, 5 and 6 are alpha's; 3, 4, 7 and 8 beta's.
    const measures = stdout.split("\n").filter((line) => line.startsWith("      isPrime"));
    const tenOf = (line: string) => Array<string>(10).fill(line);
    expect(measures).toEqual([...tenOf(ALPHA_MEASURES), ...tenOf(BETA_MEASURES), ...tenOf(ALPHA_MEASURES), ...tenOf(BETA_MEASURES)]);
  }, 60_000);

  test("a harness in two of the test case's pairs is shown by its whole pair", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-cases/two-models.ts`,
      `import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-beta@1.0.0/fake-model-small", "fake-harness-beta@1.0.0/fake-model-large"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`,
    );
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "two-models"], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout.split("\n").filter((line) => line.includes("iteration"))).toEqual([
      " 1/2  iteration 1/1  fake-harness-beta@1.0.0/fake-model-small | plain  ... done (<duration>)",
      " 2/2  iteration 1/1  fake-harness-beta@1.0.0/fake-model-large | plain  ... done (<duration>)",
    ]);
  });

  test("an agent exiting non-zero is recorded and the rest still run, but the execution fails", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({ cli: () => "echo partial > isPrime.ts && exit 3" });
`,
    );
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "two-harnesses", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(stdout).toEndWith(`
 1/2  iteration 1/1  fake-harness-alpha | plain  ... failed (exit 3)
      isPrimeTemplateTest: erroredWhileMeasuring (isPrime.ts has no export to bind {{defaultExport}} to)   isPrimeTsExists: true   tsIgnoreCount: 0
 2/2  iteration 1/1  fake-harness-beta | plain  ... done (<duration>)
${BETA_MEASURES}
Wrote <DATA>/runs/<ULID>/
`);
    const store = await readStore(data);
    expect(store.execution.status).toBe("failed");
    // What the agent left is measured all the same.
    expect(store.containerRuns[0]?.result.isPrimeTemplateTest?.outcome).toEqual({
      outcome: "erroredWhileMeasuring",
      error: { message: "isPrime.ts has no export to bind {{defaultExport}} to" },
    });
    expect(store.containerRuns.map(({ execution, harnessResult }) => [execution.exitCode, harnessResult])).toEqual([
      [3, null],
      [0, '{"model":"fake-model-large-001"}\n'],
    ]);
    // A failed run is committed too, so what the agent left can be looked at.
    expect(await docker.images()).toContain(`thunderjar-postrun:${store.execution.executionId}-1-1`);
    expect(await docker.containers()).toEqual([]);
  });

  test("a measure that can't be taken says why", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({ cli: () => "true" });
`,
    );
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(` 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      isPrimeTemplateTest: skipped (no file matches **/isPrime.ts)   isPrimeTsExists: false   tsIgnoreCount: skipped (no file matches **/*.ts)
Wrote <DATA>/runs/<ULID>/
`);
    const [record] = (await readStore(data)).containerRuns;
    expect(record?.result).toEqual({
      isPrimeTemplateTest: measure("templateTest", { outcome: "skipped", reason: "no file matches **/isPrime.ts" }),
      isPrimeTsExists: measured("fileCreated", false),
      tsIgnoreCount: measure("grep", { outcome: "skipped", reason: "no file matches **/*.ts" }),
    });
  });

  test("a task without measurements has no measures to show", async () => {
    await using copy = await copyScenarioProject("0202");
    await $`rm -r ${copy.dir}/.thunderjar/test-case-parameters/tasks/is-prime/measurements`.quiet();
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/ 1\/1  iteration 1\/1  fake-harness-alpha \| plain  \.\.\. done \(<duration>\)\nWrote /);
    expect((await readStore(data)).containerRuns[0]?.result).toEqual({});
    expect((await docker.commands()).filter((command) => command.includes("-measure-"))).toEqual([]);
  });

  test("a container run that fails, not its agent, is an error, after recording the execution as failed", async () => {
    await using copy = await copyScenarioProject("0202");
    // Leaves the execution wrapper nowhere to write run.json.
    await Bun.write(
      `${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({ cli: () => "rm -rf /thunderjar" });
`,
    );
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:de78e815"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "two-harnesses", "--data-dir", data], { env: docker.env });

    expect(stdout).toMatch(/^Execution <ULID>\nBuilding thunderjar-prerun:\w{8} \.\.\. done\n 1\/2  iteration 1\/1  fake-harness-alpha \| plain  \.\.\. failed\n$/);
    expect(stderr).toMatch(/^Error: Running a container failed: .*thunderjar\/run\.json: Directory nonexistent\n$/);
    expect(exitCode).toBe(1);
    const store = await readStore(data);
    expect(store.execution).toMatchObject({ status: "failed", finishedAt: ISO });
    expect(store.containerRuns).toEqual([]);
    expect((await docker.commands()).filter((command) => command.startsWith("docker commit"))).toEqual([]);
    expect(await docker.containers()).toEqual([]);
  });

  test("Docker that can't be reached is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ unreachable: true });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe("Execution <ULID>\n");
    expect(stderr).toBe(
      "Error: Docker can't be reached, so nothing can be run: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
    );
    expect(exitCode).toBe(1);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("a failed build is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:5650e1a8"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe("Execution <ULID>\nBuilding thunderjar-prerun:5650e1a8 ... failed\n");
    expect(stderr).toBe(
      'Error: Building thunderjar-prerun:5650e1a8 failed: ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1\n',
    );
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => command.startsWith("docker run"))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});

describe("0201 minimal existing setup", () => {
  test("example: one permutation, one iteration", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "e943919c", 1, ALPHA(PLAIN))}
`);
  });
});

describe("0402 broken declarations", () => {
  test("a broken measurement stops the run before anything is built, run or written", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0402"), ["run", "unknown-instrument", "--data-dir", data], {
      env: docker.env,
    });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      'Error: .thunderjar/test-case-parameters/tasks/unknown-instrument/measurements/isPrimeTsExists.ts: instrument: "fileCraeted" is not a known instrument. Known instruments: fileCreated, grep, templateTest\n',
    );
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});
