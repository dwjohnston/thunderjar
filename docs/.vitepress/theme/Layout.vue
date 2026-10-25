<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import UnderConstruction from "./under-construction/UnderConstruction.vue";
import VersionSelector from "./VersionSelector.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <VersionSelector />
    </template>
    <template #nav-screen-content-after>
      <VersionSelector />
    </template>
    <template #home-hero-after>
      <UnderConstruction />
    </template>
  </Layout>
</template>
