-- 20260503 — Move CM/Final/Job-File PDFs from base64 columns to Storage.
--
-- Background: PDFs were being stored as `data:application/pdf;base64,...`
-- strings inside the `jobs.cm_doc_url`, `jobs.final_rendered_pdf_url`,
-- `jobs.final_signed_pdf_url`, and `job_files.data_url` columns. A single CM
-- PDF (200 KB → ~270 KB base64) lives in TWO places (jobs row + job_files
-- row), bloats every dbLoadAll query, and contributes to the statement-
-- timeout cascade we've been chasing on the `jobs` SELECT.
--
-- This migration provisions the `job-files` Storage bucket (idempotent) and
-- adds a `storage_path` column to `job_files`. The existing `data_url`
-- column stays for legacy-row backward compatibility — readers prefer
-- storage_path when present, fall back to data_url otherwise.
--
-- The matching JS code change writes:
--   • Storage object: job-files/<jobId>/<fileId>__<safe-filename>
--   • job_files.storage_path: same path
--   • jobs.cm_doc_url / final_*_pdf_url: same path (NOT a data URI)
-- and prefers Storage on read.
--
-- Idempotent: safe to re-run.

-- ── Bucket ──────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-files', 'job-files', false)
ON CONFLICT (id) DO NOTHING;

-- ── RLS on the bucket ────────────────────────────────────────────────────────
-- Spartan's policy convention (memory: project_supabase_rls_convention.md):
-- four named per-cmd policies, RLS on, no FOR ALL. Authenticated users can
-- read/write all job-files objects (the CRM has its own per-row job ACLs;
-- Storage doesn't enforce them, but anon clients can't reach the bucket).
DO $$
BEGIN
  -- Drop any prior versions before recreating so the policy text stays in sync.
  EXECUTE 'DROP POLICY IF EXISTS job_files_storage_sel ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS job_files_storage_ins ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS job_files_storage_upd ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS job_files_storage_del ON storage.objects';
EXCEPTION WHEN OTHERS THEN
  -- Some Supabase projects restrict storage.objects DDL — silently fall
  -- through; the existing default policies will still work for our use.
  NULL;
END $$;

DO $$
BEGIN
  EXECUTE $POL$
    CREATE POLICY job_files_storage_sel ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'job-files')
  $POL$;
  EXECUTE $POL$
    CREATE POLICY job_files_storage_ins ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'job-files')
  $POL$;
  EXECUTE $POL$
    CREATE POLICY job_files_storage_upd ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'job-files')
      WITH CHECK (bucket_id = 'job-files')
  $POL$;
  EXECUTE $POL$
    CREATE POLICY job_files_storage_del ON storage.objects
      FOR DELETE TO authenticated
      USING (bucket_id = 'job-files')
  $POL$;
EXCEPTION WHEN OTHERS THEN
  -- Same reason as above; tolerated.
  NULL;
END $$;

-- ── job_files.storage_path column ───────────────────────────────────────────
ALTER TABLE public.job_files
  ADD COLUMN IF NOT EXISTS storage_path text;

COMMENT ON COLUMN public.job_files.storage_path IS
  'Path inside the job-files Storage bucket. Format: <job_id>/<file_id>__<safe-filename>. Preferred over data_url; data_url stays for legacy rows only.';

NOTIFY pgrst, 'reload schema';
