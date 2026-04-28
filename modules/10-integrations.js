// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 10-integrations.js
// Extracted from original index.html lines 7016-7710
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// GMAIL INTEGRATION MODULE
// ══════════════════════════════════════════════════════════════════════════════

// ── OAuth config ─────────────────────────────────────────────────────────────
// Admin sets Google Client ID once in Settings > Email - shared for all users
let GMAIL_CLIENT_ID = localStorage.getItem('spartan_gmail_client_id') || '54203725419-2ad869ea9p81lcmf6osm5htos0maoepl.apps.googleusercontent.com';
let MAPS_API_KEY = localStorage.getItem('spartan_maps_api_key') || 'AIzaSyCONh0Rxci_gHGS5_DG-UvZ5h62pISO4hA';
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';
let gmailTokenClient = null;
let gmailComposerOpen = false;
let gmailComposerData = {to:'', subject:'', body:'', cc:'', bcc:'', entityId:'', entityType:''};
let gmailInboxOpen = false;
let gmailInboxContact = null;

// ── Google Sign-In for login ─────────────────────────────────────────────────
function googleSignInForLogin() {
  if (!GMAIL_CLIENT_ID) { alert('Admin must set Google Client ID first in Settings > Email & Gmail'); return; }
  if (typeof google === 'undefined') { alert('Google Sign-In not loaded. Check internet connection.'); return; }
  try {
    var client = google.accounts.oauth2.initTokenClient({
      client_id: GMAIL_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events',
      callback: function(resp) {
        if (resp.error) { alert('Google auth failed: ' + resp.error); return; }
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: 'Bearer ' + resp.access_token }
        }).then(function(r){return r.json();}).then(function(profile) {
          var users = getUsers();
          var user = users.find(function(u){ return u.email.toLowerCase() === profile.email.toLowerCase() && u.active; });
          if (!user) {
            var el = document.getElementById('loginErr');
            if(el){el.textContent='Access denied. No active account for '+profile.email+'. Contact your administrator.';el.style.display='block';}
            return;
          }
          if (profile.picture) { users = getUsers(); var u2 = users.find(function(x){return x.id===user.id;}); if(u2){u2.googlePic=profile.picture;saveUsers(users);} }
          setCurrentUser(user.id);
          localStorage.setItem('spartan_gmail_token_'+user.id, resp.access_token);
          localStorage.setItem('spartan_gmail_profile_'+user.id, JSON.stringify({email:profile.email, name:profile.name, picture:profile.picture}));
          location.reload();
        }).catch(function(e){ alert('Failed to get Google profile'); });
      },
    });
    client.requestAccessToken();
  } catch(e) { alert('Google Sign-In error: ' + e.message); }
}

// ── Auto-restore Gmail connection on login ───────────────────────────────────
function autoRestoreGmail() {
  var cu = getCurrentUser();
  if (!cu) return;
  var token = localStorage.getItem('spartan_gmail_token_'+cu.id);
  var profile = localStorage.getItem('spartan_gmail_profile_'+cu.id);
  if (!token || !profile) return;

  // Validate token before trusting it — Google OAuth access tokens expire after ~1 hour
  fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + token }
  }).then(function(r){
    if (!r.ok) throw new Error('token_expired');
    return r.json();
  }).then(function(p){
    setState({ gmailConnected: true, gmailToken: token, gmailUser: p });
    setTimeout(gmailSyncEmails, 1000);
    // Now that gmailToken is in state, kick off Twilio device registration.
    // Safe to call even if twilio module isn't loaded — typeof guard.
    if (typeof twilioInit === 'function') twilioInit();
  }).catch(function(){
    // Token expired — clear stored credentials and prompt silently
    localStorage.removeItem('spartan_gmail_token_'+cu.id);
    localStorage.removeItem('spartan_gmail_profile_'+cu.id);
    console.warn('[Spartan] Gmail token expired \u2014 user must reconnect');
  });
}

