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

// What Thunderjar bakes into each prerun image, beside its parameters' fragments: the model ID,
// the initial prompt, and `thunderjar-run.sh`, the script that runs the agent. Running an
// iteration is then only `sh /thunderjar/thunderjar-run.sh`, so a prerun image holds everything
// a run needs, and can be run, or read, without the project's config.
//
//   /thunderjar/model.txt              the model ID, after the harness's fragment
//   /thunderjar/prompt.txt             a single prompt, or
//   /thunderjar/prompts/<n>.txt        each turn's prompt, counting from 1
//   /thunderjar/thunderjar-run.sh      each turn's harness command, timed, in order
//
// They're written into the build context under `thunderjar/`, laid out as in the image, and
// copied in with COPY. The script runs in the image's working directory: `/workspace`, unless a
// code state or initial prompt fragment sets another with WORKDIR.
//
// What a run leaves goes elsewhere, in folders the script makes as it starts, so the agent's user
// can write them even when COPY made the files above as root:
//
//   /thunderjar/run.json               how it ran: see RUN_PATH
//   /thunderjar/result.json            a single prompt's result, or
//   /thunderjar/turns/<n>/result.json  each turn's
import type { HarnessDeclaration, InitialPromptDeclaration } from "../api/declarations.ts";

/** The folder of the build context Thunderjar's own files are in, laid out as under /thunderjar. */
export const CONTEXT_FOLDER = "thunderjar";

export const RUN_SCRIPT_PATH = "/thunderjar/thunderjar-run.sh";

export const MODEL_PATH = "/thunderjar/model.txt";

/** Where, inside the container, the run script records how the agent ran. */
export const RUN_PATH = "/thunderjar/run.json";

/** Where, inside the container, the harness's `cli` must leave the agent's result file. */
export const RESULT_PATH = "/thunderjar/result.json";

/** Where, inside the container, a single initial prompt is, for the harness's `cli` to read. */
export const PROMPT_PATH = "/thunderjar/prompt.txt";

/**
 * The environment variable holding the run's session ID, which a harness's `cli` gets as
 * `ctx.sessionId`. Thunderjar sets it for each container run; run by hand, the script makes one.
 */
export const SESSION_ID_VARIABLE = "THUNDERJAR_SESSION_ID";

/**
 * Where turn `turn` (counting from 0) of an initial prompt of `count` turns reads its prompt and
 * leaves its result. A single prompt keeps PROMPT_PATH and RESULT_PATH; turns are numbered from 1.
 */
export function turnPaths(turn: number, count: number): { promptPath: string; resultPath: string } {
  if (count === 1) return { promptPath: PROMPT_PATH, resultPath: RESULT_PATH };
  return { promptPath: `/thunderjar/prompts/${turn + 1}.txt`, resultPath: `/thunderjar/turns/${turn + 1}/result.json` };
}

/** The prompts of an initial prompt, one per turn. */
export const promptsOf = (initialPrompt: InitialPromptDeclaration): string[] => initialPrompt.turns ?? [initialPrompt.prompt];

/** One turn: its prompt, where it's baked, where its result goes, and the harness command that runs it. */
export type ScriptTurn = {
  prompt: string;
  promptPath: string;
  resultPath: string;
  /** The harness's `cli` command for the turn. */
  command: string;
};

/**
 * Each turn of `initialPrompt`, with the command `harness`'s `cli` gives for it, for `modelId`,
 * given what the harness resolved to. Its session ID is SESSION_ID_VARIABLE, read as the command runs.
 */
export function scriptTurns(
  harness: HarnessDeclaration,
  modelId: string,
  initialPrompt: InitialPromptDeclaration,
  resolved: unknown,
): ScriptTurn[] {
  const prompts = promptsOf(initialPrompt);
  return prompts.map((prompt, turn) => {
    const paths = turnPaths(turn, prompts.length);
    const command = harness.cli({
      version: harness.version,
      modelId,
      initialPrompt: prompt,
      ...paths,
      turn,
      sessionId: `$${SESSION_ID_VARIABLE}`,
      resolved,
    });
    return { prompt, ...paths, command: String(command) };
  });
}

