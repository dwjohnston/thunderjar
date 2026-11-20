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
//   1. Picks the lowest-numbered task file in tasks/: not in archive/, done/ or draft/.
//   2. Makes a worktree from origin/<base> on ralph/<task>. <base> is --base, or the branch ralph runs from.
//   3. Runs `claude -p` on it, with capture on the branch store, under a session ID made here.
//   4. Moves the task file to done/, as its own commit.
//   5. Checks it: no error, at least one commit by the agent, lint, typecheck and tests pass.
//   6. Saves the run's state in .git/ralph/<task>.json, then force-pushes ralph/<task>, which ralph owns.
//   7. Opens a draft PR, whose description is the agent's final message, or updates the branch's open one.
//   8. Pushes the session's capture branch, thunderjar/capture/<session>, and only that one. A failure only warns.
//
// GitHub is reached over REST (`gh api`), never GraphQL, which Claude Code cloud sessions block.
// A task is done once its file is in done/ on the base branch, i.e. once its PR is merged. Until then a
// rerun runs it again.
// A failed task still gets its branch, capture and PR, titled "❌ ralph failed: …", then the loop stops:
// tasks are ordered by prerequisite, so later ones would build on a gap.
import { $ } from "bun";
import { Command, InvalidArgumentError } from "commander";

const TASKS_DIR = `${import.meta.dirname}/tasks`;
const TASKS_RELATIVE = "project-md/delivery/tasks";
const REMOTE = "origin";
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
  /** The branch each task starts from, and its PR targets. Default: the branch ralph runs from. */
  base?: string;
  max: number;
  budgetUsd: number;
  dryRun: boolean;
};

if (import.meta.main) {
  new Command()
    .description(
      "Run the delivery tasks in project-md/delivery/tasks/ one at a time with `claude -p`, each on its own branch and draft PR, with its capture pushed beside it.",
    )
    .option("--base <branch>", "the branch each task starts from and its PR targets (default: the current branch, or on a detached HEAD the one remote branch at it)")
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
  const base = await defaultBase(root, options.base);
  await $`git -C ${root} fetch --quiet ${REMOTE} ${base}`;
  const repo = await remoteRepo(root);
  const stateDir = `${(await $`git -C ${root} rev-parse --path-format=absolute --git-common-dir`.text()).trim()}/ralph`;
  // A task moves to done/ on its own branch, so this checkout still has it until its PR is merged.
  const ran = new Set<string>();
  let previous: Task | null = null;

  for (let iteration = 1; iteration <= options.max; iteration++) {
    const task = await firstTask(TASKS_DIR, ran);
    if (!task) {
      console.log("No tasks left.");
      return;
    }
    ran.add(task.name);
    console.log(`[${iteration}/${options.max}] ${task.name} (${task.harness}, ${task.model}, effort ${task.effort})`);
    if (!(await runTask(root, repo, stateDir, task, branchFrom(base, previous), options))) {
      throw new Error(`${task.name} failed: see its draft PR. Stopping, since later tasks may depend on it.`);
    }
    previous = task;
  }
}

/** Reads a task file's frontmatter. Throws when it's missing or invalid. */
export function parseTask(name: string, path: string, text: string): Task {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) throw new Error(`${path} has no frontmatter: it needs harness, model and effort`);
  const data = Bun.YAML.parse(match[1]) as Record<string, unknown>;
  const { harness, model, effort } = data;
  if (!HARNESSES.includes(harness as Harness)) {
    throw new Error(`${path}: harness is ${JSON.stringify(harness)}, use one of ${HARNESSES.join(", ")}`);
  }
  if (typeof model !== "string" || model === "") throw new Error(`${path}: model is missing`);
  if (!EFFORTS.includes(effort as Effort)) {
    throw new Error(`${path}: effort is ${JSON.stringify(effort)}, use one of ${EFFORTS.join(", ")}`);
  }
  return { name, path, harness: harness as Harness, model, effort: effort as Effort, text };
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
- Leave the task file where it is: the loop moves it to done/.
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

/** What a run left, saved before anything is pushed, so it isn't lost if ralph stops before the PR opens. */
export type RunState = { sessionId: string; base: string; result: string; failures: string[] };

function statePath(stateDir: string, task: Task): string {
  return `${stateDir}/${task.name}.json`;
}

