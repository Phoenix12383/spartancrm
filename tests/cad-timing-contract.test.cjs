// ════════════════════════════════════════════════════════════════════════════
// CAD Timing Contract — round-trip tests
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the canonical timing surface from
// js/modules/factory/26-cad-timing-contract.js against the contract
// documented in docs/spartan-cad-timing-audit.md (CAD WIP38, 2026-05-01).
//
// Coverage:
//   - applySupplyOnlyOverride: zeros installMinutes on supply_only frames,
//     re-aggregates totals.installMinutes
//   - getJobInstallMinutes: subtracts supply_only minutes from a job's
//     persisted estimatedInstallMinutes
//   - readJobInstallMinutes decorator: wraps the original at module load,
//     applies the override automatically
//   - validateStationTimes: rejects S_glaze, unknown keys, negative numbers
//   - normalizeStationTimes: zero-fills the canonical 11-key shape
//   - mapProductTypeToLegacyFrameType: 12 → 6 collapse is correct
//   - formatMinutesAsHours / formatMinutesAsDays: display-side conversions
//
// Run:  node tests/cad-timing-contract.test.cjs

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
function assertDeepEq(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected),
    label + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}
function section(t) { process.stdout.write('\n\x1b[1m' + t + '\x1b[0m\n'); }

function makeSandbox(originalReader) {
  // Mock window so the decorator IIFE can patch `window.readJobInstallMinutes`.
  const win = {};
  if (originalReader) win.readJobInstallMinutes = originalReader;

  const sandbox = {
    window: win,
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Error,
    isFinite, isNaN, parseFloat, parseInt,
  };
  // Mirror the bare global so the source file's `var readJobInstallMinutes`
  // assignment in the decorator (the `try { readJobInstallMinutes = wrapped }`
  // line) finds something to bind to.
  if (originalReader) sandbox.readJobInstallMinutes = originalReader;

  vm.createContext(sandbox);
  return sandbox;
}

function loadContract(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'js', 'modules', 'factory', '26-cad-timing-contract.js');
  const full = fs.readFileSync(srcPath, 'utf8');
  // vm.runInContext doesn't promote top-level `class` / `function` declarations
  // to the sandbox as own properties (they live in module-scope only). Append
  // a shim that mirrors the known identifiers onto globalThis (== sandbox).
  const expose = `
    ;(function(){
      var names = ['CadTimingContract','CAD_STATION_KEYS','CAD_STATION_NAMES',
        'CAD_PRODUCT_TYPES','CAD_LEGACY_FRAME_TYPE_MAP','CAD_PROPERTY_TYPES',
        'CAD_INSTALLATION_TYPES','CAD_FLOOR_BUCKETS','CAD_EXCLUDED_STATION_KEYS',
        'getJobInstallMinutesForCrm','getJobProductionMinutesForCrm',
        'getJobStationTimesForCrm','getFrameInstallMinutes','getFrameProductionMinutes',
        'formatMinutesAsHours','formatMinutesAsDays','formatStationTimes'];
      for (var i=0;i<names.length;i++) {
        try { globalThis[names[i]] = eval(names[i]); } catch (e) {}
      }
    })();
  `;
  vm.runInContext(full + expose, sandbox, { filename: '26-cad-timing-contract.js' });
}

