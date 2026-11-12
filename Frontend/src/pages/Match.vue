<script setup lang="ts">
import { computed, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import { ApiError, dataMode, type MatchDirection } from "../shared/api";
import { useSession } from "../entities/session";
import { useCatalog } from "../entities/store";
import { catalog } from "../entities/catalog";
import JobList from "../widgets/JobList.vue";
import ApiJobList from "../widgets/ApiJobList.vue";

const store = useCatalog();
const session = useSession();
const apiMode = dataMode === "api";
const localAbout = ref("");
const about = computed({
  get: () => apiMode ? localAbout.value : store.about,
  set: value => { if (apiMode) localAbout.value = value; else store.about = value; }
});
const error = ref("");
const busy = ref(false);
const ready = ref(!apiMode && store.about.length >= 40);
const directions = ref<MatchDirection[]>([]);
let controller: AbortController | undefined;
let generation = 0;

function cancel() {
  generation++;
  controller?.abort();
  controller = undefined;
  busy.value = false;
}
function resetPrivate() {
  cancel();
  localAbout.value = "";
  directions.value = [];
  ready.value = false;
  error.value = "";
}
watch(() => session.user?.id, () => {
  if (apiMode) resetPrivate();
}, { flush: "sync" });
onDeactivated(cancel);
onBeforeUnmount(cancel);

function failureMessage(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.status === 401) return "Сессия недействительна. Войдите повторно.";
    if (cause.status === 429) return "Подождите немного перед повторным подбором.";
    if (cause.status === 503 || cause.status === 502) return "Сейчас не удалось получить рекомендации от ИИ. Повторите попытку.";
    if (cause.kind === "network" || cause.kind === "timeout") return "Не удалось связаться с сервером. Проверьте подключение.";
  }
  return "Не удалось подобрать направления. Повторите попытку.";
}

async function submit() {
  if (busy.value) return;
  const text = about.value.trim();
  error.value = text.length < 40 ? "Напишите хотя бы 40 символов о себе." : "";
  if (error.value) return;
  if (!apiMode) { ready.value = true; return; }
  if (!session.authenticated) {
    error.value = "Для персонального подбора нужно войти в аккаунт.";
    return;
  }
  cancel();
  const serial = generation;
  const owner = session.user?.id;
  const current = new AbortController();
  controller = current;
  directions.value = [];
  ready.value = false;
  busy.value = true;
  try {
    const result = await session.api.match({ about: text }, { signal: current.signal, timeoutMs: 25_000 });
    if (serial !== generation || !session.authenticated || session.user?.id !== owner) return;
    if (!Array.isArray(result.directions) || result.directions.length !== 3 ||
      result.directions.some(d => !Array.isArray(d.vacancies) || !Array.isArray(d.evidence))) {
      throw Error("Invalid matching response");
    }
    directions.value = result.directions;
    ready.value = true;
  } catch (cause) {
    if (serial !== generation) return;
    error.value = failureMessage(cause);
  } finally {
    if (serial === generation) {
      busy.value = false;
      controller = undefined;
    }
  }
}
</script>

