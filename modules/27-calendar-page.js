// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 27-calendar-page.js
// Extracted from original index.html lines 16368-16968
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// CALENDAR PAGE — Pipedrive-style week view with Google Calendar sync
// ══════════════════════════════════════════════════════════════════════════════

var calWeekOffset = 0;
var calRepFilter = 'all';      // 'all' | rep name | 'mine'
var calShowGoogle = true;      // toggle to hide/show Google events
var _calPageLoading = false;
var _calPageLastFetch = '';

// Per-user Google event cache. Keyed by user id. Persisted in localStorage so when
// admin logs in they can see events previously synced by each rep who connected
// their own Gmail. Keys: _calEvents_by_user[userId] = [{id,title,date,time,...}, ...]
var _calEvents_by_user = (function(){ try { return JSON.parse(localStorage.getItem('spartan_calendar_events_by_user')||'{}'); } catch(e){ return {}; } })();
function _calSaveEventsByUser() { try { localStorage.setItem('spartan_calendar_events_by_user', JSON.stringify(_calEvents_by_user)); } catch(e){} }

// Map a CRM user (by name) to a REP_BASES rep if names match. Falls back to null.
function calRepForUser(userName) {
  if (!userName) return null;
  return REP_BASES.find(function(r){ return r.name === userName; }) || null;
}

// Returns the list of reps that should appear in the filter dropdown.
// Always includes REP_BASES; also includes any user name present in event data
// that's not already in REP_BASES (so synced events aren't orphaned).
function calAllReps() {
  var extra = [];
  Object.keys(_calEvents_by_user).forEach(function(uid){
    var u = getUsers().find(function(x){return x.id===uid;});
    if (u && !REP_BASES.some(function(r){return r.name===u.name;}) && !extra.some(function(e){return e.name===u.name;})) {
      extra.push({name:u.name, col:'#6b7280', branch:u.branch||'', initials:u.initials||'', _isExtra:true});
    }
  });
  return REP_BASES.concat(extra);
}

function calGetWeekDates(offset) {
  var today = new Date();
  var ref = new Date(today);
  ref.setDate(ref.getDate() + (offset || 0) * 7);
  var dow = ref.getDay();
  var mon = new Date(ref);
  mon.setDate(ref.getDate() - (dow === 0 ? 6 : dow - 1));
  var days = [];
  for (var i = 0; i < 7; i++) { var d = new Date(mon); d.setDate(mon.getDate() + i); days.push(d); }
  return days;
}

function calFetchGoogleEvents(weekDays) {
  var token = getState().gmailToken;
  var cu = getCurrentUser();
  if (!token || !cu) return;
  var minDate = new Date(weekDays[0]); minDate.setHours(0,0,0,0);
  var maxDate = new Date(weekDays[6]); maxDate.setHours(23,59,59,999);
  var fetchKey = cu.id + '_' + minDate.toISOString().slice(0,10) + '_' + maxDate.toISOString().slice(0,10);
  if (_calPageLastFetch === fetchKey) return;
  _calPageLoading = true;
  _calPageLastFetch = fetchKey;
  fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=' + encodeURIComponent(minDate.toISOString()) + '&timeMax=' + encodeURIComponent(maxDate.toISOString()) + '&maxResults=250&singleEvents=true&orderBy=startTime', {
    headers: { Authorization: 'Bearer ' + token }
  })
  .then(function(r){ if(!r.ok) throw new Error('Calendar fetch failed: '+r.status); return r.json(); })
  .then(function(data){
    // Tag every Google event with the connected user's identity, so the calendar
    // can colour/filter by rep even for events pulled from Google.
    var ownerName = cu.name;
    var ownerId = cu.id;
    var items = (data.items || []).map(function(ev){
      var start = ev.start.dateTime || ev.start.date || '';
      var end = (ev.end && (ev.end.dateTime || ev.end.date)) || '';
      var duration = 60;
      if (ev.start.dateTime && ev.end && ev.end.dateTime) {
        try { duration = Math.max(15, Math.round((new Date(ev.end.dateTime) - new Date(ev.start.dateTime))/60000)); } catch(e){}
      }
      return {
        id: ev.id,
        title: ev.summary || '(No title)',
        date: start.slice(0,10),
        time: start.length > 10 ? start.slice(11,16) : '',
        location: ev.location || '',
        description: ev.description || '',
        htmlLink: ev.htmlLink || '',
        attendees: (ev.attendees||[]).map(function(a){return a.email;}).filter(Boolean),
        allDay: !ev.start.dateTime,
        duration: duration,
        source: 'google',
        ownerUserId: ownerId,
        ownerName: ownerName,
      };
    });
    // Merge into per-user store, replacing only events inside the fetched window
    var existing = _calEvents_by_user[ownerId] || [];
    var winMin = minDate.toISOString().slice(0,10);
    var winMax = maxDate.toISOString().slice(0,10);
    var outside = existing.filter(function(e){ return e.date < winMin || e.date > winMax; });
    _calEvents_by_user[ownerId] = outside.concat(items);
    _calSaveEventsByUser();
    _calPageLoading = false;
    renderPage();
  })
  .catch(function(e){ console.warn('Calendar fetch error:', e); _calPageLoading = false; addToast('Calendar sync error — try reconnecting Gmail', 'warning'); });
}

