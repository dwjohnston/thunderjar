<!-- Mockup: AI-generated draft of the configuration section. -->
# Project structure

Everything Thunderjar reads lives in `.thunderjar/`. Each `.ts` file default-exports one `declareX()` call. The folder a file sits in decides what it declares.

```txt
.thunderjar/
├── thunderjar.config.ts            declareConfig
├── test-cases/
│   └── example.ts                  declareTestCase
└── parameters/
    ├── baseImages/
    │   └── node20/
    │       └── index.ts            declareBaseImage
    ├── codeStates/
    │   └── baseline/
    │       ├── index.ts            declareCodeState
    │       └── files/              copied into the build context
    ├── promptSets/
    │   └── snerk/
    │       └── index.ts            declarePromptSet
    ├── harnessModels/
    │   └── claude-code-2.1.311/
    │       └── index.ts            declareHarness
    └── tasks/
        └── is-prime/
            ├── initial-prompts/
            │   └── plain.ts        declareInitialPrompt
            └── measurements/
                └── isPrimeTsExists.ts  declareMeasurement
```

## How the pieces fit

| Folder | Declares | Name comes from |
| --- | --- | --- |
| `thunderjar.config.ts` | Where images and run data are stored | — |
| `test-cases/` | Which combinations of parameters to run, and how often | file name |
| `parameters/baseImages/` | The image's `FROM` and system tools | folder name |
| `parameters/codeStates/` | What's in `/workspace` when the agent starts | folder name |
| `parameters/promptSets/` | `AGENTS.md`, skills and other prompt files | folder name |
| `parameters/harnessModels/` | How to install and run an agent | folder name |
| `parameters/tasks/<task>/initial-prompts/` | What the agent is asked | file name |
| `parameters/tasks/<task>/measurements/` | What is measured afterwards | file name |

A test case refers to parameters by name. Run `thunderjar generate` after adding one, so the names are type-checked.

```ts
// test-cases/example.ts
import { declareTestCase } from "thunderjar";

export default declareTestCase({
  baseImage: ["node20"],
  codeState: ["baseline"],
  promptSet: ["snerk"],
  harnessModel: ["claude-code-2.1.311/claude-sonnet-5-5"],
  task: "is-prime",
  initialPrompt: ["plain"],
  iterations: 5,
});
```

See the [declaration reference](./reference) for every option.
