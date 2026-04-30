-- 20260430 — Tools registry table for Jobs CRM.
-- Mirrors saveTools() in modules/17-install-schedule.js and the form in
-- modules/20-job-settings.js. Run via Supabase Dashboard → SQL Editor.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.tools (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  category     text DEFAULT 'lifting',  -- lifting | access | sealing | fastening | measuring | other
  shared       boolean DEFAULT true,    -- true = depot pool, false = assigned to one installer
  assigned_to  text,                    -- installer.id (NULL when shared)
  notes        text,
  active       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tools_active   ON public.tools (active);
CREATE INDEX IF NOT EXISTS idx_tools_category ON public.tools (category);
CREATE INDEX IF NOT EXISTS idx_tools_assigned ON public.tools (assigned_to);

-- RLS on with the 4-policy convention used by jobs/deals/contacts/leads.
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tools_sel" ON public.tools FOR SELECT USING (true);
CREATE POLICY "tools_ins" ON public.tools FOR INSERT WITH CHECK (true);
CREATE POLICY "tools_upd" ON public.tools FOR UPDATE USING (true);
CREATE POLICY "tools_del" ON public.tools FOR DELETE USING (true);

NOTIFY pgrst, 'reload schema';
