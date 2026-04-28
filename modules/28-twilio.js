// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 28-twilio.js
// Twilio Voice + SMS integration. Stage 1 scope: Voice SDK device registration
// only. Outbound/inbound call handling, SMS, and the Phone-page UI come in
// later stages.
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

var _twilioDevice = null;
window._twilioReady = false;

// Register (or refresh) the Twilio Voice SDK device for the current rep.
//
// Called from 99-init.js after a successful login, and silently from the
// `tokenWillExpire` event ~5min before the JWT TTL hits. Returns true on a
// successful register kick-off (the actual `registered` event fires async).
//
// Bails quietly when:
//   - the rep doesn't have phone.access permission
//   - the Twilio JS SDK <script> tag failed to load
//   - the rep hasn't connected Google (no access token to send to /token)
//   - the backend rejects the Google token (not a registered Spartan user)
//
// Returns true/false rather than throwing so the caller can decide whether to
// surface a toast (we don't want a noisy red toast every login for password
// users who can't use the phone module).
async function twilioInit(forceReload) {
  // RBAC gate — installer / production_staff / viewer don't get a Voice token.
  if (typeof hasPermission === 'function' && !hasPermission('phone.access')) {
    return false;
  }

  if (_twilioDevice && !forceReload) return true;

  if (typeof Twilio === 'undefined' || !Twilio.Device) {
    console.warn('[Spartan] Twilio SDK script not loaded — phone module disabled');
    return false;
  }

  // Reuse the access token from the existing Gmail integration so reps don't
  // have to authenticate to Google twice. Stored on getState().gmailToken
  // by 10-integrations.js after Google Sign-In.
  var googleToken = (typeof getState === 'function') ? getState().gmailToken : null;
  if (!googleToken) {
    console.log('[Spartan] Twilio: no Google token available, deferring registration until Google Sign-In');
    return false;
  }

  // Request a Twilio JWT from our backend
  var resp;
  try {
    resp = await fetch('/api/twilio/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + googleToken,
        'Content-Type': 'application/json'
      }
    });
  } catch (e) {
    console.error('[Spartan] /api/twilio/token request failed:', e);
    return false;
  }

  if (!resp.ok) {
    var errBody = {};
    try { errBody = await resp.json(); } catch(e) {}
    console.warn('[Spartan] /api/twilio/token returned ' + resp.status + ':', errBody.error || '(no body)');
    return false;
  }

  var data;
  try { data = await resp.json(); }
  catch (e) {
    console.error('[Spartan] /api/twilio/token response was not JSON:', e);
    return false;
  }

  var twilioToken = data.token;
  var identity = data.identity;

  // If we're refreshing, tear down the existing Device first so callbacks
  // don't fire twice.
  if (forceReload && _twilioDevice) {
    try { _twilioDevice.destroy(); } catch(e) {}
    _twilioDevice = null;
    window._twilioReady = false;
  }

  try {
    _twilioDevice = new Twilio.Device(twilioToken, {
      codecPreferences: ['opus', 'pcmu'],
      logLevel: 1,
    });
  } catch (e) {
    console.error('[Spartan] Twilio.Device construction failed:', e);
    return false;
  }

  _twilioDevice.on('registered', function() {
    window._twilioReady = true;
    console.log('[Spartan] Twilio Device registered as ' + identity);
    if (typeof addToast === 'function') addToast('Phone connected', 'success');
    // Ask once for browser-notification permission so we can surface incoming
    // calls when the CRM tab is in the background. Silently no-op if already
    // decided either way.
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } catch(e) {}
  });

  _twilioDevice.on('error', function(err) {
    console.error('[Spartan] Twilio Device error:', err);
    // Code 31005 (HANGUP) and similar are routine — don't toast every one.
    // Surface only authentication / connection failures that prevent calling.
    if (err && (err.code === 20101 || err.code === 31204 || err.code === 31205)) {
      window._twilioReady = false;
      if (typeof addToast === 'function') addToast('Phone disconnected — please reconnect', 'error');
    }
  });

  _twilioDevice.on('tokenWillExpire', function() {
    console.log('[Spartan] Twilio token about to expire — refreshing silently');
    twilioInit(true);
  });

  _twilioDevice.on('incoming', function(call) {
    _twilioOnIncoming(call);
  });

  try {
    _twilioDevice.register();
  } catch (e) {
    console.error('[Spartan] Twilio Device .register() threw:', e);
    return false;
  }

  return true;
}

