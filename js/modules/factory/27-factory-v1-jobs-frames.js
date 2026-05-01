// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/27-factory-v1-jobs-frames.js
// Factory CRM Base Class Diagram v1.5 §1 — Jobs and Frames
// Source: factory-crm-base-class-diagram-v1-5-scope-corrected.md (Phase 1)
//
// The atomic unit the factory delivers is the FRAME — a physical window or
// door produced and shipped. Frames belong to JOBS that have already been
// signed off in Jobs CRM and routed to Factory CRM. Jobs progress through
// factory-internal status codes; frames progress through their own lifecycle
// in parallel.
//
// Phase 1 SCOPE:
//   - Job lifecycle starts at AWAITING_REVIEW (when sign-off lands) and ends
//     at DISPATCHED. Pre-factory statuses (DRAFT, QUOTE_*, DESIGN_*) live in
//     Jobs CRM; post-factory statuses (INSTALLED, COMPLETED) live there too.
//   - JobRevision is append-only; RevisionType.QUOTE_CHANGE deliberately
//     omitted (Jobs CRM concern). VARIATION is included (Factory CRM concern,
//     manual §13).
//   - FrameSpecification.specialFlags is a generic string list rather than a
//     typed catalogue; the catalogue lives in SpartanCAD.
//
// Phase 2 will add the manual's Klaes-style codes (c.2, d.1, d.2, d.3, e.),
// proposedRunDate / proposedDispatchDate, JobSuffix (O/S), PaymentMilestone
// gating, etc.
//
// Globals exposed (additive — verified collision-free against modules/):
//   FactoryJobType (enum)
//   FactoryJobStatus (enum)
//   FactoryRevisionType (enum)
//   FactoryFrameStatus (enum)
//   FactoryJob (class)
//   FactoryJobRevision (class)
//   FactoryFrame (class)
//   FactoryFrameSpecification (class)
//   FactoryDimensions (class)
//   FactoryGlassSpec (class)
//   FactoryHardwareSpec (class)
//
// Names are `Factory*` prefixed because the bare names (Job, Frame) collide
// with prevalent CRM data shapes (_state.jobs, frames in CAD payloads).
// ═════════════════════════════════════════════════════════════════════════════

// ── Enums (frozen, single source of truth) ──────────────────────────────────

var FactoryJobType = Object.freeze({
  NEW_BUILD:           'NEW_BUILD',
  SERVICE_REMAKE:      'SERVICE_REMAKE',
  SERVICE_PARTS_ONLY:  'SERVICE_PARTS_ONLY',
  WARRANTY:            'WARRANTY',
});

var FactoryJobStatus = Object.freeze({
  AWAITING_REVIEW:     'AWAITING_REVIEW',     // Sign-off has landed; PM hasn't reviewed yet
  ON_HOLD:             'ON_HOLD',             // PM held with a reason
  BOUNCED_TO_SALES:    'BOUNCED_TO_SALES',    // Final Sign-Off detail looks wrong
  AWAITING_MATERIALS:  'AWAITING_MATERIALS',  // Released to production; materials not yet here
  MATERIAL_AT_FACTORY: 'MATERIAL_AT_FACTORY', // Materials received and verified
  IN_PRODUCTION:       'IN_PRODUCTION',       // Frames are at workstations
  QC_CHECK:            'QC_CHECK',            // Frames in QC
  READY_DISPATCH:      'READY_DISPATCH',      // QC passed; not yet bayed
  IN_BAY:              'IN_BAY',              // Bayed and waiting for pickup
  DISPATCHED:          'DISPATCHED',          // Picked up by install crew
  CANCELLED:           'CANCELLED',
});

var FactoryRevisionType = Object.freeze({
  DESIGN_CHANGE:    'DESIGN_CHANGE',     // CAD design change flowing in
  SCHEDULE_CHANGE:  'SCHEDULE_CHANGE',   // Promised/run date shifts
  SCOPE_CHANGE:     'SCOPE_CHANGE',
  VARIATION:        'VARIATION',         // Mid-production customer change (manual §13)
  CANCELLATION:     'CANCELLATION',
  // NB: QUOTE_CHANGE deliberately omitted — quotes are Jobs CRM scope.
});

