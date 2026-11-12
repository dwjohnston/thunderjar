---
"thunderjar": patch
---

Show why an agent failed in `show`. The end of each turn's stderr is kept on its container run as `harnessStderr`. `show <execution>` puts its last line beside each agent that didn't end cleanly, and `show <execution> <run>` shows the last lines of the stderr and result file of a run that didn't.
