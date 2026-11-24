/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */

// The files in src/ that still use an ambient API, and which. See "Ambient APIs" in AGENTS.md.
//
// It may only shrink: `bun run lint` fails on an entry a file no longer needs. Move an API behind
// its service, then delete the entry, or run `bun run lint:allowlist` to rewrite this file from
// what oxlint finds.
import type { Allowlist } from "./ambient.ts";

export const AMBIENT_ALLOWLIST: Allowlist = {
  "src/capture/adapters.ts": ["process.cwd", "Bun.spawnSync"],
  "src/capture/capture.ts": ["new Date()", "process.cwd"],
  "src/capture/files.ts": ["new Date()"],
  "src/capture/git.ts": ["crypto.randomUUID", "Bun.env", "Bun.spawnSync", "Bun.$"],
  "src/capture/purge.ts": ["Date.now"],
  "src/cli/colour.ts": ["process.env"],
  "src/cli/commands/attach/attach.ts": ["process.cwd", "process.on", "process.exit"],
  "src/cli/commands/build/build.ts": ["process.cwd"],
  "src/cli/commands/capture/capture.ts": ["Bun.env", "process.cwd", "Bun.which"],
  "src/cli/commands/capture/hook.ts": ["Bun.env", "Bun.stdin"],
  "src/cli/commands/capture/sampleRepoImage.ts": ["Bun.$"],
  "src/cli/commands/checkout/checkout.ts": ["process.cwd"],
  "src/cli/commands/db/db.ts": ["Bun.env", "process.cwd"],
  "src/cli/commands/doctor/doctor.ts": ["process.cwd"],
  "src/cli/commands/executions/executions.ts": ["process.cwd"],
  "src/cli/commands/generate/generate.ts": ["process.cwd"],
  "src/cli/commands/init/init.ts": ["process.cwd", "Bun.$"],
  "src/cli/commands/plan/plan.ts": ["process.cwd"],
  "src/cli/commands/purge/capture.ts": ["Date.now", "process.cwd", "process.stdin"],
  "src/cli/commands/purge/purge.ts": ["new Date()", "process.cwd", "process.stdin", "Bun.spawn"],
  "src/cli/commands/remeasure/remeasure.ts": ["process.cwd"],
  "src/cli/commands/run/run.ts": ["Bun.sleep", "process.cwd", "process.on", "process.exit"],
  "src/cli/commands/runner/runner.ts": ["Bun.sleep", "process.cwd", "process.on", "process.exit"],
  "src/cli/commands/show/show.ts": ["process.cwd"],
  "src/cli/commands/view/view.ts": ["process.cwd", "Bun.serve"],
  "src/cli/confirm.ts": ["Bun.stdin"],
  "src/cli/dataDir.ts": ["Bun.env"],
  "src/cli/index.ts": ["process.argv"],
  "src/cli/liveRows.ts": ["Date.now", "setInterval"],
  "src/cli/output.ts": ["process.stdout", "process.stderr"],
  "src/cli/program.ts": ["new Date()", "process.cwd"],
  "src/cli/textOutput.ts": ["process.stdout", "process.stderr"],
  "src/cli/waitingLine.ts": ["Date.now", "setInterval"],
  "src/config/projectConfig.ts": ["Bun.env"],
  "src/config/requiredEnv.ts": ["Bun.env"],
  "src/docker/docker.ts": ["Date.now", "Bun.sleep", "setTimeout", "crypto.randomUUID", "Bun.env", "Bun.spawn", "Bun.$"],
  "src/docker/localImages.ts": ["Bun.$"],
  "src/docker/registry.ts": ["Bun.env", "Bun.$", "fetch"],
  "src/docker/shellSession.ts": ["Date.now", "setTimeout", "Bun.env", "Bun.spawn"],
  "src/execution/checkout.ts": ["crypto.randomUUID", "Bun.spawn", "Bun.$"],
  "src/execution/hashPermutations.ts": ["Bun.$"],
  "src/execution/measure.ts": ["new Date()"],
  "src/execution/onRuntime.ts": ["Bun.sleep", "Bun.env"],
  "src/execution/prerunBuilds.ts": ["crypto.randomUUID", "Bun.env", "Bun.$"],
  "src/execution/purge.ts": ["Date.now"],
  "src/execution/runExecution.ts": ["Date.now", "new Date()"],
  "src/execution/runner.ts": ["Date.now", "Bun.sleep", "Bun.env", "Bun.$"],
  "src/execution/runnerImage.ts": ["crypto.randomUUID", "Bun.env", "Bun.$"],
  "src/execution/runtimeHooks.ts": ["Bun.env", "Bun.spawn"],
  "src/execution/runtimeProbe.ts": ["crypto.randomUUID", "Bun.env", "Bun.$"],
  "src/execution/secretSearch.ts": ["Date.now", "Bun.env"],
  "src/execution/timings.ts": ["Date.now"],
  "src/execution/ulid.ts": ["Date.now", "crypto.getRandomValues"],
  "src/measureTesting/measure.ts": ["crypto.randomUUID", "Bun.env", "Bun.$"],
  "src/store/runDataStore.ts": ["Bun.sleep", "Bun.$", "Bun.SQL", "bun:sqlite"],
};
