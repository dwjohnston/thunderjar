/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLihXvsaKQZdBjhN81n
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";
// The repo's own Copilot harness, in .thunderjar/, which `bun test` doesn't search.
import copilot from "../../.thunderjar/parameters/harnessModels/copilot-1.0.105/index.ts";

const fragment = (modelId: string) => copilot.applyParameter(undefined, { version: "1.0.105", modelId } as never) as string;

test("OpenAI's models run on OpenRouter's Responses API: on Chat Completions OpenAI rejects Copilot's tools", () => {
  expect(fragment("openai/gpt-6.1-sol")).toContain("COPILOT_PROVIDER_WIRE_API=responses");
});

test("other providers' models keep Copilot's default wire API", () => {
  expect(fragment("anthropic/claude-haiku-5.5")).not.toContain("COPILOT_PROVIDER_WIRE_API");
});
