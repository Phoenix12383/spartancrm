// ─────────────────────────────────────────────────────────────────────────────
// Phone & IVR settings — singleton row in public.phone_settings.
//
// Backend reads these instead of the hardcoded constants in stage 3 so admins
// can edit the IVR menu, business hours, and greeting wording without a code
// change. Cached for 60s in module memory to keep inbound-call latency low —
// Vercel function instances may be reused or cold-started; either way the
// cache only delays propagation by up to a minute.
// ─────────────────────────────────────────────────────────────────────────────

import { getServerSupabase } from './supabase.js';

const CACHE_TTL_MS = 60 * 1000;
let _cache = null;
let _cacheAt = 0;

const DEFAULTS = Object.freeze({
  greeting: 'Welcome to Spartan Double Glazing. Press 1 for Sales, 2 for Service, 3 for Accounts, or 4 for Admin. To speak with anyone, please hold.',
  voicemail_greeting: 'Sorry, you have reached us outside business hours. Please leave a message after the beep and we will return your call.',
  voice_name: 'Polly.Nicole',
  ivr_menu: {
    '1': { label: 'Sales',    roles: ['sales_rep', 'sales_manager'] },
    '2': { label: 'Service',  roles: ['service_staff'] },
    '3': { label: 'Accounts', roles: ['accounts'] },
    '4': { label: 'Admin',    roles: ['admin'] },
  },
  business_hours: {
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    open_hour: 8,
    close_hour: 17,
    timezone: 'Australia/Melbourne',
  },
});

// Get current phone settings. Falls back to DEFAULTS on any DB error so the
// inbound call flow never breaks because of a settings table issue.
export async function getPhoneSettings() {
  const now = Date.now();
  if (_cache && (now - _cacheAt) < CACHE_TTL_MS) return _cache;

  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('phone_settings').select('*').eq('id', 'singleton').maybeSingle();
    if (error) throw error;
    _cache = data ? mergeWithDefaults(data) : { ...DEFAULTS };
  } catch (e) {
    console.warn('[Spartan] phone_settings load failed, using defaults:', e && e.message ? e.message : e);
    _cache = { ...DEFAULTS };
  }
  _cacheAt = now;
  return _cache;
}

// Merge a row from the DB with the defaults so missing fields fall back
// gracefully (e.g. an admin edits only the greeting and leaves IVR blank).
function mergeWithDefaults(row) {
  return {
    greeting: row.greeting || DEFAULTS.greeting,
    voicemail_greeting: row.voicemail_greeting || DEFAULTS.voicemail_greeting,
    voice_name: row.voice_name || DEFAULTS.voice_name,
    ivr_menu: row.ivr_menu && typeof row.ivr_menu === 'object' ? row.ivr_menu : DEFAULTS.ivr_menu,
    business_hours: row.business_hours && typeof row.business_hours === 'object' ? row.business_hours : DEFAULTS.business_hours,
  };
}

// Force-clear the cache. Useful when admin saves new settings — the caller
// can invalidate immediately rather than wait for the 60s TTL. Not strictly
// required (60s is fine) but reduces "I just changed it, why isn't it live"
// confusion for admins.
export function invalidatePhoneSettingsCache() {
  _cache = null;
  _cacheAt = 0;
}

// Compute business-hours from a settings object (replaces api/_lib/businessHours.js's
// hardcoded values). Returns true if `now` falls within the configured open hours
// on a configured working day.
export function isBusinessHoursFromSettings(settings, now) {
  const ref = now || new Date();
  const bh = (settings && settings.business_hours) || DEFAULTS.business_hours;
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: bh.timezone || 'Australia/Melbourne',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(ref);
  const day = (parts.find(p => p.type === 'weekday') || {}).value;
  const hourStr = (parts.find(p => p.type === 'hour') || {}).value || '0';
  const hour = parseInt(hourStr === '24' ? '0' : hourStr, 10);
  const isWeekday = (bh.days || []).includes(day);
  const inHours = hour >= (bh.open_hour || 0) && hour < (bh.close_hour || 24);
  return isWeekday && inHours;
}
