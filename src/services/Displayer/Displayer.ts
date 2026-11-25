import type { Clock, TimerHandle } from "../Clock/Clock";
import type { Output } from "../Io/Io";
import type { ApplicationStateService, RunState, RunStatus } from "../ApplicationState/ApplicationState";

/** How a command shows its run state: frames redrawn each second, or JSON once at the end. */
export type OutputFormat = "interactive" | "json";

export interface Displayer {
  /** Interactive by default. Set it before `start`. */
  setMode(mode: OutputFormat): void;
  /** Interactive: polls the state each second and draws a frame. JSON: says on stderr where the logs are. */
  start(): void;
  /**
   * Interactive: stops polling and draws a final frame. JSON: writes the final `RunState`, serialised
   * as JSON, to stdout. With `--dry-run` that state is the manifest alone, under `manifest`.
   * Whether the JSON should instead be the `RunRecord[]` or a dedicated result shape is still open.
   */
  stop(): void;
}

export type DisplayerDeps<M> = {
  state: ApplicationStateService<M>;
  clock: Clock;
  stdout: Output;
  stderr: Output;
  logPath: string | undefined;
  /** One line for the manifest. Its indented JSON by default. */
  describeManifest?: (manifest: M) => string;
  /** Draws a frame, in place of `renderState`. A frame is "", or ends with a newline. */
  render?: (state: RunState<M>, now: number) => string;
};

const POLL_MS = 1000;

/** Lifecycle order, so the counts read left to right as runs move on. */
const STATUS_ORDER: readonly RunStatus[] = ["queued", "running", "committing", "committed", "uploading", "uploaded", "crashed", "timedOut"];

/**
 * One frame of the state, ending in a newline. Pure. `now` (epoch ms) is unused for now; it's there
 * so a frame can show elapsed time without the signature changing.
 */
export function renderState<M>(state: RunState<M>, _now: number, describeManifest?: (manifest: M) => string): string {
  const lines: string[] = [];
  if (state.manifest !== undefined) {
    if (describeManifest) lines.push(`Manifest: ${describeManifest(state.manifest)}`);
    else lines.push("Manifest:", ...JSON.stringify(state.manifest, null, 2).split("\n").map((line) => `  ${line}`));
  }
  const counts = new Map<RunStatus, number>();
  for (const { status } of Object.values(state.runs)) counts.set(status, (counts.get(status) ?? 0) + 1);
  const runs = STATUS_ORDER.filter((status) => counts.has(status)).map((status) => `${counts.get(status)} ${status}`);
  lines.push(`Runs: ${runs.length > 0 ? runs.join(", ") : "none"}`);
  const images = Object.entries(state.images);
  if (images.length > 0) lines.push("Images:", ...images.map(([reference, status]) => `  ${reference}  ${status}`));
  if (state.uploadBacklog > 0) lines.push(`Upload backlog: ${state.uploadBacklog}`);
  return `${lines.join("\n")}\n`;
}

export function createDisplayerService<M>(deps: DisplayerDeps<M>): Displayer {
  const { state, clock, stdout, stderr, logPath, describeManifest, render } = deps;
  let mode: OutputFormat = "interactive";
  let timer: TimerHandle | undefined;
  let drawnLines = 0;

  const draw = () => {
    const frame = render ? render(state.get().run, clock.now()) : renderState(state.get().run, clock.now(), describeManifest);
    // On a terminal, move up over the last frame and clear to the end before drawing the next.
    stdout.write(drawnLines > 0 ? `\x1b[${drawnLines}A\x1b[0J${frame}` : frame);
    drawnLines = frame.split("\n").length - 1;
  };

  const poll = () => {
    timer = clock.setTimeout(() => {
      draw();
      poll();
    }, POLL_MS);
  };

  return {
    setMode(next) {
      mode = next;
    },
    start() {
      if (mode === "json") {
        if (logPath !== undefined) stderr.write(`Logs: ${logPath}\n`);
      } else if (stdout.isTTY) {
        poll();
      }
    },
    stop() {
      clock.clearTimeout(timer);
      timer = undefined;
      if (mode === "json") stdout.write(`${JSON.stringify(state.get().run, null, 2)}\n`);
      else draw();
    },
  };
}
