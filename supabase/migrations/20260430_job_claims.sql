-- 20260430 — Per-job progress payment claims.
-- Mirrors saveJobClaims() in modules/17-install-schedule.js. One row per job
-- with the full claim list as JSONB. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.job_claims (
  job_id      text PRIMARY KEY,
  claims      jsonb DEFAULT '[]'::jsonb,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.job_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "job_claims_sel" ON public.job_claims FOR SELECT USING (true);
CREATE POLICY "job_claims_ins" ON public.job_claims FOR INSERT WITH CHECK (true);
CREATE POLICY "job_claims_upd" ON public.job_claims FOR UPDATE USING (true);
CREATE POLICY "job_claims_del" ON public.job_claims FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
