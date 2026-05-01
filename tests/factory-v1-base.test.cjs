// ════════════════════════════════════════════════════════════════════════════
// Factory CRM Base v1.5 — round-trip tests
// ════════════════════════════════════════════════════════════════════════════
//
// Verifies the v1.5 base entities from js/modules/factory/27..32 against the
// scope-corrected diagram (factory-crm-base-class-diagram-v1-5-scope-corrected.md).
//
// Coverage:
//   - §1 FactoryJob lifecycle: append-only revisions, status transitions
//   - §1 FactoryFrame.fromCadFrame: CAD payload → v1 entity, supply_only flag
//   - §3 FactoryStockMovement.applyTo: projection updates per movement type
//   - §4 FactoryTaskQueue + FactoryStuckJobMonitor: stuck-job detection
//   - §5 FactoryMaterialOrder + FactoryGoodsReceipt: discrepancy auto-promotion
//   - §6 FactoryAuditChain.verifyChain: hash linkage, tamper detection
//   - §6 FactoryDataChangedThenChangedBackWatcher: walkthrough §8.3 pattern
//   - §6 FactoryRepeatedOverrideWatcher: 5+ overrides in 7 days
//
// Run:  node tests/factory-v1-base.test.cjs

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

// ── Sandbox + loader ────────────────────────────────────────────────────────

const FACTORY_NAMES = [
  // §1
  'FactoryJob','FactoryJobType','FactoryJobStatus','FactoryRevisionType',
  'FactoryFrameStatus','FactoryFrame','FactoryFrameSpecification','FactoryDimensions',
  'FactoryGlassSpec','FactoryHardwareSpec','FactoryJobRevision',
  // §2
  'FactoryUserStatus','FactoryPermission','FactoryUser','FactoryRole','FactorySession',
  'FactoryCustomerRef','FactoryAddress','FactoryDateRange',
  // §3
  'FactoryStockCategory','FactoryUnitOfMeasure','FactoryMovementType','FactoryLocationType',
  'FactoryScanContext','FactoryStockItem','FactoryStockMovement','FactoryLocation',
  'FactoryCoordinates','FactoryQRTag','FactoryTagSubject','FactoryFrameTag','FactoryStockTag',
  'FactoryLocationTag','FactoryPalletTag','FactoryScanEvent',
  // §4
  'FactoryWorkstationType','FactoryTaskCategory','FactoryTaskStatus','FactoryPriority',
  'FactoryWorkstation','FactoryTask','FactoryTaskContext','FactoryTaskTrigger',
  'FactoryStockArrivedTrigger','FactoryJobReadyForReviewTrigger','FactoryJobCompletedTrigger',
  'FactoryStuckJobTrigger','FactoryExternalPartsRequiredTrigger','FactoryReorderTriggered',
  'IFactoryTaskRoutingPolicy','FactoryRoleBasedRouting','FactoryWorkloadBalancingRouting',
  'FactorySkillMatchRouting','FactoryStuckJobMonitor','FactoryTaskQueue',
  // §5
  'FactorySupplierType','FactoryOrderStatus','FactoryReceiptStatus','FactoryDiscrepancyType',
  'FactorySupplier','FactoryMaterialOrder','FactoryOrderLine','FactoryJobAllocation',
  'FactoryGoodsReceipt','FactoryDiscrepancy',
  // §6
  'FactoryAuditCategory','FactoryActionType','FactoryFlagSeverity','FactoryReviewOutcome',
  'FactoryAuditEntry','FactoryAuditChain','FactoryChainVerificationResult','FactoryIntegrityFlag',
  'IFactoryIntegrityWatcher','FactoryRevertPatternWatcher','FactoryRepeatedOverrideWatcher',
  'FactoryOffHoursModificationWatcher','FactoryDataChangedThenChangedBackWatcher',
  'IFactoryAuditAccessPolicy',
];

function makeSandbox() {
  const sandbox = {
    console, Date, Math, JSON, Array, Object, String, Number, Boolean, Error,
    Map, Set, isFinite, isNaN, parseFloat, parseInt,
  };
  vm.createContext(sandbox);
  return sandbox;
}

