import type { Commit } from "../../api/declarations.ts";
import type { Instrument } from "../instrument.ts";

/** The `git log` arguments `parseGitLog` reads the output of. */
export const GIT_LOG_ARGS = "";

/** Parses the output of `git log` run with `GIT_LOG_ARGS` into commits, in the order printed. */
export function parseGitLog(_output: string): Commit[] {
  throw new Error("not implemented");
}

export const commits: Instrument<Record<string, never>, Commit[]> = {
  version: 1,
  async evaluate() {
    return { outcome: "skipped", reason: "not implemented" };
  },
  checkConfig: () => [],
};
