import { describe, expect, test } from "bun:test";
import { applyPlaceholders } from "./placeholders.ts";

describe("applyPlaceholders", () => {
  test("replaces ULIDs, wherever they sit", () => {
    expect(applyPlaceholders("Execution 01JAZ8KQ3M7X9V2B4C6D8E0F1G\n")).toBe("Execution <ULID>\n");
    expect(applyPlaceholders("thunderjar-postrun:01JAZ8KQ3M7X9V2B4C6D8E0F1G-1-1")).toBe("thunderjar-postrun:<ULID>-1-1");
    expect(applyPlaceholders("runs/01jaz8kq3m7x9v2b4c6d8e0f1g/")).toBe("runs/<ULID>/");
  });

  test("leaves what isn't a ULID", () => {
    const notUlids = [
      "8ZZZZZZZZZZZZZZZZZZZZZZZZZ", // first character above 7
      "01JAZ8KQ3M7X9V2B4C6D8E0F1", // 25 characters
      "01JAZ8KQ3M7X9V2B4C6D8E0F1GH", // 27 characters
      "01JAZ8KQ3M7X9V2B4C6D8E0FIL", // I and L aren't Crockford base32
      "d1c4b3e5a7f90812d3c4b5a6f7e8d9c0a1b2c3d4", // a git hash
    ];
    for (const text of notUlids) expect(applyPlaceholders(text)).toBe(text);
  });

  test("replaces durations", () => {
    expect(applyPlaceholders("done (123ms)")).toBe("done (<duration>)");
    expect(applyPlaceholders("done (1.2s)")).toBe("done (<duration>)");
    expect(applyPlaceholders("took 45s, then 0.5ms")).toBe("took <duration>, then <duration>");
  });

  test("leaves numbers that aren't durations", () => {
    for (const text of ["iteration 1/5", "1s2", "a2s", "2 seconds", "v1.2.3", "10 items"]) {
      expect(applyPlaceholders(text)).toBe(text);
    }
  });

  test("replaces the given paths with their placeholders, the longest first", () => {
    const paths = { "<REPO>": "/repo", "<PROJECT>": "/repo/fixtures/02_regular/0201_x/project" };
    expect(applyPlaceholders("Wrote /repo/fixtures/02_regular/0201_x/project/.thunderjar/a.ts", paths)).toBe(
      "Wrote <PROJECT>/.thunderjar/a.ts",
    );
    expect(applyPlaceholders("see /repo/README.md and /repo/README.md", paths)).toBe(
      "see <REPO>/README.md and <REPO>/README.md",
    );
  });

  test("matches a path given with a trailing slash, and treats it literally", () => {
    expect(applyPlaceholders("in /tmp/a.b/x", { "<TMP>": "/tmp/a.b/" })).toBe("in <TMP>/x");
    expect(applyPlaceholders("in /tmp/aXb/x", { "<TMP>": "/tmp/a.b" })).toBe("in /tmp/aXb/x");
  });

  test("replaces paths before ULIDs, so a ULID in a path doesn't break the path", () => {
    const tmp = "/tmp/01JAZ8KQ3M7X9V2B4C6D8E0F1G";
    expect(applyPlaceholders(`${tmp}/runs/01JAZ8KQ3M7X9V2B4C6D8E0F1H`, { "<TMP>": tmp })).toBe("<TMP>/runs/<ULID>");
  });

  test("ignores empty paths", () => {
    expect(applyPlaceholders("a/b", { "<EMPTY>": "" })).toBe("a/b");
  });
});
