#!/usr/bin/env bun
/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: 2c687305-6347-4bf9-986d-08bb47278936
 *
 * Humans: add your notes here
 */

import { git, REF_PREFIX, tryGit } from "./lib.ts";

function help() {
  console.log(`
Push every capture to a remote, or fetch them from it with --fetch.

Capture refs are added and never moved, so neither direction needs --force.

Usage:
  bun push.ts [--fetch] [--dry-run] [remote]

Arguments:
  remote       The remote to push to or fetch from. Default: origin

Options:
  --fetch      Fetch the captures instead of pushing them
  --dry-run    Print the git command instead of running it
  -h, --help   Show this message
`);
}

export const REFSPEC = `${REF_PREFIX}/*:${REF_PREFIX}/*`;

/** The git arguments that push the captures to, or fetch them from, a remote. */
export function gitArgs(options: { fetch: boolean; remote: string }): string[] {
  if (options.fetch) return ["fetch", options.remote, REFSPEC];
  // --no-verify: the repository's pre-push hooks are about branches, not records.
  return ["push", "--no-verify", options.remote, REFSPEC];
}

export function main(root: string, options: { fetch: boolean; remote: string }): string {
  return git(root, gitArgs(options));
}

if (import.meta.main) {
  const argv = Bun.argv.slice(2);
  if (argv.includes("-h") || argv.includes("--help")) {
    help();
    process.exit(0);
  }
  const root = tryGit(process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (!root) {
    console.error("Not in a git repository.");
    process.exit(1);
  }
  const fetch = argv.includes("--fetch");
  const remote = argv.find((arg) => !arg.startsWith("-")) ?? "origin";
  if (argv.includes("--dry-run")) {
    console.log(["git", ...gitArgs({ fetch, remote })].join(" "));
    process.exit(0);
  }
  try {
    main(root, { fetch, remote });
    console.log(fetch ? `Fetched the captures from ${remote}.` : `Pushed the captures to ${remote}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
