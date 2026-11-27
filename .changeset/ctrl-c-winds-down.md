---
"thunderjar": patch
---

Ctrl+C now winds `run` down: runs not yet started never start, and running agents are stopped, their runs recorded as abandoned, while committed runs finish measuring and uploading. A second Ctrl+C, or SIGTERM, force quits: measurements and pushes are stopped. An interrupted `run` exits 130, or 143 for SIGTERM.
