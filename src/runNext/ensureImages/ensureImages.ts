/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Makes sure the runtime has every pre-run image the manifest needs: pulled, or built, and stored.
import { prerunRepository } from "../../execution/images.ts";
import { inParallel } from "../../execution/inParallel.ts";
import { buildPrerunImage } from "../../execution/prerunBuilds.ts";
import { moduleLogger } from "../../log/logger.ts";
import { type ImageBuildStatus, setImageStatus, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { runsFrom } from "../plan/plan.ts";
import { timed } from "../timed/timed.ts";
import type { Dependencies, Manifest, PlannedPermutation, TestCaseConfig } from "../types.ts";

const log = moduleLogger("runNext");

/**
 * The host checks which images the image store has; the runtime pulls those, and builds and pushes
 * the rest. Without an image store, the runtime builds those it doesn't have. Up to the manifest's
 * build concurrency at once. Once one fails, no more start, and its error is thrown: a
 * DockerUnavailableError, DockerBuildError, DockerPushError, DockerPullError or ConfigError.
 *
 * `config` is here for what building needs and the manifest leaves out: each Dockerfile, and the
 * project's files.
 */
export async function ensureImages(
  manifest: Manifest,
  config: TestCaseConfig,
  deps: Pick<Dependencies, "hostDocker" | "runtimeDocker" | "state" | "clock">,
): Promise<void> {
  const { hostDocker, runtimeDocker, state } = deps;
  // One per image: permutations that build the same image share it.
  const images = [...new Map(manifest.permutations.map((permutation) => [permutation.imageHash, permutation])).values()];
  if (images.length === 0) return;
  const set = (permutation: PlannedPermutation, status: ImageBuildStatus) => state.update(updateRun((run) => setImageStatus(run, runsFrom(permutation), status)));
  for (const image of images) set(image, "checking");

  // What the runtime already has, asked once for each repository.
  const [built, pulled] = await Promise.all([
    runtimeDocker.imagesIn(prerunRepository(manifest.imagePrefix)),
    manifest.imageStore === null ? new Set<string>() : runtimeDocker.imagesIn(manifest.imageStore),
  ]);
  const dockerfileOf = new Map(config.permutations.map(({ permutation }) => [permutation.imageHash, permutation]));

  const ensure = async (image: PlannedPermutation) => {
    const { prerunImage, storedPrerunImage: reference } = image;
    const build = async () => {
      if (built.has(prerunImage)) return;
      set(image, "building");
      const permutation = dockerfileOf.get(image.imageHash);
      if (permutation === undefined) throw new Error(`No Dockerfile for ${prerunImage}: the manifest isn't this config's.`);
      await timed(deps, "build", () => buildPrerunImage(config.root, { permutation, image: prerunImage }, {}, config.build, runtimeDocker));
    };
    try {
      if (reference === undefined) {
        await build();
      } else if (pulled.has(reference)) {
        log.info({ reference }, "prerun image already in the runtime");
      } else if (await hostDocker.inRegistry(reference)) {
        set(image, "pulling");
        await timed(deps, "pullPrerun", () => runtimeDocker.pull(reference));
      } else {
        await build();
        set(image, "pushing");
        // Pushing it tags it as `reference` in the runtime, which is what its containers start from.
        await timed(deps, "pushPrerun", () => runtimeDocker.push(prerunImage, reference));
      }
      set(image, "ready");
    } catch (error) {
      set(image, "failed");
      throw error;
    }
  };
  await inParallel(images.map((image) => () => ensure(image)), manifest.buildConcurrency);
}
