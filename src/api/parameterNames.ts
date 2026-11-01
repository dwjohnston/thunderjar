// The names a project declares under `.thunderjar/test-case-parameters/`. `thunderjar generate`
// writes them to `.thunderjar/_generated/parameterNames.d.ts` as global types, e.g.
// `type TaskName = "is-prime"`, and fills in `ThunderjarParameterNames` with them. Until it
// has run, every name is any string.

declare global {
  interface ThunderjarParameterNames {}
}

type Generated<K extends string, Fallback> = ThunderjarParameterNames extends { [P in K]: infer T } ? T : Fallback;

export type BaseImageNames = Generated<"baseImage", string>;
export type CodeStateNames = Generated<"codeState", string>;
export type PromptSetNames = Generated<"promptSet", string>;
export type TaskNames = Generated<"task", string>;
/** The initial prompts of each task, by task name. */
export type InitialPromptNamesByTask = Generated<"initialPrompt", Record<string, string>>;
/** `<harness>@<version>/<model>`. */
export type HarnessModelNames = Generated<"harnessModel", string>;
