# СТАРТЕР — независимые тесты и GitHub Actions

## Состав CI

`.github/workflows/ci.yml` запускается при **каждом push**, при **pull request** и вручную.

- `node-quality`: npm ci, typecheck, build, unit-тесты импортёра.
- `mysql-api`: изолированная MySQL 8.4.13, каноническая схема 4ce04c4, текущие проверки backend и импортёра, затем независимые black-box API-тесты Python (`pytest + httpx`).
- `frontend-e2e`: Playwright Chromium проверяет текущий **демонстрационный** frontend: загрузка, JavaScript, навигация, переключение темы и мобильный экран. Это **ещё не** пользовательский E2E с реальным API.

Все тесты детерминированы: внешние Trudvsem/LLM не вызываются, используется фикстура и mock. При ошибке отдельного job GitHub Actions показывает красный результат. JUnit XML отчёты доступны через Artifacts.

## Локальный запуск Node

```bash
cd Node-Back
npm ci
npm run typecheck
npm run build
npm run test:import
```

Для MySQL-интеграционных проверок используйте **только выделенный тестовый экземпляр**. Тесты создают и меняют отдельные базы и учетные записи, некоторые существующие JS-харнессы временно меняют глобальный часовой пояс сервера.

Создайте выделенную MySQL 8.4.13 на порту 33316 и клонируйте канонический SQL репозиторий на коммите `4ce04c4870c43a65fe1f0265f0c75d3f4265c603`. Задайте:

```bash
export CANONICAL_DB_DIR=/path/to/canonical-db
export RUN_ISOLATED_MYSQL_TESTS=yes
export TEST_MYSQL_HOST=127.0.0.1
export TEST_MYSQL_PORT=33316
export TEST_MYSQL_USER=root
export TEST_MYSQL_PASSWORD=your_test_only_password
```

После сборки из `Node-Back/`:

```bash
npm run test:integration
npm run test:import:integration
```

Для отдельных Python-тестов из корня репозитория:

```bash
python -m pip install -r QA/requirements-api.txt
python -m pytest -q QA/api
```

При успешном завершении Python QA собственная временная БД и пользователь удаляются; если аварийно завершить процесс, база может остаться. Ни один скрипт не должен запускаться на рабочем MySQL-сервере.

Браузерные тесты из корня:

```bash
python -m pip install -r QA/requirements-e2e.txt
python -m playwright install chromium
python -m pytest -q QA/e2e
```

## Настройка защиты main

После первого успешного CI в GitHub включите защиту ветки `main` и отметьте три обязательных статуса: `Node typecheck, build and importer unit tests`, `MySQL 8.4, importer and independent API tests`, `Frontend browser smoke tests (demo UI)`.

CI **сам по себе не блокирует merge** — требование статусов включается в Settings → Branches / Rulesets, если разрешают права репозитория.

## Границы покрытия

- Нет запросов к live Trudvsem в обязательном CI: нестабильная сеть не должна ломать каждый push.
- Нет вызовов платного OpenAI-совместимого API; ИИ тестируется с mock.
- Не проверены поведение настоящего frontend с Express и мобильный .NET MAUI-клиент.
- Не добавлены пока нагрузочные и DAST проверки.
- Новые AI endpoints и рекомендации добавлять в отдельные Python и Playwright suites по мере появления.
