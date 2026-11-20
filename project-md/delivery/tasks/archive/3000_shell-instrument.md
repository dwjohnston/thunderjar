# 3000: The `shell` instrument

A measurement can run any shell command in the measurement container, and pass when it exits 0. So an experiment can measure what no built-in instrument does, like "does it type-check?" or "is the file under 30 lines?".

## Version bump type

minor

## Artifacts

- The `shell` instrument: does `command` exit 0? A boolean, aggregated as `rate` or `count`

```ts
export default declareMeasurement({
  instrument: "shell",
  config: { command: "bunx tsc --noEmit" },
  aggregate: ["rate"],
});
```

## Example CLI Output

```
$ thunderjar show <ULID>
                                          type-checks
 1  snerk | fake-harness-alpha | plain    5/5
 2  snerk | fake-harness-beta  | plain    0/5
```

## Tests

- Regular unit tests for the instrument
- Type tests for its declaration

## Human interventions

None.
