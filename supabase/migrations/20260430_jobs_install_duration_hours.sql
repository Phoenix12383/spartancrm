-- 20260430 — Add install_duration_hours column to jobs.
-- Backs the manual install-duration override exposed via:
--   • the Gantt bar resize handle (Installation Schedule)
--   • the "Install duration" inputs on the job detail page
-- Both have been writing to this column for a while; without it Supabase
-- silently drops the update and other browsers never see the change.
-- Idempotent: safe to re-run.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS install_duration_hours numeric;

NOTIFY pgrst, 'reload schema';
