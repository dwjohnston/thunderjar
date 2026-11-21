---
"thunderjar": patch
---

Add the `jsAst` instrument: for each JavaScript or TypeScript file matching `glob`, how many nodes of its syntax tree each of `selectors`, esquery selectors by name, matches. A file that doesn't parse counts 0, with its `parseError`.
