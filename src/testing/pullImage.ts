/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkwHj38uSTfHjRd4Ho
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Pulls an image a Docker test runs, trying again when the registry doesn't answer: Docker Hub
// resets the odd connection, and `docker run` pulls once, so a test fails on it before it starts.
import { $ } from "bun";

/** Pulls `image` unless the daemon has it, trying up to `attempts` times, a little longer apart each time. */
export async function pullImage(image: string, { attempts = 4, delayMs = 2000 }: { attempts?: number; delayMs?: number } = {}): Promise<void> {
  if ((await $`docker image inspect ${image}`.quiet().nothrow()).exitCode === 0) return;
  for (let attempt = 1; ; attempt++) {
    const pull = await $`docker pull ${image}`.quiet().nothrow();
    if (pull.exitCode === 0) return;
    if (attempt === attempts) throw new Error(`docker pull ${image} failed ${attempts} times: ${pull.stderr.toString().trim()}`);
    await Bun.sleep(delayMs * attempt);
  }
}
