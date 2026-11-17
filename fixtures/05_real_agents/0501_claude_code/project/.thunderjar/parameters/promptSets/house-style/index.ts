import { declarePromptSet } from "thunderjar";

// The files in this folder's files/, copied over /workspace and committed, so the agent's changes
// can be told from them. `git add -A`, not `git commit -a`, which skips new files such as a new
// skill. Use it with a code state that clones a repository, so /workspace is one.
export default declarePromptSet({
  applyParameter: (_config, ctx) => `COPY ${ctx.dir}/ /workspace/
RUN cd /workspace && git add -A && git commit --quiet -m "Thunderjar: apply promptSet"`,
});
