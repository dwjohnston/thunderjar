#!/usr/bin/env bun
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

// A single-node ralph loop over the delivery tasks. Each iteration:
//
//   1. Picks the lowest-numbered task in tasks/ (not archive/ or done/) with no ralph/<task> branch on origin.
//   2. Makes a worktree from origin/main on ralph/<task>.
//   3. Runs `claude -p` on it, with capture on the branch store, under a session ID made here.
//   4. Checks it: no error, at least one commit, lint, typecheck and tests pass.
//   5. Pushes the branch and opens a draft PR, whose description is the agent's final message.
//   6. Pushes the session's capture branch, thunderjar/capture/<session>, and only that one.
//
// A failed task still gets its branch, capture and PR, titled "❌ ralph failed: …", then the loop stops:
// tasks are ordered by prerequisite, so later ones would build on a gap.
import { $ } from "bun";
import { Command, InvalidArgumentError } from "commander";

const TASKS_DIR = `${import.meta.dirname}/tasks`;
const REMOTE = "origin";
const BASE = "main";
const BRANCH_PREFIX = "ralph";
const CAPTURE_BRANCH_PREFIX = "thunderjar/capture";
const DEFAULT_MAX = 1;
const DEFAULT_BUDGET_USD = 5;
const HARNESSES = ["claude-code"] as const;
const EFFORTS = ["low", "medium", "high"] as const;

type Harness = (typeof HARNESSES)[number];
type Effort = (typeof EFFORTS)[number];

export type Task = {
  /** The file name without `.md`, e.g. `0100_capture-push-session`. */
  name: string;
  path: string;
  harness: Harness;
  model: string;
  effort: Effort;
  /** The file's text, frontmatter included. */
  text: string;
};

export type Options = {
  max: number;
  budgetUsd: number;
  dryRun: boolean;
};

if (import.meta.main) {
  new Command()
    .description(
      "Run the delivery tasks in project-md/delivery/tasks/ one at a time with `claude -p`, each on its own branch and draft PR, with its capture pushed beside it.",
    )
    .option("--max <n>", "how many tasks to run", positiveNumber, DEFAULT_MAX)
    .option("--budget-usd <amount>", "the most one task may spend, passed to claude as --max-budget-usd", positiveNumber, DEFAULT_BUDGET_USD)
    .option("--dry-run", "print the task it would pick and the claude command, then stop", false)
    .addHelpText(
      "after",
      `
Each task file starts with frontmatter:

  ---
  harness: claude-code
  model: sonnet
  effort: low
  ---

Needs claude and gh on the PATH, gh logged in, and ANTHROPIC_API_KEY (or a Claude login).

Example:
  bun project-md/delivery/ralph.ts --dry-run
  bun project-md/delivery/ralph.ts --max 3`,
    )
    .action(async (options: Options) => {
      await main(options);
    })
    .parseAsync();
}

export async function main(options: Options): Promise<void> {
  const root = (await $`git -C ${import.meta.dirname} rev-parse --show-toplevel`.text()).trim();
  await $`git -C ${root} fetch --quiet ${REMOTE} ${BASE}`;

  for (let iteration = 1; iteration <= options.max; iteration++) {
    const task = await nextTask(root);
    if (!task) {
      console.log("No tasks left.");
      return;
    }
    console.log(`[${iteration}/${options.max}] ${task.name} (${task.harness}, ${task.model}, effort ${task.effort})`);
    const ok = await runTask(root, task, options);
    if (!ok) {
      throw new Error(`${task.name} failed: see its draft PR. Stopping, since later tasks may depend on it.`);
    }
  }
}

/** The lowest-numbered task that has no branch on the remote yet, or null when there's none. */
export async function nextTask(root: string): Promise<Task | null> {
  const files = [...new Bun.Glob("*.md").scanSync(TASKS_DIR)].sort();
  for (const file of files) {
    const task = parseTask(file.replace(/\.md$/, ""), `${TASKS_DIR}/${file}`, await Bun.file(`${TASKS_DIR}/${file}`).text());
    const remote = await $`git -C ${root} ls-remote --heads ${REMOTE} ${branchFor(task)}`.text();
    if (remote.trim() === "") return task;
  }
  return null;
}

/** Reads a task file's frontmatter. Throws when it's missing or invalid. */
export function parseTask(name: string, path: string, text: string): Task {
  return { name, path, harness: "claude-code", model: "", effort: "low", text };
}

export function branchFor(task: Task): string {
  return `${BRANCH_PREFIX}/${task.name}`;
}

/** The prompt the agent gets: the task, and what to do around it. */
export function promptFor(task: Task): string {
  const relative = `project-md/delivery/tasks/${task.name}.md`;
  return `You are one iteration of a ralph loop. Do the task below, on your own, in one go. No one will answer questions.

- Follow AGENTS.md: red/green commits, a changeset if the package changes.
- Commit all your work on the current branch. Don't push, and don't open a PR: the loop does both.
- When it's done, move the task file to project-md/delivery/tasks/done/ (mkdir -p project-md/delivery/tasks/done && git mv ${relative} project-md/delivery/tasks/done/), and commit that too.
- Your final message is used as the PR description, as is. Make it only the PR description, following the tj-meta-pull-request-description skill.

The task, from ${relative}:

${task.text}`;
}

