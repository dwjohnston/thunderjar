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

/** Real time. Built only at an entry point: `new SystemClock()`. */
export class SystemClock implements Clock {
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  private nextId = 1;

  now(): number {
    return Date.now();
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const id = this.nextId++;
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        callback();
      }, ms),
    );
    return { id };
  }

  clearTimeout(handle: TimerHandle | undefined): void {
    if (handle === undefined) return;
    clearTimeout(this.timers.get(handle.id));
    this.timers.delete(handle.id);
  }

  sleep(ms: number): Promise<void> {
    return Bun.sleep(ms);
  }
}
