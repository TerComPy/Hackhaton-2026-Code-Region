import mysql from 'mysql2';
import { env } from './env.js';

const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 5000,
  supportBigNumbers: true,
  bigNumberStrings: true,
  namedPlaceholders: true,
  dateStrings: true,
  decimalNumbers: false,
  multipleStatements: false,
  timezone: 'Z'
});

// Queue session initialization before the first statement on every new connection.
pool.on('connection', connection => {
  connection.query("SET time_zone = '+00:00'", err => {
    if (err) connection.destroy();
  });
});

export const db = pool.promise();
