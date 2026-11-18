| # | Fragment | Does |
|---|---|---|
| 1 | Base image | Must start with `FROM` |
| – | `WORKDIR /workspace` | Added by Thunderjar, not a parameter |
| 2 | Code state | Gets the codebase into `/workspace` |
| 3 | Prompt set | Puts its prompt files in `/workspace` |
| 4 | Harness | Installs the agent, writes its run script |
| 5 | Initial prompt | Writes `/thunderjar/prompt.txt`; may set `WORKDIR` |