// ── Initialise token client ───────────────────────────────────────────────────
// Retries itself until the Google Identity Services script is ready. On a
// fresh/cold session the GIS script can take 1–3s to download, so a single
// attempt at startup is not enough — we'd leave gmailTokenClient null and the
// user sees "Google Sign-In not ready" when they click Connect Gmail.
var _gmailInitAttempts = 0;
var _gmailInitMaxAttempts = 50;   // 50 × 200ms = 10 seconds
var _gmailInitPending = false;
var _gmailConnectPending = false;
function gmailInit() {
  if (gmailTokenClient) return;             // already initialised
  if (!GMAIL_CLIENT_ID) return;             // nothing we can do until admin sets the Client ID
  // If google exists but only has .maps (race condition with Maps loading first),
  // force-reload GIS to ensure .accounts.oauth2 gets attached.
  if (typeof google !== 'undefined' && google.maps && !google.accounts) {
    var existingGis = document.querySelector('script[src*="gsi/client"]');
    if (existingGis && !existingGis.dataset.reloaded) {
      existingGis.dataset.reloaded = '1';
      existingGis.remove();
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client?_=' + Date.now();
      s.onload = function() { _gmailInitPending = false; gmailInit(); };
      document.head.appendChild(s);
      _gmailInitPending = true;
      return;
    }
  }
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2 || typeof google.accounts.oauth2.initTokenClient !== 'function') {
    // GIS script hasn't loaded yet — schedule a retry (but don't stack
    // multiple in-flight retries if gmailInit is called from several places).
    if (_gmailInitPending) return;
    if (_gmailInitAttempts >= _gmailInitMaxAttempts) {
      console.warn('[Spartan] Google Identity Services did not load after 10s — check network / adblocker');
      return;
    }
    _gmailInitAttempts++;
    _gmailInitPending = true;
    setTimeout(function(){ _gmailInitPending = false; gmailInit(); }, 200);
    return;
  }
  try {
    gmailTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GMAIL_CLIENT_ID,
      scope: GMAIL_SCOPES,
      callback: gmailHandleToken,
    });
    console.log('[Spartan] Gmail token client initialised');
    // If gmailConnect was called before GIS was ready, it stashed a pending
    // request — fire it now that we're able.
    if (_gmailConnectPending) {
      _gmailConnectPending = false;
      gmailTokenClient.requestAccessToken();
    }
  } catch(e) { console.warn('GIS init failed:', e); }
}

function gmailHandleToken(resp) {
  if (resp.error) { addToast('Gmail auth failed: ' + resp.error, 'error'); return; }
  var cu = getCurrentUser();
  // Fetch user profile
  fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: 'Bearer ' + resp.access_token }
  }).then(r => r.json()).then(profile => {
    var gmailUser = { email: profile.email, name: profile.name, picture: profile.picture };
    setState({
      gmailConnected: true,
      gmailToken: resp.access_token,
      gmailUser: gmailUser,
    });
    // Persist so autoRestoreGmail() can bring it back after logout/reload.
    if (cu) {
      try {
        localStorage.setItem('spartan_gmail_token_'+cu.id, resp.access_token);
        localStorage.setItem('spartan_gmail_profile_'+cu.id, JSON.stringify(gmailUser));
      } catch(e) { console.warn('[Gmail] localStorage persist failed:', e); }
    }
    addToast('Gmail connected: ' + profile.email, 'success');
    setTimeout(gmailSyncEmails, 500);
    // Connect-Gmail also unlocks the phone module — kick off device registration
    // so the rep doesn't have to refresh after granting OAuth permission.
    if (typeof twilioInit === 'function') twilioInit();
    // Audit (Brief 2 Phase 2). Don't include the access token in metadata —
    // it's a credential. Just record that a connection happened + the email.
    if (typeof appendAuditEntry === 'function') {
      appendAuditEntry({
        entityType:'integration', entityId:'gmail', action:'integration.connected',
        summary:'Gmail connected: ' + profile.email,
        after:{ provider:'gmail', email:profile.email, name:profile.name },
      });
    }
  }).catch(() => {
    var gmailUser = { email: 'Connected', name: 'Gmail User', picture: '' };
    setState({ gmailConnected: true, gmailToken: resp.access_token, gmailUser: gmailUser });
    if (cu) {
      try {
        localStorage.setItem('spartan_gmail_token_'+cu.id, resp.access_token);
        localStorage.setItem('spartan_gmail_profile_'+cu.id, JSON.stringify(gmailUser));
      } catch(e) {}
    }
    addToast('Gmail connected!', 'success');
    setTimeout(gmailSyncEmails, 500);
    if (typeof twilioInit === 'function') twilioInit();
  });
}

function gmailConnect() {
  if (!GMAIL_CLIENT_ID) {
    addToast('Enter your Google Client ID in Settings → Email first', 'error');
    // Clear detail IDs before navigating — renderPage resolves `effectivePage`
    // from jobDetailId/dealDetailId/leadDetailId/contactDetailId BEFORE `page`,
    // so leaving them set makes the page:'settings' nav silently fail. Also
    // set settTab (module-local `let` in 12-settings.js) so the Email section
    // is what the user lands on, not the Pipelines default.
    setState({
      page: 'settings',
      dealDetailId: null,
      leadDetailId: null,
      contactDetailId: null,
      jobDetailId: null,
    });
    settTab = 'email';
    return;
  }
  if (gmailTokenClient) {
    gmailTokenClient.requestAccessToken();
    return;
  }
  // Token client not ready yet — the Google Identity Services script is
  // probably still loading on this fresh session. Stash a pending-request
  // flag and kick off gmailInit; gmailInit will fire requestAccessToken()
  // automatically as soon as GIS becomes available.
  _gmailConnectPending = true;
  addToast('Preparing Google Sign-In…', 'info');
  gmailInit();
  // Safety: if GIS never loads, clear the pending flag after 12s so we
  // don't silently auth a user on some much later attempt.
  setTimeout(function(){
    if (_gmailConnectPending) {
      _gmailConnectPending = false;
      if (!gmailTokenClient) {
        addToast('Google Sign-In could not load — check your network or disable adblockers, then try again', 'error');
      }
    }
  }, 12000);
}

