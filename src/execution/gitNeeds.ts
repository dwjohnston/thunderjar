// What prerun builds read from the repository the project is in: the commits and files their
// fragments asked for, through `checkoutCommit` and `ctx.git.show`. Read from the repository
// `.thunderjar/` is in, never fetched.
import { ConfigError } from "../config/loader.ts";
import { findRepository, type Repository } from "../git/git.ts";
import type { GitNeed } from "./prerunDockerfile.ts";

/**
 * The repository `root` (the `.thunderjar/` folder) is in, after checking it has every commit,
 * and every file at its commit, that `needs` names. Throws a ConfigError naming each that's
 * missing, so it can be called before anything is built.
 */
export async function checkGitNeeds(root: string, needs: GitNeed[]): Promise<Repository | undefined> {
  if (needs.length === 0) return undefined;
  const repository = await findRepository(root);
  const problems = new Set<string>();
  const present = new Map<string, boolean>();
  for (const need of needs) {
    if (!repository) {
      problems.add(`commit ${need.commit} (${need.owner}) can't be read: the project isn't in a git repository.`);
      continue;
    }
    if (!present.has(need.commit)) present.set(need.commit, (await repository.resolveCommit(need.commit)) !== undefined);
    if (!present.get(need.commit)) {
      problems.add(`commit ${need.commit} (${need.owner}) is not in this repository.\nFetch it, or check that it has been pushed.`);
    } else if (need.kind === "file" && (await repository.readFile(need.commit, need.file)) === undefined) {
      problems.add(`${need.file} is not in commit ${need.commit} (${need.owner}).`);
    }
  }
  if (problems.size > 0) throw new ConfigError(...problems);
  return repository;
}

/** Writes what `needs` asked for into the build context `contextDir`, from `repository`, which `checkGitNeeds` has checked. */
export async function writeGitNeeds(repository: Repository | undefined, needs: GitNeed[], contextDir: string): Promise<void> {
  for (const need of needs) {
    if (!repository) throw new Error(`${need.owner} reads commit ${need.commit}, but there is no repository to read it from.`);
    const dest = `${contextDir}/${need.path}`;
    if (need.kind === "bundle") {
      await repository.bundle((await repository.resolveCommit(need.commit)) as string, dest);
    } else {
      await Bun.write(dest, (await repository.readFile(need.commit, need.file)) as Uint8Array);
    }
  }
}
