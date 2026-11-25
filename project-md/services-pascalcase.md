---
name: services-pascalcase
description: Thunderjar src/services/ folders and files are PascalCased (Clock/Clock.ts, FakeClock.ts)
metadata:
  type: feedback
---

Services in `src/services/` are always PascalCased: `src/services/Clock/Clock.ts`, `Clock.test.ts`, `FakeClock.ts`.

**Why:** user's convention; `src/services/HUMANS.md` writes `<service name>`, which doesn't show the casing.
**How to apply:** any new service folder, its file and its fake. Related: [[codestate-tags-via-resolve]]
