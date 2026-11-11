import type { RowDataPacket } from 'mysql2';
import { db } from '../config/db.js';
import { HttpError } from './errors.js';

export interface ProfileRow extends RowDataPacket {
  id: string;
  auth_subject: string;
  display_name: string;
  city: string | null;
}
export async function getProfile(authSubject: string): Promise<ProfileRow> {
  const [rows] = await db.execute<ProfileRow[]>(
    'SELECT id, auth_subject, display_name, city FROM user_profiles WHERE auth_subject = ? LIMIT 1',
    [authSubject]
  );
  const profile = rows[0];
  if (!profile) throw new HttpError(401, 'Profile unavailable', 'UNAUTHORIZED');
  return profile;
}
