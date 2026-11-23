// The OpenCode readers, against an `opencode run --format json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { declaredBy } from "./declarations.ts";
import { OPENROUTER } from "./harnessOptions.ts";
import { opencode, opencodeReply, opencodeTokenCosts } from "./opencode.ts";

const RESULT = await Bun.file(`${import.meta.dir}/opencode.result.jsonl`).text();

describe("opencodeReply", () => {
  test("is the text of the last step, skipping lines that aren't JSON", () => {
    expect(opencodeReply(RESULT)).toBe("pong");
    expect(opencodeReply(`warning\n${RESULT}`)).toBe("pong");
  });

  test("throws when there is no text event", () => {
    expect(() => opencodeReply("Error: rate limited")).toThrow();
    expect(() => opencodeReply('{"type":"step_start"}')).toThrow();
  });
});

describe("opencodeTokenCosts", () => {
  test("sums every step, adding reasoning to the output, with OpenCode's own cost estimate", () => {
    expect(opencodeTokenCosts(RESULT, "openrouter/x")).toEqual({
      outcome: "collected",
      models: [
        { model: "openrouter/x", inputTokens: 1200, outputTokens: 65, cacheReadTokens: 1500, cacheCreationTokens: 500, costUsd: 0.003, costBasis: "list" },
      ],
    });
  });

  test("no events is unparseable; events but no finished step, e.g. a first model call that failed, notReported; a step missing its tokens unparseable", () => {
    expect(opencodeTokenCosts("Error: something went wrong", "m")).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(opencodeTokenCosts('{"type":"error","error":{"name":"APIError","data":{"statusCode":402}}}', "m")).toEqual({ outcome: "unavailable", reason: "notReported" });
    expect(opencodeTokenCosts('{"type":"step_finish","part":{}}', "m")).toEqual({ outcome: "unavailable", reason: "unparseable" });
  });
});

const fragment = (harness: ReturnType<typeof opencode>, modelId: string, model: Record<string, string | number> = {}) =>
  harness.applyParameter(undefined, { dir: "parameters/harness", version: "1.19.5", modelId, model, resolved: undefined });



/** The run script `harness` writes for `modelId`, without its `#!/bin/sh` line. */
const runScript = (harness: ReturnType<typeof opencode>, modelId: string, model: Record<string, string | number> = {}) =>
  /\n#!\/bin\/sh\n([\s\S]*?)\nTHUNDERJAR_EOF\n/.exec(fragment(harness, modelId, model))?.[1];

describe("opencode", () => {
  const harness = opencode({ version: "1.19.5" });

  test("is a harness declaration on OpenCode Zen, pinning its version, needing OPENCODE_API_KEY, and reading with the library's readers", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("1.19.5");
    expect(harness.requiredEnv).toEqual(["OPENCODE_API_KEY"]);
    expect(Object.keys(harness.models)).toEqual(["opencode/claude-haiku-5-5", "opencode/gpt-5.5"]);
    expect(harness.collectReply?.(RESULT)).toBe("pong");
    expect(harness.collectTokenCosts?.(RESULT, { version: "1.19.5", modelId: "opencode/gpt-5.5" })).toEqual(opencodeTokenCosts(RESULT, "opencode/gpt-5.5"));
  });

  test("installs OpenCode as root and its plugin package as node, writes the model and run script, then runs as node", () => {
    expect(fragment(harness, "opencode/gpt-5.5")).toBe(
      `RUN npm install -g opencode-ai@1.19.5
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node
RUN mkdir -p ~/.config/opencode && cd ~/.config/opencode && echo '{"dependencies":{"@opencode-ai/plugin":"1.19.5"}}' > package.json && npm install --no-audit --no-fund && npm cache clean --force
USER root
COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt
opencode/gpt-5.5
THUNDERJAR_EOF
COPY --chmod=755 <<'THUNDERJAR_EOF' /thunderjar/thunderjar-run.sh
#!/bin/sh
OPENCODE_PERMISSION='{"external_directory":"allow"}' opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json
THUNDERJAR_EOF
USER node`,
    );
  });

  test("writes a model's own config, its options and limit, into OpenCode's config for that model, a variant in them adding a name part", () => {
    const configured = opencode({
      version: "1.19.5",
      models: { "opencode/gpt-5.5": [{ options: { reasoningEffort: { values: ["low", "high"] } } }, { limit: { context: 200000 } }] },
    });

    expect(configured.models).toEqual({ "opencode/gpt-5.5": [{ "options.reasoningEffort": { values: ["low", "high"] } }, { "limit.context": 200000 }] });
    expect(runScript(configured, "opencode/gpt-5.5", { "options.reasoningEffort": "high", "limit.context": 200000 })).toBe(
      `OPENCODE_PERMISSION='{"external_directory":"allow"}' OPENCODE_CONFIG_CONTENT='{"provider":{"opencode":{"models":{"gpt-5.5":{"options":{"reasoningEffort":"high"},"limit":{"context":200000}}}}}}' opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
    );
  });

  describe("with a provider", () => {
    test("sets up OpenRouter as an OpenAI-compatible provider on Chat Completions, in OPENCODE_CONFIG_CONTENT, its key as {env:…}", () => {
      const openRouter = opencode({
        version: "1.19.5",
        provider: OPENROUTER,
        models: { "openrouter/openai/gpt-5.5": [{ options: { reasoningEffort: { values: ["low", "high"] } } }] },
      });

      expect(openRouter.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
      expect(runScript(openRouter, "openrouter/openai/gpt-5.5", { "options.reasoningEffort": "low" })).toBe(
        `OPENCODE_PERMISSION='{"external_directory":"allow"}' OPENCODE_CONFIG_CONTENT='{"provider":{"openrouter":{"npm":"@ai-sdk/openai-compatible","name":"OpenRouter","options":{"baseURL":"https://openrouter.ai/api/v1","apiKey":"{env:OPENROUTER_API_KEY}"},"models":{"openai/gpt-5.5":{"options":{"reasoningEffort":"low"}}}}}}' opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
      );
    });
  });
});
