/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
// Reading what `codex exec --json` writes: JSON lines, one event each. For a harness's
// `collectReply` and `collectTokenCosts`, so a Codex harness needn't parse it itself, and `codex`,
// a whole Codex harness.
import { declareHarness, type HarnessDeclaration, type HarnessModels, type TokenCosts } from "./declarations.ts";
import { writeModel, writeRunScript } from "./files.ts";
import { COMMAND_PATHS, type CommandContext } from "./harnessOptions.ts";
import { jsonLines, tokenCount } from "./jsonLines.ts";

type Event = { type?: unknown; item?: { type?: unknown; item_type?: unknown; text?: unknown }; usage?: Record<string, unknown> };

/** The last completed agent message with text: Codex's final reply. Throws if there is none. */
export function codexReply(raw: string): string {
  const reply = jsonLines<Event>(raw)
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
  let input = 0, cached = 0, output = 0;
  for (const { type, usage } of jsonLines<Event>(raw)) {
    if (type !== "turn.completed" || !usage) continue;
    input += tokenCount(usage.input_tokens) ?? 0;
    cached += tokenCount(usage.cached_input_tokens) ?? 0;
    output += tokenCount(usage.output_tokens) ?? 0;
  }
  if (input + output === 0) return { outcome: "unavailable", reason: "notReported" };
  return {
    outcome: "collected",
    models: [{ model: modelId, inputTokens: Math.max(0, input - cached), outputTokens: output, cacheReadTokens: cached, cacheCreationTokens: 0 }],
  };
}

/** The models `codex` declares unless given others: OpenAI's, as Codex takes them. */
export const CODEX_MODELS: HarnessModels = {
  "gpt-6.1-sol": [],
  "gpt-5.5": [],
};

/** What `codex` gets. */
export type CodexOptions = {
  /** The version of `@openai/codex` to install, e.g. `"0.166.0"`. */
  version: string;
  /** The models it runs, as `declareHarness`'s `models`. By default, `CODEX_MODELS`. */
  models?: HarnessModels;
};

/**
 * The command that runs Codex: the prompt and model read from their files, so quotes and newlines
 * reach the agent intact, its events as JSON lines, without its sandbox or approvals: the
 * container is the sandbox.
 */
export const CODEX_COMMAND = ({ paths }: CommandContext): string =>
  `codex exec --model "$(cat ${paths.model})" --json --dangerously-bypass-approvals-and-sandbox "$(cat ${paths.prompt})" > ${paths.result}`;

/**
 * A complete harness declaration for Codex `version`. Its fragment installs Codex as root, writes
 * the model ID and the run script, then switches to the image's non-root `node` user. Its reply
 * and token costs are read from its JSON lines. It needs `OPENAI_API_KEY`.
 *
 * ```ts
 * // harnessModels/codex-0.166.0/index.ts
 * export default codex({ version: "0.166.0" });
 * ```
 */
export function codex({ version, models = CODEX_MODELS }: CodexOptions): HarnessDeclaration<undefined, undefined> {
  return declareHarness({
    version,
    models,
    applyParameter: (_config, ctx) =>
      [
        `RUN npm install -g @openai/codex@${ctx.version}`,
        "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
        writeModel(ctx.modelId),
        writeRunScript(CODEX_COMMAND({ modelId: ctx.modelId, model: ctx.model, version: ctx.version, paths: COMMAND_PATHS, provider: undefined })),
        "USER node",
      ].join("\n"),
    collectReply: codexReply,
    collectTokenCosts: (raw, ctx) => codexTokenCosts(raw, ctx.modelId),
    requiredEnv: ["OPENAI_API_KEY"],
  });
}
