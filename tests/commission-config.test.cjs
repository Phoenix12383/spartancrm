// ════════════════════════════════════════════════════════════════════════════
// Brief 4 Phase 1 — commission config + migration test
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the migration from `spartan_commission_rates` (flat per-rep map)
// to `spartan_commission_rules` (defaults + perRep + perBranch + product
// multipliers + volume bonuses) and the public helpers around it. Loads
// the actual production source via Node's vm module so the test stays
// in sync with what ships — same pattern as tests/audit-retention.test.cjs.
//
// Run:  node tests/commission-config.test.cjs
//   or: npm run test:commission-config
//
// What it covers:
//   1. Legacy rates → new rules migration (idempotent, audit-logged,
//      legacy key preserved as a read-only fallback)
//   2. getEffectiveRuleForRep merges defaults → perBranch → perRep
//   3. getRepRate returns the effective rate after merging
//   4. setRepRate persists into perRep and audits the change
//   5. saveCommissionRules round-trips the full shape
//   6. Empty / corrupt localStorage falls back to seed defaults
//   7. Multipliers + volumeBonuses default seeds are exposed via the
//      dedicated getter helpers Phase 2's calc engine will use

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
function section(t) { process.stdout.write('\n\x1b[1m' + t + '\x1b[0m\n'); }

// In-memory localStorage shim. Same pattern as audit-retention test.
function makeLocalStorage() {
  const store = Object.create(null);
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    _store: store,
  };
}

// Sandbox satisfies the audit primitive's globals + the commission module's
// renderPage / addToast / getCurrentUser dependencies.
function makeSandbox() {
  const auditEntries = [];
  const sandbox = {
    localStorage: makeLocalStorage(),
    getCurrentUser: () => ({ id: 'test_user', name: 'Test User', branch: 'TestBranch' }),
    appendAuditEntry: (e) => { auditEntries.push(e); return e; },
    addToast: () => {},
    renderPage: () => {},
    getState: () => ({}),
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Error,
    setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  sandbox._auditEntries = auditEntries;
  return sandbox;
}

// Slice the Phase 1 helpers out of the production file. Runs from the
// "CONFIG DATA MODEL (Brief 4 Phase 1)" header to just before
// `function calcCommission` (which depends on globals we don't stub).
function loadCommissionConfig(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '24-commission.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  const startMarker = '// CONFIG DATA MODEL (Brief 4 Phase 1)';
  const endMarker = 'function calcCommission';
  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find Phase 1 section markers in 24-commission.js');
  }
  const slice = full.slice(startIdx, endIdx);
  vm.runInContext(slice, sandbox, { filename: '24-commission.js (Phase 1 slice)' });
}

