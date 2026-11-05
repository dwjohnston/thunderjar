import { declareMeasurement } from "thunderjar-published";

// The trap: generate.test.ts and init.test.ts both pin 0201's contents, so they fail unless updated.
export default declareMeasurement({
  instrument: "shell",
  config: { command: "bun test" },
  aggregate: ["rate"],
});
