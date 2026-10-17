// The built-in measuring instruments — spec/060-test-case-parameters.md#measuring-instruments--measurements.
// Each is host-side logic run against a MeasurementContext, so it is unit-testable against a
// directory on disk without a measurement container.

import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import type { AggregateFor, InstrumentName, InstrumentTypes, MeasurementContext, MeasurementResult } from "./declarations.ts";

/**
 * The methods each instrument's values can combine by — AggregateFor, at runtime, for the
 * config loader to check a measurement that the type checker may not have seen.
 */
export const aggregateMethods: { [I in InstrumentName]: readonly AggregateFor<InstrumentTypes[I]["value"]>[] } = {
  fileCreated: ["rate", "count"],
  grep: ["mean", "median", "min", "max", "sum"],
  templateTest: ["sum", "mean"],
};

export interface Instrument<Config, Value> {
  evaluate(config: Config, ctx: MeasurementContext): Promise<MeasurementResult<Value>>;
  /**
   * Problems with a config loaded at runtime, which the type checker may not have seen, as
   * `[field, message]` pairs. Empty if it is fine.
   */
  checkConfig(config: unknown): [field: string, message: string][];
  /**
   * The config keys whose values are files bundled with the measurement, as paths relative to
   * its file. The config loader checks they exist, the content hash covers what they hold, and
   * `evaluate` is given them as absolute host paths.
   */
  bundledFiles?: readonly (keyof Config & string)[];
}

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

const checkPath = (field: string, value: unknown, what: string): [string, string][] =>
  typeof value === "string" && value !== "" ? [] : [[field, `must be ${what}, got ${show(value)}`]];

/**
 * `true` if `glob` matches at least one file under the workdir. Never `skipped`: no match is
 * the answer `false`, not a missing input.
 */
export const fileCreated: Instrument<{ glob: string }, boolean> = {
  async evaluate({ glob }, ctx) {
    return { outcome: "measured", data: (await ctx.glob(glob)).length > 0 };
  },
  checkConfig(config) {
    return checkPath("config.glob", (config as { glob?: unknown } | undefined)?.glob, "a glob pattern");
  },
};

/** A file's lines, without the empty one after a final newline. */
const lines = (text: string) => (text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/));

/**
 * The number of lines matching `pattern`, a JavaScript regex, across every file matching
 * `glob`. Files are read through the context, so it doesn't depend on which `grep` the image
 * has. `skipped` when no file matches, giving the glob as the reason: a run that left no
 * output isn't a count of 0.
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
    const problems = checkPath("config.glob", glob, "a glob pattern");
    if (typeof pattern !== "string") {
      problems.push(["config.pattern", `must be a JavaScript regular expression, got ${show(pattern)}`]);
    } else {
      try {
        new RegExp(pattern);
      } catch (error) {
        problems.push(["config.pattern", `${show(pattern)} is not a valid regular expression: ${(error as Error).message}`]);
      }
    }
    return problems;
  },
};

/** Quotes `text` as one `sh` word. */
const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

const LOADERS: Record<string, "js" | "jsx" | "ts" | "tsx"> = {
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".jsx": "jsx",
  ".tsx": "tsx",
};

/** `stem` as a JavaScript identifier, for binding a default export by the subject's file name. */
const identifier = (stem: string) => {
  const name = stem.replace(/[^\w$]/g, "_");
  return /^[0-9]/.test(name) ? `_${name}` : name || "subject";
};

/** Thrown when a template can't be rendered or run against a subject. */
class CannotBind extends Error {}

/**
 * Writes the template rendered for `subject` beside it, and returns the rendered test's path.
 * `{{defaultExport}}` binds to the subject's single export, default or named; `{{subjectPath}}`
 * is the module to import it from. A default export is re-exported under a name by a binding
 * module beside the subject, so `import { {{defaultExport}} }` works for either.
 */
async function render(template: string, subject: string, ctx: MeasurementContext): Promise<string> {
  const dir = dirname(subject);
  const file = basename(subject);
  const stem = basename(file, extname(file));
  const loader = LOADERS[extname(file)] ?? "ts";

  let exports: string[];
  try {
    exports = new Bun.Transpiler({ loader }).scan(await ctx.readFile(subject)).exports;
  } catch (error) {
    throw new CannotBind(`can't read the exports of ${subject}: ${(error as Error).message}`);
  }
  if (exports.length === 0) throw new CannotBind(`${subject} has no export to bind {{defaultExport}} to`);
  if (exports.length > 1) {
    throw new CannotBind(`${subject} has ${exports.length} exports (${exports.join(", ")}); {{defaultExport}} binds to a single one`);
  }

  let defaultExport = exports[0]!;
  let subjectPath = `./${file}`;
  if (defaultExport === "default") {
    defaultExport = identifier(stem);
    subjectPath = `./${stem}.templateTest.bind.ts`;
    await ctx.writeFile(join(dir, subjectPath), `export { default as ${defaultExport} } from "./${file}";\n`);
  }

  const values: Record<string, string> = { defaultExport, subjectPath };
  const rendered = template.replace(/\{\{\s*(\w+)\s*\}\}/g, (placeholder, name: string) => {
    if (!Object.hasOwn(values, name)) throw new CannotBind(`the template has an unknown placeholder ${placeholder}`);
    return values[name]!;
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
  if (!ran || ran[1] === "0") throw new CannotBind(`bun test ${testPath} reported no results`);
  // An error outside any test, such as an import that doesn't resolve, means the template
  // didn't load: its counts don't measure the subject.
  if (count("errors?") > 0) {
    const error = /^\w*error: .*$/im.exec(output)?.[0];
    throw new CannotBind(`bun test ${testPath} failed outside any test${error ? `: ${error}` : ""}`);
  }
  return { passed: count("pass"), failed: count("fail") };
}

/**
 * Renders `template`, a host path, against each file matching `subject`, writes it beside the
 * subject, and runs it with `bun test`. The value is the pass and fail counts, summed over every
 * match. `skipped` when nothing matches; `erroredWhileMeasuring` when the template can't bind
 * or the test run reports no results.
 */
export const templateTest: Instrument<{ subject: string; template: string }, { passed: number; failed: number }> = {
  async evaluate({ subject, template }, ctx) {
    const subjects = await ctx.glob(subject);
    if (subjects.length === 0) return { outcome: "skipped", reason: `no file matches ${subject}` };
    const source = await readFile(template, "utf8");
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
      ...checkPath("config.subject", subject, "a glob pattern"),
      ...checkPath("config.template", template, "a path relative to the measurement file"),
    ];
  },
  bundledFiles: ["template"],
};

/** Every built-in instrument, by the name a measurement gives as its `instrument`. */
export const instruments: {
  [I in InstrumentName]: Instrument<InstrumentTypes[I]["config"], InstrumentTypes[I]["value"]>;
} = { fileCreated, grep, templateTest };

export const isInstrumentName = (name: unknown): name is InstrumentName =>
  typeof name === "string" && Object.hasOwn(instruments, name);
