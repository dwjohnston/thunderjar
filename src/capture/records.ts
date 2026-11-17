/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// The records capture keeps, as JSON in the message of each ref's annotated tag.
import type { HarnessId } from "./adapters.ts";

export type Agent = {
  harness: HarnessId;
  harnessVersion: string | null;
  /** Where the harness ran, e.g. Claude Code's `cli` or `sdk-cli`. Null where the harness doesn't say. */
  harnessSurface: string | null;
  effort: string | null;
  sessionId: string;
  transcriptPath: string | null;
  permissionMode: string | null;
};

/** The message of the `start` tag. */
export type StartRecord = {
  schemaVersion: 1;
  kind: "start";
  capturedAt: string;
  /** The first prompt of the session, verbatim. */
  prompt: string;
  agent: Agent;
  repository: { root: string; branch: string | null; headAtStart: string | null; dirty: boolean };
};

/** The message of a `turn-<n>` tag. */
export type TurnRecord = {
  schemaVersion: 1;
  kind: "turn";
  capturedAt: string;
  turn: number;
  /** The prompt that started the turn. Null for turn 1, whose prompt is in the start record. */
  prompt: string | null;
  /** Prompts submitted after the turn began, e.g. after the user interrupted the agent. */
  laterPrompts: string[];
  agent: Agent & {
    /** The model the harness says it used for the turn, or null where it doesn't say. */
    model: string | null;
    /** Every model that answered in the session so far, from Claude Code's transcript; else `model`. */
    models: string[];
    /** The harness's own ID for the turn, e.g. Codex's `turn_id`. */
    turnId: string | null;
  };
  repository: {
    branch: string | null;
    headAtStop: string | null;
    /** `<hash> <subject>` of each commit since the previous turn, oldest first. */
    agentCommits: string[];
    /** Files that differ between `headAtStop` and the snapshot. */
    leftUncommitted: string[];
    /** Whether `headAtStart`, or the previous turn's head, is no longer an ancestor of `headAtStop`. */
    historyRewritten: boolean;
  };
  lastAssistantMessage: string | null;
};
