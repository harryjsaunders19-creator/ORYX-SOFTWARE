-- 011_soft_delete.sql
-- Adds soft-delete (archive) support to jobs, quotes, and clients,
-- plus a unified archive audit log table.
--
-- Idempotent: uses IF NOT EXISTS / DO NOTHING patterns throughout.
-- Safe to run on a database that already has data — all new columns
-- default to NULL (active), so every existing row stays visible.

-- ── Jobs ──────────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_archived_at ON jobs(archived_at);

-- ── Quotes ────────────────────────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_archived_at ON quotes(archived_at);

-- ── Clients ───────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS archived_by  TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_archived_at ON clients(archived_at);

-- ── Archive audit log ─────────────────────────────────────────────
-- Append-only; never deleted. Tracks who archived/restored each record.
CREATE TABLE IF NOT EXISTS archive_log (
  id               TEXT PRIMARY KEY,
  entity_type      TEXT        NOT NULL,  -- 'job' | 'quote' | 'client'
  entity_id        TEXT        NOT NULL,
  entity_label     TEXT        NOT NULL,
  action           TEXT        NOT NULL,  -- 'archive' | 'restore'
  performed_by     TEXT        NOT NULL,
  performed_by_name TEXT       NOT NULL,
  performed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason           TEXT
);

CREATE INDEX IF NOT EXISTS idx_archive_log_entity    ON archive_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_archive_log_performed ON archive_log(performed_at DESC);

-- Enable Row Level Security — service role only (app uses service role server-side)
ALTER TABLE archive_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archive_log_open ON archive_log;
DROP POLICY IF EXISTS "Service role full access on archive_log" ON archive_log;
CREATE POLICY "Service role full access on archive_log"
  ON archive_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);
