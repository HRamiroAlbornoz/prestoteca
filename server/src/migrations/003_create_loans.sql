-- 003_create_loans.sql
-- Creates the loans table with FKs to tools and users, and indexes for queries.

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES tools(id),
  borrower_id UUID NOT NULL REFERENCES users(id),
  owner_id UUID NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loans_tool ON loans (tool_id);
CREATE INDEX IF NOT EXISTS idx_loans_borrower ON loans (borrower_id);
CREATE INDEX IF NOT EXISTS idx_loans_owner ON loans (owner_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans (status);
CREATE INDEX IF NOT EXISTS idx_loans_dates ON loans (end_date);
