import type { ModelTokenCosts, Resolved, TokenCosts } from "../api/declarations.ts";
import { registryHost } from "../config/projectConfig.ts";
import type { ContainerRunRecord, Execution, ExecutionRecord } from "../store/runDataStore.ts";
import type { Paint } from "./colour.ts";

/**
 * How a container run's agent ended, without how long it took: `done`, `exited 1`, `timed out
 * after 5s`, with `, no result file` if it finished but left none.
 */
export function agentEnd(execution: Execution, harnessResult: string | null): string {
  if (execution.timedOut) return `timed out after ${execution.timeoutSeconds}s`;
  const ended = execution.exitCode === 0 ? "done" : `exited ${execution.exitCode}`;
  return harnessResult === null ? `${ended}, no result file` : ended;
}

/** An execution's status, coloured: complete green, failed red, running yellow. */
export const paintStatus = (status: ExecutionRecord["status"], paint: Paint) =>
  (status === "complete" ? paint.green : status === "failed" ? paint.red : paint.yellow)(status);

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

export type RunTotals = { runs: number; tokens?: number; withTokens: number; costUsd?: number; withCost: number };

/**
 * Container runs' tokens and cost added up, over the runs that have them, never counting a run
 * without them as zero: `undefined` if none has them. `withTokens` and `withCost` say how many did.
 */
export function runTotals(runs: Pick<ContainerRunRecord, "tokenCosts">[]): RunTotals {
  const tokens = runs.flatMap(({ tokenCosts }) => totalTokens(tokenCosts) ?? []);
  const costs = runs.flatMap(({ tokenCosts }) => knownCost(tokenCosts) ?? []);
  const sum = (ns: number[]) => (ns.length === 0 ? undefined : ns.reduce((a, b) => a + b, 0));
  return { runs: runs.length, tokens: sum(tokens), withTokens: tokens.length, costUsd: sum(costs), withCost: costs.length };
}

/** `ms` as minutes and seconds, e.g. `0:31`, or with hours once it's that long, e.g. `1:02:05`. */
export function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const ss = String(seconds % 60).padStart(2, "0");
  if (seconds < 3600) return `${Math.floor(seconds / 60)}:${ss}`;
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${ss}`;
}

/** Dollars to three places, e.g. `$0.061`, and anything above nothing but below a tenth of a cent as `<$0.001`. */
export const dollars = (usd: number) => (usd > 0 && usd < 0.0005 ? "<$0.001" : `$${usd.toFixed(3)}`);

/** `n` and `noun`, plural unless `n` is 1, e.g. `2 permutations`. */
export const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** `iso` in UTC, to the minute, e.g. `2026-10-01 10:12`. */
export const minute = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace("T", " ");

/** Why pushing `reference` failed, and what to check. */
export function pushFailure(reference: string, error: Error): string {
  const repository = reference.slice(0, reference.lastIndexOf(":"));
  return `Pushing ${reference} failed: ${error.message}\nCheck that your Docker login for ${registryHost(repository)} can push to ${repository}: on ghcr.io, a token needs the write:packages scope.`;
}

/** What a parameter's `resolve` returned, as shown: a string as it is, anything else as JSON. */
export const showResolved = (value: Resolved) => (typeof value === "string" ? value : JSON.stringify(value));
