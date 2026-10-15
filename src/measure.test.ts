import { expect, test } from "bun:test";
import type { Measurement } from "./config.ts";
import type { MeasurementContext } from "./declarations.ts";
import { hashMeasurement } from "./hashing.ts";
import { measureContainerRun } from "./measure.ts";

/** A context over a fixed list of files; any other method throws. */
const fakeContext = (files: string[], glob?: (pattern: string) => Promise<string[]>): MeasurementContext => {
  const unused = () => Promise.reject(new Error("not used"));
  return {
    exec: unused,
    readFile: unused,
    writeFile: unused,
    glob: glob ?? (async (pattern) => files.filter((f) => new Bun.Glob(pattern).match(f))),
    harnessResult: "",
    workdir: "/workspace",
  };
};

const measurement = (name: string, glob: string): Measurement => ({
  name,
  instrument: "fileCreated",
  config: { glob },
  aggregate: ["rate"],
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
  const unknown = { ...measurement("a", "x"), instrument: "grep" } as unknown as Measurement;
  const result = await measureContainerRun([unknown], fakeContext([]), clock());
  expect(result.a!.outcome).toEqual({ outcome: "erroredWhileMeasuring", error: { message: `unknown instrument "grep"` } });
});

test("no measurements give an empty result", async () => {
  expect(await measureContainerRun([], fakeContext([]))).toEqual({});
});
