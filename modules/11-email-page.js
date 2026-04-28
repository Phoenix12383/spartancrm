// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 11-email-page.js
// Extracted from original index.html lines 7711-9132
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE MAPS ADDRESS AUTOCOMPLETE
// ══════════════════════════════════════════════════════════════════════════════
var _mapsLoaded = false;
var _mapsLoading = false;
var _mapsLoadError = '';  // Last error message, shown in forms if load fails
var _mapsAuthFailure = false; // Set by Google's gm_authFailure callback
var _mapsLoadStartTime = 0;

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

// ── Composer modal ────────────────────────────────────────────────────────────
function openGmailComposer(to, entityId, entityType, subject) {
  gmailComposerOpen = true;
  gmailComposerData = { to: to||'', subject: subject||'', body: '', cc: '', bcc: '', entityId, entityType };
  renderPage();
}

function renderGmailComposer() {
  const d = gmailComposerData;
  const { gmailUser } = getState();
  return `
  <div class="modal-bg" onclick="if(event.target===this){gmailComposerOpen=false;renderPage()}">
    <div class="modal" style="max-width:620px;width:95vw">
      <!-- Composer header -->
      <div style="background:#1a1a1a;padding:14px 20px;border-radius:16px 16px 0 0;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;align-items:center;gap:10px">
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
          <span style="color:#fff;font-size:14px;font-weight:600;font-family:Syne,sans-serif">New Email</span>
          ${gmailUser?`<span style="font-size:12px;color:#9ca3af">from ${gmailUser.email}</span>`:''}
        </div>
        <button onclick="gmailComposerOpen=false;renderPage()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1">×</button>
      </div>

      <!-- Fields -->
      <div style="padding:0">
        ${[['To','to','email'],['Cc','cc','email'],['Subject','subject','text']].map(([label,field,type])=>`
          <div style="display:flex;align-items:center;border-bottom:1px solid #f0f0f0;padding:0 20px">
            <span style="font-size:12px;color:#9ca3af;width:60px;flex-shrink:0;font-weight:500">${label}</span>
            <input id="gc_${field}" type="${type}" value="${d[field]||''}" oninput="gmailComposerData.${field}=this.value"
              style="flex:1;border:none;outline:none;font-size:13px;font-family:inherit;padding:12px 0;background:transparent;color:#1a1a1a">
          </div>`).join('')}

        <!-- Body -->
        <div style="padding:4px 20px 0">
          <textarea id="gc_body" rows="12" oninput="gmailComposerData.body=this.value"
            placeholder="Write your email here…"
            style="width:100%;border:none;outline:none;font-size:14px;font-family:inherit;resize:none;line-height:1.7;color:#1a1a1a;background:transparent;padding:16px 0">${d.body||''}</textarea>
        </div>

        <!-- Signature preview -->
        <div style="padding:0 20px 10px;border-top:1px solid #f9fafb;margin-top:4px">
          <div style="font-size:12px;color:#9ca3af;line-height:1.6;padding-top:10px">--<br>
            ${gmailUser?`<strong style="color:#374151">${gmailUser.name}</strong><br>Spartan Double Glazing<br>${gmailUser.email}`:'Spartan Double Glazing'}
          </div>
        </div>
      </div>

      <!-- Footer toolbar -->
      <div style="padding:12px 20px;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-r" onclick="gmailSendFromComposer()" style="font-size:13px;padding:8px 20px;gap:8px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            Send
          </button>
          <button onclick="gmailComposerOpen=false;renderPage()" class="btn-w" style="font-size:13px">Discard</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <label style="display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#6b7280;cursor:pointer">
            <input type="file" id="gc_attach" multiple style="display:none">
            <button onclick="document.getElementById('gc_attach').click()" class="btn-g" style="font-size:12px;padding:5px 10px">📎 Attach</button>
          </label>
        </div>
      </div>
    </div>
  </div>`;
}

function gmailSendFromComposer() {
  // Read current values from DOM inputs
  const to      = document.getElementById('gc_to')?.value.trim()      || gmailComposerData.to;
  const cc      = document.getElementById('gc_cc')?.value.trim()      || gmailComposerData.cc;
  const subject = document.getElementById('gc_subject')?.value.trim() || gmailComposerData.subject;
  const body    = document.getElementById('gc_body')?.value.trim()    || gmailComposerData.body;
  if (!to)      { addToast('Enter a recipient', 'error'); return; }
  if (!subject && !body) { addToast('Add a subject or body', 'error'); return; }
  gmailSend(to, subject, body, cc, gmailComposerData.entityId, gmailComposerData.entityType);
}

// ── Inbox / threads panel ─────────────────────────────────────────────────────
function renderGmailInbox(contactEmail) {
  const { emailThreads, gmailConnected } = getState();
  const threads = emailThreads[contactEmail] || [];

  return `
  <div class="card" style="overflow:hidden;margin-top:14px">
    <div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:13px;font-weight:700;display:flex;align-items:center;gap:8px">
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
        Gmail Threads
        ${threads.length > 0 ? `<span style="font-size:11px;color:#9ca3af">(${threads.length})</span>` : ''}
      </div>
      <div style="display:flex;gap:6px">
        ${gmailConnected && contactEmail ? `<button onclick="gmailFetchThreads('${contactEmail}','','contact')" class="btn-g" style="font-size:11px;padding:4px 8px">↻ Refresh</button>` : ''}
      </div>
    </div>
    ${!gmailConnected ? `
      <div style="padding:20px;text-align:center">
        <div style="font-size:24px;margin-bottom:8px">📧</div>
        <div style="font-size:13px;font-weight:500;color:#374151;margin-bottom:4px">Connect Gmail to see email history</div>
        <div style="font-size:12px;color:#9ca3af;margin-bottom:14px">All emails with this contact will appear here</div>
        <button onclick="gmailConnect()" class="btn-r" style="font-size:12px">
          <svg width="14" height="14" viewBox="0 0 24 24" style="margin-right:4px"><path fill="#fff" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
          Connect Gmail
        </button>
      </div>` :
    threads.length === 0 ? `
      <div style="padding:20px;text-align:center">
        <div style="font-size:13px;color:#9ca3af">No email threads found for ${contactEmail}</div>
        ${contactEmail ? `<button onclick="gmailFetchThreads('${contactEmail}','','contact')" class="btn-w" style="font-size:12px;margin-top:10px">Search Gmail</button>` : ''}
      </div>` :
    `<div>
      ${threads.map((t,i) => `
        <div style="padding:12px 16px;${i<threads.length-1?'border-bottom:1px solid #f9fafb':''}cursor:pointer;transition:background .1s" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="font-size:13px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(t.subject)}</div>
            <div style="font-size:11px;color:#9ca3af;flex-shrink:0">${t.date ? new Date(t.date).toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : ''}</div>
          </div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px">${_escHtml(t.from)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(t.snippet||'')}</div>
        </div>`).join('')}
    </div>`}
  </div>`;
}

// Initialise GIS when DOM ready
setTimeout(gmailInit, 500);




// ── Simple email shortcut functions (avoid complex inline onclick) ────────────


function quickReplyEmail(msgId) {
  const el = document.getElementById('quickReply_'+msgId);
  const txt = el ? el.value.trim() : '';
  if (!txt) { addToast('Write a reply first','error'); return; }
  const msg = [...getState().emailInbox,...getState().emailSent].find(m=>m.id===msgId);
  if (!msg) return;
  const replyTo = getState().emailInbox.find(m=>m.id===msgId) ? msg.from : msg.to;
  const replyName = getState().emailInbox.find(m=>m.id===msgId) ? (msg.fromName||msg.from) : (msg.toName||msg.to);
  emailOpenCompose(replyTo, replyName, 'Re: '+(msg.subject||''), txt, msg.dealId||null, msg.contactId||null, msg.leadId||null, null, msgId);
  setState({page:'email'});
}

function emailFromTabForm(entityId, entityType, defaultTo) {
  const subj = document.getElementById('emailSubj_'+entityId)?.value||'';
  const body = document.getElementById('tabInput_'+entityId)?.value||'';
  const to   = document.getElementById('emailTo_'+entityId)?.value || defaultTo || '';
  if (entityType==='deal') emailFromDeal(entityId);
  else if (entityType==='lead') emailFromLead(entityId);
  else emailFromContact(entityId);
  // Pre-fill subject if already typed
  if (subj) setTimeout(()=>{ const el=document.getElementById('ec_subject'); if(el) el.value=subj; },100);
  if (body) setTimeout(()=>{ const el=document.getElementById('ec_body'); if(el) el.value=body; },100);
}

function emailFromDeal(dealId) {
  const {deals, contacts} = getState();
  const d = deals.find(x=>x.id===dealId);
  if (!d) return;
  const c = contacts.find(x=>x.id===d.cid);
  emailOpenCompose(c?c.email:'', c?c.fn+' '+c.ln:'', '', '', dealId, c?c.id:null, null, null, null);
  setState({page:'email'});
}
function emailFromLead(leadId) {
  const {leads} = getState();
  const l = leads.find(x=>x.id===leadId);
  if (!l) return;
  emailOpenCompose(l.email||'', l.fn+' '+l.ln, '', '', null, null, leadId, null, null);
  setState({page:'email'});
}
function emailFromContact(contactId) {
  const {contacts} = getState();
  const c = contacts.find(x=>x.id===contactId);
  if (!c) return;
  emailOpenCompose(c.email||'', c.fn+' '+c.ln, '', '', null, contactId, null, null, null);
  setState({page:'email'});
}
function emailReplyFromActivity(actId, entityId, entityType) {
  const acts = getEntityActivities(entityId, entityType);
  const act = acts.find(a=>a.id===actId);
  if (!act) return;
  const {deals, contacts, leads} = getState();
  let to='', toName='', cid=null, lid=null, did=null;
  if (entityType==='deal') {
    const d = deals.find(x=>x.id===entityId);
    if (d) { const c=contacts.find(x=>x.id===d.cid); to=c?c.email:''; toName=c?c.fn+' '+c.ln:''; cid=c?c.id:null; did=entityId; }
  } else if (entityType==='lead') {
    const l = leads.find(x=>x.id===entityId);
    if (l) { to=l.email||''; toName=l.fn+' '+l.ln; lid=entityId; }
  } else {
    const c = contacts.find(x=>x.id===entityId);
    if (c) { to=c.email||''; toName=c.fn+' '+c.ln; cid=entityId; }
  }
  emailOpenCompose(to, toName, 'Re: '+(act.subject||''), '', did, cid, lid, null, actId);
  setState({page:'email'});
}

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL PAGE — Pipedrive-style inbox + composer + templates + tracking
// ══════════════════════════════════════════════════════════════════════════════

