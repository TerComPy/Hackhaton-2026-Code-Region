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
onMounted(() => {
  dialog.value?.showModal();
  document.body.style.overflow = "hidden";
});
onBeforeUnmount(() => {
  document.body.style.overflow = "";
  previous?.focus();
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
    aria-labelledby="sheet-title"
    @cancel.prevent="emit('close')"
    @click="
      (e) => {
        if (e.target === dialog) emit('close');
      }
    "
  >
    <div class="sheet__panel">
      <div class="sheet__bar">
        <span class="sheet__source">{{ job.source }}</span
        ><button class="icon-btn" aria-label="Закрыть" @click="emit('close')">
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
