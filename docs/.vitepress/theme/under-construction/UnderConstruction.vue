<template>
  <div
    class="uc"
    role="img"
    aria-label="Under construction. A truck hauls an empty jar under a storm cloud, which zaps a lightning bolt into it."
  >
    <div class="uc-tape uc-tape-text"></div>

    <div class="uc-scene">
      <div class="uc-cloud">
        <svg viewBox="0 0 120 60">
          <defs>
            <g id="uc-cloud-shape">
              <circle cx="28" cy="38" r="16" />
              <circle cx="48" cy="26" r="20" />
              <circle cx="74" cy="24" r="22" />
              <circle cx="96" cy="38" r="16" />
              <rect x="28" y="32" width="68" height="22" rx="11" />
            </g>
          </defs>
          <use href="#uc-cloud-shape" class="uc-cloud-ink" />
          <use href="#uc-cloud-shape" class="uc-cloud-fill" />
          <circle cx="51" cy="35" r="3.6" fill="#fff" />
          <circle cx="73" cy="35" r="3.6" fill="#fff" />
          <circle cx="51.6" cy="36.2" r="1.7" fill="#111" />
          <circle cx="72.4" cy="36.2" r="1.7" fill="#111" />
          <path
            d="M44 27.5L56 31.5M80 27.5L68 31.5M55 46.5Q62 42 69 46.5"
            fill="none"
            stroke="#111"
            stroke-width="2.4"
            stroke-linecap="round"
          />
        </svg>
      </div>

      <div class="uc-verge"></div>
      <div class="uc-road"></div>

      <svg class="uc-sign" viewBox="0 0 100 130">
        <rect
          x="46"
          y="92"
          width="8"
          height="38"
          fill="#777"
          stroke="#111"
          stroke-width="2"
        />
        <polygon
          points="50,4 96,50 50,96 4,50"
          fill="#ffd200"
          stroke="#111"
          stroke-width="4"
          stroke-linejoin="round"
        />
        <g transform="translate(50 50) scale(.418) translate(-160 -125)">
          <g fill="none" stroke="#111" stroke-width="9" stroke-linecap="round">
            <path d="M104 165H222" stroke-width="5" />
            <path d="M148 92L128 126M128 126L114 161M128 126L146 161" />
            <g class="uc-dig">
              <path d="M148 92L168 116" />
              <path d="M154 98L190 140" stroke-width="5" />
              <path
                d="M187 136L199 150"
                stroke-width="14"
                stroke-linecap="butt"
              />
            </g>
          </g>
          <circle cx="155" cy="76" r="10" fill="#111" />
          <path d="M178 165Q198 128 220 165Z" fill="#111" />
        </g>
      </svg>

      <svg class="uc-barrier" viewBox="0 0 110 70">
        <defs>
          <clipPath id="uc-board">
            <rect x="4" y="22" width="102" height="20" rx="2" />
          </clipPath>
        </defs>
        <g fill="#777" stroke="#111" stroke-width="2">
          <rect x="14" y="14" width="6" height="56" />
          <rect x="90" y="14" width="6" height="56" />
        </g>
        <rect x="4" y="22" width="102" height="20" rx="2" fill="#ffd200" />
        <g clip-path="url(#uc-board)">
          <line
            class="uc-stripes"
            x1="0"
            y1="32"
            x2="200"
            y2="32"
            stroke="#111"
            stroke-width="22"
            stroke-dasharray="10 10"
            transform="skewX(-30)"
          />
        </g>
        <rect
          x="4"
          y="22"
          width="102"
          height="20"
          rx="2"
          fill="none"
          stroke="#111"
          stroke-width="2"
        />
        <rect
          x="4"
          y="50"
          width="102"
          height="8"
          rx="2"
          fill="#f4f4f4"
          stroke="#111"
          stroke-width="2"
        />
        <circle
          class="uc-blink"
          cx="17"
          cy="9"
          r="7"
          fill="#ff8a00"
          stroke="#111"
          stroke-width="2"
        />
        <circle
          class="uc-blink uc-blink-late"
          cx="93"
          cy="9"
          r="7"
          fill="#ff8a00"
          stroke="#111"
          stroke-width="2"
        />
      </svg>

      <div class="uc-lane">
        <svg class="uc-truck" viewBox="0 0 200 110">
          <defs>
            <radialGradient id="uc-glow">
              <stop offset="0" stop-color="#fff7a8" stop-opacity=".95" />
              <stop offset="1" stop-color="#ffd200" stop-opacity="0" />
            </radialGradient>
          </defs>
          <g class="uc-truck-body">
            <circle
              v-for="n in 3"
              :key="n"
              class="uc-puff"
              cx="123.5"
              cy="22"
              r="5"
            />
            <rect x="121" y="30" width="5" height="50" fill="#666" />
            <rect x="119" y="27" width="9" height="4" rx="1" fill="#444" />

            <rect x="14" y="86" width="172" height="7" fill="#3d3d3d" />
            <rect x="6" y="78" width="124" height="9" rx="2" fill="#222" />
            <rect x="3" y="80" width="4" height="5" fill="#e11" />

            <g class="uc-caught">
              <circle
                class="uc-flicker"
                cx="68"
                cy="52"
                r="36"
                fill="url(#uc-glow)"
              />
            </g>
            <g class="uc-jar">
              <path
                d="M46 44L32 78M90 44L104 78"
                fill="none"
                stroke="#7a5a2b"
                stroke-width="2"
              />
              <path
                d="M46 78V38Q46 28 56 26V20H80V26Q90 28 90 38V78Z"
                fill="#dff3ff"
                fill-opacity=".5"
                stroke="#3f6478"
                stroke-width="2.5"
                stroke-linejoin="round"
              />
              <g class="uc-caught">
                <polygon
                  class="uc-flicker"
                  points="72,30 58,54 67,54 61,74 80,48 70,48 77,30"
                  fill="#ffe14a"
                  stroke="#e08a00"
                  stroke-width="1.5"
                  stroke-linejoin="round"
                />
              </g>
              <path
                d="M52 40V68"
                stroke="#fff"
                stroke-opacity=".8"
                stroke-width="3"
                stroke-linecap="round"
              />
              <rect
                x="53"
                y="13"
                width="30"
                height="8"
                rx="2"
                fill="#c0392b"
                stroke="#6e1f16"
                stroke-width="1.5"
              />
            </g>

            <path
              d="M132 90V50Q132 44 138 44H162Q168 44 171 50L178 66H190Q196 66 196 72V90Z"
              fill="#ff9f1c"
              stroke="#a85a00"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path
              d="M142 50H160Q164 50 166 54L171 66H142Z"
              fill="#cfefff"
              stroke="#222"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
            <circle cx="155" cy="60.5" r="4.5" fill="#f2c9a0" />
            <circle cx="157.2" cy="60.8" r=".8" fill="#111" />
            <path d="M150 58.5Q155 50 160 58.5Z" fill="#ffd200" stroke="#111" />
            <path
              d="M149 58.5H163"
              stroke="#111"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <path
              d="M140 70V88H170V70"
              fill="none"
              stroke="#a85a00"
              stroke-width="1.5"
            />
            <rect x="144" y="73" width="7" height="2.5" rx="1" fill="#a85a00" />
            <rect
              x="191"
              y="71"
              width="5"
              height="7"
              rx="1.5"
              fill="#fff6a8"
              stroke="#a85a00"
            />
            <rect x="184" y="87" width="14" height="6" rx="2" fill="#888" />
            <rect
              class="uc-blink"
              x="148"
              y="37"
              width="9"
              height="7"
              rx="2.5"
              fill="#ff8a00"
              stroke="#111"
            />
          </g>
          <g v-for="x in [30, 58, 166]" :key="x" class="uc-wheel">
            <circle :cx="x" cy="95" r="13" fill="#1a1a1a" />
            <circle :cx="x" cy="95" r="6" fill="#c9c9c9" />
            <path
              :d="`M${x} 84V106M${x - 11} 95H${x + 11}`"
              stroke="#c9c9c9"
              stroke-width="2"
            />
          </g>
        </svg>
      </div>

      <svg class="uc-strike" viewBox="0 0 40 100">
        <polygon
          points="22,0 6,44 18,44 12,100 34,36 22,36 32,0"
          fill="#fff7a8"
          stroke="#ffb300"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
      </svg>

      <svg class="uc-zap" viewBox="0 0 120 80">
        <polygon
          points="60.0,2.0 70.6,15.9 89.0,7.1 89.0,22.3 110.2,21.0 99.6,33.5 118.0,40.0 99.6,46.5 110.2,59.0 89.0,57.7 89.0,72.9 70.6,64.1 60.0,78.0 49.4,64.1 31.0,72.9 31.0,57.7 9.8,59.0 20.4,46.5 2.0,40.0 20.4,33.5 9.8,21.0 31.0,22.3 31.0,7.1 49.4,15.9"
          fill="#ff3b30"
          stroke="#111"
          stroke-width="3"
          stroke-linejoin="round"
        />
        <text
          x="60"
          y="50"
          text-anchor="middle"
          font-size="28"
          font-weight="bold"
          fill="#ffe14a"
          stroke="#111"
          stroke-width="5"
          stroke-linejoin="round"
          paint-order="stroke"
        >
          ZAP!
        </text>
      </svg>

      <div class="uc-cones"></div>
      <div class="uc-flash"></div>
    </div>

    <div class="uc-tape uc-tape-stripes"></div>
  </div>
