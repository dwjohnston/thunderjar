import type { FileChanges } from "../../api/declarations.ts";
import type { Instrument } from "../instrument.ts";

export function parseNameStatus(_output: string): FileChanges {
  throw new Error("not implemented");
}

export function parseUntracked(_output: string): string[] {
  throw new Error("not implemented");
}

export function filterByGlob(_changes: FileChanges, _glob: string | undefined): FileChanges {
  throw new Error("not implemented");
}

export const filesChanged: Instrument<{ glob?: string }, FileChanges> = {
  version: 1,
  async evaluate() {
    return { outcome: "skipped", reason: "not implemented" };
  },
  checkConfig: () => [],
};
