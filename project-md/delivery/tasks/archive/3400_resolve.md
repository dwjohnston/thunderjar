# 3400: `resolve`

A parameter can float, e.g. "the latest commit of `main`", through an optional `resolve`. It runs on the host once per execution, before anything is hashed, and its result reaches the fragment as `ctx.resolved`. The hash only sees the text it ends up in, so a run is still identified by exactly what it built. Each run records what each parameter resolved to.

It replaces `determineHash` / `additionalHash` from PRD 060, which were never built.

## Version bump type

minor

## Artifacts

- `resolve?(config, ctx)` on every parameter declaration, with `ctx.exec(command)`. `ctx.resolved` is typed from what it returns.
- `ctx.resolved` in `applyParameter`, and in a harness's `cli`
- `{ name, parameterHash, resolved }` per parameter on each container run record
- `plan` lists what each parameter resolved to; `show <execution> <container run>` shows it beside the parameter
- Scenario `0209_floating_code_state`, code state `unresolvable` in `0402_broken_declarations`, and the `fakeCommand` test helper

```ts
export default declareCodeState({
  config: { repo: "https://github.com/dwjohnston/thunderjar-evaluation-sandbox.git", branch: "main" },
  resolve: async (config, ctx) =>
    (await ctx.exec(`git ls-remote --exit-code ${config.repo} refs/heads/${config.branch}`)).split("\t")[0] as string,
  applyParameter: (config, ctx) => `RUN git clone --quiet ${config.repo} /workspace \\
  && git -C /workspace checkout --quiet --detach ${ctx.resolved} \\
  && git -C /workspace remote remove origin`,
});
```

## Example CLI Output

```
$ thunderjar plan follow-main
...
 1  node20 | follow-main | snerk | fake-harness-alpha@1.0.0/fake-model-small | plain   f9389885  missing

Resolved
  codeState  follow-main  24dc11c26e2716a12cf33b82fec895a7f02b3e8a

$ thunderjar build unresolvable-code-state
Error: code state "unresolvable": resolve threw: no branch named no-such-branch
```

## Tests

- Unit tests of `hashPermutations` with a fake `ctx.exec`: different commits change only the code state's hash, an unused resolved value changes no hash, a shared parameter is resolved once, and a throwing `resolve` is a config error
- Fixture + stdout tests of `plan` and `build --dry-run`, with a fake `git` on the `PATH`
- Fake Docker tests of `build` (a throwing `resolve` builds nothing) and of `run` and `show` (the record holds `resolved`)
- Type tests of `ctx.resolved`

## Human interventions

None.
