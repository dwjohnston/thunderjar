// Reading commits from the repository Thunderjar is run in —
// spec/062-code-state.md#where-the-commit-comes-from. The repository is the one the project
// holding `.thunderjar/` is in. Thunderjar only reads it: it never fetches, and never writes a
// ref or an object into it.

import { makeTempDir, remove } from "../platform/fs.ts";
import { join } from "../platform/path.ts";

/** Runs git in `cwd`, collecting stdout as bytes. */
async function git(cwd: string, args: string[]): Promise<{ exitCode: number; stdout: Buffer; stderr: string }> {
  const child = Bun.spawn(["git", ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode: child.exitCode ?? 1, stdout: Buffer.from(stdout), stderr };
}

async function gitOrThrow(cwd: string, args: string[]) {
  const result = await git(cwd, args);
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}:\n${result.stderr.trim()}`);
  return result.stdout;
}

export interface Repository {
  /** The full hash of `commit`, a full or abbreviated hash, or undefined if it isn't in the repository. */
  resolveCommit(commit: string): Promise<string | undefined>;
  /** `path`'s content at `commit`, or undefined if the commit has no such file. */
  readFile(commit: string, path: string): Promise<Buffer | undefined>;
  /**
   * Writes a bundle holding `commit` and its ancestors, and nothing else, to `dest`, with one
   * branch, `code-state`, at `commit`.
   */
  bundle(commit: string, dest: string): Promise<void>;
}

/**
 * The repository `dir` is in, or undefined if it isn't in one. Throws with git's message if git
 * can't use the repository it finds, such as one owned by another user.
 */
export async function findRepository(dir: string): Promise<Repository | undefined> {
  const { exitCode, stdout, stderr } = await git(dir, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (exitCode !== 0 && /not a git repository/i.test(stderr)) return undefined;
  if (exitCode !== 0) throw new Error(`error: git can't read the repository ${dir} is in:\n${stderr.trim()}`);
  const objects = join(stdout.toString("utf8").trim(), "objects");

  return {
    async resolveCommit(commit) {
      const { exitCode, stdout } = await git(dir, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`]);
      return exitCode === 0 ? stdout.toString("utf8").trim() : undefined;
    },
    async readFile(commit, path) {
      const { exitCode, stdout } = await git(dir, ["show", `${commit}:${path}`]);
      return exitCode === 0 ? stdout : undefined;
    },
    async bundle(commit, dest) {
      // `git bundle` needs a ref to bundle, and the user's repository is never written to. So
      // the ref goes in a throwaway repository that borrows the user's objects (alternates).
      const scratch = await makeTempDir("thunderjar-bundle-");
      try {
        await gitOrThrow(scratch, ["init", "--quiet", "--bare"]);
        await Bun.write(join(scratch, "objects", "info", "alternates"), `${objects}\n`);
        await gitOrThrow(scratch, ["update-ref", "refs/heads/code-state", commit]);
        await gitOrThrow(scratch, ["symbolic-ref", "HEAD", "refs/heads/code-state"]);
        await gitOrThrow(scratch, ["bundle", "create", "--quiet", dest, "HEAD", "code-state"]);
      } finally {
        await remove(scratch);
      }
    },
  };
}
