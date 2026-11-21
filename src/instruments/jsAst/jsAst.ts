import type { Instrument } from "../instrument.ts";

export type JsAstValue = { file: string; matches: Record<string, number>; parseError?: string }[];

export const jsAst: Instrument<{ glob: string; selectors: Record<string, string> }, JsAstValue> = {
  version: 1,
  async evaluate() {
    return { outcome: "measured", data: [] };
  },
  checkConfig() {
    return [];
  },
};
