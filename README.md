
Docs: https://dwjohnston.github.io/thunderjar/


# thunderjar

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.14. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Installing the skills

Thunderjar ships companion agent skills (`tj-observer`, `tj-test-case`) that help you turn everyday work into Thunderjar tasks — see `docs/regular-usage-workflow.md`. Install them into your own project with [`npx skills`](https://github.com/vercel-labs/skills):

```bash
npx skills add dwjohnston/thunderjar
```

Or install a specific skill:

```bash
npx skills add dwjohnston/thunderjar --skill tj-observer
```
