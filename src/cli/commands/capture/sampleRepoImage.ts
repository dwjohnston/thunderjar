/*
 * 🤖 This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLmJ8bpSKrwzpqUF38d
 *
 * Humans: add your notes here
 */

// The sample repo image, for the capture Docker tests: a codebase that has never had Thunderjar, and
// each harness's CLI, from scenario 0601's Dockerfile. The tests assume it exists. Its tag is a hash
// of what it's built from, so a test can
// tell a stale image from a current one: a changed Dockerfile, project file or harness version
// means a new tag. Thunderjar isn't in the image, so changes to src/ never make it stale.
//
// Build it with `bun run di:build:sample-repo`.
import { $, CryptoHasher, Glob } from "bun";
import pkg from "../../../../package.json" with { type: "json" };
import { abbreviateHash } from "../../../config/permutations.ts";
import { REPO_ROOT, scenarioFolder } from "../../../testing/scenario.ts";
import { STARTER_FOLDERS } from "../init/starterHarnesses.ts";

export const SAMPLE_REPO_SCENARIO = "0601";
export const SAMPLE_REPO_REPOSITORY = "thunderjar-sample-repo";
/** The label that holds the image's full hash. */
export const HASH_LABEL = "thunderjar.sample-repo.hash";
export const BUILD_COMMAND = "bun run di:build:sample-repo";

/** The version in a starter harness's folder name, e.g. `2.1.311` from `claude-code-2.1.311`. */
const versionOf = (folder: string) => folder.slice(folder.lastIndexOf("-") + 1);

/** The Dockerfile's build args: Bun as the package pins it, and each harness at its starter version. */
export const BUILD_ARGS: Record<string, string> = {
  BUN_VERSION: pkg.dependencies.bun,
  CLAUDE_CODE_VERSION: versionOf(STARTER_FOLDERS.claudeCode),
  CODEX_VERSION: versionOf(STARTER_FOLDERS.codex),
  COPILOT_VERSION: versionOf(STARTER_FOLDERS.copilot),
  OPENCODE_VERSION: versionOf(STARTER_FOLDERS.opencode),
};

/**
 * The image's build context, the scenario folder, and a sha256 of each file's path and contents and
 * of the build args. The same inputs always give the same hash.
 */
export async function sampleRepoContext(folder = scenarioFolder(SAMPLE_REPO_SCENARIO), buildArgs = BUILD_ARGS) {
  const files = [...new Glob("**").scanSync({ cwd: folder, dot: true })].toSorted();
  const hasher = new CryptoHasher("sha256");
  for (const path of files) {
    hasher.update(`${path}\0`);
    hasher.update(await Bun.file(`${folder}/${path}`).arrayBuffer());
    hasher.update("\0");
  }
  for (const [name, value] of Object.entries(buildArgs).toSorted(([a], [b]) => a.localeCompare(b))) hasher.update(`${name}=${value}\0`);
  return { folder, files, buildArgs, hash: hasher.digest("hex") };
}

/** The tag of the image for the current inputs, e.g. `thunderjar-sample-repo:h1a2b3c4d`. */
export const sampleRepoTag = (hash: string) => `${SAMPLE_REPO_REPOSITORY}:h${abbreviateHash(hash)}`;

export async function imageExists(tag: string): Promise<boolean> {
  return (await $`docker image inspect ${tag}`.quiet().nothrow()).exitCode === 0;
}

/** The tag of the current sample repo image. Throws, saying how to build it, if there's none. */
export async function requireSampleRepoImage(): Promise<string> {
  const tag = sampleRepoTag((await sampleRepoContext()).hash);
  if (!(await imageExists(tag))) {
    throw new Error(`The sample repo image is missing or out of date (${tag}).\nBuild it with: ${BUILD_COMMAND}`);
  }
  return tag;
}

/**
 * Builds and packs Thunderjar into `dir`, as `npm publish` would, and returns the tarball's path.
 * The package smoke test installs it the same way.
 */
export async function packThunderjar(dir: string): Promise<string> {
  const run = async (step: string, command: ReturnType<typeof $>) => {
    const result = await command.cwd(REPO_ROOT).quiet().nothrow();
    if (result.exitCode !== 0) throw new Error(`${step} failed:\n${result.stdout.toString()}${result.stderr.toString()}`);
    return result.stdout.toString();
  };
  await run("bun run build", $`bun run build`);
  // npm pack prints the tarball's name last on stdout, and its notices on stderr.
  const out = await run("npm pack", $`npm pack --pack-destination ${dir}`);
  return `${dir}/${out.trim().split("\n").at(-1)}`;
}

export type Exec = { exitCode: number; stdout: string; stderr: string };

/** A long-lived container of `tag`, with `mounts` (`<host>:<container>[:ro]`), to run steps in with `exec`. */
export async function startContainer(tag: string, name: string, mounts: string[]): Promise<string> {
  const volumes = mounts.flatMap((mount) => ["-v", mount]);
  await $`docker run -d --name ${name} ${volumes} ${tag} sleep infinity`.quiet();
  return name;
}

/** Runs `script` with `sh -c` in `container`'s /work, with `env` set. Never throws for an exit code. */
export async function exec(container: string, script: string, env: Record<string, string> = {}, stdin?: string): Promise<Exec> {
  const envArgs = Object.entries(env).flatMap(([name, value]) => ["-e", `${name}=${value}`]);
  const result =
    stdin === undefined
      ? await $`docker exec ${envArgs} -w /work ${container} sh -c ${script}`.quiet().nothrow()
      : await $`docker exec -i ${envArgs} -w /work ${container} sh -c ${script} < ${new Response(stdin)}`.quiet().nothrow();
  return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
}

export async function removeContainer(container: string): Promise<void> {
  await $`docker rm --force ${container}`.quiet().nothrow();
}
