# Shipped Skills

Thunderjar ships agent skills that run inside the user's own coding sessions, not inside
experiments. Writing a good measurement is the hard part of capturing a test case, and
it is easiest while the session that produced it is still in context. Assumes
[User Experience](040-user-experience.md), whose three scenarios this page builds on.

## `thunderjar-test-case`

Recognises a session worth capturing, offers to capture it, and then helps write the
measurements.

### Offering

When a session matches one of the
[experiment candidate scenarios](040-user-experience.md#experiment-candidates), the agent
asks once, at a natural stopping point:

> Do you want to create a Thunderjar test case from this?

It never creates anything unprompted. A "no" ends the exchange; the user can also invoke
the skill directly. The skill's description tells the agent which signals to look for:

| Scenario | Signal in the session | What the measurements should do |
|---|---|---|
| Clean pass | The user accepted the result without corrections. | Lock in today's good behavior, e.g. `fileCreated` plus a `templateTest`. |
| Near miss | The user corrected one specific thing. | Isolate that one mistake. It must fail on the session's original output and pass on the corrected one. |
| Clear, measurable failure | The agent did something detectable mechanically, e.g. added `@ts-ignore`. | Detect the failure directly, usually with `grep`. |

A session with no outcome that can be checked mechanically is not offered.

### Helping with measurements

Measurements are the skill's main job. Once the user says yes, the agent:

1. States, in one sentence, the outcome to be judged — taken from the scenario above.
2. Proposes measurements, each naming its
   [instrument](060-experiment-parameters.md#measuring-instruments--measurements) and
   config, and says what it would have returned on this session.
3. Checks each proposal against the files the session left behind, so the user sees a
   measurement pass or fail on real output before it is saved.
4. Writes the accepted ones to the task's `measurements/` folder, one file per
   measurement, as [declared on the task](066-task.md#task-measurements).

The agent prefers few, cheap, deterministic measurements over broad ones. For a
`templateTest` it also writes the template file beside it.

### What it creates

The task folder `experiment-parameters/tasks/<name>/`, with the session's opening
request as its initial prompt in `initial-prompts/`, and the `measurements/` folder
beside it. The experiment declaration and the other five parameters are left to the
user.

## Open questions

- **"Test case" vs "experiment".** The skill's wording says *test case*; the rest of the
  spec, including [030-terminology.md](030-terminology.md), still says *experiment*.
  Unresolved which term the user-facing surface uses, and whether a test case is the task
  plus its measurements or the whole experiment.
- Whether the skill should also help create the experiment declaration, or stop at the
  task.
- Whether checking a measurement against the session's files is enough, or the skill
  should run it in a [measurement container](030-terminology.md#measurement-container).
