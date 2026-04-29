// ════════════════════════════════════════════════════════════════════════════
// Brief 4 Phase 2 — calcDealCommission engine test
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the new full-fat calc engine: product multipliers, volume bonuses,
// age penalty, the {exGst, baseRate, productMultiplier, ..., breakdown}
// return shape, and backward-compat with the legacy calcCommission shim.
//
// Run:  node tests/commission-calc.test.cjs
//   or: npm run test:commission-calc
//
// Loads the actual production source via section markers (CONFIG DATA MODEL
// header through the end of CALC ENGINE plus the deprecated shim) so tests
// stay in sync with what ships. PIPELINES is stubbed in the sandbox to
// match the production seed pipelines so age-anchor lookup works.

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
function assertEq(actual, expected, label) {
  assert(actual === expected, label + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
function assertNear(actual, expected, eps, label) {
  const ok = Math.abs(actual - expected) <= (eps || 0.0001);
  assert(ok, label + ' (expected ~' + expected + ', got ' + actual + ')');
}
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

function makeSandbox(extraDeals) {
  const auditEntries = [];
  // Mirror the production PIPELINES seed so _getAgeAnchorDate's
  // /quote|proposal/i match against stage names works.
  const PIPELINES = [
    { id: 'p1', name: 'Residential', stages: [
      { id: 's1', name: 'New Enquiry',     prob: 10,  ord: 1 },
      { id: 's2', name: 'Measure Booked',  prob: 25,  ord: 2 },
      { id: 's3', name: 'Quote Sent',      prob: 50,  ord: 3 },
      { id: 's4', name: 'Follow Up',       prob: 65,  ord: 4 },
      { id: 's5', name: 'Won',             prob: 100, ord: 5, isWon: true },
      { id: 's6', name: 'Not Proceeding',  prob: 0,   ord: 6, isLost: true },
    ]},
    { id: 'p2', name: 'Commercial', stages: [
      { id: 's7',  name: 'Initial Contact', prob: 10,  ord: 1 },
      { id: 's8',  name: 'Site Survey',     prob: 30,  ord: 2 },
      { id: 's9',  name: 'Proposal Sent',   prob: 50,  ord: 3 },
      { id: 's10', name: 'Negotiation',     prob: 75,  ord: 4 },
      { id: 's11', name: 'Won',             prob: 100, ord: 5, isWon: true },
      { id: 's12', name: 'Not Proceeding',  prob: 0,   ord: 6, isLost: true },
    ]},
  ];
  const sandbox = {
    localStorage: makeLocalStorage(),
    getCurrentUser: () => ({ id: 'test_user', name: 'Test', branch: 'VIC' }),
    appendAuditEntry: (e) => { auditEntries.push(e); return e; },
    addToast: () => {},
    renderPage: () => {},
    getState: () => ({ deals: extraDeals || [] }),
    PIPELINES: PIPELINES,
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Error,
    setTimeout, clearTimeout, isNaN, parseFloat, parseInt,
  };
  vm.createContext(sandbox);
  sandbox._auditEntries = auditEntries;
  return sandbox;
}

function loadCommissionEngine(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '24-commission.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  // Slice from CONFIG DATA MODEL section through the legacy calcCommission
  // shim (which sits just below CALC ENGINE). Stop before
  // toggleCommissionPaid which depends on globals (deals, paid, etc.) we
  // don't fully stub.
  const startMarker = '// CONFIG DATA MODEL (Brief 4 Phase 1)';
  const endMarker = 'function toggleCommissionPaid';
  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find Phase 2 section markers in 24-commission.js');
  }
  vm.runInContext(full.slice(startIdx, endIdx), sandbox, { filename: '24-commission.js (slice)' });
}

function run() {
  const sandbox = makeSandbox();
  loadCommissionEngine(sandbox);
  const { calcDealCommission, calcCommission, saveCommissionRules,
          _computeProductMultiplier, _computeVolumeBonusPct,
          _computeAgePenalty, _getAgeAnchorDate, _daysBetween } = sandbox;

  function reset() { sandbox.localStorage.clear(); sandbox._auditEntries.length = 0; }

  section('Exports + smoke');
  assertEq(typeof calcDealCommission, 'function', 'calcDealCommission exported');
  assertEq(typeof calcCommission, 'function', 'calcCommission (legacy) exported');
  assertEq(typeof _computeProductMultiplier, 'function', '_computeProductMultiplier exported');
  assertEq(typeof _computeVolumeBonusPct, 'function', '_computeVolumeBonusPct exported');
  assertEq(typeof _computeAgePenalty, 'function', '_computeAgePenalty exported');

  section('Null / empty deal');
  reset();
  let r = calcDealCommission(null);
  assertEq(r.commission, 0, 'null deal → commission 0');
  assertEq(r.exGst, 0, 'null deal → exGst 0');
  assert(Array.isArray(r.breakdown), 'null deal → breakdown is array');

  section('Default rules — base rate only');
  reset();
  // Default rules: baseRate 5%, no perRep override, no productMultiplier
  // beyond _default=1.0 and bifold_door=1.2 (seed), volumeBonuses [{100k,1%}]
  // (seed). Use a deal with no quote, so multiplier = 1.0 (default) and
  // no volume bonus tripped (no other won deals).
  let deal = {
    id: 'd1', val: 11000, rep: 'Alice', branch: 'VIC',
    won: true, wonDate: '2026-04-15', created: '2026-04-01',
  };
  r = calcDealCommission(deal, { allDeals: [deal] });
  assertNear(r.exGst, 10000, 0.001, 'exGst = val/1.1 = 10000');
  assertEq(r.baseRate, 5, 'Default baseRate is 5%');
  assertEq(r.productMultiplier, 1.0, 'No quote → multiplier = 1.0');
  assertEq(r.volumeBonusPct, 0, 'No prior won deals → no volume bonus');
  assertEq(r.agePenaltyPct, 0, 'daysToWin (14) < threshold (60) → no penalty');
  assertEq(r.effectiveRate, 5, 'effectiveRate = 5');
  assertNear(r.commission, 500, 0.01, 'commission = 10000 × 5% × 1.0 = 500');

  section('Premium product multiplier (bifold_door = 1.2)');
  reset();
  deal = {
    id: 'd2', val: 11000, rep: 'Alice', branch: 'VIC',
    won: true, wonDate: '2026-04-15', created: '2026-04-01',
    wonQuoteId: 'q1',
    quotes: [{ id: 'q1', projectItems: [
      { productType: 'bifold_door' },
      { productType: 'bifold_door' },
    ] }],
  };
  r = calcDealCommission(deal, { allDeals: [deal] });
  assertEq(r.productMultiplier, 1.2, 'Two bifold doors → multiplier 1.2');
  assertNear(r.commission, 600, 0.01, 'commission = 10000 × 5% × 1.2 = 600');
  // Breakdown should mention the multiplier line
  const hasMult = r.breakdown.some(x => /Product multiplier/i.test(x.label));
  assert(hasMult, 'Breakdown includes Product multiplier line');

  section('Mixed-product weighted average (3 bifold + 2 standard, weighted by item count)');
  reset();
  deal = {
    id: 'd3', val: 22000, rep: 'Alice', branch: 'VIC',
    won: true, wonDate: '2026-04-15', created: '2026-04-01',
    wonQuoteId: 'q1',
    quotes: [{ id: 'q1', projectItems: [
      { productType: 'bifold_door' },
      { productType: 'bifold_door' },
      { productType: 'bifold_door' },
      { productType: 'awning_window' },  // _default = 1.0
      { productType: 'sliding_window' }, // _default = 1.0
    ] }],
  };
  r = calcDealCommission(deal, { allDeals: [deal] });
  // (3 × 1.2 + 2 × 1.0) / 5 = (3.6 + 2.0) / 5 = 5.6 / 5 = 1.12
  assertNear(r.productMultiplier, 1.12, 0.0001, 'Weighted avg multiplier = 1.12');
  assertNear(r.commission, 22000 / 1.1 * 0.05 * 1.12, 0.01, 'commission with weighted multiplier');

  section('Volume bonus — applies only to subsequent deals (not the trigger)');
  reset();
  // Configure a $50k threshold for easier testing
  saveCommissionRules({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'won' },
    perRep: {}, perBranch: {},
    productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }],
    volumeBonuses: [{ threshold: 50000, bonusPct: 2 }],
  }, { silent: true });
  // Three deals, same rep, same month, ascending wonDate
  const d1 = { id: 'd1', val: 33000, rep: 'Bob', won: true, wonDate: '2026-04-10', created: '2026-04-01' }; // exGst 30000
  const d2 = { id: 'd2', val: 33000, rep: 'Bob', won: true, wonDate: '2026-04-15', created: '2026-04-01' }; // exGst 30000 → cumul 30000
  const d3 = { id: 'd3', val: 33000, rep: 'Bob', won: true, wonDate: '2026-04-20', created: '2026-04-01' }; // cumul 60000 → past 50k
  const allDeals = [d1, d2, d3];
  // d1: nothing prior → no bonus
  let rd1 = calcDealCommission(d1, { allDeals: allDeals });
  assertEq(rd1.volumeBonusPct, 0, 'd1 has no prior wins → no bonus');
  // d2: prior is d1 (exGst 30k < 50k threshold) → no bonus yet
  let rd2 = calcDealCommission(d2, { allDeals: allDeals });
  assertEq(rd2.volumeBonusPct, 0, 'd2 prior total 30k < 50k threshold → no bonus');
  // d3: prior is d1+d2 (60k ≥ 50k) → bonus applies
  let rd3 = calcDealCommission(d3, { allDeals: allDeals });
  assertEq(rd3.volumeBonusPct, 2, 'd3 prior total 60k ≥ 50k threshold → +2% bonus');
  assertEq(rd3.effectiveRate, 7, 'effectiveRate = 5 + 2 = 7%');
  assertNear(rd3.commission, 30000 * 0.07, 0.01, 'commission reflects volume bonus');
  // The trigger deal itself — d2 — gets no bonus because we don't include
  // its own value in the threshold check (subsequent-only rule).

  section('Volume bonus — different month boundary');
  reset();
  saveCommissionRules({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'won' },
    perRep: {}, perBranch: {},
    productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }],
    volumeBonuses: [{ threshold: 30000, bonusPct: 2 }],
  }, { silent: true });
  // d1 in March, d2 in April — d2 should NOT see d1's volume even though
  // total across months would be 60k.
  const d_mar = { id: 'd_mar', val: 33000, rep: 'Carol', won: true, wonDate: '2026-03-25', created: '2026-03-01' };
  const d_apr = { id: 'd_apr', val: 11000, rep: 'Carol', won: true, wonDate: '2026-04-10', created: '2026-04-01' };
  let rApr = calcDealCommission(d_apr, { allDeals: [d_mar, d_apr] });
  assertEq(rApr.volumeBonusPct, 0, 'April deal does not see March volume (cross-month boundary)');

  section('Age penalty — daysToWin > threshold');
  reset();
  saveCommissionRules({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'won' },
    perRep: {}, perBranch: {},
    productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }],
    volumeBonuses: [],
  }, { silent: true });
  // 75 days from QuoteBooked to Won — exceeds 60d threshold by 15
  deal = {
    id: 'd_old', val: 11000, rep: 'Alice', branch: 'VIC',
    won: true, wonDate: '2026-04-15', created: '2026-01-01',
    pid: 'p1',
    stageHistory: { s3: '2026-01-30T10:00:00Z' }, // Quote Sent on 2026-01-30
  };
  r = calcDealCommission(deal, { allDeals: [deal] });
  assertEq(r.meta.daysToWin, 75, 'daysToWin = Apr 15 - Jan 30 = 75');
  assertEq(r.agePenaltyPct, 1, 'age penalty applies (75 > 60)');
  assertEq(r.effectiveRate, 4, 'effectiveRate = 5 - 1 = 4');
  // Breakdown surfaces the days
  const ageLine = r.breakdown.find(x => /Age penalty/i.test(x.label));
  assert(ageLine && /75/.test(ageLine.label), 'Breakdown line shows 75 days');

  section('Age penalty — within threshold (no penalty)');
  reset();
  saveCommissionRules({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'won' },
    perRep: {}, perBranch: {}, productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }], volumeBonuses: [],
  }, { silent: true });
  deal = {
    id: 'd_quick', val: 11000, rep: 'Alice', branch: 'VIC',
    won: true, wonDate: '2026-02-10', created: '2026-01-01',
    pid: 'p1', stageHistory: { s3: '2026-01-15T10:00:00Z' }, // 26 days
  };
  r = calcDealCommission(deal, { allDeals: [deal] });
  assertEq(r.meta.daysToWin, 26, 'daysToWin = 26');
  assertEq(r.agePenaltyPct, 0, 'No penalty when daysToWin ≤ threshold');

  section('Age anchor falls back to deal.created when stageHistory missing');
  reset();
  // No stageHistory → fall back to deal.created
  deal = { id: 'd_legacy', val: 11000, rep: 'Alice', branch: 'VIC', won: true, wonDate: '2026-04-15', created: '2026-01-01', pid: 'p1' };
  let anchor = _getAgeAnchorDate(deal);
  assertEq(anchor, '2026-01-01', 'Fallback anchor = created date');

  section('Effective rate clamped at 0 (penalty exceeds base)');
  reset();
  saveCommissionRules({
    defaults: { baseRate: 2, ageThresholdDays: 60, agePenaltyPct: 5, realisationGate: 'won' },
    perRep: {}, perBranch: {}, productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }], volumeBonuses: [],
  }, { silent: true });
  deal = { id: 'd_x', val: 11000, rep: 'Alice', branch: 'VIC', won: true, wonDate: '2026-06-01', created: '2026-01-01', pid: 'p1' };
  r = calcDealCommission(deal, { allDeals: [deal] });
  // baseRate 2 - penalty 5 = -3 → clamped to 0
  assertEq(r.effectiveRate, 0, 'effectiveRate clamped to 0 when penalty > base');
  assertEq(r.commission, 0, 'commission = 0 at clamped rate');

  section('Per-branch override applies');
  reset();
  saveCommissionRules({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'won' },
    perRep: {},
    perBranch: { ACT: { baseRate: 7 } },
    productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }],
    volumeBonuses: [],
  }, { silent: true });
  deal = { id: 'd_act', val: 11000, rep: 'NewRep', branch: 'ACT', won: true, wonDate: '2026-04-15', created: '2026-04-01' };
  r = calcDealCommission(deal, { allDeals: [deal] });
  assertEq(r.baseRate, 7, 'ACT branch baseRate (7%) applies for rep with no per-rep override');

  section('calcCommission (legacy shim) preserves shape');
  reset();
  let legacy = calcCommission(11000, 'Alice');
  assert(legacy && typeof legacy.exGst === 'number', 'legacy shim has exGst');
  assert(typeof legacy.rate === 'number', 'legacy shim has rate');
  assert(typeof legacy.commission === 'number', 'legacy shim has commission');
  assertNear(legacy.exGst, 10000, 0.001, 'legacy exGst = 10000');
  assertEq(legacy.rate, 5, 'legacy rate (default) = 5');
  assertNear(legacy.commission, 500, 0.001, 'legacy commission = 500');
  // Legacy shim does NOT include breakdown (signals to consumers that
  // they should migrate to calcDealCommission for the full breakdown).
  assertEq(legacy.breakdown, undefined, 'legacy shim has no breakdown field (intentional)');

  section('_daysBetween edge cases');
  assertEq(_daysBetween('2026-01-01', '2026-01-01'), 0, 'same date → 0 days');
  assertEq(_daysBetween('2026-01-01', '2026-01-31'), 30, '30-day diff');
  assertEq(_daysBetween('2026-02-01', '2026-01-01'), 0, 'Negative range clamps to 0');
  assertEq(_daysBetween(null, '2026-01-01'), null, 'null start → null');
  assertEq(_daysBetween('2026-01-01', null), null, 'null end → null');
  assertEq(_daysBetween('not-a-date', '2026-01-01'), null, 'unparseable → null');

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
