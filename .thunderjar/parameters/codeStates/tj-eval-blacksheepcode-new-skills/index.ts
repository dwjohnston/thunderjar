import { declareCodeState } from "thunderjar-published";

// This repository at #198 (9f656df), which replaced the tj-eval skill with one skill per parameter,
// tj-test-case and tj-create-from-capture, and updated HUMANS.md and .thunderjar/AGENTS.md. Compare
// with tj-eval-blacksheepcode-start. resolve looks up the tag's commit, so the Dockerfile pins a SHA.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "tj-tj-eval-blacksheepcode-new-skills",
  },
  resolve: async (config, ctx) => {
    const tag = `refs/tags/${config.tag}`;
    const lines = (await ctx.exec(`git ls-remote --exit-code ${config.repo} ${tag} '${tag}^{}'`)).split("\n");
    // An annotated tag lists its own object, then the commit it points to, with ^{}.
    const line = lines.find((l) => l.endsWith("^{}")) ?? lines[0]!;
    return line.split("\t")[0]!;
  },
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace fetch --quiet origin ${ctx.resolved} \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace tag thunderjar-start \\
  && git -C /workspace remote remove origin \\
  && cd /workspace && bun install --frozen-lockfile
WORKDIR /workspace`,
});
