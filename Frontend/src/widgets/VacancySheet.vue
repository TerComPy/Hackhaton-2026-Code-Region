<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { photo, salary, type Job } from "../entities/job";
import { catalog } from "../entities/catalog";
import SaveButton from "../features/SaveButton.vue";
const props = defineProps<{ job: Job }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>(),
  mode = ref("plain");
const previous = document.activeElement as HTMLElement | null;
const isOpen = ref(false);
let openingFrame = 0;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
let closing = false;
let finished = false;
let savedOverflow = "";
function finishClose() {
  if (finished) return;
  finished = true;
  clearTimeout(closeTimer);
  dialog.value?.close();
  document.body.style.overflow = savedOverflow;
  emit("close");
}
function close() {
  if (closing) return;
  closing = true;
  cancelAnimationFrame(openingFrame);
  const panel = dialog.value?.querySelector<HTMLElement>(".sheet__panel");
  const wasOpen = isOpen.value;
  isOpen.value = false;
  if (!wasOpen || !panel || matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishClose();
    return;
  }
  const style = getComputedStyle(panel);
  const seconds = (value: string) => value.split(",").map(v => parseFloat(v) * (v.trim().endsWith("ms") ? 1 : 1000));
  const durations = seconds(style.transitionDuration), delays = seconds(style.transitionDelay);
  const duration = Math.max(...durations.map((d, i) => d + delays[i % delays.length]!));
  closeTimer = setTimeout(finishClose, duration + 50);
}
function onTransitionEnd(event: TransitionEvent) {
  if (closing && event.target === event.currentTarget && event.propertyName === "transform") finishClose();
}
onMounted(() => {
  savedOverflow = document.body.style.overflow;
  dialog.value?.showModal();
  document.body.style.overflow = "hidden";
  // Commit the closed pose before scheduling the opening transition.
  dialog.value?.querySelector(".sheet__panel")?.getBoundingClientRect();
  openingFrame = requestAnimationFrame(() => { if (!closing) isOpen.value = true; });
});
onBeforeUnmount(() => {
  cancelAnimationFrame(openingFrame);
  clearTimeout(closeTimer);
  dialog.value?.close();
  document.body.style.overflow = savedOverflow;
  if (previous?.isConnected) previous.focus();
});
const labels = {
  duties: "Что делать",
  requirements: "Что нужно",
  conditions: "Условия",
};
</script>
<template>
  <dialog
    ref="dialog"
    class="sheet"
    :class="{ 'is-open': isOpen }"
    aria-labelledby="sheet-title"
    @cancel.prevent="close"
    @click="
      (e) => {
        if (e.target === dialog) close();
      }
    "
  >
    <div class="sheet__panel" @transitionend="onTransitionEnd">
      <div class="sheet__bar">
        <span class="sheet__source">{{ job.source }}</span
        ><button class="icon-btn" aria-label="Закрыть" @click="close">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
      </div>
      <div class="sheet__scroll">
        <figure class="sheet__media"><img :src="photo(job)" alt="" /></figure>
        <div class="sheet__body">
          <h2 id="sheet-title" class="sheet__title">{{ job.title }}</h2>
          <p class="sheet__company">{{ job.company }} · {{ job.city }}</p>
          <dl class="facts">
            <div>
              <dt>Зарплата</dt>
              <dd>{{ salary(job) }}</dd>
            </div>
            <div>
              <dt>Формат</dt>
              <dd>{{ job.format }}</dd>
            </div>
            <div>
              <dt>Опыт</dt>
              <dd>{{ job.experience }}</dd>
            </div>
          </dl>
          <div class="seg">
            <button
              v-for="m in ['plain', 'original']"
              class="seg__btn"
              :aria-pressed="mode === m"
              @click="mode = m"
            >
              {{ m === "plain" ? "Простыми словами" : "Как у работодателя" }}
            </button>
          </div>
          <div class="flip" :data-mode="mode">
            <div class="flip__inner">
              <div
                v-for="m in ['plain', 'original'] as const"
                :class="'flip__face flip__' + m"
                :inert="mode !== m"
              >
                <section v-for="(label, key) in labels">
                  <h3>{{ label }}</h3>
                  <p v-if="m === 'plain'">{{ job.plain[key] }}</p>
                  <ul v-else>
                    <li v-for="line in job.original[key]">{{ line }}</li>
                  </ul>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="sheet__foot">
        <a
          class="btn btn--accent"
          :href="
            catalog.sources[job.source as keyof typeof catalog.sources].url(
              job.search,
            )
          "
          target="_blank"
          rel="noopener noreferrer"
          >Открыть на {{ job.source }}</a
        ><SaveButton :job="job" />
        <p class="sheet__disclaimer">
          Демо-вакансия: ссылка открывает поиск похожих объявлений.
        </p>
      </div>
    </div>
  </dialog>
</template>
