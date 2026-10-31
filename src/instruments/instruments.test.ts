import { afterEach, expect, test } from "bun:test";
import { existsSync, listDir, makeDir, makeTempDir, readTextSync } from "../platform/fs.ts";
import { join } from "../platform/path.ts";
import { fileCreated, grep, templateTest } from "./instruments.ts";
import { createHostMeasurementOpener, type OpenedMeasurementContext } from "../testing/measurement-context.ts";

const TAG = "postrun-e01k4x9j2e8mqz3abcdefghjkmn-h4f9a21c8-i00";

const opened: OpenedMeasurementContext[] = [];
afterEach(async () => {
  for (const ctx of opened.splice(0)) await ctx.close();
});

/** The kept workspace of a container run holding `files` (empty ones, if given as a list). */
async function keptWorkspace(files: string[] | Record<string, string>) {
  const rootDir = await makeTempDir("thunderjar-instruments-");
  const workspace = join(rootDir, "01k4x9j2e8mqz3abcdefghjkmn", TAG, "workspace");
  await makeDir(workspace);
  const contents = Array.isArray(files) ? Object.fromEntries(files.map((file) => [file, ""])) : files;
  for (const [file, content] of Object.entries(contents)) {
    await Bun.write(join(workspace, file), content);
  }
  return { rootDir, workspace };
}

/** A kept container run whose workspace holds `files`, and a measurement context over it. */
async function contextWith(files: string[] | Record<string, string>) {
  const { rootDir } = await keptWorkspace(files);
  const ctx = await createHostMeasurementOpener(rootDir).openMeasurementContext(TAG);
  opened.push(ctx);
  return ctx;
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

// --- grep ---

test("grep is skipped when no file matches the glob, rather than counting 0", async () => {
  const ctx = await contextWith({ "README.md": "// @ts-ignore\n" });
  expect(await grep.evaluate({ glob: "**/*.ts", pattern: "@ts-ignore" }, ctx)).toEqual({
    outcome: "skipped",
    reason: "no file matches **/*.ts",
  });
});

test("grep counts matching lines across every file the glob matches", async () => {
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

test("grep honours the pattern as a JavaScript regex, and counts lines rather than matches", async () => {
  const ctx = await contextWith({ "a.ts": "any any\nanyway\n  any\nAny\n" });
  const count = async (pattern: string) => grep.evaluate({ glob: "*.ts", pattern }, ctx);
  expect(await count("any")).toEqual({ outcome: "measured", data: 3 });
  expect(await count("\\bany\\b")).toEqual({ outcome: "measured", data: 2 });
  expect(await count("^any")).toEqual({ outcome: "measured", data: 2 });
  expect(await count("^$")).toEqual({ outcome: "measured", data: 0 });
});

test("grep checks its config is a glob and a valid regex", () => {
  expect(grep.checkConfig({ glob: "**/*.ts", pattern: "@ts-ignore" })).toEqual([]);
  expect(grep.checkConfig({ glob: "**/*.ts" })).toEqual([["config.pattern", "must be a JavaScript regular expression, got undefined"]]);
  expect(grep.checkConfig({ pattern: "x" })).toEqual([["config.glob", "must be a glob pattern, got undefined"]]);
  const [[field, message]] = grep.checkConfig({ glob: "*.ts", pattern: "(" }) as [[string, string]];
  expect(field).toBe("config.pattern");
  expect(message).toStartWith(`"(" is not a valid regular expression: `);
});

// --- templateTest ---

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

/** Reports 1 as prime. */
const BUGGY = CORRECT.replace("n < 2", "n < 1");

/** `template` written to a file of its own on the host, as a measurement bundles it. */
async function templateFile(template = TEMPLATE) {
  const path = join(await makeTempDir("thunderjar-template-"), "isPrime.test.template.ts");
  await Bun.write(path, template);
  return path;
}

test("templateTest is skipped when nothing matches the subject", async () => {
  const ctx = await contextWith({ "src/prime.ts": CORRECT });
  expect(await templateTest.evaluate({ subject: "**/isPrime.ts", template: await templateFile() }, ctx)).toEqual({
    outcome: "skipped",
    reason: "no file matches **/isPrime.ts",
  });
});

test("templateTest counts the passing and failing tests against a correct subject and a buggy one", async () => {
  const template = await templateFile();
  const correct = await contextWith({ "isPrime.ts": CORRECT });
  expect(await templateTest.evaluate({ subject: "**/isPrime.ts", template }, correct)).toEqual({
    outcome: "measured",
    data: { passed: 5, failed: 0 },
  });
  const buggy = await contextWith({ "src/lib/isPrime.ts": BUGGY });
  expect(await templateTest.evaluate({ subject: "**/isPrime.ts", template }, buggy)).toEqual({
    outcome: "measured",
    data: { passed: 4, failed: 1 },
  });
}, 20000);

test("templateTest binds {{defaultExport}} to a default export too", async () => {
  const ctx = await contextWith({ "isPrime.ts": CORRECT.replace("export function", "export default function") });
  expect(await templateTest.evaluate({ subject: "isPrime.ts", template: await templateFile() }, ctx)).toEqual({
    outcome: "measured",
    data: { passed: 5, failed: 0 },
  });
}, 20000);

test("templateTest sums the counts over every subject the glob matches", async () => {
  const ctx = await contextWith({ "a/isPrime.ts": CORRECT, "b/isPrime.ts": BUGGY });
  expect(await templateTest.evaluate({ subject: "**/isPrime.ts", template: await templateFile() }, ctx)).toEqual({
    outcome: "measured",
    data: { passed: 9, failed: 1 },
  });
}, 20000);

const erroredWith = async (promise: Promise<unknown>) => {
  const result = (await promise) as { outcome: string; error?: Error };
  expect(result.outcome).toBe("erroredWhileMeasuring");
  return result.error!.message;
};

test("templateTest is erroredWhileMeasuring when the template can't bind", async () => {
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
  const ctx = await contextWith({ "isPrime.ts": CORRECT });
  expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: unknown }, ctx))).toBe(
    "the template has an unknown placeholder {{subjectName}}",
  );
});

