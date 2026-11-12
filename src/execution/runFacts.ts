// Facts about a recorded container run that both the summary of an execution and the CLI's output
// read: how its agent ended, and its tokens and cost.
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
