<script setup lang="ts">
import BrandImage from "../shared/BrandImage.vue";
import { useUserProfile } from "../entities/userProfile";
import { dataMode } from "../shared/api";
import { ref, computed, watch } from "vue";
import { useSession } from "../entities/session";
import PerlinOpportunity from "../widgets/PerlinOpportunity.vue";
import { useCatalog } from "../entities/store";
const store = useCatalog(),
  mode = ref("register"),
  name = ref(""),
  email = ref(""),
  password = ref(""),
  reveal = ref(false),
  error = ref("");
const session = useSession();
const editor = useUserProfile();
const minimum = dataMode === "api" ? 8 : 10;
const member = computed(() => dataMode === "api" ? session.user && session.authenticated ? { name: session.profile?.displayName || session.user.displayName, email: session.user.email } : null : store.user);
watch(mode, () => { error.value = ""; session.notice = ""; password.value = ""; });
watch(() => session.authenticated, (active, previous) => {
  if (dataMode === "api" && previous && !active) {
    name.value = ""; email.value = ""; password.value = ""; reveal.value = false; error.value = "";
  }
});
async function submit() {
  if (session.busy) return;
  if (dataMode === "api") {
    if ((mode.value === "register" && !name.value.trim()) || !email.value.trim() || password.value.length < 8 || password.value.length > 128) {
      error.value = "Проверьте email, имя и пароль (от 8 до 128 символов).";
      return;
    }
    error.value = "";
    const credentials = { email: email.value.trim(), password: password.value, displayName: name.value.trim() };
    password.value = "";
    reveal.value = false;
    await session.authenticate(mode.value === "register" ? "register" : "login", credentials);
    return;
  }
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
    <div v-if="!member" class="account__guest">
      <div class="account__intro">
        <div class="auth-content">
          <div class="auth-brand" aria-hidden="true"><BrandImage kind="cat-outline" width="656" height="499" alt="" /></div>
          <header class="auth-heading">
            <p class="eyebrow">Личное пространство</p>
            <h1 class="page-title">{{ mode === 'register' ? 'Начните со своего.' : 'Продолжим поиск.' }}</h1>
            <p class="auth-subtitle">{{ dataMode === 'api' ? (mode === 'register' ? 'Создайте аккаунт и начните свой поиск.' : 'Войдите в свой аккаунт, чтобы продолжить.') : (mode === 'register' ? 'Создайте демо-профиль, чтобы сохранять вакансии и собирать свою подборку.' : 'Войдите в демо-профиль и вернитесь к сохранённым вакансиям.') }}</p>
          </header>
          <form class="auth" @submit.prevent="submit" :aria-busy="dataMode === 'api' && session.busy">
            <div v-if="mode === 'register'" class="field auth-name">
              <label for="auth-name" class="field__label">Как вас зовут</label>
              <input id="auth-name" class="input input--lg" v-model="name" :disabled="dataMode === 'api' && session.busy" placeholder="Ваше имя" :maxlength="dataMode === 'api' ? 150 : 80" required autocomplete="name" />
            </div>
            <div class="field">
              <label for="auth-email" class="field__label">Email</label>
              <input id="auth-email" type="email" class="input input--lg" v-model="email" :disabled="dataMode === 'api' && session.busy" placeholder="name@example.ru" maxlength="254" required autocomplete="email" />
            </div>
            <div class="field">
              <label for="auth-password" class="field__label">Пароль <span class="auth-password-hint" id="password-hint">от {{ minimum }} символов</span></label>
              <div class="input-wrap">
                <input id="auth-password" :type="reveal ? 'text' : 'password'" class="input input--lg" v-model="password" :disabled="dataMode === 'api' && session.busy" placeholder="Введите пароль" aria-describedby="password-hint" :minlength="minimum" maxlength="128" required :autocomplete="mode === 'register' ? 'new-password' : 'current-password'" />
                <button class="input-wrap__btn" type="button" :aria-pressed="reveal" :aria-label="reveal ? 'Скрыть пароль' : 'Показать пароль'" @click="reveal = !reveal"><svg class="icon" aria-hidden="true"><use :href="reveal ? '#i-eye-off' : '#i-eye'" /></svg></button>
              </div>
            </div>
            <div v-if="error || (dataMode === 'api' && session.notice)" class="auth-feedback"><p class="form-error" role="alert">{{ error || session.notice }}</p></div>
            <button class="btn btn--accent auth-submit" :disabled="dataMode === 'api' && session.busy">{{ dataMode === 'api' && session.busy ? 'Загрузка…' : mode === 'register' ? 'Создать профиль' : 'Войти' }}<svg class="icon" aria-hidden="true"><use href="#i-right" /></svg></button>
          </form>
          <p class="auth-switch">{{ mode === 'register' ? 'Уже есть аккаунт?' : 'Нет аккаунта?' }} <button type="button" :disabled="dataMode === 'api' && session.busy" :aria-label="mode === 'register' ? 'Вход' : 'Регистрация'" @click="mode = mode === 'register' ? 'login' : 'register'; error = ''; reveal = false">{{ mode === 'register' ? 'Войти' : 'Зарегистрироваться' }}</button></p>
          <p v-if="dataMode === 'mock'" class="auth__note">Демо-режим. Имя и email остаются в браузере.<br />Пароль не сохраняется и не проверяется сервером.</p>
          <p v-else class="auth__note">Вход в аккаунт СТАРТЕР.<br />Пароль не сохраняется в браузере.</p>
        </div>
      </div>
      <PerlinOpportunity />
    </div>
    <div class="member" v-else>
      <div class="member__head">
        <span class="avatar">{{ member.name[0] }}</span>
        <div class="member__who">
          <p class="eyebrow">{{ dataMode === 'api' ? 'Профиль' : 'Демо-профиль' }}</p>
          <h1 class="page-title">{{ member.name }}</h1>
          <p class="member__email">{{ member.email }}</p>
        </div>
        <button class="btn btn--ghost" @click="dataMode === 'api' ? session.clear() : store.user = null">Выйти</button>
      </div>
      <form v-if="dataMode === 'api'" class="profile-editor auth" @submit.prevent="editor.save()" :aria-busy="editor.saving || editor.loading">
        <div class="field"><label class="field__label" for="profile-name">Имя</label><input id="profile-name" class="input" v-model="editor.displayName" required maxlength="150" :disabled="editor.saving || editor.loading" @input="editor.success = ''" /></div>
        <div class="field"><label class="field__label" for="profile-city">Город</label><input id="profile-city" class="input" v-model="editor.city" maxlength="150" :disabled="editor.saving || editor.loading" @input="editor.success = ''" /></div>
        <p v-if="editor.loading" role="status">Загружаем профиль…</p><p v-if="editor.saving" role="status">Сохраняем…</p><p v-if="editor.success" role="status">{{ editor.success }}</p><p v-if="editor.error" role="alert">{{ editor.error }}</p>
        <div><button class="btn btn--accent" :disabled="editor.saving || editor.loading" type="submit">Сохранить профиль</button> <button class="btn btn--ghost" :disabled="editor.saving || editor.loading" type="button" @click="editor.load()">Обновить профиль</button></div>
      </form>
      <p v-if="dataMode === 'mock'">{{ store.saved.length }} сохранённых вакансий</p>
      <p>{{ store.about }}</p>
      <nav class="member__quick-links" aria-label="Ссылки профиля">
        <a class="link-arrow" href="#/match">Обновить подбор</a>
        <a class="link-arrow" href="#/saved">Избранное</a>
      </nav>
    </div>
  </section>
</template>

<style src="./account.css"></style>

