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

/** The last line of `text` with anything on it, trimmed, or undefined if there's none. */
const lastLine = (text: string | null | undefined) =>
  text
    ?.split("\n")
    .map((line) => line.trim())
    .findLast((line) => line !== "");

/** How long a hint of why an agent didn't end cleanly may be, in characters. */
const HINT_LENGTH = 160;

/** The keys an error's text is found under, in the JSON events harnesses write. */
const MESSAGE_KEYS = ["message", "errorMessage", "error_description"];

/** The first error text in `value`, a parsed JSON value, looking `depth` levels down: what one of MESSAGE_KEYS holds. */
function messageIn(value: unknown, depth = 4): string | undefined {
  if (typeof value !== "object" || value === null || depth === 0) return undefined;
  const fields = value as Record<string, unknown>;
  for (const key of MESSAGE_KEYS) {
    const text = fields[key];
    if (typeof text === "string" && text.trim() !== "") return text.trim();
  }
  for (const nested of Object.values(fields)) {
    const found = messageIn(nested, depth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The first HTTP status in `value`, under `statusCode` or `status`, looking `depth` levels down. */
function statusIn(value: unknown, depth = 4): number | undefined {
  if (typeof value !== "object" || value === null || depth === 0) return undefined;
  const fields = value as Record<string, unknown>;
  for (const key of ["statusCode", "status"]) {
    const status = fields[key];
    if (typeof status === "number" && status >= 400 && status < 600) return status;
  }
  for (const nested of Object.values(fields)) {
    const found = statusIn(nested, depth - 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The error a harness reported in its result file, if its lines are JSON events and one is an
 * error: the last such, as `<status>: <message>` or just the message. An event is an error if its
 * `type` says so (`error`, `session.error`, `model.call_failure`), if it has an `error` field, or,
 * as Claude Code's result has, `is_error: true`, whose text is its `result`.
 *
 * So an agent that failed on its provider says why, e.g. `402: This request would exceed your
 * available credits`, where the file's last line is often something else, such as usage totals.
 */
export function reportedError(harnessResult: string | null | undefined): string | undefined {
  const lines = (harnessResult ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = (lines[i] as string).trim();
    if (!line.startsWith("{")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof event !== "object" || event === null) continue;
    const isError = (typeof event.type === "string" && /error|fail/i.test(event.type)) || (event.error !== undefined && event.error !== null) || event.is_error === true;
    if (!isError) continue;
    const message = event.is_error === true && typeof event.result === "string" && event.result.trim() !== "" ? event.result.trim() : messageIn(event);
    if (message === undefined) continue;
    const status = statusIn(event);
    const oneLine = message.replace(/\s+/g, " ");
    return status !== undefined && !oneLine.startsWith(String(status)) ? `${status}: ${oneLine}` : oneLine;
  }
  return undefined;
}

/**
 * A hint of why a container run's agent didn't end cleanly, cut to HINT_LENGTH: the error its
 * harness reported in its result file, if it has one (see `reportedError`), else the last line
 * of its stderr, or, with nothing there, of its result file. Undefined if both are empty or absent.
 */
export function failureHint({ harnessStderr, harnessResult }: { harnessStderr?: string | null; harnessResult: string | null }): string | undefined {
  const line = reportedError(harnessResult) ?? lastLine(harnessStderr) ?? lastLine(harnessResult);
  if (line === undefined) return undefined;
  return line.length <= HINT_LENGTH ? line : `${line.slice(0, HINT_LENGTH - 1)}…`;
}

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