function gmailDisconnect() {
  if (getState().gmailToken && typeof google !== 'undefined') {
    google.accounts.oauth2.revoke(getState().gmailToken, () => {});
  }
  var cu = getCurrentUser();
  if (cu) {
    localStorage.removeItem('spartan_gmail_token_'+cu.id);
    localStorage.removeItem('spartan_gmail_profile_'+cu.id);
  }
  // Reset calendar fetch state so a future reconnect fetches fresh events.
  _calEvents = [];
  _calFetched = false;
  _calLoading = false;
  // Capture before state for audit (the gmailUser email, etc.) before we clear it.
  var prevUser = getState().gmailUser;
  setState({ gmailConnected: false, gmailToken: null, gmailUser: null });
  addToast('Gmail disconnected', 'warning');
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'integration', entityId:'gmail', action:'integration.disconnected',
      summary:'Gmail disconnected' + (prevUser && prevUser.email ? ': ' + prevUser.email : ''),
      before: prevUser ? { provider:'gmail', email:prevUser.email } : null,
    });
  }
}

// ── Gmail Inbox & Sent Sync ──────────────────────────────────────────────────
var _gmailSyncing = false;
var _gmailLastSync = 0;

function gmailSyncEmails() {
  var token = getState().gmailToken;
  if (!token || _gmailSyncing) return;
  if (Date.now() - _gmailLastSync < 30000) return; // throttle: 30s
  _gmailSyncing = true;
  _gmailLastSync = Date.now();

  // Fetch inbox
  fetch('https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=25&labelIds=INBOX', {
    headers: { Authorization: 'Bearer ' + token }
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if (!data.messages) { _gmailSyncing = false; return; }
    return Promise.all(data.messages.slice(0,25).map(function(m){
      return fetch('https://www.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=full', {
        headers: { Authorization: 'Bearer ' + token }
      }).then(function(r){ return r.json(); });
    }));
  })
  .then(function(messages){
    if (!messages) { _gmailSyncing = false; return; }
    var inbox = messages.map(function(msg){
      var headers = msg.payload ? msg.payload.headers || [] : [];
      var getH = function(n){ var h = headers.find(function(x){return x.name.toLowerCase()===n.toLowerCase();}); return h ? h.value : ''; };
      var from = getH('From');
      var fromName = from.replace(/<.*>/,'').trim().replace(/"/g,'') || from;
      var fromEmail = (from.match(/<(.+)>/) || [null, from])[1];
      var dateStr = getH('Date');
      var d = new Date(dateStr);
      var isRead = !(msg.labelIds || []).includes('UNREAD');

      // Extract attachments
      var attachments = [];
      function findAttachments(part) {
        if (part.filename && part.filename.length > 0 && part.body && part.body.attachmentId) {
          attachments.push({ name: part.filename, size: part.body.size || 0, mimeType: part.mimeType || '', attachmentId: part.body.attachmentId, messageId: msg.id });
        }
        if (part.parts) part.parts.forEach(findAttachments);
      }
      if (msg.payload) findAttachments(msg.payload);

      // Extract body text
      var bodyText = msg.snippet || '';
      function findBody(part) {
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          try { bodyText = atob(part.body.data.replace(/-/g,'+').replace(/_/g,'/')); } catch(e){}
        }
        if (part.parts) part.parts.forEach(findBody);
      }
      if (msg.payload) findBody(msg.payload);

      return {
        id: 'gi_' + msg.id, gmailId: msg.id,
        from: fromEmail, fromName: fromName,
        to: getState().gmailUser ? getState().gmailUser.email : '',
        toName: '', subject: getH('Subject') || '(No subject)',
        body: bodyText.slice(0, 2000),
        date: isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10),
        time: isNaN(d.getTime()) ? '' : d.toTimeString().slice(0,5),
        read: isRead, source: 'gmail',
        attachments: attachments,
      };
    });

    // Merge with existing (keep CRM-sent emails, add Gmail inbox)
    var existing = getState().emailInbox.filter(function(m){ return !m.source || m.source !== 'gmail'; });
    var existingIds = new Set(existing.map(function(m){ return m.gmailId; }));
    inbox.forEach(function(m){ if (!existingIds.has(m.gmailId)) existing.push(m); });
    existing.sort(function(a,b){ return (b.date+b.time).localeCompare(a.date+a.time); });
    setState({ emailInbox: existing });
    _gmailSyncing = false;
    renderPage();
  })
  .catch(function(e){ console.warn('Gmail inbox sync error:', e); _gmailSyncing = false; });

  // Fetch sent
  fetch('https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=20&labelIds=SENT', {
    headers: { Authorization: 'Bearer ' + token }
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if (!data.messages) return;
    return Promise.all(data.messages.slice(0,20).map(function(m){
      return fetch('https://www.googleapis.com/gmail/v1/users/me/messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date', {
        headers: { Authorization: 'Bearer ' + token }
      }).then(function(r){ return r.json(); });
    }));
  })
  .then(function(messages){
    if (!messages) return;
    var sent = messages.map(function(msg){
      var headers = msg.payload ? msg.payload.headers || [] : [];
      var getH = function(n){ var h = headers.find(function(x){return x.name.toLowerCase()===n.toLowerCase();}); return h ? h.value : ''; };
      var to = getH('To');
      var toName = to.replace(/<.*>/,'').trim().replace(/"/g,'') || to;
      var toEmail = (to.match(/<(.+)>/) || [null, to])[1];
      var dateStr = getH('Date');
      var d = new Date(dateStr);
      return {
        id: 'gs_' + msg.id,
        gmailId: msg.id,
        from: getState().gmailUser ? getState().gmailUser.email : '',
        fromName: getState().gmailUser ? getState().gmailUser.name : '',
        to: toEmail,
        toName: toName,
        subject: getH('Subject') || '(No subject)',
        body: msg.snippet || '',
        date: isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10),
        time: isNaN(d.getTime()) ? '' : d.toTimeString().slice(0,5),
        read: true,
        source: 'gmail',
        opens: 0,
        openHistory: [],
      };
    });

    var existing = getState().emailSent.filter(function(m){ return !m.source || m.source !== 'gmail'; });
    var existingIds = new Set(existing.map(function(m){ return m.gmailId; }));
    sent.forEach(function(m){ if (!existingIds.has(m.gmailId)) existing.push(m); });
    existing.sort(function(a,b){ return (b.date+b.time).localeCompare(a.date+a.time); });
    setState({ emailSent: existing });
    renderPage();
  })
  .catch(function(e){ console.warn('Gmail sent sync error:', e); });
}

