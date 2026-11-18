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

Humans: add your notes here
-->

# Add a harness and model

A harness is one agent at one version, in `.thunderjar/parameters/harnessModels/<agent>-<version>/index.ts`.

A test case pairs it with a model: `<folder>/<model ID>`.

e.g.

```ts
harnessModel: ["claude-code-2.1.311/claude-haiku-5-5", "codex-0.166.0/openai/gpt-6-luna"],
```

✅ **Do** reuse an existing harness folder. A new model needs no new folder, only a new pair in the test case.

## The harnesses

| Harness | Key | Model ID | e.g. |
|---|---|---|---|
| Claude Code | `ANTHROPIC_API_KEY` | Anthropic's | `claude-code-2.1.311/claude-haiku-5-5` |
| Codex | `OPENROUTER_API_KEY` | OpenRouter's | `codex-0.166.0/openai/gpt-6-luna` |
| Copilot | `OPENROUTER_API_KEY` | OpenRouter's | `copilot-1.0.105/anthropic/claude-haiku-5.5` |
| OpenCode | `OPENROUTER_API_KEY` | `openrouter/` + OpenRouter's | `opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5` |

Models come and go: check https://docs.claude.com/en/docs/about-claude/models or https://openrouter.ai/models for current IDs.

## Claude Code

Thunderjar has it built in.

```ts
import { claudeCode } from "thunderjar";

export default claudeCode({ version: "2.1.311" });
```

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
  applyParameter: (_config, ctx) =>
    [
      `RUN npm install -g @openai/codex@${ctx.version}`,
      "RUN mkdir -p /thunderjar && chown -R node:node /workspace /thunderjar",
      writeModel(ctx.modelId),
      writeRunScript(`codex exec ${OPENROUTER} --model "$(cat /thunderjar/model.txt)" --json --dangerously-bypass-approvals-and-sandbox "$(cat /thunderjar/prompt.txt)" > /thunderjar/result.json`),
      "USER node",
    ].join("\n"),
  requiredEnv: ["OPENROUTER_API_KEY"],
});
```

What each part must do:

1. Install the agent at `ctx.version`, as root.
2. Give the agent's user `/workspace` and `/thunderjar`.
3. Write the model ID with `writeModel(ctx.modelId)`.
4. Write the run script with `writeRunScript`.
   - It reads the prompt and model from their files, so quotes and newlines arrive intact.
   - It leaves the agent's output in `/thunderjar/result.json`.
   - It skips every approval prompt: nobody is there to answer.
5. Switch to a non-root user, e.g. `USER node`.
6. List the keys it needs in `requiredEnv`.

To measure the agent's reply and token costs, add `collectReply` and `collectTokenCosts`, which read `result.json`. See the Copilot harness in this repo's `.thunderjar/` for a full one.

## A new version

Copy the folder, rename it to the new version, and change `version`.

❌ **Don't** change the version in an existing folder.

**Why:** test cases name the folder. Changing what it installs changes every test case that uses it.

## Check it

```sh
thunderjar doctor
thunderjar plan <test case>
```
