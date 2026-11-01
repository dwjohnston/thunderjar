import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DockerContainerError } from "../docker/docker.ts";
import { TMP_DIR } from "../testing/cli.ts";
import { NOW_MS_FUNCTION, parseExecution } from "./containerRun.ts";

describe("the execution wrapper's now_ms", () => {
  const binDir = `${TMP_DIR}/now-ms-${crypto.randomUUID()}`;

  /** Runs now_ms with a `date` that prints `ms` for `+%s%3N` and `seconds` for `+%s`. */
  async function nowMs(ms: string, seconds: string): Promise<string> {
    const script = `#!/bin/sh\nif [ "$1" = "+%s%3N" ]; then echo '${ms}'; else echo '${seconds}'; fi\n`;
    await Bun.write(`${binDir}/date`, script);
    await $`chmod +x ${binDir}/date`.quiet();
    const output = await $`sh -c ${`${NOW_MS_FUNCTION}\nnow_ms`}`.env({ ...Bun.env, PATH: `${binDir}:${Bun.env.PATH}` }).text();
    return output.trim();
  }

  beforeAll(async () => {
    await $`mkdir -p ${binDir}`.quiet();
  });
  afterAll(async () => {
    await $`rm -rf ${binDir}`.quiet();
  });

  test("uses GNU date's milliseconds", async () => {
    expect(await nowMs("1793499264123", "1793499264")).toBe("1793499264123");
  });

  test("falls back to seconds times 1000 when date prints seconds for %3N (Alpine)", async () => {
    expect(await nowMs("1793499264", "1793499264")).toBe("1793499264000");
  });

  test("falls back to seconds times 1000 when date prints a literal %3N (busybox)", async () => {
    expect(await nowMs("1793499260%3N", "1793499260")).toBe("1793499260000");
  });

  test("works with the real date", async () => {
    const before = Date.now();
    const ms = Number(await $`sh -c ${`${NOW_MS_FUNCTION}\nnow_ms`}`.text());
    expect(ms).toBeGreaterThanOrEqual(before - 1000);
    expect(ms).toBeLessThanOrEqual(Date.now());
  });
});

describe("parseExecution", () => {
  test("reads the wrapper's run.json", () => {
    expect(parseExecution('{"startedAt":1793499264123,"finishedAt":1793499265000,"exitCode":3}\n')).toEqual({
      startedAt: 1793499264123,
      finishedAt: 1793499265000,
      exitCode: 3,
    });
  });

  test.each([
    ["seconds rather than ms", '{"startedAt":1793499264,"finishedAt":1793499265,"exitCode":0}'],
    ["a literal %3N", '{"startedAt":1793499260%3N,"finishedAt":1793499261%3N,"exitCode":0}'],
    ["a missing exit code", '{"startedAt":1793499264123,"finishedAt":1793499265000}'],
  ])("rejects %s", (_, text) => {
    expect(() => parseExecution(text)).toThrow(DockerContainerError);
  });

  test("rejects a missing run.json", () => {
    expect(() => parseExecution(undefined)).toThrow(DockerContainerError);
  });
});