// Flatten all synced Google events across all connected users into a single array.
function calAllGoogleEvents() {
  var out = [];
  Object.keys(_calEvents_by_user).forEach(function(uid){
    var u = getUsers().find(function(x){return x.id===uid;});
    var repName = u ? u.name : '';
    (_calEvents_by_user[uid] || []).forEach(function(e){
      // Ensure the event has an owner/rep tag (back-fill for older cached entries)
      out.push(Object.assign({}, e, { rep: e.rep || repName, ownerName: e.ownerName || repName, ownerUserId: e.ownerUserId || uid }));
    });
  });
  return out;
}

function calMergeEvents(dateStr) {
  var local = MOCK_APPOINTMENTS.filter(function(a){ return a.date === dateStr; }).map(function(a){ return Object.assign({}, a, {source:'local'}); });
  var google = calAllGoogleEvents().filter(function(e){ return e.date === dateStr; }).map(function(e){
    return {
      id: e.id,
      client: e.title,
      title: e.title,
      time: e.time,
      suburb: e.location ? e.location.split(',')[0] : '',
      location: e.location,
      rep: e.rep || e.ownerName || '',
      ownerName: e.ownerName || '',
      ownerUserId: e.ownerUserId || '',
      type: 'Google Calendar',
      source: 'google',
      htmlLink: e.htmlLink,
      notes: e.description || '',
      duration: e.duration || 60,
      date: e.date,
    };
  });
  var combined = local.slice();
  google.forEach(function(ge){
    var dup = combined.some(function(la){ return la.time===ge.time && (la.client===ge.client||la.title===ge.title); });
    if (!dup) combined.push(ge);
  });
  return combined.sort(function(a,b){ return (a.time||'').localeCompare(b.time||''); });
}

function calFindLink(evt) {
  if (evt.dealId) return {type:'deal',id:evt.dealId};
  if (evt.leadId) { var ld = getState().leads.find(function(l){return l.id===evt.leadId;}); if(ld&&ld.dealRef) return {type:'deal',id:ld.dealRef}; return {type:'lead',id:evt.leadId}; }
  var deal = getState().deals.find(function(d){return d.title===evt.client;});
  if (deal) return {type:'deal',id:deal.id};
  return null;
}

function calNavWeek(dir) { calWeekOffset += dir; _calPageLastFetch = ''; renderPage(); }
function calGoToday() { calWeekOffset = 0; _calPageLastFetch = ''; renderPage(); }
function calSyncGoogle() { _calPageLastFetch = ''; calFetchGoogleEvents(calGetWeekDates(calWeekOffset)); addToast('Syncing Google Calendar\u2026', 'info'); }

// Render-time registry: when the week grid is rendered we stash every event in
// this array indexed by position, and the click handler looks them up by index.
// This avoids the broken inline-JSON onclick approach (JSON has " chars that
// terminate the onclick attribute and silently kill the click).
var _calEventRegistry = [];
function calRegisterEvent(evt) { _calEventRegistry.push(evt); return _calEventRegistry.length - 1; }

// ── Calendar Event Modal ─────────────────────────────────────────────────────
var calEventModal = null; // null or {mode:'view'|'edit'|'create', event:{...}, date:''}

// Minimal HTML-escape for text inserted into innerHTML
function _calEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function calOpenEventByIndex(idx) {
  var evt = _calEventRegistry[idx];
  if (!evt) { console.warn('Cal: event not found at index', idx); return; }
  calOpenEvent(evt);
}

