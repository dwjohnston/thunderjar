---
"thunderjar": patch
---

A base image can declare `runOptions`, more `docker run` options for its agent containers, such as `--security-opt seccomp=unconfined` for agents that sandbox themselves with user namespaces. They're part of its parameter hash, and `run --dry-run` prints them.