var FactoryFrameStatus = Object.freeze({
  SPECIFIED:           'SPECIFIED',
  IN_QUEUE:            'IN_QUEUE',
  IN_PRODUCTION:       'IN_PRODUCTION',
  IN_QC:               'IN_QC',
  IN_REWORK:           'IN_REWORK',
  READY_FOR_DISPATCH:  'READY_FOR_DISPATCH',
  DISPATCHED:          'DISPATCHED',
});

// ── Value objects ────────────────────────────────────────────────────────────

class FactoryDimensions {
  constructor(opts) {
    opts = opts || {};
    this.widthMm   = Number(opts.widthMm)   || 0;
    this.heightMm  = Number(opts.heightMm)  || 0;
    this.depthMm   = Number(opts.depthMm)   || 0;   // optional — frame depth
  }
  areaSqm()  { return (this.widthMm * this.heightMm) / 1_000_000; }
  toString() { return this.widthMm + ' × ' + this.heightMm + 'mm'; }
}

class FactoryGlassSpec {
  constructor(opts) {
    opts = opts || {};
    this.spec        = opts.spec || 'dgu_4_12_4';   // CAD glass spec string
    this.widthMm     = Number(opts.widthMm)  || 0;
    this.heightMm    = Number(opts.heightMm) || 0;
    this.deliverTo   = opts.deliverTo || 'site';    // 'site' | 'factory' (manual §4.8 default 'site')
    this.frosted     = !!opts.frosted;
  }
}

class FactoryHardwareSpec {
  constructor(opts) {
    opts = opts || {};
    this.bundleId    = opts.bundleId || null;       // refs HardwareBundle (Phase 2)
    this.colour      = opts.colour || 'white';
    this.handleHeightMm = Number(opts.handleHeightMm) || 1075;  // Manual Ch. 2 §1.1
    this.parts       = Array.isArray(opts.parts) ? opts.parts.slice() : [];
  }
}

class FactoryFrameSpecification {
  constructor(opts) {
    opts = opts || {};
    this.dimensions      = opts.dimensions instanceof FactoryDimensions
      ? opts.dimensions
      : new FactoryDimensions(opts.dimensions || {});
    this.profileSystem   = opts.profileSystem || 'ideal_4000';
    this.exteriorColour  = opts.exteriorColour || 'white_body';
    this.interiorColour  = opts.interiorColour || 'white_body';
    this.glass           = opts.glass instanceof FactoryGlassSpec
      ? opts.glass
      : new FactoryGlassSpec(opts.glass || {});
    this.hardware        = opts.hardware instanceof FactoryHardwareSpec
      ? opts.hardware
      : new FactoryHardwareSpec(opts.hardware || {});
    // specialFlags: generic string list (e.g. ["dog_door", "outsourced_manufacturing"]).
    // The typed catalogue lives in SpartanCAD; Factory CRM just reads flags.
    this.specialFlags    = Array.isArray(opts.specialFlags) ? opts.specialFlags.slice() : [];
  }
}

// ── Job & JobRevision ────────────────────────────────────────────────────────

