<script setup lang="ts">
defineProps<{ filtered: boolean }>();
</script>

<template>
  <div class="catalog-empty" role="status">
    <img
      class="catalog-empty__image"
      src="/images/branding/starter-detective-400.webp"
      srcset="/images/branding/starter-detective-400.webp 400w, /images/branding/starter-detective-800.webp 800w, /images/branding/starter-detective-1200.webp 1200w"
      sizes="(max-width: 720px) 240px, 290px"
      width="400"
      height="300"
      alt="Кот-сыщик ищет вакансии"
    />
    <h3>{{ filtered ? 'Вакансии не найдены' : 'Пока нет вакансий' }}</h3>
    <p>{{ filtered ? 'Попробуйте изменить запрос или сбросить фильтры.' : 'Здесь появятся новые предложения.' }}</p>
  </div>
</template>

<style scoped>
.catalog-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 16px 64px;
  text-align: center;
}
.catalog-empty__image {
  display: block;
  width: 290px;
  max-width: 100%;
  height: auto;
  margin-bottom: 24px;
}
.catalog-empty h3 {
  margin: 0;
  color: var(--ink);
  font-size: var(--t-xl);
  line-height: 1.3;
}
.catalog-empty p {
  max-width: 380px;
  margin: 12px 0 0;
  color: var(--ink-2);
  line-height: 1.5;
}
@media (max-width: 720px) {
  .catalog-empty { padding: 32px 12px 48px; }
  .catalog-empty__image { width: 240px; }
}
</style>