// ── View Gmail attachment in preview bubble ──────────────────────────────────
function downloadGmailAttachment(messageId, attachmentId, filename) {
  var token = getState().gmailToken;
  if (!token) { addToast('Connect Gmail first', 'error'); return; }
  addToast('Loading ' + filename + '\u2026', 'info');
  fetch('https://www.googleapis.com/gmail/v1/users/me/messages/' + messageId + '/attachments/' + attachmentId, {
    headers: { Authorization: 'Bearer ' + token }
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if (!data.data) { addToast('Could not load attachment', 'error'); return; }
    var raw = data.data.replace(/-/g,'+').replace(/_/g,'/');
    var ext = (filename.match(/\.(\w+)$/)||[,''])[1].toLowerCase();
    var isImage = ['jpg','jpeg','png','gif','webp','bmp','svg'].indexOf(ext) >= 0;
    var isPdf = ext === 'pdf';

    // Remove existing bubble
    var existing = document.getElementById('attachBubble');
    if (existing) existing.remove();

    var bubble = document.createElement('div');
    bubble.id = 'attachBubble';
    bubble.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:400;display:flex;align-items:center;justify-content:center';

    var card = '<div style="background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.3);max-width:800px;max-height:85vh;width:90%;overflow:hidden;display:flex;flex-direction:column">'
      +'<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
      +'<div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">'+(isImage?'\ud83d\uddbc':isPdf?'\ud83d\udcc4':'\ud83d\udcc1')+'</span>'
      +'<div><div style="font-size:14px;font-weight:700;color:#111">'+filename+'</div>'
      +'<div style="font-size:11px;color:#6b7280">'+(data.size>1048576?(data.size/1048576).toFixed(1)+'MB':data.size>1024?Math.round(data.size/1024)+'KB':data.size+'B')+'</div></div></div>'
      +'<div style="display:flex;gap:6px"><button onclick="attachDownloadRaw()" class="btn-w" style="font-size:11px">\u2b07 Download</button>'
      +'<button onclick="document.getElementById(\'attachBubble\').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9ca3af;padding:4px">\u00d7</button></div></div>'
      +'<div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;padding:16px;background:#f9fafb;min-height:200px">';

    if (isImage) {
      card += '<img src="data:image/'+ext+';base64,'+raw+'" style="max-width:100%;max-height:65vh;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1)" alt="'+filename+'">';
    } else if (isPdf) {
      card += '<iframe src="data:application/pdf;base64,'+raw+'" style="width:100%;height:65vh;border:none;border-radius:8px"></iframe>';
    } else {
      card += '<div style="text-align:center;padding:40px"><div style="font-size:48px;margin-bottom:12px">\ud83d\udcc1</div>'
        +'<div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px">'+filename+'</div>'
        +'<div style="font-size:12px;color:#6b7280;margin-bottom:16px">Preview not available for this file type</div>'
        +'<button onclick="attachDownloadRaw()" class="btn-r" style="font-size:13px">\u2b07 Download File</button></div>';
    }

    card += '</div></div>';
    bubble.innerHTML = card;

    // Store data for download
    window._attachRaw = raw;
    window._attachFilename = filename;
    window.attachDownloadRaw = function() {
      var binary = atob(window._attachRaw);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var blob = new Blob([bytes]);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = window._attachFilename || 'attachment';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast('Downloaded: ' + window._attachFilename, 'success');
    };

    document.body.appendChild(bubble);
    // Close on background click
    bubble.addEventListener('click', function(ev) {
      if (ev.target === bubble) bubble.remove();
    });
  })
  .catch(function(e){ addToast('Failed to load: ' + e.message, 'error'); });
}

