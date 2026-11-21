// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// Where the fake `fly`, `docker` and `ssh` keep their state and log their calls: $FAKE_DIR.

import { $ } from "bun";

const dir = Bun.env.FAKE_DIR;
if (!dir) throw new Error("FAKE_DIR is not set");
export const fakeDir: string = dir;

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  const file = Bun.file(`${fakeDir}/${name}`);
  return (await file.exists()) ? ((await file.json()) as T) : fallback;
}

export async function writeJson(name: string, value: unknown): Promise<void> {
  await Bun.write(`${fakeDir}/${name}`, JSON.stringify(value, null, 2));
}

export async function logCall(command: string, args: string[]): Promise<void> {
  // Whether `fly`, which ssh's ProxyCommand runs, would find a token.
  const flyToken = Boolean(Bun.env.FLY_API_TOKEN);
  // >> appends with O_APPEND, so calls from fakes running at once don't overwrite each other.
  await $`echo ${JSON.stringify({ command, args, flyToken })} >> ${`${fakeDir}/calls.jsonl`}`;
}
