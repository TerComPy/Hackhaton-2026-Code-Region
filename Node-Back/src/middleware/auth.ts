import type { RequestHandler } from 'express';
import { jwtVerify } from 'jose';
import type { RowDataPacket } from 'mysql2';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
export const requireAuth: RequestHandler = async (req, res, next) => {
  const match = /^Bearer (.+)$/i.exec(req.header('authorization') ?? '');
  if (!match?.[1]) return next(new HttpError(401, 'Bearer token required', 'UNAUTHORIZED'));
  let subject: string;
  let version: number;
  try {
    const { payload } = await jwtVerify(match[1], secret, {
      algorithms: ['HS256'],
      requiredClaims: ['sub', 'iss', 'aud', 'exp'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE
    });
    if (typeof payload.sub !== 'string') throw new Error('Missing subject');
    if (!Number.isInteger(payload.token_version) || Number(payload.token_version) < 0) throw new Error('Missing version');
    subject = payload.sub;
    version = payload.token_version as number;
  } catch {
    return next(new HttpError(401, 'Invalid or expired token', 'UNAUTHORIZED'));
  }
  const [rows] = await db.execute<(RowDataPacket & { role: string; token_version: number })[]>(
    "SELECT role, token_version FROM users WHERE id = ? AND status = 'active'", [subject]);
  const account = rows[0];
  if (!account || account.token_version !== version)
    return next(new HttpError(401, 'Account or token unavailable', 'UNAUTHORIZED'));
  res.locals.authUserId = subject;
  res.locals.role = account.role;
  next();
};
