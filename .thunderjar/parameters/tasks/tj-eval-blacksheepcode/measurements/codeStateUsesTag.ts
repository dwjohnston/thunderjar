import { declareMeasurement } from "thunderjar-published";

// Does a new code state name the tj-codestate-1 tag, looked up in resolve rather than in applyParameter?
// In the captured session it did: the thing to keep.
export default declareMeasurement({
  instrument: "shell",
  config: {
    command: `f=$(git ls-files --others --exclude-standard -- '.thunderjar/parameters/codeStates/*/index.ts' | xargs grep -l 'tj-codestate-1') && grep -q 'resolve' $f`,
  },
  metrics: { usesTag: { stat: "rate", better: "higher" } },
});
