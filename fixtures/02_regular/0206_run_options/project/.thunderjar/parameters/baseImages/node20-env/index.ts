/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */
import { declareBaseImage } from "thunderjar";

// node20, with variables of its own, one awkward to quote, and run options that pass its agent
// containers more: FAKE_RUN_OPTION_KEY, from the shell that runs Thunderjar, and FAKE_OVERRIDDEN,
// over the image's value. None of what they're run with may be left in a postrun image.
export default declareBaseImage({
  applyParameter: () => `FROM node:20-bookworm
ENV FAKE_IMAGE_SETTING="kept: \\"quoted\\", \\$HOME, a \\\\ backslash and 100%" FAKE_OVERRIDDEN=image-value`,
  runOptions: ["-e", "FAKE_RUN_OPTION_KEY", "--env", "FAKE_OVERRIDDEN=run-time-value"],
});
