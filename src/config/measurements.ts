// Loads a task's measurements, `tasks/<task>/measurements/*.ts`, and checks each against its
// instrument. A file whose name has a further dot, such as `isPrime.test.template.ts`, is a file
// that comes with a measurement, not a measurement.
import { CryptoHasher } from "bun";
import type { MeasurementDeclaration } from "../api/declarations.ts";
import { aggregateMethods, instruments, isInstrumentName } from "../instruments/instruments.ts";
import { PARAMETERS, tsFilesIn } from "./folders.ts";
import { existsIn, FOLDER, loadDeclaration, type Problem, problemsError } from "./loader.ts";

/** One of a task's measurements, named by its file: `isPrimeTsExists.ts` is `isPrimeTsExists`. */
export type Measurement = {
  name: string;
  declaration: MeasurementDeclaration;
  /**
   * The declaration's config, with each file its instrument brings, like a `templateTest`
   * template, as an absolute path on the host.
   */
  config: Record<string, string>;
  /** Of its instrument, config and the files its instrument brings; not of its name or aggregate. */
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

    const { instrument, config, aggregate } = declaration;
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

    if (!Array.isArray(aggregate)) {
      problem("aggregate", `must be an array of aggregation methods, got ${show(aggregate)}`);
    } else {
      const methods: readonly unknown[] = aggregateMethods[instrument];
      for (const method of aggregate.filter((method) => !methods.includes(method))) {
        problem("aggregate", `${show(method)} is not a way ${instrument}'s values combine. Use one of: ${methods.join(", ")}`);
      }
    }

    if (problems.length === before) {
      measurements.push({
        name,
        declaration: declaration as MeasurementDeclaration,
        config: fields,
        contentHash: sha256(JSON.stringify({ instrument, config, files })),
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
