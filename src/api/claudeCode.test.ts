// The Claude Code readers, against a real `claude -p --output-format json` result, from Claude Code
// 2.1.316 run on DeepSeek's Anthropic-compatible API, whose model its price table doesn't know.
import { describe, expect, test } from "bun:test";
import { CLAUDE_CODE_COMMAND, CLAUDE_CODE_EFFORTS, claudeCode, claudeCodeReply, claudeCodeTokenCosts } from "./claudeCode.ts";
import { declaredBy } from "./declarations.ts";
import { OPENROUTER } from "./harnessOptions.ts";

const REAL = await Bun.file(`${import.meta.dir}/claudeCode.deepseek.result.json`).text();

/** The real result, changed by `change`. */
const changed = (change: (result: Record<string, unknown>) => void) => {
  const result = JSON.parse(REAL) as Record<string, unknown>;
  change(result);
  return JSON.stringify(result);
};

describe("claudeCodeReply", () => {
  test("is the result's text", () => {
    expect(claudeCodeReply(REAL)).toBe("pong");
  });

  test("throws for anything else", () => {
    expect(() => claudeCodeReply("Error: rate limited")).toThrow();
    expect(() => claudeCodeReply('{"type":"system"}')).toThrow();
  });
});

describe("claudeCodeTokenCosts", () => {
  test("reads each model's four buckets, cost and cost basis from modelUsage, and the API duration", () => {
    expect(claudeCodeTokenCosts(REAL)).toEqual({
      outcome: "collected",
      models: [
        {
          model: "deepseek-chat",
          inputTokens: 11078,
          outputTokens: 3,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          costUsd: 0.044371999999999995,
          costBasis: "unknown",
        },
      ],
      apiDurationMs: 1293,
    });
  });

  test("reads modelUsage, not the flat usage, which leaves out what sub-agents spent", () => {
    const delegated = changed((result) => {
      (result.modelUsage as Record<string, unknown>)["claude-haiku-4-5"] = {
        inputTokens: 500,
        outputTokens: 40,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUSD: 0.0007,
        costBasis: "list",
      };
    });
    const costs = claudeCodeTokenCosts(delegated);
    expect(costs.outcome === "collected" && costs.models.map(({ model }) => model)).toEqual(["deepseek-chat", "claude-haiku-4-5"]);
  });

  test("a result that counted nothing, as a crashed session's, is notReported", () => {
    const zeroed = changed((result) => {
      result.modelUsage = { "deepseek-chat": { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 } };
    });
    expect(claudeCodeTokenCosts(zeroed)).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(claudeCodeTokenCosts(changed((result) => (result.modelUsage = {})))).toEqual({ outcome: "unavailable", reason: "notReported" });
  });

  test("anything that isn't a result is unparseable", () => {
    expect(claudeCodeTokenCosts("")).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(claudeCodeTokenCosts("Error: Invalid API key")).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(claudeCodeTokenCosts(changed((result) => delete result.modelUsage))).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(
      claudeCodeTokenCosts(changed((result) => ((result.modelUsage as Record<string, Record<string, unknown>>)["deepseek-chat"]!.inputTokens = "many"))),
    ).toEqual({ outcome: "unavailable", reason: "unparseable" });
  });
});

/** The run script `harness` writes for `modelId`, with `model`'s settings, without its `#!/bin/sh` line. */
const runScript = (harness: ReturnType<typeof claudeCode>, modelId: string, model: Record<string, string | number | boolean> = {}) =>
  /\n#!\/bin\/sh\n([\s\S]*?)\nTHUNDERJAR_EOF\n/.exec(harness.applyParameter(undefined, { dir: "parameters/harness", version: "2.1.311", modelId, model, resolved: undefined }))?.[1];

