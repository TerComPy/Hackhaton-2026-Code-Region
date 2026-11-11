<script setup lang="ts">
import { ref } from "vue";
import PerlinOpportunity from "../widgets/PerlinOpportunity.vue";
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
            <div v-if="mode === 'register'" class="field auth-name">
              <label for="auth-name" class="field__label">Как вас зовут</label>
              <input id="auth-name" class="input input--lg" v-model="name" placeholder="Ваше имя" maxlength="80" required autocomplete="name" />
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
            <div v-if="error" class="auth-feedback"><p class="form-error" role="alert">{{ error }}</p></div>
            <button class="btn btn--accent auth-submit">{{ mode === 'register' ? 'Создать профиль' : 'Войти' }}<svg class="icon" aria-hidden="true"><use href="#i-right" /></svg></button>
          </form>
          <p class="auth-switch">{{ mode === 'register' ? 'Уже есть аккаунт?' : 'Нет аккаунта?' }} <button type="button" :aria-label="mode === 'register' ? 'Вход' : 'Регистрация'" @click="mode = mode === 'register' ? 'login' : 'register'; error = ''; reveal = false">{{ mode === 'register' ? 'Войти' : 'Зарегистрироваться' }}</button></p>
          <p class="auth__note">Демо-режим. Имя и email остаются в браузере.<br />Пароль не сохраняется и не проверяется сервером.</p>
        </div>
      </div>
      <PerlinOpportunity />
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
