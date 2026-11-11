import pino from 'pino';

export const logger = pino({ redact: ['password', 'password_hash', 'accessToken', 'authorization', 'req.headers.authorization', 'req.headers.cookie'] });
