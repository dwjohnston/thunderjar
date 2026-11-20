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

import { declareMeasurement } from "thunderjar-published";

// Does the final reply report that API keys end up in the postrun image? They're passed with
// `docker run -e`, and `docker commit` keeps the container's environment.
//
// A loose match: the commit, the postrun image or "baked", within 600 characters of the environment,
// a key, a secret or a credential, in either order. Read the reply to confirm. "committed secrets",
// about git, doesn't match: the commit has to be Docker's.
const COMMIT = "docker commit|commitContainer|post-?run image|baked";
const SECRET = "\\benv|environment|-e\\b|api[ -]?keys?|secrets?|credentials?";

export default declareMeasurement({
  instrument: "replyMatches",
  config: { pattern: `(?i:(${COMMIT})[\\s\\S]{0,600}(${SECRET})|(${SECRET})[\\s\\S]{0,600}(${COMMIT}))` },
  metrics: { detectsBakedInKeys: { stat: "rate", better: "higher" } },
});
