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

// A pull request comment saying the CI metrics aren't uploading: loud, without failing the build.

export type WarningCommentOptions = {
  apiUrl: string;
  /** e.g. "owner/repo". */
  repository: string;
  prNumber: number;
  job: string;
  token: string;
  /** Why the upload failed, or nothing when it worked. */
  problem?: string;
  fetch?: typeof globalThis.fetch;
};

/**
 * Keeps one warning comment per job on the pull request: posted or updated while `problem` is set,
 * deleted once an upload works. Found again by a hidden marker in its body.
 */
export async function syncWarningComment(options: WarningCommentOptions): Promise<void> {
  const { apiUrl, repository, prNumber, job, token, problem, fetch = globalThis.fetch } = options;
  const marker = `<!-- ci-metrics-upload-warning:${job} -->`;
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  const call = async (method: string, path: string, body?: string) => {
    const response = await fetch(`${apiUrl}/repos/${repository}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify({ body }) }),
    });
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${response.statusText}`);
    return response;
  };

  const comments = (await (await call("GET", `/issues/${prNumber}/comments?per_page=100`)).json()) as { id: number; body?: string }[];
  const existing = comments.find((c) => c.body?.includes(marker));

  if (problem === undefined) {
    if (existing) await call("DELETE", `/issues/comments/${existing.id}`);
    return;
  }
  const body = [
    marker,
    `⚠️ **Warning: the CI metrics aren't uploading** from the \`${job}\` job.`,
    "",
    "```",
    problem,
    "```",
    "",
    "This doesn't affect this pull request's build: no action is needed in this pull request. See `scripts/ci-metrics/README.md`.",
    "This comment is deleted once an upload works.",
  ].join("\n");
  if (existing) await call("PATCH", `/issues/comments/${existing.id}`, body);
  else await call("POST", `/issues/${prNumber}/comments`, body);
}
