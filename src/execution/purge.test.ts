/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLjTC1bzhycPs8knbmL
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */

import { describe, expect, test } from "bun:test";
import { registryClient } from "../docker/registry.ts";
import { fakeRegistry } from "../testing/fakeRegistry.ts";
import { parseAge, postrunTargets, purgedFrom, selectionProblem, storeDeleter } from "./purge.ts";
import type { ContainerRunRecord } from "../store/runDataStore.ts";

describe("parseAge", () => {
  test("a whole number and a unit: minutes, hours, days or weeks", () => {
    expect(parseAge("90m")).toBe(90 * 60_000);
    expect(parseAge("12h")).toBe(12 * 3_600_000);
    expect(parseAge("30d")).toBe(30 * 86_400_000);
    expect(parseAge("2w")).toBe(14 * 86_400_000);
  });

  test.each(["", "30", "d", "1.5d", "-1d", "0d", "30 days", "1y"])("%p is not an age", (text) => {
    expect(() => parseAge(text)).toThrow(/is not an age/);
  });
});

describe("selectionProblem", () => {
  const none = { executionIds: [], all: false };

  test("a bare purge is refused: it never means everything", () => {
    expect(selectionProblem(none, "postrun", false)).toBe("Say which images to purge: execution IDs, --test-case <name>, or --all.");
    expect(selectionProblem({ ...none, olderThanMs: 1 }, "postrun", false)).toBeString();
  });

  test("one selector at a time", () => {
    expect(selectionProblem({ executionIds: ["a"], all: true }, "postrun", false)).toBe("Give execution IDs, --test-case or --all: only one of them.");
    expect(selectionProblem({ executionIds: [], testCase: "x", all: true }, "postrun", false)).toBeString();
    expect(selectionProblem({ executionIds: ["a"], all: false }, "postrun", false)).toBeUndefined();
    expect(selectionProblem({ ...none, testCase: "x", olderThanMs: 1 }, "postrun", true)).toBeUndefined();
  });

  test("prerun images only by test case or all, without --older-than or --record-only", () => {
    expect(selectionProblem({ executionIds: ["a"], all: false }, "prerun", false)).toMatch(/^Prerun images are shared between executions/);
    expect(selectionProblem({ executionIds: ["a"], all: false }, "all", false)).toMatch(/^Prerun images are shared/);
    expect(selectionProblem({ ...none, all: true, olderThanMs: 1 }, "prerun", false)).toMatch(/^--older-than/);
    expect(selectionProblem({ ...none, all: true }, "all", true)).toMatch(/^--record-only/);
    expect(selectionProblem({ ...none, testCase: "x" }, "prerun", false)).toBeUndefined();
  });
});

test("postrunTargets: locally by its name and as recorded; in the store as recorded there, and nowhere without a store", () => {
  const record = (postrunImage: string) => ({ executionId: "01e", permutation: 2, iteration: 3, postrunImage }) as ContainerRunRecord;
  const store = { repository: "localhost:5000/acme/images" };

  expect(postrunTargets([record("thunderjar-postrun:01e-2-3")], "thunderjar", null)).toEqual([
    { executionId: "01e", run: "2-3", permutation: 2, iteration: 3, local: ["thunderjar-postrun:01e-2-3"] },
  ]);
  expect(postrunTargets([record("localhost:5000/acme/images:postrun-e01e-h1-i02")], "tj", store)).toEqual([
    {
      executionId: "01e",
      run: "2-3",
      permutation: 2,
      iteration: 3,
      local: ["tj-postrun:01e-2-3", "localhost:5000/acme/images:postrun-e01e-h1-i02"],
      stored: "localhost:5000/acme/images:postrun-e01e-h1-i02",
    },
  ]);
});

test("postrunTargets: a run recorded under its local name, as every run was before pushed references were recorded, is in the store under the name it was pushed as", () => {
  const record = { executionId: "01e", permutation: 2, permutationHash: "3ab9b840c0ffee", iteration: 3, postrunImage: "thunderjar-postrun:01e-2-3" } as ContainerRunRecord;

  expect(postrunTargets([record], "thunderjar", { repository: "ghcr.io/acme/images" })).toEqual([
    {
      executionId: "01e",
      run: "2-3",
      permutation: 2,
      iteration: 3,
      local: ["thunderjar-postrun:01e-2-3"],
      stored: "ghcr.io/acme/images:postrun-e01e-h3ab9b840-i02",
    },
  ]);
});

test("purgedFrom: wherever it's gone from, deleted, already gone or recorded", () => {
  expect(purgedFrom({ outcome: "deleted" }, { outcome: "absent" })).toBe("both");
  expect(purgedFrom({ outcome: "recorded" }, undefined)).toBe("daemon");
  expect(purgedFrom({ outcome: "failed" }, { outcome: "deleted" })).toBe("imageStore");
  expect(purgedFrom({ outcome: "absent" }, { outcome: "refused" })).toBe("daemon");
  expect(purgedFrom(undefined, { outcome: "failed" })).toBeUndefined();
});

describe("storeDeleter", () => {
  const removeLocal = async () => ({ outcome: "deleted" as const });

  test("once the registry refuses a delete, it isn't asked again: the rest go to the deleteCommand", async () => {
    await using registry = fakeRegistry({ deletes: false });
    for (const tag of ["a", "b", "c"]) registry.add("acme/images", tag);
    const ran: string[] = [];
    const remove = storeDeleter({ removeLocal, registry: registryClient(async () => undefined), runDeleteCommand: async (reference) => void ran.push(reference) });

    const outcomes = [];
    for (const tag of ["a", "b", "c"]) outcomes.push(await remove(`${registry.host}/acme/images:${tag}`));

    expect(outcomes).toEqual([1, 2, 3].map(() => ({ outcome: "deleted", by: "deleteCommand" })));
    expect(ran).toEqual(["a", "b", "c"].map((tag) => `${registry.host}/acme/images:${tag}`));
    expect(registry.requests.filter((request) => request.startsWith("DELETE"))).toHaveLength(1);
  });

  test("without a deleteCommand, each is refused, with the registry's reason; a failing command is a failure", async () => {
    await using registry = fakeRegistry({ deletes: false });
    registry.add("acme/images", "a");
    const client = registryClient(async () => undefined);

    expect(await storeDeleter({ removeLocal, registry: client })(`${registry.host}/acme/images:a`)).toEqual({ outcome: "refused", reason: "405 UNSUPPORTED: The operation is unsupported." });
    expect(await storeDeleter({ removeLocal, registry: client, runDeleteCommand: async () => "nope" })(`${registry.host}/acme/images:a`)).toEqual({
      outcome: "failed",
      reason: "nope",
      by: "deleteCommand",
    });
  });
});
