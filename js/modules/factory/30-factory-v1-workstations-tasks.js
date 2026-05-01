// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/30-factory-v1-workstations-tasks.js
// Factory CRM Base Class Diagram v1.5 §4 — Workstations, tasks, triggered events
//
// The unifying mechanism from walkthrough §14.1: TRIGGERED TASK LISTS. Stock
// arrives → task to put it away. Job complete → task to schedule dispatch.
// Today these triggers are informal and frequently dropped. The base elevates
// triggered tasks to the central nervous system of the CRM: events emit,
// triggers respond, tasks land in the right user's queue.
//
// Phase 1 SCOPE:
//   - WorkstationType is the 9-value GENERIC enum. The manual's 11 specific
//     stations (PROFILE_SAW S1, STEEL_SAW S2, CNC_MILLING S4A, STEEL_SCREW
//     S4B, WELDER, CORNER_CLEAN, HARDWARE S5, REVEALS_TRIMS S6, FLY_SCREEN
//     S7, QC, BAY_DISPATCH) are deferred to Phase 2 per v1.5 §10.
//   - Trigger set reduced to Factory-CRM-relevant only (StockArrived,
//     JobReadyForReview, JobCompleted, StuckJob, ExternalPartsRequired,
//     ReorderTriggered). HardBlockOverrideTrigger / CallTranscriptDiscrepancy
//     / PermitRequired / CustomerDataStale / HiringFlag → other modules.
//   - TaskCategory reduced to Factory categories (no SALES_FOLLOWUP etc.).
//   - ITaskRoutingPolicy + 3 strategies (RoleBased, WorkloadBalancing,
//     SkillMatch). Concrete routing engines are stubs in v1.5.
//   - StuckJobMonitor + thresholdsByStatus implements §14.2.
//
// Globals exposed:
//   FactoryWorkstationType, FactoryTaskCategory, FactoryTaskStatus,
//   FactoryPriority (enums)
//   FactoryWorkstation, FactoryTask, FactoryTaskContext, FactoryTaskTrigger,
//   FactoryStockArrivedTrigger, FactoryJobReadyForReviewTrigger,
//   FactoryJobCompletedTrigger, FactoryStuckJobTrigger,
//   FactoryExternalPartsRequiredTrigger, FactoryReorderTriggered,
//   IFactoryTaskRoutingPolicy, FactoryRoleBasedRouting,
//   FactoryWorkloadBalancingRouting, FactorySkillMatchRouting,
//   FactoryStuckJobMonitor, FactoryTaskQueue
// ═════════════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────────────

// v1.5: 9-value GENERIC enum. Phase 2 swaps in the manual's 11 specifics.
var FactoryWorkstationType = Object.freeze({
  SAW_CUTTING:       'SAW_CUTTING',
  MILLING:           'MILLING',
  WELDING:           'WELDING',
  HARDWARE_FITTING:  'HARDWARE_FITTING',
  QC:                'QC',
  PACKING:           'PACKING',
  DISPATCH:          'DISPATCH',
  RECEIVING:         'RECEIVING',
  OTHER:             'OTHER',
});

var FactoryTaskCategory = Object.freeze({
  STOCK_HANDLING: 'STOCK_HANDLING',
  PRODUCTION:     'PRODUCTION',
  QC:             'QC',
  DISPATCH:       'DISPATCH',
  ADMIN:          'ADMIN',
  PROCUREMENT:    'PROCUREMENT',
  ESCALATION:     'ESCALATION',
});

var FactoryTaskStatus = Object.freeze({
  OPEN:        'OPEN',
  ASSIGNED:    'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  BLOCKED:     'BLOCKED',
  COMPLETED:   'COMPLETED',
  CANCELLED:   'CANCELLED',
  EXPIRED:     'EXPIRED',
});

