// ─────────────────────────────────────────────────────────────────────────────
// Inbound-call routing helpers.
//
// findAssignedRepForCaller(supabase, phone)
//   For smart-routing: if a known customer rings the AU number, find the rep
//   responsible for them (deal owner > lead owner > null). Returns the rep's
//   user record or null. Used by /incoming to ring that rep first before
//   falling through to the IVR menu.
//
// findUsersForTeamDigit(supabase, digit)
//   For IVR-menu routing: maps a pressed digit to the team roles, then to
//   the active users in that role. Returns the list to simul-ring.
//
// Both ignore inactive users (active=false) so deactivated reps don't keep
// receiving calls.
// ─────────────────────────────────────────────────────────────────────────────

import { phoneMatchKey } from './phone.js';
import { findEntityByPhone } from './entityLookup.js';

// IVR menu — maps the digit a caller presses to one or more roles whose
// active users should be simul-rung. Hardcoded for stage 3; a Settings UI
// for editing this lands in stage 6 (IVRConfig in the data model).
export const IVR_MENU = {
  '1': { label: 'Sales',    roles: ['sales_rep', 'sales_manager'] },
  '2': { label: 'Service',  roles: ['service_staff'] },
  '3': { label: 'Accounts', roles: ['accounts'] },
  '4': { label: 'Admin',    roles: ['admin'] },
};

// Resolve a caller's phone number to the rep responsible for them.
// Search order matches signal strength: open deal > active lead.
// Returns { id, name, email } or null.
export async function findAssignedRepForCaller(supabase, phone) {
  const key = phoneMatchKey(phone);
  if (!key) return null;

  // Look up the entity itself first to find the rep field
  const entity = await findEntityByPhone(supabase, phone);
  if (!entity) return null;

  // Different entity types store the rep under different field names
  let repName = null;
  if (entity.type === 'contact') {
    // Contacts don't have an assigned rep directly — find the most recent
    // open deal for them and use that deal's rep.
    const { data: deal } = await supabase
      .from('deals')
      .select('rep, won, lost, created_at')
      .eq('cid', entity.id)
      .eq('won', false)
      .eq('lost', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (deal && deal.rep) repName = deal.rep;
  } else if (entity.type === 'lead') {
    const { data: lead } = await supabase
      .from('leads').select('owner').eq('id', entity.id).maybeSingle();
    if (lead && lead.owner) repName = lead.owner;
  }

  if (!repName) return null;

  // Resolve rep name -> user record (for the spartan_<userId> Voice SDK identity)
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, active')
    .ilike('name', repName)
    .eq('active', true)
    .maybeSingle();

  return user || null;
}

// Resolve a pressed IVR digit to the active users that should ring.
// Returns an array of user records ({id, name, email}) — empty if no match.
export async function findUsersForTeamDigit(supabase, digit) {
  const team = IVR_MENU[String(digit)];
  if (!team) return [];

  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .in('role', team.roles)
    .eq('active', true);

  if (error || !users) return [];
  return users;
}

// Ring-everyone fallback — used when the caller doesn't press any digit on
// the IVR menu (or when no team matches their selection). Returns every
// active user. The simul-ring then reaches anyone whose Twilio Device is
// registered (i.e. signed in + connected Gmail), so the call gets answered
// by whoever's actually at their desk regardless of role.
export async function findAllActiveUsers(supabase) {
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('active', true);

  if (error || !users) return [];
  return users;
}