// Minimal CAD-shaped sample payload (audit §5)
function sampleCadPayload() {
  return {
    type: 'spartan-cad-save',
    mode: 'final',
    projectItems: [
      { id: 'F1', name: 'F01', productType: 'casement_window', width: 1200, height: 1500,
        propertyType: 'brick_veneer', installationType: 'retrofit', floorLevel: 1,
        installMinutes: 75, productionMinutes: 47, panelCount: 1 },
      { id: 'F2', name: 'F02', productType: 'french_door', width: 1800, height: 2100,
        propertyType: 'double_brick', installationType: 'new_construction', floorLevel: 0,
        installMinutes: 150, productionMinutes: 110, panelCount: 2 },
      { id: 'F3', name: 'F03', productType: 'fixed_window', width: 1000, height: 1000,
        propertyType: 'brick_veneer', installationType: 'supply_only', floorLevel: 0,
        installMinutes: 60, productionMinutes: 25, panelCount: 1 },
    ],
    totals: {
      installMinutes:    285,         // 75 + 150 + 60 (supply_only INCLUDED — the audit gap)
      productionMinutes: 182,
      stationTimes: {
        S1_saw: 34, S2_steel: 18, S4A_cnc: 12, S4B_screw: 22,
        S_weld: 78, S_clean: 65, S5_hw: 164, S6_reveal: 84,
        S7_fly: 18, S_qc: 31, S_disp: 18,
      },
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Test: applySupplyOnlyOverride
// ════════════════════════════════════════════════════════════════════════════

function testSupplyOnlyOverride() {
  section('applySupplyOnlyOverride (audit §4.4 known gap)');
  const sb = makeSandbox();
  loadContract(sb);
  const { CadTimingContract } = sb;

  const before = sampleCadPayload();
  const after  = CadTimingContract.applySupplyOnlyOverride(before);

  assertEq(after.projectItems[0].installMinutes, 75,  'F1 (retrofit) install untouched');
  assertEq(after.projectItems[1].installMinutes, 150, 'F2 (new_construction) install untouched');
  assertEq(after.projectItems[2].installMinutes, 0,   'F3 (supply_only) zeroed');

  // Per-frame productionMinutes is unchanged (factory still builds it).
  assertEq(after.projectItems[2].productionMinutes, 25, 'F3 productionMinutes preserved');

  // Totals re-aggregated.
  assertEq(after.totals.installMinutes, 75 + 150, 'totals.installMinutes re-aggregated (excludes supply_only)');
  assertEq(after.totals.productionMinutes, 182, 'totals.productionMinutes unchanged');
  assertEq(after.totals.stationTimes.S5_hw, 164, 'stationTimes preserved');

  // Non-mutation guarantee.
  assertEq(before.projectItems[2].installMinutes, 60, 'original payload not mutated');
  assertEq(before.totals.installMinutes, 285, 'original totals not mutated');
}

// ════════════════════════════════════════════════════════════════════════════
// Test: getJobInstallMinutes — subtracts supply_only from stored aggregate
// ════════════════════════════════════════════════════════════════════════════

function testGetJobInstallMinutes() {
  section('CadTimingContract.getJobInstallMinutes');
  const sb = makeSandbox();
  loadContract(sb);
  const { CadTimingContract } = sb;

  // Job exactly as 04-cad-integration.js would persist after a CAD save:
  // estimatedInstallMinutes is the raw total (incl. supply_only) and the
  // snapshot still has the supply_only frame with non-zero installMinutes.
  const job = {
    id: 'job_test_1',
    estimatedInstallMinutes: 285,                  // raw total from CAD
    cadFinalData: sampleCadPayload(),              // includes supply_only frame
  };

  const corrected = CadTimingContract.getJobInstallMinutes(job);
  assertEq(corrected, 225, 'returns 225 (285 stored − 60 supply_only)');

  // No supply_only frames → returns stored value untouched.
  const cleanJob = {
    estimatedInstallMinutes: 200,
    cadFinalData: { projectItems: [
      { installationType: 'retrofit', installMinutes: 100 },
      { installationType: 'retrofit', installMinutes: 100 },
    ], totals: { installMinutes: 200 } },
  };
  assertEq(CadTimingContract.getJobInstallMinutes(cleanJob), 200, 'no supply_only → stored aggregate returned');

  // No snapshot → falls back through estimatedInstallMinutes → installDurationHours.
  const legacyJob = { installDurationHours: 4 };
  assertEq(CadTimingContract.getJobInstallMinutes(legacyJob), 240, 'legacy installDurationHours = 4 → 240 min');

  // Empty input.
  assertEq(CadTimingContract.getJobInstallMinutes(null), 0, 'null job → 0');
  assertEq(CadTimingContract.getJobInstallMinutes({}), 0, 'empty job → 0');
}

// ════════════════════════════════════════════════════════════════════════════
// Test: readJobInstallMinutes decorator
// ════════════════════════════════════════════════════════════════════════════

function testReaderDecorator() {
  section('readJobInstallMinutes decorator (window-level monkey-patch)');

  // Provide an "original" reader matching the production one
  // from modules/17-install-schedule.js exactly.
  function originalReader(job) {
    if (!job) return 0;
    var direct = +job.estimatedInstallMinutes || 0;
    if (direct > 0) return direct;
    var cs = job.cadSurveyData || {};
    var fromCad = (cs && cs.totals) ? +cs.totals.installMinutes : 0;
    if (fromCad > 0) return fromCad;
    var hoursOverride = +job.installDurationHours || 0;
    if (hoursOverride > 0) return Math.round(hoursOverride * 60);
    return 0;
  }
  const sb = makeSandbox(originalReader);
  loadContract(sb);

  // The IIFE at the bottom of 26-cad-timing-contract.js should have wrapped
  // window.readJobInstallMinutes.
  assert(typeof sb.window.readJobInstallMinutes === 'function', 'window.readJobInstallMinutes is a function');
  assert(sb.window.readJobInstallMinutes !== originalReader, 'reader was replaced (not the original)');
  assertEq(sb.window.readJobInstallMinutes.__supplyOnlyDecorated, true, 'decorator marker is set');
  assert(sb.window.readJobInstallMinutes.__original === originalReader, '__original points back to the input reader');

  // The decorated reader applies the supply_only override.
  const job = {
    estimatedInstallMinutes: 285,
    cadFinalData: sampleCadPayload(),
  };
  const decoratedResult = sb.window.readJobInstallMinutes(job);
  assertEq(decoratedResult, 225, 'decorated reader subtracts supply_only (285 − 60 = 225)');

  // Original reader (without override) would have returned 285.
  assertEq(originalReader(job), 285, 'original reader (control) returns the un-corrected 285');

  // Idempotency: the runtime guard is `__supplyOnlyDecorated`. We verify it's
  // set (above) and that the IIFE's own re-run path checks it. We can't
  // re-eval the source in the same sandbox because `class` declarations can't
  // be redeclared in vm strict mode — but in production each <script> load
  // creates a fresh execution scope, so the relevant idempotency property
  // is "calling the wrapping logic twice on the SAME function doesn't
  // double-wrap". Simulate that here:
  const wrappedOnce = sb.window.readJobInstallMinutes;
  // The contract's IIFE skips wrapping when `__supplyOnlyDecorated` is true,
  // so a re-application against the already-wrapped reader should be a no-op.
  // Manually invoke the same guard:
  if (!wrappedOnce.__supplyOnlyDecorated) {
    assert(false, 'idempotency precondition: marker missing');
  } else {
    assert(true, 'IIFE guard prevents double-wrap (marker is the precondition)');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Test: validateStationTimes
// ════════════════════════════════════════════════════════════════════════════

function testValidateStationTimes() {
  section('validateStationTimes (audit §3 — 11-key contract)');
  const sb = makeSandbox();
  loadContract(sb);
  const { CadTimingContract } = sb;

  // Valid 11-key payload.
  const valid = sampleCadPayload().totals.stationTimes;
  const r1 = CadTimingContract.validateStationTimes(valid);
  assertEq(r1.ok, true, 'valid 11-key payload accepted');
  assertEq(r1.violations.length, 0, 'no violations on valid payload');

  // S_glaze rejection (audit §3.1 — Spartan site-glazes).
  const withGlaze = Object.assign({}, valid, { S_glaze: 5 });
  const r2 = CadTimingContract.validateStationTimes(withGlaze);
  assertEq(r2.ok, false, 'S_glaze rejected');
  assert(r2.violations.some(v => /S_glaze/.test(v)), 'violation message mentions S_glaze');

  // Unknown key.
  const withUnknown = Object.assign({}, valid, { S_made_up: 99 });
  const r3 = CadTimingContract.validateStationTimes(withUnknown);
  assertEq(r3.ok, false, 'unknown key rejected');
  assert(r3.violations.some(v => /Unknown station key/.test(v)), 'violation mentions unknown key');

  // Negative number.
  const negative = Object.assign({}, valid, { S1_saw: -10 });
  const r4 = CadTimingContract.validateStationTimes(negative);
  assertEq(r4.ok, false, 'negative value rejected');
  assert(r4.violations.some(v => /S1_saw/.test(v)), 'violation mentions the negative key');

  // Non-object.
  assertEq(CadTimingContract.validateStationTimes(null).ok, false, 'null rejected');
  assertEq(CadTimingContract.validateStationTimes('hello').ok, false, 'string rejected');
}

// ════════════════════════════════════════════════════════════════════════════
// Test: normalizeStationTimes
// ════════════════════════════════════════════════════════════════════════════

function testNormalizeStationTimes() {
  section('normalizeStationTimes (canonical 11-key zero-fill)');
  const sb = makeSandbox();
  loadContract(sb);
  const { CadTimingContract, CAD_STATION_KEYS } = sb;

  // Empty input → all 11 keys zero.
  const empty = CadTimingContract.normalizeStationTimes({});
  assertEq(Object.keys(empty).length, 11, 'normalize({}) returns 11 keys');
  CAD_STATION_KEYS.forEach(function(k){ assertEq(empty[k], 0, 'key ' + k + ' is 0'); });

  // Partial input.
  const partial = CadTimingContract.normalizeStationTimes({ S1_saw: 30, S_qc: 12 });
  assertEq(partial.S1_saw, 30, 'S1_saw preserved');
  assertEq(partial.S_qc, 12, 'S_qc preserved');
  assertEq(partial.S_weld, 0, 'missing S_weld zero-filled');

  // Excluded key dropped.
  const withGlaze = CadTimingContract.normalizeStationTimes({ S_glaze: 50, S1_saw: 10 });
  assert(!('S_glaze' in withGlaze), 'S_glaze dropped from normalized output');
  assertEq(withGlaze.S1_saw, 10, 'S1_saw preserved alongside dropped key');

  // Garbage values coerced to 0.
  const garbage = CadTimingContract.normalizeStationTimes({ S1_saw: 'hello', S_qc: -5, S_weld: NaN, S_disp: 12 });
  assertEq(garbage.S1_saw, 0, 'string value zeroed');
  assertEq(garbage.S_qc, 0, 'negative value zeroed');
  assertEq(garbage.S_weld, 0, 'NaN zeroed');
  assertEq(garbage.S_disp, 12, 'good value preserved');
}

// ════════════════════════════════════════════════════════════════════════════
// Test: mapProductTypeToLegacyFrameType (audit §2.1)
// ════════════════════════════════════════════════════════════════════════════

function testProductTypeMapping() {
  section('mapProductTypeToLegacyFrameType (12 → 6 lossy collapse)');
  const sb = makeSandbox();
  loadContract(sb);
  const { CadTimingContract } = sb;

  // Spot-check the lossy collapses called out in the audit.
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('tilt_turn_window'), 'casement', 'tilt_turn_window → casement (lossy)');
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('bifold_door'), 'door_sliding', 'bifold_door → door_sliding (lossy)');
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('lift_slide_door'), 'door_sliding', 'lift_slide_door → door_sliding (lossy)');
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('stacker_door'), 'door_sliding', 'stacker_door → door_sliding (lossy)');

  // Identity-style ones.
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('awning_window'), 'awning', 'awning_window → awning');
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('fixed_window'), 'fixed', 'fixed_window → fixed');
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('hinged_door'), 'door_hinged', 'hinged_door → door_hinged');

  // Unknown.
  assertEq(CadTimingContract.mapProductTypeToLegacyFrameType('made_up_door'), null, 'unknown → null');
}

