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
    // Stage 3 (B4-B6) wires up the incoming-call banner. Until then, reject
    // the call so the customer falls through to the IVR voicemail path
    // instead of being silently held by an idle browser.
    console.log('[Spartan] Incoming call (handler not yet implemented):', call.parameters && call.parameters.From);
    try { call.reject(); } catch(e) {}
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

// Tear down the Twilio Device — called on logout to release the JWT slot
// and disconnect any active WebRTC peer connection.
function twilioDestroy() {
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
