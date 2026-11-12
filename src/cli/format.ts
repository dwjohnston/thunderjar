import type { Resolved } from "../api/declarations.ts";
import { registryHost } from "../config/projectConfig.ts";
import type { ContainerRunRecord, ExecutionRecord } from "../store/runDataStore.ts";
import { knownCost, totalTokens } from "../execution/runFacts.ts";
import { type Paint, plain } from "./colour.ts";
import type { Stat } from "../api/declarations.ts";

export { agentEnd, endedCleanly, knownCost, tokensOf, totalTokens } from "../execution/runFacts.ts";

/** An execution's status, coloured: complete green, failed red, running yellow. */
export const paintStatus = (status: ExecutionRecord["status"], paint: Paint) =>
  (status === "complete" ? paint.green : status === "failed" ? paint.red : paint.yellow)(status);

/** A count with thousands separators, e.g. `12,480`. */
export const thousands = (n: number) => Math.round(n).toLocaleString("en-US");

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

/** A number as it is, or to `places` decimal places. */
export const decimal = (n: number, places?: number) => (places === undefined ? String(n) : n.toFixed(places));

/** A value as recorded or combined; a record of numbers as `{passed: 3, failed: 2}`. */
export function showValue(value: unknown, places?: number, paint: Paint = plain): string {
  if (value === true) return paint.green("true");
  if (value === false) return paint.red("false");
  if (typeof value === "number") return decimal(value, places);
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const entries = Object.entries(value).map(([key, v]) => `${key}: ${typeof v === "number" ? decimal(v, places) : JSON.stringify(v)}`);
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

/**
 * A metric's statistic as shown: a rate as `<true>/<applicable>`, a count as the number true, any
 * other to one decimal place, and `–` if no score applied.
 */
export function showStat(stat: Stat, value: number | undefined, applicable: number): string {
  if (value === undefined) return "–";
  if (stat === "rate") return `${Math.round(value * applicable)}/${applicable}`;
  if (stat === "count") return String(value);
  return value.toFixed(1);
}
