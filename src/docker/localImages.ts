/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

// Removing images from the local Docker daemon, one tag at a time, for `purge image`.
import { $ } from "bun";
import { moduleLogger } from "../log/logger.ts";
import { localRuntime, reasonOf } from "./docker.ts";

const log = moduleLogger("docker");

/** How removing one local image went: removed, already gone, or failed, with Docker's reason. */
export type LocalRemoval = { outcome: "deleted" | "absent" } | { outcome: "failed"; reason: string };

/**
 * Removes the tag `image` from the local daemon, with `docker image rm`, not forced: an image a
 * container still uses stays, and fails. An image that doesn't exist is `absent`.
 */
export async function removeLocalImage(image: string): Promise<LocalRemoval> {
  const { command } = localRuntime();
  const result = await $`${command} image rm ${image}`.quiet().nothrow();
  const stderr = result.stderr.toString();
  log.debug({ image, exitCode: result.exitCode, stderr }, "removed local image");
  if (result.exitCode === 0) return { outcome: "deleted" };
  if (/No such image/i.test(stderr)) return { outcome: "absent" };
  return { outcome: "failed", reason: reasonOf(stderr) || `docker image rm exited ${result.exitCode}` };
}
