import { Command } from "commander";
import { scaffold } from "./scaffold.ts";

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
 * Scaffolds `<projectDir>/.thunderjar/`. Never overwrites a file, so running it again only adds what's missing.
 * A nested `package.json` is created only when the project has no `package.json` of its own.
 */
export async function init(projectDir: string): Promise<InitResult> {
  const root = `${projectDir}/${FOLDER}`;
  const createdFolder = !(await isDirectory(root));
  const nestedPackage = !(await Bun.file(`${projectDir}/package.json`).exists());

  const result: InitResult = { createdFolder, created: [], existing: [] };
  for (const [path, content] of Object.entries(scaffold({ nestedPackage }))) {
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
      "Scaffold the .thunderjar/ configuration folder in the current directory, with an example test case. Existing files are left as they are.",
    )
    .action(async () => {
      const { createdFolder, created, existing } = await init(process.cwd());
      if (createdFolder) console.log(`Created ${FOLDER}/`);
      for (const path of created) console.log(`Created ${FOLDER}/${path}`);
      for (const path of existing) console.log(`Exists  ${FOLDER}/${path}`);
    });
}
