<script setup lang="ts">
import { ref } from "vue";
import { photo, salary, type Job } from "../entities/job";
import { useCatalog } from "../entities/store";
import SaveButton from "../features/SaveButton.vue";
import VacancySheet from "./VacancySheet.vue";
defineProps<{ jobs: Job[] }>();
const selected = ref<Job | null>(null),
  store = useCatalog();
</script>
<template>
  <ul class="jobs">
    <li v-for="job in jobs" :key="job.id" class="job">
      <figure class="job__media">
        <img :src="photo(job)" alt="" loading="lazy" width="104" height="104" />
      </figure>
      <div class="job__body">
        <p class="job__meta">{{ job.source }} · {{ job.posted }}</p>
        <h3 class="job__title">
          <button class="job__open" @click="selected = job">
            {{ job.title }}
          </button>
        </h3>
        <p class="job__company">{{ job.company }} · {{ job.city }}</p>
        <p class="job__summary">{{ job.summary }}</p>
        <ul class="job__tags">
          <li v-if="store.fits(job)" class="tag tag--fit">Подходит вам</li>
          <li class="tag">{{ job.experience }}</li>
          <li class="tag">{{ job.format }}</li>
        </ul>
      </div>
      <div class="job__side">
        <p class="job__salary">{{ salary(job) }}</p>
        <SaveButton :job="job" />
      </div>
    </li>
  </ul>
  <VacancySheet v-if="selected" :job="selected" @close="selected = null" />
</template>
