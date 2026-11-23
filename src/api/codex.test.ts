// The Codex readers, against a `codex exec --json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { CODEX_REASONING_EFFORTS, codex, codexReply, codexTokenCosts } from "./codex.ts";
import { declaredBy } from "./declarations.ts";
import { OPENROUTER } from "./harnessOptions.ts";

const RESULT = await Bun.file(`${import.meta.dir}/codex.result.jsonl`).text();

describe("codexReply", () => {
  test("is the last completed agent message with text, skipping empty ones and lines that aren't JSON", () => {
    expect(codexReply(RESULT)).toBe("pong");
    expect(codexReply(`warning: something\n${RESULT}{"type":"item.completed","item":{"type":"agent_message","text":"  "}}\n`)).toBe("pong");
  });

  test("throws when there is no agent message", () => {
    expect(() => codexReply("Error: rate limited")).toThrow();
    expect(() => codexReply('{"type":"turn.started"}')).toThrow();
  });
});

describe("codexTokenCosts", () => {
  test("sums every turn, taking the cached tokens out of the input, as one entry for the model ID", () => {
    expect(codexTokenCosts(RESULT, "openai/gpt-5.5")).toEqual({
      outcome: "collected",
      models: [{ model: "openai/gpt-5.5", inputTokens: 400, outputTokens: 45, cacheReadTokens: 2100, cacheCreationTokens: 0 }],
    });
  });

  test("a run with no turn.completed, or no tokens, is notReported", () => {
    expect(codexTokenCosts("", "m")).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(codexTokenCosts('{"type":"turn.completed","usage":{"input_tokens":0,"output_tokens":0}}', "m")).toEqual({
      outcome: "unavailable",
      reason: "notReported",
    });
  });
});

const fragment = (harness: ReturnType<typeof codex>, modelId: string, model: Record<string, string> = {}) =>
  harness.applyParameter(undefined, { dir: "parameters/harness", version: "0.166.0", modelId, model, resolved: undefined });

describe("codex", () => {
  const harness = codex({ version: "0.166.0" });

  test("is a harness declaration, pinning its version, needing OPENAI_API_KEY, and reading with the library's readers", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("0.166.0");
    expect(harness.requiredEnv).toEqual(["OPENAI_API_KEY"]);
    expect(harness.collectReply?.(RESULT)).toBe("pong");
    expect(harness.collectTokenCosts?.(RESULT, { version: "0.166.0", modelId: "gpt-5.5" })).toEqual(codexTokenCosts(RESULT, "gpt-5.5"));
  });

  test("installs Codex as root, writes the model and run script, then runs as node", () => {
    expect(fragment(harness, "gpt-5.5")).toBe(
      `RUN npm install -g @openai/codex@0.166.0
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt
gpt-5.5
THUNDERJAR_EOF
COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh
#!/bin/sh
codex exec --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json
THUNDERJAR_EOF
USER node`,
    );
  });

  test("its default models declare the reasoning effort as a variant, passed as model_reasoning_effort", () => {
    expect(CODEX_REASONING_EFFORTS).toEqual(["low", "medium", "high"]);
    expect(Object.values(harness.models)).toEqual(Object.keys(harness.models).map(() => [{ reasoningEffort: { values: CODEX_REASONING_EFFORTS } }]));
    expect(fragment(harness, "gpt-5.5", { reasoningEffort: "high" })).toContain(`\ncodex exec -c model_reasoning_effort=high --model "$(cat /thunderjar/model.txt)" --json`);
  });

  test("sets up a provider as a model_providers entry, named by its name or host, on the Responses API, needing only its key", () => {
    const openRouter = codex({ version: "0.166.0", provider: OPENROUTER, models: { "openai/gpt-6-luna": [{ reasoningEffort: { values: CODEX_REASONING_EFFORTS } }] } });
    const custom = codex({ version: "0.166.0", provider: { baseUrl: "https://llm.example.com/v1", apiKeyEnv: "EXAMPLE_API_KEY" }, models: { "big-model": [] } });

    expect(openRouter.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
    expect(fragment(openRouter, "openai/gpt-6-luna", { reasoningEffort: "medium" })).toContain(
      `\ncodex exec -c model_provider=openrouter -c 'model_providers.openrouter={name="OpenRouter",base_url="https://openrouter.ai/api/v1",env_key="OPENROUTER_API_KEY",wire_api="responses"}' -c model_reasoning_effort=medium --model "$(cat /thunderjar/model.txt)" --json`,
    );
    expect(custom.requiredEnv).toEqual(["EXAMPLE_API_KEY"]);
    expect(fragment(custom, "big-model")).toContain(
      `\ncodex exec -c model_provider=example -c 'model_providers.example={name="example",base_url="https://llm.example.com/v1",env_key="EXAMPLE_API_KEY",wire_api="responses"}' --model`,
    );
  });

  test("its command is a function of the model, version, paths and provider", () => {
    const custom = codex({
      version: "0.166.0",
      provider: OPENROUTER,
      models: { "openai/gpt-6-luna": [] },
      command: (ctx) => `echo ${ctx.version} ${ctx.modelId} ${ctx.provider?.wireApi} ${ctx.provider?.baseUrl} > ${ctx.paths.result}`,
    });

    expect(fragment(custom, "openai/gpt-6-luna")).toContain(
      "#!/bin/sh\necho 0.166.0 openai/gpt-6-luna responses https://openrouter.ai/api/v1 > /thunderjar/result.json\n",
    );
  });

  test("its required variables can be replaced", () => {
    expect(codex({ version: "0.166.0", requiredEnv: [{ oneOf: ["CODEX_API_KEY", "OPENAI_API_KEY"] }] }).requiredEnv).toEqual([{ oneOf: ["CODEX_API_KEY", "OPENAI_API_KEY"] }]);
  });
});
