// Running a list of jobs, at most `limit` of them at once, in the order given.

/**
 * Runs each of `jobs`, in order, with at most `limit` running at once: with a limit of 1, one
 * after another. Once one throws, no more start; those already running finish, then the first
 * error is thrown, so nothing is left running.
 */
export async function inParallel(jobs: (() => Promise<void>)[], limit: number): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    while (failure === undefined && next < jobs.length) {
      const job = jobs[next++] as () => Promise<void>;
      try {
        await job();
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  if (failure !== undefined) throw failure.error;
}