let emailTemplateTab = 'all';   // all|sales|scheduling|post-sale|finance|marketing
let emailTrackingSort = 'date'; // date|opens|clicked
let emailSearchQ = '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function emailGetLinkedEntity(msg) {
  const s = getState();
  let deal = null, contact = null, lead = null;
  if (msg.dealId)    deal    = s.deals.find(d=>d.id===msg.dealId);
  if (msg.contactId) contact = s.contacts.find(c=>c.id===msg.contactId);
  if (msg.leadId)    lead    = s.leads.find(l=>l.id===msg.leadId);
  // Auto-match by email if not explicitly linked
  if (!contact && !lead) {
    const emailAddr = msg.from || msg.to;
    contact = s.contacts.find(c=>c.email===emailAddr);
    if (!contact) lead = s.leads.find(l=>l.email===emailAddr);
  }
  if (!deal && contact) deal = s.deals.find(d=>d.cid===contact.id);
  return {deal, contact, lead};
}

var MERGE_FIELDS = [
  {key:'firstName',label:'First Name',example:'Jane'},
  {key:'lastName',label:'Last Name',example:'Smith'},
  {key:'fullName',label:'Full Name',example:'Jane Smith'},
  {key:'email',label:'Customer Email',example:'jane@email.com'},
  {key:'phone',label:'Customer Phone',example:'0412 345 678'},
  {key:'company',label:'Company',example:'Superb Developments'},
  {key:'dealTitle',label:'Deal Title',example:'Smith — Richmond'},
  {key:'dealValue',label:'Deal Value',example:'$15,000'},
  {key:'suburb',label:'Suburb',example:'Richmond'},
  {key:'branch',label:'Branch',example:'VIC'},
  {key:'address',label:'Address',example:'123 Main St, Richmond VIC'},
  {key:'ownerName',label:'Your Name',example:'James Wilson'},
  {key:'ownerEmail',label:'Your Email',example:'james@spartandg.com.au'},
  {key:'ownerPhone',label:'Your Phone',example:'0412 111 001'},
  // Today / now — useful in email date stamps, NOT the same as appointment date.
  {key:'today',label:"Today's Date",example:'23 Apr 2026'},
  {key:'now',label:'Current Time',example:'10:30 AM'},
  {key:'date',label:'Date (alias of today)',example:'23 Apr 2026'},
  {key:'time',label:'Time (alias of now)',example:'10:30 AM'},
  // Appointment (when the contact has a scheduled appointment in MOCK_APPOINTMENTS).
  {key:'appointmentDate',label:'Appointment Date',example:'27 Apr 2026'},
  {key:'appointmentTime',label:'Appointment Time',example:'10:00 AM'},
  // Job (when the deal has been converted to a job).
  {key:'jobNumber',label:'Job Number',example:'SDG-VIC-1042'},
  // Invoice (newest unpaid invoice linked to the deal/job).
  {key:'invoiceNumber',label:'Invoice Number',example:'INV-VIC-2041'},
  {key:'invoiceAmount',label:'Invoice Amount',example:'$4,500'},
  {key:'invoiceDueDate',label:'Invoice Due Date',example:'15 May 2026'},
];

// Convert a custom-field label into a camelCase merge key.
// "Property Type"           → "propertyType"
// "How Did You Hear About Us?" → "howDidYouHearAboutUs"
function _fieldLabelToMergeKey(label) {
  if (!label) return '';
  var cleaned = String(label).replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  var parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(function(w, i) {
    var lower = w.toLowerCase();
    return i === 0 ? lower : (lower.charAt(0).toUpperCase() + lower.slice(1));
  }).join('');
}

// Given an entity, return the custom-field merge keys available for it,
// INCLUDING fields from the originating lead (for deals converted from leads).
// Used by the inline template picker's "Insert field…" dropdown.
// Deal values take precedence over lead values when labels collide.
function getEntityCustomMergeFields(entityId, entityType) {
  var s = getState();
  var out = [];
  var seen = {};
  function push(group, field, value) {
    var key = _fieldLabelToMergeKey(field.label);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push({ key: key, label: field.label, value: value, group: group });
  }
  if (entityType === 'deal') {
    var deal = s.deals.find(function(d){ return d.id === entityId; });
    var dfv = (s.dealFieldValues||{})[entityId] || {};
    (s.dealFields||[]).forEach(function(f){ push('Deal custom fields', f, dfv[f.id]); });
    if (deal) {
      // Trace back to the lead that was converted into this deal — expose its
      // web-enquiry custom fields under the same keys, losing ties to the deal.
      var origLead = s.leads.find(function(l){ return l.dealRef === deal.id; });
      if (origLead) {
        var lfv = (s.leadFieldValues||{})[origLead.id] || {};
        (s.leadFields||[]).forEach(function(f){ push('From web enquiry', f, lfv[f.id]); });
      }
    }
  } else if (entityType === 'lead') {
    var lfv2 = (s.leadFieldValues||{})[entityId] || {};
    (s.leadFields||[]).forEach(function(f){ push('Lead custom fields', f, lfv2[f.id]); });
  } else if (entityType === 'contact') {
    var cfv = (s.contactFieldValues||{})[entityId] || {};
    (s.contactFields||[]).forEach(function(f){ push('Contact custom fields', f, cfv[f.id]); });
  }
  return out;
}

