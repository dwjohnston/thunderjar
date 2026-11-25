// Everything between a command and whoever ran it: the three streams, and being asked to stop.
// One service, as they're used together, e.g. `confirm` writes a question and reads the answer.
// Each stream is its own, with its own `isTTY`: with `run x --json > out.json`, stdout is piped
// and stderr is still a terminal.

/** Somewhere text is written: stdout or stderr. */
export type Output = {
  write(text: string): void;
  /** Whether it's a terminal, where lines can be redrawn in place. */
  isTTY: boolean;
  /** How wide the terminal is, to know where lines wrap. Undefined if it isn't one. */
  columns?: number;
  /** How tall the terminal is, to know how much can be redrawn in place. Undefined if it isn't one, or doesn't say. */
  rows?: number;
};

/** Where text is read from: stdin. */
export type Input = {
  /** The next line, without its newline, or null once the input has ended. */
  readLine(): Promise<string | null>;
  /** The rest of the input, once it has ended. */
  readAll(): Promise<string>;
  /** Whether it's a terminal, where someone can type an answer. */
  isTTY: boolean;
};

export type StopSignal = "SIGINT" | "SIGTERM";

export interface Io {
  stdout: Output;
  stderr: Output;
  stdin: Input;
  /** Ctrl-C, or the process being asked to stop. Returns a function that stops listening. */
  onStop(handler: (signal: StopSignal) => void): () => void;
}

/** Reads lines, or the rest, from `next`, which gives each chunk of text, or null at the end. */
export function lineReader(next: () => Promise<string | null>): Pick<Input, "readLine" | "readAll"> {
  let buffer = "";
  let ended = false;
  const more = async () => {
    const chunk = ended ? null : await next();
    if (chunk === null) ended = true;
    else buffer += chunk;
    return chunk !== null;
  };
  return {
    async readLine() {
      let newline: number;
      while ((newline = buffer.indexOf("\n")) === -1) {
        if (!(await more())) {
          if (buffer === "") return null;
          const last = buffer;
          buffer = "";
          return last;
        }
      }
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      return line;
    },
    async readAll() {
      while (await more());
      const rest = buffer;
      buffer = "";
      return rest;
    },
  };
}

const output = (stream: { write(text: string): unknown; isTTY?: boolean; columns?: number; rows?: number }): Output => ({
  write: (text) => void stream.write(text),
  get isTTY() {
    return stream.isTTY === true;
  },
  get columns() {
    return stream.isTTY ? stream.columns : undefined;
  },
  get rows() {
    return stream.isTTY ? stream.rows : undefined;
  },
});

/** The real Io: this process's streams and signals. stdin is only read once something asks. */
export function createIoService(): Io {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const decoder = new TextDecoder();
  const lines = lineReader(async () => {
    reader ??= Bun.stdin.stream().getReader();
    const { value, done } = await reader.read();
    return done ? null : decoder.decode(value, { stream: true });
  });
  return {
    stdout: output(process.stdout),
    stderr: output(process.stderr),
    stdin: { ...lines, isTTY: process.stdin.isTTY === true },
    onStop(handler) {
      const onInt = () => handler("SIGINT");
      const onTerm = () => handler("SIGTERM");
      process.on("SIGINT", onInt);
      process.on("SIGTERM", onTerm);
      return () => {
        process.off("SIGINT", onInt);
        process.off("SIGTERM", onTerm);
      };
    },
  };
}
