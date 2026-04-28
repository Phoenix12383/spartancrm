// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 24-commission.js
// Extracted from original index.html lines 15462-15779
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// COMMISSION SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// CONFIG DATA MODEL (Brief 4 Phase 1)
// ════════════════════════════════════════════════════════════════════════════
//
// Replaces the flat `spartan_commission_rates: {[repName]: pct}` localStorage
// key with a richer `spartan_commission_rules` object that carries:
//   - defaults: org-wide baseline (used when no per-rep / per-branch override)
//   - perRep:   per-rep overrides; missing keys fall through to defaults
//   - perBranch: per-branch base-rate overrides
//   - productMultipliers: applied per quote line item by Phase 2's calc engine
//   - volumeBonuses: thresholds that step a rep's effective rate up
//
// Phase 1 ships only the data layer. Phase 2 will read these in a new
// `calcDealCommission(deal)`. Phase 5 will surface them as editable rows
// in Settings. The existing `calcCommission(dealVal, repName)` and the
// rates tab in renderCommissionPage() continue to work — we delegate
// `getRepRate` and `setRepRate` to the new helpers transparently.
//
// Migration: on first read, if `spartan_commission_rules` is missing but
// the legacy `spartan_commission_rates` flat map exists, we migrate every
// rep's rate into the new perRep shape and write a single audit entry
// (`system.commission_state_migrated`). The legacy key is kept around
// (read-only fallback for one release per the brief's mitigation note);
// future cleanup will delete it once the new shape has been in production.
// TODO(brief-4-followup): delete `spartan_commission_rates` after one
// release of stable usage on the new key.

var COMMISSION_RULES_KEY = 'spartan_commission_rules';
var COMMISSION_RATES_LEGACY_KEY = 'spartan_commission_rates';

// Frozen so accidental mutation in callers doesn't bleed into seed data.
// Default volumeBonus + a premium-product multiplier are seeded so Phase
// 2's calc engine has working examples out of the box; the user can edit
// or clear them in Phase 5's Settings UI.
var _DEFAULT_COMMISSION_RULES = Object.freeze({
  defaults: Object.freeze({
    baseRate: 5,           // pct on ex-GST deal value
    ageThresholdDays: 60,  // days from QuoteBooked → Won before penalty kicks in
    agePenaltyPct: 1,      // pct points subtracted from effective rate when over threshold
    realisationGate: 'won' // 'won' | 'final_signed' | 'final_payment'
  }),
  perRep: Object.freeze({}),       // {[repName]: {baseRate?, ageThresholdDays?, agePenaltyPct?, realisationGate?}}
  perBranch: Object.freeze({}),    // {[branchCode]: {baseRate?}}
  productMultipliers: Object.freeze([
    // Brief 4 Phase 1: '_default' is the implicit catch-all when a quote line
    // item's productType doesn't match any explicit entry. The brief's example
    // was 'premium_lift_slide' — that productType doesn't exist in the actual
    // CAD vocabulary (see modules/22-jobs-page.js PLABELS), so we seed with a
    // real high-end product instead. Users can add/remove rows in Phase 5.
    Object.freeze({ productKey: '_default',   label: 'Default (any product)', multiplier: 1.0 }),
    Object.freeze({ productKey: 'bifold_door', label: 'Bifold Door',           multiplier: 1.2 }),
  ]),
  volumeBonuses: Object.freeze([
    // Empty array = no bonuses configured. We seed one example so the calc
    // engine has something to demonstrate; clear or extend in Phase 5.
    Object.freeze({ threshold: 100000, bonusPct: 1 }),
  ]),
});

// Legacy persistence helpers — retained for the read-only-fallback contract.
// New code should NOT call saveCommissionRates(); it should call
// saveCommissionRules() instead. Kept exported so debugging / one-off
// migration tooling can still reach the legacy data if needed.
function getCommissionRates() { try { return JSON.parse(localStorage.getItem(COMMISSION_RATES_LEGACY_KEY) || '{}'); } catch(e){ return {}; } }
function saveCommissionRates(rates) { localStorage.setItem(COMMISSION_RATES_LEGACY_KEY, JSON.stringify(rates)); }

// ════════════════════════════════════════════════════════════════════════════
// STATE MACHINE — accrued / realised / paid (Brief 4 Phase 3)
// ════════════════════════════════════════════════════════════════════════════
//
// Replaces the binary `spartan_commission_paid: {[dealId]: {status,
// paidDate, paidBy}}` with a tri-state record at
// `spartan_commission_status: {[dealId]: {state, accruedAt, realisedAt,
// paidAt, paidBy, gateUsed, payRunId}}`.
//
// State transitions (one-way unless explicitly toggled):
//   (none)        → accrued        on Won (via accrueCommission)
//   accrued       → realised       on configured gate event (won / final_signed / final_payment)
//   realised      → paid           via toggleCommissionPaid (or future Pay Run flow)
//   paid          → realised       via toggleCommissionPaid (revert)
//   accrued       → ✗ paid         BLOCKED — toast error "Commission must be realised first"
//
// Migration: on first read of getCommissionStatus(), if the new key is
// missing but the legacy `spartan_commission_paid` map exists, we
// transform every entry. Paid records land as state='paid' with
// realisedAt + paidAt populated; unpaid records land as state='accrued'
// (they were stuck in the binary "deal won but not paid" state, which is
// what 'accrued' models exactly). Per the brief's mitigation note (Phase
// 1 pattern), the legacy key is preserved as a read-only fallback for one
// release; future cleanup will delete it.

var COMMISSION_STATUS_KEY = 'spartan_commission_status';
var COMMISSION_PAID_LEGACY_KEY = 'spartan_commission_paid';

// Lazy migration. Returns true if a migration was performed, false otherwise.
// Idempotent: once the new key exists, subsequent calls short-circuit.
function _migrateLegacyCommissionPaid() {
  try {
    if (localStorage.getItem(COMMISSION_STATUS_KEY) !== null) return false;
    var legacy = {};
    try { legacy = JSON.parse(localStorage.getItem(COMMISSION_PAID_LEGACY_KEY) || '{}'); } catch (e) { legacy = {}; }
    var dealIds = Object.keys(legacy);
    if (dealIds.length === 0) return false;
    var status = {};
    var nowIso = new Date().toISOString();
    var migratedCount = 0;
    dealIds.forEach(function (dealId) {
      var rec = legacy[dealId] || {};
      var wasPaid = rec.status === 'paid';
      var paidIso = rec.paidDate ? (String(rec.paidDate).slice(0, 10) + 'T00:00:00Z') : null;
      status[dealId] = {
        // Paid records carry forward as paid; unpaid records were stuck
        // accrued (the binary tracker had no "realised" middle state, so
        // the safest landing is 'accrued' — the new flow then has to fire
        // the configured gate to advance them, which matches the new
        // semantics and avoids over-promoting unpaid legacy data).
        state: wasPaid ? 'paid' : 'accrued',
        accruedAt:  paidIso || nowIso,
        realisedAt: wasPaid ? (paidIso || nowIso) : null,
        paidAt:     wasPaid ? paidIso : null,
        paidBy:     rec.paidBy || null,
        gateUsed:   wasPaid ? 'legacy_migration' : null,
        // Brief 4 Phase 7 hook — payRunId:null marks these as "orphaned"
        // paid commissions waiting to be bucketed into a historical pay
        // run via the backfill flow once that lands.
        payRunId:   null,
      };
      migratedCount++;
    });
    localStorage.setItem(COMMISSION_STATUS_KEY, JSON.stringify(status));
    // Per the brief's mitigation pattern, do NOT delete the legacy key
    // here. A future PR removes it after a release of stable usage on
    // the new shape.
    // TODO(brief-4-followup): delete `spartan_commission_paid` after one
    // release of stable usage on the new key.
    if (typeof appendAuditEntry === 'function') {
      try {
        appendAuditEntry({
          entityType: 'commission', entityId: null,
          action: 'system.commission_state_migrated',
          summary: 'Migrated ' + migratedCount + ' commission record' + (migratedCount !== 1 ? 's' : '') + ' from spartan_commission_paid to spartan_commission_status',
          metadata: { migration: 'paid_to_status_v1', migratedCount: migratedCount },
        });
      } catch (e) {}
    }
    return true;
  } catch (e) { return false; }
}

// Public — read the full commission-status map. Runs the legacy migration
// on first call. Always returns an object (possibly empty), never null.
function getCommissionStatus() {
  _migrateLegacyCommissionPaid();
  try {
    var raw = localStorage.getItem(COMMISSION_STATUS_KEY);
    if (raw === null) return {};
    var parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) { return {}; }
}

function saveCommissionStatus(status) {
  try { localStorage.setItem(COMMISSION_STATUS_KEY, JSON.stringify(status || {})); } catch (e) {}
}

// Convenience — get the record for a specific deal, or null if no record.
function getCommissionStatusForDeal(dealId) {
  var status = getCommissionStatus();
  return status[dealId] || null;
}

