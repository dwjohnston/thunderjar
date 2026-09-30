# Coding Conventions

Conventions for the TypeScript a Thunderjar user writes — parameter declarations,
task declarations, experiment declarations — and so for every example of that code in
this spec.

## `declareX()` functions, not bare exports

A Thunderjar configuration file's default export is always wrapped in the `declareX()`
function for its kind. Never a bare object, and never typed with `satisfies`, a type
assertion (`as`), or a type annotation (`const harness: Harness = …`).

```ts
// experiment-parameters/harnesses/claude-code/index.ts
export default declareHarness({
  version: "2.1.283",
  applyParameter: () => `RUN npm install -g @anthropic-ai/claude-code@2.1.283`,
  cli: (ctx) => `claude -p "${ctx.taskInstruction}" > ${ctx.resultPath}`,
  collectTokenCosts: (raw) => { /* … */ },
});
```

Not any of these:

```ts
export default { version: "2.1.283", /* … */ };                        // untyped
export default { version: "2.1.283", /* … */ } satisfies Harness;     // satisfies
export default { version: "2.1.283", /* … */ } as Harness;            // assertion
const harness: Harness = { version: "2.1.283", /* … */ };             // annotation
export default harness;
```

Why a function:

- **The types come for free.** `ctx` and `raw` above are typed by the function's
  parameter, with nothing written at the call site. A bare object gets none of that.
- **It's the only form that can't be got subtly wrong.** `as` silences errors instead of
  reporting them; `satisfies` and annotations are easy to forget, and forgetting them
  compiles fine.
- **One obvious way to write it.** Every declaration in a project reads the same, which
  matters when declarations are the main thing a user writes.

A helper defined above the call — `const version = "2.1.283";` — is fine. The rule is
about how the export is typed, not about avoiding `const`.

One function per kind:

| Kind | Function |
|---|---|
| Base image | `declareBaseImage` |
| Code state | `declareCodeState` |
| Prompt set | `declarePromptSet` |
| Harness | `declareHarness` |
| Model | `declareModel` |
| Task instruction | `declareTaskInstruction` |