describe("claudeCode", () => {
  const harness = claudeCode({ version: "2.1.311" });

  test("is a harness declaration, pinning its version", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("2.1.311");
    expect(harness.requiredEnv).toEqual([{ oneOf: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"] }]);
  });

  test("without models, declares Anthropic's current ones, and takes a list in their place", () => {
    expect(Object.keys(harness.models)).toEqual(["claude-fable-5-2", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-haiku-4-5-20251001"]);
    expect(claudeCode({ version: "2.1.311", models: { "claude-haiku-5-5": [] } }).models).toEqual({ "claude-haiku-5-5": [] });
  });

  test("installs Claude Code as root, writes the model and run script, then runs as node", () => {
    expect(harness.applyParameter(undefined, { dir: "parameters/harness", version: "2.1.311", modelId: "claude-haiku-5-5", model: {}, resolved: undefined })).toBe(
      `RUN npm install -g @anthropic-ai/claude-code@2.1.311
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt
claude-haiku-5-5
THUNDERJAR_EOF
COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh
#!/bin/sh
claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --output-format json --dangerously-skip-permissions > /thunderjar/result.json
THUNDERJAR_EOF
USER node`,
    );
  });

  test("reads its reply and token costs with the library's readers", () => {
    expect(harness.collectReply?.(REAL)).toBe("pong");
    expect(harness.collectTokenCosts?.(REAL, { version: "2.1.311", modelId: "deepseek-v4-pro" })).toEqual(claudeCodeTokenCosts(REAL));
  });

  test("its command is a function of the model, version and paths", () => {
    const custom = claudeCode({
      version: "2.1.311",
      models: { m: [{ maxTurns: 60 }] },
      command: ({ modelId, model, version, paths, provider }) =>
        `claude-${version} --model ${modelId} --max-turns ${model.maxTurns} ${provider === undefined ? "own" : "other"} < ${paths.prompt} > ${paths.result}`,
    });

    expect(runScript(custom, "m", { maxTurns: 60 })).toBe("claude-2.1.311 --model m --max-turns 60 own < /thunderjar/prompt.txt > /thunderjar/result.json");
  });

  describe("with a provider", () => {
    test("passes a custom provider's address and key as Claude Code's, and needs only its key", () => {
      const deepseek = claudeCode({
        version: "2.1.311",
        provider: { baseUrl: "https://api.deepseek.com/anthropic", apiKeyEnv: "DEEPSEEK_API_KEY" },
        models: { "deepseek-chat": [] }, // DeepSeek's ID, as in the recorded result this file reads
      });

      expect(deepseek.requiredEnv).toEqual(["DEEPSEEK_API_KEY"]);
      expect(runScript(deepseek, "deepseek-chat")).toBe(
        `ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic ANTHROPIC_AUTH_TOKEN="$DEEPSEEK_API_KEY" ANTHROPIC_API_KEY='' claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --output-format json --dangerously-skip-permissions > /thunderjar/result.json`,
      );
    });

    test("passes OpenRouter's Anthropic-compatible address, not its OpenAI one", () => {
      const openRouter = claudeCode({ version: "2.1.311", provider: OPENROUTER, models: { "anthropic/claude-opus-5.5": [] } });

      expect(runScript(openRouter, "anthropic/claude-opus-5.5")).toBe(
        `ANTHROPIC_BASE_URL=https://openrouter.ai/api ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY" ANTHROPIC_API_KEY='' claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --output-format json --dangerously-skip-permissions > /thunderjar/result.json`,
      );
    });

    test("gives a command override the provider as Claude Code takes it", () => {
      const custom = claudeCode({
        version: "2.1.311",
        provider: OPENROUTER,
        models: { "anthropic/claude-opus-5.5": [] },
        command: ({ provider }) => `echo ${JSON.stringify(provider)}`,
      });

      expect(runScript(custom, "anthropic/claude-opus-5.5")).toBe(`echo {"baseUrl":"https://openrouter.ai/api","apiKeyEnv":"OPENROUTER_API_KEY","wireApi":"anthropic"}`);
    });
  });

  test("passes a model's effort setting as --effort, and none without one", () => {
    const efforts = claudeCode({ version: "2.1.311", models: { "claude-opus-5-5": [{ effort: { values: CLAUDE_CODE_EFFORTS } }], "claude-haiku-4-5-20251001": [] } });

    expect(CLAUDE_CODE_EFFORTS).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(runScript(efforts, "claude-opus-5-5", { effort: "xhigh" })).toBe(
      `claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --effort xhigh --output-format json --dangerously-skip-permissions > /thunderjar/result.json`,
    );
    expect(runScript(efforts, "claude-haiku-4-5-20251001")).toBe(
      `claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --output-format json --dangerously-skip-permissions > /thunderjar/result.json`,
    );
  });

  test("thinking tokens are bespoke: a command override adds MAX_THINKING_TOKENS to the default command", () => {
    const thinking = claudeCode({
      version: "2.1.311",
      provider: OPENROUTER,
      models: { "anthropic/claude-opus-5.5": [{ effort: { values: ["low", "high"] } }, { thinkingTokens: { values: [8000, 32000] } }] },
      command: (ctx) => `MAX_THINKING_TOKENS=${ctx.model.thinkingTokens} ${CLAUDE_CODE_COMMAND(ctx)}`,
    });

    expect(runScript(thinking, "anthropic/claude-opus-5.5", { effort: "high", thinkingTokens: 32000 })).toBe(
      `MAX_THINKING_TOKENS=32000 ANTHROPIC_BASE_URL=https://openrouter.ai/api ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY" ANTHROPIC_API_KEY='' claude -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --effort high --output-format json --dangerously-skip-permissions > /thunderjar/result.json`,
    );
  });

  test("its required variables can be replaced, e.g. for a command that needs more", () => {
    expect(claudeCode({ version: "2.1.311", requiredEnv: ["ANTHROPIC_API_KEY", "GITHUB_TOKEN"] }).requiredEnv).toEqual(["ANTHROPIC_API_KEY", "GITHUB_TOKEN"]);
  });
});