// Public — accrue commission on Won. If the rep's effective realisation
// gate is 'won', also auto-realise so the deal is immediately payable.
// Idempotent: re-running on an already-accrued (or further) deal is a
// no-op so transient setState replays don't promote state inadvertently.
// Audit entries:
//   commission.accrued — always (one entry per deal at first accrual)
//   commission.realised — only when gate === 'won' and we auto-realise
function accrueCommission(deal) {
  if (!deal || !deal.id) return false;
  var status = getCommissionStatus();
  var existing = status[deal.id];
  if (existing && (existing.state === 'accrued' || existing.state === 'realised' || existing.state === 'paid')) {
    return false; // already at or past 'accrued'
  }
  var nowIso = new Date().toISOString();
  var rule = (typeof getEffectiveRuleForRep === 'function')
    ? getEffectiveRuleForRep(deal.rep, deal.branch)
    : { realisationGate: 'won' };
  var rec = {
    state: 'accrued',
    accruedAt: nowIso,
    realisedAt: null,
    paidAt: null,
    paidBy: null,
    gateUsed: null,
    payRunId: null,
  };
  // Auto-realise when the deal's configured gate is 'won' (the default).
  // For 'final_signed' and 'final_payment' gates, the deal stays at
  // 'accrued' until the corresponding hook fires.
  var autoRealised = (rule.realisationGate === 'won');
  if (autoRealised) {
    rec.state = 'realised';
    rec.realisedAt = nowIso;
    rec.gateUsed = 'won';
  }
  status[deal.id] = rec;
  saveCommissionStatus(status);
  if (typeof appendAuditEntry === 'function') {
    try {
      appendAuditEntry({
        entityType: 'commission', entityId: deal.id,
        action: 'commission.accrued',
        summary: 'Commission accrued for ' + (deal.title || deal.id),
        after: { state: 'accrued', accruedAt: nowIso },
        metadata: { realisationGate: rule.realisationGate, dealVal: deal.val || 0 },
        branch: deal.branch || null,
      });
      if (autoRealised) {
        appendAuditEntry({
          entityType: 'commission', entityId: deal.id,
          action: 'commission.realised',
          summary: 'Commission auto-realised on Won (gate: won)',
          before: { state: 'accrued' },
          after:  { state: 'realised', realisedAt: nowIso, gateUsed: 'won' },
          branch: deal.branch || null,
        });
      }
    } catch (e) {}
  }
  return true;
}

// Public — realise commission for a deal. Called from the gate-firing
// hook points (final_signed in 03-jobs-workflow.js, final_payment in
// 22-jobs-page.js). Idempotent: short-circuits if the deal is already
// realised or paid (so re-running the gate event doesn't overwrite
// realisedAt). Returns true if the state actually flipped.
//
// Note: the hook points check the deal's configured gate before calling
// this. If a gate event fires for a deal whose configured gate is
// different (e.g. final_signed fires on a deal configured for
// final_payment), the call site doesn't fire — this function would
// realise unconditionally if called.
function realiseCommission(dealId, gateUsed) {
  if (!dealId) return false;
  var status = getCommissionStatus();
  var rec = status[dealId];
  if (!rec) return false;
  if (rec.state === 'realised' || rec.state === 'paid') return false;
  var nowIso = new Date().toISOString();
  var prevState = rec.state;
  rec.state = 'realised';
  rec.realisedAt = nowIso;
  rec.gateUsed = gateUsed || rec.gateUsed || null;
  status[dealId] = rec;
  saveCommissionStatus(status);
  if (typeof appendAuditEntry === 'function') {
    try {
      // Try to attach branch context from the deal record if we can find it.
      var branch = null;
      try {
        var deal = (typeof getState === 'function' && getState().deals)
          ? getState().deals.find(function (d) { return d.id === dealId; })
          : null;
        if (deal) branch = deal.branch || null;
      } catch (e) {}
      appendAuditEntry({
        entityType: 'commission', entityId: dealId,
        action: 'commission.realised',
        summary: 'Commission realised via gate: ' + (gateUsed || '?'),
        before: { state: prevState },
        after:  { state: 'realised', realisedAt: nowIso, gateUsed: gateUsed || null },
        branch: branch,
      });
    } catch (e) {}
  }
  return true;
}

// ── Backward-compat shims for pre-Phase-3 callers ───────────────────────────
// `getCommissionPaid()` is read at the top of renderCommissionPage and at
// several downstream call sites that check `paid[dealId].status === 'paid'`.
// We translate the new shape back to the old `{status, paidDate, paidBy}`
// format so the existing rendering code keeps working unchanged until
// Phase 6 surfaces the tri-state model in the UI. New code should call
// getCommissionStatus() / getCommissionStatusForDeal() directly.
function getCommissionPaid() {
  var status = getCommissionStatus();
  var paid = {};
  Object.keys(status).forEach(function (dealId) {
    var rec = status[dealId];
    if (!rec) return;
    paid[dealId] = {
      status: rec.state === 'paid' ? 'paid' : 'unpaid',
      paidDate: rec.paidAt ? String(rec.paidAt).slice(0, 10) : null,
      paidBy: rec.paidBy || null,
    };
  });
  return paid;
}
// DEPRECATED — the legacy save path. Routes through saveCommissionStatus
// for any straggler callers; new code uses saveCommissionStatus directly.
function saveCommissionPaid(paid) {
  if (!paid || typeof paid !== 'object') return;
  var status = getCommissionStatus();
  Object.keys(paid).forEach(function (dealId) {
    var rec = paid[dealId];
    if (!rec) return;
    var existing = status[dealId] || {
      state: 'accrued', accruedAt: new Date().toISOString(),
      realisedAt: null, paidAt: null, paidBy: null, gateUsed: null, payRunId: null,
    };
    if (rec.status === 'paid') {
      existing.state = 'paid';
      existing.paidAt = rec.paidDate ? (rec.paidDate + 'T00:00:00Z') : new Date().toISOString();
      existing.paidBy = rec.paidBy || existing.paidBy;
    } else if (existing.state === 'paid') {
      existing.state = 'realised';
      existing.paidAt = null;
      existing.paidBy = null;
    }
    status[dealId] = existing;
  });
  saveCommissionStatus(status);
}

function getCommissionAudit() { try { return JSON.parse(localStorage.getItem('spartan_commission_audit') || '[]'); } catch(e){ return []; } }
function saveCommissionAudit(log) { localStorage.setItem('spartan_commission_audit', JSON.stringify(log)); }

// One-time, idempotent migration from the flat rates map to the new rules
// object. Runs lazily on first call to getCommissionRules() — same pattern
// as the dealType backfill in 01-persistence.js. Returns true if a
// migration was performed, false otherwise. Safe to call repeatedly: once
// the new key exists, this short-circuits.
function _migrateLegacyCommissionRates() {
  try {
    if (localStorage.getItem(COMMISSION_RULES_KEY) !== null) return false;
    var legacy = {};
    try { legacy = JSON.parse(localStorage.getItem(COMMISSION_RATES_LEGACY_KEY) || '{}'); } catch (e) { legacy = {}; }
    // Build the new rules object by deep-cloning the frozen defaults and
    // populating perRep from legacy. Use a plain (non-frozen) deep clone so
    // callers can safely mutate the result of getCommissionRules().
    var rules = _deepCloneCommissionRules(_DEFAULT_COMMISSION_RULES);
    var migratedCount = 0;
    Object.keys(legacy).forEach(function (repName) {
      var pct = parseFloat(legacy[repName]);
      if (!isNaN(pct)) {
        rules.perRep[repName] = { baseRate: pct };
        migratedCount++;
      }
    });
    localStorage.setItem(COMMISSION_RULES_KEY, JSON.stringify(rules));
    // Per the brief's mitigation note, do NOT delete the legacy key in this
    // release. Keep it as a read-only fallback so a botched migration can
    // be recovered. A future PR will clear it once the new shape has been
    // in production.
    if (typeof appendAuditEntry === 'function') {
      try {
        appendAuditEntry({
          entityType: 'commission', entityId: null,
          action: 'system.commission_state_migrated',
          summary: 'Migrated ' + migratedCount + ' rep' + (migratedCount !== 1 ? 's' : '') + ' from legacy commission rates map to spartan_commission_rules',
          metadata: { migration: 'rates_to_rules_v1', migratedCount: migratedCount },
        });
      } catch (e) {}
    }
    return true;
  } catch (e) { return false; }
}

// Plain-object deep clone for the rules shape. Object.freeze makes nested
// .perRep / .productMultipliers / .volumeBonuses read-only, which would
// throw if a caller did rules.perRep[name] = ... — so we always hand back
// a mutable copy. Custom rather than structuredClone because we still
// support older browsers in this codebase's deployment matrix.
function _deepCloneCommissionRules(src) {
  return {
    defaults: Object.assign({}, src.defaults || {}),
    perRep: (function () {
      var out = {};
      Object.keys(src.perRep || {}).forEach(function (k) {
        out[k] = Object.assign({}, src.perRep[k] || {});
      });
      return out;
    })(),
    perBranch: (function () {
      var out = {};
      Object.keys(src.perBranch || {}).forEach(function (k) {
        out[k] = Object.assign({}, src.perBranch[k] || {});
      });
      return out;
    })(),
    productMultipliers: (src.productMultipliers || []).map(function (pm) { return Object.assign({}, pm); }),
    volumeBonuses: (src.volumeBonuses || []).map(function (vb) { return Object.assign({}, vb); }),
  };
}

// Public — read the commission rules, running the legacy migration on
// first call. Always returns a fully-shaped object (defaults + perRep +
// perBranch + productMultipliers + volumeBonuses) so callers don't need
// to defend against missing keys. If localStorage is unreadable or the
// stored value is corrupt, falls back to seed defaults.
function getCommissionRules() {
  _migrateLegacyCommissionRates();
  var raw = null;
  try { raw = localStorage.getItem(COMMISSION_RULES_KEY); } catch (e) {}
  if (raw === null) return _deepCloneCommissionRules(_DEFAULT_COMMISSION_RULES);
  try {
    var parsed = JSON.parse(raw);
    // Merge stored shape with seed defaults so a partial / older-version
    // stored object doesn't crash the calc engine. Stored keys win;
    // missing keys come from seed.
    var seed = _deepCloneCommissionRules(_DEFAULT_COMMISSION_RULES);
    return {
      defaults: Object.assign({}, seed.defaults, parsed.defaults || {}),
      perRep: parsed.perRep || {},
      perBranch: parsed.perBranch || {},
      productMultipliers: Array.isArray(parsed.productMultipliers) ? parsed.productMultipliers : seed.productMultipliers,
      volumeBonuses: Array.isArray(parsed.volumeBonuses) ? parsed.volumeBonuses : seed.volumeBonuses,
    };
  } catch (e) { return _deepCloneCommissionRules(_DEFAULT_COMMISSION_RULES); }
}

