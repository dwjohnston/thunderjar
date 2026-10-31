import { expect, test } from "bun:test";
import { $ } from "bun";

const cli = new URL("../../index.ts", import.meta.url).pathname;

test("plan prints a placeholder message and exits 0", async () => {
  const result = await $`bun ${cli} plan`.quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("nothing here yet\n");
});
