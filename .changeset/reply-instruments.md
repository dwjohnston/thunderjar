---
"thunderjar": patch
---

Add `collectReply` to a harness, which reads the agent's final reply from its result file, and the `replyMatches` instrument, which measures whether that reply matches a regular expression. Each container run's reply is recorded, and `show <execution> <container run>` prints it.