// ── Send email via Gmail API ──────────────────────────────────────────────────
function gmailSend(to, subject, body, cc, entityId, entityType) {
  const { gmailToken, gmailUser } = getState();
  if (!gmailToken) { addToast('Connect Gmail first', 'error'); gmailConnect(); return; }

  // Pre-generate the local sent-id so the tracking pixel URL can reference it.
  // The same id is reused on the emailSent entry below, so syncEmailOpens() can match.
  var sentId = 'es' + Date.now();
  var cu = getCurrentUser();
  var uid = cu ? cu.id : '';

  // Build HTML body with a 1x1 tracking pixel appended.
  // Newlines -> <br>; body is left un-escaped to preserve forwarded HTML content
  // (matches existing behaviour — body is already trusted input from our composer).
  var trackingPixel = '<img src="https://spaartan.tech/api/track?id=' + encodeURIComponent(sentId) +
                      '&uid=' + encodeURIComponent(uid) +
                      '" width="1" height="1" alt="" style="display:none !important;opacity:0" />';
  var htmlBody = (body || '').replace(/\r?\n/g, '<br>') + trackingPixel;

  const from = gmailUser ? gmailUser.email : '';
  const mimeLines = [
    'To: ' + to,
    cc ? 'Cc: ' + cc : '',
    'From: ' + from,
    'Subject: ' + subject,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody,
  ].filter(Boolean);

  const raw = mimeLines.join('\r\n');
  const encoded = btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + gmailToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })
  .then(r => {
    if (!r.ok) return r.json().then(e => { throw e; });
    return r.json();
  })
  .then(msg => {
    // Log to activity timeline
    var actId = 'a' + Date.now();
    var nowDate = new Date().toISOString().slice(0, 10);
    var nowTime = new Date().toTimeString().slice(0, 5);
    var byName = gmailUser ? gmailUser.name : (getCurrentUser()||{name:'Admin'}).name;
    saveActivityToEntity(entityId, entityType, {
      id: actId, type: 'email',
      text: body,
      subject: subject,
      preview: body.slice(0, 120) + (body.length > 120 ? '…' : ''),
      opens: 0, opened: false, openedAt: null,
      to: to, cc: cc || '',
      gmailMsgId: msg.id,
      date: nowDate,
      time: nowTime,
      by: byName,
      done: false, dueDate: '',
    });
    // Also add to emailSent for the Email page and cross-entity tracking.
    // Uses the sentId generated before send so the tracking-pixel URL matches this entry.
    var sentEntry = {
      id: sentId,
      to: to, subject: subject, body: body.slice(0,200),
      date: nowDate, time: nowTime,
      by: byName,
      gmailMsgId: msg.id,
      dealId: entityType === 'deal' ? entityId : null,
      leadId: entityType === 'lead' ? entityId : null,
      contactId: entityType === 'contact' ? entityId : null,
      entityType: entityType,
      entityId: entityId,
      opened: false, openedAt: null, opens: 0, clicked: false,
    };
    setState({ emailSent: [...getState().emailSent, sentEntry] });
    dbInsert('email_sent', emailToDb(sentEntry));
    gmailComposerOpen = false;
    gmailComposerData = { to:'', subject:'', body:'', cc:'', bcc:'', entityId:'', entityType:'' };
    addToast('Email sent via Gmail ✓', 'success');
    detailTab = 'activity';
  })
  .catch(err => {
    const msg = err.error?.message || JSON.stringify(err);
    if (msg.includes('401') || msg.includes('invalid')) {
      var cu = getCurrentUser();
      if (cu) { localStorage.removeItem('spartan_gmail_token_'+cu.id); }
      setState({ gmailConnected: false, gmailToken: null });
      addToast('Session expired — please reconnect Gmail', 'error');
    } else {
      addToast('Send failed: ' + msg.slice(0, 80), 'error');
    }
  });
}

