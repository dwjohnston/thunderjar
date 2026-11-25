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

// The real Measurer: the part of a run that needs the project's own code. Its harness's
// collectors read the reply and the token costs out of the result file; its task's measurements
// are taken of the committed postrun image. A declaration is loaded once, however many runs use it.
import type { HarnessDeclaration, Reply, TokenCostCollector } from "../../api/declarations.ts";
import { PARAMETERS } from "../../config/folders.ts";
import { loadDeclaration, type Problem, problemsError } from "../../config/loader.ts";
import { loadMeasurements, type Measurement } from "../../config/measurements.ts";
import { moduleLogger } from "../../log/logger.ts";
import type { Clock } from "../../services/Clock/Clock.ts";
import type { DockerService } from "../../services/Docker/Docker.ts";
import { measureContainerRun } from "../measure.ts";
import { openMeasurementContext, recordedContext } from "../measurementContext.ts";
import { collectReply } from "../reply.ts";
import { collectTokenCosts } from "../tokenCosts.ts";
import type { Measurer } from "./types.ts";

const log = moduleLogger("measure");

/** What a harness that declares no `collectTokenCosts` gives. */
const NOT_REPORTED: TokenCostCollector = () => ({ outcome: "unavailable", reason: "notReported" });

/**
 * A Measurer that takes measurements in containers on `docker`, where the postrun images are: the
 * runtime's. `clock` dates each measure.
 *
 * `collect` throws a ConfigError if the harness's declaration can't be loaded. `measure` throws a
 * ConfigError if the task's measurements are wrong, and a DockerContainerError if a measurement
 * container can't be started; an instrument that fails is that measure's outcome, not an error.
 */
export function createMeasurer({ docker, clock }: { docker: Pick<DockerService, "openShellSession">; clock: Pick<Clock, "now"> }): Measurer {
  // By file, the promise itself: runs at once share one load.
  const harnesses = new Map<string, Promise<HarnessDeclaration>>();
  const measurements = new Map<string, Promise<Measurement[]>>();

  const harnessOf = (root: string, name: string): Promise<HarnessDeclaration> => {
    const key = `${root}\n${name}`;
    const loading = harnesses.get(key) ?? loadHarness(root, name);
    harnesses.set(key, loading);
    return loading;
  };
  const measurementsOf = (root: string, task: string): Promise<Measurement[]> => {
    const key = `${root}\n${task}`;
    const loading = measurements.get(key) ?? loadMeasurements(root, task);
    measurements.set(key, loading);
    return loading;
  };

  return {
    async collect({ root, harness }, harnessResult) {
      const declaration = await harnessOf(root, harness.name);
      return {
        reply: collectReply(declaration.collectReply, harnessResult),
        tokenCosts: collectTokenCosts(declaration.collectTokenCosts ?? NOT_REPORTED, [harnessResult], { version: harness.version, modelId: harness.modelId }),
      };
    },

    async measure({ root, task, postrunImage, container, secretEnv }, { harnessResult, reply }) {
      const taken = await measurementsOf(root, task);
      if (taken.length === 0) return {};
      const recorded = { harnessResult: harnessResult ?? "", reply: reply as Reply, replies: [reply as Reply] };
      let opened = 0;
      // One measurement container for all that need one: on a remote runtime, each takes seconds to start.
      const open = async (usesContainer: boolean) =>
        usesContainer ? openMeasurementContext(postrunImage, `${container}-measure-${++opened}`, recorded, docker, secretEnv) : recordedContext(recorded);
      const startedAt = clock.now();
      const result = await measureContainerRun(taken, open, () => new Date(clock.now()));
      log.info({ container, ms: clock.now() - startedAt, containers: opened, result }, "measured");
      return result;
    },
  };
}

/** The declaration of the harness `name` of the project at `root`. Throws a ConfigError if it can't be loaded. */
async function loadHarness(root: string, name: string): Promise<HarnessDeclaration> {
  const problems: Problem[] = [];
  const declaration = (await loadDeclaration(root, `${PARAMETERS}/harnessModels/${name}/index.ts`, "declareHarness", problems)) as HarnessDeclaration | undefined;
  if (declaration === undefined) throw problemsError(problems);
  return declaration;
}
