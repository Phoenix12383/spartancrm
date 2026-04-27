// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 06-email-tracking.js
// Extracted from original index.html lines 2394-2627
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL OPEN TRACKING — real-time notification system
// ══════════════════════════════════════════════════════════════════════════════

// Push a notification + toast when an email is opened
function pushEmailOpenNotif(sentMsg) {
  const name = sentMsg.toName || sentMsg.to;
  const short = sentMsg.subject.length > 45
    ? sentMsg.subject.slice(0, 45) + '…'
    : sentMsg.subject;

  // Push to notifications bell
  const notif = {
    id: 'n_open_' + sentMsg.id + '_' + Date.now(),
    title: name + ' opened your email',
    body: '"' + short + '" — viewed ' + sentMsg.opens + '×',
    read: false,
    time: 'Just now',
    type: 'email_open',
    emailId: sentMsg.id,
    to: 'email',
  };
  setState({ notifs: [notif, ...getState().notifs] });

  // Show persistent toast with eye icon
  const toastId = Date.now().toString();
  const toastMsg = '👁 ' + name + ' opened your email — "' + short + '"';
  setState({ toasts: [..._state.toasts, { id: toastId, msg: toastMsg, type: 'info' }] });
  setTimeout(() => setState({ toasts: _state.toasts.filter(t => t.id !== toastId) }), 6000);

  // Flash the notification bell
  const bell = document.getElementById('notifBell');
  try {
    const bellEl = document.getElementById('notifBell');
    if (bellEl) {
      bellEl.style.transform = 'scale(1.3)';
      bellEl.style.color = '#c41230';
      setTimeout(() => { if(bellEl){ bellEl.style.transform = ''; bellEl.style.color = ''; } }, 400);
    }
  } catch(e) {}
}

// Mark a sent email as opened and trigger notification
function trackEmailOpen(msgId) {
  const sent = getState().emailSent;
  const msg = sent.find(m => m.id === msgId);
  if (!msg) return;

  const now = new Date();
  const timeStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    + ' ' + now.toTimeString().slice(0, 5);

  const updatedMsg = {
    ...msg,
    opened: true,
    opens: (msg.opens || 0) + 1,
    openedAt: timeStr,
    lastOpenedAt: timeStr,
  };

  setState({ emailSent: sent.map(m => m.id === msgId ? updatedMsg : m) });
  pushEmailOpenNotif(updatedMsg);

  // Update the sent seed array
  const seedIdx = EMAIL_SENT_SEED.findIndex(m => m.id === msgId);
  if (seedIdx >= 0) {
    EMAIL_SENT_SEED[seedIdx].opened = true;
    EMAIL_SENT_SEED[seedIdx].opens = (EMAIL_SENT_SEED[seedIdx].opens || 0) + 1;
    EMAIL_SENT_SEED[seedIdx].openedAt = timeStr;
  }

  // Also update matching activity on linked deal/contact/lead
  const linkedEntityId   = updatedMsg.dealId || updatedMsg.contactId || updatedMsg.leadId;
  const linkedEntityType = updatedMsg.dealId ? 'deal' : updatedMsg.contactId ? 'contact' : 'lead';
  if (linkedEntityId) {
    const acts = getEntityActivities(linkedEntityId, linkedEntityType);
    const actIdx = acts.findIndex(a => a.type==='email' && a.subject===updatedMsg.subject);
    if (actIdx >= 0) {
      const updAct = {...acts[actIdx], opens:updatedMsg.opens, opened:true, openedAt:timeStr};
      if (linkedEntityType==='deal') {
        setState({deals: getState().deals.map(d => {
          if (d.id !== linkedEntityId) return d;
          return {...d, activities: (d.activities||[]).map((a,i) => i===actIdx ? updAct : a)};
        })});
      } else if (linkedEntityType==='lead') {
        setState({leads: getState().leads.map(l => {
          if (l.id !== linkedEntityId) return l;
          return {...l, activities: (l.activities||[]).map((a,i) => i===actIdx ? updAct : a)};
        })});
      } else {
        const ca = {...(getState().contactActivities||{})};
        ca[linkedEntityId] = (ca[linkedEntityId]||[]).map((a,i) => i===actIdx ? updAct : a);
        setState({contactActivities: ca});
      }
    }
  }
}

// ── Poll Supabase for real email opens (triggered by tracking-pixel hits) ─────
// Writes are made by api/track.js (Vercel serverless function) into the
// email_opens table. Reads here are scoped to the current user so opens only
// surface for the mailbox that sent them.
var _emailOpensPollTimer = null;

