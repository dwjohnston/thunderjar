import { describe, expect, test } from "bun:test";
import { bumpPatch, decideRc, decideRcToPublish, nextRcNumber, previewVersion, renderNotes, type RcChangeset } from "./release-versions";

const featureA: RcChangeset = { id: "brave-cats", type: "patch", summary: "Add a feature." };
const featureB: RcChangeset = { id: "quiet-dogs", type: "minor", summary: "Break something." };

describe("nextRcNumber", () => {
  test("starts at 0", () => {
    expect(nextRcNumber(["v0.1.2"], "0.1.3")).toBe(0);
  });

  test("increments past the highest rc tag numerically", () => {
    expect(nextRcNumber(["v0.1.3-rc.0", "v0.1.3-rc.2", "v0.1.3-rc.10", "v0.1.4-rc.20"], "0.1.3")).toBe(11);
  });
});

describe("decideRc", () => {
  test("closes when there are no pending changesets", () => {
    expect(decideRc({ pending: [], nextVersion: undefined, previous: undefined, tags: [] })).toEqual({ action: "close" });
  });

  test("opens rc.0 for the first changeset", () => {
    expect(decideRc({ pending: [featureA], nextVersion: "0.1.3", previous: undefined, tags: ["v0.1.2"] })).toEqual({
      action: "open",
      rc: { version: "0.1.3-rc.0", changesets: [featureA] },
    });
  });

  test("closes when the last RC already has every pending changeset", () => {
    const previous = { version: "0.1.3-rc.0", changesets: [featureA] };
    expect(decideRc({ pending: [featureA], nextVersion: "0.1.3", previous, tags: ["v0.1.3-rc.0"] })).toEqual({
      action: "close",
    });
  });

  test("opens the next RC when a new changeset is merged", () => {
    const previous = { version: "0.1.3-rc.0", changesets: [featureA] };
    expect(decideRc({ pending: [featureA, featureB], nextVersion: "0.2.0", previous, tags: ["v0.1.3-rc.0"] })).toEqual({
      action: "open",
      rc: { version: "0.2.0-rc.0", changesets: [featureA, featureB] },
    });
  });

  test("ignores an RC file left over from an earlier release", () => {
    const previous = { version: "0.1.3-rc.1", changesets: [featureA] };
    const tags = ["v0.1.3-rc.0", "v0.1.3-rc.1", "v0.1.3"];
    expect(decideRc({ pending: [featureB], nextVersion: "0.2.0", previous, tags })).toEqual({
      action: "open",
      rc: { version: "0.2.0-rc.0", changesets: [featureB] },
    });
  });
});

describe("decideRcToPublish", () => {
  const rc = { version: "0.1.3-rc.1", changesets: [featureA] };

  test("publishes an untagged RC", () => {
    expect(decideRcToPublish(rc, ["v0.1.3-rc.0"], [featureA.id])).toEqual({ version: "0.1.3-rc.1" });
  });

  test("skips an RC that is already tagged", () => {
    expect(decideRcToPublish(rc, ["v0.1.3-rc.1"], [featureA.id])).toHaveProperty("skip");
  });

  test("skips an RC whose stable version is released", () => {
    expect(decideRcToPublish(rc, ["v0.1.3"], [])).toHaveProperty("skip");
  });

  test("skips an RC whose changesets were released", () => {
    expect(decideRcToPublish(rc, [], [featureB.id])).toHaveProperty("skip");
  });
});

describe("previewVersion", () => {
  test("uses the short sha", () => {
    expect(previewVersion("0.1.3", "abc1234def5678")).toBe("0.1.3-preview-abc1234");
  });

  test("rejects anything that is not a sha", () => {
    expect(() => previewVersion("0.1.3", "main; rm -rf /")).toThrow();
  });
});

test("bumpPatch", () => {
  expect(bumpPatch("0.1.9")).toBe("0.1.10");
  expect(() => bumpPatch("0.1.9-rc.0")).toThrow();
});

test("renderNotes groups changesets by bump type", () => {
  expect(renderNotes({ version: "0.2.0-rc.0", changesets: [featureA, featureB] })).toBe(
    "### Minor Changes\n\n- Break something.\n\n### Patch Changes\n\n- Add a feature.\n",
  );
});
