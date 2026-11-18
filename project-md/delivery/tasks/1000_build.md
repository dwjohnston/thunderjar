# 1000: Build

`thunderjar build` builds the prerun Docker images for an experiment.

From rows 15 and 20. See [planned reapplication](../../research/planned-reapplication.md), step 10.

## Version bump type

minor

## Artifacts

- `thunderjar build`
- `bun run test:docker`, run in CI

## Example CLI Output

```
$ thunderjar build
Building thunderjar-prerun:a1b2c3d4 ... done
Building thunderjar-prerun:e5f6a7b8 ... done
2 built, 0 already present
```

## Tests

- Fixture tests with the fake Docker
- Create docker image tests: `build.docker.test.ts`, against real Docker under a throwaway image prefix, cleaned up afterwards

## Human interventions

- CI needs Docker available for `test:docker`.
