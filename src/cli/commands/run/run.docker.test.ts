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
    for (const repository of [`${PREFIX}-prerun`, `${PREFIX}-postrun`]) {
      const images = lines(await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} ${repository}`.text());
      if (images.length > 0) await $`docker image rm --force ${images}`.quiet();
    }
    await $`rm -rf ${DATA_DIR}`.quiet();
  });

  test("0202 two-harnesses: each fake agent's changes are in its postrun image, and recorded", async () => {
    const { stdout, stderr, exitCode } = await thunderjar(
      scenario("0202"),
      ["run", "two-harnesses", "--image-prefix", PREFIX, "--data-dir", DATA_DIR],
      { docker: "real", env: { FAKE_HARNESS_KEY: "fake-key" }, paths: { "<PREFIX>": PREFIX, "<DATA>": DATA_DIR } },
    );

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>
Building <PREFIX>-prerun:b9cd78e6 ... done
Building <PREFIX>-prerun:44230271 ... done
 1/2  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>, $0.061)
      isPrimeTests: {passed: 3, failed: 2}   isPrimeTsExists: true   saysArr: true   tsIgnoreCount: 1
 2/2  iteration 1/1  fake-harness-beta | plain  ... done (<duration>)
      isPrimeTests: {passed: 5, failed: 0}   isPrimeTsExists: true   saysArr: false   tsIgnoreCount: 0
Recorded in <DATA>/runs.sqlite
`);

    const { execution, containerRuns } = await storedRuns(DATA_DIR);
    const id = execution.executionId;
    expect(execution).toMatchObject({ testCase: "two-harnesses", status: "complete", matrix: { permutations: 2, iterations: 1 } });
    const [alpha, beta] = containerRuns as [ContainerRunRecord, ContainerRunRecord];

    // Each record names its postrun image, which holds what its agent did and how it ran.
    expect([alpha.postrunImage, beta.postrunImage]).toEqual([`${PREFIX}-postrun:${id}-1-1`, `${PREFIX}-postrun:${id}-2-1`]);
    for (const record of [alpha, beta]) {
      expect(record.execution.exitCode).toBe(0);
      expect(record.execution).toMatchObject(JSON.parse(await inImage(record.postrunImage, "cat /thunderjar/run.json")));
      expect(await inImage(record.postrunImage, "cat /thunderjar/result.json")).toBe((record.harnessResult as string).trim());
      // Nothing measuring wrote, like a rendered test, is in it.
      expect(await inImage(record.postrunImage, "pwd && ls -A")).toBe("/workspace\nFAKE_INSTRUCTIONS.md\nisPrime.ts");
    }

    // Each was measured, in the measurement containers, and its measures recorded.
    const measures = (record: ContainerRunRecord) =>
      Object.fromEntries(Object.entries(record.result).map(([name, { instrument, outcome }]) => [name, [instrument, outcome]]));
    expect(measures(alpha)).toEqual({
      isPrimeTests: ["bunTestFile", { outcome: "measured", data: { passed: 3, failed: 2 } }],
      isPrimeTsExists: ["fileCreated", { outcome: "measured", data: true }],
      saysArr: ["replyMatches", { outcome: "measured", data: true }],
      tsIgnoreCount: ["grep", { outcome: "measured", data: 1 }],
    });
    expect(measures(beta)).toEqual({
      isPrimeTests: ["bunTestFile", { outcome: "measured", data: { passed: 5, failed: 0 } }],
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
      await $`docker image inspect --format ${config} ${PREFIX}-prerun:b9cd78e6`.text(),
    );

    // Every container was removed.
    expect(lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text())).toEqual([]);
  }, 600_000);

  test("0204 misbehaving: an agent that times out is killed, and each is committed and measured however it ended", async () => {
    const data = `${DATA_DIR}/misbehaving`;
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0204"), ["run", "misbehaving", "--image-prefix", PREFIX, "--data-dir", data], {
      docker: "real",
      paths: { "<PREFIX>": PREFIX, "<DATA>": data },
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
    expect(lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text())).toEqual([]);
  }, 600_000);

  test("0205 remember: each turn runs in the same container and session, so the last can answer from the first", async () => {
    const data = `${DATA_DIR}/remember`;
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0205"), ["run", "remember", "--image-prefix", PREFIX, "--data-dir", data], {
      docker: "real",
      paths: { "<PREFIX>": PREFIX, "<DATA>": data },
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toContain(`
 1/1  iteration 1/1  fake-rememberer | tell-then-ask  ... done (<duration>)
      promisedToRemember: true   remembersName: true
`);
    const [record] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    expect(record.turns?.map((turn) => turn.reply)).toEqual([
      { outcome: "collected", text: "I will remember that: My rubber ducky is called Eli." },
      { outcome: "collected", text: "You told me: My rubber ducky is called Eli." },
    ]);
    expect(await inImage(record.postrunImage, `cat "$HOME/.fake-rememberer/${record.sessionId}"`)).toBe("My rubber ducky is called Eli.");
  }, 600_000);

  test("0206 sandboxed: an agent can make a user namespace, as a sandbox does, only with its base image's run options", async () => {
    const data = `${DATA_DIR}/sandboxed`;
    const { stdout, stderr, exitCode } = await thunderjar(scenario("0206"), ["run", "sandboxed", "--image-prefix", PREFIX, "--data-dir", data], {
      docker: "real",
      paths: { "<PREFIX>": PREFIX, "<DATA>": data },
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

  test("0202 quoting: the prompt reaches the agent byte for byte, through a file", async () => {
    const data = `${DATA_DIR}/quoting`;
    const { stderr, exitCode } = await thunderjar(scenario("0202"), ["run", "quoting", "--image-prefix", PREFIX, "--data-dir", data], {
      docker: "real",
    });

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    const [record] = (await storedRuns(data)).containerRuns as [ContainerRunRecord];
    // fake-echo copies the prompt file into its result file.
    expect(record.harnessResult).toBe(AWKWARD);
    expect(await $`docker run --rm ${record.postrunImage} cat /thunderjar/prompt.txt`.text()).toBe(AWKWARD);
  }, 600_000);
});
