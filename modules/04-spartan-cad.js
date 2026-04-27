// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 04-spartan-cad.js
// CAD ↔ CRM iframe bridge. Implements the postMessage protocol defined in
// SPARTAN_CAD_CRM_INTEGRATION_CONTRACT.md (v3.1).
//
// Owner:    Phoenix (per FILE_OWNERSHIP §1 — SpartanCAD module).
// Reviewer: —  (Phoenix-owned shared infrastructure).
// Module:   Shared / A.
//
// Architecture note: contract v3.0 assumed the CAD was bundled into the CRM
// as a same-origin base64 blob (SPARTAN_CAD_B64). v3.1 supersedes that — the
// CAD is now externally hosted at CAD_URL below, so the iframe is
// **cross-origin** and origin checks on postMessage are required (not just
// "good practice"). All listeners and senders here enforce the origin check.
// ═════════════════════════════════════════════════════════════════════════════

// ── 1. Config ───────────────────────────────────────────────────────────────
// CAD URL is held here as a single config constant. Change here only when the
// CAD deployment moves. The trailing slash is omitted from CAD_ORIGIN because
// event.origin never has a trailing slash, and that's what we compare against.
var CAD_URL    = 'https://spartan-cad.vercel.app/';
var CAD_ORIGIN = 'https://spartan-cad.vercel.app';

// Protocol identifiers — keep these in lock-step with contract §3.
var CAD_MSG_INIT          = 'spartan-cad-init';
var CAD_MSG_READY         = 'spartan-cad-ready';
var CAD_MSG_REQUEST_SAVE  = 'spartan-cad-request-save';
var CAD_MSG_SAVE          = 'spartan-cad-save';
var CAD_MSG_SAVE_ERROR    = 'spartan-cad-save-error';
var CAD_MSG_CLOSE         = 'spartan-cad-close';

// Init retry policy per contract §3.1: fire init ~1.5s after iframe load,
// retry up to 15× at 500ms intervals until CAD responds with `ready`.
var CAD_INIT_FIRST_DELAY_MS = 1500;
var CAD_INIT_RETRY_DELAY_MS = 500;
var CAD_INIT_MAX_RETRIES    = 15;

// ── 2. Module state (single open overlay at a time) ─────────────────────────
// We deliberately do NOT route this through getState() / setState(). The
// overlay is transient UI; routing it through the global state would trigger
// renderPage() on every iframe message, which would tear down the iframe DOM
// node mid-conversation and break the postMessage channel.
var _cadSession = null; // null when closed; { entityType, entityId, mode, ready, retries, retryTimer, iframe, overlay } when open

// ── 3. Public entry point ───────────────────────────────────────────────────
// openCadDesigner(entityType, entityId, mode)
//   entityType: 'lead' | 'deal' | 'job'
//   entityId:   string (le_*, dl_*/d_*, job_*)
//   mode:       'design' | 'survey' | 'final'
//
// Mode rules (contract §4):
//   - design: leads, deals, or jobs (manager-edit). All controls active.
//   - survey: jobs only. Surveyor records measured W×H per frame.
//   - final:  jobs only. Sales Manager prepares the e-signable design;
//             dimensions are locked from CM.
function openCadDesigner(entityType, entityId, mode) {
  if (_cadSession) {
    if (typeof addToast === 'function') addToast('CAD is already open', 'warning');
    return;
  }
  mode = mode || 'design';

  var entity = _findEntity(entityType, entityId);
  if (!entity) {
    if (typeof addToast === 'function') addToast('Entity not found — cannot open CAD', 'error');
    return;
  }

  // Mode validity gates — survey/final only make sense on jobs.
  if ((mode === 'survey' || mode === 'final') && entityType !== 'job') {
    if (typeof addToast === 'function') addToast('Survey/Final mode is only valid for jobs', 'error');
    return;
  }

  _cadSession = {
    entityType: entityType,
    entityId:   entityId,
    mode:       mode,
    ready:      false,
    retries:    0,
    retryTimer: null,
    iframe:     null,
    overlay:    null,
  };

  _renderCadOverlay();
}
// Exposed globally so HTML onclick="openCadDesigner(...)" handlers in
// 22-jobs-page.js / 16-factory-crm.js can find it without an explicit window.
window.openCadDesigner = openCadDesigner;

