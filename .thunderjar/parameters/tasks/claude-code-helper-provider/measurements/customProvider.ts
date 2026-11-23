/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar";
import { ADDED_TEST_LINES, customProviderUrls } from "./customProvider.helpers.ts";

// Did the agent add a test of claudeCode() with a custom provider? It reads only the test lines it
// added: claudeCode.test.ts already mentions DeepSeek at the start, in its recorded-result tests.
export default declareMeasurement({
  instrument: "shell",
  config: { command: ADDED_TEST_LINES },
  metrics: {
    // A provider with a baseUrl of its own, not OPENROUTER's.
    customProviderTest: {
      score: (v) => (v.exitCode === 0 ? customProviderUrls(v.stdout).length > 0 : undefined),
      stat: "rate",
      better: "higher",
    },
    // That provider is DeepSeek, as on PR #282, where the owner asked for a made-up one instead.
    deepSeekProvider: {
      score: (v) => (v.exitCode === 0 ? customProviderUrls(v.stdout).some((url) => /deepseek/i.test(url)) : undefined),
      stat: "rate",
      better: "lower",
    },
  },
});
