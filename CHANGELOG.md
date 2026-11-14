# thunderjar

## 0.3.0

### Minor Changes

- b48cf0c: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Model: Claude
  Session Id: session_01LCLeLkGEjKg1CyLY5YY6bJ
  Supervising engineer: Claude

  Humans: add your notes here
  -->

  Write everything a run needs into the prerun image, with each parameter's `applyParameter`. Running an iteration is then just `sh /thunderjar/thunderjar-run.sh`, so a prerun image can be run, or read, without the project's config.

  - A harness's fragment installs the agent and writes `/thunderjar/thunderjar-run.sh` and `/thunderjar/model.txt`, with the new `writeRunScript(command)` and `writeModel(ctx.modelId)`. It gets the pair's model ID as `ctx.modelId`. `claudeCode()` and the `init` starters do this for you.
  - An initial prompt's fragment writes `/thunderjar/prompt.txt`, with the new `writePrompt(text)`.
  - The helpers are `COPY <<'EOF' <path>` heredocs, so the Dockerfile shows what's written. `writeFile(path, contents)` writes any other file.
  - The script runs in the image's working directory. A code state or initial prompt fragment can set `WORKDIR`, e.g. to run the agent in one package of a monorepo, and measurements run there too.
  - Breaking: a harness's `cli` is gone, and so is `claudeCode`'s `cli` option, now `command`. Write the run script in `applyParameter`.
  - Breaking: an initial prompt's `prompt` field is gone. Write it with `applyParameter: () => writePrompt("…")`.
  - Breaking: multi-turn initial prompts (`turns`) and per-run session IDs are removed, for now.
  - Breaking: each model and initial prompt has its own prerun image, so every image and permutation hash changes. They share every layer below the one they differ in.

- de5bd07: Breaking: measurements declare `metrics` instead of `aggregate`, and instruments store values of any shape.

  - `aggregate` is removed. A measurement declares one or more `metrics`, each `{ score?, stat, better? }`: `metrics: { count: { stat: "mean" } }` replaces `aggregate: ["mean"]`. A `score` reads a number or a boolean from the instrument's value, or `undefined` where the metric doesn't apply; left out, the instrument's default score is used. Metrics are computed when results are read, so changing one needs no remeasuring. `show` has a column per metric, `<measurement>.<metric>`.
  - `templateTest` is replaced by `bunTestFile`: an ordinary Bun test file, which reads the agent's file from `Bun.env.THUNDERJAR_SUBJECT`. Its value is `{ passed, total }`, and its default score the pass rate.
  - `shell`'s stored value is now `{ exitCode, stdout, stdoutTruncated }`, not a boolean. Its default score is still whether it exited 0. stdout is stored as it is, up to 64 KiB, so a command that prints secrets will persist them.
  - Measures stored before this release are stale: their content hash now includes the instrument's version. Run again to measure them.

- 4003b95: Run containers on a remote runtime, and check the setup with `thunderjar doctor`.

  - `runtime: { command: [...] }` in `thunderjar.config.ts` names any command that takes the `docker` CLI's arguments, e.g. `["docker", "--context", "cloud"]` or `["docker", "-H", "ssh://me@build-host"]`. `run` sends every container command there: run, exec, copy, commit, push of postrun images, and removal.
  - Prerun images are still built and pushed locally. The runtime pulls them from the image store before any agent runs, and runs them with `--pull missing`. So a `runtime` needs an `imageStore`, and the runtime needs its own login for the registry.
  - `run --local` ignores the runtime and runs on the local Docker daemon.
  - New `thunderjar doctor` checks the config and the image store login, and, with a runtime, builds and pushes a tiny probe image, then pulls it through the runtime.

- 1f7224e: Rename the default parameters folder from `.thunderjar/test-case-parameters/` to `.thunderjar/parameters/`. Move an existing folder to the new name.

### Patch Changes

- b134422: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Session Id: session_01LCLeLgv5gxJw77saoeNdjw
  Supervising engineer: dwjohnston
  -->

  Show why an agent didn't end cleanly. The end of each turn's standard error is now stored on the container run as `harnessStderr`. `show` lists the last line of it beside each agent that didn't end cleanly, and a container run that didn't shows the last lines of its standard error and result file.

