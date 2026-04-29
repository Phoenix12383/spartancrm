// ════════════════════════════════════════════════════════════════════════════
// Brief 4 Phase 7 — Pay Run Tracker test
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the data-layer for the pay-run system: getPayRuns / getPayRunById /
// nextPayRunNumber / savePayRuns / finalisePayRun / voidPayRun /
// getEligibleCommissionsForPayRun / period-preset helper.
//
// Run:  node tests/commission-payruns.test.cjs
//   or: npm run test:commission-payruns

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

function loadCommissionPayRuns(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '24-commission.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  // Slice from CONFIG DATA MODEL through PAY RUN MODAL FLOW (which sits
  // just before "// Commission page state"). Includes Phases 1–7's data
  // helpers without pulling in renderCommissionPage globals we'd have
  // to stub.
  const startMarker = '// CONFIG DATA MODEL (Brief 4 Phase 1)';
  const endMarker = '// Commission page state';
  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find Phase 7 section markers in 24-commission.js');
  }
  vm.runInContext(full.slice(startIdx, endIdx), sandbox, { filename: '24-commission.js (Phase 7 slice)' });
}

function run() {
  // Set up a controlled deal corpus for testing
  const deals = [
    { id: 'd1', title: 'Smith — VIC', val: 11000, rep: 'Alice', branch: 'VIC', won: true, wonDate: '2026-04-10', pid: 'p1' },
    { id: 'd2', title: 'Jones — VIC', val: 22000, rep: 'Alice', branch: 'VIC', won: true, wonDate: '2026-04-15', pid: 'p1' },
    { id: 'd3', title: 'Lee — NSW',   val: 16500, rep: 'Bob',   branch: 'NSW', won: true, wonDate: '2026-04-12', pid: 'p1' },
    { id: 'd4', title: 'Patel — VIC', val: 33000, rep: 'Alice', branch: 'VIC', won: true, wonDate: '2026-03-20', pid: 'p1' },
    { id: 'd5', title: 'Brown — VIC', val: 11000, rep: 'Bob',   branch: 'VIC', won: true, wonDate: '2026-04-20', pid: 'p1' },
  ];
  const sandbox = makeSandbox(deals);
  loadCommissionPayRuns(sandbox);
  const { getPayRuns, getPayRunById, nextPayRunNumber, savePayRuns,
          finalisePayRun, voidPayRun, getEligibleCommissionsForPayRun,
          getCommissionStatus, saveCommissionStatus, getCommissionStatusForDeal,
          accrueCommission, _payRunPeriodFromPreset, getPayRunSliceForRep,
          markPayRunReconciled, COMMISSION_PAY_RUNS_KEY } = sandbox;

  function reset() {
    sandbox.localStorage.clear();
    sandbox._auditEntries.length = 0;
  }
  function seedRealisedAll() {
    // Seed all 5 deals as realised (gate=won default). Use accrueCommission
    // which auto-realises when gate=won, then mutate realisedAt to be
    // controlled for predictable period filtering.
    deals.forEach(function (d) { accrueCommission(d); });
    // Manually set realisedAt to wonDate so period filtering is predictable
    var status = getCommissionStatus();
    deals.forEach(function (d) {
      var rec = status[d.id];
      if (rec) {
        rec.realisedAt = d.wonDate + 'T12:00:00Z';
        rec.accruedAt = d.wonDate + 'T12:00:00Z';
        status[d.id] = rec;
      }
    });
    saveCommissionStatus(status);
  }

  section('Exports');
  assertEq(typeof getPayRuns, 'function', 'getPayRuns exported');
  assertEq(typeof getPayRunById, 'function', 'getPayRunById exported');
  assertEq(typeof nextPayRunNumber, 'function', 'nextPayRunNumber exported');
  assertEq(typeof savePayRuns, 'function', 'savePayRuns exported');
  assertEq(typeof finalisePayRun, 'function', 'finalisePayRun exported');
  assertEq(typeof voidPayRun, 'function', 'voidPayRun exported');
  assertEq(typeof getEligibleCommissionsForPayRun, 'function', 'getEligibleCommissionsForPayRun exported');
  assertEq(COMMISSION_PAY_RUNS_KEY, 'spartan_commission_pay_runs', 'storage key constant');

  section('nextPayRunNumber on empty store');
  reset();
  assertEq(nextPayRunNumber(), 1, 'First run is PR-001');

  section('getEligibleCommissionsForPayRun period filter');
  reset();
  seedRealisedAll();
  // April only: should pick up d1 (10), d2 (15), d3 (12), d5 (20) — 4 deals.
  // d4 is March 20 → out of range.
  let elig = getEligibleCommissionsForPayRun('2026-04-01', '2026-04-30');
  assertEq(elig.length, 4, 'April period yields 4 eligible deals');
  let dealIds = elig.map(e => e.dealId).sort();
  assert(dealIds.indexOf('d1') >= 0, 'd1 included');
  assert(dealIds.indexOf('d2') >= 0, 'd2 included');
  assert(dealIds.indexOf('d3') >= 0, 'd3 included');
  assert(dealIds.indexOf('d5') >= 0, 'd5 included');
  assert(dealIds.indexOf('d4') < 0, 'd4 (March) excluded');

  section('Tighter period boundaries');
  elig = getEligibleCommissionsForPayRun('2026-04-15', '2026-04-25');
  assertEq(elig.length, 2, '15-25 Apr yields 2 deals (d2, d5)');

  section('finalisePayRun creates record + flips state');
  reset();
  seedRealisedAll();
  let run = finalisePayRun({
    dealIds: ['d1', 'd2', 'd3'],
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    paymentMethod: 'EFT',
    notes: 'Test run',
    runDate: '2026-04-25',
  });
  assert(run, 'Pay run created');
  assertEq(run.runNumber, 1, 'First run is PR-001');
  assertEq(run.status, 'finalised', 'Status = finalised');
  assertEq(run.dealIds.length, 3, '3 deals included');
  assert(run.linesByRep['Alice'], 'Alice line present');
  assert(run.linesByRep['Bob'], 'Bob line present');
  assertEq(run.linesByRep['Alice'].dealCount, 2, 'Alice has 2 deals');
  assertEq(run.linesByRep['Bob'].dealCount, 1, 'Bob has 1 deal');
  // Each deal's status is now paid+payRunId
  let s = getCommissionStatus();
  assertEq(s['d1'].state, 'paid', 'd1 state=paid');
  assertEq(s['d1'].payRunId, run.id, 'd1 payRunId set');
  assertEq(s['d2'].payRunId, run.id, 'd2 payRunId set');
  assertEq(s['d3'].payRunId, run.id, 'd3 payRunId set');
  assertEq(s['d5'].state, 'realised', 'd5 (not in run) still realised');
  assertEq(s['d5'].payRunId, null, 'd5 payRunId still null');

  section('Audit entry written for finalisation');
  let prFinAudits = sandbox._auditEntries.filter(e => e.action === 'commission.pay_run_finalised');
  assertEq(prFinAudits.length, 1, 'Exactly one commission.pay_run_finalised audit');
  let finAudit = prFinAudits[0];
  assertEq(finAudit.metadata.dealIds.length, 3, 'Audit metadata has 3 dealIds');
  assertEq(finAudit.metadata.backfilled, false, 'Audit metadata.backfilled=false');

  section('After finalisation, deals NOT eligible for next run');
  elig = getEligibleCommissionsForPayRun('2026-04-01', '2026-04-30');
  // d1, d2, d3 are now paid — only d5 should remain eligible
  assertEq(elig.length, 1, 'Only 1 eligible (d5)');
  assertEq(elig[0].dealId, 'd5', 'd5 still eligible');

  section('Pay run numbers are sequential and never reused');
  let r2 = finalisePayRun({
    dealIds: ['d5'],
    periodStart: '2026-04-01',
    periodEnd: '2026-04-30',
    paymentMethod: 'EFT',
    runDate: '2026-04-26',
  });
  assertEq(r2.runNumber, 2, 'Second run is PR-002');

  section('voidPayRun reverts deals + audits');
  let voidOk = voidPayRun(run.id, 'Wrong period — please regenerate');
  assertEq(voidOk, true, 'Void returned true');
  s = getCommissionStatus();
  assertEq(s['d1'].state, 'realised', 'd1 reverted to realised');
  assertEq(s['d1'].payRunId, null, 'd1 payRunId cleared');
  assertEq(s['d1'].paidAt, null, 'd1 paidAt cleared');
  assertEq(s['d2'].state, 'realised', 'd2 reverted to realised');
  assertEq(s['d3'].state, 'realised', 'd3 reverted to realised');
  // The voided run's record still exists in history with status=voided
  let voidedRun = getPayRunById(run.id);
  assertEq(voidedRun.status, 'voided', 'Run record status=voided');
  assertEq(voidedRun.voidReason, 'Wrong period — please regenerate', 'voidReason preserved');
  assert(voidedRun.voidedAt, 'voidedAt timestamp set');
  // Audit entry
  let voidAudits = sandbox._auditEntries.filter(e => e.action === 'commission.pay_run_voided');
  assertEq(voidAudits.length, 1, 'commission.pay_run_voided audit written');

  section('Voided run number is NOT reused');
  // The next run should be PR-003 even though PR-001 is voided
  let r3 = finalisePayRun({
    dealIds: ['d1'], // d1 is now eligible again after the void
    paymentMethod: 'Manual',
    runDate: '2026-04-27',
  });
  assertEq(r3.runNumber, 3, 'Next run is PR-003 (PR-001 number not reused after void)');

  section('Voided deals are eligible for new pay runs');
  // After voiding, d1/d2/d3 are realised again — they should appear in
  // an eligibility query for the same period.
  // (Some are now in r3 again — d1 — so query before that or refilter.)
  // d2, d3 should still be eligible.
  elig = getEligibleCommissionsForPayRun('2026-04-01', '2026-04-30');
  let postVoidIds = elig.map(e => e.dealId).sort();
  assert(postVoidIds.indexOf('d2') >= 0, 'd2 eligible after parent run voided');
  assert(postVoidIds.indexOf('d3') >= 0, 'd3 eligible after parent run voided');

  section('voidPayRun rejects empty reason');
  reset();
  seedRealisedAll();
  let r = finalisePayRun({ dealIds: ['d1'], paymentMethod: 'EFT', runDate: '2026-04-25' });
  let toastErrs = [];
  sandbox.addToast = (msg, level) => { if (level === 'error') toastErrs.push(msg); };
  let bad = voidPayRun(r.id, '');
  assertEq(bad, false, 'Empty reason rejected');
  assert(toastErrs.some(m => /reason is required/i.test(m)), 'Toast mentions reason required');
  bad = voidPayRun(r.id, '   ');
  assertEq(bad, false, 'Whitespace-only reason rejected');
  // Run should still be finalised
  let unchanged = getPayRunById(r.id);
  assertEq(unchanged.status, 'finalised', 'Run still finalised');
  sandbox.addToast = () => {};

  section('voidPayRun blocked for non-admin');
  sandbox.getCurrentUser = () => ({ id: 'acc', name: 'Accounts', role: 'accounts' });
  toastErrs = [];
  sandbox.addToast = (msg, level) => { if (level === 'error') toastErrs.push(msg); };
  let blocked = voidPayRun(r.id, 'Trying as accounts');
  assertEq(blocked, false, 'Accounts role cannot void');
  assert(toastErrs.some(m => /only admin/i.test(m)), 'Toast mentions admin-only');
  sandbox.getCurrentUser = () => ({ id: 'admin', name: 'Admin', role: 'admin' });
  sandbox.addToast = () => {};

  section('finalisePayRun blocked for non-admin/non-accounts');
  reset(); seedRealisedAll();
  sandbox.getCurrentUser = () => ({ id: 'rep', name: 'Rep', role: 'sales_rep' });
  toastErrs = [];
  sandbox.addToast = (msg, level) => { if (level === 'error') toastErrs.push(msg); };
  let bad2 = finalisePayRun({ dealIds: ['d1'], paymentMethod: 'EFT', runDate: '2026-04-25' });
  assertEq(bad2, null, 'sales_rep cannot finalise');
  sandbox.getCurrentUser = () => ({ id: 'admin', name: 'Admin', role: 'admin' });
  sandbox.addToast = () => {};

  section('Period-preset helper');
  // Just check shape — the date-math is deterministic but depends on "today"
  let preset = _payRunPeriodFromPreset('this_fortnight');
  assert(preset && preset.start && preset.end, 'this_fortnight returns start+end');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(preset.start), 'start is ISO date');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(preset.end), 'end is ISO date');
  let lm = _payRunPeriodFromPreset('last_month');
  assert(lm.start <= lm.end, 'last_month start ≤ end');
  let bogus = _payRunPeriodFromPreset('not_a_preset');
  assertEq(bogus.start, bogus.end, 'unknown preset → today/today');

  section('Backfill mode includes paid+payRunId=null orphans');
  reset();
  // Seed an orphan paid record (pre-Phase-7 legacy data) and a normal
  // realised record. Backfill query should pick up BOTH; normal query only
  // the realised one.
  saveCommissionStatus({
    'd_orphan': { state: 'paid', accruedAt: '2026-03-01T00:00:00Z', realisedAt: '2026-03-05T00:00:00Z', paidAt: '2026-03-10T00:00:00Z', paidBy: 'Old Admin', gateUsed: 'legacy_migration', payRunId: null },
    'd_realised': { state: 'realised', accruedAt: '2026-04-01T00:00:00Z', realisedAt: '2026-04-05T00:00:00Z', paidAt: null, paidBy: null, gateUsed: 'won', payRunId: null },
  });
  // Stub deals so getEligibleCommissionsForPayRun can resolve them
  sandbox.getState = () => ({ deals: [
    { id: 'd_orphan', title: 'Orphan', val: 11000, rep: 'Alice', branch: 'VIC' },
    { id: 'd_realised', title: 'Realised', val: 11000, rep: 'Alice', branch: 'VIC' },
  ]});
  let normalElig = getEligibleCommissionsForPayRun(null, null);
  let backfillElig = getEligibleCommissionsForPayRun(null, null, { includeBackfill: true });
  assertEq(normalElig.length, 1, 'Normal query: only realised');
  assertEq(normalElig[0].dealId, 'd_realised', 'Normal query: d_realised');
  assertEq(backfillElig.length, 2, 'Backfill query: both paid orphan + realised');

  section('finalisePayRun with backfilled flag');
  reset();
  saveCommissionStatus({
    'd_orphan': { state: 'paid', accruedAt: '2026-03-01T00:00:00Z', realisedAt: null, paidAt: '2026-03-10T00:00:00Z', paidBy: 'Old', gateUsed: 'legacy_migration', payRunId: null },
  });
  sandbox.getState = () => ({ deals: [{ id: 'd_orphan', title: 'Orphan', val: 11000, rep: 'Alice', branch: 'VIC' }] });
  let backfillRun = finalisePayRun({
    dealIds: ['d_orphan'],
    paymentMethod: 'Manual',
    notes: 'Pre-tracker historical',
    runDate: '2026-03-10',
  }, { backfilled: true });
  assert(backfillRun, 'Backfill run created');
  assertEq(backfillRun.metadata.backfilled, true, 'metadata.backfilled = true');
  let backfillAudits = sandbox._auditEntries.filter(e => e.action === 'commission.pay_run_backfilled');
  assertEq(backfillAudits.length, 1, 'commission.pay_run_backfilled audit written');

  section('getPayRunSliceForRep returns rep-only slice');
  reset();
  seedRealisedAll();
  sandbox.getState = () => ({ deals: deals });
  let multi = finalisePayRun({
    dealIds: ['d1', 'd2', 'd3'], // d1+d2 Alice, d3 Bob
    paymentMethod: 'EFT',
    runDate: '2026-04-25',
  });
  let aliceSlice = getPayRunSliceForRep(multi.id, 'Alice');
  assertEq(aliceSlice.lines.dealCount, 2, 'Alice slice has 2 deals');
  assertEq(aliceSlice.deals.length, 2, 'Alice deals array has 2 records');
  let bobSlice = getPayRunSliceForRep(multi.id, 'Bob');
  assertEq(bobSlice.lines.dealCount, 1, 'Bob slice has 1 deal');
  let nobody = getPayRunSliceForRep(multi.id, 'Charlie');
  assertEq(nobody, null, 'Non-included rep → null slice');

  section('getPayRuns filter by repName');
  let aliceRuns = getPayRuns({ repName: 'Alice' });
  assert(aliceRuns.some(r => r.id === multi.id), 'Alice runs include multi');
  let charlieRuns = getPayRuns({ repName: 'Charlie' });
  assertEq(charlieRuns.length, 0, 'Charlie has no runs');

  section('getPayRuns filter by status');
  voidPayRun(multi.id, 'Test void for filter');
  let voidedRuns = getPayRuns({ status: 'voided' });
  let finalisedRuns = getPayRuns({ status: 'finalised' });
  assert(voidedRuns.some(r => r.id === multi.id), 'multi appears in voided filter');
  assert(!finalisedRuns.some(r => r.id === multi.id), 'multi NOT in finalised filter (now voided)');

  section('markPayRunReconciled flips finalised → reconciled');
  reset();
  seedRealisedAll();
  sandbox.getState = () => ({ deals: deals });
  let toRecon = finalisePayRun({ dealIds: ['d1'], paymentMethod: 'EFT', runDate: '2026-04-25' });
  markPayRunReconciled(toRecon.id, 'Bank ref ABC123');
  let reconciled = getPayRunById(toRecon.id);
  assertEq(reconciled.status, 'reconciled', 'status now reconciled');
  assertEq(reconciled.paymentReference, 'Bank ref ABC123', 'paymentReference stored');

  section('markPayRunReconciled blocks on voided run');
  let toVoid = finalisePayRun({ dealIds: ['d2'], paymentMethod: 'EFT', runDate: '2026-04-25' });
  voidPayRun(toVoid.id, 'Test');
  toastErrs = [];
  sandbox.addToast = (msg, level) => { if (level === 'error') toastErrs.push(msg); };
  markPayRunReconciled(toVoid.id, 'Should fail');
  let stillVoided = getPayRunById(toVoid.id);
  assertEq(stillVoided.status, 'voided', 'voided run cannot be reconciled');
  assert(toastErrs.some(m => /cannot reconcile/i.test(m)), 'Error toast mentions cannot reconcile');

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
