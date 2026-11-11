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
        <div class="auth-content">
          <a class="logo auth-brand" href="#/" aria-label="Стартер — на главную">стартер<span class="logo__mark" aria-hidden="true"></span></a>
          <header class="auth-heading">
            <p class="eyebrow">Личное пространство</p>
            <h1 class="page-title">{{ mode === 'register' ? 'Начните со своего.' : 'Продолжим поиск.' }}</h1>
            <p class="auth-subtitle">{{ mode === 'register' ? 'Создайте демо-профиль, чтобы сохранять вакансии и собирать свою подборку.' : 'Войдите в демо-профиль и вернитесь к сохранённым вакансиям.' }}</p>
          </header>
          <form class="auth" @submit.prevent="submit">
            <div class="field auth-name" :class="{ 'is-inactive': mode === 'login' }" :inert="mode === 'login'" :aria-hidden="mode === 'login'">
              <label for="auth-name" class="field__label">Как вас зовут</label>
              <input id="auth-name" class="input input--lg" v-model="name" placeholder="Ваше имя" maxlength="80" :required="mode === 'register'" :disabled="mode === 'login'" autocomplete="name" />
            </div>
            <div class="field">
              <label for="auth-email" class="field__label">Email</label>
              <input id="auth-email" type="email" class="input input--lg" v-model="email" placeholder="name@example.ru" required autocomplete="email" />
            </div>
            <div class="field">
              <label for="auth-password" class="field__label">Пароль <span class="auth-password-hint" id="password-hint">от 10 символов</span></label>
              <div class="input-wrap">
                <input id="auth-password" :type="reveal ? 'text' : 'password'" class="input input--lg" v-model="password" placeholder="Введите пароль" aria-describedby="password-hint" minlength="10" maxlength="128" required :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" />
                <button class="input-wrap__btn" type="button" :aria-pressed="reveal" :aria-label="reveal ? 'Скрыть пароль' : 'Показать пароль'" @click="reveal = !reveal"><svg class="icon" aria-hidden="true"><use :href="reveal ? '#i-eye-off' : '#i-eye'" /></svg></button>
              </div>
            </div>
            <div class="auth-feedback"><p class="form-error" role="alert">{{ error }}</p></div>
            <button class="btn btn--accent auth-submit">{{ mode === 'register' ? 'Создать профиль' : 'Войти' }}<svg class="icon" aria-hidden="true"><use href="#i-right" /></svg></button>
          </form>
          <p class="auth-switch">{{ mode === 'register' ? 'Уже есть аккаунт?' : 'Нет аккаунта?' }} <button type="button" :aria-label="mode === 'register' ? 'Вход' : 'Регистрация'" @click="mode = mode === 'register' ? 'login' : 'register'; error = ''; reveal = false">{{ mode === 'register' ? 'Войти' : 'Зарегистрироваться' }}</button></p>
          <p class="auth__note">Демо-режим. Имя и email остаются в браузере.<br />Пароль не сохраняется и не проверяется сервером.</p>
        </div>
      </div>
      <aside class="opportunity" aria-label="Карта возможностей">
        <div class="opportunity__header"><span class="eyebrow">Стартер / Карта возможностей</span><span class="eyebrow">01 — 03</span></div>
        <div class="opportunity__copy"><p class="eyebrow">От навыка к профессии</p><h2>Ваш опыт.<br />Новые направления.</h2><p>Свяжите то, что умеете,<br />с тем, чем хочется заниматься.</p></div>
        <svg class="opportunity__map" viewBox="0 0 560 320" aria-hidden="true">
          <g fill="none" stroke="currentColor" stroke-width="1">
            <path opacity=".1" d="M40 40H520M40 100H520M40 160H520M40 220H520M40 280H520M100 20V300M220 20V300M340 20V300M460 20V300" />
            <path opacity=".3" d="M100 220 220 100 340 160 460 40M100 220 340 280 460 160M220 100 460 160M340 160 340 280" />
            <path stroke="var(--accent)" d="M100 220 220 100 340 160 460 160" />
            <circle cx="340" cy="160" r="35" opacity=".25"/><circle cx="340" cy="160" r="53" opacity=".1"/>
          </g>
          <g fill="var(--bg-raise)" stroke="currentColor"><circle cx="100" cy="220" r="6"/><circle cx="220" cy="100" r="6"/><circle cx="340" cy="280" r="6"/><circle cx="460" cy="40" r="6"/><circle cx="460" cy="160" r="6"/></g>
          <circle cx="340" cy="160" r="8" fill="var(--accent)"/>
          <g fill="currentColor" font-size="11" font-family="monospace"><text x="65" y="248">НАВЫКИ</text><text x="184" y="76">ИНТЕРЕСЫ</text><text x="362" y="140">ВАШ ПУТЬ</text></g>
        </svg>
        <div class="opportunity__footer"><span class="eyebrow">Возможности начинаются с вас</span><span aria-hidden="true">↗</span></div>
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

<style src="./account.css"></style>
