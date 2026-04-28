// ─────────────────────────────────────────────────────────────────────────────
// Server-side activity row writer.
//
// Mirrors the browser-side saveActivityToEntity() in 08-sales-crm.js, but
// writes only to Supabase — the realtime subscription on the activities
// table (already configured for the CRM) will push the new row into
// state.deals[id].activities / state.leads[id].activities / state.contactActivities[cid]
// in any browser session that has the entity loaded.
//
// Schema mirrors actToDb() in 01-persistence.js so rows interleave cleanly
// with browser-written ones in the timeline.
// ─────────────────────────────────────────────────────────────────────────────

// Build an activity row matching the actToDb() shape. Used by /status when a
// call completes — `text` carries the call notes, `duration` is in seconds
// (matches the existing `duration` column on activities).
export function buildCallActivity({ entityType, entityId, byUser, durationSeconds, outcome, callSid, notes }) {
  const id = 'act_call_' + (callSid || Date.now());
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16);

  // Subject summarises the call for the timeline header. Body holds notes
  // (rep can edit before hangup; survives via the activity edit flow).
  const subject = outcome === 'completed'
    ? `Call (${formatDuration(durationSeconds)})`
    : `Call (${outcome})`;

  return {
    id,
    entity_type: entityType,
    entity_id: entityId,
    type: 'call',
    subject,
    text: notes || '',
    by_user: byUser || '',
    date,
    time,
    done: true,
    due_date: '',
    duration: durationSeconds || 0,
    scheduled: false,
    opens: 0,
    opened: false,
    opened_at: null,
    clicked: false,
    gmail_msg_id: null,
    to_addr: '',
    cc: '',
    cal_link: null,
  };
}

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Build an SMS activity row. `direction` is 'inbound' or 'outbound'. The
// body becomes both the subject (truncated) and the text.
export function buildSmsActivity({ entityType, entityId, byUser, direction, body, sid }) {
  const id = 'act_sms_' + (sid || Date.now());
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 16);

  const arrow = direction === 'outbound' ? '→' : '←';
  const subject = `SMS ${arrow} ${truncate(body, 60)}`;

  return {
    id,
    entity_type: entityType,
    entity_id: entityId,
    type: 'sms',
    subject,
    text: body || '',
    by_user: byUser || '',
    date,
    time,
    done: true,
    due_date: '',
    duration: null,
    scheduled: false,
    opens: 0,
    opened: false,
    opened_at: null,
    clicked: false,
    gmail_msg_id: null,
    to_addr: '',
    cc: '',
    cal_link: null,
  };
}

function truncate(s, n) {
  if (!s) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// Insert SMS activity + mirror to the deal's contact (matches the call helper).
export async function appendSmsActivity(supabase, params) {
  const row = buildSmsActivity(params);
  const { error } = await supabase.from('activities').insert(row);
  if (error) {
    console.warn('[Spartan] appendSmsActivity insert failed:', error.message);
    return false;
  }
  if (params.entityType === 'deal') {
    const { data: deal } = await supabase
      .from('deals').select('cid').eq('id', params.entityId).maybeSingle();
    if (deal && deal.cid) {
      const mirror = { ...row, id: row.id + '_mirror', entity_type: 'contact', entity_id: deal.cid };
      await supabase.from('activities').insert(mirror).then(r => {
        if (r.error) console.warn('[Spartan] sms activity mirror failed:', r.error.message);
      });
    }
  }
  return true;
}

// Insert the activity row + handle the contact-mirroring that browser-side
// saveActivityToEntity does for deal activities.
export async function appendCallActivity(supabase, params) {
  const row = buildCallActivity(params);
  const { error } = await supabase.from('activities').insert(row);
  if (error) {
    console.warn('[Spartan] appendCallActivity insert failed:', error.message);
    return false;
  }

  // Mirror to the deal's contact (matches mirrorActivityToContact() in 08-sales-crm.js)
  if (params.entityType === 'deal') {
    const { data: deal } = await supabase
      .from('deals').select('cid').eq('id', params.entityId).maybeSingle();
    if (deal && deal.cid) {
      const mirror = { ...row, id: row.id + '_mirror', entity_type: 'contact', entity_id: deal.cid };
      await supabase.from('activities').insert(mirror).then(r => {
        if (r.error) console.warn('[Spartan] activity mirror to contact failed:', r.error.message);
      });
    }
  }

  return true;
}
