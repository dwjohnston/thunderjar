import { checkString, type Instrument } from "../instrument.ts";

/**
 * Whether the agent invoked the skill `skill`, by name, as its harness's `collectSkillsInvoked`
 * read it in the measurement container. `skipped`, saying why, when the skills can't be read.
 */
export const skillInvoked: Instrument<{ skill: string }, boolean> = {
  version: 1,
  defaultScore: { kind: "boolean", score: (value) => value },
  async evaluate({ skill }, ctx) {
    const invoked = await ctx.skillsInvoked();
    if (invoked.outcome !== "collected") return { outcome: "skipped", reason: `no skills invoked to read: ${invoked.reason}` };
    return { outcome: "measured", data: invoked.skills.includes(skill) };
  },
  checkConfig(config) {
    return checkString("config.skill", (config as { skill?: unknown } | undefined)?.skill, "a skill's name");
  },
};
