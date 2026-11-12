import { expect, test } from "bun:test";
import { timings } from "./timings.ts";

test("sums each phase's runs, keeps the longest, and reports phases in their order", async () => {
  let clock = 1000;
  const { time, summary } = timings(() => clock);

  await time("agent", async () => void (clock += 300));
  await time("build", async () => void (clock += 50));
  await time("agent", async () => void (clock += 100));

  expect(summary()).toEqual({ wallMs: 450, phases: { build: { count: 1, totalMs: 50, maxMs: 50 }, agent: { count: 2, totalMs: 400, maxMs: 300 } } });
  expect(Object.keys(summary().phases)).toEqual(["build", "agent"]);
});

test("times a job that throws, and rethrows", async () => {
  let clock = 0;
  const { time, summary } = timings(() => clock);

  const failed = time("commit", async () => {
    clock += 20;
    throw new Error("no such container");
  });

  expect(failed).rejects.toThrow("no such container");
  await failed.catch(() => {});
  expect(summary().phases).toEqual({ commit: { count: 1, totalMs: 20, maxMs: 20 } });
});

test("returns what the job returns", async () => {
  expect(await timings().time("measure", async () => 42)).toBe(42);
});
