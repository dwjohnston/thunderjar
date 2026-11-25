// `thunderjar run`, through the CLI. `--dry-run` only reads the project, so it runs on the scenarios
// unchanged. A real run goes to the fake Docker, which runs each container's script on the host
// (see src/testing/fakeDocker.ts), and writes its store under a temporary `--data-dir`, or into a
// copy of the scenario. Any of these can be run by hand, e.g.
// `bun run fixture 0202 run is-prime-baseline --dry-run`. For real Docker, see run.docker.test.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { $, SQL } from "bun";
import { ENV_NAMES_FORMAT, IMAGE_CONFIG_FORMAT } from "../../../docker/docker.ts";
import type { ContainerRunRecord } from "../../../store/runDataStore.ts";
import { copyScenarioProject, thunderjar } from "../../../testing/cli.ts";
import { fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";
import type { ExecutionSummary } from "../../../execution/executionSummary.ts";
import type { Manifest } from "../../../runNext/types.ts";
import type { RunState } from "../../../services/ApplicationState/ApplicationState.ts";
import { ALPHA_JSON, ALPHA_MEASURES, AWKWARD, BETA_MEASURES, ISO, KEY, SHA, TEST_CASE_SECRET, alphaPermutation, containerCommands, dataDir, filesIn, measure, measured, permutation, postgresSchema, readStore, removeDataDirs, usePostgres } from "./runTestSupport.ts";

afterEach(removeDataDirs);

/** `run`'s frame with each run's duration, e.g. `0:00`, replaced: it varies. */
const frame = (stdout: string) => stdout.replace(/  \d+:\d\d(?=  |\n)/g, "  <duration>");
/** A run's measures line, under its run line. */
const under = (measures: string) => ` ${measures}`;

describe("0202 typical project", () => {
  test("example: the execution's ID, then its one permutation's prerun image, and its iteration's postrun image and harness command", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${alphaPermutation(1, "ded54607", 1)}
`);
  });

  test("is-prime-baseline: every permutation in plan's order, with its prerun image, and every iteration inside it", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${alphaPermutation(1, "ded54607", 5)}

${alphaPermutation(2, "602318c8", 5)}

${permutation(3, "e4f0784f", 5)}

${permutation(4, "35965dab", 5)}

${alphaPermutation(5, "62ee2f93", 5)}

${alphaPermutation(6, "0438baeb", 5)}

${permutation(7, "3b9c542f", 5)}

${permutation(8, "3a7b72ac", 5)}
`);
  });

  test("each permutation runs from its own prerun image", async () => {
    const run = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--dry-run"], { env: KEY });

    const images = run.stdout.match(/(?<=thunderjar-prerun:)[0-9a-f]{8}/g);
    expect(images).toEqual(["ded54607", "602318c8", "e4f0784f", "35965dab", "62ee2f93", "0438baeb", "3b9c542f", "3a7b72ac"]);
  });

  test("--image-prefix starts every image name with it", async () => {
    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run", "--image-prefix", "throwaway"], { env: KEY });

    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${alphaPermutation(1, "ded54607", 1).replaceAll(/thunderjar-(pre|post)run/g, "throwaway-$1run")}
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

  test("quoting: the prompt is in the prerun image, so the dry run shows only the script that reads it", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "quoting", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "12571887", 1)}
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
    expect(frame(stdout)).toBe(`Execution <ULID>  two-harnesses
  2 permutations, 2 runs, up to 1 at once

Images
  thunderjar-prerun:ded54607  ready
  thunderjar-prerun:e4f0784f  ready

Runs
  1.1  fake-harness-alpha/fake-model-small-001  completed  <duration>  $0.061
${under(ALPHA_MEASURES)}
  2.1  fake-harness-beta/fake-model-large-001   completed  <duration>
${under(BETA_MEASURES)}

2 runs: 2 completed
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
      permutationHash: expect.stringMatching(/^bef6be59[0-9a-f]{56}$/),
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
      harnessEnv: ["FAKE_HARNESS_KEY"],
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
      result: {
        isPrimeShape: measured("shell", { exitCode: 0, stdout: '{"lines":3,"comments":2,"exports":1}\n', stdoutTruncated: false }),
        isPrimeTests: measured("bunTestFile", { passed: 3, total: 5 }),
        isPrimeTsExists: measured("fileCreated", true),
        saysArr: measured("replyMatches", true),
        tsIgnoreCount: measured("grep", 1),
      },
    });
    expect(alpha.execution.finishedAt).toBeGreaterThanOrEqual(alpha.execution.startedAt);
    expect(beta.permutationHash).toStartWith("6200c233");
    expect(beta.harnessModel.modelId).toBe("fake-model-large-001");
    expect(beta.harnessResult).toBe('{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}\n');
    expect(beta.reply).toEqual({ outcome: "collected", text: "I wrote isPrime.ts, and tested it up to 100." });
    expect(beta.tokenCosts).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(beta.parameters.baseImage).toEqual(alpha.parameters.baseImage);
    expect(beta.parameters.harnessModel).not.toEqual(alpha.parameters.harnessModel);
    expect(beta.result).toEqual({
      isPrimeShape: measured("shell", { exitCode: 0, stdout: '{"lines":2,"comments":1,"exports":1}\n', stdoutTruncated: false }),
      isPrimeTests: measured("bunTestFile", { passed: 5, total: 5 }),
      isPrimeTsExists: measured("fileCreated", true),
      saysArr: measured("replyMatches", false),
      tsIgnoreCount: measured("grep", 0),
    });
    // The same measurements took both runs' measures.
    for (const name of Object.keys(alpha.result)) {
      expect(beta.result[name]?.contentHash).toBe(alpha.result[name]?.contentHash as string);
    }
    // isPrimeShape's metrics, read from each run's one stored stdout, tell the agents apart.
    const shown = await thunderjar(scenario("0202"), ["show", id, "--data-dir", data, "--json"]);
    const { permutations } = JSON.parse(shown.stdout) as ExecutionSummary;
    const shapes = permutations.map(({ measures }) =>
      Object.fromEntries(Object.entries(measures.isPrimeShape!.metrics).map(([name, { value }]) => [name, value])),
    );
    expect(shapes).toEqual([
      { lines: 3, comments: 2, singleExport: 1 },
      { lines: 2, comments: 1, singleExport: 1 },
    ]);
    expect(permutations.map(({ measures }) => measures.isPrimeTests!.metrics)).toMatchObject([
      { passRate: { value: 0.6, better: "higher" }, passed: { value: 3 } },
      { passRate: { value: 1 }, passed: { value: 5 } },
    ]);

    // Each container ran from its prerun image, then was committed into its postrun image and removed.
    const postrun = (n: number) => `thunderjar-postrun:${id}-${n}-1`;
    const container = (n: number) => `thunderjar-run-${id}-${n}-1`;
    const prerun = (n: number) => `thunderjar-prerun:${n === 1 ? "ded54607" : "e4f0784f"}`;
    const commands = await containerCommands(docker);
    expect(commands.filter((command) => !command.includes("-measure-"))).toEqual(
      [1, 2].flatMap((n) => [
        `docker run --name ${container(n)} --pull never ${n === 1 ? "-e FAKE_HARNESS_KEY " : ""}--entrypoint sh ${prerun(n)} -c <script>`,
        `docker cp ${container(n)}:/thunderjar/run.json <destination>`,
        `docker cp ${container(n)}:/thunderjar/result.json <destination>`,
        `docker cp ${container(n)}:/thunderjar/stderr.log <destination>`,
        `docker image inspect --format ${IMAGE_CONFIG_FORMAT} ${prerun(n)}`,
        `docker container inspect --format ${ENV_NAMES_FORMAT} ${container(n)}`,
        // Alpha's key is blanked, so its postrun image doesn't hold its value.
        `docker commit --change ENTRYPOINT [""] --change CMD ["sh"] ${n === 1 ? '--change ENV "FAKE_HARNESS_KEY"= ' : ""}${container(n)} thunderjar-postrun:${id}-${n}-1`,
        `docker rm --force ${container(n)}`,
      ]),
    );
    // Then its measures were taken in one container, from the postrun image, running a shell session
    // that's sent each measure's commands, given the harness's key by name, and is removed when it ends. saysArr, of the reply, needs no container.
    for (const n of [1, 2]) {
      const measuring = commands.filter((command) => command.includes(` ${container(n)}-measure-`));
      expect(measuring).toEqual([`docker run --rm --interactive --name ${container(n)}-measure-1 --pull never ${n === 1 ? "-e FAKE_HARNESS_KEY " : ""}--entrypoint sh thunderjar-postrun:${id}-${n}-1 -c <script>`]);
      expect(commands.indexOf(measuring[0] as string)).toBeGreaterThan(commands.findIndex((command) => command.startsWith("docker commit") && command.endsWith(` ${container(n)} ${postrun(n)}`)));
    }
    expect(await docker.images()).toEqual([
      "thunderjar-prerun:ded54607",
      "thunderjar-prerun:e4f0784f",
      `thunderjar-postrun:${id}-1-1`,
      `thunderjar-postrun:${id}-2-1`,
    ]);
    expect(await docker.containers()).toEqual([]);
    // Alpha's container was given its key. Beta's, of another harness, wasn't.
    expect(await docker.fileIn(`thunderjar-postrun:${id}-1-1`, "/thunderjar/fake-harness-key")).toBe("set\n");
    expect(await docker.fileIn(`thunderjar-postrun:${id}-2-1`, "/thunderjar/fake-harness-key")).toBe("\n");
    // Neither postrun image holds the key's value.
    expect(await docker.envOf(`thunderjar-postrun:${id}-1-1`)).toEqual(["FAKE_HARNESS_KEY="]);
    expect(await docker.envOf(`thunderjar-postrun:${id}-2-1`)).toEqual([]);
  });

  test("quoting: the prompt reaches the agent byte for byte, through a file", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "quoting", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await readStore(data)).containerRuns;
    // fake-echo copies the prompt file into its result file. writePrompt ends it with a newline.
    expect(record?.harnessResult).toBe(`${AWKWARD}\n`);
    expect(await docker.fileIn(record?.postrunImage as string, "/thunderjar/prompt.txt")).toBe(`${AWKWARD}\n`);
    // Written into the prerun image by the harness: the model, and the script that ran the agent.
    expect(await docker.fileIn(record?.postrunImage as string, "/thunderjar/model.txt")).toBe(`${record?.harnessModel.modelId}\n`);
    expect(await docker.fileIn(record?.postrunImage as string, "/thunderjar/thunderjar-run.sh")).toStartWith("#!/bin/sh\n");
    expect((await docker.commands()).filter((command) => command.startsWith("docker run --name"))).toEqual([
      expect.stringContaining("\\nsh /thunderjar/thunderjar-run.sh 2> /thunderjar/stderr.log\\n"),
    ]);
  });

  test("by default, the store is .thunderjar/.data/, and existing prerun images are reused", async () => {
    await using copy = await copyScenarioProject("0202");
    await using docker = await fakeDocker();
    // Built beforehand, by a run recorded elsewhere, so its run script is baked in.
    expect((await thunderjar(copy.dir, ["run", "example", "--data-dir", "elsewhere"], { env: { ...docker.env, ...KEY } })).exitCode).toBe(0);
    expect((await docker.images()).filter((image) => image.includes("prerun"))).toEqual(["thunderjar-prerun:ded54607"]);

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "example"], { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(frame(stdout)).toBe(`Execution <ULID>  example
  1 permutation, 1 run, up to 1 at once

Images
  thunderjar-prerun:ded54607  ready

Runs
  1.1  fake-harness-alpha/fake-model-small-001  completed  <duration>  $0.061
${under(ALPHA_MEASURES)}

1 run: 1 completed
Recorded in .thunderjar/.data/runs.sqlite
`);
    // The prerun image was there already: nothing was built again.
    expect((await docker.commands()).filter((command) => command.startsWith("docker build"))).toHaveLength(1);
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
    expect(stdout).toStartWith("Execution <ULID>  is-prime-baseline\n  8 permutations, 16 runs, up to 1 at once\n");
    const lines = frame(stdout).split("\n").filter((line) => /^  \d\.\d  /.test(line));
    expect(lines).toHaveLength(16);
    expect(lines.slice(0, 3)).toEqual([
      "  1.1  snerk · fake-harness-alpha/fake-model-small-001 · plain  completed  <duration>  $0.061",
      "  1.2  snerk · fake-harness-alpha/fake-model-small-001 · plain  completed  <duration>  $0.061",
      "  2.1  snerk · fake-harness-alpha/fake-model-small-001 · terse  completed  <duration>  $0.061",
    ]);
    expect(lines.at(-1)).toBe("  8.2  glurk · fake-harness-beta/fake-model-large-001 · terse   completed  <duration>");
    // Permutations 1, 2, 5 and 6 are alpha's; 3, 4, 7 and 8 beta's.
    const measures = stdout.split("\n").filter((line) => line.startsWith("       isPrime"));
    const fourOf = (line: string) => Array<string>(4).fill(under(line));
    expect(measures).toEqual([...fourOf(ALPHA_MEASURES), ...fourOf(BETA_MEASURES), ...fourOf(ALPHA_MEASURES), ...fourOf(BETA_MEASURES)]);
    expect(stdout).toContain("\n16 runs: 16 completed\n");
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
    expect(frame(stdout).split("\n").filter((line) => /^  \d\.\d  /.test(line))).toEqual([
      "  1.1  fake-harness-beta/fake-model-small-001  completed  <duration>",
      "  2.1  fake-harness-beta/fake-model-large-001  completed  <duration>",
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
    expect(await docker.commands()).toEqual([]);
  });

  // Only with THUNDERJAR_POSTGRES_URL set to a Postgres it may create a schema in.
  test.skipIf(!Bun.env.THUNDERJAR_POSTGRES_URL)("with a postgresStore, the run is recorded in Postgres, and executions and show read it there", async () => {
    await using copy = await copyScenarioProject("0202");
    await using database = await postgresSchema();
    await usePostgres(copy.dir, database.schema);
    await using docker = await fakeDocker();
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
      `import { declareHarness, writeRunScript } from "thunderjar";

export default declareHarness({ version: "1.0.0", models: { "fake-model-small-001": [] }, applyParameter: () => writeRunScript("echo partial > isPrime.ts && echo 'Error: unknown model' >&2 && exit 3") });
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
    // It isn't measured: what a crashed agent left says nothing of the task.
    expect(frame(stdout)).toEndWith(`
Runs
  1.1  fake-harness-alpha/fake-model-small-001  crashed (exited 3, no result file)  <duration>
       Error: unknown model
  2.1  fake-harness-beta/fake-model-large-001   completed  <duration>
${under(BETA_MEASURES)}

2 runs: 1 completed, 1 crashed
Recorded in <DATA>/runs.sqlite
`);
    const store = await readStore(data);
    expect(store.execution.status).toBe("failed");
    expect(store.containerRuns.map(({ result }) => Object.keys(result))).toEqual([[], ["isPrimeShape", "isPrimeTests", "isPrimeTsExists", "saysArr", "tsIgnoreCount"]]);
    expect((await docker.commands()).filter((command) => command.includes("-measure-"))).toEqual([expect.stringContaining(`thunderjar-run-${store.execution.executionId}-2-1-measure-1 `)]);
    expect(store.containerRuns.map(({ execution, harnessResult }) => [execution.exitCode, harnessResult])).toEqual([
      [3, null],
      [0, '{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}\n'],
    ]);
    // Why it exited non-zero is kept, and logged.
    expect(store.containerRuns.map(({ harnessStderr }) => harnessStderr)).toEqual(["Error: unknown model\n", ""]);
    expect(log).toMatch(/WARN.*agent didn't end cleanly[\s\S]*Error: unknown model/);
    // A failed run is committed too, so what the agent left can be looked at.
    expect(await docker.images()).toContain(`thunderjar-postrun:${store.execution.executionId}-1-1`);
    expect(await docker.containers()).toEqual([]);
  });

  test("a measure that can't be taken says why", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness, writeRunScript } from "thunderjar";

export default declareHarness({ version: "1.0.0", models: { "fake-model-small-001": [] }, applyParameter: () => writeRunScript("true") });
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
    expect(frame(stdout)).toEndWith(`
Runs
  1.1  fake-harness-alpha/fake-model-small-001  completed  <duration>  no result file
       isPrimeShape: {exitCode: 1, stdout: "", stdoutTruncated: false}   isPrimeTests: skipped (no file matches **/isPrime.ts)   isPrimeTsExists: false   saysArr: skipped (no reply: the agent left no result file)   tsIgnoreCount: skipped (no file matches **/*.ts)

1 run: 1 completed
Recorded in <DATA>/runs.sqlite
`);
    const [record] = (await readStore(data)).containerRuns;
    expect(record?.result).toEqual({
      isPrimeShape: measured("shell", { exitCode: 1, stdout: "", stdoutTruncated: false }),
      isPrimeTests: measure("bunTestFile", { outcome: "skipped", reason: "no file matches **/isPrime.ts" }),
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
    expect(frame(stdout)).toMatch(/\nRuns\n  1\.1  fake-harness-alpha\/fake-model-small-001  completed  <duration>  \$0\.061\n\n1 run: 1 completed\nRecorded in /);
    expect((await readStore(data)).containerRuns[0]?.result).toEqual({});
    expect((await docker.commands()).filter((command) => command.includes("-measure-"))).toEqual([]);
  });

  test("a container run that fails, not its agent, is crashed with why under it, the rest still run, and the execution is recorded as failed", async () => {
    await using copy = await copyScenarioProject("0202");
    // Leaves the run script nowhere to write run.json.
    await Bun.write(
      `${copy.dir}/.thunderjar/parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness, writeRunScript } from "thunderjar";

export default declareHarness({ version: "1.0.0", models: { "fake-model-small-001": [] }, applyParameter: () => writeRunScript("rm -rf /thunderjar") });
`,
    );
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "two-harnesses", "--data-dir", data], {
      env: { ...docker.env, ...KEY },
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(frame(stdout)).toMatch(
      /\nRuns\n  1\.1  fake-harness-alpha\/fake-model-small-001  crashed  <duration>\n       .*thunderjar\/run\.json: Directory nonexistent\n  2\.1  fake-harness-beta\/fake-model-large-001   completed  <duration>\n/,
    );
    expect(stdout).toEndWith(`
${under(BETA_MEASURES)}

2 runs: 1 completed, 1 crashed
Recorded in <DATA>/runs.sqlite
`);
    const store = await readStore(data);
    expect(store.execution).toMatchObject({ status: "failed", finishedAt: ISO });
    // Only the run that got as far as its record has one.
    expect(store.containerRuns.map(({ permutation, iteration }) => [permutation, iteration])).toEqual([[2, 1]]);
    const id = store.execution.executionId;
    expect((await docker.commands()).filter((command) => command.startsWith("docker commit"))).toEqual([
      expect.stringContaining(` thunderjar-run-${id}-2-1 thunderjar-postrun:${id}-2-1`),
    ]);
    expect((await docker.images()).filter((image) => image.includes("postrun"))).toEqual([`thunderjar-postrun:${id}-2-1`]);
    expect(await docker.containers()).toEqual([]);
  });

  test("Docker that can't be reached is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ unreachable: true });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--data-dir", data], { env: { ...docker.env, ...KEY } });

    // The frame as it was when the command stopped: its one image never got past being looked for.
    expect(stdout).toBe("Execution <ULID>  example\n  1 permutation, 1 run, up to 1 at once\n\nImages\n  thunderjar-prerun:ded54607  checking\n");
    expect(stderr).toBe(
      "Error: Docker can't be reached, so nothing can be run: Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n",
    );
    expect(exitCode).toBe(1);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("a failed build is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ failing: ["thunderjar-prerun:ded54607"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--data-dir", data], { env: { ...docker.env, ...KEY } });

    expect(stdout).toBe("Execution <ULID>  example\n  1 permutation, 1 run, up to 1 at once\n\nImages\n  thunderjar-prerun:ded54607  failed\n");
    expect(stderr).toBe(
      'Error: Building thunderjar-prerun:ded54607 failed: ERROR: failed to build: process "/bin/sh -c exit 1" did not complete successfully: exit code: 1\n',
    );
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => command.startsWith("docker run"))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("--build-only: builds the missing prerun images, and runs and records nothing", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--build-only", "--data-dir", data], {
      env: { ...docker.env, ...KEY },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>  two-harnesses
  2 permutations, 2 runs, up to 1 at once

Images
  thunderjar-prerun:ded54607  ready
  thunderjar-prerun:e4f0784f  ready

2 prerun images ready
`);
    expect((await docker.commands()).map((command) => command.replace(/^(docker build -t \S+) .*$/, "$1 <context>"))).toEqual([
      "docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun",
      "docker build -t thunderjar-prerun:ded54607 <context>",
      "docker build -t thunderjar-prerun:e4f0784f <context>",
    ]);
    expect(await docker.images()).toEqual(["thunderjar-prerun:ded54607", "thunderjar-prerun:e4f0784f"]);
    expect(await docker.containers()).toEqual([]);
    expect(await Bun.file(`${data}/runs.sqlite`).exists()).toBe(false);
  });

  test("--build-only again: the prerun images are there, so nothing is built", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();
    const args = ["run", "two-harnesses", "--build-only", "--data-dir", data];
    const first = await thunderjar(scenario("0202"), args, { env: { ...docker.env, ...KEY } });
    const before = await docker.commands();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), args, { env: { ...docker.env, ...KEY } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(first.stdout);
    expect(stdout).toEndWith("\n2 prerun images ready\n");
    // It only looked for them.
    expect((await docker.commands()).slice(before.length)).toEqual(["docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun"]);
    expect(await Bun.file(`${data}/runs.sqlite`).exists()).toBe(false);
  });

  test("--build-only with --dry-run is an error, and nothing is built", async () => {
    await using docker = await fakeDocker();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run", "--build-only"], { env: { ...docker.env, ...KEY } });

    expect(stdout).toBe("");
    expect(stderr).toBe("Error: --dry-run and --build-only can't be used together.\n");
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });
});

describe("run --json", () => {
  test("0202 two-harnesses: prints the final run state as JSON, and nothing else", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--data-dir", data, "--json"], {
      env: { ...docker.env, ...KEY },
      paths: { "<DATA>": data },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout) as RunState<Manifest>;
    expect(result.execution).toEqual(expect.objectContaining({ executionId: "<ULID>", testCase: "two-harnesses", status: "complete", finishedAt: ISO }));
    expect(result.recordedIn).toBe("<DATA>/runs.sqlite");
    expect(result.mode).toBeUndefined();
    expect(result.error).toBeUndefined();
    expect(result.images).toEqual({ "thunderjar-prerun:ded54607": "ready", "thunderjar-prerun:e4f0784f": "ready" });
    expect(result.uploadBacklog).toBe(0);
    expect(result.manifest).toEqual(expect.objectContaining({ executionId: "<ULID>", testCaseName: "two-harnesses", task: "is-prime", concurrency: 1, imageStore: null, overrides: {} }));
    // Each run by its ID: the execution's, the start of its permutation's hash, and its iteration.
    expect(result.manifest?.runs.map(({ runId }) => runId)).toEqual(["<ULID>-bef6be59-i1", "<ULID>-6200c233-i1"]);
    expect(Object.keys(result.runs)).toEqual(["<ULID>-bef6be59-i1", "<ULID>-6200c233-i1"]);
    const stored = (await readStore(data)).containerRuns;
    expect(stored).toHaveLength(2);
    Object.values(result.runs).forEach((run, i) => {
      // Without an image store there's nowhere to upload to, so a run ends committed.
      expect(run).toEqual({ status: "committed", startedAt: expect.any(Number), finishedAt: expect.any(Number), measuring: "measured", record: expect.any(Object) });
      // Its record is the store's, measures included. The harness replaced the execution's ID in what it printed.
      expect(run.record).toEqual({ ...(stored[i] as ContainerRunRecord), executionId: "<ULID>", postrunImage: `thunderjar-postrun:<ULID>-${i + 1}-1` });
    });
  });

  test("a failed execution is still printed, with exit code 1", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--data-dir", data, "--json"], { env: { ...docker.env, ...KEY } });

    expect(exitCode).toBe(1);
    const result = JSON.parse(stdout) as RunState<Manifest>;
    expect(result.execution?.status).toBe("failed");
    expect(Object.values(result.runs).map(({ status }) => status)).toContain("crashed");
  });

  test("--dry-run: the manifest, each permutation with its parameters and prerun image, and each run with its postrun image, as JSON", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--dry-run", "--json"], { env: KEY });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const hash = "bef6be59e0075f3bc210d929098246bb6b2e437acfcc81fe71dd66e5581b7953";
    expect(JSON.parse(stdout)).toEqual({
      mode: "dry-run",
      runs: {},
      images: {},
      uploadBacklog: 0,
      manifest: {
        executionId: "<ULID>",
        testCaseName: "example",
        task: "is-prime",
        concurrency: 1,
        buildConcurrency: 1,
        imagePrefix: "thunderjar",
        imageStore: null,
        overrides: {},
        permutations: [
          {
            number: 1,
            hash,
            imageHash: expect.stringMatching(/^ded54607[0-9a-f]{56}$/),
            parameters: [
              { layer: "baseImage", value: "node20", hash: SHA },
              { layer: "codeState", value: "baseline", hash: SHA },
              { layer: "promptSet", value: "snerk", hash: SHA },
              { layer: "harnessModel", value: "fake-harness-alpha/fake-model-small-001", hash: SHA },
              { layer: "initialPrompt", value: "plain", hash: SHA },
            ],
            modelId: "fake-model-small-001",
            harnessVersion: "1.0.0",
            prerunImage: "thunderjar-prerun:ded54607",
            env: ["FAKE_HARNESS_KEY"],
            testCaseEnv: {},
            secretEnv: [],
            runOptions: [],
            timeoutSeconds: 600,
          },
        ],
        runs: [
          {
            runId: "<ULID>-bef6be59-i1",
            permutationHash: hash,
            permutation: 1,
            iteration: 1,
            container: "thunderjar-run-<ULID>-1-1",
            postrunImage: "thunderjar-postrun:<ULID>-1-1",
          },
        ],
      },
    });
  });

  test("0206 test-case-env --dry-run: the test case's env with its values, and its secretEnv by name", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "test-case-env", "--dry-run", "--json"], { env: TEST_CASE_SECRET });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain(TEST_CASE_SECRET.FAKE_TEST_CASE_SECRET);
    const { manifest } = JSON.parse(stdout) as RunState<Manifest>;
    expect(manifest?.permutations).toEqual([
      expect.objectContaining({
        env: [],
        testCaseEnv: { FAKE_TEST_CASE_SETTING: "test", FAKE_TEST_CASE_AWKWARD: 'kept: "quoted", $HOME, a \\ backslash and 100%' },
        secretEnv: ["FAKE_TEST_CASE_SECRET"],
      }),
    ]);
  });

  test("--dry-run with overrides: the overrides, and the permutations and runs they make", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(
      scenario("0202"),
      ["run", "example", "--dry-run", "--json", "--prompt-set", "glurk", "--iterations", "2"],
      { env: KEY },
    );

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { manifest } = JSON.parse(stdout) as RunState<Manifest>;
    expect(manifest?.overrides).toEqual({ promptSet: ["glurk"], iterations: 2 });
    expect(manifest?.permutations.map(({ parameters }) => parameters.find(({ layer }) => layer === "promptSet")?.value)).toEqual(["glurk"]);
    expect(manifest?.runs.map(({ permutation, iteration }) => [permutation, iteration])).toEqual([
      [1, 1],
      [1, 2],
    ]);
  });

  test("with overrides, the execution records them", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { exitCode } = await thunderjar(scenario("0202"), ["run", "example", "--data-dir", data, "--prompt-set", "glurk", "--iterations", "2"], {
      env: { ...docker.env, ...KEY },
    });

    expect(exitCode).toBe(0);
    const { execution } = await readStore(data);
    expect(execution.overrides).toEqual({ promptSet: ["glurk"], iterations: 2 });
  });
});
