#!/usr/bin/env bun
/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiFAvaM4X8UPgmvECj
 * Supervising engineer: dwjohnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { parseArgs } from "node:util";

const CLOUD_SESSION_URL_BASE = "https://claude.ai/code/";
const MODES = ["local", "cloud"] as const;
type Mode = (typeof MODES)[number];

function help() {
  console.log(`
Print a one-line AI content header for GitHub comments, PR descriptions and issues.

  🤖 <harness>/<model>/<session>
  🤖 <harness>/<session>            (with --no-model)

Two modes:
  local   The session ID is printed as plain text.
  cloud   The session ID is a Markdown link to ${CLOUD_SESSION_URL_BASE}<session>.

The mode is auto-detected: cloud when CLAUDE_CODE_REMOTE=true, otherwise local.

Usage:
  bun ai-header.ts --harness <name> (--model <name> | --no-model) [--session <id>] [--mode local|cloud]

Options:
  --harness <name>   Harness name, e.g. "Claude Code"
  --model <name>     Model name
  --no-model         Leave the model out, where the harness forbids model identifiers
                     (e.g. commit messages, PR descriptions). One of --model or --no-model is required.
  --session <id>     Session ID. Defaults to CLAUDE_CODE_REMOTE_SESSION_ID (cloud)
                     or CLAUDE_CODE_SESSION_ID (local).
  --mode <mode>      Force a mode: ${MODES.join(" | ")}
  -h, --help         Show this message

Example:
  bun ai-header.ts --harness "Claude Code" --model my-model --session abc123 --mode local
  # 🤖 Claude Code/my-model/abc123
`);
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      harness: { type: "string" },
      model: { type: "string" },
      "no-model": { type: "boolean" },
      session: { type: "string" },
      mode: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    help();
    process.exit(0);
  }

  const mode = values.mode ?? (process.env.CLAUDE_CODE_REMOTE === "true" ? "cloud" : "local");
  if (!isMode(mode)) fail(`Invalid --mode "${mode}". Expected one of: ${MODES.join(", ")}`);

  const session =
    values.session ??
    (mode === "cloud" ? process.env.CLAUDE_CODE_REMOTE_SESSION_ID : process.env.CLAUDE_CODE_SESSION_ID);

  if (!values.harness) fail("Missing --harness.");
  if (values.model && values["no-model"]) fail("Pass --model or --no-model, not both.");
  if (!values.model && !values["no-model"]) fail("Missing --model (or --no-model).");
  if (!session) fail("Missing --session, and no session ID found in the environment.");

  console.log(main({ harness: values.harness, model: values.model, session, mode }));
}

export function main(opts: { harness: string; model?: string; session: string; mode: Mode }): string {
  const session = opts.mode === "cloud" ? cloudSessionLink(opts.session) : opts.session;
  return `🤖 ${[opts.harness, opts.model, session].filter(Boolean).join("/")}`;
}

/** Cloud session IDs in the environment use a `cse_` prefix; the web URL uses `session_`. */
export function cloudSessionLink(sessionId: string): string {
  const id = sessionId.replace(/^cse_/, "session_");
  return `[${id}](${CLOUD_SESSION_URL_BASE}${id})`;
}

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value);
}

function fail(message: string): never {
  console.error(message);
  help();
  process.exit(1);
}
