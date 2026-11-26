// `measure()`: takes a measurement against fixture files, on the host, for a project's own
// `bun test` tests of its measurements. It ships in the package, as `thunderjar/testing`.
import { $, Glob } from "bun";
import type { DeclaredMeasurement, MeasurementContext, Metric, Reply } from "../api/declarations.ts";
import { scoreOf } from "../execution/scoreOf.ts";
import { type Instrument, instruments } from "../instruments/instruments.ts";

export type MeasureOptions = {
  /** Workspace path → fixture file to put there. */
  files?: Record<string, string>;
  /** The agent's reply, for instruments that read it, e.g. `replyMatches`. Default: "". */
  reply?: string;
  /** The skills the agent invoked, for `skillInvoked`. Default: none. */
  skillsInvoked?: string[];
};

export type Measured<Name extends string> = {
  outcome: "measured" | "skipped" | "erroredWhileMeasuring";
  /** The instrument's value, when measured. */
  value?: unknown;
  /** Each metric's score, by name, as `show` and `compare` would read it. */
  metrics: Record<Name, number | boolean | undefined>;
};

/** A MeasurementContext over `dir`: commands run in it with Bun's `$`, files are read from it. */
function contextOver(dir: string, text: string, skills: string[]): MeasurementContext {
  const reply: Reply = { outcome: "collected", text };
  const at = (path: string) => (path.startsWith("/") ? path : `${dir}/${path}`);
  return {
    workdir: dir,
    harnessResult: "",
    reply,
    replies: [reply],
    skillsInvoked: async () => ({ outcome: "collected", skills }),
    async exec(command) {
      const result = await $`sh -c ${command}`.cwd(dir).quiet().nothrow();
      return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode };
    },
    readFile: (path) => Bun.file(at(path)).text(),
    async writeFile(path, contents) {
      await Bun.write(at(path), contents);
    },
    async glob(pattern) {
      return [...new Glob(pattern).scanSync({ cwd: dir, dot: true, onlyFiles: true })].toSorted();
    },
  };
}

/**
 * Takes `measurement` over a temporary workspace holding `options.files`, and scores each of its
 * metrics as a run would. The workspace is removed afterwards. Checks file content only: there is
 * no git state, and no Docker.
 */
export async function measure<Name extends string>(measurement: DeclaredMeasurement<Name>, options: MeasureOptions = {}): Promise<Measured<Name>> {
  const instrument = instruments[measurement.instrument] as Instrument<Record<string, string>, unknown>;
  if (instrument.bundledFiles?.length) {
    throw new Error(
      `measure() doesn't support ${measurement.instrument} yet: its ${instrument.bundledFiles.join(", ")} ${instrument.bundledFiles.length > 1 ? "are files" : "is a file"} relative to the measurement's file, which measure() isn't given`,
    );
  }
  const dir = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-measure-${crypto.randomUUID()}`;
  await $`mkdir -p ${dir}`.quiet();
  try {
    for (const [path, fixture] of Object.entries(options.files ?? {})) {
      const source = Bun.file(fixture);
      if (!(await source.exists())) throw new Error(`fixture ${fixture} for ${path} doesn't exist`);
      await Bun.write(`${dir}/${path}`, source);
    }
    const result = await instrument.evaluate(measurement.config as Record<string, string>, contextOver(dir, options.reply ?? "", options.skillsInvoked ?? []));
    const metrics: Record<string, number | boolean | undefined> = {};
    for (const [name, metric] of Object.entries(measurement.metrics as Record<string, Metric>)) {
      if (result.outcome !== "measured") {
        metrics[name] = undefined;
        continue;
      }
      const scored = scoreOf(measurement.instrument, metric, result.data);
      if ("failed" in scored) throw new Error(`metric ${name}: ${scored.failed}`);
      metrics[name] = "score" in scored ? scored.score : undefined;
    }
    return { outcome: result.outcome, ...(result.outcome === "measured" ? { value: result.data } : {}), metrics } as Measured<Name>;
  } finally {
    await $`rm -rf ${dir}`.quiet();
  }
}
