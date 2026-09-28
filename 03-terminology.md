
# Terminology

Glossary of project-specific terms, used consistently across all other spec pages.

## Core concepts

### Experiments

An **experiment** consists of:
- A **task**: what the agent is asked to do (a task instruction) and what it is measured on (task measurements)
- A matrix of **experiment parameters** — the values that determine what happened and from what state, and whose combinations produce permutations

🙋‍♂️ Really an experiment is the 5 parameters + and then task measurements occur afterwards. 

Task measurements are not an experiment parameter: they judge the outcome of a container run after the fact, they don't inform what runs or how many permutations there are.

The experiment parameters are: **code state**, **prompt set**, **agent harness**, **agent model**, and **task instruction**.

### Experiment parameters

Each of these five values is defined deterministically — if the content does not change, neither should its effect on the experiment run. Do not make API calls or other non-deterministic operations in parameter definitions.

A parameter is not just the plain value shown in the **Example** column below — that's shorthand. Each parameter is a named folder under `experiment-parameters/`, one subfolder per kind, containing at minimum an `index.ts` whose (deterministic) output is the actual value. A folder rather than a bare file, so a definition can bundle scripts, templates, or fixtures alongside it as needs grow, without changing the shape of the system:

```
experiment-parameters/
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
| **Code state** | A pinned git commit (or working tree state), the codebase the container starts from. | `codeStates/baseline` → commit `a1b2c3` |
| **Prompt set** | The prompt files overlaid into the worktree (`CLAUDE.md`, skills, rules), expressed as a shell command or script. | `promptSets/snerk` → `cp prompts/snerk.md CLAUDE.md` |
| **Agent harness** | An agent tool and how to invoke it headlessly, pinned to an exact version. Comparing two versions means comparing two harnesses. | `harnesses/claude-code` → pinned to version X |
| **Agent model** | The root LLM used by the harness. Sub-agent models are recorded as outcomes, not controlled parameters. | `models/haiku` → `claude-haiku-4-5-20251001` |
| **Task instruction** | The initial prompt telling the agent what to do. Distinct from prompt set, which shapes the environment. | `taskInstructions/add-function` → "Write a TypeScript function called `add`…" |

### Parameter hash

The full content of each experiment parameter (code state, prompt set, harness, model, task instruction) produces a **parameter hash**. This hash tags the container and proves two runs are comparable — if any parameter content changes, the hash changes, so two runs are only directly comparable if they share the same hash.

### Permutation

A **permutation** is one specific combination of experiment parameter values. An experiment with 1 harness × 2 prompt sets × 1 model produces 2 permutations.

### Experiment execution

An **experiment execution** is one occasion of running the experiment: it resolves the matrix and runs each permutation, potentially multiple times (for statistics).

## Container run lifecycle

### Permutation tag

Each permutation is tagged with a **permutation tag** — derived from the parameter hashes and the permutation index. Used to identify and track the container image.

### Container run

A **container run** is the concrete execution of one permutation:

1. **Initial setup:**
   - Code state is checked out to the pinned commit
   - Prompt set files are overlaid
   - Harness is installed and pinned to its version
   - Arbitrary other tooling is configured (databases, services, etc.)

2. **Execution:**
   - The harness is invoked headlessly with the task instruction and model

3. **Measurement:**
   - Task measurements are applied to the container's output

4. **Preservation:**
   - The final container state is committed to a container image
   - The image is tagged with the permutation tag
   - The image is pushed to the **image store** (e.g., a Docker registry)
   - Container run metadata is stored in the **run data store**

### Iteration

An **iteration** is one repeat of a container run for the same permutation, used to gather pass-rate statistics. Each iteration gets its own container and a separate ID within the permutation.

## Storage

| Term | Definition |
|---|---|
| **Run data store** | Where container run metadata is persisted: measurements, cost, tokens, duration, git history, final text block. Enables querying and trending over time. |
| **Image store** | Registry (e.g., Docker Hub, ECR) where preserved container images are stored. Tagged by permutation tag, enabling restore and inspection later. |

## Open questions and notes, things not to forget

- **Container run metadata vs. measurements:** What should we call the aggregate of measurements produced by one container run? Candidate: "container run result" or "container run snapshot".
- **Run data store clarity:** Should this have a more specific name? (e.g., "metadata store", "result store")
- Still need to include the concept of measurements 
- The concept that we can later reapply new measurements against previous runs, without having to actually rerun them. 
- The concept of comparing runs over time. It's fine if the the parameters and the measurments are the same, but sometimes we might still want to compare against changing parameters, or with new measurements. 