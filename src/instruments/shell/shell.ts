import { type Instrument, checkString } from "../instrument.ts";

/** How much of a `shell` command's stdout is stored: 64 KiB. */
export const STDOUT_LIMIT = 64 * 1024;

/** `text` cut to its first `limit` bytes of UTF-8, without splitting a character, and whether it was cut. */
function capped(text: string, limit: number): [text: string, truncated: boolean] {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= limit) return [text, false];
  // Streaming, the decoder holds back a character the cut splits, rather than replacing it.
  return [new TextDecoder().decode(bytes.subarray(0, limit), { stream: true }), true];
}

/**
 * What `command`, any shell command, did in the measurement container: its exit code, and its
 * stdout, as it is, up to 64 KiB. The escape hatch for whatever no other instrument measures,
 * such as `bunx tsc --noEmit`, or a command that prints JSON for metrics to read. Never `skipped`,
 * and a non-zero exit is still `measured`. Its default score is whether it exited 0.
 *
 * Version 2: version 1's value was whether it exited 0.
 */
export const shell: Instrument<{ command: string }, { exitCode: number; stdout: string; stdoutTruncated: boolean }> = {
  version: 2,
  defaultScore: { kind: "boolean", score: ({ exitCode }) => exitCode === 0 },
  async evaluate({ command }, ctx) {
    const { exitCode, stdout } = await ctx.exec(command);
    const [text, stdoutTruncated] = capped(stdout, STDOUT_LIMIT);
    return { outcome: "measured", data: { exitCode, stdout: text, stdoutTruncated } };
  },
  checkConfig(config) {
    return checkString("config.command", (config as { command?: unknown } | undefined)?.command, "a shell command");
  },
};
