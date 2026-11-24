import type { Clock, TimerHandle } from "./Clock";

/** A Clock that only moves when `advance` is called. */
export class FakeClock implements Clock {
  constructor(private time = 0) {}

  now(): number {
    return this.time;
  }

  setTimeout(_callback: () => void, _ms: number): TimerHandle {
    return { id: 0 };
  }

  clearTimeout(_handle: TimerHandle | undefined): void {}

  sleep(_ms: number): Promise<void> {
    return new Promise(() => {});
  }

  /** Moves time on `ms`, firing each timer that falls due, in time order. */
  async advance(ms: number): Promise<void> {
    this.time += ms;
  }
}
