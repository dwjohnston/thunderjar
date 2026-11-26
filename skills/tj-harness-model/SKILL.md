---
name: tj-harness-model
description: Add a Thunderjar harness, i.e. a coding agent at a pinned version (Claude Code, Codex, Copilot, OpenCode), and name the models a test case runs it with. Use when the user wants to try another agent, another version of one, or another model, e.g. "add Codex", "try Claude Code 2.2", "run it on GPT-6".
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Supervising engineer: David Johnston

Humans: 

🙋‍♂️
🙋‍♂️ I haven't paid much attention here. 
🙋‍♂️

-->

# Add a harness and model

First, read the tj-general skill: the order parameters are applied in, and the one rule all of them follow.

A harness is one agent at one version, in `.thunderjar/parameters/harnessModels/<agent>-<version>/index.ts`.

It declares the models it runs, by the IDs its agent takes, in `models`. A test case pairs it with one of them: `<folder>/<model ID>`, plus one part per variant setting.

e.g.

```ts
// harnessModels/codex-0.166.0/index.ts
models: {
  "openai/gpt-5.5": [],
  "openai/gpt-6-luna": [{ reasoningEffort: { values: ["low", "medium", "high"] } }],
},

// a test case
harnessModel: ["claude-code-2.1.311/claude-haiku-5-5", "codex-0.166.0/openai/gpt-6-luna/medium"],
```

- A fixed setting, e.g. `{ reasoningEffort: "low" }`, adds nothing to the name.
- A variant setting adds one required part. Several make their cross product, parts in array order.
- The fragment reads `ctx.modelId`, the model ID alone, and `ctx.model`, the settings with each variant's value, e.g. `ctx.model.reasoningEffort`.
- Run `thunderjar generate` after changing `models`, so test cases type-check against them.

✅ **Do** pass a variant to the agent, e.g. `-c model_reasoning_effort=${ctx.model.reasoningEffort}`.

❌ **Don't** declare a variant the fragment ignores.

**Why:** each variant is its own permutation. One that changes nothing reruns the same agent under another name.


## Claude Code, Codex, Copilot or OpenCode

Use the agent's helper: one call, with its install, run script, reply, token costs, and the skills it invoked and tools it called, built in.

```ts
// harnessModels/codex-0.166.0/index.ts
import { codex, OPENROUTER } from "thunderjar";

export default codex({
  version: "0.166.0",
  provider: OPENROUTER,
  models: { "openai/gpt-6-luna": [{ reasoningEffort: { values: ["low", "medium", "high"] } }] },
});
```

| Helper | Default provider and key | Model settings it passes |
|---|---|---|
| `claudeCode` | Anthropic, `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` | `effort`, as `--effort` |
| `codex` | OpenAI, `OPENAI_API_KEY` | `reasoningEffort`, as `model_reasoning_effort` |
| `copilot` | GitHub Copilot, `COPILOT_GITHUB_TOKEN` | `wireApi`, `responses` or `chat` |
| `opencode` | OpenCode Zen, `OPENCODE_API_KEY` | `options` and `limit`, OpenCode's own per-model config |

- Without `models`, each declares a default list, by its own provider's IDs.
- `provider`, e.g. `OPENROUTER` or `{ baseUrl, apiKeyEnv }`, runs it elsewhere. It needs `models` then, by that provider's IDs, and only the provider's key.
- `command`, a function of `{ modelId, model, version, paths, provider }`, replaces the command its run script runs. Use it for anything bespoke, e.g. `MAX_THINKING_TOKENS`.
- `requiredEnv` replaces the keys it needs.

## Any other agent

Write it with `declareHarness`. e.g. Codex, on OpenRouter:

```ts
import { declareHarness, writeModel, writeRunScript } from "thunderjar";

// Codex, on OpenRouter, without its sandbox or approvals: the container is the sandbox.
const OPENROUTER =
  `-c model_provider=openrouter` +
  ` -c 'model_providers.openrouter={name="OpenRouter",base_url="https://openrouter.ai/api/v1",env_key="OPENROUTER_API_KEY",wire_api="responses"}'`;

export default declareHarness({
  version: "0.166.0",
  models: { "openai/gpt-6-luna": [{ reasoningEffort: { values: ["low", "medium", "high"] } }] },
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g @openai/codex@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      writeRunScript(`codex exec ${OPENROUTER} -c model_reasoning_effort=${ctx.model.reasoningEffort} --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),
  requiredEnv: ["OPENROUTER_API_KEY"],
});
```

What each part must do:

1. Declare its `models`.
2. Install the agent at `ctx.version`, as root.
3. Give the agent's user `/workspace` and `/thunderjar`.
4. Write the model ID with `writeModel(ctx.modelId)`.
5. Write the run script with `writeRunScript`.
   - It reads the prompt and model from their files, so quotes and newlines arrive intact.
   - It leaves the agent's output in `/thunderjar/result.json`.
   - It skips every approval prompt: nobody is there to answer.
6. Switch to a non-root user, e.g. `USER node`.
7. List the keys it needs in `requiredEnv`.

To measure the agent's reply and token costs, add `collectReply` and `collectTokenCosts`, which read `result.json`. For the `skillInvoked` instrument, add `collectSkillsInvoked`, which reads the skills the agent invoked in the measurement container. For `toolCalled` and `fileRead`, add `collectToolCalls`, which reads its tool calls the same way. See `src/api/copilot.ts` in the thunderjar package for a full one.

## A new version

Copy the folder, rename it to the new version, and change `version`.

❌ **Don't** change the version in an existing folder.

**Why:** test cases name the folder. Changing what it installs changes every test case that uses it.

## Check it

```sh
thunderjar doctor
thunderjar plan <test case>
```
