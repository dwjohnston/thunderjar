| # | Fragment | Does | Files it typically creates |
|---|---|---|---|
| 1 | Base image | Must start with `FROM` | – |
| – | `WORKDIR /workspace` | Added by Thunderjar, not a parameter | – |
| 2 | Code state | Gets the codebase into `/workspace` | The codebase, in `/workspace` |
| 3 | Prompt set | Puts its prompt files in `/workspace` | e.g. `AGENTS.md`, skills, in `/workspace` |
| 4 | Harness | Installs the agent, writes the run script and the model ID | `/thunderjar/thunderjar-run.sh`, `/thunderjar/model.txt` |
| 5 | Initial prompt | Writes the prompt; may set `WORKDIR` | `/thunderjar/prompt.txt` |
| – | Run script, at run time | Runs the agent | `/thunderjar/result.json` |


Then each iteration runs `sh /thunderjar/thunderjar-run.sh`, and nothing else.
