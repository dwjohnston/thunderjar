<!--
🤖
This file was created with AI

Harness: Claude Code
Supervising engineer: dwjohnston

Humans: add your notes here
-->
<!-- A small block-level "todo" label with black and yellow hazard banding. -->
<template>
  <div class="todo">
    <span class="label"><slot /></span>
  </div>
</template>

<style scoped>
.todo {
  display: block;
  width: fit-content;
  min-width: 100px;
  margin: 16px 0;
  padding: 4px;
  background: repeating-linear-gradient(-45deg, #ffd200 0 8px, #111 8px 16px);
  border-radius: 4px;
}

.label {
  display: block;
  padding: 2px 8px;
  background: #ffd200;
  color: #111;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.4;
  border-radius: 2px;
}
</style>