/** Runs one task through to its PR. Returns whether it passed its checks. */
async function runTask(root: string, repo: Repo, stateDir: string, task: Task, base: string, options: Options): Promise<boolean> {
  const sessionId = crypto.randomUUID();
  const branch = branchFor(task);
  const args = claudeArgs(task, sessionId, options.budgetUsd);
  if (options.dryRun) {
    console.log(`branch: ${branch} from ${REMOTE}/${base}\nsession: ${sessionId}\nclaude ${args.map((arg) => JSON.stringify(arg)).join(" ")}`);
    return true;
  }

  const worktree = `${Bun.env.TMPDIR ?? "/tmp"}/thunderjar-ralph/${task.name}`;
  await $`git -C ${root} worktree add -B ${branch} ${worktree} ${REMOTE}/${base}`;
  try {
    await $`bun install --frozen-lockfile`.cwd(worktree);

    // The capture hooks in .claude/settings.json record the session; the branch store makes it a branch.
    const run = await $`claude ${args}`.cwd(worktree).env({ ...Bun.env, THUNDERJAR_CAPTURE_STORE: "branch" }).nothrow().quiet();
    const output = parseClaudeOutput(run.stdout.toString());
    const commits = Number((await $`git -C ${worktree} rev-list --count ${REMOTE}/${base}..HEAD`.text()).trim());
    await moveTaskToDone(worktree, task);
    const failures = await check(worktree, run.exitCode, output, commits);

    const state: RunState = { sessionId, base, result: output.result, failures };
    await Bun.write(statePath(stateDir, task), `${JSON.stringify(state, null, 2)}\n`);
    // --force: ralph owns ralph/<task>, and a rerun replaces the last run's branch.
    await $`git -C ${worktree} push --no-verify --force --set-upstream ${REMOTE} ${branch}`;
    console.log(`  saved the run in ${statePath(stateDir, task)}`);
    return await finish(root, repo, task, state);
  } finally {
    await $`git -C ${root} worktree remove --force ${worktree}`.nothrow();
  }
}

/**
 * Opens the PR of a pushed run, or updates the open one for its branch, then pushes its capture. The
 * capture goes last, and only warns when it fails, so the PR is never lost to it.
 */
