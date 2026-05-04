// ════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 04-cad-bridge.js
// CAD <-> CRM iframe bridge. Implements the postMessage protocol from the
// CAD-side bridge at modules/cad_modules/12-crm-postmessage-bridge.js.
//
// History:
//   - Pre-2026-05-02: lived as modules/04-cad-integration.js
//   - 2026-05-02 (5d6a960): rewritten for same-origin iframe
//   - 2026-05-03 (5081f3c): file deleted while 'CAD bridge being rebuilt'
//   - 2026-05-04: recovered as modules/04-cad-bridge.js, paired with the
//                 quote helpers in modules/04-cad-quote-helpers.js
//   - 2026-05-04: switched to cross-origin — CAD now lives on its own
//                 Vercel project (spartan-cad-modular.vercel.app); the
//                 local cad.html / modules/cad_modules/ tree is dead code.
//
// CAD-side scope (from 12-crm-postmessage-bridge.js):
//   M1 (current — 2.0.0-WIP28):  init/ready/request-save/save/save-error/close
//                                Save payload deliberately minimal — totals
//                                are zeros, PDFs omitted.
//   M2:                          Time estimation (totals.installMinutes,
//                                productionMinutes, stationTimes)
//   M3:                          Full quote model (richer projectItems,
//                                quoteNumber, projectName, totals)
//   M4:                          Survey mode (job.cadSurveyData,
//                                surveyMeasurements)
//   M5:                          Final-design locking + cadFinalData
//
// CRM-side handling: this bridge already accepts every M1-M5 field with
// safe defaults. The build* / persist* functions don't crash on missing
// data — they just write zeros / nulls / empty objects until the CAD side
// starts populating each milestone.
//
// To extend for a future milestone: usually only the cadBlob shape in
// _persistCadSave or the slot routing in _persistToJob needs to grow. The
// message dispatcher and overlay are protocol-stable.
// ════════════════════════════════════════════════════════════════════════════


// ── 1. Config ────────────────────────────────────────────────────────────────
// CAD lives on its own Vercel project — single, stable origin, fine to
// hardcode. CRM-side has many origins (every preview branch + future
// production domain) so we don't try to enumerate them on the CAD side;
// that asymmetry is handled by the CAD repo, which is owned separately.
var CAD_ORIGIN = 'https://spartan-cad-modular.vercel.app';
var CAD_IFRAME_SRC = CAD_ORIGIN + '/';

var CAD_MSG_INIT         = 'spartan-cad-init';
var CAD_MSG_READY        = 'spartan-cad-ready';
var CAD_MSG_REQUEST_SAVE = 'spartan-cad-request-save';
var CAD_MSG_SAVE         = 'spartan-cad-save';
var CAD_MSG_SAVE_ERROR   = 'spartan-cad-save-error';
var CAD_MSG_CLOSE        = 'spartan-cad-close';

var CAD_INIT_FIRST_DELAY_MS = 1500;
var CAD_INIT_RETRY_DELAY_MS = 500;
var CAD_INIT_MAX_RETRIES    = 15;

// ── 2. Module state ──────────────────────────────────────────────────────────
var _cadSession = null;
// { entityType, entityId, mode, ready, retries, retryTimer, iframe, overlay }

