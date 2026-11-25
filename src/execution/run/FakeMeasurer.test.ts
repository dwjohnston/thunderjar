/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, it } from "bun:test";
import { FakeMeasurer } from "./FakeMeasurer.ts";

const HARNESS = { name: "robot", version: "1.0.0", modelId: "small" };
const OF = { root: "/project", task: "greet", postrunImage: "after:1", container: "run-1", secretEnv: [] };
const RECORDED = { harnessResult: "hello", reply: { outcome: "collected" as const, text: "hello" } };
const A_MEASURE = { instrument: "grep", contentHash: "c1", measuredAt: "2027-01-15T08:00:00.000Z", outcome: { outcome: "measured" as const, data: 3 } };

describe("FakeMeasurer", () => {
  it("collects the result file's text as the reply, and no token costs, unless told otherwise", async () => {
    const measurer = new FakeMeasurer();

    expect(await measurer.collect({ root: "/project", harness: HARNESS }, "hello")).toEqual({
      reply: { outcome: "collected", text: "hello" },
      tokenCosts: { outcome: "unavailable", reason: "notReported" },
    });
    expect((await measurer.collect({ root: "/project", harness: HARNESS }, null)).reply).toEqual({ outcome: "unavailable", reason: "the agent left no result file" });
  });

  it("collects what it was told to: a value, or a function of the result file", async () => {
    const measurer = new FakeMeasurer();
    const tokenCosts = { outcome: "unavailable" as const, reason: "absent" as const };

    measurer.collects({ reply: { outcome: "collected", text: "fixed" }, tokenCosts });
    expect((await measurer.collect({ root: "/project", harness: HARNESS }, "hello")).reply).toEqual({ outcome: "collected", text: "fixed" });

    measurer.collects((text) => ({ reply: { outcome: "collected", text: `${text}!` }, tokenCosts }));
    expect((await measurer.collect({ root: "/project", harness: HARNESS }, "hello")).reply).toEqual({ outcome: "collected", text: "hello!" });
  });

  it("measures nothing unless told what to give", async () => {
    const measurer = new FakeMeasurer();

    expect(await measurer.measure(OF, RECORDED)).toEqual({});
    measurer.measures({ count: A_MEASURE });
    expect(await measurer.measure(OF, RECORDED)).toEqual({ count: A_MEASURE });
  });

  it("keeps every call", async () => {
    const measurer = new FakeMeasurer();

    await measurer.collect({ root: "/project", harness: HARNESS }, "hello");
    await measurer.measure(OF, RECORDED);

    expect(measurer.collected).toEqual([{ of: { root: "/project", harness: HARNESS }, harnessResult: "hello" }]);
    expect(measurer.measured).toEqual([{ of: OF, recorded: RECORDED }]);
  });

  it("fails when told to, until told to stop", async () => {
    const measurer = new FakeMeasurer().failMeasure("no container").failCollect("no harness");

    await expect(measurer.measure(OF, RECORDED)).rejects.toThrow("no container");
    await expect(measurer.collect({ root: "/project", harness: HARNESS }, "hello")).rejects.toThrow("no harness");
    expect(measurer.measured).toHaveLength(1);

    measurer.failMeasure(undefined).failCollect(undefined);
    expect(await measurer.measure(OF, RECORDED)).toEqual({});
  });
});
