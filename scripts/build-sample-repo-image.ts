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
//   bun run di:build:sample-repo --registry ghcr.io/owner/thunderjar-sample-repo [--push]
//       pull the current tag from the registry instead of building it, if it's there. With --push,
//       push what was built, so the next run pulls it. A failed pull or push only warns: CI on a
//       fork's PR can't push, and builds instead.
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

const registryIndex = Bun.argv.indexOf("--registry");
const registry = registryIndex === -1 ? undefined : Bun.argv[registryIndex + 1];
if (registryIndex !== -1 && !registry) throw new Error("--registry needs a repository, e.g. ghcr.io/owner/thunderjar-sample-repo");
// The same tag, in the registry's repository: `ghcr.io/owner/thunderjar-sample-repo:h1a2b3c4d`.
const remoteTag = registry && `${registry}:${tag.slice(tag.indexOf(":") + 1)}`;

async function pull(remote: string): Promise<boolean> {
  console.log(`Pulling ${remote}…`);
  const pulled = await $`docker pull ${remote}`.nothrow();
  if (pulled.exitCode !== 0) {
    console.warn(`Couldn't pull ${remote}. Building it instead.`);
    return false;
  }
  await $`docker tag ${remote} ${tag}`;
  console.log(`Pulled ${remote} as ${tag}.`);
  return true;
}

if (await imageExists(tag)) {
  console.log(`${tag} is up to date.`);
} else if (!(remoteTag && (await pull(remoteTag)))) {
  console.log(`Building ${tag}…`);
  const buildArgs = Object.entries(context.buildArgs).flatMap(([name, value]) => ["--build-arg", `${name}=${value}`]);
  await $`docker build ${buildArgs} --label ${`${HASH_LABEL}=${context.hash}`} -t ${tag} ${context.folder}`;
  console.log(`Built ${tag}.`);

  if (remoteTag && Bun.argv.includes("--push")) {
    const pushed = await $`docker tag ${tag} ${remoteTag} && docker push ${remoteTag}`.nothrow();
    console.log(pushed.exitCode === 0 ? `Pushed ${remoteTag}.` : `Couldn't push ${remoteTag}. The next run builds it again.`);
  }
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
