-- 004_add_users_deleted_at.sql
-- Marks an account as deleted. Deleting an account anonymizes its row instead of removing it,
-- so the loan history of the other users stays intact (decision D4).
-- Additive and nullable: code that does not know the column keeps working.
-- Requires 001_create_users.sql.

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Down (manual rollback, only if ever needed):
-- ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;
