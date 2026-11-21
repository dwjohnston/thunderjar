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
// Reading what Codex CLI keeps of a session, for a Codex harness's `transcript`.
import type { TranscriptDeclaration } from "./declarations.ts";

/**
 * Codex's transcript: the rollout it keeps of each thread, as JSON lines, in
 * `~/.codex/sessions/<year>/<month>/<day>/rollout-<time>-<thread ID>.jsonl`. A sub-agent it starts
 * is a thread of its own, with a rollout of its own.
 */
export const codexTranscript: TranscriptDeclaration = {
  files: ["~/.codex/sessions/**/rollout-*.jsonl"],
  parse: () => [],
};
