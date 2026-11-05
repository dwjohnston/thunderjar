import { $ } from "bun";
import { Command } from "commander";
import { type Repository, scaffold } from "./scaffold.ts";

const FOLDER = ".thunderjar";

export type InitResult = {
  /** Whether `init` created `.thunderjar/` itself. */
  createdFolder: boolean;
  /** Paths in `.thunderjar/` that `init` created. */
  created: string[];
  /** Paths in `.thunderjar/` that already existed, and that `init` left as they were. */
  existing: string[];
};

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Bun.file(path).stat()).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The `origin` remote of the git repository `dir` is in, and the commit it is at, or undefined
 * outside one, before its first commit, or without an `origin`.
 */
async function projectRepository(dir: string): Promise<Repository | undefined> {
  const git = async (args: string[]) => {
    const result = await $`git ${args}`.cwd(dir).quiet().nothrow();
    return result.exitCode === 0 ? result.stdout.toString().trim() : undefined;
  };
  const commit = await git(["rev-parse", "--verify", "--quiet", "HEAD"]);
  const url = commit && (await git(["remote", "get-url", "origin"]));
  return commit && url ? { url, commit } : undefined;
}

/**
 * Scaffolds `<projectDir>/.thunderjar/`. Never overwrites a file, so running it again only adds what's missing.
 * A nested `package.json` is created only when the project has no `package.json` of its own.
 * Its code state clones the project's `origin` at its current commit, when it has one.
 */
export async function init(projectDir: string): Promise<InitResult> {
  const root = `${projectDir}/${FOLDER}`;
  const createdFolder = !(await isDirectory(root));
  const nestedPackage = !(await Bun.file(`${projectDir}/package.json`).exists());

  const repository = await projectRepository(projectDir);

  const result: InitResult = { createdFolder, created: [], existing: [] };
  for (const [path, content] of Object.entries(scaffold({ nestedPackage, repository }))) {
    const file = Bun.file(`${root}/${path}`);
    if (await file.exists()) {
      result.existing.push(path);
      continue;
    }
    await Bun.write(file, content);
    result.created.push(path);
  }
  return result;
}

export function createInitCommand(): Command {
  return new Command("init")
    .description(
      "Scaffold the .thunderjar/ configuration folder in the current directory, with two test cases, one comparing models and one comparing harnesses, and starter prompt sets and harnesses to copy. Existing files are left as they are.",
    )
    .action(async () => {
      const { createdFolder, created, existing } = await init(process.cwd());
      if (createdFolder) console.log(`Created ${FOLDER}/`);
      for (const path of created) console.log(`Created ${FOLDER}/${path}`);
      for (const path of existing) console.log(`Exists  ${FOLDER}/${path}`);
    });
}
