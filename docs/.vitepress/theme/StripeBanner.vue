<!--
🤖
This file was created with AI

Harness: Claude Code
Session Id: session_01LCLeLiEQXvvk5Xk2ZwwPEi
Supervising engineer: dwjohnston

Humans: add your notes here
-->
<!-- A black and yellow hazard stripe across the top of the docs pages. -->
<template>
  <div class="stripe-banner">
    <div class="stripes" role="img" aria-label="Under construction"></div>
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
</style>

<style>
/* Push the nav and sidebar down by the banner's height, only while it is shown. */
:root:has(.stripe-banner) {
  --vp-layout-top-height: 22px;
}
</style>
