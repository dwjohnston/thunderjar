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
// Helpers that return Dockerfile fragments writing the files a run needs into the prerun image.
// Each is shorthand for a `COPY <<'EOF' <path>` heredoc, so the Dockerfile shows exactly what's
// written. Running an iteration is then `sh /thunderjar/thunderjar-run.sh`, and nothing else:
//
//   /thunderjar/thunderjar-run.sh   runs the agent: written by the harness, e.g. writeRunScript
//   /thunderjar/model.txt           the model ID: written by the harness, e.g. writeModel
//   /thunderjar/prompt.txt          the prompt: written by the initial prompt, e.g. writePrompt
//   /thunderjar/result.json         the agent's result: left by the run script, as it runs
//
// COPY makes these files as root, readable by anyone. The run script runs as the image's user, in
// the image's working directory, so the agent writes its result to a folder that user owns.

export const RUN_SCRIPT_PATH = "/thunderjar/thunderjar-run.sh";

export const MODEL_PATH = "/thunderjar/model.txt";

export const PROMPT_PATH = "/thunderjar/prompt.txt";

/** Where the run script must leave the agent's result, for `collectReply` and `collectTokenCosts`. */
export const RESULT_PATH = "/thunderjar/result.json";

/** A heredoc delimiter that isn't a line of `contents`. */
function delimiterFor(contents: string): string {
  const lines = new Set(contents.split("\n"));
  let delimiter = "THUNDERJAR_EOF";
  for (let i = 1; lines.has(delimiter); i++) delimiter = `THUNDERJAR_EOF_${i}`;
  return delimiter;
}

/**
 * A fragment that writes `contents` to `path` in the image, as is: no variable is expanded. A
 * heredoc ends its last line, so the file ends with a newline, added if `contents` has none.
 * `executable` makes it executable by anyone.
 */
export function writeFile(path: string, contents: string, { executable = false }: { executable?: boolean } = {}): string {
  const delimiter = delimiterFor(contents);
  const body = contents.endsWith("\n") ? contents : `${contents}\n`;
  return `COPY ${executable ? "--chmod=755 " : ""}<<'${delimiter}' ${path}\n${body}${delimiter}`;
}

/**
 * An initial prompt's fragment: writes `prompt` to `/thunderjar/prompt.txt`, for the run script to
 * pass to the agent, e.g. as `"$(cat /thunderjar/prompt.txt)"`, which drops the final newline.
 */
export const writePrompt = (prompt: string): string => writeFile(PROMPT_PATH, prompt);

/** A harness's fragment: writes `modelId` to `/thunderjar/model.txt`, for its run script to read. */
export const writeModel = (modelId: string): string => writeFile(MODEL_PATH, modelId);

/**
 * A harness's fragment: writes `/thunderjar/thunderjar-run.sh`, running `command` with `sh`, in
 * the image's working directory. `command` must leave the agent's result at `/thunderjar/result.json`.
 */
export const writeRunScript = (command: string): string => writeFile(RUN_SCRIPT_PATH, `#!/bin/sh\n${command}`, { executable: true });
