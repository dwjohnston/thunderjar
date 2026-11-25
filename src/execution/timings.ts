/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkjATuQXxaawiKKoPy
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

// How long each phase of an execution took, summed over everything that went through it: its
// builds, pushes, pulls, agents, commits and measurements. Shown by `run --timings`, so a slow
// execution says where its time went. Timed by run/timed.ts, into the run state.

/** The phases of an execution, in the order they're reported. */
export const PHASES = ["build", "pushPrerun", "pullPrerun", "agent", "collect", "commit", "secretSearch", "pushPostrun", "measure"] as const;