// ── Fetch email threads for a contact ────────────────────────────────────────
function gmailFetchThreads(contactEmail, entityId, entityType) {
  const { gmailToken } = getState();
  if (!gmailToken || !contactEmail) return;

  const q = encodeURIComponent('from:' + contactEmail + ' OR to:' + contactEmail);
  fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=10`, {
    headers: { Authorization: 'Bearer ' + gmailToken },
  })
  .then(r => r.json())
  .then(data => {
    if (!data.messages) return;
    // Fetch each message summary
    return Promise.all(data.messages.slice(0, 8).map(m =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`, {
        headers: { Authorization: 'Bearer ' + gmailToken },
      }).then(r => r.json())
    ));
  })
  .then(messages => {
    if (!messages) return;
    const threads = messages.map(m => {
      const hdrs = (m.payload?.headers || []);
      const hdr = name => hdrs.find(h => h.name === name)?.value || '';
      return {
        id: m.id,
        subject: hdr('Subject') || '(no subject)',
        from: hdr('From'),
        to: hdr('To'),
        date: hdr('Date'),
        snippet: m.snippet || '',
      };
    });
    const et = { ...getState().emailThreads, [contactEmail]: threads };
    setState({ emailThreads: et });
  })
  .catch(err => console.warn('Fetch threads failed:', err));
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE CALENDAR INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════
var _calEvents = [];
var _calLoading = false;
// Tracks whether we've *attempted* a fetch this session. Using _calEvents.length
// as the "have we fetched" proxy loops forever when the user's calendar is
// genuinely empty — renderCalendarWidget sees length===0, fires gcalFetchEvents,
// the fetch returns 0 items, renderPage re-runs the widget, length is still 0,
// fire again… 10 renders/sec.
var _calFetched = false;
var _calCreateOpen = false;
var _calCreateData = {title:'',date:'',time:'10:00',duration:60,attendees:'',location:'',description:'',entityId:'',entityType:''};

function gcalFetchEvents(forceRefresh) {
  var token = getState().gmailToken;
  if (!token) return;
  if (_calFetched && !forceRefresh) return;
  _calLoading = true;
  var now = new Date().toISOString();
  var maxDate = new Date(Date.now() + 30*24*60*60*1000).toISOString();
  fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + encodeURIComponent(now) + '&timeMax=' + encodeURIComponent(maxDate) + '&maxResults=50&singleEvents=true&orderBy=startTime', {
    headers: { Authorization: 'Bearer ' + token }
  })
  .then(function(r){ if(!r.ok) throw new Error('Calendar fetch failed'); return r.json(); })
  .then(function(data){
    _calEvents = (data.items || []).map(function(ev){
      var start = ev.start.dateTime || ev.start.date || '';
      var end = ev.end.dateTime || ev.end.date || '';
      return {
        id: ev.id,
        title: ev.summary || '(No title)',
        start: start,
        end: end,
        location: ev.location || '',
        description: ev.description || '',
        attendees: (ev.attendees || []).map(function(a){ return {email:a.email,name:a.displayName||a.email,status:a.responseStatus||'needsAction'}; }),
        htmlLink: ev.htmlLink || '',
        allDay: !ev.start.dateTime,
      };
    });
    _calFetched = true;
    _calLoading = false;
    renderPage();
  })
  .catch(function(e){
    console.warn('Calendar fetch error:', e);
    // Mark as fetched even on error — prevents an immediate retry storm.
    // The user can hit the manual refresh button to retry later.
    _calFetched = true;
    _calLoading = false;
  });
}

