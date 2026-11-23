// The Copilot readers, against a `copilot --output-format json` result: JSON lines, one event each,
// with the usage line the run script appended.
import { describe, expect, test } from "bun:test";
import { copilot, copilotReply, copilotTokenCosts } from "./copilot.ts";
import { declaredBy } from "./declarations.ts";
import { OPENROUTER } from "./harnessOptions.ts";

const RESULT = await Bun.file(`${import.meta.dir}/copilot.result.jsonl`).text();

describe("copilotReply", () => {
  test("is the main agent's last message with text, not a sub-agent's", () => {
    expect(copilotReply(RESULT)).toBe("pong");
  });

  test("throws when there is no assistant message", () => {
    expect(() => copilotReply("Error: rate limited")).toThrow();
    expect(() => copilotReply('{"type":"session.start"}')).toThrow();
  });
});

describe("copilotTokenCosts", () => {
  test("reads each model's tokens from the usage line, taking the cached ones out of the input, and reports no dollars", () => {
    expect(copilotTokenCosts(RESULT)).toEqual({
      outcome: "collected",
      models: [{ model: "claude-haiku-5.5", inputTokens: 500, outputTokens: 50, cacheReadTokens: 2000, cacheCreationTokens: 500 }],
      apiDurationMs: 4200,
    });
  });

  test("a result without a readable usage line is unparseable, and one with no tokens notReported", () => {
    expect(copilotTokenCosts('{"type":"assistant.message","data":{"content":"hi"}}')).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(copilotTokenCosts('{"type":"thunderjar.usage","data":{"modelMetrics":{"m":{"usage":{"inputTokens":"many"}}}}}')).toEqual({ outcome: "unavailable", reason: "unparseable" });
    const none = '{"type":"thunderjar.usage","data":{"modelMetrics":{"m":{"usage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0}}}}}';
    expect(copilotTokenCosts(none)).toEqual({ outcome: "unavailable", reason: "notReported" });
  });
});

const fragment = (harness: ReturnType<typeof copilot>, modelId: string, model: Record<string, string> = {}) =>
  harness.applyParameter(undefined, { dir: "parameters/harness", version: "1.0.105", modelId, model, resolved: undefined });

describe("copilot", () => {
  const harness = copilot({ version: "1.0.105" });

  test("is a harness declaration, pinning its version, needing COPILOT_GITHUB_TOKEN, and reading with the library's readers", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("1.0.105");
    expect(harness.requiredEnv).toEqual(["COPILOT_GITHUB_TOKEN"]);
    expect(harness.collectReply?.(RESULT)).toBe("pong");
    expect(harness.collectTokenCosts?.(RESULT, { version: "1.0.105", modelId: "claude-haiku-5.5" })).toEqual(copilotTokenCosts(RESULT));
  });

  test("installs and unpacks Copilot as node, writes the model, and a run script that appends the usage line to the result", () => {
    expect(fragment(harness, "claude-haiku-5.5")).toBe(
      `RUN npm install -g @github/copilot@1.0.105
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node
RUN copilot --version
USER root
COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt
claude-haiku-5.5
THUNDERJAR_EOF
COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh
#!/bin/sh
rm -f /tmp/copilot-usage.json; copilot -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --allow-all-tools --no-color --output-format json --usage-output-file /tmp/copilot-usage.json > /thunderjar/result.json; code=$?; [ -f /tmp/copilot-usage.json ] && printf '{"type":"thunderjar.usage","data":%s}\\n' "$(tr -d '\\n' < /tmp/copilot-usage.json)" >> /thunderjar/result.json; exit $code
THUNDERJAR_EOF
USER node`,
    );
  });

  describe("with a provider", () => {
    const openRouter = copilot({ version: "1.0.105", provider: OPENROUTER, models: { "anthropic/claude-haiku-5.5": [], "openai/gpt-6.1-sol": [] } });

    test("passes it as COPILOT_PROVIDER_ variables, with the well-known model ID, needing only its key", () => {
      expect(openRouter.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
      expect(fragment(openRouter, "anthropic/claude-haiku-5.5")).toContain(
        `\nrm -f /tmp/copilot-usage.json; COPILOT_PROVIDER_BASE_URL=https://openrouter.ai/api/v1 COPILOT_PROVIDER_API_KEY="$OPENROUTER_API_KEY" COPILOT_PROVIDER_MODEL_ID=claude-haiku-5.5 copilot -p`,
      );
    });

    test("puts OpenAI's models on the Responses API, as OpenAI rejects Copilot's tool list on Chat Completions; a model's wireApi overrides it", () => {
      expect(fragment(openRouter, "openai/gpt-6.1-sol")).toContain("COPILOT_PROVIDER_MODEL_ID=gpt-6.1-sol COPILOT_PROVIDER_WIRE_API=responses copilot -p");
      expect(fragment(openRouter, "anthropic/claude-haiku-5.5", { wireApi: "responses" })).toContain("COPILOT_PROVIDER_WIRE_API=responses copilot -p");
      expect(fragment(openRouter, "openai/gpt-6.1-sol", { wireApi: "chat" })).toContain("COPILOT_PROVIDER_MODEL_ID=gpt-6.1-sol copilot -p");
    });

    test("passes a custom provider the same way", () => {
      const custom = copilot({ version: "1.0.105", provider: { baseUrl: "https://llm.example.com/v1", apiKeyEnv: "EXAMPLE_API_KEY" }, models: { "big-model": [] } });

      expect(custom.requiredEnv).toEqual(["EXAMPLE_API_KEY"]);
      expect(fragment(custom, "big-model")).toContain(
        `COPILOT_PROVIDER_BASE_URL=https://llm.example.com/v1 COPILOT_PROVIDER_API_KEY="$EXAMPLE_API_KEY" COPILOT_PROVIDER_MODEL_ID=big-model copilot -p`,
      );
    });
  });

  test("wraps a command override too: with --usage-output-file its usage line is appended, and without it the run still works, with no token costs", () => {
    const usage = copilot({ version: "1.0.105", command: ({ paths }) => `copilot -p hi --usage-output-file ${paths.usage} > ${paths.result}` });
    const noUsage = copilot({ version: "1.0.105", command: ({ paths }) => `copilot -p hi > ${paths.result}` });
    const append = `code=$?; [ -f /tmp/copilot-usage.json ] && printf '{"type":"thunderjar.usage","data":%s}\\n' "$(tr -d '\\n' < /tmp/copilot-usage.json)" >> /thunderjar/result.json; exit $code`;

    expect(fragment(usage, "gpt-5.5")).toContain(`\nrm -f /tmp/copilot-usage.json; copilot -p hi --usage-output-file /tmp/copilot-usage.json > /thunderjar/result.json; ${append}\n`);
    expect(fragment(noUsage, "gpt-5.5")).toContain(`\nrm -f /tmp/copilot-usage.json; copilot -p hi > /thunderjar/result.json; ${append}\n`);
    expect(copilotTokenCosts('{"type":"assistant.message","data":{"content":"pong"}}')).toEqual({ outcome: "unavailable", reason: "unparseable" });
  });
});