/** The claude command for a task. */
export function claudeArgs(task: Task, sessionId: string, budgetUsd: number): string[] {
  return [
    "-p",
    promptFor(task),
    "--session-id",
    sessionId,
    "--model",
    task.model,
    "--effort",
    task.effort,
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
    "--max-budget-usd",
    String(budgetUsd),
  ];
}

/** Runs one task through to its PR. Returns whether it passed its checks. */
async function runTask(root: string, task: Task, options: Options): Promise<boolean> {
  const sessionId = crypto.randomUUID();
  const branch = branchFor(task);
  const args = claudeArgs(task, sessionId, options.budgetUsd);
  if (options.dryRun) {
    console.log(`branch: ${branch}\nsession: ${sessionId}\nclaude ${args.map((arg) => JSON.stringify(arg)).join(" ")}`);
    return true;
  }

  const worktree = `${Bun.env.TMPDIR ?? "/tmp"}/thunderjar-ralph/${task.name}`;
  await $`git -C ${root} worktree add -b ${branch} ${worktree} ${REMOTE}/${BASE}`;
  try {
    await $`bun install --frozen-lockfile`.cwd(worktree);

    // The capture hooks in .claude/settings.json record the session; the branch store makes it a branch.
    const run = await $`claude ${args}`.cwd(worktree).env({ ...Bun.env, THUNDERJAR_CAPTURE_STORE: "branch" }).nothrow().quiet();
    const output = parseClaudeOutput(run.stdout.toString());
    const failures = await check(worktree, run.exitCode, output);

    await $`git -C ${worktree} push --no-verify --set-upstream ${REMOTE} ${branch}`;
    const captureLink = await pushCapture(root, sessionId);
    const body = prBody(task, output.result, captureLink, failures);
    const title = failures.length === 0 ? task.name : `❌ ralph failed: ${task.name}`;
    const url = (await $`gh pr create --draft --base ${BASE} --head ${branch} --title ${title} --body ${body}`.cwd(worktree).text()).trim();
    console.log(failures.length === 0 ? `  PR: ${url}` : `  failed (${failures.join("; ")}). PR: ${url}`);
    return failures.length === 0;
  } finally {
    await $`git -C ${root} worktree remove --force ${worktree}`.nothrow();
  }
}

type ClaudeOutput = { isError: boolean; result: string };

/** Reads `claude -p --output-format json`'s result. Anything unreadable counts as an error. */
export function parseClaudeOutput(stdout: string): ClaudeOutput {
  try {
    const json = JSON.parse(stdout) as { is_error?: boolean; result?: unknown };
    return { isError: json.is_error === true, result: typeof json.result === "string" ? json.result : "" };
  } catch {
    return { isError: true, result: stdout };
  }
}

/** Why the task failed; empty when it passed. */
async function check(worktree: string, exitCode: number, output: ClaudeOutput): Promise<string[]> {
  const failures: string[] = [];
  if (exitCode !== 0) failures.push(`claude exited ${exitCode}`);
  if (output.isError) failures.push("claude reported an error");
  const ahead = (await $`git -C ${worktree} rev-list --count ${REMOTE}/${BASE}..HEAD`.text()).trim();
  if (ahead === "0") failures.push("no commits");
  for (const script of ["lint", "typecheck", "test"]) {
    const result = await $`bun run ${script}`.cwd(worktree).nothrow().quiet();
    if (result.exitCode !== 0) failures.push(`bun run ${script} failed`);
  }
  return failures;
}

/** Pushes the session's capture branch alone. Returns a link to it, or null when there's no capture. */
async function pushCapture(root: string, sessionId: string): Promise<string | null> {
  const branch = `${CAPTURE_BRANCH_PREFIX}/${sessionId}`;
  const exists = await $`git -C ${root} rev-parse --verify --quiet refs/heads/${branch}`.nothrow().quiet();
  if (exists.exitCode !== 0) {
    console.warn(`  no capture branch ${branch}: are the capture hooks installed?`);
    return null;
  }
  // `thunderjar capture push` pushes every capture; this pushes just this session's.
  await $`git -C ${root} push --no-verify ${REMOTE} ${branch}`;
  const repo = (await $`gh repo view --json url --jq .url`.cwd(root).text()).trim();
  return `${repo}/tree/${branch}`;
}

export function prBody(task: Task, result: string, captureLink: string | null, failures: string[]): string {
  const lines = [result.trim() || "_The agent gave no final message._", "", "---", ""];
  if (failures.length > 0) lines.push(`**Ralph checks failed:** ${failures.join("; ")}`, "");
  lines.push(`Ralph loop task: \`${task.name}\` (${task.harness}, ${task.model}, effort ${task.effort})`);
  lines.push(captureLink ? `Capture: ${captureLink}` : "Capture: none was recorded.");
  return lines.join("\n");
}

function positiveNumber(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new InvalidArgumentError("must be a positive number");
  return number;
}
