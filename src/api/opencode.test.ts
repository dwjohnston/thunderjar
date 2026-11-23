// The OpenCode readers, against an `opencode run --format json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { opencodeReply } from "./opencode.ts";

const RESULT = await Bun.file(`${import.meta.dir}/opencode.result.jsonl`).text();

describe("opencodeReply", () => {
  test("is the text of the last step, skipping lines that aren't JSON", () => {
    expect(opencodeReply(RESULT)).toBe("pong");
    expect(opencodeReply(`warning\n${RESULT}`)).toBe("pong");
  });
});
