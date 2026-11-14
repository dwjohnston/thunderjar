---
"thunderjar": patch
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLkjATuQXxaawiKKoPy
Supervising engineer: David Johnston
-->

Rename the runtime's `beforeRun` and `afterRun` to `beforeExecution` and `afterExecution`: they run once per execution, not once per run. The old names still work, with a warning naming the new one. Giving both a hook's names is an error.
