/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiApELUXheYNb6d7F3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// Making sure every prerun image the manifest's runs start from is where they start: built if it
// is missing, pushed to the image store, pulled into a remote runtime. The host's Docker only
// checks (the login, what the registry has); the runtime's builds, pushes and pulls.
//
//   no image store         on the runtime already? ready. Else built there.
//   store has it, remote   pulled into the runtime, unless it is there.
//   otherwise              built on the runtime if it lacks it, then pushed from there unless the
//                          store has it. The push tags it with its stored name, so a remote
//                          runtime needs no pull.
//
// Each image is built from a build context assembled in a fresh temporary folder, outside the
// project, and removed afterwards, whether or not the build succeeds:
//
//   Dockerfile
//   parameters/<role>/     each folder parameter's files/ folder. Its index.ts, and anything else
//                          beside files/, is never copied.
import { FILES } from "../../config/folders.ts";
import { registryHost } from "../../config/projectConfig.ts";
import { moduleLogger } from "../../log/logger.ts";
import { type ImageBuildStatus, setImageStatus, updateRun } from "../../services/ApplicationState/ApplicationState.ts";
import { DockerLoginError } from "../../services/Docker/errors.ts";
import { ImageStoreLoginError } from "../imageStore.ts";
import { prerunRepository } from "../images.ts";
import { createRunControl, type RunControl } from "./runControl.ts";
import { timed } from "./timed.ts";
import type { Dependencies, Manifest, PlannedImage } from "./types.ts";

const log = moduleLogger("images");

type EnsureImagesDeps = Pick<Dependencies, "hostDocker" | "runtimeDocker" | "fs" | "env" | "random" | "state" | "clock">;

/**
 * Leaves every image of `manifest.images` ready to start containers from, up to
 * `manifest.buildConcurrency` at once, writing each one's status to the state under its `runFrom`.
 *
 * Throws an ImageStoreLoginError if Docker has no login for the image store's registry, before
 * anything else is done; and whatever Docker throws: a DockerUnavailableError, DockerBuildError,
 * DockerPushError or DockerPullError. After the first failure no other image is started, those
 * under way finish, and that first error is rethrown.
 *
 * Once `control` is asked to stop, no other image is started either: those under way finish, and
 * it returns with the rest not ready.
 */
export async function ensureImages(manifest: Manifest, deps: EnsureImagesDeps, control: RunControl = createRunControl()): Promise<void> {
  const { hostDocker, runtimeDocker, state } = deps;
  const repository = manifest.imageStore?.repository;
  if (repository !== undefined) await checkLogin(repository, hostDocker);
  if (manifest.images.length === 0 || control.shouldStop()) return;

  // Each list is asked for once, not per image.
  const built = await runtimeDocker.imagesIn(prerunRepository(manifest.imagePrefix));
  // If a remote runtime can't say which stored images it has, each is pulled: a pull of one it has is quick.
  const pulled =
    repository !== undefined && manifest.remote
      ? await runtimeDocker.imagesIn(repository).catch((error: unknown) => {
          log.info({ error: messageOf(error) }, "couldn't list the runtime's images: each prerun image is pulled");
          return new Set<string>();
        })
      : new Set<string>();

  const setStatus = (image: PlannedImage, status: ImageBuildStatus) => state.update(updateRun((run) => setImageStatus(run, image.runFrom, status)));

  const build = async (image: PlannedImage) => {
    setStatus(image, "building");
    const dir = `${deps.env.tmpDir}/thunderjar-build-${deps.random.uuid()}`;
    try {
      // A parameter with no files/ copies nothing.
      for (const { from, to } of image.context) await deps.fs.copyDir(`${manifest.root}/${from}/${FILES}`, `${dir}/${to}`);
      await deps.fs.write(`${dir}/Dockerfile`, image.dockerfile);
      await timed(deps, "build", () => runtimeDocker.build(dir, image.image, manifest.build));
    } finally {
      await deps.fs.removeDir(dir);
    }
  };

  const ensure = async (image: PlannedImage) => {
    setStatus(image, "checking");
    if (image.stored === undefined) {
      if (!built.has(image.image)) await build(image);
      return;
    }
    const reference = image.stored;
    // Its tag is its content's hash: if the store has it, from any machine, it is never pushed again.
    const stored = await hostDocker.inRegistry(reference);
    if (stored && manifest.remote) {
      if (pulled.has(reference)) return;
      setStatus(image, "pulling");
      // So a runtime that can't reach the store, or has no login for it, fails here, before any agent runs.
      await timed(deps, "pullPrerun", () => runtimeDocker.pull(reference));
      return;
    }
    if (!built.has(image.image)) await build(image);
    if (!stored) {
      setStatus(image, "building");
      await timed(deps, "pushPrerun", () => runtimeDocker.push(image.image, reference));
    }
  };

  let failure: { error: unknown } | undefined;
  let next = 0;
  const worker = async () => {
    while (failure === undefined && !control.shouldStop()) {
      const image = manifest.images[next++];
      if (image === undefined) return;
      try {
        await ensure(image);
        setStatus(image, "ready");
        log.info({ image: image.runFrom }, "prerun image ready");
      } catch (error) {
        setStatus(image, "failed");
        log.error({ image: image.runFrom, error: messageOf(error) }, "prerun image failed");
        failure ??= { error };
      }
    }
  };
  const workers = Math.max(1, Math.min(manifest.buildConcurrency, manifest.images.length));
  await Promise.all(Array.from({ length: workers }, worker));
  if (failure !== undefined) throw failure.error;
}

/** Checks, on the host, that Docker holds a valid login for `repository`'s registry: found here, not after the agents have run. */
async function checkLogin(repository: string, hostDocker: Dependencies["hostDocker"]): Promise<void> {
  const host = registryHost(repository);
  try {
    await hostDocker.checkLogin(host);
  } catch (error) {
    if (error instanceof DockerLoginError) throw new ImageStoreLoginError(repository, host, error.message);
    throw error;
  }
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
