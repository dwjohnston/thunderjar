


An **experiment** consists of defining a matrix of one or more application **code state**, with a given **prompt set** and assigning an **agent harness** and **agent model** a **task**. A task consists of a **task instruction** which is the initial prompt, and **task measurements** which measure the outcome of the AI run. 

The code state/prompt set/agent harness/agent model/task instruction are known as **experiment parameters**

Experiment parameters are always defined in a folder like

```
experiement-parameters/ 
   promptSets/
       promptSet1/
           index.ts
       promptSet2/
           index.ts
   codeStates/ 
       codeState1/ 
           index.ts
```

The full content of the given experiement parameter determines a **parameter hash**. Experiment parameters should be considered _deterministic_ - that is, if the content of the file does not change, nor should it's ultimate effect on the experiment run. As such the content of experiment parameters should not make API calls, etc. 

The matrix of experiment parameters creates a set of permutations. 

An **experiment executation** is the running of all of the permuations. The permutations are run in a **container run**. 

A **container run** looks like this: 

- The intial state of the container is created from: 
  - The code state ( the code is checked out to a certain commit)
  - The prompt set ( AGENT.md files are applied in a certain state)
  - The harness ( the harness is installed pinned to a certain version)
  - Arbitrary other tooling. The user can configure the application to have databases exist etc.

  This container is given a **permuation tag**. 

  The harness is then run headlessly with the task instruction and model specified. 

  When the run completes, then the task measurements are applied. 

  The task measurements produce **container run metadata** for that container run. This is stored in the **run data store**. 

  The final state of the container is commited and tagged to be preserved. It is saved in the **image store** - typically a docker repository. 

  






  Questions: 

  - What is the format of the permuation tag


  Terms I'm iffy about: 

  - Container run metadata doesn't sound right. - Container run measurements?
  - Run data store - 









# Terminology

Glossary of project-specific terms, used consistently across all other spec pages.
Grouped by where each concept sits in the pipeline: what a task is, how tasks get
swept into an experiment, how an experiment executes, and how execution gets measured.

## Task parameters

The values that define what happens, and from what state. Holding all but one of
these fixed across a comparison is what makes two container runs comparable — see
[Experiment Parameters](06-experiment-parameters.md) for the hashing mechanics.

| Term | Definition | Example |
|---|---|---|
| **Task** | A starting code state plus a task instruction, plus the measurements that judge the result. Defines *what* the agent does and *from what state*. | `add-function` |
| **Task instruction** | The text sent to the agent telling it what to do. Passed to a harness's `cli` callback as `ctx.taskInstruction`. Distinct from a prompt set, which shapes the agent's environment rather than directing its work. | "Write a TypeScript function called `add`…" |
| **Code state** | The codebase a container run starts from — typically a pinned git commit. Pinned on the task by default; a floating experiment (deferred) may instead resolve it at execution time. | commit `a1b2c3` |
| **Prompt set** | A named, reusable action that overlays prompt files into the worktree before a run (`CLAUDE.md`, skills, rules), expressed as a shell command. | `snerk`: copy `base_prompt_snerk.md` to `CLAUDE.md` |
| **Harness** | A named, content-hashed definition of an agent tool and how to invoke it headlessly, including the exact harness version. Comparing two versions of the same tool is just comparing two named harnesses. | `claude-code`, `opencode`, `cursor` |
| **Model** | The harness's root model. A harness may itself delegate to other models; those are recorded as an outcome, not controlled as a parameter. | `claude-haiku-4-5-20251001` |

## Experiments

| Term | Definition | Example |
|---|---|---|
| **Experiment definition** | A named, version-controlled comparison: one task plus a set of swept experiment parameters. Written down once; produces one permutation per combination. | `snerk-vs-glurk` |
| **Experiment parameter** | One swept axis of an experiment — harness, model, prompt set, or code state. | 1 harness × 1 model × 2 prompt sets |
| **Permutation** | One specific combination of experiment parameter values within an experiment definition. | `snerk / haiku / claude-code` |
| **Experiment execution** | One occasion of running an experiment definition: it fans out into one container run per permutation, repeated per iteration. | "this week's run of `snerk-vs-glurk`" |
| **Pinned experiment** | An experiment definition whose code state and prompt set are fixed to exact, unchanging values, used to lock in a known case and track it statically over time. The only kind supported in the first pass. | |
| **Floating experiment** *(deferred)* | An experiment definition that resolves a moving target (e.g. "latest on main") at execution time, to catch drift as the codebase or prompts evolve. Not in scope for the first pass — see [Open Questions](13-open-questions.md). | |

## Execution

| Term | Definition | Example |
|---|---|---|
| **Worktree** | The checked-out working directory inside a container — code state plus prompt set overlaid on top — that the harness actually runs against. | `ctx.worktreePath` |
| **Container run** | The concrete unit of work: a Docker container spun up for one permutation, running the harness against the worktree once. | |
| **Iteration** | One repeat of a container run for the same permutation, used to build pass-rate statistics. Each iteration gets its own container and ID. | iteration 37 of 100 |
| **Standard outputs** | Data captured from every container run for free, regardless of task: final text block, commit list, changed-file diff, cost, tokens, duration. | `total_cost_usd: 0.021` |
| **Artifact** | What a container run produces and preserves: the committed container image plus its summary metadata. | |

## Measurement

Deliberately neutral vocabulary — Thunderjar produces *measurements*, not pass/fail
verdicts. Verdicts, where wanted, are derived from a measure by the user (e.g.
`exitCode === expectedExitCode`); Thunderjar itself doesn't bake one in.

| Term | Definition | Example |
|---|---|---|
| **Measuring instrument** | Single-purpose, reusable evaluation logic — built-in or user-defined — parameterised by a config type and a value type. | `grep`, `fileCreated`, `templateTest` |
| **Measurement** | A measuring instrument plus a specific config, declared on a task. Copied per task, never shared by reference. | `grep` for `@ts-ignore` in `output/*.ts` |
| **Measure** | The value one measurement produced for one iteration: a `MeasurementResult<T>`. | `{ outcome: 'measured', data: false }` |
| **Result** | The set of measures for an iteration, keyed by measurement identity. Can grow after the run — new measurements can be backfilled against a preserved artifact without re-running the agent. | 3 measures at run time, 6 after a backfill |
| **Content hash** | A hash of the content that defines a harness, prompt set, task instruction, or measurement. Stored alongside the name to prove two runs are actually comparable, and to catch silent drift when a named definition's content changes underneath it. | `snerk@3f9a1c` |

```ts
type MeasurementResult<T> =
  | { outcome: 'measured'; data: T }
  | { outcome: 'skipped' }                            // could not be evaluated, e.g. no output existed
  | { outcome: 'erroredWhileMeasuring'; error: Error } // the measuring instrument itself threw
```

## Open questions

- "Artifact" is used here narrowly, for what a container run produces. Whether it
  should instead become the formal umbrella term for every hashed, reusable
  definition (harness, prompt set, measuring instrument, and possibly code state)
  was raised and dropped for this pass — revisit if the two meanings start to collide.
- "Container run" assumes Docker specifically. If execution ever moves off
  containers, this term will need revisiting (tracked in [Open Questions](13-open-questions.md)).
- Measurements are copy-per-task rather than shared by reference, specifically to
  avoid a shared measurement change silently invalidating comparisons across every
  task that references it. Revisit if duplication becomes painful.
