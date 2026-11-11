<script setup lang="ts">
import { useCatalog } from "../entities/store";
import JobList from "../widgets/JobList.vue";
const store = useCatalog();
</script>
<template>
  <section class="saved wrap">
    <div class="section-head">
      <h1 class="page-title">Избранное</h1>
      <p>{{ store.saved.length }} сохранено</p>
    </div>
    <JobList :jobs="store.jobs.filter((j) => store.saved.includes(j.id))" />
    <div v-if="!store.saved.length" class="state">
      <h2>Здесь будут сохранённые вакансии</h2>
      <p>Нажмите на закладку рядом с вакансией.</p>
      <a href="#/" class="btn btn--ghost">Перейти в каталог</a>
    </div>
  </section>
</template>
