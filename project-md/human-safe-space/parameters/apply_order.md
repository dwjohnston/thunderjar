| # | Fragment | Does |
|---|---|---|
| 1 | Base image | Must start with `FROM` |
| – | `WORKDIR /workspace` | Added by Thunderjar, not a parameter |
| 2 | Code state | Gets the codebase into `/workspace` |
| 3 | Prompt set | Puts its prompt files in `/workspace` |
| 4 | Harness | Installs the agent, writes the run script and the model ID |
| 5 | Initial prompt | Writes the prompt; may set `WORKDIR` |

Then each iteration runs `sh /thunderjar/thunderjar-run.sh`, and nothing else.

| File | Written by | Holds |
|---|---|---|
| `/thunderjar/thunderjar-run.sh` | Harness, e.g. `writeRunScript` | The command that runs the agent |
| `/thunderjar/model.txt` | Harness, e.g. `writeModel(ctx.modelId)` | The model ID |
| `/thunderjar/prompt.txt` | Initial prompt, e.g. `writePrompt` | The prompt |
| `/thunderjar/result.json` | The run script, as it runs | The agent's result, for `collectReply` and `collectTokenCosts` |

- The run script reads the prompt and model from their files, so quotes and newlines reach the agent intact.
- It runs as the image's last `USER`, in its last `WORKDIR`. That's where the agent works.
- The `/thunderjar/` files are made by `COPY`, as root, readable by anyone.
