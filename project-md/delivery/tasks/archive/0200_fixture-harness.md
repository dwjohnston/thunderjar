# 0200: Fixture harness

Adds the harness for running the CLI against a scenario, so every command from here on is tested against a scenario from the start.

The harness replaces the parts of the output that change between runs (IDs, temp paths, durations) with placeholders. No scenarios yet: story 0300 adds the first.

From rows 13, 14, 17 and 22. See [planned reapplication](../../research/planned-reapplication.md), step 2.

## Version bump type

none

## Artifacts

- The `fixtures/` folder, grouped as in the root AGENTS.md
- `bun run fixture <n> <command>`, to run a command by hand in a scenario
- `src/testing/cli.ts`: run the CLI in a scenario, with placeholders in its output
- The checked-in `node_modules/thunderjar` link, so scenarios resolve `thunderjar`
- The scenario type-check test
- The fixture rules in AGENTS.md and `fixtures/AGENTS.md`

## Example CLI Output

```
$ bun run fixture 0201 plan
...
```

## Tests

- unit tests only, for the placeholder replacement

## Human interventions

None.
