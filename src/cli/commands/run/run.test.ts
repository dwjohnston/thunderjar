// `thunderjar run`, through the CLI. `--dry-run` only reads the project, so it runs on the scenarios
// unchanged. A real run goes to the fake Docker, which runs each container's script on the host
// (see src/testing/fakeDocker.ts), and writes its store under a temporary `--data-dir`, or into a
// copy of the scenario. Any of these can be run by hand, e.g.
// `bun run fixture 0202 run is-prime-baseline --dry-run`. For real Docker, see run.docker.test.ts.
import { afterEach, describe, expect, test } from "bun:test";
import { $, Glob } from "bun";
import type { Reply } from "../../../api/declarations.ts";
import type { ContainerRunRecord, ExecutionRecord, RecordedMeasure, RecordedOutcome } from "../../../store/runDataStore.ts";
import { copyScenarioProject, TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { fakeCommand } from "../../../testing/fakeCommand.ts";
import { type FakeDocker, fakeDocker } from "../../../testing/fakeDocker.ts";
import { scenario } from "../../../testing/scenario.ts";

/** What 0202's fake-harness-alpha needs: `plan` and `run` stop without it. */
const KEY = { FAKE_HARNESS_KEY: "fake-key" };

const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";
const TERSE = "isPrime.ts: export a primality test.";
/** 0202's `awkward` initial prompt, full of shell syntax. */
const AWKWARD = `Say "hello", then print $HOME and \`whoami\`.
Don't stop at 'single quotes', a backslash \\ or 100%.`;

/** 0201's fake-harness-alpha, which needs nothing. */
const ALPHA_0201 = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' '// @ts-ignore' 'export const isPrime = (n: number) => n > 1 && n % 2 !== 0;' > isPrime.ts && echo '{"model":"fake-model-small-001"}' > /thunderjar/result.json`;
/** 0202's fake agents record whether they saw FAKE_HARNESS_KEY. */
const KEY_CHECK = ` && echo "\${FAKE_HARNESS_KEY+set}" > /thunderjar/fake-harness-key`;
/** What 0202's fake-harness-alpha writes: shaped like Claude Code's result. */
const ALPHA_JSON =
  '{"type":"result","result":"Arr, isPrime.ts be written.","modelUsage":{"fake-model-small-001":{"inputTokens":12000,"outputTokens":400,"cacheReadInputTokens":80,"cacheCreationInputTokens":0,"costUSD":0.061,"costBasis":"list"}}}';
const ALPHA_RESULT = `'${ALPHA_JSON}'`;
const ALPHA = (prompt: string) => `${ALPHA_0201(prompt).replace(`'{"model":"fake-model-small-001"}'`, ALPHA_RESULT)}${KEY_CHECK}`;
const BETA = (prompt: string) =>
  `printf '%s\\n' '// ${prompt}' 'export const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);' > isPrime.ts && echo '{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}' > /thunderjar/result.json${KEY_CHECK}`;

/** The dry run's lines for permutation `n`, with its `iterations`, each given `env` and `prompt`, and running `command`. */
const permutation = (n: number, hash: string, iterations: number, prompt: string, command: string, env?: string) =>
  [
    `Permutation ${n}: prerun image thunderjar-prerun:${hash}`,
    ...Array.from({ length: iterations }, (_, i) => [
      `  Iteration ${i + 1}: postrun image thunderjar-postrun:<ULID>-${n}-${i + 1}`,
      ...(env ? [`    env:      ${env}`] : []),
      `    prompt:   ${prompt}`,
      `    command:  ${command}`,
    ]).flat(),
  ].join("\n");

/** A permutation of 0202's fake-harness-alpha, given its key. */
const alphaPermutation = (n: number, hash: string, iterations: number, prompt: string) =>
  permutation(n, hash, iterations, prompt, ALPHA(prompt), "FAKE_HARNESS_KEY");

const filesIn = (dir: string) => [...new Glob("**").scanSync({ cwd: dir, dot: true })].sort();

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
const ALPHA_MEASURES = "      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   saysArr: true   tsIgnoreCount: 1";
const BETA_MEASURES = "      isPrimeTemplateTest: {passed: 5, failed: 0}   isPrimeTsExists: true   saysArr: false   tsIgnoreCount: 0";

/** A measure as recorded, taken by `instrument`, with `outcome`. */
const measure = (instrument: string, outcome: RecordedOutcome): RecordedMeasure => ({ instrument, contentHash: SHA, measuredAt: ISO, outcome });
const measured = (instrument: string, data: unknown) => measure(instrument, { outcome: "measured", data });

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
Wrote .thunderjar/.data/runs/<ULID>/
`);
    const store = await readStore(`${copy.dir}/.thunderjar/.data`);
    expect(store.execution.status).toBe("complete");
    expect(store.containerRuns).toHaveLength(1);
  });

  test("is-prime-baseline: each line names what tells its permutation apart, and counts its iterations", async () => {
    await using docker = await fakeDocker();

    const { stdout, exitCode } = await thunderjar(scenario("0202"), ["run", "is-prime-baseline", "--data-dir", dataDir()], {
      env: { ...docker.env, ...KEY },
    });

    expect(exitCode).toBe(0);
    const lines = stdout.split("\n").filter((line) => line.includes("iteration"));
    expect(lines).toHaveLength(40);
    expect(lines.slice(0, 6)).toEqual([
      " 1/8  iteration 1/5  snerk | fake-harness-alpha | plain  ... done (<duration>, $0.061)",
      " 1/8  iteration 2/5  snerk | fake-harness-alpha | plain  ... done (<duration>, $0.061)",
      " 1/8  iteration 3/5  snerk | fake-harness-alpha | plain  ... done (<duration>, $0.061)",
      " 1/8  iteration 4/5  snerk | fake-harness-alpha | plain  ... done (<duration>, $0.061)",
      " 1/8  iteration 5/5  snerk | fake-harness-alpha | plain  ... done (<duration>, $0.061)",
      " 2/8  iteration 1/5  snerk | fake-harness-alpha | terse  ... done (<duration>, $0.061)",
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

  test("an agent exiting non-zero is recorded and the rest still run, but the execution fails", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-harness-alpha/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({ version: "1.0.0", cli: () => "echo partial > isPrime.ts && exit 3" });
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
    expect(stdout).toEndWith(`
 1/2  iteration 1/1  fake-harness-alpha | plain  ... exited 3, no result file (<duration>)
      isPrimeTemplateTest: erroredWhileMeasuring (isPrime.ts has no export to bind {{defaultExport}} to)   isPrimeTsExists: true   saysArr: skipped (no reply: the agent left no result file)   tsIgnoreCount: 0
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
      [0, '{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}\n'],
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
Wrote <DATA>/runs/<ULID>/
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
    await $`rm -r ${copy.dir}/.thunderjar/test-case-parameters/tasks/is-prime/measurements`.quiet();
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "example", "--data-dir", data], { env: { ...docker.env, ...KEY } });

    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/ 1\/1  iteration 1\/1  fake-harness-alpha \| plain  \.\.\. done \(<duration>, \$0\.061\)\nWrote /);
    expect((await readStore(data)).containerRuns[0]?.result).toEqual({});
    expect((await docker.commands()).filter((command) => command.includes("-measure-"))).toEqual([]);
  });

  test("a container run that fails, not its agent, is an error, after recording the execution as failed", async () => {
    await using copy = await copyScenarioProject("0202");
    // Leaves the execution wrapper nowhere to write run.json.
    await Bun.write(
      `${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-harness-alpha/index.ts`,
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

describe("0202 typical project, without the key fake-harness-alpha needs", () => {
  const MISSING = "Error: fake-harness-alpha needs FAKE_HARNESS_KEY, which is not set.\nExport it in the shell that runs thunderjar.\n";

  test("run stops before anything is built, run or written", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(MISSING);
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("so does the dry run", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "two-harnesses", "--dry-run"]);

    expect(stdout).toBe("");
    expect(stderr).toBe(MISSING);
    expect(exitCode).toBe(1);
  });

  test("a test case of harnesses that need nothing runs without it", async () => {
    await using copy = await copyScenarioProject("0202");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-cases/beta-only.ts`,
      `import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-harness-beta/fake-model-large-001"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 1,
});
`,
    );

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["run", "beta-only", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain("env:");
  });
});

describe("0204 misbehaving agents", () => {
  test("an agent that times out is killed, and one that exits non-zero or leaves no result file is marked, each measured all the same", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(stdout).toEndWith(`
 1/3  iteration 1/1  fake-sleeper | plain  ... timed out after <duration>
      isPrimeTsExists: false
 2/3  iteration 1/1  fake-crasher | plain  ... exited 1 (<duration>)
      isPrimeTsExists: false
 3/3  iteration 1/1  fake-silent | plain  ... done, no result file (<duration>)
      isPrimeTsExists: true
Wrote <DATA>/runs/<ULID>/
`);
    const store = await readStore(data);
    expect(store.execution.status).toBe("failed");
    const [sleeper, crasher, silent] = store.containerRuns as [ContainerRunRecord, ContainerRunRecord, ContainerRunRecord];
    expect(sleeper.execution).toMatchObject({ exitCode: null, timedOut: true, timeoutSeconds: 2 });
    // Killed at its timeout, not left to sleep out its 300s.
    expect(sleeper.execution.finishedAt - sleeper.execution.startedAt).toBeLessThan(10_000);
    expect(sleeper.harnessResult).toBeNull();
    expect(crasher.execution).toMatchObject({ exitCode: 1, timedOut: false });
    expect(crasher.harnessResult).toBe('{"error":"crashed"}\n');
    expect(silent.execution).toMatchObject({ exitCode: 0, timedOut: false });
    expect(silent.harnessResult).toBeNull();
    // Each was committed, and removed.
    expect(await docker.images()).toContain(`thunderjar-postrun:${store.execution.executionId}-1-1`);
    expect(await docker.containers()).toEqual([]);
  }, 30_000);
});

describe("0205 multi-turn", () => {
  const RUN_TURN_1 = (session: string) =>
    `mkdir -p "$HOME/.fake-rememberer" && cp /thunderjar/turns/1/prompt.txt "$HOME/.fake-rememberer/${session}" && printf '{"reply":"I will remember that: %s"}' "$(cat /thunderjar/turns/1/prompt.txt)" > /thunderjar/turns/1/result.json`;
  const RUN_TURN_2 = (session: string) =>
    `printf '{"reply":"You told me: %s"}' "$(cat "$HOME/.fake-rememberer/${session}")" > /thunderjar/turns/2/result.json`;

  test("--dry-run: the iteration's session, then each turn's prompt and command", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0205"), ["run", "remember", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

Permutation 1: prerun image thunderjar-prerun:b3d358e4
  Iteration 1: postrun image thunderjar-postrun:<ULID>-1-1
    session:  <UUID>
    prompt 1: My rubber ducky is called Eli.
    turn 1:   ${RUN_TURN_1("<UUID>")}
    prompt 2: What is my rubber ducky called?
    turn 2:   ${RUN_TURN_2("<UUID>")}
`);
  });

  test("each turn runs in the same container and session, and each reply is recorded and measured", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0205"), ["run", "remember", "--data-dir", data], {
      env: docker.env,
      paths: { "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toEndWith(`
 1/1  iteration 1/1  fake-rememberer | tell-then-ask  ... done (<duration>)
      promisedToRemember: true   remembersName: true
Wrote <DATA>/runs/<ULID>/
`);
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.execution.turns?.map((turn) => turn.exitCode)).toEqual([0, 0]);
    expect(record.turns?.map((turn) => turn.reply)).toEqual([
      { outcome: "collected", text: "I will remember that: My rubber ducky is called Eli." },
      { outcome: "collected", text: "You told me: My rubber ducky is called Eli." },
    ]);
    // The record's reply and result file are the last turn's.
    expect(record.reply).toEqual(record.turns?.[1]?.reply as Reply);
    expect(record.harnessResult).toBe(record.turns?.[1]?.harnessResult as string);
    // Both turns used the session ID the record names. (The fake Docker's HOME is the container's root.)
    expect(await docker.fileIn(record.postrunImage, `/.fake-rememberer/${record.sessionId}`)).toBe("My rubber ducky is called Eli.");

    // show gives each turn's reply.
    const shown = await thunderjar(scenario("0205"), ["show", record.executionId, "1-1", "--data-dir", data]);
    expect(shown.stdout).toContain(`
Exit         0
Turns        2 of 2 ran
Result file  55 bytes

Reply
  Turn 1:  I will remember that: My rubber ducky is called Eli.
  Turn 2:  You told me: My rubber ducky is called Eli.
`);
  });

  test("a turn that exits non-zero stops the turns after it", async () => {
    await using copy = await copyScenarioProject("0205");
    await Bun.write(
      `${copy.dir}/.thunderjar/test-case-parameters/harnessModels/fake-rememberer/index.ts`,
      `import { declareHarness } from "thunderjar";

export default declareHarness({
  version: "1.0.0",
  cli: (ctx) => (ctx.turn === 0 ? "exit 2" : \`echo '{"reply":"Eli"}' > \${ctx.resultPath}\`),
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
});
`,
    );
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, exitCode } = await thunderjar(copy.dir, ["run", "remember", "--data-dir", data], { env: docker.env });

    expect(exitCode).toBe(1);
    expect(stdout).toContain(" ... exited 2, no result file (<duration>)\n");
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.execution.exitCode).toBe(2);
    expect(record.execution.turns?.map((turn) => turn.exitCode)).toEqual([2]);
    expect(record.turns?.map((turn) => turn.harnessResult)).toEqual([null, null]);
    expect(record.result.remembersName?.outcome).toEqual({ outcome: "skipped", reason: "no reply: the agent left no result file" });
  });
});

