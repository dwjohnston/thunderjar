// Loads a task's measurements, `tasks/<task>/measurements/*.ts`, and checks each against its
// instrument. A file whose name has a further dot, such as `isPrime.test.ts`, is a file
// that comes with a measurement, not a measurement.
import { CryptoHasher } from "bun";
import type { InstrumentName, MeasurementDeclaration, Stat } from "../api/declarations.ts";
import { instruments, isInstrumentName, isStat, STATS } from "../instruments/instruments.ts";
import { PARAMETERS, tsFilesIn } from "./folders.ts";
import { existsIn, FOLDER, loadDeclaration, type Problem, problemsError } from "./loader.ts";

/** One of a task's measurements, named by its file: `isPrimeTsExists.ts` is `isPrimeTsExists`. */
export type Measurement = {
  name: string;
  declaration: MeasurementDeclaration;
  /**
   * The declaration's config, with each file its instrument brings, like a `bunTestFile`
   * test, as an absolute path on the host.
   */
  config: Record<string, string>;
  /**
   * Of its instrument, the version of that instrument's value, its config and the files its
   * instrument brings; not of its name or its metrics, which are read from its measures when
   * results are read.
   */
  contentHash: string;
};

const show = (value: unknown) => JSON.stringify(value) ?? String(value);

const sha256 = (data: string | ArrayBuffer) => new CryptoHasher("sha256").update(data).digest("hex");

/** `path`, a `/`-separated path, with its `.` and `..` segments resolved. */
function normalize(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment !== "." && segment !== "") segments.push(segment);
  }
  return `${path.startsWith("/") ? "/" : ""}${segments.join("/")}`;
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Adds a problem for each way `declaration`'s metrics are wrong: none, a leftover `aggregate`, a
 * name that isn't an identifier, an unknown `stat` or `better`, a `score` that isn't a function,
 * or none where the instrument has no default score. Where a metric reads the default score, its
 * `stat` must also combine that kind of score: the type checker's check, for files it hasn't seen.
 */
function checkMetrics(declaration: Record<string, unknown>, instrument: InstrumentName, problem: (field: string, message: string) => void) {
  const { metrics } = declaration;
  if (Object.hasOwn(declaration, "aggregate")) {
    problem("aggregate", `is no longer supported: use metrics, e.g. metrics: { passes: { stat: "rate" } }`);
  }
  if (typeof metrics !== "object" || metrics === null || Array.isArray(metrics)) {
    if (!Object.hasOwn(declaration, "aggregate") || metrics !== undefined) problem("metrics", `must be an object of metrics by name, got ${show(metrics)}`);
    return;
  }
  const entries = Object.entries(metrics);
  if (entries.length === 0) problem("metrics", "must have at least one metric");
  const { defaultScore } = instruments[instrument];
  for (const [name, metric] of entries) {
    const field = `metrics.${name}`;
    if (!IDENTIFIER.test(name)) problem(field, `${show(name)} is not a metric name: use an identifier, e.g. passRate`);
    if (typeof metric !== "object" || metric === null) {
      problem(field, `must be a metric, { stat, score?, better? }, got ${show(metric)}`);
      continue;
    }
    const { stat, score, better } = metric as Record<string, unknown>;
    if (!isStat(stat)) problem(`${field}.stat`, `${show(stat)} is not a statistic. Use one of: ${Object.keys(STATS).join(", ")}`);
    if (better !== undefined && better !== "higher" && better !== "lower") problem(`${field}.better`, `must be "higher" or "lower", got ${show(better)}`);
    if (score !== undefined && typeof score !== "function") problem(`${field}.score`, `must be a function of ${instrument}'s value, got ${show(score)}`);
    if (score === undefined) {
      if (!defaultScore) problem(`${field}.score`, `is required: ${instrument} has no default score`);
      else if (isStat(stat) && STATS[stat] !== defaultScore.kind) {
        const fits = Object.keys(STATS).filter((s) => STATS[s as Stat] === defaultScore.kind);
        problem(`${field}.stat`, `${show(stat)} doesn't combine ${instrument}'s default score, a ${defaultScore.kind}. Use one of: ${fits.join(", ")}, or give the metric a score`);
      }
    }
  }
}

/**
 * Loads and checks every measurement of `task`, sorted by name, adding a problem for each that's
 * wrong, and leaving it out. A task without a `measurements/` folder has none.
 */
export async function checkMeasurements(root: string, task: string, problems: Problem[]): Promise<Measurement[]> {
  const dir = `${PARAMETERS}/tasks/${task}/measurements`;
  const measurements: Measurement[] = [];
  for (const name of (await tsFilesIn(root, dir)).filter((name) => !name.includes("."))) {
    const file = `${dir}/${name}.ts`;
    const problem = (field: string, message: string) => problems.push({ file, field, message });
    const declaration = (await loadDeclaration(root, file, "declareMeasurement", problems)) as Record<string, unknown> | undefined;
    if (!declaration) continue;

    const { instrument, config } = declaration;
    if (!isInstrumentName(instrument)) {
      problem("instrument", `${show(instrument)} is not a known instrument. Known instruments: ${Object.keys(instruments).join(", ")}`);
      continue;
    }
    const before = problems.length;
    const { checkConfig, bundledFiles = [] } = instruments[instrument];
    const configProblems = checkConfig(config);
    for (const [field, message] of configProblems) problem(field, message);

    const fields = { ...(config as Record<string, string>) };
    const files: Record<string, string> = {};
    if (configProblems.length === 0) {
      for (const key of bundledFiles) {
        const path = normalize(`${dir}/${fields[key]}`);
        if (!(await existsIn(root, path))) {
          problem(`config.${key}`, `${show(fields[key])} has no matching ${FOLDER}/${path}`);
          continue;
        }
        fields[key] = `${root}/${path}`;
        files[key] = sha256(await Bun.file(fields[key]).arrayBuffer());
      }
    }

    checkMetrics(declaration, instrument, problem);

    if (problems.length === before) {
      measurements.push({
        name,
        declaration: declaration as MeasurementDeclaration,
        config: fields,
        contentHash: sha256(JSON.stringify({ instrument, version: instruments[instrument].version, config, files })),
      });
    }
  }
  return measurements;
}

/** The measurements of `task`, checked. Throws a ConfigError naming every problem. */
export async function loadMeasurements(root: string, task: string): Promise<Measurement[]> {
  const problems: Problem[] = [];
  const measurements = await checkMeasurements(root, task, problems);
  if (problems.length > 0) throw problemsError(problems);
  return measurements;
}
