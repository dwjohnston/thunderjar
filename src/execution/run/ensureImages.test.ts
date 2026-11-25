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
import { DockerBuildError, DockerUnavailableError } from "../../services/Docker/errors.ts";
import { ImageStoreLoginError } from "../imageStore.ts";
import { ensureImages } from "./ensureImages.ts";
import { A_RUNTIME, AN_IMAGE_STORE, aManifest, aPermutation, type FakeDependencies, fakeDependencies } from "./testSupport.ts";
import type { Manifest } from "./types.ts";

// aManifest() needs two images, of permutations `a` and `b`.
const IMAGE_A = "thunderjar-prerun:AAAAAAAA";
const IMAGE_B = "thunderjar-prerun:BBBBBBBB";
const STORED_A = "registry.example/acme/images:prerun-hAAAAAAAA";
const STORED_B = "registry.example/acme/images:prerun-hBBBBBBBB";

const withStore = (overrides: Partial<Manifest> = {}) => aManifest(overrides, { imageStore: AN_IMAGE_STORE });
const remote = (overrides: Partial<Manifest> = {}) => aManifest(overrides, { imageStore: AN_IMAGE_STORE, runtime: A_RUNTIME });

/** The methods called on a FakeDocker, each once, sorted. */
const methodsOf = (docker: FakeDependencies["hostDocker"]) => [...new Set(docker.calls.map((call) => call.method))].sort();

/** Each status `reference` went through, in order. */
const statusesOf = (fakes: FakeDependencies, reference: string) =>
  fakes.state
    .history()
    .map((state) => state.run.images[reference])
    .filter((status, index, all) => status !== undefined && status !== all[index - 1]);

describe("ensureImages with no image store", () => {
  it("builds nothing the runtime already has", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage(IMAGE_A).addImage(IMAGE_B);

    await ensureImages(aManifest(), fakes.deps);

    expect(fakes.runtimeDocker.builds).toEqual([]);
    expect(fakes.hostDocker.calls).toEqual([]);
    expect(fakes.state.get().run.images).toEqual({ [IMAGE_A]: "ready", [IMAGE_B]: "ready" });
  });

  it("builds each missing image on the runtime, with the manifest's build options", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage(IMAGE_B);
    const manifest = aManifest({ build: { secrets: [{ id: "npm", env: "NPM_TOKEN" }], ssh: true } });

    await ensureImages(manifest, fakes.deps);

    expect(fakes.runtimeDocker.builds).toEqual([
      { contextDir: expect.stringMatching(/^\/tmp\/thunderjar-build-[0-9a-f-]{36}$/), image: IMAGE_A, options: { secrets: [{ id: "npm", env: "NPM_TOKEN" }], ssh: true } },
    ]);
    expect(fakes.runtimeDocker.images()).toContain(IMAGE_A);
    expect(fakes.hostDocker.calls).toEqual([]);
    expect(statusesOf(fakes, IMAGE_A)).toEqual(["checking", "building", "ready"]);
    expect(statusesOf(fakes, IMAGE_B)).toEqual(["checking", "ready"]);
  });

  it("gives the build a fresh folder holding the Dockerfile and each parameter's files, and removes it afterwards", async () => {
    const fakes = fakeDependencies({ env: { tmpDir: "/scratch" } });
    await fakes.fs.write("/project/.thunderjar/parameters/baseImages/node/files/setup.sh", "echo setup");
    await fakes.fs.write("/project/.thunderjar/parameters/codeStates/empty/files/src/.keep", "");
    // Beside files/, so never copied.
    await fakes.fs.write("/project/.thunderjar/parameters/codeStates/empty/index.ts", "export default {}");
    fakes.runtimeDocker.addImage(IMAGE_B).takes("build", 1_000);

    const ensuring = ensureImages(aManifest(), fakes.deps);
    await fakes.clock.advance(500);
    const dir = fakes.runtimeDocker.builds[0]?.contextDir as string;
    const during = Object.fromEntries(Object.entries(fakes.fs.files()).filter(([path]) => path.startsWith("/scratch/")));
    await fakes.clock.advance(500);
    await ensuring;

    expect(dir.startsWith("/scratch/thunderjar-build-")).toBe(true);
    expect(during).toEqual({
      [`${dir}/Dockerfile`]: "FROM node\n# a\n",
      [`${dir}/parameters/baseImage/setup.sh`]: "echo setup",
      [`${dir}/parameters/codeState/src/.keep`]: "",
    });
    expect(Object.keys(fakes.fs.files()).filter((path) => path.startsWith("/scratch/"))).toEqual([]);
    expect(await fakes.fs.isDirectory(dir)).toBe(false);
  });

  it("can't go on if the runtime can't say which images it has", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.failOn("imagesIn", new DockerUnavailableError("the daemon is down"));

    await expect(ensureImages(aManifest(), fakes.deps)).rejects.toBeInstanceOf(DockerUnavailableError);
    expect(fakes.runtimeDocker.builds).toEqual([]);
  });
});

