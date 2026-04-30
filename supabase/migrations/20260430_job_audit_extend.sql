-- 20260430 — Extend public.job_audit with old/new value columns.
-- Existing table already has id / job_id / action / detail / by_user / created_at.
-- This migration just adds the two missing fields the JS logJobAudit() captures.
-- Idempotent: safe to re-run.

ALTER TABLE public.job_audit ADD COLUMN IF NOT EXISTS old_value text;
ALTER TABLE public.job_audit ADD COLUMN IF NOT EXISTS new_value text;

-- Helpful index for the per-job audit timeline render.
CREATE INDEX IF NOT EXISTS idx_job_audit_job_created
  ON public.job_audit (job_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
