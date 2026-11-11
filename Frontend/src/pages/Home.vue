<script setup lang="ts">
import { dataMode } from "../shared/api";
import { ref, onMounted, onActivated, onDeactivated, onBeforeUnmount, nextTick } from "vue";
import { useCatalog } from "../entities/store";
import { catalog } from "../entities/catalog";
import { photo, salary, type Job } from "../entities/job";
import CatalogWidget from "../widgets/CatalogWidget.vue";
import VacancySheet from "../widgets/VacancySheet.vue";
import { Scene } from "../widgets/scene";
const store = useCatalog();
// KeepAlive retains the page: pause expensive scenes away from home, and replay
// CSS entrances only on a genuine route reactivation (not on theme/store updates).
type SceneControl = { pause: () => void; resume: () => void; destroy: () => void };
const sceneControls: SceneControl[] = [];
const entering = ref(true);
let activatedOnce = false;
let activationToken = 0;
onActivated(() => {
  const token = ++activationToken;
  sceneControls.forEach((control) => control.resume());
  if (!activatedOnce) {
    activatedOnce = true;
  } else {
    void nextTick(() => {
      if (token === activationToken) entering.value = true;
    });
  }
});
onDeactivated(() => {
  ++activationToken;
  entering.value = false;
  sceneControls.forEach((control) => control.pause());
});
onBeforeUnmount(() => {
  ++activationToken;
  sceneControls.forEach((control) => control.destroy());
  sceneControls.length = 0;
});
const selected = ref<Job | null>(null);
const ringJobs = [1, 4, 3, 2, 6, 14, 7, 9, 11, 10].map((id) =>
  catalog.jobs.find((j) => j.id === id)!,
);
function search() {
  document.getElementById("catalog")?.scrollIntoView({ behavior: "smooth" });
}
onMounted(() => {
  const $ = (s: string) => document.querySelector(s);
  sceneControls.push(Scene.createRing({
    stage: $("#ring-stage"),
    ring: $("#ring"),
    items: ringJobs,
    render: () => null,
    onPick: (j: Job) => (selected.value = j),
  }));
  sceneControls.push(Scene.createHowScene({
    track: $("#how-track"),
    scene: $("#scene"),
    steps: [...document.querySelectorAll("#steps .step")],
    bar: $("#how-bar"),
    onStep: () => {},
  }));
  sceneControls.push(Scene.createParallax($("#invite-media")));
});
</script>
<template>
  <div class="view" data-view="home" :class="{ 'home-enter': entering }">
    <section class="hero" aria-labelledby="hero-title">
      <div class="wrap hero__grid">
        <div class="hero__copy">
          <p class="eyebrow">Агрегатор вакансий</p>
          <h1 class="hero__title" id="hero-title">
            <span class="hero__line" style="--entrance-delay: 260ms">Вакансии</span>
            <span class="hero__line" style="--entrance-delay: 420ms">со&nbsp;всей сети —</span>
            <span class="hero__line hero__line--muted" style="--entrance-delay: 580ms">без канцелярита.</span>
          </h1>
          <p class="hero__lead">
            Собираем предложения с «Работы России», hh.ru и SuperJob,
            пересказываем их простыми словами и подсказываем, какая профессия
            подойдёт именно вам.
          </p>

          <form
            class="search"
            id="hero-search"
            @submit.prevent="search"
            role="search"
            aria-label="Поиск вакансий"
          >
            <label class="search__field">
              <svg class="icon" aria-hidden="true">
                <use href="#i-search" />
              </svg>
              <span class="sr-only">Профессия, навык или компания</span>
              <input
                name="q"
                v-model="store.query"
                type="search"
                autocomplete="off"
                placeholder="Профессия, навык или компания"
              />
            </label>
            <label class="search__field search__field--city">
              <svg class="icon" aria-hidden="true"><use href="#i-pin" /></svg>
              <span class="sr-only">Город</span>
              <input
                name="city"
                v-model="store.city"
                type="search"
                autocomplete="address-level2"
                placeholder="Город"
              />
            </label>
            <button class="btn btn--accent search__submit" type="submit">
              Найти
            </button>
          </form>

          <p class="hero__alt">
            Ещё не решили, кем хотите работать?
            <a class="link-arrow" href="#/match"
              >Расскажите о себе<svg class="icon" aria-hidden="true">
                <use href="#i-right" /></svg
            ></a>
          </p>
        </div>

        <div class="hero__stage" id="ring-stage">
          <div class="ring-viewport">
            <div
              class="ring"
              id="ring"
              role="group"
              aria-label="Профессии из каталога"
            >
              <button
                v-for="job in ringJobs"
                :key="job.id"
                class="ring__card"
                type="button"
                :aria-label="job.title"
              >
                <span
                  v-for="side in ['front', 'back']"
                  :key="side"
                  :class="'ring__face ring__face--' + side"
                  aria-hidden="true"
                  ><img :src="photo(job)" alt="" draggable="false" /><span
                    class="ring__label"
                    ><span class="ring__role">{{ job.short }}</span
                    ><span class="ring__pay">{{ salary(job) }}</span></span
                  ></span
                >
              </button>
            </div>
          </div>
          <div class="ring-floor" aria-hidden="true"></div>
          <p class="ring-hint">
            <span v-if="dataMode === 'api'" class="ring-hint__demo">
              Демонстрация профессий · вымышленные вакансии
            </span>
            <span>
              <span class="hint-desktop">Потяните, чтобы покрутить</span>
              <span class="hint-touch">Проведите, чтобы покрутить</span>
              · нажмите на профессию, чтобы открыть вакансию
            </span>
          </p>
        </div>
      </div>

      <div class="wrap">
        <ul class="sources" id="sources" aria-label="Источники вакансий">
          <li
            v-for="(_, name, index) in catalog.sources"
            :key="name"
            :style="{ '--entrance-delay': `${1600 + index * 120}ms` }"
          >{{ name }}</li>
        </ul>
      </div>
    </section>

    <section class="how" id="how" aria-labelledby="how-title">
      <div class="how__track" id="how-track">
        <div class="how__sticky">
          <div class="wrap how__grid">
            <div class="how__text">
              <p class="eyebrow" id="how-title">Как это работает</p>
              <ol class="steps" id="steps">
                <li class="step is-active">
                  <button class="step__btn" type="button" data-step="0">
                    <span class="step__num">01</span
                    ><span class="step__title">Собираем и убираем дубли</span>
                  </button>
                  <div class="step__body">
                    <p>
                      Одна и та же вакансия часто висит на трёх площадках под
                      разными названиями. Мы приводим объявления к одному
                      формату и склеиваем повторы.
                    </p>
                  </div>
                </li>
                <li class="step">
                  <button class="step__btn" type="button" data-step="1">
                    <span class="step__num">02</span
                    ><span class="step__title"
                      >Пересказываем по‑человечески</span
                    >
                  </button>
                  <div class="step__body">
                    <p>
                      ИИ переводит «клиентоориентированность» и «SLA» на обычный
                      язык. Зарплату, график и адрес не трогаем — они остаются
                      как в оригинале.
                    </p>
                  </div>
                </li>
                <li class="step">
                  <button class="step__btn" type="button" data-step="2">
                    <span class="step__num">03</span
                    ><span class="step__title">Объясняем, почему подходит</span>
                  </button>
                  <div class="step__body">
                    <p>
                      Сравниваем вакансию с вашим рассказом о себе и показываем,
                      на какие именно ваши слова опирался подбор.
                    </p>
                  </div>
                </li>
              </ol>
              <div class="how__progress" aria-hidden="true">
                <span id="how-bar"></span>
              </div>
            </div>

            <div class="how__scene" aria-hidden="true">
              <div class="scene" id="scene">
                <div class="src-card" data-i="0">
                  <span class="src-card__source">hh.ru</span>
                  <strong>Оператор call-центра (удалённо)</strong>
                  <span>от 40 000 ₽ · Новосибирск</span>
                </div>
                <div class="src-card" data-i="1">
                  <span class="src-card__source">SuperJob</span>
                  <strong>ОПЕРАТОР КОЛЛ-ЦЕНТРА / ДОМА</strong>
                  <span>40 000 — 55 000 руб.</span>
                </div>
                <div class="src-card" data-i="2">
                  <span class="src-card__source">Работа России</span>
                  <strong>Специалист контактного центра</strong>
                  <span>з/п по договорённости</span>
                </div>

                <div class="doc" id="doc">
                  <div class="doc__face doc__front">
                    <span class="doc__shine"></span>
                    <div class="doc__head">
                      <span class="doc__label">Текст работодателя</span
                      ><span class="doc__merge">3 объявления → 1</span>
                    </div>
                    <p class="doc__title">Оператор контакт-центра</p>
                    <p class="doc__pay">40 000 – 55 000 ₽ · удалённо</p>
                    <p class="doc__h">Обязанности</p>
                    <p>
                      Консультирование абонентов в рамках утверждённых
                      <mark>скриптов</mark>, фиксация обращений в
                      <mark>CRM-системе</mark>, соблюдение <mark>SLA</mark>.
                    </p>
                    <p class="doc__h">Требования</p>
                    <p>
                      Грамотная речь, <mark>стрессоустойчивость</mark>,
                      <mark>клиентоориентированность</mark>, уверенный
                      пользователь ПК.
                    </p>
                  </div>
                  <div class="doc__face doc__back">
                    <span class="doc__shine"></span>
                    <div class="doc__head">
                      <span class="doc__label doc__label--ai">Пересказ ИИ</span>
                    </div>
                    <p class="doc__title">Оператор контакт-центра</p>
                    <p class="doc__pay">
                      40 000 – 55 000 ₽ · удалённо
                      <span class="doc__same">как в оригинале</span>
                    </p>
                    <p class="doc__h">Что делать</p>
                    <p>
                      Отвечать на звонки клиентов провайдера и помогать решить
                      вопрос по готовым подсказкам. Записывать каждое обращение
                      в программу.
                    </p>
                    <p class="doc__h">Что нужно</p>
                    <p>
                      Говорить понятно, не теряться, если человек недоволен,
                      уверенно пользоваться компьютером. Опыт не нужен.
                    </p>
                  </div>
                </div>

                <div class="fit-note" id="fit-note">
                  <span class="fit-note__label">Подходит вам</span>
                  <p>
                    Вы написали «люблю общаться с людьми» и «хочу работать из
                    дома» — здесь нужно и то и другое.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <CatalogWidget />
    <section class="invite" aria-labelledby="invite-title">
      <div class="wrap invite__grid">
        <figure class="invite__media" id="invite-media">
          <img
            src="https://images.unsplash.com/photo-1758876016923-c4e2f72983bd?auto=format&fit=crop&w=1100&q=72"
            alt="Человек пишет в блокноте за рабочим столом"
            loading="lazy"
            width="1100"
            height="1300"
          />
        </figure>
        <div class="invite__copy">
          <p class="eyebrow">Подбор профессии</p>
          <h2 id="invite-title">
            Не обязательно знать, кем вы хотите работать
          </h2>
          <p>
            Напишите пару абзацев о себе — учёба, увлечения, что получается
            лучше всего. Мы предложим три направления, объясним каждое вашими же
            словами и покажем вакансии, с которых можно начать.
          </p>
          <a class="btn btn--accent" href="#/match">Подобрать профессию</a>
          <p class="invite__note">
            Резюме не нужно. Текст хранится только в вашем браузере.
          </p>
        </div>
      </div>
    </section>
  </div>
  <VacancySheet v-if="selected" :job="selected" @close="selected = null" />
</template>

