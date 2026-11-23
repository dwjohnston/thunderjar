Tag and ref conventions are:

| For | Tag or ref | Example |
|---|---|---|
| A tag that a codestate references | `thunderjar/codestate/<code-state-name>` | `thunderjar/codestate/thunderjar-humans-md` |
| A tag that a promptset references | `thunderjar/promptset/<promptset-name>` | `thunderjar/promptset/nested-skills-read-tool` |
| The agent's starting commit, **only in the prerun image**. Set by Thunderjar at build | `refs/thunderjar/start` | `refs/thunderjar/start` |
| A captured session's snapshots (ref store) | `refs/thunderjar/capture/<session>/start`, `refs/thunderjar/capture/<session>/turn-<n>` | `refs/thunderjar/capture/4547635f-2161-4e4a-96b8-5b1b3424a8d0/start` |
| A captured session's snapshots (branch store) | `thunderjar/capture/<session>` | `thunderjar/capture/4547635f-2161-4e4a-96b8-5b1b3424a8d0` |
| A ralph loop task's branch | `ralph/<task-number>_<task-name>` | `ralph/4100_code-state-git-checkout` |
