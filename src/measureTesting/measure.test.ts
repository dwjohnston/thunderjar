import { describe, expect, test } from "bun:test";
import { declareMeasurement } from "../api/declarations.ts";
import { TMP_DIR } from "../testing/cli.ts";
import { measure } from "./measure.ts";

const FIXTURES = `${import.meta.dir}/fixtures`;

/** A source file under fixtures/.tmp, written for this test: some are broken on purpose. */
async function source(name: string, text: string): Promise<string> {
  const path = `${TMP_DIR}/js-ast-${crypto.randomUUID()}/${name}`;
  await Bun.write(path, text);
  return path;
}

describe("measure", () => {
  test("shell: runs in the workspace, and scores the exit code by default", async () => {
    const declaration = declareMeasurement({
      instrument: "shell",
      config: { command: "test -f a.txt && grep -q hello a.txt" },
      metrics: { ok: { stat: "rate" } },
    });
    const good = await measure(declaration, { files: { "a.txt": `${FIXTURES}/hello.txt` } });
    expect(good).toMatchObject({ outcome: "measured", metrics: { ok: true } });
    const bad = await measure(declaration, {});
    expect(bad.metrics.ok).toBe(false);
    // @ts-expect-error metrics are typed by the declaration's metric names
    expect(bad.metrics.nope).toBeUndefined();
  });

  test("shell: a metric's own score reads the value", async () => {
    const declaration = declareMeasurement({
      instrument: "shell",
      config: { command: "cat a.txt" },
      metrics: { length: { stat: "mean", score: (value) => value.stdout.trim().length } },
    });
    // cat fails on the missing file: the score reads that value too.
    expect((await measure(declaration, {})).metrics.length).toBe(0);
    const here = await measure(declaration, { files: { "a.txt": `${FIXTURES}/hello.txt` } });
    expect(here.metrics.length).toBe(5);
    expect(here.value).toMatchObject({ exitCode: 0, stdout: "hello\n" });
  });

  test("grep: counts matching lines by default, and a metric can score otherwise", async () => {
    const declaration = declareMeasurement({
      instrument: "grep",
      config: { glob: "src/**/*.txt", pattern: "hello" },
      metrics: { count: { stat: "sum" }, any: { stat: "rate", score: (n) => n > 0 } },
    });
    const files = { "src/deep/a.txt": `${FIXTURES}/hello.txt`, "src/b.txt": `${FIXTURES}/hello.txt` };
    expect((await measure(declaration, { files })).metrics).toEqual({ count: 2, any: true });
    const none = await measure(declaration, {});
    expect(none.outcome).toBe("skipped");
    expect(none.metrics).toEqual({ count: undefined, any: undefined });
  });

  test("fileCreated: default score, and a score of its own", async () => {
    const declaration = declareMeasurement({
      instrument: "fileCreated",
      config: { glob: ".thunderjar/**/index.ts" },
      metrics: { created: { stat: "rate" }, missing: { stat: "rate", score: (found) => !found } },
    });
    const files = { ".thunderjar/x/index.ts": `${FIXTURES}/hello.txt` };
    expect((await measure(declaration, { files })).metrics).toEqual({ created: true, missing: false });
    expect((await measure(declaration, {})).metrics).toEqual({ created: false, missing: true });
  });

  test("replyMatches: reads the reply, empty by default", async () => {
    const declaration = declareMeasurement({
      instrument: "replyMatches",
      config: { pattern: "all tests pass" },
      metrics: { claims: { stat: "rate" }, silent: { stat: "rate", score: (matched) => !matched } },
    });
    expect((await measure(declaration, { reply: "All good: all tests pass" })).metrics).toEqual({ claims: true, silent: false });
    expect((await measure(declaration, {})).metrics).toEqual({ claims: false, silent: true });
  });

  test("jsAst: counts each named selector's matches in a TypeScript file", async () => {
    const declaration = declareMeasurement({
      instrument: "jsAst",
      config: { glob: "src/*.ts", selectors: { calls: "CallExpression", typed: "TSTypeAnnotation" } },
      metrics: { calls: { stat: "sum", score: (v) => v[0]?.matches.calls } },
    });
    const file = await source("a.ts", "const n: number = f(g(1));\n");
    const result = await measure(declaration, { files: { "src/a.ts": file } });
    expect(result.value).toEqual([{ file: "src/a.ts", matches: { calls: 2, typed: 1 } }]);
    expect(result.metrics.calls).toBe(2);
  });

  test("jsAst: a file that doesn't parse counts 0 for each selector, with its parse error", async () => {
    const declaration = declareMeasurement({
      instrument: "jsAst",
      config: { glob: "*.ts", selectors: { calls: "CallExpression" } },
      metrics: { broken: { stat: "rate", score: (v) => v.some((f) => f.parseError !== undefined) } },
    });
    const files = { "a.ts": await source("a.ts", "f(1);\n"), "b.ts": await source("b.ts", "const = f(;\n") };
    const result = await measure(declaration, { files });
    expect(result.value).toEqual([
      { file: "a.ts", matches: { calls: 1 } },
      { file: "b.ts", matches: { calls: 0 }, parseError: expect.any(String) },
    ]);
    expect(result.metrics.broken).toBe(true);
  });

  test("bunTestFile: is not supported yet", async () => {
    const declaration = declareMeasurement({
      instrument: "bunTestFile",
      config: { subject: "a.ts", test: "./a.test.ts" },
      metrics: { passes: { stat: "mean" } },
    });
    await expect(measure(declaration, {})).rejects.toThrow(/doesn't support bunTestFile yet/);
  });

  test("a fixture that doesn't exist is an error", async () => {
    const declaration = declareMeasurement({ instrument: "fileCreated", config: { glob: "a" }, metrics: { c: { stat: "rate" } } });
    await expect(measure(declaration, { files: { a: `${FIXTURES}/nope.txt` } })).rejects.toThrow(/nope\.txt/);
  });

  test("the temp workspace is removed afterwards, even when the measurement throws", async () => {
    const dirs: string[] = [];
    const declaration = declareMeasurement({
      instrument: "shell",
      config: { command: "pwd" },
      metrics: {
        where: {
          stat: "mean",
          score: ({ stdout }) => {
            dirs.push(stdout.trim());
            return 1;
          },
        },
      },
    });
    await measure(declaration, {});
    expect(dirs).toHaveLength(1);
    expect(await Bun.file(`${dirs[0]}/.`).exists()).toBe(false);
    const { $ } = await import("bun");
    expect((await $`test -e ${dirs[0]!}`.nothrow().quiet()).exitCode).not.toBe(0);

    const before = (await $`ls ${Bun.env.TMPDIR || "/tmp"}`.text()).split("\n").filter((n) => n.startsWith("thunderjar-measure-")).length;
    const throwing = declareMeasurement({ instrument: "fileCreated", config: { glob: "a" }, metrics: { n: { stat: "rate" } } });
    await expect(measure(throwing, { files: { a: `${FIXTURES}/nope.txt` } })).rejects.toThrow();
    const after = (await $`ls ${Bun.env.TMPDIR || "/tmp"}`.text()).split("\n").filter((n) => n.startsWith("thunderjar-measure-")).length;
    expect(after).toBe(before);
  });
});
