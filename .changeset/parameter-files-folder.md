---
"thunderjar": minor
---

Only a parameter's `files/` folder goes into the build context, and `ctx.dir` points at it: `COPY ${ctx.dir}/scripts/ …` copies `files/scripts/`. Its `index.ts` and other files beside `files/` are never copied. A fragment that names another parameter's folder in the build context, `parameters/<role>`, is a config error.
