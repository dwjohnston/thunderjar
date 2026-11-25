import { type Input, type Io, lineReader, type Output, type StopSignal } from "./Io";

/** A terminal, or a pipe or file. */
export type StreamKind = "terminal" | "pipe";

export type FakeIoOptions = {
  /** Pipes by default. */
  stdout?: StreamKind;
  stderr?: StreamKind;
  stdin?: StreamKind;
  /** How wide the terminal streams are. 80 by default. */
  columns?: number;
};

/** An output stream that keeps what's written to it. */
export class FakeOutput implements Output {
  private written = "";

  constructor(
    readonly isTTY: boolean,
    readonly columns: number | undefined,
  ) {}

  write(text: string): void {
    this.written += text;
  }

  /** Everything written, as written. */
  text(): string {
    return this.written;
  }

  /**
   * What's on screen after the last redraw: the text after the last "clear to end of screen"
   * (`\x1b[0J`) a redrawing display writes before each new frame. All the text if there's none.
   */
  lastFrame(): string {
    return this.written.split("\x1b[0J").at(-1) ?? "";
  }
}

/** An input stream a test types into. */
export class FakeInput implements Input {
  private chunks: string[] = [];
  private ended = false;
  private waiting: (() => void) | undefined;
  private readonly reader = lineReader(async () => {
    while (this.chunks.length === 0 && !this.ended) await new Promise<void>((resolve) => (this.waiting = resolve));
    return this.chunks.shift() ?? null;
  });

  constructor(readonly isTTY: boolean) {}

  /** Types `text`, e.g. `"y\n"` to answer a prompt. */
  type(text: string): void {
    this.chunks.push(text);
    this.wake();
  }

  /** Ends the input, as Ctrl-D or the end of a piped file does. */
  end(): void {
    this.ended = true;
    this.wake();
  }

  readLine(): Promise<string | null> {
    return this.reader.readLine();
  }

  readAll(): Promise<string> {
    return this.reader.readAll();
  }

  private wake() {
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.();
  }
}

/**
 * An Io a test drives: each stream captured as text, stdin typed into, and Ctrl-C or SIGTERM sent
 * when the test says. Its streams are pipes, unless the options make them terminals.
 */
export class FakeIo implements Io {
  readonly stdout: FakeOutput;
  readonly stderr: FakeOutput;
  readonly stdin: FakeInput;
  private readonly handlers = new Set<(signal: StopSignal) => void>();

  constructor({ stdout = "pipe", stderr = "pipe", stdin = "pipe", columns = 80 }: FakeIoOptions = {}) {
    const out = (kind: StreamKind) => new FakeOutput(kind === "terminal", kind === "terminal" ? columns : undefined);
    this.stdout = out(stdout);
    this.stderr = out(stderr);
    this.stdin = new FakeInput(stdin === "terminal");
  }

  onStop(handler: (signal: StopSignal) => void): () => void {
    const listener = (signal: StopSignal) => handler(signal);
    this.handlers.add(listener);
    return () => this.handlers.delete(listener);
  }

  /** How many onStop handlers are still listening. */
  get stopListeners(): number {
    return this.handlers.size;
  }

  /** Ctrl-C: calls the onStop handlers with "SIGINT". */
  interrupt(): void {
    this.stop("SIGINT");
  }

  /** Calls the onStop handlers with "SIGTERM", as `docker stop` or `kill` would. */
  terminate(): void {
    this.stop("SIGTERM");
  }

  private stop(signal: StopSignal) {
    for (const handler of this.handlers) handler(signal);
  }
}
