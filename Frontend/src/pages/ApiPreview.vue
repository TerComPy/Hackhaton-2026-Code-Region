<script setup lang="ts">
import { ref, onMounted } from "vue";
import { type Vacancy, type VacancyCard } from "../shared/api";
import { useSession } from "../entities/session";
const items = ref<Vacancy[]>([]),
  selected = ref<VacancyCard>(),
  error = ref(""),
  query = ref(""),
  loading = ref(false);
const api = useSession().api;
async function load() {
  loading.value = true;
  error.value = "";
  try {
    items.value = (await api.vacancies({ search: query.value })).items;
  } catch (e) {
    items.value = [];
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
}
async function open(id: string) {
  try {
    selected.value = (await api.vacancy(id)).vacancy;
  } catch (e) {
    error.value = String(e);
  }
}
onMounted(load);
</script>
<template>
  <section class="catalog wrap">
    <h1 class="page-title">Express API · предварительная интеграция</h1>
    <p>
      Режим API. Авторизация интерфейса и персональные страницы будут подключены
      следующим PR. Mock-данные не используются.
    </p>
    <form @submit.prevent="load">
      <label class="field">Поиск<input class="input" v-model="query" /></label
      ><button class="btn btn--accent">Загрузить</button>
    </form>
    <p v-if="loading" role="status">Загрузка…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!loading && !error && !items.length" role="status">Вакансии не найдены.</p>
    <ul class="jobs">
      <li class="job" v-for="job in items" :key="job.id">
        <div class="job__body">
          <h2>
            <button class="job__open" @click="open(job.id)">
              {{ job.title }}
            </button>
          </h2>
          <p>{{ job.company_name }} · {{ job.city }}</p>
          <p>{{ job.salary_min }} – {{ job.salary_max }} {{ job.currency }}</p>
        </div>
      </li>
    </ul>
    <article v-if="selected">
      <h2>{{ selected.title }}</h2>
      <p style="white-space: pre-wrap">{{ selected.description }}</p>
      <p>{{ selected.requirements }}</p>
      <p>{{ selected.responsibilities }}</p>
      <a
        :href="
          /^https?:\/\//.test(selected.original_url)
            ? selected.original_url
            : undefined
        "
        target="_blank"
        rel="noopener noreferrer"
        >Оригинал</a
      >
    </article>
  </section>
</template>
