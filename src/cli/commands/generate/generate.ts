import { Command } from "commander";
import { FOLDER, findThunderjarRoot, type Problem } from "../../../config/loader.ts";
import { painter } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { GENERATED_PATH, writeParameterNames } from "./parameterNames.ts";
import { print, printWarning } from "../../output.ts";

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
export async function generate(cwd: string): Promise<{ path: string; problems: Problem[] }> {
  const root = await findThunderjarRoot(cwd);
  const problems = await writeParameterNames(root);
  return { path: `${root}/${GENERATED_PATH}`, problems };
}

export function createGenerateCommand(): Command {
  return new Command("generate")
    .description(
      `Write the names declared under ${FOLDER}/parameters/ to ${FOLDER}/${GENERATED_PATH}, so a test case that names an undeclared parameter is a type error.`,
    )
    .action(
      reportingConfigErrors(async () => {
        const { path, problems } = await generate(process.cwd());
        for (const { file, field, message } of problems) {
          printWarning(`${FOLDER}/${file}: ${field ? `${field}: ` : ""}${message} Its pairs take any model.`);
        }
        const paint = painter();
        print(`${paint.green("Wrote")} ${paint.cyan(relativeTo(process.cwd(), path))}`);
      }),
    );
}
