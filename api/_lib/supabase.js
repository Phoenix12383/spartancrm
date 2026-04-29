// ─────────────────────────────────────────────────────────────────────────────
// Server-side Supabase client.
//
// Uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS — required because the
// backend acts on behalf of any rep, and looks up users + writes call/SMS
// logs without an authenticated Supabase session. NEVER ship the service-role
// key to the browser.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getServerSupabase() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL || 'https://sedpmsgiscowohpqdjza.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is not set — backend cannot reach Supabase');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return _client;
}
