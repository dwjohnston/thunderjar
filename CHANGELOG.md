# thunderjar

## 0.2.0

### Minor Changes

- 882becb: A parameter's hash is now of what it outputs: its rendered fragment and its `files/` folder, plus a harness's `cli` (rendered with sample values) and `requiredEnv`, a base image's `runOptions`, and an initial prompt's text and timeout. Comments and helper code no longer change any hash. Prerun images are tagged with a separate image hash, of the Dockerfile and `files/` alone, so permutations that build the same image, such as two models of one harness, share it.
- 9ddcf32: Push images to the image store, or keep them local with `imageStore: null`.

  - `imageStore` in `thunderjar.config.ts` can be `null`: images stay in the local Docker daemon, and nothing is pushed. `init` now scaffolds `null`.
  - With an `imageStore` set, `run` and `build` check your `docker login` for its registry before building anything, then push each prerun and postrun image to it.

  **Breaking:** a project scaffolded by an earlier `init` names the placeholder `ghcr.io/your-org/thunderjar-images`, so `run` and `build` now stop at the login check. Set `imageStore: null`, or name your own repository and `docker login` to its registry.

- 882becb: Only a parameter's `files/` folder goes into the build context, and `ctx.dir` points at it: `COPY ${ctx.dir}/scripts/ …` copies `files/scripts/`. Its `index.ts` and other files beside `files/` are never copied. A fragment that names another parameter's folder in the build context, `parameters/<role>`, is a config error.
- 882becb: Remove `checkoutCommit` and `ctx.git`. A code state now clones a repository at a pinned commit in its own `RUN`, e.g. `RUN git clone --quiet <repo> /workspace && git -C /workspace checkout --quiet --detach <commit>`, and the base image sets the git identity. `init` scaffolds both.
- 882becb: A harness is one folder with one `index.ts`, which pins its version: `declareHarness({ version, … })`, with `collectTokenCosts` beside `collectReply`. A test case names a pair as `<harness>/<model ID>`, e.g. `claude-code-2.1.311/claude-haiku-5-5`, and any model ID is accepted. `versions.ts`, `models.ts` and `collectTokenCosts.ts` are gone, with `declareHarnessVersions`, `declareHarnessModels` and `declareTokenCostCollector`. Add `claudeCode({ version, cli? })`, a complete Claude Code harness, which `init` now scaffolds.

### Patch Changes

