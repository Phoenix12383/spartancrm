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
// ── Mobile wrapper: active-call state ────────────────────────────────────────
// Tracked in module scope (not getState().activeCall — that one's for the
// desktop WebRTC flow and reading it on native would crosstalk). Persisted
// to localStorage so a wrapper restart mid-call still shows the banner +
// End button.
var _activeCallSidMobile = null;
var _activeCallContactMobile = '';
try {
  var _persistedCall = JSON.parse(localStorage.getItem('spartan_active_call_mobile') || 'null');
  if (_persistedCall && _persistedCall.sid) {
    _activeCallSidMobile = _persistedCall.sid;
    _activeCallContactMobile = _persistedCall.contact || '';
  }
} catch(e) {}
function _saveActiveCallMobile() {
  try {
    if (_activeCallSidMobile) {
      localStorage.setItem('spartan_active_call_mobile', JSON.stringify({
        sid: _activeCallSidMobile, contact: _activeCallContactMobile, ts: Date.now(),
      }));
    } else {
      localStorage.removeItem('spartan_active_call_mobile');
    }
  } catch(e) {}
}

// Floating banner pinned above the bottom nav while a call is active. Two
// buttons: ✕ to dismiss locally (use when the call already ended naturally
// and you just want the banner gone) and End (red) to actually terminate
// the call via /api/twilio/hangup.
function renderActiveCallBannerMobile() {
  if (!_activeCallSidMobile) return '';
  if (typeof isNativeWrapper !== 'function' || !isNativeWrapper()) return '';
  var safeName = String(_activeCallContactMobile || 'customer').replace(/</g, '&lt;');
  var bottomGap = (typeof BOTTOMNAV_HEIGHT === 'number' ? BOTTOMNAV_HEIGHT : 56) + 12;
  return '<div style="position:fixed;left:12px;right:12px;bottom:' + bottomGap + 'px;background:#0a0a0a;color:#fff;border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:150">' +
    '<span style="font-size:20px">📞</span>' +
    '<div style="flex:1;min-width:0">' +
      '<div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">On call with ' + safeName + '</div>' +
      '<div style="font-size:10px;opacity:.6">Twilio bridge — recording</div>' +
    '</div>' +
    '<button onclick="dismissActiveCallBannerMobile()" title="Hide" style="background:none;border:none;color:rgba(255,255,255,.5);font-size:16px;cursor:pointer;padding:4px 6px;font-family:inherit;line-height:1;flex-shrink:0">✕</button>' +
    '<button onclick="hangUpActiveCallMobile()" style="background:#dc2626;border:none;color:#fff;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0">End</button>' +
  '</div>';
}

// "Just hide" — for when the rep knows the call already ended (their phone
// hung up) and just wants the banner gone without calling /hangup.
function dismissActiveCallBannerMobile() {
  _activeCallSidMobile = null;
  _activeCallContactMobile = '';
  _saveActiveCallMobile();
  if (typeof renderPage === 'function') renderPage();
}

// "End the call" — calls /api/twilio/hangup which forces both legs down at
// the Twilio gateway. Optimistically clears local state so the banner
// disappears before the network round-trip; the existing hangup endpoint
// is idempotent so no harm if the call already ended on its own.
async function hangUpActiveCallMobile() {
  if (!_activeCallSidMobile) return;
  var sid = _activeCallSidMobile;
  var idToken = '';
  try { idToken = localStorage.getItem('spartan_native_id_token') || ''; } catch(e){}
  if (!idToken) {
    if (typeof addToast === 'function') addToast('Sign in again to end calls', 'error');
    return;
  }
  _activeCallSidMobile = null;
  _activeCallContactMobile = '';
  _saveActiveCallMobile();
  if (typeof renderPage === 'function') renderPage();
  try {
    var resp = await fetch('https://spaartan.tech/api/twilio/hangup?sid=' + encodeURIComponent(sid), {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + idToken },
    });
    var data = {};
    try { data = await resp.json(); } catch(e){}
    if (resp.ok) {
      if (typeof addToast === 'function') addToast(data && data.alreadyEnded ? 'Call already ended' : 'Call ended ✓', 'success');
    } else {
      var raw = (data && (data.message || data.error)) || ('HTTP ' + resp.status);
      if (typeof addToast === 'function') addToast('End call failed: ' + raw, 'error');
    }
  } catch (e) {
    if (typeof addToast === 'function') addToast('End call failed: ' + (e.message || e), 'error');
  }
}

