---
"thunderjar": minor
---

A harness is one folder with one `index.ts`, which pins its version: `declareHarness({ version, … })`, with `collectTokenCosts` beside `collectReply`. A test case names a pair as `<harness>/<model ID>`, e.g. `claude-code-2.1.311/claude-haiku-5-5`, and any model ID is accepted. `versions.ts`, `models.ts` and `collectTokenCosts.ts` are gone, with `declareHarnessVersions`, `declareHarnessModels` and `declareTokenCostCollector`. Add `claudeCode({ version, cli? })`, a complete Claude Code harness, which `init` now scaffolds.