function loadFile(sandbox, relPath) {
  const srcPath = path.resolve(__dirname, '..', 'js', 'modules', 'factory', relPath);
  const full = fs.readFileSync(srcPath, 'utf8');
  // Same shim as cad-timing-contract.test.cjs: vm.runInContext doesn't
  // promote top-level `class` declarations to the sandbox global.
  const expose = `;(function(){
    var names = ${JSON.stringify(FACTORY_NAMES)};
    for (var i=0;i<names.length;i++) {
      try { globalThis[names[i]] = eval(names[i]); } catch (e) {}
    }
  })();`;
  vm.runInContext(full + expose, sandbox, { filename: relPath });
}

function loadAll(sandbox) {
  loadFile(sandbox, '27-factory-v1-jobs-frames.js');
  loadFile(sandbox, '28-factory-v1-people.js');
  loadFile(sandbox, '29-factory-v1-stock.js');
  loadFile(sandbox, '30-factory-v1-workstations-tasks.js');
  loadFile(sandbox, '31-factory-v1-suppliers.js');
  loadFile(sandbox, '32-factory-v1-audit.js');
}

// ════════════════════════════════════════════════════════════════════════════
// §1 — FactoryJob + FactoryFrame
// ════════════════════════════════════════════════════════════════════════════

function testJobsAndFrames() {
  section('§1 FactoryJob lifecycle + FactoryFrame.fromCadFrame');
  const sb = makeSandbox(); loadAll(sb);
  const { FactoryJob, FactoryJobStatus, FactoryJobRevision, FactoryRevisionType,
          FactoryFrame, FactoryFrameStatus, FactoryCustomerRef } = sb;

  const customer = new FactoryCustomerRef({ customerId: 'c1', displayName: 'Smith', state: 'VIC' });
  const job = new FactoryJob({
    klaesJobNumber: 'VIC-1234O',
    customer: customer,
    promisedDate: '2026-06-15',
  });

  assertEq(job.status, FactoryJobStatus.AWAITING_REVIEW, 'new job starts AWAITING_REVIEW');
  assertEq(job.frames.length, 0, 'job starts with 0 frames');
  assertEq(job.revisions.length, 0, 'job starts with 0 revisions');
  assert(job.isAtFactory(), 'AWAITING_REVIEW counts as at-factory');

  // Append revisions — append-only, sequence numbered.
  const r1 = job.appendRevision(new FactoryJobRevision({ type: FactoryRevisionType.DESIGN_CHANGE, changeReason: 'cad update' }));
  const r2 = job.appendRevision(new FactoryJobRevision({ type: FactoryRevisionType.SCHEDULE_CHANGE, changeReason: 'client requested 1wk later' }));
  assertEq(r1.revisionNumber, 1, 'first revision = 1');
  assertEq(r2.revisionNumber, 2, 'second revision = 2');
  assertEq(job.revisions.length, 2, 'job has 2 revisions');

  // Status transition.
  const t = job.transitionTo(FactoryJobStatus.AWAITING_MATERIALS, { by: 'pm@spartan' });
  assertEq(t.from, FactoryJobStatus.AWAITING_REVIEW, 'transition.from is prior status');
  assertEq(t.to, FactoryJobStatus.AWAITING_MATERIALS, 'transition.to is new status');
  assertEq(job.status, FactoryJobStatus.AWAITING_MATERIALS, 'job.status updated');

  // Invalid status throws.
  let threw = false;
  try { job.transitionTo('NOT_A_STATUS'); } catch (e) { threw = true; }
  assertEq(threw, true, 'invalid status throws');

  // FactoryFrame.fromCadFrame with supply_only flag.
  const cadFrame = {
    name: 'F01',
    width: 1200, height: 1500,
    productType: 'casement_window',
    profileSystem: 'ideal_4000',
    colour: 'white_body',
    glassSpec: 'dgu_4_12_4',
    installationType: 'supply_only',
    frosted: true,
  };
  const frame = FactoryFrame.fromCadFrame(cadFrame, job, 1);
  assertEq(frame.spec.dimensions.widthMm, 1200, 'frame width preserved');
  assertEq(frame.spec.dimensions.heightMm, 1500, 'frame height preserved');
  assertEq(frame.spec.profileSystem, 'ideal_4000', 'profileSystem preserved');
  assertEq(frame.spec.specialFlags.indexOf('supply_only') >= 0, true, 'supply_only flag captured');
  assertEq(frame.spec.specialFlags.indexOf('frosted_glass') >= 0, true, 'frosted_glass flag captured');
  assertEq(frame.status, FactoryFrameStatus.SPECIFIED, 'frame defaults to SPECIFIED');

  // Frame area calc (audit §4.1).
  assertEq(Math.round(frame.spec.dimensions.areaSqm() * 100) / 100, 1.8, '1200×1500 → 1.8 m²');
}

