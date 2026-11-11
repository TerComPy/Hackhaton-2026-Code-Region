<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { ApiError } from "../shared/api";
import { useSession } from "../entities/session";
const session = useSession();
const state = ref<"loading" | "ready" | "error">("loading");
const message = ref("");
let controller: AbortController | undefined;
async function check() {
  controller?.abort();
  const current = controller = new AbortController();
  state.value = "loading";
  try {
    await session.api.health({ signal: current.signal });
    const ready = await session.api.ready({ signal: current.signal });
    if (ready.database !== "ok" || ready.status !== "ready") throw new Error("MySQL не подтвердил готовность");
    if (!current.signal.aborted) state.value = "ready";
  } catch (e) {
    if (current.signal.aborted) return;
    state.value = "error";
    message.value = e instanceof ApiError ? `${e.message}${e.status ? ` (HTTP ${e.status})` : ""}` : String(e);
  }
}
onMounted(check);
onBeforeUnmount(() => controller?.abort());
</script>
<template>
  <section class="wrap" aria-label="Подключение к API" :aria-busy="state === 'loading'">
    <p v-if="state === 'loading'" role="status">Проверяем подключение…</p>
    <p v-else-if="state === 'error'" role="alert">{{ message }} <button class="btn btn--ghost" @click="check">Повторить</button></p>
    <p v-else role="status">Соединение установлено. MySQL доступен. Данные каталога и личного кабинета пока не подключены.</p>
  </section>
</template>