function calOpenEvent(evt) {
  calEventModal = { mode: 'view', event: evt };
  var existing = document.getElementById('calBubble');
  if (existing) existing.remove();
  var bubble = document.createElement('div');
  bubble.id = 'calBubble';
  bubble.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:380px;max-height:80vh;overflow-y:auto;background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.2);z-index:2000;border:1px solid #e5e7eb';
  var e = evt;
  var isG = e.source === 'google';
  var rep = REP_BASES.find(function(r){return r.name===e.rep;});
  var col = isG ? '#4285f4' : (rep ? rep.col : '#c41230');
  var link = calFindLink(e);
  var title = e.client || e.title || '(No title)';
  var owner = e.ownerName || e.rep || '';

  var html = '<div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:'+col+'10">'
    +'<div style="display:flex;align-items:center;gap:8px;min-width:0"><div style="width:4px;height:28px;background:'+col+';border-radius:2px;flex-shrink:0"></div>'
    +'<div style="min-width:0"><div style="font-size:15px;font-weight:700;color:#111;overflow:hidden;text-overflow:ellipsis">'+_calEsc(title)+'</div>'
    +'<div style="font-size:12px;color:#6b7280">'+_calEsc(e.time||'All day')+' \u00b7 '+_calEsc(e.date||'')+'</div></div></div>'
    +'<button id="calBubbleClose" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9ca3af;padding:4px;flex-shrink:0">\u00d7</button></div>'
    +'<div style="padding:16px 20px;display:flex;flex-direction:column;gap:10px">'
    +((e.suburb||e.location) ? '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151">\ud83d\udccd '+_calEsc(e.location||e.suburb)+'</div>' : '')
    +(e.type && !isG ? '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151">\ud83d\udcdd '+_calEsc(e.type)+'</div>' : '')
    +(owner ? '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#374151">\ud83d\udc64 '+_calEsc(owner)+(isG?' <span style="font-size:10px;color:#6b7280">(Google Calendar owner)</span>':'')+'</div>' : '')
    +(e.duration ? '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#6b7280">\u23f1 '+_calEsc(e.duration)+' min</div>' : '')
    +(e.notes ? '<div style="font-size:12px;color:#6b7280;background:#f9fafb;padding:8px 10px;border-radius:8px;white-space:pre-wrap">'+_calEsc(e.notes)+'</div>' : '')
    +(isG ? '<div style="font-size:11px;color:#4285f4;display:flex;align-items:center;gap:4px"><span style="font-size:8px;padding:1px 5px;border-radius:8px;background:#4285f420;color:#4285f4;font-weight:700">G</span> Synced from Google Calendar</div>' : '')
    +'</div>'
    +'<div style="padding:12px 20px;border-top:1px solid #f0f0f0;display:flex;gap:8px;flex-wrap:wrap">'
    +(link ? '<button id="calBubbleLink" class="btn-r" style="font-size:12px;flex:1">\u2197 View '+(link.type==='deal'?'Deal':'Lead')+'</button>' : '')
    +(isG && e.htmlLink ? '<button id="calBubbleGoogle" class="btn-w" style="font-size:12px;flex:1">Open in Google</button>' : '')
    +(!isG ? '<button id="calBubbleEdit" class="btn-w" style="font-size:12px;flex:1">\u270f Edit</button>' : '')
    +(!isG && e.id ? '<button id="calBubbleDelete" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit;padding:6px 10px">Delete</button>' : '')
    +'<button id="calBubbleClose2" class="btn-w" style="font-size:12px">Close</button>'
    +'</div>';
  bubble.innerHTML = html;
  document.body.appendChild(bubble);

  // Wire up the buttons inside the bubble using proper DOM handlers (no inline JS).
  var close = function(){ var b=document.getElementById('calBubble'); if(b)b.remove(); calEventModal=null; };
  var q = function(id){ return bubble.querySelector('#'+id); };
  if (q('calBubbleClose'))   q('calBubbleClose').addEventListener('click', close);
  if (q('calBubbleClose2'))  q('calBubbleClose2').addEventListener('click', close);
  if (q('calBubbleEdit'))    q('calBubbleEdit').addEventListener('click', function(){ close(); calEditEvent(evt); });
  if (q('calBubbleDelete'))  q('calBubbleDelete').addEventListener('click', function(){ close(); calDeleteEvent(e.id); });
  if (q('calBubbleGoogle'))  q('calBubbleGoogle').addEventListener('click', function(){ window.open(e.htmlLink,'_blank'); });
  if (q('calBubbleLink'))    q('calBubbleLink').addEventListener('click', function(){
    close();
    if (link.type==='deal') setState({ dealDetailId: link.id, page: 'deals' });
    else setState({ leadDetailId: link.id, page: 'leads' });
  });

  // Close on outside click (deferred to next tick so the originating click doesn't close it)
  setTimeout(function(){
    var handler = function(ev){
      var b = document.getElementById('calBubble');
      if (b && !b.contains(ev.target)) { b.remove(); calEventModal = null; document.removeEventListener('click', handler, true); }
    };
    document.addEventListener('click', handler, true);
  }, 50);
}

function calNewEvent(dateStr) {
  var cu = getCurrentUser() || {name:'Admin', role:'admin'};
  // If admin has filtered to a specific rep, pre-select that rep for the new event.
  // If the current user is a rep, pre-select themselves.
  var defaultRep = cu.role === 'sales_rep' ? cu.name : (calRepFilter !== 'all' && calRepFilter !== 'mine' ? calRepFilter : cu.name);
  calEventModal = {
    mode: 'create',
    event: { id: '', client: '', time: '09:00', duration: 60, suburb: '', location: '', type: 'Measure', rep: defaultRep, dealId: '', leadId: '', notes: '' },
    date: dateStr || new Date().toISOString().slice(0,10),
  };
  renderPage();
}

