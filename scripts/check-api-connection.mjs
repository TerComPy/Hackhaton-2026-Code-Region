#!/usr/bin/env node
// Local developer smoke test: verifies Express, Vite->Express proxy, MySQL, and JWT guard.
// No credentials or mutable requests. Run after both development servers have started.
const backend = process.env.STARTER_BACKEND_URL || 'http://127.0.0.1:3000';
const frontend = process.env.STARTER_FRONTEND_URL || 'http://127.0.0.1:5173';
let failed = false;
async function check(label, url, expected, checkBody) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000)
    });
    const raw = await response.text();
    let body;
    try { body = JSON.parse(raw); } catch { body = {}; }
    const ok = response.status === expected && checkBody(body, response);
    process.stdout.write((ok ? '[PASS] ' : '[FAIL] ') + label +
      ': HTTP ' + response.status + '\n');
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    process.stderr.write('[FAIL] ' + label + ': ' +
      (error instanceof Error ? error.name : 'Connection error') + '\n');
  }
}
await check('Express health', backend + '/api/health', 200, v => v.status === 'ok');
await check('Express /ready (real MySQL)', backend + '/api/ready', 200,
  v => v.status === 'ready' && v.database === 'ok');
await check('Vite proxy health', frontend + '/api/health', 200, v => v.status === 'ok');
await check('Vite proxy /ready', frontend + '/api/ready', 200,
  v => v.status === 'ready' && v.database === 'ok');
await check('JWT guard /api/profile via Vite', frontend + '/api/profile', 401,
  (v, r) => r.headers.get('content-type')?.includes('application/json') && !!v.error);
if (failed) {
  process.stderr.write('Backend connection is not ready: check Node-Back/.env and Vite proxy.\n');
  process.exitCode = 1;
} else {
  process.stdout.write('API mode connectivity is healthy. Login before requesting personal data.\n');
}
