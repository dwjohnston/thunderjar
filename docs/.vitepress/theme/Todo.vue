<!--
🤖
This file was created with AI

Harness: Claude Code
Supervising engineer: dwjohnston

Humans: add your notes here
-->
<!-- A road-hurdle "TODO" sign, with the slot content below it as normal text. -->
<template>
  <div class="todo">
    <hr />
    <div class="hurdle" role="img" aria-label="Under construction: todo">
      <div class="board"><span class="sign"><span class="small">UNDER CONSTRUCTION</span>TODO</span></div>
      <div class="legs"><span></span><span></span></div>
    </div>
    <div class="text"><slot /></div>
    <hr />
  </div>
</template>

<style scoped>
.todo {
  margin: 16px 0;
}

.hurdle {
  width: 120px;
}

.board {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  background: repeating-linear-gradient(-45deg, #ffd200 0 8px, #111 8px 16px);
  border: 2px solid #111;
  border-radius: 3px;
}

.sign {
  padding: 0 5px;
  background: #ffd200;
  color: #111;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  line-height: 1.4;
  border-radius: 2px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.small {
  font-size: 7px;
  letter-spacing: 0.02em;
  line-height: 1.3;
}

.legs {
  display: flex;
  justify-content: space-between;
  padding: 0 14px;
}

.legs span {
  width: 4px;
  height: 14px;
  background: #555;
}

.text {
  margin-top: 8px;
}
</style>
