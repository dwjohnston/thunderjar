# Paned runner display

## Problem

The current live display in `runExperiment` uses raw ANSI cursor-up rewrites on the normal screen buffer. Harness subprocess stdout flows directly to the terminal and corrupts the cursor position, causing the progress view to jump and break.

## Proposed design

Replace the raw ANSI display with a full-screen paned layout using **ink** (React-based TUI). Each permutation gets its own bounded pane. All harness output is captured and routed into that pane only.

When there are too many variations to tile usefully, fall back to a compact list view.

---

## Layout algorithm

Rather than a fixed breakpoint table, the layout is computed from the actual terminal size at render time:

1. Define minimum viable pane dimensions (e.g. `MIN_W = 35`, `MIN_H = 6`)
2. `maxCols = floor(termWidth / MIN_W)`, `maxRows = floor(termHeight / MIN_H)`
3. If `N > maxCols × maxRows` → **list mode** (see below)
4. Otherwise, find the column count that produces the most square grid:
   - Try each `cols` from 1 to `maxCols`
   - `rows = ceil(N / cols)`
   - Pick the `cols` where `(paneWidth / paneHeight)` is closest to a target aspect ratio (~2.5 to account for character cell proportions)

This means a wide terminal naturally gets more columns, a tall terminal gets more rows, and the layout reflows instantly on resize.

---

## Layout examples

Harness output is only available once a run completes — the body of each pane is empty while running, and populated with the final stdout/stderr on completion or failure.

### Small terminal (~80×20)

**2 variations**
```
┌──── prompt-a / sonnet / cc ──── ● 0:42 ──┐┌──── prompt-b / sonnet / cc ──── ● 0:19 ──┐
│                                           ││                                           │
│  working...                               ││  working...                               │
│                                           ││                                           │
└───────────────────────────────────────────┘└───────────────────────────────────────────┘
```

Once one completes:
```
┌──── prompt-a / sonnet / cc ──── ✓ 1:47 ──┐┌──── prompt-b / sonnet / cc ──── ● 1:24 ──┐
│ Task completed successfully.              ││                                           │
│ Created src/Button.tsx                    ││  working...                               │
│ Modified src/index.ts                     ││                                           │
└───────────────────────────────────────────┘└───────────────────────────────────────────┘
```

**4 variations**
```
┌─── prompt-a / sonnet / cc ─── ✓ 1:47 ──┐┌─── prompt-b / sonnet / cc ─── ✗ 0:58 ──┐
│ Task completed successfully.            ││ Error: could not find config file        │
│ Created src/Button.tsx                  ││ Exit code 1                              │
└─────────────────────────────────────────┘└─────────────────────────────────────────┘
┌─── prompt-a / opus / cc ───── ● 2:14 ──┐┌─── prompt-b / opus / cc ───── ● 1:33 ──┐
│                                         ││                                          │
│  working...                             ││  working...                              │
│                                         ││                                          │
└─────────────────────────────────────────┘└─────────────────────────────────────────┘
```

**10 variations → list mode** (too many to tile at minimum pane size)
```
Running 10 variations...
7/10 complete                                               0:04:12

prompt-a / sonnet / claude-code      ✓  1:47
prompt-b / sonnet / claude-code      ✓  1:31
prompt-a / opus / claude-code        ✗  0:58  (exit 1)
prompt-b / opus / claude-code        ✓  2:12
prompt-a / haiku / claude-code       ✓  1:05
prompt-b / haiku / claude-code       ✓  1:18
prompt-a / sonnet / opencode         ✓  1:52
prompt-b / sonnet / opencode         ●  2:01
prompt-a / opus / opencode           ●  1:44
prompt-b / opus / opencode           ●  0:37
```

---

### Large terminal (~180×48)

**2 variations**
```
┌────────── prompt-a / sonnet / claude-code ───────────────────────── ● 0:42 ──────────┐┌────────── prompt-b / sonnet / claude-code ───────────────────────── ✓ 1:31 ──────────┐
│                                                                                        ││ Task completed successfully.                                                           │
│  working...                                                                            ││ Created src/components/Button.tsx                                                      │
│                                                                                        ││ Modified src/index.ts, src/app.tsx                                                     │
│                                                                                        ││ All tests passed (24/24)                                                               │
└────────────────────────────────────────────────────────────────────────────────────────┘└────────────────────────────────────────────────────────────────────────────────────────┘
```

**4 variations** — wide enough to fit all 4 in one row
```
┌─ prompt-a / sonnet / cc ─ ✓ 1:47 ─┐┌─ prompt-b / sonnet / cc ─ ✗ 0:58 ─┐┌─ prompt-a / opus / cc ─── ● 2:14 ─┐┌─ prompt-b / opus / cc ─── ● 1:33 ─┐
│ Task completed successfully.        ││ Error: could not find config file   ││                                    ││                                    │
│ Created src/Button.tsx              ││ Exit code 1                         ││  working...                        ││  working...                        │
│ Modified src/index.ts               ││                                     ││                                    ││                                    │
└─────────────────────────────────────┘└─────────────────────────────────────┘└────────────────────────────────────┘└────────────────────────────────────┘
```