async function finish(root: string, repo: Repo, task: Task, state: RunState): Promise<boolean> {
  const branch = branchFor(task);
  const capture = `${CAPTURE_BRANCH_PREFIX}/${state.sessionId}`;
  const hasCapture = (await $`git -C ${root} rev-parse --verify --quiet refs/heads/${capture}`.nothrow().quiet()).exitCode === 0;
  if (!hasCapture) console.warn(`  no capture branch ${capture}: are the capture hooks installed?`);
  const captureLink = hasCapture ? `https://github.com/${repo.owner}/${repo.repo}/tree/${capture}` : null;

  const body = prBody(task, state.result, captureLink, state.failures);
  const title = state.failures.length === 0 ? task.name : `❌ ralph failed: ${task.name}`;
  const pr = { title, head: branch, base: state.base, body };
  // REST, not `gh pr list`: GraphQL is blocked in Claude Code cloud sessions.
  const open = (await $`gh api ${`repos/${repo.owner}/${repo.repo}/pulls?head=${repo.owner}:${branch}&state=open`} --jq ${".[0].number // empty"}`.text()).trim();
  const url = open
    ? (await $`gh api -X PATCH ${`repos/${repo.owner}/${repo.repo}/pulls/${open}`} -f ${`title=${title}`} -f ${`body=${body}`} --jq .html_url`.text()).trim()
    : (await $`gh ${pullRequestArgs(repo, pr)}`.text()).trim();
  console.log(state.failures.length === 0 ? `  PR: ${url}` : `  failed (${state.failures.join("; ")}). PR: ${url}`);

  if (hasCapture) {
    // `thunderjar capture push` pushes every capture; this pushes just this session's.
    const pushed = await $`git -C ${root} push --no-verify ${REMOTE} ${capture}`.nothrow();
    if (pushed.exitCode !== 0) console.warn(`  couldn't push ${capture}: push it by hand, the PR links to it`);
  }
  return state.failures.length === 0;
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
async function check(worktree: string, exitCode: number, output: ClaudeOutput, commits: number): Promise<string[]> {
  const failures: string[] = [];
  if (exitCode !== 0) failures.push(`claude exited ${exitCode}`);
  if (output.isError) failures.push("claude reported an error");
  if (commits === 0) failures.push("no commits");
  for (const script of ["lint", "typecheck", "test"]) {
    const result = await $`bun run ${script}`.cwd(worktree).nothrow().quiet();
    if (result.exitCode !== 0) failures.push(`bun run ${script} failed`);
  }
  return failures;
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

export type Repo = { owner: string; repo: string };

/** The GitHub owner and repo of a remote URL, from its last two path segments. */
export function parseRemote(url: string): Repo {
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  if (!match?.[1] || !match[2]) throw new Error(`Can't read a GitHub owner and repo from the remote URL ${url}`);
  return { owner: match[1], repo: match[2] };
}

/** The GitHub repo of the remote, from its URL: no `gh repo view`, whose GraphQL is blocked in Claude Code cloud sessions. */
async function remoteRepo(root: string): Promise<Repo> {
  return parseRemote((await $`git -C ${root} remote get-url ${REMOTE}`.text()).trim());
}

export type PullRequest = { title: string; head: string; base: string; body: string };

/** The `gh` arguments that open `pr` as a draft. */
export function pullRequestArgs(repo: Repo, pr: PullRequest): string[] {
  return [
    "api",
    `repos/${repo.owner}/${repo.repo}/pulls`,
    "-f",
    `title=${pr.title}`,
    "-f",
    `head=${pr.head}`,
    "-f",
    `base=${pr.base}`,
    "-f",
    `body=${pr.body}`,
    "-F",
    "draft=true",
    "--jq",
    ".html_url",
  ];
}

/** What ralph records of a run, in the done task file's frontmatter. */
export type RunInfo = {
  session: string;
  capture: string;
  branchedFrom: string;
  date: string;
  costUsd: number | null;
  durationMs: number | null;
  isError: boolean;
};

/** Moves the task file to done/ in the worktree, as its own commit, so the PR closes the task. */
export async function moveTaskToDone(worktree: string, task: Task, _run?: RunInfo): Promise<void> {
  const from = `${TASKS_RELATIVE}/${task.name}.md`;
  const to = `${TASKS_RELATIVE}/done/${task.name}.md`;
  if (await Bun.file(`${worktree}/${to}`).exists()) return;
  if (await Bun.file(`${worktree}/${from}`).exists()) {
    await $`mkdir -p ${TASKS_RELATIVE}/done && git mv ${from} ${to}`.cwd(worktree);
  } else {
    // The base branch doesn't have the task file: add it, as done.
    await Bun.write(`${worktree}/${to}`, task.text);
    await $`git add ${to}`.cwd(worktree);
  }
  await $`git commit --quiet --no-verify -m ${`🤖 ralph: Move task ${task.name} to done`}`.cwd(worktree);
}

/** The lowest-numbered task file in `tasksDir`, not in done/ or draft/; or null when there's none. */
export async function firstTask(tasksDir: string, skip: ReadonlySet<string> = new Set()): Promise<Task | null> {
  // `*.md` matches only files directly in tasksDir, so done/, draft/ and archive/ are left out.
  for (const file of [...new Bun.Glob("*.md").scanSync(tasksDir)].sort()) {
    const name = file.replace(/\.md$/, "");
    if (skip.has(name)) continue;
    return parseTask(name, `${tasksDir}/${file}`, await Bun.file(`${tasksDir}/${file}`).text());
  }
  return null;
}

/**
 * The base for a detached HEAD: the one branch on the remote at HEAD, from
 * `git branch -r --points-at HEAD --format=%(refname:short)`. Null when there's none, or more than one.
 */
export function baseFromRemoteBranches(output: string): string | null {
  const prefix = `${REMOTE}/`;
  const branches = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix) && line !== `${prefix}HEAD`)
    .map((line) => line.slice(prefix.length));
  return branches.length === 1 ? (branches[0] ?? null) : null;
}

/** --base when given; else the current branch; else, on a detached HEAD, the one remote branch at it. */
async function defaultBase(root: string, base: string | undefined): Promise<string> {
  if (base) return base;
  const current = (await $`git -C ${root} branch --show-current`.text()).trim();
  if (current !== "") return current;
  const found = baseFromRemoteBranches(await $`git -C ${root} branch -r --points-at HEAD ${"--format=%(refname:short)"}`.text());
  if (found === null) throw new Error(`HEAD is detached, and not at exactly one ${REMOTE} branch: pass --base <branch>.`);
  return found;
}

/** The branch a task starts from, and its PR targets: the previous task's branch, so tasks stack; or, for the first, the base. */
export function branchFrom(base: string, previous: Task | null): string {
  return previous ? branchFor(previous) : base;
}
