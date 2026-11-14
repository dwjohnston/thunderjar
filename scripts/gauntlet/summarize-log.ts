/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLihXvsaKQZdBjhN81n
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Summarizes a `run` diagnostic log: how long each phase took, how many images were built, pushed
// and pulled, and how each container run ended, with its token costs' outcome.
//
//   bun scripts/gauntlet/summarize-log.ts [.thunderjar/logs/<file>-run.log]   (default: the newest run log)
//
// Reads the readable lines `src/log/logger.ts` writes: `[HH:MM:ss.l] LEVEL: module: message`, then
// one indented `key: value` line per field.
import { Glob } from "bun";

type Entry = { time: string; level: string; msg: string; body: string };

function entries(text: string): Entry[] {
  const out: Entry[] = [];
  for (const block of text.split(/\n(?=\[\d\d:\d\d:\d\d\.\d+\] )/)) {
    const head = /^\[(\S+)\] (\w+): (?:\w+: )?(.*)$/m.exec(block);
    if (head) out.push({ time: head[1]!, level: head[2]!, msg: head[3]!, body: block });
  }
  return out;
}

/** The value of the top-level field `key` in an entry, as written: a number, string or `null`. */
const field = (entry: Entry, key: string): string | undefined => {
  const match = new RegExp(`^    ${key}: (.*)$`, "m").exec(entry.body);
  return match?.[1]?.replace(/^"(.*)"$/, "$1");
};
const ms = (entry: Entry) => Number(field(entry, "ms") ?? NaN);

async function newestRunLog(): Promise<string> {
  const files = [...new Glob(".thunderjar/logs/*-run.log").scanSync()].toSorted();
  const last = files.at(-1);
  if (!last) throw new Error("no run log in .thunderjar/logs/");
  return last;
}

const path = Bun.argv[2] ?? (await newestRunLog());
const all = entries(await Bun.file(path).text());
const named = (msg: string) => all.filter((e) => e.msg === msg);

const sec = (n: number) => `${(n / 1000).toFixed(1)}s`;
function phase(label: string, list: Entry[]) {
  const times = list.map(ms).filter((n) => !Number.isNaN(n));
  if (times.length === 0) return `${label.padEnd(26)} 0`;
  const total = times.reduce((a, b) => a + b, 0);
  return `${label.padEnd(26)} ${String(times.length).padStart(3)}  total ${sec(total).padStart(8)}  mean ${sec(total / times.length).padStart(7)}  max ${sec(Math.max(...times)).padStart(7)}`;
}

const pushed = named("pushed image");
const isPrerun = (e: Entry) => /:prerun-/.test(field(e, "reference") ?? "");
const lines = [
  `log: ${path}`,
  phase("prerun builds", named("built image")),
  phase("prerun pushes", pushed.filter(isPrerun)),
  phase("pulls into runtime", named("pulled image")),
  phase("container runs", [...named("container finished"), ...named("container failed"), ...named("container killed")]),
  phase("commits", named("committed container")),
  phase("postrun pushes", pushed.filter((e) => !isPrerun(e))),
  phase("measurements", named("measured")),
  phase("execution", named("execution finished")),
  `failed: builds ${named("image build failed").length}, pushes ${named("pushing image failed").length}, pulls ${named("pulling image failed").length}, containers ${named("container failed").length}`,
  `errors: ${all.filter((e) => e.level === "ERROR").length}, warnings: ${all.filter((e) => e.level === "WARN").length}`,
  "",
  "perm iter  exit  timedOut  tokenCosts",
];
for (const e of named("container run finished")) {
  const outcome = /tokenCosts: \{\s*"outcome": "(\w+)"(?:,\s*"reason": "(\w+)")?/.exec(e.body);
  lines.push(
    `${(field(e, "permutation") ?? "?").padStart(4)} ${(field(e, "iteration") ?? "?").padStart(4)}  ${(field(e, "exitCode") ?? "?").padStart(4)}  ${(field(e, "timedOut") ?? "?").padEnd(8)}  ${outcome ? `${outcome[1]}${outcome[2] ? ` (${outcome[2]})` : ""}` : "?"}`,
  );
}
for (const e of all.filter((e) => e.level === "ERROR" && e.msg !== "container failed")) lines.push(`ERROR ${e.time} ${e.msg}: ${(field(e, "stderr") ?? field(e, "err") ?? "").slice(0, 300)}`);
for (const e of named("container failed")) lines.push(`container failed ${e.time} ${field(e, "container")} exit ${field(e, "exitCode")}: ${(field(e, "stderr") ?? "").slice(0, 300)}`);
process.stdout.write(`${lines.join("\n")}\n`);
