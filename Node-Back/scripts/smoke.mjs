import assert from 'node:assert/strict';
import { once } from 'node:events';
Object.assign(process.env, {
  NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost', MYSQL_HOST: '127.0.0.1',
  MYSQL_PORT: '1', MYSQL_USER: 'smoke', MYSQL_PASSWORD: '', MYSQL_DATABASE: 'unused',
  JWT_SECRET: 'local-smoke-secret-with-at-least-32-characters'
});
const { app } = await import('../dist/app.js');
const { db } = await import('../dist/config/db.js');
const { SignJWT } = await import('jose');
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}/api`;
let checks = 0;
async function check(path, options, status, code) {
  const response = await fetch(base + path, options);
  assert.equal(response.status, status, path);
  const body = await response.json();
  if (code) assert.equal(body.error.code, code);
  checks++;
}
try {
  await check('/health', {}, 200);
  for (const path of ['/auth/me', '/profile', '/vacancies', '/vacancies/1', '/favorites'])
    await check(path, {}, 401, 'UNAUTHORIZED');
  await check('/vacancies', { headers: { authorization: 'Bearer invalid' } }, 401, 'UNAUTHORIZED');
  const legacy = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' })
    .setSubject('test').setIssuer('starter-api').setAudience('starter-client')
    .setExpirationTime('1h').sign(new TextEncoder().encode(process.env.JWT_SECRET));
  await check('/vacancies', { headers: { authorization: `Bearer ${legacy}` } }, 401, 'UNAUTHORIZED');
  await check('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'a@example.com', password: 'password123', displayName: 'A', role: 'admin' }) },
    400, 'VALIDATION_ERROR');
  await check('/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' },
    400, 'INVALID_JSON');
  await check('/ready', {}, 503);
  console.log(`Passed ${checks} HTTP smoke checks (without MySQL)`);
} finally {
  await new Promise(resolve => server.close(resolve));
  await db.end();
}
