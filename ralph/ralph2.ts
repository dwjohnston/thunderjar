#!/usr/bin/env bun
// Ralph loop: a planner/reviewer agent (Codex, Sol) and a builder agent (Claude Code)
// take turns until every delivery story in thunderjar2/delivery/ is delivered.
//
// Goals are the stories at the top level of thunderjar2/delivery/ (NNNN_name.md), taken in
// number order. A delivered story moves to thunderjar2/delivery/delivered/.
// The planner breaks the current story into tiny tasks in scratch-pad/ralph/tasks/, the
// builder builds one task at a time in this repo, and the planner reviews each one.
//
//   bun ralph/ralph2.ts
//
// If the planner finds a story needs a human (👷‍♂️ steps it can't do), it writes
// scratch-pad/ralph/BLOCKED.md and the loop stops. Delete that file to resume.
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, relative, basename } from "node:path";

const APP = resolve(import.meta.dir, "..");
const SPEC_REPO = resolve(APP, "..", "thunderjar2");
const GOALS = join(SPEC_REPO, "delivery");
const GOALS_DONE = join(GOALS, "delivered");
const PLAN = join(APP, "scratch-pad", "ralph");
const TASKS = join(PLAN, "tasks");
const DELIVERED = join(TASKS, "delivered");
const BLOCKED = join(PLAN, "BLOCKED.md");
const MAX_ITERATIONS = Number(process.env.RALPH_MAX_ITERATIONS ?? 200);
const BUILDER_MODEL = process.env.RALPH_BUILDER_MODEL ?? "claude-opus-5-5";
const BUILDER_EFFORT = process.env.RALPH_BUILDER_EFFORT ?? "high"; // low | medium | high | xhigh | max
const PLANNER_MODEL = process.env.RALPH_PLANNER_MODEL ?? "gpt-6.1-sol";
const PLANNER_EFFORT = process.env.RALPH_PLANNER_EFFORT ?? "high"; // low | medium | high | xhigh | max | ultra
const OVERAGE_SLEEP_MS = 2 * 60 * 60 * 1000;

for (const d of [GOALS_DONE, TASKS, DELIVERED]) mkdirSync(d, { recursive: true });

const mdFiles = (dir: string, pattern = /\.md$/) =>
    readdirSync(dir).filter((f) => pattern.test(f)).sort();
const currentTask = () => mdFiles(TASKS)[0];
// Only numbered stories are goals: AGENTS.md, archive/ and proposed/ are not.
const currentGoal = () => mdFiles(GOALS, /^\d{4}_.+\.md$/)[0];
const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const rel = (p: string) => relative(APP, p);

// --- agents ---

// Codex, with approvals and sandbox bypassed (the dev container is the sandbox).
async function runPlanner(prompt: string) {
    log("planner start");
    const proc = Bun.spawn(
        [
            "codex", "exec",
            "--model", PLANNER_MODEL,
            "-c", `model_reasoning_effort="${PLANNER_EFFORT}"`,
            "--dangerously-bypass-approvals-and-sandbox",
            "--cd", APP,
            prompt,
        ],
        { cwd: APP, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
    );
    const code = await proc.exited;
    log(`planner exit ${code}`);
    if (code !== 0) throw new Error(`planner failed with exit code ${code}`);
}

// Claude Code, with permission checks bypassed. Returns "overage" if it started drawing on
// extra usage (paid credits beyond the plan's limits), in which case it's killed. The CLI
// can't refuse extra usage itself, but stream-json reports it in rate_limit_event.
// Otherwise returns the exit code and the builder's final message (its report).
async function runBuilder(prompt: string): Promise<{ code: number; report: string } | "overage"> {
    log("builder start");
    const proc = Bun.spawn(
        [
            "claude", "-p", prompt,
            "--model", BUILDER_MODEL,
            "--effort", BUILDER_EFFORT,
            "--dangerously-skip-permissions",
            "--output-format", "stream-json",
            "--verbose",
        ],
        { cwd: APP, stdio: ["ignore", "pipe", "inherit"] },
    );

    let overage = false;
    let report = "";
    let buffered = "";
    for await (const chunk of proc.stdout.pipeThrough(new TextDecoderStream())) {
        buffered += chunk;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "rate_limit_event") {
                const info = event.rate_limit_info ?? {};
                if (info.isUsingOverage || info.overageInUse) {
                    overage = true;
                    proc.kill();
                }
            } else if (event.type === "assistant") {
                for (const block of event.message?.content ?? []) {
                    if (block.type === "text") console.log(block.text);
                    else if (block.type === "tool_use") console.log(`  [${block.name}]`);
                }
            } else if (event.type === "result") {
                console.log(`\nbuilder: ${event.subtype}, ${event.num_turns} turns`);
                report = event.result ?? "";
            }
        }
    }

    const code = await proc.exited;
    log(`builder exit ${overage ? "overage" : code}`);
    return overage ? "overage" : { code, report };
}

