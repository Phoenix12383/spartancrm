-- 20260430 — Add tools_required column to jobs.
-- Replaces the local-only spartan_job_tools localStorage map.
-- Idempotent: safe to re-run.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS tools_required jsonb DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
