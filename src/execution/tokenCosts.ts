// A container run's token costs: each turn's result file read by its harness's
// `collectTokenCosts`, and summed per model. Collected for every run, not declared (PRD 087).
import type { ModelTokenCosts, TokenCostCollector, TokenCosts } from "../api/declarations.ts";

type Unavailable = Extract<TokenCosts, { outcome: "unavailable" }>;

const isCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Whether `value` is token costs a collector could mean, so a wrong shape is `unparseable`, not recorded. */
function isTokenCosts(value: unknown): value is TokenCosts {
  const costs = value as Partial<Record<string, unknown>> | null;
  if (typeof costs !== "object" || costs === null) return false;
  if (costs.outcome === "unavailable") return ["absent", "unparseable", "notReported"].includes(costs.reason as string);
  if (costs.outcome !== "collected" || !Array.isArray(costs.models)) return false;
  if (costs.apiDurationMs !== undefined && !isCount(costs.apiDurationMs)) return false;
  return costs.models.every((model: Partial<Record<keyof ModelTokenCosts, unknown>>) => {
    const counts = [model.inputTokens, model.outputTokens, model.cacheCreationTokens, model.cacheReadTokens];
    return typeof model.model === "string" && counts.every(isCount) && (model.costUsd === undefined || isCount(model.costUsd));
  });
}

/** One result file's token costs: `absent` if there's none, `unparseable` if the collector throws or returns something else. */
function collectOne(collect: TokenCostCollector, raw: string | null, ctx: { version: string; modelId: string }): TokenCosts {
  if (raw === null) return { outcome: "unavailable", reason: "absent" };
  try {
    const costs: unknown = collect(raw, ctx);
    return isTokenCosts(costs) ? costs : { outcome: "unavailable", reason: "unparseable" };
  } catch {
    return { outcome: "unavailable", reason: "unparseable" };
  }
}

/** `a` and `b`, the same model's costs, added: a cost only if both have one, and their basis if they agree. */
function add(a: ModelTokenCosts, b: ModelTokenCosts): ModelTokenCosts {
  const costUsd = a.costUsd !== undefined && b.costUsd !== undefined ? a.costUsd + b.costUsd : undefined;
  const costBasis = a.costBasis === b.costBasis ? a.costBasis : "unknown";
  return {
    model: a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    ...(costUsd !== undefined && { costUsd }),
    ...(costBasis !== undefined && { costBasis }),
  };
}

/**
 * A container run's token costs, from `harnessResults`, each turn's result file or null, read by
 * `collect`: the turns collected, summed per model, in the order models first appear. A turn
 * without them, such as one that never ran, is left out, never counted as zero. Unavailable only
 * if no turn's were collected, for the first turn's reason.
 */
export function collectTokenCosts(
  collect: TokenCostCollector,
  harnessResults: (string | null)[],
  ctx: { version: string; modelId: string },
): TokenCosts {
  const all = harnessResults.map((raw) => collectOne(collect, raw, ctx));
  const collected = all.filter((costs) => costs.outcome === "collected");
  if (collected.length === 0) return all[0] ?? ({ outcome: "unavailable", reason: "absent" } satisfies Unavailable);
  const byModel = new Map<string, ModelTokenCosts>();
  for (const model of collected.flatMap((costs) => costs.models)) {
    const before = byModel.get(model.model);
    byModel.set(model.model, before ? add(before, model) : model);
  }
  const durations = collected.map((costs) => costs.apiDurationMs);
  const apiDurationMs = durations.every((ms) => ms !== undefined) ? durations.reduce((a, b) => a + b, 0) : undefined;
  return { outcome: "collected", models: [...byModel.values()], ...(apiDurationMs !== undefined && { apiDurationMs }) };
}
