import { app } from './app.js';
import { db } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info({ host: env.HOST, port: env.PORT }, 'STARTER API listening');
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => {
    logger.error('Shutdown deadline exceeded');
    process.exit(1);
  }, 10000);
  deadline.unref();
  server.close(async () => {
    try {
      await db.end();
      clearTimeout(deadline);
      process.exitCode = 0;
    } catch (err) {
      logger.error({ err }, 'Database shutdown failed');
      process.exitCode = 1;
    }
  });
}
server.on('error', async (err) => {
  logger.error({ err }, 'HTTP server failed');
  await db.end();
  process.exitCode = 1;
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
