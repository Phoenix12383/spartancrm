// ════════════════════════════════════════════════════════════════════════════
// Brief 4 Phase 6 — dashboard surfaces test
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the read-only derived-data helpers added by Phase 6:
// _computeCommissionStateTotals, _computePipelineProjection,
// _computeTeamRollup, _renderCommissionBreakdownTip.
//
// Run:  node tests/commission-dashboard.test.cjs
//   or: npm run test:commission-dashboard

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

function loadCommissionDashboard(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '24-commission.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  // Slice from CONFIG DATA MODEL through DASHBOARD SURFACES — this brings
  // in Phase 1+2+3+5+7 helpers plus Phase 6's compute functions, but
  // stops before renderCommissionPage which depends on more globals.
  const startMarker = '// CONFIG DATA MODEL (Brief 4 Phase 1)';
  const endMarker = 'function renderCommissionPage';
  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find Phase 6 section markers in 24-commission.js');
  }
  vm.runInContext(full.slice(startIdx, endIdx), sandbox, { filename: '24-commission.js (Phase 6 slice)' });
}

function run() {
  // Today-relative deals for MTD/YTD scope tests
  const today = new Date();
  const thisYear = today.getFullYear();
  const thisMonth = String(today.getMonth() + 1).padStart(2, '0');
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const lastMonth = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
  const lastMonthYear = lastMonthDate.getFullYear();

  const deals = [
    // Won deals — distributed across rep + month
    { id: 'd1', title: 'Smith MTD', val: 11000, rep: 'Alice', branch: 'VIC', won: true, wonDate: thisYear + '-' + thisMonth + '-05', pid: 'p1' },
    { id: 'd2', title: 'Jones MTD', val: 22000, rep: 'Alice', branch: 'VIC', won: true, wonDate: thisYear + '-' + thisMonth + '-12', pid: 'p1' },
    { id: 'd3', title: 'Lee MTD',   val: 16500, rep: 'Bob',   branch: 'VIC', won: true, wonDate: thisYear + '-' + thisMonth + '-15', pid: 'p1' },
    { id: 'd4', title: 'Patel LM',  val: 33000, rep: 'Alice', branch: 'VIC', won: true, wonDate: lastMonthYear + '-' + lastMonth + '-20', pid: 'p1' },
    { id: 'd5', title: 'Brown LY',  val: 11000, rep: 'Carol', branch: 'VIC', won: true, wonDate: (thisYear - 1) + '-06-15', pid: 'p1' },
    // Open deals — for projection
    { id: 'o1', title: 'Open Alice', val: 22000, rep: 'Alice', branch: 'VIC', won: false, lost: false, pid: 'p1' },
    { id: 'o2', title: 'Open Bob',   val: 11000, rep: 'Bob',   branch: 'VIC', won: false, lost: false, pid: 'p1' },
    { id: 'o3', title: 'Lost deal',  val: 99999, rep: 'Alice', branch: 'VIC', won: false, lost: true, pid: 'p1' },
  ];

  const sandbox = makeSandbox(deals);
  loadCommissionDashboard(sandbox);
  const { _computeCommissionStateTotals, _computePipelineProjection,
          _computeTeamRollup, _renderCommissionBreakdownTip,
          accrueCommission, getCommissionStatus, saveCommissionStatus,
          calcDealCommission } = sandbox;

  function reset() { sandbox.localStorage.clear(); sandbox._auditEntries.length = 0; }
  function seedAccrued() {
    deals.forEach(function (d) { if (d.won) accrueCommission(d); });
  }

  section('Exports');
  assertEq(typeof _computeCommissionStateTotals, 'function', '_computeCommissionStateTotals exported');
  assertEq(typeof _computePipelineProjection, 'function', '_computePipelineProjection exported');
  assertEq(typeof _computeTeamRollup, 'function', '_computeTeamRollup exported');
  assertEq(typeof _renderCommissionBreakdownTip, 'function', '_renderCommissionBreakdownTip exported');

  section('_computeCommissionStateTotals — empty inputs');
  reset();
  let totals = _computeCommissionStateTotals([], {}, null);
  assertEq(totals.accrued, 0, 'Empty: accrued = 0');
  assertEq(totals.realised, 0, 'Empty: realised = 0');
  assertEq(totals.paid, 0, 'Empty: paid = 0');
  totals = _computeCommissionStateTotals(null, null, null);
  assertEq(totals.accrued, 0, 'Null inputs: accrued = 0');

  section('_computeCommissionStateTotals — gate=won auto-realises');
  reset();
  seedAccrued();
  // All Won deals were just accrued with default gate=won, so all should
  // be in 'realised' state.
  totals = _computeCommissionStateTotals(deals.filter(d => d.won), getCommissionStatus(), null);
  assert(totals.realised > 0, 'Default gate=won → realised > 0');
  assertEq(totals.paid, 0, 'No deals paid yet → paid = 0');

  section('_computeCommissionStateTotals — scope predicate (MTD)');
  reset();
  seedAccrued();
  let status = getCommissionStatus();
  let inMonth = (d) => {
    if (!d.wonDate) return false;
    let wd = new Date(d.wonDate + 'T12:00:00');
    return wd.getMonth() === today.getMonth() && wd.getFullYear() === thisYear;
  };
  let mtd = _computeCommissionStateTotals(deals.filter(d => d.won), status, inMonth);
  // MTD has d1+d2 (Alice) + d3 (Bob) — 3 deals. d4/d5 excluded.
  // Sum should be > sum of just one of them
  let oneDeal = calcDealCommission(deals.find(d => d.id === 'd1')).commission;
  assert(mtd.realised > oneDeal, 'MTD realised includes multiple deals');

  section('_computeCommissionStateTotals — scope predicate (YTD)');
  let inYear = (d) => {
    if (!d.wonDate) return false;
    return new Date(d.wonDate + 'T12:00:00').getFullYear() === thisYear;
  };
  let ytd = _computeCommissionStateTotals(deals.filter(d => d.won), status, inYear);
  // YTD includes d1, d2, d3, d4 (last month is still this year unless we cross Jan)
  // But d5 is last year — excluded.
  assert(ytd.realised >= mtd.realised, 'YTD ≥ MTD');

  section('_computeCommissionStateTotals — paid state counted correctly');
  reset();
  // Manually craft status: one paid, one realised, one accrued
  saveCommissionStatus({
    'd1': { state: 'paid',     accruedAt: '2026-04-01', realisedAt: '2026-04-01', paidAt: '2026-04-15', paidBy: 'X', payRunId: null },
    'd2': { state: 'realised', accruedAt: '2026-04-01', realisedAt: '2026-04-01', paidAt: null,         paidBy: null, payRunId: null },
    'd3': { state: 'accrued',  accruedAt: '2026-04-01', realisedAt: null,         paidAt: null,         paidBy: null, payRunId: null },
  });
  let s = getCommissionStatus();
  let onlyThree = deals.filter(d => ['d1','d2','d3'].indexOf(d.id) >= 0);
  totals = _computeCommissionStateTotals(onlyThree, s, null);
  assert(totals.paid > 0, 'paid > 0 (d1 paid)');
  assert(totals.realised > 0, 'realised > 0 (d2 realised)');
  assert(totals.accrued > 0, 'accrued > 0 (d3 accrued)');
  // Ratios: each state should be exactly one deal's commission
  let d1c = calcDealCommission(deals.find(d => d.id === 'd1')).commission;
  let d2c = calcDealCommission(deals.find(d => d.id === 'd2')).commission;
  let d3c = calcDealCommission(deals.find(d => d.id === 'd3')).commission;
  assertNear(totals.paid, d1c, 0.01, 'paid total = d1 commission');
  assertNear(totals.realised, d2c, 0.01, 'realised total = d2 commission');
  assertNear(totals.accrued, d3c, 0.01, 'accrued total = d3 commission');

  section('_computeCommissionStateTotals — won=false deals ignored');
  reset();
  let openDealsOnly = deals.filter(d => !d.won);
  totals = _computeCommissionStateTotals(openDealsOnly, {}, null);
  assertEq(totals.accrued, 0, 'No won deals → accrued = 0');
  assertEq(totals.realised, 0, 'No won deals → realised = 0');

  section('_computePipelineProjection — open deals only, exclude lost');
  reset();
  let allProj = _computePipelineProjection(deals, null);
  // Should include o1 (22k) and o2 (11k) but NOT o3 (lost) or any won deal
  let o1c = calcDealCommission(deals.find(d => d.id === 'o1')).commission;
  let o2c = calcDealCommission(deals.find(d => d.id === 'o2')).commission;
  assertNear(allProj, o1c + o2c, 0.01, 'Projection = o1 + o2 (lost o3 excluded)');

  section('_computePipelineProjection — repName filter');
  let aliceProj = _computePipelineProjection(deals, 'Alice');
  // Alice has only o1 open (o3 is lost)
  assertNear(aliceProj, o1c, 0.01, 'Alice projection = o1 only');
  let bobProj = _computePipelineProjection(deals, 'Bob');
  assertNear(bobProj, o2c, 0.01, 'Bob projection = o2 only');
  let nobody = _computePipelineProjection(deals, 'Nobody');
  assertEq(nobody, 0, 'Unknown rep projection = 0');

  section('_computeTeamRollup — basic shape');
  reset();
  seedAccrued();
  status = getCommissionStatus();
  let users = [
    { name: 'Alice', role: 'sales_rep', initials: 'AS', active: true },
    { name: 'Bob',   role: 'sales_rep', initials: 'BJ', active: true },
    { name: 'Carol', role: 'sales_rep', initials: 'CL', active: true },
  ];
  let rollup = _computeTeamRollup(deals.filter(d => d.won), status, users);
  assert(Array.isArray(rollup.rows), 'rollup.rows is array');
  assertEq(rollup.rows.length, 3, '3 rep rows');
  let aliceRow = rollup.rows.find(r => r.repName === 'Alice');
  assert(aliceRow, 'Alice row present');
  assertEq(aliceRow.wonCount, 3, 'Alice has 3 won deals (d1+d2+d4)');
  assertNear(aliceRow.wonValue, 11000 + 22000 + 33000, 0.01, 'Alice wonValue sum');
  assertNear(aliceRow.avgValue, (11000 + 22000 + 33000) / 3, 0.01, 'Alice avgValue');

  section('_computeTeamRollup — sorted by total commission descending');
  // Alice has the most deals + value → first
  assertEq(rollup.rows[0].repName, 'Alice', 'Alice (top performer) sorted first');

  section('_computeTeamRollup — outlier flagging requires 4+ reps');
  // We have 3 reps → no flagging fires regardless
  rollup.rows.forEach(function (r) {
    assertEq(r.isOutlier, false, r.repName + ': no outlier flag (N < 4)');
  });

  section('_computeTeamRollup — outlier fires with 4+ reps when below μ - 2σ');
  reset();
  // Construct a 6-rep dataset where Eve is way below average. Need 6
  // reps (not 5) so the variance isn't entirely driven by Eve herself —
  // with 5 identical-plus-one-zero, σ is so wide that the lower band
  // sits at exactly 0 (mathematical artefact). 6 reps gives enough
  // signal for σ to register the outlier as outside the band.
  let bigDeals = [
    { id: 'a', val: 100000, rep: 'Alice', won: true, wonDate: thisYear + '-' + thisMonth + '-01', pid: 'p1' },
    { id: 'b', val: 100000, rep: 'Bob',   won: true, wonDate: thisYear + '-' + thisMonth + '-01', pid: 'p1' },
    { id: 'c', val: 100000, rep: 'Carol', won: true, wonDate: thisYear + '-' + thisMonth + '-01', pid: 'p1' },
    { id: 'd', val: 100000, rep: 'Dave',  won: true, wonDate: thisYear + '-' + thisMonth + '-01', pid: 'p1' },
    { id: 'f', val: 100000, rep: 'Frank', won: true, wonDate: thisYear + '-' + thisMonth + '-01', pid: 'p1' },
    { id: 'e', val: 0,      rep: 'Eve',   won: true, wonDate: thisYear + '-' + thisMonth + '-01', pid: 'p1' },
  ];
  sandbox.getState = () => ({ deals: bigDeals });
  let bigUsers = [
    { name: 'Alice', role: 'sales_rep', initials: 'A', active: true },
    { name: 'Bob',   role: 'sales_rep', initials: 'B', active: true },
    { name: 'Carol', role: 'sales_rep', initials: 'C', active: true },
    { name: 'Dave',  role: 'sales_rep', initials: 'D', active: true },
    { name: 'Frank', role: 'sales_rep', initials: 'F', active: true },
    { name: 'Eve',   role: 'sales_rep', initials: 'E', active: true },
  ];
  bigDeals.forEach(d => accrueCommission(d));
  let bigStatus = getCommissionStatus();
  let bigRollup = _computeTeamRollup(bigDeals, bigStatus, bigUsers);
  let eveRow = bigRollup.rows.find(r => r.repName === 'Eve');
  assertEq(eveRow.isOutlier, true, 'Eve (way below average) flagged as outlier');
  let aliceBig = bigRollup.rows.find(r => r.repName === 'Alice');
  assertEq(aliceBig.isOutlier, false, 'Alice (at average) NOT flagged');

  section('_computeTeamRollup — rep with no wins');
  reset();
  let mixedUsers = [
    { name: 'Alice', role: 'sales_rep', initials: 'A', active: true },
    { name: 'Newbie', role: 'sales_rep', initials: 'N', active: true }, // no deals
  ];
  let mixedDeals = [
    { id: 'm1', val: 11000, rep: 'Alice', won: true, wonDate: thisYear + '-' + thisMonth + '-01', pid: 'p1' },
  ];
  sandbox.getState = () => ({ deals: mixedDeals });
  mixedDeals.forEach(d => accrueCommission(d));
  let mixedRollup = _computeTeamRollup(mixedDeals, getCommissionStatus(), mixedUsers);
  let newbieRow = mixedRollup.rows.find(r => r.repName === 'Newbie');
  assert(newbieRow, 'Newbie row present');
  assertEq(newbieRow.wonCount, 0, 'Newbie has 0 wins');
  assertEq(newbieRow.wonValue, 0, 'Newbie wonValue = 0');
  assertEq(newbieRow.avgValue, 0, 'Newbie avgValue = 0 (no division by zero)');

  section('_renderCommissionBreakdownTip — produces tip HTML');
  reset();
  sandbox.getState = () => ({ deals: deals });
  let html = _renderCommissionBreakdownTip(deals.find(d => d.id === 'd1'));
  assert(typeof html === 'string', 'Returns a string');
  assert(html.indexOf('etrack-tip') >= 0, 'Output contains .etrack-tip class');
  assert(/Base rate/i.test(html), 'Output mentions Base rate');
  assert(/Commission/i.test(html), 'Output mentions Commission');

  section('_renderCommissionBreakdownTip — null deal returns empty string');
  let empty = _renderCommissionBreakdownTip(null);
  assertEq(empty, '', 'null deal → empty string');
  let undef = _renderCommissionBreakdownTip(undefined);
  assertEq(undef, '', 'undefined deal → empty string');

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
