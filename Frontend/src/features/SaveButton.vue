<script setup lang="ts">
import { computed } from 'vue';
import { useCatalog } from '../entities/store';
import { useFavorites } from '../entities/favorites';
import { useSession } from '../entities/session';
import { dataMode } from '../shared/api';
import type { Job } from '../entities/job';
const props = defineProps<{ job?: Job; vacancy?: { id: string; title: string; status: 'active' | 'archived' } }>();
const store = useCatalog(), favorites = useFavorites(), session = useSession();
const isApi = computed(() => !!props.vacancy);
const saved = computed(() => props.vacancy ? favorites.ids.includes(props.vacancy.id) : !!props.job && store.saved.includes(props.job.id));
const title = computed(() => props.vacancy?.title || props.job?.title || '');
const disabled = computed(() => props.vacancy ? !session.authenticated || !favorites.loaded || favorites.loading || favorites.mutating || (!saved.value && props.vacancy.status === 'archived') : dataMode === 'api');
function toggle() {
  if (props.vacancy) void favorites.toggle(props.vacancy.id, props.vacancy.status);
  else if (props.job) store.toggle(props.job.id);
}
</script>
<template>
  <button class="icon-btn save" type="button" :aria-pressed="saved" :aria-busy="!!(vacancy && favorites.pending[vacancy.id])" :disabled="disabled" :aria-label="(saved ? 'Убрать из избранного: ' : 'Сохранить в избранное: ') + title" @click.stop="toggle">
    <svg class="icon" aria-hidden="true"><use href="#i-bookmark" /></svg>
  </button>
  <span v-if="isApi && !session.authenticated" class="save-feedback"><a href="#/account">Войдите, чтобы сохранить</a></span>
  <span v-else-if="vacancy && favorites.errors[vacancy.id]" class="save-feedback" role="alert">{{ favorites.errors[vacancy.id] }} <button :disabled="disabled" @click.stop="toggle">Повторить</button></span>
  <span v-else-if="vacancy && favorites.error" class="save-feedback" role="alert">{{ favorites.error }} <button :disabled="favorites.loading || favorites.mutating" @click.stop="favorites.load()">Повторить загрузку</button></span>
</template>
<style scoped>
.save-feedback { position: relative; z-index: 1; font-size: var(--t-xs); max-width: 280px; }
.save-feedback button { border: 0; background: transparent; color: var(--accent-ink); text-decoration: underline; }
</style>

