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
import { ADDED_TEST_LINES, customProviderTest, deepSeekProvider } from "./customProvider.helpers.ts";

// Did the agent add a test of claudeCode() with a custom provider? It reads only the test lines it
// added: claudeCode.test.ts already mentions DeepSeek at the start, in its recorded-result tests.
export default declareMeasurement({
  instrument: "shell",
  config: { command: ADDED_TEST_LINES },
  metrics: {
    // A provider with a baseUrl of its own, not OPENROUTER's.
    customProviderTest: { score: customProviderTest, stat: "rate", better: "higher" },
    // That provider is DeepSeek, as on PR #282, where the owner asked for a made-up one instead.
    // Doesn't apply when there's no custom-provider test.
    deepSeekProvider: { score: deepSeekProvider, stat: "rate", better: "lower" },
  },
});
