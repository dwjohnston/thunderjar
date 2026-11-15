<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiEQXvvk5Xk2ZwwPEi
Supervising engineer: dwjohnston

Humans: add your notes here
-->
<!-- The home page splash: title, jar, a link to the docs, a real test case beside some of the results it produced,
     then what went into it (the fixture's file structure, the skill text two prompt sets differ
     by, the initial prompt, the measurements). Dark and light palettes follow the site toggle. -->
<script setup lang="ts">
import { withBase } from "vitepress";
import Jar from "./Jar.vue";

type Row = {
  promptSet: string;
  model: string;
  red: string;
  green: string;
  blue: string;
  cost: string;
  best: (keyof Omit<Row, "best" | "promptSet" | "model">)[];
};

// Ten of the 28 permutations of execution 01m7ea41ft06gpp7bs3fzsjm8t (gauntlet-nested-skills).
// A good run says red and green, never blue. Runs that hit rate limits are left out, so some
// rows count 4.
const rows: Row[] = [
  { promptSet: "none", model: "claude-haiku-5.5", red: "0/5", green: "0/5", blue: "0/5", cost: "$0.002", best: ["blue"] },
  { promptSet: "none", model: "claude-sonnet-5.5", red: "5/5", green: "0/5", blue: "0/5", cost: "$0.053", best: ["red", "blue"] },
  { promptSet: "none", model: "claude-opus-5.5", red: "4/4", green: "4/4", blue: "0/4", cost: "$0.101", best: ["red", "green", "blue"] },
  { promptSet: "none", model: "gemini-4-hydrogen", red: "4/4", green: "4/4", blue: "0/4", cost: "$0.026", best: ["red", "green", "blue"] },
  { promptSet: "none", model: "deepseek-v4.1-flash", red: "2/5", green: "0/5", blue: "0/5", cost: "$0.004", best: ["blue"] },
  { promptSet: "required-format", model: "claude-haiku-5.5", red: "5/5", green: "0/5", blue: "0/5", cost: "$0.003", best: ["red", "blue"] },
  { promptSet: "required-format", model: "claude-sonnet-5.5", red: "5/5", green: "1/5", blue: "0/5", cost: "$0.054", best: ["red", "blue"] },
  { promptSet: "required-format", model: "claude-opus-5.5", red: "5/5", green: "5/5", blue: "0/5", cost: "$0.123", best: ["red", "green", "blue"] },
  { promptSet: "required-format", model: "gemini-4-hydrogen", red: "5/5", green: "5/5", blue: "0/5", cost: "$0.038", best: ["red", "green", "blue"] },
  { promptSet: "required-format", model: "deepseek-v4.1-flash", red: "5/5", green: "1/5", blue: "0/5", cost: "$0.004", best: ["red", "blue"] },
];
const columns = ["red", "green", "blue", "cost"] as const;
</script>

<template>
  <section class="splash">
    <div class="wrap">
      <header class="hero">
        <div>
          <h1>THUNDERJAR</h1>
          <p class="tagline">Coding evals for <em>your</em> codebase</p>
        </div>
        <Jar class="jar" />
      </header>

      <div class="cta-row">
        <a class="cta" :href="withBase('/getting-started')">Documentation →</a>
      </div>

      <div class="demo">
        <div>
          <p class="label">.thunderjar/test-cases/gauntlet-nested-skills.ts</p>
          <div class="card code">
            <pre><span class="k">import</span> { <span class="p">declareTestCase</span> } <span class="k">from</span> <span class="s">"thunderjar"</span>;

