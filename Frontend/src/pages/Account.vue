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
    !email.value.includes("@") ||
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
        <p class="eyebrow">Профиль</p>
        <h1 class="page-title">Сохраните подборку и избранное</h1>
        <p class="lead">
          Профиль собирает в одном месте рассказ о себе, подобранные направления
          и сохранённые вакансии.
        </p>
        <div class="seg account__tabs">
          <button
            v-for="m in ['register', 'login']"
            class="seg__btn"
            :aria-pressed="mode === m"
            @click="mode = m"
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
                aria-label="Показать пароль"
                @click="reveal = !reveal"
              >
                <svg class="icon"><use href="#i-eye" /></svg>
              </button>
            </div>
            <p class="field__hint">Не меньше 10 символов</p>
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
      <aside class="account__aside">
        <figure class="account__media">
          <img
            src="https://images.unsplash.com/photo-1758873268705-bb756c95f26a?auto=format&fit=crop&w=1100&h=760&q=72"
            alt="Коллеги обсуждают задачу"
          />
        </figure>
        <ol class="perks">
          <li>Подборка не потеряется.</li>
          <li>Избранное под рукой.</li>
          <li>Каталог подстраивается.</li>
        </ol>
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