// ── 4. Overlay DOM ──────────────────────────────────────────────────────────
function _renderCadOverlay() {
  var s = _cadSession;
  if (!s) return;

  var modeBadge = ({design:'Design Mode', survey:'Check Measure', final:'Final Design'})[s.mode] || s.mode;
  var entityLabel = _entityLabel(s.entityType, s.entityId);

  var overlay = document.createElement('div');
  overlay.id = 'cadOverlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:300;' +
    'background:#1a1a1a;display:flex;flex-direction:column;font-family:DM Sans,sans-serif';

  // Toolbar — branded, with mode badge, entity label, Save, and Close.
  var toolbar = document.createElement('div');
  toolbar.style.cssText =
    'display:flex;align-items:center;gap:12px;padding:10px 18px;' +
    'background:#1a1a1a;border-bottom:1px solid #2a2a2a;color:#fff;flex:0 0 auto';
  toolbar.innerHTML =
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:14px;letter-spacing:0.5px;color:#fff">SPARTAN CAD</div>' +
    '<div style="font-size:11px;padding:3px 10px;background:#c41230;border-radius:12px;color:#fff;font-weight:600">' + _esc(modeBadge) + '</div>' +
    '<div style="font-size:12px;color:#9ca3af;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(entityLabel) + '</div>' +
    '<button id="cadSaveBtn" style="padding:7px 18px;background:#c41230;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;font-family:inherit">Save to ' + ({lead:'Lead',deal:'Deal',job:'Job'})[s.entityType] + '</button>' +
    '<button id="cadCloseBtn" style="padding:7px 14px;background:transparent;color:#9ca3af;border:1px solid #3a3a3a;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">Close</button>';

  // Iframe — sandbox is intentionally permissive because CAD needs storage
  // (its own localStorage drafts), scripts, popups (PDF preview), and forms
  // (DocuSign in v3+). Same-origin is NOT in the sandbox set because the CAD
  // is cross-origin to the CRM in v3.1+.
  var iframe = document.createElement('iframe');
  iframe.id = 'cadIframe';
  iframe.src = CAD_URL;
  iframe.style.cssText = 'flex:1 1 auto;width:100%;border:none;background:#fff';
  iframe.setAttribute('title', 'Spartan CAD');
  iframe.setAttribute('allow', 'clipboard-write; clipboard-read');

  overlay.appendChild(toolbar);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  // Wire button handlers AFTER the elements are in the DOM. Using direct
  // refs (not onclick=...) avoids string-quoting issues and keeps the handler
  // closure able to reach _cadSession.
  document.getElementById('cadSaveBtn').addEventListener('click', _requestSave);
  document.getElementById('cadCloseBtn').addEventListener('click', _closeCadOverlay);

  s.iframe = iframe;
  s.overlay = overlay;

  // Schedule first init send. The CAD's React tree typically hydrates within
  // ~800ms; we leave 1500ms of slack to handle slow networks / cold caches.
  iframe.addEventListener('load', function() {
    setTimeout(_sendInit, CAD_INIT_FIRST_DELAY_MS);
  });
}

function _closeCadOverlay() {
  var s = _cadSession;
  if (!s) return;
  if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; }
  if (s.overlay && s.overlay.parentNode) s.overlay.parentNode.removeChild(s.overlay);
  _cadSession = null;
}

