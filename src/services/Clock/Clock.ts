/** A timer started by a Clock, to pass back to its `clearTimeout`. */
export type TimerHandle = { readonly id: number };

/** Where time comes from, so a test can pass a FakeClock in its place. */
export interface Clock {
  /** Epoch ms. */
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle | undefined): void;
  sleep(ms: number): Promise<void>;
}

/** Real time. */
export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: () => ({ id: 0 }),
  clearTimeout: () => {},
  sleep: async () => {},
};
