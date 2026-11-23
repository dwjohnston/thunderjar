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
import { commentAction, commentBody, MARKER, protectedFiles } from "./codeowners-comment";

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

  test("leaves out files the author owns, as they need no one else's approval", () => {
    expect(protectedFiles(CODEOWNERS, ["HUMANS.md"], "dwjohnston")).toEqual([]);
  });
});

const PR = { repo: "dwjohnston/thunderjar", number: 42 };

describe("commentBody", () => {
  test("lists each protected file, linked to its diff, with its owners", () => {
    const body = commentBody(
      [
        { path: "HUMANS.md", owners: ["@dwjohnston"] },
        { path: "docs/cli/plan.md", owners: ["@dwjohnston", "@someone"] },
      ],
      PR,
    );
    expect(body).toBe(
      [
        MARKER,
        "### Changes to files with code owners",
        "",
        "This PR changes files that need a code owner's approval:",
        "",
        "- [`HUMANS.md`](https://github.com/dwjohnston/thunderjar/pull/42/files#diff-9fb6e1edd7cee50cec9852b98780479a272e7243eb23a02a0555a5295f7550a0) (@dwjohnston)",
        "- [`docs/cli/plan.md`](https://github.com/dwjohnston/thunderjar/pull/42/files#diff-9e1d9644beb7a5672b88919772dd0dd9db7615aff95aabebef1d6ff6009e292e) (@dwjohnston, @someone)",
        "",
      ].join("\n"),
    );
  });
});

const FILES = [{ path: "HUMANS.md", owners: ["@dwjohnston"] }];

describe("commentAction", () => {
  test("creates the comment when protected files change and there is none yet", () => {
    expect(commentAction(undefined, FILES, PR)).toEqual({ kind: "create", body: commentBody(FILES, PR) });
  });
});
