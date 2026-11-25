import { createClockService } from "../services/Clock/Clock.ts";
import { describe, expect, test } from "bun:test";
import { createDockerService } from "./cliDocker.ts";
import { DockerContainerError, DockerUnavailableError } from "./docker.ts";

describe(createDockerService, () => {
    test("Its methods run on the runtime it was built with", async () => {
        const docker = createDockerService(createClockService(), { command: ["false"], pull: "never" });

        await expect(docker.imagesIn("example")).rejects.toThrow(DockerUnavailableError);
        await expect(docker.removeContainer("example-container")).rejects.toThrow(new DockerContainerError("`false rm` exited 1"));
    });
});
