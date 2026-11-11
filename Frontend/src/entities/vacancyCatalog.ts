import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { ApiError, dataMode, type Vacancy } from "../shared/api";
import { useSession } from "./session";
import { useCatalog } from "./store";

export const useVacancyCatalog = defineStore("vacancyCatalog", () => {
  const session = useSession(), filters = useCatalog();
  const items = ref<Vacancy[]>([]), loading = ref(false), error = ref("");
  const page = ref(0), hasMore = ref(false);
  const authenticated = computed(() => session.authenticated);
  let controller: AbortController | undefined;
  let generation = 0;
  const query = computed(() => ({
    search: filters.query.trim() || undefined,
    city: filters.city.trim() || undefined,
    workFormat: ({ "На месте": "onsite", "Гибрид": "hybrid", "Удалённо": "remote" } as const)[filters.formats[0] as "На месте"] as Vacancy["work_format"] | undefined,
    minSalary: filters.minSalary || undefined,
    onlyNoExperience: filters.noExp,
  }));
  async function load() {
    if (dataMode !== "api" || !authenticated.value || loading.value) return;
    const id = generation;
    controller = new AbortController();
    loading.value = true;
    error.value = "";
    try {
      const result = await session.api.vacancies({ ...query.value, page: page.value + 1, pageSize: 6 }, { signal: controller.signal });
      if (id !== generation) return;
      if (!Array.isArray(result.items) || result.page !== page.value + 1 || result.pageSize !== 6 || result.items.some(v => typeof v.id !== "string" || !v.title || [v.salary_min, v.salary_max].some(n => n !== null && typeof n !== "string"))) {
        throw new Error("Invalid vacancy response");
      }
      const seen = new Set(items.value.map(v => v.id));
      items.value = [...items.value, ...result.items.filter(v => !seen.has(v.id) && !!seen.add(v.id))];
      page.value = result.page;
      // No total in the API: a full page may require one final empty request.
      hasMore.value = result.items.length === result.pageSize;
    } catch (e) {
      if (id !== generation || e instanceof ApiError && e.kind === "aborted") return;
      error.value = e instanceof ApiError && e.status === 401 ? "Сессия истекла. Войдите повторно." : "Не удалось загрузить вакансии. Повторите попытку.";
    } finally { if (id === generation) loading.value = false; }
  }
  watch([query, () => session.authenticated, () => session.user?.id], () => {
    generation++;
    controller?.abort();
    items.value = [];
    page.value = 0;
    hasMore.value = false;
    error.value = "";
    loading.value = false;
    void load();
  }, { immediate: true, flush: "sync" });
  return { items, loading, error, page, hasMore, authenticated, load };
});
