# 2500: Reproduce the ai-experiments with Thunderjar

Reproduce the experiments in [ai-experiments](https://github.com/dwjohnston/ai-experiments) with an installed preview of Thunderjar, as the PromptFoo and Harbor branches there do, and compare the results.

This is the acceptance test for this plan. See [planned runnable experiments](../../research/planned-runnable-experiments.md).

## Version bump type

none

## Artifacts

- A branch and PR in ai-experiments adding a `.thunderjar/` project:
  - code state: the experiment's folder, e.g. `detective-skill/claude-code`
  - prompt sets: one per skill or settings variant, e.g. `detective`, `detective-v2`
  - initial prompts: the README's command sequences, as turns
  - measurements: `replyMatches` for what each README says to look for
- A write-up comparing Thunderjar's results and effort with PromptFoo's and Harbor's
- Issues for anything Thunderjar couldn't express

## Example CLI Output

```
$ thunderjar show <ULID>
                                                                    leaks-eli
 1  haystack | detective     | claude-code@2.1.283/haiku-4-5 | bears-then-ask   5/5
 2  haystack | detective-v2  | claude-code@2.1.283/haiku-4-5 | bears-then-ask   0/5
```

## Tests

- None in this repository. The experiment run is the test.

## Human interventions

- Publish a preview release of Thunderjar.
- Provide `ANTHROPIC_API_KEY` and approve the spend, roughly $0.06 per container run on Haiku.
- Review the comparison with PromptFoo and Harbor.
