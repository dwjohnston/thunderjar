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
import type { TranscriptDeclaration, TranscriptEvent } from "./declarations.ts";

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
  parse: (files) => files.flatMap(({ text }) => (JSON.parse(text) as Row[]).flatMap(opencodeEvents)),
};

/** A row of OPENCODE_TRANSCRIPT_COMMAND's output: a part, as OpenCode keeps it, of a message by `role`, in a session whose parent is `parent`. */
type Row = { parent?: unknown; role?: unknown; part?: unknown };
type Part = { type?: unknown; text?: unknown; synthetic?: unknown; ignored?: unknown; tool?: unknown; state?: { input?: unknown } };

/**
 * The event of one part: its `text` parts, but those OpenCode adds itself (`synthetic`) or leaves
 * out (`ignored`), and its `tool` parts. A sub-agent's session has a parent.
 */
function opencodeEvents({ parent, role, part }: Row): TranscriptEvent[] {
  const { type, text, synthetic, ignored, tool, state } = (typeof part === "string" ? JSON.parse(part) : (part ?? {})) as Part;
  const agent = parent === null || parent === undefined ? "main" : "subagent";
  if (type === "text" && typeof text === "string" && text !== "" && synthetic !== true && ignored !== true) {
    return [{ kind: "message", role: role === "user" ? "user" : "assistant", text, agent }];
  }
  if (type === "tool" && typeof tool === "string") return [{ kind: "toolCall", tool, input: state?.input, agent }];
  return [];
}