// ───────────────────── Stage 2: outbound calling ───────────────────────────
//
// Tracks the in-flight outbound call. Mirrors getState().activeCall so the UI
// can render the active-call banner without going through setState (which
// would full-re-render the page once a second for the duration counter).
var _twilioActiveCall = null;
var _twilioCallTimerId = null;

// Place an outbound call. `phone` should be in any AU format (we trust Twilio
// to handle the dialing); entityId/entityType attach the call to a specific
// CRM record so the activity timeline gets the right entry.
function twilioCall(phone, entityId, entityType) {
  if (!window._twilioReady || !_twilioDevice) {
    if (typeof addToast === 'function') addToast('Phone not connected — check Settings', 'warning');
    return;
  }
  if (_twilioActiveCall) {
    if (typeof addToast === 'function') addToast('End your current call first', 'warning');
    return;
  }
  if (!phone) {
    if (typeof addToast === 'function') addToast('No phone number to dial', 'error');
    return;
  }

  var call;
  try {
    call = _twilioDevice.connect({
      params: {
        To: phone,
        entityId: entityId || '',
        entityType: entityType || '',
      }
    });
  } catch (e) {
    console.error('[Spartan] twilioDevice.connect() threw:', e);
    if (typeof addToast === 'function') addToast('Failed to start call: ' + e.message, 'error');
    return;
  }

  _twilioActiveCall = {
    callObject: call,
    phone: phone,
    entityId: entityId || null,
    entityType: entityType || null,
    startedAt: Date.now(),
    status: 'ringing',
    muted: false,
    notes: '',
  };

  // Reflect the call in state so the active-call banner renders. Subsequent
  // status updates (accepted, disconnect) bypass setState — the banner reads
  // the duration directly from _twilioActiveCall.startedAt to avoid one-per-second
  // page rerenders.
  if (typeof setState === 'function') {
    setState({ activeCall: { phone: phone, entityId: entityId, entityType: entityType, startedAt: _twilioActiveCall.startedAt, status: 'ringing', muted: false } });
  }

  call.on('accept', function() {
    if (!_twilioActiveCall) return;
    _twilioActiveCall.status = 'in-call';
    var elapsedEl = document.getElementById('callTimer');
    var statusEl = document.getElementById('callStatusLabel');
    if (statusEl) statusEl.textContent = 'In call';
    // Start the duration timer — direct DOM update, no setState churn.
    _twilioCallTimerId = setInterval(function() {
      if (!_twilioActiveCall) { clearInterval(_twilioCallTimerId); _twilioCallTimerId = null; return; }
      var t = document.getElementById('callTimer');
      if (t) t.textContent = _twilioFmtDuration(Math.floor((Date.now() - _twilioActiveCall.startedAt) / 1000));
    }, 1000);
    if (elapsedEl) elapsedEl.textContent = '0s';
  });

  call.on('disconnect', function() { _twilioOnDisconnect(); });
  call.on('cancel',     function() { _twilioOnDisconnect(); });
  call.on('reject',     function() { _twilioOnDisconnect(); });
  call.on('error', function(err) {
    console.error('[Spartan] Active call error:', err);
    if (typeof addToast === 'function') addToast('Call error: ' + (err && err.message || 'unknown'), 'error');
    _twilioOnDisconnect();
  });
}

// End the active call. Twilio fires the `disconnect` event which then runs
// _twilioOnDisconnect() to clean up state and write the activity row.
function twilioHangup() {
  if (!_twilioActiveCall || !_twilioActiveCall.callObject) return;
  try { _twilioActiveCall.callObject.disconnect(); } catch(e) {}
}

function twilioMute(on) {
  if (!_twilioActiveCall || !_twilioActiveCall.callObject) return;
  try {
    _twilioActiveCall.callObject.mute(!!on);
    _twilioActiveCall.muted = !!on;
  } catch(e) {}
  // Update the mute button in-place without a renderPage. The button is
  // identified by id so the toggle UI doesn't need a full re-render.
  var btn = document.getElementById('callMuteBtn');
  if (btn) {
    btn.textContent = on ? '🔊 Unmute' : '🔇 Mute';
    btn.style.background = on ? '#fee2e2' : '#fff';
  }
}

