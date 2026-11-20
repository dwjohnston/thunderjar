import { type Instrument, checkString } from "../instrument.ts";

/** `true` if `glob` matches a file. Never `skipped`: no match is the answer `false`. */
export const fileCreated: Instrument<{ glob: string }, boolean> = {
  version: 1,
  defaultScore: { kind: "boolean", score: (value) => value },
  async evaluate({ glob }, ctx) {
    return { outcome: "measured", data: (await ctx.glob(glob)).length > 0 };
  },
  checkConfig(config) {
    return checkString("config.glob", (config as { glob?: unknown } | undefined)?.glob, "a glob pattern");
  },
};
