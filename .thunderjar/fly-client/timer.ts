// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// The client timer: `.thunderjar/.fly`, git-ignored, records when the last `docker` command
// finished, and the deadlines worked out from it. Missing, no timer is running, and nothing is
// stopped or destroyed.

import { $ } from "bun";
import type { Settings } from "./settings.ts";

export interface Timer {
  app: string;
  machineId: string;
  lastCommandFinishedAt: string;
  /** When `watch` stops the machine, if it's idle. */
  stopAt: string;
  /** When `watch` destroys the machine and its volumes, if it's idle. */
  destroyAt: string;
  /** The `watch` process acting on it. */
  watcherPid?: number;
}

const MINUTE = 60 * 1000;

export async function readTimer(settings: Settings): Promise<Timer | undefined> {
  const file = Bun.file(settings.timerFile);
  if (!(await file.exists())) return undefined;
  try {
    return (await file.json()) as Timer;
  } catch {
    // Being written: it's written whole, then renamed into place, so this is rare.
    return undefined;
  }
}

export async function writeTimer(settings: Settings, timer: Timer): Promise<void> {
  const temporary = `${settings.timerFile}.${process.pid}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(timer, null, 2)}\n`);
  await $`mv -f ${temporary} ${settings.timerFile}`.quiet();
}

export async function deleteTimer(settings: Settings): Promise<void> {
  const file = Bun.file(settings.timerFile);
  if (await file.exists()) await file.delete();
}

/** The timer, reset as a `docker` command finishes now. */
export function resetTimer(settings: Settings, machineId: string, now = Date.now()): Timer {
  return {
    app: settings.app,
    machineId,
    lastCommandFinishedAt: new Date(now).toISOString(),
    stopAt: new Date(now + settings.sleepMinutes * MINUTE).toISOString(),
    destroyAt: new Date(now + settings.destroyMinutes * MINUTE).toISOString(),
  };
}
