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

// Did the agent add a test of claudeCode() with a custom provider? It parses the test files in
// src/ and scripts/, as the agent left them, committed or not.
//
// It counts only what the agent added because nothing in them matches at the start: claudeCode.test.ts
// already mentions DeepSeek there, in its recorded-result tests, but in no provider and no URL.
// Keep it that way if you move the code state.
const total = (files: { matches: Record<string, number> }[], selector: string) =>
  files.reduce((sum, { matches }) => sum + (matches[selector] ?? 0), 0);

export default declareMeasurement({
  instrument: "jsAst",
  config: {
    glob: "{src,scripts}/**/*.test.{ts,tsx}",
    selectors: {
      // An object's baseUrl, as in a provider.
      customProvider: 'ObjectExpression > Property[key.name="baseUrl"]',
    },
  },
  metrics: {
    // A provider with a baseUrl of its own, not OPENROUTER's.
    customProviderTest: { score: (files) => total(files, "customProvider") > 0, stat: "rate", better: "higher" },
    // That provider is DeepSeek, as on PR #282, where the owner asked for a made-up one instead.
    // Doesn't apply when there's no custom-provider test.
    deepSeekProvider: { score: () => undefined, stat: "rate", better: "lower" },
  },
});
