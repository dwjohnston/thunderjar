<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import UnderConstruction from "./under-construction/UnderConstruction.vue";

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #home-hero-after>
      <UnderConstruction />
    </template>
  </Layout>
</template>
