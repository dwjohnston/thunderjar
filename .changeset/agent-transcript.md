---
"thunderjar": patch
---

Add the `toolCalled` instrument, and a harness's `transcript`.

- A harness's `transcript` says where the agent's own record of its session is in the postrun image, and how to read it, in one shape for every harness: its messages and tool calls, sub-agents' included, in session order.
- Instruments read it with `ctx.transcript()`.
- The library has a parser for each harness it knows: `claudeCodeTranscript`, which `claudeCode()` sets, `codexTranscript`, `copilotTranscript` and `opencodeTranscript`. OpenCode's run script also needs `OPENCODE_TRANSCRIPT_COMMAND`, as OpenCode keeps its sessions in a database. `init`'s starter harnesses use them.
- `toolCalled` counts the agent's calls of a tool, by the harness's own name for it, e.g. `Bash`, optionally only those whose input matches `inputMatches`. Its default score is whether it was called at all. A run without a transcript is skipped.

```ts
export default declareMeasurement({
  instrument: "toolCalled",
  config: { tool: "Bash", inputMatches: "bun test" },
  metrics: {
    ranTests: { stat: "rate", better: "higher" },
    testRuns: { score: (v) => v, stat: "mean" },
  },
});
```
