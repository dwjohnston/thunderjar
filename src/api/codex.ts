// Reading what `codex exec --json` writes: JSON lines, one event each. For a harness's
// `collectReply` and `collectTokenCosts`, so a Codex harness needn't parse it itself, and `codex`,
// a whole Codex harness.
import { declareHarness, type HarnessDeclaration, type RequiredEnv, type TokenCosts } from "./declarations.ts";
import { MODEL_PATH, PROMPT_PATH, RESULT_PATH, writeModel, writeRunScript } from "./files.ts";

type Event = { type?: unknown; item?: { type?: unknown; item_type?: unknown; text?: unknown }; usage?: Record<string, unknown> };

/** Each JSON line of `codex exec --json`'s output. Lines that aren't JSON objects are skipped. */
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

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

/** The last completed agent message with text: Codex's final reply. Throws if there is none. */
export function codexReply(raw: string): string {
  const reply = events(raw)
    .filter((e) => e.type === "item.completed")
    .map((e) => e.item)
    .filter((item) => item?.type === "agent_message" || item?.item_type === "assistant_message")
    .map((item) => item?.text)
    .findLast((text) => typeof text === "string" && text.trim() !== "");
  if (typeof reply !== "string") throw new Error("no completed agent_message with text in Codex's JSONL output");
  return reply;
}

/**
 * Tokens summed over every `turn.completed`, as one entry for `modelId`: Codex doesn't name the
 * model. Its `input_tokens` include the cached ones, so they're subtracted. `notReported` if no
 * turn completed or none counted a token.
 */
export function codexTokenCosts(raw: string, modelId: string): TokenCosts {
  const usages = events(raw).flatMap((e) => (e.type === "turn.completed" && e.usage ? [e.usage] : []));
  if (usages.length === 0) return { outcome: "unavailable", reason: "notReported" };
  let input = 0, cached = 0, output = 0;
  for (const u of usages) {
    input += count(u.input_tokens);
    cached += count(u.cached_input_tokens);
    output += count(u.output_tokens);
  }
  if (input + output === 0) return { outcome: "unavailable", reason: "notReported" };
  return {
    outcome: "collected",
    models: [{ model: modelId, inputTokens: Math.max(0, input - cached), outputTokens: output, cacheReadTokens: cached, cacheCreationTokens: 0 }],
  };
}

/** What `codex` gets. */
export type CodexOptions = {
  /** The version of `@openai/codex` to install, e.g. `"0.166.0"`. */
  version: string;
  /** Replaces the command its run script runs: `CODEX_COMMAND` is the default. */
  command?: string;
  /** Replaces the environment variables it needs: `["OPENAI_API_KEY"]` is the default. */
  requiredEnv?: RequiredEnv[];
  /** Runs it on OpenRouter, with OpenRouter's model IDs, needing `OPENROUTER_API_KEY`. */
  openRouter?: boolean;
};

/**
 * The command that runs Codex: the prompt and model read from their files, so quotes and newlines
 * reach the agent intact, its events as JSON lines, without its sandbox or approvals.
 */
export const CODEX_COMMAND =
  `codex exec --model "$(cat ${MODEL_PATH})" --json --dangerously-bypass-approvals-and-sandbox "$(cat ${PROMPT_PATH})" > ${RESULT_PATH}`;

/**
 * A complete harness declaration for Codex `version`. Its fragment installs Codex as root, writes
 * the model ID and the run script, then switches to the image's non-root `node` user. Its reply
 * and token costs are read from its JSON lines. It needs `OPENAI_API_KEY`; to run it on another
 * provider, pass its `command` and `requiredEnv`.
 *
 * ```ts
 * // harnessModels/codex-0.166.0/index.ts
 * export default codex({ version: "0.166.0" });
 * ```
 */
export function codex({ version, command = CODEX_COMMAND, requiredEnv = ["OPENAI_API_KEY"] }: CodexOptions): HarnessDeclaration<undefined, undefined> {
  return declareHarness({
    version,
    applyParameter: (_config, ctx) =>
      [
        `RUN npm install -g @openai/codex@${ctx.version}`,
        "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
        writeModel(ctx.modelId),
        writeRunScript(command),
        "USER node",
      ].join("\n"),
    collectReply: codexReply,
    collectTokenCosts: (raw, ctx) => codexTokenCosts(raw, ctx.modelId),
    requiredEnv,
  });
}
