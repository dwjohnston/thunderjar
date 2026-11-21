---
harness: claude-code
model: opus
effort: high
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Model: claude-opus-5-5
Session Id: session_01LCLeLgjaf4n2FVk7rLLHNR
Supervising engineer: David Johnston

Humans: add your notes here
-->

# 3880: Agent transcript

The agent's whole session, read from its harness's own transcript in the postrun image, in one shape for every harness.

This task is the foundation for the drafts `toolCalled`, `skillInvoked` and `conversationContains`. It ships `toolCalled` as the first instrument to use it, so the transcript is tested end to end.

## Why the home directory, not result.json

- result.json stays as it is.
  - It's the agent CLI's stdout, and it's still needed for the reply, token costs, clean-end checks and failure hints, all without the postrun image.
- The harness's own transcript is richer.
  - Claude Code's result.json has no tool calls at all.
  - OpenCode's has the main session only, not sub-agents.
- Reading it needs the postrun image. That's fine: a run whose image is purged can't be remeasured, and doesn't need to be.

## Version bump type

patch

## Artifacts

### 1. `transcript` on `declareHarness`

Each harness declares where its transcript is, and how to parse it.

```ts
transcript?: {
  /** Globs in the postrun image, `~` being the home of the image's user. */
  files: string[];
  /** The transcript, from the files the globs matched. A throw is `unparseable`. */
  parse: (files: { path: string; text: string }[]) => TranscriptEvent[];
};
```

`parse` takes every matched file, since a session can span several, e.g. Claude Code's sub-agents.

### 2. The shared shape

```ts
type TranscriptEvent =
  | { kind: "message"; role: "user" | "assistant"; text: string; agent: "main" | "subagent" }
  | { kind: "toolCall"; tool: string; input: unknown; agent: "main" | "subagent" };
```

- `tool` is the harness's own name for it, e.g. `Bash` in Claude Code, `bash` in OpenCode. Thunderjar doesn't map tools across harnesses.
- Events are in session order.

### 3. `ctx.transcript()` on `MeasurementContext`

```ts
transcript(): Promise<
  | { outcome: "collected"; events: TranscriptEvent[] }
  | { outcome: "unavailable"; reason: string }
>;
```

Reasons it's unavailable:

1. Its harness declares no `transcript`.
2. No file matched the globs.
3. `parse` threw.

An instrument that gets `unavailable` returns `skipped`, with the reason.

### 4. Parsers for the four harnesses

| Harness | Expected transcript location (verify) |
| --- | --- |
| Claude Code | `~/.claude/projects/<encoded cwd>/<session>.jsonl`, and sub-agent files beside it |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` |
| OpenCode | `~/.local/share/opencode/storage/**` |
| Copilot | `~/.copilot/session-state/**` |

- Verify each location and format against a real postrun image of the harness version pinned in `.thunderjar/parameters/harnessModels/` before writing its parser.
  - Claude Code's run script switches to the `node` user, so its home is `/home/node`.
- Claude Code's parser lives in `src/api/claudeCode.ts`, and `claudeCode()` sets `transcript`.
- Add `transcript` to the other three harnesses in `.thunderjar/parameters/harnessModels/`, and to the starter harnesses `init` scaffolds.

### 5. `toolCalled` instrument

```ts
// InstrumentTypes
toolCalled: {
  config: {
    /** The harness's name for the tool, e.g. "Bash". */
    tool: string;
    /** Only count calls whose input, as JSON, matches this regular expression. */
    inputMatches?: string;
  };
  value: number; // how many calls
};
```

- Default score: `value > 0`.
- Counts sub-agents' calls too.

## Example

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

## Tests

- Unit tests of each harness's parser, against a transcript saved from a real run under `fixtures/`.
  - Cover a tool call, a sub-agent and a multi-turn session.
- Unit tests of `toolCalled`, with a fake transcript, including each `unavailable` reason.
- A `.docker.test.ts` that reads a transcript from a postrun image.

## Human interventions

None.
