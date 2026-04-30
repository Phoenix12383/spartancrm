-- 20260430 — Per-job install-day stage tracking.
-- Mirrors setInstallProgress() in modules/17-install-schedule.js.
-- One row per job: { arrived_at, frame_stages: [stageIdx, ...] }.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.install_progress (
  job_id        text PRIMARY KEY,
  arrived_at    timestamptz,
  frame_stages  jsonb DEFAULT '[]'::jsonb,
  updated_at    timestamptz DEFAULT now()
);

-- RLS on with the 4-policy convention (matches jobs/deals/contacts/leads).
ALTER TABLE public.install_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "install_progress_sel" ON public.install_progress FOR SELECT USING (true);
CREATE POLICY "install_progress_ins" ON public.install_progress FOR INSERT WITH CHECK (true);
CREATE POLICY "install_progress_upd" ON public.install_progress FOR UPDATE USING (true);
CREATE POLICY "install_progress_del" ON public.install_progress FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
