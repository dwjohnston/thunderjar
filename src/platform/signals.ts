// Signal numbers, in place of node:os's `constants.signals`, which this repository doesn't use
// (see AGENTS.md). Bun reports a child killed by a signal by the signal's name.

const COMMON: Record<string, number> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGIOT: 6,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGSEGV: 11,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
  SIGXCPU: 24,
  SIGXFSZ: 25,
  SIGVTALRM: 26,
  SIGPROF: 27,
  SIGWINCH: 28,
};

const LINUX: Record<string, number> = {
  SIGBUS: 7,
  SIGUSR1: 10,
  SIGUSR2: 12,
  SIGSTKFLT: 16,
  SIGCHLD: 17,
  SIGCONT: 18,
  SIGSTOP: 19,
  SIGTSTP: 20,
  SIGTTIN: 21,
  SIGTTOU: 22,
  SIGURG: 23,
  SIGIO: 29,
  SIGPOLL: 29,
  SIGPWR: 30,
  SIGSYS: 31,
};

const BSD: Record<string, number> = {
  SIGEMT: 7,
  SIGBUS: 10,
  SIGSYS: 12,
  SIGURG: 16,
  SIGSTOP: 17,
  SIGTSTP: 18,
  SIGCONT: 19,
  SIGCHLD: 20,
  SIGTTIN: 21,
  SIGTTOU: 22,
  SIGIO: 23,
  SIGINFO: 29,
  SIGUSR1: 30,
  SIGUSR2: 31,
};

const SIGNALS = { ...COMMON, ...(process.platform === "linux" ? LINUX : BSD) };

/** The number of the signal `signal` names, on this platform, as node's `os.constants.signals`. */
export function signalNumber(signal: string | number): number {
  if (typeof signal === "number") return signal;
  const number = SIGNALS[signal];
  if (number === undefined) throw new Error(`unknown signal: ${signal}`);
  return number;
}
