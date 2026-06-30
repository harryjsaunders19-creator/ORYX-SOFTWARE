-- =============================================================================
-- Oryx Design — Supabase migration 016: annual leave calendar category
-- Required for leave ↔ calendar sync (categoryId cat_annual_leave)
-- =============================================================================

insert into public.event_categories (id, name, color, icon) values
  ('cat_annual_leave', 'Leave', '#6B7280', 'calendar-off')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
