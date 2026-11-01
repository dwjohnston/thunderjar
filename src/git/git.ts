// Reading commits from the repository a project is in: the code a code state checks out, and the
// files a prompt set reads. Thunderjar only reads it: it never fetches, and never writes a ref or
// an object into it.
import { $ } from "bun";

export type Repository = {
  /** The full hash of `commit`, or undefined if it isn't a commit in the repository. */
  resolveCommit(commit: string): Promise<string | undefined>;
  /** `path`'s content at `commit`, or undefined if the commit has no such file. */
  readFile(commit: string, path: string): Promise<Uint8Array | undefined>;
  /**
   * Writes a bundle of `commit`, a full hash, and its ancestors, and nothing else, to `dest`. Its
   * one branch, `code-state`, is at `commit`.
   */
  bundle(commit: string, dest: string): Promise<void>;
};

/** The branch a bundle holds its commit on. */
export const BUNDLE_BRANCH = "code-state";

/** The repository `dir` is in, or undefined if it isn't in one. */
export async function findRepository(dir: string): Promise<Repository | undefined> {
  const common = await $`git -C ${dir} rev-parse --path-format=absolute --git-common-dir`.quiet().nothrow();
  if (common.exitCode !== 0) return undefined;
  const objects = `${common.stdout.toString().trim()}/objects`;

  return {
    async resolveCommit(commit) {
      const result = await $`git -C ${dir} rev-parse --verify --quiet ${`${commit}^{commit}`}`.quiet().nothrow();
      return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
    },
    async readFile(commit, path) {
      const result = await $`git -C ${dir} show ${`${commit}:${path}`}`.quiet().nothrow();
      return result.exitCode === 0 ? new Uint8Array(result.stdout) : undefined;
    },
    async bundle(commit, dest) {
      // `git bundle` bundles refs, and the user's repository is never written to. So the ref goes
      // in a throwaway repository that borrows the user's objects through `alternates`.
      const scratch = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-bundle-${crypto.randomUUID()}`;
      try {
        await $`git init --quiet --bare ${scratch}`.quiet();
        await Bun.write(`${scratch}/objects/info/alternates`, `${objects}\n`);
        await $`git --git-dir=${scratch} update-ref ${`refs/heads/${BUNDLE_BRANCH}`} ${commit}`.quiet();
        await $`git --git-dir=${scratch} symbolic-ref HEAD ${`refs/heads/${BUNDLE_BRANCH}`}`.quiet();
        await $`git --git-dir=${scratch} bundle create --quiet ${dest} HEAD ${BUNDLE_BRANCH}`.quiet();
      } finally {
        await $`rm -rf ${scratch}`.quiet();
      }
    },
  };
}
