import { declareMeasurement } from "thunderjar";

// Which skills did the agent invoke, as its harness's collectSkillsInvoked reads them? The value is
// each skill's answer, e.g. { tdd: true, "write-for-the-human": false }: a metric reads its own.
export default declareMeasurement({
  instrument: "skillInvoked",
  config: { skills: ["tdd", "write-for-the-human"] },
  metrics: {
    usedTdd: { score: (v) => v.tdd, stat: "rate", better: "higher" },
    usedWriteForTheHuman: { score: (v) => v["write-for-the-human"], stat: "rate" },
  },
});
