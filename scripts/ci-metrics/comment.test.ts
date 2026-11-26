/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { expect, test } from "bun:test";
import { syncWarningComment } from "./comment";

type Comment = { id: number; body: string };

/** A pull request's comments on a fake GitHub, and the requests made to it. */
function fakeGitHub(comments: Comment[]) {
  const requests: string[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = new URL(String(url)).pathname;
    requests.push(`${method} ${path}`);
    const body = init?.body ? JSON.parse(String(init.body)).body : undefined;
    if (method === "GET") return Response.json(comments);
    if (method === "POST") comments.push({ id: 99, body });
    if (method === "PATCH") comments.find((c) => path.endsWith(`/${c.id}`))!.body = body;
    if (method === "DELETE") comments.splice(comments.findIndex((c) => path.endsWith(`/${c.id}`)), 1);
    return new Response(null, { status: method === "POST" ? 201 : 200 });
  };
  return { comments, requests, fetch: fetch as typeof globalThis.fetch };
}

const where = { apiUrl: "https://api.github.com", repository: "o/r", prNumber: 7, job: "check", token: "t" };

test("posts a warning when the upload fails, saying the PR needn't act", async () => {
  const gh = fakeGitHub([{ id: 1, body: "LGTM" }]);

  await syncWarningComment({ ...where, problem: "relation \"metrics.ci_step_metrics\" does not exist", fetch: gh.fetch });

  expect(gh.requests).toEqual(["GET /repos/o/r/issues/7/comments", "POST /repos/o/r/issues/7/comments"]);
  const warning = gh.comments[1]!.body;
  expect(warning).toContain("Warning: the CI metrics aren't uploading");
  expect(warning).toContain("`check` job");
  expect(warning).toContain("relation \"metrics.ci_step_metrics\" does not exist");
  expect(warning).toContain("no action is needed in this pull request");
});

test("updates its own warning rather than posting another", async () => {
  const gh = fakeGitHub([]);
  await syncWarningComment({ ...where, problem: "first", fetch: gh.fetch });

  await syncWarningComment({ ...where, problem: "second", fetch: gh.fetch });

  expect(gh.comments).toHaveLength(1);
  expect(gh.comments[0]!.body).toContain("second");
  expect(gh.requests.at(-1)).toBe("PATCH /repos/o/r/issues/comments/99");
});

test("keeps one warning per job", async () => {
  const gh = fakeGitHub([]);
  await syncWarningComment({ ...where, problem: "broken", fetch: gh.fetch });

  await syncWarningComment({ ...where, job: "docker", problem: "broken", fetch: gh.fetch });

  expect(gh.requests.filter((r) => r.startsWith("POST"))).toHaveLength(2);
});

test("deletes its warning once an upload works, and leaves other comments alone", async () => {
  const gh = fakeGitHub([{ id: 1, body: "LGTM" }]);
  await syncWarningComment({ ...where, problem: "broken", fetch: gh.fetch });

  await syncWarningComment({ ...where, fetch: gh.fetch });

  expect(gh.comments).toEqual([{ id: 1, body: "LGTM" }]);
});

test("does nothing when the upload works and there's no warning", async () => {
  const gh = fakeGitHub([{ id: 1, body: "LGTM" }]);

  await syncWarningComment({ ...where, fetch: gh.fetch });

  expect(gh.requests).toEqual(["GET /repos/o/r/issues/7/comments"]);
});
