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
// Reading what OpenCode keeps of a session, for an OpenCode harness's `transcript`.
//
// OpenCode keeps its sessions in a SQLite database, `~/.local/share/opencode/opencode.db`, which
// isn't text. So an OpenCode harness's run script, once the agent is done, also runs
// OPENCODE_TRANSCRIPT_COMMAND, which writes every part of every session, sub-agents' too, as JSON,
// in the order they were made, to the file `opencodeTranscript` reads.
import type { TranscriptDeclaration } from "./declarations.ts";

const QUERY =
  "select s.parent_id as parent, json_extract(m.data, '\\$.role') as role, p.data as part" +
  " from part p join message m on m.id = p.message_id join session s on s.id = p.session_id order by p.id";

/** Where OPENCODE_TRANSCRIPT_COMMAND writes the transcript. */
const TRANSCRIPT_FILE = ".local/share/opencode/thunderjar-transcript.json";

/**
 * A command for an OpenCode harness's run script, after `opencode run`: writes the transcript
 * `opencodeTranscript` reads, or leaves none if OpenCode has no database to read it from.
 */
export const OPENCODE_TRANSCRIPT_COMMAND = `opencode db "${QUERY}" --format json > "$HOME/${TRANSCRIPT_FILE}" 2>/dev/null || rm -f "$HOME/${TRANSCRIPT_FILE}"`;

/** OpenCode's transcript, as OPENCODE_TRANSCRIPT_COMMAND writes it. */
export const opencodeTranscript: TranscriptDeclaration = {
  files: [`~/${TRANSCRIPT_FILE}`],
  parse: () => [],
};
