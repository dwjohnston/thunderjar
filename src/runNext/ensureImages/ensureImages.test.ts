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

import { describe, expect, test } from "bun:test";
import { plan } from "../plan/plan.ts";
import { config, fakes, permutation } from "../testing/fixtures.ts";
import type { TestCaseConfig } from "../types.ts";
import { ensureImages } from "./ensureImages.ts";

const STORE = { repository: "ghcr.io/acme/images" };
const PRERUN = "thunderjar-prerun:i1000000";
const STORED = "ghcr.io/acme/images:prerun-hi1000000";

const planned = (overrides: Partial<TestCaseConfig> & { permutationCount?: number } = {}) => {
  const resolved = config(overrides);
  return { resolved, manifest: plan(resolved, { concurrency: 1, executionId: "01exec" }) };
};

/** Each status `reference` went through, in order. */
const statuses = (deps: ReturnType<typeof fakes>, reference: string) =>
  deps.state
    .history()
    .map((state) => state.run.images[reference])
    .filter((status, i, all) => status !== all[i - 1]);

/** What Docker was asked to do, leaving out what it was only asked about. */
const did = (calls: string[]) => calls.filter((call) => !call.startsWith("imagesIn") && !call.startsWith("inRegistry"));

describe(ensureImages, () => {
  test("without an image store, the runtime builds an image it doesn't have", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned();

    await ensureImages(manifest, resolved, deps);

    expect(did(deps.runtimeDocker.calls)).toEqual([`build ${PRERUN}`]);
    expect(deps.hostDocker.calls).toEqual([]);
    expect(statuses(deps, PRERUN)).toEqual(["checking", "building", "ready"]);
  });

  test("without an image store, an image the runtime has is left as it is", async () => {
    const deps = fakes();
    deps.runtimeDocker.images.add(PRERUN);
    const { resolved, manifest } = planned();

    await ensureImages(manifest, resolved, deps);

    expect(did(deps.runtimeDocker.calls)).toEqual([]);
    expect(deps.state.get().run.images).toEqual({ [PRERUN]: "ready" });
  });

  test("with an image store, the host asks whether it has the image, and the runtime builds and pushes one it doesn't", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned({ imageStore: STORE });

    await ensureImages(manifest, resolved, deps);

    expect(deps.hostDocker.calls).toEqual([`inRegistry ${STORED}`]);
    expect(did(deps.runtimeDocker.calls)).toEqual([`build ${PRERUN}`, `push ${PRERUN} ${STORED}`]);
    expect(statuses(deps, STORED)).toEqual(["checking", "building", "pushing", "ready"]);
  });

  test("with an image store that has the image, the runtime only pulls it", async () => {
    const deps = fakes();
    deps.hostDocker.registry.add(STORED);
    const { resolved, manifest } = planned({ imageStore: STORE });

    await ensureImages(manifest, resolved, deps);

    expect(did(deps.runtimeDocker.calls)).toEqual([`pull ${STORED}`]);
    expect(statuses(deps, STORED)).toEqual(["checking", "pulling", "ready"]);
  });

  test("an image the runtime already has from the store is neither asked about, pulled nor built", async () => {
    const deps = fakes();
    deps.runtimeDocker.images.add(STORED);
    const { resolved, manifest } = planned({ imageStore: STORE });

    await ensureImages(manifest, resolved, deps);

    expect(deps.hostDocker.calls).toEqual([]);
    expect(did(deps.runtimeDocker.calls)).toEqual([]);
  });

  test("permutations that share an image build it once", async () => {
    const deps = fakes();
    const second = permutation(2);
    const shared = { ...second, prerunImage: PRERUN, permutation: { ...second.permutation, imageHash: permutation(1).permutation.imageHash } };
    const { resolved, manifest } = planned({ permutations: [permutation(1), shared] });

    await ensureImages(manifest, resolved, deps);

    expect(did(deps.runtimeDocker.calls)).toEqual([`build ${PRERUN}`]);
  });

  test("a build that fails marks its image failed, starts no more, and is thrown", async () => {
    const deps = fakes();
    deps.runtimeDocker.failNext("build", new Error("no such base image"));
    const { resolved, manifest } = planned({ permutationCount: 2 });

    expect(ensureImages(manifest, resolved, deps)).rejects.toThrow("no such base image");
    await deps.clock.advance(0);

    expect(deps.state.get().run.images).toEqual({ [PRERUN]: "failed", "thunderjar-prerun:i2000000": "checking" });
    expect(did(deps.runtimeDocker.calls)).toEqual([`build ${PRERUN}`]);
  });

  test("times each build into the state", async () => {
    const deps = fakes();
    const { resolved, manifest } = planned();

    await ensureImages(manifest, resolved, deps);

    expect(deps.state.get().run.timings).toEqual({ build: { count: 1, totalMs: 0, maxMs: 0 } });
  });
});