// Send a DTMF digit during a call (e.g. navigating a supplier IVR).
function twilioSendDTMF(digit) {
  if (!_twilioActiveCall || !_twilioActiveCall.callObject) return;
  try { _twilioActiveCall.callObject.sendDigits(String(digit)); } catch(e) {}
}

// Cleanup after a call ends — write activity locally for instant timeline
// feedback (the backend's /status callback will write the canonical row a
// few seconds later via the realtime sub).
function _twilioOnDisconnect() {
  if (_twilioCallTimerId) { clearInterval(_twilioCallTimerId); _twilioCallTimerId = null; }
  if (!_twilioActiveCall) return;

  var call = _twilioActiveCall;
  _twilioActiveCall = null;

  if (typeof setState === 'function') setState({ activeCall: null });

  // Optimistic local activity write — only when we have entity context. The
  // backend will write the authoritative row with full duration shortly after.
  // We skip the local write to avoid duplicates if the backend write completes
  // before our optimistic insert (rare but possible) — the realtime sub will
  // surface the canonical version anyway.
  // Keep the local write for instant timeline feedback when entity is known.
  if (call.entityId && call.entityType && typeof saveActivityToEntity === 'function') {
    var elapsed = Math.floor((Date.now() - call.startedAt) / 1000);
    var byUser = (typeof getCurrentUser === 'function' && getCurrentUser()) ? getCurrentUser().name : '';
    var now = new Date();
    saveActivityToEntity(call.entityId, call.entityType, {
      id: 'act_call_local_' + Date.now(),
      type: 'call',
      subject: 'Call (' + _twilioFmtDuration(elapsed) + ')',
      text: call.notes || '',
      by: byUser,
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 16),
      done: true,
      duration: elapsed,
    });
  }
}

// Format seconds as "Xm Ys" or "Ys" — used in the active-call timer and
// in the activity-row subject.
function _twilioFmtDuration(s) {
  if (!s || s < 1) return '0s';
  var m = Math.floor(s / 60);
  var r = s % 60;
  return m > 0 ? (m + 'm ' + r + 's') : (r + 's');
}

// Render the sticky active-call banner. Called from renderPage() in 99-init.js
// so it sits at fixed position above all pages during an active call.
function renderActiveCallPanel() {
  var ac = (typeof getState === 'function') ? getState().activeCall : null;
  if (!ac) return '';

  // Resolve display name from entity (if context was passed when dialling)
  var displayName = '';
  if (ac.entityId && ac.entityType && typeof getState === 'function') {
    var s = getState();
    if (ac.entityType === 'contact') {
      var c = (s.contacts || []).find(function(x){return x.id === ac.entityId;});
      if (c) displayName = (c.fn || '') + ' ' + (c.ln || '');
    } else if (ac.entityType === 'lead') {
      var l = (s.leads || []).find(function(x){return x.id === ac.entityId;});
      if (l) displayName = (l.fn || '') + ' ' + (l.ln || '');
    } else if (ac.entityType === 'deal') {
      var d = (s.deals || []).find(function(x){return x.id === ac.entityId;});
      if (d) displayName = d.title || '';
    }
    displayName = displayName.trim();
  }

  var openRecordOnclick = '';
  if (ac.entityId && ac.entityType) {
    if (ac.entityType === 'contact') openRecordOnclick = "setState({contactDetailId:'" + ac.entityId + "',page:'contacts'})";
    else if (ac.entityType === 'lead') openRecordOnclick = "setState({leadDetailId:'" + ac.entityId + "',page:'leads'})";
    else if (ac.entityType === 'deal') openRecordOnclick = "setState({dealDetailId:'" + ac.entityId + "',page:'deals'})";
    else if (ac.entityType === 'job') openRecordOnclick = "setState({jobDetailId:'" + ac.entityId + "',page:'jobs'})";
  }

  // Initial timer text — the setInterval in twilioCall.accept will overwrite
  // this every second once the customer picks up.
  var initialElapsed = Math.floor((Date.now() - (ac.startedAt || Date.now())) / 1000);

  return ''
    + '<div id="activeCallPanel" style="position:fixed;top:0;left:0;right:0;z-index:300;background:linear-gradient(180deg,#15803d,#166534);color:#fff;padding:10px 20px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 8px rgba(0,0,0,.15);font-family:inherit">'
    +   '<div style="font-size:20px">📞</div>'
    +   '<div style="flex:1;min-width:0">'
    +     '<div style="font-size:14px;font-weight:700;line-height:1.2">' + (displayName || ac.phone || 'Outbound call') + '</div>'
    +     '<div style="font-size:11px;opacity:.85;line-height:1.3"><span id="callStatusLabel">' + (ac.status === 'in-call' ? 'In call' : 'Ringing…') + '</span> · <span id="callTimer">' + _twilioFmtDuration(initialElapsed) + '</span> · ' + (ac.phone || '') + '</div>'
    +   '</div>'
    +   (openRecordOnclick ? '<button onclick="' + openRecordOnclick + '" style="background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.4);color:#fff;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Open record</button>' : '')
    +   '<button id="callMuteBtn" onclick="twilioMute(!_twilioActiveCall || !_twilioActiveCall.muted)" style="background:#fff;border:none;color:#15803d;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">' + (ac.muted ? '🔊 Unmute' : '🔇 Mute') + '</button>'
    +   '<button onclick="twilioHangup()" style="background:#dc2626;border:none;color:#fff;padding:6px 16px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📞 End</button>'
    + '</div>';
}

