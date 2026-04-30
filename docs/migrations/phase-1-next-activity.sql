-- ─────────────────────────────────────────────────────────────────────────────
-- Pipedrive-replacement Phase 1 — Next-activity data model
--
-- Adds a denormalized "next scheduled activity" triple to deals + leads so the
-- Today view, deal cards, and overdue badge can read scheduling state without
-- scanning the activities table on every render.
--
-- All three columns are NULL on existing rows. The UI treats NULL as "no
-- activity scheduled" and surfaces a grey chip + post-action prompt to fix it.
-- No backfill is needed (and none is wanted — reps will set their own
-- next-activity intent over the first day of use).
--
-- Idempotent: every statement uses IF NOT EXISTS / IF EXISTS so re-running
-- this block is safe.
-- ─────────────────────────────────────────────────────────────────────────────

-- Deals
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS next_activity_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_activity_type TEXT,
  ADD COLUMN IF NOT EXISTS next_activity_note TEXT;

-- Leads (mirrored — fields carry through lead-to-deal conversion)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_activity_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_activity_type TEXT,
  ADD COLUMN IF NOT EXISTS next_activity_note TEXT;

-- Indexes for the Today / overdue queries that Phase 6 will run.
-- Partial index on non-null next_activity_at keeps the index small (most rows
-- are NULL) and makes "all my deals with overdue next_activity_at" a fast
-- index scan instead of a sequential scan on the full deals table.
CREATE INDEX IF NOT EXISTS idx_deals_next_activity_at
  ON public.deals (next_activity_at)
  WHERE next_activity_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_next_activity_at
  ON public.leads (next_activity_at)
  WHERE next_activity_at IS NOT NULL;

-- Realtime: deals + leads are already on the supabase_realtime publication
-- (we use them for the entities channel in 01-persistence.js setupRealtime).
-- New columns on existing published tables are automatically included in
-- change payloads — no publication change needed.

-- Sanity check: verify the columns exist after running.
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='deals'
--     AND column_name LIKE 'next_activity%';
