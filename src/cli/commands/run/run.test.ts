// `thunderjar run`, through the CLI. `--dry-run` only reads the project, so it runs on the scenarios
// unchanged. A real run goes to the fake Docker, which runs each container's script on the host
// (see src/testing/fakeDocker.ts), and writes its store under a temporary `--data-dir`, or into a
// copy of the scenario. Any of these can be run by hand, e.g.
// `bun run fixture 0202 run is-prime-baseline --dry-run`. For real Docker, see run.docker.test.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { $, SQL } from "bun";
import type { ContainerRunRecord } from "../../../store/runDataStore.ts";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";
import { ALPHA_JSON, ALPHA_MEASURES, AWKWARD, BETA, BETA_MEASURES, ISO, KEY, PLAIN, SHA, TERSE, alphaPermutation, containerCommands, dataDir, filesIn, measure, measured, permutation, postgresSchema, readStore, removeDataDirs, usePostgres } from "./runTestSupport.ts";

afterEach(removeDataDirs);

describe("0202 typical project", () => {
  test("example: the execution's ID, then its one permutation's prerun image, and its iteration's postrun image and harness command", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${alphaPermutation(1, "b9cd78e6", 1, PLAIN)}
`);
  });

  test("is-prime-baseline: every permutation in plan's order, with its prerun image, and every iteration inside it", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${alphaPermutation(1, "b9cd78e6", 5, PLAIN)}

${alphaPermutation(2, "b9cd78e6", 5, TERSE)}

${permutation(3, "44230271", 5, PLAIN, BETA(PLAIN))}

${permutation(4, "44230271", 5, TERSE, BETA(TERSE))}

${alphaPermutation(5, "5e583d26", 5, PLAIN)}

${alphaPermutation(6, "5e583d26", 5, TERSE)}

${permutation(7, "e01991db", 5, PLAIN, BETA(PLAIN))}

${permutation(8, "e01991db", 5, TERSE, BETA(TERSE))}
`);
  });

  test("each permutation runs from the prerun image build would build for it", async () => {
    const run = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"], { env: KEY });
    const build = await thunderjar(scenario("0202"), ["build", "is-prime-baseline", "--dry-run"]);

    const images = run.stdout.match(/(?<=thunderjar-prerun:)[0-9a-f]{8}/g);
    expect(images).toEqual(["b9cd78e6", "b9cd78e6", "44230271", "44230271", "5e583d26", "5e583d26", "e01991db", "e01991db"]);
    expect([...new Set(images)]).toEqual(build.stdout.match(/(?<=^# thunderjar-prerun:)[0-9a-f]{8}/gm) as string[]);
  });

  test("--image-prefix starts every image name with it", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run", "--image-prefix", "throwaway"], { env: KEY });

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${alphaPermutation(1, "b9cd78e6", 1, PLAIN).replaceAll("thunderjar-", "throwaway-")}
`);
  });

  test("writes nothing", async () => {
    const before = filesIn(scenario("0202"));

    await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"], { env: KEY });

    expect(filesIn(scenario("0202"))).toEqual(before);
  });

  test("an unknown test case is a configuration error", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "missing", "--dry-run"], { env: KEY });

    expect(stdout).toBe("");
    expect(stderr).toBe('Error: No test case named "missing": expected .thunderjar/test-cases/missing.ts.\n');
    expect(exitCode).toBe(1);
  });

  test("quoting: the prompt file's contents are shown beside the command that reads it, each line lined up", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "quoting", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

Permutation 1: prerun image thunderjar-prerun:36a43eac
  Iteration 1: postrun image thunderjar-postrun:<ULID>-1-1
    prompt:   Say "hello", then print $HOME and \`whoami\`.
              Don't stop at 'single quotes', a backslash \\ or 100%.
    command:  cat /thunderjar/prompt.txt > /thunderjar/result.json
`);
  });

  test("two-harnesses: one permutation per fake harness, one iteration each", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run"], { env: KEY });

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${alphaPermutation(1, "b9cd78e6", 1, PLAIN)}

${permutation(2, "44230271", 1, PLAIN, BETA(PLAIN))}
`);
  });
});

describe("run, against the fake Docker", () => {
  test("0202 two-harnesses: builds the missing prerun images, runs each iteration in a container, and records it", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--data-dir", data], {
      env: { ...docker.env, ...KEY },
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>
Building thunderjar-prerun:b9cd78e6 ... done
Building thunderjar-prerun:44230271 ... done
 1/2  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>, $0.061)
${ALPHA_MEASURES}
 2/2  iteration 1/1  fake-harness-beta | plain  ... done (<duration>)
${BETA_MEASURES}
Recorded in <DATA>/runs.sqlite
`);

    const store = await readStore(data);
    const id = store.execution.executionId;
    expect(store.files).toEqual(["runs.sqlite"]);
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
      permutationHash: expect.stringMatching(/^6274bd13[0-9a-f]{56}$/),
      iteration: 1,
      postrunImage: `thunderjar-postrun:${id}-1-1`,
      ranAt: new Date(alpha.execution.startedAt).toISOString(),
      parameters: {
        baseImage: { name: "node20", parameterHash: SHA },
        codeState: { name: "baseline", parameterHash: SHA },
        promptSet: { name: "snerk", parameterHash: SHA },
        harnessModel: { name: "fake-harness-alpha/fake-model-small-001", parameterHash: SHA },
        initialPrompt: { name: "plain", parameterHash: SHA },
      },
      harnessModel: { harness: "fake-harness-alpha", version: "1.0.0", modelId: "fake-model-small-001" },
      execution: { startedAt: expect.any(Number), finishedAt: expect.any(Number), exitCode: 0, timedOut: false, timeoutSeconds: 600 },
      harnessResult: `${ALPHA_JSON}\n`,
      harnessStderr: "",
      reply: { outcome: "collected", text: "Arr, isPrime.ts be written." },
      tokenCosts: {
        outcome: "collected",
        models: [
          {
            model: "fake-model-small-001",
            inputTokens: 12000,
            outputTokens: 400,
            cacheCreationTokens: 0,
            cacheReadTokens: 80,
            costUsd: 0.061,
            costBasis: "list",
          },
        ],
      },
      sessionId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      result: {
        isPrimeTemplateTest: measured("templateTest", { passed: 3, failed: 2 }),
        isPrimeTsExists: measured("fileCreated", true),
        saysArr: measured("replyMatches", true),
        tsIgnoreCount: measured("grep", 1),
      },
    });
    expect(alpha.execution.finishedAt).toBeGreaterThanOrEqual(alpha.execution.startedAt);
    expect(beta.permutationHash).toStartWith("9ca648c2");
    expect(beta.harnessModel.modelId).toBe("fake-model-large-001");
    expect(beta.harnessResult).toBe('{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}\n');
    expect(beta.reply).toEqual({ outcome: "collected", text: "I wrote isPrime.ts, and tested it up to 100." });
    expect(beta.tokenCosts).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(beta.parameters.baseImage).toEqual(alpha.parameters.baseImage);
    expect(beta.parameters.harnessModel).not.toEqual(alpha.parameters.harnessModel);
    expect(beta.result).toEqual({
      isPrimeTemplateTest: measured("templateTest", { passed: 5, failed: 0 }),
      isPrimeTsExists: measured("fileCreated", true),
      saysArr: measured("replyMatches", false),
      tsIgnoreCount: measured("grep", 0),
    });
    // The same measurements took both runs' measures.
    for (const name of Object.keys(alpha.result)) {
      expect(beta.result[name]?.contentHash).toBe(alpha.result[name]?.contentHash as string);
    }

    // Each container ran from its prerun image, then was committed into its postrun image and removed.
    const container = (n: number) => `thunderjar-run-${id}-${n}-1`;
    const prerun = (n: number) => `thunderjar-prerun:${n === 1 ? "b9cd78e6" : "44230271"}`;
    const commands = await containerCommands(docker);
    expect(commands.filter((command) => !command.includes("-measure-"))).toEqual(
      [1, 2].flatMap((n) => [
        `docker run --name ${container(n)} --pull never ${n === 1 ? "-e FAKE_HARNESS_KEY " : ""}--entrypoint sh ${prerun(n)} -c <script>`,
        `docker cp ${container(n)}:/thunderjar/run.json <destination>`,
        `docker cp ${container(n)}:/thunderjar/result.json <destination>`,
        `docker cp ${container(n)}:/thunderjar/stderr.log <destination>`,
        `docker image inspect --format {{json .Config.Entrypoint}}\t{{json .Config.Cmd}} ${prerun(n)}`,
        `docker commit --change ENTRYPOINT [""] --change CMD ["sh"] ${container(n)} thunderjar-postrun:${id}-${n}-1`,
        `docker rm --force ${container(n)}`,
      ]),
    );
    // Then each measure was taken in a container of its own, from the postrun image, then removed:
    // three of them. saysArr, of the reply, needs no container.
    for (const n of [1, 2]) {
      expect(commands.filter((command) => command.includes(` ${container(n)}-measure-4`))).toEqual([]);
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
      "thunderjar-prerun:b9cd78e6",
      "thunderjar-prerun:44230271",
      `thunderjar-postrun:${id}-1-1`,
      `thunderjar-postrun:${id}-2-1`,
    ]);
    expect(await docker.containers()).toEqual([]);
    // Alpha's container was given its key. Beta's, of another harness, wasn't.
    expect(await docker.fileIn(`thunderjar-postrun:${id}-1-1`, "/thunderjar/fake-harness-key")).toBe("set\n");
    expect(await docker.fileIn(`thunderjar-postrun:${id}-2-1`, "/thunderjar/fake-harness-key")).toBe("\n");
  });

  test("quoting: the prompt reaches the agent byte for byte, through a file", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "quoting", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await readStore(data)).containerRuns;
    // fake-echo copies the prompt file into its result file.
    expect(record?.harnessResult).toBe(AWKWARD);
    expect(await docker.fileIn(record?.postrunImage as string, "/thunderjar/prompt.txt")).toBe(AWKWARD);
  });

  test("by default, the store is .thunderjar/.data/, and existing prerun images are reused", async () => {
    await using copy = await copyScenarioProject("0202");
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:b9cd78e6"] });

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>, $0.061)
${ALPHA_MEASURES}
Recorded in .thunderjar/.data/runs.sqlite
`);
    const store = await readStore(`${copy.dir}/.thunderjar/.data`);
    expect(store.execution.status).toBe("complete");
    expect(store.containerRuns).toHaveLength(1);
  });

  test("is-prime-baseline: each line names what tells its permutation apart, and counts its iterations", async () => {
    // is-prime-baseline with 2 iterations, not 5: each fake iteration costs ~250ms, and 2 still counts them.
    await using copy = await copyScenarioProject("0202");
    const testCase = `${copy.dir}/.thunderjar/test-cases/is-prime-baseline.ts`;
    const source = await Bun.file(testCase).text();
    expect(source).toContain("iterations: 5,");
    await Bun.write(testCase, source.replace("iterations: 5,", "iterations: 2,"));
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "is-prime-baseline", "--data-dir", dataDir()], {
      env: { ...docker.env, ...KEY },
    });

    expect(exitCode).toBe(0);
    const lines = stdout.split("\n").filter((line) => line.includes("iteration"));
    expect(lines).toHaveLength(16);
    expect(lines.slice(0, 3)).toEqual([
      " 1/8  iteration 1/2  snerk | fake-harness-alpha | plain  ... done (<duration>, $0.061)",
      " 1/8  iteration 2/2  snerk | fake-harness-alpha | plain  ... done (<duration>, $0.061)",
      " 2/8  iteration 1/2  snerk | fake-harness-alpha | terse  ... done (<duration>, $0.061)",
    ]);
    expect(lines.at(-1)).toBe(" 8/8  iteration 2/2  glurk | fake-harness-beta | terse  ... done (<duration>)");
    // Permutations 1, 2, 5 and 6 are alpha's; 3, 4, 7 and 8 beta's.
    const measures = stdout.split("\n").filter((line) => line.startsWith("      isPrime"));
    const fourOf = (line: string) => Array<string>(4).fill(line);
    expect(measures).toEqual([...fourOf(ALPHA_MEASURES), ...fourOf(BETA_MEASURES), ...fourOf(ALPHA_MEASURES), ...fourOf(BETA_MEASURES)]);
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
  harnessModel: ["fake-harness-beta/fake-model-small-001", "fake-harness-beta/fake-model-large-001"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`,
    );
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "two-models"], { env: { ...docker.env, ...KEY } });

    expect(exitCode).toBe(0);
    expect(stdout.split("\n").filter((line) => line.includes("iteration"))).toEqual([
      " 1/2  iteration 1/1  fake-harness-beta/fake-model-small-001 | plain  ... done (<duration>)",
      " 2/2  iteration 1/1  fake-harness-beta/fake-model-large-001 | plain  ... done (<duration>)",
    ]);
  });

  test("with a postgresStore whose variable is unset, nothing runs", async () => {
    await using copy = await copyScenarioProject("0202");
    await usePostgres(copy.dir);
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "two-harnesses"], { env: { ...docker.env, ...KEY, THUNDERJAR_DB_URL: "" } });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      "Error: The run data store is Postgres, at the URL in THUNDERJAR_DB_URL, which is not set.\nExport it in the shell that runs thunderjar, or pass --data-dir to use a local SQLite file.\n",
    );
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });

  test("with a postgresStore that can't be reached, nothing is built or run, and the error says so", async () => {
    await using copy = await copyScenarioProject("0202");
    await usePostgres(copy.dir);
    await using docker = await fakeDocker();
    const env = { ...docker.env, ...KEY, THUNDERJAR_DB_URL: "postgres://user:secret@127.0.0.1:1/none" };

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "two-harnesses"], { env });

    expect(stdout).toBe("");
    expect(stderr).toMatch(
      /^Error: Can't use the run data store, Postgres at \$THUNDERJAR_DB_URL, so nothing was run: .+\nCheck it can be reached from here, or pass --data-dir to record in a local SQLite file instead\.\n$/,
    );
    expect(stderr).not.toContain("secret");
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => !command.startsWith("docker image ls"))).toEqual([]);
  });

  // Only with THUNDERJAR_POSTGRES_URL set to a Postgres it may create a schema in.
  test.skipIf(!Bun.env.THUNDERJAR_POSTGRES_URL)("with a postgresStore, the run is recorded in Postgres, and executions and show read it there", async () => {
    await using copy = await copyScenarioProject("0202");
    await usePostgres(copy.dir);
    await using docker = await fakeDocker();
    await using database = await postgresSchema();
    const env = { ...docker.env, ...KEY, THUNDERJAR_DB_URL: database.url };

    const ran = await thunderjar(copy.dir, ["run", "two-harnesses"], { env });
    expect(ran.stderr).toBe("");
    expect(ran.stdout).toEndWith("\nRecorded in Postgres at $THUNDERJAR_DB_URL\n");

    const listed = await thunderjar(copy.dir, ["executions"], { env });
    expect(listed.stdout).toMatch(/^<ULID>  two-harnesses  \d{4}-\d\d-\d\d \d\d:\d\d  2 permutations × 1 iteration  complete\n$/);
    const [{ executionId }] = (await new SQL(database.url)`SELECT execution_id AS "executionId" FROM thunderjar_executions`) as [{ executionId: string }];
    const shown = await thunderjar(copy.dir, ["show", executionId, "2-1"], { env });
    expect(shown.stdout).toStartWith("Container run  2-1\n");
    expect(shown.exitCode).toBe(0);
    // Nothing was written locally.
    expect(await Bun.file(`${copy.dir}/.thunderjar/.data/runs.sqlite`).exists()).toBe(false);
  });

  test("an agent exiting non-zero is recorded and the rest still run, but the execution fails", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({ version: "1.0.0", cli: () => "echo partial > isPrime.ts && echo 'Error: unknown model' >&2 && exit 3" });
`,
    );
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode, log } = await thunderjar(copy.dir, ["run", "two-harnesses", "--data-dir", data], {
      env: { ...docker.env, ...KEY },
      paths: { "<DATA>": data },
      log: true,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(stdout).toEndWith(`
 1/2  iteration 1/1  fake-harness-alpha | plain  ... exited 3, no result file (<duration>)
      isPrimeTemplateTest: erroredWhileMeasuring (isPrime.ts has no export to bind {{defaultExport}} to)   isPrimeTsExists: true   saysArr: skipped (no reply: the agent left no result file)   tsIgnoreCount: 0
 2/2  iteration 1/1  fake-harness-beta | plain  ... done (<duration>)
${BETA_MEASURES}
Recorded in <DATA>/runs.sqlite
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
      [0, '{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}\n'],
    ]);
    // Why it exited non-zero is kept, and logged.
    expect(store.containerRuns.map(({ harnessStderr }) => harnessStderr)).toEqual(["Error: unknown model\n", ""]);
    expect(log).toMatch(/WARN.*agent exited non-zero[\s\S]*"stderr": "Error: unknown model"/);
    // A failed run is committed too, so what the agent left can be looked at.
    expect(await docker.images()).toContain(`thunderjar-postrun:${store.execution.executionId}-1-1`);
    expect(await docker.containers()).toEqual([]);
  });

  test("a measure that can't be taken says why", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({ version: "1.0.0", cli: () => "true" });
`,
    );
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], {
      env: { ...docker.env, ...KEY },
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(` 1/1  iteration 1/1  fake-harness-alpha | plain  ... done, no result file (<duration>)
      isPrimeTemplateTest: skipped (no file matches **/isPrime.ts)   isPrimeTsExists: false   saysArr: skipped (no reply: the agent left no result file)   tsIgnoreCount: skipped (no file matches **/*.ts)
Recorded in <DATA>/runs.sqlite
`);
    const [record] = (await readStore(data)).containerRuns;
    expect(record?.result).toEqual({
      isPrimeTemplateTest: measure("templateTest", { outcome: "skipped", reason: "no file matches **/isPrime.ts" }),
      isPrimeTsExists: measured("fileCreated", false),
      saysArr: measure("replyMatches", { outcome: "skipped", reason: "no reply: the agent left no result file" }),
      tsIgnoreCount: measure("grep", { outcome: "skipped", reason: "no file matches **/*.ts" }),
    });
  });

  test("a task without measurements has no measures to show", async () => {
    await using copy = await copyScenarioProject("0202");
    await $`rm -r ${copy.dir}/.thunderjar/parameters/tasks/is-prime/measurements`.quiet();
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: { ...docker.env, ...KEY } });

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/ 1\/1  iteration 1\/1  fake-harness-alpha \| plain  \.\.\. done \(<duration>, \$0\.061\)\nRecorded in /);
    expect((await readStore(data)).containerRuns[0]?.result).toEqual({});
    expect((await docker.commands()).filter((command) => command.includes("-measure-"))).toEqual([]);
  });

  test("a container run that fails, not its agent, is an error, after recording the execution as failed", async () => {
    await using copy = await copyScenarioProject("0202");
    // Leaves the execution wrapper nowhere to write run.json.
    await Bun.write(
      `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({ version: "1.0.0", cli: () => "rm -rf /thunderjar" });
`,
    );
    await using docker = await fakeDocker({ images: ["thunderjar-prerun:44230271"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "two-harnesses", "--data-dir", data], { env: { ...docker.env, ...KEY } });

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

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--data-dir", data], { env: { ...docker.env, ...KEY } });

    expect(stdout).toBe("Execution <ULID>\n");
    expect(stderr).toBe(
      "Error: Docker can't be reached, so nothing can be run: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
    );
    expect(exitCode).toBe(1);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("a failed build is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:b9cd78e6"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--data-dir", data], { env: { ...docker.env, ...KEY } });

    expect(stdout).toBe("Execution <ULID>\nBuilding thunderjar-prerun:b9cd78e6 ... failed\n");
    expect(stderr).toBe(
      'Error: Building thunderjar-prerun:b9cd78e6 failed: ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1\n',
    );
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => command.startsWith("docker run"))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});

describe("run --json", () => {
  test("0202 two-harnesses: prints the execution, where it's recorded and its container runs as JSON, with its progress on stderr", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--data-dir", data, "--json"], {
      env: { ...docker.env, ...KEY },
      paths: { "<DATA>": data },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toStartWith("Execution <ULID>\nBuilding thunderjar-prerun:b9cd78e6 ... done\n");
    expect(stderr).toEndWith("Recorded in <DATA>/runs.sqlite\n");
    const result = JSON.parse(stdout);
    expect(result.execution).toEqual(expect.objectContaining({ executionId: "<ULID>", testCase: "two-harnesses", status: "complete" }));
    expect(result.recordedIn).toBe("<DATA>/runs.sqlite");
    expect(result.containerRuns.map(({ permutation, iteration }: ContainerRunRecord) => [permutation, iteration])).toEqual([
      [1, 1],
      [2, 1],
    ]);
    expect(result.containerRuns).toHaveLength((await readStore(data)).containerRuns.length);
  });

  test("a failed execution is still printed, with exit code 1", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--data-dir", data, "--json"], { env: { ...docker.env, ...KEY } });

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout).execution.status).toBe("failed");
  });

  test("--dry-run: each permutation, its parameters and images, and each iteration's turns, as JSON", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run", "--json"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const plan = JSON.parse(stdout);
    expect(plan.executionId).toBe("<ULID>");
    expect(plan.permutations).toEqual([
      {
        number: 1,
        parameters: expect.objectContaining({ harnessModel: "fake-harness-alpha/fake-model-small-001" }),
        modelId: "fake-model-small-001",
        harnessVersion: expect.any(String),
        hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        prerunImage: "thunderjar-prerun:b9cd78e6",
        env: ["FAKE_HARNESS_KEY"],
        runOptions: [],
        timeoutSeconds: expect.any(Number),
        iterations: [{ number: 1, postrunImage: expect.stringContaining("thunderjar-postrun:"), sessionId: expect.any(String), turns: [expect.objectContaining({ prompt: expect.any(String), command: expect.any(String) })] }],
      },
    ]);
  });
});