describe("0206 run options", () => {
  const SANDBOXER = `if unshare --user --map-root-user --mount --pid --fork true; then reply=sandboxed; else reply="no sandbox"; fi && echo "{\\"reply\\":\\"$reply\\"}" > /thunderjar/result.json`;
  const OPTIONS = "--security-opt seccomp=unconfined --security-opt apparmor=unconfined";

  test("--dry-run: a base image's run options are printed with each container run they're given to", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "b3d358e4", 1, "Sandbox yourself.", SANDBOXER)}

Permutation 2: prerun image thunderjar-prerun:b3d358e4
  Iteration 1: postrun image thunderjar-postrun:<ULID>-2-1
    docker:   ${OPTIONS}
    prompt:   Sandbox yourself.
    command:  ${SANDBOXER}
`);
  });

  test("they're added to the docker run of that base image's agent containers only", async () => {
    await using docker = await fakeDocker();

    const { exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const runs = (await docker.commands()).filter((command) => command.startsWith("docker run --name"));
    expect(runs.map((command) => command.includes(OPTIONS))).toEqual([false, true]);
    expect(runs[1]).toContain(` --pull never ${OPTIONS} --entrypoint sh thunderjar-prerun:b3d358e4 -c `);
  });
});

describe("0201 minimal existing setup", () => {
  test("example: one permutation, one iteration", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--dry-run"]);

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>

${permutation(1, "ae60c784", 1, PLAIN, ALPHA_0201(PLAIN))}
`);
  });
});

