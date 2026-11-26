---
"thunderjar": patch
---

A `skillInvoked` instrument, `{ skills }`: for each skill, whether the agent invoked it. A harness tells it how with `collectSkillsInvoked`, which reads the skills in the measurement container; `claudeCode()` reads them from Claude Code's session transcripts. A run whose skills can't be read is skipped. Breaking: `MeasurementContext` has `skillsInvoked()`.
