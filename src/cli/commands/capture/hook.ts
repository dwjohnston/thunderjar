/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// `thunderjar capture prompt|stop --harness <x>`: what the hooks run, twice a turn in any repository
// with capture installed. src/cli/index.ts runs it straight from the command line, without loading
// the rest of the CLI, so it stays fast. It reads the hook's JSON on stdin, prints nothing on stdout,
// which a harness may add to the agent's context, and always exits 0.
import { isHarness } from "../../../capture/adapters.ts";
import { runHook } from "../../../capture/capture.ts";

export const HOOKS = ["prompt", "stop"] as const;
export type Hook = (typeof HOOKS)[number];

export const isHook = (value: string | undefined): value is Hook => (HOOKS as readonly (string | undefined)[]).includes(value);

/** The value of `--harness <x>` or `--harness=<x>` in `args`. */
export function harnessArg(args: string[]): string | undefined {
  const index = args.indexOf("--harness");
  if (index !== -1) return args[index + 1];
  return args.find((arg) => arg.startsWith("--harness="))?.slice("--harness=".length);
}

/** Runs the `hook` capture hook for `harness`, with the harness's JSON on stdin. Does nothing for an unknown harness. */
export async function runHookCommand(hook: Hook, harness: string | undefined): Promise<void> {
  if (harness === undefined || !isHarness(harness)) return;
  await runHook(hook, harness, await Bun.stdin.text(), Bun.env);
}