describe("ensureImages with an image store, containers on the host", () => {
  it("checks the login on the host first, then builds and pushes on the runtime what the store lacks", async () => {
    const fakes = fakeDependencies();

    await ensureImages(withStore(), fakes.deps);

    expect(fakes.hostDocker.calls[0]).toEqual({ method: "checkLogin", args: ["registry.example"] });
    expect(methodsOf(fakes.hostDocker)).toEqual(["checkLogin", "inRegistry"]);
    expect(fakes.hostDocker.called("inRegistry")).toEqual([[STORED_A], [STORED_B]]);
    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A, IMAGE_B]);
    expect(fakes.runtimeDocker.called("push")).toEqual([
      [IMAGE_A, STORED_A],
      [IMAGE_B, STORED_B],
    ]);
    expect(fakes.runtimeDocker.called("pull")).toEqual([]);
    expect(fakes.registry.references()).toEqual([STORED_A, STORED_B]);
    // Containers start from the local name, so that is the one whose status is kept.
    expect(fakes.state.get().run.images).toEqual({ [IMAGE_A]: "ready", [IMAGE_B]: "ready" });
  });

  it("builds an image the store has but the runtime lacks, and doesn't push it again", async () => {
    const fakes = fakeDependencies();
    fakes.registry.add(STORED_A).add(STORED_B);
    fakes.runtimeDocker.addImage(IMAGE_B);

    await ensureImages(withStore(), fakes.deps);

    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A]);
    expect(fakes.runtimeDocker.called("push")).toEqual([]);
    expect(fakes.runtimeDocker.called("pull")).toEqual([]);
  });

  it("pushes an image the runtime has but the store lacks, without building it", async () => {
    const fakes = fakeDependencies();
    fakes.registry.add(STORED_B);
    fakes.runtimeDocker.addImage(IMAGE_A).addImage(IMAGE_B);

    await ensureImages(withStore(), fakes.deps);

    expect(fakes.runtimeDocker.builds).toEqual([]);
    expect(fakes.runtimeDocker.called("push")).toEqual([[IMAGE_A, STORED_A]]);
  });

  it("stops before anything is built if Docker has no login for the registry", async () => {
    const fakes = fakeDependencies();
    fakes.hostDocker.logOut("registry.example");

    const failure = await ensureImages(withStore(), fakes.deps).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ImageStoreLoginError);
    expect((failure as ImageStoreLoginError).message).toContain("Run `docker login registry.example`");
    expect(fakes.runtimeDocker.calls).toEqual([]);
    expect(fakes.state.get().run.images).toEqual({});
  });

  it("lets any other failure of the login check through as it is", async () => {
    const fakes = fakeDependencies();
    fakes.hostDocker.failOn("checkLogin", new DockerUnavailableError("the daemon is down"));

    await expect(ensureImages(withStore(), fakes.deps)).rejects.toBeInstanceOf(DockerUnavailableError);
  });
});

describe("ensureImages with an image store, containers on a remote runtime", () => {
  it("pulls into the runtime what the store has, and builds nothing", async () => {
    const fakes = fakeDependencies();
    fakes.registry.add(STORED_A).add(STORED_B);

    await ensureImages(remote(), fakes.deps);

    expect(fakes.runtimeDocker.called("pull")).toEqual([[STORED_A], [STORED_B]]);
    expect(fakes.runtimeDocker.builds).toEqual([]);
    expect(fakes.runtimeDocker.called("push")).toEqual([]);
    expect(methodsOf(fakes.hostDocker)).toEqual(["checkLogin", "inRegistry"]);
    // On a remote runtime containers start from the stored name.
    expect(statusesOf(fakes, STORED_A)).toEqual(["checking", "pulling", "ready"]);
    expect(fakes.runtimeDocker.images()).toEqual([STORED_A, STORED_B]);
  });

  it("pulls nothing the runtime already has", async () => {
    const fakes = fakeDependencies();
    fakes.registry.add(STORED_A).add(STORED_B);
    fakes.runtimeDocker.addImage(STORED_A);

    await ensureImages(remote(), fakes.deps);

    expect(fakes.runtimeDocker.called("pull")).toEqual([[STORED_B]]);
    expect(statusesOf(fakes, STORED_A)).toEqual(["checking", "ready"]);
  });

  it("builds and pushes on the runtime what the store lacks, which leaves it there under its stored name: no pull", async () => {
    const fakes = fakeDependencies();
    fakes.registry.add(STORED_B);

    await ensureImages(remote(), fakes.deps);

    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A]);
    expect(fakes.runtimeDocker.called("push")).toEqual([[IMAGE_A, STORED_A]]);
    expect(fakes.runtimeDocker.called("pull")).toEqual([[STORED_B]]);
    expect(fakes.runtimeDocker.images()).toContain(STORED_A);
    expect(fakes.hostDocker.called("build")).toEqual([]);
    expect(statusesOf(fakes, STORED_A)).toEqual(["checking", "building", "ready"]);
  });

  it("pulls each image if the runtime can't list the ones it has", async () => {
    const fakes = fakeDependencies();
    fakes.registry.add(STORED_A).add(STORED_B);
    fakes.runtimeDocker.addImage(STORED_A);
    // Only the store's repository: the list of locally built images still has to work.
    const imagesIn = fakes.runtimeDocker.imagesIn.bind(fakes.runtimeDocker);
    fakes.runtimeDocker.imagesIn = async (repository) => {
      if (repository === AN_IMAGE_STORE.repository) throw new DockerUnavailableError("the daemon is busy");
      return imagesIn(repository);
    };

    await ensureImages(remote(), fakes.deps);

    expect(fakes.runtimeDocker.called("pull")).toEqual([[STORED_A], [STORED_B]]);
  });
});

