// The Codex readers, against a `codex exec --json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { CODEX_REASONING_EFFORTS, codex, codexReply, codexSkillsInvoked, codexTokenCosts, collectCodexSkillsInvoked } from "./codex.ts";
import { declaredBy } from "./declarations.ts";
import { OPENROUTER } from "./harnessOptions.ts";

const RESULT = await Bun.file(`${import.meta.dir}/codex.result.jsonl`).text();
// Codex 0.166.0 asked about a.ts in src/gauntlet/nested-skills, its model a scripted Responses API
// server, so the commands are fixed: it reads the base skill, then the a skill and a.ts in one.
const SKILLS_RESULT = await Bun.file(`${import.meta.dir}/codex.skills.result.jsonl`).text();

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

/** A command Codex ran, as `codex exec --json` reports it once done. */
const ran = (command: string) => JSON.stringify({ type: "item.completed", item: { id: "item_0", type: "command_execution", command, aggregated_output: "", exit_code: 0, status: "completed" } });

describe("codexSkillsInvoked", () => {
  test("is each skill whose SKILL.md a command read, once, in the order first read", () => {
    expect(codexSkillsInvoked(SKILLS_RESULT)).toEqual(["base", "a"]);
  });

  test("names a skill by its folder, wherever the folder is", () => {
    const raw = [ran("/bin/bash -lc 'cat ~/.codex/skills/.system/imagegen/SKILL.md'"), ran("/bin/bash -lc 'head -50 \"/workspace/.agents/skills/my-skill/SKILL.md\"'")].join("\n");
    expect(codexSkillsInvoked(raw)).toEqual(["imagegen", "my-skill"]);
  });

  test("skips commands that only list skills, and other events", () => {
    const raw = [ran("/bin/bash -lc 'ls .agents/skills/*/SKILL.md'"), ran("/bin/bash -lc \"find . -name SKILL.md\""), JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "see a/SKILL.md" } })].join("\n");
    expect(codexSkillsInvoked(raw)).toEqual([]);
  });
});

describe("collectCodexSkillsInvoked", () => {
  const ctx = (harnessResult: string) => ({ exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }), readFile: async () => "", harnessResult, workdir: "/workspace" });

  test("reads them from the result", async () => {
    expect(await collectCodexSkillsInvoked(ctx(SKILLS_RESULT))).toEqual(["base", "a"]);
  });

  test("throws when the result has no events, so the run is skipped, not counted as invoking none", async () => {
    await expect(collectCodexSkillsInvoked(ctx("Error: rate limited"))).rejects.toThrow("no events");
  });
});

const fragment = (harness: ReturnType<typeof codex>, modelId: string, model: Record<string, string> = {}) =>
  harness.applyParameter(undefined, { dir: "parameters/harness", version: "0.166.0", modelId, model, resolved: undefined });

/** The run script `harness` writes for `modelId`, without its `#!/bin/sh` line. */
const runScript = (harness: ReturnType<typeof codex>, modelId: string, model: Record<string, string> = {}) =>
  /\n#!\/bin\/sh\n([\s\S]*?)\nTHUNDERJAR_EOF\n/.exec(fragment(harness, modelId, model))?.[1];

describe("codex", () => {
  const harness = codex({ version: "0.166.0" });

  test("is a harness declaration, pinning its version, needing OPENAI_API_KEY, and reading with the library's readers", () => {
    expect(declaredBy(harness)).toBe("declareHarness");
    expect(harness.version).toBe("0.166.0");
    expect(harness.requiredEnv).toEqual(["OPENAI_API_KEY"]);
    expect(harness.collectReply?.(RESULT)).toBe("pong");
    expect(harness.collectTokenCosts?.(RESULT, { version: "0.166.0", modelId: "gpt-5.5" })).toEqual(codexTokenCosts(RESULT, "gpt-5.5"));
    expect(harness.collectSkillsInvoked).toBe(collectCodexSkillsInvoked);
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
    expect(runScript(harness, "gpt-5.5", { reasoningEffort: "high" })).toBe(
      `codex exec -c model_reasoning_effort=high --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
    );
  });

  test("sets up OpenRouter as a model_providers entry, on the Responses API, needing only its key", () => {
    const openRouter = codex({ version: "0.166.0", provider: OPENROUTER, models: { "openai/gpt-6-luna": [{ reasoningEffort: { values: CODEX_REASONING_EFFORTS } }] } });

    expect(openRouter.requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
    expect(runScript(openRouter, "openai/gpt-6-luna", { reasoningEffort: "medium" })).toBe(
      `codex exec -c model_provider=openrouter -c 'model_providers.openrouter={name="OpenRouter",base_url="https://openrouter.ai/api/v1",env_key="OPENROUTER_API_KEY",wire_api="responses"}' -c model_reasoning_effort=medium --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
    );
  });

  test("names a custom provider's entry after its host, without a name", () => {
    const custom = codex({ version: "0.166.0", provider: { baseUrl: "https://llm.example.com/v1", apiKeyEnv: "EXAMPLE_API_KEY" }, models: { "big-model": [] } });

    expect(custom.requiredEnv).toEqual(["EXAMPLE_API_KEY"]);
    expect(runScript(custom, "big-model")).toBe(
      `codex exec -c model_provider=example -c 'model_providers.example={name="example",base_url="https://llm.example.com/v1",env_key="EXAMPLE_API_KEY",wire_api="responses"}' --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
    );
  });

  test("its command is a function of the model, version, paths and provider", () => {
    const custom = codex({
      version: "0.166.0",
      provider: OPENROUTER,
      models: { "openai/gpt-6-luna": [] },
      command: (ctx) => `echo ${ctx.version} ${ctx.modelId} ${ctx.provider?.wireApi} ${ctx.provider?.baseUrl} > ${ctx.paths.result}`,
    });

    expect(runScript(custom, "openai/gpt-6-luna")).toBe("echo 0.166.0 openai/gpt-6-luna responses https://openrouter.ai/api/v1 > /thunderjar/result.json");
  });

  test("its required variables can be replaced", () => {
    expect(codex({ version: "0.166.0", requiredEnv: [{ oneOf: ["CODEX_API_KEY", "OPENAI_API_KEY"] }] }).requiredEnv).toEqual([{ oneOf: ["CODEX_API_KEY", "OPENAI_API_KEY"] }]);
  });
});
