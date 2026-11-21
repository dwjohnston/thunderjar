import { describe, expect, test } from "bun:test";
import type { TokenCostCollector, TokenCosts } from "../api/declarations.ts";
import { collectTokenCosts } from "./tokenCosts.ts";

const CTX = { version: "1.0.0", modelId: "fake-model-small-001" };

/** A collector that reads its result file as the TokenCosts it should give. */
const asJson: TokenCostCollector = (raw) => JSON.parse(raw) as TokenCosts;

const turn = (model: string, tokens: number, costUsd?: number, costBasis?: string) =>
  JSON.stringify({
    outcome: "collected",
    models: [{ model, inputTokens: tokens, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 2, costUsd, costBasis }],
    apiDurationMs: 100,
  });

describe("collectTokenCosts", () => {
  test("sums each turn's, per model", () => {
    expect(collectTokenCosts(asJson, [turn("opus", 10, 0.5, "list"), turn("opus", 5, 0.25, "list"), turn("haiku", 3)], CTX)).toEqual({
      outcome: "collected",
      models: [
        { model: "opus", inputTokens: 15, outputTokens: 2, cacheCreationTokens: 0, cacheReadTokens: 4, costUsd: 0.75, costBasis: "list" },
        { model: "haiku", inputTokens: 3, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 2 },
      ],
      apiDurationMs: 300,
    });
  });

  test("a cost reported for only some turns is no cost; bases that differ are unknown", () => {
    const costs = collectTokenCosts(asJson, [turn("opus", 10, 0.5, "list"), turn("opus", 5), turn("haiku", 1, 0.1, "list"), turn("haiku", 1, 0.1, "unknown")], CTX);
    expect(costs.outcome === "collected" && costs.models.map(({ costUsd, costBasis }) => [costUsd, costBasis])).toEqual([
      [undefined, "unknown"],
      [0.2, "unknown"],
    ]);
  });

  test("a turn without a result file, or that can't be read, is left out, never counted as zero", () => {
    const costs = collectTokenCosts(asJson, [turn("opus", 10, 0.5, "list"), null, "not json"], CTX);
    expect(costs.outcome === "collected" && costs.models[0]?.inputTokens).toBe(10);
  });

  test("with no turn's collected, unavailable, for the first turn's reason", () => {
    expect(collectTokenCosts(asJson, [null], CTX)).toEqual({ outcome: "unavailable", reason: "absent" });
    expect(collectTokenCosts(asJson, ["not json", null], CTX)).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(collectTokenCosts(() => ({ outcome: "unavailable", reason: "notReported" }), ["{}"], CTX)).toEqual({ outcome: "unavailable", reason: "notReported" });
  });

  test("a collector that returns something else is unparseable, and is given the harness's version and model", () => {
    expect(collectTokenCosts(() => ({ outcome: "collected", models: [{ model: "x", inputTokens: -1 }] }) as unknown as TokenCosts, ["{}"], CTX)).toEqual({
      outcome: "unavailable",
      reason: "unparseable",
    });
    const seen: unknown[] = [];
    collectTokenCosts((_raw, ctx) => (seen.push(ctx), { outcome: "unavailable", reason: "notReported" }), ["{}"], CTX);
    expect(seen).toEqual([CTX]);
  });
});
