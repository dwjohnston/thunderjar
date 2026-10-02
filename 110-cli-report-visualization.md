# CLI Report Visualization

Example human-readable output for each command in [100-cli-reference.md](100-cli-reference.md).

These are illustrations of intent, not a formatting contract. The first pass is scriptable
only: every command that reports also supports `--json`, which is not shown here. Interactive
mode is deferred (see [020-goals-non-goals.md](020-goals-non-goals.md#non-goals-v1)).

All examples use one running scenario:

- Task `is-prime`, with the three measurements from
  [085-experiment-results.md](085-experiment-results.md#how-a-measures-values-combine):
  `isPrimeTsExists` (`rate`), `tsIgnoreCount` (`mean`, `max`) and `isPrimeTemplateTest` (`sum`).
- Experiment `is-prime-baseline`: a matrix of two models (`haiku`, `sonnet`) with every other
  parameter fixed, so two permutations, five iterations each, ten container runs.

## `init`

```
$ thunderjar init
Created thunderjar/
  experiments/
  experiment-parameters/
    base-image/
    code-state/
    prompt-set/
    harness/
    model/
    initial-prompt/
  tasks/
  _generated/

Next: add an experiment, then run `thunderjar plan <experiment>`.
```

## `generate`

```
$ thunderjar generate
Read experiment-parameters/
  base-image      1 name
  code-state      1 name
  prompt-set      1 name
  harness         1 name
  model           2 names
  initial-prompt  1 name
Wrote thunderjar/_generated/parameter-names.d.ts
```

## `plan`

```
$ thunderjar plan is-prime-baseline
Experiment  is-prime-baseline
Task        is-prime

Matrix
  baseImage      node20
  codeState      baseline
  promptSet      snerk
  harness        claude-code
  model          haiku | sonnet
  initialPrompt  plain
  iterations     5

Permutations (2)
  #  hash      model   prerun image
  1  4f9a21c8  haiku   exists, will reuse
  2  9be07d35  sonnet  not found, will build

Container runs: 10  (2 permutations x 5 iterations)
Prerun images:  1 to reuse, 1 to build

Nothing was run.
```

A floating parameter (one that follows a moving target) shows what it resolved to, so the
hash is explained:

```
  codeState      main @ 3c1d9e2 (floating, resolved now)
```

## `run`

```
$ thunderjar run is-prime-baseline
Execution 01K4X9J2E8MQZ3V7R5T0WABCDE  (is-prime-baseline)

Permutation 1/2  4f9a21c8  model=haiku
  prerun image   reused
  i00  done   0:42   $0.021   measured 3/3
  i01  done   0:38   $0.019   measured 3/3
  i02  done   0:45   $0.022   measured 3/3
  i03  done   0:51   $0.027   measured 2/3  (1 skipped)
  i04  done   0:40   $0.020   measured 3/3

Permutation 2/2  9be07d35  model=sonnet
  prerun image   built (1:12)
  i00  done   1:03   $0.118   measured 3/3
  i01  done   0:58   $0.109   measured 3/3
  i02  done   1:11   $0.131   measured 3/3
  i03  done   0:55   $0.104   measured 3/3
  i04  done   1:07   $0.124   measured 3/3

Summary  01K4X9J2E8MQZ3V7R5T0WABCDE
  10 container runs, 0 failed to run
  total cost  $0.695   total time  8:30

  measure              haiku           sonnet
  isPrimeTsExists      rate 0.80       rate 1.00
  tsIgnoreCount        mean 0.6 max 2  mean 0.0 max 0
  isPrimeTemplateTest  sum 17 pass, 3   sum 24 pass, 1
                       fail (n=4)      fail (n=5)

Inspect with: thunderjar show 01K4X9J2E8MQZ3V7R5T0WABCDE
Exit 0
```

An infrastructure error stops the run, and names what had been recorded so far:

```
  i02  ERROR  could not start container: image pull failed (registry timeout)

Execution 01K5A2B7C9D4F6G8H0JKMNPQRS stopped: infrastructure error.
2 of 10 container runs were recorded.
Exit 2
```

## `executions`

```
$ thunderjar executions is-prime-baseline
EXECUTION                   EXPERIMENT         DATE
01K5A2B7C9D4F6G8H0JKMNPQRS  is-prime-baseline  2026-10-02 09:14
01K4X9J2E8MQZ3V7R5T0WABCDE  is-prime-baseline  2026-09-29 14:30
01K4S3M8T1V6Y0Z2B4D7FGHJKL  is-prime-baseline  2026-09-22 14:30
```

With no argument, every experiment is listed:

```
$ thunderjar executions
EXECUTION                   EXPERIMENT          DATE
01K5A2B7C9D4F6G8H0JKMNPQRS  is-prime-baseline   2026-10-02 09:14
01K5A0C3E5G7J9L1N3Q5STUVWX  is-prime-exploring  2026-10-01 16:02
01K4X9J2E8MQZ3V7R5T0WABCDE  is-prime-baseline   2026-09-29 14:30
```

## `show`

### An execution

One aggregation result per permutation.

```
$ thunderjar show 01K4X9J2E8MQZ3V7R5T0WABCDE
Execution   01K4X9J2E8MQZ3V7R5T0WABCDE
Experiment  is-prime-baseline
Task        is-prime
Date        2026-09-29 14:30

Permutation 4f9a21c8  (5 iterations)
  baseImage node20 | codeState baseline | promptSet snerk
  harness claude-code | model haiku | initialPrompt plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTsExists      5/5       rate 0.80
  tsIgnoreCount        5/5       mean 0.6, max 2
  isPrimeTemplateTest  4/5       sum {passed: 17, failed: 3}

  cost       $0.109 total   $0.022 / iteration
  tokens     in 412,300     out 38,950
  duration   mean 0:43      max 0:51

Permutation 9be07d35  (5 iterations)
  baseImage node20 | codeState baseline | promptSet snerk
  harness claude-code | model sonnet | initialPrompt plain

  MEASURE              MEASURED  AGGREGATE
  isPrimeTsExists      5/5       rate 1.00
  tsIgnoreCount        5/5       mean 0.0, max 0
  isPrimeTemplateTest  5/5       sum {passed: 24, failed: 1}

  cost       $0.586 total   $0.117 / iteration
  tokens     in 405,870     out 41,210
  duration   mean 1:03      max 1:11
```

An experiment name stands for its latest execution:

```
$ thunderjar show is-prime-baseline
Execution   01K5A2B7C9D4F6G8H0JKMNPQRS  (latest of is-prime-baseline)
...
```

Where a measure's stored value is stale (its content hash no longer matches the measurement),
it is marked rather than hidden:

```
  isPrimeTemplateTest  4/5       sum {passed: 17, failed: 3}  stale, run `remeasure`
```

### A container run

```
$ thunderjar show postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
Container run  postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
Execution      01K4X9J2E8MQZ3V7R5T0WABCDE  (is-prime-baseline)
Permutation    4f9a21c8, iteration 3
Ran at         2026-09-29 14:33

Parameters
  baseImage      node20       a01f
  codeState      baseline     b92c
  promptSet      snerk        c7d4
  harness        claude-code  d5e1
  model          haiku        e3a8
  initialPrompt  plain        f20b

Measures
  isPrimeTsExists      false
  tsIgnoreCount        0
  isPrimeTemplateTest  skipped  (no isPrime.ts to test)

Cost       $0.027
Tokens     in 98,410   out 9,120
Duration   0:51   (agent execution only)   exit code 0

Restore with: thunderjar restore postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
```

## `compare`

Compares aggregation results. How they are matched up depends on whether the permutation
hashes agree, which is the open question in
[085-experiment-results.md](085-experiment-results.md#open-questions).

### Same permutation hashes

Each permutation in A is paired with the one in B of the same hash. This is the clean case:
the same experiment, run twice, such as a weekly rerun.

```
$ thunderjar compare 01K4X9J2E8MQZ3V7R5T0WABCDE 01K5A2B7C9D4F6G8H0JKMNPQRS
A  01K4X9J2E8MQZ3V7R5T0WABCDE  2026-09-29  is-prime-baseline
B  01K5A2B7C9D4F6G8H0JKMNPQRS  2026-10-02  is-prime-baseline
All 2 permutations match by hash. Measurement sets match.

Permutation 4f9a21c8  model=haiku
  MEASURE              A                 B                 CHANGE
  isPrimeTsExists      rate 0.80         rate 0.40         -0.40  worse
  tsIgnoreCount        mean 0.6, max 2   mean 1.4, max 3   +0.8   worse
  isPrimeTemplateTest  sum 17/3          sum 15/5          -2     worse
  cost / iteration     $0.022            $0.021            -$0.001
  duration (mean)      0:43              0:44              +0:01

Permutation 9be07d35  model=sonnet
  MEASURE              A                 B                 CHANGE
  isPrimeTsExists      rate 1.00         rate 1.00         =
  tsIgnoreCount        mean 0.0, max 0   mean 0.0, max 0   =
  isPrimeTemplateTest  sum 24/1          sum 25/0          +1     better
  cost / iteration     $0.117            $0.121            +$0.004
  duration (mean)      1:03              1:05              +0:02
```

With 5 iterations, a rate moving by 0.2 is one iteration. The CHANGE column is a difference, not a
significance test.

### Different permutation hashes

When a parameter changed (here, the prompt set), hashes differ and there is nothing to pair
by. The output says which parameters differ, and compares only what has the same shape:
measurements where name and content hash both match.

```
$ thunderjar compare 01K4X9J2E8MQZ3V7R5T0WABCDE 01K6C4D8F0H2K4M6P8RTVWXYZ1
A  01K4X9J2E8MQZ3V7R5T0WABCDE  2026-09-29  is-prime-baseline
B  01K6C4D8F0H2K4M6P8RTVWXYZ1  2026-10-02  is-prime-snerk-v2
No permutation hashes match.

Parameters that differ
  promptSet  snerk (c7d4)  ->  snerk (91ab)   same name, different content
  model      haiku, sonnet -> haiku, sonnet   same

Pairing permutations by the parameters that did not change:
  A 4f9a21c8  <->  B 7d20e6b4   model=haiku
  A 9be07d35  <->  B 02c8f7a1   model=sonnet

Measurement sets differ. Comparing 2 of 3 measurements.
  isPrimeTemplateTest   A: d91f6a07   B: 5e3c8b12   not comparable (version differs)

Pair model=haiku
  MEASURE          A                 B                 CHANGE
  isPrimeTsExists  rate 0.80         rate 0.80         =
  tsIgnoreCount    mean 0.6, max 2   mean 0.2, max 1   -0.4   better
  cost / iteration $0.022            $0.019            -$0.003

Pair model=sonnet
  ...
```

Run `thunderjar remeasure <execution>` first to give both executions the same measures; that is
what makes a comparison like the one above complete.

## `remeasure`

### An execution

```
$ thunderjar remeasure 01K4X9J2E8MQZ3V7R5T0WABCDE
Execution 01K4X9J2E8MQZ3V7R5T0WABCDE  (10 container runs)
Current measurements for task is-prime:
  isPrimeTsExists      up to date
  tsIgnoreCount        up to date
  isPrimeTemplateTest  new / changed (d91f6a07)

Measuring in new measurement containers from each postrun image:
  4f9a21c8 i00  isPrimeTemplateTest  {passed: 4, failed: 1}
  4f9a21c8 i01  isPrimeTemplateTest  {passed: 5, failed: 0}
  4f9a21c8 i02  isPrimeTemplateTest  {passed: 5, failed: 0}
  4f9a21c8 i03  isPrimeTemplateTest  skipped
  4f9a21c8 i04  isPrimeTemplateTest  {passed: 3, failed: 2}
  ...

Updated 10 container runs. Recomputed 2 aggregation results.
The agent was not rerun.
```

### An experiment

```
$ thunderjar remeasure is-prime-baseline
is-prime-baseline has 3 executions (20 container runs)
  01K4S3M8T1V6Y0Z2B4D7FGHJKL  10 runs  2026-09-22
  01K4X9J2E8MQZ3V7R5T0WABCDE  10 runs  2026-09-29
  01K5A2B7C9D4F6G8H0JKMNPQRS  10 runs  2026-10-02  (already current, nothing to do)

Measuring 20 container runs...  done
Updated 20 container runs. Recomputed 4 aggregation results.
```

A measurement that was deleted from the task is not removed from past runs. Its measures are
kept and excluded from aggregation results:

```
  tsIgnoreCount  deleted from task; 10 stored measures kept, excluded from aggregates
```

## `restore`

Run from inside a git repository.

```
$ cd ~/git-workspace/my-project
$ thunderjar restore postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
Fetched 3 commits from postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
Working tree had uncommitted changes at the end of the run: added a Thunderjar commit.
Created branch thunderjar/postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03

You are still on main. Your working tree was not touched.
Check it out with:
  git checkout thunderjar/postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
```

When the end state was already fully committed, the Thunderjar commit line is omitted.

Failures change nothing:

```
$ thunderjar restore postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
error: branch thunderjar/postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03 already exists
Nothing was changed.

$ cd /tmp
$ thunderjar restore postrun-e01K4X9J2E8MQZ3V7R5T0WABCDE-h4f9a21c8-i03
error: not inside a git repository

$ thunderjar restore postrun-e01KXXXXXXXXXXXXXXXXXXXXXX-h00000000-i00
error: no postrun image found for postrun-e01KXXXXXXXXXXXXXXXXXXXXXX-h00000000-i00
```

## Open questions

- **Pairing permutations in `compare`** when hashes differ. The example above pairs by the
  parameters that did not change. That is one proposal, not a decision.
- **Judging "better" and "worse".** Whether a measurement needs a declared direction (higher is
  better, lower is better) for `compare` to say so. The examples assume it does.
- **Noise.** Whether `compare` shows any spread or significance across iterations, or only the
  aggregate values.
- **Terminal width.** How the tables degrade in narrow terminals and when many permutations are
  shown.
