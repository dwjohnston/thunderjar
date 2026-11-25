import { $ } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TMP_DIR } from "../testing/cli.ts";
import { NOW_MS_FUNCTION } from "./containerRun.ts";

describe("the timed run's now_ms", () => {
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

});