// ── 3. Public entry point ────────────────────────────────────────────────────
function openCadDesigner(entityType, entityId, mode) {
  if (_cadSession) {
    if (typeof addToast === 'function') addToast('CAD is already open', 'warning');
    return;
  }
  mode = mode || 'design';

  var entity = _cadFindEntity(entityType, entityId);
  if (!entity) {
    if (typeof addToast === 'function') addToast('Entity not found — cannot open CAD', 'error');
    return;
  }

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
window.openCadDesigner = openCadDesigner;

// ── 4. Overlay DOM ───────────────────────────────────────────────────────────
function _renderCadOverlay() {
  var s = _cadSession;
  if (!s) return;

  var modeBadge   = ({ design: 'Design Mode', survey: 'Check Measure', final: 'Final Design' })[s.mode] || s.mode;
  var entityLabel = _cadEntityLabel(s.entityType, s.entityId);

  var overlay = document.createElement('div');
  overlay.id = 'cadOverlay';
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:300;' +
    'background:#1a1a1a;display:flex;flex-direction:column;font-family:DM Sans,sans-serif';

  var toolbar = document.createElement('div');
  toolbar.style.cssText =
    'display:flex;align-items:center;gap:12px;padding:10px 18px;' +
    'background:#1a1a1a;border-bottom:1px solid #2a2a2a;color:#fff;flex:0 0 auto';
  toolbar.innerHTML =
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:14px;letter-spacing:0.5px;color:#fff">SPARTAN CAD</div>' +
    '<div style="font-size:11px;padding:3px 10px;background:#c41230;border-radius:12px;color:#fff;font-weight:600">' + _cadEsc(modeBadge) + '</div>' +
    '<div style="font-size:12px;color:#9ca3af;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _cadEsc(entityLabel) + '</div>' +
    '<button id="cadSaveBtn" style="padding:7px 18px;background:#c41230;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:12px;font-family:inherit">Save to ' + ({ lead: 'Lead', deal: 'Deal', job: 'Job' })[s.entityType] + '</button>' +
    '<button id="cadCloseBtn" style="padding:7px 14px;background:transparent;color:#9ca3af;border:1px solid #3a3a3a;border-radius:6px;cursor:pointer;font-size:12px;font-family:inherit">Close</button>';

  var iframe = document.createElement('iframe');
  iframe.id = 'cadIframe';
  iframe.src = CAD_IFRAME_SRC;
  iframe.style.cssText = 'flex:1 1 auto;width:100%;border:none;background:#fff';
  iframe.setAttribute('title', 'Spartan CAD');
  iframe.setAttribute('allow', 'clipboard-write; clipboard-read');

  overlay.appendChild(toolbar);
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);

  document.getElementById('cadSaveBtn').addEventListener('click', _cadRequestSave);
  document.getElementById('cadCloseBtn').addEventListener('click', _closeCadOverlay);

  s.iframe  = iframe;
  s.overlay = overlay;

  iframe.addEventListener('load', function () {
    setTimeout(_cadSendInit, CAD_INIT_FIRST_DELAY_MS);
  });
}

function _closeCadOverlay() {
  var s = _cadSession;
  if (!s) return;
  if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; }
  if (s.overlay && s.overlay.parentNode) s.overlay.parentNode.removeChild(s.overlay);
  _cadSession = null;
}

// ── 5. Init payload + retry loop ─────────────────────────────────────────────
function _cadSendInit() {
  var s = _cadSession;
  if (!s || s.ready || !s.iframe || !s.iframe.contentWindow) return;

  var payload = _buildCadInitPayload(s.entityType, s.entityId, s.mode);
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

  if (s.retries < CAD_INIT_MAX_RETRIES) {
    s.retries += 1;
    s.retryTimer = setTimeout(_cadSendInit, CAD_INIT_RETRY_DELAY_MS);
  } else {
    console.error('[Spartan CAD] No ready response after ' + CAD_INIT_MAX_RETRIES + ' retries.');
    if (typeof addToast === 'function') addToast('CAD did not respond — check the connection and try again', 'error');
  }
}

