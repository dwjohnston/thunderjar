// The built-in measuring instruments. Each one's logic runs on the host, against a
// MeasurementContext, which does the work inside the measurement container; so each is
// unit-testable against a fake context over a folder.
import type { AggregateFor, InstrumentName, InstrumentTypes, MeasurementContext, MeasurementResult } from "../api/declarations.ts";

export type Instrument<Config, Value> = {
  evaluate(config: Config, ctx: MeasurementContext): Promise<MeasurementResult<Value>>;
  /**
   * The problems with a config loaded at runtime, which the type checker may not have seen, as
   * `[field, message]` pairs. Empty if it is fine.
   */
  checkConfig(config: unknown): [field: string, message: string][];
  /**
   * The config fields whose values are files that come with the measurement, as paths relative
   * to its file. The config loader checks they exist, the measurement's content hash covers what
   * they hold, and `evaluate` is given them as absolute paths on the host.
   */
  bundledFiles?: readonly (keyof Config & string)[];
};

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

const checkString = (field: string, value: unknown, what: string): [string, string][] =>
  typeof value === "string" && value !== "" ? [] : [[field, `must be ${what}, got ${show(value)}`]];

/** `true` if `glob` matches a file. Never `skipped`: no match is the answer `false`. */
export const fileCreated: Instrument<{ glob: string }, boolean> = {
  async evaluate({ glob }, ctx) {
    return { outcome: "measured", data: (await ctx.glob(glob)).length > 0 };
  },
  checkConfig(config) {
    return checkString("config.glob", (config as { glob?: unknown } | undefined)?.glob, "a glob pattern");
  },
};

/** A file's lines, without the empty one after a final newline. */
const lines = (text: string) => (text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/));

/**
 * The number of lines matching `pattern` across every file matching `glob`. The files are read
 * through the context, so it doesn't depend on the image having a `grep`. `skipped` when no file
 * matches: a run that left nothing to search isn't a count of 0.
 */
export const grep: Instrument<{ glob: string; pattern: string }, number> = {
  async evaluate({ glob, pattern }, ctx) {
    const files = await ctx.glob(glob);
    if (files.length === 0) return { outcome: "skipped", reason: `no file matches ${glob}` };
    const regex = new RegExp(pattern);
    let count = 0;
    for (const file of files) {
      for (const line of lines(await ctx.readFile(file))) if (regex.test(line)) count++;
    }
    return { outcome: "measured", data: count };
  },
  checkConfig(config) {
    const { glob, pattern } = (config ?? {}) as { glob?: unknown; pattern?: unknown };
    const problems = checkString("config.glob", glob, "a glob pattern");
    if (typeof pattern !== "string") {
      problems.push(["config.pattern", `must be a JavaScript regular expression, got ${show(pattern)}`]);
    } else {
      try {
        new RegExp(pattern);
      } catch (error) {
        const reason = (error as Error).message.replace(/^Invalid regular expression: /, "");
        problems.push(["config.pattern", `${show(pattern)} is not a valid regular expression: ${reason}`]);
      }
    }
    return problems;
  },
};

/** `text` as one `sh` word. */
const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

const dirname = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".");
const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const extname = (file: string) => (file.lastIndexOf(".") > 0 ? file.slice(file.lastIndexOf(".")) : "");
const join = (dir: string, file: string) => (dir === "." ? file : `${dir}/${file}`);

const LOADERS: Record<string, "js" | "jsx" | "ts" | "tsx"> = { ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "jsx", ".tsx": "tsx" };

/** `stem` as a JavaScript identifier, to bind a default export to by its file's name. */
const identifier = (stem: string) => {
  const name = stem.replace(/[^\w$]/g, "_");
  return /^[0-9]/.test(name) ? `_${name}` : name || "subject";
};

/** Thrown when a template can't be rendered against, or run against, a subject. */
class CannotBind extends Error {}

/**
 * Writes the template rendered for `subject` beside it, and returns the rendered test's path.
 * `{{defaultExport}}` is the subject's single export, default or named, and `{{subjectPath}}` the
 * module to import it from. A default export is re-exported by name from a module beside the
 * subject, so `import { {{defaultExport}} } from "{{subjectPath}}"` works for either.
 */
