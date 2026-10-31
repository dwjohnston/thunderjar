# Human Zone-Out

Places where the user has flagged that they stopped paying close attention. An entry
doesn't mean the content is wrong. It means it was never really reviewed, so it shouldn't
be cited as settled. Entries are removed once the user has read the thing properly.

## Entries

- **"Result" is overloaded.** The word names four different things, and none of the
  names were chosen deliberately against each other:
  - **Result** — the set of measures for one iteration
    ([085-experiment-results.md](085-experiment-results.md#the-result-record)).
  - `MeasurementResult<T>` — the outcome of a single measure
    ([060-experiment-parameters.md](060-experiment-parameters.md#measuring-instruments--measurements)).
    It is stored in a field called `outcome`, giving `outcome: { outcome: "measured" }`.
  - **Aggregation result** — the combined Results of a permutation's iterations.
  - The harness's **result file** — `ctx.resultPath`, `/thunderjar/result.json`,
    `harnessResult` ([087-collecting-token-costs.md](087-collecting-token-costs.md#the-result-file)).

- **"Execution" is overloaded.** It names three different things:
  - **Experiment execution** — one occasion of running an experiment, identified by an
    execution ID ([030-terminology.md](030-terminology.md#experiment-execution)).
  - **Execution** — step 2 of a container run, when the harness is invoked
    ([030-terminology.md](030-terminology.md#container-run)).
  - The `Execution` type and the execution wrapper — the harness process's timing and
    exit code ([085-experiment-results.md](085-experiment-results.md#execution)).

  The first and third sit side by side in `ContainerRunRecord`: `executionId` refers to
  the experiment execution, and `execution` to the harness process.
