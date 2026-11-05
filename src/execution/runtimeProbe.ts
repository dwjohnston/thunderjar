// Checking that a runtime can run images from the image store, before a long run finds out it
// can't: a tiny probe image is built and pushed locally, then pulled through the runtime.
import type { ImageStore, RuntimeConfig } from "../api/declarations.ts";
import { buildImage, pullImage, pushImage, remoteRuntime } from "../docker/docker.ts";

/** The local image the probe is built as. */
export const PROBE_IMAGE = "thunderjar-doctor:probe";

/** Where the probe is pushed, and pulled from: `<repository>:thunderjar-doctor`. */
export const probeReference = (repository: string) => `${repository}:thunderjar-doctor`;

/** The probe's Dockerfile: one small file, so every registry takes it. */
export const PROBE_DOCKERFILE = "FROM scratch\nCOPY probe.txt /probe.txt\n";

export type ProbeHooks = {
  /** Called as each step starts: `build`, `push`, then `pull`, with the image or reference. */
  onStep?: (step: "build" | "push" | "pull", target: string) => void;
  /** Called as each step succeeds. */
  onStepDone?: (step: "build" | "push" | "pull", target: string) => void;
};

/**
 * Builds the probe locally, pushes it to `imageStore`, and pulls it through `runtime`. Throws a
 * DockerBuildError, DockerPushError or DockerPullError for the step that fails.
 */
export async function probeRuntime(imageStore: ImageStore, runtime: RuntimeConfig, hooks: ProbeHooks = {}): Promise<void> {
  const reference = probeReference(imageStore.repository);
  const contextDir = `${Bun.env.TMPDIR || "/tmp"}/thunderjar-probe-${crypto.randomUUID()}`;
  await Bun.write(`${contextDir}/Dockerfile`, PROBE_DOCKERFILE);
  await Bun.write(`${contextDir}/probe.txt`, "thunderjar doctor\n");
  try {
    hooks.onStep?.("build", PROBE_IMAGE);
    await buildImage(contextDir, PROBE_IMAGE);
    hooks.onStepDone?.("build", PROBE_IMAGE);
  } finally {
    await Bun.$`rm -rf ${contextDir}`.quiet();
  }
  hooks.onStep?.("push", reference);
  await pushImage(PROBE_IMAGE, reference);
  hooks.onStepDone?.("push", reference);
  hooks.onStep?.("pull", reference);
  await pullImage(reference, remoteRuntime(runtime.command));
  hooks.onStepDone?.("pull", reference);
}
