-- 20260504 — Fix job-files Storage upload failures.
--
-- The 20260503 migration created the job-files bucket with policies scoped
-- TO authenticated. Spartan CRM uses Supabase as the anon role (auth lives
-- in spartan_users localStorage, not Supabase Auth), so every upload was
-- silently rejected by RLS — leading to the "Storage upload failed — kept
-- inline as fallback" toast every time a CM PDF was saved.
--
-- This re-aligns job-files policies with the working vehicle-insurance /
-- crm-photos pattern: open policies (no role restriction) on a private
-- bucket, with a unique path scheme acting as the obscurity layer.
--
-- Idempotent: safe to re-run. Drops + recreates the four policies. Bucket
-- visibility unchanged (private; reads still go through createSignedUrl).

-- Drop the prior versions, if they exist.
DROP POLICY IF EXISTS job_files_storage_sel ON storage.objects;
DROP POLICY IF EXISTS job_files_storage_ins ON storage.objects;
DROP POLICY IF EXISTS job_files_storage_upd ON storage.objects;
DROP POLICY IF EXISTS job_files_storage_del ON storage.objects;

-- Re-create open policies — no TO clause, no role restriction. Matches the
-- vehicle-insurance / crm-photos buckets that have been working.
CREATE POLICY job_files_storage_sel ON storage.objects
  FOR SELECT USING (bucket_id = 'job-files');

CREATE POLICY job_files_storage_ins ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'job-files');

CREATE POLICY job_files_storage_upd ON storage.objects
  FOR UPDATE USING (bucket_id = 'job-files') WITH CHECK (bucket_id = 'job-files');

CREATE POLICY job_files_storage_del ON storage.objects
  FOR DELETE USING (bucket_id = 'job-files');

NOTIFY pgrst, 'reload schema';