function calEditEvent(evt) {
  if (evt) calEventModal = { mode: 'edit', event: evt, date: evt.date || '' };
  else if (calEventModal) calEventModal.mode = 'edit';
  renderPage();
}
function calCloseModal() { calEventModal = null; renderPage(); }

function calSaveEvent() {
  if (!calEventModal) return;
  var e = calEventModal.event;
  var date = calEventModal.date || e.date || new Date().toISOString().slice(0,10);
  var title = document.getElementById('ce_title');
  var time = document.getElementById('ce_time');
  var dur = document.getElementById('ce_duration');
  var loc = document.getElementById('ce_location');
  var type = document.getElementById('ce_type');
  var rep = document.getElementById('ce_rep');
  var dealSel = document.getElementById('ce_deal');
  var leadSel = document.getElementById('ce_lead');
  var notes = document.getElementById('ce_notes');

  if (title && !title.value.trim()) { addToast('Title is required', 'error'); return; }

  var client = title ? title.value.trim() : e.client;
  var timeVal = time ? time.value : e.time || '09:00';
  var durVal = dur ? parseInt(dur.value) || 60 : e.duration || 60;
  var locVal = loc ? loc.value.trim() : e.location || '';
  var typeVal = type ? type.value : e.type || 'Measure';
  var repVal = rep ? rep.value : e.rep || '';
  var dealId = dealSel ? dealSel.value : e.dealId || '';
  var leadId = leadSel ? leadSel.value : e.leadId || '';
  var notesVal = notes ? notes.value : e.notes || '';

  // Get suburb from deal/lead if available
  var suburb = locVal.split(',')[0] || '';
  if (dealId) { var deal = getState().deals.find(function(d){return d.id===dealId;}); if (deal) { suburb = deal.suburb || suburb; if (!locVal) locVal = [deal.street,deal.suburb,deal.state].filter(Boolean).join(', '); client = client || deal.title; } }
  if (leadId) { var lead = getState().leads.find(function(l){return l.id===leadId;}); if (lead) { suburb = lead.suburb || suburb; if (!locVal) locVal = [lead.street,lead.suburb,lead.state].filter(Boolean).join(', '); client = client || (lead.fn + ' ' + lead.ln); } }

  var repObj = REP_BASES.find(function(r){return r.name===repVal;});
  var coords = getSuburbCoords(suburb, repObj ? repObj.branch : 'VIC');

  // Save to local appointments
  var aptId = calEventModal.mode === 'create' ? 'ap_' + Date.now() : (e.id || 'ap_' + Date.now());
  if (calEventModal.mode === 'create') {
    MOCK_APPOINTMENTS.push({
      id: aptId, rep: repVal, repCol: repObj ? repObj.col : '#9ca3af',
      date: date, time: timeVal, client: client, suburb: suburb,
      lat: coords.lat, lng: coords.lng, type: typeVal, status: 'Confirmed',
      dealId: dealId, leadId: leadId, location: locVal, notes: notesVal, duration: durVal,
    });
  } else {
    // Update existing
    var idx = MOCK_APPOINTMENTS.findIndex(function(a){return a.id===aptId;});
    if (idx >= 0) {
      MOCK_APPOINTMENTS[idx] = Object.assign(MOCK_APPOINTMENTS[idx], {
        rep: repVal, time: timeVal, client: client, suburb: suburb,
        type: typeVal, dealId: dealId, leadId: leadId, location: locVal, notes: notesVal, duration: durVal,
      });
    }
  }
  saveAppointments();

  // Log as activity on the deal/lead
  var entityId = dealId || leadId;
  var entityType = dealId ? 'deal' : leadId ? 'lead' : '';
  if (entityId && entityType) {
    saveActivityToEntity(entityId, entityType, {
      id: 'a' + Date.now(), type: 'meeting', subject: client,
      text: typeVal + ' with ' + repVal + ' at ' + timeVal + (locVal ? ' \u2014 ' + locVal : ''),
      date: date, time: timeVal, by: (getCurrentUser()||{name:'Admin'}).name,
      done: false, dueDate: date, scheduled: true,
    });
  }

  // Push to Google Calendar (2-way sync)
  if (getState().gmailConnected && calEventModal.mode === 'create') {
    _calCreateData = { title: client, date: date, time: timeVal, duration: durVal, attendees: '', location: locVal, description: notesVal + (entityType ? '\n[Spartan CRM: ' + entityType + ']' : ''), entityId: entityId, entityType: entityType };
    gcalCreateEvent(entityId, entityType);
  }

  var wasCreate = calEventModal.mode === 'create';
  calEventModal = null;
  _calPageLastFetch = '';
  addToast(wasCreate ? (typeVal + ' booked for ' + date) : 'Event updated', 'success');
  renderPage();
}

