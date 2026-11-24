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
  | { image: string; status: "building"; since: number }
  | { image: string; status: "built"; ms: number }
  | { image: string; status: "failed"; ms: number };

/** One push to the image store, and where it is. */
export type PushState =
  | { reference: string; status: "queued" }
  | { reference: string; status: "pushing"; since: number }
  | { reference: string; status: "pushed"; ms: number }
  | { reference: string; status: "failed"; ms: number };

export type BuildState = {
  /** The runtime's command, when images are built on it, e.g. `docker --context cloud`. */
  runtime?: string;
  /** Every prerun image the test case needs, in plan's order. */
  images: ImageBuild[];
  /** With an image store: what's pushed to it, in plan's order. */
  pushes?: PushState[];
};

/** When `image`'s build started, if it's building. */
export function buildingSince(state: BuildState, image: string): number | undefined {
  const entry = state.images.find((entry) => entry.image === image);
  return entry?.status === "building" ? entry.since : undefined;
}

/** Puts `next` in place of the entry for its image in `state`. */
export function setImage(state: BuildState, next: ImageBuild): void {
  const index = state.images.findIndex(({ image }) => image === next.image);
  if (index !== -1) state.images[index] = next;
}

/** When the push to `reference` started, if it's pushing. */
export function pushingSince(state: BuildState, reference: string): number | undefined {
  const entry = state.pushes?.find((entry) => entry.reference === reference);
  return entry?.status === "pushing" ? entry.since : undefined;
}

/** Puts `next` in place of the entry for its reference in `state`'s pushes. */
export function setPush(state: BuildState, next: PushState): void {
  const index = state.pushes?.findIndex(({ reference }) => reference === next.reference) ?? -1;
  if (index !== -1) (state.pushes as PushState[])[index] = next;
}
