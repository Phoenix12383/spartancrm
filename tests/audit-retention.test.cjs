// ════════════════════════════════════════════════════════════════════════════
// Brief 2 Phase 4 — audit log retention test
// ════════════════════════════════════════════════════════════════════════════
//
// Exercises the retention behaviour of `appendAuditEntry()` defined in
// modules/05-state-auth-rbac.js. Loads the actual production source via
// Node's vm module so the test stays in sync with what ships — no copied
// fixture code that can drift.
//
// Run:  node tests/audit-retention.test.cjs
//   or:  npm run test:audit-retention
//
// Runtime: ~60-70 seconds. The bottleneck is the production primitive
// itself — each appendAuditEntry call re-serialises the full log to
// localStorage, so the flood loop is O(n²). This is acceptable in
// production where appends arrive sparsely; it only bites in this soak
// test where we drive 7000 appends back-to-back. Don't run on every
// commit — keep this for pre-release verification.
//
// What it covers:
//   1. Cap holds — the log never exceeds AUDIT_LOG_CAP between appends
//   2. FIFO eviction — when the cap is hit, oldest entries are dropped first
//   3. Prune marker — a `system.audit_pruned` entry lands every batch with
//      correct droppedCount + fromTimestamp + toTimestamp
//   4. Surviving newest entries are intact (id + action preserved)
//   5. getAuditLog() filters still work after pruning
//   6. Multiple prune cycles — the steady-state oscillates between
//      [CAP - BATCH + 2 .. CAP] without runaway growth
//
// Exits 0 on pass, 1 on any assertion failure.

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Test harness ────────────────────────────────────────────────────────────

let _passCount = 0;
let _failCount = 0;
const _failures = [];

function assert(cond, label) {
  if (cond) {
    _passCount++;
    process.stdout.write('  \x1b[32m✓\x1b[0m ' + label + '\n');
  } else {
    _failCount++;
    _failures.push(label);
    process.stdout.write('  \x1b[31m✗\x1b[0m ' + label + '\n');
  }
}

function assertEq(actual, expected, label) {
  const ok = actual === expected;
  assert(ok, label + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
}

function section(title) {
  process.stdout.write('\n\x1b[1m' + title + '\x1b[0m\n');
}

// ── Sandbox setup ────────────────────────────────────────────────────────────

// In-memory localStorage shim. The real DOM Storage interface is identical
// for our purposes — getItem returns null for missing keys, setItem coerces
// to string.
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

// Build a sandbox that satisfies the audit primitive's globals. The primitive
// references getCurrentUser(), dbInsert(), and _sb — we stub the first two
// and leave _sb falsy so the Supabase mirror branch is skipped.
function makeSandbox() {
  const sandbox = {
    localStorage: makeLocalStorage(),
    getCurrentUser: () => ({ id: 'test_user', name: 'Test User', branch: 'TestBranch' }),
    dbInsert: () => {},
    _sb: null,
    console: console,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Array: Array,
    Object: Object,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Error: Error,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
  };
  vm.createContext(sandbox);
  return sandbox;
}

// Slice the audit primitive section out of the production file so we don't
// need to evaluate the entire 990-line module (which references DOM globals
// we'd have to stub more aggressively). The section is delimited by the
// "UNIFIED AUDIT LOG" header at the top and ends just before the audit page
// UI section ("Audit page UI (Brief 2 Phase 3)").
function loadAuditPrimitive(sandbox) {
  const srcPath = path.resolve(__dirname, '..', 'modules', '05-state-auth-rbac.js');
  const full = fs.readFileSync(srcPath, 'utf8');

  const startMarker = '// UNIFIED AUDIT LOG';
  const endMarker = '// ── Audit page UI';

  const startIdx = full.indexOf(startMarker);
  const endIdx = full.indexOf(endMarker);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    throw new Error('Could not find audit primitive section markers in 05-state-auth-rbac.js');
  }
  const slice = full.slice(startIdx, endIdx);
  vm.runInContext(slice, sandbox, { filename: '05-state-auth-rbac.js (audit slice)' });
}

