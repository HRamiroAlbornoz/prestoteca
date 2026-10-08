-- 002_create_tools.sql
-- Creates the tools table with FK to users and indexes for filtering.

CREATE TABLE IF NOT EXISTS tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  condition VARCHAR(10) NOT NULL,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tools_owner ON tools (owner_id);
CREATE INDEX IF NOT EXISTS idx_tools_category ON tools (category);
CREATE INDEX IF NOT EXISTS idx_tools_neighborhood ON tools (neighborhood);
CREATE INDEX IF NOT EXISTS idx_tools_deleted ON tools (deleted_at) WHERE deleted_at IS NULL;
