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

// Does a measurement the agent added use the jsAst instrument? On PR #288 the custom-provider
// measurement was a shell script at first, and the owner asked for jsAst.
export default declareMeasurement({
  instrument: "jsAst",
  config: {
    glob: ".thunderjar/parameters/tasks/*/measurements/*.ts",
    selectors: { jsAst: 'Property[key.name="instrument"][value.value="jsAst"]' },
  },
  metrics: {
    usesJsAst: { score: () => false, stat: "rate", better: "higher" },
  },
});
