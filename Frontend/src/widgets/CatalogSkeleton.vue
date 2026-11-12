<template>
  <div class="catalog-skeleton">
    <span class="skeleton-status" role="status">Загружаем вакансии</span>
    <ul class="jobs" aria-hidden="true">
      <li v-for="n in 6" :key="n" class="job job--skeleton">
        <figure class="job__media sk"></figure>
        <div class="job__body">
          <p class="job__meta"><span class="sk skeleton-meta"></span></p>
          <h3 class="job__title"><span class="sk skeleton-title"></span></h3>
          <p class="job__company"><span class="sk skeleton-company"></span></p>
          <ul class="job__tags"><li v-for="tag in 2" :key="tag" class="sk skeleton-tag"></li></ul>
        </div>
        <div class="job__side"><p class="job__salary"><span class="sk skeleton-salary"></span></p><span class="sk skeleton-save"></span></div>
      </li>
    </ul>
  </div>
</template>
<style scoped>
.skeleton-status { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.skeleton-meta { width: 130px; max-width: 100%; height: 15.6px; }
.skeleton-title { width: 85%; height: 1.3em; }
.skeleton-company { width: 65%; height: 1.55em; }
.skeleton-tag { width: 76px; height: 24px; }
.skeleton-salary { width: 120px; height: 24px; }
.skeleton-save { width: 40px; height: 40px; }
@media (max-width: 720px) { .skeleton-tag { width: 64px; } }
</style>