// ───────────────────── Stage 3: inbound calling ────────────────────────────

// Browser-side caller-ID lookup against in-memory CRM state. Mirrors the
// backend findEntityByPhone() in api/_lib/entityLookup.js, but reads from
// getState() rather than Supabase so the banner renders instantly without
// a network round-trip.
//
// Match key is the last 9 digits — handles +61 / 04 / no-prefix / spaces /
// brackets variations Australians put in contact records. Search order
// matches signal strength: contact > lead > deal > job.
function findCrmEntityByPhone(rawPhone) {
  if (!rawPhone) return null;
  var key = String(rawPhone).replace(/\D/g, '').slice(-9);
  if (key.length < 9) return null;

  var s = (typeof getState === 'function') ? getState() : {};

  function matchKey(p) {
    if (!p) return null;
    var d = String(p).replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : null;
  }

  var contacts = s.contacts || [];
  for (var i = 0; i < contacts.length; i++) {
    if (matchKey(contacts[i].phone) === key) {
      return { type: 'contact', id: contacts[i].id, name: ((contacts[i].fn || '') + ' ' + (contacts[i].ln || '')).trim() };
    }
  }
  var leads = s.leads || [];
  for (var j = 0; j < leads.length; j++) {
    if (matchKey(leads[j].phone) === key) {
      return { type: 'lead', id: leads[j].id, name: ((leads[j].fn || '') + ' ' + (leads[j].ln || '')).trim() };
    }
  }
  return null;
}

// Tracks the in-flight incoming call (rep hasn't picked up yet). Once they
// click Answer this becomes _twilioActiveCall and the active-call banner
// takes over.
var _twilioIncoming = null;       // { call, from, matched, autoDeclineTimerId }