async function git(...args: string[]) {
    const p = Bun.spawn(["git", ...args], { cwd: APP, stdout: "pipe", stderr: "pipe" });
    const out = await new Response(p.stdout).text();
    await p.exited;
    return out.trim();
}

// The builder commits in red/green steps, so review every commit since the task was handed over.
async function commitsSince(base: string) {
    const out = await git("log", "--stat", "--format=%n%h %s%n%n%b", `${base}..HEAD`);
    return out || "(no commits)";
}

const PLANNER_RULES = `
You are the PLANNER and REVIEWER in a builder/planner loop delivering Thunderjar, a CLI in this repo
(${APP}). A separate builder agent writes the code; you never write or edit code, tests or fixtures yourself.
Read AGENTS.md (and src/AGENTS.md, fixtureTests/AGENTS.md as needed) for the repo's conventions.

Goals are delivery stories written against the spec in ${SPEC_REPO}:
  ${GOALS}/NNNN_*.md            open stories, delivered in number order
  ${GOALS_DONE}/                delivered stories (read them for earlier decisions)
  ${SPEC_REPO}/spec/            the spec the stories link to (links in a story are relative to delivery/)
Do not read ${SPEC_REPO}/docs/conversation*; it is long and slow.

Your own working files, in this repo:
  ${rel(TASKS)}/            open tasks (NNNN_name.md)
  ${rel(DELIVERED)}/  delivered tasks
  ${rel(BLOCKED)}      write this only if the loop can't continue without a human

You can read the source and run anything to check behaviour: \`bun test\`, \`bun run typecheck\`, \`bun run lint\`,
\`bun run fixture <scenario> <command…>\`, and the story's "How to test" commands. Don't leave the working tree dirty
except for your own task files. When you change task files, commit only them:
\`git add ${rel(PLAN)} && git commit -m "🤖 - <what you did>"\` with the commit footer AGENTS.md asks for.

To try the built CLI the way a user would, outside the fixture scenarios, run \`bun run dev:link\`. It builds the
CLI, links it, and clears two scratch projects named in .env (THUNDERJAR_TRY_JS_DIR, with a package.json, and
THUNDERJAR_TRY_NON_JS_DIR, without one), then prints how to run \`thunderjar init\` in each. Run it again before
each check, since it starts both projects empty. If .env is missing, copy .env.example to .env and point both at
folders outside the repo.

The builder only sees the task file you give it (plus the repo and the spec pages the task links to), so tasks
must be self-contained, small (one deliverable, one tiny piece of verifiable behaviour), and have concrete,
observable acceptance criteria: a test, a command and its output, or a check you can run quickly.
Do exactly what is asked below, then stop.`;

async function reviewTask(task: string, base: string, reports: string[]) {
    const commits = await commitsSince(base);
    await runPlanner(`${PLANNER_RULES}

MODE: REVIEW TASK
Current goal: ${GOALS}/${currentGoal()}
Current task: ${rel(TASKS)}/${task}
Commits by the builder since the task was handed over:
${commits}

The builder's report from each attempt at this task, oldest first:
${reports.map((r, n) => `--- attempt ${n + 1} ---\n${r || "(no report)"}`).join("\n")}

Read the task and assess whether it is complete: look at the commits, run \`bun run typecheck\`, \`bun run lint\`,
\`bun test\`, and observe the behaviour the task's acceptance criteria describe.
- If complete: move ${rel(TASKS)}/${task} into ${rel(DELIVERED)}/ and commit the move. Then tag that commit with
  an annotated tag named ralph/${basename(task, ".md")}, in the format below. "Decisions made" is the builder's:
  take it from its reports, keeping its wording, and drop decisions a later attempt reversed. "Feedback or
  suggestions for improvement" has both agents' points: the builder's from its reports, then yours from the review,
  each labelled with who raised it.

    🤖- <task name>

    Task Description:
    <task description>

    Decisions made:
    <decisions made>

    Feedback or suggestions for improvement:
    <feedback>


    Builder Agent
    ${BUILDER_MODEL}/claude-code

    Reviewer Agent
    ${PLANNER_MODEL}/codex
- If not complete: edit the task file, adding a "## Feedback" section (replace any earlier one) that says
  precisely what is missing or wrong, with the command you ran and what you observed. Leave it in ${rel(TASKS)}/
  and commit the change.
Then exit.`);
}

