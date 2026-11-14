<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiEQXvvk5Xk2ZwwPEi
Supervising engineer: dwjohnston

Humans: add your notes here
-->
<!-- A jar holding a yellow lightning bolt, coloured for the light and dark palettes. -->
<template>
  <svg class="thunderjar" viewBox="0 0 200 250" role="img" aria-label="A jar holding a lightning bolt">
    <path
      class="glass"
      d="M44 70 Q30 78 30 100 L30 210 Q30 236 56 236 L144 236 Q170 236 170 210 L170 100 Q170 78 156 70 Z"
      stroke-width="5"
      stroke-linejoin="round"
    />
    <path class="liquid" d="M33 168 Q66 156 100 168 T167 166 L167 210 Q167 233 144 233 L56 233 Q33 233 33 210 Z" />
    <g class="bubbles" opacity=".8">
      <circle cx="62" cy="214" r="5" />
      <circle cx="142" cy="204" r="4" />
      <circle cx="120" cy="222" r="3" />
      <circle cx="50" cy="186" r="3" />
    </g>
    <path class="highlight" d="M48 104 L48 200" stroke-width="5" stroke-linecap="round" opacity=".35" />
    <rect class="lid" x="40" y="30" width="120" height="40" rx="7" stroke-width="5" />
    <path class="ridges" d="M62 36 V64 M82 36 V64 M102 36 V64 M122 36 V64 M142 36 V64" stroke-width="3" opacity=".45" />
    <path
      class="bolt"
      d="M112 92 L72 162 L100 162 L86 214 L132 138 L104 138 L120 92 Z"
      stroke-width="4"
      stroke-linejoin="round"
    />
    <g class="sparks" stroke-width="4" stroke-linecap="round">
      <path d="M58 120 L66 128" />
      <path d="M146 116 L138 124" />
      <path d="M60 196 L70 190" />
      <path d="M144 196 L134 188" />
      <path d="M20 22 L30 34" />
      <path d="M180 22 L170 34" />
      <path d="M100 4 L100 18" />
    </g>
  </svg>
</template>

<style scoped>
.thunderjar {
  --edge: #0b3b3e;
  --glass: #ffffffcc;
  --lid: #0f5b58;
  --liquid: #3dffc533;
  --bubble: #00a884;
  --spark: #e0a800;
  display: block;
  height: auto;
  filter: drop-shadow(0 8px 24px rgba(0, 168, 132, 0.25));
}

.dark .thunderjar {
  --edge: #9ff8e4;
  --glass: #3dffc514;
  --liquid: #3dffc522;
  --bubble: #7af0ff;
  --spark: #fff3a0;
  filter: drop-shadow(0 0 30px rgba(61, 255, 197, 0.5));
}

.glass { fill: var(--glass); stroke: var(--edge); }
.liquid { fill: var(--liquid); }
.bubbles { fill: var(--bubble); }
.highlight { stroke: var(--edge); }
.lid { fill: var(--lid); stroke: var(--edge); }
.ridges { stroke: var(--edge); }
.sparks { stroke: var(--spark); }

.bolt {
  fill: #ffe23d;
  stroke: var(--edge);
  filter: drop-shadow(0 0 6px #ffe23d) drop-shadow(0 0 16px rgba(255, 226, 61, 0.6));
}
</style>