- 9b28071: Colour the CLI's output on a terminal: every command, its `--help`, and `Error:` and `Warning:` lines. Piped output stays plain, `NO_COLOR` turns colour off, and `FORCE_COLOR` turns it on.
- c9b7a00: Build several prerun images at once with `build: { concurrency: <n> }` in `thunderjar.config.ts`. With it, or a runtime `concurrency`, above 1, `run` starts each iteration as soon as its own prerun image is built, pushed and pulled, instead of waiting for every image first.
- 5f97634: Add stub guide pages for getting started, motivation, how it works, and what Thunderjar is not suitable for.
- f1407e9: Add a splash page to the docs home page, a light/dark theme toggle (dark by default), a favicon, and a hazard-stripe banner across the top of the docs pages.
- 8459b39: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Session Id: session_01LCLeLkjATuQXxaawiKKoPy
  Supervising engineer: David Johnston
  -->

  Run a whole execution on the runtime machine, not command by command from the host. Opt in with `runtime.runner` in `thunderjar.config.ts`.

  - `run` builds a runner image, holding Thunderjar and the project's `.thunderjar/` folder, pushes it to the image store, and starts it on the runtime as a container with the runtime's Docker socket.
  - The runner runs each container, collects and measures it, pushes its postrun image and writes every record to the run data store. The host only follows its progress, with the same output and `--json` as before.
  - The variables the execution needs, e.g. model API keys and the run data store's URL, are sent to the runner as it starts, and kept in memory only. So is `THUNDERJAR_START_TIMEOUT_SECONDS`, if it's set.
  - Ctrl-C detaches from the execution instead of stopping it. `thunderjar attach <execution ID>` follows it again, and `attach --stop` stops it.
  - The runtime must already be running: `beforeExecution` and `afterExecution` can't be given with a runner.
  - Without `runtime.runner`, and with `run --local`, nothing changes.

- b44353b: Add `--json` to `executions`, `plan`, `doctor`, `build` and `run`, like `show --json`: the command's results on stdout as JSON, for scripts. With `--json`, progress and human-readable text go to stderr instead. `build --dry-run --json` and `run --dry-run --json` print the dry run as JSON.
- 4b55198: A container that times out is killed with up to three tries of `docker kill`. If none succeeds, e.g. a remote runtime can't be reached, `run` stops waiting for it and records it as timed out, instead of waiting forever.
- 7a83888: `run` with several containers at once, on a terminal, gives each iteration one line that's rewritten in place as it runs, pushes and is measured, with how long its current step has taken counting up. Piped or redirected output is unchanged.
- 474e7c0: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Model: claude-opus-5-5
  Session Id: c07c882c-639c-493c-8957-caa40aa841ac
  Supervising engineer: blacksheep-bot
  -->

  Say in the run log why an agent failed. Each turn's standard error now goes to a `stderr.log` beside its result file, which is also kept in the postrun image. When an agent exits non-zero or times out, the log gets a `WARN` with the end of each turn's standard error and result file.

- 4b55198: The diagnostic log says how long each image push, pull, container commit and container run's measurements took, and how long the whole execution took.
- 4d2241f: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Session Id: session_01LCLeLkjATuQXxaawiKKoPy
  Supervising engineer: David Johnston
  -->

  Measure a container run in one measurement container, not one per measurement, and send it each command over one connection, a shell session, rather than a `docker exec` each. On a runtime far away, where each Docker command costs several round trips, measuring a run takes less than half as long: 9.1 s to 4.2 s for the gauntlet's six measurements on Fly.io, and 10.2 s to 4.6 s with 15 runs measured at once. Its measurements now share the container, taken one after another in their declared order, so one sees what an earlier one wrote. `bunTestFile` removes the test it writes once it has run.

- 884ecfa: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Session Id: session_01LCLeLhpmETxGQ7SW8synkm
  Supervising engineer: David Johnston
  -->

  Add a diagnostic log. Each command writes what it's doing to a new file in `.thunderjar/logs/`: each image build, container run and measurement, and with `-v`, each Docker command, with Docker's whole error output when it fails. Set where with `--log-file` or `THUNDERJAR_LOG_FILE`, and how much with `-v`, `--log-level` or `THUNDERJAR_LOG_LEVEL`. Nothing of it is written to the terminal. `init` now git-ignores `logs/`: add `logs/` to `.thunderjar/.gitignore` in a project initialised before.