var FactoryPriority = Object.freeze({
  BLOCKING: 'BLOCKING',
  URGENT:   'URGENT',
  STANDARD: 'STANDARD',
  LOW:      'LOW',
});

// ── Workstation ──────────────────────────────────────────────────────────────

class FactoryWorkstation {
  constructor(opts) {
    opts = opts || {};
    this.stationId     = opts.stationId   || ('ws_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.displayName   = opts.displayName || '';
    this.type          = opts.type   || FactoryWorkstationType.OTHER;
    this.active        = (opts.active !== false);
    this.staffCapacity = Number(opts.staffCapacity) || 1;
  }
}

// ── Task & TaskContext ───────────────────────────────────────────────────────

class FactoryTaskContext {
  constructor(opts) {
    opts = opts || {};
    this.relatedJob      = opts.relatedJob   || null;            // FactoryJob
    this.relatedFrame    = opts.relatedFrame || null;            // FactoryFrame
    this.relatedStock    = opts.relatedStock || null;            // FactoryStockItem
    // §11.2 finding: AI-prepared task queues with prep work pre-completed.
    // The trigger that creates the task knows what context is relevant and
    // pre-populates this map. The actual AI pipeline is downstream.
    this.prePreparedData = opts.prePreparedData instanceof Map
      ? opts.prePreparedData
      : new Map(opts.prePreparedData ? Object.entries(opts.prePreparedData) : []);
    this.relevantLinks   = Array.isArray(opts.relevantLinks) ? opts.relevantLinks.slice() : [];
  }
}

class FactoryTask {
  constructor(opts) {
    opts = opts || {};
    this.taskId          = opts.taskId      || ('task_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.category        = opts.category    || FactoryTaskCategory.ADMIN;
    this.title           = opts.title       || '';
    this.description     = opts.description || '';
    this.status          = opts.status      || FactoryTaskStatus.OPEN;
    this.priority        = opts.priority    || FactoryPriority.STANDARD;
    this.assignedTo      = opts.assignedTo  || null;             // FactoryUser
    this.assignedToRole  = opts.assignedToRole || null;          // FactoryRole
    this.createdAt       = opts.createdAt   || new Date().toISOString();
    this.dueAt           = opts.dueAt       || null;
    this.completedAt     = opts.completedAt || null;
    this.trigger         = opts.trigger     || null;             // FactoryTaskTrigger
    this.context         = opts.context instanceof FactoryTaskContext
      ? opts.context
      : new FactoryTaskContext(opts.context || {});
  }

  start(user) {
    if (this.status !== FactoryTaskStatus.OPEN && this.status !== FactoryTaskStatus.ASSIGNED) return false;
    this.status = FactoryTaskStatus.IN_PROGRESS;
    if (user && !this.assignedTo) this.assignedTo = user;
    return true;
  }

  complete(user) {
    this.status = FactoryTaskStatus.COMPLETED;
    this.completedAt = new Date().toISOString();
    if (user) this.assignedTo = user;
    return true;
  }

  block(reason) {
    this.status = FactoryTaskStatus.BLOCKED;
    this.context.prePreparedData.set('blockReason', reason || '');
    return true;
  }

  isOverdue(now) {
    if (!this.dueAt) return false;
    if (this.status === FactoryTaskStatus.COMPLETED || this.status === FactoryTaskStatus.CANCELLED) return false;
    var ref = (now instanceof Date ? now.toISOString() : (now || new Date().toISOString()));
    return ref > this.dueAt;
  }
}

// ── TaskTrigger hierarchy ────────────────────────────────────────────────────
// Abstract base + 6 Factory-CRM-relevant subclasses (v1.5 trim).

class FactoryTaskTrigger {
  constructor(opts) {
    opts = opts || {};
    this.kind          = opts.kind || 'unknown';
    this.triggeredAt   = opts.triggeredAt || new Date().toISOString();
    this.triggerReason = opts.triggerReason || '';
  }
}

class FactoryStockArrivedTrigger extends FactoryTaskTrigger {
  constructor(opts) {
    super(Object.assign({ kind: 'stock_arrived' }, opts || {}));
    opts = opts || {};
    this.stockItem    = opts.stockItem || null;
    this.quantity     = Number(opts.quantity) || 0;
    this.fromSupplier = opts.fromSupplier || null;     // FactorySupplier (defined in §5)
  }
}

class FactoryJobReadyForReviewTrigger extends FactoryTaskTrigger {
  constructor(opts) {
    super(Object.assign({ kind: 'job_ready_for_review' }, opts || {}));
    this.job = (opts && opts.job) || null;
  }
}

class FactoryJobCompletedTrigger extends FactoryTaskTrigger {
  constructor(opts) {
    super(Object.assign({ kind: 'job_completed' }, opts || {}));
    this.job = (opts && opts.job) || null;
  }
}

class FactoryStuckJobTrigger extends FactoryTaskTrigger {
  constructor(opts) {
    super(Object.assign({ kind: 'stuck_job' }, opts || {}));
    opts = opts || {};
    this.job        = opts.job || null;
    this.stuckFor   = Number(opts.stuckFor) || 0;     // Duration in milliseconds
    this.stuckIn    = opts.stuckIn || null;            // FactoryJobStatus
  }
}

class FactoryExternalPartsRequiredTrigger extends FactoryTaskTrigger {
  constructor(opts) {
    super(Object.assign({ kind: 'external_parts_required' }, opts || {}));
    opts = opts || {};
    this.serviceJob = opts.serviceJob || null;         // FactoryJob with type=SERVICE_*
    this.partsList  = Array.isArray(opts.partsList) ? opts.partsList.slice() : [];
  }
}

class FactoryReorderTriggered extends FactoryTaskTrigger {
  constructor(opts) {
    super(Object.assign({ kind: 'reorder_triggered' }, opts || {}));
    opts = opts || {};
    this.stockItem      = opts.stockItem || null;
    this.currentLevel   = Number(opts.currentLevel)   || 0;
    this.thresholdLevel = Number(opts.thresholdLevel) || 0;
  }
}

// ── Routing policies (interface + 3 strategies) ─────────────────────────────

class IFactoryTaskRoutingPolicy {
  route(task, /* candidates */) { throw new Error('IFactoryTaskRoutingPolicy.route: not implemented'); }
  escalate(task)                { throw new Error('IFactoryTaskRoutingPolicy.escalate: not implemented'); }
}

// Routes by role: prefer the first user with an active role matching task.assignedToRole.
class FactoryRoleBasedRouting extends IFactoryTaskRoutingPolicy {
  route(task, candidates) {
    if (!task || !task.assignedToRole) return null;
    var roleName = task.assignedToRole.name;
    return (candidates || []).find(function(u){
      return u.roles && u.roles.some(function(r){ return r.name === roleName && r.isValidAt(); });
    }) || null;
  }
  escalate(task) {
    // Bump priority and clear assignment; the next route() will pick up.
    if (task) {
      task.priority = (task.priority === FactoryPriority.STANDARD) ? FactoryPriority.URGENT : FactoryPriority.BLOCKING;
      task.assignedTo = null;
    }
    return null;
  }
}

// Routes by current load: pick the user with the fewest open tasks.
class FactoryWorkloadBalancingRouting extends IFactoryTaskRoutingPolicy {
  constructor(taskQueueResolver) {
    super();
    // taskQueueResolver: function(user) -> FactoryTaskQueue (caller injects)
    this.taskQueueResolver = taskQueueResolver || function(){ return null; };
  }
  route(task, candidates) {
    var best = null, bestLoad = Infinity, resolver = this.taskQueueResolver;
    (candidates || []).forEach(function(u){
      var q = resolver(u);
      var load = q ? (q.openTasks.length + q.inProgressTasks.length) : 0;
      if (load < bestLoad) { best = u; bestLoad = load; }
    });
    return best;
  }
  escalate(task) {
    if (task) task.priority = FactoryPriority.URGENT;
    return null;
  }
}

// Routes by declared skill: candidates with a `skills` set including
// task.context.prePreparedData.get('requiredSkill') win.
class FactorySkillMatchRouting extends IFactoryTaskRoutingPolicy {
  route(task, candidates) {
    if (!task || !task.context) return null;
    var required = task.context.prePreparedData.get('requiredSkill');
    if (!required) return null;
    return (candidates || []).find(function(u){
      return u.skills && (u.skills.has ? u.skills.has(required) : (u.skills.indexOf && u.skills.indexOf(required) >= 0));
    }) || null;
  }
  escalate(task) {
    if (task) task.priority = FactoryPriority.URGENT;
    return null;
  }
}

// ── StuckJobMonitor (§14.2) ──────────────────────────────────────────────────

class FactoryStuckJobMonitor {
  constructor(opts) {
    opts = opts || {};
    // thresholdsByStatus: { JOB_STATUS_KEY: durationMs }. Default examples
    // mirror the walkthrough's "material at factory > 6 weeks" example and
    // a "QC > 3 days" guess.
    var DAY = 24 * 60 * 60 * 1000;
    this.thresholdsByStatus = opts.thresholdsByStatus || {
      AWAITING_REVIEW:     2  * DAY,
      AWAITING_MATERIALS:  21 * DAY,
      MATERIAL_AT_FACTORY: 42 * DAY,    // 6 weeks
      IN_PRODUCTION:       7  * DAY,
      QC_CHECK:            3  * DAY,
      READY_DISPATCH:      5  * DAY,
      IN_BAY:              7  * DAY,
    };
  }

