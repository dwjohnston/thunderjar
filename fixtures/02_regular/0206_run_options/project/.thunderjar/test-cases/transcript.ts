/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLgjaf4n2FVk7rLLHNR
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
import { declareTestCase } from "thunderjar";

// A fake agent that leaves a transcript, and one whose harness declares none, so its toolCalled
// measurements are skipped.
export default declareTestCase({
  baseImage: ["alpine"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["fake-transcriber/fake-model-small-001", "fake-env-reader/fake-model-small-001"],
  task: "tools-used",
  initialPrompt: ["plain"],
  iterations: 1,
});
