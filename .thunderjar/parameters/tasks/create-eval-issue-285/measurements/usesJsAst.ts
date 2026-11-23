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
import { inStartTask } from "./start.helpers.ts";

// Does a measurement the agent added use the jsAst instrument? On PR #288 the custom-provider
// measurement was a shell script at first, and the owner asked for jsAst. A measurement in a task
// that was there at the start doesn't count: tj-eval-blacksheepcode already has a jsAst one.
export default declareMeasurement({
  instrument: "jsAst",
  config: {
    glob: ".thunderjar/parameters/tasks/*/measurements/*.ts",
    selectors: { jsAst: 'Property[key.name="instrument"][value.value="jsAst"]' },
  },
  metrics: {
    usesJsAst: { score: (files) => files.some(({ file, matches }) => !inStartTask(file) && (matches.jsAst ?? 0) > 0), stat: "rate", better: "higher" },
  },
});
