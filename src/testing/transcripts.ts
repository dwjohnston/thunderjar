/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Model: claude-opus-5-5
 * Session Id: session_01LCLeLgjaf4n2FVk7rLLHNR
 * Supervising engineer: David Johnston
 *
 * Humans: add your notes here
 */
// The transcripts saved from real runs, in fixtures/transcripts/: one folder per harness version,
// laid out as the home folder of the image's user was, for tests of each harness's parser.
import { Glob } from "bun";
import { FIXTURES_DIR } from "./scenario.ts";

/** Where the saved transcripts are. */
export const TRANSCRIPTS_DIR = `${FIXTURES_DIR}/transcripts`;

/** The home folder of the image's user when the transcripts were saved: `node`, as every harness's run script switches to. */
export const TRANSCRIPT_HOME = "/home/node";

/**
 * The files in `fixtures/transcripts/<harness>/` that `globs` match, `~` being that folder, as a
 * harness's `transcript.parse` gets them from a postrun image: by their paths there, sorted.
 */
export async function transcriptFiles(harness: string, globs: string[]): Promise<{ path: string; text: string }[]> {
  const home = `${TRANSCRIPTS_DIR}/${harness}`;
  const saved = await Array.fromAsync(new Glob("*").scan({ cwd: home, dot: true, onlyFiles: false })).catch(() => []);
  if (saved.length === 0) throw new Error(`no saved transcript ${harness} in ${TRANSCRIPTS_DIR}`);
  const paths = new Set<string>();
  for (const glob of globs) {
    if (!glob.startsWith("~/")) throw new Error(`a saved transcript is only in the home folder, not ${glob}`);
    for await (const path of new Glob(glob.slice(2)).scan({ cwd: home, dot: true })) paths.add(path);
  }
  const files = [];
  for (const path of [...paths].toSorted()) files.push({ path: `${TRANSCRIPT_HOME}/${path}`, text: await Bun.file(`${home}/${path}`).text() });
  return files;
}
