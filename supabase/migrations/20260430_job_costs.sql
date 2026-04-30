-- 20260430 — Per-job cost tracking (labour + materials + additional charges).
-- Mirrors saveJobCosts() in modules/17-install-schedule.js.
-- One row per job with three JSONB lists. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.job_costs (
  job_id      text PRIMARY KEY,
  labour      jsonb DEFAULT '[]'::jsonb,
  materials   jsonb DEFAULT '[]'::jsonb,
  additional  jsonb DEFAULT '[]'::jsonb,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.job_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_costs_sel" ON public.job_costs FOR SELECT USING (true);
CREATE POLICY "job_costs_ins" ON public.job_costs FOR INSERT WITH CHECK (true);
CREATE POLICY "job_costs_upd" ON public.job_costs FOR UPDATE USING (true);
CREATE POLICY "job_costs_del" ON public.job_costs FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
