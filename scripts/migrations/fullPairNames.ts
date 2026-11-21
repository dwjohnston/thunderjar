// One-off migration for task 3851: harness model pairs now name every variant part, e.g.
// "codex-0.166.0/openai/gpt-6-luna" became "codex-0.166.0/openai/gpt-6-luna/medium". Rewrites the
// test cases in .thunderjar/ and the recorded runs to full names. Each harness's parts are its
// agent's documented default, hard-coded here: nothing else configures them.

/** The parts appended to a pair, by the start of its harness folder: each agent's default effort. */
export const DEFAULT_PARTS: Record<string, string[]> = {
  // Codex's model_reasoning_effort defaults to medium.
  "codex-": ["medium"],
};

/** `pair`, with its harness's default parts appended, unless it has them already. */
export function migratePair(pair: string): string {
  const harness = pair.slice(0, pair.indexOf("/"));
  const parts = Object.entries(DEFAULT_PARTS).find(([prefix]) => harness.startsWith(prefix))?.[1];
  if (parts === undefined || pair.endsWith(`/${parts.join("/")}`)) return pair;
  return `${pair}/${parts.join("/")}`;
}
