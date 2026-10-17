# 1. Update the AGENTS.md docs to reflect the testing philosophy

See [../PLAN.md](../PLAN.md).

## What to do

- Root `AGENTS.md`, "Fixture tests":
  - Command tests run against a checked-in scenario, unchanged, and only assert on what the command produced.
  - Scenarios don't know about the tests that use them. A scenario is a project and the state it starts in. Every expected result lives in the test.
  - No generated or patched projects in tests. Any variation a test needs belongs in a scenario.
  - Only commands that write into the project (`init`,  `generate`) work on a copy. Everything else runs in place.
- `src/AGENTS.md`: where command tests live, and what `src/testing/` holds.
- `fixtureTests/AGENTS.md`: match the above.

## Done when

The three files describe the philosophy, with nothing left that contradicts it.