// Twilio fires this when a customer's call is routed to this rep's browser
// (either via smart-routing in /incoming or via a simul-ring from /ivr-route).
function _twilioOnIncoming(call) {
  // Concurrent-call guard — if the rep is already on a call, decline politely
  // so the customer falls through to whoever else is in the simul-ring.
  if (_twilioActiveCall) {
    console.log('[Spartan] Already on a call, declining incoming');
    try { call.reject(); } catch(e) {}
    return;
  }
  // If a previous incoming call is still ringing (e.g. fast double-ring), drop it.
  if (_twilioIncoming) {
    try { _twilioIncoming.call.reject(); } catch(e) {}
    _clearIncoming();
  }

  var from = (call.parameters && call.parameters.From) || '';
  // call.parameters.From for inbound from /incoming is the customer's number.
  // For simul-ring it's still the customer (Twilio preserves it).

  // Match against local CRM state for caller-ID enrichment. Backend already
  // wrote the call_logs row with entity context — this is just for the banner.
  var matched = (typeof findCrmEntityByPhone === 'function')
    ? findCrmEntityByPhone(from)
    : null;

  _twilioIncoming = { call: call, from: from, matched: matched };

  // Reflect in state so the incoming-call banner renders
  if (typeof setState === 'function') {
    setState({
      incomingCall: {
        from: from,
        matched: matched,
        ringingSince: Date.now(),
      }
    });
  }

  // Auto-decline after 30s if neither button is pressed — without this, missed
  // calls leave the banner stuck on screen.
  _twilioIncoming.autoDeclineTimerId = setTimeout(function() {
    if (_twilioIncoming && _twilioIncoming.call === call) {
      console.log('[Spartan] Incoming call auto-declined after 30s');
      twilioDeclineIncoming();
    }
  }, 30000);

  // Browser notification when CRM tab is in the background. Doesn't auto-prompt
  // for permission — that's a one-time admin-friendly thing the rep grants
  // explicitly via Settings (or browser asks on first call). Silently no-ops
  // if permission was denied / not yet granted.
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      var notifTitle = matched ? ('Incoming call from ' + matched.name) : 'Incoming call';
      var notifBody = from + (matched ? (' · ' + matched.type) : ' · Unknown caller');
      new Notification(notifTitle, { body: notifBody, tag: 'spartan-incoming-call' });
    }
  } catch(e) {}

  // Wire up the call's lifecycle events so the banner clears if the customer
  // hangs up before the rep picks up.
  call.on('cancel',    function() { console.log('[Spartan] Incoming call cancelled by caller'); _clearIncoming(); });
  call.on('disconnect', function() { _clearIncoming(); });
  call.on('reject',    function() { _clearIncoming(); });
  call.on('error',     function(err) { console.warn('[Spartan] Incoming call error:', err); _clearIncoming(); });
}

function _clearIncoming() {
  if (_twilioIncoming && _twilioIncoming.autoDeclineTimerId) {
    clearTimeout(_twilioIncoming.autoDeclineTimerId);
  }
  _twilioIncoming = null;
  if (typeof setState === 'function') setState({ incomingCall: null });
}

// Rep clicked Answer on the incoming-call banner.
function twilioAnswerIncoming() {
  if (!_twilioIncoming) return;
  var inc = _twilioIncoming;
  // Stop the auto-decline timer — rep took the call.
  if (inc.autoDeclineTimerId) clearTimeout(inc.autoDeclineTimerId);

  try { inc.call.accept(); }
  catch (e) {
    console.error('[Spartan] call.accept() threw:', e);
    if (typeof addToast === 'function') addToast('Failed to answer call: ' + e.message, 'error');
    return;
  }

  // Promote incoming → active. Wire up the same event handlers an outbound
  // call would have so hangup, mute, DTMF, and timer all work identically.
  _twilioActiveCall = {
    callObject: inc.call,
    phone: inc.from,
    entityId: inc.matched ? inc.matched.id : null,
    entityType: inc.matched ? inc.matched.type : null,
    startedAt: Date.now(),
    status: 'in-call',
    muted: false,
    notes: '',
    direction: 'inbound',
  };

  if (typeof setState === 'function') {
    setState({
      incomingCall: null,
      activeCall: {
        phone: inc.from,
        entityId: _twilioActiveCall.entityId,
        entityType: _twilioActiveCall.entityType,
        startedAt: _twilioActiveCall.startedAt,
        status: 'in-call',
        muted: false,
      }
    });
  }

  // Auto-navigate to the matched entity for instant context — saves the rep
  // hunting for the record while the customer's already talking.
  if (inc.matched && typeof setState === 'function') {
    if (inc.matched.type === 'contact') setState({ contactDetailId: inc.matched.id, page: 'contacts' });
    else if (inc.matched.type === 'lead')  setState({ leadDetailId: inc.matched.id,  page: 'leads' });
    else if (inc.matched.type === 'deal')  setState({ dealDetailId: inc.matched.id,  page: 'deals' });
  }

  // Start the duration timer (same approach as outbound).
  _twilioCallTimerId = setInterval(function() {
    if (!_twilioActiveCall) { clearInterval(_twilioCallTimerId); _twilioCallTimerId = null; return; }
    var t = document.getElementById('callTimer');
    if (t) t.textContent = _twilioFmtDuration(Math.floor((Date.now() - _twilioActiveCall.startedAt) / 1000));
  }, 1000);

  // Wire disconnect → activity write. The cancel/reject/error handlers wired
  // in _twilioOnIncoming already point at _clearIncoming, but once accepted,
  // disconnect should write the activity row instead.
  inc.call.on('disconnect', function() { _twilioOnDisconnect(); });

  _twilioIncoming = null;
}

