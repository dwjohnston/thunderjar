---
"thunderjar": patch
---

<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLgv5gxJw77saoeNdjw
Supervising engineer: dwjohnston
-->

Show why an agent didn't end cleanly. The end of each turn's standard error is now stored on the container run as `harnessStderr`. `show` lists the last line of it beside each agent that didn't end cleanly, and a container run that didn't shows the last lines of its standard error and result file.
