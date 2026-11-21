import esquery from "esquery";
import { parseSync, visitorKeys } from "oxc-parser";
import type { Instrument } from "../instrument.ts";

export type JsAstValue = { file: string; matches: Record<string, number>; parseError?: string }[];

type Node = Parameters<typeof esquery.match>[0];

/** The extensions oxc parses, which give each file's language: JavaScript or TypeScript, with or without JSX. */
export const EXTENSIONS = [".js", ".mjs", ".cjs", ".jsx", ".ts", ".mts", ".cts", ".tsx"] as const;

const isSupported = (file: string) => EXTENSIONS.some((extension) => file.endsWith(extension));

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
    const files = await ctx.glob(glob);
    const unsupported = files.filter((file) => !isSupported(file));
    if (unsupported.length > 0) {
      const reason = `jsAst parses only ${EXTENSIONS.join(", ")} files; ${glob} matches ${unsupported.join(", ")}`;
      return { outcome: "erroredWhileMeasuring", error: new Error(reason) };
    }
    const value: JsAstValue = [];
    for (const file of files) {
      const { program, errors } = parseSync(file, await ctx.readFile(file));
      const matches: Record<string, number> = {};
      // A file that doesn't parse is the agent's to answer for, not a failed measurement: its
      // partial tree isn't counted, so a broken file can't pass by accident.
      const error = errors.find((e) => e.severity === "Error");
      for (const [name, selector] of parsed) matches[name] = error ? 0 : esquery.match(program as unknown as Node, selector, options).length;
      value.push(error ? { file, matches, parseError: error.message } : { file, matches });
    }
    return { outcome: "measured", data: value };
  },
  checkConfig() {
    return [];
  },
};
