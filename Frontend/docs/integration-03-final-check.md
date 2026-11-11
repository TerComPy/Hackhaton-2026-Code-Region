Проверка Integration 03 — 2026-11-12

Переполнение на 6 px воспроизведено через Playwright после ввода пароля.
Причина: внешний iframe Kaspersky password_control_balloon.html внутри закрытого Shadow DOM.
getBoundingClientRect(): x=3, y=501, width=378, height=192, right=381, bottom=693.
Computed styles: position=absolute, width=378px, box-sizing=content-box, padding=0px.
При clientWidth=375 значения innerWidth и scrollWidth увеличиваются до 381.
После штатного нажатия #closeButton: innerWidth=clientWidth=scrollWidth=375.
Измерения и computed styles сохранены в auth-overflow-kaspersky.json.

Исправлены условия тестирования: до навигации только тестовой страницы блокируются внешние ресурсы kaspersky-labs.com через Playwright page.route. Это устраняет гонку повторного появления панели. Дополнительно предусмотрено закрытие внешней панели через её собственную кнопку, сериализация закрытий, blur перед переключением формы. Настройки системного антивируса не изменяются. DOM и CSS приложения не маскируются. Производственные стили для этой проблемы не изменялись.
Новый auth-mobile.spec.ts проверяет регистрацию/вход, обычное состояние, native validation и ошибку приложения, обе темы, 320×812, 375×812, 390×844. В тесте отключено прежнее body overflow-x:clip через overflow-x:visible, чтобы проверка обнаруживала реальное переполнение. Геометрия и computed styles полей прикладываются как geometry.json к каждому результату.
Скриншоты auth-fullscreen и Perlin перенаправлены в test-results вместо перезаписи эталонов docs.

PNG: проверены .local-backup/frontend-before.tar, auth-before/frontend.tar, readiness-before/frontend.tar — этих PNG нет. Дополнительное доказательство: полный git status --short в предыдущем этапе (exec cc6fb5, до первого Playwright) не содержал ни одного из шести PNG. После прогона они появились как modified (exec 9108a9). По явному разрешению пользователя восстановлены исключительно шесть PNG из HEAD; каждый проверен побайтово. Никакие другие файлы не сбрасывались.

Успешно: typecheck, production build, API E2E 6/6; целевая проверка mobile-small 8/8 (окончательная версия, 9.4 s).
Финальный полный Playwright: 106 passed, 44 skipped, 0 failed (1.1 min), Chrome, LIVE_API=1. Оба исходно упавших mobile-small теста прошли.
Пропуски: 36 запусков API-mode тестов в mock-конфигурации (6 тестов × 6 проектов), эти 6 тестов проходят отдельно в playwright.api.config.ts. Ещё 8 запусков Perlin пропускаются его существующим ограничением desktop-laptop/desktop-small: на мобильных панель скрыта; остальные desktop-размеры не включены в этот тест. LIVE_API=1 включает все 6 проверок живого readiness, без их пропуска.

Изменения остаются локально. Worktree, коммиты, push и PR не выполнялись. Авторизация, HTTP Foundation, Perlin, VacancySheet и другие текущие изменения сохранены.



Итоговый git status --short:

 M .gitignore
 M Frontend/index.html
 M Frontend/package.json
 M Frontend/src/app/App.vue
 M Frontend/src/app/main.ts
 M Frontend/src/entities/store.ts
 M Frontend/src/pages/Account.vue
 M Frontend/src/pages/ApiPreview.vue
 M Frontend/src/pages/Home.vue
 M Frontend/src/pages/account.css
 M Frontend/src/shared/api.ts
 M Frontend/src/shared/styles.css
 M Frontend/src/widgets/CatalogWidget.vue
 M Frontend/src/widgets/PerlinOpportunity.vue
 M Frontend/tests/auth-fullscreen.spec.ts
 M Frontend/tests/perlin.spec.ts
 M Frontend/vite.config.ts
?? .idea/
?? .npm-cache/
?? .worktrees/
?? Frontend/docs/auth-overflow-before.json
?? Frontend/docs/auth-overflow-kaspersky.json
?? Frontend/docs/auth-real/
?? Frontend/docs/branding/
?? Frontend/docs/http-foundation.md
?? Frontend/docs/integration-03-final-check.md
?? Frontend/playwright.api.config.ts
?? Frontend/public/
?? Frontend/src/entities/session.ts
?? Frontend/src/entities/vacancyCatalog.ts
?? Frontend/src/widgets/ApiConnection.vue
?? Frontend/src/widgets/ApiJobList.vue
?? Frontend/tests/api-mode.spec.ts
?? Frontend/tests/auth-mobile.spec.ts
?? Frontend/tests/auth-real.spec.ts
?? Frontend/tests/catalog-api.spec.ts
?? Frontend/tests/http-foundation.spec.ts
?? Frontend/tests/support/
?? Node-Back/docs/qa/LOCAL_MYSQL_READINESS.md
?? Node-Back/scripts/local-mysql-setup.mjs
?? Node-Back/scripts/local-readiness-smoke.mjs
?? Node-Back/scripts/start-local-mysql.ps1
?? starter-perlin-vue/
?? starter-web-assets-v2/
