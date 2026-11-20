// The Copilot readers, against a `copilot --output-format json` result: JSON lines, one event each,
// with the usage line the run script appended.
import { describe, expect, test } from "bun:test";
import { copilot, copilotReply, copilotTokenCosts } from "./copilot.ts";
import { declaredBy } from "./declarations.ts";

const REAL = await Bun.file(`${import.meta.dir}/copilot.result.jsonl`).text();

describe("copilotReply", () => {
  test("is the main agent's last message with text, not a sub-agent's", () => {
    expect(copilotReply(REAL)).toBe("pong");
  });

  test("throws when there is no assistant message", () => {
    expect(() => copilotReply("Error: rate limited")).toThrow();
    expect(() => copilotReply('{"type":"session.start"}')).toThrow();
  });
});

describe("copilotTokenCosts", () => {
  test("takes the cached tokens out of the input, and reports no dollars", () => {
    expect(copilotTokenCosts(REAL)).toEqual({
      outcome: "collected",
      models: [{ model: "claude-haiku-5.5", inputTokens: 500, outputTokens: 50, cacheReadTokens: 2000, cacheCreationTokens: 500 }],
      apiDurationMs: 4200,
    });
  });

  test("a result without the usage line is unparseable, and one with no tokens notReported", () => {
    expect(copilotTokenCosts('{"type":"assistant.message","data":{"content":"hi"}}')).toEqual({ outcome: "unavailable", reason: "unparseable" });
    const none = '{"type":"thunderjar.usage","data":{"modelMetrics":{"m":{"usage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"cacheWriteTokens":0}}}}}';
    expect(copilotTokenCosts(none)).toEqual({ outcome: "unavailable", reason: "notReported" });
  });
});

describe("copilot", () => {
  const harness = copilot({ version: "1.0.105" });
  const ctx = { dir: "parameters/harness", version: "1.0.105", modelId: "claude-haiku-5.5", resolved: undefined };

  test("is a harness declaration, pinning its version, and needing COPILOT_GITHUB_TOKEN", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("1.0.105");
    expect(harness.requiredEnv).toEqual(["COPILOT_GITHUB_TOKEN"]);
  });

  test("installs and warms up Copilot as node, writes the model and a run script that appends the usage", () => {
    const fragment = harness.applyParameter(undefined, ctx);
    expect(fragment).toStartWith(
      `RUN npm install -g @github/copilot@1.0.105
RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar
USER node
RUN copilot --version
USER root
COPY <<'THUNDERJAR_EOF' /thunderjar/model.txt
claude-haiku-5.5
THUNDERJAR_EOF
`,
    );
    expect(fragment).toEndWith("USER node");
    expect(fragment).toContain(`copilot -p "$(cat /thunderjar/prompt.txt)" --model "$(cat /thunderjar/model.txt)" --allow-all-tools --no-color --output-format json --usage-output-file /tmp/copilot-usage.json > /thunderjar/result.json; code=$?;`);
    expect(fragment).toContain("thunderjar.usage");
    expect(fragment).toContain("exit $code");
  });

  test("reads its reply and token costs with the library's readers", () => {
    expect(harness.collectReply?.(REAL)).toBe("pong");
    expect(harness.collectTokenCosts?.(REAL, { version: "1.0.105", modelId: "m" })).toEqual(copilotTokenCosts(REAL));
  });

  test("its command, given the model ID, and required env can be replaced", () => {
    const custom = copilot({ version: "1.0.105", command: ({ modelId }) => `copilot ${modelId} > /thunderjar/result.json`, requiredEnv: ["OPENROUTER_API_KEY"] });

    expect(custom.applyParameter(undefined, ctx)).toContain("#!/bin/sh\ncopilot claude-haiku-5.5 > /thunderjar/result.json\n");
    expect(custom.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
  });
});
