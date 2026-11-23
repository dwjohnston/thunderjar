/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston (@dwjohnston)
 *
 * Humans: add your notes here
 */
import { describe, expect, test } from "bun:test";
import { protectedFiles } from "./codeowners-comment";

const CODEOWNERS = `
# Files that need a manual review from a human.

docs/**/*.md                      @dwjohnston
project-md/human-safe-space/**/*  @dwjohnston
/CONTRIBUTORS.md                  @dwjohnston
**/*.humans.*                     @dwjohnston
HUMANS.md                         @dwjohnston
/.github/CODEOWNERS               @dwjohnston
`;

describe("protectedFiles", () => {
  test("lists the changed files that match a CODEOWNERS rule, with their owners", () => {
    const changed = [
      "src/cli/index.ts",
      "docs/cli/plan.md",
      "project-md/human-safe-space/conventions/tags-and-refs.md",
      "CONTRIBUTORS.md",
      "src/CONTRIBUTORS.md",
      "fixtures/02_regular/0201_minimal_existing_setup/parameterNames.humans.test.ts",
      "HUMANS.md",
      "src/HUMANS.md",
      ".github/CODEOWNERS",
      "docs/index.ts",
    ];
    expect(protectedFiles(CODEOWNERS, changed, "blacksheep-bot")).toEqual([
      { path: "docs/cli/plan.md", owners: ["@dwjohnston"] },
      { path: "project-md/human-safe-space/conventions/tags-and-refs.md", owners: ["@dwjohnston"] },
      { path: "CONTRIBUTORS.md", owners: ["@dwjohnston"] },
      { path: "fixtures/02_regular/0201_minimal_existing_setup/parameterNames.humans.test.ts", owners: ["@dwjohnston"] },
      { path: "HUMANS.md", owners: ["@dwjohnston"] },
      { path: "src/HUMANS.md", owners: ["@dwjohnston"] },
      { path: ".github/CODEOWNERS", owners: ["@dwjohnston"] },
    ]);
  });
});