  // Returns a list of jobs whose time-in-status exceeds the threshold.
  // `jobs` is a flat array of FactoryJob instances; caller supplies the
  // statusEnteredAt timestamp via job.context (or a side map).
  scan(jobs, statusEnteredAtFn) {
    var now = Date.now();
    var thresholds = this.thresholdsByStatus;
    var enteredAt = statusEnteredAtFn || function(j){ return j.statusEnteredAt || j.arrivedAt; };
    return (jobs || []).filter(function(j){
      var threshold = thresholds[j.status];
      if (!threshold) return false;
      var since = new Date(enteredAt(j)).getTime();
      return (now - since) > threshold;
    });
  }

  createTriggers(staleJobs) {
    return (staleJobs || []).map(function(j){
      return new FactoryStuckJobTrigger({
        job: j,
        stuckIn: j.status,
        stuckFor: 0,
        triggerReason: 'Status ' + j.status + ' exceeded configured threshold',
      });
    });
  }
}

// ── TaskQueue ────────────────────────────────────────────────────────────────

class FactoryTaskQueue {
  constructor(opts) {
    opts = opts || {};
    this.user             = opts.user || null;
    this.openTasks        = Array.isArray(opts.openTasks)       ? opts.openTasks.slice()       : [];
    this.inProgressTasks  = Array.isArray(opts.inProgressTasks) ? opts.inProgressTasks.slice() : [];
    this.overdueCount     = Number(opts.overdueCount) || 0;
  }
  enqueue(task) {
    if (!(task instanceof FactoryTask)) return;
    if (task.status === FactoryTaskStatus.IN_PROGRESS) this.inProgressTasks.push(task);
    else this.openTasks.push(task);
    if (task.isOverdue && task.isOverdue()) this.overdueCount++;
  }
  // Move a task from openTasks to inProgressTasks when it starts.
  promote(task) {
    var i = this.openTasks.indexOf(task);
    if (i < 0) return;
    this.openTasks.splice(i, 1);
    this.inProgressTasks.push(task);
  }
  size() { return this.openTasks.length + this.inProgressTasks.length; }
}
