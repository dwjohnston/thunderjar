// The viewer's summaries of a permutation's iterations, and of the parameters every run shares.
import { describe, expect, test } from "bun:test";
import type { ContainerRunRecord, RecordedMeasure } from "../../../../store/runDataStore.ts";
import { commonParameters, groupByPermutation, summariseAgent, summariseCost, summariseDuration, summariseMeasure, summariseTokens } from "./aggregate.ts";

const param = (name: string) => ({ name, parameterHash: "h" });

/** A container run with only the fields the summaries read. */
function run({
  permutation = 1,
  iteration = 1,
  model = "m",
  seconds = 10,
  exitCode = 0,
  tokens,
  costUsd,
}: { permutation?: number; iteration?: number; model?: string; seconds?: number; exitCode?: number; tokens?: number; costUsd?: number }): ContainerRunRecord {
  return {
    permutation,
    iteration,
    parameters: { baseImage: param("node20"), codeState: param("baseline"), promptSet: param("snerk"), initialPrompt: param("default"), harnessModel: param(`h/${model}`) },
    harnessModel: { harness: "claude-code", version: "1", modelId: model },
    execution: { startedAt: 0, finishedAt: seconds * 1000, exitCode, timedOut: false },
    harnessResult: "{}",
    tokenCosts:
      tokens === undefined
        ? undefined
        : { outcome: "collected", models: [{ model, inputTokens: tokens, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, costUsd, costBasis: "reported" }] },
    result: {},
  } as unknown as ContainerRunRecord;
}

const measured = (data: unknown) => ({ outcome: { outcome: "measured", data } }) as RecordedMeasure;
const skipped = { outcome: { outcome: "skipped" } } as RecordedMeasure;
const errored = { outcome: { outcome: "erroredWhileMeasuring", error: new Error("x") } } as unknown as RecordedMeasure;

describe("groupByPermutation", () => {
  test("groups runs by permutation, in order", () => {
    const runs = [run({ permutation: 1, iteration: 1 }), run({ permutation: 1, iteration: 2 }), run({ permutation: 2, iteration: 1 })];
    expect(groupByPermutation(runs).map(({ permutation, runs: r }) => [permutation, r.map((x) => x.iteration)])).toEqual([
      [1, [1, 2]],
      [2, [1]],
    ]);
  });
});

describe("commonParameters", () => {
  test("lists the parameters every run shares, leaving out those that vary", () => {
    const common = commonParameters([run({ model: "a" }), run({ model: "b" })]);
    expect(common.map(({ label, value }) => `${label}=${value}`)).toEqual(["Base image=node20", "Code state=baseline", "Prompt set=snerk", "Initial prompt=default"]);
  });

  test("is empty without runs", () => {
    expect(commonParameters([])).toEqual([]);
  });
});

describe("summaries", () => {
  test("duration is the mean, with the range beneath", () => {
    expect(summariseDuration([run({ seconds: 9 }), run({ seconds: 13 }), run({ seconds: 11 })])).toEqual({ text: "0:11", detail: "0:09–0:13" });
  });

  test("no range when every value is the same", () => {
    expect(summariseDuration([run({ seconds: 10 }), run({ seconds: 10 })])).toEqual({ text: "0:10", detail: undefined });
  });

  test("agent ends are tallied", () => {
    expect(summariseAgent([run({}), run({})]).text).toBe("2/2 done");
    expect(summariseAgent([run({}), run({ exitCode: 1 }), run({})]).text).toBe("2 done · 1 exited 1");
  });

  test("tokens and cost cover only the runs that have them", () => {
    const runs = [run({ tokens: 100, costUsd: 0.002 }), run({ tokens: 300, costUsd: 0.004 }), run({})];
    expect(summariseTokens(runs)).toEqual({ text: "200", detail: "100–300 · of 2/3 runs" });
    expect(summariseCost(runs)).toEqual({ text: "$0.003", detail: "$0.002–$0.004 · of 2/3 runs" });
    expect(summariseTokens([run({})])).toBeUndefined();
  });
});

describe("summariseMeasure", () => {
  test("numbers: mean and range", () => {
    expect(summariseMeasure([measured(1), measured(2), measured(4)])).toEqual({ text: "2.33", detail: "1–4" });
  });

  test("booleans: how many are true", () => {
    expect(summariseMeasure([measured(true), measured(false), measured(true)])).toEqual({ text: "2/3 true" });
  });

  test("objects of numbers: summed per key", () => {
    expect(summariseMeasure([measured({ failed: 0, passed: 5 }), measured({ failed: 1, passed: 4 })])).toEqual({ text: "failed 1 · passed 9" });
  });

  test("anything else: the value if all agree, else how many distinct", () => {
    expect(summariseMeasure([measured("a"), measured("a")])).toEqual({ text: '"a"' });
    expect(summariseMeasure([measured("a"), measured("b"), measured("a")])).toEqual({ text: "2 distinct" });
  });

  test("skipped and errored measures are counted beside the rest", () => {
    expect(summariseMeasure([measured(true), skipped, errored])).toEqual({ text: "1/1 true", detail: "+1 skipped · 1 errored" });
    expect(summariseMeasure([skipped, undefined])).toEqual({ text: "1 skipped" });
  });
});