class FactoryJob {
  constructor(opts) {
    opts = opts || {};
    this.jobId            = opts.jobId || ('fj_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.klaesJobNumber   = opts.klaesJobNumber || null;     // e.g. 'VIC-1234O'
    this.type             = opts.type   || FactoryJobType.NEW_BUILD;
    this.status           = opts.status || FactoryJobStatus.AWAITING_REVIEW;
    this.customer         = opts.customer || null;           // CustomerRef from §2
    this.promisedDate     = opts.promisedDate || null;       // ISO date string
    this.currentRunDate   = opts.currentRunDate || null;     // live "real" run date (§4.5 finding)
    this.totalValue       = Number(opts.totalValue) || 0;
    this.arrivedAt        = opts.arrivedAt || new Date().toISOString();
    this.signedOffBy      = opts.signedOffBy || null;        // User from §2

    // Aggregations populated by relations
    this.frames           = Array.isArray(opts.frames)    ? opts.frames.slice()    : [];
    this.revisions        = Array.isArray(opts.revisions) ? opts.revisions.slice() : [];
  }

  // Revisions are append-only.
  appendRevision(revision) {
    if (!(revision instanceof FactoryJobRevision)) {
      throw new Error('FactoryJob.appendRevision: expected FactoryJobRevision instance');
    }
    revision.revisionNumber = this.revisions.length + 1;
    this.revisions.push(revision);
    return revision;
  }

  // Status transitions write audit trail (see 32-factory-v1-audit.js).
  // Validation is intentionally minimal in v1.5; Phase 2 adds the manual's
  // gate logic (45% paid before MATERIAL_AT_FACTORY → IN_PRODUCTION, etc.).
  transitionTo(newStatus, opts) {
    var valid = Object.values(FactoryJobStatus);
    if (valid.indexOf(newStatus) < 0) {
      throw new Error('FactoryJob.transitionTo: invalid status ' + newStatus);
    }
    var prior = this.status;
    this.status = newStatus;
    return { from: prior, to: newStatus, by: (opts && opts.by) || null, at: new Date().toISOString() };
  }

  isAtFactory() {
    return this.status !== FactoryJobStatus.DISPATCHED
        && this.status !== FactoryJobStatus.CANCELLED
        && this.status !== FactoryJobStatus.BOUNCED_TO_SALES;
  }
}

class FactoryJobRevision {
  constructor(opts) {
    opts = opts || {};
    this.revisionNumber  = Number(opts.revisionNumber) || 0;  // set by FactoryJob.appendRevision
    this.createdAt       = opts.createdAt || new Date().toISOString();
    this.createdBy       = opts.createdBy || null;
    this.changeReason    = opts.changeReason || '';
    this.type            = opts.type     || FactoryRevisionType.DESIGN_CHANGE;
    this.snapshot        = opts.snapshot || null;             // opaque snapshot of pre-revision state
  }
}

// ── Frame ────────────────────────────────────────────────────────────────────

class FactoryFrame {
  constructor(opts) {
    opts = opts || {};
    this.frameId         = opts.frameId || ('ff_' + Date.now() + '_' + Math.floor(Math.random() * 1e6));
    this.job             = opts.job || null;                     // FactoryJob
    this.frameNumber     = Number(opts.frameNumber) || 0;
    this.description     = opts.description || '';
    this.status          = opts.status || FactoryFrameStatus.SPECIFIED;
    this.spec            = opts.spec instanceof FactoryFrameSpecification
      ? opts.spec
      : new FactoryFrameSpecification(opts.spec || {});
    this.currentStation  = opts.currentStation || null;          // Workstation from §4 (nullable)
    this.currentLocation = opts.currentLocation || null;         // Location from §3
  }

  transitionTo(newStatus) {
    var valid = Object.values(FactoryFrameStatus);
    if (valid.indexOf(newStatus) < 0) {
      throw new Error('FactoryFrame.transitionTo: invalid status ' + newStatus);
    }
    var prior = this.status;
    this.status = newStatus;
    return { from: prior, to: newStatus, at: new Date().toISOString() };
  }

  // Convenience: build a FactoryFrame from a CAD payload's `projectItems[i]`.
  // Useful when bridging between the existing CAD-integration save handler
  // and the v1.5 entity model.
  static fromCadFrame(cadFrame, job, frameNumber) {
    return new FactoryFrame({
      job: job || null,
      frameNumber: frameNumber || 0,
      description: cadFrame.name || '',
      spec: new FactoryFrameSpecification({
        dimensions: new FactoryDimensions({
          widthMm:  cadFrame.width  || cadFrame.widthMm  || 0,
          heightMm: cadFrame.height || cadFrame.heightMm || 0,
        }),
        profileSystem: cadFrame.profileSystem || 'ideal_4000',
        exteriorColour: cadFrame.colour    || 'white_body',
        interiorColour: cadFrame.colourInt || cadFrame.colour || 'white_body',
        glass: new FactoryGlassSpec({
          spec: cadFrame.glassSpec || 'dgu_4_12_4',
          deliverTo: 'site',
        }),
        hardware: new FactoryHardwareSpec({
          colour: cadFrame.hardwareColour || 'white',
        }),
        specialFlags: [
          cadFrame.installationType === 'supply_only' ? 'supply_only' : null,
          cadFrame.frosted ? 'frosted_glass' : null,
        ].filter(Boolean),
      }),
    });
  }
}
