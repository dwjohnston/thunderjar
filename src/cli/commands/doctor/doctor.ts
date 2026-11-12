import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerBuildError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { checkImageStore, ImageStoreLoginError } from "../../../execution/imageStore.ts";
import { probeRuntime } from "../../../execution/runtimeProbe.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { jsonOption } from "../../json.ts";
import { print, printError, printJson } from "../../output.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";

const STEP_LABEL = { build: "Building", push: "Pushing", pull: "Pulling through the runtime" } as const;

/** One of doctor's checks, as `--json` prints it: `none` if there's nothing to check. */
export type DoctorCheck = {
  check: "config" | "imageStore" | "runtime";
  status: "ok" | "none" | "failed";
  /** The image store's repository, or the runtime's command. */
  target?: string;
  /** Why it failed. */
  error?: string;
};

/** Why `error`, thrown by a check, failed it, or undefined if it isn't a failed check. */
function failure(error: unknown): string | undefined {
  if (error instanceof DockerUnavailableError) return `Docker can't be reached: ${error.message}`;
  if (error instanceof ImageStoreLoginError) return error.message;
  if (error instanceof DockerBuildError) return `Building the probe image failed: ${error.message}`;
  if (error instanceof DockerPushError) return `Pushing the probe image to the image store failed: ${error.message}`;
  if (error instanceof DockerPullError) {
    return `The runtime couldn't pull from the image store: ${error.message}\nMake sure the runtime can reach the registry and is logged in to it.`;
  }
  return undefined;
}

/**
 * Checks the setup of the nearest `.thunderjar/` folder in `cwd` or above it: that its config
 * loads, that Docker can be reached and has a login for the image store's registry, and, with a
 * runtime, that a probe image pushed to the image store can be pulled through the runtime.
 * Exits 1, saying why, at the first check that fails. With `json`, prints each check as JSON
 * once it's done, `{ ok, checks }`, the failed one with its error, which is also written to stderr.
 */
async function doctor(cwd: string, json = false): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { imageStore, runtime } = await loadProjectConfig(root);
  const checks: DoctorCheck[] = [{ check: "config", status: "ok" }];
  print("Config ... ok");
  // The line that's waiting for how its check ends.
  let line: WaitingLine | undefined;
  // The check that's going, so a failure is put down to it.
  let current: DoctorCheck | undefined;
  try {
    if (imageStore === null) {
      checks.push({ check: "imageStore", status: "none" });
      print("Image store ... none: images stay in the local Docker daemon");
    } else {
      current = { check: "imageStore", status: "ok", target: imageStore.repository };
      line = waitingLine(`Docker login for ${imageStore.repository} ... `);
      await checkImageStore(imageStore);
      line.finish("ok");
      line = undefined;
      checks.push(current);
      current = undefined;
    }
    if (runtime === null || imageStore === null) {
      checks.push({ check: "runtime", status: "none" });
      print("Runtime ... none: containers run on the local Docker daemon");
      return;
    }
    current = { check: "runtime", status: "ok", target: runtime.command.join(" ") };
    print(`Runtime: \`${runtime.command.join(" ")}\``);
    await probeRuntime(imageStore, runtime, {
      onStep: (s, target) => {
        line = waitingLine(`  ${STEP_LABEL[s]} ${target} ... `);
      },
      onStepDone: () => {
        line?.finish("ok");
        line = undefined;
      },
    });
    checks.push(current);
    current = undefined;
    print("The runtime can run images from the image store.");
  } catch (error) {
    line?.fail();
    const message = failure(error);
    if (message === undefined) throw error;
    printError(message);
    if (current !== undefined) checks.push({ ...current, status: "failed", error: message });
    process.exitCode = 1;
  } finally {
    line?.stop();
    if (json) printJson({ ok: checks.every(({ status }) => status !== "failed"), checks });
  }
}

export function createDoctorCommand(): Command {
  return new Command("doctor")
    .description(
      "Check the project's setup: that thunderjar.config.ts loads, that Docker has a login for the image store's registry, and, with a runtime, that it can pull from the image store: a tiny probe image is built and pushed locally, then pulled through the runtime.",
    )
    .addOption(jsonOption())
    .action(reportingConfigErrors(async (options: { json?: boolean }) => doctor(process.cwd(), options.json)));
}
