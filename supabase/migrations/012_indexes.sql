-- 012_indexes.sql
-- Performance indexes for common query patterns.
-- Idempotent: all use CREATE INDEX IF NOT EXISTS.
-- Run this in the Supabase SQL editor after 011_soft_delete.sql.

-- ── Jobs ──────────────────────────────────────────────────────────
-- Active job list (most common query — status + not archived)
CREATE INDEX IF NOT EXISTS idx_jobs_status_archived
  ON jobs(status, archived_at);

-- Client job history
CREATE INDEX IF NOT EXISTS idx_jobs_client_id
  ON jobs(client_id);

-- Deadline / overdue views
CREATE INDEX IF NOT EXISTS idx_jobs_required_by_date
  ON jobs(required_by_date)
  WHERE required_by_date IS NOT NULL;

-- Drawing number lookup / sort
CREATE INDEX IF NOT EXISTS idx_jobs_drawing_number
  ON jobs(drawing_number);

-- Revision chains (parent → children)
CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id
  ON jobs(parent_job_id)
  WHERE parent_job_id IS NOT NULL;

-- Item type filter (Design / CATIII / etc.)
CREATE INDEX IF NOT EXISTS idx_jobs_item_type
  ON jobs(item_type);

-- Designer assignment filter
CREATE INDEX IF NOT EXISTS idx_jobs_designer
  ON jobs(designer)
  WHERE designer IS NOT NULL AND designer <> '';

-- Billing queue
CREATE INDEX IF NOT EXISTS idx_jobs_billing_status
  ON jobs(billing_status)
  WHERE billing_status IS NOT NULL;

-- Recency sort
CREATE INDEX IF NOT EXISTS idx_jobs_created_at
  ON jobs(created_at DESC);

-- ── Quotes ────────────────────────────────────────────────────────
-- Active quote list
CREATE INDEX IF NOT EXISTS idx_quotes_status_archived
  ON quotes(status, archived_at);

-- Client quote history
CREATE INDEX IF NOT EXISTS idx_quotes_client_id
  ON quotes(client_id)
  WHERE client_id IS NOT NULL;

-- Expiry checking (auto-expire cron)
CREATE INDEX IF NOT EXISTS idx_quotes_expiry_date
  ON quotes(expiry_date)
  WHERE expiry_date IS NOT NULL;

-- Quote linked to job
CREATE INDEX IF NOT EXISTS idx_quotes_job_id
  ON quotes(job_id)
  WHERE job_id IS NOT NULL;

-- Recency sort
CREATE INDEX IF NOT EXISTS idx_quotes_created_at
  ON quotes(created_at DESC);

-- ── Clients ───────────────────────────────────────────────────────
-- Active client list
CREATE INDEX IF NOT EXISTS idx_clients_active
  ON clients(active);

-- Name search
CREATE INDEX IF NOT EXISTS idx_clients_name_lower
  ON clients(name_lower);

-- ── Status history ────────────────────────────────────────────────
-- Job history lookup (already created by 004 but included for safety)
CREATE INDEX IF NOT EXISTS idx_status_history_job_id
  ON status_history(job_id);

-- Recency sort on history
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at
  ON status_history(changed_at DESC);

-- ── Archive log ───────────────────────────────────────────────────
-- (indexes already created in 011_soft_delete.sql — included here for reference only)
-- idx_archive_log_entity    ON archive_log(entity_type, entity_id)
-- idx_archive_log_performed ON archive_log(performed_at DESC)
