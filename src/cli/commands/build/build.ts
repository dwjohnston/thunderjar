import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerBuildError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { prerunImage } from "../../../execution/images.ts";
import { checkImageStore, ImageStoreLoginError, pushPrerunImages } from "../../../execution/imageStore.ts";
import { buildPrerunImages } from "../../../execution/prerunBuilds.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import { type Paint, painter, plain } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { pushFailure } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { print, printError } from "../../output.ts";

/**
 * Each prerun image test case `name` needs, of the nearest `.thunderjar/` folder in `cwd` or above
 * it: `# <image>`, then its Dockerfile. Permutations with the same image hash share one image. Docker
 * isn't asked anything.
 */
export async function dryRun(cwd: string, name: string, imagePrefix?: string, paint: Paint = plain): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  const unique = [...new Map(permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  return unique.map(({ imageHash, dockerfile }) => `${paint.bold("#")} ${paint.cyan(prerunImage(imageHash, imagePrefix))}\n${dockerfile.trimEnd()}`).join("\n\n");
}

/**
 * Builds each prerun image test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above
 * it, needs that doesn't exist yet, writing `Building <image> ... done` for each, then, with an
 * image store, pushes each of them, writing `Pushing <reference> ... done`, then a count. Exits 1
 * with an error if a build secret's variable is unset, Docker can't be reached, has no login for the
 * image store's registry (before anything is built), or a build or push fails.
 */
async function build(cwd: string, name: string, imagePrefix?: string): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { imageStore, build: buildOptions } = await loadProjectConfig(root);
  const testCase = await loadTestCase(root, name);
  checkBuildSecrets(buildOptions);
  const permutations = await hashPermutations(root, testCase);
  let building: string | undefined;
  let pushing: string | undefined;
  // Colour for what's written while building, on a terminal.
  const paint = painter();
  const ellipsis = paint.dim("...");
  const done = paint.green("done");
  try {
    await checkImageStore(imageStore);
    const { built, present } = await buildPrerunImages(root, permutations, imagePrefix, {
      onBuilding: (image) => {
        building = image;
        process.stdout.write(`Building ${paint.cyan(image)} ${ellipsis} `);
      },
      onBuilt: () => {
        building = undefined;
        print(done);
      },
    }, buildOptions);
    const pushed = await pushPrerunImages(permutations, imageStore, imagePrefix, {
      onPushing: (_image, reference) => {
        pushing = reference;
        process.stdout.write(`Pushing ${paint.cyan(reference)} ${ellipsis} `);
      },
      onPushed: () => {
        pushing = undefined;
        print(done);
      },
    });
    print(
      [
        paint.green(`${built.length} built`),
        paint.dim(`${present.length} already present`),
        ...(imageStore ? [paint.green(`${pushed.length} pushed`)] : []),
      ].join(paint.dim(", ")),
    );
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      printError(`Docker can't be reached, so no image can be built: ${error.message}`);
    } else if (error instanceof ImageStoreLoginError) {
      printError(error.message);
    } else if (error instanceof DockerBuildError) {
      print(paint.red("failed"));
      printError(`Building ${building} failed: ${error.message}`);
    } else if (error instanceof DockerPushError) {
      print(paint.red("failed"));
      printError(pushFailure(pushing as string, error));
    } else {
      throw error;
    }
    process.exitCode = 1;
  }
}

export function createBuildCommand(): Command {
  return new Command("build")
    .description(
      "Build the prerun Docker image of each permutation of a test case, unless it already exists. Permutations with the same hash share one image. With an image store in thunderjar.config.ts, each is then pushed there, after checking your docker login for its registry.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print each prerun image's name and Dockerfile, without building anything")
    .addOption(imagePrefixOption())
    .action(
      reportingConfigErrors(async (name: string, options: { dryRun?: boolean; imagePrefix: string }) => {
        if (options.dryRun) print(await dryRun(process.cwd(), name, options.imagePrefix, painter()));
        else await build(process.cwd(), name, options.imagePrefix);
      }),
    );
}
