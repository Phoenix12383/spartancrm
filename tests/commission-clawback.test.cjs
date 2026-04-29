// ════════════════════════════════════════════════════════════════════════════
// Brief 4 Phase 4 — clawback engine test
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies clawbackCommission, previewClawbackForDeal, and the 3-tier
// policy (full / partial / skipped) at the boundary days. Also checks
// the multi-attempt audit-trail behaviour.
//
// Run:  node tests/commission-clawback.test.cjs
//   or: npm run test:commission-clawback

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let _passCount = 0, _failCount = 0;
const _failures = [];
function assert(cond, label) {
  if (cond) { _passCount++; process.stdout.write('  \x1b[32m✓\x1b[0m ' + label + '\n'); }
  else { _failCount++; _failures.push(label); process.stdout.write('  \x1b[31m✗\x1b[0m ' + label + '\n'); }
}
function assertEq(a, e, label) { assert(a === e, label + ' (expected ' + JSON.stringify(e) + ', got ' + JSON.stringify(a) + ')'); }
function assertNear(a, e, eps, label) { assert(Math.abs(a - e) <= (eps || 0.001), label + ' (expected ~' + e + ', got ' + a + ')'); }
function section(t) { process.stdout.write('\n\x1b[1m' + t + '\x1b[0m\n'); }

function makeLocalStorage() {
  const store = Object.create(null);
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

function makeSandbox(deals) {
  const auditEntries = [];
  const sandbox = {
    localStorage: makeLocalStorage(),
    getCurrentUser: () => ({ id: 'admin', name: 'Admin', role: 'admin', branch: 'VIC' }),
    appendAuditEntry: (e) => { auditEntries.push(e); return e; },
    addToast: () => {},
    renderPage: () => {},
    getState: () => ({ deals: deals || [] }),
    PIPELINES: [{ id:'p1', name:'Residential', stages:[{id:'s5',name:'Won',isWon:true,ord:5}] }],
    fmt$: (n) => '$' + (Math.round(n*100)/100).toLocaleString(),
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Error,
    setTimeout, clearTimeout, isNaN, parseFloat, parseInt,
  };
  vm.createContext(sandbox);
  sandbox._auditEntries = auditEntries;
  return sandbox;
}

function loadCommissionClawback(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '24-commission.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  // Slice from CONFIG DATA MODEL through PAY RUN MODAL FLOW (which sits
  // before "// Commission page state"). Includes Phase 1+2+3+4+5+7
  // helpers — all the commission data layer.
  const startMarker = '// CONFIG DATA MODEL (Brief 4 Phase 1)';
  const endMarker = '// Commission page state';
  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find Phase 4 section markers in 24-commission.js');
  }
  vm.runInContext(full.slice(startIdx, endIdx), sandbox, { filename: '24-commission.js (Phase 4 slice)' });
}

