/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLjFb1Gy2NHaFDTB6tk
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */
import { $ } from "bun";
import { expect, test } from "bun:test";
import { firstTask, moveTaskToDone, parseRemote, parseTask, pullRequestArgs } from "./ralph.ts";

test("parseTask reads harness, model and effort from the frontmatter", () => {
  const text = "---\nharness: claude-code\nmodel: sonnet\neffort: medium\n---\n\n# 3900: A task\n";
  expect(parseTask("3900_a-task", "tasks/3900_a-task.md", text)).toEqual({
    name: "3900_a-task",
    path: "tasks/3900_a-task.md",
    harness: "claude-code",
    model: "sonnet",
    effort: "medium",
    text,
  });
});

test("parseRemote reads the owner and repo from a remote URL", () => {
  for (const url of [
    "https://github.com/dwjohnston/thunderjar",
    "https://github.com/dwjohnston/thunderjar.git",
    "git@github.com:dwjohnston/thunderjar.git",
    "http://proxy@127.0.0.1:8080/git/dwjohnston/thunderjar",
  ]) {
    expect(parseRemote(url)).toEqual({ owner: "dwjohnston", repo: "thunderjar" });
  }
});

test("pullRequestArgs opens a draft PR over REST, not GraphQL", () => {
  const repo = { owner: "dwjohnston", repo: "thunderjar" };
  const pr = { title: "4000_a-task", head: "ralph/4000_a-task", base: "main", body: "Did it." };
  expect(pullRequestArgs(repo, pr)).toEqual([
    "api",
    "repos/dwjohnston/thunderjar/pulls",
    "-f",
    "title=4000_a-task",
    "-f",
    "head=ralph/4000_a-task",
    "-f",
    "base=main",
    "-f",
    "body=Did it.",
    "-F",
    "draft=true",
    "--jq",
    ".html_url",
  ]);
});

test("firstTask is the lowest-numbered task file, ignoring done/ and draft/", async () => {
  const dir = `${Bun.env.TMPDIR ?? "/tmp"}/ralph-test-${crypto.randomUUID()}`;
  const text = "---\nharness: claude-code\nmodel: sonnet\neffort: low\n---\n";
  await Bun.write(`${dir}/4000_later.md`, text);
  await Bun.write(`${dir}/3900_first.md`, text);
  await Bun.write(`${dir}/done/0100_done.md`, text);
  await Bun.write(`${dir}/draft/0200_draft.md`, text);

  expect((await firstTask(dir))?.name).toBe("3900_first");
  await $`rm -rf ${dir}`;
});

test("moveTaskToDone moves the task file to done/ in its own commit", async () => {
  const dir = `${Bun.env.TMPDIR ?? "/tmp"}/ralph-test-${crypto.randomUUID()}`;
  const text = "---\nharness: claude-code\nmodel: sonnet\neffort: low\n---\n\n# 3900: A task\n";
  await Bun.write(`${dir}/project-md/delivery/tasks/3900_a-task.md`, text);
  await $`git init --quiet && git config user.name t && git config user.email t@t && git add -A && git commit --quiet -m start`.cwd(dir);
  const task = parseTask("3900_a-task", `${dir}/project-md/delivery/tasks/3900_a-task.md`, text);

  await moveTaskToDone(dir, task);

  expect(await Bun.file(`${dir}/project-md/delivery/tasks/done/3900_a-task.md`).exists()).toBe(true);
  expect(await Bun.file(`${dir}/project-md/delivery/tasks/3900_a-task.md`).exists()).toBe(false);
  expect((await $`git status --porcelain`.cwd(dir).text()).trim()).toBe("");
  await $`rm -rf ${dir}`;
});
