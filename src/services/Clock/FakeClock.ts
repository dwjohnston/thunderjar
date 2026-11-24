import type { Clock, TimerHandle } from "./Clock";

type Timer = { id: number; at: number; callback: () => void };

/**
 * A Clock that only moves when `advance` is called. Promises settle between each timer it fires,
 * so code that awaits one timer and then sets the next sees time move as it would for real.
 */
export class FakeClock implements Clock {
  private timers: Timer[] = [];
  private nextId = 1;

  constructor(private time = 0) {}

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const timer = { id: this.nextId++, at: this.time + Math.max(0, ms), callback };
    this.timers.push(timer);
    return { id: timer.id };
  }

  clearTimeout(_handle: TimerHandle | undefined): void {}

  sleep(_ms: number): Promise<void> {
    return new Promise(() => {});
  }

  /** Moves time on `ms`, firing each timer that falls due, in time order. */
  async advance(ms: number): Promise<void> {
    const until = this.time + ms;
    for (;;) {
      const due = this.timers.filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (due === undefined) break;
      this.timers = this.timers.filter((timer) => timer !== due);
      this.time = due.at;
      due.callback();
    }
    this.time = until;
  }
}