// ════════════════════════════════════════════════════════════════════════════
// §3 — Stock movements + projections
// ════════════════════════════════════════════════════════════════════════════

function testStockMovements() {
  section('§3 FactoryStockMovement.applyTo updates StockItem projections');
  const sb = makeSandbox(); loadAll(sb);
  const { FactoryStockItem, FactoryStockMovement, FactoryMovementType,
          FactoryStockCategory, FactoryUnitOfMeasure } = sb;

  const item = new FactoryStockItem({
    sku: 'profile_4000_white',
    description: 'Aluplast Ideal 4000 — White Body',
    category: FactoryStockCategory.PROFILE,
    uom: FactoryUnitOfMeasure.LENGTH_MM,
    currentQty: 0,
  });

  // INWARD_DELIVERY adds.
  new FactoryStockMovement({ item, quantity: 50000, type: FactoryMovementType.INWARD_DELIVERY }).applyTo(item);
  assertEq(item.currentQty, 50000, 'INWARD_DELIVERY +50000 → 50000');
  assertEq(item.availableQty, 50000, 'available recomputed');

  // ALLOCATION_TO_JOB doesn't change current, increases allocated.
  new FactoryStockMovement({ item, quantity: 12000, type: FactoryMovementType.ALLOCATION_TO_JOB, reference: 'VIC-1234O' }).applyTo(item);
  assertEq(item.currentQty, 50000, 'allocation does not touch currentQty');
  assertEq(item.allocatedQty, 12000, 'allocatedQty = 12000');
  assertEq(item.availableQty, 38000, 'available = 50000 − 12000');

  // CONSUMPTION reduces current.
  new FactoryStockMovement({ item, quantity: 12000, type: FactoryMovementType.CONSUMPTION }).applyTo(item);
  assertEq(item.currentQty, 38000, 'CONSUMPTION 12000 → currentQty 38000');

  // OFFCUT_RETAINED adds (kept stock per §2.4).
  new FactoryStockMovement({ item, quantity: 800, type: FactoryMovementType.OFFCUT_RETAINED }).applyTo(item);
  assertEq(item.currentQty, 38800, 'OFFCUT_RETAINED +800 → 38800');

  // WASTE_DISPOSAL reduces (gone per §2.4).
  new FactoryStockMovement({ item, quantity: 200, type: FactoryMovementType.WASTE_DISPOSAL }).applyTo(item);
  assertEq(item.currentQty, 38600, 'WASTE_DISPOSAL −200 → 38600');

  // ADJUSTMENT_DOWN clamps at 0.
  new FactoryStockMovement({ item, quantity: 100000, type: FactoryMovementType.ADJUSTMENT_DOWN }).applyTo(item);
  assertEq(item.currentQty, 0, 'ADJUSTMENT_DOWN beyond stock clamps at 0');
}

// ════════════════════════════════════════════════════════════════════════════
// §4 — TaskQueue + StuckJobMonitor
// ════════════════════════════════════════════════════════════════════════════

