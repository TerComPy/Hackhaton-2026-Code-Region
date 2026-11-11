<script setup lang="ts">
import { ref, watch, onDeactivated } from 'vue';
import type { Favorite } from '../shared/api';
import { useSession } from '../entities/session';
import { vacancySalary } from '../entities/vacancyDetails';
import SaveButton from '../features/SaveButton.vue';
import VacancySheet from './VacancySheet.vue';
defineProps<{ jobs: Favorite[] }>();
const selected = ref<string | null>(null);
const session = useSession();
watch(() => session.user?.id, () => { selected.value = null; }, { flush: 'sync' });
onDeactivated(() => { selected.value = null; });
</script>
<template>
  <ul class="jobs">
    <li v-for="job in jobs" :key="job.id" class="job" :data-vacancy-id="job.id">
      <figure class="job__media favorite-placeholder" aria-label="Без изображения"><svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect x="5" y="12" width="30" height="23" rx="4" stroke="currentColor" stroke-width="2"/><path d="M14 12V7h12v5M5 23h30" stroke="currentColor" stroke-width="2"/></svg></figure>
      <div class="job__body"><h3 class="job__title"><button class="job__open" @click="selected = job.id">{{ job.title }}</button></h3><p class="job__company">{{ job.company_name || 'Компания не указана' }} · {{ job.city || 'Город не указан' }}</p><p v-if="job.status === 'archived'" class="tag">В архиве</p></div>
      <div class="job__side"><p class="job__salary">{{ vacancySalary(job) }}</p><SaveButton :vacancy="job" /></div>
    </li>
  </ul>
  <VacancySheet v-if="selected" :vacancy-id="selected" @close="selected = null" />
</template>
<style scoped>
.favorite-placeholder { display: grid; place-items: center; background: linear-gradient(135deg, #e9eadf, #dce4d7); color: #5c7059; }
</style>