// Rep clicked Decline (or auto-decline timer fired).
function twilioDeclineIncoming() {
  if (!_twilioIncoming) return;
  try { _twilioIncoming.call.reject(); } catch(e) {}
  _clearIncoming();
}

// Render the incoming-call banner. Called from renderPage() in 99-init.js
// so it sits at fixed position above all pages while ringing.
function renderIncomingCallBanner() {
  var ic = (typeof getState === 'function') ? getState().incomingCall : null;
  if (!ic) return '';

  var displayName = ic.matched
    ? (ic.matched.name || ic.matched.type)
    : 'Unknown caller';
  var subtitle = ic.matched
    ? ((ic.matched.type.charAt(0).toUpperCase() + ic.matched.type.slice(1)) + ' · ' + (ic.from || ''))
    : (ic.from || 'No number');

  return ''
    + '<div id="incomingCallBanner" style="position:fixed;top:0;left:0;right:0;z-index:301;background:linear-gradient(180deg,#1e40af,#1e3a8a);color:#fff;padding:12px 20px;display:flex;align-items:center;gap:14px;box-shadow:0 2px 12px rgba(0,0,0,.2);font-family:inherit;animation:spartanIncomingPulse 1.5s ease-in-out infinite alternate">'
    +   '<div style="font-size:24px">📲</div>'
    +   '<div style="flex:1;min-width:0">'
    +     '<div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:.85;margin-bottom:2px">Incoming call</div>'
    +     '<div style="font-size:16px;font-weight:700;line-height:1.2">' + displayName + '</div>'
    +     '<div style="font-size:12px;opacity:.85;line-height:1.3">' + subtitle + '</div>'
    +   '</div>'
    +   '<button onclick="twilioDeclineIncoming()" style="background:#dc2626;border:none;color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;min-height:44px">✕ Decline</button>'
    +   '<button onclick="twilioAnswerIncoming()" style="background:#16a34a;border:none;color:#fff;padding:10px 26px;border-radius:8px;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;min-height:44px;box-shadow:0 0 0 0 rgba(22,163,74,.6);animation:spartanAnswerPulse 1.2s ease-out infinite">📞 Answer</button>'
    + '</div>'
    + '<style>@keyframes spartanIncomingPulse{from{box-shadow:0 2px 12px rgba(30,64,175,.5)}to{box-shadow:0 2px 24px rgba(30,64,175,.9)}}@keyframes spartanAnswerPulse{0%{box-shadow:0 0 0 0 rgba(22,163,74,.6)}70%{box-shadow:0 0 0 14px rgba(22,163,74,0)}100%{box-shadow:0 0 0 0 rgba(22,163,74,0)}}</style>';
}

// ───────────────────── Stage 4: SMS ─────────────────────────────────────────