function testTaskQueueAndStuckJobs() {
  section('§4 TaskQueue + StuckJobMonitor (§14.2)');
  const sb = makeSandbox(); loadAll(sb);
  const { FactoryTask, FactoryTaskQueue, FactoryTaskCategory, FactoryTaskStatus,
          FactoryStuckJobMonitor, FactoryJob, FactoryJobStatus } = sb;

  const q = new FactoryTaskQueue({ user: { userId: 'u1' } });
  const t1 = new FactoryTask({ title: 'Put away aluplast', category: FactoryTaskCategory.STOCK_HANDLING });
  const t2 = new FactoryTask({ title: 'Review job',       category: FactoryTaskCategory.ADMIN });
  q.enqueue(t1); q.enqueue(t2);
  assertEq(q.openTasks.length, 2, '2 tasks open');
  assertEq(q.size(), 2, 'size = 2');

  q.promote(t1);
  assertEq(q.openTasks.length, 1, '1 left in open');
  assertEq(q.inProgressTasks.length, 1, '1 in progress');
  assertEq(q.size(), 2, 'size still 2');

  // Stuck job: MATERIAL_AT_FACTORY for 50 days (threshold 42).
  const fiftyDaysAgo = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString();
  const recentArrival = new Date().toISOString();
  const stuckJob = new FactoryJob({ klaesJobNumber: 'VIC-9999O', status: FactoryJobStatus.MATERIAL_AT_FACTORY });
  stuckJob.arrivedAt = fiftyDaysAgo;
  const freshJob = new FactoryJob({ klaesJobNumber: 'VIC-1111O', status: FactoryJobStatus.MATERIAL_AT_FACTORY });
  freshJob.arrivedAt = recentArrival;

  const monitor = new FactoryStuckJobMonitor();
  const stale = monitor.scan([stuckJob, freshJob]);
  assertEq(stale.length, 1, '1 stuck job found');
  assertEq(stale[0].klaesJobNumber, 'VIC-9999O', 'the right job is flagged');

  const triggers = monitor.createTriggers(stale);
  assertEq(triggers.length, 1, '1 trigger produced');
  assertEq(triggers[0].kind, 'stuck_job', 'trigger kind = stuck_job');
  assertEq(triggers[0].stuckIn, FactoryJobStatus.MATERIAL_AT_FACTORY, 'trigger.stuckIn captured');
}

// ════════════════════════════════════════════════════════════════════════════
// §5 — MaterialOrder + GoodsReceipt
// ════════════════════════════════════════════════════════════════════════════

function testMaterialOrders() {
  section('§5 MaterialOrder + GoodsReceipt with discrepancies');
  const sb = makeSandbox(); loadAll(sb);
  const { FactorySupplier, FactorySupplierType, FactoryMaterialOrder, FactoryOrderLine,
          FactoryOrderStatus, FactoryGoodsReceipt, FactoryReceiptStatus,
          FactoryDiscrepancy, FactoryDiscrepancyType, FactoryStockItem,
          FactoryStockCategory, FactoryUnitOfMeasure } = sb;

  const aluplast = new FactorySupplier({ displayName: 'Aluplast Australia', type: FactorySupplierType.PROFILE_MANUFACTURER, leadTimeDays: 14 });
  const item    = new FactoryStockItem({ sku: 'profile_white', category: FactoryStockCategory.PROFILE, uom: FactoryUnitOfMeasure.LENGTH_MM });

  const order = new FactoryMaterialOrder({ supplier: aluplast });
  order.addLine(new FactoryOrderLine({ item, quantity: 60000, unitPrice: 0.04 }));
  order.addLine(new FactoryOrderLine({ item, quantity: 30000, unitPrice: 0.04 }));
  assertEq(order.lines.length, 2, '2 lines');
  assertEq(Math.round(order.totalValue * 100) / 100, 3600, 'totalValue = 90000 × 0.04 = 3600');
  assertEq(order.status, FactoryOrderStatus.DRAFT, 'starts DRAFT');

  order.submit();
  assertEq(order.status, FactoryOrderStatus.SUBMITTED, 'submit → SUBMITTED');
  assert(!!order.orderedAt, 'orderedAt stamped');

  // Cannot re-submit.
  let threw = false;
  try { order.submit(); } catch (e) { threw = true; }
  assertEq(threw, true, 'second submit throws');

  // Receipt with a discrepancy (§2.3 mixed-order).
  const receipt = new FactoryGoodsReceipt({ order, receivedBy: 'recv-op' });
  assertEq(receipt.status, FactoryReceiptStatus.AS_EXPECTED, 'receipt starts AS_EXPECTED');
  receipt.addDiscrepancy(new FactoryDiscrepancy({
    line: order.lines[0],
    expected: 60000, received: 50000,
    type: FactoryDiscrepancyType.QUANTITY_SHORT,
    notes: '10 lengths missing',
  }));
  receipt.addDiscrepancy(new FactoryDiscrepancy({
    line: order.lines[1],
    type: FactoryDiscrepancyType.WRONG_ORDER_MIXED_IN,
    notes: 'Found tags for VIC-9876S in this delivery',
  }));
  assertEq(receipt.discrepancies.length, 2, '2 discrepancies recorded');
  assertEq(receipt.status, FactoryReceiptStatus.MIXED_DISCREPANCIES, 'auto-promoted to MIXED_DISCREPANCIES');

  receipt.attachPhoto({ filename: 'evidence.jpg', dataUrl: 'data:...' });
  assertEq(receipt.photos.length, 1, '1 photo attached for evidence');
}

