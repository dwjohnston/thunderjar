// Run the CLI the way a developer would by hand, usually in a checked-in fixtureTests/ scenario
// (`bun run fixture <scenario> …`), against the recording fake Docker (fake-docker.ts), which
// every CLI a test starts inherits from test-setup.ts. `fakeDocker` gives it a state of its own.

import { existsSync, readFileSync } from "node:fs";
import { cp, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { linkThunderjar } from "./fixture-project.ts";

const repoRoot = resolve(import.meta.dir, "..", "..");
const cli = join(repoRoot, "src", "cli", "index.ts");

/** The fixtures/ project of the fixtureTests/ scenario `name`, e.g. "scenario_2_typical_project". */
export const scenario = (name: string) => join(repoRoot, "fixtureTests", name, "fixtures");

/**
 * A copy of `fixtures`, for `init` to write to, as a fresh clone has it: without
 * anything a manual run left behind, or the tsconfig fixtureTests/typecheck.test.ts writes.
 */
export async function copyOfFixtures(fixtures: string) {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-fixture-run-"));
  await cp(fixtures, dir, {
    recursive: true,
    filter: (src) => !/[/\\]\.thunderjar[/\\](\.data|_generated|tsconfig\.json)$/.test(src),
  });
  await linkThunderjar(dir);
  return dir;
}

/**
 * A fresh state for the fake Docker, in which `images` exist. Pass `env` to `thunderjar`; read
 * back the commands it was given.
 */
export async function fakeDocker(images: string[] = [], flags: ("unreachable" | "fail-build")[] = []) {
  const dir = await mkdtemp(join(tmpdir(), "thunderjar-fake-docker-"));
  await writeFile(join(dir, "images"), images.map((ref) => `${ref}\n`).join(""));
  for (const flag of flags) await writeFile(join(dir, flag), "");
  const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "");
  return {
    env: { FAKE_DOCKER_DIR: dir },
    /** Each command run, `docker <args…>`. */
    commands: () => read("commands").split("\n").filter(Boolean),
    images: () => read("images").split("\n").filter(Boolean),
  };
}

export async function thunderjar(cwd: string, args: string[], env: Record<string, string> = {}) {
  const proc = Bun.spawn(["bun", cli, ...args], { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}
