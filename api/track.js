// ─────────────────────────────────────────────────────────────────────────────
// api/track.js — Spartan CRM email tracking pixel endpoint
//
// Lives at https://spaartan.tech/api/track  (Vercel auto-detects the api/ dir).
// Receives GET /api/track?id=<msgId>&uid=<userId>, inserts a row into the
// Supabase `email_opens` table, and returns a 1x1 transparent GIF.
//
// The insert is fire-and-forget: the pixel response is never blocked on the
// database write, because email clients with slow renderers would otherwise
// see a broken image. Failures are logged to the Vercel function log.
//
// Required environment variables (set in Vercel dashboard -> Settings -> Env):
//   SUPABASE_URL                — project URL, e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — service role key (NOT the anon key) — needed
//                                 so this endpoint can insert without auth.
//                                 Do NOT expose this key in the frontend.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1x1 transparent GIF (43 bytes base64 -> 43 bytes binary).
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export default async function handler(req, res) {
  const { id, uid } = req.query;

  // Fire-and-forget insert. Missing id/uid still returns a pixel so broken
  // links in old emails don't generate HTTP errors.
  if (id && uid) {
    const ip =
      req.headers['x-forwarded-for'] ||
      (req.socket && req.socket.remoteAddress) ||
      null;
    const ua = req.headers['user-agent'] || null;

    supabase
      .from('email_opens')
      .insert({
        msg_id: String(id),
        user_id: String(uid),
        ip: typeof ip === 'string' ? ip.split(',')[0].trim() : ip,
        user_agent: ua,
      })
      .then((r) => {
        if (r.error) console.warn('[track] insert error:', r.error.message);
      })
      .catch((e) => console.warn('[track] insert threw:', e && e.message));
  }

  // Always return the pixel, with aggressive no-cache so Gmail's image proxy
  // does not serve a single cached copy for every recipient view.
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Content-Length', PIXEL.length);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).send(PIXEL);
}
