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

test("install runs its command in /workspace after the checkout", async () => {
  const state = codeStateGitCheckout({ repo, commit: SHA, install: "bun install --frozen-lockfile" });
  const resolved = await state.resolve!(state.config!, { exec: async () => "" });
  expect(state.applyParameter!(state.config!, { dir: "d", resolved })).toEndWith(`&& git -C /workspace remote remove origin
RUN bun install --frozen-lockfile`);
});

describe("resolve", () => {
  const ASK = async (state: ReturnType<typeof codeStateGitCheckout>, reply: string) => {
    const commands: string[] = [];
    const resolved = await state.resolve!(state.config!, { exec: async (command) => (commands.push(command), reply) });
    return { resolved, commands };
  };

  test("a branch is its head's commit", async () => {
    const { resolved, commands } = await ASK(codeStateGitCheckout({ repo, branch: "main" }), `${SHA}\trefs/heads/main`);
    expect(resolved).toBe(SHA);
    expect(commands[0]).toContain("'refs/heads/main'");
  });

  test("an annotated tag is its peeled commit, not the tag object", async () => {
    const { resolved, commands } = await ASK(codeStateGitCheckout({ repo, tag: "v0.4.0" }), `aaaa\trefs/tags/v0.4.0\n${SHA}\trefs/tags/v0.4.0^{}`);
    expect(resolved).toBe(SHA);
    expect(commands[0]).toContain("'refs/tags/v0.4.0^{}'");
  });

  test("a lightweight tag is its commit", async () => {
    const { resolved } = await ASK(codeStateGitCheckout({ repo, tag: "v0.4.0" }), `${SHA}\trefs/tags/v0.4.0`);
    expect(resolved).toBe(SHA);
  });

  test("a commit asks nothing", async () => {
    const { resolved, commands } = await ASK(codeStateGitCheckout({ repo, commit: SHA }), "");
    expect(resolved).toBe(SHA);
    expect(commands).toEqual([]);
  });
});

test("config takes one of commit, branch or tag", () => {
  codeStateGitCheckout({ repo, commit: SHA });
  codeStateGitCheckout({ repo, branch: "main" });
  codeStateGitCheckout({ repo, tag: "v1" });
  // @ts-expect-error - none of them
  codeStateGitCheckout({ repo });
  // @ts-expect-error - two of them
  codeStateGitCheckout({ repo, branch: "main", tag: "v1" });
  // @ts-expect-error - a bare ref is ambiguous
  codeStateGitCheckout({ repo, ref: "main" });
});
