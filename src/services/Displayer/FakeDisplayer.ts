import type { Displayer, OutputFormat } from "./Displayer";

/**
 * A Displayer that prints nothing and records the mode it was set to, so a test of a command can
 * check which output format it chose without reading terminal output.
 */
export class FakeDisplayer implements Displayer {
  mode: OutputFormat = "interactive";

  setMode(mode: OutputFormat): void {
    this.mode = mode;
  }

  start(): void {}

  stop(): void {}
}
