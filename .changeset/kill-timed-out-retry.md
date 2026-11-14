---
"thunderjar": patch
---

A container that times out is killed with up to three tries of `docker kill`. If none succeeds, e.g. a remote runtime can't be reached, `run` stops waiting for it and records it as timed out, instead of waiting forever.