- 73be23c: Add the `executions` command, which lists past executions from the run data store, newest first, with each one's test case, start time, matrix and status, optionally of one test case.
- bd37e0c: Add a `generate` command, which writes the parameter names declared under `.thunderjar/test-case-parameters/` to `.thunderjar/_generated/parameterNames.d.ts`. The `declareX()` functions are now typed, so a test case that names an undeclared parameter, or an initial prompt of another task, is a type error.
- b3aef1f: Add an `init` command, which scaffolds the `.thunderjar/` configuration folder with an example test case, and the `thunderjar` library entry point that its files import.
- 919fee1: Add a `plan` command.
- 09f10b7: Add a `run` command. So far only `thunderjar run <test case> --dry-run` works: it prints a new execution ID (a ULID), then, for each permutation, its prerun image `thunderjar-prerun:<hash>`, and for each iteration its postrun image `thunderjar-postrun:<execution ID>-<permutation>-<iteration>` and the harness command it would run. Nothing is built or run.
- 0a585bb: Add a `show` command. `thunderjar show <execution>` prints a row per permutation, by its varying parameters, with each measure aggregated across its iterations by its measurement's methods: a `rate` as `<true>/<measured>`, a `mean` or `median` to one decimal place. Skipped or errored measures are left out of the aggregate, which is starred, and listed with their reasons. `thunderjar show <execution> <permutation>-<iteration>` prints one container run: its parameters, harness and model, duration, exit code, and each measure. Both take `--data-dir`.
- b971a68: Add a `view` command, which starts a local web page for browsing the run data store: a list of executions, and each execution's container runs with their parameters, how the agent ran, and each measure. It takes `--data-dir` and `--port`.
- 7bfb412: Every parameter's `declareX()` (`declareBaseImage`, `declareCodeState`, `declarePromptSet`, `declareHarness`, `declareInitialPrompt`) takes an optional `config` and an `applyParameter(config, ctx)` that returns the Dockerfile fragment applying it. `config` is typed from the declaration's own `config`; `ctx.dir` is the parameter's folder in the build context, and a harness also gets `ctx.version`. A base image's `applyParameter` is required and must start with `FROM`.
- a2a26ad: Add `thunderjar build <test case> --dry-run`, which prints each prerun image's name and Dockerfile and builds nothing. `plan` now shows whether each permutation's prerun image is `built` or `missing` (or `unknown`, with a warning, when Docker can't be reached). `build`, `run` and `plan` take `--image-prefix <name>`, to name images `<name>-prerun:<hash>` and `<name>-postrun:…` instead of `thunderjar-…`.
- 865fe2b: `thunderjar build <test case>` now builds the prerun Docker image of each permutation, unless it already exists. Permutations with the same hash share one image. It prints `Building <image> ... done` for each image it builds, then how many it built and how many were already present.
- 882becb: Add `build: { secrets: [{ id, env }], ssh }` to `declareConfig`, for credentials a prerun build needs, such as a token to clone a private repository. Each build gets `docker build --secret id=<id>,env=<env>`, and `--ssh default`, for fragments to mount with `RUN --mount=type=secret,id=<id>` or `RUN --mount=type=ssh`. Secrets are never in an image layer, the run data or a hash. `plan`, `build` and `run` stop if a secret's variable is unset.
- ec63709: `init` scaffolds two test cases in place of `example`: `compare-models`, Claude Code on Haiku 4.5 and Haiku 5.5, and `compare-harnesses`, Haiku 5.5 in Claude Code, GitHub Copilot CLI and OpenCode. OpenCode's starter models gain `haiku-5-5`.
- cf6a0bc: `init` scaffolds more starter files to copy and edit: its `baseline` code state checks out the project's current commit, its `snerk` prompt set copies files from a commit, a second prompt set, `house-style`, commits files kept in its folder, and there are starter harnesses for Copilot CLI, Codex and OpenCode, beside Claude Code. The example test case still uses only Claude Code, so it needs one key.
- d1b17ac: `init`'s example task gets two more measurements: a template test of `isPrime.ts`, and a count of `@ts-ignore`s. Its `node20` base image now installs bun, which the template test runs with.
- 217b63b: Take each task's measurements of every container run. `run` measures each run as it finishes, each measurement in a container of its own from the run's postrun image, prints its measures under it, and records them in the run data store. Measurements use the built-in `fileCreated`, `grep` and `templateTest` instruments; `declareMeasurement` types each one's `config` and `aggregate` by its instrument, and `plan` and `run` reject a measurement that doesn't fit its instrument. `init`'s `tsconfig.json` leaves out `*.template.ts` files.
- 7d0e877: Enforce an initial prompt's `timeoutSeconds`: an agent still running after it is killed, and its container committed and measured all the same. `run` says whether each agent timed out, exited non-zero or left no result file, `show` lists those container runs below an execution's table, and shows how one ended. A timed out run makes the execution `failed`.
- 9dedf87: An initial prompt can be a list of `turns`, beside a single `prompt`. Each turn runs the harness's `cli` again in the same container, with `ctx.turn` and `ctx.sessionId`, a fresh UUID per container run, so the agent can resume its session. Each turn's reply is recorded, `replyMatches` takes an optional `turn`, `run --dry-run` prints each turn's command, and `show` each turn's reply. The timeout covers every turn together, and a turn that exits non-zero stops the turns after it.
- 96bf10e: `thunderjar plan <test case>` also prints the test case's matrix shape and every permutation, each with the first 8 characters of its content hash. The hash comes from the content of each parameter's declaration, not its name, plus the model ID the harness resolves the model to. A harness's `models.ts` and `versions.ts` (beyond the chosen entries) and a task's measurements are left out.
- 81f7926: `thunderjar plan <test case>` summarises the parameters a test case names. A broken `.thunderjar/` folder is reported by `plan` and `generate` as `Error:` lines naming the file and field, with exit code 1, instead of a stack trace.
- 63d7eb2: Write the initial prompt to a file in the container, `ctx.promptPath`, so a harness's `cli` can pass it to the agent intact, quotes, `$`, backticks and newlines included. `init`'s Claude Code harness reads it with `claude -p "$(cat ...)"`, and `run --dry-run` shows the prompt beside the command.
- 7b0c584: `init`'s Claude Code harness now runs as it is: it installs Claude Code as root, then runs it as the image's non-root `node` user, so it can skip its permission prompts, reads the prompt from its file, asks for JSON, reads its reply and token costs from it, and starts a session on the first turn and resumes it on the next.
- 6326ce8: Add `collectReply` to a harness, which reads the agent's final reply from its result file, and the `replyMatches` instrument, which measures whether that reply matches a regular expression. Each container run's reply is recorded, and `show <execution> <container run>` prints it.
- 19d55d6: Pass each harness's `requiredEnv` into its own containers, as `docker run -e NAME`. `plan` and `run` stop before building anything when one is unset, naming the variable and the harness that needs it, and `run --dry-run` lists the variables each container run is given, by name.
- 882becb: Add `resolve` to every parameter declaration, for floating parameters such as a branch's latest commit. It runs on the host once per execution, before anything is hashed, with `ctx.exec(command)`, and its result reaches `applyParameter`, and a harness's `cli`, as `ctx.resolved`. Only the text it ends up in is hashed. Each container run records what each parameter resolved to, and `plan` and `show` display it. A `resolve` that throws stops `plan`, `build` and `run` before anything is built.
- 5bf9da9: `thunderjar run <test case>` now runs the test case. It builds any missing prerun image, then runs each iteration of each permutation in a Docker container from its prerun image, inside an execution wrapper that records when the agent started and finished and how it exited, and commits the container into its postrun image. It prints a line for each iteration as it finishes, then where it wrote the results. Each execution, and each container run with the agent's result file, is recorded in the run data store: JSON files under `.thunderjar/.data/runs/<execution ID>/`, or under `--data-dir <dir>`. An agent exiting non-zero is recorded and the rest still run, but `run` exits 1.
- 1f7c170: A base image can declare `runOptions`, more `docker run` options for its agent containers, such as `--security-opt seccomp=unconfined` for agents that sandbox themselves with user namespaces. They're part of its parameter hash, and `run --dry-run` prints them.
- fb9cad7: Add the `shell` instrument, which runs any shell command in the measurement container and measures whether it exits 0.
- d3c74af: Collect each container run's token costs with its harness's `collectTokenCosts`, summed across turns, and record them. `run` prints each run's cost, or its tokens when its cost can't be trusted, `show` adds the mean tokens and cost of each permutation, and the per-model breakdown of one container run. The library exports `claudeCodeTokenCosts` and `claudeCodeReply`, which read `claude -p --output-format json`, and `init`'s Claude Code harness uses them.

## 0.1.2

### Patch Changes

- 4d96a4d: Add a `generate` command.

## 0.1.1

### Patch Changes

- 7255961: Add a Commander-based CLI with a placeholder `init` command, and generate CLI reference docs from it.

## 0.1.0

### Minor Changes

- de6a4a1: Initial release: `npx thunderjar` prints "hello world!".
