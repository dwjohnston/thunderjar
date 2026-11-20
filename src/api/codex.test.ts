// The Codex readers, against a `codex exec --json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { codex, codexReply, codexTokenCosts } from "./codex.ts";
import { declaredBy } from "./declarations.ts";

const REAL = await Bun.file(`${import.meta.dir}/codex.result.jsonl`).text();

describe("codexReply", () => {
  test("is the last completed agent message with text", () => {
    expect(codexReply(REAL)).toBe("pong");
  });

  test("skips an empty final message and lines that aren't JSON", () => {
    const raw = `warning: something\n${REAL}{"type":"item.completed","item":{"type":"agent_message","text":"  "}}\n`;
    expect(codexReply(raw)).toBe("pong");
  });

  test("throws when there is no agent message", () => {
    expect(() => codexReply("Error: rate limited")).toThrow();
    expect(() => codexReply('{"type":"turn.started"}')).toThrow();
  });
});

describe("codexTokenCosts", () => {
  test("sums every turn, taking the cached tokens out of the input", () => {
    expect(codexTokenCosts(REAL, "openai/gpt-5.5")).toEqual({
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

describe("codex", () => {
  const harness = codex({ version: "0.166.0" });
  const ctx = { dir: "parameters/harness", version: "0.166.0", modelId: "gpt-5.5", resolved: undefined };

  test("is a harness declaration, pinning its version, and needing OPENAI_API_KEY", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("0.166.0");
    expect(harness.requiredEnv).toEqual(["OPENAI_API_KEY"]);
  });

  test("installs Codex as root, writes the model and run script, then runs as node", () => {
    expect(harness.applyParameter(undefined, ctx)).toBe(
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

  test("reads its reply and token costs with the library's readers, naming the model by its ID", () => {
    expect(harness.collectReply?.(REAL)).toBe("pong");
    expect(harness.collectTokenCosts?.(REAL, { version: "0.166.0", modelId: "gpt-5.5" })).toEqual(codexTokenCosts(REAL, "gpt-5.5"));
  });

  test("its command and required env can be replaced", () => {
    const custom = codex({ version: "0.166.0", command: "codex exec hi > /thunderjar/result.json", requiredEnv: ["OPENROUTER_API_KEY"] });

    expect(custom.applyParameter(undefined, ctx)).toContain("#!/bin/sh\ncodex exec hi > /thunderjar/result.json\n");
    expect(custom.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
  });
});
