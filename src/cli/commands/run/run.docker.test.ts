// `thunderjar run` against real Docker: each iteration runs in a container from its prerun image,
// is committed into its postrun image, and is measured in containers from that. The agents are the fake ones. Skipped by `bun test`;
// run with `bun run test:docker`. Every image and container is named under a throwaway
// `--image-prefix`, and removed afterwards, and the store goes to a temporary `--data-dir`.
import { $, Glob } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import type { ContainerRunRecord, ExecutionRecord } from "../../../store/runDataStore.ts";
import { TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

const PREFIX = `tj-test-${crypto.randomUUID().slice(0, 8)}`;
const DATA_DIR = `${TMP_DIR}/data-${PREFIX}`;

const PLAIN = "Create a file isPrime.ts exporting a function that tests for primality.";

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
      { docker: "real", paths: { "<PREFIX>": PREFIX, "<DATA>": DATA_DIR } },
    );

    expect(stderr).toBe("");
    expect(exitCode).toBe(0);
    expect(stdout).toBe(`Execution <ULID>
Building <PREFIX>-prerun:5650e1a8 ... done
Building <PREFIX>-prerun:de78e815 ... done
 1/2  iteration 1/1  fake-harness-alpha | plain  ... done (<duration>)
      isPrimeTemplateTest: {passed: 3, failed: 2}   isPrimeTsExists: true   tsIgnoreCount: 1
 2/2  iteration 1/1  fake-harness-beta | plain  ... done (<duration>)
      isPrimeTemplateTest: {passed: 5, failed: 0}   isPrimeTsExists: true   tsIgnoreCount: 0
Wrote <DATA>/runs/<ULID>/
`);

    const [executionDir] = [...new Glob("runs/*").scanSync({ cwd: DATA_DIR, onlyFiles: false })];
    const execution = (await Bun.file(`${DATA_DIR}/${executionDir}/execution.json`).json()) as ExecutionRecord;
    const id = execution.executionId;
    expect(execution).toMatchObject({ testCase: "two-harnesses", status: "complete", matrix: { permutations: 2, iterations: 1 } });
    const [alpha, beta] = (await Promise.all(
      ["1-1", "2-1"].map((run) => Bun.file(`${DATA_DIR}/runs/${id}/container-runs/${run}.json`).json()),
    )) as [ContainerRunRecord, ContainerRunRecord];

    // Each record names its postrun image, which holds what its agent did and how it ran.
    expect([alpha.postrunImage, beta.postrunImage]).toEqual([`${PREFIX}-postrun:${id}-1-1`, `${PREFIX}-postrun:${id}-2-1`]);
    for (const record of [alpha, beta]) {
      expect(record.execution.exitCode).toBe(0);
      expect(JSON.parse(await inImage(record.postrunImage, "cat /thunderjar/run.json"))).toEqual(record.execution);
      expect(await inImage(record.postrunImage, "cat /thunderjar/result.json")).toBe((record.harnessResult as string).trim());
      // Nothing measuring wrote, like a rendered test, is in it.
      expect(await inImage(record.postrunImage, "pwd && ls -A")).toBe("/workspace\nFAKE_INSTRUCTIONS.md\nisPrime.ts");
    }

    // Each was measured, in the measurement containers, and its measures recorded.
    const measures = (record: ContainerRunRecord) =>
      Object.fromEntries(Object.entries(record.result).map(([name, { instrument, outcome }]) => [name, [instrument, outcome]]));
    expect(measures(alpha)).toEqual({
      isPrimeTemplateTest: ["templateTest", { outcome: "measured", data: { passed: 3, failed: 2 } }],
      isPrimeTsExists: ["fileCreated", { outcome: "measured", data: true }],
      tsIgnoreCount: ["grep", { outcome: "measured", data: 1 }],
    });
    expect(measures(beta)).toEqual({
      isPrimeTemplateTest: ["templateTest", { outcome: "measured", data: { passed: 5, failed: 0 } }],
      isPrimeTsExists: ["fileCreated", { outcome: "measured", data: true }],
      tsIgnoreCount: ["grep", { outcome: "measured", data: 0 }],
    });

    // The two fake agents did different things.
    expect(alpha.harnessResult).toBe('{"model":"fake-model-small-001"}\n');
    expect(beta.harnessResult).toBe('{"model":"fake-model-large-001"}\n');
    expect(await inImage(alpha.postrunImage, "cat isPrime.ts")).toBe(
      `// ${PLAIN}\n// @ts-ignore\nexport const isPrime = (n: number) => n > 1 && n % 2 !== 0;`,
    );
    expect(await inImage(beta.postrunImage, "cat isPrime.ts")).toBe(
      `// ${PLAIN}\nexport const isPrime = (n: number) => n > 1 && Array.from({ length: n - 2 }, (_, i) => i + 2).every((d) => n % d !== 0);`,
    );

    // A postrun image starts as its prerun image does, rather than running the agent again.
    const config = "{{json .Config.Entrypoint}} {{json .Config.Cmd}}";
    expect(await $`docker image inspect --format ${config} ${alpha.postrunImage}`.text()).toBe(
      await $`docker image inspect --format ${config} ${PREFIX}-prerun:5650e1a8`.text(),
    );

    // Every container was removed.
    expect(lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text())).toEqual([]);
  }, 600_000);
});
