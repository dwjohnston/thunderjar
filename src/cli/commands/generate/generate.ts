import { Command } from "commander";
import { ConfigError, FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { GENERATED_PATH, writeParameterNames } from "./parameterNames.ts";

/** `path`, an absolute path under `dir` or a folder above it, relative to `dir`. */
function relativeTo(dir: string, path: string): string {
  let up = "";
  let base = dir.replace(/\/+$/, "");
  while (!path.startsWith(`${base}/`)) {
    up += "../";
    base = base.slice(0, base.lastIndexOf("/"));
  }
  return up + path.slice(base.length + 1);
}

/**
 * Writes the typed parameter names of the nearest `.thunderjar/` folder, in `cwd` or above it.
 * Returns the path it wrote.
 */
export async function generate(cwd: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  await writeParameterNames(root);
  return `${root}/${GENERATED_PATH}`;
}

export function createGenerateCommand(): Command {
  return new Command("generate")
    .description(
      `Write the names declared under ${FOLDER}/test-case-parameters/ to ${FOLDER}/${GENERATED_PATH}, so a test case that names an undeclared parameter is a type error.`,
    )
    .action(async () => {
      try {
        const path = await generate(process.cwd());
        console.log(`Wrote ${relativeTo(process.cwd(), path)}`);
      } catch (error) {
        if (!(error instanceof ConfigError)) throw error;
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
      }
    });
}
