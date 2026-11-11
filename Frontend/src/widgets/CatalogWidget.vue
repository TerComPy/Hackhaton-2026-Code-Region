<script setup lang="ts">
import { computed, ref, watch } from "vue";
import CatalogEmptyState from "./CatalogEmptyState.vue";
import { useCatalog } from "../entities/store";
import { catalog } from "../entities/catalog";
import { dataMode } from "../shared/api";
import { useVacancyCatalog } from "../entities/vacancyCatalog";
import ApiJobList from "./ApiJobList.vue";
const remote = useVacancyCatalog();
const isApi = dataMode === "api";
import JobList from "./JobList.vue";
const store = useCatalog(),
  limit = ref(6);
const hasActiveFilters = computed(() => Boolean(
  store.query.trim() || store.city.trim() || store.formats.length ||
  store.sources.length || store.noExp || store.minSalary,
));
watch(
  () => [
    store.query,
    store.city,
    store.formats,
    store.sources,
    store.noExp,
    store.minSalary,
    store.sort,
  ],
  () => (limit.value = 6),
  { deep: true },
);
</script>
<template>
  <section class="catalog" id="catalog">
    <div class="wrap">
      <div class="section-head">
        <h2>Каталог</h2>
        <p aria-live="polite">
          {{ isApi ? `Загружено: ${remote.items.length} · API` : `${store.filtered.length} вакансий · Демо (mock)` }}
        </p>
      </div>
      <div class="catalog__layout">
        <details class="filters" open>
          <summary class="filters__toggle">Фильтры</summary>
          <form
            class="filters__form"
            @submit.prevent
            @reset.prevent="store.reset()"
          >
            <div class="field">
              <label class="field__label" for="f-q">Поиск</label
              ><input
                id="f-q"
                class="input"
                v-model="store.query"
                type="search"
              />
            </div>
            <div class="field">
              <label class="field__label" for="f-city">Город</label
              ><input id="f-city" class="input" v-model="store.city" />
            </div>
            <fieldset class="field">
              <legend class="field__label">Формат</legend><p v-if="isApi">Можно выбрать один формат.</p>
              <label
                class="check"
                v-for="format in ['На месте', 'Гибрид', 'Удалённо']"
                :key="format"
                ><input
                  type="checkbox"
                  :disabled="isApi && store.formats.length > 0 && !store.formats.includes(format)"
                  v-model="store.formats"
                  :value="format"
                /><span>{{ format }}</span></label
              >
            </fieldset>
            <label class="check"
              ><input type="checkbox" v-model="store.noExp" /><span
                >Можно без опыта</span
              ></label
            >
            <div class="field">
              <label class="field__label" for="f-salary">Зарплата от</label
              ><select
                id="f-salary"
                class="input select"
                v-model.number="store.minSalary"
              >
                <option :value="0">Любая</option>
                <option v-for="n in [50000, 70000, 90000, 120000]" :value="n">
                  {{ n }} ₽
                </option>
              </select>
            </div>
            <fieldset class="field">
              <legend class="field__label">Источник</legend><p v-if="isApi">API пока не поддерживает фильтр источников.</p>
              <label
                class="check"
                v-for="(_, source) in catalog.sources"
                :key="source"
                ><input
                  type="checkbox"
                  :disabled="isApi"
                  v-model="store.sources"
                  :value="source"
                /><span>{{ source }}</span></label
              >
            </fieldset>
            <button class="btn btn--ghost" type="reset">
              Сбросить фильтры
            </button>
          </form>
        </details>
        <div class="results">
          <div class="results__bar">
            <p class="results__hint">{{ isApi ? "Порядок сервера: навыки, релевантность поиска, дата. Изменение сортировки недоступно." : "Компании вымышлены" }}</p>
            <label class="sort"
              >Сортировка<select class="input select" :disabled="isApi" v-model="store.sort">
                <option value="date">Сначала новые</option>
                <option value="salary">По зарплате</option>
                <option value="fit">Сначала подходящие</option>
              </select></label
            >
          </div>
          <template v-if="isApi">
            <ApiJobList :jobs="remote.items" />
            <p v-if="!remote.authenticated" class="state">Чтобы увидеть вакансии, <a href="#/account">войдите в аккаунт</a>.</p>
            <template v-else>
              <p v-if="remote.loading" class="state" role="status">Загружаем вакансии…</p>
              <div v-else-if="remote.error" class="state" role="alert">{{ remote.error }} <button class="btn btn--ghost" @click="remote.load()">Повторить</button></div>
              <CatalogEmptyState v-else-if="!remote.items.length" :filtered="hasActiveFilters" />
              <button v-else-if="remote.hasMore" class="btn btn--ghost catalog__more" @click="remote.load()">Показать ещё</button>
            </template>
          </template>
          <template v-else>
          <JobList :jobs="store.filtered.slice(0, limit)" />
          <CatalogEmptyState v-if="!store.filtered.length" :filtered="hasActiveFilters" />
          <button
            v-if="limit < store.filtered.length"
            class="btn btn--ghost catalog__more"
            @click="limit += 6"
          >
            Показать ещё
          </button>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

