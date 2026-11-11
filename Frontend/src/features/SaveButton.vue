<script setup lang="ts">
import { useCatalog } from "../entities/store";
import type { Job } from "../entities/job";
defineProps<{ job: Job }>();
const store = useCatalog();
</script>
<template>
  <button
    class="icon-btn save"
    type="button"
    :aria-pressed="store.saved.includes(job.id)"
    :aria-label="
      (store.saved.includes(job.id)
        ? 'Убрать из избранного: '
        : 'Сохранить в избранное: ') + job.title
    "
    @click.stop="store.toggle(job.id)"
  >
    <svg class="icon" aria-hidden="true"><use href="#i-bookmark" /></svg>
  </button>
</template>
