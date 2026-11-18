import { declareCodeState } from "thunderjar-published";

// This repository as it was when captured session 49669c7c-0a9d-468d-a0aa-fbeb2bc69840 started:
// the commit before the agent added the blacksheepcode test case. resolve looks up the tag's commit,
// so the Dockerfile pins a SHA.
export default declareCodeState({
  config: {
    repo: "https://github.com/dwjohnston/thunderjar.git",
    tag: "thunderjar/codestate/tj-eval-blacksheepcode-start",
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
