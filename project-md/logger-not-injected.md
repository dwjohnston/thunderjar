---
name: logger-not-injected
description: The logger is the one exception to DI in thunderjar; modules import moduleLogger from src/log/logger.ts directly
metadata:
  type: project
---

The logger is the one exception to pure DI: code calls `moduleLogger(...)` from src/log/logger.ts directly instead of taking a `logger` from Dependencies.

**Why:** the user decided this (2026-11-25), even though architecture-plan.md lists `logger` among the injected services.
**How to apply:** don't propose making the logger an injected service or a fake for it, and don't count it as a service that still needs creating.
