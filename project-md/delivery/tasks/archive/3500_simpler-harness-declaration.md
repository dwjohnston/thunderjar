# 3500: A simpler harness declaration

A harness is one folder holding one `index.ts`. The folder pins one version of the agent, and a test case names a pair as `<harness>/<model ID>`: the folder, then the ID the agent is given. `versions.ts`, `models.ts` and `collectTokenCosts.ts` go. A whole Claude Code harness is one line, with the `claudeCode` helper.

## Version bump type

major

## Artifacts

- `declareHarness` takes `version` and `collectTokenCosts`, next to `collectReply`. Without `collectTokenCosts`, a run's token costs are `notReported`.
- Pairs are `<harness>/<model ID>`, split at the first `/`, so a model ID may hold one: `opencode-1.19.5/opencode/claude-haiku-5-5`. Any model ID is accepted. A pair in the old `<harness>@<version>/<model>` form is a config error that says how to rename it.
- `declareHarnessVersions`, `declareHarnessModels` and `declareTokenCostCollector` are removed.
- `thunderjar generate` lists harness folders only: `type HarnessModelName = `${HarnessName}/${string}``.
- `claudeCode({ version, cli? })`: installs Claude Code as root, then runs as `node`, `--session-id` on the first turn and `--resume` after, `claudeCodeReply`, Claude Code's token costs, and `requiredEnv: ["ANTHROPIC_API_KEY"]`.
- A container run records `harnessModel: { harness, version, modelId }`. Older records keep their `model`, which `show` still shows.
- `init` scaffolds `claude-code-2.1.311/`, `copilot-1.0.105/`, `codex-0.166.0/` and `opencode-1.19.5/`, Claude Code with the helper.

```ts
// harnessModels/claude-code-2.1.311/index.ts
import { claudeCode } from "thunderjar";

export default claudeCode({ version: "2.1.311" });
```

```ts
// test-cases/compare-models.ts
harnessModel: ["claude-code-2.1.311/claude-haiku-4-5-20251001", "claude-code-2.1.311/claude-haiku-5-5"],
```

## Example CLI Output

```
$ thunderjar plan compare-models
...
 1  node20 | baseline | snerk | claude-code-2.1.311/claude-haiku-4-5-20251001 | plain   …  missing
 2  node20 | baseline | snerk | claude-code-2.1.311/claude-haiku-5-5          | plain   …  missing

$ thunderjar plan old-pairs
Error: .thunderjar/test-cases/old-pairs.ts: harnessModel: "claude-code@2.1.283/haiku-5-5" is in the old form, <harness>@<version>/<model>. Name a harness folder, which pins its version, then the model ID its agent takes, e.g. "claude-code/<model ID>"
```

## Tests

- File creating tests of `init` and `generate`
- Fixture + stdout tests of `plan` for the new pair form and its errors
- Unit tests of `claudeCode`, and type tests of the generated names
- The installed package's smoke test

## Human interventions

None.
