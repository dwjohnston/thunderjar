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
  /**
   * False for an instrument that only reads what was recorded of the run, like its reply, so no
   * measurement container is started for it.
   */
  usesContainer?: false;
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
    return [...checkString("config.glob", glob, "a glob pattern"), ...checkPattern(pattern)];
  },
};

/** Why `pattern` isn't a JavaScript regular expression, as a config problem, if it isn't one. */
function checkPattern(pattern: unknown): [string, string][] {
  if (typeof pattern !== "string") return [["config.pattern", `must be a JavaScript regular expression, got ${show(pattern)}`]];
  try {
    new RegExp(pattern);
    return [];
  } catch (error) {
    const reason = (error as Error).message.replace(/^Invalid regular expression: /, "");
    return [["config.pattern", `${show(pattern)} is not a valid regular expression: ${reason}`]];
  }
}

/**
 * Whether the agent's reply, from its harness's `collectReply`, matches `pattern`: its reply to
 * `turn`, counting from 1, or by default its last. `skipped`, saying why, when the run has no
 * reply to that turn.
 */
export const replyMatches: Instrument<{ pattern: string; turn?: number }, boolean> = {
  async evaluate({ pattern, turn }, ctx) {
    const reply = turn === undefined ? ctx.reply : ctx.replies[turn - 1];
    if (!reply) return { outcome: "skipped", reason: `no turn ${turn}: the initial prompt has ${ctx.replies.length}` };
    if (reply.outcome !== "collected") return { outcome: "skipped", reason: `no reply: ${reply.reason}` };
    return { outcome: "measured", data: new RegExp(pattern).test(reply.text) };
  },
  checkConfig(config) {
    const { pattern, turn } = (config ?? {}) as { pattern?: unknown; turn?: unknown };
    const problems = checkPattern(pattern);
    if (turn !== undefined && (typeof turn !== "number" || !Number.isInteger(turn) || turn < 1)) {
      problems.push(["config.turn", `must be a turn, counting from 1, got ${show(turn)}`]);
    }
    return problems;
  },
  usesContainer: false,
};

/** `text` as one `sh` word. */
const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * Where in the workdir `bunTestFile` writes the test, and its reports: inside it, so the test
 * resolves the project's own dependencies, but in a folder of its own, so nothing lands beside
 * the agent's files.
 */
const MEASURE_DIR = ".thunderjar-measure";

/** Thrown when the test can't be run against a subject, or reports nothing to count. */
class CannotRun extends Error {}

/** The value of the attribute `name` in `tag`, an XML start tag, as a count, or 0 if it has none. */
const countIn = (tag: string, name: string) => Number(new RegExp(`\\s${name}="(\\d+)"`).exec(tag)?.[1] ?? "0");

/**
 * The line of `output` that says what went wrong: Bun's first `error: …` line if it printed one,
 * or else its last line.
 */
const whatWentWrong = (output: string) => {
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.find((line) => /^\w*error: /i.test(line)) ?? lines.at(-1);
};

/**
 * Runs the test at `testPath`, in the workdir, against `subject` with `bun test`, and returns its
 * pass and fail counts, from the JUnit report it has Bun write to `reportPath`.
 */
async function runTest(testPath: string, subject: string, reportPath: string, ctx: MeasurementContext) {
  const test = basename(testPath);
  // `bun test` exits 1 when a test fails: the report, not its exit code, says how many did.
  const { stdout, stderr } = await ctx.exec(
    [
      `rm -f -- ${shellWord(reportPath)};`,
      `THUNDERJAR_SUBJECT=${shellWord(`${ctx.workdir}/${subject}`)}`,
      `bun test ${shellWord(`./${testPath}`)} --reporter=junit ${shellWord(`--reporter-outfile=${reportPath}`)}`,
    ].join(" "),
  );

  // Bun writes no report when the test errors outside any test, as it does when the subject doesn't load.
  let report: string;
  try {
    report = await ctx.readFile(reportPath);
  } catch {
    const said = whatWentWrong(`${stdout}\n${stderr}`);
    throw new CannotRun(`${test} didn't run against ${subject}${said ? `: ${said}` : ""}`);
  }
  const testsuites = /<testsuites\b[^>]*>/.exec(report)?.[0] ?? "";
  // Bun counts a skipped or todo test among its tests: it neither passed nor failed.
  const ran = countIn(testsuites, "tests") - countIn(testsuites, "skipped");
  const failed = countIn(testsuites, "failures") + countIn(testsuites, "errors");
  if (ran <= 0) throw new CannotRun(`${test} ran no tests against ${subject}`);
  return { passed: ran - failed, failed };
}

/**
 * Runs `test`, a Bun test file on the host, against each file matching `subject` with
 * `bun test`, so the image must have `bun`. The test is written into the workdir, in
 * `.thunderjar-measure/`, and finds the subject's absolute path in `THUNDERJAR_SUBJECT`. The value
 * is the pass and fail counts, summed over every match. `skipped` when nothing matches;
 * `erroredWhileMeasuring` when the test doesn't run, such as when the subject doesn't load, or runs
 * no tests.
 */
export const bunTestFile: Instrument<{ subject: string; test: string }, { passed: number; failed: number }> = {
  async evaluate({ subject, test }, ctx) {
    const subjects = await ctx.glob(subject);
    if (subjects.length === 0) return { outcome: "skipped", reason: `no file matches ${subject}` };
    const testPath = `${MEASURE_DIR}/${basename(test)}`;
    await ctx.writeFile(testPath, await Bun.file(test).text());
    const total = { passed: 0, failed: 0 };
    try {
      for (const [i, path] of subjects.entries()) {
        const { passed, failed } = await runTest(testPath, path, `${MEASURE_DIR}/report-${i + 1}.xml`, ctx);
        total.passed += passed;
        total.failed += failed;
      }
    } catch (error) {
      if (error instanceof CannotRun) return { outcome: "erroredWhileMeasuring", error };
      throw error;
    }
    return { outcome: "measured", data: total };
  },
  checkConfig(config) {
    const { subject, test } = (config ?? {}) as { subject?: unknown; test?: unknown };
    return [
      ...checkString("config.subject", subject, "a glob pattern"),
      ...checkString("config.test", test, "a path relative to the measurement's file"),
    ];
  },
  bundledFiles: ["test"],
};

/** Every built-in instrument, by the name a measurement gives as its `instrument`. */
export const instruments: {
  [I in InstrumentName]: Instrument<InstrumentTypes[I]["config"], InstrumentTypes[I]["value"]>;
} = { fileCreated, grep, bunTestFile, replyMatches };

/** The ways each instrument's values can combine: AggregateFor, at runtime, to check a measurement with. */
export const aggregateMethods: { [I in InstrumentName]: readonly AggregateFor<InstrumentTypes[I]["value"]>[] } = {
  fileCreated: ["rate", "count"],
  grep: ["mean", "median", "min", "max", "sum"],
  bunTestFile: ["sum", "mean"],
  replyMatches: ["rate", "count"],
};

export const isInstrumentName = (name: unknown): name is InstrumentName => typeof name === "string" && Object.hasOwn(instruments, name);