function _buildCadInitPayload(entityType, entityId, mode) {
  var entity = _cadFindEntity(entityType, entityId);
  if (!entity) return null;

  var customer    = _cadEntityCustomer(entityType, entity);
  var projectName =
    (entityType === 'lead' && (entity.fn || entity.ln))
      ? ((entity.fn || '') + ' ' + (entity.ln || '')).trim() + (entity.suburb ? (' — ' + entity.suburb) : '')
      : (entity.title || (entity.fn ? (entity.fn + ' ' + (entity.ln || '')) : 'Untitled Project'));

  var jobNumber = (entityType === 'job') ? (entity.jobNumber || null) : null;
  var branch    = entity.branch || 'VIC';

  var quotes        = [];
  var activeQuoteId = null;
  if (entityType === 'lead' || entityType === 'deal') {
    quotes = (entity.quotes || []).map(function (q) {
      return {
        id:           q.id,
        label:        q.label || ('Quote ' + q.id),
        savedAt:      q.savedAt || null,
        totalPrice:   q.totalPrice || 0,
        frameCount:   (q.projectItems || []).length,
        projectItems: q.projectItems || [],
      };
    });
    activeQuoteId = entity.activeQuoteId || (quotes[0] && quotes[0].id) || null;
  }

  var designData = null;
  if (entityType === 'job') {
    designData = entity.cadData || null;
  }

  var surveyData = null;
  if (entityType === 'job' && (mode === 'survey' || mode === 'final')) {
    if (entity.cadSurveyData) surveyData = entity.cadSurveyData;
  }

  var lockedFields = (mode === 'final') ? ['widthMm', 'heightMm', 'surveyMeasurements'] : [];

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

// ── 6. Message listener ──────────────────────────────────────────────────────
function _onCadMessage(event) {
  // Cross-origin check — accept messages only from the CAD Vercel project.
  if (event.origin !== CAD_ORIGIN) return;
  if (!_cadSession) return;
  var msg = event.data;
  if (!msg || typeof msg !== 'object' || !msg.type) return;

  switch (msg.type) {
    case CAD_MSG_READY:      _onCadReady(msg);    break;
    case CAD_MSG_SAVE:       _onCadSave(msg);     break;
    case CAD_MSG_SAVE_ERROR: _onCadSaveError(msg); break;
    case CAD_MSG_CLOSE:      _closeCadOverlay();  break;
    default: break;
  }
}
window.addEventListener('message', _onCadMessage);

function _onCadReady(msg) {
  var s = _cadSession;
  if (!s) return;
  s.ready = true;
  if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; }
  console.log('[Spartan CAD] Ready — version', (msg && msg.version) || '(unknown)');
}

