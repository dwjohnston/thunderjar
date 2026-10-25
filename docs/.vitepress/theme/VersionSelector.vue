<script setup lang="ts">
import { computed } from "vue";
import { useData } from "vitepress";

type VersionInfo = { current: string; versions: string[]; root: string };
const { theme } = useData();
const info = computed(() => theme.value.versionInfo as VersionInfo | undefined);
const selected = computed(() => info.value?.current === "latest"
  ? info.value.root
  : `${info.value?.root}v/${info.value?.current}/`);

function navigate(event: Event) {
  const target = event.target as HTMLSelectElement;
  window.location.assign(target.value);
}
</script>

<template>
  <label v-if="info?.versions.length" class="version-selector">
    Version
    <select :value="selected" aria-label="Documentation version" @change="navigate">
      <option :value="info.root">Latest ({{ info.versions[0] }})</option>
      <option v-for="version in info.versions" :key="version" :value="`${info.root}v/${version}/`">
        {{ version }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.version-selector {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-inline-start: 1rem;
  font-size: 0.875rem;
}

select {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.3rem;
  padding: 0.2rem;
}
</style>
