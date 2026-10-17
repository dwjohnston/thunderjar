// Ralph loop: hand the first task in scratch-pad/tasks to a fresh Claude Code
// session, wait for it to move the task into scratch-pad/tasks/done, repeat.
//
//   bun ralph/ralph.ts          # work through every task
//   bun ralph/ralph.ts --once   # do just the first task

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const MODEL = "claude-opus-5-5";
const EFFORT = "medium"; // low | medium | high | xhigh | max

const root = join(import.meta.dir, "..");
const tasksDir = join(root, "scratch-pad", "tasks");
const doneDir = join(tasksDir, "done");
const once = process.argv.includes("--once");

function firstTask(): string | undefined {
    return readdirSync(tasksDir)
        .filter((name) => name.endsWith(".md") && statSync(join(tasksDir, name)).isFile())
        .sort()[0];
}

function prompt(task: string): string {
    const taskPath = relative(root, join(tasksDir, task));
    const donePath = relative(root, join(doneDir, task));
    return [
        `Your task is in ${taskPath}. Read it, and the plan it links to, then do it.`,
        "Do only this task. Don't start on any other task in scratch-pad/tasks.",
        "Before you finish, run `bun run typecheck`, `bun run lint` and `bun test`, and fix anything you broke.",
        `When the task's "Done when" is met, move the task file to ${donePath} (e.g. \`mv ${taskPath} ${donePath}\`).`,
        "If you can't finish it: create a branch to preserve your commits, then rebase your commits off, move the task to `skipped` and add an empty commit with tag annotation explaining why you could not complete it.",
    ].join("\n");
}

// Runs claude on one task, printing its progress. Returns its exit code, or
// "overage" if it started drawing on extra usage (paid credits beyond the
// plan's limits), in which case it's killed.
//
// The CLI can't refuse extra usage itself (that's an account setting on
// claude.ai), but its stream-json output reports it in rate_limit_event, so
// stop as soon as it shows up.
async function runClaude(task: string): Promise<number | "overage"> {
    const proc = Bun.spawn(
        [
            "claude",
            "-p",
            prompt(task),
            "--model",
            MODEL,
            "--effort",
            EFFORT,
            "--output-format",
            "stream-json",
            "--verbose",
            "--dangerously-skip-permissions",
        ],
        { cwd: root, stdio: ["ignore", "pipe", "inherit"] },
    );

    let overage = false;
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
                console.log(`\nralph: ${event.subtype}, ${event.num_turns} turns`);
            }
        }
    }

    const exitCode = await proc.exited;
    return overage ? "overage" : exitCode;
}

mkdirSync(doneDir, { recursive: true });

while (true) {
    const task = firstTask();
    if (!task) {
        console.log("ralph: no tasks left.");
        break;
    }

    console.log(`\nralph: starting ${task}\n`);
    const exitCode = await runClaude(task);

    if (exitCode === "overage") {
        console.error(`ralph: claude started using extra usage on ${task}. Stopping.`);
        process.exit(1);
    }
    if (exitCode !== 0) {
        console.error(`ralph: claude exited with ${exitCode} on ${task}. Stopping.`);
        process.exit(1);
    }
    if (existsSync(join(tasksDir, task)) || !existsSync(join(doneDir, task))) {
        console.error(`ralph: ${task} wasn't moved to done. Stopping.`);
        process.exit(1);
    }

    console.log(`\nralph: finished ${task}`);
    if (once) break;
}
