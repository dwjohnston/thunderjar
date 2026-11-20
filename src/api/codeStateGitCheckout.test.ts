import { describe, expect, test } from "bun:test";
import { codeStateGitCheckout } from "./codeStateGitCheckout.ts";
import { declaredBy } from "./declarations.ts";

const repo = "https://github.com/dwjohnston/thunderjar.git";
const SHA = "530f47780718b56122d2fce6a8d87011632cf546";

describe("codeStateGitCheckout with a commit", () => {
  const state = codeStateGitCheckout({ repo, commit: SHA });

  test("is a code state declaration", () => {
    expect(declaredBy(state)).toBe("declareCodeState");
  });

  test("clones, fetches the commit directly, checks it out detached and removes origin", async () => {
    const resolved = await state.resolve!(state.config!, { exec: async () => "" });
    expect(state.applyParameter!(state.config!, { dir: "d", resolved })).toBe(`RUN git clone --quiet ${repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${SHA} \\
  && git -C /workspace checkout --quiet --detach ${SHA} \\
  && git -C /workspace remote remove origin`);
  });
});
