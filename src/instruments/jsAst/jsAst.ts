import esquery from "esquery";
import { parseSync, visitorKeys } from "oxc-parser";
import type { Instrument } from "../instrument.ts";

export type JsAstValue = { file: string; matches: Record<string, number>; parseError?: string }[];

type Node = Parameters<typeof esquery.match>[0];

/** Where esquery finds each node's children: oxc's own keys, which cover TypeScript's nodes. */
const options = { visitorKeys: visitorKeys as Record<string, readonly string[]> } as esquery.ESQueryOptions;

/**
 * For each JavaScript or TypeScript file matching `glob`, how many nodes of its syntax tree each
 * of `selectors` matches. The files are read through the context and parsed on the host with
 * oxc, so it doesn't depend on anything in the image.
 */
export const jsAst: Instrument<{ glob: string; selectors: Record<string, string> }, JsAstValue> = {
  version: 1,
  async evaluate({ glob, selectors }, ctx) {
    const parsed = Object.entries(selectors).map(([name, selector]) => [name, esquery.parse(selector)] as const);
    const value: JsAstValue = [];
    for (const file of await ctx.glob(glob)) {
      const { program } = parseSync(file, await ctx.readFile(file));
      const matches: Record<string, number> = {};
      for (const [name, selector] of parsed) matches[name] = esquery.match(program as unknown as Node, selector, options).length;
      value.push({ file, matches });
    }
    return { outcome: "measured", data: value };
  },
  checkConfig() {
    return [];
  },
};
