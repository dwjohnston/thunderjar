// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// What the client is waiting on, and for how long: e.g. "fly-client: starting m-1… 12s".
//
// Thunderjar captures a runtime command's output, so it's written to the terminal, /dev/tty,
// redrawn in place once a second. With no terminal, e.g. in tests and CI, it isn't shown. Every
// step also goes to the log, .thunderjar/logs/fly-client.log, with how long it took.

import { $ } from "bun";

const LOG_FILE = Bun.env.FLY_CLIENT_LOG_FILE || `${import.meta.dir}/../logs/fly-client.log`;

/** Appends a line to the log. Never throws: the log is for diagnosis only. */
export async function log(message: string): Promise<void> {
  const line = `${new Date().toISOString()} [${process.pid}] ${message}\n`;
  try {
    await $`mkdir -p ${LOG_FILE.replace(/\/[^/]*$/, "")} && printf %s ${line} >> ${LOG_FILE}`.nothrow().quiet();
  } catch {
    // The log is for diagnosis only.
  }
}

let terminal: ReturnType<ReturnType<typeof Bun.file>["writer"]> | null | undefined;

function tty() {
  if (terminal !== undefined) return terminal;
  try {
    terminal = Bun.env.FLY_CLIENT_PROGRESS === "0" ? null : Bun.file("/dev/tty").writer();
  } catch {
    terminal = null;
  }
  return terminal;
}

function show(text: string): void {
  const out = tty();
  if (!out) return;
  try {
    out.write(text);
    void out.flush();
  } catch {
    terminal = null;
  }
}

const seconds = (since: number) => `${Math.round((Date.now() - since) / 1000)}s`;

/** Says something to the terminal, and logs it. */
export async function say(message: string): Promise<void> {
  // stderr too, which Thunderjar keeps for when the command fails.
  console.error(`fly-client: ${message}`);
  show(`fly-client: ${message}\n`);
  await log(message);
}

/** Runs `action`, showing `label` with a timer while it's waited on, then how long it took. */
export async function step<T>(label: string, action: () => Promise<T>): Promise<T> {
  const began = Date.now();
  await log(`${label}…`);
  const line = () => `\r\x1b[2Kfly-client: ${label}… ${seconds(began)}`;
  show(line());
  const ticker = setInterval(() => show(line()), 1000);
  try {
    const result = await action();
    clearInterval(ticker);
    show(`\r\x1b[2Kfly-client: ${label} ✓ ${seconds(began)}\n`);
    await log(`${label}: done in ${seconds(began)}`);
    return result;
  } catch (error) {
    clearInterval(ticker);
    show(`\r\x1b[2Kfly-client: ${label} ✗ ${seconds(began)}\n`);
    await log(`${label}: failed after ${seconds(began)}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