// ── Mobile wrapper: PSTN bridge ──────────────────────────────────────────────
// Capacitor WebView can't reliably do WebRTC, so we route mobile calls through
// the /api/twilio/dial endpoint. Twilio rings the rep's phone first; on
// answer, plays the "Connecting you to {customer}" prompt and dials the
// customer with dual-channel recording. Recording lands via the existing
// /recording webhook; activity row is written by /status on call completion.
async function dialViaTwilioBridge(phone, entityId, entityType, contactName) {
  if (!phone) {
    if (typeof addToast === 'function') addToast('No phone number to dial', 'error');
    return;
  }
  var idToken = '';
  try { idToken = localStorage.getItem('spartan_native_id_token') || ''; } catch(e){}
  if (!idToken) {
    if (typeof addToast === 'function') addToast('Sign out and back in to enable calling', 'error');
    return;
  }
  if (typeof addToast === 'function') addToast('📞 Calling…', 'info');
  try {
    var resp = await fetch('https://spaartan.tech/api/twilio/dial', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + idToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        contactName: contactName || '',
        entityId: entityId || null,
        entityType: entityType || null,
      }),
    });
    var data = {};
    try { data = await resp.json(); } catch(e){}
    if (resp.ok) {
      // Track the call so the active-call banner shows + the End button has
      // a SID to hang up. Persisted to localStorage in case the wrapper is
      // backgrounded / killed mid-call.
      if (data && data.callSid) {
        _activeCallSidMobile = data.callSid;
        _activeCallContactMobile = contactName || '';
        _saveActiveCallMobile();
      }
      if (typeof addToast === 'function') addToast('Your phone will ring shortly ✓', 'success');
      if (typeof renderPage === 'function') renderPage();
      return;
    }
    // Translate the most common backend errors into actionable rep-friendly
    // text. NO_REP_PHONE is the C1 hard-error case — surfaced verbatim.
    var raw = (data && (data.message || data.error)) || ('HTTP ' + resp.status);
    var friendly;
    if (data && data.error === 'NO_REP_PHONE') {
      friendly = data.message;
    } else if (/expired|empty bearer|invalid.*id token/i.test(raw)) {
      friendly = 'Sign out and back in to refresh your session';
    } else if (/TWILIO_PHONE_NUMBER not configured/i.test(raw)) {
      friendly = 'Twilio not configured — check with admin';
    } else {
      friendly = raw;
    }
    if (typeof addToast === 'function') addToast('Call failed: ' + friendly, 'error');
  } catch (e) {
    if (typeof addToast === 'function') addToast('Network error: ' + (e.message || e), 'error');
  }
}

