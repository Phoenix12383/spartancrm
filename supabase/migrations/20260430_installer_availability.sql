-- 20260430 — Installer availability exceptions (leave / half-days).
-- Mirrors saveAvailability() in modules/17-install-schedule.js and the modal
-- in modules/20-job-settings.js. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.installer_availability (
  id           text PRIMARY KEY,
  installer_id text NOT NULL,
  date         date NOT NULL,
  type         text NOT NULL DEFAULT 'unavailable',  -- unavailable | leave | half_day_am | half_day_pm
  reason       text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_avail_installer ON public.installer_availability (installer_id);
CREATE INDEX IF NOT EXISTS idx_avail_date      ON public.installer_availability (date);

-- RLS on with the 4-policy convention (matches jobs/deals/contacts/leads).
ALTER TABLE public.installer_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "installer_availability_sel" ON public.installer_availability FOR SELECT USING (true);
CREATE POLICY "installer_availability_ins" ON public.installer_availability FOR INSERT WITH CHECK (true);
CREATE POLICY "installer_availability_upd" ON public.installer_availability FOR UPDATE USING (true);
CREATE POLICY "installer_availability_del" ON public.installer_availability FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
