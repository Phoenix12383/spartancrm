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

function getCommissionPaid() { try { return JSON.parse(localStorage.getItem('spartan_commission_paid') || '{}'); } catch(e){ return {}; } }
function saveCommissionPaid(paid) { localStorage.setItem('spartan_commission_paid', JSON.stringify(paid)); }
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

function calcCommission(dealVal, repName) {
  var exGst = dealVal / 1.1;
  var rate = getRepRate(repName);
  return { exGst: exGst, rate: rate, commission: exGst * rate / 100 };
}

function toggleCommissionPaid(dealId) {
  var cu = getCurrentUser() || {};
  if (cu.role !== 'admin' && cu.role !== 'accounts') { addToast('Only Admin or Accounts can change payment status', 'error'); return; }
  var paid = getCommissionPaid();
  var deal = getState().deals.find(function(d){ return d.id === dealId; });
  var oldStatus = paid[dealId] ? paid[dealId].status : 'unpaid';
  var newStatus = oldStatus === 'paid' ? 'unpaid' : 'paid';
  paid[dealId] = { status: newStatus, paidDate: newStatus === 'paid' ? new Date().toISOString().slice(0,10) : null, paidBy: cu.name };
  saveCommissionPaid(paid);
  // Audit log
  var audit = getCommissionAudit();
  audit.unshift({
    timestamp: new Date().toISOString(),
    dealId: dealId,
    dealTitle: deal ? deal.title : dealId,
    repName: deal ? deal.rep : '—',
    value: deal ? deal.val : 0,
    action: newStatus === 'paid' ? 'Marked PAID' : 'Marked UNPAID',
    by: cu.name,
    oldStatus: oldStatus,
    newStatus: newStatus,
  });
  saveCommissionAudit(audit);
  // Brief 2 Phase 2: also write to the unified audit log. The legacy
  // spartan_commission_audit array stays in place — the commission tab's
  // existing audit subsection still reads it directly.
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'commission', entityId:dealId,
      action: newStatus === 'paid' ? 'commission.paid' : 'commission.unpaid',
      summary: (newStatus === 'paid' ? 'Marked' : 'Reverted') + ' commission ' + newStatus.toUpperCase() + ': ' + (deal ? deal.title : dealId),
      before:{ status:oldStatus }, after:{ status:newStatus },
      branch: deal ? (deal.branch || null) : null,
    });
  }
  addToast('Commission ' + newStatus, newStatus === 'paid' ? 'success' : 'warning');
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