function _cadRequestSave() {
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

function _onCadSave(msg) {
  var s = _cadSession;
  if (!s) return;
  try {
    _persistCadSave(msg, s.entityType, s.entityId, s.mode);
    var label = ({ design: 'Design saved', survey: 'Check Measure saved', final: 'Final design saved' })[s.mode] || 'Saved';
    if (typeof addToast === 'function') addToast(label, 'success');
    _closeCadOverlay();
  } catch (e) {
    console.error('[Spartan CAD] Persist failed:', e);
    if (typeof addToast === 'function') addToast('Save failed: ' + (e && e.message ? e.message : 'unknown error'), 'error');
  }
}

function _onCadSaveError(msg) {
  var reason = (msg && msg.reason) ? msg.reason : 'CAD reported a save error';
  if (typeof addToast === 'function') addToast(reason, 'error');
}

// ── 7. Persistence ───────────────────────────────────────────────────────────
function _persistCadSave(msg, entityType, entityId, mode) {
  var st = getState();

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
  var coll    = st[collKey] || [];

  var updated = coll.map(function (e) {
    if (e.id !== entityId) return e;

    var quotes         = Array.isArray(e.quotes) ? e.quotes.slice() : [];
    var quoteId        = msg.quoteId;
    var newQuoteCreated = false;

    function buildQuote(idForQuote, label) {
      return {
        id:           idForQuote,
        label:        label,
        projectItems: cadBlob.projectItems,
        totalPrice:   cadBlob.totalPrice,
        frameCount:   cadBlob.projectItems.length,
        savedAt:      cadBlob.savedAt,
        quoteNumber:  cadBlob.quoteNumber,
        totals:       cadBlob.totals,
        notes:        '',
      };
    }

    if (quoteId && quotes.find(function (q) { return q.id === quoteId; })) {
      quotes = quotes.map(function (q) {
        return (q.id === quoteId)
          ? Object.assign({}, q, buildQuote(q.id, q.label || ('Quote ' + q.id)))
          : q;
      });
    } else {
      var nextN = (quotes.reduce(function (max, q) {
        var m = (q.id || '').match(/^q_(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0)) + 1;
      var newId = 'q_' + nextN;
      quotes.push(buildQuote(newId, 'Quote ' + nextN));
      quoteId         = newId;
      newQuoteCreated = true;
    }

    var patched = Object.assign({}, e, {
      quotes:        quotes,
      activeQuoteId: quoteId,
      cadData:       cadBlob,
    });

    if (newQuoteCreated) console.log('[Spartan CAD] New quote allocated:', quoteId);
    return patched;
  });

  var patch = {};
  patch[collKey] = updated;
  setState(patch);
}

function _persistToJob(st, jobId, mode, msg, cadBlob) {
  var jobs   = st.jobs || [];
  var totals = msg.totals || {};

  var updated = jobs.map(function (j) {
    if (j.id !== jobId) return j;

    var nowIso  = new Date().toISOString();
    var changes = {};

    if (mode === 'survey') {
      changes.cadSurveyData = cadBlob;
      if (Array.isArray(msg.surveyMeasurements)) {
        changes.surveyMeasurements = msg.surveyMeasurements;
      }
      if (!j.cmCompletedAt) changes.cmCompletedAt = nowIso;
    } else if (mode === 'final') {
      changes.cadFinalData = cadBlob;
    } else {
      changes.cadData = cadBlob;
    }

    if (typeof totals.installMinutes    === 'number') changes.estimatedInstallMinutes    = totals.installMinutes;
    if (typeof totals.productionMinutes === 'number') changes.estimatedProductionMinutes = totals.productionMinutes;
    if (totals.stationTimes && typeof totals.stationTimes === 'object') changes.stationTimes = totals.stationTimes;

    var patched = Object.assign({}, j, changes, { updated: nowIso });

    return patched;
  });

  setState({ jobs: updated });
}

// ── 8. Helpers ───────────────────────────────────────────────────────────────
function _cadFindEntity(entityType, entityId) {
  var st   = getState();
  var coll = ({ lead: 'leads', deal: 'deals', job: 'jobs' })[entityType];
  if (!coll || !st[coll]) return null;
  return st[coll].find(function (e) { return e.id === entityId; }) || null;
}

function _cadEntityCustomer(entityType, entity) {
  if (entityType === 'lead') {
    return {
      name:    ((entity.fn || '') + ' ' + (entity.ln || '')).trim() || '',
      phone:   entity.phone || '',
      email:   entity.email || '',
      address: _cadComposeAddress(entity),
    };
  }
  var st        = getState();
  var contactId = entity.cid || entity.contactId || null;
  var contact   = contactId ? (st.contacts || []).find(function (c) { return c.id === contactId; }) : null;
  return {
    name:    contact ? (((contact.fn || '') + ' ' + (contact.ln || '')).trim() || (contact.co || '')) : '',
    phone:   contact ? (contact.phone || '') : '',
    email:   contact ? (contact.email || '') : '',
    address: _cadComposeAddress(entity) || (contact ? _cadComposeAddress(contact) : ''),
  };
}

function _cadComposeAddress(o) {
  if (!o) return '';
  return [o.street, o.suburb, o.state, o.postcode].filter(Boolean).join(', ');
}

function _cadEntityLabel(entityType, entityId) {
  var e = _cadFindEntity(entityType, entityId);
  if (!e) return entityType + ' ' + entityId;
  if (entityType === 'job')  return (e.jobNumber || 'Job') + ' — ' + (e.title || '');
  if (entityType === 'deal') return e.title || 'Deal';
  if (entityType === 'lead') return ((e.fn || '') + ' ' + (e.ln || '')).trim() + (e.suburb ? (' — ' + e.suburb) : '');
  return entityType;
}

function _cadEsc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── 9. Esc key ───────────────────────────────────────────────────────────────
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && _cadSession) {
    e.stopPropagation();
    _closeCadOverlay();
  }
}, true);

// ── 10. Install hours helper (consumed by 17-install-schedule.js) ─────────────