function gcalCreateEvent(entityId, entityType) {
  var token = getState().gmailToken;
  if (!token) { addToast('Connect Gmail first to create calendar events', 'error'); gmailConnect(); return; }
  var d = _calCreateData;
  if (!d.title) { addToast('Event title is required', 'error'); return; }
  if (!d.date) { addToast('Date is required', 'error'); return; }

  var startDT = d.date + 'T' + (d.time || '10:00') + ':00';
  var endMs = new Date(startDT).getTime() + (parseInt(d.duration)||60) * 60000;
  var endDT = new Date(endMs).toISOString().replace('Z','');
  var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Australia/Melbourne';

  var event = {
    summary: d.title,
    location: d.location || '',
    description: d.description || '',
    start: { dateTime: startDT, timeZone: tz },
    end: { dateTime: endDT.slice(0,19), timeZone: tz },
  };

  if (d.attendees) {
    event.attendees = d.attendees.split(',').map(function(e){ return {email: e.trim()}; }).filter(function(a){ return a.email; });
    event.sendUpdates = 'all';
  }

  fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=' + (event.attendees ? 'all' : 'none'), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  })
  .then(function(r){ if(!r.ok) return r.json().then(function(e){throw e;}); return r.json(); })
  .then(function(created){
    // Log as activity
    saveActivityToEntity(entityId || d.entityId, entityType || d.entityType, {
      id: 'a' + Date.now(), type: 'meeting',
      subject: d.title,
      text: 'Calendar event created' + (d.location ? ' at ' + d.location : '') + (d.attendees ? '. Invites sent to: ' + d.attendees : ''),
      date: d.date, time: d.time,
      by: (getCurrentUser()||{name:'Admin'}).name,
      done: false, dueDate: d.date,
      duration: parseInt(d.duration) || 60,
      calLink: created.htmlLink || '',
      scheduled: true,
    });
    _calCreateOpen = false;
    _calCreateData = {title:'',date:'',time:'10:00',duration:60,attendees:'',location:'',description:'',entityId:'',entityType:''};
    gcalFetchEvents(true);
    addToast('Calendar event created' + (d.attendees ? ' — invites sent' : ''), 'success');
  })
  .catch(function(err){
    var msg = err.error ? err.error.message : JSON.stringify(err);
    if (msg.includes('401') || msg.includes('invalid')) {
      var cu = getCurrentUser();
      if (cu) localStorage.removeItem('spartan_gmail_token_'+cu.id);
      setState({ gmailConnected: false, gmailToken: null });
      addToast('Session expired — please reconnect', 'error');
    } else {
      addToast('Calendar error: ' + msg.slice(0,80), 'error');
    }
  });
}

function openCalendarCreate(entityId, entityType, defaultTitle, defaultAttendee) {
  var today = new Date().toISOString().slice(0,10);
  _calCreateOpen = true;
  _calCreateData = {
    title: defaultTitle || '',
    date: today,
    time: '10:00',
    duration: 60,
    attendees: defaultAttendee || '',
    location: '',
    description: '',
    entityId: entityId || '',
    entityType: entityType || '',
  };
  renderPage();
}

function renderCalendarCreateModal() {
  if (!_calCreateOpen) return '';
  var d = _calCreateData;
  return '<div class="modal-bg" onclick="if(event.target===this){_calCreateOpen=false;renderPage();}">'
    +'<div class="modal" style="max-width:480px">'
    +'<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +'<h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">Schedule Meeting</h3>'
    +'<button onclick="_calCreateOpen=false;renderPage()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">\u00d7</button>'
    +'</div>'
    +'<div class="modal-body" style="display:flex;flex-direction:column;gap:14px">'
    +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Title *</label>'
    +'<input class="inp" id="cal_title" value="'+d.title+'" placeholder="e.g. Measure appointment — Richmond"></div>'
    +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">'
    +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Date *</label>'
    +'<input class="inp" id="cal_date" type="date" value="'+d.date+'"></div>'
    +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Time</label>'
    +'<input class="inp" id="cal_time" type="time" value="'+d.time+'"></div>'
    +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Duration</label>'
    +'<select class="sel" id="cal_dur"><option value="30"'+(d.duration==30?' selected':'')+'>30 min</option><option value="60"'+(d.duration==60?' selected':'')+'>1 hour</option><option value="90"'+(d.duration==90?' selected':'')+'>1.5 hours</option><option value="120"'+(d.duration==120?' selected':'')+'>2 hours</option><option value="180"'+(d.duration==180?' selected':'')+'>3 hours</option></select></div>'
    +'</div>'
    +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Invite Attendees (emails, comma-separated)</label>'
    +'<input class="inp" id="cal_att" value="'+d.attendees+'" placeholder="client@email.com, colleague@spartan.com.au"></div>'
    +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Location</label>'
    +'<input class="inp" id="cal_loc" value="'+d.location+'" placeholder="123 Main St, Richmond VIC"></div>'
    +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Notes</label>'
    +'<textarea class="inp" id="cal_desc" rows="2" placeholder="Meeting notes..." style="resize:vertical;font-family:inherit">'+d.description+'</textarea></div>'
    +'<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:10px 14px;font-size:12px;color:#0369a1">'
    +'\ud83d\udcc5 This creates a real Google Calendar event'+(d.attendees?' and sends email invites to all attendees':'')+'. It also logs to the deal/lead activity timeline.</div>'
    +'</div>'
    +'<div style="padding:16px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:8px">'
    +'<button class="btn-w" onclick="_calCreateOpen=false;renderPage()">Cancel</button>'
    +'<button class="btn-r" onclick="_calCreateData.title=document.getElementById(\'cal_title\').value;_calCreateData.date=document.getElementById(\'cal_date\').value;_calCreateData.time=document.getElementById(\'cal_time\').value;_calCreateData.duration=document.getElementById(\'cal_dur\').value;_calCreateData.attendees=document.getElementById(\'cal_att\').value;_calCreateData.location=document.getElementById(\'cal_loc\').value;_calCreateData.description=document.getElementById(\'cal_desc\').value;gcalCreateEvent()">Create Event & Send Invites</button>'
    +'</div></div></div>';
}

