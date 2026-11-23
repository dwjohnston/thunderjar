// The Codex readers, against a `codex exec --json` result: JSON lines, one event each.
import { describe, expect, test } from "bun:test";
import { codexReply } from "./codex.ts";

const RESULT = await Bun.file(`${import.meta.dir}/codex.result.jsonl`).text();

describe("codexReply", () => {
  test("is the last completed agent message with text, skipping empty ones and lines that aren't JSON", () => {
    expect(codexReply(RESULT)).toBe("pong");
    expect(codexReply(`warning: something\n${RESULT}{"type":"item.completed","item":{"type":"agent_message","text":"  "}}\n`)).toBe("pong");
  });
});
