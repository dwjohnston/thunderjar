---
"thunderjar": patch
---

Record why an agent exited non-zero. The execution wrapper now sends each turn's stderr to `/thunderjar/stderr.log` (or `/thunderjar/turns/<n>/stderr.log`), and its tail is stored on the container run as `harnessStderr`. `show` lists the last line of it beside each agent that didn't end cleanly, and a container run that didn't shows the last lines of its stderr and result file. The run log warns with both when an agent exits non-zero, and logs the start of a result file whose token costs can't be parsed at debug.