// ── 5. Init payload + retry loop ────────────────────────────────────────────
function _sendInit() {
  var s = _cadSession;
  if (!s || s.ready || !s.iframe || !s.iframe.contentWindow) return;

  var payload = _buildInitPayload(s.entityType, s.entityId, s.mode);
  if (!payload) {
    if (typeof addToast === 'function') addToast('Failed to build CAD init payload', 'error');
    _closeCadOverlay();
    return;
  }

  try {
    s.iframe.contentWindow.postMessage(payload, CAD_ORIGIN);
  } catch (e) {
    console.warn('[Spartan CAD] postMessage failed:', e);
  }

  // Retry until CAD responds with `ready`.
  if (s.retries < CAD_INIT_MAX_RETRIES) {
    s.retries += 1;
    s.retryTimer = setTimeout(_sendInit, CAD_INIT_RETRY_DELAY_MS);
  } else {
    // Gave up — surface clearly. Common causes: CAD URL down, CSP blocking
    // the iframe, or CAD failing silently in its own JS before installing
    // its message listener. The console log helps diagnose without forcing
    // the user to dig.
    console.error('[Spartan CAD] No `ready` response after ' + CAD_INIT_MAX_RETRIES + ' retries. Check CAD_URL: ' + CAD_URL);
    if (typeof addToast === 'function') addToast('CAD did not respond — check the connection and try again', 'error');
  }
}

function _buildInitPayload(entityType, entityId, mode) {
  var entity = _findEntity(entityType, entityId);
  if (!entity) return null;

  var customer = _entityCustomer(entityType, entity);
  var projectName =
    (entityType === 'lead' && (entity.fn || entity.ln) && (entity.suburb || ''))
      ? ((entity.fn || '') + ' ' + (entity.ln || '')).trim() + ' — ' + (entity.suburb || '')
      : (entity.title || (entity.fn ? (entity.fn + ' ' + (entity.ln || '')) : 'Untitled Project'));

  var jobNumber = (entityType === 'job') ? (entity.jobNumber || null) : null;
  var branch    = entity.branch || 'VIC';

  // Quotes: leads + deals carry their own quotes[] array. Jobs don't —
  // a job is fixed to its source quote and has no multi-quote model. We
  // surface a single synthesised "quote" entry for jobs so the CAD can
  // still hydrate from designData consistently.
  var quotes = [];
  var activeQuoteId = null;
  if (entityType === 'lead' || entityType === 'deal') {
    quotes = (entity.quotes || []).map(function(q) {
      return {
        id:         q.id,
        label:      q.label || ('Quote ' + (q.id || '')),
        savedAt:    q.savedAt || null,
        totalPrice: q.totalPrice || 0,
        frameCount: (q.projectItems || []).length,
        // The full projectItems[] is needed so CAD can hydrate the canvas
        // when the user picks a quote from the dropdown. Contract §4.1
        // step 3 explicitly calls this out.
        projectItems: q.projectItems || [],
      };
    });
    activeQuoteId = entity.activeQuoteId || (quotes[0] && quotes[0].id) || null;
  }

  // designData (legacy single-quote fallback) — populated for jobs in
  // design mode (manager-edit) so CAD has somewhere to hydrate from. For
  // leads/deals we deliberately leave this null since quotes[] is preferred.
  var designData = null;
  if (entityType === 'job') {
    // Step 5 §6 mirror order: prefer cadFinalData → cadSurveyData → cadData.
    // For 'design' mode we want the original / latest editable design so
    // we pull cadData. 'survey' and 'final' use the explicit branches below.
    designData = entity.cadData || null;
  }

  // surveyData — only present for survey/final modes. The CAD reads
  // surveyData.surveyMeasurements[] and applies the locked dimensions.
  var surveyData = null;
  if (entityType === 'job' && (mode === 'survey' || mode === 'final')) {
    if (entity.cadSurveyData) surveyData = entity.cadSurveyData;
  }

  // lockedFields (contract §4.4) — final mode locks measured dims.
  var lockedFields = (mode === 'final')
    ? ['widthMm', 'heightMm', 'surveyMeasurements']
    : [];

  return {
    type:          CAD_MSG_INIT,
    mode:          mode,
    entityType:    entityType,
    entityId:      entityId,
    customer:      customer,
    projectName:   projectName,
    jobNumber:     jobNumber,
    branch:        branch,
    quotes:        quotes,
    activeQuoteId: activeQuoteId,
    lockedFields:  lockedFields,
    designData:    designData,
    surveyData:    surveyData,
  };
}