// Public — persist a rules object. Audits via the unified audit log
// (Brief 2). Caller is expected to pass a complete (post-merge) rules
// object — saveCommissionRules({}) would wipe the user's config. Mutating
// helpers (setRepRate, future per-branch / per-product editors) load via
// getCommissionRules, mutate, then save through here.
function saveCommissionRules(rules, opts) {
  opts = opts || {};
  try { localStorage.setItem(COMMISSION_RULES_KEY, JSON.stringify(rules)); } catch (e) {}
  // Audit — caller can suppress (e.g. internal migration calls) by passing
  // {silent: true}. The default writes one entry per save with a generic
  // summary; specific helpers like setRepRate add their own narrower
  // summary on top so admins can tell rate-change-by-name from a bulk
  // settings save.
  if (!opts.silent && typeof appendAuditEntry === 'function') {
    try {
      appendAuditEntry({
        entityType: 'commission', entityId: null,
        action: 'commission.rules_updated',
        summary: opts.summary || 'Commission rules updated',
        before: opts.before || null,
        after: opts.after || null,
        metadata: opts.metadata || null,
      });
    } catch (e) {}
  }
}

// Public — return the merged rule for a specific rep. Lookup order:
//   defaults → perBranch[branch] → perRep[repName]
// Each layer's keys override the previous. Callers (Phase 2's calc
// engine, the existing getRepRate shim) don't need to know about the
// layering — they just read the merged record.
function getEffectiveRuleForRep(repName, branch) {
  var rules = getCommissionRules();
  var merged = Object.assign({}, rules.defaults);
  if (branch && rules.perBranch && rules.perBranch[branch]) {
    Object.assign(merged, rules.perBranch[branch]);
  }
  if (repName && rules.perRep && rules.perRep[repName]) {
    Object.assign(merged, rules.perRep[repName]);
  }
  return merged;
}

// Public — read just the productMultipliers list. Phase 2's calc engine
// will look up by productKey (with '_default' as the catch-all). Phase
// 5's Settings UI will edit this list.
function getProductMultipliers() { return getCommissionRules().productMultipliers || []; }

// Public — read just the volumeBonuses list. Phase 2 walks this in
// descending threshold order to find the highest tripped bonus.
function getVolumeBonuses() { return getCommissionRules().volumeBonuses || []; }

// ── Per-rep rate (legacy-shaped public API, now backed by the rules object)
// Returns the rep's effective base rate. Existing callers (rep cards,
// rates tab, calcCommission) keep working unchanged.
function getRepRate(repName) {
  return getEffectiveRuleForRep(repName).baseRate;
}

// Mutates the rules object's perRep[repName].baseRate. Audits the change
// with the same shape as the pre-Phase-1 audit hook so the existing
// audit-page filtering by `commission.rules_updated` still cleanly
// segments rate changes.
function setRepRate(repName, pct) {
  var rules = getCommissionRules();
  var prevPct = (rules.perRep && rules.perRep[repName] && rules.perRep[repName].baseRate != null)
    ? rules.perRep[repName].baseRate
    : null;
  var newPct = parseFloat(pct);
  if (isNaN(newPct)) newPct = 0;
  if (!rules.perRep) rules.perRep = {};
  if (!rules.perRep[repName]) rules.perRep[repName] = {};
  rules.perRep[repName].baseRate = newPct;
  saveCommissionRules(rules, {
    summary: repName + ' commission rate: ' + (prevPct == null ? '—' : prevPct + '%') + ' → ' + newPct + '%',
    before: { repName: repName, ratePct: prevPct },
    after:  { repName: repName, ratePct: newPct },
    metadata: { kind: 'per_rep_base_rate', repName: repName },
  });
  addToast(repName + ' commission set to ' + pct + '%', 'success');
  renderPage();
}

// ════════════════════════════════════════════════════════════════════════════
// SETTINGS HELPERS (Brief 4 Phase 5)
// ════════════════════════════════════════════════════════════════════════════
//
// Concise wrappers used by the "Commission Rules" tab in Settings. Each
// helper loads rules, mutates the relevant slice, and persists via
// saveCommissionRules — which writes the audit entry. Empty-string /
// null inputs on per-rep / per-branch overrides clear the field so it
// falls back to defaults via getEffectiveRuleForRep's merge order.

function _commValidGate(g) {
  return g === 'won' || g === 'final_signed' || g === 'final_payment';
}

function setCommissionDefault(field, value) {
  if (field !== 'baseRate' && field !== 'ageThresholdDays' && field !== 'agePenaltyPct' && field !== 'realisationGate') return;
  var rules = getCommissionRules();
  var prev = rules.defaults[field];
  var next;
  if (field === 'realisationGate') {
    if (!_commValidGate(value)) { addToast('Invalid gate value', 'error'); return; }
    next = value;
  } else {
    next = parseFloat(value);
    if (isNaN(next) || next < 0) { addToast('Invalid number', 'error'); return; }
  }
  if (prev === next) return; // no-op — don't pollute audit log with no-changes
  rules.defaults[field] = next;
  saveCommissionRules(rules, {
    summary: 'Default ' + field + ': ' + (prev == null ? '—' : prev) + ' → ' + next,
    before: { defaults: { field: field, value: prev } },
    after:  { defaults: { field: field, value: next } },
    metadata: { kind: 'default', field: field },
  });
  addToast('Default ' + field + ' updated', 'success');
  renderPage();
}

// Set a per-rep override field. Empty / null value clears the field
// (falls back to defaults via the merge order). Pass field='__delete'
// to wipe the entire perRep[repName] entry.
function setCommissionPerRep(repName, field, value) {
  if (!repName) return;
  var rules = getCommissionRules();
  if (!rules.perRep[repName]) rules.perRep[repName] = {};
  var rec = rules.perRep[repName];
  var prev = rec[field];
  var next;
  if (value === '' || value == null) {
    // Clear the field — caller wants to fall back to default.
    delete rec[field];
    next = null;
  } else if (field === 'realisationGate') {
    if (!_commValidGate(value)) { addToast('Invalid gate value', 'error'); return; }
    next = value;
    rec[field] = next;
  } else {
    next = parseFloat(value);
    if (isNaN(next) || next < 0) { addToast('Invalid number', 'error'); return; }
    rec[field] = next;
  }
  // If the per-rep record is now empty, drop it so getEffectiveRuleForRep
  // cleanly falls through to defaults / perBranch.
  if (Object.keys(rec).length === 0) delete rules.perRep[repName];
  if (prev === next) return; // no-op
  saveCommissionRules(rules, {
    summary: repName + ' ' + field + ': ' + (prev == null ? '—' : prev) + ' → ' + (next == null ? '(use default)' : next),
    before: { repName: repName, field: field, value: prev == null ? null : prev },
    after:  { repName: repName, field: field, value: next },
    metadata: { kind: 'per_rep_override', repName: repName, field: field },
  });
  addToast(repName + ' ' + field + ' updated', 'success');
  renderPage();
}

// Per-branch baseRate override. Same clear-on-empty semantics as per-rep.
function setCommissionPerBranch(branchCode, value) {
  if (!branchCode) return;
  var rules = getCommissionRules();
  if (!rules.perBranch[branchCode]) rules.perBranch[branchCode] = {};
  var rec = rules.perBranch[branchCode];
  var prev = rec.baseRate;
  var next;
  if (value === '' || value == null) {
    delete rec.baseRate;
    next = null;
  } else {
    next = parseFloat(value);
    if (isNaN(next) || next < 0) { addToast('Invalid number', 'error'); return; }
    rec.baseRate = next;
  }
  if (Object.keys(rec).length === 0) delete rules.perBranch[branchCode];
  if (prev === next) return;
  saveCommissionRules(rules, {
    summary: branchCode + ' branch baseRate: ' + (prev == null ? '—' : prev + '%') + ' → ' + (next == null ? '(use default)' : next + '%'),
    before: { branchCode: branchCode, baseRate: prev == null ? null : prev },
    after:  { branchCode: branchCode, baseRate: next },
    metadata: { kind: 'per_branch_base_rate', branchCode: branchCode },
  });
  addToast(branchCode + ' rate updated', 'success');
  renderPage();
}

