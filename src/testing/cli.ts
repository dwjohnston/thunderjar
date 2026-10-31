// Run the CLI the way a developer would by hand, usually in a checked-in fixtureTests/ scenario
// (`bun run fixture <scenario> …`), against the recording fake Docker (fake-docker.ts), which
// every CLI a test starts inherits from test-setup.ts. `fakeDocker` gives it a state of its own.

import { copy, existsSync, makeTempDir, readTextSync, remove } from "../platform/fs.ts";
import { join, resolve } from "../platform/path.ts";
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
  const dir = await makeTempDir("thunderjar-fixture-run-");
  await copy(fixtures, dir);
  const leftBehind = new Bun.Glob("**/.thunderjar/{.data,_generated,tsconfig.json}");
  const paths = Array.from(leftBehind.scanSync({ cwd: dir, dot: true, onlyFiles: false, followSymlinks: false }));
  for (const path of paths) await remove(join(dir, path));
  await linkThunderjar(dir);
  return dir;
}

/**
 * A fresh state for the fake Docker, in which `images` exist, and each image ref in `postruns`
 * is a postrun image whose files are saved in the directory it maps to, as a scenario's
 * `postrun-files/<execution ID>/<postrun tag>/` saves them. Pass `env` to `thunderjar`; read
 * back the commands it was given.
 */
export async function fakeDocker(
  images: string[] = [],
  flags: ("unreachable" | "fail-build")[] = [],
  postruns: Record<string, string> = {},
) {
  const dir = await makeTempDir("thunderjar-fake-docker-");
  await Bun.write(join(dir, "images"), images.map((ref) => `${ref}\n`).join(""));
  await Bun.write(join(dir, "postruns"), Object.entries(postruns).map(([ref, saved]) => `${ref}\t${saved}\n`).join(""));
  for (const flag of flags) await Bun.write(join(dir, flag), "");
  const read = (name: string) => (existsSync(join(dir, name)) ? readTextSync(join(dir, name)) : "");
  return {
    env: { FAKE_DOCKER_DIR: dir },
    /** Each command run, `docker <args…>`. */
    commands: () => read("commands").split("\n").filter(Boolean),
    images: () => read("images").split("\n").filter(Boolean),
    /** The names of the containers that exist. */
    containers: () => read("containers").split("\n").filter(Boolean).map((line) => line.split("\t")[0]!),
    /** Deletes this state. */
    remove: () => remove(dir),
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
