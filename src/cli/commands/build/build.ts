import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { hashPermutations } from "../../../config/permutations.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { DockerBuildError, DockerUnavailableError } from "../../../docker/docker.ts";
import { prerunImage } from "../../../execution/images.ts";
import { buildPrerunImages } from "../../../execution/prerunBuilds.ts";
import { checkGitNeeds } from "../../../execution/gitNeeds.ts";
import { loadPrerunParameters, renderPrerun } from "../../../execution/prerunDockerfile.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";

/**
 * Each prerun image test case `name` needs, of the nearest `.thunderjar/` folder in `cwd` or above
 * it: `# <image>`, then its Dockerfile. Permutations with the same hash share one image. Docker
 * isn't asked anything, but every commit the Dockerfiles read is checked, as a build would.
 */
export async function dryRun(cwd: string, name: string, imagePrefix?: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  const unique = [...new Map(permutations.map((permutation) => [permutation.hash, permutation])).values()];
  const rendered = await Promise.all(
    unique.map(async (permutation) => ({
      image: prerunImage(permutation.hash, imagePrefix),
      ...renderPrerun(await loadPrerunParameters(root, testCase.task, permutation)),
    })),
  );
  await checkGitNeeds(root, rendered.flatMap(({ git }) => git));
  return rendered.map(({ image, dockerfile }) => `# ${image}\n${dockerfile.trimEnd()}`).join("\n\n");
}

/**
 * Builds each prerun image test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above
 * it, needs that doesn't exist yet, writing `Building <image> ... done` for each, then a count.
 * Exits 1 with an error if Docker can't be reached or a build fails.
 */
async function build(cwd: string, name: string, imagePrefix?: string): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  let building: string | undefined;
  try {
    const { built, present } = await buildPrerunImages(root, testCase.task, permutations, imagePrefix, {
      onBuilding: (image) => {
        building = image;
        process.stdout.write(`Building ${image} ... `);
      },
      onBuilt: () => {
        building = undefined;
        console.log("done");
      },
    });
    console.log(`${built.length} built, ${present.length} already present`);
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      console.error(`Error: Docker can't be reached, so no image can be built: ${error.message}`);
    } else if (error instanceof DockerBuildError) {
      console.log("failed");
      console.error(`Error: Building ${building} failed: ${error.message}`);
    } else {
      throw error;
    }
    process.exitCode = 1;
  }
}

export function createBuildCommand(): Command {
  return new Command("build")
    .description(
      "Build the prerun Docker image of each permutation of a test case, unless it already exists. Permutations with the same hash share one image.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print each prerun image's name and Dockerfile, without building anything")
    .addOption(imagePrefixOption())
    .action(
      reportingConfigErrors(async (name: string, options: { dryRun?: boolean; imagePrefix: string }) => {
        if (options.dryRun) console.log(await dryRun(process.cwd(), name, options.imagePrefix));
        else await build(process.cwd(), name, options.imagePrefix);
      }),
    );
}
