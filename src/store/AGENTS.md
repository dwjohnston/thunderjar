@HUMANS.md

# `src/store`

| File | What it is |
|---|---|
| `runDataStore.ts` | The `RunDataStore` interface, its record types, and the SQLite and Postgres stores. |
| `stores.ts` | `Stores`, the injected service that opens a run data store, and `createStores(env)`, the real one. |
| `FakeRunDataStore.ts` | `FakeRunDataStore`, a store in memory, and `FakeStores`, which always opens it. |

## `Stores` is a service

`run` never opens a store itself. It asks `deps.stores.open(dataDir)`, once per execution, in `runManifest`.

✅ **Do** take `stores` from `Dependencies` in new code.

❌ **Don't** call `sqliteStore`, `postgresStore` or `openStoreIn` from code that takes `Dependencies`.

**Why:** a test passes `FakeStores`, and nothing touches a file or a database.

- `Stores` is declared here, not in `src/services`, because it returns a `RunDataStore`, and the services layer is below this one.
- The other commands still open the store with `openStore` in `src/cli/dataDir.ts`, which calls `openStoreIn`.

## The fakes

```ts
// 👍 Good
const stores = new FakeStores();
await stores.store.recordExecution(execution);

expect(stores.store.executions).toEqual([execution]);
expect(stores.opened).toEqual([]);
```

- **`FakeRunDataStore`**
  - Orders records as the SQLite store does: `executions` newest first, `containerRuns` by execution, permutation, iteration.
  - `writes` lists each write, e.g. `recordContainerRun 01a 1-2`.
  - `failWith(message)` makes writes throw a `RunDataStoreError`. `failCheckWith(message)` makes `check()` throw. `undefined` clears either.
  - Records are copied through JSON on the way in and out, as a real store would.
- **`FakeStores`**
  - `store` is the one store every `open` returns, at `memory`.
  - `opened` lists the `dataDir` of each `open`.

✅ **Do** keep `FakeRunDataStore` in step when `RunDataStore` gains a method or an ordering rule.

**Why:** every test of `run` reads its records back from the fake.