</template>

<style>
.uc {
  /* One lap of the story. Everything tagged "story" below shares this
     duration, so the keyframe percentages line up across elements:
     0-30% drive in, 30-56% parked under the cloud (zap at 42%),
     56-90% drive off, 90-100% empty road. */
  --uc-t: 11s;
  --uc-ink: #111;
  --uc-yellow: #ffd200;
  --uc-sky: linear-gradient(#7cc8ff, #e3f4ff);
  --uc-cloud-ink: #2f3644;
  --uc-verge: #c79a5b;
  --uc-verge-edge: #a67c3d;
  margin-bottom: 2.5rem;
  border-block: 3px solid var(--uc-ink);
}

.dark .uc {
  --uc-sky: radial-gradient(circle, #fff 1px, transparent 1.5px) 10px 14px /
      180px 110px,
    radial-gradient(circle, #fff 1px, transparent 1.5px) 90px 60px / 230px 130px,
    radial-gradient(circle, #cfd8ff 1.2px, transparent 1.8px) 150px 30px / 310px
      90px,
    linear-gradient(#0a0f2c, #2b2f5e);
  --uc-cloud-ink: #aab3cf;
  --uc-verge: #6b5231;
  --uc-verge-edge: #4f3c22;
}

/* Tapes: a tiled strip one tile wider than the banner, slid by one tile. */
.uc-tape {
  position: relative;
  overflow: hidden;
}

.uc-tape::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
}

.uc-tape-text {
  height: 28px;
}

.uc-tape-text::before {
  left: 0;
  right: -686px;
  background: url("./tape.svg") 0 0 / 686px 28px repeat-x;
  animation: uc-tape-text 22s linear infinite;
}

.uc-tape-stripes {
  height: 18px;
}

.uc-tape-stripes::before {
  left: -36px;
  right: 0;
  background: linear-gradient(
      135deg,
      var(--uc-ink) 25%,
      var(--uc-yellow) 25% 50%,
      var(--uc-ink) 50% 75%,
      var(--uc-yellow) 75%
    )
    0 0 / 36px 36px;
  animation: uc-tape-stripes 1.2s linear infinite;
}

/* Scene: sized in em so the font-size scales the whole picture. */
.uc-scene {
  position: relative;
  height: 19em;
  overflow: hidden;
  border-block: 3px solid var(--uc-ink);
  background: var(--uc-sky);
  font-size: 10px;
}

.uc-scene > * {
  position: absolute;
}

.uc-scene svg {
  display: block;
  overflow: visible;
}

.uc-cloud {
  top: 0.8em;
  left: 50%;
  width: 9em;
  margin-left: -4.5em;
  animation: uc-bob 3s ease-in-out infinite alternate;
}

.uc-cloud svg {
  animation: uc-rumble var(--uc-t) linear infinite; /* story */
}

.uc-cloud-ink {
  fill: var(--uc-cloud-ink);
  stroke: var(--uc-cloud-ink);
  stroke-width: 5;
}

.uc-cloud-fill {
  fill: #9aa3b5;
  animation: uc-brood var(--uc-t) linear infinite; /* story */
}

.uc-verge {
  right: 0;
  bottom: 4.5em;
  left: 0;
  height: 1.2em;
  border-top: 0.2em solid var(--uc-verge-edge);
  background: var(--uc-verge);
}

.uc-road {
  right: 0;
  bottom: 0;
  left: 0;
  height: 4.5em;
  border-top: 0.25em solid #d9d9d9;
  background: linear-gradient(#55555c, #3b3b41);
}

.uc-road::after {
  content: "";
  position: absolute;
  top: 1.1em;
  right: 0;
  left: 0;
  height: 0.25em;
  background: repeating-linear-gradient(
    90deg,
    var(--uc-yellow) 0 2.4em,
    transparent 2.4em 4.8em
  );
}

.uc-sign {
  bottom: 4.9em;
  left: max(1em, 6%);
  width: 6.4em;
}

.uc-barrier {
  right: max(1em, 6%);
  bottom: 4.7em;
  width: 9em;
}

/* The lane is as wide as the banner, so sliding it by its own width carries
   the truck from off-screen left, to parked under the cloud, to off-screen
   right, at any banner width. */
.uc-lane {
  inset: 0;
  animation: uc-drive var(--uc-t) linear infinite; /* story */
}

.uc-truck {
  position: absolute;
  bottom: 1em;
  left: 50%;
  width: 18em;
  margin-left: -6.12em; /* puts the jar, not the truck, under the cloud */
  animation: uc-jolt var(--uc-t) linear infinite; /* story */
}

.uc-truck-body {
  animation: uc-idle 0.2s step-end infinite;
}

.uc-wheel {
  transform-box: fill-box;
  transform-origin: center;
  animation: uc-roll var(--uc-t) linear infinite; /* story */
}

.uc-jar {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: uc-wobble 0.5s ease-in-out infinite alternate;
}

.uc-caught {
  animation: uc-caught var(--uc-t) step-end infinite; /* story */
}

.uc-flicker {
  animation: uc-flicker 0.4s step-end infinite;
}

.uc-puff {
  transform-box: fill-box;
  transform-origin: center;
  fill: #8a8a8a;
  opacity: 0;
  animation: uc-puff 1.2s ease-out infinite;
}

.uc-puff:nth-child(2) {
  animation-delay: -0.4s;
}

.uc-puff:nth-child(3) {
  animation-delay: -0.8s;
}

.uc-strike {
  top: 4.7em;
  left: 50%;
  width: 2.52em;
  margin-left: -0.76em; /* lines the tip of the bolt up with the jar */
  opacity: 0;
  animation: uc-strike var(--uc-t) step-end infinite; /* story */
}

.uc-zap {
  top: 4.4em;
  left: calc(50% + 1.4em);
  width: 7.5em;
  opacity: 0;
  transform: rotate(-10deg);
  font-family: "Arial Black", "Helvetica Neue", Arial, sans-serif;
  animation: uc-zap var(--uc-t) linear infinite; /* story */
}

.uc-cones {
  right: 0;
  bottom: 0.15em;
  left: 0;
  height: 2.4em;
  background: url("./cone.svg") 50% 100% / 9em 2.4em repeat-x;
}

.uc-flash {
  inset: 0;
  background: #fff;
  opacity: 0;
  pointer-events: none;
  animation: uc-flash var(--uc-t) linear infinite; /* story */
}

.uc-dig {
  transform-box: fill-box;
  transform-origin: 0 0;
  animation: uc-dig 0.7s ease-in-out infinite alternate;
}

.uc-stripes {
  animation: uc-stripes 1s linear infinite;
}

.uc-blink {
  animation: uc-blink 0.8s step-end infinite;
}

.uc-blink-late {
  animation-delay: -0.4s;
}

@media (min-width: 40rem) {
  .uc {
    --uc-t: 13s;
  }

  .uc-scene {
    font-size: 12px;
  }
}

@media (min-width: 60rem) {
  .uc {
    --uc-t: 15s;
  }

  .uc-scene {
    font-size: 13px;
  }
}

/* Without animation the scene rests on its best frame: truck parked under
   the cloud, bolt already in the jar. */
@media (prefers-reduced-motion: reduce) {
  .uc *,
  .uc *::before {
    animation: none !important;
  }
}

@keyframes uc-drive {
  0% {
    transform: translateX(-100%);
    animation-timing-function: cubic-bezier(0.1, 0.6, 0.3, 1);
  }
  30% {
    transform: translateX(0);
  }
  56% {
    transform: translateX(0);
    animation-timing-function: cubic-bezier(0.7, 0, 0.9, 0.4);
  }
  90%,
  100% {
    transform: translateX(100%);
  }
}

@keyframes uc-roll {
  0% {
    transform: rotate(0);
    animation-timing-function: cubic-bezier(0.1, 0.6, 0.3, 1);
  }
  30% {
    transform: rotate(1800deg);
  }
  56% {
    transform: rotate(1800deg);
    animation-timing-function: cubic-bezier(0.7, 0, 0.9, 0.4);
  }
  90%,
  100% {
    transform: rotate(3600deg);
  }
}

@keyframes uc-jolt {
  0%,
  42%,
  46.5%,
  100% {
    transform: none;
  }
  43% {
    transform: translateY(-0.6em) rotate(-2deg);
  }
  44.5% {
    transform: translateY(0.1em);
  }
}

@keyframes uc-rumble {
  0%,
  30%,
  47%,
  100% {
    transform: none;
  }
  32%,
  36%,
  40% {
    transform: translate(-0.14em, 0.05em);
  }
  34%,
  38%,
  41.5% {
    transform: translate(0.14em, -0.05em);
  }
  42% {
    transform: translateY(0.4em) scale(1.1);
  }
}

@keyframes uc-brood {
  0%,
  28%,
  52%,
  100% {
    fill: #9aa3b5;
  }
  40%,
  43% {
    fill: #4b5563;
  }
}

@keyframes uc-caught {
  0% {
    opacity: 0;
  }
  42%,
  100% {
    opacity: 1;
  }
}

@keyframes uc-strike {
  0%,
  43.5%,
  47%,
  100% {
    opacity: 0;
  }
  42%,
  45% {
    opacity: 1;
  }
}

@keyframes uc-flash {
  0%,
  42%,
  43.5%,
  45%,
  47%,
  100% {
    opacity: 0;
  }
  42.3% {
    opacity: 0.4;
  }
  45.3% {
    opacity: 0.25;
  }
}

@keyframes uc-zap {
  0%,
  42% {
    opacity: 0;
    transform: rotate(-10deg) scale(0.2);
  }
  43.5% {
    opacity: 1;
    transform: rotate(-10deg) scale(1.2);
  }
  45%,
  52% {
    opacity: 1;
    transform: rotate(-10deg) scale(1);
  }
  55%,
  100% {
    opacity: 0;
    transform: rotate(-10deg) scale(1.3);
  }
}

@keyframes uc-bob {
  to {
    transform: translateY(0.35em);
  }
}

@keyframes uc-idle {
  50% {
    transform: translateY(1px);
  }
}

@keyframes uc-wobble {
  from {
    transform: rotate(-2deg);
  }
  to {
    transform: rotate(2deg);
  }
}

@keyframes uc-flicker {
  30% {
    opacity: 0.6;
  }
  45% {
    opacity: 1;
  }
  70% {
    opacity: 0.8;
  }
}

@keyframes uc-puff {
  from {
    opacity: 0.8;
    transform: scale(0.5);
  }
  to {
    opacity: 0;
    transform: translate(-28px, -16px) scale(2);
  }
}

@keyframes uc-dig {
  from {
    transform: rotate(-16deg);
  }
  to {
    transform: rotate(8deg);
  }
}

@keyframes uc-stripes {
  to {
    stroke-dashoffset: -20;
  }
}

@keyframes uc-blink {
  50% {
    fill: #7a4300;
  }
}

@keyframes uc-tape-text {
  to {
    transform: translateX(-686px);
  }
}

@keyframes uc-tape-stripes {
  to {
    transform: translateX(36px);
  }
}
</style>
