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

// Alpine: small, and often already pulled. Enough for a fake agent that needs only sh.
export default declareBaseImage({
  applyParameter: () => `FROM alpine:3`,
});
