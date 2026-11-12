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

// The harnesses and models every gauntlet test case runs on, as in thunderjar-evaluation-sandbox's
// scenarioHarnessModels. Claude Code takes Anthropic's model IDs; Copilot and OpenCode take
// OpenRouter's (OpenCode with an "openrouter/" prefix). Needs ANTHROPIC_API_KEY and OPENROUTER_API_KEY.
export const gauntletHarnessModels = [
  // Haiku and Sonnet on all three harnesses.
  "claude-code-2.1.311/claude-haiku-5-5",
  "copilot-1.0.105/anthropic/claude-haiku-5.5",
  "opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5",
  "claude-code-2.1.311/claude-sonnet-5-5",
  "copilot-1.0.105/anthropic/claude-sonnet-5.5",
  "opencode-1.19.5/openrouter/anthropic/claude-sonnet-5.5",
  // Opus on Claude Code only.
  "claude-code-2.1.311/claude-opus-5-5",
  // GPT-6.1 Sol on Copilot.
  "copilot-1.0.105/openai/gpt-6.1-sol",
  // DeepSeek 4.1 and other cheap models on OpenCode.
  "opencode-1.19.5/openrouter/deepseek/deepseek-v4.1-flash",
  "opencode-1.19.5/openrouter/openai/gpt-6-luna",
  "opencode-1.19.5/openrouter/minimax/minimax-m3.1-flash",
  "opencode-1.19.5/openrouter/z-ai/glm-5.3-flashx",
] as const satisfies readonly `${string}/${string}`[];
