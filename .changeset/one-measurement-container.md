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

Measure a container run in one measurement container, not one per measurement, and send it each command over one connection, a shell session, rather than a `docker exec` each. On a runtime far away, where each Docker command costs several round trips, measuring a run takes less than half as long: 9.1 s to 4.2 s for the gauntlet's six measurements on Fly.io, and 10.2 s to 4.6 s with 15 runs measured at once. Its measurements now share the container, taken one after another in their declared order, so one sees what an earlier one wrote. `bunTestFile` removes the test it writes once it has run.
