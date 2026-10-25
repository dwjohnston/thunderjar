import { appendFile, readFile } from "node:fs/promises";
import { canPreview, previewVersion } from "./release-policy.ts";

type PreviewEvent = { comment?: { body?: string; user?: { login?: string } }; issue?: { number?: number; pull_request?: unknown } };
type Pull = { state: string; head: { sha: string; repo?: { full_name?: string } } };

async function github<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub API ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!eventPath || !repository || !token || !outputPath) throw new Error("Missing GitHub workflow environment");
  const event = JSON.parse(await readFile(eventPath, "utf8")) as PreviewEvent;
  const number = event.issue?.number;
  const login = event.comment?.user?.login;
  if (event.comment?.body !== "/preview" || !event.issue?.pull_request || !number || !login) {
    throw new Error("Expected an exact /preview comment on a pull request");
  }
  const permission = await github<{ permission: string }>(`/repos/${repository}/collaborators/${encodeURIComponent(login)}/permission`, token);
  const pull = await github<Pull>(`/repos/${repository}/pulls/${number}`, token);
  if (!canPreview(permission.permission, pull.state, pull.head.repo?.full_name ?? "", repository)) {
    throw new Error("Preview requires an open repository-branch PR and a commenter with write access");
  }
  const version = previewVersion(number, pull.head.sha);
  await appendFile(outputPath, `number=${number}\nsha=${pull.head.sha}\nversion=${version}\n`);
}

if (import.meta.main) await main();
