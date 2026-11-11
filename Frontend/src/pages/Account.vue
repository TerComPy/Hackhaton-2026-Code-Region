<script setup lang="ts">
import { ref } from "vue";
import { useCatalog } from "../entities/store";
const store = useCatalog(),
  mode = ref("register"),
  name = ref(""),
  email = ref(""),
  password = ref(""),
  reveal = ref(false),
  error = ref("");
function submit() {
  if (
    (mode.value === "register" && !name.value.trim()) ||
    ! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ||
    password.value.length < 10
  ) {
    error.value =
      "Укажите имя, корректный email и пароль не короче 10 символов.";
    return;
  }
  store.user = {
    name: name.value.trim() || email.value.split("@")[0]!,
    email: email.value,
  };
  password.value = "";
  error.value = "";
}
</script>
<template>
  <section class="account wrap">
    <div v-if="!store.user" class="account__guest">
      <div class="account__intro">
        <p class="auth-brand"><span aria-hidden="true">↗</span> стартер<span class="eyebrow"> / профиль</span></p>
        <h1 class="page-title">{{ mode === "register" ? "Создать аккаунт" : "С возвращением" }}</h1>
        <p class="auth-subtitle">{{ mode === "register" ? "Сохраните вакансии и найдите своё направление." : "Вернитесь к подборке и сохранённым вакансиям." }}</p>
        <div class="seg account__tabs">
          <button
            v-for="m in ['register', 'login']"
            class="seg__btn"
            :aria-pressed="mode === m"
            @click="mode = m; error = ''; reveal = false"
          >
            {{ m === "register" ? "Регистрация" : "Вход" }}
          </button>
        </div>
        <form class="auth" @submit.prevent="submit">
          <div class="field" v-if="mode === 'register'">
            <label for="auth-name" class="field__label">Имя</label
            ><input
              id="auth-name"
              class="input input--lg"
              v-model="name"
              maxlength="80"
              required
              autocomplete="name"
            />
          </div>
          <div class="field">
            <label for="auth-email" class="field__label">Email</label
            ><input
              id="auth-email"
              type="email"
              class="input input--lg"
              v-model="email"
              required
              autocomplete="email"
            />
          </div>
          <div class="field">
            <label for="auth-password" class="field__label">Пароль</label>
            <div class="input-wrap">
              <input
                id="auth-password"
                :type="reveal ? 'text' : 'password'"
                class="input input--lg"
                v-model="password"
                aria-describedby="password-hint"
                minlength="10"
                maxlength="128"
                required
                :autocomplete="
                  mode === 'register' ? 'new-password' : 'current-password'
                "
              /><button
                class="input-wrap__btn"
                type="button"
                :aria-pressed="reveal"
                :aria-label="reveal ? 'Скрыть пароль' : 'Показать пароль'"
                @click="reveal = !reveal"
              >
                <svg class="icon"><use href="#i-eye" /></svg>
              </button>
            </div>
            <p id="password-hint" class="field__hint">Не меньше 10 символов</p>
          </div>
          <p class="form-error" role="alert">{{ error }}</p>
          <button class="btn btn--accent">
            {{ mode === "register" ? "Создать профиль" : "Войти" }}
          </button>
          <p class="auth__note">
            Демо-профиль: имя и email хранятся в браузере. Пароль не сохраняется
            и не проверяется сервером.
          </p>
        </form>
      </div>
      <aside class="opportunity" aria-label="Карта возможностей">
        <div class="opportunity__header"><span class="eyebrow">Стартер / Атлас направлений</span><span class="eyebrow">01 — 03</span></div>
        <div class="opportunity__title">У каждого навыка —<br />несколько направлений.</div>
        <svg class="opportunity__map" viewBox="0 0 600 440" aria-hidden="true">
          <defs><pattern id="atlas-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1" fill="currentColor" opacity=".2" /></pattern></defs>
          <rect width="600" height="440" fill="url(#atlas-dots)" />
          <g fill="none" stroke="currentColor" stroke-width="1" opacity=".35">
            <path d="M60 330 180 260 300 330 420 260 540 330 540 190 420 120 300 190 180 120 60 190Z M60 190 180 260 180 120 M180 260 300 190 420 260 420 120 M300 190 300 330 M420 260 540 190 M60 330 300 50 540 330 M180 120 300 50 420 120" />
            <ellipse cx="300" cy="236" rx="236" ry="158" stroke-dasharray="3 9" />
            <path d="M24 382H576 M300 24V410" stroke-dasharray="4 8" />
          </g>
          <g fill="var(--bg-raise)" stroke="currentColor"><circle cx="60" cy="190" r="5"/><circle cx="180" cy="120" r="5"/><circle cx="300" cy="50" r="5"/><circle cx="420" cy="120" r="5"/><circle cx="540" cy="190" r="5"/><circle cx="60" cy="330" r="5"/><circle cx="300" cy="330" r="5"/><circle cx="540" cy="330" r="5"/></g>
          <g fill="var(--accent)"><circle cx="180" cy="260" r="7"/><circle cx="300" cy="190" r="7"/><circle cx="420" cy="260" r="7"/></g>
          <g fill="currentColor" font-size="11" font-family="monospace"><text x="196" y="252">НАВЫКИ</text><text x="316" y="182">ПРОФЕССИИ</text><text x="436" y="284">ПРАКТИКА</text><text x="24" y="410">СВЯЗИ / ВОЗМОЖНОСТИ / ВЫБОР</text></g>
        </svg>
        <div class="opportunity__footer"><span class="eyebrow">Ваш следующий шаг</span><p>От того, что умеете,<br />к тому, что интересно.</p><span aria-hidden="true">↗</span></div>
      </aside>
    </div>
    <div class="member" v-else>
      <div class="member__head">
        <span class="avatar">{{ store.user.name[0] }}</span>
        <div class="member__who">
          <p class="eyebrow">Демо-профиль</p>
          <h1 class="page-title">{{ store.user.name }}</h1>
          <p class="member__email">{{ store.user.email }}</p>
        </div>
        <button class="btn btn--ghost" @click="store.user = null">Выйти</button>
      </div>
      <p>{{ store.saved.length }} сохранённых вакансий</p>
      <p>{{ store.about }}</p>
      <a class="link-arrow" href="#/match">Обновить подбор</a
      ><a class="link-arrow" href="#/saved">Избранное</a>
    </div>
  </section>
</template>
