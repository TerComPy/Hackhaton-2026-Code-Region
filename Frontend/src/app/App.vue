<script setup lang="ts">
import { useFavorites } from "../entities/favorites";
import { useSession } from "../entities/session";
import ApiConnection from "../widgets/ApiConnection.vue";
import { dataMode } from "../shared/api";
import { computed, provide, readonly, ref, watchEffect } from "vue";
import BrandImage from "../shared/BrandImage.vue";
import { useRoute } from "vue-router";
import { useCatalog } from "../entities/store";
import { read, write } from "../shared/storage";
const store = useCatalog(),
  route = useRoute();
const session = useSession();
const favorites = useFavorites();
if (dataMode === "api") void session.restore();
const isGuestAuth = computed(() => route.path === "/account" && (dataMode === "api" ? !session.authenticated : !store.user));
const media = matchMedia("(prefers-color-scheme: dark)");
const dark = ref(
  read("starter.theme", media.matches ? "dark" : "light") === "dark",
);
provide('brand-dark', readonly(dark));
function toggleTheme() {
  dark.value = !dark.value;
  write("starter.theme", dark.value ? "dark" : "light");
}
watchEffect(() => {
  document.documentElement.dataset.theme = dark.value ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark.value ? "#121211" : "#F1EFEA");
});
</script>
<template>
  <svg width="0" height="0" style="position: absolute" aria-hidden="true">
    <defs>
      <symbol id="i-search" viewBox="0 0 24 24">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </symbol>
      <symbol id="i-pin" viewBox="0 0 24 24">
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
        <circle cx="12" cy="9.5" r="2.5" />
      </symbol>
      <symbol id="i-bookmark" viewBox="0 0 24 24">
        <path d="M6.5 3.5h11v17L12 16.5l-5.5 4z" />
      </symbol>
      <symbol id="i-close" viewBox="0 0 24 24">
        <path d="m6 6 12 12M18 6 6 18" />
      </symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24">
        <path d="M7 17 17 7M8 7h9v9" />
      </symbol>
      <symbol id="i-right" viewBox="0 0 24 24">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </symbol>
      <symbol id="i-sun" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path
          d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"
        />
      </symbol>
      <symbol id="i-moon" viewBox="0 0 24 24">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      </symbol>
      <symbol id="i-grid" viewBox="0 0 24 24">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </symbol>
      <symbol id="i-spark" viewBox="0 0 24 24">
        <path
          d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"
        />
      </symbol>
      <symbol id="i-user" viewBox="0 0 24 24">
        <circle cx="12" cy="8.5" r="3.5" />
        <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
      </symbol>
      <symbol id="i-eye" viewBox="0 0 24 24">
        <path
          d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
        />
        <circle cx="12" cy="12" r="3" />
      </symbol>
      <symbol id="i-eye-off" viewBox="0 0 24 24">
        <path
          d="M10 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.7 3.4M6.6 6.9C3.9 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.3-.6 4.6-1.4M4 4l16 16M9.9 9.9a3 3 0 0 0 4.2 4.2"
        />
      </symbol>
      <symbol id="i-sliders" viewBox="0 0 24 24">
        <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="10" cy="17" r="2" />
      </symbol>
    </defs>
  </svg>

  <a class="skip" href="#main">Перейти к содержимому</a>

  <header class="topbar" id="topbar" :class="{ 'topbar--home-enter': route.path === '/' }">
    <div class="wrap topbar__inner">
      <a class="logo" href="#/" aria-label="Стартер — на главную"
        ><BrandImage width="2048" height="463" alt="СТАРТЕР" /></a>
      <nav class="nav" aria-label="Разделы">
        <a
          class="nav__link"
          href="#/"
          :aria-current="route.path === '/' ? 'page' : undefined"
          ><svg class="icon" aria-hidden="true"><use href="#i-grid" /></svg
          ><span>Вакансии</span></a
        >
        <a
          class="nav__link"
          href="#/match"
          :aria-current="route.path === '/match' ? 'page' : undefined"
          ><svg class="icon" aria-hidden="true"><use href="#i-spark" /></svg
          ><span class="nav__label" data-short="Подбор"
            >Подбор профессии</span
          ></a
        >
        <a
          class="nav__link"
          href="#/saved"
          :aria-current="route.path === '/saved' ? 'page' : undefined"
          ><svg class="icon" aria-hidden="true"><use href="#i-bookmark" /></svg
          ><span>Избранное</span
          ><span
            class="nav__count"
            id="saved-count"
            aria-label="сохранено вакансий"
            >{{ dataMode === "api" ? favorites.ids.length : store.saved.length }}</span
          ></a
        >
        <a
          class="nav__link nav__link--cta"
          href="#/account"
          :aria-current="route.path === '/account' ? 'page' : undefined"
          ><svg class="icon" aria-hidden="true"><use href="#i-user" /></svg
          ><span class="nav__label" id="account-label" :class="{ 'nav__profile': dataMode === 'api' && session.authenticated }" :title="dataMode === 'api' ? session.profile?.displayName : undefined" :data-short="(dataMode === 'api' ? session.authenticated : !!store.user) ? 'Профиль' : 'Войти'"
            >{{ dataMode === 'api' && session.authenticated ? session.profile?.displayName : (dataMode === 'api' ? session.authenticated : !!store.user) ? 'Профиль' : 'Войти' }}</span
          ></a
        >
      </nav>
      <button
        class="icon-btn"
        id="theme-toggle"
        @click="toggleTheme"
        type="button"
        :aria-label="dark ? 'Светлая тема' : 'Тёмная тема'"
        :aria-pressed="dark"
      >
        <svg class="icon icon--sun" aria-hidden="true">
          <use href="#i-sun" />
        </svg>
        <svg class="icon icon--moon" aria-hidden="true">
          <use href="#i-moon" />
        </svg>
      </button>
    </div>
  </header>

  <main id="main" tabindex="-1">
    <ApiConnection v-if="dataMode === 'api' && route.path !== '/account'" /><RouterView
      v-slot="{ Component }"
      ><KeepAlive><component :is="Component" /></KeepAlive
    ></RouterView>
  </main>
  <footer v-if="!isGuestAuth" class="footer" :class="{ 'footer--illustrated': route.path === '/' }">
    <div class="wrap">
      <div class="footer__top">
        <div class="footer__brand">
          <a class="logo" href="#/" aria-label="Стартер — на главную"
            ><BrandImage width="2048" height="463" alt="СТАРТЕР" /></a>
          <p>
            Вакансии с нескольких площадок в одном каталоге. Пересказываем
            объявления простыми словами и подсказываем, какая профессия
            подойдёт.
          </p>
        </div>
        <nav class="footer__col" aria-label="Разделы сайта">
          <h2 class="footer__h">Сервис</h2>
          <ul>
            <li><a href="#/">Вакансии</a></li>
            <li><a href="#/match">Подбор профессии</a></li>
            <li><a href="#/saved">Избранное</a></li>
            <li><a href="#/account">Профиль</a></li>
          </ul>
        </nav>
        <div class="footer__col">
          <h2 class="footer__h">Источники</h2>
          <ul>
            <li>
              <a
                href="https://trudvsem.ru"
                target="_blank"
                rel="noopener noreferrer"
                >Работа России</a
              >
            </li>
            <li>
              <a href="https://hh.ru" target="_blank" rel="noopener noreferrer"
                >hh.ru</a
              >
            </li>
            <li>
              <a
                href="https://superjob.ru"
                target="_blank"
                rel="noopener noreferrer"
                >SuperJob</a
              >
            </li>
          </ul>
          <p class="footer__note">Отклик отправляется на сайте источника.</p>
        </div>
        <address class="footer__col footer__contacts">
          <h2 class="footer__h">Контакты</h2>
          <ul>
            <li>
              <a href="mailto:hello@starter.example">hello@starter.example</a>
            </li>
            <li><a href="tel:+70000000000">+7 (000) 000-00-00</a></li>
            <li>
              <a
                href="https://max.ru/"
                target="_blank"
                rel="noopener noreferrer"
                >Max</a
              >
              ·
              <a
                href="https://vk.com/"
                target="_blank"
                rel="noopener noreferrer"
                >VK</a
              >
            </li>
          </ul>
        </address>
      </div>

      <div class="footer__map">
        <div
          class="footer__map-view"
          id="office-map"
          role="region"
          aria-label="Карта офиса Стартера в Донецке"
        >
          <p role="status">Загрузка карты…</p>
        </div>
        <a
          class="link-arrow"
          href="https://yandex.ru/maps/?ll=37.8028%2C48.0159&amp;pt=37.8028%2C48.0159&amp;z=15"
          target="_blank"
          rel="noopener noreferrer"
          >Открыть в Яндекс Картах
          <svg class="icon" aria-hidden="true"><use href="#i-arrow" /></svg
        ></a>
      </div>

      <div class="footer__bottom">
        <p>© 2026 Стартер · хакатон «Код региона — 2026»</p>
        <p>
          Прототип: вакансии демонстрационные, компании вымышлены. Сервис не
          принимает и не пересылает отклики. Фотографии —
          <a
            href="https://unsplash.com"
            target="_blank"
            rel="noopener noreferrer"
            >Unsplash</a
          >.
        </p>
        <p>
          <a href="#">Политика конфиденциальности</a> ·
          <a href="#">Пользовательское соглашение</a>
        </p>
      </div>
    </div>
    <img v-if="route.path === '/'" class="footer__cat"
      src="/images/branding/starter-footer-cat-compact-1024.webp"
      srcset="/images/branding/starter-footer-cat-compact-768.webp 768w, /images/branding/starter-footer-cat-compact-1024.webp 1024w, /images/branding/starter-footer-cat-compact-1536.webp 1536w"
      sizes="(max-width: 720px) 228px, 342px" width="1024" height="449"
      alt="" aria-hidden="true" loading="lazy" />
  </footer>
</template>

<style scoped>
@media (min-width: 721px) { .nav__profile { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
</style>