async function render(template: string, subject: string, ctx: MeasurementContext): Promise<string> {
  const dir = dirname(subject);
  const file = basename(subject);
  const stem = file.slice(0, file.length - extname(file).length);

  let exports: string[];
  try {
    exports = new Bun.Transpiler({ loader: LOADERS[extname(file)] ?? "ts" }).scan(await ctx.readFile(subject)).exports;
  } catch (error) {
    throw new CannotBind(`can't read the exports of ${subject}: ${(error as Error).message}`);
  }
  if (exports.length === 0) throw new CannotBind(`${subject} has no export to bind {{defaultExport}} to`);
  if (exports.length > 1) {
    throw new CannotBind(`${subject} has ${exports.length} exports (${exports.join(", ")}); {{defaultExport}} binds to a single one`);
  }

  let defaultExport = exports[0] as string;
  let subjectPath = `./${file}`;
  if (defaultExport === "default") {
    defaultExport = identifier(stem);
    const binding = `${stem}.templateTest.bind.ts`;
    subjectPath = `./${binding}`;
    await ctx.writeFile(join(dir, binding), `export { default as ${defaultExport} } from "./${file}";\n`);
  }

  const values: Record<string, string> = { defaultExport, subjectPath };
  const rendered = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) => {
    if (!Object.hasOwn(values, name)) throw new CannotBind(`the template has an unknown placeholder ${placeholder}`);
    return values[name] as string;
  });
  const testPath = join(dir, `${stem}.templateTest.test.ts`);
  await ctx.writeFile(testPath, rendered);
  return testPath;
}

/** The pass and fail counts `bun test` reports for one rendered test. */
async function runTest(testPath: string, ctx: MeasurementContext) {
  const { stdout, stderr } = await ctx.exec(`bun test ${shellWord(`./${testPath}`)}`);
  const output = `${stdout}\n${stderr}`;
  const count = (label: string) => Number(new RegExp(`^\\s*(\\d+) ${label}$`, "m").exec(output)?.[1] ?? "0");

  const ran = /^Ran (\d+) tests? /m.exec(output);
  if (!ran || ran[1] === "0") {
    const said = output.trim().split("\n").at(-1);
    throw new CannotBind(`bun test ./${testPath} reported no results${said ? `: ${said}` : ""}`);
  }
  // An error outside any test, such as an import that doesn't resolve, means the template didn't
  // load: its counts don't measure the subject.
  if (count("errors?") > 0) {
    const error = /^\w*error: .*$/im.exec(output)?.[0];
    throw new CannotBind(`bun test ./${testPath} failed outside any test${error ? `: ${error}` : ""}`);
  }
  return { passed: count("pass"), failed: count("fail") };
}

/**
 * Renders `template`, a path on the host, against each file matching `subject`, writes it beside
 * the subject, and runs it with `bun test`, so the image must have `bun`. The value is the pass
 * and fail counts, summed over every match. `skipped` when nothing matches; `erroredWhileMeasuring`
 * when the template can't bind, or the test run reports no results.
 */
export const templateTest: Instrument<{ subject: string; template: string }, { passed: number; failed: number }> = {
  async evaluate({ subject, template }, ctx) {
    const subjects = await ctx.glob(subject);
    if (subjects.length === 0) return { outcome: "skipped", reason: `no file matches ${subject}` };
    const source = await Bun.file(template).text();
    const total = { passed: 0, failed: 0 };
    try {
      for (const path of subjects) {
        const { passed, failed } = await runTest(await render(source, path, ctx), ctx);
        total.passed += passed;
        total.failed += failed;
      }
    } catch (error) {
      if (error instanceof CannotBind) return { outcome: "erroredWhileMeasuring", error };
      throw error;
    }
    return { outcome: "measured", data: total };
  },
  checkConfig(config) {
    const { subject, template } = (config ?? {}) as { subject?: unknown; template?: unknown };
    return [
      ...checkString("config.subject", subject, "a glob pattern"),
      ...checkString("config.template", template, "a path relative to the measurement's file"),
    ];
  },
  bundledFiles: ["template"],
};

/** Every built-in instrument, by the name a measurement gives as its `instrument`. */
export const instruments: {
  [I in InstrumentName]: Instrument<InstrumentTypes[I]["config"], InstrumentTypes[I]["value"]>;
} = { fileCreated, grep, templateTest };

/** The ways each instrument's values can combine: AggregateFor, at runtime, to check a measurement with. */
export const aggregateMethods: { [I in InstrumentName]: readonly AggregateFor<InstrumentTypes[I]["value"]>[] } = {
  fileCreated: ["rate", "count"],
  grep: ["mean", "median", "min", "max", "sum"],
  templateTest: ["sum", "mean"],
};

export const isInstrumentName = (name: unknown): name is InstrumentName => typeof name === "string" && Object.hasOwn(instruments, name);
