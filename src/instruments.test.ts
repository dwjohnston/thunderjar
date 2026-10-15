import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileCreated } from "./instruments.ts";
import { createHostMeasurementOpener } from "./runner.ts";

const TAG = "postrun-e01k4x9j2e8mqz3abcdefghjkmn-h4f9a21c8-i00";

/** A kept container run whose workspace holds `files`, and its measurement context. */
async function contextWith(files: string[]) {
  const rootDir = await mkdtemp(join(tmpdir(), "thunderjar-instruments-"));
  const workspace = join(rootDir, "01k4x9j2e8mqz3abcdefghjkmn", TAG, "workspace");
  await mkdir(workspace, { recursive: true });
  for (const file of files) {
    await mkdir(dirname(join(workspace, file)), { recursive: true });
    await writeFile(join(workspace, file), "");
  }
  return createHostMeasurementOpener(rootDir).openMeasurementContext(TAG);
}

test("fileCreated is true when the glob matches a file", async () => {
  const ctx = await contextWith(["isPrime.ts", "README.md"]);
  expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: true });
});

test("fileCreated is false when nothing matches", async () => {
  const ctx = await contextWith(["isprime.ts", "src/isPrime.js"]);
  expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: false });
});

test("fileCreated is false in an empty workspace", async () => {
  const ctx = await contextWith([]);
  expect(await fileCreated.evaluate({ glob: "**/*" }, ctx)).toEqual({ outcome: "measured", data: false });
});

test("fileCreated finds a nested match, which a top-level glob doesn't", async () => {
  const ctx = await contextWith(["src/lib/isPrime.ts"]);
  expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: true });
  expect(await fileCreated.evaluate({ glob: "isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: false });
});

test("fileCreated matches files only, not directories", async () => {
  const ctx = await contextWith(["isPrime.ts/inner.txt"]);
  expect(await fileCreated.evaluate({ glob: "isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: false });
});

test("fileCreated checks its config is a glob", () => {
  expect(fileCreated.checkConfig({ glob: "**/isPrime.ts" })).toEqual([]);
  expect(fileCreated.checkConfig({ path: "isPrime.ts" })).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
  expect(fileCreated.checkConfig(undefined)).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
  expect(fileCreated.checkConfig({ glob: 3 })).toEqual([["config.glob", "must be a glob pattern, got 3"]]);
});
