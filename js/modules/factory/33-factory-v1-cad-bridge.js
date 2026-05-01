// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/33-factory-v1-cad-bridge.js
// Bridge: CAD save → Factory CRM v1.5 entity graph (FactoryJob + FactoryFrame[]).
//
// PURPOSE
//   When a CAD save lands and the CRM persists cadFinalData / cadSurveyData /
//   cadData on a job, this bridge automatically constructs the equivalent
//   v1.5 entity graph (FactoryJob + FactoryFrame instances) using the
//   `FactoryFrame.fromCadFrame()` helper. The graph is stored in a per-jobId
//   registry that downstream code (or tests, or future renderers) can read.
//
//   This is non-invasive: it does NOT modify 04-cad-integration.js. It hooks
//   in via the global `subscribe(fn)` mechanism from 05-state-auth-rbac.js,
//   which fires on every setState — including the one in 04-cad-integration.js
//   that lands the CAD payload.
//
// PROVIDES
//   factoryV1JobRegistry        Map<jobId, { job: FactoryJob, frames: FactoryFrame[], lastBuiltFrom: 'final'|'survey'|'design' }>
//   getFactoryV1Job(jobId)      → { job, frames, lastBuiltFrom } | null
//   getFactoryV1Frames(jobId)   → FactoryFrame[] (or [])
//   buildFactoryV1FromJob(job)  Pure helper — given a CRM job (with cad*Data),
//                               returns a freshly-built {job, frames, lastBuiltFrom}.
//                               Useful from console / tests / one-off rebuilds.
//   rebuildAllFactoryV1()       Idempotent — sweeps every job in _state.jobs
//                               and rebuilds the registry from scratch.
//
// LOAD ORDER
//   Must load AFTER 27-factory-v1-jobs-frames.js (uses FactoryJob/FactoryFrame),
//   AFTER 28-factory-v1-people.js (uses FactoryCustomerRef/FactoryAddress).
//   Subscribes lazily — no error if 05-state-auth-rbac.js isn't loaded yet.
// ═════════════════════════════════════════════════════════════════════════════

// ── Registry ─────────────────────────────────────────────────────────────────

var factoryV1JobRegistry = new Map();   // jobId → { job, frames, lastBuiltFrom }

function getFactoryV1Job(jobId) {
  return factoryV1JobRegistry.get(jobId) || null;
}

function getFactoryV1Frames(jobId) {
  var entry = factoryV1JobRegistry.get(jobId);
  return entry ? entry.frames : [];
}

// ── Pure builder ─────────────────────────────────────────────────────────────
// Given a CRM job (the legacy shape — `_state.jobs[i]`), construct the v1.5
// entity graph. Reads cadFinalData → cadSurveyData → cadData in priority
// order (matches the audit §5.1 "trust CAD per-frame" rule). Returns null if
// the job has no CAD data at all.

function buildFactoryV1FromJob(crmJob) {
  if (!crmJob || typeof FactoryJob !== 'function' || typeof FactoryFrame !== 'function') return null;

  // Pick the freshest CAD snapshot. Mirrors 04-cad-integration.js's order.
  var snapshot = null, lastBuiltFrom = null;
  if (crmJob.cadFinalData && Array.isArray(crmJob.cadFinalData.projectItems)) {
    snapshot = crmJob.cadFinalData; lastBuiltFrom = 'final';
  } else if (crmJob.cadSurveyData && Array.isArray(crmJob.cadSurveyData.projectItems)) {
    snapshot = crmJob.cadSurveyData; lastBuiltFrom = 'survey';
  } else if (crmJob.cadData && Array.isArray(crmJob.cadData.projectItems)) {
    snapshot = crmJob.cadData; lastBuiltFrom = 'design';
  }
  if (!snapshot) return null;

  // Build CustomerRef from the CRM contact (best-effort).
  var customerRef = null;
  if (typeof FactoryCustomerRef === 'function' && typeof getState === 'function') {
    var contacts = (getState().contacts || []);
    var contact  = contacts.find(function(c){ return c.id === crmJob.contactId; });
    if (contact) {
      var addr = (typeof FactoryAddress === 'function')
        ? new FactoryAddress({
            line1: crmJob.street || '',
            suburb: crmJob.suburb || '',
            state: crmJob.state || '',
            postcode: crmJob.postcode || '',
          })
        : null;
      customerRef = new FactoryCustomerRef({
        customerId: contact.id,
        displayName: ((contact.fn || '') + ' ' + (contact.ln || '')).trim(),
        state: crmJob.branch || crmJob.state || '',
        deliveryAddress: addr,
      });
    }
  }

  var fJob = new FactoryJob({
    jobId: crmJob.id,
    klaesJobNumber: crmJob.jobNumber || null,
    customer: customerRef,
    promisedDate: crmJob.installDate || null,
    currentRunDate: crmJob.installDate || null,
    totalValue: Number(crmJob.val) || 0,
    arrivedAt: crmJob.finalSignedAt || crmJob.checkMeasureCompletedAt || crmJob.createdAt || new Date().toISOString(),
  });

  var frames = snapshot.projectItems.map(function(cadFrame, i){
    return FactoryFrame.fromCadFrame(cadFrame, fJob, i + 1);
  });
  fJob.frames = frames;

  return { job: fJob, frames: frames, lastBuiltFrom: lastBuiltFrom };
}

// ── Idempotent registry rebuild ──────────────────────────────────────────────

function rebuildAllFactoryV1() {
  if (typeof getState !== 'function') return 0;
  var jobs = getState().jobs || [];
  var built = 0;
  jobs.forEach(function(j){
    var entry = buildFactoryV1FromJob(j);
    if (entry) {
      factoryV1JobRegistry.set(j.id, entry);
      built++;
    }
  });
  return built;
}

// ── Subscriber: rebuild on cad* changes ──────────────────────────────────────
// Fingerprint-and-skip: we only rebuild a job's entry if its CAD-snapshot
// fingerprint has changed since last build. Avoids thrashing on every setState.

(function attachBridgeSubscriber(){
  if (typeof subscribe !== 'function' || typeof getState !== 'function') return;

  var fingerprints = new Map();   // jobId → fingerprint string

  function fingerprintFor(crmJob) {
    if (!crmJob) return null;
    var snap = crmJob.cadFinalData || crmJob.cadSurveyData || crmJob.cadData;
    if (!snap) return null;
    // Cheap fingerprint: count + the per-frame productionMinutes sum (which
    // changes any time CAD recomputes). Avoids a full JSON.stringify hash.
    var items = snap.projectItems || [];
    var prodSum = items.reduce(function(s,f){ return s + (Number(f.productionMinutes) || 0); }, 0);
    return items.length + ':' + prodSum + ':' + (snap.savedAt || '');
  }

  subscribe(function(state){
    var jobs = (state && state.jobs) || [];
    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      var fp = fingerprintFor(j);
      if (!fp) continue;
      if (fingerprints.get(j.id) === fp) continue;   // unchanged since last build

      var entry = buildFactoryV1FromJob(j);
      if (entry) {
        factoryV1JobRegistry.set(j.id, entry);
        fingerprints.set(j.id, fp);
      }
    }
  });

  // Initial sweep on first load. setTimeout 0 lets the boot sequence finish
  // populating _state.jobs before we look at it.
  if (typeof setTimeout === 'function') {
    setTimeout(function(){
      try { rebuildAllFactoryV1(); } catch (e) { console.warn('[FactoryV1Bridge] initial sweep failed:', e); }
    }, 0);
  }
})();
