import { test, expect, type Page, type Route } from '@playwright/test';

test.beforeEach(() => {
  test.skip(!test.info().config.configFile?.endsWith('playwright.match.config.ts'),
    'Personal matching UI tests need the API-mode Vite server');
});
const input = 'Я люблю заниматься программированием, создавать сайты и объяснять сложные вещи людям.';
const user = { id: 'fixture-match-user', profileId: '9007199254740993', email: 'person@example.invalid',
  displayName: 'Person', role: 'user' };
const token = 'e30.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.fixture';
const realVacancy = {
  id: '9007199254740993123', title: 'Веб-разработчик', company_name: 'Настоящая компания',
  city: 'Москва', work_format: 'remote', salary_min: '75000.00', salary_max: null,
  currency: 'RUB', salary_period: 'month', salary_gross: null, status: 'active',
  source_name: 'Работа России', original_url: 'https://example.com/real-vacancy'
};
const directions = [
  { name: 'Веб-разработка', what: 'Создавать интернет-приложения.', why: 'Интерес к сайтам помогает попробовать профессию.', evidence: ['создавать сайты'], vacancies: [realVacancy] },
  { name: 'Обучение', what: 'Объяснять новые темы людям.', why: 'Любовь к объяснениям может быть полезна.', evidence: ['объяснять сложные вещи'], vacancies: [] },
  { name: 'Программирование', what: 'Решать задачи с помощью кода.', why: 'Любовь к программированию даёт направление.', evidence: ['программированием'], vacancies: [] }
];
type Handler = (route: Route, calls: { posts: number }) => Promise<void> | void;
async function setup(page: Page, handler: Handler, authenticated = true) {
  const calls = { posts: 0 };
  if (authenticated) await page.addInitScript(v => sessionStorage.setItem('starter.api.accessToken', v), token);
  await page.route('**/api/**', route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/health') return route.fulfill({ json: { status: 'ok' } });
    if (path === '/api/ready') return route.fulfill({ json: { status: 'ready', database: 'ok' } });
    if (path === '/api/auth/me') return route.fulfill({ json: { user } });
    if (path === '/api/profile') return route.fulfill({ json: { profile: { id: user.profileId, displayName: user.displayName, city: '' } } });
    if (path === '/api/favorites') return route.fulfill({ json: { items: [], page: 1, pageSize: 20 } });
    if (path === '/api/vacancies') return route.fulfill({ json: { items: [], page: 1, pageSize: 6 } });
    if (path === '/api/match') {
      calls.posts++;
      expect(req.method()).toBe('POST');
      expect(req.headers().authorization).toBe('Bearer ' + token);
      expect(req.postDataJSON().about).toContain('создавать сайты');
      return handler(route, calls);
    }
    return route.fulfill({ status: 404, json: { error: { code: 'FIXTURE_NOT_FOUND' } } });
  });
  await page.goto('/#/match');
  if (authenticated) await expect(page.locator('.match__form button[type=submit]')).toBeEnabled();
  return calls;
}

test('real matching shows three AI directions, literal evidence, API vacancies, and no fake jobs', async ({ page }) => {
  const calls = await setup(page, route => route.fulfill({ json: { directions } }));
  await page.locator('#about').fill(input);
  await page.getByRole('button', { name: 'Подобрать профессии' }).click();
  await expect(page.locator('.direction')).toHaveCount(3);
  await expect(page.locator('.direction').first()).toContainText('создавать сайты');
  await expect(page.locator('.direction').first()).toContainText('Настоящая компания');
  await expect(page.locator('.direction [data-vacancy-id="9007199254740993123"]')).toHaveCount(1);
  await expect(page.locator('.direction .match__no-jobs')).toHaveCount(2);
  await expect(page.locator('.match__result')).not.toContainText('Кофейня «Зерно»');
  expect(calls.posts).toBe(1);
});
test('model unavailable shows retryable error without demo fallback', async ({ page }) => {
  const calls = await setup(page, route => route.fulfill({ status: 503, json: {
    error: { code: 'MATCH_AI_UNAVAILABLE', message: 'AI not configured' }
  } }));
  await page.locator('#about').fill(input);
  await page.getByRole('button', { name: 'Подобрать профессии' }).click();
  await expect(page.locator('.match__form [role=alert]')).toContainText('не удалось получить');
  await expect(page.locator('.direction')).toHaveCount(0);
  expect(calls.posts).toBe(1);
});
test('guest cannot submit a private story and legacy preview redirects', async ({ page }) => {
  const calls = await setup(page, route => route.fulfill({ json: { directions } }), false);
  await expect(page.locator('.match__form button[type=submit]')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Войти в аккаунт' })).toBeVisible();
  expect(calls.posts).toBe(0);
  await page.goto('/#/api-preview');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.locator('[data-view=home]')).toBeVisible();
});
test('changing account discards private story and AI recommendations', async ({ page }) => {
  await setup(page, route => route.fulfill({ json: { directions } }));
  await page.locator('#about').fill(input);
  await page.getByRole('button', { name: 'Подобрать профессии' }).click();
  await expect(page.locator('.direction')).toHaveCount(3);
  await page.evaluate(async () => {
    const { useSession } = await import('/src/entities/session.ts');
    useSession().clear();
  });
  await expect(page.locator('.direction')).toHaveCount(0);
  await expect(page.locator('#about')).toHaveValue('');
  await expect(page.locator('.match__form button[type=submit]')).toBeDisabled();
});
test('successful backend connection renders no banner or error dialog', async ({ page }) => {
  await setup(page, route => route.fulfill({ json: { directions } }));
  await expect(page.getByRole('region', { name: 'Подключение к API' })).toHaveCount(0);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
