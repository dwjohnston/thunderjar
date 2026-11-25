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

/** A frame in two parts: `settled` only ever grows (text already written is never rewritten); `live` is redrawn. */
export type Frame = { settled: string; live: string };

export type DisplayerDeps<M, D = unknown> = {
  state: ApplicationStateService<M, D>;
  clock: Clock;
  stdout: Output;
  stderr: Output;
  logPath: string | undefined;
  /** One line for the manifest. Its indented JSON by default. */
  describeManifest?: (manifest: M) => string;
  /**
   * Replaces the default frame. Its progress goes to stdout, or, in JSON mode, to stderr, so stdout
   * is the JSON alone. On a terminal `live` is redrawn each second; piped, only `settled` is written.
   */
  render?: (state: RunState<M, D>, now: number) => Frame;
  /** What `--json` prints, instead of the run state. Undefined prints nothing. */
  toJson?: (state: RunState<M, D>) => unknown;
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

/** How many terminal rows `text` takes: a line wider than the terminal wraps onto more than one. */
function rowsOf(text: string, columns: number | undefined): number {
  if (text === "") return 0;
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  return lines.reduce((sum, line) => sum + (columns ? Math.max(1, Math.ceil(Bun.stringWidth(line) / columns)) : 1), 0);
}

export function createDisplayerService<M, D = unknown>(deps: DisplayerDeps<M, D>): Displayer {
  const { state, clock, stdout, stderr, logPath, describeManifest, render, toJson } = deps;
  let mode: OutputFormat = "interactive";
  let timer: TimerHandle | undefined;
  let stopped = false;
  let drawnLines = 0;
  // With `render`: how much of `settled` is written, and how many rows the live block under it takes.
  let writtenLength = 0;
  let liveRows = 0;

  const draw = () => {
    const frame = renderState(state.get().run, clock.now(), describeManifest);
    // On a terminal, move up over the last frame and clear to the end before drawing the next.
    stdout.write(drawnLines > 0 ? `\x1b[${drawnLines}A\x1b[0J${frame}` : frame);
    drawnLines = frame.split("\n").length - 1;
  };

  /** Writes what's new of `render`'s frame: `final` leaves no live block. */
  const drawFrame = (render: NonNullable<typeof deps.render>, final: boolean) => {
    const out = mode === "json" ? stderr : stdout;
    const { settled, live } = render(state.get().run, clock.now());
    const fresh = settled.slice(writtenLength);
    writtenLength = Math.max(writtenLength, settled.length);
    if (!out.isTTY) {
      if (fresh !== "") out.write(fresh);
      return;
    }
    // A live block always ends its last line, so what's written next starts on a line of its own.
    const block = final || live === "" || live.endsWith("\n") ? (final ? "" : live) : `${live}\n`;
    const erase = liveRows > 0 ? `\x1b[${liveRows}A\x1b[0J` : "";
    liveRows = rowsOf(block, out.columns);
    const text = `${erase}${fresh}${block}`;
    if (text !== "") out.write(text);
  };

  const show = (final: boolean) => {
    if (render !== undefined) drawFrame(render, final);
    else if (mode !== "json") draw();
  };

  const poll = () => {
    timer = clock.setTimeout(() => {
      show(false);
      poll();
    }, POLL_MS);
  };

  return {
    setMode(next) {
      mode = next;
    },
    start() {
      stopped = false;
      if (mode === "json" && logPath !== undefined) stderr.write(`Logs: ${logPath}\n`);
      // Without `render`, there's nothing to redraw in JSON mode, or on anything but a terminal.
      if (render !== undefined || (mode !== "json" && stdout.isTTY)) poll();
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clock.clearTimeout(timer);
      timer = undefined;
      show(true);
      if (mode !== "json") return;
      const run = state.get().run;
      const value = toJson ? toJson(run) : run;
      if (value !== undefined) stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    },
  };
}
