// Reading what `opencode run --format json` writes: one JSON event per line, {type, timestamp,
// sessionID, part}. For a harness's `collectReply` and `collectTokenCosts`, so an OpenCode harness
// needn't parse it itself, and `opencode`, a whole OpenCode harness.
import { declareHarness, type HarnessDeclaration, type RequiredEnv, type TokenCosts } from "./declarations.ts";
import { MODEL_PATH, PROMPT_PATH, RESULT_PATH, writeModel, writeRunScript } from "./files.ts";

type Part = {
  text?: unknown;
  cost?: unknown;
  tokens?: { input?: unknown; output?: unknown; reasoning?: unknown; cache?: { read?: unknown; write?: unknown } };
};
type Event = { type?: unknown; part?: Part };

/** Each JSON line of OpenCode's output. Lines that aren't JSON objects are skipped. */
function events(raw: string): Event[] {
  return raw.split("\n").flatMap((line) => {
    try {
      const parsed = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null ? [parsed as Event] : [];
    } catch {
      return [];
    }
  });
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined);

/** The text of the last step, i.e. after the last "step_start": the agent's final reply. Throws if there is none. */
export function opencodeReply(raw: string): string {
  const all = events(raw);
  const lastStep = all.findLastIndex((e) => e.type === "step_start");
  const texts = all.slice(lastStep + 1).flatMap((e) => (e.type === "text" && typeof e.part?.text === "string" ? [e.part.text] : []));
  if (texts.length === 0) throw new Error("no text event in OpenCode's JSON output");
  return texts.join("\n");
}

/**
 * Every step's tokens, summed, as one entry for `modelId`. OpenCode already takes cached tokens out
 * of `input`, but it takes reasoning out of `output`, so reasoning is added back: it's billed as
 * output. Its `cost` is its own estimate in dollars, from the models.dev price table, not what the
 * provider charged. Only the main session's events are written, so sub-agents' tokens aren't counted.
 */
export function opencodeTokenCosts(raw: string, modelId: string): TokenCosts {
  const all = events(raw);
  const steps = all.filter((e) => e.type === "step_finish");
  // OpenCode's events, but no step finished, e.g. its first model call failed (out of credits): it
  // reported no tokens. Only output with no events at all is unparseable.
  if (steps.length === 0) return { outcome: "unavailable", reason: all.length > 0 ? "notReported" : "unparseable" };
  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheCreationTokens = 0, costUsd = 0;
  for (const { part } of steps) {
    const t = part?.tokens;
    const values = [t?.input, t?.output, t?.reasoning, t?.cache?.read, t?.cache?.write].map(count);
    if (values.some((n) => n === undefined)) return { outcome: "unavailable", reason: "unparseable" };
    const [input, output, reasoning, read, write] = values as [number, number, number, number, number];
    inputTokens += input;
    outputTokens += output + reasoning;
    cacheReadTokens += read;
    cacheCreationTokens += write;
    costUsd += count(part?.cost) ?? 0;
  }
  if (inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens === 0) return { outcome: "unavailable", reason: "notReported" };
  // A model missing from OpenCode's price table costs 0 there, so 0 means "unknown", not free.
  const cost = costUsd > 0 ? { costUsd, costBasis: "list" as const } : {};
  return { outcome: "collected", models: [{ model: modelId, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, ...cost }] };
}

/** What `opencode` gets. */
export type OpenCodeOptions = {
  /** The version of `opencode-ai` to install, e.g. `"1.19.5"`. */
  version: string;
  /** Replaces the command its run script runs: `OPENCODE_COMMAND` is the default. */
  command?: string;
  /** Replaces the environment variables it needs: `["OPENCODE_API_KEY"]` is the default. */
  requiredEnv?: RequiredEnv[];
};

/**
 * The command that runs OpenCode: the prompt and model read from their files, so quotes and
 * newlines reach the agent intact, its events as JSON lines. `OPENCODE_PERMISSION` allows paths
 * outside /workspace: with nobody to ask, `opencode run` otherwise rejects a command that touches
 * one, then stops, exiting 0 with no reply.
 */
export const OPENCODE_COMMAND =
  `OPENCODE_PERMISSION='{"external_directory":"allow"}' opencode run --model "$(cat ${MODEL_PATH})" --format json "$(cat ${PROMPT_PATH})" > ${RESULT_PATH}`;

/**
 * A complete harness declaration for OpenCode `version`. Its fragment installs OpenCode as root,
 * installs its plugin package as `node`, so it isn't installed on every run, writes the model ID
 * and the run script, then switches to `node`. Its reply and token costs are read from its JSON
 * lines. It needs `OPENCODE_API_KEY`, an OpenCode Zen key; to run it on another provider, pass its
 * `requiredEnv`, e.g. `["OPENROUTER_API_KEY"]`.
 *
 * ```ts
 * // harnessModels/opencode-1.19.5/index.ts
 * export default opencode({ version: "1.19.5" });
 * ```
 */
export function opencode({ version, command = OPENCODE_COMMAND, requiredEnv = ["OPENCODE_API_KEY"] }: OpenCodeOptions): HarnessDeclaration<undefined, undefined> {
  return declareHarness({
    version,
    applyParameter: (_config, ctx) =>
      [
        `RUN npm install -g opencode-ai@${ctx.version}`,
        "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
        // As `node`, OpenCode's plugin package is installed where OpenCode looks for it. Otherwise
        // every run installs it as it starts: 175 MB of ~/.config and ~/.npm in each postrun image,
        // to commit and push. Before the model is written, so every model's image shares the layer.
        "USER node",
        `RUN mkdir -p ~/.config/opencode && cd ~/.config/opencode && echo '{"dependencies":{"@opencode-ai/plugin":"${ctx.version}"}}' > package.json && npm install --no-audit --no-fund && npm cache clean --force`,
        "USER root",
        writeModel(ctx.modelId),
        writeRunScript(command),
        "USER node",
      ].join("\n"),
    collectReply: opencodeReply,
    collectTokenCosts: (raw, ctx) => opencodeTokenCosts(raw, ctx.modelId),
    requiredEnv,
  });
}
