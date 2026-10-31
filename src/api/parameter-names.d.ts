// Fallback ambient types for the parameter names a test case selects.
//
// `thunderjar generate` writes a project-specific `_generated/parameter-names.d.ts`
// declaring these same global names as literal unions (see
// spec/055-declaring-test-cases.md#typed-names). A real project's own TypeScript
// program sees only that generated file, never this one — this file exists solely so
// that this package's own declarations (which reference these names directly, with no
// import) type-check on their own, and so a program that hasn't run `generate` yet
// still compiles, permissively.

type BaseImageName = string;
type CodeStateName = string;
type PromptSetName = string;
type TaskName = string;
type InitialPromptNames = Record<string, string>;
type HarnessModelName = string;
