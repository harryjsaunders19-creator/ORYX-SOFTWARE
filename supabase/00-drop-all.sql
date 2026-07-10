-- =============================================================================
-- ORYX Supabase — Step 0: Clean slate (drop all app tables)
-- =============================================================================
-- Run this in Supabase → SQL Editor when you want to wipe the ORYX schema
-- and start fresh. This deletes ALL data in these tables.
--
-- Next: run supabase/01-bootstrap.sql (recreates schema + default logins).
--
-- Safe to delete every other saved query in SQL Editor — you only need:
--   1. 00-drop-all.sql
--   2. 01-bootstrap.sql
-- =============================================================================

drop table if exists public.site_visit_calculations cascade;
drop table if exists public.app_sequences cascade;
drop table if exists public.leave_calendar_links cascade;
drop table if exists public.leave_requests cascade;
drop table if exists public.password_vault_entries cascade;
drop table if exists public.employee_activity cascade;
drop table if exists public.employee_notes cascade;
drop table if exists public.employee_documents cascade;
drop table if exists public.employee_skills cascade;
drop table if exists public.employee_profiles cascade;
drop table if exists public.backup_audit_logs cascade;
drop table if exists public.backup_jobs cascade;
drop table if exists public.identity_switch_logs cascade;
drop table if exists public.billing_export_snapshots cascade;
drop table if exists public.billing_handoffs cascade;
drop table if exists public.billing_export_batches cascade;
drop table if exists public.calendar_assignments cascade;
drop table if exists public.calendar_events cascade;
drop table if exists public.event_categories cascade;
drop table if exists public.status_history cascade;
drop table if exists public.quote_line_items cascade;
drop table if exists public.quotes cascade;
drop table if exists public.client_contacts cascade;
drop table if exists public.client_holds cascade;
drop table if exists public.archive_log cascade;
drop table if exists public.jobs cascade;
drop table if exists public.clients cascade;
drop table if exists public.app_users cascade;

drop function if exists public.set_updated_at() cascade;

notify pgrst, 'reload schema';
