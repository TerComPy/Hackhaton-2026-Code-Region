import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
export const requireAuth: RequestHandler = async (req, res, next) => {
  const match = /^Bearer (.+)$/i.exec(req.header('authorization') ?? '');
  if (!match?.[1]) return next(new HttpError(401, 'Bearer token required', 'UNAUTHORIZED'));
  try {
    const { payload } = await jwtVerify(match[1], secret, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });
    if (typeof payload.sub !== 'string') throw new Error('Missing subject');
    res.locals.authUserId = payload.sub;
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token', 'UNAUTHORIZED'));
  }
};
