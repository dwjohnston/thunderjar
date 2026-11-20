// The OpenCode readers, against an `opencode run --format json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { declaredBy } from "./declarations.ts";
import { opencode, opencodeReply, opencodeTokenCosts } from "./opencode.ts";

const REAL = await Bun.file(`${import.meta.dir}/opencode.result.jsonl`).text();

describe("opencodeReply", () => {
  test("is the text of the last step", () => {
    expect(opencodeReply(REAL)).toBe("pong");
  });

  test("skips lines that aren't JSON", () => {
    expect(opencodeReply(`warning\n${REAL}`)).toBe("pong");
  });

  test("throws when there is no text event", () => {
    expect(() => opencodeReply("Error: rate limited")).toThrow();
    expect(() => opencodeReply('{"type":"step_start"}')).toThrow();
  });
});

describe("opencodeTokenCosts", () => {
  test("sums every step, adding reasoning to the output", () => {
    expect(opencodeTokenCosts(REAL, "openrouter/x")).toEqual({
      outcome: "collected",
      models: [
        { model: "openrouter/x", inputTokens: 1200, outputTokens: 65, cacheReadTokens: 1500, cacheCreationTokens: 500, costUsd: 0.003, costBasis: "list" },
      ],
    });
  });

  test("no events is unparseable; events but no finished step is notReported", () => {
    expect(opencodeTokenCosts("", "m")).toEqual({ outcome: "unavailable", reason: "unparseable" });
    expect(opencodeTokenCosts('{"type":"step_start"}', "m")).toEqual({ outcome: "unavailable", reason: "notReported" });
  });

  test("a step missing its tokens is unparseable", () => {
    expect(opencodeTokenCosts('{"type":"step_finish","part":{}}', "m")).toEqual({ outcome: "unavailable", reason: "unparseable" });
  });
});

describe("opencode", () => {
  const harness = opencode({ version: "1.19.5" });
  const ctx = { dir: "parameters/harness", version: "1.19.5", modelId: "opencode/gpt-5.5", resolved: undefined };

  test("is a harness declaration, pinning its version, and needing OPENCODE_API_KEY", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("1.19.5");
    expect(harness.requiredEnv).toEqual(["OPENCODE_API_KEY"]);
  });

  test("installs OpenCode and its plugin package, writes the model and run script, then runs as node", () => {
    const fragment = harness.applyParameter(undefined, ctx);
    expect(fragment).toStartWith("RUN npm install -g opencode-ai@1.19.5\nRUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar\nUSER node\n");
    expect(fragment).toContain('"@opencode-ai/plugin":"1.19.5"');
    expect(fragment).toContain("opencode/gpt-5.5");
    expect(fragment).toContain('opencode run --model "$(cat /thunderjar/model.txt)" --format json');
    expect(fragment).toEndWith("USER node");
  });

  test("reads its reply and token costs with the library's readers", () => {
    expect(harness.collectReply?.(REAL)).toBe("pong");
    expect(harness.collectTokenCosts?.(REAL, { version: "1.19.5", modelId: "m" })).toEqual(opencodeTokenCosts(REAL, "m"));
  });

  test("its command and required env can be replaced", () => {
    const custom = opencode({ version: "1.19.5", command: "opencode run hi > /thunderjar/result.json", requiredEnv: ["OPENROUTER_API_KEY"] });
    expect(custom.applyParameter(undefined, ctx)).toContain("#!/bin/sh\nopencode run hi > /thunderjar/result.json\n");
    expect(custom.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
  });
});
