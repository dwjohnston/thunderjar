---
"thunderjar": patch
---

A `skillInvoked` instrument, `{ skill }`: whether the agent invoked the skill. A harness tells it how with `collectSkillsInvoked`, which reads the skills in the measurement container; `claudeCode()` reads them from Claude Code's session transcripts. A run whose skills can't be read is skipped. Breaking: `MeasurementContext` has `skillsInvoked()`.
