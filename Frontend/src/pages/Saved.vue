<script setup lang="ts">
import { onActivated } from 'vue';
import { useCatalog } from '../entities/store';
import { useFavorites } from '../entities/favorites';
import { useSession } from '../entities/session';
import { dataMode } from '../shared/api';
import JobList from '../widgets/JobList.vue';
import FavoriteList from '../widgets/FavoriteList.vue';
const store = useCatalog(), favorites = useFavorites(), session = useSession();
onActivated(() => { if (dataMode === 'api') void favorites.load(); });
</script>
<template>
  <section class="saved wrap">
    <div class="section-head"><h1 class="page-title">Избранное</h1><p>{{ dataMode === 'api' ? favorites.ids.length : store.saved.length }} сохранено</p></div>
    <template v-if="dataMode === 'api'">
      <p v-if="!session.authenticated" class="state"><a href="#/account">Войдите в аккаунт</a>, чтобы увидеть избранное.</p>
      <FavoriteList :jobs="favorites.items" />
      <p v-if="favorites.loading" class="state" role="status">Загружаем избранное…</p>
      <div v-else-if="favorites.error" class="state" role="alert">{{ favorites.error }} <button class="btn btn--ghost" @click="favorites.load()">Повторить</button></div>
      <div v-else-if="session.authenticated && favorites.loaded && !favorites.items.length" class="state"><h2>Здесь будут сохранённые вакансии</h2><p>Нажмите на закладку рядом с вакансией.</p><a href="#/" class="btn btn--ghost">Перейти в каталог</a></div>
    </template>
    <template v-else>
      <JobList :jobs="store.jobs.filter(j => store.saved.includes(j.id))" />
      <div v-if="!store.saved.length" class="state"><h2>Здесь будут сохранённые вакансии</h2><p>Нажмите на закладку рядом с вакансией.</p><a href="#/" class="btn btn--ghost">Перейти в каталог</a></div>
    </template>
  </section>
</template>
