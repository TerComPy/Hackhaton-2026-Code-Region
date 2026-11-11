<script setup lang="ts">
import { ref } from "vue";
import SaveButton from "../features/SaveButton.vue";
import VacancySheet from "./VacancySheet.vue";
import { vacancySalary as salary, vacancyFormats as formats } from "../entities/vacancyDetails";
import type { Vacancy } from "../shared/api";
defineProps<{ jobs: Vacancy[] }>();
const selected = ref<string | null>(null);
</script>
<template>
  <ul class="jobs">
    <li v-for="job in jobs" :key="job.id" class="job" :data-vacancy-id="job.id">
      <figure class="job__media vacancy-placeholder" aria-label="Без изображения"><svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="12" width="30" height="23" rx="4" stroke="currentColor" stroke-width="2"/><path d="M14 12V7h12v5M5 23h30M18 20v6h4v-6" stroke="currentColor" stroke-width="2"/></svg></figure>
      <div class="job__body">
        <p class="job__meta">{{ job.source_name }}<template v-if="job.published_at"> · {{ job.published_at.slice(0, 10) }}</template></p>
        <h3 class="job__title"><button class="job__open" @click="selected = job.id">{{ job.title }}</button></h3>
        <p class="job__company">{{ job.company_name || 'Компания не указана' }} · {{ job.city || 'Город не указан' }}</p>
        <ul class="job__tags"><li class="tag">{{ formats[job.work_format] }}</li></ul>
      </div>
      <div class="job__side"><p class="job__salary">{{ salary(job) }}</p><SaveButton :vacancy="job" /></div>
    </li>
  </ul>
  <VacancySheet v-if="selected" :vacancy-id="selected" @close="selected = null" />
</template>
<style scoped>
.vacancy-placeholder { display: grid; place-items: center; background: linear-gradient(135deg, #e9eadf, #dce4d7); color: #5c7059; }
</style>