// ════════════════════════════════════════════════════════════════════════════
// §6 — AuditChain hash linkage + tamper detection
// ════════════════════════════════════════════════════════════════════════════

function testAuditChain() {
  section('§6 FactoryAuditChain.verifyChain — hash linkage');
  const sb = makeSandbox(); loadAll(sb);
  const { FactoryAuditChain, FactoryAuditCategory, FactoryActionType } = sb;

  const chain = new FactoryAuditChain({ entityType: 'Job', entityId: 'job_abc' });
  const e1 = chain.append({ category: FactoryAuditCategory.ENTITY_CREATED, action: FactoryActionType.CREATE, afterState: { status: 'AWAITING_REVIEW' }, actor: { userId: 'pm' } });
  const e2 = chain.append({ category: FactoryAuditCategory.STATUS_TRANSITION, action: FactoryActionType.UPDATE, beforeState: { status: 'AWAITING_REVIEW' }, afterState: { status: 'AWAITING_MATERIALS' }, actor: { userId: 'pm' } });
  const e3 = chain.append({ category: FactoryAuditCategory.STATUS_TRANSITION, action: FactoryActionType.UPDATE, beforeState: { status: 'AWAITING_MATERIALS' }, afterState: { status: 'MATERIAL_AT_FACTORY' }, actor: { userId: 'pm' } });

  assertEq(chain.entries.length, 3, '3 entries appended');
  assertEq(e1.sequenceNumber, 1, 'e1 seq = 1');
  assertEq(e2.previousEntryHash, e1.entryHash, 'e2.previousEntryHash = e1.entryHash');
  assertEq(e3.previousEntryHash, e2.entryHash, 'e3.previousEntryHash = e2.entryHash');

  // Clean chain verifies.
  const v1 = chain.verifyChain();
  assertEq(v1.isValid, true, 'clean chain isValid = true');
  assertEq(v1.firstInvalidSequence, -1, 'no invalid sequence');

  // Tamper with e2.afterState; e2's hash is stale, so verify should fail.
  e2.afterState.status = 'TAMPERED';
  const v2 = chain.verifyChain();
  assertEq(v2.isValid, false, 'tampered chain detected');
  assertEq(v2.firstInvalidSequence, 2, 'tamper points at sequence 2');
  assert(/entryHash recompute mismatch/.test(v2.mismatchDetail), 'mismatchDetail names the issue');
}

// ════════════════════════════════════════════════════════════════════════════
// §6 — DataChangedThenChangedBackWatcher (walkthrough §8.3)
// ════════════════════════════════════════════════════════════════════════════

