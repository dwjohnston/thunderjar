/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFLaxJLiUMbmTp2fu
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { expect, test } from "bun:test";
import { measure } from "thunderjar/testing";
import usesJsAst from "../usesJsAst.ts";

// PR #288's measurements, as the agent's: at 513c384, its last shell-script version, and at its
// head, 11331aa, after the owner asked for jsAst.
const NEW_TASK = ".thunderjar/parameters/tasks/claude-code-helper-provider/measurements";
const fixture = (name: string) => `${import.meta.dir}/fixtures/${name}`;
const pr288 = (version: "pr288-first" | "pr288-head", names: string[]) =>
  Object.fromEntries(names.map((name) => [`${NEW_TASK}/${name}`, fixture(`${version}/${name}`)]));

test("PR #288's head, whose custom-provider measurement is jsAst, uses jsAst", async () => {
  const files = pr288("pr288-head", ["commits.ts", "customProvider.ts", "filesChanged.ts"]);
  expect((await measure(usesJsAst, { files })).metrics.usesJsAst).toBe(true);
});

// tj-eval-blacksheepcode's codeStateUsesTag.ts was already jsAst at the start, so it doesn't count.
test("PR #288's first version, whose custom-provider measurement is shell, doesn't use jsAst, beside the start's own jsAst measurement", async () => {
  const files = {
    ...pr288("pr288-first", ["commits.ts", "customProvider.helpers.ts", "customProvider.ts", "filesChanged.ts"]),
    ".thunderjar/parameters/tasks/tj-eval-blacksheepcode/measurements/codeStateUsesTag.ts": fixture("start/codeStateUsesTag.ts"),
  };
  expect((await measure(usesJsAst, { files })).metrics.usesJsAst).toBe(false);
});
