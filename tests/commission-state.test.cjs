// ════════════════════════════════════════════════════════════════════════════
// Brief 4 Phase 3 — accrued/realised/paid state machine test
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the tri-state transitions, idempotency guarantees, and the
// legacy `spartan_commission_paid` → `spartan_commission_status` migration.
//
// Run:  node tests/commission-state.test.cjs
//   or: npm run test:commission-state
//
// Loads the production source via the COMMISSION SYSTEM through STATE
// MACHINE section (legacy migration helpers, accrue/realise functions,
// status getters/setters) so tests stay in sync with what ships.

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
    getCurrentUser: () => ({ id: 'admin', name: 'Admin User', role: 'admin', branch: 'VIC' }),
    appendAuditEntry: (e) => { auditEntries.push(e); return e; },
    addToast: () => {},
    renderPage: () => {},
    getState: () => ({ deals: deals || [] }),
    PIPELINES: [
      { id: 'p1', name: 'Residential', stages: [
        { id: 's1', name: 'New Enquiry', ord: 1 },
        { id: 's3', name: 'Quote Sent',  ord: 3 },
        { id: 's5', name: 'Won',         ord: 5, isWon: true },
      ]},
    ],
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Error,
    setTimeout, clearTimeout, isNaN, parseFloat, parseInt,
  };
  vm.createContext(sandbox);
  sandbox._auditEntries = auditEntries;
  return sandbox;
}

function loadStateMachine(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '24-commission.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  // Slice from CONFIG DATA MODEL (Brief 4 Phase 1) through the
  // backward-compat shims (just before the legacy commission audit
  // helpers). This includes Phase 1 helpers (rules, getRepRate),
  // Phase 2 (calcDealCommission), AND Phase 3 (state machine,
  // accrueCommission, realiseCommission). Stop before
  // `function calcCommission` to avoid pulling in code that needs
  // globals we don't stub.
  const startMarker = '// CONFIG DATA MODEL (Brief 4 Phase 1)';
  const endMarker = '// Commission page state';
  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find Phase 3 section markers in 24-commission.js');
  }
  vm.runInContext(full.slice(startIdx, endIdx), sandbox, { filename: '24-commission.js (Phase 3 slice)' });
}

