// 🤖 This file was created with AI. Harness: Claude Code. Session Id: session_01LCLeLidCEegntrXyRbJufD.
// Supervising engineer: David Johnston. Humans: add your notes here.

// A lock between client processes, so commands started at once don't each create the machine or
// open a connection. It's a folder, as making one is atomic, with the holder's PID in it. A lock
// whose holder has gone is taken over.

import { $ } from "bun";
import type { Settings } from "./settings.ts";

export const alive = (pid: number | undefined): boolean => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

export async function withLock<T>(settings: Settings, name: string, action: () => Promise<T>): Promise<T> {
  const dir = `${settings.runtimeDir}/${name}.lock`;
  await $`mkdir -p ${settings.runtimeDir}`.quiet();
  for (;;) {
    if ((await $`mkdir ${dir}`.nothrow().quiet()).exitCode === 0) break;
    const holder = Bun.file(`${dir}/pid`);
    if ((await holder.exists()) && !alive(Number(await holder.text()))) {
      await $`rm -rf ${dir}`.quiet();
      continue;
    }
    await Bun.sleep(100);
  }
  await Bun.write(`${dir}/pid`, String(process.pid));
  try {
    return await action();
  } finally {
    await $`rm -rf ${dir}`.quiet();
  }
}
