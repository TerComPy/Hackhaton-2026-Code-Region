import { ref, computed, watch } from 'vue';
import { defineStore } from 'pinia';
import { ApiError, dataMode, type Favorite } from '../shared/api';
import { useSession } from './session';
export const useFavorites = defineStore('favorites', () => {
  const session = useSession();
  const items = ref<Favorite[]>([]), ids = ref<string[]>([]);
  const loading = ref(false), loaded = ref(false), error = ref('');
  const pending = ref<Record<string, boolean>>({}), errors = ref<Record<string, string>>({});
  const mutating = computed(() => Object.values(pending.value).some(Boolean));
  let generation = 0, controller: AbortController | undefined, mutation: AbortController | undefined;
  function reset() {
    generation++; controller?.abort(); mutation?.abort();
    items.value = []; ids.value = []; loaded.value = false; loading.value = false;
    pending.value = {}; errors.value = {}; error.value = '';
  }
  async function load(afterMutation = false) {
    if (dataMode !== 'api' || !session.authenticated || loading.value || (mutating.value && !afterMutation)) return;
    const version = generation;
    controller = new AbortController(); loading.value = true; error.value = '';
    try {
      const all: Favorite[] = [], seen = new Set<string>();
      for (let page = 1; ; page++) {
        const result = await session.api.favorites(page, { signal: controller.signal }, 20);
        if (version !== generation) return;
        if (result.page !== page || result.pageSize !== 20 || !Array.isArray(result.items) || result.items.some(v => typeof v.id !== 'string')) throw new Error('Invalid favorite page');
        for (const row of result.items) if (!seen.has(row.id)) { seen.add(row.id); all.push(row); }
        if (result.items.length < result.pageSize) break;
      }
      items.value = all; ids.value = all.map(v => v.id); loaded.value = true;
    } catch {
      if (version === generation) error.value = 'Не удалось загрузить избранное. Повторите попытку.';
    } finally { if (version === generation) loading.value = false; }
  }
  async function toggle(id: string, status: 'active' | 'archived') {
    if (!session.authenticated || !loaded.value || loading.value || mutating.value) return;
    const saved = ids.value.includes(id);
    if (!saved && status !== 'active') return;
    const version = generation;
    pending.value[id] = true; delete errors.value[id];
    mutation = new AbortController();
    try {
      if (saved) await session.api.remove(id, { signal: mutation.signal });
      else await session.api.save(id, { signal: mutation.signal });
      if (version !== generation) return;
      // Commit only a confirmed 204. Hydrate metadata from the server afterwards.
      ids.value = saved ? ids.value.filter(v => v !== id) : [...ids.value, id];
      if (saved) items.value = items.value.filter(v => v.id !== id);
      await load(true);
    } catch (e) {
      if (version !== generation) return;
      errors.value[id] = e instanceof ApiError && e.status === 404 ? 'Добавление недоступно: вакансия удалена или в архиве.' : 'Не удалось изменить избранное. Повторите попытку.';
    } finally { if (version === generation) delete pending.value[id]; }
  }
  watch(() => dataMode === 'api' && session.authenticated ? session.user?.id : undefined, () => { reset(); void load(); }, { immediate: true, flush: 'sync' });
  return { items, ids, loading, loaded, error, pending, errors, mutating, load, toggle };
});
