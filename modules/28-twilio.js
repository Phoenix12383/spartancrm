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

// Tear down the Twilio Device — called on logout to release the JWT slot
// and disconnect any active WebRTC peer connection.
function twilioDestroy() {
  if (_twilioDevice) {
    try { _twilioDevice.destroy(); } catch(e) {}
    _twilioDevice = null;
  }
  window._twilioReady = false;
}
