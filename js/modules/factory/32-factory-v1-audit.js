// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/32-factory-v1-audit.js
// Factory CRM Base Class Diagram v1.5 §6 — Audit Trail
//
// THE MOST LOAD-BEARING INFRASTRUCTURE IN THE BASE.
//
// Walkthrough §8.3 finding: a deliberate manipulation of dispatch data by a
// staff member who can't be terminated. Bay closure and dispatch happen in
// Factory CRM (manual §4.10, §5.11), so the integrity watchers stay
// foundational HERE — not Jobs CRM.
//
// Phase 1 SCOPE:
//   - AuditCategory.QUOTE_REVISION renamed to JOB_REVISION (Factory-side).
//   - 4 IIntegrityWatcher implementations:
//       RevertPatternWatcher          — broad: frequent reverts of same field
//       RepeatedOverrideWatcher       — status overrides by user
//       OffHoursModificationWatcher   — edits outside normal hours
//       DataChangedThenChangedBackWatcher — §8.3-specific (rarely innocent)
//   - AuditChain hash linkage: every entry's previousEntryHash refers to the
//     prior entry's entryHash. Tampering invalidates every subsequent hash.
//   - IAuditAccessPolicy controls who can see what (audit visibility is
//     itself sensitive).
//
// Crypto note: hash uses a tiny non-cryptographic FNV-1a-style mix for
// browser portability. Production should swap for SHA-256 via SubtleCrypto;
// the AuditChain.verifyChain shape is identical either way.
//
// Globals exposed:
//   FactoryAuditCategory, FactoryActionType, FactoryFlagSeverity,
//   FactoryReviewOutcome (enums)
//   FactoryAuditEntry, FactoryAuditChain, FactoryChainVerificationResult,
//   FactoryIntegrityFlag,
//   IFactoryIntegrityWatcher, FactoryRevertPatternWatcher,
//   FactoryRepeatedOverrideWatcher, FactoryOffHoursModificationWatcher,
//   FactoryDataChangedThenChangedBackWatcher,
//   IFactoryAuditAccessPolicy
// ═════════════════════════════════════════════════════════════════════════════

// ── Enums ────────────────────────────────────────────────────────────────────

var FactoryAuditCategory = Object.freeze({
  AUTHENTICATION:    'AUTHENTICATION',
  AUTHORISATION:     'AUTHORISATION',
  ENTITY_CREATED:    'ENTITY_CREATED',
  ENTITY_MODIFIED:   'ENTITY_MODIFIED',
  ENTITY_DELETED:    'ENTITY_DELETED',
  STATUS_TRANSITION: 'STATUS_TRANSITION',
  STOCK_MOVEMENT:    'STOCK_MOVEMENT',
  SCAN_EVENT:        'SCAN_EVENT',
  TASK_LIFECYCLE:    'TASK_LIFECYCLE',
  JOB_REVISION:      'JOB_REVISION',     // renamed from QUOTE_REVISION (Factory-side)
  DISPATCH_ACTION:   'DISPATCH_ACTION',
  DATA_CORRECTION:   'DATA_CORRECTION',
  MANAGER_OVERRIDE:  'MANAGER_OVERRIDE',
  INTEGRITY_FLAG:    'INTEGRITY_FLAG',
  SETTINGS_CHANGE:   'SETTINGS_CHANGE',
});

var FactoryActionType = Object.freeze({
  CREATE:   'CREATE',
  READ:     'READ',
  UPDATE:   'UPDATE',
  DELETE:   'DELETE',
  APPROVE:  'APPROVE',
  REJECT:   'REJECT',
  OVERRIDE: 'OVERRIDE',
  REVERT:   'REVERT',
  SCAN:     'SCAN',
  LOGIN:    'LOGIN',
  LOGOUT:   'LOGOUT',
  EXPORT:   'EXPORT',
});

var FactoryFlagSeverity = Object.freeze({
  INFORMATIONAL: 'INFORMATIONAL',
  SUSPICIOUS:    'SUSPICIOUS',
  CONCERNING:    'CONCERNING',
  CRITICAL:      'CRITICAL',
});

