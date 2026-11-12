<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watch } from "vue";
const props = defineProps<{ open: boolean; busy: boolean; code: string }>();
const emit = defineEmits<{ close: []; retry: [] }>();
const dialog = ref<HTMLDialogElement>();
const titleId = useId(), descriptionId = useId();
let previous: HTMLElement | null = null;
let overflow: string | undefined;
function trapFocus(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const buttons = dialog.value?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
  if (!buttons?.length) return;
  const first = buttons[0]!, last = buttons[buttons.length - 1]!;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
function release() {
  if (overflow !== undefined) document.body.style.overflow = overflow;
  overflow = undefined;
  if (previous?.isConnected) previous.focus({ preventScroll: true });
  previous = null;
}
watch(() => props.open, open => {
  if (open) {
    previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.value?.showModal();
  } else {
    dialog.value?.close();
    release();
  }
}, { flush: "post" });
onBeforeUnmount(() => { dialog.value?.close(); release(); });
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="connection-dialog" aria-modal="true" :aria-labelledby="titleId" :aria-describedby="descriptionId" @keydown="trapFocus" @cancel.prevent="emit('close')">
      <button class="connection-dialog__close" type="button" aria-label="Закрыть окно" @click="emit('close')">×</button>
      <h2 :id="titleId">Не удалось подключиться к серверу</h2>
      <p :id="descriptionId">Сервис временно недоступен. Попробуйте ещё раз</p>
      <p class="connection-dialog__code" role="status">{{ code }}</p>
      <button class="btn btn--accent" type="button" :aria-disabled="busy" @click="!busy && emit('retry')">{{ busy ? 'Проверяем…' : 'Повторить' }}</button>
    </dialog>
  </Teleport>
</template>
<style scoped>
.connection-dialog { position: fixed; inset: 0; margin: auto; box-sizing: border-box; width: min(480px, calc(100% - 32px)); max-height: calc(100dvh - 32px); overflow: auto; padding: 48px 32px 32px; border: 1px solid var(--line); border-radius: 24px; background: var(--surface); color: var(--ink); box-shadow: 0 24px 90px #0005; }
.connection-dialog::backdrop { background: #080807aa; backdrop-filter: blur(5px); }
.connection-dialog h2 { margin: 0 0 16px; font-size: clamp(24px, 5vw, 30px); line-height: 1.2; }
.connection-dialog p { color: var(--ink-2); line-height: 1.5; }
.connection-dialog__code { font-size: 13px; }
.connection-dialog__close { position: absolute; top: 10px; right: 12px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent; color: var(--ink); font-size: 28px; cursor: pointer; }
.connection-dialog .btn { width: 100%; margin-top: 12px; }
</style>
