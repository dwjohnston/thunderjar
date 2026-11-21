# .thunderjar

Thunderjar's configuration for this project: parameters in `parameters/`, and the test cases that combine them in `test-cases/`.

## Defaults for new test cases

Use these when writing a new test case, unless the user asks for something else. Write each value into the test case: they're never applied at run time.

- baseImage: node20
- promptSet: snerk
- harnessModel, for a first run: claude-code / claude-haiku-5-5
- harnessModel, to compare harnesses: claude-code / claude-haiku-5-5, copilot / claude-haiku-5.5, opencode / opencode/claude-haiku-5-5
- iterations, for a first run: 1
- iterations, to compare: 5

A harness is named without its version: use the newest version of it in `parameters/harnessModels/`, e.g. `claude-code-2.1.311/claude-haiku-5-5`.

There's no default code state. A test case starts where the task needs it to, so choose one each time.
