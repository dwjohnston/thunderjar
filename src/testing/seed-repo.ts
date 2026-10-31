// The seed repository — spec/150-repository-layout.md#the-seed-repository. A small git
// repository with fixed authors and dates, so its commit hashes are the same on every machine
// and fixture declarations can pin them:
//
//   SEED_COMMITS.baseline   package.json and an empty package-lock.json, so `npm ci` works offline
//   SEED_COMMITS.prompts    adds prompts/snerk.md and prompts/glurk.md, on top of baseline
//
// Tests of parameters that read commits (gitParameters in fixture-project.ts) check out baseline
// and read prompt files at prompts, so a prerun image built from them has a commit after its
// code state's in the repository it was built from: the one it must never show the agent.
// Nothing here writes a README or a @ts-ignore, so the fake agents' measures are what they wrote.

import { join } from "../platform/path.ts";

export const SEED_COMMITS = {
  baseline: "089b6a7a1688798c917f0b78535b0c8348a1dbae",
  prompts: "91ab1db384146db3f605113ab297cf4469a60c9a",
};

export const PACKAGE = { name: "is-prime", version: "1.0.0", private: true };
export const LOCK = {
  name: "is-prime",
  version: "1.0.0",
  lockfileVersion: 3,
  requires: true,
  packages: { "": { name: "is-prime", version: "1.0.0" } },
};

export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const COMMITS: { message: string; date: string; files: Record<string, string> }[] = [
  {
    message: "Start the is-prime project",
    date: "2026-01-01T00:00:00Z",
    files: { "package.json": json(PACKAGE), "package-lock.json": json(LOCK) },
  },
  {
    message: "Add prompt files",
    date: "2026-01-02T00:00:00Z",
    files: {
      "prompts/snerk.md": "# Snerk\n\nWrite small functions, and say what each one is for.\n",
      "prompts/glurk.md": "# Glurk\n\nPrefer one clear expression to a loop.\n",
    },
  },
];

const IDENTITY = { name: "Thunderjar Fixtures", email: "fixtures@thunderjar.invalid" };

function git(dir: string, args: string[], env: Record<string, string> = {}) {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: dir,
    stderr: "pipe",
    // Nothing from the developer's own git config: no signing, hooks or templates.
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...env },
  });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed in ${dir}:\n${result.stderr.toString()}`);
  return result.stdout.toString().trim();
}

/**
 * Makes `dir` the seed repository, on `main`, and returns the hash of each commit. Files
 * already in `dir` are left untracked.
 */
export async function seedRepo(dir: string): Promise<typeof SEED_COMMITS> {
  git(dir, ["init", "--quiet", "--initial-branch=main"]);
  const hashes: string[] = [];
  for (const { message, date, files } of COMMITS) {
    for (const [path, contents] of Object.entries(files)) {
      await Bun.write(join(dir, path), contents);
    }
    git(dir, ["add", "--", ...Object.keys(files)]);
    git(dir, ["commit", "--quiet", "--no-verify", "-m", message], {
      GIT_AUTHOR_NAME: IDENTITY.name,
      GIT_AUTHOR_EMAIL: IDENTITY.email,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: IDENTITY.name,
      GIT_COMMITTER_EMAIL: IDENTITY.email,
      GIT_COMMITTER_DATE: date,
    });
    hashes.push(git(dir, ["rev-parse", "HEAD"]));
  }
  return { baseline: hashes[0]!, prompts: hashes[1]! };
}