function run() {
  // Helper to make today/X-days-ago dates. Uses UTC arithmetic to match
  // the production helper's _daysBetween (which slices ISO dates and
  // anchors at T00:00:00Z) — local-time setDate would give an off-by-one
  // when the local date and UTC date diverge.
  function daysAgo(n) {
    var d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  }

  const sandbox = makeSandbox([]);
  loadCommissionClawback(sandbox);
  const { clawbackCommission, previewClawbackForDeal, _computeClawbackTier,
          accrueCommission, getCommissionStatus, getCommissionStatusForDeal,
          getCommissionRules, saveCommissionRules } = sandbox;

  function reset() { sandbox.localStorage.clear(); sandbox._auditEntries.length = 0; }

  section('Exports');
  assertEq(typeof clawbackCommission, 'function', 'clawbackCommission exported');
  assertEq(typeof previewClawbackForDeal, 'function', 'previewClawbackForDeal exported');
  assertEq(typeof _computeClawbackTier, 'function', '_computeClawbackTier exported');

  section('Default clawbackPolicy seeded into rules.defaults');
  reset();
  let rules = getCommissionRules();
  assert(rules.defaults.clawbackPolicy, 'clawbackPolicy present in defaults');
  assertEq(rules.defaults.clawbackPolicy.fullClawbackUnderDays, 30, 'fullClawbackUnderDays = 30');
  assertEq(rules.defaults.clawbackPolicy.partialClawbackUnderDays, 90, 'partialClawbackUnderDays = 90');
  assertEq(rules.defaults.clawbackPolicy.partialKeepPct, 50, 'partialKeepPct = 50');

  section('_computeClawbackTier — boundaries with default policy');
  let policy = rules.defaults.clawbackPolicy;
  assertEq(_computeClawbackTier(0, policy).tier,  'full',    'day 0 → full');
  assertEq(_computeClawbackTier(15, policy).tier, 'full',    'day 15 → full');
  assertEq(_computeClawbackTier(29, policy).tier, 'full',    'day 29 → full');
  assertEq(_computeClawbackTier(30, policy).tier, 'partial', 'day 30 → partial (boundary)');
  assertEq(_computeClawbackTier(60, policy).tier, 'partial', 'day 60 → partial');
  assertEq(_computeClawbackTier(89, policy).tier, 'partial', 'day 89 → partial');
  assertEq(_computeClawbackTier(90, policy).tier, 'skipped', 'day 90 → skipped (boundary)');
  assertEq(_computeClawbackTier(180, policy).tier, 'skipped', 'day 180 → skipped');
  // keepPct values
  assertEq(_computeClawbackTier(15, policy).keepPct, 0,   'full keepPct = 0%');
  assertEq(_computeClawbackTier(60, policy).keepPct, 50,  'partial keepPct = 50%');
  assertEq(_computeClawbackTier(180, policy).keepPct, 100, 'skipped keepPct = 100%');

  section('previewClawbackForDeal — full tier (deal won 14 days ago)');
  reset();
  let dealFull = { id: 'd_full', val: 11000, rep: 'Alice', branch: 'VIC', won: true, wonDate: daysAgo(14), pid: 'p1' };
  sandbox.getState = () => ({ deals: [dealFull] });
  let preview = previewClawbackForDeal(dealFull);
  assertEq(preview.tier, 'full', 'tier = full');
  assertEq(preview.keepPct, 0, 'keepPct = 0');
  assertEq(preview.daysSinceWon, 14, 'daysSinceWon = 14');
  assert(preview.originalCommission > 0, 'originalCommission > 0 (10000 * 5% = 500)');
  assertNear(preview.originalCommission, 500, 0.01, 'originalCommission = 500');
  assertNear(preview.clawedBackAmount, 500, 0.01, 'full clawback = full commission');
  assertEq(preview.remainingCommission, 0, 'remaining = 0');

  section('previewClawbackForDeal — partial tier (60 days)');
  reset();
  let dealPartial = { id: 'd_partial', val: 11000, rep: 'Bob', branch: 'VIC', won: true, wonDate: daysAgo(60), pid: 'p1' };
  sandbox.getState = () => ({ deals: [dealPartial] });
  preview = previewClawbackForDeal(dealPartial);
  assertEq(preview.tier, 'partial', 'tier = partial');
  assertEq(preview.keepPct, 50, 'keepPct = 50');
  assertNear(preview.clawedBackAmount, 250, 0.01, 'partial clawback = 50% of 500 = 250');
  assertNear(preview.remainingCommission, 250, 0.01, 'remaining = 250');

  section('previewClawbackForDeal — skipped tier (180 days)');
  reset();
  let dealSkipped = { id: 'd_skip', val: 11000, rep: 'Carol', branch: 'VIC', won: true, wonDate: daysAgo(180), pid: 'p1' };
  sandbox.getState = () => ({ deals: [dealSkipped] });
  preview = previewClawbackForDeal(dealSkipped);
  assertEq(preview.tier, 'skipped', 'tier = skipped');
  assertEq(preview.keepPct, 100, 'keepPct = 100');
  assertEq(preview.clawedBackAmount, 0, 'no clawback');
  assertNear(preview.remainingCommission, 500, 0.01, 'remaining = full commission');

  section('clawbackCommission — full tier mutates state + audits');
  reset();
  sandbox.getState = () => ({ deals: [dealFull] });
  accrueCommission(dealFull);
  let result = clawbackCommission('d_full', 'Customer cancelled');
  assertEq(result.tier, 'full', 'result.tier = full');
  assertEq(result.alreadyClawed, false, 'alreadyClawed = false on first call');
  let status = getCommissionStatusForDeal('d_full');
  assertEq(status.state, 'clawed_back_full', 'state flipped to clawed_back_full');
  assertEq(status.clawbackTier, 'full', 'denormalised clawbackTier = full');
  assert(Array.isArray(status.clawbacks), 'clawbacks array present');
  assertEq(status.clawbacks.length, 1, 'one clawback record');
  assertEq(status.clawbacks[0].reason, 'Customer cancelled', 'reason recorded');
  assertEq(status.clawbacks[0].clawedBackBy, 'Admin', 'clawedBackBy recorded');
  // Audit
  let clawbackAudits = sandbox._auditEntries.filter(e => e.action === 'commission.clawed_back');
  assertEq(clawbackAudits.length, 1, 'one commission.clawed_back audit entry');
  assertEq(clawbackAudits[0].after.tier, 'full', 'audit after.tier = full');
  assert(/Full clawback/i.test(clawbackAudits[0].summary), 'summary mentions Full clawback');
  assertEq(clawbackAudits[0].metadata.reason, 'Customer cancelled', 'audit metadata.reason captured');

  section('clawbackCommission — partial tier math');
  reset();
  sandbox.getState = () => ({ deals: [dealPartial] });
  accrueCommission(dealPartial);
  result = clawbackCommission('d_partial', 'Pricing dispute');
  assertEq(result.tier, 'partial', 'tier = partial');
  assertEq(result.keepPct, 50, 'keepPct = 50');
  assertNear(result.clawedBackAmount, 250, 0.01, 'partial clawback = 250');
  assertNear(result.remainingCommission, 250, 0.01, 'remaining = 250');
  status = getCommissionStatusForDeal('d_partial');
  assertEq(status.state, 'clawed_back_partial', 'state = clawed_back_partial');

  section('clawbackCommission — skipped tier preserves commission');
  reset();
  sandbox.getState = () => ({ deals: [dealSkipped] });
  accrueCommission(dealSkipped);
  result = clawbackCommission('d_skip', 'Late cancellation but rep already paid');
  assertEq(result.tier, 'skipped', 'tier = skipped');
  assertEq(result.clawedBackAmount, 0, 'no money clawed');
  assertNear(result.remainingCommission, 500, 0.01, 'commission preserved');
  status = getCommissionStatusForDeal('d_skip');
  assertEq(status.state, 'clawed_back_skipped', 'state = clawed_back_skipped');
  // Audit still fires for skipped — captures the cancellation event
  let skipAudits = sandbox._auditEntries.filter(e => e.action === 'commission.clawed_back' && e.after.tier === 'skipped');
  assertEq(skipAudits.length, 1, 'audit entry written even for skipped');
  assert(/skipped/i.test(skipAudits[0].summary), 'summary mentions skipped');

  section('clawbackCommission — multiple attempts (audit-only re-runs)');
  reset();
  sandbox.getState = () => ({ deals: [dealFull] });
  accrueCommission(dealFull);
  let r1 = clawbackCommission('d_full', 'First attempt');
  let r2 = clawbackCommission('d_full', 'Wrong reason — redoing with right one');
  let r3 = clawbackCommission('d_full', 'Third try');
  assertEq(r1.alreadyClawed, false, 'first call: alreadyClawed=false');
  assertEq(r2.alreadyClawed, true,  'second call: alreadyClawed=true');
  assertEq(r3.alreadyClawed, true,  'third call: alreadyClawed=true');
  status = getCommissionStatusForDeal('d_full');
  assertEq(status.clawbacks.length, 3, '3 clawback records appended');
  // State still clawed_back_full from first call
  assertEq(status.state, 'clawed_back_full', 'state unchanged on re-runs');
  // The first record has the original commission; subsequent records do too
  // (they re-compute but state-mutation is idempotent)
  assertEq(status.clawbacks[0].reason, 'First attempt', 'first record reason');
  assertEq(status.clawbacks[1].reason, 'Wrong reason — redoing with right one', 'second record reason');
  // All 3 audit entries written, marked alreadyClawed for re-runs
  let allClawAudits = sandbox._auditEntries.filter(e => e.action === 'commission.clawed_back');
  assertEq(allClawAudits.length, 3, '3 audit entries (one per attempt)');
  assertEq(allClawAudits[0].metadata.alreadyClawed, false, 'first audit: alreadyClawed=false');
  assertEq(allClawAudits[1].metadata.alreadyClawed, true,  'second audit: alreadyClawed=true');
  assert(/Re-attempt/i.test(allClawAudits[1].summary), 'second audit summary marked Re-attempt');

  section('clawbackCommission — opts.wonDate override');
  reset();
  // Simulate post-unwind state: deal has wonDate=null but caller passes
  // the snapshot via opts.wonDate.
  let dealUnwound = { id: 'd_uw', val: 11000, rep: 'Eve', branch: 'VIC', won: false, wonDate: null, pid: 'p1' };
  sandbox.getState = () => ({ deals: [dealUnwound] });
  accrueCommission({ ...dealUnwound, won: true, wonDate: daysAgo(45) });
  result = clawbackCommission('d_uw', 'Cancelled', { wonDate: daysAgo(45) });
  assertEq(result.tier, 'partial', 'wonDate override → partial tier (45 days)');
  assertEq(result.daysSinceWon, 45, 'daysSinceWon from override');

  section('clawbackCommission — opts.commissionOverride preserves snapshot');
  reset();
  sandbox.getState = () => ({ deals: [dealUnwound] });
  accrueCommission({ ...dealUnwound, won: true, wonDate: daysAgo(14) });
  result = clawbackCommission('d_uw', 'Snapshot test', {
    wonDate: daysAgo(14),
    commissionOverride: 999,
  });
  assertEq(result.originalCommission, 999, 'commissionOverride used as originalCommission');
  assertEq(result.clawedBackAmount, 999, 'full clawback of override = 999');

  section('clawbackCommission — synthesises status record for legacy deals');
  reset();
  // No status record exists (legacy deal pre-Phase-3). Helper synthesises
  // a minimal record so the audit trail still captures the event.
  sandbox.getState = () => ({ deals: [dealFull] });
  // Note: NOT calling accrueCommission first — no status record exists
  result = clawbackCommission('d_full', 'Legacy cancellation');
  assert(result, 'clawback succeeds even without prior status record');
  status = getCommissionStatusForDeal('d_full');
  assert(status, 'status record synthesised');
  assertEq(status.state, 'clawed_back_full', 'state set');
  assert(Array.isArray(status.clawbacks) && status.clawbacks.length === 1, 'clawback record added');

  section('clawbackCommission — null/missing deal IDs');
  reset();
  result = clawbackCommission(null, 'Test');
  assertEq(result, null, 'null dealId returns null');
  result = clawbackCommission('', 'Test');
  assertEq(result, null, 'empty dealId returns null');

  section('Custom clawbackPolicy via saveCommissionRules');
  reset();
  saveCommissionRules({
    defaults: {
      baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'won',
      clawbackPolicy: { fullClawbackUnderDays: 14, partialClawbackUnderDays: 60, partialKeepPct: 75 },
    },
    perRep: {}, perBranch: {},
    productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }],
    volumeBonuses: [],
  }, { silent: true });
  let customPolicy = getCommissionRules().defaults.clawbackPolicy;
  assertEq(customPolicy.fullClawbackUnderDays, 14, 'custom fullClawbackUnderDays = 14');
  assertEq(customPolicy.partialKeepPct, 75, 'custom partialKeepPct = 75');
  // 20 days with 14-day full threshold → partial
  assertEq(_computeClawbackTier(20, customPolicy).tier, 'partial', '20 days → partial under custom policy');
  assertEq(_computeClawbackTier(20, customPolicy).keepPct, 75, 'custom keepPct = 75');
  // 60 days with 60-day partial threshold → skipped (boundary)
  assertEq(_computeClawbackTier(60, customPolicy).tier, 'skipped', '60 days → skipped under custom policy');

  // ── Summary ────────────────────────────────────────────────────────────
  process.stdout.write('\n');
  if (_failCount === 0) {
    process.stdout.write('\x1b[32m\x1b[1m' + _passCount + ' passed, 0 failed.\x1b[0m\n');
    process.exit(0);
  } else {
    process.stdout.write('\x1b[31m\x1b[1m' + _passCount + ' passed, ' + _failCount + ' FAILED.\x1b[0m\n');
    _failures.forEach(f => process.stdout.write('  - ' + f + '\n'));
    process.exit(1);
  }
}

run();