function buildMergeContext(entityId, entityType) {
  var s = getState();
  var cu = getCurrentUser() || {name:'Admin',email:'',phone:''};
  var todayStr = new Date().toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  var nowStr = new Date().toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:true});
  var ctx = {
    ownerName: s.gmailUser ? s.gmailUser.name : cu.name,
    ownerEmail: s.gmailUser ? s.gmailUser.email : cu.email || '',
    ownerPhone: cu.phone || '',
    // {{date}} / {{time}} historically mean "today/now" in existing templates.
    // Keep that semantics for back-compat; templates that want the appointment
    // date should use {{appointmentDate}} / {{appointmentTime}} instead.
    today: todayStr,
    now: nowStr,
    date: todayStr,
    time: nowStr,
  };
  var contact = null;
  var deal = null;
  var lead = null;
  if (entityType === 'deal') {
    deal = s.deals.find(function(d){ return d.id === entityId; });
    if (deal) { ctx.dealTitle = deal.title; ctx.dealValue = fmt$(deal.val); ctx.suburb = deal.suburb || ''; ctx.branch = deal.branch || ''; contact = s.contacts.find(function(c){ return c.id === deal.cid; }); }
  } else if (entityType === 'lead') {
    lead = s.leads.find(function(l){ return l.id === entityId; });
    if (lead) { ctx.firstName = lead.fn; ctx.lastName = lead.ln; ctx.fullName = lead.fn + ' ' + lead.ln; ctx.email = lead.email; ctx.phone = lead.phone; ctx.suburb = lead.suburb || ''; ctx.branch = lead.branch || ''; ctx.dealValue = fmt$(lead.val); }
  } else if (entityType === 'contact') {
    contact = s.contacts.find(function(c){ return c.id === entityId; });
  }
  if (contact) { ctx.firstName = contact.fn; ctx.lastName = contact.ln; ctx.fullName = contact.fn + ' ' + contact.ln; ctx.email = contact.email; ctx.phone = contact.phone; ctx.company = contact.co || ''; ctx.suburb = contact.suburb || ''; ctx.address = [contact.street,contact.suburb,contact.state,contact.postcode].filter(Boolean).join(', '); ctx.branch = contact.branch || ''; }

  // ── Job lookup ────────────────────────────────────────────────────────────
  // A deal gets jobNumber via its jobRef; a lead with a converted deal can
  // trace forward the same way. {{address}} on jobs is often more precise
  // than the contact's address, so prefer the job's if present.
  var job = null;
  if (deal && deal.jobRef) {
    job = (s.jobs || []).find(function(j){ return j.jobNumber === deal.jobRef; });
  }
  if (!job && lead && lead.dealRef) {
    var leadDeal = s.deals.find(function(d){ return d.id === lead.dealRef; });
    if (leadDeal && leadDeal.jobRef) {
      job = (s.jobs || []).find(function(j){ return j.jobNumber === leadDeal.jobRef; });
    }
  }
  if (job) {
    ctx.jobNumber = job.jobNumber || job.id;
    var jAddr = [job.street, job.suburb, job.state, job.postcode].filter(Boolean).join(', ');
    if (jAddr) ctx.address = jAddr;
  }

  // ── Appointment lookup ────────────────────────────────────────────────────
  // MOCK_APPOINTMENTS keys off the client name string "Fn Ln". Match against
  // the resolved contact/lead name. Pick the earliest upcoming appointment
  // (or the most recent if no future ones).
  var apts = (typeof MOCK_APPOINTMENTS !== 'undefined' && Array.isArray(MOCK_APPOINTMENTS)) ? MOCK_APPOINTMENTS : [];
  var clientName = ctx.fullName || (contact ? (contact.fn + ' ' + contact.ln) : '') || (lead ? (lead.fn + ' ' + lead.ln) : '');
  if (clientName) {
    var lcName = clientName.trim().toLowerCase();
    var matched = apts.filter(function(a){ return (a.client || '').trim().toLowerCase() === lcName; });
    if (matched.length > 0) {
      var todayISO = new Date().toISOString().slice(0,10);
      var upcoming = matched.filter(function(a){ return a.date && a.date >= todayISO; });
      var pick = (upcoming.length > 0)
        ? upcoming.sort(function(a,b){ return (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')); })[0]
        : matched.sort(function(a,b){ return (b.date + (b.time||'')).localeCompare(a.date + (a.time||'')); })[0];
      if (pick) {
        // Render as en-AU long-form for visual consistency with {{today}}.
        try {
          ctx.appointmentDate = new Date(pick.date + 'T12:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
        } catch(e) { ctx.appointmentDate = pick.date; }
        ctx.appointmentTime = pick.time || '';
      }
    }
  }

  // ── Invoice lookup ────────────────────────────────────────────────────────
  // Prefer newest unpaid (status sent/overdue). Fall back to newest of any
  // status if none outstanding.
  var invoices = s.invoices || [];
  var relatedInvs = invoices.filter(function(i) {
    if (deal && i.dealId === deal.id) return true;
    if (job  && i.jobId  === job.id)  return true;
    if (job  && i.jobNumber && i.jobNumber === job.jobNumber) return true;
    return false;
  });
  if (relatedInvs.length > 0) {
    var unpaid = relatedInvs.filter(function(i){ return i.status === 'sent' || i.status === 'overdue'; });
    var pickInv = (unpaid.length > 0 ? unpaid : relatedInvs).sort(function(a,b){
      return (b.date || '').localeCompare(a.date || '');
    })[0];
    if (pickInv) {
      ctx.invoiceNumber = pickInv.invoiceNumber || pickInv.id || '';
      if (typeof pickInv.total === 'number') ctx.invoiceAmount = fmt$(pickInv.total);
      if (pickInv.dueDate) {
        try {
          ctx.invoiceDueDate = new Date(pickInv.dueDate + 'T12:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
        } catch(e) { ctx.invoiceDueDate = pickInv.dueDate; }
      }
    }
  }

  // Fold in custom-field values last so they're available as tokens like
  // {{propertyType}}, {{timeframe}}, {{numberOfWindows}}. getEntityCustomMergeFields
  // already handles the deal→lead trace-back and precedence.
  var cfs = getEntityCustomMergeFields(entityId, entityType);
  cfs.forEach(function(cf) {
    if (cf.value !== undefined && cf.value !== null && cf.value !== '' && ctx[cf.key] === undefined) {
      ctx[cf.key] = String(cf.value);
    }
  });
  return ctx;
}

// Resolve a token expression with optional fallback chain. Examples:
//   {{firstName}}                     → context.firstName
//   {{dealTitle|fullName}}            → dealTitle if set, else fullName
//   {{dealTitle|fullName|suburb}}     → first non-empty of the three
//   {{ dealTitle | fullName }}        → whitespace around | is tolerated
// If every key in the chain resolves to empty/undefined, return the ⚠️
// missing-placeholder using the FIRST key's humanised name.
function emailFillTemplate(template, context) {
  function _humanise(key) {
    return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }
  function _resolve(expr) {
    var keys = expr.split('|').map(function(s){ return s.trim(); }).filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var v = context[keys[i]];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }
    return '⚠️ [' + _humanise(keys[0] || expr) + ' — missing]';
  }
  // Allow letters, digits, underscores, pipe, and whitespace inside {{...}}.
  var tokenRegex = /\{\{([a-zA-Z0-9_|\s]+)\}\}/g;
  var body    = String(template.body    || '').replace(tokenRegex, function(_, expr){ return _resolve(expr); });
  var subject = String(template.subject || '').replace(tokenRegex, function(_, expr){ return _resolve(expr); });
  return { body: body, subject: subject };
}

// ── EMAIL SIGNATURES ──────────────────────────────────────────────────────────
function getSignature() {
  var cu = getCurrentUser();
  if (!cu) return '';
  var custom = localStorage.getItem('spartan_signature_' + cu.id);
  if (custom !== null) return custom;
  var s = getState();
  var name = s.gmailUser ? s.gmailUser.name : cu.name;
  var email = s.gmailUser ? s.gmailUser.email : cu.email || '';
  return '--\n' + name + '\nSpartan Double Glazing · 1300 912 161\n' + email;
}
function saveSignature(text) {
  var cu = getCurrentUser();
  if (!cu) return;
  localStorage.setItem('spartan_signature_' + cu.id, text);
  addToast('Signature saved', 'success');
  renderPage();
}

// ── CUSTOM TEMPLATES (user-created, stored in localStorage) ───────────────────
function getCustomTemplates() { try { return JSON.parse(localStorage.getItem('spartan_custom_templates') || '[]'); } catch(e){ return []; } }
function saveCustomTemplates(t) { localStorage.setItem('spartan_custom_templates', JSON.stringify(t)); }
function getAllTemplates() { return EMAIL_TEMPLATES.concat(getCustomTemplates()); }

var editingTemplateId = null;
var editingTemplateNew = false;

function openTemplateEditor(id) {
  if (id === 'new') { editingTemplateNew = true; editingTemplateId = null; }
  else { editingTemplateNew = false; editingTemplateId = id; }
  renderPage();
}
function closeTemplateEditor() { editingTemplateId = null; editingTemplateNew = false; renderPage(); }

function saveCustomTemplate() {
  var name = document.getElementById('tpl_name').value.trim();
  var subject = document.getElementById('tpl_subject').value.trim();
  var body = document.getElementById('tpl_body').value;
  var category = document.getElementById('tpl_category').value.trim() || 'Custom';
  if (!name || !subject) { addToast('Name and subject are required', 'error'); return; }
  var templates = getCustomTemplates();
  if (editingTemplateNew) {
    templates.push({ id: 'ct' + Date.now(), name: name, category: category, subject: subject, body: body, tags: [], opens: 0, clicks: 0, sent: 0, custom: true });
    addToast('Template created', 'success');
  } else {
    templates = templates.map(function(t) { return t.id === editingTemplateId ? { ...t, name: name, subject: subject, body: body, category: category } : t; });
    addToast('Template updated', 'success');
  }
  saveCustomTemplates(templates);
  editingTemplateId = null; editingTemplateNew = false;
  renderPage();
}
function deleteCustomTemplate(id) {
  if (!confirm('Delete this template?')) return;
  saveCustomTemplates(getCustomTemplates().filter(function(t) { return t.id !== id; }));
  addToast('Template deleted', 'warning');
  editingTemplateId = null; editingTemplateNew = false;
  renderPage();
}

// ════════════════════════════════════════════════════════════════════════════
// COMPOSER RICH-TEXT HELPERS (Brief 6 Phase 2)
// ════════════════════════════════════════════════════════════════════════════
//
// The composer body is a contenteditable div, not a textarea. These helpers
// drive the formatting toolbar above it, the merge-field inserter, and the
// inline image picker. State binding flows through `_ecOnInput` which writes
// the current innerHTML back to `state.emailComposeData.body`.
//
// document.execCommand is technically deprecated but every browser still
// supports it and the spec replacement (Selection / Range API) is roughly
// 20× the code for the same outcome. When the alternative ships and is
// well-supported, swap. TODO: track replacement progress.

// Sync helper. Some execCommand variants don't fire the `input` event
// reliably across browsers (Safari + insertImage in particular), so toolbar
// actions call this directly rather than relying on the listener.
function _ecOnInput() {
  var el = document.getElementById('ec_body');
  if (!el) return;
  var st = getState();
  if (!st.emailComposeData) return;
  st.emailComposeData.body = el.innerHTML;
}

// Toolbar wrapper. Restores focus to the editor (toolbar buttons use
// onmousedown=preventDefault to avoid stealing it in the first place, but
// belt-and-braces) before issuing the command, then syncs state.
function _ecExec(cmd, value) {
  var el = document.getElementById('ec_body');
  if (!el) return;
  if (document.activeElement !== el) el.focus();
  try { document.execCommand(cmd, false, value == null ? null : value); } catch (e) {}
  _ecOnInput();
}

// <b>/<i>/<u>/lists/headings/etc. — direct execCommand mappings.
function ecBold()       { _ecExec('bold'); }
function ecItalic()     { _ecExec('italic'); }
function ecUnderline()  { _ecExec('underline'); }
function ecBulletList() { _ecExec('insertUnorderedList'); }
function ecNumberList() { _ecExec('insertOrderedList'); }
// Toggles between <h3> and <p> so a second click on a heading line clears it.
function ecHeading() {
  var el = document.getElementById('ec_body'); if (!el) return;
  el.focus();
  // Detect whether the current block is already a heading; if so, revert to
  // paragraph. Otherwise apply h3 (fits inline-email size constraints
  // better than h1/h2; h4+ is too small).
  var sel = window.getSelection();
  var inHeading = false;
  if (sel && sel.rangeCount > 0) {
    var node = sel.getRangeAt(0).startContainer;
    while (node && node !== el) {
      if (node.nodeType === 1 && /^H[1-6]$/.test(node.tagName)) { inHeading = true; break; }
      node = node.parentNode;
    }
  }
  _ecExec('formatBlock', inHeading ? '<p>' : '<h3>');
}
function ecRemoveFormat() { _ecExec('removeFormat'); }

// Link insertion. Prompts for the URL — keeping the modal flow simple.
// Requires a non-empty selection so the user has something to attach the
// link to. If the link target doesn't have a scheme, prepend https:// so
// the sanitiser (Phase 1) doesn't reject it later.
function ecCreateLink() {
  var el = document.getElementById('ec_body'); if (!el) return;
  el.focus();
  var sel = window.getSelection();
  if (!sel || sel.toString().length === 0) {
    addToast('Select some text first, then click Link', 'info');
    return;
  }
  var url = window.prompt('Link URL:', 'https://');
  if (url == null) return; // user cancelled
  url = String(url).trim();
  if (url === '' || url === 'https://' || url === 'http://') return;
  // Auto-prepend https:// for bare domains so the sanitiser allow-list accepts it.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    if (url.indexOf('@') >= 0 && url.indexOf(' ') < 0) url = 'mailto:' + url;
    else url = 'https://' + url;
  }
  _ecExec('createLink', url);
}

// Inline image insertion. File picker → FileReader → data: URI → execCommand.
// Soft-cap at 1MB raw (which becomes ~1.3MB once base64-encoded into the MIME
// body — close to Gmail's practical per-message limit on long forwarded
// chains). Bigger images should be hosted somewhere and referenced by URL.
var EC_IMAGE_MAX_BYTES = 1024 * 1024; // 1 MiB
function ecInsertImage() {
  var el = document.getElementById('ec_body'); if (!el) return;
  // Save the current selection so we can restore it after the file picker
  // closes — file pickers blur the editor and discard the cursor position.
  el.focus();
  var sel = window.getSelection();
  var savedRange = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0).cloneRange() : null;

  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.style.display = 'none';
  input.onchange = function () {
    var f = input.files && input.files[0];
    document.body.removeChild(input);
    if (!f) return;
    if (f.size > EC_IMAGE_MAX_BYTES) {
      addToast('Image too large — max ' + Math.round(EC_IMAGE_MAX_BYTES / 1024) + 'KB. Resize or host the image and link to it instead.', 'error');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      var dataUri = ev.target.result;
      // Restore the saved cursor position before inserting.
      el.focus();
      if (savedRange) {
        var sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(savedRange);
      }
      _ecExec('insertImage', dataUri);
    };
    reader.onerror = function () { addToast('Could not read the image file', 'error'); };
    reader.readAsDataURL(f);
  };
  document.body.appendChild(input);
  input.click();
}

// Initial-load body normaliser. Drafts saved before Phase 2 are plain text
// (newlines as \n). Drafts saved after Phase 2 are HTML. Convert the
// first into safe HTML so it renders correctly on reopen; sanitise the
// second through the Phase 1 allow-list either way for security.
function _composerInitialBody(body) {
  if (body == null) return '';
  body = String(body);
  if (body === '') return '';
  if (body.indexOf('<') === -1) {
    return _escHtml(body).replace(/\r?\n/g, '<br>');
  }
  return _sanitizeHtml(body);
}

// ── INSERT MERGE FIELD ────────────────────────────────────────────────────────
var mergePickerOpen = false;
function toggleMergePicker() { mergePickerOpen = !mergePickerOpen; renderPage(); }
// Brief 6 Phase 2: insert a merge-field token at the caret in the
// contenteditable composer. Falls back to legacy textarea behaviour if
// `ec_body` happens to be a textarea (defensive — should never happen
// after Phase 2 ships).
function insertMergeField(key) {
  var el = document.getElementById('ec_body');
  if (!el) return;
  var tag = '{{' + key + '}}';
  if (el.tagName === 'TEXTAREA') {
    var start = el.selectionStart || el.value.length;
    el.value = el.value.slice(0, start) + tag + el.value.slice(start);
    getState().emailComposeData.body = el.value;
    el.focus();
    el.selectionStart = el.selectionEnd = start + tag.length;
  } else {
    // Contenteditable path. document.execCommand('insertText') inserts at
    // the caret + advances the cursor — which is exactly what we want for
    // a merge-field token. Refocus first so the insert lands in the editor
    // rather than in the merge picker button.
    el.focus();
    try { document.execCommand('insertText', false, tag); } catch (e) {
      // Older browser without insertText support — fall back to manual
      // range insertion.
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(tag));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.innerHTML += tag;
      }
    }
    _ecOnInput();
  }
  mergePickerOpen = false;
  renderPage();
}

