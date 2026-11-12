# Configuration Folder Structure

Where Thunderjar configuration lives inside a user's project. What goes in each file is
elsewhere: experiments in [055-declaring-experiments.md](055-declaring-experiments.md),
parameters in [060-experiment-parameters.md](060-experiment-parameters.md).

## Example project

```
my-app/
├── src/                                   # the user's codebase — what code states clone
└── .thunderjar/
    ├── package.json                       # only for non-JS projects; created by `init`
    ├── .gitignore                         # created by `init`: _generated/, .data/ (+ node_modules/ if nested)
    ├── thunderjar.config.ts               # global config: stores, image store, build secrets
    ├── test-cases/
    │   └── is-prime-baseline.ts           # declareTestCase(...)
    ├── parameters/
    │   ├── baseImages/
    │   │   └── node20/
    │   │       └── index.ts               # declareBaseImage(...)
    │   ├── codeStates/
    │   │   ├── baseline/
    │   │   │   └── index.ts               # declareCodeState(...): clones a repository at a pinned commit
    │   │   └── with-fixture/
    │   │       ├── index.ts               # COPY ${ctx.dir}/seed-fixture-data.sh …
    │   │       ├── helpers.ts             # never copied or hashed: only what it renders is
    │   │       └── files/
    │   │           └── seed-fixture-data.sh   # copied into the build context, and hashed
    │   ├── promptSets/
    │   │   └── house-style/
    │   │       ├── index.ts               # declarePromptSet(...): COPY ${ctx.dir}/ /workspace/
    │   │       └── files/
    │   │           └── AGENTS.md
    │   ├── harnessModels/
    │   │   ├── claude-code-2.1.311/
    │   │   │   └── index.ts               # claudeCode({ version: "2.1.311" })
    │   │   └── opencode-1.19.5/
    │   │       └── index.ts               # declareHarness({ version: "1.19.5", … })
    │   └── tasks/
    │       └── is-prime/
    │           ├── initial-prompts/
    │           │   ├── plain.ts           # declareInitialPrompt(...). Hashed.
    │           │   └── terse.ts
    │           └── measurements/          # NOT in any parameter hash
    │               ├── isPrimeTsExists.ts
    │               ├── isPrimeTests.ts
    │               ├── isPrime.test.ts
    │               └── isPrime.reference.ts
    └── _generated/
        └── parameterNames.d.ts            # generated from the folders above; git-ignored
```

## What lives where

- **The user's own files stay where they are.** A code state clones the project's
  repository, or any other, at a pinned commit, in its own `RUN`.
- **One folder per parameter**, under `parameters/<kind>/<name>/`. The folder
  name is the parameter's name. Its hash is of what it outputs, not of the folder: see
  [060](060-experiment-parameters.md#hashing). Its `index.ts` may import from anywhere,
  e.g. a helper shared by several parameters.
- **A harness folder pins one version**, and holds one `index.ts`. Name it after the
  version, `claude-code-2.1.311/`, and copy it to try another. A test case names a pair as
  `<harness>/<model ID>`: see [064](064-harness.md).
- **A task folder holds the task's initial prompts and its measurements.** The folder
  name is the task. `initial-prompts/` has one file per wording, and each is an
  experiment parameter value, hashed on its own. `measurements/` holds the task
  measurements, shared by every initial prompt of the task. They live together because
  measurements are meaningless apart from their task, but `measurements/` is **in no
  parameter hash**: measurements don't affect the prerun or postrun image, so changing
  them must not change the permutation hash.
- **One file per measurement, named by its file.** `isPrimeTsExists.ts` is the
  measurement `isPrimeTsExists`. Supporting files, like a `bunTestFile` test, sit
  alongside.
- **Test cases live outside `parameters/`.** A test case isn't a parameter;
  it's a matrix over them.
- **Generated types live in `_generated/`.** They are built from the folder names above
  and git-ignored — see
  [055-declaring-experiments.md](055-declaring-experiments.md#typed-names).

### A parameter's `files/` folder

A folder parameter (base image, code state, prompt set, harness) keeps what its fragment
copies into the image in a `files/` folder beside its `index.ts`.

- **Only `files/` goes into the build context**, at `ctx.dir`, with symlinks followed:
  `COPY ${ctx.dir}/scripts/ /opt/agent/` copies `files/scripts/`. A parameter without one
  copies nothing. Its `index.ts`, and anything else beside `files/`, never reaches the build.
- **`files/` is hashed by content**, with the fragment, so changing a file in it changes only
  its parameter's hash.
- **A fragment can only use its own `files/`.** `ctx.dir` names the parameter's role, e.g.
  `parameters/promptSet`, not its folder. A fragment that names another parameter's,
  `parameters/<role>`, is a config error naming its file.

## Open questions

- What else `thunderjar.config.ts` holds beyond the stores and build secrets.

`.thunderjar/` is a fixed location, found by walking up from the current directory. See
[050-setup-and-configure.md](050-setup-and-configure.md#install-and-init).
