// ─────────────────────────────────────────────────────────────────────────────
// Find a Spartan CRM record by phone number.
//
// Used by /api/twilio/status (and later /api/twilio/incoming) to attach a
// call/SMS to the right entity for the activity timeline. Search order
// matches the plan's signal-strength priority: contact > lead > deal > job.
// Returns the first match — calls to the same number get attached to the
// same entity even if the customer also exists as a stale lead, etc.
// ─────────────────────────────────────────────────────────────────────────────

import { phoneMatchKey } from './phone.js';

// Try to resolve a phone number to a CRM entity.
// Returns { type, id, name } on hit, or null on miss.
//
// Backend equivalent of the browser's findCrmEntityByPhone() (B8 in the plan).
// We can't use that one server-side because it reads getState() — instead we
// query Supabase directly via the service-role client.
export async function findEntityByPhone(supabase, rawPhone) {
  const key = phoneMatchKey(rawPhone);
  if (!key) return null;

  // 1. Contacts (highest signal — these are converted customers)
  const { data: contacts } = await supabase
    .from('contacts').select('id, fn, ln, phone').not('phone', 'is', null);
  const contactHit = (contacts || []).find(c => phoneMatchKey(c.phone) === key);
  if (contactHit) {
    return { type: 'contact', id: contactHit.id, name: `${contactHit.fn || ''} ${contactHit.ln || ''}`.trim() };
  }

  // 2. Leads
  const { data: leads } = await supabase
    .from('leads').select('id, fn, ln, phone').not('phone', 'is', null);
  const leadHit = (leads || []).find(l => phoneMatchKey(l.phone) === key);
  if (leadHit) {
    return { type: 'lead', id: leadHit.id, name: `${leadHit.fn || ''} ${leadHit.ln || ''}`.trim() };
  }

  // 3. Deals — phone isn't stored on the deal directly; deals link to contacts
  // via cid. So we already searched the right place at step 1. Skip.

  // 4. Jobs — same: jobs reference a contact_id. Already covered.

  return null;
}
