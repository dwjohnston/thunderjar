// `thunderjar run` with a real agent: Claude Code, built into its prerun image by 0501's harness, run
// against a real model, measured, recorded and shown. Skipped by `bun test`; run with
// `bun run test:agent`, which needs Docker and ANTHROPIC_API_KEY: it runs `compare-models`, init's own, on Haiku 4.5 and Haiku 5.5.
// Each run costs a few cents. Every image and container is named under a throwaway
// `--image-prefix`, and removed afterwards, and the store goes to a temporary `--data-dir`.
//
// Behind a proxy that re-signs TLS, as in a cloud sandbox, the base image must trust the proxy's CA
// for npm and the agent to reach the internet. That's the machine's setup, not the scenario's.
import { $, Glob } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import type { ContainerRunRecord } from "../../../store/runDataStore.ts";
import { TMP_DIR, thunderjar } from "../../../testing/cli.ts";
import { scenario } from "../../../testing/scenario.ts";

const PREFIX = `tj-agent-${crypto.randomUUID().slice(0, 8)}`;
const DATA_DIR = `${TMP_DIR}/data-${PREFIX}`;

const lines = (text: string) => text.split("\n").filter(Boolean);

/** Each test case of 0501 this test runs, by the key that runs it, and its permutations' labels. */
const TEST_CASES = [
  {
    testCase: "compare-models",
    key: "ANTHROPIC_API_KEY",
    labels: ["claude-code-2.1.311/claude-haiku-4-5-20251001 | plain", "claude-code-2.1.311/claude-haiku-5-5 | plain"],
  },
].filter(({ key }) => Bun.env[key]);

describe.skipIf(!Bun.env.THUNDERJAR_AGENT_TESTS || TEST_CASES.length === 0)("run, with a real Claude Code", () => {
  afterAll(async () => {
    const containers = lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text());
    if (containers.length > 0) await $`docker rm --force ${containers}`.quiet();
    for (const repository of [`${PREFIX}-prerun`, `${PREFIX}-postrun`]) {
      const images = lines(await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} ${repository}`.text());
      if (images.length > 0) await $`docker image rm --force ${images}`.quiet();
    }
    await $`rm -rf ${DATA_DIR}`.quiet();
  });

  test.each(TEST_CASES)("0501 $testCase: builds Claude Code, runs it on the task with each model, and measures, records and shows what it did", async ({ testCase, labels }) => {
    const data = `${DATA_DIR}/${testCase}`;
    const run = await thunderjar(scenario("0501"), ["run", testCase, "--image-prefix", PREFIX, "--data-dir", data], {
      docker: "real",
      paths: { "<PREFIX>": PREFIX, "<DATA>": data },
    });

    expect(run.stderr).toBe("");
    expect(run.exitCode).toBe(0);
    labels.forEach((label, index) => {
      const ordinal = `${index + 1}/${labels.length}`;
      expect(run.stdout).toMatch(new RegExp(` ${ordinal}  iteration 1/1  ${label}  \\.\\.\\. done \\(<duration>, (\\$[\\d.]+|[\\d,]+ tokens)\\)\\n`));
    });

    const [executionDir] = [...new Glob("runs/*").scanSync({ cwd: data, onlyFiles: false })];
    const records: ContainerRunRecord[] = [];
    for (const [index] of labels.entries()) {
      const record = (await Bun.file(`${data}/${executionDir}/container-runs/${index + 1}-1.json`).json()) as ContainerRunRecord;
      records.push(record);
      expect(record.execution).toMatchObject({ exitCode: 0, timedOut: false });
      // Claude Code's own report: its reply, and the tokens it spent.
      expect(record.reply).toMatchObject({ outcome: "collected", text: expect.stringMatching(/\S/) });
      expect(record.tokenCosts).toMatchObject({ outcome: "collected" });
      expect(record.tokenCosts?.outcome === "collected" && record.tokenCosts.models[0]!.outputTokens).toBeGreaterThan(0);
      expect(record.result.isPrimeTsExists?.outcome).toEqual({ outcome: "measured", data: true });
      // The template test ran with the base image's bun, and the grep found the agent's files.
      expect(record.result.isPrimeTemplateTest?.outcome).toMatchObject({ outcome: "measured" });
      expect(record.result.tsIgnoreCount?.outcome).toMatchObject({ outcome: "measured" });
    }
    const [record] = records as [ContainerRunRecord];

    // It ran as the image's non-root user, which is what lets Claude Code skip its permission prompts.
    expect((await $`docker run --rm ${record.postrunImage} whoami`.text()).trim()).toBe("node");

    const shown = await thunderjar(scenario("0501"), ["show", record.executionId, "1-1", "--data-dir", data]);
    expect(shown.stdout).toContain("\nReply\n");
    expect(shown.stdout).toContain("\nToken costs\n");
  }, 900_000);
});
