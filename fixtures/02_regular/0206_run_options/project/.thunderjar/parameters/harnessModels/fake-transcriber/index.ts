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
import { claudeCodeTranscript, declareHarness, writeModel, writeRunScript } from "thunderjar";

// A fake agent that leaves a transcript shaped like Claude Code's, in the home of the image's user,
// for the library's claudeCodeTranscript to read: it ran `bun test` with Bash, then started a
// sub-agent, which ran it again, and replied `The tests pass.`
const SESSION = [
  { type: "user", isSidechain: false, timestamp: "2026-11-21T04:20:37.000Z", message: { role: "user", content: "Run the tests." } },
  tool("2026-11-21T04:20:38.000Z", false, "Bash", { command: "bun test" }),
  tool("2026-11-21T04:20:39.000Z", false, "Agent", { prompt: "Run the tests again." }),
  { type: "assistant", isSidechain: false, timestamp: "2026-11-21T04:20:45.000Z", message: { role: "assistant", content: [{ type: "text", text: "The tests pass." }] } },
];
const SUBAGENT = [tool("2026-11-21T04:20:40.000Z", true, "Bash", { command: "bun test --bail" })];

function tool(timestamp: string, isSidechain: boolean, name: string, input: unknown) {
  return { type: "assistant", isSidechain, timestamp, message: { role: "assistant", content: [{ type: "tool_use", id: `call-${timestamp}`, name, input }] } };
}

const jsonLines = (lines: unknown[]) => lines.map((line) => JSON.stringify(line)).join("\n");

export default declareHarness({
  version: "1.0.0",
  applyParameter: (_config, ctx) =>
    [
      writeModel(ctx.modelId),
      writeRunScript(
        [
          'd="$HOME/.claude/projects/-workspace"',
          'mkdir -p "$d/fake-session/subagents"',
          `cat > "$d/fake-session.jsonl" <<'SESSION'\n${jsonLines(SESSION)}\nSESSION`,
          `cat > "$d/fake-session/subagents/agent-fake.jsonl" <<'SESSION'\n${jsonLines(SUBAGENT)}\nSESSION`,
          `echo '{"reply":"The tests pass."}' > /thunderjar/result.json`,
        ].join("\n"),
      ),
    ].join("\n"),
  collectReply: (raw) => (JSON.parse(raw) as { reply: string }).reply,
  transcript: claudeCodeTranscript,
});
