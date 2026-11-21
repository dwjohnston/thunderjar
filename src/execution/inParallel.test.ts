import { expect, test } from "bun:test";
import { inParallel } from "./inParallel.ts";

/** Jobs that each wait `ms`, recording when they start and finish, and how many ran at once. */
function jobs(count: number, ms = 5, failing?: number) {
  const events: string[] = [];
  let running = 0;
  let most = 0;
  const list = Array.from({ length: count }, (_, i) => async () => {
    events.push(`start ${i}`);
    most = Math.max(most, ++running);
    await Bun.sleep(ms);
    running--;
    events.push(`end ${i}`);
    if (i === failing) throw new Error(`job ${i} failed`);
  });
  return { list, events, most: () => most };
}

test("with a limit of 1, runs the jobs one after another", async () => {
  const { list, events } = jobs(3);
  await inParallel(list, 1);
  expect(events).toEqual(["start 0", "end 0", "start 1", "end 1", "start 2", "end 2"]);
});

test("runs at most `limit` at once, starting them in order", async () => {
  const { list, events, most } = jobs(5);
  await inParallel(list, 2);
  expect(most()).toBe(2);
  expect(events.filter((event) => event.startsWith("start"))).toEqual(["start 0", "start 1", "start 2", "start 3", "start 4"]);
});

test("a limit above the number of jobs runs them all at once", async () => {
  const { list, most } = jobs(3);
  await inParallel(list, 10);
  expect(most()).toBe(3);
});

test("once a job throws, starts no more, lets the running ones finish, then throws its error", async () => {
  const { list, events } = jobs(5, 5, 0);
  await expect(inParallel(list, 2)).rejects.toThrow("job 0 failed");
  expect(events).toEqual(["start 0", "start 1", "end 0", "end 1"]);
});