// ── Product multipliers ─────────────────────────────────────────────────────
function addCommissionMultiplier() {
  var rules = getCommissionRules();
  rules.productMultipliers.push({ productKey: '', label: 'New product', multiplier: 1.0 });
  saveCommissionRules(rules, {
    summary: 'Added new product multiplier row',
    metadata: { kind: 'product_multiplier_added' },
  });
  renderPage();
}
function removeCommissionMultiplier(idx) {
  var rules = getCommissionRules();
  if (idx < 0 || idx >= rules.productMultipliers.length) return;
  var removed = rules.productMultipliers[idx];
  if (removed && removed.productKey === '_default') {
    addToast("Cannot remove the '_default' multiplier — it's the catch-all", 'error');
    return;
  }
  rules.productMultipliers.splice(idx, 1);
  saveCommissionRules(rules, {
    summary: "Removed product multiplier '" + (removed && removed.productKey) + "'",
    before: { multiplier: removed },
    metadata: { kind: 'product_multiplier_removed' },
  });
  addToast('Multiplier removed', 'warning');
  renderPage();
}
function setCommissionMultiplier(idx, field, value) {
  if (field !== 'productKey' && field !== 'label' && field !== 'multiplier') return;
  var rules = getCommissionRules();
  if (idx < 0 || idx >= rules.productMultipliers.length) return;
  var row = rules.productMultipliers[idx];
  var prev = row[field];
  var next = (field === 'multiplier') ? parseFloat(value) : String(value || '');
  if (field === 'multiplier' && (isNaN(next) || next < 0)) { addToast('Invalid multiplier', 'error'); return; }
  if (prev === next) return;
  row[field] = next;
  saveCommissionRules(rules, {
    summary: "Multiplier '" + (row.productKey || '?') + "' " + field + ': ' + (prev == null ? '—' : prev) + ' → ' + next,
    before: { idx: idx, field: field, value: prev },
    after:  { idx: idx, field: field, value: next },
    metadata: { kind: 'product_multiplier_edited', productKey: row.productKey || null, field: field },
  });
  addToast('Multiplier updated', 'success');
  renderPage();
}

// ── Volume bonuses ──────────────────────────────────────────────────────────
function addCommissionBonus() {
  var rules = getCommissionRules();
  rules.volumeBonuses.push({ threshold: 0, bonusPct: 0 });
  saveCommissionRules(rules, {
    summary: 'Added new volume bonus row',
    metadata: { kind: 'volume_bonus_added' },
  });
  renderPage();
}
function removeCommissionBonus(idx) {
  var rules = getCommissionRules();
  if (idx < 0 || idx >= rules.volumeBonuses.length) return;
  var removed = rules.volumeBonuses[idx];
  rules.volumeBonuses.splice(idx, 1);
  saveCommissionRules(rules, {
    summary: 'Removed volume bonus (threshold $' + (removed && removed.threshold) + ')',
    before: { bonus: removed },
    metadata: { kind: 'volume_bonus_removed' },
  });
  addToast('Bonus removed', 'warning');
  renderPage();
}
function setCommissionBonus(idx, field, value) {
  if (field !== 'threshold' && field !== 'bonusPct') return;
  var rules = getCommissionRules();
  if (idx < 0 || idx >= rules.volumeBonuses.length) return;
  var row = rules.volumeBonuses[idx];
  var prev = row[field];
  var next = parseFloat(value);
  if (isNaN(next) || next < 0) { addToast('Invalid number', 'error'); return; }
  if (prev === next) return;
  row[field] = next;
  saveCommissionRules(rules, {
    summary: 'Volume bonus ' + field + ': ' + (prev == null ? '—' : prev) + ' → ' + next,
    before: { idx: idx, field: field, value: prev },
    after:  { idx: idx, field: field, value: next },
    metadata: { kind: 'volume_bonus_edited', field: field },
  });
  addToast('Bonus updated', 'success');
  renderPage();
}

// ════════════════════════════════════════════════════════════════════════════
// CALC ENGINE (Brief 4 Phase 2)
// ════════════════════════════════════════════════════════════════════════════
//
// `calcDealCommission(deal)` is the new full-fat calc that applies all
// configured factors and returns a breakdown the UI can render.
//
// Pipeline:
//   1. exGst    = dealVal / 1.1
//   2. baseRate = getEffectiveRuleForRep(deal.rep, deal.branch).baseRate
//   3. multiplier = weighted-average product multiplier across the deal's
//      relevant quote (wonQuoteId for won, activeQuoteId for open)
//   4. volumeBonus = highest tripped bonus from this rep's PRIOR won deals
//      in the same calendar month (subsequent-only — see gotcha below)
//   5. agePenalty = applied when daysFromQuoteEntry > ageThresholdDays
//   6. effectiveRate = max(0, baseRate + volumeBonusPct - agePenaltyPct)
//   7. commission   = exGst × (effectiveRate / 100) × multiplier
//
// Volume bonus recursion: the brief flagged that "exceeds threshold → bonus"
// is recursive (does the trigger deal itself benefit, or only the next
// one?). Picking "subsequent only — never the trigger" — it's the only
// choice without a time-paradox. We sum the rep's PRIOR won deals in the
// month (wonDate strictly before this deal's wonDate) and ignore this
// deal's own value when checking against the threshold.
//
// Age penalty fallback: pre-Phase-2 deals don't have stageHistory written.
// `_getAgeAnchorDate(deal)` falls back to `deal.created` so legacy deals
// don't get arbitrarily penalised by missing data. Fresh deals (created
// after this PR ships) accumulate stage-entry timestamps via
// `moveDealToStage` and get accurate age measurements.
//
// Product multiplier weighting: the brief specified `lineTotal` per
// projectItem, but the actual quote shape stores only a quote-level
// totalPrice — no per-item pricing. Weighting by item count is the
// pragmatic substitute (each frame contributes equally to the average).
// A future "weight by area" toggle could surface in Phase 5 Settings if
// the team wants per-frame area weighting.

// Whole-day diff between two ISO date strings (YYYY-MM-DD). Negative inputs
// clamp to 0 — calc engine should never report negative ages.
function _daysBetween(isoStart, isoEnd) {
  if (!isoStart || !isoEnd) return null;
  var s = new Date(String(isoStart).slice(0, 10) + 'T00:00:00Z').getTime();
  var e = new Date(String(isoEnd  ).slice(0, 10) + 'T00:00:00Z').getTime();
  if (isNaN(s) || isNaN(e)) return null;
  return Math.max(0, Math.round((e - s) / 86400000));
}

// Resolve the "active sales engagement" stage entry timestamp for a deal.
// The actual seed pipelines have no stage literally named QuoteBooked —
// "Quote Sent" (residential s3) and "Proposal Sent" (commercial s9) are
// the equivalents. We match on /quote|proposal/i so custom pipelines with
// alternate naming (e.g. "Quote Issued") still work without code changes.
// Returns ISO date (YYYY-MM-DD) or null. Falls back to deal.created when
// stageHistory hasn't been populated yet.
function _getAgeAnchorDate(deal) {
  if (!deal) return null;
  if (deal.stageHistory && typeof PIPELINES !== 'undefined') {
    var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
    if (pl && Array.isArray(pl.stages)) {
      var ageStage = pl.stages.find(function (s) {
        return /quote|proposal/i.test(s.name || '');
      });
      if (ageStage && deal.stageHistory[ageStage.id]) {
        return String(deal.stageHistory[ageStage.id]).slice(0, 10);
      }
    }
  }
  return (deal.created || '').slice(0, 10) || null;
}

// Compute the weighted-average product multiplier across the deal's
// relevant quote. Returns 1.0 (multiplier identity) when no quote / no
// items are present. See the section comment above for the
// "weight by item count" rationale.
function _computeProductMultiplier(deal, productMultipliers) {
  productMultipliers = productMultipliers || [];
  var multByKey = {};
  productMultipliers.forEach(function (m) {
    if (m && m.productKey) multByKey[m.productKey] = (typeof m.multiplier === 'number') ? m.multiplier : 1.0;
  });
  var defaultMult = (multByKey['_default'] != null) ? multByKey['_default'] : 1.0;

  // Pick the relevant quote: won → wonQuoteId; open → activeQuoteId; else first.
  var quotes = (deal && Array.isArray(deal.quotes)) ? deal.quotes : [];
  var quote = null;
  if (deal && deal.wonQuoteId) quote = quotes.find(function (q) { return q && q.id === deal.wonQuoteId; });
  if (!quote && deal && deal.activeQuoteId) quote = quotes.find(function (q) { return q && q.id === deal.activeQuoteId; });
  if (!quote && quotes.length > 0) quote = quotes[0];
  if (!quote || !Array.isArray(quote.projectItems) || quote.projectItems.length === 0) {
    return defaultMult;
  }

  // Weighted average — each frame counts as 1 weight unit (no per-item
  // pricing in the quote shape). productType missing on a frame falls
  // through to the _default multiplier.
  var totalWeight = 0, weightedSum = 0;
  quote.projectItems.forEach(function (item) {
    var weight = 1;
    var pt = (item && item.productType) ? item.productType : '_default';
    var mult = (multByKey[pt] != null) ? multByKey[pt] : defaultMult;
    weightedSum += weight * mult;
    totalWeight += weight;
  });
  return totalWeight > 0 ? weightedSum / totalWeight : defaultMult;
}

// Compute the rep's volume bonus for this deal. Subsequent-only: this
// deal's own value never counts towards its own threshold. Reads the
// rep's PRIOR won deals in the same calendar month (wonDate strictly
// less than this deal's wonDate; if this deal isn't won yet, we use the
// deal's `created` as the anchor for projection purposes).
//
// `allDeals` is injected so unit tests can pass a controlled deal array
// without going through the global getState().
function _computeVolumeBonusPct(deal, volumeBonuses, allDeals) {
  if (!Array.isArray(volumeBonuses) || volumeBonuses.length === 0) return 0;
  if (!deal || !deal.rep) return 0;
  var anchorIso = (deal.wonDate || deal.created || '').slice(0, 10);
  if (!anchorIso) return 0;
  var anchorMonth = anchorIso.slice(0, 7);

  if (!Array.isArray(allDeals)) {
    allDeals = (typeof getState === 'function' && getState().deals) ? getState().deals : [];
  }
  var monthlyTotalExGst = 0;
  allDeals.forEach(function (d) {
    if (!d || d === deal || (deal.id && d.id === deal.id)) return; // skip self
    if (d.rep !== deal.rep) return;
    if (!d.won || !d.wonDate) return;
    var wd = String(d.wonDate).slice(0, 10);
    if (wd.slice(0, 7) !== anchorMonth) return;
    if (wd >= anchorIso) return; // strictly prior
    monthlyTotalExGst += (d.val || 0) / 1.1;
  });

  // Find the highest tripped bonus.
  var sorted = volumeBonuses.slice().sort(function (a, b) {
    return (b.threshold || 0) - (a.threshold || 0);
  });
  for (var i = 0; i < sorted.length; i++) {
    if (monthlyTotalExGst >= (sorted[i].threshold || 0)) {
      return sorted[i].bonusPct || 0;
    }
  }
  return 0;
}

