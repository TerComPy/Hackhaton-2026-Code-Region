import { createApp } from "vue";
import { createPinia } from "pinia";
import { createRouter, createWebHashHistory } from "vue-router";
import App from "./App.vue";
import ApiPreview from "../pages/ApiPreview.vue";
import Home from "../pages/Home.vue";
import Match from "../pages/Match.vue";
import Saved from "../pages/Saved.vue";
import Account from "../pages/Account.vue";
import "../shared/styles.css";
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/api-preview", component: ApiPreview },
    { path: "/", component: Home },
    { path: "/match", component: Match },
    { path: "/saved", component: Saved },
    { path: "/account", component: Account },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
createApp(App).use(createPinia()).use(router).mount("#app");
