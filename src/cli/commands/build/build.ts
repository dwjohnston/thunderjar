import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerBuildError, DockerPushError, DockerUnavailableError, localRuntime, remoteRuntime } from "../../../docker/docker.ts";
import { prerunImage } from "../../../execution/images.ts";
import { checkImageStore, ImageStoreLoginError, pushPrerunImages } from "../../../execution/imageStore.ts";
import { buildPrerunImages } from "../../../execution/prerunBuilds.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import { type Paint, painter, plain } from "../../colour.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { pushFailure } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { print, printError, printJson } from "../../output.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";

/**
 * Each prerun image test case `name` needs, of the nearest `.thunderjar/` folder in `cwd` or above
 * it, with its Dockerfile. Permutations with the same image hash share one image. Docker isn't
 * asked anything.
 */
export async function prerunDockerfiles(cwd: string, name: string, imagePrefix?: string): Promise<{ prerunImage: string; dockerfile: string }[]> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name);
  const permutations = await hashPermutations(root, testCase);
  const unique = [...new Map(permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  return unique.map(({ imageHash, dockerfile }) => ({ prerunImage: prerunImage(imageHash, imagePrefix), dockerfile }));
}

/** Each prerun image test case `name` needs, as `# <image>`, then its Dockerfile. See `prerunDockerfiles`. */
export async function dryRun(cwd: string, name: string, imagePrefix?: string, paint: Paint = plain): Promise<string> {
  const images = await prerunDockerfiles(cwd, name, imagePrefix);
  return images.map(({ prerunImage, dockerfile }) => `${paint.bold("#")} ${paint.cyan(prerunImage)}\n${dockerfile.trimEnd()}`).join("\n\n");
}

/**
 * Builds each prerun image test case `name`, of the nearest `.thunderjar/` folder in `cwd` or above
 * it, needs that doesn't exist yet, on the config's runtime's daemon, unless `local` or there's
 * none, writing `Building <image> ... done` for each, or, with a build
 * concurrency above 1, building that many at once and writing `Building <image>` and `Built <image>`
 * as each starts and ends. Then, with an
 * image store, pushes each of them, writing `Pushing <reference> ... done`, then a count. Exits 1
 * with an error if a build secret's variable is unset, Docker can't be reached, has no login for the
 * image store's registry (before anything is built), or a build or push fails. With `json`, prints
 * the images built, those already present and the references pushed as JSON once it's done.
 */
async function build(cwd: string, name: string, imagePrefix?: string, json = false, local = false): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { imageStore, build: buildOptions, runtime: config } = await loadProjectConfig(root);
  // Where images are built, and pushed from: the runtime, which runs them, unless --local.
  const runtime = local || config === null ? localRuntime() : remoteRuntime(config.command);
  const testCase = await loadTestCase(root, name);
  checkBuildSecrets(buildOptions);
  const permutations = await hashPermutations(root, testCase);
  const concurrent = buildOptions.concurrency > 1;
  // The line that's waiting for how its build or push ends.
  let line: WaitingLine | undefined;
  // Colour for what's written while building, on a terminal.
  const paint = painter();
  const ellipsis = paint.dim("...");
  const done = paint.green("done");
  try {
    if (!local && config !== null) print(paint.dim(`Building with \`${config.command.join(" ")}\``));
    await checkImageStore(imageStore);
    const { built, present } = await buildPrerunImages(root, permutations, imagePrefix, {
      onBuilding: (image) => {
        if (concurrent) return print(`Building ${paint.cyan(image)}`);
        line = waitingLine(`Building ${paint.cyan(image)} ${ellipsis} `);
      },
      onBuilt: (image) => {
        if (concurrent) return print(`Built ${paint.cyan(image)}`);
        line?.finish(done);
      },
    }, buildOptions, runtime);
    const pushed = await pushPrerunImages(permutations, imageStore, imagePrefix, {
      onPushing: (_image, reference) => {
        line = waitingLine(`Pushing ${paint.cyan(reference)} ${ellipsis} `);
      },
      onPushed: () => {
        line?.finish(done);
      },
    }, runtime);
    if (json) printJson({ built, present, pushed });
    else print(
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
      line?.fail();
      printError(`Building ${error.image} failed: ${error.message}`);
    } else if (error instanceof DockerPushError) {
      line?.fail();
      printError(pushFailure(error.reference, error));
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
      "Build the prerun Docker image of each permutation of a test case, unless it already exists. Permutations with the same hash share one image. With a runtime in thunderjar.config.ts, they're built on its Docker daemon, unless --local is given. With an image store, each is then pushed there, after checking your docker login for its registry.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print each prerun image's name and Dockerfile, without building anything")
    .option("--local", "build on the local Docker daemon, even if thunderjar.config.ts gives a runtime")
    .addOption(imagePrefixOption())
    .addOption(jsonOption())
    .action(
      reportingConfigErrors(async (name: string, options: { dryRun?: boolean; imagePrefix: string; json?: boolean; local?: boolean }) => {
        if (options.dryRun && options.json) printJson(await prerunDockerfiles(process.cwd(), name, options.imagePrefix));
        else if (options.dryRun) print(await dryRun(process.cwd(), name, options.imagePrefix, painter()));
        else await build(process.cwd(), name, options.imagePrefix, options.json, options.local);
      }),
    );
}
