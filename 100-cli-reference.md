# CLI Reference

The actual CLI commands.

The first pass is scriptable only: one-shot commands, machine-readable output, exit-code
driven. Interactive mode is out of scope (see
[020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1)), so everything a person
would do in one is done with the commands below. Command names are provisional.

## Commands

| Command | Purpose |
|---|---|
| [`init`](#init) | Scaffold the configuration folder. |
| [`generate`](#generate) | Emit the typed parameter names. |
| [`plan`](#plan) | Dry run: show what an experiment would do. |
| [`run`](#run) | Run an experiment: one experiment execution. |
| [`executions`](#executions) | List past experiment executions. |
| [`show`](#show) | Show recorded results for an execution or a container run. |
| [`compare`](#compare) | Compare two executions. |
| [`remeasure`](#remeasure) | Apply the current measurements to past runs. |
| [`restore`](#restore) | Bring a container run's end state into the current repository. |

### `init`

```
thunderjar init
```

Scaffolds the `thunderjar/` configuration folder, laid out as in
[051-configuration-folder-structure.md](051-configuration-folder-structure.md). What it
creates, and whether it includes an example experiment, depends on
[050-setup-and-configure.md](050-setup-and-configure.md).

### `generate`

```
thunderjar generate
```

Reads the folder names under `experiment-parameters/` and writes
`_generated/parameter-names.d.ts`, so a misspelled or deleted parameter is a type error in
an experiment file. See [055-declaring-experiments.md](055-declaring-experiments.md#typed-names).
Whether this is a standalone command or runs implicitly before the others is open there.

### `plan`

```
thunderjar plan <experiment>
```

Example:

```
thunderjar plan is-prime-baseline
```

Shows what `run` would do, without running anything and without cost:

- the matrix shape and the permutations it produces,
- each permutation's permutation hash, with floating parameters resolved,
- which prerun images already exist and would be reused, and which would be built,
- how many container runs there would be (permutations × iterations).

### `run`

```
thunderjar run <experiment>
```

Example:

```
thunderjar run is-prime-baseline
```

Runs one experiment execution: resolves the matrix, then for each permutation runs each
iteration as a container run, as described in
[080-docker-execution.md](080-docker-execution.md). Prints the execution ID, which is
what the other commands take.

- **Human output:** progress per permutation and iteration, then a summary.
- **Scripted output:** `--json` prints a JSON summary. The exit code distinguishes a
  success from a regression and from an infrastructure error. See
  [CI workflows](040-user-experience.md#ci-workflows).

Options to narrow a run (for example to a single permutation) are not settled.

### `executions`

```
thunderjar executions [<experiment>]
```

Example:

```
thunderjar executions is-prime-baseline
```

Lists past experiment executions, newest first: execution ID, experiment, date. Exists so
there are IDs to give to `show`, `compare`, `remeasure` and `restore`.

### `show`

```
thunderjar show <execution | container run>
```

Example:

```
thunderjar show 01K4X9J2E8MQZ3V7R5T0WABCDE
thunderjar show postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00
```

Displays recorded results from the run data store. What it shows depends on the ID it is
given:

- **An execution** shows one [aggregation result](030-terminology.md#aggregation-result)
  per permutation: the combined measures across its iterations.
- **A container run** shows that one iteration: its parameters, measures, cost, tokens
  and duration.

An experiment name can stand in for an execution ID, meaning its latest execution.
Supports `--json`.

### `compare`

```
thunderjar compare <execution-a> <execution-b>
```

Example:

```
thunderjar compare 01K4X9J2E8MQZ3V7R5T0WABCDE 01K5A2B7C9D4F6G8H0JKMNPQRS
```

Compares two executions' aggregation results. Which comparisons are legitimate when
permutation hashes differ, and how that is shown, is the open question in
[085-experiment-results.md](085-experiment-results.md#open-questions), and belongs in
[110-cli-report-visualization.md](110-cli-report-visualization.md). Supports `--json`.

### `remeasure`

```
thunderjar remeasure <experiment | execution>
```

Example:

```
thunderjar remeasure is-prime-baseline
thunderjar remeasure 01K4X9J2E8MQZ3V7R5T0WABCDE
```

Applies the measurements that currently exist on the filesystem to past container runs,
without rerunning the agent. Each run is measured in a new
[measurement container](030-terminology.md#measurement-container) started from its
postrun image, and the new measures are added to its recorded
[result](085-experiment-results.md#the-result-record). This is the same path as the
original measurement, not a separate one.

- **An execution** remeasures exactly the container runs in it.
- **An experiment** remeasures every past execution of it.

### `restore`

```
thunderjar restore <container run>
```

Example:

```
thunderjar restore postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i00
```

Run from inside a git repository. Fetches the run's end state and creates the branch
`thunderjar/<container run>`, leaving the working tree untouched. Specified in full in
[090-restore-purge.md](090-restore-purge.md#restore).

## Conventions

- `--json` on every command that reports, for scripting.
- Exit codes: success, regression in a measurement, and infrastructure error are
  distinct.
- Executions are addressed by execution ID and container runs by their ID. How a
  container run is named on the command line is open in
  [090-restore-purge.md](090-restore-purge.md#open-questions).

## Out of scope for the first pass

- **Interactive mode / TUI.** See
  [020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1).
- **`build`**, building and pushing prerun images without running the harness. Likely to
  become useful for testing Thunderjar itself.
- **`list`** for declared experiments, parameters and tasks. These are files in the
  configuration folder.
- **`purge`.** See [090-restore-purge.md](090-restore-purge.md#purge).

## Open questions

- **`compare` as its own command.** It may be a mode of `show`, for example
  `show <a> --against <b>`.
- **`executions` as its own command.** It may be unnecessary if `show` with no argument
  lists recent executions.
- **Narrowing a `run`.** Whether and how to run a subset of permutations.
- **Exit codes.** The exact values, and what counts as a regression.