function renderMergeFieldBar() {
  return '<div style="padding:6px 20px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;gap:8px;position:relative">'
    +'<button onclick="toggleMergePicker()" style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #c41230;background:#fff5f6;cursor:pointer;font-family:inherit;color:#c41230;font-weight:600;white-space:nowrap">{{ }} Insert Field</button>'
    +(mergePickerOpen ? '<div style="position:absolute;top:32px;left:20px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.12);z-index:200;width:280px;max-height:320px;overflow-y:auto;padding:8px">'
      +'<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;padding:4px 8px">Click to insert</div>'
      + MERGE_FIELDS.map(function(f) {
        return '<button onclick="insertMergeField(\'' + f.key + '\')" style="width:100%;text-align:left;padding:7px 10px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:12px;border-radius:6px;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'none\'">'
          +'<span style="font-weight:600;color:#374151">{{' + f.key + '}}</span>'
          +'<span style="font-size:11px;color:#9ca3af">' + f.label + '</span>'
          +'</button>';
      }).join('')
      +'</div>' : '')
    +'<span style="font-size:10px;color:#9ca3af;flex:1">Fields auto-fill with contact/deal data when you send</span>'
    +'</div>';
}

function emailOpenCompose(to, toName, subject, body, dealId, contactId, leadId, templateId, replyToId) {
  const clean = v => (!v || v==='null' || v==='undefined') ? null : v;
  setState({
    emailComposing: true,
    emailComposeData: {
      to:to||'', toName:toName||'', subject:subject||'', body:body||'', cc:'', bcc:'',
      dealId:clean(dealId), contactId:clean(contactId), leadId:clean(leadId),
      templateId:clean(templateId), replyToId:clean(replyToId)
    },
    emailFolder: getState().emailFolder||'inbox',
  });
  renderPage();
}

function emailCloseCompose() {
  setState({emailComposing:false});
}

function emailSendOrLog(skipGmail) {
  const s = getState();
  const d = s.emailComposeData;
  if (!d.to) { addToast('Enter a recipient','error'); return; }
  if (!d.subject && !d.body) { addToast('Add a subject or body','error'); return; }

  const newMsg = {
    id: 'es'+Date.now(),
    to: d.to, toName: d.toName || d.to,
    subject: d.subject, body: d.body,
    date: new Date().toISOString().slice(0,10),
    time: new Date().toTimeString().slice(0,5),
    opened: false, openedAt: null, clicked: false, opens: 0,
    dealId: d.dealId, contactId: d.contactId, leadId: d.leadId,
    templateId: d.templateId, status: 'sent',
    replyToId: d.replyToId || null,
  };

  setState({
    emailSent: [newMsg, ...s.emailSent],
    emailComposing: false,
    emailFolder: 'sent',
    emailSelectedId: newMsg.id,
  });

  // Also log to entity activity
  if (d.dealId || d.contactId || d.leadId) {
    const entityId   = d.dealId || d.contactId || d.leadId;
    const entityType = d.dealId ? 'deal' : d.contactId ? 'contact' : 'lead';
    saveActivityToEntity(entityId, entityType, {
      id: 'a'+Date.now(), type:'email',
      subject: d.subject, text: d.body,
      preview: d.body.slice(0,100),
      opens: 0, opened: false, openedAt: null,
      date: newMsg.date, time: newMsg.time,
      by: s.gmailUser ? s.gmailUser.name : (getCurrentUser()||{name:'Admin'}).name,
      done: false, dueDate: '',
    });
  }

  // Try Gmail send if connected
  if (!skipGmail && s.gmailConnected && s.gmailToken) {
    gmailSend(d.to, d.subject, d.body, d.cc, d.dealId||d.contactId||d.leadId||'', d.dealId?'deal':d.contactId?'contact':'lead');
    return;
  }
  addToast('Email logged ✓', 'success');
  renderPage();
}

function emailMarkRead(id) {
  setState({
    emailInbox: getState().emailInbox.map(m=>m.id===id?{...m,read:true}:m),
    emailSelectedId: id,
  });
}

function emailSelectSent(id) { setState({emailSelectedId:id, emailFolder:'sent'}); }

// Reply / Forward / Expand wrappers — take only the msg id and look up the
// full message from state. Avoids having to JS-string-escape subjects, bodies,
// and sender names when interpolating them into inline onclick handlers.
function replyToEmail(msgId) {
  var s = getState();
  var msg = [...s.emailInbox, ...s.emailSent, ...s.emailDrafts].find(m => m.id === msgId);
  if (!msg) return;
  emailOpenCompose(msg.from || '', msg.fromName || msg.from || '',
    'Re: ' + (msg.subject || ''), '',
    msg.dealId || null, msg.contactId || null, msg.leadId || null, null, msg.id);
}
function forwardEmail(msgId) {
  var s = getState();
  var msg = [...s.emailInbox, ...s.emailSent, ...s.emailDrafts].find(m => m.id === msgId);
  if (!msg) return;
  emailOpenCompose('', '', 'Fwd: ' + (msg.subject || ''),
    '---------- Forwarded message ----------\n' + (msg.body || ''),
    msg.dealId || null, msg.contactId || null, msg.leadId || null, null, null);
}

function emailUseTemplate(tmpl) {
  var s = getState();
  var entityId = s.emailComposeData.dealId || s.emailComposeData.leadId || s.emailComposeData.contactId || s.dealDetailId || s.leadDetailId || s.contactDetailId || '';
  var entityType = s.emailComposeData.dealId || s.dealDetailId ? 'deal' : s.emailComposeData.leadId || s.leadDetailId ? 'lead' : s.emailComposeData.contactId || s.contactDetailId ? 'contact' : '';
  var ctx = buildMergeContext(entityId, entityType);
  var filled = emailFillTemplate(tmpl, ctx);
  setState({
    emailComposing: true,
    emailComposeData: {...s.emailComposeData, subject:filled.subject, body:filled.body, templateId:tmpl.id},
  });
}