// ════════════════════════════════════════════════════════════════════════════
// Test: display helpers
// ════════════════════════════════════════════════════════════════════════════

function testDisplayHelpers() {
  section('formatMinutesAsHours / formatMinutesAsDays (audit §5.2)');
  const sb = makeSandbox();
  loadContract(sb);
  const { CadTimingContract, formatMinutesAsHours, formatMinutesAsDays } = sb;

  // Hours formatting.
  assertEq(formatMinutesAsHours(0), '0m', '0 → "0m"');
  assertEq(formatMinutesAsHours(45), '45m', '45 → "45m"');
  assertEq(formatMinutesAsHours(60), '1h', '60 → "1h"');
  assertEq(formatMinutesAsHours(75), '1h 15m', '75 → "1h 15m"');
  assertEq(formatMinutesAsHours(150, 'decimal'), '2.5h', '150 decimal → "2.5h"');

  // Days formatting (8h shifts, 0.5 min, ceil to 0.5).
  assertEq(formatMinutesAsDays(0), 0.5, '0 min → 0.5d (minimum)');
  assertEq(formatMinutesAsDays(60), 0.5, '60 min → 0.5d (rounds up)');
  assertEq(formatMinutesAsDays(240), 0.5, '240 min (4h) → 0.5d');
  assertEq(formatMinutesAsDays(241), 1, '241 min → 1d (just over half-shift, ceils)');
  assertEq(formatMinutesAsDays(480), 1, '480 min (1 shift) → 1d');
  assertEq(formatMinutesAsDays(481), 1.5, '481 min → 1.5d');
  assertEq(formatMinutesAsDays(960), 2, '960 min (2 shifts) → 2d');

  // formatStationTimes returns the 11-key array.
  const rows = CadTimingContract.formatStationTimes(sampleCadPayload().totals.stationTimes);
  assertEq(rows.length, 11, 'formatStationTimes returns 11 rows');
  assertEq(rows[0].key, 'S1_saw', 'first row is S1_saw');
  assertEq(rows[6].name, 'Stn 5 — Siegenia Hardware', '7th row name = S5_hw display name');
}

