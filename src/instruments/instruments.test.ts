// Unit tests of the built-in instruments, each against a context over a temporary folder on the
// host, standing in for a measurement container.
import { afterAll, describe, expect, test } from "bun:test";
import { $, Glob } from "bun";
import type { MeasurementContext } from "../api/declarations.ts";
import { TMP_DIR } from "../testing/cli.ts";
import { aggregateMethods, fileCreated, grep, instruments, isInstrumentName, templateTest } from "./instruments.ts";

const ROOT = `${TMP_DIR}/instruments-${crypto.randomUUID()}`;

afterAll(async () => {
  await $`rm -rf ${ROOT}`.quiet();
});

/** A folder holding `files`, `""` each if given as a list. */
async function folderWith(files: string[] | Record<string, string>): Promise<string> {
  const dir = `${ROOT}/${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  const contents = Array.isArray(files) ? Object.fromEntries(files.map((file) => [file, ""])) : files;
  for (const [file, content] of Object.entries(contents)) await Bun.write(`${dir}/${file}`, content);
  return dir;
}

/** A context whose workdir is a folder holding `files`. */
async function contextWith(files: string[] | Record<string, string>): Promise<MeasurementContext> {
  const workdir = await folderWith(files);
  return {
    workdir,
    harnessResult: "",
    exec: async (command) => {
      const { stdout, stderr, exitCode } = await $`sh -c ${command}`.cwd(workdir).quiet().nothrow();
      return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode };
    },
    readFile: (path) => Bun.file(`${workdir}/${path}`).text(),
    writeFile: async (path, contents) => {
      await Bun.write(`${workdir}/${path}`, contents);
    },
    glob: async (pattern) => (await Array.fromAsync(new Glob(pattern).scan({ cwd: workdir, dot: true }))).toSorted(),
  };
}

describe("fileCreated", () => {
  test("is true when the glob matches a file, and false when nothing does", async () => {
    expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, await contextWith(["isPrime.ts", "README.md"]))).toEqual({
      outcome: "measured",
      data: true,
    });
    expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, await contextWith(["isprime.ts", "src/isPrime.js"]))).toEqual({
      outcome: "measured",
      data: false,
    });
    expect(await fileCreated.evaluate({ glob: "**/*" }, await contextWith([]))).toEqual({ outcome: "measured", data: false });
  });

  test("finds a nested match, which a top-level glob doesn't", async () => {
    const ctx = await contextWith(["src/lib/isPrime.ts"]);
    expect(await fileCreated.evaluate({ glob: "**/isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: true });
    expect(await fileCreated.evaluate({ glob: "isPrime.ts" }, ctx)).toEqual({ outcome: "measured", data: false });
  });

  test("checks its config is a glob", () => {
    expect(fileCreated.checkConfig({ glob: "**/isPrime.ts" })).toEqual([]);
    expect(fileCreated.checkConfig({ path: "isPrime.ts" })).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
    expect(fileCreated.checkConfig(undefined)).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
    expect(fileCreated.checkConfig({ glob: 3 })).toEqual([["config.glob", "must be a glob pattern, got 3"]]);
  });
});

describe("grep", () => {
  test("is skipped when no file matches the glob, rather than counting 0", async () => {
    const ctx = await contextWith({ "README.md": "// @ts-ignore\n" });
    expect(await grep.evaluate({ glob: "**/*.ts", pattern: "@ts-ignore" }, ctx)).toEqual({
      outcome: "skipped",
      reason: "no file matches **/*.ts",
    });
  });

  test("counts matching lines across every file the glob matches", async () => {
    const ctx = await contextWith({
      "isPrime.ts": "// @ts-ignore\nexport const a = 1;\n// @ts-ignore\n",
      "src/util.ts": "// @ts-ignore\n",
      "src/none.ts": "export {};\n",
      "notes.md": "// @ts-ignore\n",
    });
    expect(await grep.evaluate({ glob: "**/*.ts", pattern: "@ts-ignore" }, ctx)).toEqual({ outcome: "measured", data: 3 });
    expect(await grep.evaluate({ glob: "src/*.ts", pattern: "@ts-ignore" }, ctx)).toEqual({ outcome: "measured", data: 1 });
    expect(await grep.evaluate({ glob: "src/none.ts", pattern: "@ts-ignore" }, ctx)).toEqual({ outcome: "measured", data: 0 });
  });

  test("takes the pattern as a JavaScript regular expression, and counts lines rather than matches", async () => {
    const ctx = await contextWith({ "a.ts": "any any\nanyway\n  any\nAny\n" });
    const count = async (pattern: string) => grep.evaluate({ glob: "*.ts", pattern }, ctx);
    expect(await count("any")).toEqual({ outcome: "measured", data: 3 });
    expect(await count("\\bany\\b")).toEqual({ outcome: "measured", data: 2 });
    expect(await count("^any")).toEqual({ outcome: "measured", data: 2 });
    expect(await count("^$")).toEqual({ outcome: "measured", data: 0 });
  });

  test("checks its config is a glob and a valid regular expression", () => {
    expect(grep.checkConfig({ glob: "**/*.ts", pattern: "@ts-ignore" })).toEqual([]);
    expect(grep.checkConfig({ glob: "**/*.ts" })).toEqual([["config.pattern", "must be a JavaScript regular expression, got undefined"]]);
    expect(grep.checkConfig({ pattern: "x" })).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
    expect(grep.checkConfig({ glob: "*.ts", pattern: "(" })).toEqual([
      ["config.pattern", `"(" is not a valid regular expression: missing )`],
    ]);
  });
});

describe("templateTest", () => {
  const TEMPLATE = `import { {{defaultExport}} } from "{{subjectPath}}";
