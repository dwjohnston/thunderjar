# 2300: Container run options

A base image can declare extra `docker run` options, so agents that need more of the kernel, such as Claude Code's bubblewrap sandbox, can run.

The ai-experiments security experiments test Claude Code's sandbox. On Linux that sandbox is bubblewrap, which needs user namespaces that Docker blocks by default.

## Version bump type

minor

## Artifacts

- `runOptions` on `declareBaseImage`, e.g. `["--security-opt", "seccomp=unconfined"]`
- Part of the base image's parameter hash
- `run --dry-run` prints them

## Example CLI Output

```
$ thunderjar run sandboxed --dry-run
...
 1  iteration 1/1  claude-code@2.1.283/haiku-4-5 | read-env
    docker:   --security-opt seccomp=unconfined --security-opt apparmor=unconfined
    command:  ...
```

## Tests

- Config in, check stdout, for `--dry-run`
- Run on docker container tests: `bwrap` runs inside a container with the options, and fails without them

## Human interventions

None.

## Open questions

- Should run options belong to the base image or the harness? The sandbox is a harness feature, but the options are about the machine.
- Which options are the least needed? `--privileged` works but is broad.