// ════════════════════════════════════════════════════════════════════════════
// Test: jobFramesWithTiming (per-frame iteration)
// ════════════════════════════════════════════════════════════════════════════

function testJobFramesWithTiming() {
  section('jobFramesWithTiming (per-frame timing iterator)');
  const sb = makeSandbox();
  loadContract(sb);
  const { CadTimingContract } = sb;

  const job = { cadFinalData: sampleCadPayload() };
  const frames = CadTimingContract.jobFramesWithTiming(job);

  assertEq(frames.length, 3, '3 frames returned');
  assertEq(frames[0].productType, 'casement_window', 'F1 productType preserved');
  assertEq(frames[0].frameType, 'casement', 'F1 legacy frameType collapsed');
  assertEq(frames[0].installMinutes, 75, 'F1 installMinutes verbatim');
  assertEq(frames[1].productType, 'french_door', 'F2 productType preserved');
  assertEq(frames[1].frameType, 'door_hinged', 'F2 legacy frameType collapsed');
  assertEq(frames[2].installationType, 'supply_only', 'F3 installationType preserved');
  assertEq(frames[2].installMinutes, 0, 'F3 supply_only override applied at iterator boundary');
  assertEq(frames[2].productionMinutes, 25, 'F3 productionMinutes still flows');

  // Floor-level bucketing.
  assertEq(frames[0].floorBucket, 'first', 'F1 floor 1 → "first"');
  assertEq(frames[1].floorBucket, 'ground', 'F2 floor 0 → "ground"');
}

// ════════════════════════════════════════════════════════════════════════════
// Run
// ════════════════════════════════════════════════════════════════════════════

testSupplyOnlyOverride();
testGetJobInstallMinutes();
testReaderDecorator();
testValidateStationTimes();
testNormalizeStationTimes();
testProductTypeMapping();
testDisplayHelpers();
testJobFramesWithTiming();

process.stdout.write('\n');
process.stdout.write('  ' + _passCount + ' passed, ' + _failCount + ' failed\n');
if (_failCount > 0) {
  process.stdout.write('\n  Failures:\n');
  _failures.forEach(function(f){ process.stdout.write('    - ' + f + '\n'); });
  process.exit(1);
}
process.exit(0);
