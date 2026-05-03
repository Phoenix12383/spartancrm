// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11e-email-signatures.js
// Extracted from 11-email-page.js on 2026-05-02 as part of monolith breakup.
// ═════════════════════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════════════════════
// EMAIL SIGNATURES (Brief 6 Phase 3)
// ════════════════════════════════════════════════════════════════════════════
//
// Per-user, per-state HTML signatures. Storage layout (one entry per scope):
//   spartan_signature_${cu.id}_default   — fallback when no state matches
//   spartan_signature_${cu.id}_VIC       — VIC-specific
//   spartan_signature_${cu.id}_NSW       — NSW-specific (etc.)
//
// Lookup order in `getSignature(state)`:
//   1. State-specific (if state is provided and a value exists)
//   2. Default (`spartan_signature_${cu.id}_default`)
//   3. Hardcoded HTML fallback (built from cu.name + cu.email + Spartan
//      boilerplate)
//
// Migration: pre-Phase-3 the signature lived at `spartan_signature_${cu.id}`
// as plain text. On the first call to getSignature() after this PR ships,
// if the legacy key exists and the new default key doesn't, we convert
// (escape + \n→<br>, wrap in <div>) and write to the default key, then
// delete the legacy key. Idempotent — runs at most once per browser per
// user, and a no-op if the user never had a custom signature.

function _signatureKey(userId, state) {
  return 'spartan_signature_' + userId + '_' + (state || 'default');
}

function _legacySignatureKey(userId) { return 'spartan_signature_' + userId; }


// Migration helper. Returns true if a migration was performed (legacy key
// was non-null and got converted), false otherwise. Safe to call repeatedly
// — short-circuits once the legacy key is gone.
function _migrateLegacySignature(cu) {
  if (!cu) return false;
  try {
    var legacy = localStorage.getItem(_legacySignatureKey(cu.id));
    if (legacy === null) return false;
    var defaultKey = _signatureKey(cu.id, 'default');
    if (localStorage.getItem(defaultKey) !== null) {
      // New default key already populated (user already saved a Phase-3
      // signature), but the legacy key is still hanging around. Clean
      // it up without overwriting the new value.
      try { localStorage.removeItem(_legacySignatureKey(cu.id)); } catch (e) {}
      return false;
    }
    var html = '<div>' + _escHtml(legacy).replace(/\r?\n/g, '<br>') + '</div>';
    localStorage.setItem(defaultKey, html);
    try { localStorage.removeItem(_legacySignatureKey(cu.id)); } catch (e) {}
    if (typeof appendAuditEntry === 'function') {
      try {
        appendAuditEntry({
          entityType: 'settings', entityId: null,
          action: 'settings.signature_edited',
          summary: 'Migrated legacy plain-text signature to HTML for ' + (cu.name || cu.id),
          metadata: { migration: true, userId: cu.id },
        });
      } catch (e) {}
    }
    return true;
  } catch (e) { return false; }
}


// Hardcoded fallback when nothing is configured. HTML version of the old
// plain-text default. Uses the connected Gmail account's name/email when
// present, falling back to the CRM user record.
function _defaultSignatureHtml(cu) {
  var s = (typeof getState === 'function') ? getState() : {};
  var name  = (s.gmailUser && s.gmailUser.name)  ? s.gmailUser.name  : ((cu && cu.name)  || '');
  var email = (s.gmailUser && s.gmailUser.email) ? s.gmailUser.email : ((cu && cu.email) || '');
  return '<div>--<br>' + _escHtml(name) + '<br>Spartan Double Glazing &middot; 1300 912 161<br>' + _escHtml(email) + '</div>';
}


// Public API: state-aware signature lookup with fallback chain. Brief 6
// Phase 3. Pre-Phase-3 callers passed no argument and got a single
// per-user signature; that still works (state defaults to undefined →
// skips step 1, lands on step 2 or 3).
function getSignature(state) {
  var cu = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!cu) return '';
  _migrateLegacySignature(cu);
  if (state) {
    try {
      var perState = localStorage.getItem(_signatureKey(cu.id, state));
      if (perState !== null && perState !== '') return perState;
    } catch (e) {}
  }
  try {
    var def = localStorage.getItem(_signatureKey(cu.id, 'default'));
    if (def !== null && def !== '') return def;
  } catch (e) {}
  return _defaultSignatureHtml(cu);
}


// No-fallback raw read — used by the Profile editors so each shows what's
// actually stored for THAT scope (vs the chained value getSignature returns).
// Returns '' when nothing is stored for the scope.
function getRawSignature(state) {
  var cu = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!cu) return '';
  _migrateLegacySignature(cu);
  try {
    var v = localStorage.getItem(_signatureKey(cu.id, state || 'default'));
    return v === null ? '' : v;
  } catch (e) { return ''; }
}


// Save a signature. Brief 6 Phase 3 signature is `(state, html)` where
// state is '' / undefined / 'default' for the default scope, or a state
// code ('VIC', 'NSW', …) for a per-state scope. Pre-Phase-3 single-arg
// `saveSignature(text)` calls are still accepted — the single arg is
// treated as the default-scope content.
function saveSignature(stateOrText, html) {
  var cu = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
  if (!cu) return;
  var state, content;
  if (arguments.length === 1) {
    // Backward-compat: legacy callers passed a single plain-text string.
    state = 'default';
    content = stateOrText;
  } else {
    state = stateOrText || 'default';
    content = html;
  }
  // Sanitise on save — defence in depth alongside render-time sanitisation.
  // The user could paste arbitrary HTML from any source into the editor;
  // we'd rather store a clean version than rely solely on render-time
  // protection.
  var safe = (typeof _sanitizeHtml === 'function') ? _sanitizeHtml(content || '') : (content || '');
  var key = _signatureKey(cu.id, state);
  try { localStorage.setItem(key, safe); } catch (e) {}
  if (typeof appendAuditEntry === 'function') {
    try {
      appendAuditEntry({
        entityType: 'settings', entityId: null,
        action: 'settings.signature_edited',
        summary: 'Updated email signature' + (state === 'default' ? ' (default)' : ' for ' + state),
        metadata: { state: state, userId: cu.id },
      });
    } catch (e) {}
  }
  addToast('Signature saved' + (state === 'default' ? '' : ' for ' + state), 'success');
  renderPage();
}


// Profile signature save — reads the live HTML out of the contenteditable
// at sig_<state>, runs it through saveSignature.
function profileSaveSignature(state) {
  var key = state || 'default';
  var el = document.getElementById('sig_' + key);
  if (!el) { addToast('Editor not found', 'error'); return; }
  saveSignature(key, el.innerHTML);
}