function renderCalendarWidget(entityId, entityType, contactEmail) {
  var token = getState().gmailToken;
  if (!token) {
    return '<div style="padding:14px;background:#f9fafb;border-radius:10px;margin-top:12px"><div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">\ud83d\udcc5 Calendar</div><div style="font-size:12px;color:#9ca3af">Connect Gmail to sync your Google Calendar</div><button onclick="gmailConnect()" class="btn-r" style="font-size:11px;margin-top:8px">Connect Gmail</button></div>';
  }

  if (!_calFetched && !_calLoading) gcalFetchEvents(false);

  var relevantEvents = _calEvents;
  if (contactEmail) {
    relevantEvents = _calEvents.filter(function(ev){
      return ev.attendees.some(function(a){ return a.email.toLowerCase() === contactEmail.toLowerCase(); })
        || ev.title.toLowerCase().indexOf(contactEmail.split('@')[0].toLowerCase()) >= 0;
    });
  }

  var upcoming = relevantEvents.slice(0, 5);

  return '<div style="padding:14px;background:#f9fafb;border-radius:10px;margin-top:12px">'
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
    +'<div style="font-size:12px;font-weight:700;color:#374151">\ud83d\udcc5 Calendar</div>'
    +'<div style="display:flex;gap:6px">'
    +'<button onclick="gcalFetchEvents(true)" style="font-size:10px;padding:2px 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;color:#6b7280" title="Refresh">\u21bb</button>'
    +'<button onclick="openCalendarCreate(\''+entityId+'\',\''+entityType+'\',\'\',\''+(contactEmail||'')+'\')" style="font-size:10px;padding:2px 8px;border:1px solid #c41230;border-radius:6px;background:#fff5f6;cursor:pointer;font-family:inherit;color:#c41230;font-weight:600">+ Meeting</button>'
    +'</div></div>'
    +(_calLoading ? '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:12px">Loading calendar...</div>'
    : upcoming.length === 0 ? '<div style="font-size:12px;color:#9ca3af;text-align:center;padding:12px">No upcoming events'+(contactEmail?' with this contact':'')+'</div>'
    : upcoming.map(function(ev){
      var d = new Date(ev.start);
      var dateStr = d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
      var timeStr = ev.allDay ? 'All day' : d.toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:true});
      var attCount = ev.attendees.length;
      var accepted = ev.attendees.filter(function(a){return a.status==='accepted';}).length;
      return '<div style="padding:8px 0;border-bottom:1px solid #e5e7eb;display:flex;gap:10px;align-items:flex-start">'
        +'<div style="width:42px;text-align:center;flex-shrink:0"><div style="font-size:10px;color:#6b7280">'+dateStr.split(' ')[0]+'</div><div style="font-size:16px;font-weight:800;color:#c41230;font-family:Syne,sans-serif">'+d.getDate()+'</div></div>'
        +'<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+ev.title+'</div>'
        +'<div style="font-size:11px;color:#6b7280">\ud83d\udd52 '+timeStr+(ev.location?' \u00b7 \ud83d\udccd '+ev.location.slice(0,30):'')+'</div>'
        +(attCount>0?'<div style="font-size:10px;color:#9ca3af;margin-top:2px">\ud83d\udc65 '+attCount+' invited'+(accepted>0?', '+accepted+' accepted':'')+'</div>':'')
        +'</div>'
        +(ev.htmlLink?'<a href="'+ev.htmlLink+'" target="_blank" style="font-size:10px;color:#3b82f6;text-decoration:none;flex-shrink:0;padding-top:2px">\u2197</a>':'')
        +'</div>';
    }).join(''))
    +'</div>';
}

