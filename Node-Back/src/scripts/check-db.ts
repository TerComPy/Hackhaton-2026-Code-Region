import { db } from '../config/db.js';
try {
  const [rows] = await db.query('SELECT VERSION() AS version');
  console.log(rows);
} finally {
  await db.end();
}
