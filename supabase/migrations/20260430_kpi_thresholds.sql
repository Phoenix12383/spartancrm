-- 20260430 — Admin-tuned KPI alert thresholds (manual §4.10).
-- Single-row table (id='singleton') matching the phone_settings pattern.
-- Mirrors saveKpiThresholds() in modules/03-jobs-workflow.js.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.kpi_thresholds (
  id          text PRIMARY KEY DEFAULT 'singleton',
  thresholds  jsonb DEFAULT '{}'::jsonb,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.kpi_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_thresholds_sel" ON public.kpi_thresholds FOR SELECT USING (true);
CREATE POLICY "kpi_thresholds_ins" ON public.kpi_thresholds FOR INSERT WITH CHECK (true);
CREATE POLICY "kpi_thresholds_upd" ON public.kpi_thresholds FOR UPDATE USING (true);
CREATE POLICY "kpi_thresholds_del" ON public.kpi_thresholds FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
