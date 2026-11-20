import { type Instrument, checkPattern, show } from "../instrument.ts";

/**
 * Whether the agent's reply, from its harness's `collectReply`, matches `pattern`: its reply to
 * `turn`, counting from 1, or by default its last. `skipped`, saying why, when the run has no
 * reply to that turn.
 */
export const replyMatches: Instrument<{ pattern: string; turn?: number }, boolean> = {
  version: 1,
  defaultScore: { kind: "boolean", score: (value) => value },
  async evaluate({ pattern, turn }, ctx) {
    const reply = turn === undefined ? ctx.reply : ctx.replies[turn - 1];
    if (!reply) return { outcome: "skipped", reason: `no turn ${turn}: the initial prompt has ${ctx.replies.length}` };
    if (reply.outcome !== "collected") return { outcome: "skipped", reason: `no reply: ${reply.reason}` };
    return { outcome: "measured", data: new RegExp(pattern).test(reply.text) };
  },
  checkConfig(config) {
    const { pattern, turn } = (config ?? {}) as { pattern?: unknown; turn?: unknown };
    const problems = checkPattern(pattern);
    if (turn !== undefined && (typeof turn !== "number" || !Number.isInteger(turn) || turn < 1)) {
      problems.push(["config.turn", `must be a turn, counting from 1, got ${show(turn)}`]);
    }
    return problems;
  },
  usesContainer: false,
};
