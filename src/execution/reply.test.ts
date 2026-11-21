import { describe, expect, test } from "bun:test";
import { collectReply } from "./reply.ts";

describe("collectReply", () => {
  const fromJson = (raw: string) => (JSON.parse(raw) as { reply: string }).reply;

  test("is what the harness's collectReply reads from the result file", () => {
    expect(collectReply(fromJson, '{"reply":"The boy\'s name is Eli."}')).toEqual({ outcome: "collected", text: "The boy's name is Eli." });
  });

  test("says why there's none", () => {
    expect(collectReply(fromJson, null)).toEqual({ outcome: "unavailable", reason: "the agent left no result file" });
    expect(collectReply(undefined, "{}")).toEqual({ outcome: "unavailable", reason: "its harness has no collectReply" });
    expect(collectReply(fromJson, "not json")).toMatchObject({ outcome: "unavailable", reason: expect.stringMatching(/^collectReply threw: /) });
    expect(collectReply(() => 42 as unknown as string, "{}")).toEqual({ outcome: "unavailable", reason: "collectReply returned number, not a string" });
  });
});
