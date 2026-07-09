-- Restrict archive_log to service_role only (replaces permissive archive_log_open policy).

ALTER TABLE archive_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS archive_log_open ON archive_log;
DROP POLICY IF EXISTS "Service role full access on archive_log" ON archive_log;

CREATE POLICY "Service role full access on archive_log"
  ON archive_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);
