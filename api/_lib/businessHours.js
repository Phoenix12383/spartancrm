// ─────────────────────────────────────────────────────────────────────────────
// Australian business-hours check — used by /incoming to decide whether to
// ring reps or send the caller straight to voicemail.
//
// Hardcoded to Mon-Fri 8am-5pm Melbourne time. Adjust here when the admin
// UI for working hours lands (stage 6).
//
// Uses Intl.DateTimeFormat with timeZone option rather than building a
// timezone-aware Date manually — the latter is unreliable across server
// regions (Vercel functions can run in any datacenter and have UTC system
// time, so `new Date()` doesn't know about Melbourne).
// ─────────────────────────────────────────────────────────────────────────────

const BUSINESS_TZ = 'Australia/Melbourne';
const BUSINESS_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const BUSINESS_OPEN_HOUR = 8;   // inclusive
const BUSINESS_CLOSE_HOUR = 17; // exclusive — 17:00 means 5pm = closed

export function isBusinessHours(now) {
  const ref = now || new Date();
  const fmt = new Intl.DateTimeFormat('en-AU', {
    timeZone: BUSINESS_TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = fmt.formatToParts(ref);
  const day = (parts.find(p => p.type === 'weekday') || {}).value;
  const hourStr = (parts.find(p => p.type === 'hour') || {}).value || '0';
  // Intl can return "24" instead of "00" at midnight — normalise.
  const hour = parseInt(hourStr === '24' ? '0' : hourStr, 10);

  const isWeekday = BUSINESS_DAYS.includes(day);
  const inHours = hour >= BUSINESS_OPEN_HOUR && hour < BUSINESS_CLOSE_HOUR;
  return isWeekday && inHours;
}
