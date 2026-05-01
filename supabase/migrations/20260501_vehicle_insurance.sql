-- 20260501 — Vehicle insurance: PDF upload + extracted policy data.
-- Adds insurance columns to public.vehicles and creates the
-- vehicle-insurance storage bucket with the same wide-RLS convention
-- the rest of the app uses (auth is app-side).
-- Run via Supabase Dashboard → SQL Editor. Idempotent.

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS insurance_pdf_url        text,
  ADD COLUMN IF NOT EXISTS insurance_pdf_path       text,
  ADD COLUMN IF NOT EXISTS insurance_insurer        text,
  ADD COLUMN IF NOT EXISTS insurance_policy_no      text,
  ADD COLUMN IF NOT EXISTS insurance_start_date     date,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date    date,
  ADD COLUMN IF NOT EXISTS insurance_uploaded_at    timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_extracted_text text;

CREATE INDEX IF NOT EXISTS idx_vehicles_ins_expiry ON public.vehicles (insurance_expiry_date);

-- Storage bucket for the PDFs themselves. Public read so the signed-in
-- app can render the PDF inline; uploads gated by RLS policies below.
INSERT INTO storage.buckets (id, name, public)
VALUES ('vehicle-insurance', 'vehicle-insurance', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — 4 named per-cmd policies, matches the project convention.
DROP POLICY IF EXISTS "vehicle_insurance_sel" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_insurance_ins" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_insurance_upd" ON storage.objects;
DROP POLICY IF EXISTS "vehicle_insurance_del" ON storage.objects;
CREATE POLICY "vehicle_insurance_sel" ON storage.objects FOR SELECT USING (bucket_id = 'vehicle-insurance');
CREATE POLICY "vehicle_insurance_ins" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'vehicle-insurance');
CREATE POLICY "vehicle_insurance_upd" ON storage.objects FOR UPDATE USING (bucket_id = 'vehicle-insurance');
CREATE POLICY "vehicle_insurance_del" ON storage.objects FOR DELETE USING (bucket_id = 'vehicle-insurance');

NOTIFY pgrst, 'reload schema';
