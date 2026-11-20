import { declareCodeState, type CodeStateDeclaration } from "./declarations.ts";

export type CodeStateGitCheckoutConfig = { repo: string } & (
  | { commit: string; branch?: never; tag?: never }
  | { branch: string; commit?: never; tag?: never }
  | { tag: string; commit?: never; branch?: never }
);

export function codeStateGitCheckout(config: CodeStateGitCheckoutConfig): CodeStateDeclaration<CodeStateGitCheckoutConfig, string> {
  return declareCodeState<CodeStateGitCheckoutConfig, string>({ config });
}