function calDeleteEvent(aptId) {
  if (!confirm('Delete this appointment?')) return;
  var idx = MOCK_APPOINTMENTS.findIndex(function(a){return a.id===aptId;});
  if (idx >= 0) MOCK_APPOINTMENTS.splice(idx, 1);
  saveAppointments();
  calEventModal = null;
  addToast('Appointment deleted', 'warning');
  renderPage();
}

function renderCalEventModal() {
  if (!calEventModal || calEventModal.mode === 'view') return '';
  var e = calEventModal.event;
  var mode = calEventModal.mode;
  var date = calEventModal.date || e.date || '';
  var deals = getState().deals.filter(function(d){return !d.won && !d.lost;});
  var leads = getState().leads.filter(function(l){return !l.converted;});
  var isView = mode === 'view';
  var isGoogle = e.source === 'google';

  return '<div class="modal-bg" onclick="if(event.target===this)calCloseModal()">'
    +'<div class="modal" style="max-width:480px">'
    +'<div style="padding:16px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +'<h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">'+(mode==='create'?'\ud83d\udcc5 New Appointment':isView?'\ud83d\udcc5 Appointment Detail':'\u270f\ufe0f Edit Appointment')+'</h3>'
    +'<button onclick="calCloseModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px">\u00d7</button></div>'
    +'<div class="modal-body" style="display:flex;flex-direction:column;gap:12px">'

    // Title
    +(isView ? '<div><div style="font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Title</div><div style="font-size:15px;font-weight:600">'+(e.client||e.title||'')+'</div></div>'
      : '<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Title *</label><input class="inp" id="ce_title" value="'+(e.client||e.title||'')+'" placeholder="Measure — Smith Residence"></div>')

    // Date + Time + Duration
    +(isView ? '<div style="display:flex;gap:16px"><div><div style="font-size:11px;color:#6b7280;font-weight:600">Date</div><div style="font-size:13px;font-weight:600">'+date+'</div></div><div><div style="font-size:11px;color:#6b7280;font-weight:600">Time</div><div style="font-size:13px;font-weight:600">'+(e.time||'All day')+'</div></div></div>'
      : '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">'
        +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Date</label><input class="inp" id="ce_date" type="date" value="'+date+'" onchange="calEventModal.date=this.value"></div>'
        +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Time</label><input class="inp" id="ce_time" type="time" value="'+(e.time||'09:00')+'"></div>'
        +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Duration</label><select class="sel" id="ce_duration">'+[30,45,60,90,120].map(function(m){return '<option value="'+m+'"'+((e.duration||60)===m?' selected':'')+'>'+m+' min</option>';}).join('')+'</select></div></div>')

    // Location
    +(isView ? (e.suburb||e.location ? '<div><div style="font-size:11px;color:#6b7280;font-weight:600">Location</div><div style="font-size:13px">\ud83d\udccd '+(e.location||e.suburb||'')+'</div></div>' : '')
      : '<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Location</label><input class="inp" id="ce_location" value="'+(e.location||e.suburb||'')+'" placeholder="123 Main St, Richmond VIC"></div>')

    // Type + Rep
    +(isView ? '<div style="display:flex;gap:16px"><div><div style="font-size:11px;color:#6b7280;font-weight:600">Type</div><div style="font-size:13px">'+(e.type||'')+'</div></div><div><div style="font-size:11px;color:#6b7280;font-weight:600">Rep</div><div style="font-size:13px">'+(e.rep||'')+'</div></div></div>'
      : '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Type</label><select class="sel" id="ce_type">'+['Measure','Quote','Consultation','Follow-up','Installation','Site Visit'].map(function(t){return '<option'+(t===(e.type||'Measure')?' selected':'')+'>'+t+'</option>';}).join('')+'</select></div>'
        +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Rep</label><select class="sel" id="ce_rep">'+REP_BASES.map(function(r){return '<option value="'+r.name+'"'+(r.name===(e.rep||'')?' selected':'')+'>'+r.name+'</option>';}).join('')+'</select></div></div>')

    // Link to Deal / Lead
    +(isView ? ''
      : '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
        +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Link to Deal</label><select class="sel" id="ce_deal"><option value="">None</option>'+deals.map(function(d){return '<option value="'+d.id+'"'+(d.id===(e.dealId||'')?' selected':'')+'>'+d.title+'</option>';}).join('')+'</select></div>'
        +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Link to Lead</label><select class="sel" id="ce_lead"><option value="">None</option>'+leads.map(function(l){return '<option value="'+l.id+'"'+(l.id===(e.leadId||'')?' selected':'')+'>'+l.fn+' '+l.ln+'</option>';}).join('')+'</select></div></div>')

    // Notes
    +(isView ? (e.notes ? '<div><div style="font-size:11px;color:#6b7280;font-weight:600">Notes</div><div style="font-size:12px;color:#374151;white-space:pre-wrap">'+e.notes+'</div></div>' : '')
      : '<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Notes</label><textarea class="inp" id="ce_notes" rows="2" style="resize:vertical;font-family:inherit">'+(e.notes||'')+'</textarea></div>')

    // Linked entity info
    +(isView && e.dealId ? '<div style="padding:8px 12px;background:#dbeafe;border-radius:8px;cursor:pointer" onclick="calCloseModal();setState({dealDetailId:\''+e.dealId+'\',page:\'deals\'})"><span style="font-size:12px;font-weight:600;color:#1d4ed8">\u2197 View linked deal</span></div>' : '')
    +(isView && e.leadId ? '<div style="padding:8px 12px;background:#ede9fe;border-radius:8px;cursor:pointer" onclick="calCloseModal();setState({leadDetailId:\''+e.leadId+'\',page:\'leads\'})"><span style="font-size:12px;font-weight:600;color:#6d28d9">\u2197 View linked lead</span></div>' : '')
    +(isView && isGoogle ? '<div style="padding:8px 12px;background:#e0f2fe;border-radius:8px"><span style="font-size:11px;color:#0369a1">\ud83d\udd35 Synced from Google Calendar</span></div>' : '')

    +'</div>'
    // Footer
    +'<div style="padding:12px 20px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:space-between">'
    +(isView && !isGoogle ? '<button onclick="calEditEvent()" class="btn-w" style="font-size:12px">\u270f Edit</button>' : '<div></div>')
    +(isView && !isGoogle ? '<button onclick="calDeleteEvent(\''+e.id+'\')" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit">Delete</button>' : '')
    +(!isView ? '<button onclick="calCloseModal()" class="btn-w" style="font-size:12px">Cancel</button>' : '')
    +(!isView ? '<button onclick="calSaveEvent()" class="btn-r" style="font-size:12px">'+(mode==='create'?'\u2713 Book Appointment':'Save Changes')+'</button>' : '')
    +(isView && isGoogle ? '<button onclick="calCloseModal()" class="btn-w" style="font-size:12px">Close</button>' : '')
    +'</div></div></div>';
}

function renderCalendarPage() {
  var cu = getCurrentUser() || {name:'Admin',role:'admin'};
  var isRep = cu.role === 'sales_rep';
  // Rep filter: reps are locked to themselves; admins/managers can pick
  var activeRep = isRep ? cu.name : (calRepFilter !== 'all' && calRepFilter !== 'mine' ? calRepFilter : '');
  var mineOnly = !isRep && calRepFilter === 'mine';
  var weekDays = calGetWeekDates(calWeekOffset);
  var todayStr = new Date().toISOString().slice(0,10);
  var reps = calAllReps();
  var connectedUserIds = Object.keys(_calEvents_by_user).filter(function(uid){ return (_calEvents_by_user[uid]||[]).length > 0; });

  if (getState().gmailConnected) calFetchGoogleEvents(weekDays);

  // Reset and rebuild the click registry each render (index-based lookup)
  _calEventRegistry = [];

  var days = weekDays.map(function(d) {
    var ds = d.toISOString().slice(0,10);
    var all = calMergeEvents(ds);
    // Hide Google layer if toggled off
    if (!calShowGoogle) all = all.filter(function(e){ return e.source !== 'google'; });
    // Apply rep filter consistently to BOTH local and Google events
    var evts = all.filter(function(e){
      if (mineOnly) return (e.rep === cu.name) || (e.ownerUserId === cu.id);
      if (activeRep) return e.rep === activeRep;
      if (isRep) return e.rep === cu.name || (e.ownerUserId === cu.id) || (!e.rep && e.source==='local'); // reps see only their own
      return true;
    });
    return { date:d, ds:ds, dayName:d.toLocaleDateString('en-AU',{weekday:'short'}), dayNum:d.getDate(),
      month:d.toLocaleDateString('en-AU',{month:'short'}), events:evts, isToday:ds===todayStr, isPast:ds<todayStr };
  });

  var wkLabel = days[0].dayNum + ' ' + days[0].month + ' \u2014 ' + days[6].dayNum + ' ' + days[6].month + ' ' + days[6].date.getFullYear();
  var totalE = days.reduce(function(s,d){return s+d.events.length;},0);

  var html = '<div>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px">';
  html += '<div><h1 style="font-size:24px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">\ud83d\udcc5 Calendar</h1>';
  html += '<p style="color:#6b7280;font-size:13px;margin:0">' + totalE + ' appointment' + (totalE!==1?'s':'') + ' this week';
  if (getState().gmailConnected) html += ' \u00b7 <span style="color:#15803d">\u2713 ' + _calEsc(cu.name) + '\'s Google Calendar synced</span>';
  else html += ' \u00b7 <span style="color:#f59e0b">Your Google Calendar not connected</span>';
  if (_calPageLoading) html += ' \u00b7 <span style="color:#3b82f6">Syncing\u2026</span>';
  html += '</p></div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
  if (!isRep) {
    html += '<select onchange="calRepFilter=this.value;renderPage()" class="sel" style="font-size:12px;padding:6px 10px;width:auto">';
    html += '<option value="all"' + (calRepFilter==='all'?' selected':'') + '>All Reps</option>';
    html += '<option value="mine"' + (calRepFilter==='mine'?' selected':'') + '>Just Me (' + _calEsc(cu.name) + ')</option>';
    html += '<option disabled>\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500</option>';
    reps.forEach(function(r){
      // Indicate whether this rep has connected their Google calendar
      var u = getUsers().find(function(x){return x.name===r.name;});
      var synced = u && connectedUserIds.indexOf(u.id) >= 0;
      html += '<option value="' + _calEsc(r.name) + '"' + (calRepFilter===r.name?' selected':'') + '>' + _calEsc(r.name) + (synced?' \u2713':'') + '</option>';
    });
    html += '</select>';
  }
  // Google layer toggle
  html += '<button onclick="calShowGoogle=!calShowGoogle;renderPage()" class="btn-w" style="font-size:12px;gap:4px" title="Toggle Google Calendar events">'
    + (calShowGoogle?'\u2713 Google':'\u2715 Google') + '</button>';
  if (getState().gmailConnected) html += '<button onclick="calSyncGoogle()" class="btn-w" style="font-size:12px;gap:4px">\u21bb Sync</button>';
  else html += '<button onclick="gmailConnect()" class="btn-r" style="font-size:12px">Connect My Google</button>';
  html += '<button onclick="calNewEvent()" class="btn-r" style="font-size:12px;gap:4px">+ New Event</button>';
  html += '</div></div>';

  // Info banner about per-user Google sync (only for admins/managers)
  if (!isRep) {
    var syncedNames = connectedUserIds.map(function(uid){ var u=getUsers().find(function(x){return x.id===uid;}); return u?u.name:''; }).filter(Boolean);
    html += '<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:#0369a1;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'
      + '<span>\u2139\ufe0f</span>'
      + '<div style="flex:1;min-width:200px">'
      + '<strong>Per-rep Google Calendar sync:</strong> '
      + (syncedNames.length
          ? 'Synced for ' + syncedNames.map(_calEsc).join(', ') + '. '
          : 'No reps have connected their Google Calendar yet. ')
      + 'Each rep must log in and click "Connect My Google" on this page. Admin cannot access other reps\' Google calendars directly \u2014 Google requires each user to authorise their own account.'
      + '</div></div>';
  }

  // Week nav
  html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">';
  html += '<button onclick="calNavWeek(-1)" style="background:none;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;padding:7px 12px;font-size:18px;color:#374151;font-family:inherit">\u2039</button>';
  html += '<div style="text-align:center;min-width:220px"><div style="font-size:16px;font-weight:700;font-family:Syne,sans-serif">' + wkLabel + '</div></div>';
  html += '<button onclick="calNavWeek(1)" style="background:none;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;padding:7px 12px;font-size:18px;color:#374151;font-family:inherit">\u203a</button>';
  html += '<button onclick="calGoToday()" class="btn-w" style="font-size:12px;padding:5px 14px">Today</button>';
  html += '</div>';

  // Week grid with hours
  var CAL_START = 7; // 7 AM
  var CAL_END = 20;  // 8 PM
  var SLOT_H = 52; // px per hour slot

  // Day headers
  html += '<div class="card" style="overflow:hidden;padding:0" id="calWeekGrid">';
  html += '<div style="display:grid;grid-template-columns:56px repeat(7,1fr)">';
  html += '<div style="border-right:1px solid #f0f0f0;border-bottom:1px solid #e5e7eb;padding:6px;display:flex;align-items:flex-end;justify-content:center"><span style="font-size:9px;color:#9ca3af;text-transform:uppercase">Time</span></div>';
  days.forEach(function(day) {
    html += '<div style="padding:8px 6px;border-right:1px solid #f0f0f0;border-bottom:1px solid '+(day.isToday?'#c41230':'#e5e7eb')+';text-align:center;background:'+(day.isToday?'#c41230':day.isPast?'#fafafa':'#f9fafb')+'">'
      +'<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:'+(day.isToday?'#fff':'#9ca3af')+'">'+day.dayName+'</div>'
      +'<div style="font-size:18px;font-weight:800;color:'+(day.isToday?'#fff':'#1a1a1a')+';font-family:Syne,sans-serif;cursor:pointer" onclick="calNewEvent(\''+day.ds+'\')" title="Click to add event">'+day.dayNum+'</div></div>';
  });
  html += '</div>';

  // Time grid body
  html += '<div style="display:grid;grid-template-columns:56px repeat(7,1fr);max-height:560px;overflow-y:auto">';

  for (var hr = CAL_START; hr < CAL_END; hr++) {
    var hrLabel = hr <= 12 ? hr + (hr < 12 ? ' AM' : ' PM') : (hr-12) + ' PM';
    html += '<div style="border-right:1px solid #f0f0f0;border-bottom:1px solid #f3f4f6;padding:4px 6px;height:'+SLOT_H+'px;display:flex;align-items:flex-start;justify-content:flex-end"><span style="font-size:10px;font-weight:600;color:#9ca3af;margin-top:-6px">'+hrLabel+'</span></div>';

    (function(curHr){
      days.forEach(function(day) {
        var hourEvents = day.events.filter(function(e){
          if (!e.time) return curHr === CAL_START;
          var tMatch = e.time.match(/(\d+)/);
          if (!tMatch) return false;
          var eHr = parseInt(tMatch[1]);
          if (e.time.toLowerCase().indexOf('pm') >= 0 && eHr < 12) eHr += 12;
          if (e.time.toLowerCase().indexOf('am') >= 0 && eHr === 12) eHr = 0;
          if (e.time.match(/^\d{1,2}:\d{2}$/) && !e.time.match(/[ap]/i)) eHr = parseInt(e.time.split(':')[0]);
          return eHr === curHr;
        });

        html += '<div style="border-right:1px solid #f0f0f0;border-bottom:1px solid #f3f4f6;height:'+SLOT_H+'px;padding:1px 3px;overflow:hidden;position:relative;'+(day.isToday?'background:#fffdf5':day.isPast?'background:#fafafa':'')+'">';

        hourEvents.forEach(function(evt) {
          var isG = evt.source === 'google';
          var rep = REP_BASES.find(function(r){return r.name===evt.rep;});
          var col = isG ? '#4285f4' : (rep ? rep.col : '#9ca3af');
          var idx = calRegisterEvent(evt);

          html += '<div class="cal-evt" data-cal-idx="'+idx+'" style="background:'+col+'15;border-left:3px solid '+col+';border-radius:0 4px 4px 0;padding:2px 5px;cursor:pointer;margin-bottom:1px;overflow:hidden" title="'+_calEsc(evt.client||evt.title||'')+'">'
            +'<div style="font-size:9px;font-weight:700;color:'+col+';display:flex;align-items:center;gap:3px">'
              + (isG ? '<span style="font-size:7px;padding:0 3px;border-radius:4px;background:#4285f430;color:#4285f4;font-weight:700">G</span>' : '')
              + _calEsc(evt.time||'All day')
            +'</div>'
            +'<div style="font-size:10px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_calEsc(evt.client||evt.title||'')+'</div>'
            +(evt.suburb?'<div style="font-size:9px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\ud83d\udccd '+_calEsc(evt.suburb)+'</div>':'')
            +'</div>';
        });

        html += '</div>';
      });
    })(hr);
  }

  html += '</div></div>';

  // Legend — counts per rep, reflecting active filter
  html += '<div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap;align-items:center">';
  html += '<div style="font-size:11px;color:#6b7280;font-weight:600">Legend:</div>';
  reps.forEach(function(r) {
    var cnt = 0;
    days.forEach(function(d){ d.events.forEach(function(e){ if(e.rep===r.name) cnt++; }); });
    html += '<div style="display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer" onclick="calRepFilter=\''+_calEsc(r.name)+'\';renderPage()" title="Filter to '+_calEsc(r.name)+'"><div style="width:10px;height:10px;border-radius:50%;background:'+r.col+'"></div><span>'+_calEsc(r.name.split(' ')[0])+' ('+cnt+')</span></div>';
  });
  var gCnt = 0;
  days.forEach(function(d){ d.events.forEach(function(e){ if(e.source==='google') gCnt++; }); });
  html += '<div style="display:flex;align-items:center;gap:5px;font-size:11px"><div style="width:10px;height:10px;border-radius:50%;background:#4285f4"></div><span>Google ('+gCnt+')</span></div>';
  html += '</div></div>';

  // Event modal
  html += renderCalEventModal();

  // Attach event delegation AFTER render using a MutationObserver-style deferred wire-up.
  // We schedule a handler attach on the next tick; renderPage swaps innerHTML so we must
  // re-attach each render.
  setTimeout(function(){
    var grid = document.getElementById('calWeekGrid');
    if (!grid || grid._calWired) return;
    grid._calWired = true;
    grid.addEventListener('click', function(ev){
      var el = ev.target;
      while (el && el !== grid && !(el.classList && el.classList.contains('cal-evt'))) el = el.parentNode;
      if (!el || el === grid) return;
      var idx = parseInt(el.getAttribute('data-cal-idx'));
      if (!isNaN(idx)) {
        ev.stopPropagation();
        calOpenEventByIndex(idx);
      }
    });
  }, 0);

  return html;
}