// Send an SMS to a customer. Validates input, posts to /api/twilio/sms,
// optimistically inserts the outbound row into state.smsLogs so the thread
// updates instantly (the realtime sub will reconcile with the canonical
// backend-written row a moment later — same id since we use the Twilio
// message SID once it's returned).
//
// Returns a promise that resolves on success / rejects on failure.
async function twilioSendSms(to, body, entityId, entityType) {
  if (typeof hasPermission === 'function' && !hasPermission('phone.sms')) {
    if (typeof addToast === 'function') addToast('You do not have permission to send SMS', 'error');
    return;
  }
  if (!to || !String(to).trim()) {
    if (typeof addToast === 'function') addToast('No phone number on file', 'warning');
    return;
  }
  if (!body || !String(body).trim()) {
    if (typeof addToast === 'function') addToast('Message body is empty', 'warning');
    return;
  }

  var googleToken = (typeof getState === 'function') ? getState().gmailToken : null;
  if (!googleToken) {
    if (typeof addToast === 'function') addToast('Connect Gmail first to send SMS', 'warning');
    return;
  }

  var resp;
  try {
    resp = await fetch('/api/twilio/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + googleToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: to,
        body: body,
        entityId: entityId || null,
        entityType: entityType || null,
      })
    });
  } catch (e) {
    console.error('[Spartan] /api/twilio/sms request failed:', e);
    if (typeof addToast === 'function') addToast('SMS send failed: network error', 'error');
    return;
  }

  if (!resp.ok) {
    var errBody = {};
    try { errBody = await resp.json(); } catch(e) {}
    if (typeof addToast === 'function') addToast('SMS failed: ' + (errBody.error || resp.status), 'error');
    return;
  }

  var data = await resp.json();
  var sid = data.sid;

  // Optimistic local insert so the thread updates without waiting for the
  // realtime echo (~1s round-trip).
  if (typeof getState === 'function' && typeof setState === 'function') {
    var existingLogs = getState().smsLogs || [];
    setState({
      smsLogs: [{
        id: 'tmp_' + sid,
        twilio_sid: sid,
        direction: 'outbound',
        from_number: null,
        to_number: to,
        user_id: (getCurrentUser() || {}).id || null,
        entity_type: entityType || null,
        entity_id: entityId || null,
        body: body,
        status: data.status || 'queued',
        sent_at: new Date().toISOString(),
      }].concat(existingLogs)
    });
  }

  // Local activity write so the timeline shows the SMS instantly. Backend
  // will write the canonical row; same activity id (act_sms_<sid>) means
  // the realtime echo dedupes naturally.
  if (entityId && entityType && typeof saveActivityToEntity === 'function') {
    var byUser = (typeof getCurrentUser === 'function' && getCurrentUser()) ? getCurrentUser().name : '';
    var now = new Date();
    saveActivityToEntity(entityId, entityType, {
      id: 'act_sms_' + sid,
      type: 'sms',
      subject: 'SMS → ' + (body.length > 60 ? body.slice(0, 59) + '…' : body),
      text: body,
      by: byUser,
      date: now.toISOString().slice(0, 10),
      time: now.toISOString().slice(11, 16),
      done: true,
    });
  }

  if (typeof addToast === 'function') addToast('SMS sent', 'success');
  return data;
}

// Apply mergefield substitutions to a template body. Same pattern as the
// email-template merge fields ({{firstName}}, {{repName}}, etc).
function smsApplyMergeFields(template, ctx) {
  if (!template) return '';
  var s = String(template);
  ctx = ctx || {};
  return s.replace(/\{\{(\w+)\}\}/g, function(m, key) {
    return (ctx[key] != null) ? String(ctx[key]) : m;
  });
}

// Build a merge context for an entity (contact / lead / deal). Used when a
// rep clicks an SMS template — substitutes {{firstName}}, {{repName}} etc.
// against the live record so the textarea pre-fills with resolved text.
function smsBuildMergeContext(entity, entityType) {
  var rep = (typeof getCurrentUser === 'function' && getCurrentUser()) || {};
  if (!entity) return { repName: rep.name || '' };
  if (entityType === 'contact' || entityType === 'lead') {
    return {
      firstName: entity.fn || '',
      lastName:  entity.ln || '',
      fullName:  ((entity.fn || '') + ' ' + (entity.ln || '')).trim(),
      repName:   rep.name || '',
      suburb:    entity.suburb || '',
    };
  }
  if (entityType === 'deal') {
    var s = (typeof getState === 'function') ? getState() : {};
    var contact = (s.contacts || []).find(function(c){ return c.id === entity.cid; });
    return {
      firstName: contact ? (contact.fn || '') : '',
      lastName:  contact ? (contact.ln || '') : '',
      fullName:  contact ? (((contact.fn || '') + ' ' + (contact.ln || '')).trim()) : '',
      dealTitle: entity.title || '',
      repName:   rep.name || '',
      suburb:    entity.suburb || '',
    };
  }
  return { repName: rep.name || '' };
}

// Tear down the Twilio Device — called on logout to release the JWT slot
// and disconnect any active WebRTC peer connection.
function twilioDestroy() {
  if (_twilioIncoming) {
    try { _twilioIncoming.call.reject(); } catch(e) {}
    _clearIncoming();
  }
  if (_twilioActiveCall) {
    try { _twilioActiveCall.callObject && _twilioActiveCall.callObject.disconnect(); } catch(e) {}
    _twilioActiveCall = null;
  }
  if (_twilioCallTimerId) { clearInterval(_twilioCallTimerId); _twilioCallTimerId = null; }
  if (_twilioDevice) {
    try { _twilioDevice.destroy(); } catch(e) {}
    _twilioDevice = null;
  }
  window._twilioReady = false;
}
