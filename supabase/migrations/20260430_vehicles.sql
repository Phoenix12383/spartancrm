-- 20260430 — Vehicles table for Jobs CRM fleet management.
-- Mirrors saveVehicles() in modules/17-install-schedule.js and the form in
-- modules/20-job-settings.js. Run via Supabase Dashboard → SQL Editor.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.vehicles (
  id                 text PRIMARY KEY,
  name               text NOT NULL,
  rego               text,
  type               text DEFAULT 'van',     -- van | ute | truck | trailer
  size               text DEFAULT 'medium',  -- small | medium | large | xl
  max_frames         integer DEFAULT 8,
  max_weight_kg      integer DEFAULT 600,
  internal_length_mm integer DEFAULT 0,
  internal_width_mm  integer DEFAULT 0,
  internal_height_mm integer DEFAULT 0,
  assigned_to        text,                   -- installer.id (FK soft — NULL = pool)
  notes              text,
  active             boolean DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_active   ON public.vehicles (active);
CREATE INDEX IF NOT EXISTS idx_vehicles_assigned ON public.vehicles (assigned_to);

-- Match the existing schema convention (jobs/deals/contacts/leads):
-- RLS on, with 4 named per-cmd policies (sel/ins/upd/del). Spartan CRM
-- auth is app-side, so the policies are intentionally wide — but RLS
-- being enabled keeps the table "Secured" in the dashboard.
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_sel" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "vehicles_ins" ON public.vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "vehicles_upd" ON public.vehicles FOR UPDATE USING (true);
CREATE POLICY "vehicles_del" ON public.vehicles FOR DELETE USING (true);

-- Force PostgREST to see the new table immediately.
NOTIFY pgrst, 'reload schema';
