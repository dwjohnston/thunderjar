<!--
🤖 This file was created with AI. The home page splash: title, jar, an example test case beside
the results it produces, and a link to the docs. Dark and light palettes follow the site toggle.
-->
<script setup lang="ts">
import { withBase } from "vitepress";
import Jar from "./Jar.vue";

type Row = {
  promptSet: string;
  model: string;
  wroteTest: string;
  caughtBug: string;
  tsIgnore: string;
  cost: string;
  best: (keyof Omit<Row, "best" | "promptSet" | "model">)[];
};

// Sample data, to show the shape of a run's results.
const rows: Row[] = [
  { promptSet: "current", model: "opus", wroteTest: "3/5", caughtBug: "4/5", tsIgnore: "0.0", cost: "$0.42", best: ["tsIgnore"] },
  { promptSet: "current", model: "haiku", wroteTest: "1/5", caughtBug: "1/5", tsIgnore: "1.2", cost: "$0.06", best: ["cost"] },
  { promptSet: "with-tdd-skill", model: "opus", wroteTest: "5/5", caughtBug: "5/5", tsIgnore: "0.0", cost: "$0.47", best: ["wroteTest", "caughtBug", "tsIgnore"] },
  { promptSet: "with-tdd-skill", model: "haiku", wroteTest: "5/5", caughtBug: "3/5", tsIgnore: "0.4", cost: "$0.07", best: ["wroteTest"] },
];
const columns = ["wroteTest", "caughtBug", "tsIgnore", "cost"] as const;
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

      <div class="demo">
        <div>
          <p class="label">.thunderjar/test-cases/prompt-sets.ts</p>
          <div class="card code">
            <pre><span class="k">import</span> { <span class="p">declareTestCase</span> } <span class="k">from</span> <span class="s">"thunderjar"</span>;

<span class="k">export default</span> <span class="p">declareTestCase</span>({
  baseImage: [<span class="s">"node20"</span>],
  codeState: [<span class="s">"main"</span>],
  promptSet: [<span class="s">"current"</span>, <span class="s">"with-tdd-skill"</span>],
  harnessModel: [
    <span class="s">"claude-code/claude-opus-5-5"</span>,
    <span class="s">"claude-code/claude-haiku-5-5"</span>,
  ],
  task: <span class="s">"fix-cart-rounding"</span>,
  initialPrompt: [<span class="s">"plain"</span>],
  iterations: <span class="n">5</span>,
});</pre>
          </div>
        </div>

        <div class="arrow" aria-hidden="true">→</div>

        <div>
          <p class="label">thunderjar run prompt-sets</p>
          <div class="card">
            <table>
              <thead>
                <tr>
                  <th>Prompt set</th>
                  <th>Model</th>
                  <th class="num">Wrote a test</th>
                  <th class="num">Caught the gnarly bug</th>
                  <th class="num">@ts-ignore</th>
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
        </div>
      </div>

      <div class="cta-row">
        <a class="cta" :href="withBase('/getting-started')">Documentation →</a>
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
  margin-top: calc(var(--vp-nav-height) * -1);
  padding-top: var(--vp-nav-height);
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

.best {
  font-weight: 600;
  color: var(--accent);
  text-shadow: 0 0 calc(10px * var(--glow)) rgba(var(--accent-rgb), 0.5);
}

.arrow {
  font-size: 28px;
  color: var(--accent);
}

.cta-row {
  padding: 44px 0 72px;
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

@media (max-width: 880px) {
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

  .demo {
    grid-template-columns: minmax(0, 1fr);
  }

  .arrow {
    justify-self: center;
    transform: rotate(90deg);
  }
}
</style>
