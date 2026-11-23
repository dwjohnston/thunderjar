/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar";
import { isStartTestCase } from "./start.helpers.ts";

// Does the test case the agent added run Claude Code on all three Claude models? On PR #288 it ran
// Haiku only, and the owner wanted all three.
const MODELS = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };

/**
 * How many of MODELS any of `files` names, other than the test cases there at the start.
 * Undefined when the agent added no test case.
 */
const named = (files: { file: string; matches: Record<string, number> }[]) => {
  const added = files.filter(({ file }) => !isStartTestCase(file));
  if (added.length === 0) return undefined;
  return Object.keys(MODELS).filter((model) => added.some(({ matches }) => (matches[model] ?? 0) > 0)).length;
};

export default declareMeasurement({
  instrument: "jsAst",
  config: {
    glob: ".thunderjar/test-cases/*.ts",
    // A string naming the model, or a template string's text, which is at value.cooked. Comments
    // aren't in the syntax tree, so a model named only in one doesn't count.
    selectors: Object.fromEntries(
      Object.entries(MODELS).map(([name, id]) => [name, `:matches(Literal[value=/${id}/], TemplateElement[value.cooked=/${id}/])`]),
    ),
  },
  metrics: {
    // How many of the three its test cases name, together.
    claudeModels: { score: (files) => named(files), stat: "mean", better: "higher" },
    allThreeClaudeModels: {
      score: (files) => {
        const count = named(files);
        return count === undefined ? undefined : count === Object.keys(MODELS).length;
      },
      stat: "rate",
      better: "higher",
    },
  },
});
