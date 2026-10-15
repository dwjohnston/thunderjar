import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHostMeasurementOpener } from "./runner.ts";

const ID = "01k4x9j2e8mqz3abcdefghjkmn";
const TAG = `postrun-e${ID}-h4f9a21c8-i00`;

/** A kept container run under a fresh root, as the host runner leaves it. */
async function keptRun({ result }: { result?: string } = {}) {
  const rootDir = await mkdtemp(join(tmpdir(), "thunderjar-runner-"));
  const dir = join(rootDir, ID, TAG);
  await mkdir(join(dir, "workspace", "src"), { recursive: true });
  await mkdir(join(dir, "thunderjar"), { recursive: true });
  await writeFile(join(dir, "workspace", "src", "isPrime.ts"), "export default () => true;\n");
  await writeFile(join(dir, "workspace", ".hidden"), "");
  if (result !== undefined) await writeFile(join(dir, "thunderjar", "result.json"), result);
  return { rootDir, workspace: join(dir, "workspace") };
}

test("the host measurement context works in the run's workspace", async () => {
  const { rootDir, workspace } = await keptRun({ result: `{"model":"fake-model"}\n` });
  const ctx = await createHostMeasurementOpener(rootDir).openMeasurementContext(TAG);

  expect(ctx.workdir).toBe(workspace);
  expect(ctx.harnessResult).toBe(`{"model":"fake-model"}\n`);
  expect(await ctx.glob("**/*")).toEqual([".hidden", "src/isPrime.ts"]);
  expect(await ctx.readFile("src/isPrime.ts")).toBe("export default () => true;\n");

  await ctx.writeFile("src/isPrime.test.ts", "test\n");
  expect(readFileSync(join(workspace, "src", "isPrime.test.ts"), "utf8")).toBe("test\n");

  expect(await ctx.exec("pwd && ls src && echo oops >&2 && exit 4")).toEqual({
    stdout: `${workspace}\nisPrime.test.ts\nisPrime.ts\n`,
    stderr: "oops\n",
    exitCode: 4,
  });
});

test("the host measurement context's harnessResult is empty if the cli wrote no result file", async () => {
  const { rootDir } = await keptRun();
  const ctx = await createHostMeasurementOpener(rootDir).openMeasurementContext(TAG);
  expect(ctx.harnessResult).toBe("");
});

test("opening a measurement context for a run that wasn't kept, or a tag that isn't a postrun tag, fails", async () => {
  const { rootDir } = await keptRun();
  const opener = createHostMeasurementOpener(rootDir);
  const missing = `postrun-e${ID}-h4f9a21c8-i01`;
  expect(existsSync(join(rootDir, ID, missing))).toBe(false);
  await expect(opener.openMeasurementContext(missing)).rejects.toThrow(`no container run kept for ${missing}`);
  await expect(opener.openMeasurementContext("prerun-h4f9a21c8")).rejects.toThrow("not a postrun tag: prerun-h4f9a21c8");
});