/** `text` as one shell word. */
export const shellQuote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

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

/** The parent folder of `path`. */
const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

/**
 * `thunderjar-run.sh`: runs each turn's command in order, stopping at the first that exits
 * non-zero, and writes when it started and finished (ms since the epoch) and how it exited to
 * RUN_PATH. With several turns, it records each turn that ran under `turns`. When it starts,
 * RUN_PATH holds only its start, so a run killed for taking too long still says when it started.
 */
export function runScript(turns: Pick<ScriptTurn, "resultPath" | "command">[]): string {
  const folders = [...new Set(["/thunderjar", ...turns.map(({ resultPath }) => folderOf(resultPath))])];
  const many = turns.length > 1;
  const runTurn = ({ command }: Pick<ScriptTurn, "command">, i: number) => {
    const run = [
      "turn_start=$(now_ms)",
      `sh -c ${shellQuote(command)}`,
      "code=$?",
      ...(many ? [`turns="$turns${i === 0 ? "" : ","}{\\"startedAt\\":$turn_start,\\"finishedAt\\":$(now_ms),\\"exitCode\\":$code}"`] : []),
    ];
    return i === 0 ? run : ["if [ $code -eq 0 ]; then", ...run.map((line) => `  ${line}`), "fi"];
  };
  return `${[
    "#!/bin/sh",
    "# Runs the agent, as Thunderjar does: `sh /thunderjar/thunderjar-run.sh`.",
    `: "\${${SESSION_ID_VARIABLE}:=$(cat /proc/sys/kernel/random/uuid)}"`,
    `export ${SESSION_ID_VARIABLE}`,
    `mkdir -p ${folders.join(" ")}`,
    NOW_MS_FUNCTION,
    "start=$(now_ms)",
    `echo "{\\"startedAt\\":$start}" > ${RUN_PATH}`,
    ...(many ? ['turns=""'] : []),
    ...turns.flatMap(runTurn),
    "end=$(now_ms)",
    `echo "{\\"startedAt\\":$start,\\"finishedAt\\":$end,\\"exitCode\\":$code${many ? ',\\"turns\\":[$turns]' : ""}}" > ${RUN_PATH}`,
  ].join("\n")}\n`;
}

/** The files Thunderjar bakes into a prerun image, by their path in it. */
export type BakedFiles = {
  model: string;
  /** Each turn's prompt, by its prompt path. */
  prompts: Record<string, string>;
  runScript: string;
};

/** What Thunderjar bakes into a prerun image whose turns are `turns`, for `modelId`. */
export function bakedFiles(modelId: string, turns: ScriptTurn[]): BakedFiles {
  return {
    model: modelId,
    prompts: Object.fromEntries(turns.map(({ promptPath, prompt }) => [promptPath, prompt])),
    runScript: runScript(turns),
  };
}

/** Every baked file, by its path in the image. */
export function bakedFileList(baked: BakedFiles): Record<string, string> {
  return { [MODEL_PATH]: baked.model, ...baked.prompts, [RUN_SCRIPT_PATH]: baked.runScript };
}

/** `path`, a path under /thunderjar, as it is in the build context. */
export const inContext = (path: string) => `${CONTEXT_FOLDER}${path.slice("/thunderjar".length)}`;

/** The COPY that bakes in the model ID, right after the harness's fragment. */
export const copyModel = () => `COPY ${inContext(MODEL_PATH)} ${MODEL_PATH}`;

/** The COPYs that bake in the prompts and the run script, after the initial prompt's fragment. */
export function copyPromptsAndScript(baked: BakedFiles): string {
  const paths = Object.keys(baked.prompts);
  const prompts =
    paths.length === 1 && paths[0] === PROMPT_PATH
      ? `COPY ${inContext(PROMPT_PATH)} ${PROMPT_PATH}`
      : `COPY ${CONTEXT_FOLDER}/prompts/ /thunderjar/prompts/`;
  return [prompts, `COPY --chmod=755 ${inContext(RUN_SCRIPT_PATH)} ${RUN_SCRIPT_PATH}`].join("\n");
}
