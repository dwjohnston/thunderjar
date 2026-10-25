import { expect, test } from "bun:test";
import {
  canPreview,
  changesetFingerprint,
  nextRcVersion,
  previewVersion,
  rcPrVersion,
} from "./release-policy.ts";
import { stableTags } from "./build-versioned-docs.ts";

test("RC numbering follows published versions and ignores malformed candidates", () => {
  expect(nextRcVersion("0.2.0", ["0.1.0", "0.2.0-rc.0", "0.2.0-rc.foo", "0.2.0-rc.2"]))
    .toBe("0.2.0-rc.3");
  expect(nextRcVersion("1.0.0", ["0.2.0-rc.2"])).toBe("1.0.0-rc.0");
});

test("RC PR closes after publishing the same changesets and refreshes when they change", () => {
  const first = changesetFingerprint([{ path: ".changeset/a.md", content: "patch" }]);
  const reordered = changesetFingerprint([{ path: ".changeset/b.md", content: "minor" }, { path: ".changeset/a.md", content: "patch" }]);
  const sorted = changesetFingerprint([{ path: ".changeset/a.md", content: "patch" }, { path: ".changeset/b.md", content: "minor" }]);
  expect(reordered).toBe(sorted);
  expect(rcPrVersion("0.2.0", [], first, undefined)).toBe("0.2.0-rc.0");
  expect(rcPrVersion("0.2.0", ["0.2.0-rc.0"], first, first)).toBeUndefined();
  expect(rcPrVersion("0.2.0", ["0.2.0-rc.0"], sorted, first)).toBe("0.2.0-rc.1");
  expect(rcPrVersion("0.2.0", ["0.2.0-rc.0"], undefined, first)).toBeUndefined();
});

test("preview versions pin the PR head and only write-access repository PRs qualify", () => {
  const sha = "a".repeat(40);
  expect(previewVersion(42, sha)).toBe(`0.0.0-pr.42.g${sha}`);
  expect(() => previewVersion(42, "short")).toThrow();
  expect(canPreview("write", "open", "dwjohnston/thunderjar", "dwjohnston/thunderjar")).toBe(true);
  expect(canPreview("read", "open", "dwjohnston/thunderjar", "dwjohnston/thunderjar")).toBe(false);
  expect(canPreview("write", "closed", "dwjohnston/thunderjar", "dwjohnston/thunderjar")).toBe(false);
  expect(canPreview("write", "open", "someone/fork", "dwjohnston/thunderjar")).toBe(false);
});

test("docs include only stable package tags in newest-first order", () => {
  expect(stableTags(["v0.1.0", "v0.2.0-rc.0", "v1.0.0", "task-complete", "v0.2.0", "v0.0.0-pr.42.gabc"]))
    .toEqual([
      { tag: "v1.0.0", version: "1.0.0" },
      { tag: "v0.2.0", version: "0.2.0" },
      { tag: "v0.1.0", version: "0.1.0" },
    ]);
});
