<!--
🤖
This file was created with AI

Harness: Claude Code
Supervising engineer: dwjohnston

Humans: add your notes here
-->
<!-- A road-hurdle "TODO" sign, with the slot content below it as normal text. -->
<script setup lang="ts">
import Hurdle from "./Hurdle.vue";
</script>

<template>
  <div class="todo">
    <hr />
    <Hurdle label="TODO" />
    <div class="text"><slot /></div>
    <hr />
  </div>
</template>

<style scoped>
.todo {
  margin: 16px 0;
}

.text {
  margin-top: 8px;
}
</style>