async function planNext() {
    const goal = currentGoal();
    await runPlanner(`${PLANNER_RULES}

MODE: ASSESS GOAL AND CREATE TASKS
The task list is empty. Current goal: ${GOALS}/${goal}
1. Read the goal, the spec sections it links to, and the delivered tasks in ${rel(DELIVERED)}/. Check the app
   against the goal's Artifacts and "How to test". Is the goal fully met?
2. If it is met: move ${GOALS}/${goal} to ${GOALS_DONE}/ with plain \`mv\` (not \`git mv\`; don't commit in
   ${SPEC_REPO}), then exit. Do not look at other goals or create tasks; a fresh session will assess the next goal.
3. If the rest of it can't be met without a human (its 👷‍♂️ steps: secrets, accounts, click-ops, checking by eye),
   and no agent-buildable work is left, write ${rel(BLOCKED)} saying exactly what the human must do, commit it,
   and exit.
4. Otherwise: create one or more new tasks in ${rel(TASKS)}/ named NNNN_short_name.md, numbered in the order they
   should be built, after the highest number already used in ${rel(TASKS)}/ and ${rel(DELIVERED)}/.
   Each task names its goal and links the spec sections it needs (absolute paths).
   Tasks must be TINY. Each task is exactly ONE small piece of verifiable behaviour (e.g. "\`outcomeOf(exitCode)\`
   maps 0/124/other", not "add failure handling to run and show"). Size each task to minimise the combined cost of
   building it plus reviewing it: a builder should finish in a few minutes, and a reviewer should be able to
   confirm it with one or two quick checks. If a step feels like it needs more than a handful of changes, split it.
   Each task must state its acceptance criterion and how to observe it. Prefer a short ordered sequence of
   tiny tasks (each leaving the app passing typecheck, lint and tests) over a single large one; plan as many as
   are needed to cover the next stretch of the goal, but don't plan speculatively far ahead.
   Commit the new tasks.
Then exit.`);
}

async function build(task: string) {
    const taskText = await Bun.file(join(TASKS, task)).text();
    return runBuilder(`You are the BUILDER delivering Thunderjar, the CLI in this repo. Follow AGENTS.md (and
src/AGENTS.md, fixtureTests/AGENTS.md), including its commit conventions. The spec is in ${SPEC_REPO}/spec/;
read the pages the task links to, and don't read ${SPEC_REPO}/docs/conversation*.
Implement the task below completely, and nothing beyond it. Work in a TDD loop:
1. Write the appropriate (failing) test and commit it.
2. Implement the functionality so the test passes, and commit it.
It may take several attempts to get both the test and the implementation right. Rebase to keep the commit history
clean: there should be only one pair of commits per sensible unit of work.
If the task has a "Feedback" section, that is a reviewer's assessment of your previous attempt: address every point.
Don't edit anything under ${rel(PLAN)}/ or in ${SPEC_REPO}.
Before you finish, run \`bun run typecheck\`, \`bun run lint\` and \`bun test\`, and fix anything you broke.
Commit all changes. Then end with a final message that is only your report, for the reviewer, in this form:

Decisions made:
<each decision you took that the task or spec didn't settle, and why>

Feedback or suggestions for improvement:
<anything about the task, the spec or the codebase that got in your way or should change; "None." if nothing>

TASK (${basename(task)}):
${taskText}`);
}

// --- the loop ---
// task file -> HEAD before the builder's latest attempt at it, in this run
const built = new Map<string, string>();
// task file -> the builder's report from each attempt, for the tag annotation
const reports = new Map<string, string[]>();
for (let i = 1; i <= MAX_ITERATIONS; i++) {
    if (existsSync(BLOCKED)) break;
    log(`=== iteration ${i} ===`);
    let task = currentTask();

    if (task) {
        // Only review if the builder has produced something since this task was assigned.
        const base = built.get(task);
        if (base) {
            await reviewTask(task, base, reports.get(task) ?? []);
            if (currentTask() !== task) continue; // delivered; pick up the next thing
        }
    } else {
        const goal = currentGoal();
        if (!goal) break;
        await planNext();
        if (existsSync(BLOCKED)) break;
        task = currentTask();
        if (!task) {
            if (currentGoal() !== goal) continue; // goal delivered; next iteration assesses the next goal in a new session
            throw new Error("planner left goal open but created no task");
        }
    }

    const base = await git("rev-parse", "HEAD");
    const result = await build(task);
    if (result === "overage") {
        const resumeAt = new Date(Date.now() + OVERAGE_SLEEP_MS);
        log(`builder started using extra usage on ${task}. Sleeping until ${resumeAt.toLocaleTimeString()}.`);
        await Bun.sleep(OVERAGE_SLEEP_MS);
        continue; // not marked built, so the task is rebuilt rather than reviewed
    }
    if (result.code !== 0) throw new Error(`builder failed with exit code ${result.code} on ${task}`);
    built.set(task, base);
    reports.set(task, [...(reports.get(task) ?? []), result.report]);
}

if (existsSync(BLOCKED)) log(`stopped: blocked on a human, see ${rel(BLOCKED)}`);
else log(currentGoal() ? "stopped: iteration limit reached" : "all goals delivered");
process.exit(0);