var FactoryReviewOutcome = Object.freeze({
  FALSE_POSITIVE:           'FALSE_POSITIVE',
  EXPLAINED_LEGITIMATE:     'EXPLAINED_LEGITIMATE',
  REQUIRES_PROCESS_CHANGE:  'REQUIRES_PROCESS_CHANGE',
  REQUIRES_INTERVENTION:    'REQUIRES_INTERVENTION',
  UNRESOLVED:               'UNRESOLVED',
});

// ── Hash helper ──────────────────────────────────────────────────────────────
// Tiny non-cryptographic FNV-1a 32-bit mix. Sufficient for tamper detection
// in dev/test; production should swap for SHA-256 via SubtleCrypto.
function _factoryHashEntry(entry) {
  if (!entry) return '0';
  var str = JSON.stringify({
    seq: entry.sequenceNumber,
    ts:  entry.serverTimestamp,
    a:   entry.actor && (entry.actor.userId || entry.actor),
    cat: entry.category,
    et:  entry.entityType,
    eid: entry.entityId,
    act: entry.action,
    bef: entry.beforeState,
    aft: entry.afterState,
    rea: entry.reason,
    prev: entry.previousEntryHash,
  });
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

// ── AuditEntry ───────────────────────────────────────────────────────────────

class FactoryAuditEntry {
  constructor(opts) {
    opts = opts || {};
    this.entryId           = opts.entryId || ('ae_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.sequenceNumber    = Number(opts.sequenceNumber) || 0;
    this.serverTimestamp   = opts.serverTimestamp || new Date().toISOString();
    this.clientTimestamp   = opts.clientTimestamp || null;
    this.actor             = opts.actor || null;             // FactoryUser
    this.actorRole         = opts.actorRole || null;         // FactoryRole
    this.category          = opts.category || FactoryAuditCategory.ENTITY_MODIFIED;
    this.entityType        = opts.entityType || '';
    this.entityId          = opts.entityId || '';
    this.action            = opts.action || FactoryActionType.UPDATE;
    this.beforeState       = opts.beforeState || null;       // Map / object
    this.afterState        = opts.afterState  || null;       // Map / object
    this.reason            = opts.reason || '';
    this.previousEntryHash = opts.previousEntryHash || null;
    this.entryHash         = opts.entryHash || _factoryHashEntry(this);
  }

  // Convenience: build the next entry in a chain.
  static next(prevEntry, opts) {
    return new FactoryAuditEntry(Object.assign({
      sequenceNumber:    (prevEntry ? prevEntry.sequenceNumber + 1 : 1),
      previousEntryHash: (prevEntry ? prevEntry.entryHash : null),
    }, opts || {}));
  }
}

// ── ChainVerificationResult ──────────────────────────────────────────────────

class FactoryChainVerificationResult {
  constructor(opts) {
    opts = opts || {};
    this.isValid              = !!opts.isValid;
    this.firstInvalidSequence = (typeof opts.firstInvalidSequence === 'number') ? opts.firstInvalidSequence : -1;
    this.mismatchDetail       = opts.mismatchDetail || '';
  }
}

// ── AuditChain ───────────────────────────────────────────────────────────────

class FactoryAuditChain {
  constructor(opts) {
    opts = opts || {};
    this.entityType = opts.entityType || '';
    this.entityId   = opts.entityId   || '';
    this.entries    = Array.isArray(opts.entries) ? opts.entries.slice() : [];
    this.createdAt  = opts.createdAt  || new Date().toISOString();
    this.latestHash = opts.latestHash || (this.entries.length ? this.entries[this.entries.length - 1].entryHash : null);
  }

  append(opts) {
    var prev = this.entries[this.entries.length - 1] || null;
    var entry = FactoryAuditEntry.next(prev, Object.assign({
      entityType: this.entityType,
      entityId:   this.entityId,
    }, opts || {}));
    this.entries.push(entry);
    this.latestHash = entry.entryHash;
    return entry;
  }

  verifyChain() {
    if (this.entries.length === 0) {
      return new FactoryChainVerificationResult({ isValid: true });
    }
    var prevHash = null;
    for (var i = 0; i < this.entries.length; i++) {
      var e = this.entries[i];
      // Sequence must be monotonic.
      if (e.sequenceNumber !== i + 1) {
        return new FactoryChainVerificationResult({
          isValid: false,
          firstInvalidSequence: e.sequenceNumber,
          mismatchDetail: 'sequence number out of order at index ' + i,
        });
      }
      // Previous-hash linkage.
      if (e.previousEntryHash !== prevHash) {
        return new FactoryChainVerificationResult({
          isValid: false,
          firstInvalidSequence: e.sequenceNumber,
          mismatchDetail: 'previousEntryHash mismatch at sequence ' + e.sequenceNumber,
        });
      }
      // Recompute the entry hash and confirm it matches.
      var recomputed = _factoryHashEntry(e);
      if (recomputed !== e.entryHash) {
        return new FactoryChainVerificationResult({
          isValid: false,
          firstInvalidSequence: e.sequenceNumber,
          mismatchDetail: 'entryHash recompute mismatch at sequence ' + e.sequenceNumber,
        });
      }
      prevHash = e.entryHash;
    }
    return new FactoryChainVerificationResult({ isValid: true });
  }
}

// ── IntegrityFlag ────────────────────────────────────────────────────────────

class FactoryIntegrityFlag {
  constructor(opts) {
    opts = opts || {};
    this.flagId          = opts.flagId || ('flag_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.raisedAt        = opts.raisedAt || new Date().toISOString();
    this.suspectedActor  = opts.suspectedActor || null;
    this.pattern         = opts.pattern || '';
    this.relevantEntries = Array.isArray(opts.relevantEntries) ? opts.relevantEntries.slice() : [];
    this.severity        = opts.severity || FactoryFlagSeverity.SUSPICIOUS;
    this.reviewedBy      = opts.reviewedBy || null;
    this.outcome         = opts.outcome || FactoryReviewOutcome.UNRESOLVED;
  }

  resolve(reviewer, outcome) {
    this.reviewedBy = reviewer;
    this.outcome    = outcome;
    return this;
  }
}

// ── IIntegrityWatcher (interface) + 4 concrete watchers ─────────────────────

class IFactoryIntegrityWatcher {
  // Filter: should this watcher inspect entries of this category?
  watchFor(category) { return true; }
  // Pattern test: given a stream of entries, does a suspicious pattern emerge?
  // Returns a FactoryIntegrityFlag or null.
  onSuspiciousPattern(entries) { throw new Error('IFactoryIntegrityWatcher.onSuspiciousPattern: not implemented'); }
}

// Frequent reverts of the same field by the same user.
class FactoryRevertPatternWatcher extends IFactoryIntegrityWatcher {
  constructor(opts) {
    super();
    opts = opts || {};
    this.windowMs       = Number(opts.windowMs) || (24 * 60 * 60 * 1000);
    this.thresholdCount = Number(opts.thresholdCount) || 3;
  }
  watchFor(category) { return category === FactoryAuditCategory.ENTITY_MODIFIED; }
  onSuspiciousPattern(entries) {
    if (!Array.isArray(entries) || entries.length < this.thresholdCount) return null;
    var byActor = {};
    var cutoff = Date.now() - this.windowMs;
    entries.forEach(function(e){
      if (e.action !== FactoryActionType.REVERT && e.action !== FactoryActionType.UPDATE) return;
      if (new Date(e.serverTimestamp).getTime() < cutoff) return;
      var actorId = e.actor && (e.actor.userId || e.actor) || 'unknown';
      var key = actorId + '|' + e.entityType + '|' + e.entityId;
      byActor[key] = byActor[key] || [];
      byActor[key].push(e);
    });
    for (var k in byActor) {
      if (byActor[k].length >= this.thresholdCount) {
        return new FactoryIntegrityFlag({
          suspectedActor: byActor[k][0].actor,
          pattern: 'frequent reverts by single actor on same entity',
          relevantEntries: byActor[k],
          severity: FactoryFlagSeverity.SUSPICIOUS,
        });
      }
    }
    return null;
  }
}

// Status overrides by user — frequent overrides are a signal for management.
class FactoryRepeatedOverrideWatcher extends IFactoryIntegrityWatcher {
  constructor(opts) {
    super();
    opts = opts || {};
    this.windowMs       = Number(opts.windowMs) || (7 * 24 * 60 * 60 * 1000);
    this.thresholdCount = Number(opts.thresholdCount) || 5;
  }
  watchFor(category) { return category === FactoryAuditCategory.MANAGER_OVERRIDE; }
  onSuspiciousPattern(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    var byActor = {};
    var cutoff = Date.now() - this.windowMs;
    entries.forEach(function(e){
      if (e.action !== FactoryActionType.OVERRIDE) return;
      if (new Date(e.serverTimestamp).getTime() < cutoff) return;
      var actorId = e.actor && (e.actor.userId || e.actor) || 'unknown';
      byActor[actorId] = byActor[actorId] || [];
      byActor[actorId].push(e);
    });
    for (var actorId in byActor) {
      if (byActor[actorId].length >= this.thresholdCount) {
        return new FactoryIntegrityFlag({
          suspectedActor: byActor[actorId][0].actor,
          pattern: 'repeated manager overrides by single actor',
          relevantEntries: byActor[actorId],
          severity: FactoryFlagSeverity.CONCERNING,
        });
      }
    }
    return null;
  }
}

// Edits to job-critical data outside normal hours.
class FactoryOffHoursModificationWatcher extends IFactoryIntegrityWatcher {
  constructor(opts) {
    super();
    opts = opts || {};
    this.dayStartHour = (typeof opts.dayStartHour === 'number') ? opts.dayStartHour : 6;
    this.dayEndHour   = (typeof opts.dayEndHour   === 'number') ? opts.dayEndHour   : 18;
  }
  watchFor(category) {
    return category === FactoryAuditCategory.DISPATCH_ACTION
        || category === FactoryAuditCategory.STATUS_TRANSITION
        || category === FactoryAuditCategory.DATA_CORRECTION;
  }
  onSuspiciousPattern(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    var dayStart = this.dayStartHour, dayEnd = this.dayEndHour;
    var offHours = entries.filter(function(e){
      var d = new Date(e.serverTimestamp);
      var h = d.getHours();
      return h < dayStart || h >= dayEnd;
    });
    if (offHours.length === 0) return null;
    return new FactoryIntegrityFlag({
      suspectedActor: offHours[0].actor,
      pattern: 'off-hours modifications on dispatch/status/data-correction',
      relevantEntries: offHours,
      severity: FactoryFlagSeverity.SUSPICIOUS,
    });
  }
}

// Walkthrough §8.3 specific: values modified, then reverted to their original
// state. Rarely innocent.
class FactoryDataChangedThenChangedBackWatcher extends IFactoryIntegrityWatcher {
  constructor(opts) {
    super();
    opts = opts || {};
    this.windowMs = Number(opts.windowMs) || (4 * 60 * 60 * 1000);  // 4h
  }
  watchFor(category) { return category === FactoryAuditCategory.ENTITY_MODIFIED; }
  onSuspiciousPattern(entries) {
    if (!Array.isArray(entries) || entries.length < 2) return null;
    // Group by entity. For each, scan for an A → B → A pattern in the window.
    var groups = {};
    entries.forEach(function(e){
      if (e.action !== FactoryActionType.UPDATE) return;
      var key = e.entityType + '|' + e.entityId;
      groups[key] = groups[key] || [];
      groups[key].push(e);
    });
    for (var k in groups) {
      var arr = groups[k].sort(function(a,b){
        return new Date(a.serverTimestamp) - new Date(b.serverTimestamp);
      });
      for (var i = 0; i < arr.length - 1; i++) {
        var firstAfter = arr[i].afterState;
        for (var j = i + 1; j < arr.length; j++) {
          var dt = new Date(arr[j].serverTimestamp).getTime() - new Date(arr[i].serverTimestamp).getTime();
          if (dt > this.windowMs) break;
          // Do they revert TO the original BEFORE state of i?
          if (JSON.stringify(arr[j].afterState) === JSON.stringify(arr[i].beforeState)) {
            return new FactoryIntegrityFlag({
              suspectedActor: arr[j].actor,
              pattern: 'data changed then reverted within ' + Math.round(this.windowMs / 60000) + 'min window',
              relevantEntries: [arr[i], arr[j]],
              severity: FactoryFlagSeverity.CONCERNING,
            });
          }
        }
      }
    }
    return null;
  }
}

// ── IAuditAccessPolicy (interface) ───────────────────────────────────────────

class IFactoryAuditAccessPolicy {
  canView(user, entry)         { throw new Error('IFactoryAuditAccessPolicy.canView: not implemented'); }
  canExport(user)              { throw new Error('IFactoryAuditAccessPolicy.canExport: not implemented'); }
  redactionFor(user, entry)    { throw new Error('IFactoryAuditAccessPolicy.redactionFor: not implemented'); }
}
