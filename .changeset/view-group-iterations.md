---
"thunderjar": patch
---

`view` shows each permutation as one row, with its measures aggregated by their measurements' methods, as `show` does, and expands to show each iteration. It adds Base image and Initial prompt columns, and a "Hide common parameters" toggle. Like `show`, it now needs the project's `.thunderjar/` folder, for the measurements.

`show --json` prints an execution's summary, the same one `view` renders, or a container run's record.
