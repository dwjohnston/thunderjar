import type { ModelTokenCosts, TokenCosts } from "../api/declarations.ts";
import type { Execution } from "../store/runDataStore.ts";

/**
 * How a container run's agent ended, without how long it took: `done`, `exited 1`, `timed out
 * after 5s`, with `, no result file` if it finished but left none.
 */
export function agentEnd(execution: Execution, harnessResult: string | null): string {
  if (execution.timedOut) return `timed out after ${execution.timeoutSeconds}s`;
  const ended = execution.exitCode === 0 ? "done" : `exited ${execution.exitCode}`;
  return harnessResult === null ? `${ended}, no result file` : ended;
}

/** Whether a container run's agent exited 0 in time, and left a result file. */
export const endedCleanly = (execution: Execution, harnessResult: string | null) =>
  !execution.timedOut && execution.exitCode === 0 && harnessResult !== null;

/** A count with thousands separators, e.g. `12,480`. */
export const thousands = (n: number) => Math.round(n).toLocaleString("en-US");

/** A model's tokens, every bucket together. */
export const tokensOf = ({ inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }: ModelTokenCosts) =>
  inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;

/** A run's tokens, every model together, or undefined if it has none recorded. */
export const totalTokens = (costs: TokenCosts | undefined) =>
  costs?.outcome === "collected" ? costs.models.reduce((sum, model) => sum + tokensOf(model), 0) : undefined;

/**
 * A run's cost in dollars, every model together, if its harness reported one for each it can be
 * trusted for: not when its price table didn't know a model (`costBasis: "unknown"`), as Claude
 * Code's doesn't for a model on another provider, whose cost it prices as an Anthropic model's.
 */
export function knownCost(costs: TokenCosts | undefined): number | undefined {
  if (costs?.outcome !== "collected" || costs.models.length === 0) return undefined;
  if (costs.models.some(({ costUsd, costBasis }) => costUsd === undefined || costBasis === "unknown")) return undefined;
  return costs.models.reduce((sum, { costUsd }) => sum + (costUsd as number), 0);
}

/** Dollars to three places, e.g. `$0.061`, and anything above nothing but below a tenth of a cent as `<$0.001`. */
export const dollars = (usd: number) => (usd > 0 && usd < 0.0005 ? "<$0.001" : `$${usd.toFixed(3)}`);

/** `n` and `noun`, plural unless `n` is 1, e.g. `2 permutations`. */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** `iso` in UTC, to the minute, e.g. `2026-10-01 10:12`. */
export const minute = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");
