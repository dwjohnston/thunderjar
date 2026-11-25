import type { Clock, TimerHandle } from "../Clock/Clock";
import type { Output } from "../Io/Io";
import type { ApplicationStateService, RunState, RunStatus } from "../ApplicationState/ApplicationState";

/** How a command shows its run state: frames redrawn each second, or JSON once at the end. */
export type OutputFormat = "interactive" | "json";

export interface Displayer {
  /** Interactive by default. Set it before `start`. */
  setMode(mode: OutputFormat): void;
  /**
   * Interactive: polls the state each second and draws a frame, if stdout is a terminal. JSON: says
   * on stderr where the logs are. Each of the state's `warnings` goes to stderr once, as
   * `Warning: <text>`: with the next frame drawn, or in JSON mode at `stop`.
   *
   * A frame taller than the terminal is drawn only as far as fits, its last rows: the cursor
   * can't move up past the top of the screen, so more would leave a copy behind each second.
   */
  start(): void;
  /**
   * Interactive: stops polling and draws a final frame, whole, however tall. JSON: writes each of
   * the state's `notes` to stderr, since no frame shows them, then the result, serialised as JSON,
   * to stdout, and nothing else. Either way the state's `failure`, if any, then goes to stderr as
   * `Error: <failure>`. Stopping again does nothing.
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
  /** Draws a frame of the state at `now` (epoch ms), in place of `renderState`. */
  render?: (state: RunState<M>, now: number) => string;
  /** What JSON mode prints at `stop`. The whole `RunState` by default. */
  toJson?: (state: RunState<M>) => unknown;
};

const POLL_MS = 1000;

/** Lifecycle order, so the counts read left to right as runs move on. */
const STATUS_ORDER: readonly RunStatus[] = [
  "queued",
  "running",
  "committing",
  "committed",
  "measuring",
  "uploading",
  "uploaded",
  "finished",
  "crashed",
  "timedOut",
  "cancelled",
];

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
  const { state, clock, stdout, stderr, logPath, describeManifest } = deps;
  const render = deps.render ?? ((run: RunState<M>, now: number) => renderState(run, now, describeManifest));
  const toJson = deps.toJson ?? ((run: RunState<M>) => run);
  let mode: OutputFormat = "interactive";
  let timer: TimerHandle | undefined;
  let stopped = false;
  /** How many terminal rows the last frame took. */
  let drawnRows = 0;
  let warningsShown = 0;

  /** The rows `line` takes on screen: one wider than the terminal wraps onto more than one. */
  const rowsOfLine = (line: string) => {
    const columns = stdout.columns;
    return columns === undefined || columns <= 0 ? 1 : Math.max(1, Math.ceil(line.length / columns));
  };

  /** The rows `frame` takes on screen. */
  const rowsOf = (frame: string) =>
    frame
      .split("\n")
      .slice(0, -1)
      .reduce((rows, line) => rows + rowsOfLine(line), 0);

  /** As much of the end of `frame` as the terminal can redraw in place: all of it, if it fits or the terminal doesn't say how tall it is. */
  const fitting = (frame: string) => {
    const rows = stdout.rows;
    if (rows === undefined || rows <= 0) return frame;
    // The cursor rests on the row below the frame.
    const room = Math.max(1, rows - 1);
    const lines = frame.split("\n").slice(0, -1);
    let taken = 0;
    let first = lines.length;
    while (first > 0 && taken + rowsOfLine(lines[first - 1] as string) <= room) taken += rowsOfLine(lines[--first] as string);
    return first === 0 ? frame : lines.slice(first).map((line) => `${line}\n`).join("");
  };

  /** Writes the warnings not yet shown to stderr. True if there were any. */
  const showWarnings = () => {
    const fresh = (state.get().run.warnings ?? []).slice(warningsShown);
    for (const warning of fresh) stderr.write(`Warning: ${warning}\n`);
    warningsShown += fresh.length;
    return fresh.length > 0;
  };

  /** Draws a frame over the last one: as much as fits, or with `whole`, all of it, for the last one. */
  const draw = (whole = false) => {
    const run = state.get().run;
    if ((run.warnings ?? []).length > warningsShown) {
      // Clear the frame first, so a warning sharing the terminal lands above the next frame, not in it.
      if (drawnRows > 0) stdout.write(`\x1b[${drawnRows}A\x1b[0J`);
      drawnRows = 0;
      showWarnings();
    }
    const rendered = render(run, clock.now());
    // Nothing to show yet, e.g. the command failed before it had a manifest: no blank line.
    const full = rendered === "" || rendered.endsWith("\n") ? rendered : `${rendered}\n`;
    const frame = whole ? full : fitting(full);
    // On a terminal, move up over the last frame and clear to the end before drawing the next.
    stdout.write(drawnRows > 0 ? `\x1b[${drawnRows}A\x1b[0J${frame}` : frame);
    drawnRows = rowsOf(frame);
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
      if (stopped) return;
      if (mode === "json") {
        if (logPath !== undefined) stderr.write(`Logs: ${logPath}\n`);
      } else if (stdout.isTTY) {
        poll();
      }
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clock.clearTimeout(timer);
      timer = undefined;
      if (mode === "json") {
        showWarnings();
        for (const note of state.get().run.notes ?? []) stderr.write(`${note}\n`);
        // `?? "null"`: a result of undefined has no JSON, and stdout must still parse.
        stdout.write(`${JSON.stringify(toJson(state.get().run), null, 2) ?? "null"}\n`);
      } else {
        draw(true);
      }
      const failure = state.get().run.failure;
      if (failure !== undefined) stderr.write(`Error: ${failure}\n`);
    },
  };
}