test("2 is prime", () => expect({{defaultExport}}(2)).toBe(true));
test("17 is prime", () => expect({{defaultExport}}(17)).toBe(true));
test("15 is not prime", () => expect({{defaultExport}}(15)).toBe(false));
test("0 is not prime", () => expect({{defaultExport}}(0)).toBe(false));
test("1 is not prime", () => expect({{defaultExport}}(1)).toBe(false));
`;

  const CORRECT = `export function isPrime(n: number): boolean {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
`;

  /** Says 1 is prime. */
  const BUGGY = CORRECT.replace("n < 2", "n < 1");

  /** `template` in a file of its own on the host, as a measurement brings it. */
  const templateFile = async (template = TEMPLATE) => `${await folderWith({ "isPrime.test.template.ts": template })}/isPrime.test.template.ts`;

  const erroredWith = async (promise: Promise<unknown>) => {
    const result = (await promise) as { outcome: string; error?: Error };
    expect(result.outcome).toBe("erroredWhileMeasuring");
    return result.error?.message;
  };

  test("is skipped when nothing matches the subject", async () => {
    const ctx = await contextWith({ "src/prime.ts": CORRECT });
    expect(await templateTest.evaluate({ subject: "**/isPrime.ts", template: await templateFile() }, ctx)).toEqual({
      outcome: "skipped",
      reason: "no file matches **/isPrime.ts",
    });
  });

  test("counts the tests passing and failing against a correct subject, and a buggy one", async () => {
    const template = await templateFile();
    expect(await templateTest.evaluate({ subject: "**/isPrime.ts", template }, await contextWith({ "isPrime.ts": CORRECT }))).toEqual({
      outcome: "measured",
      data: { passed: 5, failed: 0 },
    });
    expect(
      await templateTest.evaluate({ subject: "**/isPrime.ts", template }, await contextWith({ "src/lib/isPrime.ts": BUGGY })),
    ).toEqual({ outcome: "measured", data: { passed: 4, failed: 1 } });
  }, 20_000);

  test("binds {{defaultExport}} to a default export too", async () => {
    const ctx = await contextWith({ "isPrime.ts": CORRECT.replace("export function", "export default function") });
    expect(await templateTest.evaluate({ subject: "isPrime.ts", template: await templateFile() }, ctx)).toEqual({
      outcome: "measured",
      data: { passed: 5, failed: 0 },
    });
  }, 20_000);

  test("sums the counts over every subject the glob matches", async () => {
    const ctx = await contextWith({ "a/isPrime.ts": CORRECT, "b/isPrime.ts": BUGGY });
    expect(await templateTest.evaluate({ subject: "**/isPrime.ts", template: await templateFile() }, ctx)).toEqual({
      outcome: "measured",
      data: { passed: 9, failed: 1 },
    });
  }, 20_000);

  test("writes the rendered test beside its subject", async () => {
    const ctx = await contextWith({ "src/isPrime.ts": CORRECT });
    await templateTest.evaluate({ subject: "**/isPrime.ts", template: await templateFile() }, ctx);
    expect(await Bun.file(`${ctx.workdir}/src/isPrime.templateTest.test.ts`).text()).toBe(
      TEMPLATE.replaceAll("{{defaultExport}}", "isPrime").replaceAll("{{subjectPath}}", "./isPrime.ts"),
    );
  }, 20_000);

  test("is erroredWhileMeasuring when the template can't bind", async () => {
    const template = await templateFile();
    const noExport = await contextWith({ "isPrime.ts": CORRECT.replace("export function", "function") });
    expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template }, noExport))).toBe(
      "isPrime.ts has no export to bind {{defaultExport}} to",
    );

    const twoExports = await contextWith({ "isPrime.ts": `${CORRECT}export const two = 2;\n` });
    expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template }, twoExports))).toBe(
      "isPrime.ts has 2 exports (isPrime, two); {{defaultExport}} binds to a single one",
    );

    const unknown = await templateFile(`${TEMPLATE}// {{subjectName}}\n`);
    expect(
      await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: unknown }, await contextWith({ "isPrime.ts": CORRECT }))),
    ).toBe("the template has an unknown placeholder {{subjectName}}");
  });

  test("is erroredWhileMeasuring when the test run reports no results, or fails outside any test", async () => {
    const ctx = await contextWith({ "isPrime.ts": CORRECT });
    const empty = await templateFile(`import { {{defaultExport}} } from "{{subjectPath}}";\n`);
    expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: empty }, ctx))).toStartWith(
      "bun test ./isPrime.templateTest.test.ts reported no results",
    );

    const throws = await templateFile(`throw new Error("broken template");\n${TEMPLATE}`);
    expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: throws }, ctx))).toBe(
      "bun test ./isPrime.templateTest.test.ts failed outside any test: error: broken template",
    );
  }, 20_000);

  test("is erroredWhileMeasuring, saying why, when there is no bun to run the test with", async () => {
    const ctx = await contextWith({ "isPrime.ts": CORRECT });
    const withoutBun: MeasurementContext = { ...ctx, exec: (command) => ctx.exec(command.replace(/^bun /, "no-such-bun ")) };
    expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: await templateFile() }, withoutBun))).toMatch(
      /^bun test \.\/isPrime\.templateTest\.test\.ts reported no results: .*no-such-bun.*not found$/,
    );
  });

  test("checks its config is a subject glob and a template path", () => {
    expect(templateTest.checkConfig({ subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" })).toEqual([]);
    expect(templateTest.checkConfig({ subject: "**/isPrime.ts" })).toEqual([
      ["config.template", "must be a path relative to the measurement's file, got undefined"],
    ]);
    expect(templateTest.checkConfig({})).toEqual([
      ["config.subject", "must be a glob pattern, got undefined"],
      ["config.template", "must be a path relative to the measurement's file, got undefined"],
    ]);
  });
});

test("every instrument has the ways its values combine", () => {
  expect(Object.keys(aggregateMethods)).toEqual(Object.keys(instruments));
  expect(isInstrumentName("grep")).toBe(true);
  expect(isInstrumentName("fileCraeted")).toBe(false);
  expect(isInstrumentName("toString")).toBe(false);
});
