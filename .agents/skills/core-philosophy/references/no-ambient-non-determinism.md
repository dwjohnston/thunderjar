# Spec: No Ambient Non-Determinism

## Summary

Application code never reads time, randomness, environment or other changing inputs from globals. Each one comes in as an injected service, so tests can control it without mocking the platform or using framework-specific tricks.

The motivating case is Thunderjar's test suite. Timeout tests used a fake harness that really slept, launched through a fake Docker CLI in a separate process. Fake timers can't reach into another process, so the core had to poll real time, and the tests were slow and flaky. Under this spec, all timing happens in the test's own process on an injected clock, and a 60-second timeout test runs in milliseconds.

## Definitions

- **Ambient**: an input that code reaches out and grabs from the environment, such as a global or a platform API, rather than receiving it as a parameter. The function's signature hides the dependency.
- **Non-deterministic**: an input that can differ between runs, machines or moments, such as the current time, a random number, or the order two processes finish in.
- **Ambient non-determinism**: both at once. It makes a function look pure when it isn't, and that's what turns tests flaky.

## The rule

Code outside the composition root must not call any API that reads ambient non-deterministic state. It asks an injected service instead. The composition root is the one place that builds the real implementations and passes them inward.

Two corollaries follow:

1. Tests never use real timers or real waiting. The only exception is end-to-end smoke tests (see [Exceptions](#exceptions)).
2. Tests replace these services with plain fake objects, not with framework mocking such as `jest.useFakeTimers` or `spyOn(Math, "random")`. That keeps the design independent of the test framework.

## Banned APIs and their replacements

| Category | Banned outside the composition root | Inject instead | Test double |
| --- | --- | --- | --- |
| Time (now) | `Date.now`, `new Date()` with no arguments, `performance.now` | `Clock.now()` | Fake clock with a settable time |
| Time (scheduling) | Global `setTimeout`, `setInterval`, `setImmediate`, `Bun.sleep` | `Clock.setTimeout`, `Clock.setInterval`, `Clock.sleep` | Fake clock advanced by the test |
| Randomness | `Math.random`, `crypto.randomUUID`, `crypto.getRandomValues` | `Random` / `IdGenerator` | Seeded generator or a fixed sequence |
| Environment | `process.env`, `Bun.env` | A typed `Config` object | Plain object literal |
| Locale and timezone | `toLocaleString`, `toLocaleDateString`, `Intl.*` without an explicit locale and time zone | A `Formatter` given a locale and time zone | Formatter fixed to one locale and time zone |
| Machine facts | `os.cpus()`, `os.hostname()`, `process.pid` | `Config` or `SystemInfo` | Plain object literal |
| Filesystem and current directory | Direct `fs`, `Bun.file`, `process.cwd()` | A filesystem service | In-memory filesystem |
| External processes | `Bun.$`, `Bun.spawn`, `child_process` | Ports such as `DockerService` | Hand-rolled fake, such as `FakeDockerService` |

`new Date(timestamp)` with an explicit argument is fine, because it's deterministic.

## Architecture

The pattern is ports and adapters. Core logic depends on small interfaces, real adapters live at the edge, and a single composition root wires them together.

```ts
interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(fn: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
  sleep(ms: number): Promise<void>;
}

interface Random {
  next(): number; // [0, 1)
}
```

- **Pure DI, no framework.** `main` awaits any async setup, builds the real clock, random source, config and adapters, then passes the fully built objects into constructors. Service methods can then stay synchronous where they want to. Adopt a container only once the wiring genuinely hurts. Constructor injection makes that switch cheap.
- **No service locator.** A global registry that code reaches into is ambient state under another name.
- **Secure randomness.** Where unpredictability matters, the real `Random` wraps the crypto source. The interface doesn't change.

## Testing approach

Everything a unit test exercises runs in one process, driven by a fake clock the test advances.

- **Fake clock.** It owns the current time, timeouts and intervals. Its async `advance(ms)` fires due callbacks in time order and lets pending promises settle between each one. It can't flush real I/O, so nothing in a unit test may wait on a real process or socket.
- **Hand-rolled fakes, not mocks.** For example, `FakeDockerService` takes the clock in its constructor, keeps images and containers in memory, and resolves `exec` immediately by default. Tests override behaviour per image:

  ```ts
  fake.onExec("slow-agent", async ({ clock }) => {
    await clock.sleep(60_000);
    return 0;
  });
  ```

  The fake `kill` settles the pending exec, and the fake records what ran and what was killed.
- **No sleeping harnesses.** Fake agents never take real time. Any delay is scripted on the fake clock.
- **Timeline tests assert on state.** Start the run, advance to each moment, and check the state model. For example: at 1 s, container 1 has errored. At 3 s, container 2 has succeeded. At 10 s, container 3 has timed out.
- **Rendering is tested separately.** The renderer is a pure function of state plus the current time, tested with hand-built states. One thin wiring test checks that the tick actually produces a frame.
- **Contract tests keep fakes honest.** One shared suite runs against both the fake and the real adapter.

## Exceptions

- **Smoke tests.** End-to-end smoke tests run the real thing, including real Docker and real time. They're allowed to take a minute or two. Keep them few.
- **Logging.** Diagnostic logging may be ambient, because threading a logger everywhere is noise. But it must be capturable and structured:
  - The sink is configured at the composition root.
  - A test can install an in-memory sink scoped with `AsyncLocalStorage` and assert that a given trace event appears. The assertion checks structured fields, not wording.
  - The logger takes timestamps from the injected clock, or the sink adds them.
- **The composition root and real adapters.** These are the only places allowed to touch the banned APIs.

## Enforcement

The rule is enforced by lint, not by discipline.

- Use ESLint's `no-restricted-globals`, `no-restricted-properties` and `no-restricted-imports` to flag every API in the table above. Each error message names the service to use instead.
- Turn the rule off only for the composition root, the real adapter directories and the smoke tests, using file-level overrides.
- AGENTS.md states the rule and points agents at the lint config. If a repo doesn't have the lint rule yet, adding it is the agent's first task.

### To do

- [ ] Add the restricted-API lint rules to Thunderjar
- [ ] Introduce `Clock` and `FakeClock`
- [ ] Introduce `DockerService` and `FakeDockerService`, then move the timeout tests off the sleeping harness