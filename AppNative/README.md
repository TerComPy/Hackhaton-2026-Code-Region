# AppNative — мобильное и десктопное приложение «Стартер» (.NET MAUI)

Нативный клиент сервиса «Стартер» для Android и Windows. Повторяет веб-фронтенд из `Frontend/`
(страницы, тексты, состояния) и работает с тем же бэкендом `Node-Back/`, развёрнутым на
**https://starterjob.ru**.

## Сборка и запуск

Нужны .NET SDK 11 и workload `maui` (`dotnet workload install maui`).

```bash
# Android (минимум Android 7.0, API 24), телефон подключён по USB с отладкой
dotnet build -t:Run -f net11.0-android

# Windows
dotnet build -t:Run -f net11.0-windows10.0.19041.0
```

В Visual Studio откройте `AppNative.csproj`, выберите целевую платформу и устройство, затем нажмите F5.
Если VS выдаёт ошибку `ConfiguredProject`, закройте VS и удалите папки `.vs`, `bin` и `obj`.

## Адрес бэкенда

Адрес задан в одном месте, в `Services/Api/ApiConfig.cs`:

```csharp
public const string BaseUrl = "https://starterjob.ru";
```

Для локального бэкенда укажите, например, `http://10.0.2.2:3000` (эмулятор Android) или
IP компьютера в сети. Для `http://` на Android дополнительно нужен `usesCleartextTraffic`.

## Демо-режим без сервера

В `MauiProgram.cs` сервисы `Api*` можно заменить на `Mock*`: `MockVacancyService`,
`MockFavoritesService`, `MockAuthService`, `MockMatchService` и `MockProfileService`.
Тогда приложение работает офлайн на демо-вакансиях, как фронтенд в режиме `mock`.

## Архитектура

| Папка | Что внутри |
|---|---|
| `Views/` | Страницы: `HomePage` (главная и каталог), `MatchPage` (подбор), `SavedPage` (избранное), `AccountPage` (вход и профиль), `VacancyPage` (карточка вакансии) |
| `Views/Controls/` | Шапка, футер с картой офиса, строка вакансии, кольцо профессий, скелетон каталога, окно «Не удалось подключиться к серверу» |
| `ViewModels/` | MVVM на CommunityToolkit.Mvvm (`[ObservableProperty]`, `[RelayCommand]`) |
| `Services/I*.cs` | Интерфейсы: вакансии, избранное, авторизация, подбор, профиль |
| `Services/Api/` | Работа с бэкендом: `ApiClient` (HTTP, токен, ошибки), `ApiMapper` (JSON → модели) |
| `Services/Mock/` | Офлайн-демо |
| `Resources/` | Шрифты Golos Text и JetBrains Mono, иконки, маскоты, цвета и стили |

Токен хранится в `Preferences` (`starter.api.token`). Если сервер отвечает 401, приложение выходит из профиля.
При запуске `AppShellViewModel` проверяет `/api/health` и `/api/ready`. Если сервер не отвечает,
показывается окно с кнопкой «Повторить».

## Соответствие API

| Экран / действие | Запрос | Сервис |
|---|---|---|
| Регистрация / вход / проверка сессии | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` | `ApiAuthService` |
| Каталог (поиск, город, формат, без опыта, зарплата от) | `GET /api/vacancies?search=&city=&includeRemote=&workFormat=&onlyNoExperience=&minSalary=&pageSize=` | `ApiVacancyService` |
| Карточка вакансии (описание, обязанности, требования, навыки) | `GET /api/vacancies/:id` | `ApiVacancyService` |
| ИИ-пересказ «Простыми словами» | `GET` (прочитать) и `POST` (поставить в очередь) `/api/vacancies/:id/summary`, опрос раз в 1,6 с, до 90 с | `ApiVacancyService` |
| «Открыть у работодателя» | `POST /api/vacancies/:id/outbound-click` → `originalUrl` | `ApiVacancyService` |
| Избранное | `GET /api/favorites`, `PUT` и `DELETE /api/favorites/:id` | `ApiFavoritesService` |
| Профиль: имя и город | `GET /api/profile`, `PATCH /api/profile` | `ApiProfileService` |
| Подбор направлений | `POST /api/match` `{ about }` | `ApiMatchService` |
| Доступность сервера | `GET /api/health`, `GET /api/ready` | `AppShellViewModel` |

Коды ошибок сервера (`INVALID_CREDENTIALS`, `EMAIL_EXISTS`, `VALIDATION_ERROR`, `UNAUTHORIZED`,
`AI_NOT_CONFIGURED`, `MATCH_RATE_LIMIT` и др.) переводятся в те же русские сообщения, что и на сайте.

## Соответствие веб-фронтенду

- **Каталог** (`CatalogWidget.vue`):
  - гость видит кота и кнопку «Войти и посмотреть вакансии»;
  - пока вакансии грузятся, показывается скелетон из 6 строк;
  - счётчик выглядит как «Загружено: N · API»;
  - у вакансий из базы вместо фото стоит заглушка с портфелем (`ApiJobList.vue`).
- **Карточка вакансии** (`VacancySheet.vue`):
  - оригинал объявления разбит на разделы «Описание», «Обязанности», «Требования» и «Навыки»;
  - пересказ ИИ: пока он готовится, кнопка «Простыми словами» неактивна;
  - у архивной вакансии стоит отметка «Вакансия в архиве», а переход к работодателю недоступен;
  - ошибки загрузки и перехода выводятся по статусу ответа (401, 404, прочие).
- **Избранное** (`Saved.vue`):
  - гостю показывается «Войдите в аккаунт, чтобы увидеть избранное.»;
  - есть состояния загрузки и ошибки с кнопкой «Повторить».
- **Профиль** (`Account.vue`, `userProfile.ts`):
  - редактор «Имя» и «Город» (до 150 символов);
  - кнопки «Сохранить профиль» и «Обновить профиль».
- **Подбор** (`Match.vue`): работает только после входа; на заглушке стоит маскот-детектив.
- **Футер** (`FooterOfficeMap.vue`):
  - встроенная карта офиса в Донецке (виджет Яндекс Карт);
  - если карта не загрузилась, показывается подсказка и остаётся ссылка «Открыть в Яндекс Картах».

На телефоне вёрстка переключается через `OnIdiom` (Phone и Desktop), так же как адаптив сайта при ширине до 720px.
Светлая и тёмная темы задаются через `AppThemeBinding` на цветах из `Resources/Styles/Colors.xaml`.
