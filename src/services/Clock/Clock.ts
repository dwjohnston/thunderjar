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

const realTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

/** Real time. */
export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const id = nextId++;
    realTimers.set(
      id,
      setTimeout(() => {
        realTimers.delete(id);
        callback();
      }, ms),
    );
    return { id };
  },
  clearTimeout: (handle) => {
    if (handle === undefined) return;
    clearTimeout(realTimers.get(handle.id));
    realTimers.delete(handle.id);
  },
  sleep: (ms) => Bun.sleep(ms),
};