<template>
  <section class="match wrap">
    <div class="match__intro">
      <p class="eyebrow">Подбор профессии</p>
      <h1 class="page-title">Расскажите о себе своими словами</h1>
      <p class="lead">Что нравится, что получается, где учились, как хотите работать. Пишите как другу — резюме не нужно.</p>
      <form class="match__form" @submit.prevent="submit" :aria-busy="busy">
        <label class="field__label" for="about">О себе</label>
        <textarea id="about" class="textarea" rows="8" maxlength="1500"
          v-model="about" :aria-invalid="!!error" :disabled="busy" />
        <div class="match__meta">
          <span>{{ about.length }} / 1500</span>
          <span>{{ apiMode ? 'Не сохраняется в СТАРТЕР' : 'Хранится только в этом браузере' }}</span>
        </div>
        <p class="auth__note" v-if="apiMode">
          Текст отправляется серверу и настроенному ИИ-провайдеру для подбора.
          СТАРТЕР не сохраняет его в базе. Результат — рекомендация, не гарантия трудоустройства.
        </p>
        <p v-else class="auth__note">Демо-подбор по ключевым словам, без обращения к ИИ.</p>
        <div class="examples">
          <button v-for="example in catalog.examples" :key="example.label"
            type="button" class="chip" :disabled="busy" @click="about = example.text">
            {{ example.label }}
          </button>
        </div>
        <p v-if="apiMode && !session.authenticated" class="auth__note">
          <a href="#/account">Войти в аккаунт</a>, чтобы запустить подбор.
        </p>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="btn btn--accent" type="submit" :disabled="busy || (apiMode && !session.authenticated)">
          {{ busy ? 'Подбираем направления…' : 'Подобрать профессии' }}
        </button>
      </form>
    </div>
    <div
      class="match__result"
      :class="{ 'match__result--empty': !ready && !busy }"
      aria-live="polite"
    >
      <!-- Загрузка рекомендаций -->
      <div v-if="busy" class="loading" role="status">
        <p class="loading__status">
          ИИ анализирует рассказ и ищет вакансии в базе…
        </p>
        <p class="auth__note">
          Это может занять несколько секунд.
        </p>
      </div>

      <!-- Результаты реального API -->
      <template v-else-if="apiMode && ready">
        <div class="insight">
          <p class="eyebrow">Ваши возможности</p>
          <h2>Три направления для старта</h2>
          <p class="auth__note">
            Вакансии ниже — из реальной базы.
            Обратите внимание на требования работодателей.
          </p>
        </div>

        <div class="directions">
          <article
            v-for="(direction, index) in directions"
            :key="index"
            class="direction"
          >
            <div class="direction__head">
              <span class="direction__num">
                {{ String(index + 1).padStart(2, "0") }}
              </span>
              <h2 class="direction__name">
                {{ direction.name }}
              </h2>
            </div>

            <div class="direction__body">
              <p class="direction__what">{{ direction.what }}</p>
              <p class="direction__why">{{ direction.why }}</p>

              <p class="auth__note">
                Основано на ваших словах:
                <q
                  v-for="(quote, i) in direction.evidence"
                  :key="i"
                >{{ quote }}</q>
              </p>

              <h3 class="match__vacancy-title">
                Вакансии по направлению
              </h3>

              <ApiJobList
                v-if="direction.vacancies.length"
                :jobs="direction.vacancies"
              />

              <p v-else class="state match__no-jobs">
                Сейчас в базе нет подходящих активных
                вакансий по этому направлению.
              </p>
            </div>
          </article>
        </div>
      </template>

      <!-- Демо-режим -->
      <template v-else-if="!apiMode && ready">
        <article
          v-for="d in store.directions"
          :key="d.key"
          class="direction"
        >
          <h2>{{ d.name }}</h2>
          <p>{{ d.what }}</p>
          <p>
            {{
              d.hits.length
                ? d.why
                : "Прямых совпадений нет — направление для знакомства."
            }}
          </p>
          <p>{{ d.start }}</p>

          <JobList
            :jobs="store.jobs.filter(j => j.direction === d.key)"
          />
        </article>
      </template>

      <!-- Пустое состояние с котом Стартером -->
      <div v-else class="match__placeholder">
        <img
          class="match__placeholder-image"
          src="/images/branding/starter-match-cat-peek-800.webp"
          srcset="/images/branding/starter-match-cat-peek-420.webp 420w, /images/branding/starter-match-cat-peek-800.webp 800w, /images/branding/starter-match-cat-peek-1200.webp 1200w"
          sizes="(max-width: 960px) min(280px, 100vw - 32px), min(400px, 50vw - 48px)"
          alt=""
        />
        <h2>Давай найдём то, что по душе</h2>
      </div>
    </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.match__vacancy-title { margin: var(--s5) 0 var(--s2); font-size: var(--t-sm); font-weight: 600; }
.match__no-jobs { margin-top: var(--s3); text-align: left; padding: var(--s4); }
.direction__body > .auth__note { margin-top: var(--s3); overflow-wrap: anywhere; }
.direction__body q { margin-left: var(--s2); }
.direction__body :deep(.job) { min-width: 0; }
.direction__body :deep(.jobs) { min-width: 0; }
@media (max-width: 720px) { .direction__body { padding-left: 0; } }
</style>