// Compute the age penalty for a deal. Returns {daysToWin, penaltyPct}.
// daysToWin is null when we can't resolve the anchor date; in that case
// no penalty applies.
function _computeAgePenalty(deal, rule) {
  var threshold = (rule && rule.ageThresholdDays != null) ? rule.ageThresholdDays : 0;
  var penalty   = (rule && rule.agePenaltyPct   != null) ? rule.agePenaltyPct   : 0;
  if (!threshold || !penalty) return { daysToWin: null, penaltyPct: 0 };
  var anchor = _getAgeAnchorDate(deal);
  // For open deals (no wonDate yet) the projection compares against today.
  // For won deals it compares against the actual wonDate.
  var endDate = (deal && deal.wonDate) ? deal.wonDate : new Date().toISOString().slice(0, 10);
  var daysToWin = _daysBetween(anchor, endDate);
  if (daysToWin == null) return { daysToWin: null, penaltyPct: 0 };
  if (daysToWin <= threshold) return { daysToWin: daysToWin, penaltyPct: 0 };
  return { daysToWin: daysToWin, penaltyPct: penalty };
}

// Public — compute commission for a deal record. Returns the full
// breakdown shape Phase 6's UI will surface in the hover popover.
// Pre-Phase-2 callers use the legacy `calcCommission(dealVal, repName)`
// shim below — that returns the simpler {exGst, rate, commission} shape
// without multipliers/bonuses/penalties (it doesn't have access to the
// quote / wonDate / stageHistory it would need).
function calcDealCommission(deal, opts) {
  opts = opts || {};
  if (!deal) {
    return {
      exGst: 0, baseRate: 0, productMultiplier: 1.0, volumeBonusPct: 0,
      agePenaltyPct: 0, effectiveRate: 0, commission: 0,
      // Legacy field — keeps {exGst,rate,commission} consumers working.
      rate: 0,
      breakdown: [],
      meta: { reason: 'no-deal' },
    };
  }
  var rules = getCommissionRules();
  var rule  = getEffectiveRuleForRep(deal.rep, deal.branch);
  var exGst = (deal.val || 0) / 1.1;
  var baseRate = (typeof rule.baseRate === 'number') ? rule.baseRate : 0;

  var productMultiplier = _computeProductMultiplier(deal, rules.productMultipliers || []);
  var volumeBonusPct    = _computeVolumeBonusPct(deal, rules.volumeBonuses || [], opts.allDeals);
  var ageInfo           = _computeAgePenalty(deal, rule);
  var agePenaltyPct     = ageInfo.penaltyPct;

  var effectiveRate = Math.max(0, baseRate + volumeBonusPct - agePenaltyPct);
  var commission = exGst * (effectiveRate / 100) * productMultiplier;

  // Build the breakdown array for the UI. Only include lines that actually
  // affect the result so the popover stays compact for the common case.
  var breakdown = [];
  breakdown.push({ label: 'Ex-GST value', value: '$' + exGst.toFixed(2) });
  breakdown.push({ label: 'Base rate',    value: baseRate + '%' });
  if (volumeBonusPct > 0) {
    breakdown.push({ label: 'Volume bonus (target hit)', value: '+' + volumeBonusPct + '%' });
  }
  if (agePenaltyPct > 0 && ageInfo.daysToWin != null) {
    breakdown.push({ label: 'Age penalty (' + ageInfo.daysToWin + ' days)', value: '-' + agePenaltyPct + '%' });
  }
  breakdown.push({ label: 'Effective rate', value: effectiveRate + '%' });
  if (productMultiplier !== 1.0) {
    breakdown.push({ label: 'Product multiplier', value: '×' + parseFloat(productMultiplier.toFixed(3)) });
  }
  breakdown.push({ label: 'Commission', value: '$' + commission.toFixed(2) });

  return {
    exGst: exGst,
    baseRate: baseRate,
    productMultiplier: productMultiplier,
    volumeBonusPct: volumeBonusPct,
    agePenaltyPct: agePenaltyPct,
    effectiveRate: effectiveRate,
    commission: commission,
    // Legacy field for backward compat with pre-Phase-2 consumers.
    rate: baseRate,
    breakdown: breakdown,
    meta: { daysToWin: ageInfo.daysToWin },
  };
}

// DEPRECATED — pre-Phase-2 wrapper. Returns the legacy {exGst, rate,
// commission} shape using only the rep's base rate. Multipliers,
// volume bonuses, and age penalties require the full deal record so
// can't be computed from val + repName alone — call calcDealCommission(deal)
// instead. Kept as a wrapper so the existing renderCommissionPage call
// sites (rep cards, totals, deals table) keep working unchanged until
// Phase 6 surfaces the breakdown in the UI.
function calcCommission(dealVal, repName) {
  var exGst = (dealVal || 0) / 1.1;
  var rate = getRepRate(repName);
  return { exGst: exGst, rate: rate, commission: exGst * rate / 100 };
}

// Brief 4 Phase 3: only flips between realised ↔ paid. Trying to pay
// an accrued (gate not yet fired) deal must error out with a hint about
// which gate needs to fire first. The unified-audit-log entries continue
// to use commission.paid / commission.unpaid action keys; the legacy
// spartan_commission_audit array stays in place for the existing audit
// subsection in renderCommissionPage.
function toggleCommissionPaid(dealId) {
  var cu = getCurrentUser() || {};
  if (cu.role !== 'admin' && cu.role !== 'accounts') { addToast('Only Admin or Accounts can change payment status', 'error'); return; }
  var deal = (getState().deals || []).find(function(d){ return d.id === dealId; });

  // Lazy accrual handling: a deal that's Won but somehow has no status
  // record (legacy data, or a setState replay before accrueCommission
  // fired) needs accruing first. We DON'T auto-accrue silently because
  // that would mask state-machine bugs; instead, hint the user.
  var rec = getCommissionStatusForDeal(dealId);
  if (!rec) {
    if (deal && deal.won) {
      addToast('Commission not yet accrued for this deal. Re-mark Won to accrue, then try again.', 'error');
    } else {
      addToast('Commission can only be paid on a Won deal', 'error');
    }
    return;
  }

  // Phase 3 contract: paying an accrued deal directly is blocked.
  if (rec.state === 'accrued') {
    var rule = (typeof getEffectiveRuleForRep === 'function')
      ? getEffectiveRuleForRep(deal ? deal.rep : null, deal ? deal.branch : null)
      : { realisationGate: 'unknown' };
    addToast('Commission must be realised first (gate: ' + rule.realisationGate + ')', 'error');
    return;
  }

  // realised ↔ paid toggle
  var oldState = rec.state;
  var newState = oldState === 'paid' ? 'realised' : 'paid';
  var nowIso = new Date().toISOString();
  var status = getCommissionStatus();
  status[dealId] = Object.assign({}, rec, {
    state: newState,
    paidAt: newState === 'paid' ? nowIso : null,
    paidBy: newState === 'paid' ? cu.name : null,
    // Mark legacy origin so Phase 7's pay-run backfill can identify
    // entries that were paid via the toggle (vs via a Pay Run).
    payRunId: newState === 'paid' ? (rec.payRunId || null) : null,
  });
  saveCommissionStatus(status);

  // Legacy in-page audit subsection still reads spartan_commission_audit.
  // Translate to the old vocabulary so its rendering stays unchanged.
  var legacyAudit = getCommissionAudit();
  legacyAudit.unshift({
    timestamp: nowIso,
    dealId: dealId,
    dealTitle: deal ? deal.title : dealId,
    repName: deal ? deal.rep : '—',
    value: deal ? deal.val : 0,
    action: newState === 'paid' ? 'Marked PAID' : 'Marked UNPAID',
    by: cu.name,
    oldStatus: oldState === 'paid' ? 'paid' : 'unpaid',
    newStatus: newState === 'paid' ? 'paid' : 'unpaid',
  });
  saveCommissionAudit(legacyAudit);

  // Unified audit log (Brief 2 Phase 2). Action key stays the same so
  // existing Audit-page filtering by commission.paid / commission.unpaid
  // continues to work. Before/after now expose state strings instead of
  // the legacy paid/unpaid pair.
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType: 'commission', entityId: dealId,
      action: newState === 'paid' ? 'commission.paid' : 'commission.unpaid',
      summary: (newState === 'paid' ? 'Marked' : 'Reverted') + ' commission ' + (newState === 'paid' ? 'PAID' : 'UNPAID') + ': ' + (deal ? deal.title : dealId),
      before: { state: oldState }, after: { state: newState },
      branch: deal ? (deal.branch || null) : null,
    });
  }
  addToast('Commission ' + (newState === 'paid' ? 'paid' : 'reverted to realised'), newState === 'paid' ? 'success' : 'warning');
  renderPage();
}