async function twilioCall(phone, entityId, entityType, contactName) {
  // Capacitor wrapper: bypass the WebRTC SDK and bridge through PSTN.
  // The desktop's _twilioDevice is never connected on the wrapper, so the
  // native check has to come BEFORE the connectivity guard below.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    return dialViaTwilioBridge(phone, entityId, entityType, contactName);
  }
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

  // Voice SDK v2 changed Device.connect() to return Promise<Call> rather
  // than Call directly. Without awaiting, every subsequent .on() / .mute() /
  // .disconnect() call ran against the Promise object — silently no-op for
  // .on() (Promise has no such method, but assigning to it does nothing
  // visible) and a TypeError for .disconnect(). Detect and unwrap defensively
  // in case future SDK versions change the contract again.
  var connectResult;
  try {
    connectResult = _twilioDevice.connect({
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

  var call;
  if (connectResult && typeof connectResult.then === 'function') {
    try {
      call = await connectResult;
    } catch (e) {
      console.error('[Spartan] twilioDevice.connect() promise rejected:', e);
      if (typeof addToast === 'function') addToast('Failed to start call: ' + (e && e.message ? e.message : 'unknown'), 'error');
      return;
    }
  } else {
    call = connectResult;
  }
  if (!call || typeof call.on !== 'function') {
    console.error('[Spartan] connect() returned an unexpected shape:', call);
    if (typeof addToast === 'function') addToast('Failed to start call: SDK error', 'error');
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

// End the active call. Belt-and-braces: fire BOTH the SDK's .disconnect()
// AND a backend REST-API hangup in parallel. Whichever arrives at Twilio's
// gateway first ends the call; the other becomes a no-op on the second
// trip.
//
// Why both:
//   - SDK .disconnect() is fast (no network round-trip from us, just a
//     WebRTC signal) but unreliable — has historically silently no-op'd
//     in some call states, leaving the gateway running the call for ~30s
//     until it times out on its own.
//   - Backend REST-API hangup goes directly to Twilio's API
//     (api.twilio.com/Calls/{Sid}.json with Status=completed) using our
//     server credentials. Bypasses WebRTC entirely. Bulletproof.
//
// Plus a 2s safety-net timeout to force-clear UI if neither path produces
// the SDK's 'disconnect' event for some reason.
function twilioHangup() {
  if (!_twilioActiveCall || !_twilioActiveCall.callObject) return;

  // Fire path 1: SDK disconnect
  try { _twilioActiveCall.callObject.disconnect(); } catch(e) {
    console.warn('[Spartan] call.disconnect() threw:', e);
  }

  // Fire path 2: backend REST hangup. Pull CallSid from the call object's
  // parameters — set by the SDK once Twilio assigns the real CA... id (early
  // in the lifecycle there's only a temp_call_sid, but by the time the rep
  // sees the End button the real one is available).
  var callSid = null;
  try {
    var p = _twilioActiveCall.callObject.parameters;
    if (p && p.CallSid) callSid = p.CallSid;
  } catch(e) {}

  if (callSid) {
    var googleToken = (typeof getState === 'function') ? getState().gmailToken : null;
    if (googleToken) {
      fetch('/api/twilio/hangup?sid=' + encodeURIComponent(callSid), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + googleToken }
      }).then(function(resp) {
        if (!resp.ok) console.warn('[Spartan] /api/twilio/hangup returned', resp.status);
      }).catch(function(e) {
        console.warn('[Spartan] /api/twilio/hangup fetch failed:', e);
      });
    }
  }

  // Safety net: force-clear UI state after 2s in case neither path fires
  // the SDK's 'disconnect' event (rare but possible).
  setTimeout(function() {
    if (_twilioActiveCall) {
      console.log('[Spartan] Force-clearing active call state after hangup timeout');
      _twilioOnDisconnect();
    }
  }, 2000);
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

// ───────────────────── Stage 5: Phone page UI ───────────────────────────────

// Page-level state for the Phone tab. Tab filter + the dialpad's current
// number string. Survives renderPage rebuilds without going into _state.
var _phonePageState = {
  tab: 'all',          // all | inbound | outbound | missed
  dialNumber: '',
};

// Cache of fetched recording blobs so re-renders don't re-download. Keyed by
// Twilio CallSid. URL.createObjectURL() returns a blob URL that's valid for
// the page lifetime.
var _phoneAudioBlobs = {};   // { callSid: blobUrl }
var _phoneAudioLoading = {}; // { callSid: true } while fetch is in flight

function setPhonePageTab(tab) {
  _phonePageState.tab = tab;
  if (typeof renderPage === 'function') renderPage();
}
function setPhonePageDialDigit(digit) {
  _phonePageState.dialNumber = (_phonePageState.dialNumber || '') + String(digit);
  var el = document.getElementById('phoneDialInput');
  if (el) el.value = _phonePageState.dialNumber;
}
function setPhonePageDialFromInput(value) {
  _phonePageState.dialNumber = String(value || '');
}
function clearPhonePageDial() {
  _phonePageState.dialNumber = '';
  var el = document.getElementById('phoneDialInput');
  if (el) el.value = '';
}
function backspacePhonePageDial() {
  _phonePageState.dialNumber = (_phonePageState.dialNumber || '').slice(0, -1);
  var el = document.getElementById('phoneDialInput');
  if (el) el.value = _phonePageState.dialNumber;
}
function dialFromPhonePage() {
  var num = (_phonePageState.dialNumber || '').trim();
  if (!num) {
    if (typeof addToast === 'function') addToast('Enter a number first', 'warning');
    return;
  }
  twilioCall(num, null, null);
}
function dialRecentNumber(num) {
  _phonePageState.dialNumber = num;
  twilioCall(num, null, null);
}

// Click "Play recording" → fetch with auth, swap the button for an <audio> tag.
async function loadAndPlayRecording(callSid, slotId) {
  if (_phoneAudioLoading[callSid]) return;
  var slot = document.getElementById(slotId);
  if (!slot) return;

  // Already loaded — just toggle play
  if (_phoneAudioBlobs[callSid]) {
    var existing = slot.querySelector('audio');
    if (existing) { try { existing.play(); } catch(e) {} return; }
  }

  _phoneAudioLoading[callSid] = true;
  slot.innerHTML = '<span style="font-size:11px;color:#6b7280">⏳ Loading…</span>';

  var token = (typeof getState === 'function') ? getState().gmailToken : null;
  if (!token) {
    slot.innerHTML = '<span style="font-size:11px;color:#b91c1c">⚠️ Connect Gmail to play</span>';
    delete _phoneAudioLoading[callSid];
    return;
  }

  try {
    var resp = await fetch('/api/twilio/recording-stream?sid=' + encodeURIComponent(callSid), {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) {
      var msg = '⚠️ Failed (' + resp.status + ')';
      try {
        var errJson = await resp.json();
        if (errJson && errJson.error) msg = '⚠️ ' + errJson.error;
      } catch(e) {}
      slot.innerHTML = '<span style="font-size:11px;color:#b91c1c">' + msg + '</span>';
      delete _phoneAudioLoading[callSid];
      return;
    }
    var blob = await resp.blob();
    var blobUrl = URL.createObjectURL(blob);
    _phoneAudioBlobs[callSid] = blobUrl;
    slot.innerHTML = '<audio controls autoplay src="' + blobUrl + '" style="height:30px;vertical-align:middle"></audio>';
    // Mark voicemails as read when played. No-op for non-voicemail rows.
    var s = (typeof getState === 'function') ? getState() : {};
    var matchingLog = ((s.callLogs || []).find(function(c){ return c.twilio_sid === callSid; }));
    if (matchingLog && matchingLog.status === 'voicemail' && !matchingLog.read_at) {
      markVoicemailRead(callSid);
    }
  } catch (e) {
    console.error('[Spartan] Recording fetch failed:', e);
    slot.innerHTML = '<span style="font-size:11px;color:#b91c1c">⚠️ Network error</span>';
  }
  delete _phoneAudioLoading[callSid];
}

// Render the dialpad column.
function renderDialpad() {
  var keys = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  var s = (typeof getState === 'function') ? getState() : {};
  var cu = (typeof getCurrentUser === 'function') ? getCurrentUser() || {} : {};
  // Recent numbers from state.callLogs — outbound calls by this rep, dedupe
  var recent = ((s.callLogs || [])
    .filter(function(l){ return l.direction === 'outbound' && l.user_id === cu.id && l.to_number; })
    .map(function(l){ return l.to_number; }));
  var seen = {}; var recentUnique = [];
  for (var i = 0; i < recent.length && recentUnique.length < 5; i++) {
    if (!seen[recent[i]]) { seen[recent[i]] = 1; recentUnique.push(recent[i]); }
  }

  return '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.06em;margin-bottom:10px">Dialpad</div>'

    + '<div style="display:flex;gap:6px;align-items:center;margin-bottom:14px">'
    +   '<input id="phoneDialInput" value="' + (_phonePageState.dialNumber || '').replace(/"/g, '&quot;') + '" placeholder="+61 4xx xxx xxx" oninput="setPhonePageDialFromInput(this.value)" style="flex:1;font-family:monospace;font-size:18px;font-weight:600;letter-spacing:1px;padding:10px 12px;border:2px solid #e5e7eb;border-radius:10px;outline:none">'
    +   '<button onclick="backspacePhonePageDial()" title="Backspace" style="padding:10px 14px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;cursor:pointer;font-size:16px">⌫</button>'
    + '</div>'

    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">'
    +   keys.map(function(k){
          return '<button onclick="setPhonePageDialDigit(\'' + k + '\')" class="dialpad-key" style="font-size:22px;font-weight:600;padding:18px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;cursor:pointer;font-family:inherit;min-height:60px" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#f9fafb\'">' + k + '</button>';
        }).join('')
    + '</div>'

    + '<button onclick="dialFromPhonePage()" style="width:100%;padding:14px;background:#22c55e;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px">📞 Call</button>'

    + (recentUnique.length > 0 ? (
        '<div style="margin-top:16px;padding-top:14px;border-top:1px solid #f0f0f0">'
        +   '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;letter-spacing:.05em;margin-bottom:8px">Recent</div>'
        +   '<div style="display:flex;flex-wrap:wrap;gap:6px">'
        +     recentUnique.map(function(n){
                return '<button onclick="dialRecentNumber(\'' + n + '\')" style="font-size:12px;font-family:monospace;padding:5px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:18px;cursor:pointer">' + n + '</button>';
              }).join('')
        +   '</div>'
        + '</div>'
      ) : '')

    + '</div>';
}

// Render a single row in the call-history list. `compactMode` flag is for
// the voicemail section (drops the "Call back" button — voicemail isn't a
// missed call to return).
function renderCallHistoryRow(call, opts) {
  opts = opts || {};
  var s = (typeof getState === 'function') ? getState() : {};
  // Resolve matched-entity name for display
  var entityName = '';
  if (call.entity_id && call.entity_type) {
    if (call.entity_type === 'contact') {
      var c = (s.contacts || []).find(function(x){ return x.id === call.entity_id; });
      if (c) entityName = ((c.fn || '') + ' ' + (c.ln || '')).trim();
    } else if (call.entity_type === 'lead') {
      var l = (s.leads || []).find(function(x){ return x.id === call.entity_id; });
      if (l) entityName = ((l.fn || '') + ' ' + (l.ln || '')).trim();
    } else if (call.entity_type === 'deal') {
      var d = (s.deals || []).find(function(x){ return x.id === call.entity_id; });
      if (d) entityName = d.title || '';
    }
  }
  var displayName = entityName || (call.from_number || call.to_number || 'Unknown');
  var phoneShown = call.direction === 'outbound' ? (call.to_number || '') : (call.from_number || '');

  // Direction icon
  var icon = '📞';
  var statusLabel = call.status || '';
  var rowBg = '#fff';
  if (opts.voicemail) { icon = '📨'; rowBg = '#fef9c3'; }
  else if (call.direction === 'inbound') {
    if (statusLabel === 'no-answer' || statusLabel === 'busy' || statusLabel === 'canceled' || statusLabel === 'failed') {
      icon = '❌'; rowBg = '#fef2f2';
    } else { icon = '📥'; }
  } else {
    icon = '📤';
  }

  // Timestamp — relative if recent, otherwise short date
  var startedAt = call.started_at || call.created_at;
  var when = formatRelativeTime(startedAt);

  // Duration formatted
  var durSec = call.duration_seconds || 0;
  var durLabel = durSec > 0 ? _twilioFmtDuration(durSec) : '';

  // Recording slot — clickable button or already-loaded audio
  var slotId = 'rec_slot_' + (call.twilio_sid || call.id);
  var recordingHtml = '';
  if (call.recording_url) {
    if (_phoneAudioBlobs[call.twilio_sid]) {
      recordingHtml = '<div id="' + slotId + '"><audio controls src="' + _phoneAudioBlobs[call.twilio_sid] + '" style="height:30px;vertical-align:middle"></audio></div>';
    } else {
      recordingHtml = '<div id="' + slotId + '"><button onclick="loadAndPlayRecording(\'' + call.twilio_sid + '\',\'' + slotId + '\')" style="font-size:11px;padding:4px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit">▶ Play recording</button></div>';
    }
  }

  // Action buttons
  var actions = '';
  if (call.direction === 'outbound' && phoneShown) {
    actions += '<button onclick="twilioCall(\'' + phoneShown + '\',\'' + (call.entity_id||'') + '\',\'' + (call.entity_type||'') + '\')" style="font-size:11px;padding:4px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit;margin-left:6px">📞 Call back</button>';
  }
  if (call.entity_id && call.entity_type) {
    var nav = '';
    if (call.entity_type === 'contact') nav = "setState({contactDetailId:'" + call.entity_id + "',page:'contacts'})";
    else if (call.entity_type === 'lead') nav = "setState({leadDetailId:'" + call.entity_id + "',page:'leads'})";
    else if (call.entity_type === 'deal') nav = "setState({dealDetailId:'" + call.entity_id + "',page:'deals'})";
    if (nav) {
      actions += '<button onclick="' + nav + '" style="font-size:11px;padding:4px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;font-family:inherit;margin-left:6px">View record</button>';
    }
  }

  return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:' + rowBg + ';border:1px solid #e5e7eb;border-radius:10px;margin-bottom:6px">'
    + '<div style="font-size:18px;flex-shrink:0">' + icon + '</div>'
    + '<div style="flex:1;min-width:0">'
    +   '<div style="font-size:13px;font-weight:600;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + displayName + '</div>'
    +   '<div style="font-size:11px;color:#6b7280;margin-top:1px">' + (phoneShown || '') + (durLabel ? ' · ' + durLabel : '') + ' · ' + when + (statusLabel && !opts.voicemail ? ' · ' + statusLabel : '') + '</div>'
    + '</div>'
    + (recordingHtml ? '<div style="flex-shrink:0">' + recordingHtml + '</div>' : '')
    + (actions ? '<div style="flex-shrink:0;display:flex;align-items:center">' + actions + '</div>' : '')
    + '</div>';
}

// Mark a voicemail as read — called when a rep plays its audio.
// Fire-and-forget update; realtime sub will reflect it back into state.
function markVoicemailRead(callSid) {
  if (!callSid) return;
  if (typeof getState === 'function') {
    var s = getState();
    var logs = s.callLogs || [];
    var changed = false;
    var next = logs.map(function(c) {
      if (c.twilio_sid === callSid && !c.read_at) {
        changed = true;
        return Object.assign({}, c, { read_at: new Date().toISOString() });
      }
      return c;
    });
    if (changed) setState({ callLogs: next });
  }
  if (typeof _sb !== 'undefined' && _sb) {
    _sb.from('call_logs').update({ read_at: new Date().toISOString() }).eq('twilio_sid', callSid).then(function(r){
      if (r.error) console.warn('[Spartan] mark voicemail read failed:', r.error.message);
    });
  }
}

// Count of unread voicemails for the topbar badge. Voicemails are communal —
// any rep with phone.access can see/play them, so the count is account-wide
// rather than per-rep.
function unreadVoicemailCount() {
  if (typeof hasPermission === 'function' && !hasPermission('phone.access')) return 0;
  var logs = (typeof getState === 'function') ? (getState().callLogs || []) : [];
  return logs.filter(function(c){ return c.status === 'voicemail' && !c.read_at; }).length;
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  var now = Date.now();
  var diffMs = now - d.getTime();
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return diffMin + ' min ago';
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + 'h ago';
  var diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return diffDay + ' days ago';
  return d.toISOString().slice(0, 10);
}

// Filter call_logs based on the active tab. Voicemails are always excluded
// from the main list (they get their own section).
function _filterCallsByTab(calls, tab) {
  var nonVm = (calls || []).filter(function(c){ return c.status !== 'voicemail'; });
  if (tab === 'inbound') return nonVm.filter(function(c){ return c.direction === 'inbound' && c.status !== 'no-answer' && c.status !== 'busy' && c.status !== 'canceled' && c.status !== 'failed'; });
  if (tab === 'outbound') return nonVm.filter(function(c){ return c.direction === 'outbound'; });
  if (tab === 'missed') return nonVm.filter(function(c){ return c.direction === 'inbound' && (c.status === 'no-answer' || c.status === 'busy' || c.status === 'canceled' || c.status === 'failed'); });
  return nonVm;
}

// Main Phone page — replaces the stage-1 stub at modules/13-leads-maps.js.
function renderPhonePage() {
  if (typeof hasPermission === 'function' && !hasPermission('phone.access')) {
    return '<div style="max-width:540px;margin:80px auto;text-align:center"><div style="font-size:42px;margin-bottom:8px">🔒</div><h2 style="font-size:18px;font-weight:700;margin:0 0 8px">No phone access</h2><p style="font-size:13px;color:#6b7280;margin:0">Ask an admin to grant the <code>phone.access</code> permission to your role.</p></div>';
  }

  var s = (typeof getState === 'function') ? getState() : {};
  var cu = (typeof getCurrentUser === 'function') ? getCurrentUser() || {} : {};
  var allLogs = s.callLogs || [];

  // Permission gate per row: admin sees all, others see only own. Inbound
  // unbound (no rep answered) is visible to anyone with phone.access for v1.
  var visibleLogs = (cu.role === 'admin')
    ? allLogs
    : allLogs.filter(function(l){
        return l.user_id === cu.id || (l.direction === 'inbound' && !l.user_id);
      });

  var tabFilteredCalls = _filterCallsByTab(visibleLogs, _phonePageState.tab).slice(0, 50);
  var voicemails = visibleLogs.filter(function(l){ return l.status === 'voicemail'; }).slice(0, 50);

  var totalCount = visibleLogs.filter(function(c){return c.status !== 'voicemail';}).length;
  var inboundCount = visibleLogs.filter(function(c){ return c.direction === 'inbound' && c.status !== 'voicemail' && c.status !== 'no-answer' && c.status !== 'busy' && c.status !== 'canceled' && c.status !== 'failed'; }).length;
  var outboundCount = visibleLogs.filter(function(c){ return c.direction === 'outbound'; }).length;
  var missedCount = visibleLogs.filter(function(c){ return c.direction === 'inbound' && (c.status === 'no-answer' || c.status === 'busy' || c.status === 'canceled' || c.status === 'failed'); }).length;

  var phoneReady = !!window._twilioReady;
  var statusBanner = phoneReady
    ? '<div style="padding:8px 14px;background:#dcfce7;border:1px solid #86efac;border-radius:10px;font-size:12px;color:#15803d;display:flex;align-items:center;gap:6px">✓ Phone connected</div>'
    : '<div style="padding:8px 14px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;font-size:12px;color:#92400e;display:flex;align-items:center;gap:6px">⚠ Phone not connected — connect Gmail in Settings</div>';

  function tabBtn(id, label, count) {
    var on = _phonePageState.tab === id;
    return '<button onclick="setPhonePageTab(\'' + id + '\')" style="padding:8px 14px;background:' + (on ? '#1a1a1a' : '#fff') + ';color:' + (on ? '#fff' : '#374151') + ';border:1px solid ' + (on ? '#1a1a1a' : '#e5e7eb') + ';border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">' + label + ' <span style="opacity:.7;font-weight:400">' + count + '</span></button>';
  }

  return ''
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px">'
    +   '<div>'
    +     '<h1 style="font-size:24px;font-weight:800;margin:0;font-family:Syne,sans-serif">📞 Phone</h1>'
    +     '<p style="font-size:13px;color:#6b7280;margin:2px 0 0">Click-to-call, history, voicemails, recordings</p>'
    +   '</div>'
    +   statusBanner
    + '</div>'

    + '<style>@media (max-width: 800px) { .phone-grid { grid-template-columns: 1fr !important; } }</style>'
    + '<div class="phone-grid" style="display:grid;grid-template-columns:340px 1fr;gap:18px;align-items:start">'

    // Left column — dialpad
    +   '<div>' + renderDialpad() + '</div>'

    // Right column — tabs + call history + voicemails
    +   '<div>'
    +     '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">'
    +       tabBtn('all', 'All', totalCount)
    +       tabBtn('inbound', 'Inbound', inboundCount)
    +       tabBtn('outbound', 'Outbound', outboundCount)
    +       tabBtn('missed', 'Missed', missedCount)
    +     '</div>'

    +     '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:18px">'
    +       '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.06em;margin-bottom:10px">Recent Calls</div>'
    +       (tabFilteredCalls.length === 0
            ? '<div style="padding:32px 16px;text-align:center;color:#9ca3af;font-size:13px">No calls yet. Use the dialpad on the left to make your first call.</div>'
            : tabFilteredCalls.map(function(c){ return renderCallHistoryRow(c, {}); }).join(''))
    +     '</div>'

    +     '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px">'
    +       '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
    +         '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;letter-spacing:.06em">📨 Voicemails</div>'
    +         '<div style="font-size:11px;color:#9ca3af">' + voicemails.length + ' total</div>'
    +       '</div>'
    +       (voicemails.length === 0
            ? '<div style="padding:18px 16px;text-align:center;color:#9ca3af;font-size:12px">No voicemails.</div>'
            : voicemails.map(function(c){ return renderCallHistoryRow(c, { voicemail: true }); }).join(''))
    +     '</div>'

    +   '</div>'
    + '</div>';
}