function run() {
  const sandbox = makeSandbox();
  loadStateMachine(sandbox);
  const { accrueCommission, realiseCommission, toggleCommissionPaid,
          getCommissionStatus, getCommissionStatusForDeal, saveCommissionStatus,
          saveCommissionRules, getCommissionPaid, saveCommissionPaid,
          COMMISSION_STATUS_KEY, COMMISSION_PAID_LEGACY_KEY } = sandbox;

  function reset() { sandbox.localStorage.clear(); sandbox._auditEntries.length = 0; }

  section('Exports');
  assertEq(typeof accrueCommission, 'function', 'accrueCommission exported');
  assertEq(typeof realiseCommission, 'function', 'realiseCommission exported');
  assertEq(typeof toggleCommissionPaid, 'function', 'toggleCommissionPaid exported');
  assertEq(typeof getCommissionStatus, 'function', 'getCommissionStatus exported');
  assertEq(typeof getCommissionStatusForDeal, 'function', 'getCommissionStatusForDeal exported');
  assertEq(typeof getCommissionPaid, 'function', 'getCommissionPaid (backcompat) exported');
  assertEq(COMMISSION_STATUS_KEY, 'spartan_commission_status', 'COMMISSION_STATUS_KEY constant');
  assertEq(COMMISSION_PAID_LEGACY_KEY, 'spartan_commission_paid', 'COMMISSION_PAID_LEGACY_KEY constant');

  section('accrueCommission with default gate "won" auto-realises');
  reset();
  // Default rules: realisationGate = 'won', so accrual immediately auto-realises.
  let deal = { id: 'd1', val: 11000, rep: 'Alice', branch: 'VIC', won: true, wonDate: '2026-04-15', title: 'Smith — Richmond' };
  let result = accrueCommission(deal);
  assertEq(result, true, 'accrueCommission returns true on first call');
  let rec = getCommissionStatusForDeal('d1');
  assert(rec, 'Status record created');
  assertEq(rec.state, 'realised', 'Auto-realised because gate=won');
  assertEq(rec.gateUsed, 'won', 'gateUsed=won recorded');
  assert(rec.accruedAt, 'accruedAt set');
  assert(rec.realisedAt, 'realisedAt set');
  assertEq(rec.paidAt, null, 'paidAt null on accrue');

  section('Two audit entries written for accrue+realise (gate=won)');
  let actions = sandbox._auditEntries.map(e => e.action);
  assert(actions.indexOf('commission.accrued') >= 0, 'commission.accrued written');
  assert(actions.indexOf('commission.realised') >= 0, 'commission.realised written (auto on accrue, gate=won)');

  section('accrueCommission is idempotent — second call no-ops');
  let auditCountBefore = sandbox._auditEntries.length;
  result = accrueCommission(deal);
  assertEq(result, false, 'Second accrueCommission returns false');
  assertEq(sandbox._auditEntries.length, auditCountBefore, 'No additional audit entries on re-accrue');

  section('accrueCommission with gate=final_signed leaves state at "accrued"');
  reset();
  saveCommissionRules({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'final_signed' },
    perRep: {}, perBranch: {},
    productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }],
    volumeBonuses: [],
  }, { silent: true });
  deal = { id: 'd2', val: 22000, rep: 'Bob', branch: 'VIC', won: true, wonDate: '2026-04-15' };
  accrueCommission(deal);
  rec = getCommissionStatusForDeal('d2');
  assertEq(rec.state, 'accrued', 'State stays at accrued when gate=final_signed');
  assertEq(rec.realisedAt, null, 'realisedAt null until gate fires');
  assertEq(rec.gateUsed, null, 'gateUsed null until gate fires');

  section('realiseCommission flips accrued → realised');
  let actBefore = sandbox._auditEntries.length;
  result = realiseCommission('d2', 'final_signed');
  assertEq(result, true, 'realiseCommission returns true on first realise');
  rec = getCommissionStatusForDeal('d2');
  assertEq(rec.state, 'realised', 'State now realised');
  assert(rec.realisedAt, 'realisedAt set');
  assertEq(rec.gateUsed, 'final_signed', 'gateUsed=final_signed recorded');
  assert(sandbox._auditEntries.length > actBefore, 'Audit entry written');
  let lastAudit = sandbox._auditEntries[sandbox._auditEntries.length - 1];
  assertEq(lastAudit.action, 'commission.realised', 'Last audit is commission.realised');
  assertEq(lastAudit.before.state, 'accrued', 'Audit before.state=accrued');
  assertEq(lastAudit.after.state, 'realised', 'Audit after.state=realised');

  section('realiseCommission is idempotent — second call no-ops');
  let realisedAt1 = rec.realisedAt;
  actBefore = sandbox._auditEntries.length;
  result = realiseCommission('d2', 'final_signed');
  assertEq(result, false, 'Second realiseCommission returns false');
  rec = getCommissionStatusForDeal('d2');
  assertEq(rec.realisedAt, realisedAt1, 'realisedAt NOT overwritten on re-fire (preserves audit trail)');
  assertEq(sandbox._auditEntries.length, actBefore, 'No additional audit entries');

  section('realiseCommission no-ops on missing record');
  reset();
  result = realiseCommission('nonexistent_deal', 'final_signed');
  assertEq(result, false, 'No-op on missing record');
  assertEq(getCommissionStatusForDeal('nonexistent_deal'), null, 'No record created');

  section('realiseCommission no-ops when already paid');
  reset();
  saveCommissionStatus({ d3: { state: 'paid', accruedAt: '2026-04-01T00:00:00Z', realisedAt: '2026-04-01T00:00:00Z', paidAt: '2026-04-15T00:00:00Z', paidBy: 'Admin' } });
  result = realiseCommission('d3', 'final_payment');
  assertEq(result, false, 'No-op on already-paid');
  rec = getCommissionStatusForDeal('d3');
  assertEq(rec.state, 'paid', 'State remains paid');
  assertEq(rec.paidAt, '2026-04-15T00:00:00Z', 'paidAt unchanged');

  section('toggleCommissionPaid blocks on accrued state');
  reset();
  saveCommissionRules({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'final_signed' },
    perRep: {}, perBranch: {}, productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }], volumeBonuses: [],
  }, { silent: true });
  // Stub a deal in state so toggleCommissionPaid can find it
  sandbox.getState = () => ({ deals: [{ id: 'd4', rep: 'Charlie', branch: 'VIC', won: true, title: 'Charlie deal' }] });
  saveCommissionStatus({ d4: { state: 'accrued', accruedAt: '2026-04-15T00:00:00Z', realisedAt: null, paidAt: null, paidBy: null, gateUsed: null } });
  let toastMsg = '';
  sandbox.addToast = (msg) => { toastMsg = msg; };
  toggleCommissionPaid('d4');
  rec = getCommissionStatusForDeal('d4');
  assertEq(rec.state, 'accrued', 'State remains accrued (cannot pay direct from accrued)');
  assert(/realised first/i.test(toastMsg), 'Error toast mentions "realised first"');
  assert(/final_signed/.test(toastMsg), 'Error toast names the configured gate');

  section('toggleCommissionPaid flips realised → paid');
  reset();
  saveCommissionStatus({ d5: { state: 'realised', accruedAt: '2026-04-01T00:00:00Z', realisedAt: '2026-04-10T00:00:00Z', paidAt: null, paidBy: null, gateUsed: 'won' } });
  sandbox.getState = () => ({ deals: [{ id: 'd5', rep: 'Dave', branch: 'VIC', won: true, title: 'Dave deal' }] });
  toggleCommissionPaid('d5');
  rec = getCommissionStatusForDeal('d5');
  assertEq(rec.state, 'paid', 'State now paid');
  assert(rec.paidAt, 'paidAt set');
  assertEq(rec.paidBy, 'Admin User', 'paidBy = current user');

  section('toggleCommissionPaid flips paid → realised (revert)');
  toggleCommissionPaid('d5');
  rec = getCommissionStatusForDeal('d5');
  assertEq(rec.state, 'realised', 'Reverted to realised');
  assertEq(rec.paidAt, null, 'paidAt cleared');
  assertEq(rec.paidBy, null, 'paidBy cleared');

  section('Permission gate — non-admin blocked');
  reset();
  sandbox.getCurrentUser = () => ({ id: 'rep', name: 'Some Rep', role: 'sales_rep', branch: 'VIC' });
  saveCommissionStatus({ d6: { state: 'realised', accruedAt: '2026-04-01T00:00:00Z', realisedAt: '2026-04-10T00:00:00Z', paidAt: null, paidBy: null, gateUsed: 'won' } });
  sandbox.getState = () => ({ deals: [{ id: 'd6', rep: 'Eve', branch: 'VIC', won: true }] });
  toastMsg = '';
  sandbox.addToast = (msg) => { toastMsg = msg; };
  toggleCommissionPaid('d6');
  rec = getCommissionStatusForDeal('d6');
  assertEq(rec.state, 'realised', 'Non-admin cannot mark paid');
  assert(/admin or accounts/i.test(toastMsg), 'Error toast mentions admin/accounts permission');

  section('Legacy migration: spartan_commission_paid → spartan_commission_status');
  reset();
  sandbox.getCurrentUser = () => ({ id: 'admin', name: 'Admin', role: 'admin', branch: 'VIC' });
  // Pre-seed the legacy key with two records — one paid, one unpaid
  sandbox.localStorage.setItem(COMMISSION_PAID_LEGACY_KEY, JSON.stringify({
    d_old_paid:   { status: 'paid',   paidDate: '2026-03-01', paidBy: 'Old Admin' },
    d_old_unpaid: { status: 'unpaid', paidDate: null,         paidBy: null },
  }));
  let status = getCommissionStatus();
  assert(status.d_old_paid, 'Paid legacy record migrated');
  assertEq(status.d_old_paid.state, 'paid', 'Paid legacy → state=paid');
  assertEq(status.d_old_paid.paidBy, 'Old Admin', 'paidBy preserved');
  assertEq(status.d_old_paid.gateUsed, 'legacy_migration', 'gateUsed marked legacy_migration');
  assert(status.d_old_paid.paidAt && status.d_old_paid.paidAt.indexOf('2026-03-01') === 0, 'paidAt derived from paidDate');
  assert(status.d_old_unpaid, 'Unpaid legacy record migrated');
  assertEq(status.d_old_unpaid.state, 'accrued', 'Unpaid legacy → state=accrued (stuck waiting for gate)');
  assert(sandbox.localStorage.getItem(COMMISSION_PAID_LEGACY_KEY) !== null,
    'Legacy key preserved (read-only fallback per brief mitigation)');
  assert(sandbox.localStorage.getItem(COMMISSION_STATUS_KEY) !== null, 'New status key written');
  // Migration audit entry
  let migEntries = sandbox._auditEntries.filter(e => e.action === 'system.commission_state_migrated' && e.metadata && e.metadata.migration === 'paid_to_status_v1');
  assertEq(migEntries.length, 1, 'Single migration audit entry written');
  assertEq(migEntries[0].metadata.migratedCount, 2, 'Migration audit records 2 records migrated');

  section('Migration is idempotent — second call no-ops');
  let beforeAuditCount = sandbox._auditEntries.length;
  getCommissionStatus();
  getCommissionStatus();
  assertEq(sandbox._auditEntries.length, beforeAuditCount, 'No additional audit entries on re-read');

  section('Backward-compat shim: getCommissionPaid translates new shape to old');
  let oldShape = getCommissionPaid();
  assertEq(oldShape.d_old_paid.status, 'paid', 'Translated paid status');
  assertEq(oldShape.d_old_paid.paidDate, '2026-03-01', 'Translated paidDate');
  assertEq(oldShape.d_old_paid.paidBy, 'Old Admin', 'Translated paidBy');
  assertEq(oldShape.d_old_unpaid.status, 'unpaid', 'Translated unpaid status');
  assertEq(oldShape.d_old_unpaid.paidDate, null, 'Translated paidDate=null on unpaid');

  section('Backward-compat shim: saveCommissionPaid routes through new shape');
  reset();
  saveCommissionPaid({ d_via_legacy: { status: 'paid', paidDate: '2026-04-20', paidBy: 'Legacy Admin' } });
  rec = getCommissionStatusForDeal('d_via_legacy');
  assert(rec, 'Record created via legacy save path');
  assertEq(rec.state, 'paid', 'state=paid');
  assertEq(rec.paidBy, 'Legacy Admin', 'paidBy preserved');

  section('payRunId field exists on records (Phase 7 hook)');
  // accrueCommission seeds payRunId:null so Phase 7's pay-run flow can
  // identify "orphan paid" records vs "in pay run X" records.
  reset();
  deal = { id: 'd_phase7', val: 11000, rep: 'Frank', branch: 'VIC', won: true };
  accrueCommission(deal);
  rec = getCommissionStatusForDeal('d_phase7');
  assertEq(rec.payRunId, null, 'payRunId initialised to null');

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
