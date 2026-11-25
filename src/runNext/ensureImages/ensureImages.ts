/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Builds the pre-run images the manifest needs that don't exist yet.
import type { Dependencies, Manifest } from "../types.ts";

/** The host checks which images exist on the remote; the runtime pulls or builds the rest. */
export async function ensureImages(_manifest: Manifest, _deps: Pick<Dependencies, "hostDocker" | "runtimeDocker" | "state">): Promise<void> {
  throw new Error("Not implemented: ensureImages");
}
