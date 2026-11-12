---
"thunderjar": patch
---

With an image store, `run` removes each postrun image from the runtime once it's pushed and measured, so a remote runtime's disk no longer fills with one image per container run. When iterations run at once, each postrun image is pushed while it's measured, not before.
