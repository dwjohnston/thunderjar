import { Command } from "commander";
import { findThunderjarRoot } from "../../../config/loader.ts";
import { loadProjectConfig } from "../../../config/projectConfig.ts";
import { DockerBuildError, DockerPullError, DockerPushError, DockerUnavailableError } from "../../../docker/docker.ts";
import { checkImageStore, ImageStoreLoginError } from "../../../execution/imageStore.ts";
import { probeRuntime } from "../../../execution/runtimeProbe.ts";
import { reportingConfigErrors } from "../../configErrors.ts";
import { type WaitingLine, waitingLine } from "../../waitingLine.ts";

const STEP_LABEL = { build: "Building", push: "Pushing", pull: "Pulling through the runtime" } as const;

/**
 * Checks the setup of the nearest `.thunderjar/` folder in `cwd` or above it: that its config
 * loads, that Docker can be reached and has a login for the image store's registry, and, with a
 * runtime, that a probe image pushed to the image store can be pulled through the runtime.
 * Exits 1, saying why, at the first check that fails.
 */
async function doctor(cwd: string): Promise<void> {
  const root = await findThunderjarRoot(cwd);
  const { imageStore, runtime } = await loadProjectConfig(root);
  console.log("Config ... ok");
  // The line that's waiting for how its check ends.
  let line: WaitingLine | undefined;
  try {
    if (imageStore === null) {
      console.log("Image store ... none: images stay in the local Docker daemon");
    } else {
      line = waitingLine(`Docker login for ${imageStore.repository} ... `);
      await checkImageStore(imageStore);
      line.finish("ok");
      line = undefined;
    }
    if (runtime === null || imageStore === null) {
      console.log("Runtime ... none: containers run on the local Docker daemon");
      return;
    }
    console.log(`Runtime: \`${runtime.command.join(" ")}\``);
    await probeRuntime(imageStore, runtime, {
      onStep: (s, target) => {
        line = waitingLine(`  ${STEP_LABEL[s]} ${target} ... `);
      },
      onStepDone: () => {
        line?.finish("ok");
        line = undefined;
      },
    });
    console.log("The runtime can run images from the image store.");
  } catch (error) {
    line?.fail();
    if (error instanceof DockerUnavailableError) {
      console.error(`Error: Docker can't be reached: ${error.message}`);
    } else if (error instanceof ImageStoreLoginError) {
      console.error(`Error: ${error.message}`);
    } else if (error instanceof DockerBuildError) {
      console.error(`Error: Building the probe image failed: ${error.message}`);
    } else if (error instanceof DockerPushError) {
      console.error(`Error: Pushing the probe image to the image store failed: ${error.message}`);
    } else if (error instanceof DockerPullError) {
      console.error(
        `Error: The runtime couldn't pull from the image store: ${error.message}\nMake sure the runtime can reach the registry and is logged in to it.`,
      );
    } else {
      throw error;
    }
    process.exitCode = 1;
  } finally {
    line?.stop();
  }
}

export function createDoctorCommand(): Command {
  return new Command("doctor")
    .description(
      "Check the project's setup: that thunderjar.config.ts loads, that Docker has a login for the image store's registry, and, with a runtime, that it can pull from the image store: a tiny probe image is built and pushed locally, then pulled through the runtime.",
    )
    .action(reportingConfigErrors(async () => doctor(process.cwd())));
}
