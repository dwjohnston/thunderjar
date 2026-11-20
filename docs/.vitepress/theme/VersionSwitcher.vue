<script setup lang="ts">
import { useData } from "vitepress";
import { computed, onMounted, ref } from "vue";

type Version = { tag: string; path: string; sameAs?: string };
type Manifest = { latest: string; root: string; versions: Version[] };

const { site, page } = useData();
const manifest = ref<Manifest>();

// Versioned builds live at <root>vX.Y.Z/, so strip that to find the site root.
const siteRoot = computed(() => site.value.base.replace(/v\d+\.\d+\.\d+\/$/, ""));

onMounted(async () => {
  try {
    const response = await fetch(`${siteRoot.value}versions.json`);
    if (response.ok) manifest.value = await response.json();
  } catch {
    // No manifest (e.g. docs:dev), so no switcher.
  }
});

// Releases with identical docs share a build, so they share one option.
// Versions are newest first, so each group's first tag is its newest.
const options = computed(() => {
  const m = manifest.value;
  if (!m) return [];
  const groups = new Map<string, string[]>();
  for (const v of m.versions) groups.set(v.path, [...(groups.get(v.path) ?? []), v.tag]);
  return [...groups].map(([path, tags]) => {
    const isLatest = tags.includes(m.latest);
    const range = tags.length > 1 ? `${tags.at(-1)} – ${tags[0]}` : tags[0];
    return { path, url: isLatest ? m.root : path, label: isLatest ? `${range} (latest)` : range };
  });
});

const current = computed(() => {
  const m = manifest.value;
  if (!m) return undefined;
  if (site.value.base === m.root) return m.versions.find((v) => v.tag === m.latest)?.path;
  return site.value.base;
});

const pagePath = () =>
  page.value.relativePath
    .replace(/(^|\/)index\.md$/, "$1")
    .replace(/\.md$/, site.value.cleanUrls ? "" : ".html");

// Keep the reader on the same page, unless it doesn't exist in that version.
const switchTo = async (event: Event) => {
  const option = options.value.find(
    (o) => o.path === (event.target as HTMLSelectElement).value,
  );
  if (!option) return;
  const base = option.url;
  const target = `${base}${pagePath()}`;
  const exists = await fetch(target, { method: "HEAD" })
    .then((r) => r.ok)
    .catch(() => false);
  window.location.href = exists ? target : base;
};
</script>

<template>
  <div v-if="options.length > 0" class="version-switcher">
    <select :value="current" aria-label="Docs version" @change="switchTo">
      <option v-for="option in options" :key="option.path" :value="option.path">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<style scoped>
.version-switcher {
  display: flex;
  align-items: center;
  margin-left: 12px;
}

select {
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 13px;
  cursor: pointer;
}
</style>
