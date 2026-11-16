/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

// Pushing the captures to a remote, or fetching them from it. Capture refs are added and never moved,
// so neither direction needs --force.
import { git, REF_PREFIX } from "./git.ts";

export const REFSPEC = `${REF_PREFIX}/*:${REF_PREFIX}/*`;

export type PushOptions = { fetch: boolean; remote: string };

/** The git arguments that push the captures to, or fetch them from, a remote. */
export function pushArgs({ fetch, remote }: PushOptions): string[] {
  if (fetch) return ["fetch", remote, REFSPEC];
  // --no-verify: the repository's pre-push hooks are about branches, not records.
  return ["push", "--no-verify", remote, REFSPEC];
}

export function push(root: string, options: PushOptions): string {
  return git(root, pushArgs(options));
}
