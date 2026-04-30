-- 20260430 — Add efficiency_pct column to installers.
-- Replaces the local-only spartan_installer_eff localStorage map.
-- Idempotent: safe to re-run.

ALTER TABLE public.installers
  ADD COLUMN IF NOT EXISTS efficiency_pct integer DEFAULT 100;

NOTIFY pgrst, 'reload schema';