// ── MAIN PAGE RENDER ──────────────────────────────────────────────────────────
function renderEmailPage() {
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
        <button onclick="gmailConnect()" style="display:flex;align-items:center;gap:6px;padding:5px 14px;background:#fff;border:1px solid #e5e7eb;border-radius:20px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:500;color:#374151" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">
          <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#EA4335" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
          Connect Gmail
        </button>`}
      <div style="flex:1;min-width:160px;max-width:320px;position:relative">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none">${Icon({n:'search',size:13})}</span>
        <input id="emailSearchInput" class="inp" value="${emailSearchQ}" oninput="emailSearchQ=this.value;renderPage()" placeholder="Search emails…" style="padding-left:32px;font-size:12px;padding-top:7px;padding-bottom:7px">
      </div>
      <div style="margin-left:auto">
        <button onclick="emailOpenCompose('','','','',null,null,null,null,null)" class="btn-r" style="font-size:13px;gap:8px">
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
          <button onclick="setState({emailFolder:'${f.id}',emailSelectedId:null})"
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

// HTML-escape helper. Gmail bodies and subjects routinely contain raw HTML
// (angle brackets, tags, entities). Interpolating them unescaped into
// template literals breaks layout when a single `<div>` or `</div>` leaks
// through — notably the unclosed tag that was swallowing the read-pane column.
function _escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ════════════════════════════════════════════════════════════════════════════
// HTML SANITISER (Brief 6 Phase 1)
// ════════════════════════════════════════════════════════════════════════════
//
// _sanitizeHtml(html) — returns a safe HTML string suitable for innerHTML.
// Used to render inbound email bodies (and outbound activity-timeline echoes
// of those bodies) without escaping every tag to text. The reading pane
// previously called _escHtml on the entire body, which made every received
// HTML email look like raw markup. After this lands the pane shows formatted
// content while still defending against script injection.
//
// Threats explicitly mitigated:
//   - <script>, <style>, <iframe>, <object>, <embed>, <link>, <meta>, <base>,
//     <svg> (SVG can carry inline scripts) — removed entirely
//   - on* attributes (onclick, onerror, onload, …) — stripped
//   - javascript: / vbscript: URIs in href / src — rejected
//   - data:text/html, data:application/* in href — rejected
//   - data:image/svg+xml in img src (SVG carries scripts) — rejected
//   - url(javascript:…), expression(…), @import in style — rejected
//   - position:absolute/fixed in style — would let an attacker overlay UI
//
// What's preserved (allow-listed):
//   Block tags:    p, div, blockquote, h1-h6, hr, pre, table family
//   Inline tags:   span, b/strong, i/em, u, a, img, sub, sup, code, s/strike,
//                  br, font (legacy email)
//   List tags:     ul, ol, li
//   Attributes:    href/src (with scheme allow-list), alt/title/width/height,
//                  table sizing/alignment, font color/face/size, style
//                  (with property + value allow-list). All anchors get
//                  rel="noopener noreferrer" target="_blank" added so the
//                  parent window can't be hijacked via window.opener.
//
// Implementation: parse via the browser's native DOMParser (no library),
// walk the resulting tree, and either keep / unwrap / remove each node.
// The detached document means side-effecting tags like <iframe src> never
// fetch anything during sanitisation.
//
// Falls back to _escHtml on any parser error (better to show garbled text
// than expose unsanitised input).

var _SANITIZE_ALLOWED_TAGS = {
  P:1, BR:1, HR:1, B:1, STRONG:1, I:1, EM:1, U:1, S:1, STRIKE:1,
  A:1, IMG:1, SPAN:1, DIV:1,
  UL:1, OL:1, LI:1,
  H1:1, H2:1, H3:1, H4:1, H5:1, H6:1,
  BLOCKQUOTE:1, PRE:1, CODE:1, SUB:1, SUP:1,
  TABLE:1, TR:1, TD:1, TH:1, TBODY:1, THEAD:1, TFOOT:1, CAPTION:1, COLGROUP:1, COL:1,
  CENTER:1, FONT:1, SMALL:1
};

// Per-tag attribute allow-list. Tags not listed fall back to _SANITIZE_DEFAULT_ATTRS.
var _SANITIZE_ALLOWED_ATTRS = {
  A:    { href:1, title:1, name:1, style:1 },
  IMG:  { src:1, alt:1, title:1, width:1, height:1, style:1 },
  TABLE:{ width:1, height:1, cellpadding:1, cellspacing:1, border:1, align:1, bgcolor:1, style:1 },
  TD:   { width:1, height:1, align:1, valign:1, colspan:1, rowspan:1, bgcolor:1, style:1 },
  TH:   { width:1, height:1, align:1, valign:1, colspan:1, rowspan:1, bgcolor:1, style:1 },
  TR:   { align:1, valign:1, bgcolor:1, style:1 },
  COL:  { width:1, span:1, style:1 },
  COLGROUP: { width:1, span:1, style:1 },
  FONT: { color:1, face:1, size:1, style:1 },
  HR:   { style:1, align:1, size:1, width:1 },
  OL:   { type:1, start:1, style:1 },
  UL:   { type:1, style:1 }
};
var _SANITIZE_DEFAULT_ATTRS = { style:1, title:1 };

// Allow-listed CSS properties for inbound email styles. Conservative — when
// in doubt, leave the property out. Email clients do most of their styling
// via these so the visual fidelity stays high.
var _SANITIZE_ALLOWED_CSS_PROPS = {
  'color':1, 'background-color':1, 'background':1,
  'font':1, 'font-family':1, 'font-size':1, 'font-weight':1, 'font-style':1, 'font-variant':1,
  'line-height':1, 'letter-spacing':1, 'word-spacing':1,
  'text-align':1, 'text-decoration':1, 'text-transform':1, 'text-indent':1,
  'width':1, 'height':1, 'max-width':1, 'max-height':1, 'min-width':1, 'min-height':1,
  'margin':1, 'margin-top':1, 'margin-right':1, 'margin-bottom':1, 'margin-left':1,
  'padding':1, 'padding-top':1, 'padding-right':1, 'padding-bottom':1, 'padding-left':1,
  'border':1, 'border-top':1, 'border-right':1, 'border-bottom':1, 'border-left':1,
  'border-color':1, 'border-style':1, 'border-width':1, 'border-radius':1,
  'border-collapse':1, 'border-spacing':1,
  'display':1, 'vertical-align':1, 'white-space':1,
  'list-style':1, 'list-style-type':1, 'list-style-position':1
};

function _sanitizeHtml(html) {
  if (html == null) return '';
  if (typeof html !== 'string') html = String(html);
  if (html.length === 0) return '';
  try {
    // Parse in a sandboxed document. Note: <body> contents are a fragment;
    // we wrap in <!DOCTYPE><html><body> to get the full HTML5 parser
    // (entity decoding, auto-closing, etc.) without inheriting the live
    // document's CSP / base href.
    var doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body>' + html + '</body></html>',
      'text/html'
    );
    var body = doc && doc.body;
    if (!body) return '';
    _sanitizeWalk(body);
    return body.innerHTML;
  } catch (e) {
    // Parser failure (or DOMParser unavailable) — fall back to the safer
    // option of escape-everything rather than exposing the input unchanged.
    return _escHtml(html);
  }
}

// Walk children depth-first, mutating in place. Iteration is reverse-index
// so removals and unwraps don't shift the parts we haven't visited yet.
function _sanitizeWalk(node) {
  var children = node.childNodes;
  for (var i = children.length - 1; i >= 0; i--) {
    var child = children[i];
    var nt = child.nodeType;
    if (nt === 1) {
      // Element node
      var tag = child.tagName;
      if (!_SANITIZE_ALLOWED_TAGS[tag]) {
        // Disallowed: hard-remove for the dangerous set, unwrap (keep
        // children) for everything else so legitimate text inside an
        // unknown wrapper isn't silently lost.
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' ||
            tag === 'OBJECT' || tag === 'EMBED' || tag === 'LINK' ||
            tag === 'META' || tag === 'BASE' || tag === 'SVG' ||
            tag === 'FORM' || tag === 'INPUT' || tag === 'BUTTON' ||
            tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') {
          child.parentNode.removeChild(child);
        } else {
          // Unwrap: move children up, then remove the wrapper.
          while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
          child.parentNode.removeChild(child);
        }
      } else {
        _sanitizeAttrs(child);
        _sanitizeWalk(child);
      }
    } else if (nt === 8) {
      // Comment node — drop. No legitimate use in email body and they can
      // hide conditional-comment IE-targeted tricks.
      child.parentNode.removeChild(child);
    }
    // nt === 3 (text) — keep as-is. Text content is HTML-escaped on
    // serialise (innerHTML) so this is safe.
  }
}

function _sanitizeAttrs(el) {
  var tag = el.tagName;
  var allowed = _SANITIZE_ALLOWED_ATTRS[tag] || _SANITIZE_DEFAULT_ATTRS;
  var attrs = el.attributes;
  // Reverse-index so removals don't shift remaining attrs.
  for (var i = attrs.length - 1; i >= 0; i--) {
    var attr = attrs[i];
    var name = attr.name.toLowerCase();
    // Strip every event handler. The `on` prefix catches onclick, onerror,
    // onload, onmouseover, onmouseenter, onfocus, onblur, etc.
    if (name.indexOf('on') === 0) { el.removeAttribute(attr.name); continue; }
    // Strip any XML namespace attribute (xmlns, xml:base, …) — can be used
    // to inject SVG/MathML script semantics into otherwise-plain elements.
    if (name === 'xmlns' || name.indexOf('xml:') === 0 || name.indexOf('xmlns:') === 0) {
      el.removeAttribute(attr.name); continue;
    }
    // Drop anything not in the allow-list.
    if (!allowed[name]) { el.removeAttribute(attr.name); continue; }
    // Sanitise the values that need it.
    if (name === 'href') {
      var safeHref = _sanitizeUrl(attr.value, false);
      if (safeHref == null) { el.removeAttribute(attr.name); continue; }
      el.setAttribute(attr.name, safeHref);
    } else if (name === 'src') {
      var safeSrc = _sanitizeUrl(attr.value, tag === 'IMG');
      if (safeSrc == null) { el.removeAttribute(attr.name); continue; }
      el.setAttribute(attr.name, safeSrc);
    } else if (name === 'style') {
      var safeStyle = _sanitizeStyle(attr.value);
      if (safeStyle === '') { el.removeAttribute(attr.name); continue; }
      el.setAttribute('style', safeStyle);
    }
  }
  // Outbound link hardening: every <a> with an href gets rel="noopener
  // noreferrer" + target="_blank". This stops window.opener hijacking and
  // refers leaks, and ensures clicks open in a new tab rather than
  // navigating away from the CRM.
  if (tag === 'A' && el.getAttribute('href')) {
    el.setAttribute('rel', 'noopener noreferrer');
    el.setAttribute('target', '_blank');
  }
}

function _sanitizeUrl(value, isImg) {
  if (value == null) return null;
  var raw = String(value).trim();
  if (raw === '') return null;
  // Fragment / root-relative / path-relative URLs are always safe.
  var first = raw.charAt(0);
  if (first === '#' || first === '/' || first === '?' || first === '.') return raw;
  // Strip control chars + whitespace from the start of the value to defeat
  // bypasses like "java\nscript:..." or "  javascript:..."
  var cleaned = raw.replace(/[\x00-\x20]/g, '');
  if (cleaned === '') return null;
  var colon = cleaned.indexOf(':');
  if (colon < 0) return raw; // No scheme — relative URL, allow.
  // No '/' before the first ':' guarantees we have a scheme prefix.
  var slash = cleaned.indexOf('/');
  if (slash >= 0 && slash < colon) return raw; // path with colon — not a scheme
  var scheme = cleaned.slice(0, colon).toLowerCase();
  if (isImg) {
    // <img src> allows http(s) and a strict subset of data:image/*.
    if (scheme === 'http' || scheme === 'https') return raw;
    if (scheme === 'data') {
      // Allow only common raster image types. Reject SVG explicitly — it
      // can carry inline <script> elements that fire on render.
      if (/^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(cleaned)) return raw;
      return null;
    }
    return null;
  }
  // <a href> allows http, https, mailto, tel — that covers practically
  // every legitimate email link without opening data: or javascript:.
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') return raw;
  return null;
}

function _sanitizeStyle(value) {
  if (value == null) return '';
  var safe = [];
  String(value).split(';').forEach(function (decl) {
    decl = decl.trim();
    if (!decl) return;
    var colon = decl.indexOf(':');
    if (colon < 0) return;
    var prop = decl.slice(0, colon).trim().toLowerCase();
    var val  = decl.slice(colon + 1).trim();
    if (!val) return;
    if (!_SANITIZE_ALLOWED_CSS_PROPS[prop]) return;
    var lowerVal = val.toLowerCase();
    // Reject any value containing dangerous tokens. url() is rejected
    // entirely — even url(http://…) — since inbound email images can be
    // tracking pixels and we don't want background-image phoning home.
    if (lowerVal.indexOf('expression') >= 0) return;
    if (lowerVal.indexOf('javascript:') >= 0) return;
    if (lowerVal.indexOf('vbscript:') >= 0) return;
    if (lowerVal.indexOf('@import') >= 0) return;
    if (lowerVal.indexOf('url(') >= 0) return;
    // Reject angle brackets in values — paranoia against parser confusion.
    if (val.indexOf('<') >= 0 || val.indexOf('>') >= 0) return;
    safe.push(prop + ':' + val);
  });
  return safe.join(';');
}

// Top-level helper used at the email reading-pane and activity-timeline
// render sites. Distinguishes plain-text bodies (no tags at all) from
// HTML bodies, so plain-text emails preserve their newlines via
// white-space:pre-wrap while HTML emails control their own layout via
// the explicit tags they ship with. Without this branch, applying
// pre-wrap to HTML content adds spurious blank lines around block tags.
function _sanitizeEmailBody(body) {
  if (body == null) return '';
  body = String(body);
  if (body.indexOf('<') === -1) {
    return '<span style="white-space:pre-wrap">' + _escHtml(body) + '</span>';
  }
  return _sanitizeHtml(body);
}

// ── Email list ────────────────────────────────────────────────────────────────
function renderEmailList(msgs, folder, selectedId) {
  if (msgs.length===0) return `<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No emails here</div>`;
  return msgs.map(msg=>{
    const isInbox = folder==='inbox';
    const name = isInbox ? (msg.fromName||msg.from) : (msg.toName||msg.to);
    const isSelected = msg.id === selectedId;
    const isUnread = isInbox && !msg.read;
    const hasAttach = msg.attachments && msg.attachments.length > 0;
    const bodyPreview = (msg.body||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
    const subjShort = msg.subject ? msg.subject.slice(0,30) : '';
    return `<div onclick="${isInbox?`emailMarkRead('${msg.id}')`:`emailSelectSent('${msg.id}')`}"
      style="padding:14px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:${isSelected?'#fff5f6':isUnread?'#fafeff':'#fff'};border-left:3px solid ${isSelected?'#c41230':'transparent'}"
      onmouseover="this.style.background='${isSelected?'#fff5f6':'#f9fafb'}'" onmouseout="this.style.background='${isSelected?'#fff5f6':isUnread?'#fafeff':'#fff'}'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div style="font-size:13px;font-weight:${isUnread?700:500};color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${_escHtml(name)}</div>
        <div style="font-size:11px;color:#9ca3af;flex-shrink:0;margin-left:6px">${_escHtml(msg.time)}</div>
      </div>
      <div style="font-size:12px;font-weight:${isUnread?600:400};color:${isUnread?'#374151':'#6b7280'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">${_escHtml(msg.subject)}</div>
      <div style="font-size:11px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(bodyPreview)}…</div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        ${msg.dealId?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">Deal</span>`:''}
        ${msg.leadId?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#ede9fe;color:#6d28d9;font-weight:600">Lead</span>`:''}
        ${msg.contactId?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#dcfce7;color:#15803d;font-weight:600">Contact</span>`:''}
        ${hasAttach?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#e0f2fe;color:#0369a1;font-weight:600">\ud83d\udcce ${msg.attachments.length}</span>`:''}        ${folder==='sent'&&msg.opened?`<span class="etrack" style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f0fdf4;color:#15803d;display:inline-flex;align-items:center;gap:3px">👁 ${msg.opens||1}×<span class="etrack-tip">📧 <strong>${_escHtml(subjShort)}</strong><br>👁 Opened ${msg.opens||1} time${(msg.opens||1)!==1?'s':''}<br>📅 ${_escHtml(msg.openedAt||msg.date||'')}<br>👤 ${_escHtml(msg.toName||msg.to||'')}</span></span>`:folder==='sent'&&!msg.opened?`<span class="etrack" style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f3f4f6;color:#9ca3af">Not opened<span class="etrack-tip">📧 <strong>${_escHtml(subjShort)}</strong><br>❌ Not yet opened<br>📅 Sent: ${_escHtml(msg.date||'')}<br>👤 To: ${_escHtml(msg.toName||msg.to||'')}</span></span>`:''}
        ${isUnread?`<div style="width:7px;height:7px;border-radius:50%;background:#c41230;margin-left:auto;flex-shrink:0;margin-top:2px"></div>`:''}
      </div>
    </div>`;
  }).join('');
}

// ── Email detail view ─────────────────────────────────────────────────────────
function renderEmailDetail(msg) {
  const {deal, contact, lead} = emailGetLinkedEntity(msg);
  const isInbox = getState().emailInbox.find(m=>m.id===msg.id);
  const name = isInbox ? (msg.fromName||msg.from) : (msg.toName||msg.to);
  const emailAddr = isInbox ? msg.from : msg.to;
  const initial = _escHtml((name||'?')[0].toUpperCase());

  return `
  <div style="padding:24px;max-width:720px">
    <!-- Email header -->
    <div style="margin-bottom:20px">
      <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;line-height:1.3;font-family:Syne,sans-serif">${_escHtml(msg.subject)}</h2>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="width:36px;height:36px;border-radius:50%;background:#c41230;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initial}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${_escHtml(name)}</div>
          <div style="font-size:12px;color:#6b7280">${_escHtml(emailAddr)} · ${_escHtml(msg.date||'')} ${_escHtml(msg.time||'')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${isInbox?`<button onclick="replyToEmail('${msg.id}')" class="btn-w" style="font-size:12px;gap:5px">${Icon({n:'arr',size:13})} Reply</button>`:''}
          ${isInbox?`<button onclick="forwardEmail('${msg.id}')" class="btn-w" style="font-size:12px">Forward</button>`:''}
          ${!isInbox&&!msg.opened?`<span style="font-size:12px;color:#9ca3af;padding:5px 10px;background:#f3f4f6;border-radius:20px">Not opened</span>`:!isInbox&&msg.opened?`<span style="font-size:12px;color:#15803d;padding:5px 10px;background:#f0fdf4;border-radius:20px">✓ Opened ${msg.opens}×</span>`:''}
        </div>
      </div>
    </div>

    <!-- Tracking info (sent only) -->
    ${!isInbox&&msg.opened?`
    <div style="padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:22px">👁</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#15803d">Opened ${msg.opens}× time${msg.opens!==1?'s':''}</div>
            <div style="font-size:12px;color:#16a34a">Last opened: ${_escHtml(msg.openedAt||msg.date||'')}</div>
          </div>
          ${msg.clicked?`<div style="display:flex;align-items:center;gap:6px;padding:4px 12px;background:#dbeafe;border-radius:20px"><span>🔗</span><span style="font-size:12px;font-weight:600;color:#1d4ed8">Link clicked</span></div>`:''}
        </div>
      </div>
    </div>`:!isInbox?`
    <div style="padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:8px;color:#9ca3af;font-size:13px"><span>👁</span> Not yet opened</div>
    </div>`:''}

    <!-- Linked entities -->
    ${deal||contact||lead?`
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${deal?`<div onclick="setState({dealDetailId:'${deal.id}',page:'deals'})" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dbeafe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#1d4ed8" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${Icon({n:'deals',size:13})} ${_escHtml(deal.title)}</div>`:''}
      ${contact?`<div onclick="setState({contactDetailId:'${contact.id}',page:'contacts'})" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dcfce7;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#15803d" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${Icon({n:'contacts',size:13})} ${_escHtml(contact.fn)} ${_escHtml(contact.ln)}</div>`:''}
      ${lead?`<div onclick="setState({leadDetailId:'${lead.id}',page:'leads'})" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#ede9fe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#6d28d9" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${Icon({n:'leads',size:13})} ${_escHtml(lead.fn)} ${_escHtml(lead.ln)}</div>`:''}
    </div>`:''}

    <!-- Email body — escaped to prevent HTML injection (broken tags in inbound
         HTML emails would otherwise collapse the surrounding layout). -->
    <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;font-size:14px;line-height:1.8;color:#374151;font-family:'DM Sans',sans-serif;border:1px solid #f0f0f0;overflow:hidden">${_sanitizeEmailBody(msg.body||'')}</div>

    <!-- Attachments -->
    ${(msg.attachments && msg.attachments.length > 0) ? `
    <div style="margin-top:12px">
      <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px">\ud83d\udcce ${msg.attachments.length} Attachment${msg.attachments.length!==1?'s':''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${msg.attachments.map(function(att, idx){
          var icon = att.mimeType && att.mimeType.includes('image') ? '\ud83d\uddbc' : att.mimeType && att.mimeType.includes('pdf') ? '\ud83d\udcc4' : att.name && att.name.match(/\.(xlsx?|csv)$/i) ? '\ud83d\udcca' : '\ud83d\udcc1';
          var sizeStr = att.size > 1048576 ? (att.size/1048576).toFixed(1)+'MB' : att.size > 1024 ? Math.round(att.size/1024)+'KB' : att.size+'B';
          // Pass msg.id + attachment index through the handler so the lookup
          // can resolve the attachment from state — no need to escape names/ids
          // for JS-string context.
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;cursor:pointer;max-width:250px" onclick="downloadEmailAttachmentByIdx(\''+msg.id+'\','+idx+')">' +
            '<span style="font-size:18px">'+icon+'</span>' +
            '<div style="min-width:0"><div style="font-size:12px;font-weight:600;color:#0369a1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_escHtml(att.name)+'</div>' +
            '<div style="font-size:10px;color:#6b7280">'+sizeStr+'</div></div></div>';
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Quick reply -->
    ${isInbox?`
    <div style="margin-top:20px;border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="padding:10px 16px;background:#f9fafb;border-bottom:1px solid #f0f0f0;font-size:12px;color:#6b7280">Reply to ${_escHtml(msg.fromName||msg.from)}</div>
      <textarea id="quickReply_${msg.id}" rows="4" placeholder="Write a reply…" style="width:100%;padding:14px 16px;border:none;outline:none;font-size:13px;font-family:inherit;resize:none;color:#1a1a1a"></textarea>
      <div style="padding:10px 16px;background:#f9fafb;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;gap:6px">
          <button onclick="replyToEmail('${msg.id}')" class="btn-w" style="font-size:12px">Expand</button>
        </div>
        <button onclick="quickReplyEmail('${msg.id}')" class="btn-r" style="font-size:12px;gap:6px">${Icon({n:'send',size:13})} Send Reply</button>
      </div>
    </div>`:''}
  </div>`;
}

// Look up an attachment by msg id + attachment index and hand it off to the
// existing downloader. Keeps onclick handlers small and avoids having to
// JS-string-escape filenames that contain quotes/special characters.
function downloadEmailAttachmentByIdx(msgId, idx) {
  var s = getState();
  var msg = [...s.emailInbox, ...s.emailSent, ...s.emailDrafts].find(m => m.id === msgId);
  if (!msg || !msg.attachments || !msg.attachments[idx]) return;
  var att = msg.attachments[idx];
  if (typeof downloadGmailAttachment === 'function') {
    downloadGmailAttachment(att.messageId, att.attachmentId, att.name || 'attachment');
  }
}

// ── Template list ─────────────────────────────────────────────────────────────
function renderEmailTemplateList() {
  var all = getAllTemplates();
  var cats = ['all','Sales','Scheduling','Post-Sale','Finance','Marketing','Custom'];
  var filtered = emailTemplateTab==='all' ? all : all.filter(function(t){return t.category.toLowerCase()===emailTemplateTab.toLowerCase();});
  return `
    <div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;background:#fff;display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${cats.map(c=>`<button onclick="emailTemplateTab='${c.toLowerCase()}';renderPage()" style="padding:4px 10px;border-radius:20px;border:1px solid ${emailTemplateTab===c.toLowerCase()?'#c41230':'#e5e7eb'};background:${emailTemplateTab===c.toLowerCase()?'#fff5f6':'#fff'};color:${emailTemplateTab===c.toLowerCase()?'#c41230':'#6b7280'};font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">${c}</button>`).join('')}
      </div>
      <button onclick="openTemplateEditor('new')" class="btn-r" style="font-size:11px;padding:4px 12px;gap:4px">${Icon({n:'plus',size:12})} New Template</button>
    </div>
    ${filtered.map(t=>{
      var isSelected = getState().emailSelectedId===t.id;
      return `<div onclick="setState({emailSelectedId:'${t.id}'})"
        style="padding:14px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:${isSelected?'#fff5f6':'#fff'};border-left:3px solid ${isSelected?'#c41230':'transparent'}"
        onmouseover="this.style.background='${isSelected?'#fff5f6':'#f9fafb'}'" onmouseout="this.style.background='${isSelected?'#fff5f6':'#fff'}'">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:3px">${_escHtml(t.name)}</div>
          ${t.custom?'<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">Custom</span>':''}
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">${_escHtml(t.subject.slice(0,55))}\u2026</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f3f4f6;color:#6b7280;font-weight:600">${_escHtml(t.category)}</span>
          ${t.sent>0?`<span style="font-size:11px;color:#9ca3af">Sent ${t.sent}\u00d7</span><span style="font-size:11px;color:#15803d">\ud83d\udcec ${Math.round(t.opens/Math.max(t.sent,1)*100)}% open</span>`:''}
        </div>
      </div>`;
    }).join('')}`;
}

// ── Template detail ───────────────────────────────────────────────────────────
function renderEmailTemplateDetail(tmpl) {
  if (!tmpl) {
    // Check if we're editing
    if (editingTemplateNew || editingTemplateId) return renderTemplateEditor();
    return renderEmailEmpty();
  }
  if (editingTemplateNew || editingTemplateId) return renderTemplateEditor();

  var sentCount = Math.max(tmpl.sent||0, 1);
  return `
  <div style="padding:24px;max-width:700px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-size:18px;font-weight:700;margin:0 0 4px;font-family:Syne,sans-serif">${_escHtml(tmpl.name)}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#6b7280;font-weight:600">${_escHtml(tmpl.category)}</span>
          ${(tmpl.tags||[]).map(t=>`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#e0e7ff;color:#4338ca">${_escHtml(t)}</span>`).join('')}
          ${tmpl.custom?'<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">Custom</span>':''}
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="emailUseTemplate(getAllTemplates().find(t=>t.id==='${tmpl.id}'))" class="btn-r" style="font-size:13px;gap:6px">
          ${Icon({n:'edit',size:14})} Use Template
        </button>
        ${tmpl.custom?`<button onclick="openTemplateEditor('${tmpl.id}')" class="btn-w" style="font-size:12px">Edit</button><button onclick="deleteCustomTemplate('${tmpl.id}')" class="btn-w" style="font-size:12px;color:#b91c1c">Delete</button>`:''}
      </div>
    </div>

    <!-- Stats -->
    ${tmpl.sent>0?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${[['Sent',tmpl.sent,'#374151'],['Open rate',Math.round((tmpl.opens||0)/sentCount*100)+'%','#15803d'],['Click rate',Math.round((tmpl.clicks||0)/sentCount*100)+'%','#0369a1']].map(([l,v,col])=>`
        <div style="padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;text-align:center">
          <div style="font-size:22px;font-weight:800;color:${col};font-family:Syne,sans-serif">${v}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">${l}</div>
        </div>`).join('')}
    </div>`:''}

    <!-- Subject -->
    <div style="margin-bottom:16px;padding:12px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
      <div style="font-size:11px;color:#0369a1;font-weight:700;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Subject</div>
      <div style="font-size:14px;color:#1a1a1a">${_escHtml(tmpl.subject)}</div>
    </div>

    <!-- Body preview (escaped — template bodies may contain user-entered HTML) -->
    <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:12px;padding:20px 24px;font-size:14px;line-height:1.8;color:#374151;white-space:pre-wrap;font-family:'DM Sans',sans-serif">${_escHtml(tmpl.body||'')}</div>

    <!-- Merge fields legend -->
    <div style="margin-top:16px;padding:12px 16px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px">
      <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px">Available Merge Fields — auto-fill from contact/deal data</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${MERGE_FIELDS.map(f=>`<code style="font-size:11px;background:#fff;padding:2px 7px;border-radius:4px;border:1px solid #fde68a;color:#92400e" title="${f.label}: ${f.example}">{{${f.key}}}</code>`).join('')}
      </div>
    </div>
  </div>`;
}

function renderTemplateEditor() {
  var isNew = editingTemplateNew;
  var tmpl = isNew ? {name:'',subject:'',body:'',category:'Custom'} : getCustomTemplates().find(function(t){return t.id===editingTemplateId;}) || {name:'',subject:'',body:'',category:'Custom'};
  return `<div style="padding:24px;max-width:700px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:18px;font-weight:700;margin:0;font-family:Syne,sans-serif">${isNew?'Create Template':'Edit Template'}</h2>
      <button onclick="closeTemplateEditor()" class="btn-w" style="font-size:12px">Cancel</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Template Name *</label>
          <input class="inp" id="tpl_name" value="${_escHtml(tmpl.name)}" placeholder="e.g. Quote Follow-Up"></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Category</label>
          <select class="sel" id="tpl_category">${['Sales','Scheduling','Post-Sale','Finance','Marketing','Custom'].map(function(c){return '<option'+(tmpl.category===c?' selected':'')+'>'+c+'</option>';}).join('')}</select></div>
      </div>
      <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Subject Line *</label>
        <input class="inp" id="tpl_subject" value="${_escHtml(tmpl.subject)}" placeholder="Following up on your quote \u2014 {{dealTitle}}"></div>
      <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Body</label>
        <textarea class="inp" id="tpl_body" rows="12" style="resize:vertical;font-family:inherit;line-height:1.8" placeholder="Hi {{firstName}},\n\nYour email content here...\n\nKind regards,\n{{ownerName}}">${_escHtml(tmpl.body)}</textarea></div>
      <div style="padding:12px 16px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px">
        <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px">Available Merge Fields \u2014 click to copy</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${MERGE_FIELDS.map(function(f){return '<code style="font-size:11px;background:#fff;padding:2px 7px;border-radius:4px;border:1px solid #fde68a;color:#92400e;cursor:default" title="'+f.label+': e.g. '+f.example+'">{{'+f.key+'}}</code>';}).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button onclick="closeTemplateEditor()" class="btn-w">Cancel</button>
        <button onclick="saveCustomTemplate()" class="btn-r">${isNew?'Create Template':'Save Changes'}</button>
      </div>
    </div>
  </div>`;
}

// ── Tracking list ─────────────────────────────────────────────────────────────
function renderEmailTrackingList() {
  const sent = getState().emailSent;
  const sorted = [...sent].sort((a,b)=>b.date>a.date?1:-1);
  const openRate = sent.length>0?Math.round(sent.filter(m=>m.opened).length/sent.length*100):0;
  return `
    <div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;background:#fff">
      <div style="display:flex;gap:12px;font-size:12px">
        <span style="color:#15803d;font-weight:600">📬 ${openRate}% open rate</span>
        <span style="color:#6b7280">${sent.length} emails sent</span>
        <span style="color:#0369a1">${sent.filter(m=>m.clicked).length} link clicks</span>
      </div>
    </div>
    ${sorted.map(m=>{
      const isSelected = getState().emailSelectedId===m.id;
      return `<div onclick="setState({emailSelectedId:'${m.id}',emailFolder:'tracking'})"
        style="padding:12px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:${isSelected?'#fff5f6':'#fff'};border-left:3px solid ${isSelected?'#c41230':'transparent'}"
        onmouseover="this.style.background='${isSelected?'#fff5f6':'#f9fafb'}'" onmouseout="this.style.background='${isSelected?'#fff5f6':'#fff'}'">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <div style="font-size:12px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${_escHtml(m.toName||m.to)}</div>
          <span style="font-size:11px;color:#9ca3af">${_escHtml(m.date)}</span>
        </div>
        <div style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px">${_escHtml(m.subject)}</div>
        <div style="display:flex;gap:6px">
          ${m.opened?`<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f0fdf4;color:#15803d;font-weight:600;display:inline-flex;align-items:center;gap:3px">👁 ${m.opens}× opened</span>`:
            `<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f3f4f6;color:#9ca3af">👁 Not yet opened</span>`}
          ${m.clicked?`<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">🔗 Clicked</span>`:''}
          ${m.templateId?`<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#ede9fe;color:#6d28d9">Template</span>`:''}
        </div>
      </div>`;
    }).join('')}`;
}

// ── Tracking detail ───────────────────────────────────────────────────────────
function renderEmailTrackingDetail(msg) {
  if (!msg) return renderEmailEmpty();
  const {deal, contact, lead} = emailGetLinkedEntity(msg);
  return `
  <div style="padding:24px;max-width:700px">
    <div style="margin-bottom:20px">
      <h2 style="font-size:17px;font-weight:700;margin:0 0 4px;font-family:Syne,sans-serif">${_escHtml(msg.subject)}</h2>
      <div style="font-size:12px;color:#6b7280">To: ${_escHtml(msg.toName||msg.to)} · ${_escHtml(msg.date||'')} ${_escHtml(msg.time||'')}</div>
    </div>

    <!-- Tracking stats -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${[
        ['Opens', msg.opens, msg.opened?'#15803d':'#9ca3af', msg.opened?'✓':'—'],
        ['Last opened', msg.openedAt||'—', '#374151', ''],
        ['Links clicked', msg.clicked?'Yes':'No', msg.clicked?'#0369a1':'#9ca3af', ''],
      ].map(([l,v,col])=>`
        <div style="padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;text-align:center">
          <div style="font-size:20px;font-weight:800;color:${col};font-family:Syne,sans-serif">${_escHtml(v)}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">${_escHtml(l)}</div>
        </div>`).join('')}
    </div>

    <!-- Linked -->
    ${deal||contact||lead?`
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${deal?`<div onclick="setState({dealDetailId:'${deal.id}',page:'deals'})" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dbeafe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#1d4ed8">${Icon({n:'deals',size:13})} ${_escHtml(deal.title)}</div>`:''}
      ${contact?`<div onclick="setState({contactDetailId:'${contact.id}',page:'contacts'})" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dcfce7;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#15803d">${Icon({n:'contacts',size:13})} ${_escHtml(contact.fn)} ${_escHtml(contact.ln)}</div>`:''}
      ${lead?`<div onclick="setState({leadDetailId:'${lead.id}',page:'leads'})" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#ede9fe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#6d28d9">${Icon({n:'leads',size:13})} ${_escHtml(lead.fn)} ${_escHtml(lead.ln)}</div>`:''}
    </div>`:''}

    <!-- Email body (escaped for same reasons as renderEmailDetail) -->
    <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;font-size:13px;line-height:1.8;color:#374151;border:1px solid #f0f0f0;overflow:hidden">${_sanitizeEmailBody(msg.body||'')}</div>
  </div>`;
}

// ── Composer ──────────────────────────────────────────────────────────────────
function renderEmailComposer() {
  const s = getState();
  const d = s.emailComposeData;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(d.to)}`;

  return `
  <div style="display:flex;flex-direction:column;height:100%">
    <!-- Composer header -->
    <div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fafafa">
      <div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">New Message</div>
      <div style="display:flex;gap:6px;align-items:center">
        ${s.gmailConnected?`<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#15803d;background:#f0fdf4;padding:3px 8px;border-radius:10px;border:1px solid #86efac">
          <div style="width:6px;height:6px;border-radius:50%;background:#22c55e"></div>Gmail Ready
        </div>`:''}
        <button onclick="emailCloseCompose()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1;padding:4px">×</button>
      </div>
    </div>

    <!-- Fields -->
    <div style="border-bottom:1px solid #f0f0f0">
      ${[['To','to','email'],['Cc','cc','email'],['Bcc','bcc','email']].map(([label,field,type])=>`
        <div style="display:flex;align-items:center;padding:0 20px;border-bottom:1px solid #f9fafb">
          <span style="font-size:12px;color:#9ca3af;width:36px;flex-shrink:0">${label}</span>
          <input id="ec_${field}" type="${type}" value="${_escHtml(d[field]||'')}" oninput="getState().emailComposeData.${field}=this.value"
            style="flex:1;border:none;outline:none;font-size:13px;font-family:inherit;padding:10px 0;background:transparent;color:#1a1a1a">
        </div>`).join('')}
      <div style="display:flex;align-items:center;padding:0 20px">
        <span style="font-size:12px;color:#9ca3af;width:36px;flex-shrink:0">Subj</span>
        <input id="ec_subject" type="text" value="${_escHtml(d.subject||'')}" oninput="getState().emailComposeData.subject=this.value"
          style="flex:1;border:none;outline:none;font-size:13px;font-family:inherit;font-weight:500;padding:10px 0;background:transparent;color:#1a1a1a" placeholder="Subject">
      </div>
    </div>

    <!-- Templates quick-pick -->
    <div style="padding:8px 20px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;gap:8px;overflow-x:auto">
      <span style="font-size:11px;color:#9ca3af;white-space:nowrap;font-weight:500">Templates:</span>
      ${getAllTemplates().slice(0,5).map(t=>`<button onclick="emailUseTemplate(getAllTemplates().find(x=>x.id==='${t.id}'))" style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-family:inherit;white-space:nowrap;color:#374151" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">${_escHtml(t.name)}</button>`).join('')}
      <button onclick="setState({emailFolder:'templates',emailComposing:true})" style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-family:inherit;white-space:nowrap;color:#6b7280">More…</button>
    </div>

    <!-- Merge fields picker -->
    ${renderMergeFieldBar()}

    <!-- Brief 6 Phase 2: composer rich-text toolbar. onmousedown=preventDefault
         on every button so the editor doesn't lose its selection / cursor
         when a button is clicked. -->
    <div style="padding:6px 14px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fafafa">
      <button title="Bold (Ctrl+B)"        onmousedown="event.preventDefault()" onclick="ecBold()"         style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">B</button>
      <button title="Italic (Ctrl+I)"      onmousedown="event.preventDefault()" onclick="ecItalic()"       style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-style:italic;font-size:13px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">I</button>
      <button title="Underline (Ctrl+U)"   onmousedown="event.preventDefault()" onclick="ecUnderline()"    style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;text-decoration:underline;font-size:13px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">U</button>
      <span style="width:1px;height:18px;background:#e5e7eb;margin:0 4px"></span>
      <button title="Heading"              onmousedown="event.preventDefault()" onclick="ecHeading()"      style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-weight:700;font-size:11px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">H</button>
      <button title="Bullet list"          onmousedown="event.preventDefault()" onclick="ecBulletList()"   style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:13px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">•</button>
      <button title="Numbered list"        onmousedown="event.preventDefault()" onclick="ecNumberList()"   style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">1.</button>
      <span style="width:1px;height:18px;background:#e5e7eb;margin:0 4px"></span>
      <button title="Insert link"          onmousedown="event.preventDefault()" onclick="ecCreateLink()"   style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">🔗 Link</button>
      <button title="Insert image (max 1MB)" onmousedown="event.preventDefault()" onclick="ecInsertImage()" style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">🖼 Image</button>
      <span style="width:1px;height:18px;background:#e5e7eb;margin:0 4px"></span>
      <button title="Clear formatting"     onmousedown="event.preventDefault()" onclick="ecRemoveFormat()" style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='#fff'">Tx</button>
    </div>
    <!-- Placeholder CSS for the contenteditable. data-placeholder shows
         when the editor is :empty (no children at all, including <br>).
         Scoped to #ec_body so it doesn't leak. -->
    <style>#ec_body:empty:before{content:attr(data-placeholder);color:#9ca3af;pointer-events:none}</style>

    <!-- Body — contenteditable (Brief 6 Phase 2). Initial content is
         normalised through _composerInitialBody so legacy plain-text
         drafts get their newlines converted to <br>, and HTML drafts
         get sanitised through the Phase 1 allow-list. -->
    <div id="ec_body" contenteditable="true"
      data-placeholder="Write your email here… Use {{firstName}}, {{dealTitle}} etc. to auto-fill"
      oninput="_ecOnInput()"
      style="flex:1;padding:16px 20px;border:none;outline:none;font-size:14px;font-family:inherit;line-height:1.8;color:#1a1a1a;background:#fff;min-height:240px;overflow-y:auto;word-break:break-word">${_composerInitialBody(d.body||'')}</div>

    <!-- Signature -->
    <div style="padding:0 20px 10px;border-top:1px solid #f9fafb">
      <pre style="font-size:12px;color:#9ca3af;line-height:1.6;padding-top:8px;border-top:1px solid #e5e7eb;margin:4px 0 0;font-family:inherit;white-space:pre-wrap">${_escHtml(getSignature())}</pre>
      <button onclick="var el=document.getElementById('sig_edit');if(el)el.style.display=el.style.display==='none'?'block':'none'" style="font-size:10px;color:#3b82f6;background:none;border:none;cursor:pointer;font-family:inherit;padding:4px 0">Edit signature</button>
      <div id="sig_edit" style="display:none;margin-top:6px">
        <textarea id="sig_text" rows="4" style="width:100%;font-size:12px;font-family:inherit;padding:8px;border:1px solid #e5e7eb;border-radius:6px;resize:vertical;line-height:1.6">${_escHtml(getSignature())}</textarea>
        <div style="display:flex;gap:6px;margin-top:4px"><button onclick="saveSignature(document.getElementById('sig_text').value)" class="btn-r" style="font-size:11px;padding:3px 10px">Save Signature</button><button onclick="document.getElementById('sig_edit').style.display='none'" class="btn-w" style="font-size:11px;padding:3px 10px">Cancel</button></div>
      </div>
    </div>

    <!-- Footer actions -->
    <div style="padding:10px 20px;border-top:1px solid #f0f0f0;background:#fafafa;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;align-items:center">
        ${s.gmailConnected?`<button onclick="emailSendOrLog(false)" class="btn-r" style="font-size:13px;gap:6px">${Icon({n:'send',size:13})} Send via Gmail</button>`:
          `<button onclick="emailSendOrLog(true)" class="btn-r" style="font-size:13px;gap:6px">${Icon({n:'send',size:13})} Log & Save</button>
           <a href="${gmailUrl}" target="_blank" class="btn-w" style="font-size:12px;text-decoration:none">Open in Gmail ↗</a>`}
        <button onclick="emailCloseCompose()" class="btn-w" style="font-size:12px">Discard</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <label style="cursor:pointer">
          <input type="file" multiple style="display:none">
          <span class="btn-g" style="font-size:12px;padding:5px 10px">📎 Attach</span>
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#6b7280;cursor:pointer">
          <input type="checkbox" checked style="accent-color:#c41230"> Track opens
        </label>
      </div>
    </div>
  </div>`;
}

// ── Empty state ───────────────────────────────────────────────────────────────
function renderEmailEmpty() {
  return `
  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center">
    <div style="font-size:48px;margin-bottom:16px">✉️</div>
    <div style="font-size:16px;font-weight:600;color:#374151;margin-bottom:6px">Select an email to read</div>
    <div style="font-size:13px;color:#9ca3af;margin-bottom:20px;max-width:280px;line-height:1.6">Or compose a new email to a contact, deal, or lead</div>
    <button onclick="emailOpenCompose('','','','',null,null,null,null,null)" class="btn-r" style="font-size:13px;gap:8px">
      ${Icon({n:'edit',size:14})} Compose Email
    </button>
  </div>`;
}


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
        ${DATE_RANGES.map(dr=>`<button onclick="rptDateRange='${dr.id}';renderPage()"
          style="padding:5px 12px;border-radius:8px;border:none;font-size:11px;font-weight:${reportDateRange===dr.id?700:500};cursor:pointer;font-family:inherit;background:${reportDateRange===dr.id?'#fff':'transparent'};color:${reportDateRange===dr.id?'#1a1a1a':'#6b7280'};box-shadow:${reportDateRange===dr.id?'0 1px 4px rgba(0,0,0,.1)':'none'};white-space:nowrap">${dr.label}</button>`).join('')}
      </div>
      <button class="btn-w" onclick="addToast('CSV export coming soon','info')" style="font-size:12px;gap:5px">${Icon({n:'download',size:13})} Export</button>
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
        <button onclick="rptActiveId='${r.id}';rptEditing=false;renderPage()"
          style="width:100%;text-align:left;padding:10px 14px;border:none;font-family:inherit;cursor:pointer;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f9fafb;border-left:3px solid ${rptActiveId===r.id?'#c41230':'transparent'};background:${rptActiveId===r.id?'#fff5f6':'#fff'};color:${rptActiveId===r.id?'#c41230':'#374151'}"
          onmouseover="if('${r.id}'!==rptActiveId){this.style.background='#fafafa';}" onmouseout="if('${r.id}'!==rptActiveId){this.style.background='#fff';}">
          <span style="font-size:16px">${r.icon||'📊'}</span>
          <div style="min-width:0">
            <div style="font-size:12px;font-weight:${rptActiveId===r.id?700:500};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name}</div>
            <div style="font-size:10px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${RPT_CHART_ICONS[r.chart]||'📊'} ${RPT_CHART_LABELS[r.chart]||'Chart'}</div>
          </div>
        </button>`).join('')}
      <div style="padding:10px 12px;margin-top:4px">
        <button onclick="rptOpenBuilder('new')" class="btn-r" style="width:100%;justify-content:center;font-size:12px;gap:5px">${Icon({n:'plus',size:12})} New Report</button>
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
            ${['bar','line','pie','funnel','number','table'].map(ct=>`<button onclick="SAVED_REPORTS.find(r=>r.id==='${activeReport?.id}')&&(SAVED_REPORTS.find(r=>r.id==='${activeReport?.id}').chart='${ct}');renderPage()"
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
  if (field.type === 'textarea')
    return '<textarea class="inp" style="font-size:12px;resize:vertical;font-family:inherit;min-height:60px" onchange="' + onchangeExpr + '">' + v + '</textarea>';
  if (field.type === 'checkbox')
    return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" ' + (v ? 'checked' : '') + ' onchange="' + onchangeExpr.replace('this.value', 'this.checked') + '" style="accent-color:#c41230;width:16px;height:16px"> <span style="font-size:13px">Yes</span></label>';
  if (field.type === 'dropdown' && field.options && field.options.length > 0)
    return '<select class="sel" style="font-size:12px" onchange="' + onchangeExpr + '">' +
      '<option value="">Select…</option>' +
      field.options.map(o => '<option value="' + o + '" ' + (v === o ? 'selected' : '') + '>' + o + '</option>').join('') +
      '</select>';
  if (field.type === 'multiselect' && field.options && field.options.length > 0) {
    const sel = Array.isArray(v) ? v : [];
    return '<select class="sel" multiple style="font-size:12px;height:80px" onchange="' + onchangeExpr.replace('this.value', 'Array.from(this.selectedOptions).map(o=>o.value)') + '">' +
      field.options.map(o => '<option value="' + o + '" ' + (sel.includes(o) ? 'selected' : '') + '>' + o + '</option>').join('') +
      '</select>';
  }
  const typeMap = {text:'text',number:'number',monetary:'number',date:'date',phone:'tel',email:'email',url:'url'};
  return '<input class="inp" type="' + (typeMap[field.type] || 'text') + '" value="' + v + '" style="font-size:12px" onchange="' + onchangeExpr + '">';
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
        '<div style="flex:1;min-width:0" id="' + inputId + '_display" onclick="cfStartEdit(\'' + entityId + '\',\'' + field.id + '\',\'' + entityType + '\')" style="cursor:pointer">' +
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
    '<button onclick="cfSaveFromEl(\'' + entityId + '\',\'' + fieldId + '\',\'' + entityType + '\')" class="btn-r" style="font-size:11px;padding:3px 10px">Save</button>' +
    '<button onclick="renderPage()" class="btn-w" style="font-size:11px;padding:3px 10px">Cancel</button>' +
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



