// `thunderjar run` against real Docker: each iteration runs in a container from its prerun image,
// is committed into its postrun image, and is measured in containers from that. The agents are the fake ones. Skipped by `bun test`;
// run with `bun run test:docker`. Every image and container is named under a throwaway
// `--image-prefix`, and removed afterwards, and the store goes to a temporary `--data-dir`.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { type ContainerRunRecord, type ExecutionRecord, sqliteStore, storeFileIn } from "../../../store/runDataStore.ts";
import { TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

/** The records of the one execution in the store in `dir`, a `--data-dir`. */
async function storedRuns(dir: string) {
  const store = sqliteStore(storeFileIn(dir));
  const [execution] = (await store.listExecutions()) as [ExecutionRecord];
  return { execution, containerRuns: await store.containerRunsOf(execution.executionId) };
}

const PREFIX = `tj-test-${crypto.randomUUID().slice(0, 8)}`;
const DATA_DIR = `${TMP_DIR}/data-${PREFIX}`;

const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";
/** 0202's `awkward` initial prompt, full of shell syntax. */
const AWKWARD = `Say "hello", then print $HOME and \`whoami\`.
Don't stop at 'single quotes', a backslash \\ or 100%.`;

/** What `script` prints, run with sh in a throwaway container from `image`. */
const inImage = async (image: string, script: string) => (await $`docker run --rm ${image} sh -c ${script}`.text()).trim();

const lines = (text: string) => text.split("\n").filter(Boolean);

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("run, against real Docker", () => {
  afterAll(async () => {
    const containers = lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text());
    if (containers.length > 0) await $`docker rm --force ${containers}`.quiet();
    // Each test has its own prefix under PREFIX, so tests can run concurrently.
    const images = lines(await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} --filter ${`reference=${PREFIX}-*`}`.text());
    if (images.length > 0) await $`docker image rm --force ${images}`.quiet();
    await $`rm -rf ${DATA_DIR}`.quiet();
  });

  test("0202 two-harnesses: each fake agent's changes are in its postrun image, and recorded", async () => {
    const prefix = `${PREFIX}-harnesses`;
    const data = `${DATA_DIR}/harnesses`;
    const { stdout, stderr, exitCode } = await thunderjar(
      scenario("0202"),
      ["run", "two-harnesses", "--image-prefix", prefix, "--data-dir", data],
      { docker: "real", env: { FAKE_HARNESS_KEY: "fake-key" }, paths: { "<PREFIX>": prefix, "<DATA>": data } },
    );

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>
Building <PREFIX>-prerun:ded54607 ... done
Building <PREFIX>-prerun:e4f0784f ... done
 1/2  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>, $0.061)
      isPrimeShape: {exitCode: 0, stdout: "{\\"lines\\":3,\\"comments\\":2,\\"exports\\":1}\\n", stdoutTruncated: false}   isPrimeTests: {passed: 3, total: 5}   isPrimeTsExists: true   saysArr: true   tsIgnoreCount: 1
 2/2  iteration 1/1  fake-harness-beta | plain  ... done (<duration>)
      isPrimeShape: {exitCode: 0, stdout: "{\\"lines\\":2,\\"comments\\":1,\\"exports\\":1}\\n", stdoutTruncated: false}   isPrimeTests: {passed: 5, total: 5}   isPrimeTsExists: true   saysArr: false   tsIgnoreCount: 0
Recorded in <DATA>/runs.sqlite
`);

    const { execution, containerRuns } = await storedRuns(data);
    const id = execution.executionId;
    expect(execution).toMatchObject({ testCase: "two-harnesses", status: "complete", matrix: { permutations: 2, iterations: 1 } });
    const [alpha, beta] = containerRuns as [ContainerRunRecord, ContainerRunRecord];

    // Each record names its postrun image, which holds what its agent did and how it ran.
    expect([alpha.postrunImage, beta.postrunImage]).toEqual([`${prefix}-postrun:${id}-1-1`, `${prefix}-postrun:${id}-2-1`]);
    for (const record of [alpha, beta]) {
      expect(record.execution.exitCode).toBe(0);
      expect(record.execution).toMatchObject(JSON.parse(await inImage(record.postrunImage, "cat /thunderjar/run.json")));
      expect(await inImage(record.postrunImage, "cat /thunderjar/result.json")).toBe((record.harnessResult as string).trim());
      // Nothing measuring wrote, like the test bunTestFile ran, is in it.
      expect(await inImage(record.postrunImage, "pwd && ls -A")).toBe("/workspace\nFAKE_INSTRUCTIONS.md\nisPrime.ts");
    }

    // Each was measured, in the measurement containers, and its measures recorded.
    const measures = (record: ContainerRunRecord) =>
      Object.fromEntries(Object.entries(record.result).map(([name, { instrument, outcome }]) => [name, [instrument, outcome]]));
    expect(measures(alpha)).toEqual({
      isPrimeShape: ["shell", { outcome: "measured", data: { exitCode: 0, stdout: '{"lines":3,"comments":2,"exports":1}\n', stdoutTruncated: false } }],
      isPrimeTests: ["bunTestFile", { outcome: "measured", data: { passed: 3, total: 5 } }],
      isPrimeTsExists: ["fileCreated", { outcome: "measured", data: true }],
      saysArr: ["replyMatches", { outcome: "measured", data: true }],
      tsIgnoreCount: ["grep", { outcome: "measured", data: 1 }],
    });
    expect(measures(beta)).toEqual({
      isPrimeShape: ["shell", { outcome: "measured", data: { exitCode: 0, stdout: '{"lines":2,"comments":1,"exports":1}\n', stdoutTruncated: false } }],
      isPrimeTests: ["bunTestFile", { outcome: "measured", data: { passed: 5, total: 5 } }],
      isPrimeTsExists: ["fileCreated", { outcome: "measured", data: true }],
      saysArr: ["replyMatches", { outcome: "measured", data: false }],
      tsIgnoreCount: ["grep", { outcome: "measured", data: 0 }],
    });

    // The two fake agents did different things.
    expect(alpha.harnessResult).toStartWith('{"type":"result","result":"Arr, isPrime.ts be written."');
    expect(alpha.tokenCosts).toMatchObject({ outcome: "collected", models: [{ model: "fake-model-small-001", inputTokens: 12000, costUsd: 0.061 }] });
    expect(beta.tokenCosts).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(beta.harnessResult).toBe('{"model":"fake-model-large-001","reply":"I wrote isPrime.ts, and tested it up to 100."}\n');
    expect([alpha.reply, beta.reply]).toEqual([
      { outcome: "collected", text: "Arr, isPrime.ts be written." },
      { outcome: "collected", text: "I wrote isPrime.ts, and tested it up to 100." },
    ]);
    expect(await inImage(alpha.postrunImage, "cat isPrime.ts")).toBe(
      `// ${PLAIN}\n// @ts-ignore\nexport const isPrime = (n: number) => n > 1 && n % 2 !== 0;`,
    );
    expect(await inImage(beta.postrunImage, "cat isPrime.ts")).toBe(
      `// ${PLAIN}\nexport const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);`,
    );

    // Alpha's container was given the key it needs, and beta's, of another harness, wasn't. Only
    // whether it was set was written down, never its value.
    expect(await inImage(alpha.postrunImage, "cat /thunderjar/fake-harness-key")).toBe("set");
    expect(await inImage(beta.postrunImage, "cat /thunderjar/fake-harness-key")).toBe("");

    // A postrun image starts as its prerun image does, rather than running the agent again.
    const config = "{{json .Config.Entrypoint}} {{json .Config.Cmd}}";
    expect(await $`docker image inspect --format ${config} ${alpha.postrunImage}`.text()).toBe(
      await $`docker image inspect --format ${config} ${prefix}-prerun:ded54607`.text(),
    );

    // Every container was removed.
    expect(lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${prefix}-`}`.text())).toEqual([]);
  }, 600_000);

  test("0204 misbehaving: an agent that times out is killed, and each is committed and measured however it ended", async () => {
    const prefix = `${PREFIX}-misbehaving`;
    const data = `${DATA_DIR}/misbehaving`;
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--image-prefix", prefix, "--data-dir", data], {
      docker: "real",
      paths: { "<PREFIX>": prefix, "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(stdout).toContain(`
 1/3  iteration 1/1  fake-sleeper | plain  ... timed out after <duration>
      isPrimeTsExists: false
 2/3  iteration 1/1  fake-crasher | plain  ... exited 1 (<duration>)
      isPrimeTsExists: false
 3/3  iteration 1/1  fake-silent | plain  ... done, no result file (<duration>)
      isPrimeTsExists: true
`);
    const [sleeper] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    expect(sleeper.execution).toMatchObject({ exitCode: null, timedOut: true, timeoutSeconds: 2 });
    // Its postrun image holds the wrapper's start, all it wrote before it was killed.
    expect(Object.keys(JSON.parse(await inImage(sleeper.postrunImage, "cat /thunderjar/run.json")))).toEqual(["startedAt"]);
    expect(lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${prefix}-`}`.text())).toEqual([]);
  }, 600_000);

  test("0206 sandboxed: an agent can make a user namespace, as a sandbox does, only with its base image's run options", async () => {
    const prefix = `${PREFIX}-sandboxed`;
    const data = `${DATA_DIR}/sandboxed`;
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--image-prefix", prefix, "--data-dir", data], {
      docker: "real",
      paths: { "<PREFIX>": prefix, "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`
 1/2  iteration 1/1  node20 | fake-sandboxer | plain  ... done (<duration>)
      sandboxed: false
 2/2  iteration 1/1  node20-unconfined | fake-sandboxer | plain  ... done (<duration>)
      sandboxed: true
`);
  }, 600_000);

  test("0206 scrubbed-env: the postrun image holds no value the agent was run with, and keeps its base image's own", async () => {
    const prefix = `${PREFIX}-scrubbed`;
    const data = `${DATA_DIR}/scrubbed`;
    const secrets = { FAKE_HARNESS_KEY: "secret-harness-key", FAKE_RUN_OPTION_KEY: "secret-run-option-key" };
    const { stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "scrubbed-env", "--image-prefix", prefix, "--data-dir", data], {
      docker: "real",
      env: secrets,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    // The agent was given its key, by requiredEnv, and the base image's run options' variables.
    expect(record.reply).toEqual({ outcome: "collected", text: "key set, run option set, overridden set" });

    const envOf = async (image: string) => JSON.parse(await $`docker image inspect --format ${"{{json .Config.Env}}"} ${image}`.text()) as string[];
    const [prerun] = lines(await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} --filter ${`reference=${prefix}-prerun`}`.text()) as [string];
    const prerunEnv = await envOf(prerun);
    const postrunEnv = await envOf(record.postrunImage);
    expect(prerunEnv).toContain('FAKE_IMAGE_SETTING=kept: "quoted", $HOME, a \\ backslash and 100%');
    expect(prerunEnv).toContain("FAKE_OVERRIDDEN=image-value");
    // No value it was run with is in the postrun image's config: the variables the prerun image
    // doesn't set are blank, and those it does have its values.
    for (const value of Object.values(secrets)) expect(JSON.stringify(postrunEnv)).not.toContain(value);
    expect(postrunEnv.toSorted()).toEqual([...prerunEnv, "FAKE_HARNESS_KEY=", "FAKE_RUN_OPTION_KEY="].toSorted());
  }, 600_000);

  test("0206 test-case-env: the postrun image keeps the test case's env, and blanks its secretEnv", async () => {
    const prefix = `${PREFIX}-test-case-env`;
    const data = `${DATA_DIR}/test-case-env`;
    const secret = "secret-test-case-value";
    const { stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "test-case-env", "--image-prefix", prefix, "--data-dir", data], {
      docker: "real",
      env: { FAKE_TEST_CASE_SECRET: secret },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    // The agent saw the env's value, and both of the others.
    expect(record.reply).toEqual({ outcome: "collected", text: "setting test, awkward set, secret set" });
    expect(record.secretEnv).toEqual(["FAKE_TEST_CASE_SECRET"]);

    const postrunEnv = JSON.parse(await $`docker image inspect --format ${"{{json .Config.Env}}"} ${record.postrunImage}`.text()) as string[];
    expect(postrunEnv).toContain("FAKE_TEST_CASE_SETTING=test");
    expect(postrunEnv).toContain('FAKE_TEST_CASE_AWKWARD=kept: "quoted", $HOME, a \\ backslash and 100%');
    expect(postrunEnv).toContain("FAKE_TEST_CASE_SECRET=");
    expect(JSON.stringify(postrunEnv)).not.toContain(secret);
  }, 600_000);

  test("0206 measured-env: the measurement container sees the test case's env, its secretEnv and the harness's requiredEnv", async () => {
    const prefix = `${PREFIX}-measured-env`;
    const data = `${DATA_DIR}/measured-env`;
    const secrets = { FAKE_HARNESS_KEY: "secret-harness-key", FAKE_TEST_CASE_SECRET: "secret-test-case-value" };
    const { stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "measured-env", "--image-prefix", prefix, "--data-dir", data], {
      docker: "real",
      env: secrets,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    // Whether each is set and not blank, never its value: the postrun image has the secrets blank.
    expect(record.result.envSeen).toMatchObject({ outcome: { outcome: "measured", data: { exitCode: 0, stdout: "setting test, secret set, key set\n" } } });
    const postrunEnv = JSON.parse(await $`docker image inspect --format ${"{{json .Config.Env}}"} ${record.postrunImage}`.text()) as string[];
    for (const value of Object.values(secrets)) expect(JSON.stringify(postrunEnv)).not.toContain(value);
  }, 600_000);

  test("0206 leaked-secret: the secrets the agent wrote into files are found in its postrun image, by name and path, and the search container is removed", async () => {
    const prefix = `${PREFIX}-leaked`;
    const data = `${DATA_DIR}/leaked`;
    const secrets = { FAKE_HARNESS_KEY: "secret-harness-key", FAKE_TEST_CASE_SECRET: "secret-test-case-value" };
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "leaked-secret", "--image-prefix", prefix, "--data-dir", data], {
      docker: "real",
      env: secrets,
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    expect(record.secretsFound).toEqual([
      { name: "FAKE_HARNESS_KEY", files: 2, paths: ["/workspace/.env", "/workspace/agent.log"] },
      { name: "FAKE_TEST_CASE_SECRET", files: 1, paths: ["/workspace/.env"] },
    ]);
    expect(record.secretSearchFailed).toBeUndefined();
    expect(stdout).toContain("1 of 1 postrun images hold a secret's value in their files:\n");
    for (const value of Object.values(secrets)) expect(stdout + JSON.stringify(record)).not.toContain(value);
    // It really is in the image, as found.
    expect(await inImage(record.postrunImage, "cat /workspace/.env")).toBe(`KEY=${secrets.FAKE_HARNESS_KEY}\nSECRET=${secrets.FAKE_TEST_CASE_SECRET}`);
    expect(lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${prefix}-`}`.text())).toEqual([]);
  }, 600_000);

  test("0202 quoting: the prompt reaches the agent byte for byte, through a file", async () => {
    const prefix = `${PREFIX}-quoting`;
    const data = `${DATA_DIR}/quoting`;
    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "quoting", "--image-prefix", prefix, "--data-dir", data], {
      docker: "real",
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    // fake-echo copies the prompt file into its result file. writePrompt ends it with a newline.
    expect(record.harnessResult).toBe(`${AWKWARD}\n`);
    expect(await $`docker run --rm ${record.postrunImage} cat /thunderjar/prompt.txt`.text()).toBe(`${AWKWARD}\n`);
  }, 600_000);
});
