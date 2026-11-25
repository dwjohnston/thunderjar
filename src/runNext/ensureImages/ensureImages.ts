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

// Builds the pre-run images the manifest needs that don't exist yet.
import { FILES, PARAMETERS } from "../../config/folders.ts";
import { parsePair } from "../../config/permutations.ts";
import { DockerBuildError, DockerPullError, DockerPushError } from "../../docker/docker.ts";
import { prerunRepository } from "../../execution/images.ts";
import { inParallel } from "../../execution/inParallel.ts";
import { type FolderRole, PARAMETER_DIRS } from "../../execution/prerunDockerfile.ts";
import { moduleLogger } from "../../log/logger.ts";
import { logEvent, setImage, timed } from "../state/state.ts";
import type { Dependencies, Manifest, PlannedPermutation } from "../types.ts";

const log = moduleLogger("execution");

type Deps = Pick<Dependencies, "hostDocker" | "runtimeDocker" | "state" | "fs" | "env" | "random" | "clock">;

/** Where each folder parameter of `permutation` is, relative to `.thunderjar/`. */
const parameterFolders = ({ hashed }: PlannedPermutation): Record<FolderRole, string> => ({
  baseImage: `${PARAMETERS}/baseImages/${hashed.baseImage}`,
  codeState: `${PARAMETERS}/codeStates/${hashed.codeState}`,
  promptSet: `${PARAMETERS}/promptSets/${hashed.promptSet}`,
  harness: `${PARAMETERS}/harnessModels/${parsePair(hashed.harnessModel).harness}`,
});

/**
 * Builds `permutation`'s pre-run image on the runtime, from a build context assembled in a fresh
 * temporary folder: its Dockerfile, and each folder parameter's `files/`. The folder is removed
 * afterwards, whether or not the build succeeds.
 */
async function build(manifest: Manifest, permutation: PlannedPermutation, deps: Deps): Promise<void> {
  const { root, build: options } = manifest.config;
  const contextDir = `${deps.env.variables.TMPDIR || "/tmp"}/thunderjar-build-${deps.random.uuid()}`;
  try {
    await deps.fs.mkdir(contextDir);
    const folders = parameterFolders(permutation);
    for (const role of Object.keys(PARAMETER_DIRS) as FolderRole[]) {
      const files = `${root}/${folders[role]}/${FILES}`;
      if (await deps.fs.isDirectory(files)) await deps.fs.copyDirectory(files, `${contextDir}/${PARAMETER_DIRS[role]}`);
    }
    await deps.fs.write(`${contextDir}/Dockerfile`, permutation.hashed.dockerfile);
    await deps.runtimeDocker.build(contextDir, permutation.prerunImage, options);
  } finally {
    await deps.fs.removeDirectory(contextDir);
  }
}

/**
 * The host checks which images exist on the remote; the runtime pulls or builds the rest. Up to
 * the build concurrency at once. With an image store, each image built is pushed there from the
 * runtime, unless the store has it. A remote runtime only pulls an image the store already has.
 *
 * Throws a DockerUnavailableError, a DockerBuildError, a DockerPushError or a DockerPullError.
 * Once one fails, or the process is asked to stop, no more start, and those going finish first.
 */
export async function ensureImages(manifest: Manifest, deps: Deps): Promise<void> {
  const { imagePrefix, imageStore, runtime } = manifest.config;
  const remote = runtime !== null;
  // Permutations with the same image hash share one image.
  const images = [...new Map(manifest.permutations.map((permutation) => [permutation.prerunImage, permutation])).values()];
  for (const { prerunImage } of images) setImage(deps, prerunImage, "checking");
  // Where each is built, the images already there.
  const built = await deps.runtimeDocker.imagesIn(prerunRepository(imagePrefix));
  // The stored images a remote runtime already has, so they aren't pulled again. None if it can't be asked: then each is pulled.
  const onRuntime =
    remote && imageStore !== null
      ? await deps.runtimeDocker.imagesIn(imageStore.repository).catch((error: unknown) => {
          log.info({ error: error instanceof Error ? error.message : String(error) }, "couldn't list the runtime's images: each prerun image is pulled");
          return new Set<string>();
        })
      : new Set<string>();
  // Asked of the registry for every image at once, rather than as each one's turn comes.
  const inStore = new Map(images.flatMap(({ storedPrerunImage }) => (storedPrerunImage === undefined ? [] : [[storedPrerunImage, deps.hostDocker.inRegistry(storedPrerunImage)] as const])));
  for (const answer of inStore.values()) answer.catch(() => {});

  const ensure = async (permutation: PlannedPermutation) => {
    const { prerunImage: image, storedPrerunImage: reference } = permutation;
    const buildIfMissing = async () => {
      if (built.has(image)) return;
      setImage(deps, image, "building");
      logEvent(deps, { type: "image", image, step: "building" });
      try {
        await timed(deps, "build", () => build(manifest, permutation, deps));
      } catch (error) {
        setImage(deps, image, "failed");
        logEvent(deps, { type: "image", image, step: "buildFailed" });
        // So the error names the image, whatever threw it.
        throw error instanceof DockerBuildError && error.image === "" ? new DockerBuildError(error.message, image) : error;
      }
      logEvent(deps, { type: "image", image, step: "built" });
    };
    if (reference === undefined) {
      await buildIfMissing();
      setImage(deps, image, "ready");
      return;
    }
    // Its tag is its content's hash, so if the image store has it, from an earlier execution on this
    // machine or another, it isn't pushed again. Nor built, for a remote runtime: it needs it only there.
    const stored = await (inStore.get(reference) as Promise<boolean>);
    if (stored && remote) {
      log.info({ image, reference }, "prerun image already in the image store: not built or pushed");
      if (onRuntime.has(reference)) {
        log.info({ reference }, "prerun image already in the runtime: not pulled");
      } else {
        // So a runtime that can't reach the image store, or has no login for it, fails before its agent runs.
        setImage(deps, image, "pulling");
        logEvent(deps, { type: "image", image, reference, step: "pulling" });
        try {
          await timed(deps, "pullPrerun", () => deps.runtimeDocker.pull(reference));
        } catch (error) {
          setImage(deps, image, "failed");
          logEvent(deps, { type: "image", image, reference, step: "pullFailed" });
          throw error instanceof DockerPullError && error.reference === "" ? new DockerPullError(error.message, reference) : error;
        }
        logEvent(deps, { type: "image", image, reference, step: "pulled" });
      }
    } else {
      // Built on, and pushed from, the runtime's daemon: it never leaves it. Pushing tags it there as `reference`.
      await buildIfMissing();
      if (stored) {
        log.info({ image, reference }, "prerun image already in the image store: not pushed");
      } else {
        logEvent(deps, { type: "image", image, reference, step: "pushing" });
        try {
          await timed(deps, "pushPrerun", () => deps.runtimeDocker.push(image, reference));
        } catch (error) {
          setImage(deps, image, "failed");
          logEvent(deps, { type: "image", image, reference, step: "pushFailed" });
          throw error instanceof DockerPushError && error.reference === "" ? new DockerPushError(error.message, reference) : error;
        }
        logEvent(deps, { type: "image", image, reference, step: "pushed" });
      }
    }
    setImage(deps, image, "ready");
  };

  await inParallel(
    // Once the process is asked to stop, no more start: nothing will run from them.
    images.map((permutation) => () => (deps.state.get().run.details?.stopRequested === undefined ? ensure(permutation) : Promise.resolve())),
    manifest.config.build.concurrency,
  );
}
