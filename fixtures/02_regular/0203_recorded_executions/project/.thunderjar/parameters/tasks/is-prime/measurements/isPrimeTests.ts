import { declareMeasurement } from "thunderjar";

export default declareMeasurement({
  instrument: "bunTestFile",
  config: { subject: "**/isPrime.ts", test: "./isPrime.test.ts" },
  metrics: {
    // bunTestFile's default score is the pass rate: passed / total, or undefined when total is 0.
    passRate: { stat: "mean", better: "higher" },
    // Anything else reads the stored { passed, total } with a score.
    passed: { score: (v) => v.passed, stat: "mean", better: "higher" },
  },
});
