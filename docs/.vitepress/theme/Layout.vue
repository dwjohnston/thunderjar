<script setup lang="ts">
import { useData } from "vitepress";
import DefaultTheme from "vitepress/theme";
import Splash from "./splash/Splash.vue";
import StripeBanner from "./StripeBanner.vue";
import UnderConstruction from "./under-construction/UnderConstruction.vue";
import VersionSwitcher from "./VersionSwitcher.vue";

const { Layout } = DefaultTheme;
const { frontmatter } = useData();
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <VersionSwitcher />
    </template>
    <template #layout-top>
      <StripeBanner v-if="frontmatter.layout !== 'home'" />
    </template>
    <template #home-hero-before>
      <UnderConstruction />
      <Splash />
    </template>
  </Layout>
</template>
