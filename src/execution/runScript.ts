/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: Claude
 * Session Id: session_01LCLeLkGEjKg1CyLY5YY6bJ
 * Supervising engineer: Claude
 *
 *
 * Humans: add your notes here
 *
 *
 */
// What a container runs: the prerun image's `/thunderjar/thunderjar-run.sh`, which its harness's
// fragment wrote, timed. Everything the agent needs is in the image; Thunderjar adds only the
// timing, to RUN_PATH, which is committed into the postrun image with the rest.
import { RESULT_PATH, RUN_SCRIPT_PATH } from "../api/files.ts";

export { MODEL_PATH, PROMPT_PATH, RESULT_PATH, RUN_SCRIPT_PATH } from "../api/files.ts";

/** Where, inside the container, Thunderjar records how the run script ran. */
export const RUN_PATH = "/thunderjar/run.json";

/**
 * Where, inside the container, Thunderjar sends the run script's standard error, beside its result
 * file. Otherwise it would be lost: the container's own output is discarded, and the timed run
 * itself always exits 0.
 */
export const STDERR_PATH = "/thunderjar/stderr.log";

/**
 * A shell function, `now_ms`, printing the ms since the epoch. GNU date gives them with
 * `date +%s%3N`; busybox date (Alpine) prints seconds or a literal `%3N`, so anything that isn't
 * 13 digits falls back to whole seconds times 1000.
 */
export const NOW_MS_FUNCTION = [
  "now_ms() {",
  "  ms=$(date +%s%3N)",
  "  case $ms in",
  `    ${"[0-9]".repeat(13)}) echo "$ms" ;;`,
  "    *) echo $(( $(date +%s) * 1000 )) ;;",
  "  esac",
  "}",
].join("\n");

/**
 * What a container runs: `sh /thunderjar/thunderjar-run.sh`, writing when it started and finished
 * (ms since the epoch) and how it exited to RUN_PATH. When it starts, RUN_PATH holds only its
 * start, so a run killed for taking too long still says when it started. It removes any result
 * file first, so a result is always this run's. The script's standard error goes to STDERR_PATH.
 */
export const timedRun = (): string =>
  [
    NOW_MS_FUNCTION,
    "start=$(now_ms)",
    `echo "{\\"startedAt\\":$start}" > ${RUN_PATH}`,
    `rm -f ${RESULT_PATH}`,
    `sh ${RUN_SCRIPT_PATH} 2> ${STDERR_PATH}`,
    "code=$?",
    "end=$(now_ms)",
    `echo "{\\"startedAt\\":$start,\\"finishedAt\\":$end,\\"exitCode\\":$code}" > ${RUN_PATH}`,
  ].join("\n");
