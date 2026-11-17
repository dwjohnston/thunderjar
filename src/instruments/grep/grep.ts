import { type Instrument, checkPattern, checkString } from "../instrument.ts";

/** A file's lines, without the empty one after a final newline. */
const lines = (text: string) => (text === "" ? [] : text.replace(/\r?\n$/, "").split(/\r?\n/));

/**
 * The number of lines matching `pattern` across every file matching `glob`. The files are read
 * through the context, so it doesn't depend on the image having a `grep`. `skipped` when no file
 * matches: a run that left nothing to search isn't a count of 0.
 */
export const grep: Instrument<{ glob: string; pattern: string }, number> = {
  version: 1,
  defaultScore: { kind: "number", score: (value) => value },
  async evaluate({ glob, pattern }, ctx) {
    const files = await ctx.glob(glob);
    if (files.length === 0) return { outcome: "skipped", reason: `no file matches ${glob}` };
    const regex = new RegExp(pattern);
    let count = 0;
    for (const file of files) {
      for (const line of lines(await ctx.readFile(file))) if (regex.test(line)) count++;
    }
    return { outcome: "measured", data: count };
  },
  checkConfig(config) {
    const { glob, pattern } = (config ?? {}) as { glob?: unknown; pattern?: unknown };
    return [...checkString("config.glob", glob, "a glob pattern"), ...checkPattern(pattern)];
  },
};
