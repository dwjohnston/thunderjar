// Ralph loop: hand the first task in scratch-pad/tasks to a fresh Claude Code
// session, wait for it to move the task into scratch-pad/tasks/done, repeat.
//
//   bun ralph/ralph.ts          # work through every task
//   bun ralph/ralph.ts --once   # do just the first task

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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
    "If you can't finish it, leave the task file where it is and explain why in your final message.",
  ].join("\n");
}

mkdirSync(doneDir, { recursive: true });

while (true) {
  const task = firstTask();
  if (!task) {
    console.log("ralph: no tasks left.");
    break;
  }

  console.log(`\nralph: starting ${task}\n`);
  const proc = Bun.spawn(["claude", "-p", prompt(task), "--dangerously-skip-permissions"], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const exitCode = await proc.exited;

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
