# Docker Execution

The Docker run mechanics and resulting artifacts. See
[081-docker-tagging.md](081-docker-tagging.md) for how the resulting prerun/postrun
images are named, and [030-terminology.md](030-terminology.md#container-run-lifecycle) for
the **prerun image** / **postrun image** / **container run** definitions this process
implements.

## Process

```mermaid
flowchart TD
    A["Experiment execution starts"] --> B["Resolve parameter matrix into permutations"]
    B --> C

    subgraph PERM["Per permutation"]
        C{"Prerun image exists<br/>for this permutation's<br/>parameter hash?"}
        C -- Yes --> D["Pull existing prerun image"]
        C -- No --> E["Start FROM base image<br/>(experiment parameter)"]
        E --> F["Apply code state<br/>(usually a pinned commit)"]
        F --> G["Overlay prompt set files"]
        G --> H["Install harness,<br/>pinned to its version"]
        H --> I["Tag as prerun image,<br/>push to image store"]
        D --> J["Prerun image ready"]
        I --> J
    end

    subgraph ITER["Per iteration"]
        K["Run a new container<br/>from the prerun image"]
        K --> L["Execution: harness invoked headlessly<br/>with task instruction + model, inside<br/>Thunderjar's execution wrapper"]
        L --> M["docker commit the container<br/>into a postrun image"]
        M --> N["Tag as postrun image,<br/>push to image store"]
        N --> O["Measurement: start a short-lived measurement<br/>container from the postrun image, apply the<br/>task's measurements, then discard it"]
        O --> P["Record run metadata (date, params,<br/>hash, measurements, cost)<br/>in run data store"]
    end

    J --> K
```

The per-permutation steps are the fold over each parameter's `applyParameter` fragment,
in the order shown. _(Referenced by:
[060-experiment-parameters.md](060-experiment-parameters.md#declarations-and-applyparameter).)_

What gets written to the run data store at `P`, and what's deliberately *not* extracted
in v1 (the OTel trace and session transcript — pull the postrun image for those instead),
is covered in [085-experiment-results.md](085-experiment-results.md).

## Why commit happens before measurement

Measurement runs at `O`, *after* the postrun image has been committed and pushed — not
against the still-running execution container. _(Referenced by:
[030-terminology.md](030-terminology.md#container-run),
[085-experiment-results.md](085-experiment-results.md),
[087-collecting-token-costs.md](087-collecting-token-costs.md).)_

- **The postrun image stays exactly the agent's end state.** Measuring in a separate,
  discarded container keeps rendered test files, freshly installed dependencies, and test
  output out of the preserved artifact.
- **First-pass measurement and backfill become the same path.** Applying a new
  measurement to a year-old run is the same operation as measuring a fresh one: start a
  measurement container from the postrun image and run the instrument against it. See
  [085-experiment-results.md](085-experiment-results.md).
- **The artifact is durable before anything can go wrong.** If measurement crashes, the
  image is already pushed, so the run isn't lost — the measurements can simply be applied
  again later.

The harness writes its own result JSON (usage, cost, session ID) to a fixed path inside
the container at `L`, before the commit at `M`, so those numbers are preserved *in* the
postrun image rather than only captured on stdout. A measurement container can therefore
read them years later, exactly as the original run did.

## The execution wrapper

At `L`, Thunderjar doesn't run the harness's `cli` command directly. It wraps it, inside
the container, to record when the agent started, when it finished, and how it exited:

```sh
start=$(date +%s%3N)
<command returned by the harness's cli>
code=$?
end=$(date +%s%3N)
echo "{\"startedAt\":$start,\"finishedAt\":$end,\"exitCode\":$code}" > /thunderjar/run.json
```

```json
{ "startedAt": 1790692255104, "finishedAt": 1790692297416, "exitCode": 0 }
```

The file is written before `docker commit`, so like the harness's result file it is
preserved in the postrun image, and a run's timing and exit code can be re-read from the
image alone. Harness authors do nothing for this — the wrapper belongs to Thunderjar.
Timestamps come from the host kernel's clock, which containers share.

What this times is the agent's execution only: harness start to exit. Image pulls,
container setup and measurement are not part of it — measurement happens after commit,
and its duration changes every time measurements are backfilled, so it isn't a fact about
the run. _(Referenced by: [085-experiment-results.md](085-experiment-results.md#execution),
[060-experiment-parameters.md](060-experiment-parameters.md#harness).)_

## Open questions

- **Thunderjar's own injected setup.** Beyond the six experiment parameters, Thunderjar
  itself may need to bake things into the image that aren't any experimenter's concern —
  e.g. OTel collector config or other instrumentation needed for telemetry. Where this
  fits in the Initial Setup sequence (part of the base image? its own step? applied to
  every prerun image regardless of permutation?) is unresolved. Revisit. (Also noted in
  [020-goals-non-goals.md](020-goals-non-goals.md#to-revisit).)
