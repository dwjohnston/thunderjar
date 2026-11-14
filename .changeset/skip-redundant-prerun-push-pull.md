---
"thunderjar": patch
---

`run` no longer pushes a prerun image the image store already has, or pulls one into a runtime that already has it. It asks the registry once per image, and lists the runtime's images in one command. An image built on the runtime's own daemon isn't pulled either.
