// ════════════════════════════════════════════════════════════════════════════
// Brief 4 Phase 5 — Settings UI helpers test
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the public mutator helpers used by the "Commission Rules" tab:
// setCommissionDefault, setCommissionPerRep, setCommissionPerBranch,
// addCommissionMultiplier / setCommissionMultiplier / removeCommissionMultiplier,
// addCommissionBonus / setCommissionBonus / removeCommissionBonus.
//
// Each helper writes through saveCommissionRules → audit. Tests assert
// the audit metadata is shaped right so the admin Audit page filtering
// (Brief 2 Phase 3) keeps working cleanly.
//
// Run:  node tests/commission-settings.test.cjs
//   or: npm run test:commission-settings

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

function makeSandbox() {
  const auditEntries = [];
  const sandbox = {
    localStorage: makeLocalStorage(),
    getCurrentUser: () => ({ id: 'admin', name: 'Admin', role: 'admin', branch: 'VIC' }),
    appendAuditEntry: (e) => { auditEntries.push(e); return e; },
    addToast: () => {},
    renderPage: () => {},
    getState: () => ({ deals: [] }),
    PIPELINES: [],
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Error,
    setTimeout, clearTimeout, isNaN, parseFloat, parseInt,
  };
  vm.createContext(sandbox);
  sandbox._auditEntries = auditEntries;
  return sandbox;
}

function loadCommissionSettings(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '24-commission.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  // Slice from CONFIG DATA MODEL through SETTINGS HELPERS, stop before
  // CALC ENGINE (which we're not testing here and which calls into globals
  // we don't fully stub).
  const startMarker = '// CONFIG DATA MODEL (Brief 4 Phase 1)';
  const endMarker = '// CALC ENGINE (Brief 4 Phase 2)';
  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find Phase 5 section markers in 24-commission.js');
  }
  vm.runInContext(full.slice(startIdx, endIdx), sandbox, { filename: '24-commission.js (Phase 5 slice)' });
}