describe("0402 broken declarations", () => {
  test("a broken measurement stops the run before anything is built, run or written", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0402"), ["run", "unknown-instrument", "--data-dir", data], {
      env: { ...docker.env, ...KEY },
    });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      'Error: .thunderjar/test-case-parameters/tasks/unknown-instrument/measurements/isPrimeTsExists.ts: instrument: "fileCraeted" is not a known instrument. Known instruments: fileCreated, grep, templateTest, replyMatches, shell\n',
    );
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});

describe("0209 floating code state", () => {
  test("each container run records what its parameters resolved to, and show displays it", async () => {
    const MAIN = "24dc11c26e2716a12cf33b82fec895a7f02b3e8a";
    await using docker = await fakeDocker();
    await using git = await fakeCommand("git", { stdout: `${MAIN}\trefs/heads/main` });
    const data = dataDir();

    const { stderr, exitCode } = await thunderjar(scenario("0209"), ["run", "follow-main", "--data-dir", data], { env: { ...docker.env, ...git.env } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(await git.calls()).toHaveLength(1);
    const [record] = (await readStore(data)).containerRuns as [ContainerRunRecord];
    expect(record.parameters.codeState).toEqual({ name: "follow-main", parameterHash: expect.stringMatching(/^[0-9a-f]{64}$/), resolved: MAIN });
    expect(record.parameters.promptSet).toEqual({ name: "snerk", parameterHash: expect.stringMatching(/^[0-9a-f]{64}$/) });

    const show = await thunderjar(scenario("0209"), ["show", record.executionId, "1-1", "--data-dir", data]);
    expect(show.stdout).toContain(`\n  codeState      follow-main                              ${record.parameters.codeState.parameterHash.slice(0, 8)}  resolved ${MAIN}\n`);
  });
});

describe("0210 build secrets", () => {
  test("a secret's value is in no record of the run", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();
    const token = `ghp_${crypto.randomUUID()}`;

    const { stderr, exitCode } = await thunderjar(scenario("0210"), ["run", "example", "--data-dir", data], { env: { ...docker.env, GITHUB_TOKEN: token } });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect((await readStore(data)).containerRuns).toHaveLength(1);
    expect((await $`grep -r ${token} ${data}`.nothrow().quiet()).exitCode).toBe(1);
    expect((await docker.commands()).find((command) => command.startsWith("docker build"))).toContain(" --secret id=github,env=GITHUB_TOKEN --ssh default ");
  });

  test("without the secret's variable, it stops before anything is built or run", async () => {
    await using docker = await fakeDocker();

    const { stderr, exitCode } = await thunderjar(scenario("0210"), ["run", "example", "--data-dir", dataDir()], { env: { ...docker.env, GITHUB_TOKEN: "" } });

    expect(stderr).toBe('Error: Build secret "github" needs GITHUB_TOKEN, which is not set.\nExport it in the shell that runs thunderjar.\n');
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual([]);
  });
});

describe("0207 image store", () => {
  const REPOSITORY = "ghcr.io/acme/thunderjar-images";
  const PRERUN = `${REPOSITORY}:prerun-hae60c784`;

  test("without a docker login for the registry, stops before anything is built, run or written", async () => {
    await using docker = await fakeDocker();
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe("");
    expect(stderr).toBe(
      `Error: Can't push to ${REPOSITORY}: no valid Docker login for ghcr.io (Cannot perform an interactive login from a non TTY device). Run \`docker login ghcr.io\`.\n`,
    );
    expect(exitCode).toBe(1);
    expect(await docker.commands()).toEqual(["docker login ghcr.io"]);
    expect(await Bun.file(data).exists()).toBe(false);
  });

  test("pushes the prerun image once built, and the postrun image before it's measured", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const { executionId } = (await readStore(data)).execution as ExecutionRecord;
    const postrun = `${REPOSITORY}:postrun-e${executionId}-hb7b0c69c-i00`;
    expect(stdout.replace(executionId, "<ID>")).toBe(`Execution <ULID>
Building thunderjar-prerun:ae60c784 ... done
Pushing ${PRERUN} ... done
 1/1  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      Pushing ${postrun.replace(executionId, "<ID>")} ... done
      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1
Wrote <REPO>/fixtures/.tmp/data-<UUID>/runs/<ULID>/
`);
    expect(await docker.pushed()).toEqual([PRERUN, postrun]);
    const commands = await docker.commands();
    expect(commands[0]).toBe("docker login ghcr.io");
    // Pushed before the first measurement container starts.
    expect(commands.indexOf(`docker push --quiet ${postrun}`)).toBeLessThan(commands.findIndex((command) => command.includes("-measure-")));
  });

  test("a prerun push the registry refuses is an error, and nothing is run or written", async () => {
    await using docker = await fakeDocker({ loggedIn: ["ghcr.io"], images: ["thunderjar-prerun:ae60c784"], failing: [PRERUN] });
    const data = dataDir();

    const { stdout, stderr, exitCode } = await thunderjar(scenario("0207"), ["run", "example", "--data-dir", data], { env: docker.env });

    expect(stdout).toBe(`Execution <ULID>\nPushing ${PRERUN} ... failed\n`);
    expect(stderr).toBe(`Error: Pushing ${PRERUN} failed: denied: permission_denied: The token provided does not match expected scopes.
Check that your Docker login for ghcr.io can push to ${REPOSITORY}: on ghcr.io, a token needs the write:packages scope.
`);
    expect(exitCode).toBe(1);
    expect((await docker.commands()).filter((command) => command.startsWith("docker run"))).toEqual([]);
    expect(await Bun.file(data).exists()).toBe(false);
  });
});

describe("0201 minimal existing setup, with imageStore: null", () => {
  test("asks Docker for no login, and pushes nothing", async () => {
    await using docker = await fakeDocker();

    const { exitCode } = await thunderjar(scenario("0201"), ["run", "example", "--data-dir", dataDir()], { env: docker.env });

    expect(exitCode).toBe(0);
    const commands = await docker.commands();
    expect(commands[0]).toBe("docker image ls --format {{.Repository}}:{{.Tag}} thunderjar-prerun");
    expect(commands.filter((command) => /^docker (login|tag|push)\b/.test(command))).toEqual([]);
  });
});
