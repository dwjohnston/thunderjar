// The Copilot readers, against a `copilot --output-format json` result: JSON lines, one event each,
// with the usage line the run script appended.
import { describe, expect, test } from "bun:test";
import { copilotReply } from "./copilot.ts";

const RESULT = await Bun.file(`${import.meta.dir}/copilot.result.jsonl`).text();

describe("copilotReply", () => {
  test("is the main agent's last message with text, not a sub-agent's", () => {
    expect(copilotReply(RESULT)).toBe("pong");
  });
});
