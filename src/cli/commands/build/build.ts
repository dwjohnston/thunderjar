import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import type { Overrides } from "../../../config/overrides.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerBuildError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { prerunImage } from "../../../execution/images.ts";
import { checkImageStore, ImageStoreLoginError, pushPrerunImages } from "../../../execution/imageStore.ts";
import { buildPrerunImages } from "../../../execution/prerunBuilds.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import { every } from "../../../time/clock.ts";
import type { CommandRun } from "../../app.ts";
import { type Paint, plain } from "../../colour.ts";
import { exitCodeOf } from "../../configErrors.ts";
import { pushFailure } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { overridesOf, withOverrideOptions } from "../../overrides.ts";
import { type Printer, printer } from "../../output.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";
import { type BuildState, setImage } from "./buildState.ts";

/**
 * Each prerun image test case `name` needs, of the nearest `.thunderjar/` folder in `cwd` or above
 * it, each list `overrides` gives in place of its own, with its Dockerfile. Permutations with the
 * same image hash share one image. Docker isn't asked anything.
 */
export async function prerunDockerfiles(
  cwd: string,
  name: string,
  imagePrefix?: string,
  overrides: Overrides = {},
): Promise<{ prerunImage: string; dockerfile: string }[]> {
  const root = await findThunderjarRoot(cwd);
  const testCase = await loadTestCase(root, name, overrides);
  const permutations = await hashPermutations(root, testCase);
  const unique = [...new Map(permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  return unique.map(({ imageHash, dockerfile }) => ({ prerunImage: prerunImage(imageHash, imagePrefix), dockerfile }));
}

/** Each prerun image test case `name` needs, as `# <image>`, then its Dockerfile. See `prerunDockerfiles`. */
export async function dryRun(cwd: string, name: string, imagePrefix?: string, paint: Paint = plain, overrides: Overrides = {}): Promise<string> {
  const images = await prerunDockerfiles(cwd, name, imagePrefix, overrides);
  return images.map(({ prerunImage, dockerfile }) => `${paint.bold("#")} ${paint.cyan(prerunImage)}\n${dockerfile.trimEnd()}`).join("\n\n");
}

type BuildArgs = { name: string; imagePrefix?: string; json: boolean; local: boolean; overrides: Overrides };

/**
 * Builds each prerun image test case `name`, of the nearest `.thunderjar/` folder in `run`'s cwd or
 * above it, needs that doesn't exist yet, on the config's runtime's daemon, unless `local` or there's
 * none, writing `Building <image> ... done` for each, or, with a build
 * concurrency above 1, building that many at once and writing `Building <image>` and `Built <image>`
 * as each starts and ends. Then, with an
 * image store, pushes each of them, writing `Pushing <reference> ... done`, then a count. Returns 1,
 * after writing an error, if a build secret's variable is unset, Docker can't be reached, has no login for the
 * image store's registry (before anything is built), or a build or push fails. With `json`, prints
 * the images built, those already present and the references pushed as JSON once it's done. Each
 * list `overrides` gives replaces the test case's own.
 */
async function build(run: CommandRun, out: Printer, { name, imagePrefix, json, local, overrides }: BuildArgs): Promise<number> {
  const root = await findThunderjarRoot(run.launch.cwd);
  const { imageStore, build: buildOptions, runtime: config } = await loadProjectConfig(root);
  // Where images are built, and pushed from: the runtime, which runs them, unless --local.
  const docker = local || config === null ? run.docker : run.docker.on(config.command);
  const testCase = await loadTestCase(root, name, overrides);
  checkBuildSecrets(buildOptions, run.launch.env);
  const permutations = await hashPermutations(root, testCase);
  const concurrent = buildOptions.concurrency > 1;
  const state: BuildState = { images: [] };
  run.publish(state);
  // When each image's build started, on the app's clock.
  const started = new Map<string, number>();
  // The line that's waiting for how its build or push ends, counting up on the app's clock.
  let line: WaitingLine | undefined;
  const wait = (label: string) =>
    waitingLine(label, { out: out.text, now: () => run.clock.now(), ticker: (tick) => every(run.clock, 1000, tick), colour: out.paint.enabled });
  // Colour for what's written while building, on a terminal.
  const { paint } = out;
  const ellipsis = paint.dim("...");
  const done = paint.green("done");
  try {
    if (!local && config !== null) out.print(paint.dim(`Building with \`${config.command.join(" ")}\``));
    await checkImageStore(imageStore, docker);
    const { built, present } = await buildPrerunImages(root, permutations, imagePrefix, {
      onPlanned: (images) => {
        state.images = images.map(({ image, exists }) => (exists ? { image, status: "present" } : { image, status: "queued" }));
      },
      onBuilding: (image) => {
        started.set(image, run.clock.now());
        if (concurrent) return out.print(`Building ${paint.cyan(image)}`);
        line = wait(`Building ${paint.cyan(image)} ${ellipsis} `);
      },
      onBuilt: (image) => {
        setImage(state, { image, status: "built", ms: run.clock.now() - (started.get(image) as number) });
        if (concurrent) return out.print(`Built ${paint.cyan(image)}`);
        line?.finish(done);
      },
    }, buildOptions, docker);
    const pushed = await pushPrerunImages(permutations, imageStore, imagePrefix, {
      onPushing: (_image, reference) => {
        line = wait(`Pushing ${paint.cyan(reference)} ${ellipsis} `);
      },
      onPushed: () => {
        line?.finish(done);
      },
    }, docker);
    if (json) out.printJson({ built, present, pushed });
    else out.print(
      [
        paint.green(`${built.length} built`),
        paint.dim(`${present.length} already present`),
        ...(imageStore ? [paint.green(`${pushed.length} pushed`)] : []),
      ].join(paint.dim(", ")),
    );
    return 0;
  } catch (error) {
    if (error instanceof DockerUnavailableError) {
      out.printError(`Docker can't be reached, so no image can be built: ${error.message}`);
    } else if (error instanceof ImageStoreLoginError) {
      out.printError(error.message);
    } else if (error instanceof DockerBuildError) {
      line?.fail();
      out.printError(`Building ${error.image} failed: ${error.message}`);
    } else if (error instanceof DockerPushError) {
      line?.fail();
      out.printError(pushFailure(error.reference, error));
    } else {
      throw error;
    }
    return 1;
  } finally {
    line?.stop();
  }
}

/** `build`, running with `run`'s services. Without `run`, it only describes itself, e.g. for the docs. */
export function createBuildCommand(run?: CommandRun): Command {
  return withOverrideOptions(new Command("build"))
    .description(
      "Build the prerun Docker image of each permutation of a test case, unless it already exists. Permutations with the same hash share one image. With a runtime in thunderjar.config.ts, they're built on its Docker daemon, unless --local is given. With an image store, each is then pushed there, after checking your docker login for its registry.",
    )
    .argument("<test case>", `the name of a test case, declared in ${FOLDER}/test-cases/<test case>.ts`)
    .option("--dry-run", "print each prerun image's name and Dockerfile, without building anything")
    .option("--local", "build on the local Docker daemon, even if thunderjar.config.ts gives a runtime")
    .addOption(imagePrefixOption())
    .addOption(jsonOption())
    .action(async (name: string, options: Overrides & { dryRun?: boolean; imagePrefix: string; json?: boolean; local?: boolean }) => {
      if (run === undefined) throw new Error("build runs through createApp, with its services.");
      const out = printer(run.io, { json: options.json, env: run.launch.env });
      const { cwd } = run.launch;
      const overrides = overridesOf(options);
      run.exitCode = await exitCodeOf(out, async () => {
        if (options.dryRun && options.json) out.printJson(await prerunDockerfiles(cwd, name, options.imagePrefix, overrides));
        else if (options.dryRun) out.print(await dryRun(cwd, name, options.imagePrefix, out.paint, overrides));
        else return build(run, out, { name, imagePrefix: options.imagePrefix, json: options.json ?? false, local: options.local ?? false, overrides });
        return 0;
      });
    });
}