**10 variations** — large terminal tiles 5×2 instead of falling back to list mode
```
┌─ p-a/son/cc ─ ✓1:47 ─┐┌─ p-b/son/cc ─ ✗0:58 ─┐┌─ p-a/opus/cc ─ ●2:14 ─┐┌─ p-b/opus/cc ─ ●1:33 ─┐┌─ p-a/haiku/cc ─ ●1:05 ─┐
│ Completed ok.         ││ Exit code 1            ││                         ││                         ││                          │
│ Created Button.tsx    ││ Config not found       ││  working...             ││  working...             ││  working...              │
└───────────────────────┘└────────────────────────┘└─────────────────────────┘└─────────────────────────┘└──────────────────────────┘
┌─ p-b/haiku/cc ●1:18 ─┐┌─ p-a/son/oc ─ ●1:52 ─┐┌─ p-b/son/oc ─ ● 2:01 ─┐┌─ p-a/opus/oc ─ ● 1:44 ─┐┌─ p-b/opus/oc ─ ● 0:37 ─┐
│                       ││                        ││                         ││                          ││                          │
│  working...           ││  working...            ││  working...             ││  working...              ││  working...              │
└───────────────────────┘└────────────────────────┘└─────────────────────────┘└─────────────────────────┘└──────────────────────────┘
```

---

## List mode

Triggered when `N > maxCols × maxRows` for the minimum pane size. Shows:

- A summary header: `Running N variations... X/N complete` + a count-up timer
- One line per variation with: name, status icon, elapsed time, and error note if failed
- Variations sorted: complete/failed first (in finish order), then running ones

```
Running 100 variations...
12/100 complete                                             0:08:44

prompt-a / sonnet / claude-code      ✓   42s
prompt-b / sonnet / claude-code      ✓   38s
prompt-a / opus / claude-code        ✗   61s  (exit 1)
prompt-b / opus / claude-code        ✓   55s
prompt-a / haiku / claude-code       ✓   29s
...
prompt-x / opus / opencode           ●  1:14
prompt-y / haiku / opencode          ●  0:52
```

---

## Pane anatomy

**While running:**
```
┌─ prompt-a / claude-sonnet-4-6 / claude-code ──── ● 1:23 ─┐
│                                                            │
│  working...                                                │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**On completion:**
```
┌─ prompt-a / claude-sonnet-4-6 / claude-code ──── ✓ 1:47 ─┐
│ Task completed successfully.                               │
│ Created src/components/Button.tsx                          │
│ Modified src/index.ts                                      │
└────────────────────────────────────────────────────────────┘
```

- **Header:** status icon (● running / ✓ complete / ✗ failed), label, elapsed time
- **Body (running):** static "working..." placeholder
- **Body (done):** final stdout/stderr from the harness, truncated to pane width and height
- **Border:** ink `borderStyle="single"`; colour changes on completion (green) or failure (red)

---

## Architecture

### New file: `src/cli/RunnerDisplay.tsx`

ink React component. Owns all pane state. Accepts a `permutations` list and an `onReady` callback:

```ts
interface RunCallbacks {
  onOutput: (permIndex: number, line: string) => void;
  onStatusChange: (permIndex: number, status: 'running' | 'complete' | 'failed') => void;
}

<RunnerDisplay permutations={RunPermutation[]} onReady={(cb: RunCallbacks) => void} />
```

On mount, the component calls `onReady(callbacks)` to hand control back to the runner. The runner drives state via callbacks; ink re-renders reactively.

Two sub-components:
- `<TileView>` — renders the pane grid when tiling is viable
- `<ListView>` — renders the compact list when there are too many variations

### Modified: `src/runner.ts`

- `runExperiment` gains a `callbacks: RunCallbacks` parameter; all existing ANSI display code is removed
- Harness subprocess stays as `Bun.$` — stdout/stderr are captured from the completed result and pushed to the pane via `onOutput`
- `generatePermutations` is exported so the CLI can compute permutations before mounting the display
- `fakeRunExperiment` is made parallel and emits a fake completion message per pane after a random delay, using the same `RunCallbacks` interface

### Modified: `src/cli/index.ts`

Mounts the ink display, passes callbacks to the runner, then unmounts cleanly:

```ts
process.stdout.write('\x1b[?1049h\x1b[?25l');  // enter alternate screen, hide cursor
const { waitUntilExit } = render(<RunnerDisplay permutations={...} onReady={...} />);
await runExperiment(config, experimentId, projectRoot, callbacks);
await waitUntilExit();
process.stdout.write('\x1b[?1049l\x1b[?25h');  // restore screen, show cursor
```

---

## Dependencies

```sh
bun add ink react
bun add -d @types/react
```
