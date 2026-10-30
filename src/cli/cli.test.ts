import { expect, test } from "bun:test";
import { $ } from "bun";

const cli = new URL("./index.ts", import.meta.url).pathname;

test("init prints a placeholder message and exits 0", async () => {
  const result = await $`bun ${cli} init`.quiet().nothrow();

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe("nothing here yet\n");
});
