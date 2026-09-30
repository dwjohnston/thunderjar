
# Terminology

Glossary of project-specific terms, used consistently across all other spec pages.

## Core concepts

### Experiments

An **experiment** consists of:
- A **task**: what the agent is asked to do (a task instruction) and what it is measured on (task measurements)
- A matrix of **experiment parameters** — the values that determine what happened and from what state, and whose combinations produce permutations

🙋‍♂️ Really an experiment is the 5 parameters + and then task measurements occur afterwards. 

Task measurements are not an experiment parameter: they judge the outcome of a container run after the fact, they don't inform what runs or how many permutations there are.

The experiment parameters are: **base image**, **code state**, **prompt set**, **agent harness**, **agent model**, and **task instruction**.

### Experiment parameters

Each of these six values is defined deterministically — if the content does not change, neither should its effect on the experiment run. Do not make API calls or other non-deterministic operations in parameter definitions.

A parameter is not just the plain value shown in the **Example** column below — that's shorthand. Each parameter is a named folder under `experiment-parameters/`, one subfolder per kind, containing at minimum an `index.ts` whose (deterministic) output is the actual value. A folder rather than a bare file, so a definition can bundle scripts, templates, or fixtures alongside it as needs grow, without changing the shape of the system:

```
experiment-parameters/
  baseImages/
    node20/
      index.ts
  codeStates/
    baseline/
      index.ts
  promptSets/
    snerk/
      index.ts
    glurk/
      index.ts
  harnesses/
    claude-code/
      index.ts
  models/
    haiku/
      index.ts
  taskInstructions/
    add-function/
      index.ts
```

| Term | Definition | Example |
|---|---|---|
| **Base image** | The image a permutation's prerun image is built `FROM`, before code state is applied — base OS/runtime plus any extra services a task needs (a database, a message broker) that code state, prompt set, or harness don't provision. Most experiments just use one plain, minimal base image. | `baseImages/node20` → `FROM node:20-bookworm` |
| **Code state** | The codebase the container starts from, applied on top of the base image — most commonly a pinned git commit, but any deterministic function producing the same codebase every time works. | `codeStates/baseline` → commit `a1b2c3` |
| **Prompt set** | The prompt files overlaid into the worktree (`CLAUDE.md`, skills, rules), expressed as a shell command or script. | `promptSets/snerk` → `cp prompts/snerk.md CLAUDE.md` |
| **Agent harness** | An agent tool and how to invoke it headlessly, pinned to an exact version. Comparing two versions means comparing two harnesses. | `harnesses/claude-code` → pinned to version X |
| **Agent model** | The root LLM used by the harness. Sub-agent models are recorded as outcomes, not controlled parameters. | `models/haiku` → `claude-haiku-4-5-20251001` |
| **Task instruction** | The initial prompt telling the agent what to do. Distinct from prompt set, which shapes the environment. | `taskInstructions/add-function` → "Write a TypeScript function called `add`…" |

### Declaration

A **declaration** is the file that determines an experiment parameter — the `index.ts`
inside that parameter's folder, plus anything it bundles. "Base image" names the
parameter; `baseImages/node20/index.ts` is its declaration.

