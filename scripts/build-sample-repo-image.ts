#!/usr/bin/env bun
/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLmJ8bpSKrwzpqUF38d
 *
 * Humans: add your notes here
 */

// Builds the sample repo image that the capture Docker tests assume exists: scenario 0601's
// Dockerfile, with each harness at its starter version. It's tagged by a hash of what it's built
// from, so it's only built when that changes.
//
//   bun run di:build:sample-repo           build it, unless the current tag is there already
//   bun run di:build:sample-repo --prune   then remove older thunderjar-sample-repo tags
//
// Behind a proxy that re-signs TLS, as in a cloud sandbox, npm in the build must trust the proxy's
// CA. That's the machine's setup, not the Dockerfile's.
import { $ } from "bun";
import {
  HASH_LABEL,
  imageExists,
  SAMPLE_REPO_REPOSITORY,
  sampleRepoContext,
  sampleRepoTag,
} from "../src/cli/commands/capture/sampleRepoImage.ts";

const context = await sampleRepoContext();
const tag = sampleRepoTag(context.hash);

if (await imageExists(tag)) {
  console.log(`${tag} is up to date.`);
} else {
  console.log(`Building ${tag}…`);
  const buildArgs = Object.entries(context.buildArgs).flatMap(([name, value]) => ["--build-arg", `${name}=${value}`]);
  await $`docker build ${buildArgs} --label ${`${HASH_LABEL}=${context.hash}`} -t ${tag} ${context.folder}`;
  console.log(`Built ${tag}.`);
}

if (Bun.argv.includes("--prune")) {
  const tags = (await $`docker image ls --format ${"{{.Repository}}:{{.Tag}}"} ${SAMPLE_REPO_REPOSITORY}`.text())
    .split("\n")
    .filter((line) => line && line !== tag);
  if (tags.length > 0) {
    await $`docker image rm ${tags}`.quiet();
    console.log(`Removed ${tags.join(", ")}.`);
  }
}
