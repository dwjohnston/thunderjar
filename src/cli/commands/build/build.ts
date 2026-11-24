import { Command } from "commander";
import { FOLDER, findThunderjarRoot } from "../../../config/loader.ts";
import type { Overrides } from "../../../config/overrides.ts";
import { loadTestCase } from "../../../config/testCase.ts";
import { checkBuildSecrets, loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerBuildError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { prerunImage, storedPrerunImage } from "../../../execution/images.ts";
import { checkImageStore, ImageStoreLoginError, pushPrerunImages } from "../../../execution/imageStore.ts";
import { buildPrerunImages } from "../../../execution/prerunBuilds.ts";
import { hashPermutations } from "../../../execution/hashPermutations.ts";
import type { CommandRun } from "../../app.ts";
import { type Paint, plain } from "../../colour.ts";
import { exitCodeOf } from "../../configErrors.ts";
import { frames } from "../../frames.ts";
import { pushFailure } from "../../format.ts";
import { imagePrefixOption } from "../../imagePrefix.ts";
import { jsonOption } from "../../json.ts";
import { overridesOf, withOverrideOptions } from "../../overrides.ts";
import { type Printer, printer } from "../../output.ts";
import { type BuildState, buildingSince, pushingSince, setImage, setPush } from "./buildState.ts";
import { headerLines, imageLines, pushLines, renderBuild, summaryLines } from "./renderBuild.ts";

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
 *
 * What it's doing is its state, a BuildState, which it publishes, and draws with renderBuild.
 */
async function build(run: CommandRun, out: Printer, { name, imagePrefix, json, local, overrides }: BuildArgs): Promise<number> {
  const root = await findThunderjarRoot(run.launch.cwd);
  const { imageStore, build: buildOptions, runtime: config } = await loadProjectConfig(root);
  // Where images are built, and pushed from: the runtime, which runs them, unless --local.
  const onRuntime = !local && config !== null;
  const docker = onRuntime ? run.docker.on(config.command) : run.docker;
  const testCase = await loadTestCase(root, name, overrides);
  checkBuildSecrets(buildOptions, run.launch.env);
  const permutations = await hashPermutations(root, testCase);
  const concurrent = buildOptions.concurrency > 1;
  const state: BuildState = {
    ...(onRuntime && { runtime: config.command.join(" ") }),
    images: [],
    ...(imageStore !== null && {
      pushes: [...new Set(permutations.map(({ imageHash }) => imageHash))].map((hash) => ({ reference: storedPrerunImage(imageStore.repository, hash), status: "queued" as const })),
    }),
  };
  run.publish(state);
  const { paint } = out;
  const view = frames(
    out.text,
    (terminal) => {
      const options = { terminal, now: run.clock.now(), paint };
      // Builds going at once end out of plan's order, so their lines are written as they happen, below.
      if (concurrent) return [...headerLines(state, options), ...pushLines(state, options), ...summaryLines(state, options)];
      // With --json, the count is in the JSON.
      if (json) return [...headerLines(state, options), ...imageLines(state, options), ...pushLines(state, options)];
      return renderBuild(state, options);
    },
    run.clock,
  );
  try {
    view.update();
    await checkImageStore(imageStore, docker);
    const { built, present } = await buildPrerunImages(root, permutations, imagePrefix, {
      onPlanned: (images) => {
        state.images = images.map(({ image, exists }) => (exists ? { image, status: "present" } : { image, status: "queued" }));
        view.update();
      },
      onBuilding: (image) => {
        setImage(state, { image, status: "building", since: run.clock.now() });
        if (concurrent) out.print(`Building ${paint.cyan(image)}`);
        view.update();
      },
      onBuilt: (image) => {
        setImage(state, { image, status: "built", ms: run.clock.now() - (buildingSince(state, image) ?? run.clock.now()) });
        if (concurrent) out.print(`Built ${paint.cyan(image)}`);
        view.update();
      },
    }, buildOptions, docker);
    const pushed = await pushPrerunImages(permutations, imageStore, imagePrefix, {
      onPushing: (_image, reference) => {
        setPush(state, { reference, status: "pushing", since: run.clock.now() });
        view.update();
      },
      onPushed: (_image, reference) => {
        setPush(state, { reference, status: "pushed", ms: run.clock.now() - (pushingSince(state, reference) ?? run.clock.now()) });
        view.update();
      },
    }, docker);
    view.stop();
    if (json) out.printJson({ built, present, pushed });
    return 0;
  } catch (error) {
    if (error instanceof DockerBuildError) {
      setImage(state, { image: error.image, status: "failed", ms: run.clock.now() - (buildingSince(state, error.image) ?? run.clock.now()) });
    } else if (error instanceof DockerPushError) {
      setPush(state, { reference: error.reference, status: "failed", ms: run.clock.now() - (pushingSince(state, error.reference) ?? run.clock.now()) });
    }
    view.stop();
    if (error instanceof DockerUnavailableError) {
      out.printError(`Docker can't be reached, so no image can be built: ${error.message}`);
    } else if (error instanceof ImageStoreLoginError) {
      out.printError(error.message);
    } else if (error instanceof DockerBuildError) {
      out.printError(`Building ${error.image} failed: ${error.message}`);
    } else if (error instanceof DockerPushError) {
      out.printError(pushFailure(error.reference, error));
    } else {
      throw error;
    }
    return 1;
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
