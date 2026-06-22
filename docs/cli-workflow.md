# CLI Workflow

```
thunderjar
├── Run experiment
│   └── [experiment names from config]
│       ├── Fake — create worktrees + write placeholder measurement results to bench/results/ (each measurement set to PASS)
│       └── Real — create worktrees only (harness execution not yet implemented)
└── List experiment results
    └── [experiment names from config]
        └── [runs listed by datetime, short ISO to the minute e.g. 2026-06-22 10:00, newest first]
            └── [permutations listed by prompt--model--harness]
                └── Checkout / Cancel
```
