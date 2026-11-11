import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import argon2 from 'argon2';
import { SignJWT } from 'jose';
import type { RowDataPacket } from 'mysql2';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';
import { requireAuth } from '../middleware/auth.js';

interface AccountRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  role: 'user' | 'admin';
  display_name: string;
  profile_id: string;
}
const credentials = z.object({
  email: z.string().trim().pipe(z.email().max(255)).transform(v => v.toLowerCase()),
  password: z.string().min(8).max(128)
});
const registerSchema = credentials.extend({ displayName: z.string().trim().min(1).max(150) }).strict();
const secret = new TextEncoder().encode(env.JWT_SECRET);
async function tokenFor(id: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}
function publicAccount(account: AccountRow) {
  return { id: account.id, profileId: account.profile_id, email: account.email,
    displayName: account.display_name, role: account.role };
}
export const authRouter = Router();
authRouter.post('/register', async (req, res) => {
  const input = registerSchema.parse(req.body);
  const id = randomUUID();
  const hash = await argon2.hash(input.password, { type: argon2.argon2id });
  const connection = await db.getConnection();
  let profileId = '';
  try {
    await connection.beginTransaction();
    await connection.execute(
      'INSERT INTO auth_users (id, email, normalized_email, password_hash) VALUES (?, ?, ?, ?)',
      [id, input.email, input.email, hash]
    );
    await connection.execute('INSERT INTO user_profiles (auth_subject, display_name) VALUES (?, ?)',
      [id, input.displayName]);
    const [rows] = await connection.execute<(RowDataPacket & { id: string })[]>(
      'SELECT id FROM user_profiles WHERE auth_subject = ?', [id]);
    if (!rows[0]) throw new Error('Profile was not inserted');
    profileId = String(rows[0].id);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ER_DUP_ENTRY')
      throw new HttpError(409, 'Email already registered', 'EMAIL_EXISTS');
    throw err;
  } finally {
    connection.release();
  }
  res.status(201).json({
    user: { id, profileId, email: input.email, displayName: input.displayName, role: 'user' },
    accessToken: await tokenFor(id), tokenType: 'Bearer', expiresIn: 3600
  });
});
authRouter.post('/login', async (req, res) => {
  const input = credentials.parse(req.body);
  const [rows] = await db.execute<AccountRow[]>(
    `SELECT a.id, a.email, a.password_hash, a.role,
      p.id AS profile_id, p.display_name
     FROM auth_users a JOIN user_profiles p ON p.auth_subject = a.id
     WHERE a.normalized_email = ? LIMIT 1`, [input.email]);
  const account = rows[0];
  if (!account || !(await argon2.verify(account.password_hash, input.password)))
    throw new HttpError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  res.json({ user: publicAccount(account), accessToken: await tokenFor(account.id),
    tokenType: 'Bearer', expiresIn: 3600 });
});
authRouter.get('/me', requireAuth, async (_req, res) => {
  const [rows] = await db.execute<AccountRow[]>(
    `SELECT a.id, a.email, a.password_hash, a.role,
      p.id AS profile_id, p.display_name
     FROM auth_users a JOIN user_profiles p ON p.auth_subject = a.id
     WHERE a.id = ? LIMIT 1`, [res.locals.authUserId]);
  if (!rows[0]) throw new HttpError(401, 'Account unavailable', 'UNAUTHORIZED');
  res.json({ user: publicAccount(rows[0]) });
});
