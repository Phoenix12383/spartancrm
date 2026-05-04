// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11-email-page.js (ORCHESTRATOR)
// Extracted from original index.html lines 7711-9132
// Main page renderer that dispatches to sub-modules.
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────
defineAction('email-mobile-search', function(target, ev) {
  _mobileEmailSearch = target.value;
  renderPage();
});

defineAction('email-mobile-folder-switch', function(target, ev) {
  var folderId = target.dataset.folderId;
  _mobileEmailFolder = folderId;
  renderPage();
});

defineAction('email-gmail-connect', function(target, ev) {
  gmailConnect();
});

defineAction('email-search', function(target, ev) {
  emailSearchQ = target.value;
  renderPage();
});

defineAction('email-compose', function(target, ev) {
  emailOpenCompose('', '', '', '', null, null, null, null, null);
});

defineAction('email-folder-select', function(target, ev) {
  var folderId = target.dataset.folderId;
  setState({ emailFolder: folderId, emailSelectedId: null });
});

defineAction('email-report-date-range', function(target, ev) {
  var rangeId = target.dataset.dateRange;
  rptDateRange = rangeId;
  renderPage();
});

defineAction('email-export-csv', function(target, ev) {
  addToast('CSV export coming soon', 'info');
});

defineAction('email-report-select', function(target, ev) {
  var reportId = target.dataset.reportId;
  rptActiveId = reportId;
  rptEditing = false;
  renderPage();
});

defineAction('email-report-chart-type', function(target, ev) {
  var chartType = target.dataset.chartType;
  var activeReport = SAVED_REPORTS.find(r => r.id === rptActiveId);
  if (activeReport) {
    activeReport.chart = chartType;
    renderPage();
  }
});

defineAction('email-report-new', function(target, ev) {
  rptOpenBuilder('new');
});

defineAction('email-custom-field-edit', function(target, ev) {
  var entityId = target.dataset.entityId;
  var fieldId = target.dataset.fieldId;
  var entityType = target.dataset.entityType;
  cfStartEdit(entityId, fieldId, entityType);
});

defineAction('email-custom-field-save', function(target, ev) {
  var entityId = target.dataset.entityId;
  var fieldId = target.dataset.fieldId;
  var entityType = target.dataset.entityType;
  cfSaveFromEl(entityId, fieldId, entityType);
});

defineAction('email-cancel-edit', function(target, ev) {
  renderPage();
});

// ── Form field change handlers (generic, for dynamic expressions) ──────────
defineAction('email-textarea-change', function(target, ev) {
  // Invoked by renderCFInput for textarea fields with dynamic onchangeExpr
  var onchangeExpr = target.dataset.onchangeExpr;
  if (onchangeExpr) {
    var value = target.value;
    var expr = onchangeExpr.replace(/this\.value/g, JSON.stringify(value));
    eval(expr);
  }
});

defineAction('email-checkbox-change', function(target, ev) {
  // Invoked by renderCFInput for checkbox fields
  var onchangeExpr = target.dataset.onchangeExpr;
  if (onchangeExpr) {
    var value = target.checked;
    var expr = onchangeExpr.replace(/this\.checked/g, JSON.stringify(value));
    eval(expr);
  }
});

defineAction('email-select-change', function(target, ev) {
  // Invoked by renderCFInput for select/multiselect fields
  var onchangeExpr = target.dataset.onchangeExpr;
  if (onchangeExpr) {
    var value = target.value;
    if (target.multiple) {
      value = Array.from(target.selectedOptions).map(o => o.value);
    }
    var expr = onchangeExpr.replace(/this\.value/g, JSON.stringify(value))
                           .replace(/Array\.from\(this\.selectedOptions\)\.map\(o=>o\.value\)/g, JSON.stringify(value));
    eval(expr);
  }
});