- 963d48c: When iterations run at once, each postrun image is pushed while it's measured, not before.
- 4d2241f: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Session Id: session_01LCLeLkjATuQXxaawiKKoPy
  Supervising engineer: David Johnston
  -->

  Make executions on a remote runtime more reliable, faster, and easier to debug.

  - `run` checks the run data store before it builds or starts anything, reports a store failure as an error rather than a stack trace, and retries a failed Postgres query twice.
  - `run` interrupted with Ctrl-C or SIGTERM removes its execution's containers and runs the runtime's `afterExecution`, instead of leaving agents and the runtime running.
  - `run` ends with the agents that didn't end cleanly, grouped by how and why. The hint of why, in `run` and `show`, is the error the harness reported in its result file, e.g. `402: This request would exceed your available credits`, ahead of the last line of its stderr.
  - `run --timings` prints how long each phase took, summed over the execution. The log has the same, the runtime's disk usage before and after, and why token costs were unparseable.
  - A failed build's error includes the end of the failed step's output, not only Docker's last line.

- 714ba2c: `run --iterations <n>` runs `<n>` iterations of each permutation, instead of the test case's `iterations`. It also applies to `--dry-run`.
- 4d2241f: `run`: an agent's timeout now counts from when its container has started, not from `docker run`, so a runtime that's slow to start a container no longer eats into it. A container that never starts, within 10 minutes (`THUNDERJAR_START_TIMEOUT_SECONDS`), or whose `docker run` fails before it does, is recorded as that run's outcome, `failed to start`, with why, and the execution goes on with its other runs instead of stopping.
- 86c5e66: Run several containers at once.

  - `runtime: { command: [...], concurrency: 4 }` in `thunderjar.config.ts` runs up to 4 iterations' containers on the runtime at once. It defaults to 1, one after another, as before.
  - `run --concurrency <n>` overrides it for one run, including with `--local`.
  - With more than one at once, `run` writes `Up to <n> containers at once`, then each line whole, starting with its iteration: `started`, how its agent ended, its postrun push, and its measures.
  - If Docker fails, no more containers start, and those running finish before `run` stops.

- 4d2241f: <!--
  🤖
  This file was created with AI

  Harness: Claude Code
  Session Id: session_01LCLeLkjATuQXxaawiKKoPy
  Supervising engineer: David Johnston
  -->

  Rename the runtime's `beforeRun` and `afterRun` to `beforeExecution` and `afterExecution`: they run once per execution, not once per run. The old names still work, with a warning naming the new one. Giving both a hook's names is an error.

- 60c2826: Add `beforeExecution` and `afterExecution` to a runtime in `thunderjar.config.ts`: commands `run` runs once before the execution and once after it, e.g. to start a remote runtime and size it for the execution, then release it. Each is given `THUNDERJAR_CONCURRENCY`, `THUNDERJAR_CONTAINERS` and `THUNDERJAR_EXECUTION_ID`.
- 4d2241f: `run` no longer pushes a prerun image the image store already has, or pulls one into a runtime that already has it. It asks the registry once per image, and lists the runtime's images in one command. An image built on the runtime's own daemon isn't pulled either.
- 4b55198: With a runtime, `run` no longer builds and pushes a prerun image the image store already has: it only pulls it into the runtime. A fresh machine, such as a CI runner, used to rebuild every prerun image, because only the local Docker daemon was asked whether it existed.
- e0c66e5: The run data store is now a SQLite file, at the config's `runDataStore: sqliteStore({ path })`, resolved against the project folder. `--data-dir <dir>` now means `<dir>/runs.sqlite`. `run`, `executions`, `show` and `view` all read and write it; the folder of JSON files is gone. A `runDataStore` that isn't a store is a config error.

  Add `postgresStore({ urlEnv })`, a run data store in a shared Postgres database, by `Bun.sql`, so CI and developers see the same runs. Its connection URL is read from the named environment variable, never the config. `init` scaffolds it as a commented-out example beside the default `sqliteStore`.

- cf18679: `view` shows each permutation as one row, with its measures aggregated by their measurements' methods, as `show` does, and expands to show each iteration. It adds Base image and Initial prompt columns, and a "Hide common parameters" toggle. Like `show`, it now needs the project's `.thunderjar/` folder, for the measurements.

  `show --json` prints an execution's summary, the same one `view` renders, or a container run's record.

- e6ff671: `view` shows the model ID in the Harness / model column for runs that record only a model ID.
- e6ff671: Show time, tokens and cost in `thunderjar view`. The executions list adds each execution's duration and its runs' total tokens and cost. An execution's page adds those totals, plus each run's tokens and cost, and gives durations as `m:ss`. A total that leaves out runs without token costs is starred.
- d02c8d7: Count how long each step of `build`, `run` and `doctor` has been waiting. On a terminal, each step's line shows a timer after its `...`, updated once a second, until it ends with `done`, `ok` or `failed`. `run` also shows a `Measuring ...` line with a timer while a container run is measured, which its measures then replace. Piped output is unchanged.

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
