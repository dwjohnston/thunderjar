export default {
  instrument: "fileCreated",
  config: { glob: "**/isPrime.ts" },
  metrics: { exists: { stat: "rate" } },
};