function run() {
  const sandbox = makeSandbox();
  loadCommissionSettings(sandbox);
  const { setCommissionDefault, setCommissionPerRep, setCommissionPerBranch,
          addCommissionMultiplier, setCommissionMultiplier, removeCommissionMultiplier,
          addCommissionBonus, setCommissionBonus, removeCommissionBonus,
          getCommissionRules, getEffectiveRuleForRep } = sandbox;

  function reset() { sandbox.localStorage.clear(); sandbox._auditEntries.length = 0; }
  function lastRulesAudit() {
    return sandbox._auditEntries.filter(e => e.action === 'commission.rules_updated').slice(-1)[0];
  }

  section('Exports');
  assertEq(typeof setCommissionDefault, 'function', 'setCommissionDefault exported');
  assertEq(typeof setCommissionPerRep, 'function', 'setCommissionPerRep exported');
  assertEq(typeof setCommissionPerBranch, 'function', 'setCommissionPerBranch exported');
  assertEq(typeof addCommissionMultiplier, 'function', 'addCommissionMultiplier exported');
  assertEq(typeof setCommissionMultiplier, 'function', 'setCommissionMultiplier exported');
  assertEq(typeof removeCommissionMultiplier, 'function', 'removeCommissionMultiplier exported');
  assertEq(typeof addCommissionBonus, 'function', 'addCommissionBonus exported');
  assertEq(typeof setCommissionBonus, 'function', 'setCommissionBonus exported');
  assertEq(typeof removeCommissionBonus, 'function', 'removeCommissionBonus exported');

  section('setCommissionDefault writes + audits');
  reset();
  setCommissionDefault('baseRate', 6);
  let rules = getCommissionRules();
  assertEq(rules.defaults.baseRate, 6, 'baseRate persisted to 6');
  let audit = lastRulesAudit();
  assert(audit, 'Audit entry written');
  assertEq(audit.metadata.kind, 'default', 'metadata.kind = default');
  assertEq(audit.metadata.field, 'baseRate', 'metadata.field = baseRate');
  assertEq(audit.before.defaults.value, 5, 'before value = 5 (seed default)');
  assertEq(audit.after.defaults.value, 6, 'after value = 6');

  section('setCommissionDefault rejects invalid input');
  reset();
  setCommissionDefault('baseRate', 'not-a-number');
  rules = getCommissionRules();
  assertEq(rules.defaults.baseRate, 5, 'baseRate unchanged on invalid input');
  setCommissionDefault('baseRate', -1);
  rules = getCommissionRules();
  assertEq(rules.defaults.baseRate, 5, 'baseRate unchanged on negative input');

  section('setCommissionDefault realisationGate validation');
  reset();
  setCommissionDefault('realisationGate', 'final_signed');
  rules = getCommissionRules();
  assertEq(rules.defaults.realisationGate, 'final_signed', 'gate set to final_signed');
  setCommissionDefault('realisationGate', 'bogus_gate');
  rules = getCommissionRules();
  assertEq(rules.defaults.realisationGate, 'final_signed', 'gate unchanged on bogus value');

  section('setCommissionDefault no-op on same value');
  reset();
  setCommissionDefault('baseRate', 5); // same as seed default
  let auditCountBefore = sandbox._auditEntries.length;
  setCommissionDefault('baseRate', 5);
  setCommissionDefault('baseRate', 5);
  assertEq(sandbox._auditEntries.length, auditCountBefore, 'No-op same value writes no audit');

  section('setCommissionPerRep — set + clear (fall back to default)');
  reset();
  setCommissionPerRep('Alice', 'baseRate', 8);
  rules = getCommissionRules();
  assertEq(rules.perRep['Alice'].baseRate, 8, 'Alice perRep.baseRate = 8');
  // Effective rule for Alice with no branch override should now be 8
  assertEq(getEffectiveRuleForRep('Alice').baseRate, 8, 'getEffectiveRuleForRep merges Alice override');
  // Clear (empty string) — falls back to default
  setCommissionPerRep('Alice', 'baseRate', '');
  rules = getCommissionRules();
  assert(!rules.perRep['Alice'] || rules.perRep['Alice'].baseRate === undefined,
    'Alice baseRate cleared (or whole entry dropped)');
  assertEq(getEffectiveRuleForRep('Alice').baseRate, 5, 'Alice falls back to default 5');

  section('setCommissionPerRep — drop empty perRep entry');
  reset();
  setCommissionPerRep('Bob', 'baseRate', 7);
  rules = getCommissionRules();
  assert(rules.perRep['Bob'], 'Bob entry created');
  setCommissionPerRep('Bob', 'baseRate', '');
  rules = getCommissionRules();
  assert(!rules.perRep['Bob'], 'Empty perRep entry dropped after clear');

  section('setCommissionPerRep — multi-field round-trip');
  reset();
  setCommissionPerRep('Carol', 'baseRate', 9);
  setCommissionPerRep('Carol', 'ageThresholdDays', 90);
  setCommissionPerRep('Carol', 'agePenaltyPct', 0.5);
  setCommissionPerRep('Carol', 'realisationGate', 'final_payment');
  rules = getCommissionRules();
  assertEq(rules.perRep['Carol'].baseRate, 9, 'Carol baseRate');
  assertEq(rules.perRep['Carol'].ageThresholdDays, 90, 'Carol ageThresholdDays');
  assertEq(rules.perRep['Carol'].agePenaltyPct, 0.5, 'Carol agePenaltyPct');
  assertEq(rules.perRep['Carol'].realisationGate, 'final_payment', 'Carol realisationGate');
  // Effective rule should merge all four
  let merged = getEffectiveRuleForRep('Carol');
  assertEq(merged.baseRate, 9, 'Merged baseRate');
  assertEq(merged.realisationGate, 'final_payment', 'Merged realisationGate');

  section('setCommissionPerRep — clearing one field keeps others');
  setCommissionPerRep('Carol', 'baseRate', '');
  rules = getCommissionRules();
  assert(rules.perRep['Carol'], 'Carol entry still exists (other fields remain)');
  assertEq(rules.perRep['Carol'].baseRate, undefined, 'baseRate cleared');
  assertEq(rules.perRep['Carol'].ageThresholdDays, 90, 'ageThresholdDays preserved');
  assertEq(rules.perRep['Carol'].realisationGate, 'final_payment', 'realisationGate preserved');

  section('setCommissionPerBranch — set + clear');
  reset();
  setCommissionPerBranch('NSW', 6.5);
  rules = getCommissionRules();
  assertEq(rules.perBranch['NSW'].baseRate, 6.5, 'NSW branch baseRate');
  setCommissionPerBranch('NSW', '');
  rules = getCommissionRules();
  assert(!rules.perBranch['NSW'], 'NSW branch dropped after clear');

  section('addCommissionMultiplier appends + audits');
  reset();
  let rulesBefore = getCommissionRules();
  let prevCount = rulesBefore.productMultipliers.length;
  addCommissionMultiplier();
  rules = getCommissionRules();
  assertEq(rules.productMultipliers.length, prevCount + 1, 'New row appended');
  let last = rules.productMultipliers[rules.productMultipliers.length - 1];
  assertEq(last.productKey, '', 'New row productKey empty (user fills in)');
  assertEq(last.multiplier, 1.0, 'New row multiplier defaults to 1.0');
  audit = lastRulesAudit();
  assertEq(audit.metadata.kind, 'product_multiplier_added', 'Audit kind correct');

  section('setCommissionMultiplier edits + audits');
  reset();
  rules = getCommissionRules();
  // Find the bifold_door entry from the seed
  let bifoldIdx = rules.productMultipliers.findIndex(m => m.productKey === 'bifold_door');
  assert(bifoldIdx >= 0, 'Seed includes bifold_door');
  setCommissionMultiplier(bifoldIdx, 'multiplier', 1.3);
  rules = getCommissionRules();
  assertEq(rules.productMultipliers[bifoldIdx].multiplier, 1.3, 'multiplier updated');
  setCommissionMultiplier(bifoldIdx, 'label', 'Bifold Door (Premium)');
  rules = getCommissionRules();
  assertEq(rules.productMultipliers[bifoldIdx].label, 'Bifold Door (Premium)', 'label updated');

  section('removeCommissionMultiplier — non-default succeeds');
  reset();
  rules = getCommissionRules();
  bifoldIdx = rules.productMultipliers.findIndex(m => m.productKey === 'bifold_door');
  let beforeLen = rules.productMultipliers.length;
  removeCommissionMultiplier(bifoldIdx);
  rules = getCommissionRules();
  assertEq(rules.productMultipliers.length, beforeLen - 1, 'bifold_door removed');
  assertEq(rules.productMultipliers.findIndex(m => m.productKey === 'bifold_door'), -1,
    'bifold_door no longer in list');

  section('removeCommissionMultiplier — _default protected');
  reset();
  let toastMsg = '';
  sandbox.addToast = (msg, level) => { if (level === 'error') toastMsg = msg; };
  rules = getCommissionRules();
  let defaultIdx = rules.productMultipliers.findIndex(m => m.productKey === '_default');
  let preLen = rules.productMultipliers.length;
  removeCommissionMultiplier(defaultIdx);
  rules = getCommissionRules();
  assertEq(rules.productMultipliers.length, preLen, '_default not removed');
  assert(/cannot remove the '_default'/i.test(toastMsg), 'Error toast on _default removal attempt');
  sandbox.addToast = () => {}; // restore

  section('Volume bonus add + edit + remove');
  reset();
  rules = getCommissionRules();
  let beforeBonusLen = rules.volumeBonuses.length;
  addCommissionBonus();
  rules = getCommissionRules();
  assertEq(rules.volumeBonuses.length, beforeBonusLen + 1, 'New bonus row appended');
  let newBonusIdx = rules.volumeBonuses.length - 1;
  setCommissionBonus(newBonusIdx, 'threshold', 200000);
  setCommissionBonus(newBonusIdx, 'bonusPct', 2);
  rules = getCommissionRules();
  assertEq(rules.volumeBonuses[newBonusIdx].threshold, 200000, 'Bonus threshold set');
  assertEq(rules.volumeBonuses[newBonusIdx].bonusPct, 2, 'Bonus pct set');
  removeCommissionBonus(newBonusIdx);
  rules = getCommissionRules();
  assertEq(rules.volumeBonuses.length, beforeBonusLen, 'Bonus row removed');

  section('All save audits land with action=commission.rules_updated');
  reset();
  setCommissionDefault('baseRate', 6);
  setCommissionPerRep('Alice', 'baseRate', 8);
  setCommissionPerBranch('VIC', 7);
  addCommissionMultiplier();
  let updatedAudits = sandbox._auditEntries.filter(e => e.action === 'commission.rules_updated');
  assert(updatedAudits.length >= 4, 'Each save writes an audit entry (' + updatedAudits.length + ' so far)');
  // Each carries a distinguishing metadata.kind
  let kinds = updatedAudits.map(e => e.metadata && e.metadata.kind);
  assert(kinds.indexOf('default') >= 0, 'default kind present');
  assert(kinds.indexOf('per_rep_override') >= 0, 'per_rep_override kind present');
  assert(kinds.indexOf('per_branch_base_rate') >= 0, 'per_branch_base_rate kind present');
  assert(kinds.indexOf('product_multiplier_added') >= 0, 'product_multiplier_added kind present');

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
