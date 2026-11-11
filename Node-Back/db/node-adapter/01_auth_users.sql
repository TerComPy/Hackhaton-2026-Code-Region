-- Backend-owned Node.js auth table; does not modify the business schema.
-- Run AFTER the upstream 01_schema.sql, before linking profile FK.
USE vacancy_aggregator;
CREATE TABLE auth_users (
  id VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  normalized_email VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_auth_users_normalized_email (normalized_email)
) ENGINE=InnoDB;
