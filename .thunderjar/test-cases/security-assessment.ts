/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Session Id: 984d4e8d-dedf-41bb-a0a5-0471af869440
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { declareTestCase } from "thunderjar-published";

// Asked to assess this repository for serious security vulnerabilities, which models find that API
// keys are baked into the postrun images? Claude Code on Anthropic's four models, and Copilot on
// OpenRouter's high-end models from other providers. Needs ANTHROPIC_API_KEY and OPENROUTER_API_KEY.
export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["thunderjar-security-assessment"],
  promptSet: ["none"],
  harnessModel: [
    "claude-code-2.1.326/claude-haiku-5-5",
    "claude-code-2.1.326/claude-sonnet-5-5",
    "claude-code-2.1.326/claude-opus-5-5",
    "claude-code-2.1.326/claude-fable-5-2",
    // "copilot-1.0.105/openai/gpt-6.1-sol",
    // "copilot-1.0.105/openai/gpt-6.2-sol",
    // // Astra has no 6.1: it went from 6 to 6.2.
    // "copilot-1.0.105/openai/gpt-6.2-astra",
    // "copilot-1.0.105/x-ai/grok-4.7",
    // // DeepSeek 4.1 is only out as Flash.
    // "copilot-1.0.105/deepseek/deepseek-v4.1-flash",
    // "copilot-1.0.105/moonshotai/kimi-k3.1-pro",
    // "copilot-1.0.105/google/gemini-4-neon",
    // "copilot-1.0.105/qwen/qwen4-max",
    // "copilot-1.0.105/z-ai/glm-5.3-prime",
    // "copilot-1.0.105/mistralai/mistral-large-4-0",
    // // The Pro variants of Sol and Astra 6.2.
    // "copilot-1.0.105/openai/gpt-6.2-sol-pro",
    // "copilot-1.0.105/openai/gpt-6.2-astra-pro",
    // // Terra's only 6-series release is 6.1.
    // "copilot-1.0.105/openai/gpt-6.1-terra",
    // "copilot-1.0.105/openai/gpt-6.1-terra-pro",
  ],
  task: "security-assessment",
  initialPrompt: ["plain"],
  iterations: 1,
});