// ── Tests ────────────────────────────────────────────────────────────────────

function run() {
  const sandbox = makeSandbox();
  loadAuditPrimitive(sandbox);

  const { appendAuditEntry, getAuditLog, AUDIT_LOG_CAP, AUDIT_PRUNE_BATCH, AUDIT_LOG_KEY } = sandbox;

  section('Constants are sane');
  assertEq(AUDIT_LOG_CAP, 5000, 'AUDIT_LOG_CAP is 5000');
  assertEq(AUDIT_PRUNE_BATCH, 1000, 'AUDIT_PRUNE_BATCH is 1000');
  assert(AUDIT_PRUNE_BATCH < AUDIT_LOG_CAP, 'PRUNE_BATCH < LOG_CAP');
  assertEq(typeof appendAuditEntry, 'function', 'appendAuditEntry is exported');
  assertEq(typeof getAuditLog, 'function', 'getAuditLog is exported');

  // Reset storage before each test group
  function reset() { sandbox.localStorage.clear(); }

  section('Below-cap appends never trigger prune');
  reset();
  for (let i = 0; i < AUDIT_LOG_CAP - 1; i++) {
    appendAuditEntry({ entityType: 'deal', entityId: 'd' + i, action: 'deal.field_edited' });
  }
  let log = JSON.parse(sandbox.localStorage.getItem(AUDIT_LOG_KEY));
  assertEq(log.length, AUDIT_LOG_CAP - 1, 'Log holds CAP - 1 entries with no prune');
  assertEq(log.filter(e => e.action === 'system.audit_pruned').length, 0, 'No prune marker yet');

  section('Hitting CAP exactly does not yet prune');
  appendAuditEntry({ entityType: 'deal', entityId: 'd_cap', action: 'deal.field_edited' });
  log = JSON.parse(sandbox.localStorage.getItem(AUDIT_LOG_KEY));
  assertEq(log.length, AUDIT_LOG_CAP, 'Log is exactly at cap (5000)');
  assertEq(log.filter(e => e.action === 'system.audit_pruned').length, 0, 'Still no prune marker at exact cap');

  section('Next append after CAP triggers a single prune');
  appendAuditEntry({ entityType: 'deal', entityId: 'd_overflow', action: 'deal.field_edited' });
  log = JSON.parse(sandbox.localStorage.getItem(AUDIT_LOG_KEY));
  // After overflow: removed 1000 oldest, pushed marker, pushed new entry.
  // Length goes from 5000 → splice(0,1000) → 4000 → push marker → 4001 → push new → 4002.
  assertEq(log.length, AUDIT_LOG_CAP - AUDIT_PRUNE_BATCH + 2, 'Length is CAP - BATCH + 2 after one prune');
  const markers = log.filter(e => e.action === 'system.audit_pruned');
  assertEq(markers.length, 1, 'Exactly one prune marker present');
  const marker = markers[0];
  assertEq(marker.userId, 'system', 'Marker is system-attributed');
  assertEq(marker.entityType, 'system', 'Marker entityType is "system"');
  assert(marker.after && marker.after.droppedCount === AUDIT_PRUNE_BATCH,
    'Marker.after.droppedCount equals AUDIT_PRUNE_BATCH');
  assert(marker.after && typeof marker.after.fromTimestamp === 'string' && marker.after.fromTimestamp.length > 0,
    'Marker.after.fromTimestamp is set');
  assert(marker.after && typeof marker.after.toTimestamp === 'string' && marker.after.toTimestamp.length > 0,
    'Marker.after.toTimestamp is set');

  section('FIFO — oldest 1000 (d0..d999) are gone, d1000+ remain');
  const survivingDealIds = log.filter(e => e.entityType === 'deal').map(e => e.entityId);
  // The first 1000 deal entries (d0..d999) should have been pruned.
  const earliestSurviving = survivingDealIds.find(id => /^d\d+$/.test(id));
  // The first non-pruned numeric id should be d1000.
  const firstNumeric = survivingDealIds
    .map(id => parseInt(id.replace(/^d/, ''), 10))
    .filter(n => !Number.isNaN(n))
    .sort((a, b) => a - b)[0];
  assertEq(firstNumeric, AUDIT_PRUNE_BATCH, 'Smallest surviving numeric id is d' + AUDIT_PRUNE_BATCH);
  assert(!survivingDealIds.includes('d0'), 'd0 (oldest) was pruned');
  assert(!survivingDealIds.includes('d999'), 'd999 (last in batch) was pruned');
  assert(survivingDealIds.includes('d1000'), 'd1000 (first after batch) survived');
  assert(survivingDealIds.includes('d_cap'), 'd_cap (the entry that hit CAP) survived');
  assert(survivingDealIds.includes('d_overflow'), 'd_overflow (the trigger) survived and is the newest');

  section('getAuditLog still filters correctly after prune');
  const onlyPrunes = getAuditLog({ action: 'system.audit_pruned' });
  assertEq(onlyPrunes.length, 1, 'Filter by action=system.audit_pruned returns exactly 1');
  const onlyDeals = getAuditLog({ entityType: 'deal' });
  assertEq(onlyDeals.length, AUDIT_LOG_CAP - AUDIT_PRUNE_BATCH + 1,
    'Filter by entityType=deal returns CAP - BATCH + 1 (excludes the marker)');
  // getAuditLog sorts newest-first. The prune marker and d_overflow share the
  // exact same nowIso timestamp (both written in the same appendAuditEntry
  // call), so a stable sort preserves their insertion order — marker first,
  // then d_overflow. Both are valid "newest" entries; what matters is that
  // the newest *deal* entry is d_overflow.
  const newestDeals = getAuditLog({ entityType: 'deal' }).slice(0, 3).map(e => e.entityId);
  assertEq(newestDeals[0], 'd_overflow', 'Newest deal entry is d_overflow (the trigger)');
  assertEq(newestDeals[1], 'd_cap',      'Second-newest deal entry is d_cap');
  const newestOverall = getAuditLog()[0];
  assert(newestOverall.action === 'system.audit_pruned' || newestOverall.entityId === 'd_overflow',
    'Newest overall is either the prune marker or d_overflow (timestamp tie)');

  section('Steady state: many overflow cycles stay bounded');
  reset();
  // Flood enough entries to trigger several prunes. Cycle is BATCH-sized:
  // each prune drops BATCH, then the log refills BATCH-ish entries before
  // hitting CAP again. Flooding 2 × BATCH past CAP exercises 2-3 prunes —
  // enough to prove the cycle repeats without ballooning runtime (each
  // append rewrites the full localStorage JSON so the loop is O(n²)).
  // We sample length only every BATCH writes — sampling on every iteration
  // turns the test into O(n³), and the cap is enforced per-call inside the
  // primitive so a sparse sample is sufficient evidence.
  const totalToWrite = AUDIT_LOG_CAP + 2 * AUDIT_PRUNE_BATCH;
  let maxObservedLen = 0;
  const sampleEvery = AUDIT_PRUNE_BATCH;
  for (let i = 0; i < totalToWrite; i++) {
    appendAuditEntry({ entityType: 'deal', entityId: 'flood_' + i, action: 'deal.field_edited' });
    if (i % sampleEvery === 0 || i === totalToWrite - 1) {
      const cur = JSON.parse(sandbox.localStorage.getItem(AUDIT_LOG_KEY)).length;
      if (cur > maxObservedLen) maxObservedLen = cur;
    }
  }
  log = JSON.parse(sandbox.localStorage.getItem(AUDIT_LOG_KEY));
  assert(maxObservedLen <= AUDIT_LOG_CAP,
    'Log length never exceeds CAP during flood (max sampled: ' + maxObservedLen + ')');
  assert(log.length < AUDIT_LOG_CAP,
    'Final log length is < CAP (post-prune state, ' + log.length + ')');
  assert(log.length >= AUDIT_LOG_CAP - AUDIT_PRUNE_BATCH,
    'Final log length is >= CAP - BATCH (steady-state floor)');
  const markerCount = log.filter(e => e.action === 'system.audit_pruned').length;
  assert(markerCount >= 2 && markerCount <= 3,
    'Saw 2-3 prune markers across flood (saw ' + markerCount + ')');
  // Verify the very newest deal entry is the last one we wrote (entityId
  // tiebreak — getAuditLog() can return a marker first if timestamps tie).
  const lastWritten = 'flood_' + (totalToWrite - 1);
  assertEq(getAuditLog({ entityType: 'deal' })[0].entityId, lastWritten,
    'Newest deal entry after flood is ' + lastWritten);
  // And the very oldest deal entries should all have been pruned away.
  const survivors = log.filter(e => e.entityType === 'deal').map(e => e.entityId);
  assert(!survivors.includes('flood_0'), 'flood_0 (oldest of the flood) was pruned');
  assert(!survivors.includes('flood_' + (AUDIT_PRUNE_BATCH - 1)),
    'flood_' + (AUDIT_PRUNE_BATCH - 1) + ' (last of first batch) was pruned');

  section('Empty / malformed entries are rejected');
  reset();
  const r1 = appendAuditEntry(null);
  assertEq(r1, null, 'appendAuditEntry(null) returns null');
  const r2 = appendAuditEntry({});
  assertEq(r2, null, 'appendAuditEntry({}) returns null (no action key)');
  const r3 = appendAuditEntry({ entityType: 'deal' });
  assertEq(r3, null, 'appendAuditEntry without action returns null');
  log = JSON.parse(sandbox.localStorage.getItem(AUDIT_LOG_KEY) || '[]');
  assertEq(log.length, 0, 'No entries persisted from rejected appends');

  section('Returned entry shape is complete');
  reset();
  const persisted = appendAuditEntry({
    entityType: 'deal',
    entityId: 'd42',
    action: 'deal.field_edited',
    before: { name: 'Old' },
    after:  { name: 'New' },
    metadata: { source: 'unit-test' },
  });
  assert(persisted && typeof persisted.id === 'string' && persisted.id.startsWith('aud_'),
    'persisted.id starts with "aud_"');
  assert(typeof persisted.timestamp === 'string' && persisted.timestamp.length > 0,
    'persisted.timestamp is a non-empty string');
  assertEq(persisted.userId, 'test_user', 'persisted.userId from getCurrentUser stub');
  assertEq(persisted.userName, 'Test User', 'persisted.userName from getCurrentUser stub');
  assertEq(persisted.entityType, 'deal', 'persisted.entityType preserved');
  assertEq(persisted.entityId, 'd42', 'persisted.entityId preserved');
  assertEq(persisted.action, 'deal.field_edited', 'persisted.action preserved');
  assert(persisted.before && persisted.before.name === 'Old', 'persisted.before preserved');
  assert(persisted.after && persisted.after.name === 'New', 'persisted.after preserved');
  assert(persisted.metadata && persisted.metadata.source === 'unit-test',
    'persisted.metadata preserved');
  assertEq(persisted.branch, 'TestBranch', 'persisted.branch from getCurrentUser stub');
  assertEq(persisted.summary, 'Deal edited', 'persisted.summary derived from AUDIT_ACTIONS map');

  // ── Summary ───────────────────────────────────────────────────────────────
  process.stdout.write('\n');
  if (_failCount === 0) {
    process.stdout.write('\x1b[32m\x1b[1m' + _passCount + ' passed, 0 failed.\x1b[0m\n');
    process.exit(0);
  } else {
    process.stdout.write('\x1b[31m\x1b[1m' + _passCount + ' passed, ' + _failCount + ' FAILED.\x1b[0m\n');
    process.stdout.write('\nFailures:\n');
    _failures.forEach((f) => process.stdout.write('  - ' + f + '\n'));
    process.exit(1);
  }
}

run();
