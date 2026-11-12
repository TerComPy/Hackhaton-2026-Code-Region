<script setup lang="ts">
</script>
<template>
  <div class="catalog-guest">
    <img src="/images/branding/starter-catalog-guest-420.webp" srcset="/images/branding/starter-catalog-guest-420.webp 420w, /images/branding/starter-catalog-guest-800.webp 800w, /images/branding/starter-catalog-guest-1200.webp 1200w" sizes="(max-width: 720px) 85vw, 420px" alt="Кот СТАРТЕРА ждёт тебя в каталоге вакансий" class="catalog-guest__image" />
    <h3>Твоя следующая работа уже близко</h3>
    <p>Войди, чтобы открыть каталог вакансий, найти подходящее предложение и сохранить его в избранное</p>
    <a class="btn btn--accent" href="#/account">Войти и посмотреть вакансии</a>
  </div>
</template>
<style scoped>
.catalog-guest { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 32px 12px 56px; animation: guest-appear .45s ease-out both; }
.catalog-guest__image { display: block; width: min(100%, 420px); height: auto; margin-bottom: 24px; }
.catalog-guest h3 { max-width: 520px; margin: 0; color: var(--ink); font-size: clamp(24px, 3vw, 34px); line-height: 1.2; }
.catalog-guest p { max-width: 460px; margin: 16px 0 24px; color: var(--ink-2); line-height: 1.6; }
.catalog-guest .btn { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
@keyframes guest-appear { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .catalog-guest { animation: none; } }
</style>
