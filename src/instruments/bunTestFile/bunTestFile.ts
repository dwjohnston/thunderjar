import type { MeasurementContext } from "../../api/declarations.ts";
import { type Instrument, checkString } from "../instrument.ts";

/** `text` as one `sh` word. */
const shellWord = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

const basename = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * Where in the workdir `bunTestFile` writes the test, and its reports: inside it, so the test
 * resolves the project's own dependencies, but in a folder of its own, so nothing lands beside
 * the agent's files.
 */
const MEASURE_DIR = ".thunderjar-measure";

/** Thrown when the test can't be run against a subject. */
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
 * Runs the test at `testPath`, in the workdir, against `subject` with `bun test`, and returns how
 * many of its tests passed, of how many, from the JUnit report it has Bun write to `reportPath`.
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
    const output = `${stdout}\n${stderr}`;
    // Nor when it ran no tests, and nothing went wrong: that's a total of 0, which a pass rate doesn't apply to.
    if (/^Ran 0 tests /m.test(output) && !/^\s*[1-9]\d* errors?$/m.test(output)) return { passed: 0, total: 0 };
    const said = whatWentWrong(output);
    throw new CannotRun(`${test} didn't run against ${subject}${said ? `: ${said}` : ""}`);
  }
  const testsuites = /<testsuites\b[^>]*>/.exec(report)?.[0] ?? "";
  // Bun counts a skipped or todo test among its tests: it's in the total, but didn't pass.
  const total = countIn(testsuites, "tests");
  const notPassed = countIn(testsuites, "skipped") + countIn(testsuites, "failures") + countIn(testsuites, "errors");
  return { passed: total - notPassed, total };
}

/**
 * Runs `test`, a Bun test file on the host, against each file matching `subject` with
 * `bun test`, so the image must have `bun`. The test is written into the workdir, in
 * `.thunderjar-measure/`, removed once it has run, and finds the subject's absolute path in `THUNDERJAR_SUBJECT`. The value
 * is how many tests passed, of how many, the total counting skipped and failed tests too, summed
 * over every match. `skipped` when nothing matches; `erroredWhileMeasuring` when the test doesn't
 * run, such as when the subject doesn't load. Its default score is the pass rate, and a run of no
 * tests doesn't apply.
 */
export const bunTestFile: Instrument<{ subject: string; test: string }, { passed: number; total: number }> = {
  version: 1,
  defaultScore: { kind: "number", score: ({ passed, total }) => (total === 0 ? undefined : passed / total) },
  async evaluate({ subject, test }, ctx) {
    const subjects = await ctx.glob(subject);
    if (subjects.length === 0) return { outcome: "skipped", reason: `no file matches ${subject}` };
    const testPath = `${MEASURE_DIR}/${basename(test)}`;
    await ctx.writeFile(testPath, await Bun.file(test).text());
    const total = { passed: 0, total: 0 };
    try {
      for (const [i, path] of subjects.entries()) {
        const counts = await runTest(testPath, path, `${MEASURE_DIR}/report-${i + 1}.xml`, ctx);
        total.passed += counts.passed;
        total.total += counts.total;
      }
    } catch (error) {
      if (error instanceof CannotRun) return { outcome: "erroredWhileMeasuring", error };
      throw error;
    } finally {
      // The measurements after it share its container, and mustn't find its test or reports there.
      await ctx.exec(`rm -rf -- ${shellWord(MEASURE_DIR)}`);
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
