/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiw2YB851n82Y1sd8t
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// `thunderjar remeasure` against real Docker: a copy of 0202 is run with its fake agents, one of
// its measurements changed, and the execution remeasured, each run in a new measurement container
// from its postrun image. Skipped by `bun test`; run with `bun run test:docker`. Every image and
// container is named under a throwaway `--image-prefix`, and removed afterwards. The store is the
// copy's own, so `show` reads its measurements as they are now.
import { $ } from "bun";
import { afterAll, describe, expect, test } from "bun:test";
import { sqliteStore } from "../../../store/runDataStore.ts";
import { copyScenarioProject, type ProjectCopy, thunderjar } from "../../../testing/cli.ts";

const PREFIX = `tj-test-${crypto.randomUUID().slice(0, 8)}`;
const MEASUREMENTS = ".thunderjar/parameters/tasks/is-prime/measurements";

const lines = (text: string) => text.split("\n").filter(Boolean);

describe.skipIf(!Bun.env.THUNDERJAR_DOCKER_TESTS)("remeasure, against real Docker", () => {
  let copy: ProjectCopy | undefined;
  afterAll(async () => {
    const containers = lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text());
    if (containers.length > 0) await $`docker rm --force ${containers}`.quiet();
    const images = lines(await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} --filter ${`reference=${PREFIX}-*`}`.text());
    if (images.length > 0) await $`docker image rm --force ${images}`.quiet();
    await copy?.remove();
  });

  test("0202 two-harnesses: run, change a measurement, remeasure, and show the new values", async () => {
    copy = await copyScenarioProject("0202");
    const options = { docker: "real" as const, env: { FAKE_HARNESS_KEY: "fake-key" }, paths: { "<PREFIX>": PREFIX } };
    const ran = await thunderjar(copy.dir, ["run", "two-harnesses", "--image-prefix", PREFIX], options);
    expect(ran.exitCode).toBe(0);
    const [execution] = await sqliteStore(`${copy.dir}/.thunderjar/.data/runs.sqlite`).listExecutions();
    const id = execution!.executionId;
    const metric = async () => (await thunderjar(copy!.dir, ["show", id, "1-1"], options)).stdout.match(/tsIgnoreCount\.count +(.*)\n/)?.[1];
    expect(await metric()).toBe("1");

    // Counts the lines naming isPrime now, not those with @ts-ignore: alpha's isPrime.ts has two.
    await Bun.write(
      `${copy.dir}/${MEASUREMENTS}/tsIgnoreCount.ts`,
      `import { declareMeasurement } from "thunderjar";\n\nexport default declareMeasurement({\n  instrument: "grep",\n  config: { glob: "**/*.ts", pattern: "isPrime" },\n  metrics: { count: { stat: "mean" } },\n});\n`,
    );
    expect(await metric()).toStartWith("stale");

    const { stdout, stderr, exitCode } = await thunderjar(copy.dir, ["remeasure", id, "--image-prefix", PREFIX], options);
    expect({ stdout, stderr, exitCode }).toEqual({ stdout: "remeasured 2 runs\n", stderr: "", exitCode: 0 });
    expect(await metric()).toBe("2");
    // Its measurement containers are gone.
    expect(lines(await $`docker ps --all --format ${"{{.Names}}"} --filter ${`name=^${PREFIX}-`}`.text())).toEqual([]);
  });
});
