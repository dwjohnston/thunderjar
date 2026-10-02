# Critical Issues

Design problems that break a core part of the spec if left unresolved. Each one blocks
other work. Remove an entry once the decision is recorded in the page it affects.

## Harness and model must be one parameter

`harness` and `model` form a cross product, so `claude-code` with `haiku` can't be
compared against `codex` with `gpt-luna` in one experiment. The fix replaces the two
parameters with a single harness/model pair, and changes the experiment from six
parameters to five. It touches the declaration, hashing, folder structure and glossary.

Design agreed in outline, parked: see
[004-addressing-harness-model-pair.md](004-addressing-harness-model-pair.md). Open
points there: the `collectTokenCosts` hash boundary, and whether model IDs get a central
declaration. Blocks the rest of the spec pass in
[002-launch-plan.md](002-launch-plan.md), since most pages mention the six parameters.
