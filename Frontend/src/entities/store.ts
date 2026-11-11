import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { catalog } from "./catalog";
import { read, write } from "../shared/storage";
export const useCatalog = defineStore("catalog", () => {
  const jobs = ref(catalog.jobs);
  const saved = ref<number[]>(read("starter.saved", []));
  const about = ref(read("starter.about", ""));
  const user = ref<{ name: string; email: string } | null>(
    read("starter.vue.user", null),
  );
  const query = ref(""),
    city = ref(""),
    formats = ref<string[]>([]),
    sources = ref<string[]>([]),
    noExp = ref(false),
    minSalary = ref(0),
    sort = ref("date");
  const directions = computed(() =>
    Object.entries(catalog.directions)
      .map(([key, d]) => ({
        key,
        ...d,
        hits: d.signals.filter(([re]) =>
          (re as RegExp).test(about.value.toLowerCase()),
        ),
      }))
      .sort((a, b) => b.hits.length - a.hits.length)
      .slice(0, 3),
  );
  const fits = (j: (typeof catalog.jobs)[number]) =>
    about.value.length >= 40 &&
    directions.value.some((d) => d.key === j.direction);
  const age = (posted: string) => posted === "сегодня" ? 0 : posted === "вчера" ? 1 : Number.parseInt(posted, 10) || 0;
  const filtered = computed(() =>
    jobs.value
      .filter(
        (j) =>
          (j.title + " " + j.company + " " + j.summary)
            .toLowerCase()
            .includes(query.value.toLowerCase()) &&
          j.city.toLowerCase().includes(city.value.toLowerCase()) &&
          (!formats.value.length || formats.value.includes(j.format)) &&
          (!sources.value.length || sources.value.includes(j.source)) &&
          (!noExp.value || j.experience === "Без опыта") &&
          (!minSalary.value || (j.salary?.[0] ?? 0) >= minSalary.value),
      )
      .sort((a, b) =>
        sort.value === "salary"
          ? (b.salary?.[0] ?? 0) - (a.salary?.[0] ?? 0)
          : sort.value === "fit"
            ? Number(fits(b)) - Number(fits(a))
            : age(a.posted) - age(b.posted),
      ),
  );
  function toggle(id: number) {
    saved.value = saved.value.includes(id)
      ? saved.value.filter((x) => x !== id)
      : [...saved.value, id];
  }
  function reset() {
    query.value = "";
    city.value = "";
    formats.value = [];
    sources.value = [];
    noExp.value = false;
    minSalary.value = 0;
  }
  watch(saved, (v) => write("starter.saved", v), { deep: true });
  watch(about, (v) => write("starter.about", v));
  watch(user, (v) => write("starter.vue.user", v));
  return {
    jobs,
    saved,
    about,
    user,
    query,
    city,
    formats,
    sources,
    noExp,
    minSalary,
    sort,
    directions,
    fits,
    filtered,
    toggle,
    reset,
  };
});
