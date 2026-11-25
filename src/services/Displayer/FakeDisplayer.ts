import type { Displayer, OutputFormat } from "./Displayer";

/**
 * A Displayer that prints nothing and only records what it was told, so a test of a command can
 * check it set the mode and started and stopped the display, without reading terminal output.
 */
export class FakeDisplayer implements Displayer {
  mode: OutputFormat = "interactive";
  /** Every call, in order, e.g. `["setMode json", "start", "stop"]`. */
  readonly calls: string[] = [];

  setMode(mode: OutputFormat): void {
    this.mode = mode;
    this.calls.push(`setMode ${mode}`);
  }

  start(): void {
    this.calls.push("start");
  }

  stop(): void {
    this.calls.push("stop");
  }
}
