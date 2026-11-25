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

import { describe, expect, it } from "bun:test";
import { AN_IMAGE_STORE, aManifest, aTestCaseConfig, EXECUTION_ID, fakeDependencies, START_TIME } from "./testSupport.ts";

describe("aTestCaseConfig and aManifest", () => {
  it("give a small test case: two permutations, two iterations each, nothing remote", () => {
    const manifest = aManifest();

    expect(aTestCaseConfig().permutations).toHaveLength(2);
    expect(manifest).toMatchObject({ executionId: EXECUTION_ID, testCase: "example", task: "greet", concurrency: 1, imageStore: null, remote: false });
    expect(manifest.runs.map((run) => `${run.permutation}/${run.iteration}`)).toEqual(["1/1", "1/2", "2/1", "2/2"]);
    expect(manifest.images.map((image) => image.runFrom)).toEqual(["thunderjar-prerun:AAAAAAAA", "thunderjar-prerun:BBBBBBBB"]);
  });

  it("take overrides of the config, planned, and of the manifest, as given", () => {
    const manifest = aManifest({ concurrency: 3 }, { imageStore: AN_IMAGE_STORE, name: "other" });

    expect(manifest).toMatchObject({ concurrency: 3, testCase: "other", imageStore: AN_IMAGE_STORE });
    expect(manifest.images[0]?.stored).toBe("registry.example/acme/images:prerun-hAAAAAAAA");
  });
});

describe("fakeDependencies", () => {
  it("gives two Dockers over one registry", async () => {
    const { hostDocker, runtimeDocker, registry } = fakeDependencies();
    runtimeDocker.addImage("box");

    await runtimeDocker.push("box", "registry.example/box:1");

    expect(hostDocker).not.toBe(runtimeDocker);
    expect(await hostDocker.inRegistry("registry.example/box:1")).toBe(true);
    expect(registry.references()).toEqual(["registry.example/box:1"]);
    expect(hostDocker.images()).toEqual([]);
  });

  it("gives `deps` the same fakes it returns, on a clock that starts at START_TIME", async () => {
    const fakes = fakeDependencies({ env: { variables: { KEY: "value" }, concurrency: 2 } });

    expect(fakes.deps.clock.now()).toBe(START_TIME);
    expect(fakes.deps.runtimeDocker).toBe(fakes.runtimeDocker);
    expect(fakes.deps.state).toBe(fakes.state);
    expect((await fakes.deps.stores.open()).store).toBe(fakes.store);
    expect(fakes.deps.env).toMatchObject({ variables: { KEY: "value" }, concurrency: 2, uploadBacklogCap: 4, tmpDir: "/tmp" });
  });
});
