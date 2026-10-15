import { expect, test } from "bun:test";
import type { Measurement } from "./config.ts";
import { hashMeasurement } from "./hashing.ts";
import { measureContainerRun } from "./measure.ts";
import type { OpenedMeasurementContext } from "./runner.ts";

/** Opens contexts over a fixed list of files; any other method throws. */
const fakeContext = (files: string[], glob?: (pattern: string) => Promise<string[]>) => {
  const unused = () => Promise.reject(new Error("not used"));
  return async (): Promise<OpenedMeasurementContext> => ({
    exec: unused,
    readFile: unused,
    writeFile: unused,
    glob: glob ?? (async (pattern) => files.filter((f) => new Bun.Glob(pattern).match(f))),
    harnessResult: "",
    workdir: "/workspace",
    close: async () => {},
  });
};

const measurement = (name: string, glob: string): Measurement => ({
  name,
  instrument: "fileCreated",
  config: { glob },
  aggregate: ["rate"],
  dir: "/measurements",
});

const clock = () => {
  let t = Date.parse("2026-09-29T14:31:02.000Z");
  return () => (t += 1000);
};

test("takes each measure, keyed by name, with its instrument, content hash and when it was taken", async () => {
  const isPrime = measurement("isPrimeTsExists", "**/isPrime.ts");
  const readme = measurement("readmeExists", "**/README.md");
  const result = await measureContainerRun([isPrime, readme], fakeContext(["src/isPrime.ts"]), clock());

  expect(result).toEqual({
    isPrimeTsExists: {
      instrument: "fileCreated",
      contentHash: hashMeasurement(isPrime),
      measuredAt: "2026-09-29T14:31:03.000Z",
      outcome: { outcome: "measured", data: true },
    },
    readmeExists: {
      instrument: "fileCreated",
      contentHash: hashMeasurement(readme),
      measuredAt: "2026-09-29T14:31:04.000Z",
      outcome: { outcome: "measured", data: false },
    },
  });
  // It survives JSON as it is.
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

test("an instrument that throws gives erroredWhileMeasuring with its message, and the rest are still taken", async () => {
  const ctx = fakeContext([], async (pattern) => {
    if (pattern === "boom") throw new Error("glob exploded");
    return ["isPrime.ts"];
  });
  const result = await measureContainerRun(
    [measurement("a", "boom"), measurement("b", "isPrime.ts")],
    ctx,
    clock(),
  );
  expect(result.a!.outcome).toEqual({ outcome: "erroredWhileMeasuring", error: { message: "glob exploded" } });
  expect(result.a!.contentHash).toBe(hashMeasurement(measurement("a", "boom")));
  expect(result.b!.outcome).toEqual({ outcome: "measured", data: true });
});

test("an unknown instrument gives erroredWhileMeasuring rather than stopping the run", async () => {
  const unknown = { ...measurement("a", "x"), instrument: "wc" } as unknown as Measurement;
  const result = await measureContainerRun([unknown], fakeContext([]), clock());
  expect(result.a!.outcome).toEqual({ outcome: "erroredWhileMeasuring", error: { message: `unknown instrument "wc"` } });
});

test("no measurements give an empty result", async () => {
  expect(await measureContainerRun([], fakeContext([]))).toEqual({});
});

test("gives each measurement a context of its own, and closes it once the measure is taken", async () => {
  const events: string[] = [];
  let opened = 0;
  const open = async (): Promise<OpenedMeasurementContext> => {
    const n = ++opened;
    events.push(`open ${n}`);
    return {
      ...(await fakeContext([])()),
      glob: async (pattern) => {
        events.push(`glob ${pattern} in ${n}`);
        if (pattern === "boom") throw new Error("glob exploded");
        return [];
      },
      close: async () => void events.push(`close ${n}`),
    };
  };
  await measureContainerRun([measurement("a", "boom"), measurement("b", "x")], open, clock());
  expect(events).toEqual(["open 1", "glob boom in 1", "close 1", "open 2", "glob x in 2", "close 2"]);
});

test("a context that can't be opened stops measuring", async () => {
  const open = () => Promise.reject(new Error("measurement container went away"));
  await expect(measureContainerRun([measurement("a", "x")], open, clock())).rejects.toThrow("measurement container went away");
});
