import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { hashPermutations } from "../../../config/permutations.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { prerunImage } from "../../../execution/images.ts";
import { loadPrerunParameters, renderPrerunDockerfile } from "../../../execution/prerunDockerfile.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";

/**
 * Each prerun image test case `name` needs, of the nearest `.thunderjar/` folder in `cwd` or above
 * it: `# <image>`, then its Dockerfile. Permutations with the same hash share one image. Docker
 * isn't asked anything.
 */
export async function dryRun(cwd: string, name: string, imagePrefix?: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  const unique = [...new Map(permutations.map((permutation) => [permutation.hash, permutation])).values()];
  const blocks = await Promise.all(
    unique.map(async (permutation) => {
      const dockerfile = renderPrerunDockerfile(await loadPrerunParameters(root, testCase.task, permutation));
      return `# ${prerunImage(permutation.hash, imagePrefix)}\n${dockerfile.trimEnd()}`;
    }),
  );
  return blocks.join("\n\n");
}

export function createBuildCommand(): Command {
  return new Command("build")
    .description(
      "Build the prerun Docker image of each permutation of a test case. So far only a dry run is possible: it prints each image's name and Dockerfile.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print each prerun image's name and Dockerfile, without building anything")
    .addOption(imagePrefixOption())
    .action(
      reportingConfigErrors(async (name: string, options: { dryRun?: boolean; imagePrefix: string }) => {
        if (!options.dryRun) {
          console.error("Error: Building images is not implemented yet; use --dry-run.");
          process.exitCode = 1;
          return;
        }
        console.log(await dryRun(process.cwd(), name, options.imagePrefix));
      }),
    );
}
