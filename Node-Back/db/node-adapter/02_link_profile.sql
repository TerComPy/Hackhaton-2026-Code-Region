-- Initial setup only: run AFTER both 01_schema.sql and 01_auth_users.sql.
-- This substitutes the old ASP.NET Identity FK link. Never run identity/02_link_profile.sql.
USE vacancy_aggregator;
ALTER TABLE user_profiles
  ADD CONSTRAINT fk_user_profiles_auth
  FOREIGN KEY (auth_subject) REFERENCES auth_users(id) ON DELETE RESTRICT;
