import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerBuildError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { prerunImage } from "../../../execution/images.ts";
import { checkImageStore, ImageStoreLoginError, pushPrerunImages } from "../../../execution/imageStore.ts";
import { buildPrerunImages } from "../../../execution/prerunBuilds.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { pushFailure } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";

/**
 * Each prerun image test case `name` needs, of the nearest `.thunderjar/` folder in `cwd` or above
 * it: `# <image>`, then its Dockerfile. Permutations with the same image hash share one image. Docker
 * isn't asked anything.
 */
export async function dryRun(cwd: string, name: string, imagePrefix?: string): Promise<string> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  const unique = [...new Map(permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  return unique.map(({ imageHash, dockerfile }) => `# ${prerunImage(imageHash, imagePrefix)}\n${dockerfile.trimEnd()}`).join("\n\n");
}

/**
 * Builds each prerun image test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above
 * it, needs that doesn't exist yet, writing `Building <image> ... done` for each, or, with a build
 * concurrency above 1, building that many at once and writing `Building <image>` and `Built <image>`
 * as each starts and ends. Then, with an
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
  const concurrent = buildOptions.concurrency > 1;
  // The line that's waiting for how its build or push ends.
  let line: WaitingLine | undefined;
  try {
    await checkImageStore(imageStore);
    const { built, present } = await buildPrerunImages(root, permutations, imagePrefix, {
      onBuilding: (image) => {
        if (concurrent) return console.log(`Building ${image}`);
        line = waitingLine(`Building ${image} ... `);
      },
      onBuilt: (image) => {
        if (concurrent) return console.log(`Built ${image}`);
        line?.finish("done");
      },
    }, buildOptions);
    const pushed = await pushPrerunImages(permutations, imageStore, imagePrefix, {
      onPushing: (_image, reference) => {
        line = waitingLine(`Pushing ${reference} ... `);
      },
      onPushed: () => {
        line?.finish("done");
      },
    });
    console.log(`${built.length} built, ${present.length} already present${imageStore ? `, ${pushed.length} pushed` : ""}`);
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      console.error(`Error: Docker can't be reached, so no image can be built: ${error.message}`);
    } else if (error instanceof ImageStoreLoginError) {
      console.error(`Error: ${error.message}`);
    } else if (error instanceof DockerBuildError) {
      line?.fail();
      console.error(`Error: Building ${error.image} failed: ${error.message}`);
    } else if (error instanceof DockerPushError) {
      line?.fail();
      console.error(`Error: ${pushFailure(error.reference, error)}`);
    } else {
      throw error;
    }
    process.exitCode = 1;
  } finally {
    line?.stop();
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
        if (options.dryRun) console.log(await dryRun(process.cwd(), name, options.imagePrefix));
        else await build(process.cwd(), name, options.imagePrefix);
      }),
    );
}