defineAction('email-input-change', function(target, ev) {
  // Invoked by renderCFInput for text/number/date/email/phone/url input fields
  var onchangeExpr = target.dataset.onchangeExpr;
  if (onchangeExpr) {
    var value = target.value;
    var expr = onchangeExpr.replace(/this\.value/g, JSON.stringify(value));
    eval(expr);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// MODULE STATE VARS (used by all email sub-modules)
// ══════════════════════════════════════════════════════════════════════════════

// ── Composer state ─────────────────────────────────────────────────────────
var mergePickerOpen = false;
var emailSearchQ = '';

// ── Templates state ────────────────────────────────────────────────────────
var editingTemplateId = null;
var editingTemplateNew = false;

// ── Mobile state ───────────────────────────────────────────────────────────
var _mobileEmailFolder = 'sent';
var _mobileEmailSearch = '';

// ── Google Maps state (will be extracted to own module) ──────────────────
var _mapsLoaded = false;
var _mapsLoading = false;
var _mapsLoadError = '';
var _mapsAuthFailure = false;
var _mapsLoadStartTime = 0;
var _activeAutocompletes = {};


// ══════════════════════════════════════════════════════════════════════════════
// ──────────────── TODO 2026-05-02: extract to its own module (NOT email-related) ──────────────
// GOOGLE MAPS ADDRESS AUTOCOMPLETE — extracted to 14a-google-maps-real.js
// ══════════════════════════════════════════════════════════════════════════════
function loadGoogleMaps(forceReload) {
  if (!MAPS_API_KEY) { _mapsLoadError = 'No API key set. Go to Settings → Email & Gmail.'; return; }
  // Already loaded and working — nothing to do unless we're forcing a reload (e.g. after key change)
  if (_mapsLoaded && !forceReload) { attachAllAutocomplete(); return; }
  if (_mapsLoading && !forceReload) return;

  // Clean up any previous attempt so we start from a clean slate
  if (forceReload) {
    _mapsLoaded = false;
    _mapsLoadError = '';
    _mapsAuthFailure = false;
    // Remove any existing Maps script tags so the reload actually re-runs
    document.querySelectorAll('script[src*="maps.googleapis.com"]').forEach(function(s){ s.remove(); });
    // Clear the global google.maps namespace if present
    try { if (window.google && window.google.maps) { delete window.google.maps; } } catch(e){}
    _activeAutocompletes = {};
  }

  _mapsLoading = true;
  _mapsLoadStartTime = Date.now();
  var script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(MAPS_API_KEY) + '&libraries=places,marker&loading=async&callback=onGoogleMapsLoaded';
  script.async = true;
  script.defer = true;
  script.onerror = function() {
    _mapsLoading = false;
    _mapsLoadError = 'Failed to load Maps script (network or CSP blocked).';
    console.error('[Maps] Script load error');
    _refreshMapsErrorBanners();
  };
  document.head.appendChild(script);

  // Guard against silent failures: if after 8s we're still not loaded and no auth failure fired,
  // surface a generic error so users aren't stuck staring at nothing.
  setTimeout(function() {
    if (!_mapsLoaded && _mapsLoading && !_mapsAuthFailure && !_mapsLoadError) {
      _mapsLoadError = 'Maps did not load within 8s. Check the API key and that Places API + Maps JavaScript API are enabled in Google Cloud.';
      console.warn('[Maps] Timeout waiting for load');
      _refreshMapsErrorBanners();
    }
  }, 8000);
}

// Google calls this global when the API key is rejected (wrong key, referrer blocked,
// billing not enabled, APIs not enabled, etc.). This is how we catch the "This page
// can't load Google Maps correctly" popup.
window.gm_authFailure = function() {
  _mapsAuthFailure = true;
  _mapsLoaded = false;
  _mapsLoading = false;
  _mapsLoadError = 'Google rejected the API key. Fix in Google Cloud Console: (1) enable "Places API" AND "Maps JavaScript API", (2) add spaartan.tech to the key\'s HTTP referrer allowlist (or leave it unrestricted), (3) ensure billing is enabled on the project.';
  console.error('[Maps] Auth failure — Google rejected the key');
  _refreshMapsErrorBanners();
};

function onGoogleMapsLoaded() {
  _mapsLoaded = true;
  _mapsLoading = false;
  _mapsLoadError = '';
  _mapsAuthFailure = false;
  console.log('[Maps] Places API loaded in', (Date.now()-_mapsLoadStartTime), 'ms');
  attachAllAutocomplete();
  _refreshMapsErrorBanners();
}
// Make callback globally accessible
window.onGoogleMapsLoaded = onGoogleMapsLoaded;

// Update any visible "Maps not available" banners in open forms.
function _refreshMapsErrorBanners() {
  document.querySelectorAll('[data-maps-banner]').forEach(function(el) {
    if (_mapsLoaded) {
      el.style.display = 'none';
    } else if (_mapsLoadError) {
      el.style.display = 'block';
      var msgEl = el.querySelector('[data-maps-msg]');
      if (msgEl) msgEl.textContent = _mapsLoadError;
    }
  });
}

// Inline banner HTML that forms can include next to address fields, so users see
// a clear message if Maps autocomplete isn't working.
function mapsStatusBanner() {
  var visible = !_mapsLoaded && (_mapsLoadError || !MAPS_API_KEY);
  var msg = !MAPS_API_KEY ? 'Google Maps API key not set. Go to Settings \u2192 Email & Gmail to add it.'
                          : (_mapsLoadError || 'Google Maps loading\u2026');
  return '<div data-maps-banner style="display:'+(visible?'block':'none')+';background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;font-size:11px;color:#92400e;margin-bottom:8px">'
    +'<strong>\u26a0 Address autocomplete unavailable</strong> \u2014 <span data-maps-msg>'+_calEsc(msg)+'</span>'
    +'<div style="margin-top:4px;color:#78350f">You can still type the address manually in the fields below.</div>'
    +'</div>';
}

var _activeAutocompletes = {};

// Modern Places API (New) autocomplete. Inserts a <gmp-place-autocomplete>
// element before the existing <input id=streetId>, and on selection fills
// the street input plus any suburb/state/postcode fields. The plain <input>
// stays in place so users can still type/edit manually, and so the form
// submit code (document.getElementById(streetId).value) keeps working.
function attachAutocomplete(streetId, suburbId, stateId, postcodeId) {
  if (!_mapsLoaded || !window.google || !google.maps || !google.maps.places) return;
  if (typeof google.maps.places.PlaceAutocompleteElement !== 'function') {
    // SDK loaded without the new element constructor — happens if &libraries=places is missing or an older API version is pinned.
    console.warn('[autocomplete] PlaceAutocompleteElement not available on google.maps.places');
    return;
  }
  var input = document.getElementById(streetId);
  if (!input) return;

  var acId = streetId + '_ac';
  var existing = _activeAutocompletes[streetId];

  // If an autocomplete element already exists and is still attached to the current DOM node, keep it.
  if (existing && existing._streetEl === input && document.getElementById(acId)) return;

  // Drop stale bindings — the drawer may have re-rendered, detaching previous elements.
  if (existing && existing._el && existing._el.parentNode) {
    try { existing._el.parentNode.removeChild(existing._el); } catch(e) {}
  }
  delete _activeAutocompletes[streetId];

  // Construct the new element. Throws (caught) if the library isn't ready yet.
  var acEl;
  try {
    acEl = new google.maps.places.PlaceAutocompleteElement({
      includedRegionCodes: ['au'],
    });
  } catch(e) {
    console.warn('[autocomplete] failed to construct PlaceAutocompleteElement', e);
    return;
  }
  acEl.id = acId;
  acEl.style.display = 'block';
  acEl.style.width = '100%';
  acEl.style.marginBottom = '6px';

  // Insert right before the legacy input so the user sees the search widget
  // above the manually-editable street field.
  if (input.parentNode) input.parentNode.insertBefore(acEl, input);

  acEl.addEventListener('gmp-select', async function(ev) {
    try {
      var pred = ev && ev.placePrediction;
      if (!pred) return;
      var place = pred.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress', 'location'] });

      var street_number = '', route = '', suburb = '', state = '', postcode = '';
      (place.addressComponents || []).forEach(function(comp) {
        var types = comp.types || [];
        if (types.indexOf('street_number') >= 0) street_number = comp.longText || '';
        if (types.indexOf('route') >= 0) route = comp.longText || '';
        if (types.indexOf('locality') >= 0) suburb = comp.longText || '';
        if (types.indexOf('administrative_area_level_1') >= 0) state = comp.shortText || '';
        if (types.indexOf('postal_code') >= 0) postcode = comp.longText || '';
      });

      if (input) input.value = (street_number ? street_number + ' ' : '') + route;
      var suburbEl = suburbId ? document.getElementById(suburbId) : null;
      if (suburbEl) suburbEl.value = suburb;
      var stateEl = stateId ? document.getElementById(stateId) : null;
      if (stateEl) {
        if (stateEl.tagName === 'SELECT') {
          for (var i = 0; i < stateEl.options.length; i++) {
            if (stateEl.options[i].value === state) { stateEl.selectedIndex = i; break; }
          }
        } else { stateEl.value = state; }
      }
      var postcodeEl = postcodeId ? document.getElementById(postcodeId) : null;
      if (postcodeEl) postcodeEl.value = postcode;

      [input, suburbEl, stateEl, postcodeEl].forEach(function(el) {
        if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } catch(e) {
      console.warn('[autocomplete] gmp-select handler error', e);
    }
  });

  _activeAutocompletes[streetId] = { _el: acEl, _streetEl: input };
}

function attachAllAutocomplete() {
  // If Maps isn't loaded yet, try to load it (key may have been entered after page init)
  if (!_mapsLoaded) {
    if (!_mapsLoading && MAPS_API_KEY) loadGoogleMaps();
    return;
  }
  // Contact form
  attachAutocomplete('nc_street', 'nc_suburb', 'nc_state', 'nc_postcode');
  // Contact detail edit
  attachAutocomplete('ce_street', 'ce_suburb', 'ce_state', 'ce_postcode');
  // Lead form
  attachAutocomplete('al_street', 'al_suburb', 'al_state', 'al_postcode');
  // Lead detail edit
  attachAutocomplete('le_street', 'le_suburb', 'le_state', 'le_postcode');
  // New deal form
  attachAutocomplete('nd_street', 'nd_suburb', 'nd_state', 'nd_postcode');
  // Deal edit form
  attachAutocomplete('de_street', 'de_suburb', 'de_state', 'de_postcode');
  // Job install schedule
  attachAutocomplete('inst_st', 'inst_sub', 'inst_state', 'inst_pc');
  // Calendar event location
  attachAutocomplete('ce_location', null, null, null);
  // Service call address
  attachAutocomplete('sc_street', 'sc_suburb', 'sc_state', 'sc_postcode');
}

function saveMapsApiKey() {
  var v = document.getElementById('mapsApiKey').value.trim();
  if (!v) { addToast('Enter an API key', 'error'); return; }
  MAPS_API_KEY = v;
  localStorage.setItem('spartan_maps_api_key', v);
  addToast('Maps API Key saved \u2014 testing now\u2026', 'info');
  loadGoogleMaps(true);  // force-reload with clean slate
  setTimeout(renderPage, 500);
}

function testMapsApiKey() {
  if (!MAPS_API_KEY) { addToast('Save a key first', 'error'); return; }
  addToast('Reloading Maps\u2026', 'info');
  loadGoogleMaps(true);
  // Re-render settings page after Maps either loads or errors so the status line updates
  setTimeout(function(){
    renderPage();
    if (_mapsLoaded) addToast('\u2713 Maps loaded successfully', 'success');
    else if (_mapsLoadError) addToast('\u2717 Maps failed \u2014 see Settings for details', 'error');
  }, 3500);
}

function renderEmailMobile() {
  var st = getState();
  var emailSent = st.emailSent || [];
  var emailInbox = st.emailInbox || [];
  var totalSent = emailSent.length;
  var openedCount = emailSent.filter(function(e){ return e.opened; }).length;
  var clickedCount = emailSent.filter(function(e){ return e.clicked; }).length;
  var openRate = totalSent ? Math.round(openedCount / totalSent * 100) : 0;
  var folder = _mobileEmailFolder || 'sent';
  var search = _mobileEmailSearch || '';
  var emails;
  if (folder === 'sent') emails = emailSent;
  else if (folder === 'inbox') emails = emailInbox;
  else if (folder === 'opened') emails = emailSent.filter(function(e){ return e.opened; });
  else if (folder === 'unopened') emails = emailSent.filter(function(e){ return !e.opened; });
  else emails = emailSent;
  emails = emails.slice().sort(function(a, b){
    return ((b.date||'') + (b.time||'')).localeCompare((a.date||'') + (a.time||''));
  });
  if (search) {
    var s2 = search.toLowerCase();
    emails = emails.filter(function(e){
      return ((e.subject||'') + ' ' + (e.body||'') + ' ' + (e.to||'') + ' ' + (e.from||'')).toLowerCase().indexOf(s2) >= 0;
    });
  }
  // _attrEsc consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
  function fmtRel(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (isNaN(days)) return '';
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yest';
    if (days < 7) return days + 'd';
    if (days < 30) return Math.floor(days/7) + 'w';
    return Math.floor(days/30) + 'mo';
  }
  function emailCard(e) {
    var recipient = e.to || e.from || '—';
    var subject = e.subject || '(no subject)';
    var preview = (e.body || '').replace(/<[^>]*>/g, '').slice(0, 80);
    var isInbox = folder === 'inbox';
    return '<div style="background:#fff;border-radius:12px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13px;font-weight:700;color:#0a0a0a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + recipient + '</div>' +
          '<div style="font-size:12px;color:#374151;font-weight:500;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + subject + '</div>' +
        '</div>' +
        '<div style="font-size:10px;color:#9ca3af;flex-shrink:0">' + fmtRel(e.date) + '</div>' +
      '</div>' +
      (preview ? '<div style="font-size:11px;color:#6b7280;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + preview + '</div>' : '') +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        (e.opened
          ? '<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:#dcfce7;color:#15803d">👁 ' + (e.opens || 1) + '× opened</span>'
          : (!isInbox ? '<span style="font-size:9px;font-weight:600;padding:2px 7px;border-radius:10px;background:#f3f4f6;color:#6b7280">Not opened</span>' : '')) +
        (e.clicked ? '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:#dbeafe;color:#1d4ed8">Clicked</span>' : '') +
        (isInbox && !e.read ? '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;background:#fef2f4;color:#c41230">New</span>' : '') +
      '</div>' +
    '</div>';
  }
  return '' +
    '<div style="margin:-12px -12px 12px;background:#fff;padding:12px 16px;border-bottom:1px solid #f0f0f0">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
        '<div>' +
          '<h1 style="font-size:18px;font-weight:800;margin:0;color:#0a0a0a;font-family:Syne,sans-serif">Email tracking</h1>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + openRate + '% open rate</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">' +
        '<div style="background:#f3f4f6;border-radius:8px;padding:8px;text-align:center"><div style="font-size:14px;font-weight:800;color:#0a0a0a">' + totalSent + '</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;color:#6b7280">Sent</div></div>' +
        '<div style="background:#dcfce7;border-radius:8px;padding:8px;text-align:center"><div style="font-size:14px;font-weight:800;color:#15803d">' + openedCount + '</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;color:#15803d">Opened</div></div>' +
        '<div style="background:#dbeafe;border-radius:8px;padding:8px;text-align:center"><div style="font-size:14px;font-weight:800;color:#1d4ed8">' + clickedCount + '</div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;color:#1d4ed8">Clicked</div></div>' +
      '</div>' +
      '<input value="' + _attrEsc(search) + '" data-action="email-mobile-search" placeholder="Search subject, recipient…" style="width:100%;padding:8px 12px;background:#f3f4f6;border:none;border-radius:8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box" />' +
    '</div>' +
    '<div style="margin:0 -12px 12px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch">' +
      [{id:'sent',label:'Sent'},{id:'opened',label:'Opened'},{id:'unopened',label:'Unopened'},{id:'inbox',label:'Inbox'}].map(function(t){
        var on = folder === t.id;
        return '<button data-action="email-mobile-folder-switch" data-folder-id="' + t.id + '" style="flex:1;min-width:80px;padding:10px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:11px;font-weight:700;color:' + (on ? '#c41230' : '#6b7280') + ';border-bottom:2.5px solid ' + (on ? '#c41230' : 'transparent') + ';white-space:nowrap">' + t.label + '</button>';
      }).join('') +
    '</div>' +
    (emails.length === 0
      ? '<div style="padding:50px 20px;text-align:center;background:#fff;border-radius:12px;color:#9ca3af;font-size:13px"><div style="font-size:32px;margin-bottom:8px;opacity:.4">✉</div><div style="font-style:italic">' + (search ? 'No emails match your search' : 'No emails in this folder') + '</div><div style="font-size:11px;margin-top:8px;font-style:italic">Sent emails from the desktop CRM appear here automatically.</div></div>'
      : emails.map(emailCard).join(''));
}

// ── MAIN PAGE RENDER ──────────────────────────────────────────────────────────
function renderEmailPage() {
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) return renderEmailMobile();
  const s = getState();
  if (s.gmailConnected) gmailSyncEmails();
  // Pull real opens from Supabase (written by api/track.js tracking pixel) and
  // ensure the 30s poll is running while this page is open.
  syncEmailOpens();
  startEmailOpensPolling();

  const {emailInbox, emailSent, emailDrafts, emailFolder, emailSelectedId, emailComposing, gmailConnected, gmailUser} = s;
  const unread = emailInbox.filter(m=>!m.read).length;

  // Folder lists
  const folderList = emailFolder==='inbox' ? emailInbox :
                     emailFolder==='sent'   ? emailSent  :
                     emailFolder==='drafts' ? emailDrafts : [];

  const filtered = emailSearchQ
    ? folderList.filter(m=>(m.subject||'').toLowerCase().includes(emailSearchQ.toLowerCase())||(m.from||m.to||'').toLowerCase().includes(emailSearchQ.toLowerCase())||(m.fromName||m.toName||'').toLowerCase().includes(emailSearchQ.toLowerCase()))
    : folderList;

  const selectedMsg = emailSelectedId
    ? [...emailInbox,...emailSent,...emailDrafts].find(m=>m.id===emailSelectedId)
    : null;

  // Compute sidebar offset so the email page pins correctly next to the sidebar.
  const _sbOpen = !!s.sidebarOpen;
  const _emailOffsetLeft = _sbOpen ? 220 : 64;
  const _emailOffsetTop  = 56 + (typeof MODULE_BAR_HEIGHT !== 'undefined' ? MODULE_BAR_HEIGHT : 40);

  return `
  <div data-email-version="v6-fixed-position" style="position:fixed !important;top:${_emailOffsetTop}px !important;left:${_emailOffsetLeft}px !important;right:0 !important;bottom:0 !important;background:#f8f9fa;display:flex;flex-direction:column;overflow:hidden;z-index:5">
    <!-- Deploy marker (remove once layout confirmed working) -->
    <div style="position:absolute;top:8px;right:12px;z-index:100;background:#16a34a;color:#fff;font-size:9px;font-weight:700;padding:2px 7px;border-radius:10px;letter-spacing:.04em;font-family:monospace;pointer-events:none">v6 LIVE</div>

    <!-- Top bar -->
    <div style="background:#fff;border-bottom:1px solid #e5e7eb;padding:12px 24px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;flex-shrink:0">
      <h1 style="font-size:20px;font-weight:800;margin:0;font-family:Syne,sans-serif">Email</h1>
      ${gmailConnected?`
        <div style="display:flex;align-items:center;gap:6px;padding:4px 10px;background:#f0fdf4;border:1px solid #86efac;border-radius:20px">
          <div style="width:8px;height:8px;border-radius:50%;background:#22c55e"></div>
          <span style="font-size:12px;font-weight:500;color:#15803d">${gmailUser?gmailUser.email:'Gmail connected'}</span>
        </div>`:`
        <button data-action="email-gmail-connect" style="display:flex;align-items:center;gap:6px;padding:5px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:20px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;color:#374151" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
          Connect Gmail
        </button>`}
      <div style="flex:1;min-width:160px;max-width:320px;position:relative">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none">${Icon({n:'search',size:13})}</span>
        <input id="emailSearchInput" class="inp" value="${emailSearchQ}" data-action="email-search" placeholder="Search emails…" style="padding-left:32px;font-size:12px;padding-top:7px;padding-bottom:7px">
      </div>
      <div style="margin-left:auto">
        <button data-action="email-compose" class="btn-r" style="font-size:13px;gap:8px">
          ${Icon({n:'edit',size:14})} Compose
        </button>
      </div>
    </div>

    <!-- Body: 3-column layout -->
    <div style="display:grid;grid-template-columns:200px 320px minmax(0,1fr);flex:1;min-height:0;overflow:hidden">

      <!-- ── COL 1: Folder sidebar ── -->
      <div style="background:#fff;border-right:1px solid #e5e7eb;padding:12px 8px;display:flex;flex-direction:column;gap:2px;overflow-y:auto">
        ${[
          {id:'inbox',   label:'Inbox',     count:unread,  icon:'bell'},
          {id:'sent',    label:'Sent',      count:0,       icon:'send'},
          {id:'drafts',  label:'Drafts',    count:emailDrafts.length, icon:'filetext'},
          {id:'templates',label:'Templates',count:getAllTemplates().length, icon:'filetext'},
          {id:'tracking',label:'Tracking',  count:0,       icon:'trend'},
        ].map(f=>`
          <button data-action="email-folder-select" data-folder-id="${f.id}"
            style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;font-size:13px;font-weight:${emailFolder===f.id?600:400};cursor:pointer;font-family:inherit;background:${emailFolder===f.id?'#fff5f6':'transparent'};color:${emailFolder===f.id?'#c41230':'#374151'};text-align:left;width:100%"
            onmouseover="this.style.background='${emailFolder===f.id?'#fff5f6':'#f9fafb'}'" onmouseout="this.style.background='${emailFolder===f.id?'#fff5f6':'transparent'}'">
            ${Icon({n:f.icon,size:15,style:`color:${emailFolder===f.id?'#c41230':'#9ca3af'}`})}
            <span style="flex:1">${f.label}</span>
            ${f.count>0?`<span style="background:${emailFolder==='inbox'&&f.id==='inbox'?'#c41230':'#e5e7eb'};color:${emailFolder==='inbox'&&f.id==='inbox'?'#fff':'#6b7280'};border-radius:10px;font-size:10px;font-weight:700;padding:1px 7px">${f.count}</span>`:''}
          </button>`).join('')}

        <!-- Labels -->
        <div style="margin-top:16px;padding:0 4px">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;padding:4px 8px;margin-bottom:4px">Labels</div>
          ${[['#22c55e','Deals'],['#3b82f6','Leads'],['#f59e0b','Follow-up'],['#ef4444','Urgent']].map(([col,label])=>`
            <div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:12px;color:#374151" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
              <div style="width:8px;height:8px;border-radius:50%;background:${col};flex-shrink:0"></div>
              ${label}
            </div>`).join('')}
        </div>
      </div>

      <!-- ── COL 2: Email list ── -->
      <div style="border-right:1px solid #e5e7eb;overflow-y:auto;background:#fafafa">
        ${emailFolder==='templates' ? renderEmailTemplateList() :
          emailFolder==='tracking'  ? renderEmailTrackingList() :
          renderEmailList(filtered, emailFolder, emailSelectedId)}
      </div>

      <!-- ── COL 3: Email view / composer ── -->
      <div style="overflow-y:auto;background:#fff;min-width:0">
        ${emailComposing                          ? renderEmailComposer() :
          emailFolder==='templates'&&emailSelectedId ? renderEmailTemplateDetail(getAllTemplates().find(t=>t.id===emailSelectedId)) :
          emailFolder==='tracking'&&emailSelectedId  ? renderEmailTrackingDetail(emailSent.find(m=>m.id===emailSelectedId)) :
          selectedMsg                               ? renderEmailDetail(selectedMsg) :
                                                      renderEmailEmpty()}
      </div>
    </div>
  </div>`;
}

function renderEmailEmpty() {
  return `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center">
    <div style="font-size:48px;margin-bottom:16px">✉️</div>
    <div style="font-size:16px;font-weight:600;color:#374151;margin-bottom:6px">Select an email to read</div>
    <div style="font-size:13px;color:#9ca3af;margin-bottom:20px;max-width:280px;line-height:1.6">Or compose a new email to a contact, deal, or lead</div>
    <button data-action="email-compose" class="btn-r" style="font-size:13px;gap:8px">
      ${Icon({n:'edit',size:14})} Compose Email
    </button>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ──────────────── TODO 2026-05-02: extract to its own module (NOT email-related) ──────────────
// REPORTS & INSIGHTS — will be extracted to a dedicated reports module
// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN RENDER ───────────────────────────────────────────────────────────────

// ── Report state ─────────────────────────────────────────────────────────────
let SAVED_REPORTS=[
  {id:'r1',name:'Deals Won Over Time',icon:'💰',measure:'dealValue',groupBy:'month',chart:'bar',dateRange:'thisYear',desc:'Monthly won deal revenue by rep'},
  {id:'r2',name:'New Lead Performance',icon:'👤',measure:'leadCount',groupBy:'week',chart:'bar',dateRange:'thisYear',desc:'Weekly lead intake volume'},
  {id:'r3',name:'Average Won Deal Value',icon:'📊',measure:'avgDealValue',groupBy:'month',chart:'number',dateRange:'thisMonth',desc:'Average value of won deals this month'},
  {id:'r4',name:'Deal Conversion Funnel',icon:'🔀',measure:'dealConversion',groupBy:'stage',chart:'funnel',dateRange:'thisYear',desc:'Stage-by-stage conversion rates'},
  {id:'r5',name:'Revenue by Salesperson',icon:'🏆',measure:'dealValue',groupBy:'owner',chart:'bar',dateRange:'thisMonth',desc:'Won revenue per rep this month'},
  {id:'r6',name:'Lead Sources',icon:'📍',measure:'leadCount',groupBy:'source',chart:'pie',dateRange:'thisYear',desc:'Lead volume by acquisition channel'},
  {id:'r7',name:'Pipeline Value',icon:'📈',measure:'pipelineValue',groupBy:'stage',chart:'bar',dateRange:'all',desc:'Current pipeline value by stage'},
  {id:'r8',name:'Email Open Rate',icon:'✉️',measure:'emailOpenRate',groupBy:'week',chart:'line',dateRange:'thisMonth',desc:'Email open rate over time'},
  {id:'r9', name:'Activities by Type',   icon:'🧩', measure:'activityCount', groupBy:'actType', chart:'pie', dateRange:'thisMonth', desc:'Breakdown of logged activities by kind'},
  {id:'r10',name:'Activities by Rep',    icon:'👥', measure:'activityCount', groupBy:'owner',   chart:'bar', dateRange:'thisMonth', desc:'Rep productivity — calls, meetings, quotes logged'},
  {id:'r11',name:'Activity Mix by Month',icon:'📆', measure:'activityCount', groupBy:'month',   chart:'bar', dateRange:'thisYear',  desc:'Sales vs operations vs admin activity over time'},
  {id:'r12',name:'Stalled Deals',        icon:'⏱️', measure:'idleDeals',     groupBy:'owner',   chart:'bar', dateRange:'all',       desc:'Open deals with no activity for 14+ days, by rep'},
  {id:'r13',name:'Rep Scorecard',        icon:'🏅', measure:'repScorecard',  groupBy:'owner',   chart:'table',dateRange:'thisMonth',desc:'Quotes, wins, losses, win % and avg deal per rep'},
  {id:'r14',name:'Lost Deal Reasons',    icon:'❌', measure:'lostReasons',   groupBy:'reason',  chart:'pie', dateRange:'thisYear',  desc:"Why we're losing deals"},
];
let rptActiveId    = 'r1';
let rptDateRange   = 'thisYear';
let rptEditing     = false;
let rptBuilderData = null;
let rptNewFilter   = {field:'',op:'',val:''};

function renderReports() {
  const {deals, leads, emailSent} = getState();
  const activeReport = SAVED_REPORTS.find(r=>r.id===rptActiveId) || SAVED_REPORTS[0];
  const reportDateRange = rptDateRange || activeReport.dateRange || 'thisYear';

  // ── Date range labels ──────────────────────────────────────────────────────
  const DATE_RANGES = [
    {id:'thisMonth',  label:'This month'},
    {id:'lastMonth',  label:'Last month'},
    {id:'thisQuarter',label:'This quarter'},
    {id:'last6months',label:'Last 6 months'},
    {id:'thisYear',   label:'This year'},
    {id:'all',        label:'All time'},
  ];

  const now = new Date();
  const activeRange = DATE_RANGES.find(r=>r.id===reportDateRange)||DATE_RANGES[4];

  // ── Chart type icons ───────────────────────────────────────────────────────
  const RPT_CHART_ICONS = {bar:'📊',line:'📈',pie:'🥧',number:'🔢',funnel:'🔀',table:'📋'};
  const RPT_CHART_LABELS = {bar:'Bar',line:'Line',pie:'Pie',number:'Number',funnel:'Funnel',table:'Table'};

  // ── Compute data ───────────────────────────────────────────────────────────
  const data = rptComputeData(activeReport, reportDateRange);

  // ── Quick KPI strip ────────────────────────────────────────────────────────
  const inMonth = ds => { if(!ds) return false; const d=new Date(ds+'T12:00'); return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth(); };
  const monthWon = deals.filter(d=>d.won&&inMonth(d.wonDate));
  const monthWonVal = monthWon.reduce((s,d)=>s+d.val,0);
  const yearWon = deals.filter(d=>d.won&&d.wonDate&&d.wonDate.startsWith(String(now.getFullYear())));
  const yearWonVal = yearWon.reduce((s,d)=>s+d.val,0);

  // Conversion Rate KPI — scoped to the active date range so it reflects
  // what's happening *now*, not the cumulative all-time ratio (which only
  // ever decreases as ancient un-converted leads accumulate).
  const _ry = now.getFullYear(), _rm = now.getMonth();
  const _rangeStart =
    reportDateRange==='thisMonth'    ? new Date(_ry, _rm, 1) :
    reportDateRange==='lastMonth'    ? new Date(_ry, _rm-1, 1) :
    reportDateRange==='thisQuarter'  ? new Date(_ry, Math.floor(_rm/3)*3, 1) :
    reportDateRange==='last6months'  ? new Date(_ry, _rm-5, 1) :
    reportDateRange==='all'          ? new Date(1970, 0, 1) :
                                       new Date(_ry, 0, 1); // thisYear
  const _rangeEnd =
    reportDateRange==='thisMonth' ? new Date(_ry, _rm+1, 0, 23,59,59) :
    reportDateRange==='lastMonth' ? new Date(_ry, _rm, 0, 23,59,59) :
    reportDateRange==='all'       ? new Date(2999, 11, 31) :
                                    new Date(_ry, 11, 31, 23,59,59);
  const _rangeLeads = leads.filter(l => {
    if (!l.created) return false;
    const d = new Date(l.created+'T12:00');
    return d >= _rangeStart && d <= _rangeEnd;
  });
  const _rangeConverted = _rangeLeads.filter(l => l.converted);
  const convPct = _rangeLeads.length ? Math.round(_rangeConverted.length/_rangeLeads.length*100) : 0;

  return `
  <!-- ── Header ── -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">Reports & Insights</h1>
      <p style="color:#6b7280;font-size:12px;margin:0">Showing: <strong>${activeRange.label}</strong></p>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <!-- Date range selector -->
      <div style="display:flex;background:#f3f4f6;border-radius:10px;padding:3px;gap:2px;flex-wrap:wrap">
        ${DATE_RANGES.map(dr=>`<button data-action="email-report-date-range" data-date-range="${dr.id}"
          style="padding:5px 12px;border-radius:8px;border:none;font-size:11px;font-weight:${reportDateRange===dr.id?700:500};cursor:pointer;font-family:inherit;background:${reportDateRange===dr.id?'#fff':'transparent'};color:${reportDateRange===dr.id?'#1a1a1a':'#6b7280'};box-shadow:${reportDateRange===dr.id?'0 1px 4px rgba(0,0,0,.1)':'none'};white-space:nowrap">${dr.label}</button>`).join('')}
      </div>
      <button class="btn-w" data-action="email-export-csv" style="font-size:12px;gap:5px">${Icon({n:'download',size:13})} Export</button>
    </div>
  </div>

  <!-- ── Quick KPI strip ── -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin-bottom:18px">
    ${[
      ['This Month Revenue', '$'+Math.round(monthWonVal/1000)+'K', monthWon.length+' deals won', '#c41230','#fee2e2'],
      ['This Year Revenue',  '$'+Math.round(yearWonVal/1000)+'K',  yearWon.length+' deals total','#15803d','#dcfce7'],
      ['Conversion Rate',    convPct+'%', _rangeConverted.length+' / '+_rangeLeads.length+' leads','#1d4ed8','#dbeafe'],
      ['Avg Deal Value',     '$'+Math.round(yearWon.reduce((s,d)=>s+d.val,0)/Math.max(yearWon.length,1)/1000*10)/10+'K', 'This year','#b45309','#fef3c7'],
    ].map(([l,v,s,tc,bg])=>`<div class="card" style="padding:14px 16px">
      <div style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">${l}</div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;color:${tc}">${v}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px">${s}</div>
    </div>`).join('')}
  </div>

  <!-- ── Main content: report list + active chart ── -->
  <div style="display:flex;gap:0;height:calc(100vh - 240px);margin:-24px;margin-top:0;overflow:hidden">

    <!-- LEFT sidebar: report list -->
    <div style="width:220px;border-right:1px solid #e5e7eb;overflow-y:auto;background:#fff;flex-shrink:0">
      <div style="padding:10px 12px;border-bottom:1px solid #f0f0f0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af">Reports</div>
      </div>
      ${SAVED_REPORTS.map(r=>`
        <button data-action="email-report-select" data-report-id="${r.id}"
          style="width:100%;text-align:left;padding:10px 14px;border:none;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f9fafb;border-left:3px solid ${rptActiveId===r.id?'#c41230':'transparent'};background:${rptActiveId===r.id?'#fff5f6':'#fff'};color:${rptActiveId===r.id?'#c41230':'#374151'}"
          onmouseover="if('${r.id}'!==rptActiveId){this.style.background='#fafafa';}" onmouseout="if('${r.id}'!==rptActiveId){this.style.background='#fff';}">
          <span style="font-size:16px">${r.icon||'📊'}</span>
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:${rptActiveId===r.id?700:500};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name}</div>
            <div style="font-size:10px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${RPT_CHART_ICONS[r.chart]||'📊'} ${RPT_CHART_LABELS[r.chart]||'Chart'}</div>
          </div>
        </button>`).join('')}
      <div style="padding:10px 12px;margin-top:4px">
        <button data-action="email-report-new" class="btn-r" style="width:100%;justify-content:center;font-size:12px;gap:5px">${Icon({n:'plus',size:12})} New Report</button>
      </div>
    </div>

    <!-- RIGHT: Active chart panel -->
    <div style="flex:1;overflow-y:auto;background:#f8f9fa;padding:22px">
      <!-- Chart header -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <span style="font-size:22px">${activeReport?activeReport.icon:'📊'}</span>
            <h2 style="font-size:18px;font-weight:700;margin:0;font-family:Syne,sans-serif">${activeReport?activeReport.name:'Select a report'}</h2>
          </div>
          <div style="font-size:12px;color:#9ca3af">${activeReport?activeReport.desc:''} · ${activeRange.label}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <div style="display:flex;background:#f3f4f6;border-radius:8px;padding:3px;gap:2px">
            ${['bar','line','pie','funnel','number','table'].map(ct=>`<button data-action="email-report-chart-type" data-chart-type="${ct}"
              style="padding:4px 8px;border-radius:6px;border:none;font-size:11px;cursor:pointer;font-family:inherit;background:${(activeReport?.chart||'bar')===ct?'#fff':'transparent'};color:${(activeReport?.chart||'bar')===ct?'#1a1a1a':'#9ca3af'}" title="${RPT_CHART_LABELS[ct]||ct}">
              ${RPT_CHART_ICONS[ct]||ct}
            </button>`).join('')}
          </div>
        </div>
      </div>

      <!-- Chart area -->
      <div class="card" style="padding:22px;overflow:hidden">
        ${activeReport ? rptRenderChart(activeReport, data) : '<div style="padding:40px;text-align:center;color:#9ca3af">Select a report from the list</div>'}
      </div>

      <!-- Data table below chart -->
      ${data.length > 0 && activeReport?.chart !== 'table' ? `
      <div class="card" style="overflow:hidden;margin-top:14px">
        <div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Data Table</div>
        <div style="overflow-x:auto;max-height:240px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead><tr style="background:#f9fafb;position:sticky;top:0">
              ${Object.keys(data[0]||{}).filter(k=>k!=='col'&&!k.startsWith('col_')).map(k=>`<th style="padding:8px 14px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;border-bottom:1px solid #e5e7eb;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap">${k}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${data.map((row,i)=>`<tr style="${i%2===0?'':'background:#f9fafb'}">
                ${Object.entries(row).filter(([k])=>k!=='col'&&!k.startsWith('col_')).map(([k,v])=>`<td style="padding:8px 14px;border-bottom:1px solid #f0f0f0;color:#374151">${typeof v==='number'&&k!=='pct'?v>999?'$'+Math.round(v).toLocaleString():v:v||'—'}</td>`).join('')}
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}
    </div>
  </div>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ──────────────── TODO 2026-05-02: extract to its own module (NOT email-related) ──────────────
// CUSTOM FIELDS — will be extracted to a dedicated custom fields module
// ══════════════════════════════════════════════════════════════════════════════
function renderCFValue(field, rawVal) {
  if (rawVal === undefined || rawVal === null || rawVal === '') return '<span style="color:#d1d5db;font-style:italic">—</span>';
  if (field.type === 'checkbox') return rawVal ? '<span style="color:#15803d;font-weight:600">✓ Yes</span>' : '<span style="color:#9ca3af">No</span>';
  if (field.type === 'monetary') return '<span style="font-weight:600">$' + Number(rawVal).toLocaleString() + '</span>';
  if (field.type === 'multiselect') return (Array.isArray(rawVal) ? rawVal : [rawVal]).map(v => '<span class="tag">' + v + '</span>').join(' ');
  if (field.type === 'url') return '<a href="' + rawVal + '" target="_blank" style="color:#3b82f6;font-size:12px">' + rawVal + '</a>';
  return '<span style="font-size:13px">' + rawVal + '</span>';
}

function renderCFInput(field, currentVal, onchangeExpr) {
  const v = currentVal !== undefined && currentVal !== null ? currentVal : (field.type === 'checkbox' ? false : field.type === 'multiselect' ? [] : '');
  const escapedExpr = onchangeExpr.replace(/"/g, '&quot;');
  if (field.type === 'textarea')
    return '<textarea class="inp" style="font-size:12px;resize:vertical;font-family:inherit;min-height:60px" data-action="email-textarea-change" data-onchange-expr="' + escapedExpr + '">' + v + '</textarea>';
  if (field.type === 'checkbox')
    return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" ' + (v ? 'checked' : '') + ' data-action="email-checkbox-change" data-onchange-expr="' + escapedExpr.replace(/this\.value/g, 'this.checked') + '" style="accent-color:#c41230;width:16px;height:16px"> <span style="font-size:13px">Yes</span></label>';
  if (field.type === 'dropdown' && field.options && field.options.length > 0)
    return '<select class="sel" style="font-size:12px" data-action="email-select-change" data-onchange-expr="' + escapedExpr + '">' +
      '<option value="">Select…</option>' +
      field.options.map(o => '<option value="' + o + '" ' + (v === o ? 'selected' : '') + '>' + o + '</option>').join('') +
      '</select>';
  if (field.type === 'multiselect' && field.options && field.options.length > 0) {
    const sel = Array.isArray(v) ? v : [];
    return '<select class="sel" multiple style="font-size:12px;height:80px" data-action="email-select-change" data-onchange-expr="' + escapedExpr + '">' +
      field.options.map(o => '<option value="' + o + '" ' + (sel.includes(o) ? 'selected' : '') + '>' + o + '</option>').join('') +
      '</select>';
  }
  const typeMap = {text:'text',number:'number',monetary:'number',date:'date',phone:'tel',email:'email',url:'url'};
  return '<input class="inp" type="' + (typeMap[field.type] || 'text') + '" value="' + v + '" style="font-size:12px" data-action="email-input-change" data-onchange-expr="' + escapedExpr + '">';
}

// Render all custom fields for a record (deal or job), editable click-to-edit
function renderCustomFieldsBlock(fields, fieldValues, entityId, entityType) {
  if (!fields || fields.length === 0) return '';
  const sorted = [...fields].sort((a, b) => a.ord - b.ord);
  return '<div class="card" style="padding:16px">' +
    '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:12px">Custom Fields</div>' +
    sorted.map(field => {
      const val = fieldValues && fieldValues[entityId] ? fieldValues[entityId][field.id] : undefined;
      const inputId = 'cf_' + entityId + '_' + field.id;
      return '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:8px 0;border-bottom:1px solid #f9fafb;gap:10px">' +
        '<span style="font-size:12px;color:#9ca3af;flex-shrink:0;width:130px;padding-top:2px">' + field.label + (field.required ? '<span style="color:#c41230">*</span>' : '') + '</span>' +
        '<div style="flex:1;min-width:0" id="' + inputId + '_display" data-action="email-custom-field-edit" data-entity-id="' + entityId + '" data-field-id="' + field.id + '" data-entity-type="' + entityType + '" style="cursor:pointer">' +
        renderCFValue(field, val) +
        '</div>' +
        '</div>';
    }).join('') +
    '</div>';
}

function cfStartEdit(entityId, fieldId, entityType) {
  const s = getState();
  const fKeyMap = {deal:'dealFields',lead:'leadFields',contact:'contactFields',job:'jobFields'};
  const vKeyMap = {deal:'dealFieldValues',lead:'leadFieldValues',contact:'contactFieldValues',job:'jobFieldValues'};
  const fields = s[fKeyMap[entityType]]||[];
  const fv = s[vKeyMap[entityType]]||{};
  const field = fields.find(f => f.id === fieldId);
  if (!field) return;
  const currentVal = fv[entityId] ? fv[entityId][fieldId] : undefined;
  const inputId = 'cf_' + entityId + '_' + fieldId + '_display';
  const el = document.getElementById(inputId);
  if (!el) return;
  const saveExpr = "cfSaveEdit('" + entityId + "','" + fieldId + "','" + entityType + "',this.value)";
  el.innerHTML = renderCFInput(field, currentVal, saveExpr) +
    '<div style="display:flex;gap:6px;margin-top:6px">' +
    '<button data-action="email-custom-field-save" data-entity-id="' + entityId + '" data-field-id="' + fieldId + '" data-entity-type="' + entityType + '" class="btn-r" style="font-size:11px;padding:3px 10px">Save</button>' +
    '<button data-action="email-cancel-edit" class="btn-w" style="font-size:11px;padding:3px 10px">Cancel</button>' +
    '</div>';
  var inp = el.querySelector('input,textarea,select');
  if (inp) inp.focus();
}

function cfSaveFromEl(entityId, fieldId, entityType) {
  var el = document.getElementById('cf_' + entityId + '_' + fieldId + '_display');
  if (!el) return;
  var inp = el.querySelector('input,textarea,select');
  if (!inp) return;
  var value;
  if (inp.type === 'checkbox') value = inp.checked;
  else if (inp.multiple) value = Array.from(inp.selectedOptions).map(function(o){return o.value;});
  else value = inp.value;
  cfSaveEdit(entityId, fieldId, entityType, value);
}

function cfSaveEdit(entityId, fieldId, entityType, value) {
  var s = getState();
  var vKeyMap = {deal:'dealFieldValues',lead:'leadFieldValues',contact:'contactFieldValues',job:'jobFieldValues'};
  var key = vKeyMap[entityType]||'dealFieldValues';
  var allVals = s[key]||{};
  var prev = allVals[entityId] || {};
  setState({[key]: {...allVals, [entityId]: {...prev, [fieldId]: value}}});
  addToast('Field updated', 'success');
}