async function syncEmailOpens() {
  if (!_sb) return;
  var cu = getCurrentUser();
  if (!cu) return;
  try {
    var res = await _sb.from('email_opens')
      .select('msg_id, opened_at')
      .eq('user_id', cu.id)
      .order('opened_at', { ascending: false });
    if (res.error || !res.data) return;

    // Aggregate: count opens per msg_id, record most recent opened_at (first item wins, array is desc).
    var byMsg = {};
    res.data.forEach(function(r){
      if (!byMsg[r.msg_id]) byMsg[r.msg_id] = { count:0, latest:r.opened_at };
      byMsg[r.msg_id].count++;
    });

    var st = getState();
    var changed = false;
    var newlyOpenedIds = [];

    var updatedSent = st.emailSent.map(function(m){
      var o = byMsg[m.id];
      if (!o) return m;
      // Skip if remote count matches local — avoids redundant renders and
      // prevents re-notifying on every poll.
      if ((m.opens || 0) === o.count && m.opened) return m;
      changed = true;
      if (!m.opened) newlyOpenedIds.push(m.id);
      var latestStr = (function(){
        try {
          var d = new Date(o.latest);
          return d.toLocaleDateString('en-AU', { day:'numeric', month:'short' }) + ' ' + d.toTimeString().slice(0,5);
        } catch(e) { return o.latest; }
      })();
      return Object.assign({}, m, {
        opened: true,
        opens: o.count,
        openedAt: latestStr,
        lastOpenedAt: latestStr,
      });
    });

    if (changed) {
      setState({ emailSent: updatedSent });

      // Mirror the update onto any linked deal/lead/contact activity row so the
      // timeline stays in sync with the email list.
      newlyOpenedIds.forEach(function(msgId){
        var upd = updatedSent.find(function(x){ return x.id === msgId; });
        if (!upd) return;
        var eid = upd.dealId || upd.contactId || upd.leadId;
        var etype = upd.dealId ? 'deal' : upd.contactId ? 'contact' : upd.leadId ? 'lead' : null;
        if (!eid || !etype) return;
        var acts = getEntityActivities(eid, etype);
        var idx = acts.findIndex(function(a){ return a.type==='email' && a.subject===upd.subject; });
        if (idx < 0) return;
        var updAct = Object.assign({}, acts[idx], { opens: upd.opens, opened: true, openedAt: upd.openedAt });
        if (etype === 'deal') {
          setState({ deals: getState().deals.map(function(d){
            if (d.id !== eid) return d;
            return Object.assign({}, d, { activities: (d.activities||[]).map(function(a,i){ return i===idx ? updAct : a; }) });
          }) });
        } else if (etype === 'lead') {
          setState({ leads: getState().leads.map(function(l){
            if (l.id !== eid) return l;
            return Object.assign({}, l, { activities: (l.activities||[]).map(function(a,i){ return i===idx ? updAct : a; }) });
          }) });
        } else {
          var ca = Object.assign({}, (getState().contactActivities || {}));
          ca[eid] = (ca[eid] || []).map(function(a,i){ return i===idx ? updAct : a; });
          setState({ contactActivities: ca });
        }
        // Notify on the first open only.
        pushEmailOpenNotif(upd);
      });
    }
  } catch (e) {
    console.warn('[syncEmailOpens] failed:', e && e.message ? e.message : e);
  }
}

// Start/stop a 30s poll. Called from renderEmailPage() entry; idempotent.
function startEmailOpensPolling() {
  if (_emailOpensPollTimer) return;
  _emailOpensPollTimer = setInterval(syncEmailOpens, 30000);
}

// DEMO SIMULATOR — DO NOT CALL IN PRODUCTION.
// Kept for local dev only; the call site below is commented out.
// Real opens are now recorded by the tracking pixel (api/track.js) and surfaced
// by syncEmailOpens(). See Spartan_CRM_Handover_19Apr.md Track A.
function startEmailTrackingSimulator() {
  // Simulate the 3 unopened emails getting opened at realistic intervals
  const unopened = [
    { id: 'es3', delay: 8000,  name: 'Amanda Roberts' },
    { id: 'es6', delay: 22000, name: 'Priya Patel'    },
    { id: 'es3', delay: 45000, name: 'Amanda Roberts' }, // second open
  ];

  unopened.forEach(({ id, delay }) => {
    setTimeout(() => {
      const msg = getState().emailSent.find(m => m.id === id);
      if (msg) trackEmailOpen(id);
    }, delay);
  });

  // Also randomly simulate clicks after opens
  setTimeout(() => {
    const sent = getState().emailSent;
    const msg = sent.find(m => m.id === 'es3' && m.opened);
    if (msg) {
      setState({ emailSent: sent.map(m => m.id === 'es3' ? { ...m, clicked: true } : m) });
      const notif = {
        id: 'n_click_es3_' + Date.now(),
        title: 'Amanda Roberts clicked a link',
        body: '"' + msg.subject.slice(0, 45) + '…"',
        read: false, time: 'Just now', type: 'email_click', emailId: 'es3', to: 'email',
      };
      setState({ notifs: [notif, ...getState().notifs] });
      addToast('🔗 Amanda Roberts clicked a link in your email', 'success');
    }
  }, 52000);
}

// Start simulator when app loads
// setTimeout(startEmailTrackingSimulator, 2000);


