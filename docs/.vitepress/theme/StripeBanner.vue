<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiEQXvvk5Xk2ZwwPEi
Supervising engineer: dwjohnston

Humans: add your notes here
-->
<!-- A black and yellow hazard stripe across the top of the docs pages, with a worker on the right. -->
<template>
  <div class="stripe-banner">
    <div class="stripes" role="img" aria-label="Under construction">
    <svg class="worker" viewBox="0 0 40 44" aria-hidden="true">
      <!-- shovel -->
      <path d="M27 14 L36 37" stroke="#111" stroke-width="2.5" stroke-linecap="round" />
      <path d="M33 34 L39 32 L41 40 L35 42 Z" fill="#777" stroke="#111" stroke-width="1.5" stroke-linejoin="round" />
      <!-- body: torso, arms, legs -->
      <g fill="none" stroke="#111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 16 L18 29" />
        <path d="M18 19 L27 16 M18 21 L29 22" />
        <path d="M18 29 L13 41 M18 29 L23 41" />
      </g>
      <!-- hi-vis vest -->
      <rect x="15" y="17" width="6" height="10" rx="1.5" fill="#ff7a00" stroke="#111" stroke-width="1.2" />
      <!-- head and hard hat -->
      <circle cx="18" cy="11" r="4.5" fill="#f2c9a0" stroke="#111" stroke-width="1.2" />
      <path d="M12.5 9 Q13 3 18 3 Q23 3 23.5 9 Z" fill="#ffd200" stroke="#111" stroke-width="1.2" stroke-linejoin="round" />
      <path d="M11 9 H25" stroke="#111" stroke-width="1.6" stroke-linecap="round" />
    </svg>
    </div>
  </div>
</template>

<style scoped>
/* The outer div holds the space in the page; the stripes stay pinned above the fixed nav. */
.stripe-banner {
  height: var(--vp-layout-top-height);
}

.stripes {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: calc(var(--vp-z-index-nav) + 1);
  height: var(--vp-layout-top-height);
  background: repeating-linear-gradient(-45deg, #ffd200 0 14px, #111 14px 28px);
  border-bottom: 2px solid #111;
  box-sizing: border-box;
}

.worker {
  position: absolute;
  top: 0;
  right: 24px;
  height: 34px;
  padding: 2px 6px 0;
  border: 2px solid #111;
  border-top: 0;
  border-radius: 0 0 8px 8px;
  background: #ffd200;
}

@media (min-width: 960px) {
  .worker {
    right: 48px;
  }
}
</style>

<style>
/* Push the nav and sidebar down by the banner's height, only while it is shown. */
:root:has(.stripe-banner) {
  --vp-layout-top-height: 22px;
}
</style>
