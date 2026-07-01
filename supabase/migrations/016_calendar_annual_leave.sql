-- =============================================================================
-- Oryx Design — Supabase migration 016: annual leave calendar category
-- Required for leave ↔ calendar sync (categoryId cat_annual_leave)
-- Note: cat_leave ('Leave') is seeded in 007_calendar.sql — distinct name required.
-- =============================================================================

insert into public.event_categories (id, name, color, icon) values
  ('cat_annual_leave', 'Annual Leave', '#15803D', 'calendar-off')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