function testDataChangedThenChangedBackWatcher() {
  section('§6 DataChangedThenChangedBackWatcher — walkthrough §8.3 pattern');
  const sb = makeSandbox(); loadAll(sb);
  const { FactoryAuditEntry, FactoryAuditCategory, FactoryActionType,
          FactoryDataChangedThenChangedBackWatcher, FactoryFlagSeverity } = sb;

  const watcher = new FactoryDataChangedThenChangedBackWatcher({ windowMs: 4 * 60 * 60 * 1000 });
  assertEq(watcher.watchFor(FactoryAuditCategory.ENTITY_MODIFIED), true, 'watches ENTITY_MODIFIED');
  assertEq(watcher.watchFor(FactoryAuditCategory.AUTHENTICATION), false, 'does not watch AUTHENTICATION');

  // The §8.3 pattern: dispatch_address changed VIC → ACT → VIC by same actor.
  const baseTs = Date.now();
  const sketchyActor = { userId: 'driver_x' };
  const e1 = new FactoryAuditEntry({
    sequenceNumber: 1, serverTimestamp: new Date(baseTs).toISOString(),
    actor: sketchyActor, category: FactoryAuditCategory.ENTITY_MODIFIED, action: FactoryActionType.UPDATE,
    entityType: 'Job', entityId: 'job_777',
    beforeState: { dispatch_address: 'VIC' }, afterState:  { dispatch_address: 'ACT' },
  });
  const e2 = new FactoryAuditEntry({
    sequenceNumber: 2, serverTimestamp: new Date(baseTs + 60 * 60 * 1000).toISOString(),  // +1h
    actor: sketchyActor, category: FactoryAuditCategory.ENTITY_MODIFIED, action: FactoryActionType.UPDATE,
    entityType: 'Job', entityId: 'job_777',
    beforeState: { dispatch_address: 'ACT' }, afterState: { dispatch_address: 'VIC' },  // reverted
  });

  const flag = watcher.onSuspiciousPattern([e1, e2]);
  assert(flag !== null, 'flag raised for A→B→A pattern');
  assertEq(flag.suspectedActor, sketchyActor, 'suspectedActor identified');
  assertEq(flag.severity, FactoryFlagSeverity.CONCERNING, 'severity = CONCERNING');
  assertEq(flag.relevantEntries.length, 2, 'both entries attached');
  assert(/changed then reverted/.test(flag.pattern), 'pattern message is descriptive');

  // Control: outside the window → no flag.
  const e3 = new FactoryAuditEntry({
    sequenceNumber: 1, serverTimestamp: new Date(baseTs).toISOString(),
    actor: sketchyActor, category: FactoryAuditCategory.ENTITY_MODIFIED, action: FactoryActionType.UPDATE,
    entityType: 'Job', entityId: 'job_888',
    beforeState: { x: 'A' }, afterState: { x: 'B' },
  });
  const e4 = new FactoryAuditEntry({
    sequenceNumber: 2, serverTimestamp: new Date(baseTs + 5 * 60 * 60 * 1000).toISOString(),  // +5h, outside 4h window
    actor: sketchyActor, category: FactoryAuditCategory.ENTITY_MODIFIED, action: FactoryActionType.UPDATE,
    entityType: 'Job', entityId: 'job_888',
    beforeState: { x: 'B' }, afterState: { x: 'A' },
  });
  const flag2 = watcher.onSuspiciousPattern([e3, e4]);
  assertEq(flag2, null, 'outside window → no flag');
}

// ════════════════════════════════════════════════════════════════════════════
// §6 — RepeatedOverrideWatcher
// ════════════════════════════════════════════════════════════════════════════

function testRepeatedOverrideWatcher() {
  section('§6 RepeatedOverrideWatcher — 5+ overrides in 7 days');
  const sb = makeSandbox(); loadAll(sb);
  const { FactoryAuditEntry, FactoryAuditCategory, FactoryActionType,
          FactoryRepeatedOverrideWatcher, FactoryFlagSeverity } = sb;

  const watcher = new FactoryRepeatedOverrideWatcher();
  assertEq(watcher.thresholdCount, 5, 'default threshold = 5');

  const actor = { userId: 'pm_alice' };
  const baseTs = Date.now();
  const entries = [];
  for (let i = 0; i < 5; i++) {
    entries.push(new FactoryAuditEntry({
      sequenceNumber: i + 1,
      serverTimestamp: new Date(baseTs - i * 60 * 60 * 1000).toISOString(),
      actor, category: FactoryAuditCategory.MANAGER_OVERRIDE, action: FactoryActionType.OVERRIDE,
      entityType: 'Job', entityId: 'job_' + i,
    }));
  }
  const flag = watcher.onSuspiciousPattern(entries);
  assert(flag !== null, '5 overrides → flag raised');
  assertEq(flag.severity, FactoryFlagSeverity.CONCERNING, 'severity CONCERNING');
  assertEq(flag.relevantEntries.length, 5, '5 entries attached');

  // 4 overrides → no flag.
  const flag2 = watcher.onSuspiciousPattern(entries.slice(0, 4));
  assertEq(flag2, null, '4 overrides → no flag (under threshold)');
}

// ════════════════════════════════════════════════════════════════════════════
// Run
// ════════════════════════════════════════════════════════════════════════════

testJobsAndFrames();
testStockMovements();
testTaskQueueAndStuckJobs();
testMaterialOrders();
testAuditChain();
testDataChangedThenChangedBackWatcher();
testRepeatedOverrideWatcher();

process.stdout.write('\n');
process.stdout.write('  ' + _passCount + ' passed, ' + _failCount + ' failed\n');
if (_failCount > 0) {
  process.stdout.write('\n  Failures:\n');
  _failures.forEach(f => process.stdout.write('    - ' + f + '\n'));
  process.exit(1);
}
process.exit(0);
