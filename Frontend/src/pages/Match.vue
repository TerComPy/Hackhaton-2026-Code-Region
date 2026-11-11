<script setup lang="ts">
import { ref } from "vue";
import { useCatalog } from "../entities/store";
import { catalog } from "../entities/catalog";
import JobList from "../widgets/JobList.vue";
const store = useCatalog(),
  error = ref(""),
  ready = ref(store.about.length >= 40);
function submit() {
  error.value =
    store.about.trim().length < 40
      ? "Напишите хотя бы 40 символов о себе."
      : "";
  ready.value = !error.value;
}
</script>
<template>
  <section class="match wrap">
    <div class="match__intro">
      <p class="eyebrow">Подбор профессии</p>
      <h1 class="page-title">Расскажите о себе своими словами</h1>
      <p class="lead">
        Что нравится, что получается, где учились, как хотите работать. Пишите
        как другу — резюме не нужно.
      </p>
      <form class="match__form" @submit.prevent="submit">
        <label class="field__label" for="about">О себе</label
        ><textarea
          id="about"
          class="textarea"
          rows="8"
          maxlength="1500"
          v-model="store.about"
        />
        <div class="match__meta">
          <span>{{ store.about.length }} / 1500</span
          ><span>Хранится только в этом браузере</span>
        </div>
        <p class="auth__note">
          Демо-подбор по ключевым словам, без обращения к ИИ.
        </p>
        <div class="examples">
          <button
            v-for="example in catalog.examples"
            type="button"
            class="chip"
            @click="store.about = example.text"
          >
            {{ example.label }}
          </button>
        </div>
        <p class="form-error" role="alert">{{ error }}</p>
        <button class="btn btn--accent">Подобрать профессии</button>
      </form>
    </div>
    <div class="match__result" aria-live="polite">
      <template v-if="ready"
        ><article class="direction" v-for="d in store.directions" :key="d.key">
          <h2>{{ d.name }}</h2>
          <p>{{ d.what }}</p>
          <p>
            {{
              d.hits.length
                ? d.why
                : "Прямых совпадений нет — направление для знакомства."
            }}
          </p>
          <p>{{ d.start }}</p>
          <JobList
            :jobs="store.jobs.filter((j) => j.direction === d.key)"
          /></article
      ></template>
      <p v-else>Здесь появятся три направления и подходящие вакансии.</p>
    </div>
  </section>
</template>
