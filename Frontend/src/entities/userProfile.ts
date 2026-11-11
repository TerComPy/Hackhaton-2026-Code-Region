import { ref, watch } from 'vue';
import { defineStore } from 'pinia';
import { ApiError, dataMode } from '../shared/api';
import { useSession } from './session';
export const useUserProfile = defineStore('userProfile', () => {
  const session = useSession();
  const displayName = ref(''), city = ref(''), loading = ref(false), saving = ref(false), error = ref(''), success = ref('');
  let generation = 0, controller: AbortController | undefined;
  function fill() { displayName.value = session.profile?.displayName || ''; city.value = session.profile?.city || ''; }
  async function request(save: boolean) {
    if (!session.authenticated || loading.value || saving.value) return;
    if (save && (!displayName.value.trim() || displayName.value.trim().length > 150 || city.value.trim().length > 150)) { error.value = 'Укажите имя от 1 до 150 символов и город до 150 символов.'; success.value = ''; return; }
    const version = generation;
    controller = new AbortController(); error.value = ''; success.value = '';
    if (save) saving.value = true; else loading.value = true;
    try {
      const response = save ? await session.api.updateProfile({ displayName: displayName.value.trim(), city: city.value.trim() || null }, { signal: controller.signal }) : await session.api.profile({ signal: controller.signal });
      if (version !== generation) return;
      session.profile = response.profile;
      if (session.user) session.user.displayName = response.profile.displayName;
      fill();
      if (save) success.value = 'Профиль сохранён.';
    } catch (e) {
      if (version !== generation) return;
      error.value = e instanceof ApiError && e.status === 400 ? 'Проверьте имя и город (до 150 символов).' : 'Не удалось сохранить или загрузить профиль. Повторите попытку.';
    } finally { if (version === generation) { loading.value = false; saving.value = false; } }
  }
  watch(() => dataMode === 'api' && session.authenticated ? session.user?.id : undefined, () => {
    generation++; controller?.abort(); loading.value = false; saving.value = false; error.value = ''; success.value = ''; if (session.authenticated) fill(); else { displayName.value = ''; city.value = ''; }
  }, { immediate: true, flush: 'sync' });
  return { displayName, city, loading, saving, error, success, load: () => request(false), save: () => request(true) };
});
