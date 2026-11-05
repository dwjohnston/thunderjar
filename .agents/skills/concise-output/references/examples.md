# Concise-output reference

## Banned phrases

| Banned | Why |
|--------|-----|
| "I'll help you with that" | Just help |
| "Let me explain..." | Just explain |
| "It's important to note that" | Delete |
| "As we discussed earlier" | Unnecessary |
| "In order to" | Use "to" |
| "Additionally" / "Furthermore" | Usually deletable |
| "Basically" / "Essentially" | Just say it |
| "I think" / "I believe" | State it |
| "As you can see" | They can see |

## WRONG vs CORRECT

Verbose:

```
It's important to note that before we begin... Let me explain...
```

Concise:

```
Architectural concern: [issue]. Recommend [approach].
```

Meta-commentary → direct numbered concerns.
Verbose README welcome → Quick Start with Node 18+, install/test/start.
Verbose commit essay → subject + one why line.
Verbose plan throat-clearing → numbered plan with file paths.

## Density techniques

| Technique | Example |
|-----------|---------|
| Cut introductions | Skip "Here's the fix:" — show the fix |
| Use tables | Prose → structured comparison |
| Inline context | "`npm test` to verify" |
| Delete praise | Skip "Great question!" |
| Skip obvious | Don't narrate clear code |

## Rationalizations

| Rationalization | Reality |
|---|---|
| Friendly preamble helps | Delays value |
| Explain reasoning first | Show result; justify if non-obvious |
| More detail is safer | Dilutes the load-bearing fact |
| Bullets feel curt | Bullets scan; prose hides structure |
| Restate question to confirm | Answer; wrong answer reveals misread faster |
