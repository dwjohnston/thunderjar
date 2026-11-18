import { declareMeasurement } from "thunderjar-published";

// Does the new code state check out the tj-codestate-1 tag, rather than pin the commit it points to
// (0e7d397…)? In the captured session it checked out the tag: the thing to keep. Comments are
// ignored, since an agent may note the SHA there.
export default declareMeasurement({
  instrument: "shell",
  config: {
    command: `f=$(git ls-files --others --exclude-standard -- '.thunderjar/parameters/codeStates/*/index.ts' | xargs grep -l 'tj-codestate-1') && code=$(grep -hv '^\\s*//' $f) && echo "$code" | grep -q 'tj-codestate-1' && ! echo "$code" | grep -q '0e7d397'`,
  },
  metrics: { usesTag: { stat: "rate", better: "higher" } },
});