describe("ensureImages: how many at once, and failing", () => {
  const three = (overrides: Partial<Manifest> = {}, buildConcurrency = 1) =>
    aManifest(overrides, { permutations: [aPermutation("a"), aPermutation("b"), aPermutation("c")], build: { secrets: [], ssh: false, concurrency: buildConcurrency } });
  const IMAGE_C = "thunderjar-prerun:CCCCCCCC";

  it("builds one at a time by default", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.takes("build", 1_000);

    const ensuring = ensureImages(three(), fakes.deps);
    await fakes.clock.advance(1_500);

    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A, IMAGE_B]);
    expect(fakes.state.get().run.images).toEqual({ [IMAGE_A]: "ready", [IMAGE_B]: "building" });
    await fakes.clock.advance(2_000);
    await ensuring;
    expect(fakes.state.get().run.images).toEqual({ [IMAGE_A]: "ready", [IMAGE_B]: "ready", [IMAGE_C]: "ready" });
  });

  it("builds up to the manifest's buildConcurrency at once", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.takes("build", 1_000);

    const ensuring = ensureImages(three({}, 2), fakes.deps);
    await fakes.clock.advance(500);

    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A, IMAGE_B]);
    await fakes.clock.advance(1_500);
    await ensuring;
    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A, IMAGE_B, IMAGE_C]);
  });

  it("builds a shared image once", async () => {
    const fakes = fakeDependencies();
    const manifest = aManifest({}, { permutations: [aPermutation("a"), aPermutation("b", { imageHash: "A".repeat(64) })] });

    await ensureImages(manifest, fakes.deps);

    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A]);
  });

  it("after a failure starts no other image, marks the image failed, removes its folder and rethrows", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.failBuild(IMAGE_A, "step 3 failed");

    const failure = await ensureImages(three(), fakes.deps).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DockerBuildError);
    expect((failure as Error).message).toContain("step 3 failed");
    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A]);
    expect(fakes.state.get().run.images).toEqual({ [IMAGE_A]: "failed" });
    expect(fakes.fs.files()).toEqual({});
  });

  it("lets the images already going finish before it rethrows the first failure", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.takes("build", 1_000).takes("push", 1_000).failBuild(IMAGE_A, "step 3 failed");
    const manifest = aManifest({}, { imageStore: AN_IMAGE_STORE, permutations: [aPermutation("a"), aPermutation("b"), aPermutation("c")], build: { secrets: [], ssh: false, concurrency: 2 } });
    let settled = false;

    const ensuring = ensureImages(manifest, fakes.deps).catch((error: unknown) => {
      settled = true;
      return error;
    });
    // A's build has failed; B is built and is being pushed.
    await fakes.clock.advance(1_500);
    expect(settled).toBe(false);
    await fakes.clock.advance(1_000);

    expect(await ensuring).toBeInstanceOf(DockerBuildError);
    expect(fakes.registry.references()).toEqual([STORED_B]);
    expect(fakes.runtimeDocker.builds.map((build) => build.image)).toEqual([IMAGE_A, IMAGE_B]);
    expect(fakes.state.get().run.images).toEqual({ [IMAGE_A]: "failed", [IMAGE_B]: "ready" });
  });

  it("marks an image failed when its push fails", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.failPush(STORED_A, "denied");

    await expect(ensureImages(withStore(), fakes.deps)).rejects.toThrow("denied");
    expect(fakes.state.get().run.images).toEqual({ [IMAGE_A]: "failed" });
  });
});

describe("ensureImages timings", () => {
  it("records how long builds, pushes and pulls took, on the clock", async () => {
    const fakes = fakeDependencies();
    fakes.registry.add(STORED_B);
    fakes.runtimeDocker.takes("build", 3_000).takes("push", 2_000).takes("pull", 500);

    const ensuring = ensureImages(remote(), fakes.deps);
    await fakes.clock.advance(10_000);
    await ensuring;

    expect(fakes.state.get().run.timings?.phases).toEqual({
      build: { count: 1, totalMs: 3_000, maxMs: 3_000 },
      pushPrerun: { count: 1, totalMs: 2_000, maxMs: 2_000 },
      pullPrerun: { count: 1, totalMs: 500, maxMs: 500 },
    });
  });

  it("records nothing when there was nothing to do", async () => {
    const fakes = fakeDependencies();
    fakes.runtimeDocker.addImage(IMAGE_A).addImage(IMAGE_B);

    await ensureImages(aManifest(), fakes.deps);

    expect(fakes.state.get().run.timings).toBeUndefined();
  });
});
