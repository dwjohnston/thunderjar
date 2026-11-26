import { type Instrument, show } from "../instrument.ts";

/**
 * Whether the agent invoked each of `skills`, by name, as its harness's `collectSkillsInvoked`
 * read them in the measurement container: `{ [skill]: boolean }`. `skipped`, saying why, when the
 * skills can't be read.
 */
export const skillInvoked: Instrument<{ skills: string[] }, Record<string, boolean>> = {
  version: 1,
  async evaluate({ skills }, ctx) {
    const invoked = await ctx.skillsInvoked();
    if (invoked.outcome !== "collected") return { outcome: "skipped", reason: `no skills invoked to read: ${invoked.reason}` };
    return { outcome: "measured", data: Object.fromEntries(skills.map((skill) => [skill, invoked.skills.includes(skill)])) };
  },
  checkConfig(config) {
    const { skills } = (config ?? {}) as { skills?: unknown };
    const ok = Array.isArray(skills) && skills.length > 0 && skills.every((skill) => typeof skill === "string" && skill !== "");
    return ok ? [] : [["config.skills", `must be a list of skills' names, at least one, got ${show(skills)}`]];
  },
};
