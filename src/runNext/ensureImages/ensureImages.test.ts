/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-fable-5-2
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { describe, expect, test } from "bun:test";
import { DockerBuildError, DockerPullError, DockerPushError } from "../../docker/docker.ts";
import { type FakeDependencies, fakeDependencies, fakeManifest, fakePermutation, IMAGE_STORE, loggedSteps } from "../testing/fakeDependencies.ts";
import { ensureImages } from "./ensureImages.ts";

const LOCAL = "tj-prerun:aaaaaaaa";
const STORED = "registry.example.com/team/images:prerun-haaaaaaaa";
const runtime = { command: ["docker", "--context", "cloud"] };

/** Each status `image` has had, in order. */
function statusesOf(deps: FakeDependencies, image: string): string[] {
  const statuses = deps.state.history().flatMap((state) => state.run.images[image] ?? []);
  return statuses.filter((status, i) => status !== statuses[i - 1]);
}

describe(ensureImages, () => {
  describe("without an image store", () => {
    test("builds each image on the runtime's daemon, and asks nothing of the host's", async () => {
      const deps = fakeDependencies();

      await ensureImages(fakeManifest({ permutations: ["a", "b"] }), deps);

      expect(deps.runtimeDocker.calls).toEqual(["imagesIn tj-prerun", "build tj-prerun:aaaaaaaa", "build tj-prerun:bbbbbbbb"]);
      expect(deps.hostDocker.calls).toEqual([]);
    });

    test("builds only the images that are missing", async () => {
      const deps = fakeDependencies();
      deps.runtimeDocker.images.add("tj-prerun:aaaaaaaa");

      await ensureImages(fakeManifest({ permutations: ["a", "b"] }), deps);

      expect(deps.runtimeDocker.callsOf("build")).toEqual(["tj-prerun:bbbbbbbb"]);
    });

    test("builds an image two permutations share once", async () => {
      const deps = fakeDependencies();

      await ensureImages(fakeManifest({ permutations: [fakePermutation("a", "c"), fakePermutation("b", "c")] }), deps);

      expect(deps.runtimeDocker.callsOf("build")).toEqual(["tj-prerun:cccccccc"]);
    });

    test("every image ends ready, with what happened in the log", async () => {
      const deps = fakeDependencies();
      deps.runtimeDocker.images.add("tj-prerun:aaaaaaaa");

      await ensureImages(fakeManifest({ permutations: ["a", "b"] }), deps);

      expect(deps.state.get().run.images).toEqual({ "tj-prerun:aaaaaaaa": "ready", "tj-prerun:bbbbbbbb": "ready" });
      expect(loggedSteps(deps)).toEqual(["tj-prerun:bbbbbbbb:building", "tj-prerun:bbbbbbbb:built"]);
    });

    test("an image is checking, then building, then ready", async () => {
      const deps = fakeDependencies();

      await ensureImages(fakeManifest(), deps);

      expect(statusesOf(deps, LOCAL)).toEqual(["checking", "building", "ready"]);
    });

    test("times each build", async () => {
      const deps = fakeDependencies();

      await ensureImages(fakeManifest({ permutations: ["a", "b"] }), deps);

      expect(deps.state.get().run.details?.phases.build?.count).toBe(2);
    });

    test("builds from a temporary folder holding the Dockerfile, with the build's options, and removes it", async () => {
      const deps = fakeDependencies({ env: { cwd: "/project", variables: { TMPDIR: "/scratch" } } });
      const build = { secrets: [{ id: "token", env: "TOKEN" }], ssh: true, concurrency: 1 };
      let dockerfile: string | undefined;
      const realBuild = deps.runtimeDocker.build.bind(deps.runtimeDocker);
      deps.runtimeDocker.build = async (contextDir, image, options) => {
        dockerfile = await deps.fs.readText(`${contextDir}/Dockerfile`);
        await realBuild(contextDir, image, options);
      };

      await ensureImages(fakeManifest({ build }), deps);

      expect(deps.runtimeDocker.builds).toHaveLength(1);
      expect(deps.runtimeDocker.builds[0]?.contextDir).toStartWith("/scratch/thunderjar-build-");
      expect(deps.runtimeDocker.builds[0]?.options).toEqual(build);
      expect(dockerfile).toBe("FROM scratch\n# a\n");
      expect(deps.fs.files()).toEqual({});
    });

    test("copies each folder parameter's files into the build context", async () => {
      const deps = fakeDependencies();
      await deps.fs.write("/project/.thunderjar/parameters/codeStates/code/files/README.md", "hello");
      let copied: string[] = [];
      const realBuild = deps.runtimeDocker.build.bind(deps.runtimeDocker);
      deps.runtimeDocker.build = async (contextDir, image, options) => {
        copied = Object.keys(deps.fs.files()).filter((path) => path.startsWith(contextDir)).map((path) => path.slice(contextDir.length));
        await realBuild(contextDir, image, options);
      };

      await ensureImages(fakeManifest(), deps);

      expect(copied.some((path) => path.endsWith("/README.md"))).toBe(true);
      expect(copied).toContain("/Dockerfile");
    });
  });

  describe("a failed build", () => {
    test("throws a DockerBuildError naming the image, and marks it failed", async () => {
      const deps = fakeDependencies();
      deps.runtimeDocker.fail("build", new DockerBuildError("exit code 1"));

      const failure = await ensureImages(fakeManifest(), deps).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DockerBuildError);
      expect((failure as DockerBuildError).image).toBe(LOCAL);
      expect((failure as DockerBuildError).message).toBe("exit code 1");
      expect(deps.state.get().run.images).toEqual({ [LOCAL]: "failed" });
      expect(loggedSteps(deps)).toEqual([`${LOCAL}:building`, `${LOCAL}:buildFailed`]);
    });

    test("removes its build context all the same", async () => {
      const deps = fakeDependencies();
      deps.runtimeDocker.fail("build", new DockerBuildError("exit code 1"));

      await ensureImages(fakeManifest(), deps).catch(() => {});

      expect(deps.fs.files()).toEqual({});
    });

    test("no more builds start", async () => {
      const deps = fakeDependencies();
      deps.runtimeDocker.fail("build", new DockerBuildError("exit code 1"), "aaaaaaaa");

      await expect(ensureImages(fakeManifest({ permutations: ["a", "b"] }), deps)).rejects.toBeInstanceOf(DockerBuildError);

      expect(deps.runtimeDocker.callsOf("build")).toEqual(["tj-prerun:aaaaaaaa"]);
      expect(deps.state.get().run.images).toEqual({ "tj-prerun:aaaaaaaa": "failed", "tj-prerun:bbbbbbbb": "checking" });
    });
  });

  describe("with an image store, on this machine", () => {
    test("asks the host whether the store has the image; the runtime's daemon lists, builds and pushes", async () => {
      const deps = fakeDependencies();

      await ensureImages(fakeManifest({ imageStore: IMAGE_STORE }), deps);

      expect(deps.hostDocker.calls).toEqual([`inRegistry ${STORED}`]);
      expect(deps.runtimeDocker.calls).toEqual(["imagesIn tj-prerun", `build ${LOCAL}`, `push ${LOCAL} ${STORED}`]);
    });

    test("the store lacks it: built and pushed, never pulled", async () => {
      const deps = fakeDependencies();

      await ensureImages(fakeManifest({ imageStore: IMAGE_STORE }), deps);

      expect(deps.runtimeDocker.registry.has(STORED)).toBe(true);
      expect(deps.runtimeDocker.callsOf("pull")).toEqual([]);
      expect(deps.state.get().run.images).toEqual({ [LOCAL]: "ready" });
      expect(loggedSteps(deps)).toEqual([`${LOCAL}:building`, `${LOCAL}:built`, `${LOCAL}:pushing`, `${LOCAL}:pushed`]);
    });

    test("the store lacks it, the daemon has it: pushed without building", async () => {
      const deps = fakeDependencies();
      deps.runtimeDocker.images.add(LOCAL);

      await ensureImages(fakeManifest({ imageStore: IMAGE_STORE }), deps);

      expect(deps.runtimeDocker.callsOf("build")).toEqual([]);
      expect(deps.runtimeDocker.callsOf("push")).toEqual([`${LOCAL} ${STORED}`]);
    });

    test("the store has it: built if the daemon lacks it, since its containers start from the local image, but not pushed", async () => {
      const deps = fakeDependencies();
      deps.hostDocker.registry.add(STORED);

      await ensureImages(fakeManifest({ imageStore: IMAGE_STORE }), deps);

      expect(deps.runtimeDocker.callsOf("build")).toEqual([LOCAL]);
      expect(deps.runtimeDocker.callsOf("push")).toEqual([]);
      expect(deps.runtimeDocker.callsOf("pull")).toEqual([]);
    });

    test("a failed push throws a DockerPushError naming the reference, and marks the image failed", async () => {
      const deps = fakeDependencies();
      deps.runtimeDocker.fail("push", new DockerPushError("denied"));

      const failure = await ensureImages(fakeManifest({ imageStore: IMAGE_STORE }), deps).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DockerPushError);
      expect((failure as DockerPushError).reference).toBe(STORED);
      expect(deps.state.get().run.images).toEqual({ [LOCAL]: "failed" });
      expect(loggedSteps(deps).at(-1)).toBe(`${LOCAL}:pushFailed`);
    });
  });

  describe("with an image store, on a remote runtime", () => {
    const remote = { imageStore: IMAGE_STORE, runtime };

    test("the store has it: the runtime pulls it, and builds nothing", async () => {
      const deps = fakeDependencies();
      deps.hostDocker.registry.add(STORED);

      await ensureImages(fakeManifest(remote), deps);

      expect(deps.hostDocker.calls).toEqual([`inRegistry ${STORED}`]);
      expect(deps.runtimeDocker.calls).toEqual(["imagesIn tj-prerun", "imagesIn registry.example.com/team/images", `pull ${STORED}`]);
      expect(deps.runtimeDocker.images.has(STORED)).toBe(true);
      expect(deps.state.get().run.images).toEqual({ [LOCAL]: "ready" });
      expect(loggedSteps(deps)).toEqual([`${LOCAL}:pulling`, `${LOCAL}:pulled`]);
    });

    test("the store has it, and so does the runtime: not pulled again", async () => {
      const deps = fakeDependencies();
      deps.hostDocker.registry.add(STORED);
      deps.runtimeDocker.images.add(STORED);

      await ensureImages(fakeManifest(remote), deps);

      expect(deps.runtimeDocker.callsOf("pull")).toEqual([]);
      expect(deps.runtimeDocker.callsOf("build")).toEqual([]);
      expect(deps.state.get().run.images).toEqual({ [LOCAL]: "ready" });
      expect(loggedSteps(deps)).toEqual([]);
    });

    test("the runtime's images can't be listed: each stored image is pulled", async () => {
      const deps = fakeDependencies();
      deps.hostDocker.registry.add(STORED);
      deps.runtimeDocker.images.add(STORED);
      deps.runtimeDocker.fail("imagesIn", new Error("timed out"), "registry.example.com");

      await ensureImages(fakeManifest(remote), deps);

      expect(deps.runtimeDocker.callsOf("pull")).toEqual([STORED]);
    });

    test("the store lacks it: the runtime builds and pushes it, with no pull", async () => {
      const deps = fakeDependencies();

      await ensureImages(fakeManifest(remote), deps);

      expect(deps.runtimeDocker.callsOf("build")).toEqual([LOCAL]);
      expect(deps.runtimeDocker.callsOf("push")).toEqual([`${LOCAL} ${STORED}`]);
      expect(deps.runtimeDocker.callsOf("pull")).toEqual([]);
      // Pushing tags it on the runtime as the reference its containers start from.
      expect(deps.runtimeDocker.images.has(STORED)).toBe(true);
    });

    test("the image is pulling while it's pulled", async () => {
      const deps = fakeDependencies();
      deps.hostDocker.registry.add(STORED);

      await ensureImages(fakeManifest(remote), deps);

      expect(statusesOf(deps, LOCAL)).toEqual(["checking", "pulling", "ready"]);
    });

    test("a failed pull throws a DockerPullError naming the reference, and marks the image failed", async () => {
      const deps = fakeDependencies();
      deps.hostDocker.registry.add(STORED);
      deps.runtimeDocker.fail("pull", new DockerPullError("unauthorized"));

      const failure = await ensureImages(fakeManifest(remote), deps).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DockerPullError);
      expect((failure as DockerPullError).reference).toBe(STORED);
      expect(deps.state.get().run.images).toEqual({ [LOCAL]: "failed" });
      expect(loggedSteps(deps)).toEqual([`${LOCAL}:pulling`, `${LOCAL}:pullFailed`]);
    });
  });
});
