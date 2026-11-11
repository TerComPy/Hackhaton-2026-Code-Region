# Backend changelog for Python QA

## 0.2.0 — адаптация под обновлённую командную БД (proposal)
- Источник: `manhattanattack/hackaton-sql-scheme@efe6b9d` (2026-11-11).
- Убрана пробная `users(id BIGINT)`; Node auth использует `auth_users(id UUID string)`.
- Регистрация создаёт профиль `user_profiles` в одной транзакции.
- `/api/auth/me` возвращает внешний UUID + числовой profileId.
- Добавлены `/api/profile` GET/PATCH, `/api/vacancies` GET / GET :id,
  `/api/favorites` GET/PUT/DELETE, `/api/vacancies/:id/outbound-click` POST.
- Каталог поддерживает новые workFormat/scheduleType/contractType.
- Новый контракт требует Python QA регрессию всех маршрутов.
- НЕ реализованы загрузчик источников, ИИ-подбор/история запросов и refresh-токены.
- Пока не согласовано с DB engineer: auth_users вместо upstream AspNetUsers.
