/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: c5299d71-1f4b-4472-9950-df42605e10cc
 *
 * Humans: add your notes here
 */

// One adapter per harness, each turning the JSON its hook passes on stdin into a `CaptureEvent`.
//
// All four payloads are snake_case: Claude Code's and Codex's natively, Copilot CLI's when its hooks
// are named in PascalCase, and OpenCode's because the plugin `capture install` writes builds it so.
import type { Env } from "./files.ts";

export const HARNESSES = ["claude-code", "codex", "copilot", "opencode"] as const;
export type HarnessId = (typeof HARNESSES)[number];

export function isHarness(value: string): value is HarnessId {
  return (HARNESSES as readonly string[]).includes(value);
}

/** What capture needs from one hook call, whichever harness made it. */
export type CaptureEvent = {
  harness: HarnessId;
  sessionId: string;
  cwd: string;
  /** The prompt, on a prompt event. */
  prompt?: string;
  transcriptPath?: string;
  model?: string;
  permissionMode?: string;
  lastAssistantMessage?: string;
  turnId?: string;
  effort?: string;
  harnessVersion?: string;
  harnessSurface?: string;
};

type Payload = Record<string, unknown>;

export type Adapter = {
  /**
   * Whether this process is a hook of the adapter's harness. Copilot CLI also runs the hooks in
   * `.claude/settings*.json`, and without this would record its sessions twice, once as Claude Code.
   */
  runningUnder(env: Env): boolean;
  toEvent(payload: Payload, env: Env): CaptureEvent;
  /** The harness's version, for the start record: once a session, so it may run the harness's CLI. */
  version(env: Env): string | null;
};

const text = (value: unknown): string | undefined => (typeof value === "string" && value !== "" ? value : undefined);

/** The fields every harness's payload shares. */
function common(harness: HarnessId, payload: Payload): CaptureEvent {
  const sessionId = text(payload.session_id);
  if (!sessionId) throw new Error(`${harness} hook input has no session_id`);
  return {
    harness,
    sessionId,
    cwd: text(payload.cwd) ?? process.cwd(),
    // A prompt may be empty: keep it, so a prompt event is still one.
    ...(typeof payload.prompt === "string" && { prompt: payload.prompt }),
    ...(text(payload.transcript_path) && { transcriptPath: text(payload.transcript_path) }),
    ...(text(payload.permission_mode) && { permissionMode: text(payload.permission_mode) }),
    ...(text(payload.last_assistant_message) && { lastAssistantMessage: text(payload.last_assistant_message) }),
  };
}

/** The version `<command> --version` prints, e.g. `0.169.0` from `codex-cli 0.169.0`, or null. */
function cliVersion(command: string): string | null {
  try {
    const result = Bun.spawnSync([command, "--version"], { stdout: "pipe", stderr: "ignore" });
    if (result.exitCode !== 0) return null;
    return result.stdout.toString().match(/\d+\.\d+\.\d+[\w.-]*/)?.[0] ?? null;
  } catch {
    return null;
  }
}

const omitUndefined = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;

export const ADAPTERS: Record<HarnessId, Adapter> = {
  "claude-code": {
    runningUnder: (env) => env.CLAUDECODE === "1",
    toEvent: (payload, env) =>
      omitUndefined({
        ...common("claude-code", payload),
        // `AI_AGENT` looks like `claude-code_2-1-322_harness`. It isn't documented, so the transcript is the fallback.
        harnessVersion: env.AI_AGENT?.match(/^claude-code_(\d+(?:-\d+)*)_/)?.[1]?.replaceAll("-", "."),
        harnessSurface: text(env.CLAUDE_CODE_ENTRYPOINT),
        effort: text((payload.effort as { level?: unknown } | undefined)?.level) ?? text(env.CLAUDE_EFFORT),
      }),
    version: () => null,
  },
  codex: {
    runningUnder: () => true,
    toEvent: (payload) => omitUndefined({ ...common("codex", payload), model: text(payload.model), turnId: text(payload.turn_id) }),
    version: () => cliVersion("codex"),
  },
  copilot: {
    runningUnder: () => true,
    // No model or last message. `transcriptPath` is kept, so its models can be read later.
    toEvent: (payload) => common("copilot", payload),
    version: () => cliVersion("copilot"),
  },
  opencode: {
    runningUnder: () => true,
    toEvent: (payload) => omitUndefined({ ...common("opencode", payload), model: text(payload.model) }),
    version: () => cliVersion("opencode"),
  },
};