Every declaration exposes an `applyParameter()` function, which returns the Dockerfile
fragment that contributes that parameter to the prerun image. Some declarations carry
more: a harness declaration also says how to invoke the tool and how to read its token
costs back afterwards. See
[060-experiment-parameters.md](060-experiment-parameters.md#declarations-and-applyparameter).

### Parameter hash

The full content of each experiment parameter (base image, code state, prompt set, harness, model, task instruction) produces a **parameter hash**. This hash tags the container and proves two runs are comparable — if any parameter content changes, the hash changes, so two runs are only directly comparable if they share the same hash.

### Permutation

A **permutation** is one specific combination of experiment parameter values. An experiment with matrix shape `1/1/2/1/1/1` (2 prompt sets, everything else fixed) produces 2 permutations.

### Matrix shape

Shorthand for the size of an experiment's parameter matrix, written
`<base images>/<code states>/<prompt sets>/<harnesses>/<models>/<task instructions>` —
one count per experiment parameter, in the same order as the parameter table above. The
product of the six counts is the number of permutations. E.g. `1/1/2/1/1/1` is 1 base
image, 1 code state, 2 prompt sets, 1 harness, 1 model, 1 task instruction — 2
permutations.

A matrix shape of `1/1/1/1/1/1` — every axis fixed to a single value — is a
**single-permutation experiment**: exactly one permutation, so repeated container runs
come only from iteration, not from the matrix.

### Experiment execution

An **experiment execution** is one occasion of running the experiment: it resolves the matrix and runs each permutation, potentially multiple times (for statistics). Identified by an **execution ID** — a ULID, which scopes the postrun image tags produced during that execution. _(Referenced by: [081-docker-tagging.md](081-docker-tagging.md).)_

## Container run lifecycle

### Prerun image

The starting-point image for a permutation: built `FROM` its base image, code state
applied, prompt set overlaid, harness installed and pinned — everything from
**Initial setup** below, before the harness is invoked. Tagged `prerun-h<parameter hash>`
— see [081-docker-tagging.md](081-docker-tagging.md) for the full tag scheme.

One permutation always maps to one prerun image, even for parameters (like model) that
don't actually change the filesystem — simpler than special-casing which parameters
affect the image. Content-addressed, so it's built once and reused as the starting point
for every iteration of that permutation, and reused again if the same permutation (same
parameter hash) runs again later, e.g. a pinned experiment's weekly rerun, rather than
rebuilt from scratch. Pushed to the **image store** so any iteration or runner can pull
it without rebuilding, and so the exact runtime environment stays reproducible.

### Postrun image

The end-state image for one container run: the final filesystem after the harness has
run, captured with `docker commit` *before* any measurement is applied, so it holds the
agent's end state and nothing else. Tagged
`postrun-e<execution ID>-h<parameter hash>-i<iteration index>` — the same parameter hash used in
the prerun image's tag, so which prerun image a postrun image was built from is visible
directly in its own tag, no separate lookup needed. Always new — never reused or shared
across iterations or executions, unlike the prerun image.

### Measurement container

A short-lived container started from a **postrun image** in order to apply that container
run's measurements. In effect a continuation of the run container — same filesystem, same
pinned runtime and installed dependencies — picked up again after the agent has finished.
Files can be written into it (a rendered test file, a fixture) and arbitrary commands run
against it, but it is **never committed**: it is discarded once its measures are recorded,
so the postrun image stays exactly the agent's end state.

Because it is reconstructed from the postrun image rather than being the original
container, one can be started again at any point in the future. That is what makes
backfilling new measurements onto historical runs possible without re-running the agent —
see [085-experiment-results.md](085-experiment-results.md).

### Container run

A **container run** is the concrete execution of one permutation:

1. **Initial setup:**
   - If a prerun image already exists for this permutation's parameter hash, pull and
     reuse it.
   - Otherwise, build one: starting `FROM` the permutation's base image, code state is
     applied, prompt set files are overlaid, harness is installed and pinned to its
     version — then tag and push it as the prerun image.

2. **Execution:**
   - The harness is invoked headlessly with the task instruction and model

3. **Preservation:**
   - The final container state is committed to a new image
   - The image is tagged as the postrun image
   - The image is pushed to the **image store** (e.g., a Docker registry)

4. **Measurement:**
   - A **measurement container** is started from the postrun image
   - The task's measurements are applied to it, then it is discarded

5. **Recording:**
   - Container run metadata and its measures are stored in the **run data store**

Preservation precedes measurement deliberately — see
[080-docker-execution.md](080-docker-execution.md#why-commit-happens-before-measurement).

### Iteration

An **iteration** is one repeat of a container run for the same permutation, used to gather pass-rate statistics. Each iteration gets its own container and a separate ID within the permutation.

## Storage

| Term | Definition |
|---|---|
| **Run data store** | Where container run metadata is persisted: date, the permutation's experiment parameters and parameter hash, measurements, cost, tokens, duration. Enables querying and trending over time. See [085-experiment-results.md](085-experiment-results.md). |
| **Image store** | Registry (e.g., Docker Hub, ECR) where prerun and postrun images are stored, tagged as above, enabling restore and inspection later. A run's OTel trace and session transcript live in its postrun image. |

**Future:** a separate **trace store** for OTel traces and session transcripts, so
viewing one doesn't need a full image pull. See
[020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1).

## Open questions and notes, things not to forget

- **Container run metadata vs. measurements:** What should we call the aggregate of measurements produced by one container run? Candidate: "container run result" or "container run snapshot".
- **Run data store clarity:** Should this have a more specific name? (e.g., "metadata store", "result store")
- Still need to include the concept of measurements 
- The concept that we can later reapply new measurements against previous runs, without having to actually rerun them. 
- The concept of comparing runs over time. It's fine if the the parameters and the measurments are the same, but sometimes we might still want to compare against changing parameters, or with new measurements. 