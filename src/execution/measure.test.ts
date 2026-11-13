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

const EXISTS = measurement("exists", { instrument: "fileCreated", config: { glob: "**/isPrime.ts" }, metrics: { exists: { stat: "rate" } } });
const IGNORES = measurement("ignores", { instrument: "grep", config: { glob: "**/*.ts", pattern: "@ts-ignore" }, metrics: { count: { stat: "max" } } });
const SAYS_ELI = measurement("saysEli", { instrument: "replyMatches", config: { pattern: "Eli" }, metrics: { matches: { stat: "rate" } } });

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
  test("takes the measurements that use a container in one context, opened once and closed after the last, and records each measure", async () => {
    const log: string[] = [];

    const result = await measureContainerRun([EXISTS, IGNORES], opener({ "isPrime.ts": "// @ts-ignore\n" }, log), () => NOW);

    expect(log).toEqual(["open 1", "close 1"]);
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

  test("they're taken one after another, in their order, so what one writes the next sees", async () => {
    const WRITES = measurement("writes", { instrument: "shell", config: { command: "write" }, metrics: { exitCode: { stat: "max" } } });
    const order: string[] = [];
    const open = opener({ "isPrime.ts": "" }, []);
    const tracking = async () => {
      const ctx = await open();
      return {
        ...ctx,
        exec: async (command: string) => {
          order.push(`exec ${command}`);
          await ctx.writeFile("written.ts", "// @ts-ignore\n");
          return { stdout: "", stderr: "", exitCode: 0 };
        },
        glob: async (pattern: string) => (order.push(`glob ${pattern}`), ctx.glob(pattern)),
      };
    };

    const result = await measureContainerRun([WRITES, IGNORES], tracking, () => NOW);

    expect(order).toEqual(["exec write", "glob **/*.ts"]);
    expect(result.ignores?.outcome).toEqual({ outcome: "measured", data: 1 });
  });

  test("an instrument that throws gives its measure erroredWhileMeasuring, by message, and the rest are still taken", async () => {
    const log: string[] = [];
    const open = opener({ "isPrime.ts": "export {};\n" }, log);
    const failing = async () => ({ ...(await open()), readFile: async () => Promise.reject(new Error("the container went away")) });

    const result = await measureContainerRun([IGNORES, EXISTS], failing, () => NOW);

    expect(result.ignores?.outcome).toEqual({ outcome: "erroredWhileMeasuring", error: { message: "the container went away" } });
    expect(result.exists?.outcome).toEqual({ outcome: "measured", data: true });
    expect(log).toEqual(["open 1", "close 1"]);
  });

  test("an instrument's own erroredWhileMeasuring is recorded by its message", async () => {
    const bunTestFile = measurement("tests", {
      instrument: "bunTestFile",
      config: { subject: "isPrime.ts", test: "./isPrime.test.ts" },
      metrics: { passRate: { stat: "mean" } },
    });
    const test = `${import.meta.dir}/measure.test.ts`;

    // The fake context's `bun test` writes no report.
    const result = await measureContainerRun(
      [{ ...bunTestFile, config: { ...bunTestFile.config, test } }],
      opener({ "isPrime.ts": "export const isPrime = (n: number) => n > 1;\n" }, []),
      () => NOW,
    );

    expect(result.tests?.outcome).toEqual({
      outcome: "erroredWhileMeasuring",
      error: { message: "measure.test.ts didn't run against isPrime.ts" },
    });
  });


  test("one that reads only what was recorded gets a context without a container, taken alongside, and the measures keep their order", async () => {
    const asked: boolean[] = [];
    const open = opener({ "isPrime.ts": "" }, []);

    const result = await measureContainerRun([SAYS_ELI, EXISTS, IGNORES], async (usesContainer) => {
      asked.push(usesContainer);
      return open();
    });

    expect(asked.toSorted()).toEqual([false, true]);
    expect(Object.keys(result)).toEqual(["saysEli", "exists", "ignores"]);
  });

  test("a container that can't be started fails the measuring, once the others are taken", async () => {
    const open = opener({}, []);

    const measuring = measureContainerRun([EXISTS, SAYS_ELI], async (usesContainer) => {
      if (usesContainer) throw new Error("the runtime can't be reached");
      return open();
    });

    expect(measuring).rejects.toThrow("the runtime can't be reached");
  });

  test("with no measurements, nothing is opened", async () => {
    const log: string[] = [];
    expect(await measureContainerRun([], opener({}, log))).toEqual({});
    expect(log).toEqual([]);
  });
});