// ── 6. Message listener ─────────────────────────────────────────────────────
// Single document-level listener. Origin-check is the first line of defence —
// any message NOT from CAD_ORIGIN is dropped. We don't error on it; the
// browser fires postMessage events for many other channels (extensions,
// devtools, embedded analytics) and we don't want to spam the console.
function _onCadMessage(event) {
  if (event.origin !== CAD_ORIGIN) return;
  if (!_cadSession) return;
  var msg = event.data;
  if (!msg || typeof msg !== 'object' || !msg.type) return;

  switch (msg.type) {
    case CAD_MSG_READY:
      _onReady(msg);
      break;
    case CAD_MSG_SAVE:
      _onSave(msg);
      break;
    case CAD_MSG_SAVE_ERROR:
      _onSaveError(msg);
      break;
    case CAD_MSG_CLOSE:
      _closeCadOverlay();
      break;
    default:
      // Unknown type — ignore. CAD versions newer than this CRM may emit
      // additional message types; ignoring them keeps us forward-compatible.
      break;
  }
}
window.addEventListener('message', _onCadMessage);

function _onReady(msg) {
  var s = _cadSession;
  if (!s) return;
  s.ready = true;
  if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; }
  console.log('[Spartan CAD] Ready — version', msg && msg.version || '(unknown)');
}

function _requestSave() {
  var s = _cadSession;
  if (!s || !s.iframe || !s.iframe.contentWindow) return;
  if (!s.ready) {
    if (typeof addToast === 'function') addToast('CAD is still loading — try again in a moment', 'warning');
    return;
  }
  try {
    s.iframe.contentWindow.postMessage({ type: CAD_MSG_REQUEST_SAVE }, CAD_ORIGIN);
  } catch (e) {
    console.warn('[Spartan CAD] request-save postMessage failed:', e);
  }
}

function _onSave(msg) {
  var s = _cadSession;
  if (!s) return;

  try {
    _persistCadSave(msg, s.entityType, s.entityId, s.mode);
    if (typeof addToast === 'function') {
      var label = ({design:'Design saved', survey:'Check Measure saved', final:'Final design saved'})[s.mode] || 'Saved';
      addToast(label, 'success');
    }
    _closeCadOverlay();
  } catch (e) {
    console.error('[Spartan CAD] Persist failed:', e);
    if (typeof addToast === 'function') addToast('Save failed: ' + (e && e.message ? e.message : 'unknown error'), 'error');
    // Don't close — let the user retry.
  }
}

function _onSaveError(msg) {
  var reason = (msg && msg.reason) ? msg.reason : 'CAD reported a save error';
  if (typeof addToast === 'function') addToast(reason, 'error');
  // Per contract §3.5, CRM keeps the overlay open so the user can fix and retry.
}

// ── 7. Persistence ──────────────────────────────────────────────────────────
// Maps the CAD save payload onto the right entity field(s). The contract's
// `totals` block is the part the user explicitly cares about for capacity
// planning — we route it consistently in every mode so the install
// scheduler and factory production board both have authoritative numbers.
function _persistCadSave(msg, entityType, entityId, mode) {
  var st = getState();

  // Build the cadData blob (the design itself). Contract §3.4 — we keep
  // the same shape we've always used: projectItems + totalPrice + savedAt
  // + projectName + (NEW v3.1) totals.
  var cadBlob = {
    projectItems: msg.projectItems || [],
    totalPrice:   (typeof msg.totalPrice === 'number') ? msg.totalPrice : 0,
    savedAt:      msg.savedAt || new Date().toISOString(),
    quoteNumber:  msg.quoteNumber || '',
    projectName:  msg.projectName || '',
    totals:       msg.totals || null,
    cadVersion:   msg.cadVersion || null,
  };

  if (entityType === 'lead' || entityType === 'deal') {
    _persistToLeadOrDeal(st, entityType, entityId, msg, cadBlob);
    return;
  }

  if (entityType === 'job') {
    _persistToJob(st, entityId, mode, msg, cadBlob);
    return;
  }
}

