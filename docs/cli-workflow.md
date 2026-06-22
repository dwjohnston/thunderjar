# CLI Workflow

```
thunderjar
├── Run experiment
│   └── [experiment names from config]
│       ├── Fake — create worktrees + write placeholder measurement results to bench/results/ (each measurement set to PASS)
│       └── Real — create worktrees only (harness execution not yet implemented)
└── List experiment results
    └── [experiment names from config]
        └── (not yet implemented)
```
