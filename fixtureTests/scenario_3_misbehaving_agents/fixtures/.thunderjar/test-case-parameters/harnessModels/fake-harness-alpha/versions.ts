import { declareHarnessVersions } from "thunderjar";

export default declareHarnessVersions({
  "1.0.0": { version: "1.0.0" },
  // Leaves a README.md, then fails.
  "1.0.1": { version: "1.0.1", cli: () => `touch README.md && exit 3` },
  // Runs past any timeout under 2 seconds.
  "1.0.2": { version: "1.0.2", cli: () => `touch started.txt && sleep 2 && touch finished.txt` },
});