function _persistToLeadOrDeal(st, entityType, entityId, msg, cadBlob) {
  var collKey = (entityType === 'lead') ? 'leads' : 'deals';
  var coll = st[collKey] || [];

  var updated = coll.map(function(e) {
    if (e.id !== entityId) return e;

    var quotes = Array.isArray(e.quotes) ? e.quotes.slice() : [];
    var quoteId = msg.quoteId;
    var newQuoteCreated = false;

    // Build the persisted quote record — includes totals so the won-quote
    // selection later can read install/production minutes without re-opening
    // CAD. Contract §11: never mutate other quotes' data.
    function buildQuote(idForQuote, label) {
      return {
        id:           idForQuote,
        label:        label,
        projectItems: cadBlob.projectItems,
        totalPrice:   cadBlob.totalPrice,
        frameCount:   cadBlob.projectItems.length,
        savedAt:      cadBlob.savedAt,
        quoteNumber:  cadBlob.quoteNumber,
        // (v3.1) Persist time totals on the quote so they survive
        // deal→job conversion regardless of which quote is won later.
        totals:       cadBlob.totals,
        notes:        '',
      };
    }

    if (quoteId && quotes.find(function(q){ return q.id === quoteId; })) {
      // Update existing quote in place.
      quotes = quotes.map(function(q) {
        return (q.id === quoteId) ? Object.assign({}, q, buildQuote(q.id, q.label || ('Quote ' + q.id))) : q;
      });
    } else {
      // New quote. Allocate a sequential id.
      var nextN = (quotes.reduce(function(max, q) {
        var m = (q.id || '').match(/^q_(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0)) + 1;
      var newId = 'q_' + nextN;
      quotes.push(buildQuote(newId, 'Quote ' + nextN));
      quoteId = newId;
      newQuoteCreated = true;
    }

    // Mirror cadData on the deal/lead — kept for back-compat with modules
    // that still read the legacy shape (per spec §3.1).
    var patched = Object.assign({}, e, {
      quotes:        quotes,
      activeQuoteId: quoteId,
      cadData:       cadBlob,
    });

    // Persist to Supabase. The serialiser handles the snake_case mapping.
    if (entityType === 'deal' && typeof dealToDb === 'function' && typeof dbUpsert === 'function') {
      dbUpsert('deals', dealToDb(patched));
    } else if (entityType === 'lead' && typeof leadToDb === 'function' && typeof dbUpsert === 'function') {
      dbUpsert('leads', leadToDb(patched));
    }

    if (newQuoteCreated) console.log('[Spartan CAD] New quote allocated:', quoteId);

    return patched;
  });

  var patch = {};
  patch[collKey] = updated;
  setState(patch);
}

function _persistToJob(st, jobId, mode, msg, cadBlob) {
  var jobs = st.jobs || [];
  var totals = msg.totals || {};

  var updated = jobs.map(function(j) {
    if (j.id !== jobId) return j;

    var nowIso = new Date().toISOString();
    var changes = {};

    // Mode-specific design blob targeting. Contract §4.
    if (mode === 'survey') {
      changes.cadSurveyData = cadBlob;
      // Survey measurements are a separate top-level array on the save
      // payload (contract §3.4). Persist as job.surveyMeasurements so
      // downstream code can read them without crawling cadSurveyData.
      if (Array.isArray(msg.surveyMeasurements)) {
        changes.surveyMeasurements = msg.surveyMeasurements;
      }
      // CM-completion stamp — set when survey save fires for the first time.
      if (!j.cmCompletedAt) changes.cmCompletedAt = nowIso;
    } else if (mode === 'final') {
      changes.cadFinalData = cadBlob;
      // finalSignedAt is NOT set here — that happens via DocuSign callback.
    } else {
      // design mode on a job (manager edit). Update cadData in place.
      changes.cadData = cadBlob;
    }

    // (v3.1) Time totals — every save updates these regardless of mode.
    // Per contract §6.4, CRM treats these as authoritative; no validation
    // against legacy heuristics. Null-safe fallbacks keep the existing
    // values intact when CAD didn't send a totals block.
    if (typeof totals.installMinutes === 'number')    changes.estimatedInstallMinutes    = totals.installMinutes;
    if (typeof totals.productionMinutes === 'number') changes.estimatedProductionMinutes = totals.productionMinutes;
    if (totals.stationTimes && typeof totals.stationTimes === 'object') changes.stationTimes = totals.stationTimes;

    var patched = Object.assign({}, j, changes, { updated: nowIso });

    // Persist to Supabase via the job serialiser.
    if (typeof jobToDb === 'function' && typeof dbUpsert === 'function') {
      dbUpsert('jobs', jobToDb(patched));
    }

    return patched;
  });

  setState({ jobs: updated });
}

// ── 8. Helpers ──────────────────────────────────────────────────────────────
function _findEntity(entityType, entityId) {
  var st = getState();
  var coll = ({lead:'leads', deal:'deals', job:'jobs'})[entityType];
  if (!coll || !st[coll]) return null;
  return (st[coll]).find(function(e) { return e.id === entityId; }) || null;
}

function _entityCustomer(entityType, entity) {
  if (entityType === 'lead') {
    return {
      name:    ((entity.fn || '') + ' ' + (entity.ln || '')).trim() || '',
      phone:   entity.phone || '',
      email:   entity.email || '',
      address: _composeAddress(entity),
    };
  }
  // For deals + jobs, look up the contact by id.
  var st = getState();
  var contactId = entity.cid || entity.contactId || null;
  var contact = contactId ? (st.contacts || []).find(function(c){ return c.id === contactId; }) : null;
  return {
    name:    contact ? (((contact.fn || '') + ' ' + (contact.ln || '')).trim() || (contact.co || '')) : '',
    phone:   contact ? (contact.phone || '') : '',
    email:   contact ? (contact.email || '') : '',
    address: _composeAddress(entity) || (contact ? _composeAddress(contact) : ''),
  };
}

function _composeAddress(o) {
  if (!o) return '';
  var parts = [o.street, o.suburb, o.state, o.postcode].filter(function(p){ return !!p; });
  return parts.join(', ');
}

function _entityLabel(entityType, entityId) {
  var e = _findEntity(entityType, entityId);
  if (!e) return entityType + ' ' + entityId;
  if (entityType === 'job') return (e.jobNumber || 'Job') + ' — ' + (e.title || '');
  if (entityType === 'deal') return (e.title || 'Deal');
  if (entityType === 'lead') return ((e.fn || '') + ' ' + (e.ln || '')).trim() + (e.suburb ? (' — ' + e.suburb) : '');
  return entityType;
}

function _esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── 9. Esc-key handling ─────────────────────────────────────────────────────
// Capture-phase listener so we run before 99-init.js's existing keydown
// handler. When the CAD overlay is open, Esc closes it and we stop the
// event from reaching the existing handler (otherwise it would also try to
// close whatever modal/detail-pane is "behind" the overlay, which would
// then be exposed when the overlay closes).
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && _cadSession) {
    e.stopPropagation();
    _closeCadOverlay();
  }
}, true);

// ── 10. Capacity helper (consumed by 17-install-schedule.js) ────────────────
// Centralised so the same precedence rules apply wherever install duration
// is read for capacity planning.
//
// Order of preference:
//   1. job.installDurationHours          — explicit manual override (takes priority)
//   2. job.estimatedInstallMinutes / 60  — CAD-derived estimate (rounded up to 0.25h)
//   3. fallback                          — caller-supplied default (e.g. 4)
function getEffectiveInstallHours(job, fallbackHours) {
  if (!job) return (typeof fallbackHours === 'number') ? fallbackHours : 4;
  if (typeof job.installDurationHours === 'number' && job.installDurationHours > 0) {
    return job.installDurationHours;
  }
  if (typeof job.estimatedInstallMinutes === 'number' && job.estimatedInstallMinutes > 0) {
    var hours = job.estimatedInstallMinutes / 60;
    return Math.ceil(hours * 4) / 4; // round UP to nearest 0.25h — capacity planning shouldn't under-promise
  }
  return (typeof fallbackHours === 'number') ? fallbackHours : 4;
}
window.getEffectiveInstallHours = getEffectiveInstallHours;
