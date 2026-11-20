-- 005_create_sessions.sql
-- One row per open session (spec server-sessions, decision D14). The browser keeps a random 32-byte value in the
-- `token` cookie; this table keeps only its SHA-256 (64 hex characters), so a copy of the table cannot open a session.
-- Revoking a session deletes its row. No device, IP or location data is stored.
-- No ON DELETE CASCADE: users are anonymized, never deleted (decision D4); deleting an account deletes its sessions
-- explicitly. Times are set by the app clock, never by the database.
-- Additive: code that does not know the table keeps working. Safe to run twice.
-- Requires 001_create_users.sql.

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash CHAR(64) NOT NULL UNIQUE,
  remember BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Down (manual rollback, only if ever needed):
-- DROP TABLE IF EXISTS sessions;
