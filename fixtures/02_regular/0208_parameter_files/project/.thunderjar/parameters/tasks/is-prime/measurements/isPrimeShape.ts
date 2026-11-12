import { declareMeasurement } from "thunderjar";

// What isPrime.ts looks like: one shell command, run once, prints JSON, and each metric reads
// it from the stored stdout.
const shape = (v: { exitCode: number; stdout: string }) =>
  v.exitCode === 0 ? (JSON.parse(v.stdout) as { lines: number; comments: number; exports: number }) : undefined;

export default declareMeasurement({
  instrument: "shell",
  config: {
    // Prints e.g. {"lines":3,"comments":2,"exports":1}. Exits non-zero when isPrime.ts is missing.
    command: String.raw`node -e '
      const src = require("fs").readFileSync("isPrime.ts", "utf8").trimEnd();
      console.log(JSON.stringify({
        lines: src.split("\n").length,
        comments: (src.match(/^\s*\/\//gm) ?? []).length,
        exports: (src.match(/^export /gm) ?? []).length,
      }));'`,
  },
  metrics: {
    lines: { score: (v) => shape(v)?.lines, stat: "median", better: "lower" },
    comments: { score: (v) => shape(v)?.comments, stat: "mean" },
    singleExport: { score: (v) => (shape(v) ? shape(v)!.exports === 1 : undefined), stat: "rate", better: "higher" },
  },
});
