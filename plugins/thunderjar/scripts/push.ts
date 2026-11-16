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
  bun push.ts [--fetch] [remote]

Arguments:
  remote       The remote to push to or fetch from. Default: origin

Options:
  --fetch      Fetch the captures instead of pushing them
  -h, --help   Show this message
`);
}

export const REFSPEC = `${REF_PREFIX}/*:${REF_PREFIX}/*`;

export function main(root: string, options: { fetch: boolean; remote: string }): string {
  if (options.fetch) return git(root, ["fetch", options.remote, REFSPEC]);
  // --no-verify: the repository's pre-push hooks are about branches, not records.
  return git(root, ["push", "--no-verify", options.remote, REFSPEC]);
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
  try {
    main(root, { fetch, remote });
    console.log(fetch ? `Fetched the captures from ${remote}.` : `Pushed the captures to ${remote}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