function run() {
  const sandbox = makeSandbox();
  loadCommissionConfig(sandbox);
  const { getCommissionRules, saveCommissionRules, getEffectiveRuleForRep,
          getRepRate, setRepRate, getCommissionRates, getProductMultipliers,
          getVolumeBonuses, COMMISSION_RULES_KEY, COMMISSION_RATES_LEGACY_KEY } = sandbox;

  function reset() { sandbox.localStorage.clear(); sandbox._auditEntries.length = 0; }

  section('Constants exported');
  assertEq(COMMISSION_RULES_KEY, 'spartan_commission_rules', 'COMMISSION_RULES_KEY constant');
  assertEq(COMMISSION_RATES_LEGACY_KEY, 'spartan_commission_rates', 'COMMISSION_RATES_LEGACY_KEY constant');
  assertEq(typeof getCommissionRules, 'function', 'getCommissionRules exported');
  assertEq(typeof saveCommissionRules, 'function', 'saveCommissionRules exported');
  assertEq(typeof getEffectiveRuleForRep, 'function', 'getEffectiveRuleForRep exported');
  assertEq(typeof getRepRate, 'function', 'getRepRate exported');
  assertEq(typeof setRepRate, 'function', 'setRepRate exported');
  assertEq(typeof getProductMultipliers, 'function', 'getProductMultipliers exported');
  assertEq(typeof getVolumeBonuses, 'function', 'getVolumeBonuses exported');

  section('Empty localStorage → seed defaults');
  reset();
  let rules = getCommissionRules();
  assert(rules && rules.defaults, 'Returns object with defaults');
  assertEq(rules.defaults.baseRate, 5, 'Default baseRate is 5');
  assertEq(rules.defaults.ageThresholdDays, 60, 'Default ageThresholdDays is 60');
  assertEq(rules.defaults.agePenaltyPct, 1, 'Default agePenaltyPct is 1');
  assertEq(rules.defaults.realisationGate, 'won', "Default realisationGate is 'won'");
  assert(Array.isArray(rules.productMultipliers) && rules.productMultipliers.length > 0,
    'productMultipliers seeded with at least one entry');
  assert(rules.productMultipliers.some(m => m.productKey === '_default'),
    "productMultipliers includes a '_default' entry");
  assert(Array.isArray(rules.volumeBonuses), 'volumeBonuses is an array');
  assertEq(typeof rules.perRep, 'object', 'perRep is an object');
  assertEq(typeof rules.perBranch, 'object', 'perBranch is an object');

  section('Returned rules are mutable (deep-cloned from frozen seed)');
  // Mutating the returned object MUST NOT throw — it would on the frozen seed
  // if we accidentally returned a shared reference.
  let didThrow = false;
  try {
    rules.perRep.someRep = { baseRate: 7 };
    rules.productMultipliers.push({ productKey: 'x', label: 'X', multiplier: 1.5 });
  } catch (e) { didThrow = true; }
  assert(!didThrow, 'Caller can mutate the returned rules object without throwing');

  section('Legacy migration — flat rates map → new rules shape');
  reset();
  // Pre-seed localStorage with the legacy flat map only (no rules key yet).
  sandbox.localStorage.setItem(COMMISSION_RATES_LEGACY_KEY, JSON.stringify({
    'Alice Smith': 5,
    'Bob Jones':   7.5,
    'Carol Lee':   6,
  }));
  rules = getCommissionRules();
  assert(rules.perRep['Alice Smith'] && rules.perRep['Alice Smith'].baseRate === 5, 'Alice migrated as 5%');
  assertEq(rules.perRep['Bob Jones'].baseRate, 7.5, 'Bob migrated as 7.5%');
  assertEq(rules.perRep['Carol Lee'].baseRate, 6, 'Carol migrated as 6%');
  assert(sandbox.localStorage.getItem(COMMISSION_RULES_KEY) !== null,
    'New rules key written after migration');
  assert(sandbox.localStorage.getItem(COMMISSION_RATES_LEGACY_KEY) !== null,
    'Legacy rates key preserved (read-only fallback per brief mitigation)');
  // Migration audit entry written
  const migAudits = sandbox._auditEntries.filter(e => e.action === 'system.commission_state_migrated');
  assertEq(migAudits.length, 1, 'Exactly one migration audit entry written');
  assert(migAudits[0].metadata && migAudits[0].metadata.migration === 'rates_to_rules_v1',
    'Migration audit entry tagged with metadata.migration');
  assertEq(migAudits[0].metadata.migratedCount, 3, 'Migration audit records 3 reps migrated');

  section('Migration is idempotent — second call does nothing');
  const beforeCount = sandbox._auditEntries.length;
  rules = getCommissionRules();
  rules = getCommissionRules();
  rules = getCommissionRules();
  assertEq(sandbox._auditEntries.length, beforeCount,
    'Subsequent getCommissionRules() calls do not write duplicate audit entries');

  section('getEffectiveRuleForRep merges defaults → perBranch → perRep');
  reset();
  // Configure: org default 5%, VIC branch 6%, Alice rep 8% in VIC, Bob has no override.
  sandbox.localStorage.setItem(COMMISSION_RULES_KEY, JSON.stringify({
    defaults: { baseRate: 5, ageThresholdDays: 60, agePenaltyPct: 1, realisationGate: 'won' },
    perBranch: { VIC: { baseRate: 6 } },
    perRep:    { 'Alice Smith': { baseRate: 8 } },
    productMultipliers: [{ productKey: '_default', label: 'Default', multiplier: 1.0 }],
    volumeBonuses: [],
  }));
  let mergedAlice = getEffectiveRuleForRep('Alice Smith', 'VIC');
  assertEq(mergedAlice.baseRate, 8, 'Alice in VIC: perRep wins (8%)');
  assertEq(mergedAlice.ageThresholdDays, 60, 'Alice inherits ageThresholdDays from defaults');
  let mergedBob = getEffectiveRuleForRep('Bob Jones', 'VIC');
  assertEq(mergedBob.baseRate, 6, 'Bob in VIC: perBranch wins over defaults (6%)');
  let mergedCarol = getEffectiveRuleForRep('Carol Lee', 'NSW');
  assertEq(mergedCarol.baseRate, 5, 'Carol in NSW: no per-branch, no per-rep — defaults (5%)');
  let mergedAliceNoBranch = getEffectiveRuleForRep('Alice Smith', undefined);
  assertEq(mergedAliceNoBranch.baseRate, 8, 'Alice with no branch: perRep applies (8%)');
  let mergedNobody = getEffectiveRuleForRep(null, null);
  assertEq(mergedNobody.baseRate, 5, 'Null rep + null branch: defaults');

  section('getRepRate is a thin shim over getEffectiveRuleForRep');
  // Same fixture as above
  assertEq(getRepRate('Alice Smith'), 8, 'getRepRate(Alice) = 8 (perRep)');
  assertEq(getRepRate('Carol Lee'), 5, 'getRepRate(Carol) = 5 (defaults)');
  assertEq(getRepRate('Unknown Person'), 5, 'getRepRate(unknown) = 5 (defaults)');

  section('setRepRate writes into perRep and audits');
  const auditCountBefore = sandbox._auditEntries.length;
  setRepRate('Bob Jones', 9);
  let storedRules = JSON.parse(sandbox.localStorage.getItem(COMMISSION_RULES_KEY));
  assertEq(storedRules.perRep['Bob Jones'].baseRate, 9, 'Bob persisted at 9%');
  // Audit entry written via saveCommissionRules. Filter to rules_updated +
  // metadata.kind=per_rep_base_rate so we don't count the migration entry.
  const setAudits = sandbox._auditEntries
    .filter(e => e.action === 'commission.rules_updated')
    .filter(e => e.metadata && e.metadata.kind === 'per_rep_base_rate');
  assert(setAudits.length >= 1, 'setRepRate writes a per_rep_base_rate audit entry');
  const lastSet = setAudits[setAudits.length - 1];
  assertEq(lastSet.before.repName, 'Bob Jones', 'Audit before.repName');
  assertEq(lastSet.before.ratePct, null, 'Audit before.ratePct is null (Bob had no override)');
  assertEq(lastSet.after.repName, 'Bob Jones', 'Audit after.repName');
  assertEq(lastSet.after.ratePct, 9, 'Audit after.ratePct = 9');

  section('setRepRate update reflects in getRepRate immediately');
  assertEq(getRepRate('Bob Jones'), 9, 'getRepRate(Bob) is 9 after setRepRate');
  setRepRate('Bob Jones', 10.5);
  assertEq(getRepRate('Bob Jones'), 10.5, 'getRepRate(Bob) is 10.5 after second setRepRate');

  section('saveCommissionRules round-trips the full shape');
  reset();
  const custom = {
    defaults: { baseRate: 4, ageThresholdDays: 90, agePenaltyPct: 0.5, realisationGate: 'final_signed' },
    perRep: { 'X': { baseRate: 12, realisationGate: 'final_payment' } },
    perBranch: { ACT: { baseRate: 4.5 } },
    productMultipliers: [
      { productKey: '_default', label: 'Default', multiplier: 1.0 },
      { productKey: 'sliding_door', label: 'Sliding Door', multiplier: 1.15 },
    ],
    volumeBonuses: [{ threshold: 50000, bonusPct: 0.5 }, { threshold: 150000, bonusPct: 1.5 }],
  };
  saveCommissionRules(custom, { silent: true });
  let read = getCommissionRules();
  assertEq(read.defaults.baseRate, 4, 'Custom defaults.baseRate persisted');
  assertEq(read.defaults.realisationGate, 'final_signed', 'Custom realisationGate persisted');
  assertEq(read.perRep['X'].baseRate, 12, 'Custom perRep persisted');
  assertEq(read.perRep['X'].realisationGate, 'final_payment', 'Per-rep realisationGate persisted');
  assertEq(read.perBranch['ACT'].baseRate, 4.5, 'Custom perBranch persisted');
  assertEq(read.productMultipliers.length, 2, 'productMultipliers count persisted');
  assertEq(read.volumeBonuses.length, 2, 'volumeBonuses count persisted');
  assertEq(read.volumeBonuses[1].bonusPct, 1.5, 'Second volume bonus pct persisted');

  section('Effective rule with custom config');
  // Defaults baseRate=4, ACT branch=4.5, X rep=12 (no branch override on X)
  assertEq(getEffectiveRuleForRep('X', 'ACT').baseRate, 12, 'X in ACT: perRep wins');
  assertEq(getEffectiveRuleForRep('Y', 'ACT').baseRate, 4.5, 'Y in ACT: perBranch wins (Y has no override)');
  assertEq(getEffectiveRuleForRep('Z', 'VIC').baseRate, 4, 'Z in VIC: defaults (no branch or rep override)');
  // Per-rep realisationGate cascades down even when other keys come from defaults.
  assertEq(getEffectiveRuleForRep('X', 'ACT').realisationGate, 'final_payment',
    'X in ACT: realisationGate from perRep wins');
  assertEq(getEffectiveRuleForRep('Y', 'ACT').realisationGate, 'final_signed',
    'Y in ACT: realisationGate from defaults (perBranch ACT has no gate override)');

  section('Corrupt localStorage falls back to seed defaults');
  reset();
  sandbox.localStorage.setItem(COMMISSION_RULES_KEY, '{ this is not json');
  let corruptRecovery = getCommissionRules();
  assert(corruptRecovery && corruptRecovery.defaults && corruptRecovery.defaults.baseRate === 5,
    'Corrupt rules JSON falls back to seed defaults');

  section('getProductMultipliers / getVolumeBonuses are bare-list getters');
  reset();
  let pm = getProductMultipliers();
  assert(Array.isArray(pm), 'getProductMultipliers returns an array');
  assert(pm.length > 0, 'getProductMultipliers seeded list is non-empty');
  assert(pm.some(m => m.productKey === '_default'), "getProductMultipliers includes '_default'");
  let vb = getVolumeBonuses();
  assert(Array.isArray(vb), 'getVolumeBonuses returns an array');

  section('Backward-compat: getCommissionRates still reads the legacy key');
  reset();
  sandbox.localStorage.setItem(COMMISSION_RATES_LEGACY_KEY, JSON.stringify({ 'Old': 7 }));
  // Don't trigger getCommissionRules (which would migrate); test the legacy
  // helper directly. After Phase 1, this remains as a read-only escape hatch.
  let legacyRead = getCommissionRates();
  assertEq(legacyRead['Old'], 7, 'getCommissionRates() still reads the legacy flat map');

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
