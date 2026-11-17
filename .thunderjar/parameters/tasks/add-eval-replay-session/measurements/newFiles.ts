/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLiMoXaxn9oYmSnwtm3
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */

import { declareMeasurement } from "thunderjar-published";

// The agent picks its own names, so this looks at the files that are new since the starting tag:
// added in commits, staged, or untracked. The code state resets the tag to the commit it checks out.
// Prints one JSON object; each metric reads one field of it. A field is null when there is no new
// file of the kind it reads.
const command = String.raw`base=tj-codestate-thunderjar-1
new=$( { git diff --name-only --diff-filter=A "$base" --; git ls-files --others --exclude-standard; } | sort -u )
pick() { printf '%s\n' "$new" | grep -E "$1"; }
has() { [ -n "$1" ] && echo true || echo false; }
codeStates=$(pick '^\.thunderjar/parameters/codeStates/[^/]+/index\.ts$')
prompts=$(pick '^\.thunderjar/parameters/tasks/[^/]+/initial-prompts/[^/]+\.ts$')
measurements=$(pick '^\.thunderjar/parameters/tasks/[^/]+/measurements/[^/]+\.ts$')
testCases=$(pick '^\.thunderjar/test-cases/[^/]+\.ts$')
task=false
for p in $prompts; do
  d=$(dirname "$(dirname "$p")")
  printf '%s\n' "$measurements" | grep -qF "$d/measurements/" && task=true
done
# 2. Some new code state names the tag and uses resolve; none hard-codes the commit (7+ chars).
tagNotCommit=null
if [ -n "$codeStates" ]; then
  tagNotCommit=false
  for f in $codeStates; do
    grep -qF tj-codestate-thunderjar-1 "$f" && grep -qw resolve "$f" && tagNotCommit=true
  done
  grep -qF 9a8e07d $codeStates && tagNotCommit=false
fi
# 3. Some new initial prompt keeps the nested prompt.
promptVerbatim=null
if [ -n "$prompts" ]; then
  promptVerbatim=false
  for f in $prompts; do
    grep -qF 'Say hello' "$f" \
      && grep -qF 'bunx thunderjar capture install --harness claude-code' "$f" \
      && grep -qF 0e7d397a3071f86b937a40987a50c9c546bb0543 "$f" && promptVerbatim=true
  done
fi
# 4. Some new test case has the parameters asked for.
testCaseWired=null
if [ -n "$testCases" ]; then
  testCaseWired=false
  for f in $testCases; do
    grep -qF 'claude-code-2.1.311/claude-opus-5-5' "$f" \
      && grep -qE "[\"']none[\"']" "$f" \
      && grep -qE "[\"']node20[\"']" "$f" \
      && grep -qE 'iterations:[[:space:]]*1([^0-9]|$)' "$f" && testCaseWired=true
  done
fi
# 5. Some new measurement can tell a hard-coded commit.
checksPin=null
if [ -n "$measurements" ]; then
  checksPin=false
  grep -qF 0e7d397a3071f86b937a40987a50c9c546bb0543 $measurements && checksPin=true
fi
printf '{"codeState":%s,"task":%s,"testCase":%s,"tagNotCommit":%s,"promptVerbatim":%s,"testCaseWired":%s,"checksPin":%s}\n' \
  "$(has "$codeStates")" "$task" "$(has "$testCases")" \
  "$tagNotCommit" "$promptVerbatim" "$testCaseWired" "$checksPin"`;

type Found = {
  codeState: boolean;
  task: boolean;
  testCase: boolean;
  tagNotCommit: boolean | null;
  promptVerbatim: boolean | null;
  testCaseWired: boolean | null;
  checksPin: boolean | null;
};

const found = (v: { exitCode: number; stdout: string }): Found | undefined =>
  v.exitCode === 0 ? (JSON.parse(v.stdout) as Found) : undefined;

// null, for no new file of that kind, means the metric doesn't apply.
const field = (key: "tagNotCommit" | "promptVerbatim" | "testCaseWired" | "checksPin") =>
  (v: { exitCode: number; stdout: string }) => found(v)?.[key] ?? undefined;

export default declareMeasurement({
  instrument: "shell",
  config: { command },
  metrics: {
    // 1. A code state, a task with an initial prompt and a measurement, and a test case, all new.
    rightFilesCreated: {
      score: (v) => {
        const f = found(v);
        return f && f.codeState && f.task && f.testCase;
      },
      stat: "rate",
      better: "higher",
    },
    // 2. The new code state names the tag and resolves it, rather than hard-coding the commit.
    tagNotCommit: { score: field("tagNotCommit"), stat: "rate", better: "higher" },
    // 3. The nested prompt was kept, not paraphrased.
    promptVerbatim: { score: field("promptVerbatim"), stat: "rate", better: "higher" },
    // 4. Harness model, prompt set, base image and iterations as asked.
    testCaseWired: { score: field("testCaseWired"), stat: "rate", better: "higher" },
    // 5. A measurement that names the commit, so it can catch a code state that hard-codes it.
    measurementChecksPin: { score: field("checksPin"), stat: "rate", better: "higher" },
  },
});
