/**
 * 🤖
 * This file was created with AI
 *
 * Harness: Claude Code
 * Session Id: session_01LCLeLi84J7b2Ykdumve3HN
 * Supervising engineer: David Johnston
 *
 *
 * Humans: add your notes here
 *
 *
 */


// What `build` is doing, as data: each prerun image the test case needs, and where its build is.
// build publishes it, for `app.state()`, and draws its output from it with renderBuild.

/** One prerun image, and where its build is. */
export type ImageBuild =
  | { image: string; status: "present" }
  | { image: string; status: "queued" }
  | { image: string; status: "built"; ms: number };

export type BuildState = {
  /** Every prerun image the test case needs, in plan's order. */
  images: ImageBuild[];
};

/** Puts `next` in place of the entry for its image in `state`. */
export function setImage(state: BuildState, next: ImageBuild): void {
  const index = state.images.findIndex(({ image }) => image === next.image);
  if (index !== -1) state.images[index] = next;
}
