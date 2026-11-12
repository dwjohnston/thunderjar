import { describe, expect, test } from "bun:test";
import type { MeasurementDeclaration } from "../api/declarations.ts";
import type { Measurement } from "../config/measurements.ts";
import { measureContainerRun } from "./measure.ts";
import type { OpenedMeasurementContext } from "./measurementContext.ts";

const measurement = (name: string, declaration: MeasurementDeclaration): Measurement => ({
  name,
  declaration,
  config: declaration.config as Record<string, string>,
  contentHash: `hash-of-${name}`,
});

const EXISTS = measurement("exists", { instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, aggregate: ["rate"] });
const IGNORES = measurement("ignores", { instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" }, aggregate: ["max"] });
const SAYS_ELI = measurement("saysEli", { instrument: "replyMatches", config: { pattern: "Eli" }, aggregate: ["rate"] });

/** An opener of contexts over `files`, each recording what was done with it in `log`. */
function opener(files: Record<string, string>, log: string[]) {
  let opened = 0;
  return async (): Promise<OpenedMeasurementContext> => {
    const n = ++opened;
    log.push(`open ${n}`);
    const written: Record<string, string> = {};
    return {
      workdir: "/workspace",
      harnessResult: "",
      reply: { outcome: "unavailable", reason: "its harness has no collectReply" },
      replies: [{ outcome: "unavailable", reason: "its harness has no collectReply" }],
      exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
      readFile: async (path) => {
        const text = written[path] ?? files[path];
        if (text === undefined) throw new Error(`no ${path}`);
        return text;
      },
      writeFile: async (path, contents) => {
        written[path] = contents;
      },
      glob: async (pattern) => Object.keys({ ...files, ...written }).filter((path) => new Bun.Glob(pattern).match(path)).toSorted(),
      close: async () => {
        log.push(`close ${n}`);
      },
    };
  };
}

const NOW = new Date("2026-11-01T02:30:00.000Z");

describe("measureContainerRun", () => {
  test("takes each measurement in a context of its own, closed once it's taken, and records each measure", async () => {
    const log: string[] = [];

    const result = await measureContainerRun([EXISTS, IGNORES], opener({ "isPrime.ts": "// @ts-ignore\n" }, log), () => NOW);

    expect(log).toEqual(["open 1", "close 1", "open 2", "close 2"]);
    expect(result).toEqual({
      exists: {
        instrument: "fileCreated",
        contentHash: "hash-of-exists",
        measuredAt: "2026-11-01T02:30:00.000Z",
        outcome: { outcome: "measured", data: true },
      },
      ignores: {
        instrument: "grep",
        contentHash: "hash-of-ignores",
        measuredAt: "2026-11-01T02:30:00.000Z",
        outcome: { outcome: "measured", data: 1 },
      },
    });
  });

  test("with a concurrency above 1, contexts are open at once, each still its own, and the measures keep their declared order", async () => {
    const log: string[] = [];

    const result = await measureContainerRun([EXISTS, IGNORES, SAYS_ELI], opener({ "isPrime.ts": "// @ts-ignore\n" }, log), () => NOW, 2);

    // The second opens before the first closes; the third waits for one of them.
    expect(log.slice(0, 2)).toEqual(["open 1", "open 2"]);
    expect(log.indexOf("open 3")).toBeGreaterThan(Math.min(log.indexOf("close 1"), log.indexOf("close 2")));
    expect(log.toSorted()).toEqual(["close 1", "close 2", "close 3", "open 1", "open 2", "open 3"]);
    expect(Object.keys(result)).toEqual(["exists", "ignores", "saysEli"]);
    expect(result.exists?.outcome).toEqual({ outcome: "measured", data: true });
    expect(result.ignores?.outcome).toEqual({ outcome: "measured", data: 1 });
  });

  test("an instrument that throws gives its measure erroredWhileMeasuring, by message, and the rest are still taken", async () => {
    const log: string[] = [];
    const open = opener({ "isPrime.ts": "export {};\n" }, log);
    const failing = async () => ({ ...(await open()), readFile: async () => Promise.reject(new Error("the container went away")) });

    const result = await measureContainerRun([IGNORES, EXISTS], failing, () => NOW);

    expect(result.ignores?.outcome).toEqual({ outcome: "erroredWhileMeasuring", error: { message: "the container went away" } });
    expect(result.exists?.outcome).toEqual({ outcome: "measured", data: true });
    expect(log).toEqual(["open 1", "close 1", "open 2", "close 2"]);
  });

  test("an instrument's own erroredWhileMeasuring is recorded by its message", async () => {
    const templateTest = measurement("tests", {
      instrument: "templateTest",
      config: { subject: "isPrime.ts", template: "./isPrime.test.template.ts" },
      aggregate: ["sum"],
    });
    const template = `${import.meta.dir}/measure.test.ts`;

    const result = await measureContainerRun(
      [{ ...templateTest, config: { ...templateTest.config, template } }],
      opener({ "isPrime.ts": "const notExported = 1;\n" }, []),
      () => NOW,
    );

    expect(result.tests?.outcome).toEqual({
      outcome: "erroredWhileMeasuring",
      error: { message: "isPrime.ts has no export to bind {{defaultExport}} to" },
    });
  });

  test("each context is opened with whether its instrument uses a container: a reply's doesn't", async () => {
    const asked: boolean[] = [];
    const open = opener({ "isPrime.ts": "" }, []);

    await measureContainerRun([EXISTS, SAYS_ELI], async (usesContainer) => {
      asked.push(usesContainer);
      return open();
    });

    expect(asked).toEqual([true, false]);
  });

  test("with no measurements, nothing is opened", async () => {
    const log: string[] = [];
    expect(await measureContainerRun([], opener({}, log))).toEqual({});
    expect(log).toEqual([]);
  });
});