test("templateTest is erroredWhileMeasuring when the test run reports no results, or fails to load", async () => {
  const ctx = await contextWith({ "isPrime.ts": CORRECT });
  const empty = await templateFile(`import { {{defaultExport}} } from "{{subjectPath}}";\n`);
  expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: empty }, ctx))).toBe(
    "bun test isPrime.templateTest.test.ts reported no results",
  );

  const throws = await templateFile(`throw new Error("broken template");\n${TEMPLATE}`);
  expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: throws }, ctx))).toBe(
    "bun test isPrime.templateTest.test.ts failed outside any test: error: broken template",
  );

  const misnamed = await templateFile(TEMPLATE.replaceAll("{{defaultExport}}", "isPrim"));
  expect(await erroredWith(templateTest.evaluate({ subject: "isPrime.ts", template: misnamed }, ctx))).toContain(
    "bun test isPrime.templateTest.test.ts failed outside any test: SyntaxError: Export named 'isPrim' not found",
  );
}, 20000);

test("templateTest leaves the kept workspace as it was", async () => {
  const files = { "isPrime.ts": BUGGY, "src/isPrime.ts": CORRECT.replace("export function", "export default function") };
  const { rootDir, workspace } = await keptWorkspace(files);
  const ctx = await createHostMeasurementOpener(rootDir).openMeasurementContext(TAG);
  const result = await templateTest.evaluate({ subject: "**/isPrime.ts", template: await templateFile() }, ctx);
  expect(result).toEqual({ outcome: "measured", data: { passed: 9, failed: 1 } });

  // The rendered tests are in the context's scratch copy, and gone once it is closed.
  expect(listDir(ctx.workdir).toSorted()).toEqual(["isPrime.templateTest.test.ts", "isPrime.ts", "src"]);
  await ctx.close();
  expect(existsSync(ctx.workdir)).toBe(false);
  expect(listDir(workspace, { recursive: true }).toSorted()).toEqual(["isPrime.ts", "src", "src/isPrime.ts"]);
  for (const [file, content] of Object.entries(files)) expect(readTextSync(join(workspace, file))).toBe(content);
}, 20000);

test("templateTest checks its config is a subject glob and a template path", () => {
  expect(templateTest.checkConfig({ subject: "**/isPrime.ts", template: "./isPrime.test.template.ts" })).toEqual([]);
  expect(templateTest.checkConfig({ subject: "**/isPrime.ts" })).toEqual([
    ["config.template", "must be a path relative to the measurement file, got undefined"],
  ]);
  expect(templateTest.checkConfig(undefined)).toEqual([
    ["config.subject", "must be a glob pattern, got undefined"],
    ["config.template", "must be a path relative to the measurement file, got undefined"],
  ]);
  expect(templateTest.bundledFiles).toEqual(["template"]);
});