// Commission page state
var commRepFilter = 'all';
var commStatusFilter = 'all';
var commDateFilter = 'all';
var commTab = 'overview';
var OVERRIDE_RATE = 1;

function getOverridePaid() { try { return JSON.parse(localStorage.getItem('spartan_override_paid') || '{}'); } catch(e){ return {}; } }
function saveOverridePaid(d) { localStorage.setItem('spartan_override_paid', JSON.stringify(d)); }

function toggleOverridePaid(monthKey) {
  var cu = getCurrentUser() || {};
  if (cu.role !== 'admin' && cu.role !== 'accounts') { addToast('Only Admin or Accounts can change override status', 'error'); return; }
  var op = getOverridePaid();
  var oldStatus = op[monthKey] ? op[monthKey].status : 'unpaid';
  var newStatus = oldStatus === 'paid' ? 'unpaid' : 'paid';
  op[monthKey] = { status: newStatus, paidDate: newStatus === 'paid' ? new Date().toISOString().slice(0,10) : null, paidBy: cu.name };
  saveOverridePaid(op);
  var audit = getCommissionAudit();
  audit.unshift({ timestamp: new Date().toISOString(), dealId: 'override_' + monthKey, dealTitle: 'Manager Override \u2014 ' + monthKey, repName: 'Sales Manager', value: 0, action: newStatus === 'paid' ? 'Override PAID' : 'Override UNPAID', by: cu.name, oldStatus: oldStatus, newStatus: newStatus });
  saveCommissionAudit(audit);
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'commission', entityId:'override_'+monthKey,
      action: newStatus === 'paid' ? 'commission.paid' : 'commission.unpaid',
      summary: (newStatus === 'paid' ? 'Marked' : 'Reverted') + ' Manager Override ' + newStatus.toUpperCase() + ': ' + monthKey,
      before:{ status:oldStatus }, after:{ status:newStatus },
      metadata:{ kind:'manager_override', monthKey:monthKey },
    });
  }
  addToast('Override ' + monthKey + ' ' + newStatus, newStatus === 'paid' ? 'success' : 'warning');
  renderPage();
}

function getSalesManager() { return getUsers().find(function(u){ return u.role === 'sales_manager' && u.active; }); }

