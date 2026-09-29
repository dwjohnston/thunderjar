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
        K --> L["Execution: harness invoked headlessly<br/>with task instruction + model"]
        L --> M["Measurement: task measurements<br/>applied to the container's output"]
        M --> N["docker commit the container<br/>into a postrun image"]
        N --> O["Tag as postrun image,<br/>push to image store"]
        O --> P["Record run metadata (date, params,<br/>hash, measurements, cost)<br/>in run data store"]
    end

    J --> K
```

What gets written to the run data store at `P`, and what's deliberately *not* extracted
in v1 (the OTel trace and session transcript — pull the postrun image for those instead),
is covered in [085-experiment-results.md](085-experiment-results.md).

## Open questions

- **Thunderjar's own injected setup.** Beyond the six experiment parameters, Thunderjar
  itself may need to bake things into the image that aren't any experimenter's concern —
  e.g. OTel collector config or other instrumentation needed for telemetry. Where this
  fits in the Initial Setup sequence (part of the base image? its own step? applied to
  every prerun image regardless of permutation?) is unresolved. Revisit. (Also noted in
  [020-goals-non-goals.md](020-goals-non-goals.md#to-revisit).)
