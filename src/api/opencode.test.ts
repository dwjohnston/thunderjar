// The OpenCode readers, against an `opencode run --format json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { declaredBy } from "./declarations.ts";
import { OPENROUTER } from "./harnessOptions.ts";
import { collectOpenCodeSkillsInvoked, opencode, opencodeReply, opencodeSkillsInvoked, opencodeTokenCosts } from "./opencode.ts";

const RESULT = await Bun.file(`${import.meta.dir}/opencode.result.jsonl`).text();
// OpenCode 1.19.5 in src/gauntlet/nested-skills, on Claude Haiku 4.5: told to use the base and a
// skills, it found only base, from the root; and told to have a sub-agent load base, whose session
// isn't in the result, only its task call: `opencode export` printed it.
const SKILLS_RESULT = await Bun.file(`${import.meta.dir}/opencode.skills.result.jsonl`).text();
const SUBAGENT_RESULT = await Bun.file(`${import.meta.dir}/opencode.subagent.result.jsonl`).text();
const SUBAGENT_EXPORT = await Bun.file(`${import.meta.dir}/opencode.subagent.export.json`).text();
const SUBAGENT_SESSION = "ses_de88413e9ffeuBgcgfDXQyAfDE";

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

/** A tool part, as OpenCode writes it in a result's tool_use event and in an export's messages. */
const toolPart = (tool: string, input: Record<string, unknown>, sessionId?: string) => ({
  type: "tool",
  tool,
  state: { status: "completed", input, ...(sessionId && { metadata: { sessionId } }) },
});

/** What `opencode export` prints for a session made of `parts`. */
const exported = (...parts: object[]) => JSON.stringify({ info: { id: "ses_x" }, messages: [{ info: { role: "assistant" }, parts }] });

describe("opencodeSkillsInvoked", () => {
  test("is each skill the skill tool was called with, in the result, once, in the order first called", () => {
    expect(opencodeSkillsInvoked(SKILLS_RESULT)).toEqual(["base"]);
    const raw = [toolPart("skill", { name: "a" }), toolPart("read", { filePath: "a.ts" }), toolPart("skill", { name: "b" }), toolPart("skill", { name: "a" })]
      .map((part) => JSON.stringify({ type: "tool_use", part }))
      .join("\n");
    expect(opencodeSkillsInvoked(raw)).toEqual(["a", "b"]);
  });

  test("doesn't see a sub-agent's, whose session isn't in the result", () => {
    expect(opencodeSkillsInvoked(SUBAGENT_RESULT)).toEqual([]);
  });
});

describe("collectOpenCodeSkillsInvoked", () => {
  const ctx = (harnessResult: string, sessions: Record<string, string> = {}) => {
    const ran: string[] = [];
    const exec = async (command: string) => {
      ran.push(command);
      const output = sessions[command.replace("opencode export ", "")];
      return output === undefined ? { stdout: "", stderr: "Session not found", exitCode: 1 } : { stdout: output, stderr: "", exitCode: 0 };
    };
    return { ran, ctx: { exec, readFile: async () => "", harnessResult, workdir: "/workspace" } };
  };

  test("is the main agent's, with no sub-agents to export", async () => {
    const { ran, ctx: c } = ctx(SKILLS_RESULT);
    expect(await collectOpenCodeSkillsInvoked(c)).toEqual(["base"]);
    expect(ran).toEqual([]);
  });

  test("adds a sub-agent's, exporting its session", async () => {
    const { ran, ctx: c } = ctx(SUBAGENT_RESULT, { [SUBAGENT_SESSION]: SUBAGENT_EXPORT });
    expect(await collectOpenCodeSkillsInvoked(c)).toEqual(["base"]);
    expect(ran).toEqual([`opencode export ${SUBAGENT_SESSION}`]);
  });

  test("adds each sub-agent's own sub-agents', each session exported once", async () => {
    const { ran, ctx: c } = ctx(SUBAGENT_RESULT, {
      [SUBAGENT_SESSION]: exported(toolPart("skill", { name: "b" }), toolPart("task", { prompt: "go on" }, "ses_nested")),
      ses_nested: exported(toolPart("skill", { name: "a" }), toolPart("skill", { name: "b" }), toolPart("task", { prompt: "and again" }, "ses_nested")),
    });
    expect(await collectOpenCodeSkillsInvoked(c)).toEqual(["b", "a"]);
    expect(ran).toEqual([`opencode export ${SUBAGENT_SESSION}`, "opencode export ses_nested"]);
  });

  test("throws when a sub-agent's session can't be exported, rather than undercount", async () => {
    await expect(collectOpenCodeSkillsInvoked(ctx(SUBAGENT_RESULT).ctx)).rejects.toThrow(SUBAGENT_SESSION);
    await expect(collectOpenCodeSkillsInvoked(ctx(SUBAGENT_RESULT, { [SUBAGENT_SESSION]: "not JSON" }).ctx)).rejects.toThrow(SUBAGENT_SESSION);
  });

  test("throws when the result has no events, so the run is skipped, not counted as invoking none", async () => {
    await expect(collectOpenCodeSkillsInvoked(ctx("Error: no provider").ctx)).rejects.toThrow("no events");
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
    expect(harness.collectSkillsInvoked).toBe(collectOpenCodeSkillsInvoked);
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

    test("names a custom provider by its models' first part, and lists the model even with no config of its own", () => {
      const custom = opencode({
        version: "1.19.5",
        provider: { baseUrl: "https://mycustomprovider.com/v1", apiKeyEnv: "MY_CUSTOM_PROVIDER_API_KEY" },
        models: { "mycustomprovider/my-custom-model": [] },
      });

      expect(custom.requiredEnv).toEqual(["MY_CUSTOM_PROVIDER_API_KEY"]);
      expect(runScript(custom, "mycustomprovider/my-custom-model")).toBe(
        `OPENCODE_PERMISSION='{"external_directory":"allow"}' OPENCODE_CONFIG_CONTENT='{"provider":{"mycustomprovider":{"npm":"@ai-sdk/openai-compatible","name":"mycustomprovider","options":{"baseURL":"https://mycustomprovider.com/v1","apiKey":"{env:MY_CUSTOM_PROVIDER_API_KEY}"},"models":{"my-custom-model":{}}}}}' opencode run --model "$(cat /thunderjar/model.txt)" --format json "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`,
      );
    });
  });

  test("its command is a function of the model's config, as OpenCode takes it, the version, paths and provider", () => {
    const custom = opencode({
      version: "1.19.5",
      provider: OPENROUTER,
      models: { "openrouter/openai/gpt-5.5": [{ options: { reasoningEffort: { values: ["low", "high"] } } }] },
      command: (ctx) => `echo ${ctx.version} ${ctx.modelId} ${JSON.stringify(ctx.model)} ${ctx.provider?.wireApi} > ${ctx.paths.result}`,
    });

    expect(runScript(custom, "openrouter/openai/gpt-5.5", { "options.reasoningEffort": "high" })).toBe(
      `echo 1.19.5 openrouter/openai/gpt-5.5 {"options":{"reasoningEffort":"high"}} chat > /thunderjar/result.json`,
    );
  });

  test("its required variables can be replaced, e.g. for OpenCode's built-in openrouter provider, which reads OPENROUTER_API_KEY itself", () => {
    expect(opencode({ version: "1.19.5", models: { "openrouter/openai/gpt-5.5": [] }, requiredEnv: ["OPENROUTER_API_KEY"] }).requiredEnv).toEqual(["OPENROUTER_API_KEY"]);
  });
});
