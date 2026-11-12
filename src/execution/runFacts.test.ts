/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: Claude
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { failureHint, reportedError } from "./runFacts.ts";

// As the harnesses wrote them in a remote run of the gauntlet, cut down.
const OPENCODE_402 = `{"type":"error","timestamp":1794486726498,"sessionID":"ses_1","error":{"name":"APIError","data":{"message":"This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.","statusCode":402,"isRetryable":false}}}`;
const COPILOT_400 = [
  `{"type":"model.call_failure","data":{"model":"openai/gpt-6.1-sol","statusCode":400,"errorMessage":"{\\"message\\":\\"Provider returned error\\",\\"code\\":400}"}}`,
  `{"type":"session.error","data":{"errorType":"query","message":"400 Provider returned error","statusCode":400}}`,
  `{"type":"result","exitCode":1,"usage":{"premiumRequests":0}}`,
  `{"type":"thunderjar.usage","data":{"modelMetrics":{}}}`,
].join("\n");
const CLAUDE_ERROR = `{"type":"result","subtype":"success","is_error":true,"result":"Credit balance is too low","session_id":"abc"}`;

describe("reportedError", () => {
  test("OpenCode's error event: its status and message", () => {
    expect(reportedError(OPENCODE_402)).toBe(
      "402: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.",
    );
  });

  test("Copilot's last error event, not the usage line after it, and its status isn't repeated", () => {
    expect(reportedError(COPILOT_400)).toBe("400 Provider returned error");
  });

  test("Claude Code's result with is_error: its result text", () => {
    expect(reportedError(CLAUDE_ERROR)).toBe("Credit balance is too low");
  });

  test.each([[null], [""], ["plain text, not JSON"], ['{"type":"result","result":"All done."}'], ['{"type":"text","part":{"text":"the message said error"}}']])(
    "%p reports no error",
    (result) => {
      expect(reportedError(result)).toBeUndefined();
    },
  );
});

describe("failureHint", () => {
  test("the reported error comes before the last line of stderr", () => {
    expect(failureHint({ harnessStderr: "warning: something unrelated\n", harnessResult: COPILOT_400 })).toBe("400 Provider returned error");
  });

  test("without one, the last line of stderr, then of the result file", () => {
    expect(failureHint({ harnessStderr: "one\nsh: 1: opencode: not found\n\n", harnessResult: "partial" })).toBe("sh: 1: opencode: not found");
    expect(failureHint({ harnessStderr: "", harnessResult: "first\nlast line\n" })).toBe("last line");
    expect(failureHint({ harnessStderr: null, harnessResult: null })).toBeUndefined();
  });

  test("is cut to 160 characters", () => {
    expect(failureHint({ harnessResult: OPENCODE_402 })).toBe(
      "402: This request would exceed your available credits given your current in-flight requests. Retry after in-flight requests settle, or add credits.",
    );
    const long = failureHint({ harnessStderr: "x".repeat(500), harnessResult: null }) as string;
    expect(long).toHaveLength(160);
    expect(long.endsWith("…")).toBe(true);
  });
});
