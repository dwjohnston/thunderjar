# Docs scripts

| Script | What it does |
|---|---|
| `bun run docs:data` | Generates `docs/.vitepress/data.generated.json` by building the CLI's Commander program and reading what's registered to it.  |
| `bun run docs:dev` | Runs `docs:data`, then starts the dev server for the current docs. Has live reload on `docs/` files, but not on the generated files from CLI files. Add `-- --host` to reach it from outside the container. |
| `bun run docs:build` | Runs `docs:data`, then builds the current docs to `docs/.vitepress/dist`. |
| `bun run docs:preview` | Serves the output of `docs:build`, to check the built site. |
| `bun run docs:build:versions` | Builds the docs of every stable release tag into `.versioned-docs/dist`, which is what gets published. Tags with identical docs share one build. CI runs this one. |
