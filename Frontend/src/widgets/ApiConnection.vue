<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { ApiError } from "../shared/api";
import ConnectionErrorDialog from "../shared/ConnectionErrorDialog.vue";
import { useSession } from "../entities/session";
const session = useSession();
const open = ref(false), busy = ref(false), code = ref("");
let controller: AbortController | undefined;
async function check() {
  controller?.abort();
  const current = controller = new AbortController();
  busy.value = true;
  let endpoint = "/api/health";
  try {
    await session.api.health({ signal: current.signal });
    endpoint = "/api/ready";
    const ready = await session.api.ready({ signal: current.signal });
    if (ready.database !== "ok" || ready.status !== "ready") throw new ApiError(0, "NOT_READY", "", "invalid-response");
    if (!current.signal.aborted) open.value = false;
  } catch (e) {
    if (current.signal.aborted || e instanceof ApiError && (e.status === 401 || e.kind === "aborted")) return;
    const reason = e instanceof ApiError && e.status ? `HTTP ${e.status}`
      : e instanceof ApiError && e.kind === "timeout" ? "Таймаут соединения"
      : e instanceof ApiError && e.kind === "invalid-response" ? "Сервис не готов" : "Ошибка сети";
    code.value = `${endpoint} · ${reason}`;
    open.value = true;
  } finally { if (controller === current) busy.value = false; }
}
onMounted(check);
onBeforeUnmount(() => controller?.abort());
</script>
<template>
  <ConnectionErrorDialog :open="open" :busy="busy" :code="code" @retry="check" @close="open = false" />
</template>