function renderCommissionPage() {
  var cu = getCurrentUser() || {role:'viewer',name:'',id:''};
  var isAdmin = cu.role === 'admin' || cu.role === 'accounts';
  var isManager = cu.role === 'sales_manager';
  var isRep = cu.role === 'sales_rep';
  var canSeeOverride = isAdmin || isManager;
  var allWon = getState().deals.filter(function(d){ return d.won; });
  var contacts = getState().contacts;
  var paid = getCommissionPaid();
  var now = new Date();
  var thisMonth = now.getMonth(), thisYear = now.getFullYear();

  // Reps and managers see only own deals; admin sees all
  var visibleDeals = isAdmin ? allWon : allWon.filter(function(d){ return d.rep === cu.name; });

  // Date filter
  var filtered = visibleDeals;
  if (commDateFilter !== 'all') {
    filtered = filtered.filter(function(d) {
      if (!d.wonDate) return false;
      var wd = new Date(d.wonDate + 'T12:00:00');
      if (commDateFilter === 'thisMonth') return wd.getMonth()===thisMonth&&wd.getFullYear()===thisYear;
      if (commDateFilter === 'lastMonth') { var lm=thisMonth===0?11:thisMonth-1,ly=thisMonth===0?thisYear-1:thisYear; return wd.getMonth()===lm&&wd.getFullYear()===ly; }
      if (commDateFilter === 'thisQuarter') { var q=Math.floor(thisMonth/3); return Math.floor(wd.getMonth()/3)===q&&wd.getFullYear()===thisYear; }
      if (commDateFilter === 'thisYear') return wd.getFullYear()===thisYear;
      if (commDateFilter === 'last6') return wd.getTime()>Date.now()-180*24*3600000;
      return true;
    });
  }
  if (isAdmin && commRepFilter!=='all') filtered = filtered.filter(function(d){ return d.rep===commRepFilter; });
  if (commStatusFilter==='paid') filtered = filtered.filter(function(d){ return paid[d.id]&&paid[d.id].status==='paid'; });
  if (commStatusFilter==='unpaid') filtered = filtered.filter(function(d){ return !(paid[d.id]&&paid[d.id].status==='paid'); });
  filtered.sort(function(a,b){ return (b.wonDate||'').localeCompare(a.wonDate||''); });

  // Totals
  var totalComm=0,totalPaid=0,totalUnpaid=0;
  filtered.forEach(function(d){ var c=calcCommission(d.val,d.rep); totalComm+=c.commission; if(paid[d.id]&&paid[d.id].status==='paid')totalPaid+=c.commission; else totalUnpaid+=c.commission; });

  var reps=[];
  allWon.forEach(function(d){ if(d.rep&&reps.indexOf(d.rep)<0) reps.push(d.rep); });

  // Rep cards (admin overview)
  var repCards='';
  if (isAdmin && commTab==='overview') {
    repCards='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-bottom:20px">'
      +reps.map(function(rep){
        var rd=allWon.filter(function(d){return d.rep===rep;}),rt=0,rp=0,ru=0;
        rd.forEach(function(d){var c=calcCommission(d.val,rep);rt+=c.commission;if(paid[d.id]&&paid[d.id].status==='paid')rp+=c.commission;else ru+=c.commission;});
        return '<div class="card" style="padding:16px;cursor:pointer;border:2px solid '+(commRepFilter===rep?'#c41230':'transparent')+'" onclick="commRepFilter='+(commRepFilter===rep?"'all'":"'"+rep+"'")+';renderPage()">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:14px;font-weight:700">'+rep+'</div><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#dbeafe;color:#1d4ed8">'+getRepRate(rep)+'%</span></div>'
          +'<div style="font-size:20px;font-weight:800;color:#15803d;font-family:Syne,sans-serif">'+fmt$(rt)+'</div>'
          +'<div style="display:flex;gap:12px;font-size:11px;margin-top:4px"><span style="color:#15803d">\u2713 '+fmt$(rp)+'</span><span style="color:#dc2626">\u2717 '+fmt$(ru)+'</span></div>'
          +'<div style="font-size:11px;color:#9ca3af;margin-top:4px">'+rd.length+' deal'+(rd.length!==1?'s':'')+'</div></div>';
      }).join('')+'</div>';
  }

  // Deals table — with job status pipeline
  var jobs = getState().jobs || [];
  var factoryOrders = getFactoryOrders();

  // Helper: get job + status for a deal
  function getDealJobStatus(deal) {
    var job = jobs.find(function(j){ return j.dealId === deal.id; });
    if (!job) return {job:null,stage:'no_job',label:'No Job Created',col:'#9ca3af',icon:'\u23f3',pct:0};
    var fo = factoryOrders.find(function(o){ return o.crmJobId === job.id || o.jid === job.jobNumber; });
    var stages = [
      {key:'won',label:'Won',done:true,col:'#22c55e'},
      {key:'cm',label:'Check Measure',done:!!job.cmCompletedAt,col:'#3b82f6'},
      {key:'final',label:'Final Design',done:!!job.finalSignedAt,col:'#6366f1'},
      {key:'production',label:'In Production',done:!!(fo && fo.status && fo.status !== 'received' && fo.status !== 'bom_generated'),col:'#a855f7'},
      {key:'install',label:'Installed',done:!!job.installCompletedAt || (job.status && job.status.includes('completed')),col:'#06b6d4'},
      {key:'complete',label:'Complete',done:job.status==='completed'||job.status==='h_completed_standard',col:'#22c55e'},
    ];
    var currentIdx = 0;
    for (var si = stages.length-1; si >= 0; si--) { if (stages[si].done) { currentIdx = si; break; } }
    var current = stages[currentIdx];
    var isDue = stages[2].done && (stages[3].done || !!fo); // Final design signed AND (in production or has factory order)
    return {job:job,fo:fo,stages:stages,currentIdx:currentIdx,stage:current.key,label:current.label,col:current.col,isDue:isDue,pct:Math.round((currentIdx+1)/stages.length*100),jobNumber:job.jobNumber||''};
  }

  // Commission due filter
  if (commStatusFilter === 'due') filtered = filtered.filter(function(d){ var js=getDealJobStatus(d); return js.isDue && !(paid[d.id]&&paid[d.id].status==='paid'); });
  if (commStatusFilter === 'pending') filtered = filtered.filter(function(d){ var js=getDealJobStatus(d); return !js.isDue && !(paid[d.id]&&paid[d.id].status==='paid'); });

  // Recalc totals with due logic
  var totalDue=0,totalPending=0;
  totalComm=0;totalPaid=0;totalUnpaid=0;
  filtered.forEach(function(d){
    var c=calcCommission(d.val,d.rep);var js=getDealJobStatus(d);totalComm+=c.commission;
    if(paid[d.id]&&paid[d.id].status==='paid')totalPaid+=c.commission;
    else if(js.isDue){totalDue+=c.commission;totalUnpaid+=c.commission;}
    else{totalPending+=c.commission;totalUnpaid+=c.commission;}
  });

  var table='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">'
    +'<div class="card" style="padding:14px 16px;border-left:4px solid #22c55e"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">\u2705 Paid</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:4px">'+fmt$(totalPaid)+'</div></div>'
    +'<div class="card" style="padding:14px 16px;border-left:4px solid #c41230"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">\ud83d\udcb0 Due (Ready to Pay)</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:4px">'+fmt$(totalDue)+'</div></div>'
    +'<div class="card" style="padding:14px 16px;border-left:4px solid #f59e0b"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">\u23f3 Pending (Not Yet Due)</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#f59e0b;margin-top:4px">'+fmt$(totalPending)+'</div></div>'
    +'<div class="card" style="padding:14px 16px;border-left:4px solid #374151"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Total Earned</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#374151;margin-top:4px">'+fmt$(totalComm)+'</div></div></div>';

  table+='<div style="padding:10px 16px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;margin-bottom:14px;font-size:12px;color:#92400e">\ud83d\udcb0 <strong>Commission Rule:</strong> Commission is not due until Final Design is signed and the order goes to production. The status tracker below shows where each job is at.</div>';

  table+='<div class="card" style="overflow-x:auto;padding:0"><table style="width:100%;border-collapse:collapse"><thead><tr>'
    +'<th class="th">Deal</th><th class="th">Job</th><th class="th">Contact</th>'
    +'<th class="th" style="text-align:right">Value</th><th class="th" style="text-align:center">Rate</th><th class="th" style="text-align:right">Commission</th>'
    +(isAdmin?'<th class="th">Rep</th>':'')+'<th class="th">Won</th><th class="th" style="min-width:220px">Job Status</th><th class="th" style="text-align:center">Payment</th>'
    +(isAdmin?'<th class="th" style="text-align:center">Action</th>':'')+'</tr></thead><tbody>';
  if(filtered.length===0) table+='<tr><td colspan="'+(isAdmin?11:9)+'" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:28px;margin-bottom:8px">\ud83d\udcb0</div>No commission data'+(commDateFilter!=='all'||commStatusFilter!=='all'?' matching filters':'')+'</td></tr>';
  else filtered.forEach(function(d){
    var ct=contacts.find(function(x){return x.id===d.cid;}),cName=ct?ct.fn+' '+ct.ln:'\u2014';
    var comm=calcCommission(d.val,d.rep),isPaid=paid[d.id]&&paid[d.id].status==='paid';
    var wonFmt=d.wonDate||'\u2014'; try{wonFmt=new Date(d.wonDate+'T12:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short'});}catch(e){}
    var js=getDealJobStatus(d);

    // Status pipeline mini-tracker
    var pipeline='<div style="display:flex;gap:2px;align-items:center">';
    if(js.job){
      js.stages.forEach(function(st,si){
        var active=si<=js.currentIdx;
        pipeline+='<div title="'+st.label+(st.done?' \u2705':'')+'" style="height:6px;flex:1;border-radius:3px;background:'+(active?st.col+'':'#e5e7eb')+'"></div>';
      });
      pipeline+='</div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">'
        +'<span style="font-size:10px;font-weight:700;color:'+js.col+'">'+js.label+'</span>'
        +'<span style="font-size:9px;color:#9ca3af">'+js.pct+'%</span></div>';
    } else {
      pipeline+='<span style="font-size:10px;color:#9ca3af">\u23f3 No job yet</span></div>';
    }

    // Payment status badge
    var payBadge;
    if(isPaid) payBadge='<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#dcfce7;color:#15803d">\u2713 Paid</span>'+(paid[d.id].paidDate?'<div style="font-size:9px;color:#9ca3af;margin-top:2px">'+paid[d.id].paidDate+'</div>':'');
    else if(js.isDue) payBadge='<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#fef2f2;color:#c41230;border:1px solid #fca5a5">\ud83d\udcb0 DUE</span>';
    else payBadge='<span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#fef9c3;color:#92400e;border:1px solid #fde68a">\u23f3 Pending</span>';

    table+='<tr style="'+(js.isDue&&!isPaid?'background:#fff7ed':'')+'"><td class="td"><div style="font-size:13px;font-weight:600;cursor:pointer;color:#c41230" onclick="setState({dealDetailId:\''+d.id+'\',page:\'deals\'})">'+d.title+'</div></td>'
      +'<td class="td" style="font-size:11px;font-weight:600;color:#3b82f6;cursor:pointer" onclick="'+(js.job?'setState({jobDetailId:\''+js.job.id+'\',page:\'jobs\',crmMode:\'jobs\'})':'')+'">'+(js.jobNumber||'\u2014')+'</td>'
      +'<td class="td" style="font-size:12px;color:#6b7280">'+cName+'</td>'
      +'<td class="td" style="text-align:right;font-size:13px">'+fmt$(d.val)+'</td>'
      +'<td class="td" style="text-align:center;font-size:12px;color:#6b7280">'+comm.rate+'%</td>'
      +'<td class="td" style="text-align:right;font-size:14px;font-weight:700;color:'+(isPaid?'#15803d':js.isDue?'#c41230':'#9ca3af')+';font-family:Syne,sans-serif">'+fmt$(comm.commission)+'</td>'
      +(isAdmin?'<td class="td" style="font-size:12px;color:#6b7280">'+(d.rep||'\u2014')+'</td>':'')
      +'<td class="td" style="font-size:11px;color:#6b7280">'+wonFmt+'</td>'
      +'<td class="td" style="padding:6px 8px">'+pipeline+'</td>'
      +'<td class="td" style="text-align:center">'+payBadge+'</td>'
      +(isAdmin?'<td class="td" style="text-align:center">'+(js.isDue||isPaid?'<button onclick="toggleCommissionPaid(\''+d.id+'\')" class="btn-w" style="font-size:10px;padding:3px 8px">'+(isPaid?'Undo':'Mark Paid')+'</button>':'<span style="font-size:9px;color:#9ca3af">Not yet due</span>')+'</td>':'')+'</tr>';
  });
  table+='</tbody></table></div>';

  // MANAGER OVERRIDE TAB
  var overrideHtml='';
  if(canSeeOverride && commTab==='override'){
    var manager=getSalesManager(),mgrName=manager?manager.name:'No Sales Manager assigned';
    var overridePaid=getOverridePaid(),months={};
    allWon.forEach(function(d){ if(!d.wonDate)return; var key=d.wonDate.slice(0,7); if(!months[key])months[key]={deals:[],totalExGst:0,override:0}; var exGst=d.val/1.1; months[key].deals.push(d); months[key].totalExGst+=exGst; months[key].override+=exGst*OVERRIDE_RATE/100; });
    var monthKeys=Object.keys(months).sort().reverse();
    var totalOv=monthKeys.reduce(function(s,k){return s+months[k].override;},0);
    var totalOvPaid=monthKeys.reduce(function(s,k){return s+(overridePaid[k]&&overridePaid[k].status==='paid'?months[k].override:0);},0);

    overrideHtml='<div class="card" style="padding:18px;margin-bottom:16px;border-left:4px solid #15803d">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><div><div style="font-size:16px;font-weight:700;font-family:Syne,sans-serif">'+mgrName+'</div><div style="font-size:12px;color:#6b7280">'+OVERRIDE_RATE+'% override on all sales (ex-GST) \u2014 paid monthly</div></div></div>'
      +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px">'
      +'<div><div style="font-size:22px;font-weight:800;color:#15803d;font-family:Syne,sans-serif">'+fmt$(totalOvPaid)+'</div><div style="font-size:11px;color:#6b7280">\u2713 Paid</div></div>'
      +'<div><div style="font-size:22px;font-weight:800;color:#dc2626;font-family:Syne,sans-serif">'+fmt$(totalOv-totalOvPaid)+'</div><div style="font-size:11px;color:#6b7280">Owed</div></div>'
      +'<div><div style="font-size:22px;font-weight:800;color:#374151;font-family:Syne,sans-serif">'+fmt$(totalOv)+'</div><div style="font-size:11px;color:#6b7280">Total Override</div></div>'
      +'</div></div>'
      +'<div class="card" style="overflow-x:auto;padding:0"><table style="width:100%;border-collapse:collapse"><thead><tr><th class="th">Month</th><th class="th" style="text-align:center">Deals</th><th class="th" style="text-align:right">Sales (inc GST)</th><th class="th" style="text-align:right">Ex-GST</th><th class="th" style="text-align:center">Rate</th><th class="th" style="text-align:right">Override</th><th class="th" style="text-align:center">Status</th>'+(isAdmin?'<th class="th" style="text-align:center">Action</th>':'')+'</tr></thead><tbody>';
    if(monthKeys.length===0) overrideHtml+='<tr><td colspan="'+(isAdmin?8:7)+'" style="padding:32px;text-align:center;color:#9ca3af">No won deals</td></tr>';
    else monthKeys.forEach(function(mk){
      var m=months[mk],totalInc=m.deals.reduce(function(s,d){return s+d.val;},0);
      var isPd=overridePaid[mk]&&overridePaid[mk].status==='paid';
      var ml=''; try{var p=mk.split('-'); ml=new Date(parseInt(p[0]),parseInt(p[1])-1,1).toLocaleDateString('en-AU',{month:'long',year:'numeric'});}catch(e){ml=mk;}
      overrideHtml+='<tr><td class="td" style="font-size:13px;font-weight:600">'+ml+'</td>'
        +'<td class="td" style="text-align:center">'+m.deals.length+'</td>'
        +'<td class="td" style="text-align:right;font-size:13px">'+fmt$(totalInc)+'</td>'
        +'<td class="td" style="text-align:right;font-size:13px;font-weight:600">'+fmt$(m.totalExGst)+'</td>'
        +'<td class="td" style="text-align:center;font-size:12px;color:#6b7280">'+OVERRIDE_RATE+'%</td>'
        +'<td class="td" style="text-align:right;font-size:14px;font-weight:700;color:'+(isPd?'#15803d':'#c41230')+';font-family:Syne,sans-serif">'+fmt$(m.override)+'</td>'
        +'<td class="td" style="text-align:center"><span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:'+(isPd?'#dcfce7':'#fee2e2')+';color:'+(isPd?'#15803d':'#dc2626')+'">'+(isPd?'\u2713 Paid':'Unpaid')+'</span>'
        +(isPd&&overridePaid[mk].paidDate?'<div style="font-size:10px;color:#9ca3af;margin-top:2px">'+overridePaid[mk].paidDate+'</div>':'')+'</td>'
        +(isAdmin?'<td class="td" style="text-align:center"><button onclick="toggleOverridePaid(\''+mk+'\')" class="btn-w" style="font-size:11px;padding:4px 10px">'+(isPd?'Mark Unpaid':'Mark Paid')+'</button></td>':'')+'</tr>';
    });
    overrideHtml+='</tbody></table></div>'
      +'<div style="margin-top:14px;padding:14px 18px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;font-size:12px;color:#166534">\ud83d\udcb5 The Sales Manager receives <strong>'+OVERRIDE_RATE+'% override</strong> on <strong>all company sales</strong> (ex-GST), paid monthly. This is separate from personal deal commission.</div>';
  }

  // AUDIT LOG
  var auditHtml='';
  if(isAdmin && commTab==='audit'){
    var audit=getCommissionAudit();
    auditHtml='<div class="card" style="overflow-x:auto;padding:0"><table style="width:100%;border-collapse:collapse"><thead><tr><th class="th">Timestamp</th><th class="th">Deal</th><th class="th">Rep</th><th class="th">Action</th><th class="th">Changed By</th><th class="th">Old \u2192 New</th></tr></thead><tbody>';
    if(audit.length===0) auditHtml+='<tr><td colspan="6" style="padding:32px;text-align:center;color:#9ca3af">No audit entries yet</td></tr>';
    else audit.slice(0,200).forEach(function(a){ var ts=''; try{var dt=new Date(a.timestamp);ts=dt.toLocaleDateString('en-AU',{day:'numeric',month:'short'})+' '+dt.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit'});}catch(e){ts=a.timestamp;}
      auditHtml+='<tr><td class="td" style="font-size:12px;color:#6b7280;font-family:monospace">'+ts+'</td><td class="td" style="font-size:12px;font-weight:600">'+(a.dealTitle||'')+'</td><td class="td" style="font-size:12px;color:#6b7280">'+(a.repName||'')+'</td><td class="td" style="font-size:12px;font-weight:600;color:'+(a.newStatus==='paid'?'#15803d':'#dc2626')+'">'+a.action+'</td><td class="td" style="font-size:12px;font-weight:600">'+(a.by||'')+'</td><td class="td"><span style="font-size:11px;padding:2px 8px;border-radius:20px;background:#f3f4f6;color:#6b7280">'+(a.oldStatus||'')+'</span> \u2192 <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:'+(a.newStatus==='paid'?'#dcfce7':'#fee2e2')+';color:'+(a.newStatus==='paid'?'#15803d':'#dc2626')+'">'+(a.newStatus||'')+'</span></td></tr>';
    });
    auditHtml+='</tbody></table></div>';
  }

  // RATES TAB
  var ratesHtml='';
  if(isAdmin && commTab==='rates'){
    var allReps=getUsers().filter(function(u){return u.active&&(u.role==='sales_rep'||u.role==='admin'||u.role==='sales_manager');});
    ratesHtml='<div class="card" style="padding:0;overflow:hidden"><table style="width:100%;border-collapse:collapse"><thead><tr><th class="th">Rep</th><th class="th" style="text-align:center">Rate (%)</th><th class="th">Won Deals</th><th class="th" style="text-align:right">Total Earned</th></tr></thead><tbody>';
    allReps.forEach(function(u){
      var rd=getState().deals.filter(function(d){return d.won&&d.rep===u.name;}),te=rd.reduce(function(s,d){return s+calcCommission(d.val,u.name).commission;},0);
      ratesHtml+='<tr><td class="td"><div style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;background:#c41230;border-radius:50%;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">'+u.initials+'</div><div><div style="font-size:13px;font-weight:600">'+u.name+'</div><div style="font-size:11px;color:#6b7280">'+u.role.replace(/_/g,' ')+'</div></div></div></td>'
        +'<td class="td" style="text-align:center"><input type="number" step="0.5" min="0" max="100" value="'+getRepRate(u.name)+'" style="width:70px;text-align:center;padding:5px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;font-weight:700;font-family:Syne,sans-serif" onchange="setRepRate(\''+u.name.replace(/'/g,"\\'")+'\',this.value)"> %</td>'
        +'<td class="td">'+rd.length+'</td><td class="td" style="text-align:right;font-size:14px;font-weight:700;color:#15803d;font-family:Syne,sans-serif">'+fmt$(te)+'</td></tr>';
    });
    ratesHtml+='</tbody></table></div><div style="margin-top:14px;padding:14px 18px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;font-size:12px;color:#92400e">\u26a0\ufe0f <strong>GST Note:</strong> Commission = (deal value \u00f7 1.1) \u00d7 rate%.</div>';
  }

  // BUILD TABS
  var tabs=[];
  if(isAdmin) tabs=[{id:'overview',label:'\ud83d\udcca Deals & Payments'},{id:'override',label:'\ud83d\udcb5 Manager Override'},{id:'rates',label:'\u2699\ufe0f Commission Rates'},{id:'audit',label:'\ud83d\udcdd Audit Log'}];
  else if(isManager) tabs=[{id:'overview',label:'\ud83d\udcb0 My Commission'},{id:'override',label:'\ud83d\udcb5 My Override'}];

  var title=isAdmin?'Commission Management':isManager?'My Commission & Override':isRep?'My Commission':'Commission';

  return '<div>'
    +'<div style="margin-bottom:20px"><h1 style="font-size:22px;font-weight:800;margin:0;font-family:Syne,sans-serif">\ud83d\udcb0 '+title+'</h1>'
    +'<p style="font-size:13px;color:#6b7280;margin:4px 0 0">'+(isRep?'Your won deals and commission':filtered.length+' won deals \u00b7 '+fmt$(totalComm)+' total commission')+'</p></div>'
    +'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px">'
    +'<div class="card" style="padding:16px;text-align:center"><div style="font-size:24px;font-weight:800;color:#15803d;font-family:Syne,sans-serif">'+fmt$(totalPaid)+'</div><div style="font-size:12px;color:#6b7280;margin-top:4px">\u2713 Paid</div></div>'
    +'<div class="card" style="padding:16px;text-align:center"><div style="font-size:24px;font-weight:800;color:#dc2626;font-family:Syne,sans-serif">'+fmt$(totalUnpaid)+'</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Outstanding</div></div>'
    +'<div class="card" style="padding:16px;text-align:center"><div style="font-size:24px;font-weight:800;color:#374151;font-family:Syne,sans-serif">'+fmt$(totalComm)+'</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Total</div></div></div>'
    +(tabs.length>0?'<div style="display:flex;gap:8px;margin-bottom:16px">'+tabs.map(function(t){return '<button onclick="commTab=\''+t.id+'\';renderPage()" class="pill'+(commTab===t.id?' on':'')+'" style="font-family:inherit;font-size:13px">'+t.label+'</button>';}).join('')+'</div>':'')
    +(commTab==='overview'?'<div class="card" style="padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><select class="sel" style="width:auto;font-size:12px" onchange="commDateFilter=this.value;renderPage()"><option value="all"'+(commDateFilter==='all'?' selected':'')+'>All Time</option><option value="thisMonth"'+(commDateFilter==='thisMonth'?' selected':'')+'>This Month</option><option value="lastMonth"'+(commDateFilter==='lastMonth'?' selected':'')+'>Last Month</option><option value="thisQuarter"'+(commDateFilter==='thisQuarter'?' selected':'')+'>This Quarter</option><option value="last6"'+(commDateFilter==='last6'?' selected':'')+'>Last 6 Months</option><option value="thisYear"'+(commDateFilter==='thisYear'?' selected':'')+'>This Year</option></select>'+(isAdmin?'<select class="sel" style="width:auto;font-size:12px" onchange="commRepFilter=this.value;renderPage()"><option value="all"'+(commRepFilter==='all'?' selected':'')+'>All Reps</option>'+reps.map(function(r){return '<option value="'+r+'"'+(commRepFilter===r?' selected':'')+'>'+r+'</option>';}).join('')+'</select>':'')+'<select class="sel" style="width:auto;font-size:12px" onchange="commStatusFilter=this.value;renderPage()"><option value="all"'+(commStatusFilter==='all'?' selected':'')+'>All Status</option><option value="paid"'+(commStatusFilter==='paid'?' selected':'')+'>Paid</option><option value="due"'+(commStatusFilter==='due'?' selected':'')+'>Due (Ready to Pay)</option><option value="pending"'+(commStatusFilter==='pending'?' selected':'')+'>Pending (Not Yet Due)</option><option value="unpaid"'+(commStatusFilter==='unpaid'?' selected':'')+'>All Unpaid</option></select></div>':'')
    +repCards
    +(commTab==='overview'?table:commTab==='override'?overrideHtml:commTab==='audit'?auditHtml:ratesHtml)
    +(!isAdmin&&!isManager&&!isRep?'<div class="card" style="padding:40px;text-align:center"><div style="font-size:28px;margin-bottom:8px">\ud83d\udd12</div><div style="font-size:14px;color:#6b7280">Commission data is restricted.</div></div>':'')
    +'</div>';
}

