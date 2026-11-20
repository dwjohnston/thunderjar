// Reading what `copilot --output-format json` writes: JSON lines, one event each, and the usage
// line the run script appends. For a harness's `collectReply` and `collectTokenCosts`, so a
// Copilot harness needn't parse it itself, and `copilot`, a whole Copilot harness.
//
// Copilot's JSONL output leaves out its token events, so the run script also has it write its
// usage statistics to a file, and appends them to the result file as one more line:
// {"type":"thunderjar.usage","data":<the usage file>}.
import { declareHarness, type HarnessDeclaration, type ModelTokenCosts, type RequiredEnv, type TokenCosts } from "./declarations.ts";
import { MODEL_PATH, PROMPT_PATH, RESULT_PATH, writeModel, writeRunScript } from "./files.ts";

const USAGE_TYPE = "thunderjar.usage";
const USAGE_FILE = "/tmp/copilot-usage.json";

type Event = { type?: unknown; agentId?: unknown; data?: Record<string, unknown> };

/** Each JSON line of a result file. Lines that aren't JSON objects are skipped. */
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

/** The main agent's last message with text: its final reply. Sub-agents' messages have an agentId. Throws if there is none. */
export function copilotReply(raw: string): string {
  const messages = events(raw).filter((e) => e.type === "assistant.message" && e.agentId === undefined);
  const reply = messages.map((e) => e.data?.content).findLast((content) => typeof content === "string" && content.trim() !== "");
  if (typeof reply !== "string") throw new Error("no assistant.message with content in Copilot's JSONL output");
  return reply;
}

/**
 * Tokens per model, from the usage line the run script appended. Copilot's `inputTokens` include
 * cached reads and writes, so they're subtracted to fit Thunderjar's separate buckets. Its `cost`
 * is a premium-request multiplier, not dollars, so no cost is reported. `unparseable` without a
 * usage line, `notReported` if it counts no tokens.
 */
export function copilotTokenCosts(raw: string): TokenCosts {
  const usage = events(raw).findLast((e) => e.type === USAGE_TYPE)?.data;
  const metrics = usage?.modelMetrics;
  if (typeof metrics !== "object" || metrics === null) return { outcome: "unavailable", reason: "unparseable" };
  const models: ModelTokenCosts[] = [];
  for (const [model, metric] of Object.entries(metrics as Record<string, { usage?: Record<string, unknown> }>)) {
    const [input, output, cacheRead, cacheWrite] = ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"].map((k) => count(metric.usage?.[k]));
    if ([input, output, cacheRead, cacheWrite].some((n) => n === undefined)) return { outcome: "unavailable", reason: "unparseable" };
    models.push({
      model,
      inputTokens: Math.max(0, input! - cacheRead! - cacheWrite!),
      outputTokens: output!,
      cacheReadTokens: cacheRead!,
      cacheCreationTokens: cacheWrite!,
    });
  }
  const total = models.reduce((sum, m) => sum + m.inputTokens + m.outputTokens + m.cacheCreationTokens + m.cacheReadTokens, 0);
  if (total === 0) return { outcome: "unavailable", reason: "notReported" };
  const apiDurationMs = count(usage?.totalApiDurationMs);
  return { outcome: "collected", models, ...(apiDurationMs !== undefined && { apiDurationMs }) };
}

/** What `copilot` gets. */
export type CopilotOptions = {
  /** The version of `@github/copilot` to install, e.g. `"1.0.105"`. */
  version: string;
  /**
   * Replaces the command its run script runs: `COPILOT_COMMAND` is the default. A function gets the
   * model ID, for settings that depend on it. It must write Copilot's JSON lines to the result file
   * and its usage statistics to `COPILOT_USAGE_FILE`, as `COPILOT_COMMAND` does.
   */
  command?: string | ((ctx: { modelId: string }) => string);
  /** Replaces the environment variables it needs: `["COPILOT_GITHUB_TOKEN"]` is the default. */
  requiredEnv?: RequiredEnv[];
};

/** Where Copilot is told to write its usage statistics. */
export const COPILOT_USAGE_FILE = USAGE_FILE;

/**
 * The command that runs Copilot: the prompt and model read from their files, so quotes and newlines
 * reach the agent intact, its events as JSON lines. `env` are assignments put before it, e.g. to
 * point it at another provider. Copilot's exit code is kept as the script's, after the usage line
 * is appended.
 */
export const copilotCommand = (env = "") =>
  `rm -f ${USAGE_FILE}; ${env}${env ? " " : ""}` +
  `copilot -p "$(cat ${PROMPT_PATH})" --model "$(cat ${MODEL_PATH})" --allow-all-tools --no-color` +
  ` --output-format json --usage-output-file ${USAGE_FILE} > ${RESULT_PATH}; code=$?; ` +
  `[ -f ${USAGE_FILE} ] && printf '{"type":"${USAGE_TYPE}","data":%s}\\n' "$(tr -d '\\n' < ${USAGE_FILE})" >> ${RESULT_PATH}; ` +
  `exit $code`;

/** The default command: `copilotCommand()`, authenticated by `COPILOT_GITHUB_TOKEN`. */
export const COPILOT_COMMAND = copilotCommand();

/**
 * A complete harness declaration for Copilot `version`. Its fragment installs Copilot as root, runs
 * it once as the image's non-root `node` user so it unpacks itself into the image rather than on
 * every run, writes the model ID and the run script, then switches to `node`. Its reply and token
 * costs are read from its JSON lines and usage line. It needs `COPILOT_GITHUB_TOKEN`; to run it on
 * another provider, pass its `command` and `requiredEnv`.
 *
 * ```ts
 * // harnessModels/copilot-1.0.105/index.ts
 * export default copilot({ version: "1.0.105" });
 * ```
 */
export function copilot({ version, command = COPILOT_COMMAND, requiredEnv = ["COPILOT_GITHUB_TOKEN"] }: CopilotOptions): HarnessDeclaration<undefined, undefined> {
  return declareHarness({
    version,
    applyParameter: (_config, ctx) =>
      [
        `RUN npm install -g @github/copilot@${ctx.version}`,
        "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
        // As `node`, Copilot is run once, so it unpacks itself into ~/.cache/copilot in the image.
        // Otherwise every run does: 500 MB in each postrun image, to commit and push. Before the
        // model is written, so every model's image shares the layer.
        "USER node",
        "RUN copilot --version",
        "USER root",
        writeModel(ctx.modelId),
        writeRunScript(typeof command === "function" ? command({ modelId: ctx.modelId }) : command),
        "USER node",
      ].join("\n"),
    collectReply: copilotReply,
    collectTokenCosts: copilotTokenCosts,
    requiredEnv,
  });
}
