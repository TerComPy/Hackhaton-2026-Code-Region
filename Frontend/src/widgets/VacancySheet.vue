<script setup lang="ts">
import { ref, computed, reactive, onMounted, onBeforeUnmount } from "vue";
import { photo, salary, type Job } from "../entities/job";
import { catalog } from "../entities/catalog";
import SaveButton from "../features/SaveButton.vue";
import { useAiSummary } from "../entities/aiSummary";
import { useVacancyDetails, vacancySalary, vacancyFormats } from "../entities/vacancyDetails";
const props = defineProps<{ job?: Job; vacancyId?: string }>();
const details = useVacancyDetails(() => props.vacancyId);
const { authenticated, vacancy, skills, loading, error, status, outboundBusy, outboundError, outboundUrl, canOutbound } = details;
const ai = reactive(useAiSummary(
  () => props.vacancyId,
  () => !!vacancy.value && vacancy.value.status === "active" && !loading.value && !error.value,
));

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
  details.cancel();
  ai.cancel();
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
const schedules: Record<string, string> = { five_two: '5/2', six_one: '6/1', shift: 'Сменный', flexible: 'Гибкий', other: 'Другой', unknown: 'Не указано' };
const view = computed(() => {
  if (props.job) return { source: props.job.source, title: props.job.title, company: props.job.company, city: props.job.city, salary: salary(props.job), format: props.job.format, experience: props.job.experience };
  const v = vacancy.value;
  if (!v) return { title: loading.value ? 'Загрузка вакансии…' : 'Вакансия', source: '', company: '', city: '', salary: '', format: '', experience: '' };
  return { source: v.source_name, title: v.title, company: v.company_name || 'Компания не указана', city: v.city || 'Город не указан', salary: vacancySalary(v), format: vacancyFormats[v.work_format] || 'Не указано', experience: v.experience_months_min == null ? 'Не указано' : v.experience_months_min === 0 ? 'Без опыта' : `От ${v.experience_months_min} мес.` };
});
const originalSections = computed(() => vacancy.value ? [
  { label: 'Описание', text: vacancy.value.description },
  { label: 'Обязанности', text: vacancy.value.responsibilities },
  { label: 'Требования', text: vacancy.value.requirements },
].filter(s => s.text?.trim()) : []);
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
        <span class="sheet__source">{{ view?.source }}</span
        ><button class="icon-btn" aria-label="Закрыть" @click="close">
          <svg class="icon"><use href="#i-close" /></svg>
        </button>
      </div>
      <div class="sheet__scroll">
        <figure v-if="job" class="sheet__media"><img :src="photo(job)" alt="" /></figure>
        <div class="sheet__body">
          <h2 id="sheet-title" class="sheet__title">{{ view?.title }}</h2>
          <p v-if="job || vacancy" class="sheet__company">{{ view?.company }} · {{ view?.city }}</p>
          <dl v-if="job || vacancy" class="facts">
            <div>
              <dt>Зарплата</dt>
              <dd>{{ view?.salary }}</dd>
            </div>
            <div>
              <dt>Формат</dt>
              <dd>{{ view?.format }}</dd>
            </div>
            <div>
              <dt>Опыт</dt>
              <dd>{{ view?.experience }}</dd>
            </div>
          </dl>
          <template v-if="job">
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
          </template>
          <template v-else>            <div v-if="loading" class="sheet__loading" role="status" aria-label="Загрузка вакансии"><span></span><span></span><span></span></div>
            <div v-else-if="error" class="state" role="alert">{{ error }} <a v-if="status === 401" href="#/account" @click="close">Войти</a><button v-else class="btn btn--ghost" @click="details.load()">Повторить</button></div>
            <template v-else-if="vacancy">
              <p v-if="vacancy.status === 'archived'" class="state">Вакансия в архиве. Переход к работодателю недоступен.</p>
              <dl class="facts"><div><dt>График</dt><dd>{{ vacancy.schedule_text || schedules[vacancy.schedule_type || 'unknown'] || 'Не указано' }}</dd></div></dl>
              <div v-if="vacancy.status === 'active'" class="seg" role="group" aria-label="Режим описания вакансии">
                <button type="button" class="seg__btn" data-mode="plain"
                  :aria-pressed="ai.mode === 'plain'" @click="ai.showPlain()">Простыми словами</button>
                <button type="button" class="seg__btn" data-mode="original"
                  :aria-pressed="ai.mode === 'original'" @click="ai.showOriginal()">Как у работодателя</button>
              </div>
              <p v-if="vacancy.status === 'active' && (ai.polling || ai.loading)" class="sheet__ai-note" role="status" aria-live="polite">
                {{ ai.polling ? 'ИИ готовит понятное описание. Оригинал доступен, пока идёт обработка.' : 'Проверяем наличие ИИ-пересказа…' }}
              </p>
              <div v-if="vacancy.status === 'active' && ai.error" class="sheet__ai-feedback" role="alert">
                <p>{{ ai.error }}</p>
                <button type="button" class="btn btn--ghost" @click="ai.retry()">Повторить</button>
              </div>
              <div class="flip sheet__api-flip" :data-mode="vacancy.status === 'active' ? ai.mode : 'original'" :data-ai-status="ai.status">
                <div class="flip__inner">
                  <div class="flip__face flip__plain" :inert="ai.mode !== 'plain'">
                    <p class="flip__label"><span>Пересказ ИИ</span><span>Проверяйте по оригиналу</span></p>
                    <template v-if="ai.summary">
                      <h3 class="sheet__simple-title">{{ ai.summary.simpleTitle }}</h3>
                      <section v-if="ai.summary.whatYouDo.length">
                        <h3>Что делать</h3>
                        <ul><li v-for="(line, i) in ai.summary.whatYouDo" :key="'d-' + i">{{ line }}</li></ul>
                      </section>
                      <section v-if="ai.summary.requirements.length">
                        <h3>Что нужно</h3>
                        <ul><li v-for="(line, i) in ai.summary.requirements" :key="'r-' + i">{{ line }}</li></ul>
                      </section>
                      <section v-if="ai.summary.conditions.length">
                        <h3>Условия</h3>
                        <ul><li v-for="(line, i) in ai.summary.conditions" :key="'c-' + i">{{ line }}</li></ul>
                      </section>
                      <p v-if="ai.summary.beginnerFriendly" class="sheet__beginner">В объявлении допускаются кандидаты без опыта</p>
                    </template>
                  </div>
                  <div class="flip__face flip__original" :inert="vacancy.status === 'active' && ai.mode !== 'original'">
                    <p class="flip__label"><span>Оригинальное объявление</span></p>
                    <div class="sheet__original">
                      <section v-for="section in originalSections" :key="section.label">
                        <h3>{{ section.label }}</h3><p>{{ section.text }}</p>
                      </section>
                      <section v-if="skills.length">
                        <h3>Навыки</h3><ul><li v-for="skill in skills" :key="skill.id">
                          {{ skill.name }}{{ skill.is_required === 1 ? ' · обязательный' : '' }}
                        </li></ul>
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            </template></template>
        </div>
      </div>
      <div class="sheet__foot">
        <template v-if="job">
        <a
          class="btn btn--accent"
          :href="
            catalog.sources[job.source as keyof typeof catalog.sources].url(
              job.search,
            )
          "
          target="_blank"
          rel="noopener noreferrer"
          >Открыть на {{ view?.source }}</a
        ><SaveButton :job="job" />
        <p class="sheet__disclaimer">
          Демо-вакансия: ссылка открывает поиск похожих объявлений.
        </p>
        </template>
        <template v-else>          <button class="btn btn--accent" :disabled="!canOutbound || outboundBusy || loading || !!error" @click="details.outbound()">{{ outboundBusy ? 'Открываем…' : 'Открыть у работодателя' }}</button>
          <SaveButton v-if="vacancy && !error" :vacancy="vacancy" />
          <p v-if="outboundError" role="alert">{{ outboundError }} <a v-if="!authenticated" href="#/account" @click="close">Войти</a></p>
          <p v-if="outboundUrl" role="status">Новая вкладка заблокирована или закрыта. <a :href="outboundUrl" target="_blank" rel="noopener noreferrer">Открыть вакансию</a></p>
          <p class="sheet__disclaimer">Переход к работодателю не является откликом на вакансию.</p></template>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.sheet__original section { margin-top: 24px; }
.sheet__original h3 { margin-bottom: 8px; }
.sheet__original p { white-space: pre-wrap; overflow-wrap: anywhere; }
.sheet__loading { display: grid; gap: 16px; padding-block: 24px; }
.sheet__loading span { height: 24px; border-radius: 4px; background: var(--line); }
.sheet__loading span:last-child { width: 65%; }
.sheet__ai-note { margin-top: var(--s3); font-size: var(--t-sm); color: var(--ink-2); }
.sheet__ai-feedback { margin-top: var(--s3); display: grid; gap: var(--s2); font-size: var(--t-sm); color: var(--ink-2); }
.sheet__ai-feedback .btn { justify-self: start; min-height: 36px; }
.sheet__simple-title { font-size: var(--t-lg); }
.sheet__beginner { margin-top: var(--s5); color: var(--accent-ink); font-weight: 500; }
.sheet__api-flip .flip__face { min-width: 0; overflow-wrap: anywhere; }
</style>

