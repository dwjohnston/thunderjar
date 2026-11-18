---
name: concise-output
description: >-
  Enforces extreme brevity and high signal-to-noise so every word justifies its
  existence. Use this skill when writing any response, commit message, PR
  description, README, plan, or status update, or when output drifts into filler
  preambles. Do not use when/for long-form articles that need spine-framework,
  or when structured-writing requires fuller narrative sections.
version: 1.2.0
---

# Concise Output

## Critical rules

- Maximum density: if a word adds no essential information, delete it.
- No filler, no preambles, no announcements of what you will do.
- Prefer bullets/tables over prose unless prose is clearer.
- Active voice, present tense ("Run tests" not "You should run the tests").
- Before cutting or rewriting samples, read [references/examples.md](references/examples.md).

## Workflow

1. Draft the point first (answer, fix, plan step) — no throat-clearing.
2. Cut banned filler and praise (see examples reference).
3. Convert long prose to lists or tables where denser.
4. Self-check: can first/last sentence die? Did I announce? Is every sentence earning place?

## Resources

- [references/examples.md](references/examples.md) — banned phrases, WRONG/CORRECT, density techniques, rationalizations. Read when output drifts verbose.

## Validation

- [ ] First sentence deletable? If yes, delete it
- [ ] No banned filler or praise opener
- [ ] List/table used where denser than paragraphs
- [ ] No announcement of upcoming action
- [ ] Every sentence earns its place

## Constraints

- Completeness may beat compression for deep error analysis, teaching new concepts, or multi-option trade-offs — still cut filler.
- Related: `critical-peer`, `answer-questions-directly`, `confidence-levels`.