<span class="k">export default</span> <span class="p">declareTestCase</span>({
  baseImage: [<span class="s">"node20"</span>],
  codeState: [<span class="s">"thunderjar-nested-skills-root"</span>],
  promptSet: [
    <span class="s">"none"</span>,
    <span class="s">"nested-skills-reading-files"</span>,
    <span class="s">"nested-skills-analysing-a-ts"</span>,
    <span class="s">"nested-skills-required-format"</span>,
  ],
  harnessModel: [
    <span class="s">"opencode-1.19.5/openrouter/anthropic/claude-haiku-5.5"</span>,
    <span class="s">"opencode-1.19.5/openrouter/anthropic/claude-sonnet-5.5"</span>,
    <span class="s">"opencode-1.19.5/openrouter/anthropic/claude-opus-5.5"</span>,
    <span class="s">"opencode-1.19.5/openrouter/openai/gpt-6.1-sol"</span>,
    <span class="s">"opencode-1.19.5/openrouter/openai/gpt-6-luna"</span>,
    <span class="s">"opencode-1.19.5/openrouter/google/gemini-4-hydrogen"</span>,
    <span class="s">"opencode-1.19.5/openrouter/deepseek/deepseek-v4.1-flash"</span>,
  ],
  task: <span class="s">"gauntlet-nested-skills"</span>,
  initialPrompt: [<span class="s">"plain"</span>],
  iterations: <span class="n">5</span>,
});</pre>
          </div>
        </div>

        <div class="arrow" aria-hidden="true">→</div>

        <div>
          <p class="label">thunderjar run gauntlet-nested-skills</p>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>Prompt set</th>
                  <th>Model</th>
                  <th class="num">Contains 🔴</th>
                  <th class="num">Contains 🟢</th>
                  <th class="num">Contains 🔵</th>
                  <th class="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.promptSet + row.model">
                  <td>{{ row.promptSet }}</td>
                  <td>{{ row.model }}</td>
                  <td v-for="col in columns" :key="col" class="num" :class="{ best: row.best.includes(col) }">
                    {{ row[col] }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="note">
            10 of 28 permutations.<br />
            These are real, albeit selected, results.<br />
            Results with less than five total runs are because there were errors in those runs.
            Thunderjar is a work in progress.
          </p>
        </div>
      </div>

      <div class="tree">
        <p class="label">codeState: thunderjar-nested-skills-root</p>
        <div class="card code">
          <pre>nested-skills/                     <span class="m">// working directory</span>
├── .agents/skills/base/SKILL.md   <span class="m">// always include 🔴</span>
├── a/
│   ├── .agents/skills/a/SKILL.md  <span class="m">// always include 🟢</span>
│   └── a.ts
├── b/
│   ├── .agents/skills/b/SKILL.md  <span class="m">// always include 🔵</span>
│   └── b.ts
└── c.ts</pre>
        </div>
      </div>

      <div class="compare">
        <div class="compare-grid">
          <div>
            <p class="label">promptSet: none · a/.agents/skills/a/SKILL.md</p>
            <div class="card code">
              <pre><span class="m">---</span>
name: a
description: <span class="hl">Always apply this skill.</span>
<span class="m">---</span>

Always include the green emoji 🟢 in every response you write.</pre>
            </div>
          </div>
          <div>
            <p class="label">promptSet: required-format · a/.agents/skills/a/SKILL.md</p>
            <div class="card code">
              <pre><span class="m">---</span>
name: a
description: <span class="hl">REQUIRED. Invoke this skill before your first reply to any request in this folder, e.g. explaining, reading or changing a file. It sets the format every reply must follow.</span>
<span class="m">---</span>

Always include the green emoji 🟢 in every response you write.</pre>
            </div>
          </div>
        </div>
      </div>

      <div class="task">
        <p class="label">.thunderjar/parameters/tasks/gauntlet-nested-skills/</p>
        <div class="card code">
          <pre><span class="m">initial-prompts/plain.ts</span>
  <span class="p">writePrompt</span>(<span class="s">"tell what @a.ts does"</span>)</pre>
        </div>
      </div>

      <div class="measurements">
        <div class="measurements-grid">
          <div>
            <p class="label">measurements/red.ts</p>
            <div class="card code">
              <pre><span class="p">declareMeasurement</span>({
  instrument: <span class="s">"replyMatches"</span>,
  config: { pattern: <span class="s">"🔴"</span> },
  metrics: { red: { stat: <span class="s">"rate"</span> } },
});</pre>
            </div>
          </div>
          <div>
            <p class="label">measurements/green.ts</p>
            <div class="card code">
              <pre><span class="p">declareMeasurement</span>({
  instrument: <span class="s">"replyMatches"</span>,
  config: { pattern: <span class="s">"🟢"</span> },
  metrics: { green: { stat: <span class="s">"rate"</span> } },
});</pre>
            </div>
          </div>
          <div>
            <p class="label">measurements/blue.ts</p>
            <div class="card code">
              <pre><span class="p">declareMeasurement</span>({
  instrument: <span class="s">"replyMatches"</span>,
  config: { pattern: <span class="s">"🔵"</span> },
  metrics: { blue: { stat: <span class="s">"rate"</span> } },
});</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Light palette */
.splash {
  --bg: #f2fbf8;
  --bg-hi: #c9f3e6;
  --sub: #2f6b63;
  --title-top: #0b3b3e;
  --accent: #00a884;
  --accent-rgb: 0, 168, 132;
  --muted: #5a8f86;
  --card: #fff;
  --card-border: #bfe6dc;
  --row: #e3f4ef;
  --text: #0b2b2a;
  --cta-text: #fff;
  --title-glow: 0px;
  --glow: 0;
}

/* Dark palette: bioluminescent */
.dark .splash {
  --bg: #020c10;
  --bg-hi: #0b3b3e;
  --sub: #8fd9c9;
  --title-top: #effffa;
  --accent: #3dffc5;
  --accent-rgb: 61, 255, 197;
  --muted: #4f9c8f;
  --card: #03141a;
  --card-border: #0f4747;
  --row: #0a2a2c;
  --text: #d8fff4;
  --cta-text: #020c10;
  --title-glow: 18px;
  --glow: 1;
}

.splash {
  position: relative;
  overflow: hidden;
  background: radial-gradient(1200px 520px at 80% 0%, var(--bg-hi) 0%, var(--bg) 62%);
  color: var(--text);
}

/* Drifting specks, dark mode only */
.dark .splash::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.8;
  background-image:
    radial-gradient(2px 2px at 12% 18%, #7af0ff, transparent),
    radial-gradient(1.5px 1.5px at 28% 62%, #3dffc5, transparent),
    radial-gradient(2.5px 2.5px at 46% 8%, #3dffc5, transparent),
    radial-gradient(1.5px 1.5px at 64% 44%, #7af0ff, transparent),
    radial-gradient(2px 2px at 88% 70%, #3dffc5, transparent),
    radial-gradient(1.5px 1.5px at 6% 84%, #7af0ff, transparent),
    radial-gradient(2px 2px at 54% 92%, #3dffc5, transparent),
    radial-gradient(1.5px 1.5px at 76% 22%, #b4a6ff, transparent);
  animation: drift 14s ease-in-out infinite alternate;
}

@keyframes drift {
  to {
    transform: translateY(-18px);
    opacity: 0.5;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dark .splash::before {
    animation: none;
  }
}

.wrap {
  position: relative;
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 28px;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 32px;
  padding: 64px 0 40px;
}

h1 {
  margin: 0;
  padding-right: 0.1em;
  line-height: 1;
  font-weight: 900;
  font-size: clamp(48px, 8vw, 100px);
  letter-spacing: 0.02em;
  background: linear-gradient(180deg, var(--title-top) 25%, var(--accent) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 var(--title-glow) rgba(var(--accent-rgb), 0.45));
}

.tagline {
  margin: 14px 0 0;
  font-size: 26px;
  color: var(--sub);
}

.tagline em {
  color: var(--accent);
  text-shadow: 0 0 calc(14px * var(--glow)) rgba(var(--accent-rgb), 0.6);
}

.jar {
  width: 220px;
}

.demo {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) auto minmax(0, 1.15fr);
  gap: 20px;
  align-items: center;
  padding-bottom: 48px;
}

.label {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.card {
  overflow-x: auto;
  padding: 18px;
  border: 1px solid var(--card-border);
  border-radius: 12px;
  background: var(--card);
  box-shadow:
    0 10px 40px rgba(0, 0, 0, calc(0.08 + 0.37 * var(--glow))),
    0 0 40px rgba(var(--accent-rgb), calc(0.06 * var(--glow)));
}

/* The code block stays dark in both palettes */
.card.code {
  border-color: #0f4747;
  background: #03141a;
}

pre {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  color: #c4f5ea;
}

.k { color: #7af0ff; }
.s { color: #3dffc5; }
.p { color: #b4a6ff; }
.n { color: #ff9ad5; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

th,
td {
  padding: 8px 9px;
  text-align: left;
}

/* Headers can wrap so the table fits its card; cell values stay on one line. */
th {
  vertical-align: bottom;
}

td {
  white-space: nowrap;
}

th {
  font-weight: 500;
  color: var(--muted);
  border-bottom: 1px solid var(--card-border);
}

td {
  border-bottom: 1px solid var(--row);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* A number column's header is centred, so a wrapped header stays balanced. */
th.num {
  text-align: center;
}

.best {
  font-weight: 600;
  color: var(--accent);
  text-shadow: 0 0 calc(10px * var(--glow)) rgba(var(--accent-rgb), 0.5);
}

.note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.arrow {
  font-size: 28px;
  color: var(--accent);
}

.tree {
  padding-bottom: 28px;
}

.compare {
  padding-bottom: 28px;
}

.task {
  padding-bottom: 28px;
}

.measurements {
  padding-bottom: 72px;
}

.measurements-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

/* The skill text and measurements wrap to their panels instead of scrolling. */
.compare pre,
.measurements pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.compare-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.m { color: #4f9c8f; }

.hl {
  color: #ffd38a;
}

.cta-row {
  padding: 0 0 44px;
  text-align: center;
}

.cta {
  display: inline-block;
  padding: 14px 30px;
  border-radius: 999px;
  font-size: 17px;
  font-weight: 600;
  text-decoration: none;
  background: var(--accent);
  color: var(--cta-text);
  box-shadow: 0 6px calc(20px + 10px * var(--glow)) rgba(var(--accent-rgb), 0.4);
  transition: box-shadow 0.2s;
}

.cta:hover {
  box-shadow: 0 6px 46px rgba(var(--accent-rgb), 0.7);
}

@media (max-width: 1000px) {
  .wrap {
    padding: 0 20px;
  }

  .hero {
    grid-template-columns: minmax(0, 1fr);
  }

  .tagline {
    font-size: 22px;
  }

  .jar {
    width: 150px;
  }

  .demo,
  .compare-grid,
  .measurements-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .arrow {
    justify-self: center;
    transform: rotate(90deg);
  }
}

@media (max-width: 640px) {
  .card {
    padding: 12px;
  }

  pre {
    font-size: 11.5px;
  }

  table {
    font-size: 12px;
  }

  th,
  td {
    padding: 6px 4px;
  }

  th {
    font-size: 11px;
  }
}
</style>
