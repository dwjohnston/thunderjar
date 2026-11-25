# runNext

The reimplementation of `run`, behind the hidden `run-next` command. See `project-md/human-safe-space/refactor-work/architecture-plan.md`.

## How services reach it

```mermaid
%%{init: {"flowchart": {"wrappingWidth": 500, "padding": 20}}}%%
flowchart TD
  index["src/cli/index.ts: builds every service"] -->|"Services"| program["createProgram(services)"]
  program --> cmd["createRunNextCommand(services)"]
  cmd -->|"on action"| deps["dependencies(services): renames, picks: no new services"]
  deps -->|"Dependencies"| L1["runCommand(name, options, deps)"]
  L1 --> L2["runTestCase(config, deps, mode)"]
  L2 --> L3["runManifest(manifest, deps)"]
```

`dependencies()` only maps one shape onto the other:

| `Services` (src/cli/services.ts) | `Dependencies` (types.ts) |
| --- | --- |
| `runSettings` | `settings` |
| `runDataStore` | `runStore` |
| `io.stdout`, `io.stderr` | `stdout`, `stderr` |
| everything else | same name |

Never build a service here or in the command: add it to `Services` and build it in `src/cli/index.ts`.
