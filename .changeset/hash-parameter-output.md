---
"thunderjar": minor
---

A parameter's hash is now of what it outputs: its rendered fragment and its `files/` folder, plus a harness's `cli` (rendered with sample values) and `requiredEnv`, a base image's `runOptions`, and an initial prompt's text and timeout. Comments and helper code no longer change any hash. Prerun images are tagged with a separate image hash, of the Dockerfile and `files/` alone, so permutations that build the same image, such as two models of one harness, share it.
