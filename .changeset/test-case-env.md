---
"thunderjar": patch
---

Give a test case's agents environment variables of its own, with two optional fields of `declareTestCase`.

```ts
export default declareTestCase({
  // ...
  env: { NODE_ENV: "test" },
  secretEnv: ["DATABASE_URL"],
});
```

- `env` is not secret: its values are passed to each agent container, shown by `plan` and `run --dry-run`, recorded with each container run, shown by `show <execution> <run>`, and kept in the postrun image.
- `secretEnv` names variables whose values come from the shell that runs Thunderjar, as a harness's `requiredEnv` does. Only the names are shown or recorded, and the postrun image blanks them. `plan` and `run` stop if one is unset, and a runtime's runner is sent them without listing them in `runner.env`.

Neither changes a permutation's hash, so neither rebuilds a prerun image. Measurement containers are not given them yet.
