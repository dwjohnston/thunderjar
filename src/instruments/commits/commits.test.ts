import { describe, expect, test } from "bun:test";
import { parseGitLog } from "./commits.ts";

describe("parseGitLog", () => {
  test("reads each commit's sha, whole message and files, sorted into added, modified and deleted", () => {
    const output = [
      "\x01aaa111\x02🔴 Test: add\n\nbody line\n\x03\0A\0src/a.test.ts\0",
      "\x01bbb222\x02🟢 Add a\n\x03\0A\0src/a.ts\0M\0README.md\0D\0old file.ts\0T\0link\0",
      "\x01ccc333\x02empty commit\n\x03",
    ].join("");
    expect(parseGitLog(output)).toEqual([
      { sha: "aaa111", message: "🔴 Test: add\n\nbody line", files: { added: ["src/a.test.ts"], modified: [], deleted: [] } },
      { sha: "bbb222", message: "🟢 Add a", files: { added: ["src/a.ts"], modified: ["README.md", "link"], deleted: ["old file.ts"] } },
      { sha: "ccc333", message: "empty commit", files: { added: [], modified: [], deleted: [] } },
    ]);
  });
});
