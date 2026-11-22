import type { Theme } from "vitepress";
import DefaultTheme from "vitepress/theme";
import Layout from "./Layout.vue";
import Todo from "./Todo.vue";
import AiPlaceholder from "./AiPlaceholder.vue";
import "./sidebar.css";

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component("Todo", Todo);
    app.component("AiPlaceholder", AiPlaceholder);
  },
} satisfies Theme;
