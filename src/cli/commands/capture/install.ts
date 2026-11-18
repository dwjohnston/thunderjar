/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// `capture install` and `capture uninstall`: the hook config each harness reads, written into the
// repository or, with --user, the user's home. Claude Code's and Codex's are merged into JSON files
// that hold other settings too; Copilot CLI's and OpenCode's are files of their own.
import type { HarnessId } from "../../../capture/adapters.ts";
import { opencodePlugin } from "./opencodePlugin.ts";

export type Scope = "project" | "user";

/** The command a hook runs, before `capture prompt|stop --harness <x>`: `thunderjar`, unless --command says otherwise. */
export const DEFAULT_COMMAND = "thunderjar";

/** Each hook event a harness names, the capture hook it runs, and how long it may take, in seconds. */
const EVENTS = [
  { event: "UserPromptSubmit", hook: "prompt", timeout: 60 },
  { event: "Stop", hook: "stop", timeout: 120 },
] as const;

export function hookCommand(command: string, hook: "prompt" | "stop", harness: HarnessId): string {
  return `${command} capture ${hook} --harness ${harness}`;
}

/** Whether `command` is a capture hook for `harness`, whatever runs thunderjar. */
const isCaptureHook = (command: unknown, harness: HarnessId) =>
  typeof command === "string" && new RegExp(` capture (prompt|stop) --harness ${harness}$`).test(command);

export type Paths = { root: string | null; home: string; env: Record<string, string | undefined> };

/** The file `install` writes for `harness`. */
export function configPath(harness: HarnessId, scope: Scope, { root, home, env }: Paths): string {
  if (scope === "project" && root === null) throw new Error("capture records sessions in a git repository: run this inside one, or use --user");
  const base = scope === "project" ? root! : home;
  switch (harness) {
    case "claude-code":
      return scope === "project" ? `${base}/.claude/settings.local.json` : `${home}/.claude/settings.json`;
    case "codex":
      return scope === "project" ? `${base}/.codex/hooks.json` : `${env.CODEX_HOME || `${home}/.codex`}/hooks.json`;
    case "copilot":
      return scope === "project" ? `${base}/.github/hooks/thunderjar-capture.json` : `${env.COPILOT_HOME || `${home}/.copilot`}/hooks/thunderjar-capture.json`;
    case "opencode":
      return scope === "project"
        ? `${base}/.opencode/plugins/thunderjar-capture.ts`
        : `${env.XDG_CONFIG_HOME || `${home}/.config`}/opencode/plugins/thunderjar-capture.ts`;
  }
}

type Json = Record<string, unknown>;
type HookGroup = { matcher?: string; hooks?: { type?: string; command?: unknown }[] };

/** Adds the capture hooks to Claude Code's or Codex's settings, unless they're there already. */
export function addHooks(settings: Json, harness: HarnessId, command: string): Json {
  const hooks = (settings.hooks ??= {}) as Record<string, HookGroup[]>;
  for (const { event, hook, timeout } of EVENTS) {
    const groups = (hooks[event] ??= []);
    if (groups.some((group) => group.hooks?.some((h) => isCaptureHook(h.command, harness)))) continue;
    groups.push({ hooks: [{ type: "command", command: hookCommand(command, hook, harness), timeout } as never] });
  }
  return settings;
}

/** Takes the capture hooks out of Claude Code's or Codex's settings, and whatever is left empty by that. */
export function removeHooks(settings: Json, harness: HarnessId): Json {
  const hooks = settings.hooks as Record<string, HookGroup[]> | undefined;
  if (!hooks) return settings;
  for (const { event } of EVENTS) {
    const groups = hooks[event];
    if (!groups) continue;
    const kept = groups
      .map((group) => {
        if (!group.hooks?.some((h) => isCaptureHook(h.command, harness))) return group;
        const rest = group.hooks.filter((h) => !isCaptureHook(h.command, harness));
        return rest.length === 0 ? null : { ...group, hooks: rest };
      })
      .filter((group) => group !== null);
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return settings;
}

/** Copilot CLI's hook file: PascalCase event names, so it passes the same snake_case input as Claude Code. */
export function copilotHooks(command: string): Json {
  return {
    version: 1,
    hooks: Object.fromEntries(EVENTS.map(({ event, hook, timeout }) => [event, [{ type: "command", bash: hookCommand(command, hook, "copilot"), timeoutSec: timeout }]])),
  };
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function readJson(path: string): Promise<Json> {
  const file = Bun.file(path);
  return (await file.exists()) ? ((await file.json()) as Json) : {};
}

/** Writes `harness`'s capture config to `path`. Running it again changes nothing. */
export async function install(harness: HarnessId, path: string, command: string): Promise<void> {
  switch (harness) {
    case "claude-code":
    case "codex":
      await Bun.write(path, json(addHooks(await readJson(path), harness, command)), { createPath: true });
      return;
    case "copilot":
      await Bun.write(path, json(copilotHooks(command)), { createPath: true });
      return;
    case "opencode":
      await Bun.write(path, opencodePlugin(command), { createPath: true });
  }
}

/** Removes what `install` wrote to `path`. Returns whether there was anything to remove. */
export async function uninstall(harness: HarnessId, path: string): Promise<boolean> {
  const file = Bun.file(path);
  if (!(await file.exists())) return false;
  if (harness === "copilot" || harness === "opencode") {
    await file.delete();
    return true;
  }
  const before = await readJson(path);
  const after = removeHooks(structuredClone(before), harness);
  if (Bun.deepEquals(before, after)) return false;
  // Settings with nothing left were made by install: remove the file rather than leave `{}`.
  if (Object.keys(after).length === 0) await file.delete();
  else await Bun.write(path, json(after));
  return true;
}
