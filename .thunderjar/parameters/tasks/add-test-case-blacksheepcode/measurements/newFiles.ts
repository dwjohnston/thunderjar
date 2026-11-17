/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLkf5f7yremSqsRgCrm
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar-published";

// The agent picks its own names, so this looks at the files that are new since the starting tag:
// added in commits, staged, or untracked. The code state resets the tag to the commit it checks out.
// Prints one JSON object; each metric reads one field of it.
const command = String.raw`base=tj-codestate-thunderjar-1
new=$( { git diff --name-only --diff-filter=A "$base" --; git ls-files --others --exclude-standard; } | sort -u )
any() { printf '%s\n' "$new" | grep -Eq "$1" && echo true || echo false; }
codeStates=$(printf '%s\n' "$new" | grep -E '^\.thunderjar/parameters/codeStates/[^/]+/index\.ts$')
prompts=$(printf '%s\n' "$new" | grep -E '^\.thunderjar/parameters/tasks/[^/]+/initial-prompts/[^/]+\.ts$')
task=false
for p in $prompts; do
  d=$(dirname "$(dirname "$p")")
  printf '%s\n' "$new" | grep -F "$d/measurements/" | grep -q '\.ts$' && task=true
done
if [ -z "$codeStates" ]; then namesTag=null; noCommit=null; else
  namesTag=false; grep -lF tj-codestate-1 $codeStates >/dev/null && namesTag=true
  noCommit=true; grep -lF 0e7d397a3071f86b937a40987a50c9c546bb0543 $codeStates >/dev/null && noCommit=false
fi
printf '{"codeState":%s,"task":%s,"testCase":%s,"measurement":%s,"namesTag":%s,"noCommit":%s}\n' \
  "$([ -n "$codeStates" ] && echo true || echo false)" "$task" \
  "$(any '^\.thunderjar/test-cases/[^/]+\.ts$')" \
  "$(any '^\.thunderjar/parameters/tasks/[^/]+/measurements/')" \
  "$namesTag" "$noCommit"`;

type Found = {
  codeState: boolean;
  task: boolean;
  testCase: boolean;
  measurement: boolean;
  namesTag: boolean | null;
  noCommit: boolean | null;
};

const found = (v: { exitCode: number; stdout: string }): Found | undefined =>
  v.exitCode === 0 ? (JSON.parse(v.stdout) as Found) : undefined;

export default declareMeasurement({
  instrument: "shell",
  config: { command },
  metrics: {
    // 1. Each file the test case needs, created new.
    codeStateCreated: { score: (v) => found(v)?.codeState, stat: "rate", better: "higher" },
    // A task with an initial prompt and a measurement of its own.
    taskCreated: { score: (v) => found(v)?.task, stat: "rate", better: "higher" },
    testCaseCreated: { score: (v) => found(v)?.testCase, stat: "rate", better: "higher" },
    // 2. The new code state names the tag, and doesn't hard-code the commit it resolves to.
    // Doesn't apply without a new code state.
    tagNotCommit: {
      score: (v) => {
        const f = found(v);
        if (!f || f.namesTag === null || f.noCommit === null) return undefined;
        return f.namesTag && f.noCommit;
      },
      stat: "rate",
      better: "higher",
    },
    // 3. Any new file under a task's measurements/, in any format.
    measurementCreated: { score: (v) => found(v)?.measurement, stat: "rate", better: "higher" },
  },
});
