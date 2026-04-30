// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 08-sales-crm.js
// Extracted from original index.html lines 3086-6587
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── MOBILE: TODAY HOME SCREEN ─────────────────────────────────────────────────
// Black hero strip + 2×2 stat grid + Today's appointments + Recent open deals.
// Designed for the Capacitor wrapper; rendered via renderDashboard() when
// isNativeWrapper() is true. Layout follows SpartanSalesMobile.jsx's TodayScreen
// pattern but uses our brand red (#c41230) and existing data shapes.
// ─────────────────────────────────────────────────────────────────────────────
// PIPEDRIVE-REPLACEMENT PHASES 3–8: shared helpers
// ─────────────────────────────────────────────────────────────────────────────
// Used by:
//   - renderTodayMobile (this file)        — Phases 5/6/7
//   - renderDealsMobile dealCard           — Phase 3 chip + Phase 8 inline
//   - renderLeadsMobile leadCard (file 13) — Phase 3 chip + Phase 8 inline
//   - renderBottomNav (file 07)            — Phase 5 overdue badge
//   - advanceDealStageMobile, takeMobilePhoto — Phase 4 post-action prompt

// _nextActivityChipState — interpret a deal/lead's denormalized next_activity_*
// triple (Phase 1) and return everything the Phase 3 chip needs to render.
// Tone semantics:
//   overdue — nextActivityAt is in the past
//   today   — nextActivityAt is between now and 23:59 today
//   future  — anything after that
//   none    — nextActivityAt is null/undefined ("no activity scheduled")
function _nextActivityChipState(entity) {
  if (!entity) return { tone: 'none', label: '+ Schedule', hint: null };
  var iso = entity.nextActivityAt;
  if (!iso) return { tone: 'none', label: '+ Schedule', hint: null };

  var when;
  try { when = new Date(iso); } catch(e) { return { tone: 'none', label: '+ Schedule', hint: null }; }
  if (isNaN(when.getTime())) return { tone: 'none', label: '+ Schedule', hint: null };

  var typeId = entity.nextActivityType || 'call';
  var meta = (typeof getActivityType === 'function') ? getActivityType(typeId) : null;
  var icon = (meta && meta.icon) || '📌';
  var typeLabel = (meta && meta.label) || (typeId.charAt(0).toUpperCase() + typeId.slice(1));

  var now = new Date();
  var endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Format helpers — relative-day prefix + 12h time so the chip stays compact
  // ("Call today 3pm", "Call Tue 9am", "Overdue Call · 2d").
  function fmt12(dt) {
    var h = dt.getHours(); var m = dt.getMinutes();
    var ap = h >= 12 ? 'pm' : 'am'; var h12 = h % 12 || 12;
    return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ap;
  }
  function dayWord(dt) {
    var sameDay = dt.toDateString() === now.toDateString();
    if (sameDay) return 'today';
    var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (dt.toDateString() === tomorrow.toDateString()) return 'tomorrow';
    var diffDays = Math.round((dt - now) / 86400000);
    if (diffDays > 0 && diffDays < 7) return dt.toLocaleDateString('en-AU', { weekday: 'short' });
    return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  if (when < now) {
    // Overdue — show "2d" or "1h" since due, no time-of-day.
    var diffMs = now - when;
    var diffDays = Math.floor(diffMs / 86400000);
    var diffHrs = Math.floor(diffMs / 3600000);
    var ago = diffDays >= 1 ? diffDays + 'd' : diffHrs + 'h';
    return { tone: 'overdue', label: icon + ' ' + typeLabel + ' · ' + ago, hint: typeId };
  }
  if (when <= endOfToday) {
    return { tone: 'today', label: icon + ' ' + typeLabel + ' today ' + fmt12(when), hint: typeId };
  }
  return { tone: 'future', label: icon + ' ' + typeLabel + ' ' + dayWord(when) + ' ' + fmt12(when), hint: typeId };
}

// renderNextActivityChip — Phase 3. Tap → openMobileSchedule (if Phase 1's
// nextActivityAt is null, we open with default; if it's set, we still open
// the schedule modal so the rep can reschedule). Caller passes entityType.
function renderNextActivityChip(entity, entityType, opts) {
  if (!entity || !entityType) return '';
  opts = opts || {};
  var s = _nextActivityChipState(entity);
  var palette = {
    overdue: { bg: '#fef2f2', border: '#fca5a5', col: '#b91c1c' },
    today:   { bg: '#fffbeb', border: '#fcd34d', col: '#b45309' },
    future:  { bg: '#ecfdf5', border: '#86efac', col: '#15803d' },
    none:    { bg: '#f9fafb', border: '#e5e7eb', col: '#9ca3af' },
  };
  var p = palette[s.tone];
  var idEsc = String(entity.id).replace(/'/g, "\\'");
  // stopPropagation so tapping the chip on a card doesn't also trigger the
  // card's "open detail" onclick.
  var handler = "event.stopPropagation();openMobileSchedule('" + idEsc + "','" + entityType + "'" + (s.hint ? ",'" + s.hint + "'" : '') + ")";
  var size = opts.size === 'sm' ? '10px;padding:3px 8px' : '11px;padding:4px 10px';
  return '<button onclick="' + handler + '" style="display:inline-flex;align-items:center;gap:4px;border:1px solid ' + p.border + ';background:' + p.bg + ';color:' + p.col + ';border-radius:14px;font-size:' + size + ';font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">' + s.label + '</button>';
}

// _renderInlineRowActions — Phase 8. Small call + SMS icon buttons rendered
// to the right of any list-row card. event.stopPropagation prevents the
// card's onclick from firing when the user taps an action. Phone is required;
// rows without a phone get an empty string back and skip rendering.
function _renderInlineRowActions(phone, entityId, entityType, contactName) {
  if (!phone) return '';
  var idEsc = String(entityId).replace(/'/g, "\\'");
  var nameEsc = String(contactName || '').replace(/'/g, "\\'");
  var phoneEsc = String(phone).replace(/'/g, "\\'");
  var smsHref = 'sms:' + String(phone).replace(/[^\d+]/g, '');
  var btnStyle = 'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-size:14px;text-decoration:none;flex-shrink:0';
  // Call button → twilioCall (which routes to dialViaTwilioBridge on native).
  var call = '<button onclick="event.stopPropagation();twilioCall(\'' + phoneEsc + '\',\'' + idEsc + '\',\'' + entityType + '\',\'' + nameEsc + '\')" style="' + btnStyle + ';background:#dcfce7;color:#15803d" title="Call">📞</button>';
  // SMS opens the device's native SMS composer — same pattern as the action
  // bar's SMS button on the detail screen.
  var sms = '<a href="' + smsHref + '" onclick="event.stopPropagation()" style="' + btnStyle + ';background:#dbeafe;color:#1d4ed8" title="SMS">💬</a>';
  return '<div style="display:flex;gap:6px;flex-shrink:0">' + call + sms + '</div>';
}

// getOverdueCountForUser — Phase 5. Count of open deals + un-converted leads
// owned by the user (or all, for managers) whose next_activity_at is in the
// past. Used by renderBottomNav for the Today tab badge.
function getOverdueCountForUser() {
  var st = getState();
  var cu = getCurrentUser() || { name: 'Admin', role: 'admin' };
  var isManager = cu.role === 'admin' || cu.role === 'sales_manager' || cu.role === 'accounts';
  var now = Date.now();
  var count = 0;
  (st.deals || []).forEach(function(d) {
    if (d.won || d.lost) return;
    if (!isManager && d.rep !== cu.name) return;
    if (!d.nextActivityAt) return;
    try { if (new Date(d.nextActivityAt).getTime() < now) count++; } catch(e) {}
  });
  (st.leads || []).forEach(function(l) {
    if (l.converted) return;
    if (!isManager && l.owner !== cu.name) return;
    if (!l.nextActivityAt) return;
    try { if (new Date(l.nextActivityAt).getTime() < now) count++; } catch(e) {}
  });
  return count;
}

// getTodayPayload — Phase 6 data layer. Returns a flat array of work-queue
// items (deals + leads) bucketed by overdue/today/tomorrow/later, sorted by
// nextActivityAt within each bucket, capped at 50 entries total. Items
// without a nextActivityAt are excluded — the empty state on Today prompts
// the rep to schedule one.
//
// Item shape: { bucket, entityType, entity, when, contactName, phone }
function getTodayPayload() {
  var st = getState();
  var cu = getCurrentUser() || { name: 'Admin', role: 'admin' };
  var isManager = cu.role === 'admin' || cu.role === 'sales_manager' || cu.role === 'accounts';
  var contactsById = {};
  (st.contacts || []).forEach(function(c) { contactsById[c.id] = c; });
  var now = new Date();
  var endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  var endOfTomorrow = new Date(endOfToday); endOfTomorrow.setDate(endOfToday.getDate() + 1);
  var endOfWeek = new Date(endOfToday); endOfWeek.setDate(endOfToday.getDate() + 7);

  function bucketFor(dt) {
    if (dt < now) return 'overdue';
    if (dt <= endOfToday) return 'today';
    if (dt <= endOfTomorrow) return 'tomorrow';
    if (dt <= endOfWeek) return 'later';
    return 'later';
  }

  var items = [];
  (st.deals || []).forEach(function(d) {
    if (d.won || d.lost) return;
    if (!isManager && d.rep !== cu.name) return;
    if (!d.nextActivityAt) return;
    var dt;
    try { dt = new Date(d.nextActivityAt); } catch(e) { return; }
    if (isNaN(dt.getTime())) return;
    var c = d.cid ? contactsById[d.cid] : null;
    var contactName = c ? ((c.fn || '') + ' ' + (c.ln || '')).trim() : (d.title || '');
    var phone = (c && c.phone) || d.phone || '';
    items.push({
      bucket: bucketFor(dt),
      entityType: 'deal', entity: d, when: dt,
      contactName: contactName, phone: phone,
    });
  });
  (st.leads || []).forEach(function(l) {
    if (l.converted) return;
    if (!isManager && l.owner !== cu.name) return;
    if (!l.nextActivityAt) return;
    var dt;
    try { dt = new Date(l.nextActivityAt); } catch(e) { return; }
    if (isNaN(dt.getTime())) return;
    var contactName = ((l.fn || '') + ' ' + (l.ln || '')).trim();
    items.push({
      bucket: bucketFor(dt),
      entityType: 'lead', entity: l, when: dt,
      contactName: contactName, phone: l.phone || '',
    });
  });
  items.sort(function(a, b) { return a.when - b.when; });
  return items.slice(0, 50);
}

// maybePromptNextActivity — Phase 4. Bridge between an action's success path
// and the Phase 2 schedule modal. Opens the modal pre-filled with a sensible
// type hint, after a small delay so the action's success toast is visible
// first. Native-only — desktop already has its own scheduling flow.
//
// Skipping is implicit: the modal's Cancel button does the right thing (the
// rep just dismisses and nothing is scheduled). We considered a separate
// "Skip / Schedule" two-button sheet but it's an extra tap with no signal —
// reps will either schedule or won't, and the Cancel button covers that.
function maybePromptNextActivity(entityId, entityType, hint) {
  if (typeof isNativeWrapper !== 'function' || !isNativeWrapper()) return;
  if (!entityId || !entityType) return;
  // Don't stack on top of an already-open modal (e.g. user just scheduled
  // something else). The pending-state guard prevents that.
  if (typeof _pendingMobileSchedule !== 'undefined' && _pendingMobileSchedule) return;
  setTimeout(function() {
    if (typeof openMobileSchedule === 'function') {
      openMobileSchedule(entityId, entityType, hint || null);
    }
  }, 350);
}

function renderTodayMobile() {
  var st = getState();
  var deals = st.deals || [];
  var cu = getCurrentUser() || { name:'Admin', role:'admin', branch:'All' };
  var myName = cu.name || 'User';
  var role = cu.role || 'sales_rep';
  var branch = cu.branch || '';
  var isManager = role === 'admin' || role === 'sales_manager' || role === 'accounts';

  var today = new Date();
  var todayStr = today.toISOString().slice(0, 10);

  // Today's appointments — pull from scheduled activities on every deal/lead
  // (matches the Calendar tab), falling back to MOCK_APPOINTMENTS for legacy
  // map-flow entries. Calendar/Gmail OAuth isn't available in the wrapper, so
  // there's no Google-Calendar source on mobile.
  var apptsAll = (typeof _gatherScheduledForMobileCalendar === 'function')
    ? _gatherScheduledForMobileCalendar()
    : ((typeof MOCK_APPOINTMENTS !== 'undefined' && MOCK_APPOINTMENTS) ? MOCK_APPOINTMENTS : []);
  var todaysAppts = apptsAll.filter(function(a){
    return a.date === todayStr && (isManager || a.rep === myName);
  }).sort(function(a,b){ return (a.time||'').localeCompare(b.time||''); });

  // Visible-to-me deals (manager/admin sees all; reps see their own).
  var visibleDeals = deals.filter(function(d){ return isManager || d.rep === myName; });
  var myOpenDeals = visibleDeals.filter(function(d){ return !d.won && !d.lost; })
    .sort(function(a,b){ return (b.val||0) - (a.val||0); });
  var myOpenValue = myOpenDeals.reduce(function(s,d){ return s + (d.val||0); }, 0);

  // Wins this week (last 7 days)
  var weekStart = Date.now() - 7 * 86400000;
  var weekWon = visibleDeals.filter(function(d){
    return d.won && d.wonDate && new Date(d.wonDate).getTime() >= weekStart;
  });
  var weekWonValue = weekWon.reduce(function(s,d){ return s + (d.val||0); }, 0);

  // Commission MTD — rough 5% of GST-exclusive won-this-month value.
  var monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
  var monthWon = visibleDeals.filter(function(d){
    return d.won && d.wonDate && new Date(d.wonDate).getTime() >= monthStart.getTime();
  });
  var monthCommission = monthWon.reduce(function(s,d){ return s + ((d.val||0)/1.1)*0.05; }, 0);

  // Greeting + role label
  var h = today.getHours();
  var greet = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  var fname = (myName.split(' ')[0]) || 'User';
  var roleLabel = ({admin:'Admin',sales_manager:'Sales Manager',sales_rep:'Sales Rep',accounts:'Accounts',installer:'Installer',production_manager:'Production Manager',service_staff:'Service Staff'})[role] || role;
  var dateStr = today.toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'short' });

  // $-formatter that compacts to k/M for stat tiles.
  function fmtK(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v/1000) + 'k';
    return '$' + v.toFixed(0);
  }
  function fmtTime12(t) {
    if (!t) return '';
    var p = t.split(':'); var hh = parseInt(p[0]); var mm = p[1] || '00';
    var ap = hh >= 12 ? 'pm' : 'am'; var h12 = hh % 12 || 12;
    return h12 + ':' + mm + ap;
  }
  function _esc(s) { return String(s||'').replace(/'/g, "\\'"); }

  // Compact metric strip cell — replaces the 2x2 grid (Phase 7 above-the-fold
  // tuning). Each cell is ~58px tall vs the old ~78px stat card, so 4 of
  // them in a single horizontal row push the work queue above the fold on a
  // mid-range Android. The 2x2 stat grid was kept as buildable shape but
  // collapsed via a single render path here — old `stat()` builder removed.
  function statMini(label, val, accent, onclick) {
    var clickable = onclick ? 'cursor:pointer' : '';
    var tag = onclick ? 'button' : 'div';
    return '<' + tag + (onclick ? ' onclick="' + onclick + '"' : '') + ' style="flex:1;min-width:0;background:#fff;border-radius:10px;padding:8px 10px;text-align:left;border:none;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);' + clickable + '">' +
      '<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px"><span style="width:5px;height:5px;border-radius:50%;background:' + (accent || '#c41230') + ';flex-shrink:0"></span><span style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:700">' + label + '</span></div>' +
      '<div style="font-size:16px;font-weight:800;color:#0a0a0a;font-family:Syne,sans-serif;line-height:1">' + val + '</div>' +
    '</' + tag + '>';
  }

  // Appointment card — Navigate / Call / SMS direct-action buttons baked in.
  function apptCard(a) {
    var addr = [a.street, a.suburb, a.state].filter(Boolean).join(', ');
    var nameLine = a.client || a.subject || 'Appointment';
    var navUrl = addr ? 'https://maps.google.com/?q=' + encodeURIComponent(addr) : '';
    var phone = a.phone || '';
    var startIso = String(a.date || todayStr).slice(0,10) + 'T' + (a.time || '09:00') + ':00';
    var dur = Number(a.duration) || 60;
    var notesText = ((a.type || '') + (a.subject && a.subject !== nameLine ? ' · ' + a.subject : '')).trim();
    var addCalArgs = "{title:'" + _esc(nameLine) + "',location:'" + _esc(addr) + "',notes:'" + _esc(notesText) + "',startIso:'" + startIso + "',durationMinutes:" + dur + "}";
    return '<div style="background:#fff;border-radius:12px;overflow:hidden;margin-bottom:8px;box-shadow:0 1px 3px rgba(0,0,0,.06);display:flex">' +
      '<div style="width:5px;background:#c41230;flex-shrink:0"></div>' +
      '<div style="flex:1;padding:12px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span style="font-size:13px;font-weight:700;color:#1a1a1a">⏰ ' + (fmtTime12(a.time) || 'All day') + '</span>' +
          (a.dealId ? '<button onclick="setState({dealDetailId:\'' + _esc(a.dealId) + '\'})" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:none;background:#fef2f4;color:#c41230;cursor:pointer;font-family:inherit">Open Deal</button>' : '') +
        '</div>' +
        '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:2px">' + nameLine + '</div>' +
        (addr ? '<div style="font-size:11px;color:#6b7280;margin-bottom:8px;display:flex;align-items:center;gap:4px">📍 ' + addr + '</div>' : '<div style="margin-bottom:8px"></div>') +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          (navUrl ? '<a href="' + navUrl + '" target="_blank" rel="noopener" style="flex:1;min-width:62px;text-align:center;padding:7px;border-radius:8px;background:#0a0a0a;color:#fff;font-size:11px;font-weight:700;text-decoration:none">↗ Navigate</a>' : '') +
          (phone ? '<a href="tel:' + String(phone).replace(/[^\d+]/g,'') + '" style="flex:1;min-width:55px;text-align:center;padding:7px;border-radius:8px;background:#22c55e;color:#fff;font-size:11px;font-weight:700;text-decoration:none">☎ Call</a>' : '') +
          (phone ? '<a href="sms:' + String(phone).replace(/[^\d+]/g,'') + '" style="flex:1;min-width:55px;text-align:center;padding:7px;border-radius:8px;background:#3b82f6;color:#fff;font-size:11px;font-weight:700;text-decoration:none">💬 SMS</a>' : '') +
          '<button onclick="addToDeviceCalendar(' + addCalArgs + ')" title="Add to phone calendar" style="flex:1;min-width:55px;text-align:center;padding:7px;border-radius:8px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:700;border:none;cursor:pointer;font-family:inherit">+📅 Sync</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Section heading with count badge.
  function sectionTitle(title, count, accent) {
    var titleCol = accent || '#6b7280';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;margin:18px 0 8px"><h2 style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:' + titleCol + ';margin:0">' + title + '</h2>' + (count !== undefined ? '<span style="font-size:11px;font-weight:700;color:#9ca3af">' + count + '</span>' : '') + '</div>';
  }

  // Phase 6/7 work-queue row — single line of "what to do next, in order".
  // Tap the row body → entity detail; tap the chip → reschedule; tap call/SMS
  // icons → direct contact (Phase 8 inline actions). Overdue rows get a red
  // left border accent (Phase 5).
  function workRow(item) {
    var entity = item.entity;
    var entityType = item.entityType;
    var contactName = item.contactName || (entityType === 'lead' ? 'Lead' : 'Deal');
    var dealTitle = (entityType === 'deal') ? (entity.title || '') : '';
    var val = entity.val ? fmtK(entity.val) : '';
    var leftBorder = item.bucket === 'overdue' ? '3px solid #dc2626' : '3px solid #f3f4f6';
    var setStateKey = entityType === 'deal' ? 'dealDetailId' : 'leadDetailId';
    var pageHint = entityType === 'deal' ? 'deals' : 'leads';
    return '<div style="display:flex;align-items:center;gap:8px;background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:' + leftBorder + '">' +
      '<button onclick="setState({' + setStateKey + ':\'' + _esc(entity.id) + '\',page:\'' + pageHint + '\'})" style="flex:1;min-width:0;background:none;border:none;padding:0;text-align:left;font-family:inherit;cursor:pointer">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">' +
          renderNextActivityChip(entity, entityType, { size: 'sm' }) +
          (val ? '<span style="font-size:11px;color:#6b7280;font-weight:700;font-family:Syne,sans-serif">' + val + '</span>' : '') +
        '</div>' +
        '<div style="font-size:13px;font-weight:700;color:#0a0a0a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (contactName || '—') + '</div>' +
        (dealTitle ? '<div style="font-size:11px;color:#6b7280;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + dealTitle + '</div>' : '') +
      '</button>' +
      _renderInlineRowActions(item.phone, entity.id, entityType, contactName) +
    '</div>';
  }

  // Phase 6 payload + bucket grouping (Phase 7 render).
  var payload = (typeof getTodayPayload === 'function') ? getTodayPayload() : [];
  var byBucket = { overdue: [], today: [], tomorrow: [], later: [] };
  payload.forEach(function(it) { (byBucket[it.bucket] || byBucket.later).push(it); });

  function bucketSection(key, title, accent) {
    var rows = byBucket[key] || [];
    if (rows.length === 0) return '';
    return sectionTitle(title, rows.length, accent) +
      rows.map(workRow).join('');
  }

  // Empty state — no scheduled activities AT ALL across any bucket. Different
  // copy from "no open deals" because the prescription is different: schedule
  // something, not close more.
  var queueEmpty = payload.length === 0;

  return '' +
    // Black hero — extends edge-to-edge by pulling out the 12px main padding.
    '<div style="margin:-12px -12px 0;padding:18px 16px 22px;background:#0a0a0a;color:#fff">' +
      '<div style="font-size:12px;opacity:.6;margin-bottom:2px">Good ' + greet + ', ' + fname + '</div>' +
      '<h1 style="font-size:22px;font-weight:800;margin:0;font-family:Syne,sans-serif">' + dateStr + '</h1>' +
      '<div style="font-size:11px;opacity:.5;margin-top:4px">' + roleLabel + ' · ' + branch + '</div>' +
    '</div>' +

    // Phase 7: thin metric strip — 4 mini-stats inline, ~58px tall vs the
    // old 2x2 grid's ~150px. Pulls up to overlap the hero edge slightly.
    '<div style="margin-top:-10px;display:flex;gap:6px;margin-bottom:6px">' +
      statMini("Today's appts", String(todaysAppts.length), '#c41230', "setState({page:'calendar'})") +
      statMini('Open deals', String(myOpenDeals.length), '#0a0a0a', "setState({page:'deals'})") +
      statMini('Wins/week', String(weekWon.length), '#22c55e', null) +
      statMini('Comm MTD', fmtK(monthCommission), '#f59e0b', "setState({page:'commission'})") +
    '</div>' +

    // Today's appointments — kept above the work queue because reps think of
    // "today's bookings" as a separate thing from "what to do next on my deals".
    sectionTitle("Today's appointments", todaysAppts.length) +
    (todaysAppts.length === 0
      ? '<div style="padding:14px;text-align:center;background:#fff;border-radius:12px;color:#9ca3af;font-size:12px;font-style:italic">No appointments today.</div>'
      : todaysAppts.map(apptCard).join('')) +

    // Phase 7 work queue — the single non-negotiable Pipedrive habit.
    // Order: Overdue (red) → Today (amber) → Tomorrow (green) → Later (grey).
    (queueEmpty
      ? sectionTitle('Up next', 0) +
        '<div style="padding:20px 16px;text-align:center;background:#fff;border-radius:12px;color:#6b7280;font-size:13px;line-height:1.5">' +
          '<div style="font-size:28px;margin-bottom:8px">📋</div>' +
          '<div style="font-weight:600;color:#0a0a0a;margin-bottom:4px">Nothing scheduled</div>' +
          '<div style="font-size:12px">Tap any deal and tap <b>+ Schedule</b> to start your day.</div>' +
        '</div>'
      : '' +
        bucketSection('overdue',  'Overdue',           '#b91c1c') +
        bucketSection('today',    'Today',             '#b45309') +
        bucketSection('tomorrow', 'Tomorrow',          '#15803d') +
        bucketSection('later',    'Later this week',   '#6b7280')
    );
}

// ── MOBILE: MORE menu ─────────────────────────────────────────────────────────
// Tap-target list of pages that don't fit in the 7 bottom-nav tabs.
function renderMore() {
  var items = [
    {id:'won',       label:'Won Deals',     icon:'won'},
    {id:'contacts',  label:'Contacts',      icon:'contacts'},
    {id:'invoicing', label:'Invoicing',     icon:'invoicing'},
    {id:'reports',   label:'Reports',       icon:'reports'},
    {id:'audit',     label:'Audit',         icon:'audit'},
    {id:'map',       label:'Schedule Map',  icon:'map'},
    {id:'phone',     label:'Phone',         icon:'phone'},
    {id:'profile',   label:'My Profile',    icon:'contacts'},
    {id:'settings',  label:'Settings',      icon:'settings'},
  ].filter(function(it){
    return typeof canAccessPage !== 'function' || canAccessPage(it.id);
  });
  return '' +
    // Header strip flush to the edges — same pattern as Deals / Leads.
    '<div style="margin:-12px -12px 12px;background:#fff;padding:12px 16px;border-bottom:1px solid #f0f0f0">' +
      '<h1 style="font-size:18px;font-weight:800;margin:0;color:#0a0a0a;font-family:Syne,sans-serif">More</h1>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:2px">Settings, profile, and other tools</div>' +
    '</div>' +
    '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
      items.map(function(it, i){
        return '<button onclick="setState({page:\'' + it.id + '\',dealDetailId:null,leadDetailId:null,contactDetailId:null,jobDetailId:null})" style="width:100%;text-align:left;padding:14px 16px;background:#fff;border:none;' + (i>0?'border-top:1px solid #f3f4f6;':'') + 'cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:12px;font-size:14px;font-weight:600;color:#1a1a1a">' +
          '<span style="color:#6b7280;display:inline-flex;width:20px;justify-content:center">' + Icon({n: it.icon, size: 16}) + '</span>' +
          '<span style="flex:1">' + it.label + '</span>' +
          '<span style="color:#9ca3af;font-size:18px;line-height:1">›</span>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<button onclick="logout()" style="width:100%;text-align:center;padding:12px;background:#fff;border:1px solid #fecaca;border-radius:12px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;color:#b91c1c;margin-top:16px">Sign Out</button>';
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function renderDashboard() {
  // Native wrapper: replace the desktop dashboard with the mobile "Today"
  // home screen — black hero, 2x2 stat grid, today's appointments, recent
  // open deals. Desktop behaviour is unchanged below this branch.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    return renderTodayMobile();
  }
  const { deals, leads, emailSent, emailInbox, contacts } = getState();
  const now = new Date();
  const B = getState().branch || 'all'; // 'all' | 'VIC' | 'SA' | 'ACT'

  // ── Branch filter ───────────────────────────────────────────────────────────
  const bFilter = x => B === 'all' || x.branch === B;

  const bDeals = deals.filter(bFilter);
  const bLeads = leads.filter(bFilter);

  // ── Date helpers ────────────────────────────────────────────────────────────
  // This week: Mon–Sun
  const dow = now.getDay(); // 0=Sun
  const monday = new Date(now); monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
  const inWeek = ds => { if (!ds) return false; const d = new Date(ds + 'T12:00'); return d >= monday && d <= sunday; };

  const weekLabel = monday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    + ' – '
    + sunday.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  // This month
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthKey = now.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  const inMonth = ds => { if (!ds) return false; const d = new Date(ds + 'T12:00'); return d >= monthStart && d <= monthEnd; };

  // Previous month
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const inPrevMonth = ds => { if (!ds) return false; const d = new Date(ds + 'T12:00'); return d >= prevStart && d <= prevEnd; };

  // ── This WEEK's leads ────────────────────────────────────────────────────────
  const weekLeads = bLeads.filter(l => inWeek(l.created));
  const weekLeadsNew = weekLeads.filter(l => l.status === 'New').length;
  const weekLeadsQual = weekLeads.filter(l => l.status === 'Qualified').length;
  const weekLeadsConv = weekLeads.filter(l => l.converted).length;

  // Daily breakdown Mon–Sun
  const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekDayLeads = DAY_NAMES.map((dn, i) => {
    const dayDate = new Date(monday); dayDate.setDate(monday.getDate() + i);
    const dayStr = dayDate.toISOString().slice(0, 10);
    const dayLeads = bLeads.filter(l => l.created && l.created.slice(0, 10) === dayStr);
    return {
      day: dn, date: dayStr, total: dayLeads.length,
      new: dayLeads.filter(l => l.status === 'New').length,
      qual: dayLeads.filter(l => l.status === 'Qualified').length,
      conv: dayLeads.filter(l => l.converted).length,
      isToday: dayStr === now.toISOString().slice(0, 10),
    };
  });
  const maxDayLeads = Math.max(...weekDayLeads.map(d => d.total), 1);

  // ── This month's won deals ───────────────────────────────────────────────────
  const monthWon = bDeals.filter(d => d.won && inMonth(d.wonDate));
  const monthWonValue = monthWon.reduce((s, d) => s + d.val, 0);
  const avgDealValue = monthWon.length > 0 ? Math.round(monthWonValue / monthWon.length) : 0;
  const prevWon = bDeals.filter(d => d.won && inPrevMonth(d.wonDate));
  const prevWonValue = prevWon.reduce((s, d) => s + d.val, 0);
  const prevAvgVal = prevWon.length > 0 ? Math.round(prevWonValue / prevWon.length) : 0;

  // ── Closing ratio (month) ────────────────────────────────────────────────────
  const allMonthActive = bDeals.filter(d => inMonth(d.created) || inMonth(d.wonDate));
  const monthCreatedWon = bDeals.filter(d => d.won && inMonth(d.wonDate));
  const closeRatio = allMonthActive.length > 0 ? Math.round(monthCreatedWon.length / allMonthActive.length * 100) : 0;

  // ── Leaderboard (won value this month by rep, filtered by branch) ────────────
  const REP_COLS = { 'James Wilson': '#c41230', 'Sarah Chen': '#1e40af', 'Emma Brown': '#059669', 'Michael Torres': '#7c3aed', 'David Kim': '#d97706' };
  const repMap = {};
  monthWon.forEach(d => {
    if (!repMap[d.rep]) repMap[d.rep] = { name: d.rep, val: 0, count: 0 };
    repMap[d.rep].val += d.val; repMap[d.rep].count++;
  });
  const leaderboard = Object.values(repMap)
    .map(r => ({ ...r, col: REP_COLS[r.name] || '#9ca3af', initials: r.name.split(' ').map(w => w[0]).join('') }))
    .sort((a, b) => b.val - a.val);
  const maxRepVal = Math.max(...leaderboard.map(r => r.val), 1);

  // ── Pipeline by stage ────────────────────────────────────────────────────────
  const pipeline = bDeals.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
  const stageRows = PIPELINES[0].stages.filter(s => !s.isLost).map(st => {
    const sd = bDeals.filter(d => d.sid === st.id && !d.won);
    return { ...st, count: sd.length, val: sd.reduce((s, d) => s + d.val, 0) };
  }).filter(s => s.count > 0);
  const maxStageVal = Math.max(...stageRows.map(s => s.val), 1);

  // ── Recent activity ──────────────────────────────────────────────────────────
  const allActs = [];
  bDeals.forEach(d => (d.activities || []).forEach(a => allActs.push({ ...a, _title: d.title, _id: d.id, _et: 'deal' })));
  bLeads.forEach(l => (l.activities || []).forEach(a => allActs.push({ ...a, _title: l.fn + ' ' + l.ln, _id: l.id, _et: 'lead' })));
  allActs.sort((a, b) => b.date > a.date ? 1 : -1);
  const recentActs = allActs.slice(0, 5);
  const AICON = { note: '📝', call: '📞', email: '✉️', task: '☑️', stage: '🔀', created: '⭐', meeting: '📅', file: '📎', edit: '✏️', photo: '📸' };
  const unread = (emailInbox || []).filter(m => !m.read).length;

  // ── Branch config ────────────────────────────────────────────────────────────
  const BRANCHES = [
    { id: 'all', label: 'All Branches', col: '#1a1a1a', bg: '#1a1a1a', flag: '🇦🇺' },
    { id: 'VIC', label: 'VIC', col: '#1d4ed8', bg: '#1d4ed8', flag: '📍' },
    { id: 'SA', label: 'SA', col: '#059669', bg: '#059669', flag: '📍' },
    { id: 'ACT', label: 'ACT', col: '#7c3aed', bg: '#7c3aed', flag: '📍' },
  ];
  const activeBranch = BRANCHES.find(b => b.id === B) || BRANCHES[0];

  const trendBadge = (val, prev, suffix = '') => {
    if (!prev) return '';
    const d = val - prev, pct = Math.round(Math.abs(d) / prev * 100);
    const up = d >= 0;
    return `<span style="font-size:11px;font-weight:600;color:${up ? '#15803d' : '#b91c1c'}">${up ? '▲' : '▼'} ${pct}%</span>`;
  };

  return `
  <!-- ══ HEADER ══ -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="font-size:26px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">
        ${B === 'all' ? 'All Branches' : B + ' Branch'} Dashboard
      </h1>
      <p style="color:#6b7280;font-size:13px;margin:0">${monthKey}</p>
    </div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button onclick="setState({page:'leads'})" class="btn-w" style="font-size:12px;gap:5px">${Icon({ n: 'user', size: 13 })} Add Lead</button>
      <button onclick="openNewDealModal()" class="btn-r" style="font-size:13px;gap:6px">${Icon({ n: 'plus', size: 14 })} New Deal</button>
    </div>
  </div>

  <!-- ══ BRANCH SWITCHER ══ -->
  ${(typeof isNativeWrapper === 'function' && isNativeWrapper()) ? `
  <div style="display:flex;gap:6px;margin-bottom:14px;overflow-x:auto;padding-bottom:2px">
    ${BRANCHES.map(br => {
      const isActive = B === br.id;
      return `<button onclick="setState({branch:'${br.id}'})" style="flex-shrink:0;padding:6px 14px;border-radius:18px;border:1px solid ${isActive ? br.col : '#e5e7eb'};background:${isActive ? br.col : '#fff'};color:${isActive ? '#fff' : '#1a1a1a'};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap">${br.label}</button>`;
    }).join('')}
  </div>
  ` : `
  <div style="display:flex;gap:6px;margin-bottom:18px;flex-wrap:wrap">
    ${BRANCHES.map(br => {
    const brDeals = deals.filter(d => br.id === 'all' || d.branch === br.id);
    const brLeads = leads.filter(l => br.id === 'all' || l.branch === br.id);
    const brWon = brDeals.filter(d => d.won && inMonth(d.wonDate)).reduce((s, d) => s + d.val, 0);
    const brWeekNew = brLeads.filter(l => inWeek(l.created)).length;
    const isActive = B === br.id;
    return `<button onclick="setState({branch:'${br.id}'})"
        style="display:flex;flex-direction:column;align-items:flex-start;padding:10px 16px;border-radius:12px;border:2px solid ${isActive ? br.col : '#e5e7eb'};background:${isActive ? br.col + '12' : '#fff'};cursor:pointer;font-family:inherit;min-width:110px;transition:all .15s;flex:1;max-width:200px"
        onmouseover="this.style.borderColor='${br.col}'" onmouseout="if((getState().branch||'all')!=='${br.id}')this.style.borderColor='#e5e7eb'">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:13px;font-weight:700;color:${isActive ? br.col : '#1a1a1a'}">${br.label}</span>
          ${isActive ? `<span style="width:6px;height:6px;border-radius:50%;background:${br.col};display:inline-block"></span>` : ''}
        </div>
        <div style="font-size:11px;color:#9ca3af">${brWeekNew} leads this wk · ${fmt$(brWon)} won</div>
      </button>`;
  }).join('')}
  </div>
  `}

  <!-- ══ KPI CARDS ══ -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:14px;margin-bottom:18px">

    <!-- Leads This Week -->
    <div class="card" style="padding:18px;cursor:pointer;border-top:3px solid ${activeBranch.col}"
      onclick="setState({page:'leads'})"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Leads This Week</span>
        <div style="width:30px;height:30px;border-radius:8px;background:${activeBranch.col}18;color:${activeBranch.col};display:flex;align-items:center;justify-content:center">${Icon({ n: 'user', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${weekLeads.length}</div>
      <div style="font-size:11px;color:#9ca3af;line-height:1.5">
        <span style="color:${activeBranch.col};font-weight:600">${weekLeadsNew} new</span>
        · ${weekLeadsQual} qualified
        · ${weekLeadsConv} converted
      </div>
      <div style="font-size:10px;color:#d1d5db;margin-top:4px">${weekLabel}</div>
    </div>

    <!-- Sales This Month -->
    <div class="card" style="padding:18px;cursor:pointer;border-top:3px solid #15803d"
      onclick="setState({page:'deals'})"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Sales This Month</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#dcfce7;color:#15803d;display:flex;align-items:center;justify-content:center">${Icon({ n: 'check', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${fmt$(monthWonValue)}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;color:#9ca3af">${monthWon.length} deal${monthWon.length !== 1 ? 's' : ''}</span>
        ${trendBadge(monthWonValue, prevWonValue)}
      </div>
    </div>

    <!-- Average Sale Value -->
    <div class="card" style="padding:18px;border-top:3px solid #b45309">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Avg Sale Value</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#fef3c7;color:#b45309;display:flex;align-items:center;justify-content:center">${Icon({ n: 'trend', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${fmt$(avgDealValue)}</div>
      <div style="display:flex;align-items:center;gap:6px">
        ${avgDealValue > 0 && prevAvgVal > 0
      ? (avgDealValue >= prevAvgVal
        ? `<span style="font-size:11px;color:#15803d;font-weight:600">▲ +${fmt$(avgDealValue - prevAvgVal)}</span>`
        : `<span style="font-size:11px;color:#b91c1c;font-weight:600">▼ ${fmt$(avgDealValue - prevAvgVal)}</span>`)
      : `<span style="font-size:11px;color:#9ca3af">No prev data</span>`}
        ${prevAvgVal > 0 ? `<span style="font-size:11px;color:#9ca3af">prev ${fmt$(prevAvgVal)}</span>` : ''}
      </div>
    </div>

    <!-- Closing Ratio -->
    <div class="card" style="padding:18px;border-top:3px solid #1d4ed8">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Close Rate</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center">${Icon({ n: 'arr', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#111;line-height:1;margin-bottom:6px">${closeRatio}%</div>
      <div style="font-size:11px;color:#9ca3af">${monthCreatedWon.length} won / ${allMonthActive.length} active this month</div>
    </div>

    ${unread > 0 && B === 'all' ? `<div class="card" style="padding:18px;cursor:pointer;border-top:3px solid #b91c1c"
      onclick="setState({page:'email'})"
      onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.06em">Unread Email</span>
        <div style="width:30px;height:30px;border-radius:8px;background:#fee2e2;color:#b91c1c;display:flex;align-items:center;justify-content:center">${Icon({ n: 'email2', size: 14 })}</div>
      </div>
      <div style="font-family:Syne,sans-serif;font-weight:800;font-size:32px;color:#c41230;line-height:1;margin-bottom:6px">${unread}</div>
      <div style="font-size:11px;color:#9ca3af">in your inbox</div>
    </div>`: ''}
  </div>

  <!-- ══ MAIN GRID ══ -->
  <div style="display:grid;grid-template-columns:1fr 300px;gap:18px;margin-bottom:18px">

    <!-- Leads This Week — daily bar chart -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div>
          <h3 style="font-size:14px;font-weight:700;margin:0 0 2px;font-family:Syne,sans-serif">
            Leads This Week${B !== 'all' ? ' — ' + B : ''}
          </h3>
          <p style="font-size:11px;color:#9ca3af;margin:0">${weekLabel} · ${weekLeads.length} total</p>
        </div>
        <button onclick="setState({page:'leads'})" class="btn-g" style="font-size:11px">View all →</button>
      </div>

      <!-- Day bars -->
      <div style="display:flex;gap:8px;align-items:flex-end;height:140px;padding-bottom:24px;position:relative">
        ${weekDayLeads.map(d => {
        const barH = maxDayLeads > 0 ? Math.max(Math.round(d.total / maxDayLeads * 110), d.total > 0 ? 10 : 0) : 0;
        const colBase = activeBranch.col !== '#1a1a1a' ? activeBranch.col : '#c41230';
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
            ${d.total > 0 ? `<span style="font-size:11px;font-weight:700;color:#1a1a1a">${d.total}</span>` : '<span style="font-size:11px;color:#d1d5db">0</span>'}
            <div style="width:100%;display:flex;flex-direction:column;justify-content:flex-end;height:110px">
              ${d.total > 0 ? `<div style="width:100%;border-radius:5px 5px 0 0;overflow:hidden">
                ${d.conv > 0 ? `<div style="height:${Math.round(d.conv / d.total * barH)}px;background:#7c3aed;min-height:4px"></div>` : ''}
                ${d.qual > 0 ? `<div style="height:${Math.round(d.qual / d.total * barH)}px;background:#fde68a;min-height:4px"></div>` : ''}
                ${d.new > 0 ? `<div style="height:${Math.round(d.new / d.total * barH)}px;background:${colBase};min-height:4px"></div>` : ''}
              </div>`: `<div style="width:100%;height:3px;background:#f3f4f6;border-radius:3px"></div>`}
            </div>
            <span style="font-size:10px;font-weight:${d.isToday ? 700 : 400};color:${d.isToday ? colBase : '#9ca3af'}">${d.day}</span>
            ${d.isToday ? `<div style="width:4px;height:4px;border-radius:50%;background:${colBase}"></div>` : ``}
          </div>`;
      }).join('')}
      </div>

      <!-- Legend -->
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        ${[['New', activeBranch.col !== '#1a1a1a' ? activeBranch.col : '#c41230'], ['Qualified', '#fde68a'], ['Converted', '#7c3aed']].map(([l, c]) =>
        `<div style="display:flex;align-items:center;gap:5px">
            <div style="width:10px;height:10px;border-radius:2px;background:${c}"></div>
            <span style="font-size:11px;color:#6b7280">${l}</span>
          </div>`).join('')}
      </div>
    </div>

    <!-- 🏆 Leaderboard -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
          🏆 ${now.toLocaleDateString('en-AU', { month: 'short' })} Leaders${B !== 'all' ? ' (' + B + ')' : ''}
        </h3>
        <button onclick="setState({page:'reports'})" class="btn-g" style="font-size:11px">Report →</button>
      </div>

      ${leaderboard.length === 0
      ? `<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">
            <div style="font-size:28px;margin-bottom:8px">🏆</div>
            No won deals this month${B !== 'all' ? ' for ' + B : ''}
          </div>`
      : leaderboard.map((rep, i) => `
        <div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div style="font-size:14px;font-weight:800;color:${i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#b45309' : '#d1d5db'};width:18px;text-align:center;flex-shrink:0">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
            <div style="width:28px;height:28px;border-radius:50%;background:${rep.col};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${rep.initials}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${rep.name}</div>
              <div style="font-size:10px;color:#9ca3af">${rep.count} deal${rep.count !== 1 ? 's' : ''}</div>
            </div>
            <div style="font-size:13px;font-weight:800;font-family:Syne,sans-serif;color:#1a1a1a;flex-shrink:0">${fmt$(rep.val)}</div>
          </div>
          <div style="margin-left:54px;height:5px;background:#f0f0f0;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${Math.round(rep.val / maxRepVal * 100)}%;background:${rep.col};border-radius:3px"></div>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ══ ROW 2: Sales vs Pipeline + Activity ══ -->
  <div style="display:grid;grid-template-columns:1fr 280px;gap:18px;margin-bottom:18px">

    <!-- Sales vs Pipeline by rep (branch-filtered) -->
    <div class="card" style="padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
          Sales vs Pipeline${B !== 'all' ? ' — ' + B : ''} · ${monthKey}
        </h3>
      </div>
      ${(() => {
      const repsInBranch = REP_BASES.filter(r => B === 'all' || r.branch === B);
      const maxBar = Math.max(...repsInBranch.map(r => {
        const w = bDeals.filter(d => d.rep === r.name && d.won && inMonth(d.wonDate)).reduce((s, d) => s + d.val, 0);
        const p = bDeals.filter(d => d.rep === r.name && !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
        return Math.max(w, p);
      }), 1);
      return repsInBranch.map(r => {
        const wonV = bDeals.filter(d => d.rep === r.name && d.won && inMonth(d.wonDate)).reduce((s, d) => s + d.val, 0);
        const pipeV = bDeals.filter(d => d.rep === r.name && !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
        if (wonV === 0 && pipeV === 0) return '<div style="font-size:12px;color:#d1d5db;padding:4px 0">' + r.name.split(' ')[0] + ': no activity</div>';
        return `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div style="width:24px;height:24px;border-radius:50%;background:${r.col};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">
                <span style="font-weight:600">${r.name.split(' ')[0]}</span>
                <span style="color:#9ca3af">${wonV > 0 ? fmt$(wonV) + ' won' : ''}${pipeV > 0 ? ' · ' + fmt$(pipeV) + ' pipeline' : ''}</span>
              </div>
              <div style="height:8px;background:#f0f0f0;border-radius:4px;overflow:hidden;display:flex">
                ${wonV > 0 ? `<div style="width:${Math.round(wonV / maxBar * 100)}%;background:${r.col};border-radius:4px 0 0 4px"></div>` : ''}
                ${pipeV > 0 ? `<div style="width:${Math.round(pipeV / maxBar * 100)}%;background:${r.col}55;border-radius:${wonV === 0 ? '4px' : '0'} 4px 4px ${wonV === 0 ? '4px' : '0'}"></div>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
    })()}
      <div style="display:flex;gap:14px;margin-top:8px;padding-top:8px;border-top:1px solid #f0f0f0">
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:8px;border-radius:2px;background:#c41230"></div><span style="font-size:11px;color:#6b7280">Won this month</span></div>
        <div style="display:flex;align-items:center;gap:5px"><div style="width:12px;height:8px;border-radius:2px;background:#c4123055"></div><span style="font-size:11px;color:#6b7280">Pipeline</span></div>
      </div>
    </div>

    <!-- Recent activity -->
    <div class="card" style="padding:18px">
      <h3 style="font-size:14px;font-weight:700;margin:0 0 12px;font-family:Syne,sans-serif">Recent Activity</h3>
      ${recentActs.length === 0 ? `<div style="color:#9ca3af;font-size:13px;padding:20px 0;text-align:center">No recent activity</div>` : ''}
      ${recentActs.map((act, i) => `
        <div style="display:flex;gap:8px;padding:7px 0;${i < recentActs.length - 1 ? 'border-bottom:1px solid #f9fafb' : ''};cursor:pointer"
          onclick="setState({${act._et === 'deal' ? `dealDetailId:'${act._id}'` : `leadDetailId:'${act._id}'`},page:'${act._et === 'deal' ? 'deals' : 'leads'}'})"
          onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
          <div style="width:24px;height:24px;border-radius:50%;background:${act.type === 'email' ? '#ede9fe' : act.type === 'call' ? '#dbeafe' : '#f3f4f6'};display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0">${AICON[act.type] || '📌'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${act.subject || act.text?.slice(0, 40) || act.type}</div>
            <div style="font-size:10px;color:#9ca3af">${act._title} · ${act.date}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ══ ROW 3: Active pipeline table ══ -->
  <div class="card" style="overflow:hidden">
    <div style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
      <h3 style="font-size:14px;font-weight:700;margin:0;font-family:Syne,sans-serif">
        Active Pipeline${B !== 'all' ? ' — ' + B : ' — All Branches'}
      </h3>
      <button onclick="setState({page:'deals'})" class="btn-g" style="font-size:11px">View kanban →</button>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f9fafb">
        <th class="th">Deal</th>
        <th class="th">Contact</th>
        <th class="th">Branch</th>
        <th class="th">Stage</th>
        <th class="th" style="text-align:right">Value</th>
        <th class="th">Owner</th>
        <th class="th"></th>
      </tr></thead>
      <tbody>
        ${bDeals.filter(d => !d.won && !d.lost).slice(0, 8).map(d => {
      const c = contacts.find(x => x.id === d.cid);
      const pl = PIPELINES.find(p => p.id === d.pid);
      const st = pl ? pl.stages.find(s => s.id === d.sid) : null;
      const bc = { 'VIC': '#1d4ed8', 'SA': '#059669', 'ACT': '#7c3aed' }[d.branch] || '#9ca3af';
      return `<tr style="cursor:pointer" onclick="setState({dealDetailId:'${d.id}',page:'deals'})"
            onmouseover="this.style.background='#fafafa'" onmouseout="this.style.background=''">
            <td class="td">
              <div style="font-size:13px;font-weight:600">${d.title}</div>
              <div style="font-size:11px;color:#9ca3af">${d.suburb || ''}</div>
            </td>
            <td class="td" style="font-size:12px;color:#374151">${c ? c.fn + ' ' + c.ln : '—'}</td>
            <td class="td">
              <span style="font-size:11px;font-weight:700;color:${bc};background:${bc}18;padding:2px 8px;border-radius:8px">${d.branch}</span>
            </td>
            <td class="td">${st ? `<span class="bdg" style="background:${st.col}22;color:${st.col};border:1px solid ${st.col}44;font-size:11px">${st.name}</span>` : '—'}</td>
            <td class="td" style="font-size:14px;font-weight:700;text-align:right">${fmt$(d.val)}</td>
            <td class="td" style="font-size:12px;color:#6b7280">${d.rep.split(' ')[0]}</td>
            <td class="td" onclick="event.stopPropagation()">
              <button onclick="emailFromDeal('${d.id}')" style="width:24px;height:24px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:11px" title="Email">✉️</button>
            </td>
          </tr>`;
    }).join('')}
        ${bDeals.filter(d => !d.won && !d.lost).length === 0 ? `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">No active deals${B !== 'all' ? ' in ' + B : ''}</td></tr>` : ''}
      </tbody>
    </table>
  </div>`;
}

// ── MOBILE: CONTACTS — vertical card list ─────────────────────────────────────
function renderContactsMobile() {
  var contacts = getState().contacts || [];
  var q = (cSearch || '').toLowerCase();
  var filtered = contacts.filter(function(c){
    if (q && (c.fn + ' ' + c.ln).toLowerCase().indexOf(q) < 0
        && (c.email||'').toLowerCase().indexOf(q) < 0
        && (c.phone||'').indexOf(q) < 0) return false;
    if (cBranch !== 'all' && c.branch !== cBranch) return false;
    if (cType !== 'all' && c.type !== cType) return false;
    return true;
  });
  function _esc(s) { return String(s||'').replace(/'/g, "\\'"); }
  function _attrEsc(s) { return String(s||'').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function _initials(name) { return (name || '').split(' ').map(function(w){ return (w[0] || '').toUpperCase(); }).join('').slice(0,2); }
  function contactCard(c) {
    var fullName = (c.fn || '') + ' ' + (c.ln || '');
    return '<button onclick="setState({contactDetailId:\'' + _esc(c.id) + '\',page:\'contacts\'})" style="width:100%;background:#fff;border-radius:12px;padding:12px;border:none;cursor:pointer;text-align:left;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:8px">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="width:36px;height:36px;border-radius:50%;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;flex-shrink:0">' + _initials(fullName) + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;color:#0a0a0a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + fullName.trim() + '</div>' +
          (c.co ? '<div style="font-size:11px;color:#6b7280;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.co + '</div>' : '') +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          (c.type ? '<span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#6b7280;text-transform:capitalize">' + c.type + '</span>' : '') +
          (c.branch ? '<div style="font-size:9px;color:#9ca3af;margin-top:3px;font-weight:600">' + c.branch + '</div>' : '') +
        '</div>' +
      '</div>' +
      ((c.phone || c.email) ? '<div style="display:flex;align-items:center;gap:10px;font-size:11px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:8px;margin-top:8px;overflow:hidden">' +
        (c.phone ? '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0">📞 ' + c.phone + '</span>' : '') +
        (c.email ? '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">✉ ' + c.email + '</span>' : '') +
      '</div>' : '') +
    '</button>';
  }
  return '' +
    '<div style="margin:-12px -12px 12px;background:#fff;padding:12px 16px;border-bottom:1px solid #f0f0f0">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
        '<div>' +
          '<h1 style="font-size:18px;font-weight:800;margin:0;color:#0a0a0a;font-family:Syne,sans-serif">Contacts</h1>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + filtered.length + ' of ' + contacts.length + '</div>' +
        '</div>' +
        '<button onclick="openNewContactModal()" style="padding:6px 12px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ Add</button>' +
      '</div>' +
      '<input id="contactSearchInput" value="' + _attrEsc(cSearch) + '" oninput="cSearch=this.value;renderPage()" placeholder="Search name, email, phone…" style="width:100%;padding:8px 12px;background:#f3f4f6;border:none;border-radius:8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:8px" />' +
      '<div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px">' +
        ['all','residential','commercial'].map(function(t){
          var on = cType === t;
          var label = t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1);
          return '<button onclick="cType=\'' + t + '\';renderPage()" style="flex-shrink:0;padding:5px 12px;border-radius:14px;border:1px solid ' + (on ? '#c41230' : '#e5e7eb') + ';background:' + (on ? '#c41230' : '#fff') + ';color:' + (on ? '#fff' : '#6b7280') + ';font-size:11px;font-weight:' + (on ? 700 : 600) + ';cursor:pointer;font-family:inherit;white-space:nowrap">' + label + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    (filtered.length === 0
      ? '<div style="padding:40px 20px;text-align:center;background:#fff;border-radius:12px;color:#9ca3af;font-size:13px;font-style:italic">No contacts found</div>'
      : filtered.map(contactCard).join(''));
}

function renderContacts() {
  const { contacts, panel, contactDetailId } = getState();
  if (contactDetailId) return renderContactDetail() + (getState().editingContactId ? renderEditContactDrawer() : '');
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) return renderContactsMobile();
  const filt = contacts.filter(c => {
    const q = cSearch.toLowerCase();
    const matchQ = !q || (c.fn + ' ' + c.ln).toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q);
    const matchB = cBranch === 'all' || c.branch === cBranch;
    const matchT = cType === 'all' || c.type === cType;
    return matchQ && matchB && matchT;
  });
  const srcColor = { Referral: 'green', 'Web Form': 'blue', 'Phone Call': 'purple', Facebook: 'indigo', 'Walk-in': 'amber', 'Repeat Customer': 'teal' };
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
      <div><h1 style="font-size:24px;font-weight:800;margin:0 0 2px">Contacts</h1><p style="color:#6b7280;font-size:14px;margin:0">${contacts.length} contacts</p></div>
      <button class="btn-r" onclick="openNewContactModal()">
        ${Icon({ n: 'plus', size: 15 })} New Contact
      </button>
    </div>
    <div class="card" style="padding:12px;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="position:relative;flex:1;min-width:200px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none">${Icon({ n: 'search', size: 13 })}</span>
        <input id="contactSearchInput" class="inp" value="${cSearch}" placeholder="Search name, email, phone…" style="padding-left:32px;font-size:12px;padding-top:7px;padding-bottom:7px" oninput="cSearch=this.value;renderPage()">
      </div>
      <select class="sel" style="width:150px;font-size:12px" onchange="cBranch=this.value;renderPage()">
        <option value="all" ${cBranch === 'all' ? 'selected' : ''}>All Branches</option>
        ${['VIC', 'ACT', 'SA'].map(b => `<option ${cBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
      </select>
      <select class="sel" style="width:150px;font-size:12px" onchange="cType=this.value;renderPage()">
        <option value="all" ${cType === 'all' ? 'selected' : ''}>All Types</option>
        <option value="residential" ${cType === 'residential' ? 'selected' : ''}>Residential</option>
        <option value="commercial" ${cType === 'commercial' ? 'selected' : ''}>Commercial</option>
      </select>
      <span style="font-size:12px;color:#9ca3af;align-self:center">${filt.length} results</span>
    </div>
    <div class="card" style="overflow:hidden">
      ${filt.length === 0 ? `<div style="padding:48px;text-align:center;color:#9ca3af">${Icon({ n: 'contacts', size: 40, style: 'opacity:.3;display:block;margin:0 auto 12px' })}<div style="font-size:14px">No contacts found</div></div>` : `
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th class="th">Name</th>
          <th class="th">Contact</th>
          <th class="th">Type</th>
          <th class="th">Source</th>
          <th class="th">Branch</th>
          <th class="th">Tags</th>
        </tr></thead>
        <tbody>
          ${filt.map(c => `
            <tr style="cursor:pointer" onclick="setState({contactDetailId:'${c.id}',page:'contacts'})" style="cursor:pointer">
              <td class="td">
                <div style="display:flex;align-items:center;gap:10px">
                  <div style="width:32px;height:32px;background:#c41230;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn + ' ' + c.ln)}</div>
                  <div><div style="font-size:13px;font-weight:600">${c.fn} ${c.ln}</div>${c.co ? `<div style="font-size:11px;color:#9ca3af">${c.co}</div>` : ''}</div>
                </div>
              </td>
              <td class="td"><div style="font-size:12px">${c.email}</div><div style="font-size:11px;color:#9ca3af">${c.phone}</div></td>
              <td class="td">${Badge(c.type, c.type === 'commercial' ? 'purple' : 'blue')}</td>
              <td class="td">${Badge(c.source, srcColor[c.source] || 'gray')}</td>
              <td class="td"><span style="font-size:12px;color:#6b7280">${c.branch}</span></td>
              <td class="td">${c.tags.map(t => `<span class="tag">${t}</span>`).join(' ')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`}
    </div>
    ${panel && panel.type === 'contact' ? renderContactPanel(panel.data) : ''}
    ${getState().modal && getState().modal.type === 'newContact' ? renderNewContactModal() : ''}
    ${getState().editingContactId ? renderEditContactDrawer() : ''}`;
}

function openContactPanel(cid) {
  const c = getState().contacts.find(x => x.id === cid);
  if (c) setState({ panel: { type: 'contact', data: c } });
}
function openNewContactModal() { setState({ modal: { type: 'newContact', data: { fn: '', ln: '', email: '', phone: '', suburb: '', type: 'residential', source: 'Web Form', branch: 'VIC' } } }); }

let cSearch = '', cBranch = 'all', cType = 'all';

function renderContactPanel(c) {
  return `<div class="ovl" onclick="if(event.target===this)setState({panel:null})">
    <div class="panel" style="width:480px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <div style="width:40px;height:40px;background:#c41230;border-radius:50%;color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">${avatar(c.fn + ' ' + c.ln)}</div>
            <div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:16px">${c.fn} ${c.ln}</div>${c.co ? `<div style="font-size:12px;color:#6b7280">${c.co}</div>` : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${Badge(c.type, c.type === 'commercial' ? 'purple' : 'blue')} ${Badge(c.branch, 'gray')} ${c.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        </div>
        <button onclick="setState({panel:null})" style="background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;color:#9ca3af" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
          ${[['Email', c.email], ['Phone', c.phone], ['Suburb', c.suburb], ['State', c.state], ['Source', c.source], ['Rep', c.rep], ['Branch', c.branch]].map(([l, v]) => `
            <div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:2px">${l}</div><div style="font-size:13px;font-weight:500">${v || '—'}</div></div>`).join('')}
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:12px">Deals</div>
          ${getState().deals.filter(d => d.cid === c.id).map(d => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px;background:#f9fafb;border-radius:10px;margin-bottom:8px">
              <div><div style="font-size:13px;font-weight:500">${d.title}</div><div style="font-size:11px;color:#9ca3af">${d.suburb}</div></div>
              <span style="font-size:14px;font-weight:700">${fmt$(d.val)}</span>
            </div>`).join('') || '<div style="font-size:13px;color:#9ca3af">No deals yet</div>'}
        </div>
      </div>
    </div>
  </div>`;
}

function renderNewContactModal() {
  const d = getState().modal.data;
  return `<div class="modal-bg" onclick="if(event.target===this)setState({modal:null})">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">New Contact</h3>
        <button onclick="setState({modal:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div class="modal-body" style="padding:24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">First Name *</label>
            <input class="inp" id="nc_fn" placeholder="Jane"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Last Name *</label>
            <input class="inp" id="nc_ln" placeholder="Smith"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Email</label>
          <input class="inp" id="nc_email" placeholder="jane@email.com"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Phone</label>
            <input class="inp" id="nc_phone" placeholder="0412 345 678"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Company</label>
            <input class="inp" id="nc_co" placeholder="Superb Developments"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address</label>
          <input class="inp" id="nc_street" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="nc_suburb" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="nc_state">${['VIC', 'NSW', 'QLD', 'SA', 'WA', 'ACT', 'TAS', 'NT'].map(s => `<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="nc_postcode" placeholder="3121"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Type</label>
            <select class="sel" id="nc_type"><option value="residential">Residential</option><option value="commercial">Commercial</option></select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Source</label>
            <select class="sel" id="nc_source">${['Web Form', 'Phone Call', 'Referral', 'Facebook', 'Walk-in', 'Repeat Customer'].map(s => `<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="nc_branch">${['VIC', 'ACT', 'SA'].map(b => `<option>${b}</option>`).join('')}</select></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="setState({modal:null})">Cancel</button>
        <button class="btn-r" onclick="saveNewContact()">Create Contact</button>
      </div>
    </div>
  </div>`;
}

// ── Edit Contact drawer ───────────────────────────────────────────────────
// Same pattern as Edit Lead: owner/admin only, single audit activity per save
// with a structured diff. Contact "owner" = contact.rep.

function openContactEditDrawer(contactId) {
  var c = getState().contacts.find(function (x) { return x.id === contactId; });
  if (!c) return;
  if (!canEditContact(c)) { addToast('Only the rep or an admin can edit this contact', 'error'); return; }
  setState({ editingContactId: contactId });
}

function renderEditContactDrawer() {
  var id = getState().editingContactId;
  var c = getState().contacts.find(function (x) { return x.id === id; });
  if (!c) return '';
  var esc = function (v) { return (v == null ? '' : String(v)).replace(/"/g, '&quot;'); };
  var escText = function (v) { return (v == null ? '' : String(v)).replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  return `<div class="modal-bg" onclick="if(event.target===this)setState({editingContactId:null})">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">Edit Contact</h3>
        <button onclick="setState({editingContactId:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div style="padding:24px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">First Name *</label>
            <input class="inp" id="ce_fn" value="${esc(c.fn)}" placeholder="Jane"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Last Name *</label>
            <input class="inp" id="ce_ln" value="${esc(c.ln)}" placeholder="Smith"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Email</label>
          <input class="inp" id="ce_email" value="${esc(c.email)}" placeholder="jane@email.com">
          <div id="ce_email_err" style="font-size:11px;color:#b91c1c;margin-top:3px;display:none"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Phone</label>
            <input class="inp" id="ce_phone" value="${esc(c.phone)}" placeholder="0412 345 678">
            <div id="ce_phone_err" style="font-size:11px;color:#b91c1c;margin-top:3px;display:none"></div>
          </div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Company</label>
            <input class="inp" id="ce_co" value="${esc(c.co)}" placeholder="Superb Developments"></div>
        </div>
        <div style="margin-bottom:12px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address</label>
          <input class="inp" id="ce_street" value="${esc(c.street)}" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="ce_suburb" value="${esc(c.suburb)}" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="ce_state">${['VIC', 'NSW', 'QLD', 'SA', 'WA', 'ACT', 'TAS', 'NT'].map(function (s) { return '<option' + (c.state === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="ce_postcode" value="${esc(c.postcode)}" placeholder="3121"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Type</label>
            <select class="sel" id="ce_type"><option value="residential"${c.type === 'residential' ? ' selected' : ''}>Residential</option><option value="commercial"${c.type === 'commercial' ? ' selected' : ''}>Commercial</option></select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Source</label>
            <select class="sel" id="ce_source">${['Web Form', 'Phone Call', 'Referral', 'Facebook', 'Walk-in', 'Repeat Customer'].map(function (s) { return '<option' + (c.source === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="ce_branch">${['VIC', 'ACT', 'SA'].map(function (b) { return '<option' + (c.branch === b ? ' selected' : '') + '>' + b + '</option>'; }).join('')}</select></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="setState({editingContactId:null})">Cancel</button>
        <button class="btn-r" onclick="saveContactEdit()">Save Changes</button>
      </div>
    </div>
  </div>`;
}

function saveContactEdit() {
  var id = getState().editingContactId;
  var c = getState().contacts.find(function (x) { return x.id === id; });
  if (!c) return;
  if (!canEditContact(c)) { addToast('Only the rep or an admin can edit this contact', 'error'); return; }

  var fn = (document.getElementById('ce_fn').value || '').trim();
  var ln = (document.getElementById('ce_ln').value || '').trim();
  if (!fn || !ln) { addToast('First and last name are required', 'error'); return; }

  var emailV = validateEmail(document.getElementById('ce_email').value);
  var phoneV = validateAuPhone(document.getElementById('ce_phone').value);
  var emailErr = document.getElementById('ce_email_err');
  var phoneErr = document.getElementById('ce_phone_err');
  emailErr.style.display = emailV.ok ? 'none' : 'block';
  emailErr.textContent = emailV.error;
  phoneErr.style.display = phoneV.ok ? 'none' : 'block';
  phoneErr.textContent = phoneV.error;
  if (!emailV.ok || !phoneV.ok) { addToast('Please fix the highlighted fields', 'error'); return; }

  var next = {
    fn: fn, ln: ln,
    email: emailV.normalized,
    phone: phoneV.normalized,
    co: (document.getElementById('ce_co').value || '').trim(),
    street: (document.getElementById('ce_street').value || '').trim(),
    suburb: (document.getElementById('ce_suburb').value || '').trim(),
    state: document.getElementById('ce_state').value,
    postcode: (document.getElementById('ce_postcode').value || '').trim(),
    type: document.getElementById('ce_type').value,
    source: document.getElementById('ce_source').value,
    branch: document.getElementById('ce_branch').value,
  };

  var FIELD_LABELS = {
    fn: 'First name', ln: 'Last name', email: 'Email', phone: 'Phone',
    co: 'Company', street: 'Street', suburb: 'Suburb', state: 'State', postcode: 'Postcode',
    type: 'Type', source: 'Source', branch: 'Branch'
  };
  var changes = [];
  Object.keys(next).forEach(function (k) {
    var oldStr = (c[k] == null ? '' : String(c[k]));
    var newStr = (next[k] == null ? '' : String(next[k]));
    if (oldStr !== newStr) changes.push({ field: k, label: FIELD_LABELS[k] || k, from: oldStr, to: newStr });
  });

  if (changes.length === 0) { addToast('No changes to save', 'info'); setState({ editingContactId: null }); return; }

  var user = getCurrentUser() || { name: 'Unknown' };
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'edit',
    subject: user.name + ' edited ' + changes.length + ' field' + (changes.length !== 1 ? 's' : ''),
    text: changes.map(function (x) { return x.label + ': "' + x.from + '" → "' + x.to + '"'; }).join('\n'),
    by: user.name,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    done: false,
    changes: changes,
  };

  // Contacts store their activities in the top-level `contactActivities` map.
  var ca = Object.assign({}, getState().contactActivities || {});
  ca[id] = [actObj].concat(ca[id] || []);
  var updated = Object.assign({}, c, next);
  setState({
    contacts: getState().contacts.map(function (x) { return x.id === id ? updated : x; }),
    contactActivities: ca,
    editingContactId: null,
  });
  try { dbInsert('activities', actToDb(actObj, 'contact', id)); } catch (e) { }

  // Audit (Brief 2 Phase 2). Group all field changes into a single entry.
  if (typeof appendAuditEntry === 'function') {
    var beforeObj = {}; var afterObj = {};
    changes.forEach(function (ch) { beforeObj[ch.field] = ch.from; afterObj[ch.field] = ch.to; });
    appendAuditEntry({
      entityType: 'contact', entityId: id, action: 'contact.field_edited',
      summary: 'Edited ' + (c.fn||'') + ' ' + (c.ln||'') + ' — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : ''),
      before: beforeObj, after: afterObj,
      branch: updated.branch || null,
    });
  }

  addToast('Saved — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : '') + ' updated', 'success');
}

// ── Edit Deal drawer ────────────────────────────────────────────────────────
// Same owner/admin gate + single-audit-activity-per-save pattern as the
// Lead + Contact edit drawers. Doesn't touch quotes, pipeline/stage, or
// won/lost state — those have their own dedicated flows.

function openDealEditDrawer(dealId) {
  var d = getState().deals.find(function (x) { return x.id === dealId; });
  if (!d) return;
  if (!canEditDeal(d)) { addToast('Only the deal owner or an admin can edit this deal', 'error'); return; }
  setState({ editingDealId: dealId });
}

function renderEditDealDrawer() {
  var id = getState().editingDealId;
  var d = getState().deals.find(function (x) { return x.id === id; });
  if (!d) return '';
  var esc = function (v) { return (v == null ? '' : String(v)).replace(/"/g, '&quot;'); };
  var escText = function (v) { return (v == null ? '' : String(v)).replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  return `<div class="ovl" onclick="if(event.target===this)setState({editingDealId:null})">
    <div class="panel" style="width:440px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h2 style="font-family:Syne,sans-serif;font-weight:700;font-size:16px;margin:0">Edit Deal</h2>
        <button onclick="setState({editingDealId:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:13px">
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Deal Title *</label>
          <input class="inp" id="de_title" value="${esc(d.title)}" placeholder="Smith — Richmond"></div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Value ($)</label>
          <input class="inp" id="de_val" type="number" min="0" step="any" value="${d.val || 0}" placeholder="15000">
          <div id="de_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Owner</label>
            <select class="sel" id="de_rep">${getUsers().filter(function (u) { return u.active && u.role !== 'viewer'; }).map(function (o) { return '<option' + (d.rep === o.name ? ' selected' : '') + '>' + o.name + '</option>'; }).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="de_branch">${['VIC', 'ACT', 'SA'].map(function (b) { return '<option' + (d.branch === b ? ' selected' : '') + '>' + b + '</option>'; }).join('')}</select></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address <span style="font-size:10px;color:#9ca3af;font-weight:400">(type to search)</span></label>
          <input class="inp" id="de_street" value="${esc(d.street)}" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="de_suburb" value="${esc(d.suburb)}" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="de_state">${['VIC', 'NSW', 'QLD', 'SA', 'WA', 'ACT', 'TAS', 'NT'].map(function (s) { return '<option' + (d.state === s ? ' selected' : '') + '>' + s + '</option>'; }).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="de_postcode" value="${esc(d.postcode)}" placeholder="3121"></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Expected close date</label>
          <input class="inp" id="de_closeDate" type="date" value="${esc(d.closeDate || '')}"></div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;display:flex;justify-content:flex-end;gap:10px;flex-shrink:0">
        <button class="btn-w" onclick="setState({editingDealId:null})">Cancel</button>
        <button class="btn-r" onclick="saveDealEdit()">Save Changes</button>
      </div>
    </div>
  </div>`;
}

function saveDealEdit() {
  var id = getState().editingDealId;
  var d = getState().deals.find(function (x) { return x.id === id; });
  if (!d) return;
  if (!canEditDeal(d)) { addToast('Only the deal owner or an admin can edit this deal', 'error'); return; }

  var title = (document.getElementById('de_title').value || '').trim();
  if (!title) { addToast('Deal title is required', 'error'); return; }
  var street = (document.getElementById('de_street').value || '').trim();
  var suburb = (document.getElementById('de_suburb').value || '').trim();
  if (!street || !suburb) {
    addToast('Street and suburb are required so the deal can be scheduled on the map', 'error');
    return;
  }

  var valEl = document.getElementById('de_val');
  var valErr = document.getElementById('de_val_err');
  var valV = validateDealValue(valEl.value);
  if (valErr) { valErr.style.display = valV.ok ? 'none' : 'block'; valErr.textContent = valV.error; }
  if (!valV.ok) { addToast(valV.error, 'error'); return; }

  var next = {
    title: title,
    val: valV.normalized,
    rep: document.getElementById('de_rep').value,
    branch: document.getElementById('de_branch').value,
    street: street,
    suburb: suburb,
    state: document.getElementById('de_state').value,
    postcode: (document.getElementById('de_postcode').value || '').trim(),
    closeDate: (document.getElementById('de_closeDate').value || '').trim(),
  };

  var FIELD_LABELS = {
    title: 'Title', val: 'Value', rep: 'Owner', branch: 'Branch',
    street: 'Street', suburb: 'Suburb', state: 'State', postcode: 'Postcode', closeDate: 'Close date'
  };
  var changes = [];
  Object.keys(next).forEach(function (k) {
    var oldStr = (d[k] == null ? '' : String(d[k]));
    var newStr = (next[k] == null ? '' : String(next[k]));
    if (oldStr !== newStr) changes.push({ field: k, label: FIELD_LABELS[k] || k, from: oldStr, to: newStr });
  });

  if (changes.length === 0) { addToast('No changes to save', 'info'); setState({ editingDealId: null }); return; }

  var user = getCurrentUser() || { name: 'Unknown' };
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'edit',
    subject: user.name + ' edited ' + changes.length + ' field' + (changes.length !== 1 ? 's' : ''),
    text: changes.map(function (x) { return x.label + ': "' + x.from + '" → "' + x.to + '"'; }).join('\n'),
    by: user.name,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    done: false,
    changes: changes,
  };

  var updated = Object.assign({}, d, next);
  updated.activities = [actObj].concat(d.activities || []);
  setState({
    deals: getState().deals.map(function (x) { return x.id === id ? updated : x; }),
    editingDealId: null,
  });
  try { dbInsert('activities', actToDb(actObj, 'deal', id)); } catch (e) { }

  // Audit (Brief 2 Phase 2 followup, exposed by the saveDealEdit dedupe).
  // The audit hook used to live on the kanban-quick-edit version of
  // saveDealEdit, which was running for both call sites because of the
  // duplicate-declaration bug. After the dedupe (`saveDealKanbanQuickEdit`
  // is its own function now), the drawer save needs its own hook so
  // edits made through the deal-detail Edit drawer are audited too.
  // metadata.source distinguishes drawer edits from kanban-quick-edits.
  if (typeof appendAuditEntry === 'function') {
    var beforeObj = {}; var afterObj = {};
    changes.forEach(function (ch) { beforeObj[ch.field] = ch.from; afterObj[ch.field] = ch.to; });
    appendAuditEntry({
      entityType: 'deal', entityId: id, action: 'deal.field_edited',
      summary: 'Edited "' + title + '" — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : ''),
      before: beforeObj, after: afterObj,
      metadata: { source: 'edit-drawer' },
      branch: updated.branch || null,
    });
  }

  addToast('Saved — ' + changes.length + ' field' + (changes.length !== 1 ? 's' : '') + ' updated', 'success');
}

function saveNewContact() {
  const fn = document.getElementById('nc_fn').value.trim();
  const ln = document.getElementById('nc_ln').value.trim();
  if (!fn || !ln) { addToast('First and last name are required', 'error'); return; }
  const nc = { id: 'c' + Date.now(), fn, ln, co: document.getElementById('nc_co').value.trim(), email: document.getElementById('nc_email').value, phone: document.getElementById('nc_phone').value, street: document.getElementById('nc_street').value.trim(), suburb: document.getElementById('nc_suburb').value.trim(), state: document.getElementById('nc_state').value, postcode: document.getElementById('nc_postcode').value.trim(), type: document.getElementById('nc_type').value, source: document.getElementById('nc_source').value, branch: document.getElementById('nc_branch').value, rep: (getCurrentUser() || { name: 'Admin' }).name, tags: ['new'] };
  setState({ contacts: [nc, ...getState().contacts], modal: null });
  dbInsert('contacts', contactToDb(nc));
  addToast(`${fn} ${ln} created`, 'success');
}

// ── DEALS ─────────────────────────────────────────────────────────────────────
let dPipeline = 'p1', dragDeal = null, dragOverStage = null;
let kanbanEditModal = null;

// ── DEAL KANBAN FILTER STATE ──────────────────────────────────────────────────
let kFilterOwners = [], kFilterStages = [], kFilterSource = [], kFilterValMin = '', kFilterValMax = '', kFilterOpen = false;

// Mobile wrapper: which stage is currently visible in the vertical deal list.
// Null = falls back to the first stage at render time.
let _mobileDealStageId = null;


// ── Kanban edit functions ─────────────────────────────────────────────────────
function openStageEdit(stageId) {
  const pl = PIPELINES.find(p => p.id === dPipeline);
  const st = pl ? pl.stages.find(s => s.id === stageId) : null;
  if (!st) return;
  kanbanEditModal = { type: 'stage', data: { ...st, pid: dPipeline } };
  renderPage();
}
function openNewStageModal() {
  kanbanEditModal = { type: 'newStage', data: { name: '', prob: 50, col: '#94a3b8', pid: dPipeline } };
  renderPage();
}
function openDealEdit(dealId) {
  const d = getState().deals.find(x => x.id === dealId);
  if (!d) return;
  kanbanEditModal = { type: 'deal', data: { ...d } };
  renderPage();
}
function closeKanbanModal() { kanbanEditModal = null; renderPage(); }

function saveStageEdit() {
  const d = kanbanEditModal.data;
  const name = document.getElementById('ke_name')?.value.trim();
  const prob = parseInt(document.getElementById('ke_prob')?.value || '50');
  const col = document.getElementById('ke_col')?.value || '#94a3b8';
  if (!name) { addToast('Stage name required', 'error'); return; }
  PIPELINES.forEach(pl => {
    if (pl.id !== d.pid) return;
    pl.stages = pl.stages.map(s => s.id === d.id ? { ...s, name, prob, col } : s);
  });
  kanbanEditModal = null;
  addToast('Stage updated', 'success');
  renderPage();
}
function saveNewStage() {
  const name = document.getElementById('ke_name')?.value.trim();
  const prob = parseInt(document.getElementById('ke_prob')?.value || '50');
  const col = document.getElementById('ke_col')?.value || '#94a3b8';
  if (!name) { addToast('Stage name required', 'error'); return; }
  const newId = 's' + Date.now();
  const pl = PIPELINES.find(p => p.id === dPipeline);
  if (!pl) return;
  const mid = pl.stages.filter(s => !s.isWon && !s.isLost);
  const won = pl.stages.filter(s => s.isWon);
  const lost = pl.stages.filter(s => s.isLost);
  mid.push({ id: newId, name, prob, col, ord: mid.length + 1 });
  pl.stages = [...mid.map((s, i) => ({ ...s, ord: i + 1 })), ...won, ...lost];
  kanbanEditModal = null;
  addToast('"' + name + '" stage added', 'success');
  renderPage();
}
function deleteStage(stageId) {
  const pl = PIPELINES.find(p => p.id === dPipeline);
  if (!pl) return;
  const count = getState().deals.filter(d => d.sid === stageId).length;
  if (count > 0) { addToast('Move ' + count + ' deal(s) out first', 'error'); return; }
  pl.stages = pl.stages.filter(s => s.id !== stageId);
  kanbanEditModal = null;
  addToast('Stage deleted', 'warning');
  renderPage();
}
function moveStage(stageId, dir) {
  const pl = PIPELINES.find(p => p.id === dPipeline);
  if (!pl) return;
  const mid = pl.stages.filter(s => !s.isWon && !s.isLost);
  const idx = mid.findIndex(s => s.id === stageId);
  if (idx < 0) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= mid.length) return;
  [mid[idx], mid[ni]] = [mid[ni], mid[idx]];
  pl.stages = [...mid.map((s, i) => ({ ...s, ord: i + 1 })), ...pl.stages.filter(s => s.isWon), ...pl.stages.filter(s => s.isLost)];
  renderPage();
}
// Kanban quick-edit save. Distinct from the full Edit Deal drawer's
// saveDealEdit() (~line 785), which uses getState().editingDealId and a
// different DOM (de_closeDate vs de_close, no de_stage). Renamed in the
// dedupe pass — both functions previously shared the saveDealEdit name,
// and "last function declaration wins" in browsers meant the kanban
// version was running for BOTH callers, breaking the drawer save flow
// (kanbanEditModal would be null when arriving from deal detail).
function saveDealKanbanQuickEdit() {
  const d = kanbanEditModal.data;
  const title = document.getElementById('de_title')?.value.trim();
  const valEl = document.getElementById('de_val');
  const valErr = document.getElementById('de_val_err');
  const valV = validateDealValue(valEl ? valEl.value : '');
  if (valErr) { valErr.style.display = valV.ok ? 'none' : 'block'; valErr.textContent = valV.error; }
  if (!valV.ok) { addToast(valV.error, 'error'); return; }
  const val = valV.normalized;
  const sid = document.getElementById('de_stage')?.value;
  const rep = document.getElementById('de_rep')?.value;
  const street = document.getElementById('de_street')?.value.trim() || '';
  const suburb = document.getElementById('de_suburb')?.value.trim();
  const state = document.getElementById('de_state')?.value || '';
  const postcode = document.getElementById('de_postcode')?.value.trim() || '';
  const closeDate = document.getElementById('de_close')?.value;
  if (!title) { addToast('Title required', 'error'); return; }
  // Snapshot before-state for audit. Capture only the fields the form can edit.
  var beforeState = { title:d.title, val:d.val, sid:d.sid, rep:d.rep, street:d.street, suburb:d.suburb, state:d.state, postcode:d.postcode, closeDate:d.closeDate };
  setState({
    deals: getState().deals.map(deal =>
      deal.id === d.id ? {
        ...deal, title, val: val, sid: sid || deal.sid,
        rep: rep || deal.rep, street: street, suburb: suburb || deal.suburb, state: state || deal.state, postcode: postcode, closeDate: closeDate || deal.closeDate
      } : deal
    )
  });
  dbUpdate('deals', d.id, { title: title, val: val, sid: sid || d.sid, rep: rep || d.rep, street: street, suburb: suburb || d.suburb, postcode: postcode, close_date: closeDate || d.closeDate || null });
  // Audit the edit. Stage changes flow through moveDealToStage, so the sid
  // delta here is rare (the dropdown does include stage, so it's possible)
  // but it'll show up in the before/after.
  if (typeof appendAuditEntry === 'function') {
    var afterState = { title:title, val:val, sid:sid||d.sid, rep:rep||d.rep, street:street, suburb:suburb||d.suburb, state:state||d.state, postcode:postcode, closeDate:closeDate||d.closeDate };
    var changedFields = Object.keys(afterState).filter(function(k){ return String(beforeState[k]||'') !== String(afterState[k]||''); });
    if (changedFields.length > 0) {
      appendAuditEntry({
        entityType:'deal', entityId:d.id, action:'deal.field_edited',
        summary:'Edited "' + title + '" — ' + changedFields.length + ' field' + (changedFields.length!==1?'s':''),
        before:beforeState, after:afterState,
        metadata:{ source:'kanban-quick-edit' },
        branch:d.branch||null,
      });
    }
  }
  kanbanEditModal = null;
  addToast('Deal updated', 'success');
  renderPage();
}

// ── Kanban modal renderer ─────────────────────────────────────────────────────
function renderKanbanModal() {
  if (!kanbanEditModal) return '';
  const { type, data } = kanbanEditModal;
  const COLS = ['#94a3b8', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6',
    '#fb923c', '#facc15', '#4ade80', '#34d399', '#22d3ee',
    '#c41230', '#ef4444', '#f59e0b', '#22c55e'];

  if (type === 'stage' || type === 'newStage') {
    const isNew = type === 'newStage';
    return `<div class="modal-bg" onclick="if(event.target===this)closeKanbanModal()">
      <div class="modal" style="max-width:400px">
        <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">${isNew ? 'Add Stage' : 'Edit Stage'}</h3>
          <button onclick="closeKanbanModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>
        </div>
        <div style="padding:20px;display:flex;flex-direction:column;gap:16px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Stage Name *</label>
            <input id="ke_name" class="inp" value="${isNew ? '' : data.name}" placeholder="e.g. Site Survey" style="font-size:14px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">
              Win Probability: <span id="ke_prob_label">${data.prob}%</span>
            </label>
            <input type="range" id="ke_prob" min="0" max="100" value="${data.prob}"
              oninput="document.getElementById('ke_prob_label').textContent=this.value+'%'"
              style="width:100%;accent-color:#c41230">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:8px">Colour</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              ${COLS.map(c => `<button onclick="document.getElementById('ke_col').value='${c}';this.parentElement.querySelectorAll('button').forEach(b=>b.style.outline='none');this.style.outline='3px solid #1a1a1a'"
                style="width:28px;height:28px;border-radius:50%;background:${c};border:none;cursor:pointer;outline:${data.col === c ? '3px solid #1a1a1a' : 'none'};outline-offset:2px"></button>`).join('')}
              <input type="color" id="ke_col" value="${data.col}" style="width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none">
            </div>
          </div>
          ${!isNew ? `
          <div style="display:flex;gap:8px">
            <button onclick="moveStage('${data.id}',-1)" class="btn-w" style="font-size:12px;flex:1">↑ Earlier</button>
            <button onclick="moveStage('${data.id}',1)"  class="btn-w" style="font-size:12px;flex:1">↓ Later</button>
          </div>
          <div style="border-top:1px dashed #fee2e2;padding-top:12px">
            <button onclick="deleteStage('${data.id}')" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Delete stage…</button>
          </div>`: ''}
        </div>
        <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:8px">
          <button onclick="closeKanbanModal()" class="btn-w">Cancel</button>
          <button onclick="${isNew ? 'saveNewStage()' : 'saveStageEdit()'}'" class="btn-r">${isNew ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </div>`;
  }

  if (type === 'deal') {
    const pl = PIPELINES.find(p => p.id === dPipeline);
    const allStages = pl ? pl.stages.filter(s => !s.isLost) : [];
    const c = getState().contacts.find(x => x.id === data.cid);
    const REPS = ['James Wilson', 'Sarah Chen', 'Emma Brown', 'Michael Torres', 'David Kim'];
    return `<div class="modal-bg" onclick="if(event.target===this)closeKanbanModal()">
      <div class="modal" style="max-width:460px">
        <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">Edit Deal</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="setState({dealDetailId:'${data.id}'});closeKanbanModal()" class="btn-w" style="font-size:12px">Full view →</button>
            <button onclick="closeKanbanModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px">×</button>
          </div>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Title *</label>
            <input id="de_title" class="inp" value="${data.title}" style="font-size:14px;font-weight:500">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Value ($)</label>
              <input id="de_val" type="number" min="0" step="any" class="inp" value="${data.val}">
              <div id="de_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Stage</label>
              <select id="de_stage" class="sel">
                ${allStages.map(s => `<option value="${s.id}" ${data.sid === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Owner</label>
              <select id="de_rep" class="sel">
                ${REPS.map(r => `<option value="${r}" ${data.rep === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Close Date</label>
              <input id="de_close" type="date" class="inp" value="${data.closeDate || ''}">
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Street Address</label>
            <input id="de_street" class="inp" value="${data.street || ''}" placeholder="Start typing address…" autocomplete="off">
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Suburb</label>
              <input id="de_suburb" class="inp" value="${data.suburb || ''}" placeholder="e.g. Richmond">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">State</label>
              <select id="de_state" class="sel">${['VIC', 'NSW', 'QLD', 'SA', 'WA', 'ACT', 'TAS', 'NT'].map(s => `<option ${data.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Postcode</label>
              <input id="de_postcode" class="inp" value="${data.postcode || ''}" placeholder="3121">
            </div>
          </div>
          ${c ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
            <div style="width:30px;height:30px;background:#c41230;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${avatar(c.fn + ' ' + c.ln)}</div>
            <div><div style="font-size:13px;font-weight:600">${c.fn} ${c.ln}</div><div style="font-size:11px;color:#6b7280">${c.email || ''}</div></div>
            <button onclick="event.stopPropagation();emailFromDeal('${data.id}')" style="margin-left:auto;padding:5px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-family:inherit">✉️ Email</button>
          </div>`: ''}
          <div style="display:flex;gap:8px;padding-top:6px;border-top:1px solid #f0f0f0">
            <button onclick="markDealWon('${data.id}');closeKanbanModal()" style="flex:1;padding:9px;border:1px solid #86efac;background:#f0fdf4;color:#15803d;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600">✓ Won</button>
            <button onclick="markDealLost('${data.id}');closeKanbanModal()" style="flex:1;padding:9px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600">✗ Lost</button>
          </div>
        </div>
        <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:space-between">
          <button onclick="if(confirm('Delete this deal?')){dbDelete('deals','${data.id}');setState({deals:getState().deals.filter(d=>d.id!=='${data.id}')});closeKanbanModal();addToast('Deal deleted','warning')}" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Delete</button>
          <div style="display:flex;gap:8px">
            <button onclick="closeKanbanModal()" class="btn-w">Cancel</button>
            <button onclick="saveDealKanbanQuickEdit()" class="btn-r">Save</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  return '';
}



// ── Drag-drop DOM helpers (NO renderPage — manipulate DOM directly) ──────────
function highlightCol(stageId) {
  // Only update if this is a new column
  if (dragOverStage === stageId) return;
  if (dragOverStage) unhighlightCol(dragOverStage);
  dragOverStage = stageId;
  const el = document.getElementById('col_' + stageId);
  if (el) {
    el.style.background = '#eff6ff';
    el.style.borderColor = '#3b82f6';
    el.style.borderStyle = 'dashed';
  }
}
function unhighlightCol(stageId) {
  dragOverStage = null;
  const el = document.getElementById('col_' + stageId);
  if (el) {
    el.style.background = '#f8f9fa';
    el.style.borderColor = 'transparent';
    el.style.borderStyle = 'solid';
  }
}
function unhighlightAllCols() {
  dragOverStage = null;
  try {
    document.querySelectorAll('[id^="col_"]').forEach(el => {
      if (el && el.style) {
        el.style.background = '#f8f9fa';
        el.style.borderColor = 'transparent';
        el.style.borderStyle = 'solid';
      }
    });
  } catch (e) { }
}


// ── MOBILE: DEALS — swipeable column layout ───────────────────────────────────
// Pipeline switcher → filter chip + collapsible panel → stage tab strip →
// full-width swipeable columns (CSS scroll-snap). Tabs and scroll position
// stay in sync via _onDealsKanbanScroll (called on native scroll events) and
// _restoreDealsKanbanScroll (called from renderPage after each innerHTML
// write so scroll position survives state-driven re-renders).
function renderDealsMobile() {
  var st = getState();
  var deals = st.deals || [];
  var contacts = st.contacts || [];
  var pl = (typeof PIPELINES !== 'undefined' ? PIPELINES : []).find(function(p){ return p.id === dPipeline; });
  if (!pl) pl = (typeof PIPELINES !== 'undefined' && PIPELINES[0]) || null;
  if (!pl) return '<div style="padding:40px;text-align:center;color:#9ca3af">No pipeline configured</div>';
  var stages = pl.stages.slice().sort(function(a,b){ return a.ord - b.ord; });
  var pDeals = deals.filter(function(d){ return d.pid === dPipeline; });

  // Apply filters (same shape as desktop's `matchesFilter`).
  function matches(d) {
    if (kFilterOwners.length > 0 && kFilterOwners.indexOf(d.rep) < 0) return false;
    if (kFilterValMin !== '' && d.val < parseFloat(kFilterValMin)) return false;
    if (kFilterValMax !== '' && d.val > parseFloat(kFilterValMax)) return false;
    if (kFilterSource.length > 0) {
      var c = contacts.find(function(x){ return x.id === d.cid; });
      if (!c || kFilterSource.indexOf(c.source) < 0) return false;
    }
    return true;
  }
  var filteredDeals = pDeals.filter(matches);

  var byStage = {};
  stages.forEach(function(s){ byStage[s.id] = []; });
  filteredDeals.forEach(function(d){ if (byStage[d.sid]) byStage[d.sid].push(d); });

  // Each column sorted: stale first, then by value desc.
  Object.keys(byStage).forEach(function(k){
    byStage[k].sort(function(a, b){
      var sA = (a.age || 0) > 7 ? 1 : 0;
      var sB = (b.age || 0) > 7 ? 1 : 0;
      if (sA !== sB) return sB - sA;
      return (b.val || 0) - (a.val || 0);
    });
  });

  // Default selection: first stage with deals, or first stage if all empty.
  var sel = _mobileDealStageId;
  if (!sel || !byStage[sel]) {
    var firstWithDeals = stages.find(function(s){ return (byStage[s.id]||[]).length > 0; });
    sel = (firstWithDeals || stages[0]).id;
    _mobileDealStageId = sel;
  }

  var allOwners = Array.from(new Set(deals.map(function(d){ return d.rep; }).filter(Boolean))).sort();
  var totalOpen = filteredDeals.filter(function(d){ return !d.won && !d.lost; });
  var totalVal = totalOpen.reduce(function(s,d){ return s + (d.val||0); }, 0);
  var activeFilters = kFilterOwners.length + (kFilterValMin?1:0) + (kFilterValMax?1:0);
  var cu = getCurrentUser();
  var isManager = cu && (cu.role === 'admin' || cu.role === 'sales_manager' || cu.role === 'accounts');

  function fmtK(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v/1000) + 'k';
    return '$' + v.toFixed(0);
  }
  function _esc(s) { return String(s||'').replace(/'/g, "\\'"); }
  function _initials(name) {
    return (name || '').split(' ').map(function(w){ return (w[0] || '').toUpperCase(); }).join('').slice(0,2);
  }

  // Card renderer — top row: name+address / value+quotes; chip row (Phase 3
  // next-activity chip + Phase 8 inline call/SMS); bottom row: rep avatar,
  // activity dot, source, stale clock. Red outline when very stale.
  // Wrapped in <div> rather than <button> so the inline action icons can stop
  // event propagation cleanly (a button-inside-button is invalid HTML).
  function dealCard(d, stage) {
    var c = contacts.find(function(x){ return x.id === d.cid; });
    var name = c ? (c.fn + ' ' + c.ln) : (d.title || 'Untitled');
    var stale = (d.age || 0) > 7;
    var veryStale = (d.age || 0) > 14;
    var quoteCount = (d.quotes || []).length;
    var hasRecentAct = (d.activities || []).some(function(a){
      if (!a || !a.date) return false;
      try { return (Date.now() - new Date(a.date).getTime()) < 48 * 3600 * 1000; }
      catch(e) { return false; }
    });
    var contactName = c ? ((c.fn || '') + ' ' + (c.ln || '')).trim() : (d.title || '');
    var phone = (c && c.phone) || d.phone || '';
    return '<div onclick="setState({dealDetailId:\'' + _esc(d.id) + '\'})" style="background:#fff;border-radius:12px;padding:12px;cursor:pointer;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:8px;border-left:3px solid ' + stage.col + ';' + (veryStale ? 'outline:1px solid #fca5a5;outline-offset:-1px;' : '') + '">' +
      // Top row
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;color:#0a0a0a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</div>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:2px;display:flex;align-items:center;gap:4px;overflow:hidden">' +
            '\u{1f4cd}' +
            (d.postcode ? ' <span style="font-weight:700">' + d.postcode + '</span>' : '') +
            ' <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (d.suburb || '—') + '</span>' +
          '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          '<div style="font-size:14px;font-weight:800;font-family:Syne,sans-serif;color:#0a0a0a">' + fmtK(d.val) + '</div>' +
          (quoteCount > 0 ? '<div style="font-size:10px;color:#6b7280;margin-top:1px">' + quoteCount + ' quote' + (quoteCount===1?'':'s') + '</div>' : '') +
        '</div>' +
      '</div>' +
      // Chip + inline actions row (Phase 3 + Phase 8). flex-wrap so a long
      // chip + action icons still fit on a 320px screen.
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">' +
        renderNextActivityChip(d, 'deal', { size: 'sm' }) +
        '<div style="flex:1"></div>' +
        _renderInlineRowActions(phone, d.id, 'deal', contactName) +
      '</div>' +
      // Bottom row
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding-top:8px;border-top:1px solid #f3f4f6">' +
        '<div style="display:flex;align-items:center;gap:6px;min-width:0">' +
          (d.rep ? '<div title="' + _esc(d.rep) + '" style="width:20px;height:20px;border-radius:50%;background:#0a0a0a;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + _initials(d.rep) + '</div>' : '') +
          '<span title="' + (hasRecentAct ? 'Activity in last 48h' : 'Quiet') + '" style="width:6px;height:6px;border-radius:50%;background:' + (hasRecentAct ? '#22c55e' : '#cbd5e1') + ';flex-shrink:0"></span>' +
          (c && c.source ? '<span style="font-size:10px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.source + '</span>' : '') +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:3px;flex-shrink:0;font-size:10px;font-weight:700;color:' + (stale ? '#dc2626' : '#9ca3af') + '">' +
          (stale ? '⚠️ ' : '') +
          '\u{1f553} ' + (d.age || 0) + 'd' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // Column renderer — header + cards + swipe hint.
  function stageColumn(stage) {
    var cards = byStage[stage.id] || [];
    var sumVal = cards.reduce(function(s,d){ return s + (d.val||0); }, 0);
    return '<div data-stage-id="' + stage.id + '" style="flex-shrink:0;width:100%;height:100%;scroll-snap-align:start;padding:12px;overflow-y:auto;box-sizing:border-box">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:0 2px">' +
        '<div style="display:flex;align-items:center;gap:8px;min-width:0">' +
          '<span style="width:8px;height:8px;border-radius:50%;background:' + stage.col + ';flex-shrink:0"></span>' +
          '<span style="font-size:14px;font-weight:700;color:#0a0a0a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + stage.name + '</span>' +
          '<span style="font-size:11px;color:#9ca3af;font-weight:700">' + cards.length + '</span>' +
        '</div>' +
        (sumVal > 0 ? '<span style="font-size:11px;color:#6b7280;font-weight:600;flex-shrink:0">' + fmtK(sumVal) + '</span>' : '') +
      '</div>' +
      (cards.length === 0
        ? '<div style="text-align:center;padding:40px 20px;color:#9ca3af;font-size:12px;font-style:italic">No deals in ' + stage.name + '</div>'
        : cards.map(function(d){ return dealCard(d, stage); }).join('')) +
      (stages.length > 1 ? '<div style="text-align:center;font-size:10px;color:#9ca3af;font-style:italic;margin-top:8px;padding-bottom:8px">Swipe ← →</div>' : '') +
    '</div>';
  }

  // Filter panel — collapsed by default; chips for value brackets, manager
  // also gets rep chips. Reuses our existing kFilter* state.
  function filterPanel() {
    if (!kFilterOpen) return '';
    var allBracket = !kFilterValMin && !kFilterValMax;
    var bLow = kFilterValMax === '25000' && !kFilterValMin;
    var bMid = kFilterValMin === '25000' && kFilterValMax === '75000';
    var bHigh = kFilterValMin === '75000' && !kFilterValMax;
    function chipBtn(label, active, onclick) {
      return '<button onclick="' + onclick + '" style="padding:4px 10px;border-radius:14px;border:none;background:' + (active?'#c41230':'#f3f4f6') + ';color:' + (active?'#fff':'#374151') + ';font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">' + label + '</button>';
    }
    return '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">' +
      (isManager ?
        '<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#6b7280;margin-bottom:4px">Rep</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
            chipBtn('All reps', kFilterOwners.length===0, "kFilterOwners=[];renderPage()") +
            allOwners.map(function(r){
              return chipBtn(r, kFilterOwners.indexOf(r) >= 0, "kFilterOwners=['" + _esc(r) + "'];renderPage()");
            }).join('') +
          '</div></div>'
        : '') +
      '<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#6b7280;margin-bottom:4px">Value bracket</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
          chipBtn('All', allBracket, "kFilterValMin='';kFilterValMax='';renderPage()") +
          chipBtn('< $25k', bLow, "kFilterValMin='';kFilterValMax='25000';renderPage()") +
          chipBtn('$25–75k', bMid, "kFilterValMin='25000';kFilterValMax='75000';renderPage()") +
          chipBtn('$75k+', bHigh, "kFilterValMin='75000';kFilterValMax='';renderPage()") +
        '</div></div>' +
    '</div>';
  }

  var SHELL_PX = TOPBAR_HEIGHT + BOTTOMNAV_HEIGHT;
  return '' +
    // Outer flex column — fills the visible viewport between top and bottom chrome.
    '<div style="display:flex;flex-direction:column;height:calc(100vh - ' + SHELL_PX + 'px);margin:-12px;background:#f4f5f7">' +
      // Header chrome (title + filter chip + pipeline switcher + filter panel)
      '<div style="background:#fff;padding:12px 16px;border-bottom:1px solid #f0f0f0;flex-shrink:0">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
          '<div>' +
            '<h1 style="font-size:18px;font-weight:800;margin:0;color:#0a0a0a;font-family:Syne,sans-serif">Deals</h1>' +
            '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + totalOpen.length + ' open · ' + fmtK(totalVal) + ' pipeline</div>' +
          '</div>' +
          '<button onclick="kFilterOpen=!kFilterOpen;renderPage()" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:none;background:' + (kFilterOpen ? '#c41230' : '#f3f4f6') + ';color:' + (kFilterOpen ? '#fff' : '#374151') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">' +
            'Filter' + (activeFilters > 0 ? '<span style="width:6px;height:6px;border-radius:50%;background:' + (kFilterOpen ? '#fff' : '#c41230') + '"></span>' : '') +
          '</button>' +
        '</div>' +
        // Pipeline segmented control
        '<div style="display:flex;background:#f3f4f6;border-radius:8px;padding:3px;gap:3px">' +
          PIPELINES.map(function(p){
            var on = p.id === dPipeline;
            return '<button onclick="dPipeline=\'' + _esc(p.id) + '\';_mobileDealStageId=null;renderPage()" style="flex:1;padding:6px;border-radius:6px;border:none;background:' + (on ? '#fff' : 'transparent') + ';color:' + (on ? '#0a0a0a' : '#6b7280') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;' + (on ? 'box-shadow:0 1px 2px rgba(0,0,0,.06)' : '') + '">' + p.name + '</button>';
          }).join('') +
        '</div>' +
        filterPanel() +
      '</div>' +
      // Stage tab strip
      '<div id="dealStageTabs" style="background:#fff;border-bottom:1px solid #e5e7eb;overflow-x:auto;-webkit-overflow-scrolling:touch;flex-shrink:0">' +
        '<div style="display:flex">' +
          stages.map(function(s){
            var count = (byStage[s.id] || []).length;
            var on = s.id === sel;
            return '<button data-stage-id="' + s.id + '" data-stage-col="' + s.col + '" onclick="_jumpToDealStage(\'' + s.id + '\')" style="flex-shrink:0;min-width:80px;padding:8px 12px;border:none;background:none;cursor:pointer;border-bottom:2.5px solid ' + (on ? s.col : 'transparent') + ';display:flex;flex-direction:column;align-items:center;gap:2px;font-family:inherit">' +
              '<div style="display:flex;align-items:center;gap:6px">' +
                '<span style="width:7px;height:7px;border-radius:50%;background:' + s.col + '"></span>' +
                '<span data-name style="font-size:11px;font-weight:700;color:' + (on ? '#0a0a0a' : '#6b7280') + ';white-space:nowrap">' + s.name + '</span>' +
              '</div>' +
              '<span style="font-size:9px;color:#9ca3af">' + count + '</span>' +
            '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      // Swipeable column container — CSS scroll-snap locks each column to a
      // viewport edge. _onDealsKanbanScroll syncs the tab strip on swipe.
      '<div id="dealKanbanScroll" data-stage-ids="' + stages.map(function(s){return s.id;}).join(',') + '" onscroll="_onDealsKanbanScroll(event)" style="flex:1;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch">' +
        stages.map(stageColumn).join('') +
      '</div>' +
    '</div>';
}

// Tab click — programmatically navigate to a stage column.
function _jumpToDealStage(stageId) {
  _mobileDealStageId = stageId;
  var el = document.getElementById('dealKanbanScroll');
  if (!el) { renderPage(); return; }
  var stages = (el.dataset.stageIds || '').split(',');
  var idx = stages.indexOf(stageId);
  if (idx < 0) idx = 0;
  el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  _updateDealStageTabsActive(stageId);
}

// Swipe-driven sync — fires on the container's native scroll. Updates the
// active stage id and tab strip styling without triggering renderPage (which
// would clobber scroll momentum and re-render every card).
function _onDealsKanbanScroll(ev) {
  var el = ev && ev.currentTarget;
  if (!el) return;
  var stages = (el.dataset.stageIds || '').split(',');
  if (!stages.length) return;
  var idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
  var stageId = stages[idx];
  if (!stageId || stageId === _mobileDealStageId) return;
  _mobileDealStageId = stageId;
  _updateDealStageTabsActive(stageId);
}

// Direct-DOM update of the stage tab strip's underline + name colour.
function _updateDealStageTabsActive(stageId) {
  var strip = document.getElementById('dealStageTabs');
  if (!strip) return;
  var btns = strip.querySelectorAll('button[data-stage-id]');
  btns.forEach(function(btn) {
    var on = btn.dataset.stageId === stageId;
    btn.style.borderBottom = '2.5px solid ' + (on ? (btn.dataset.stageCol || '#c41230') : 'transparent');
    var nameSpan = btn.querySelector('span[data-name]');
    if (nameSpan) nameSpan.style.color = on ? '#0a0a0a' : '#6b7280';
  });
}

// Called from renderPage after each innerHTML write to put the swipe
// container back at the active stage. Without this every state-driven
// re-render would snap back to the first column.
function _restoreDealsKanbanScroll() {
  var el = document.getElementById('dealKanbanScroll');
  if (!el) return;
  var stages = (el.dataset.stageIds || '').split(',');
  var idx = stages.indexOf(_mobileDealStageId);
  if (idx < 0) idx = 0;
  // Use rAF so the scroll happens after layout has settled.
  requestAnimationFrame(function(){ el.scrollLeft = idx * el.clientWidth; });
}

function renderDeals() {
  const { deals, contacts, modal, dealDetailId } = getState();
  if (dealDetailId) return renderDealDetail() + (getState().editingDealId ? renderEditDealDrawer() : '');

  // Native wrapper: full mobile deals layout (pipeline switcher, filter
  // panel, stage tab strip, swipeable horizontal columns). Desktop kanban
  // is unchanged below.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    return renderDealsMobile();
  }

  const pl = PIPELINES.find(p => p.id === dPipeline);
  // Include the lost stage as a visible "Not Proceeding" column. It lives at
  // ord:6 so it naturally sits at the right next to Won.
  const stages = pl.stages.sort((a, b) => a.ord - b.ord);
  const pDeals = deals.filter(d => d.pid === dPipeline);
  // Pipeline value and the "X open" headline must exclude both Won and Not
  // Proceeding — otherwise Not Proceeding deals inflate the numbers.
  const totalVal = pDeals.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
  const byStage = {};
  stages.forEach(s => byStage[s.id] = []);
  pDeals.forEach(d => { if (byStage[d.sid]) byStage[d.sid].push(d); });

  const allOwners = [...new Set(deals.map(d => d.rep))];
  const allSources = [...new Set(getState().contacts.map(c => c.source))].filter(Boolean);
  const activeFilters = kFilterOwners.length + kFilterStages.length + kFilterSource.length + (kFilterValMin ? 1 : 0) + (kFilterValMax ? 1 : 0);
  const matchesFilter = d => {
    if (kFilterOwners.length > 0 && !kFilterOwners.includes(d.rep)) return false;
    if (kFilterStages.length > 0 && !kFilterStages.includes(d.sid)) return false;
    if (kFilterValMin !== '' && d.val < parseFloat(kFilterValMin)) return false;
    if (kFilterValMax !== '' && d.val > parseFloat(kFilterValMax)) return false;
    if (kFilterSource.length > 0) { const c = getState().contacts.find(x => x.id === d.cid); if (!c || !kFilterSource.includes(c.source)) return false; }
    return true;
  };

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">Deals</h1>
      <p style="color:#6b7280;font-size:13px;margin:0">${pDeals.filter(d => !d.won && !d.lost).length} open · ${fmt$(totalVal)} pipeline</p>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="display:flex;background:#f3f4f6;border-radius:10px;padding:3px;gap:2px">
        ${PIPELINES.map(p => `<button onclick="dPipeline='${p.id}';renderPage()" style="padding:5px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:${dPipeline === p.id ? '#fff' : 'transparent'};color:${dPipeline === p.id ? '#1a1a1a' : '#6b7280'};box-shadow:${dPipeline === p.id ? '0 1px 4px rgba(0,0,0,.1)' : 'none'}">${p.name}</button>`).join('')}
      </div>
      <button onclick="openNewStageModal()" class="btn-w" style="font-size:12px;gap:5px">${Icon({ n: 'plus', size: 13 })} Stage</button>
      <button onclick="openNewDealModal()" class="btn-r" style="font-size:13px;gap:6px">${Icon({ n: 'plus', size: 15 })} New Deal</button>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="card" style="padding:10px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button onclick="kFilterOpen=!kFilterOpen;renderPage()" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #e5e7eb;border-radius:20px;background:#fff;font-size:12px;cursor:pointer;font-family:inherit;font-weight:500">
        ${Icon({ n: 'filter', size: 13 })} Filters${activeFilters > 0 ? ` <span style="background:#c41230;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${activeFilters}</span>` : ''}
      </button>
      ${kFilterOpen ? `
        <select onchange="kFilterOwners=this.value?[this.value]:[];renderPage()" style="border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <option value="">All Owners</option>
          ${allOwners.map(o => `<option value="${o}" ${kFilterOwners.includes(o) ? 'selected' : ''}>${o.split(' ')[0]}</option>`).join('')}
        </select>
        <div style="display:flex;align-items:center;gap:5px">
          <input id="dealValueMinInput" type="number" placeholder="Min $" value="${kFilterValMin}" oninput="kFilterValMin=this.value;renderPage()" style="width:90px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <span style="color:#9ca3af">–</span>
          <input id="dealValueMaxInput" type="number" placeholder="Max $" value="${kFilterValMax}" oninput="kFilterValMax=this.value;renderPage()" style="width:90px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
        </div>
        <select onchange="kFilterSource=this.value?[this.value]:[];renderPage()" style="border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <option value="">All Sources</option>
          ${allSources.map(s => `<option value="${s}" ${kFilterSource.includes(s) ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${activeFilters > 0 ? `<button onclick="kFilterOwners=[];kFilterStages=[];kFilterSource=[];kFilterValMin='';kFilterValMax='';renderPage()" style="font-size:12px;color:#c41230;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Clear all</button>` : ''}
      `: ''}
    </div>
  </div>

  ${(typeof isNativeWrapper === 'function' && isNativeWrapper()) ? (function(){
    // Mobile: stage chip selector + vertical deal list. Drag/drop kept
    // intact on each card markup but is functionally inert on touch — moving
    // a deal between stages on mobile uses the ✎ quick-edit modal instead.
    const sel = (_mobileDealStageId && byStage[_mobileDealStageId]) ? _mobileDealStageId : stages[0].id;
    const sd = (byStage[sel] || []);
    const stage = stages.find(s => s.id === sel) || stages[0];
    const stVal = sd.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
    return `
    <div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:4px">
      ${stages.map(st => {
        const c = (byStage[st.id]||[]).length;
        const a = st.id === sel;
        return `<button onclick="_mobileDealStageId='${st.id}';renderPage()" style="flex-shrink:0;padding:6px 12px;border-radius:16px;border:1px solid ${a ? st.col : '#e5e7eb'};background:${a ? st.col : '#fff'};color:${a ? '#fff' : '#1a1a1a'};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${st.name}<span style="background:${a ? 'rgba(255,255,255,.25)' : '#e5e7eb'};color:${a ? '#fff' : '#6b7280'};border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${c}</span></button>`;
      }).join('')}
    </div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:8px;padding-left:2px">${sd.length} deal${sd.length===1?'':'s'} · ${fmt$(stVal)}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${sd.length === 0 ? '<div style="text-align:center;padding:30px 20px;color:#9ca3af;font-size:13px;background:#f8f9fa;border-radius:10px">No deals in this stage</div>' : sd.map(d => {
        const c = contacts.find(x => x.id === d.cid);
        const passes = matchesFilter(d);
        const sent = getState().emailSent.filter(m => m.dealId === d.id || (c && m.to === c.email));
        const opened = sent.filter(m => m.opened);
        const isNP = !!stage.isLost;
        return `<div onclick="setState({dealDetailId:'${d.id}'})" style="background:#fff;border-radius:10px;padding:12px;border:1px solid #e5e7eb;border-left:3px solid ${_dealTypeStripeColor(d)};cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.06);opacity:${activeFilters > 0 && !passes ? .3 : (isNP ? .7 : 1)};position:relative">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:5px">
            <div style="font-size:13px;font-weight:600;line-height:1.3;color:#1a1a1a;flex:1">${d.title}</div>
            <button onclick="event.stopPropagation();openDealEdit('${d.id}')" style="width:24px;height:24px;border-radius:5px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;line-height:1" title="Quick edit">✎</button>
          </div>
          ${c ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:7px">
            <div style="width:16px;height:16px;background:#c41230;border-radius:50%;color:#fff;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn + ' ' + c.ln)}</div>
            <span style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.fn} ${c.ln}</span>
          </div>` : ''}
          <div style="font-size:15px;font-weight:800;color:#1a1a1a;font-family:Syne,sans-serif;margin-bottom:6px">${fmt$(d.val)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:4px">
              ${Badge(d.branch, 'gray')}
              ${d.age > 7 ? `<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 6px;border-radius:10px;font-weight:600">🔥${d.age}d</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              ${sent.length > 0 ? `<span style="font-size:10px;color:${opened.length > 0 ? '#15803d' : '#9ca3af'};background:${opened.length > 0 ? '#f0fdf4' : '#f3f4f6'};padding:1px 6px;border-radius:10px">👁${opened.length}/${sent.length}</span>` : ''}
              <button onclick="event.stopPropagation();emailFromDeal('${d.id}')" style="width:26px;height:26px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:12px" title="Email">✉️</button>
            </div>
          </div>
          ${d.closeDate ? `<div style="margin-top:7px;font-size:10px;color:#9ca3af">📅 ${d.closeDate}</div>` : ''}
          ${d.won ? `<div style="position:absolute;top:8px;right:36px;background:#22c55e;color:#fff;border-radius:20px;font-size:9px;font-weight:700;padding:2px 7px">WON</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    `;
  })() : `
  <!-- Kanban board (desktop) -->
  <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:16px;align-items:flex-start">
    ${stages.map(st => {
    const sd = (byStage[st.id] || []);
    // Column $ total: exclude won AND lost so the number reflects live pipe.
    // (For the Not Proceeding column itself this naturally shows $0 since
    // its deals all have lost:true — the column is visible but calls out
    // that nothing in it is counted toward the pipeline.)
    const stVal = sd.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
    const isNP = !!st.isLost;
    const colBg = isNP ? '#fef2f2' : '#f8f9fa';
    return `<div id="col_${st.id}" style="flex-shrink:0;width:236px;display:flex;flex-direction:column;border-radius:12px;background:${colBg};border:2px solid transparent;transition:background .15s,border-color .15s;min-height:460px${isNP ? ';opacity:0.92' : ''}"
        ondragover="event.preventDefault();highlightCol('${st.id}')"
        ondragleave="if(!event.currentTarget.contains(event.relatedTarget))unhighlightCol('${st.id}')"
        ondrop="dropDeal('${st.id}')">

        <div style="padding:12px 12px 6px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">
            <div style="width:10px;height:10px;border-radius:50%;background:${st.col};flex-shrink:0"></div>
            <span style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${st.name}</span>
            <span style="background:#e5e7eb;color:#6b7280;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;flex-shrink:0">${sd.length}</span>
          </div>
          <button onclick="openStageEdit('${st.id}')" title="Edit stage"
            style="width:24px;height:24px;border-radius:6px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1"
            onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='transparent'">⋯</button>
        </div>
        <div style="padding:0 10px 6px;font-size:11px;color:#9ca3af;font-weight:500">${fmt$(stVal)}</div>

        <div style="flex:1;padding:0 8px 8px;display:flex;flex-direction:column;gap:7px">
          ${sd.length === 0 ? `<div style="height:70px;border:2px dashed #e2e8f0;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px">Drop here</div>` : ''}
          ${sd.map(d => {
      const c = contacts.find(x => x.id === d.cid);
      const passes = matchesFilter(d);
      const sent = getState().emailSent.filter(m => m.dealId === d.id || (c && m.to === c.email));
      const opened = sent.filter(m => m.opened);
      return `<div
              draggable="true"
              ondragstart="dragDeal='${d.id}';event.dataTransfer.effectAllowed='move';event.currentTarget.style.opacity='0.45';event.currentTarget.style.cursor='grabbing'"
              ondragend="event.currentTarget.style.opacity='1';if(!dragDeal){return;}dragDeal=null;dragOverStage=null;unhighlightAllCols();renderPage()"
              onclick="setState({dealDetailId:'${d.id}'})"
              style="background:#fff;border-radius:10px;padding:12px;border:1px solid #e5e7eb;border-left:3px solid ${_dealTypeStripeColor(d)};cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s,transform .1s;opacity:${activeFilters > 0 && !passes ? .3 : (isNP ? .7 : 1)};position:relative;user-select:none"
              onmouseover="if(!dragDeal){this.style.boxShadow='0 4px 14px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)';}"
              onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,.06)';this.style.transform=''">

              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:5px">
                <div style="font-size:13px;font-weight:600;line-height:1.3;color:#1a1a1a;flex:1">${d.title}</div>
                <button onclick="event.stopPropagation();openDealEdit('${d.id}')"
                  style="width:20px;height:20px;border-radius:5px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;line-height:1"
                  onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'" title="Quick edit">✎</button>
              </div>

              ${c ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:7px">
                <div style="width:16px;height:16px;background:#c41230;border-radius:50%;color:#fff;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn + ' ' + c.ln)}</div>
                <span style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.fn} ${c.ln}</span>
              </div>`: ''}

              <div style="font-size:15px;font-weight:800;color:#1a1a1a;font-family:Syne,sans-serif;margin-bottom:8px">${fmt$(d.val)}</div>

              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="display:flex;align-items:center;gap:4px">
                  ${Badge(d.branch, 'gray')}
                  ${d.age > 7 ? `<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 6px;border-radius:10px;font-weight:600">🔥${d.age}d</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                  ${sent.length > 0 ? `<span class="etrack" style="font-size:10px;color:${opened.length > 0 ? '#15803d' : '#9ca3af'};background:${opened.length > 0 ? '#f0fdf4' : '#f3f4f6'};padding:1px 6px;border-radius:10px;cursor:default">👁${opened.length}/${sent.length}<div class="etrack-tip" style="text-align:left">${sent.map(m => '<div style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.1)"><div style="font-weight:600;font-size:11px">' + (m.subject || 'Email') + '</div><div style="color:#9ca3af;font-size:10px">Sent: ' + (m.date || '') + '</div><div style="font-size:10px;margin-top:2px;' + (m.opened ? 'color:#4ade80' : 'color:#fbbf24') + '">' + (m.opened ? '✓ Opened' + (m.openedAt ? ' · ' + m.openedAt : '') : '✗ Not opened') + '</div></div>').join('')}</div></span>` : ''}
                  <button onclick="event.stopPropagation();emailFromDeal('${d.id}')"
                    style="width:22px;height:22px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center" title="Email">✉️</button>
                </div>
              </div>
              ${d.closeDate ? `<div style="margin-top:7px;font-size:10px;color:#9ca3af">📅 ${d.closeDate}</div>` : ''}
              ${d.won ? `<div style="position:absolute;top:8px;right:30px;background:#22c55e;color:#fff;border-radius:20px;font-size:9px;font-weight:700;padding:2px 7px">WON</div>` : ''}
            </div>`;
    }).join('')}
        </div>
      </div>`;
  }).join('')}

    <!-- Add Stage button -->
    <div style="flex-shrink:0;width:210px">
      <button onclick="openNewStageModal()"
        style="width:100%;height:56px;border:2px dashed #d1d5db;border-radius:12px;background:transparent;cursor:pointer;font-family:inherit;font-size:13px;color:#9ca3af;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s"
        onmouseover="this.style.borderColor='#c41230';this.style.color='#c41230';this.style.background='#fff5f6'"
        onmouseout="this.style.borderColor='#d1d5db';this.style.color='#9ca3af';this.style.background='transparent'">
        ${Icon({ n: 'plus', size: 15 })} Add Stage
      </button>
    </div>
  </div>
  `}

  ${kanbanEditModal ? renderKanbanModal() : ''}
  ${modal && modal.type === 'newDeal' ? renderNewDealModal() : ''}`;
}

function dropDeal(stageId) {
  if (!dragDeal) return;
  const s = getState();
  const deal = s.deals.find(d => d.id === dragDeal);
  if (!deal || deal.sid === stageId) { dragDeal = null; dragOverStage = null; return; }
  const pl = PIPELINES.find(p => p.id === dPipeline);
  const st = pl ? pl.stages.find(s => s.id === stageId) : null;
  // Step 4 §1: drag-to-won column must route through the quote-selection gate.
  if (st && st.isWon) {
    var _draggedId = dragDeal;
    dragDeal = null; dragOverStage = null; unhighlightAllCols();
    _requestWonTransition(_draggedId, stageId, { source: 'kanban-drag' });
    return;
  }
  // Brief 1: Lost transition must capture a reason. Gate through the modal
  // BEFORE moving the deal — cancelling leaves the deal in its current stage.
  // Cleanup of drag globals + col highlighting must happen before the modal
  // opens, otherwise the kanban col stays highlighted and the next drag
  // misbehaves.
  if (st && st.isLost) {
    var _draggedId = dragDeal;
    dragDeal = null; dragOverStage = null; unhighlightAllCols();
    _requestLostTransition(_draggedId, stageId, { source: 'kanban-drag' });
    return;
  }
  const act = {
    id: 'a' + Date.now(), type: 'stage', text: 'Moved to: ' + (st ? st.name : stageId),
    date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: ''
  };
  var _did = dragDeal;
  setState({
    deals: s.deals.map(d => d.id === dragDeal
      ? {
        ...d, sid: stageId,
        won: !!(st && st.isWon),
        lost: !!(st && st.isLost),
        wonDate: (st && st.isWon) ? new Date().toISOString().slice(0, 10) : (d.wonDate || null),
        activities: [act, ...(d.activities || [])]
      } : d)
  });
  dbUpdate('deals', _did, { sid: stageId, won: !!(st && st.isWon), lost: !!(st && st.isLost), won_date: (st && st.isWon) ? new Date().toISOString().slice(0, 10) : null });
  dbInsert('activities', actToDb(act, 'deal', _did));
  // Audit ordinary mid-pipeline drags. Won / Lost drag paths return early
  // above and gate through their own audit-emitting flows.
  if (typeof appendAuditEntry === 'function' && !(st && st.isWon) && !(st && st.isLost)) {
    appendAuditEntry({
      entityType:'deal', entityId:_did, action:'deal.stage_changed',
      summary:'Stage changed to ' + (st ? st.name : stageId),
      before:{ sid: deal.sid }, after:{ sid: stageId },
      metadata:{ source:'kanban-drag' },
      branch: deal.branch || null,
    });
  }
  dragDeal = null; dragOverStage = null; unhighlightAllCols();
  if (st && st.isWon) addToast('🎉 Deal Won!', 'success');
  else addToast('Moved to ' + (st ? st.name : stageId), 'info');
  renderPage();
}

// ── Detail page tab state ────────────────────────────────────────────────────
// ── Detail tab state (per entity type, so tabs persist independently) ─────────
let detailTab = 'notes';
let schedActivityModal = false;
let schedActivityData = { type: 'call', title: '', date: '', time: '09:00', duration: 30, entityId: '', entityType: '', notes: '' };

// ══════════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Get activities for an entity (deals + leads store on entity; contacts pull from contactActivities + linked entity activities)
function getEntityActivities(entityId, entityType) {
  const s = getState();
  if (entityType === 'deal') {
    const d = s.deals.find(x => x.id === entityId);
    return d ? (d.activities || []) : [];
  }
  if (entityType === 'lead') {
    const l = s.leads.find(x => x.id === entityId);
    return l ? (l.activities || []) : [];
  }
  if (entityType === 'contact') {
    // Merge contact-level activities with activities from all linked deals/leads
    const contactActs = (s.contactActivities || {})[entityId] || [];
    const contact = s.contacts.find(c => c.id === entityId);
    if (!contact) return contactActs;
    const dealActs = s.deals
      .filter(d => d.cid === entityId)
      .flatMap(d => (d.activities || []).map(a => ({ ...a, _source: 'deal', _dealTitle: d.title })));
    const leadActs = s.leads
      .filter(l => l.email === contact.email && contact.email)
      .flatMap(l => (l.activities || []).map(a => ({ ...a, _source: 'lead', _leadName: l.fn + ' ' + l.ln })));
    return [...contactActs, ...dealActs, ...leadActs].sort((a, b) => b.date > a.date ? 1 : -1);
  }
  return [];
}

function saveActivityToEntity(entityId, entityType, actObj) {
  const s = getState();
  if (entityType === 'deal') {
    setState({ deals: s.deals.map(d => d.id === entityId ? { ...d, activities: [actObj, ...(d.activities || [])] } : d) });
    const d = s.deals.find(x => x.id === entityId);
    if (d && d.cid) mirrorActivityToContact(d.cid, { ...actObj, _source: 'deal' });
  } else if (entityType === 'lead') {
    setState({ leads: s.leads.map(l => l.id === entityId ? { ...l, activities: [actObj, ...(l.activities || [])] } : l) });
  } else if (entityType === 'contact') {
    const ca = { ...(s.contactActivities || {}) };
    ca[entityId] = [actObj, ...(ca[entityId] || [])];
    setState({ contactActivities: ca });
  }
  dbInsert('activities', actToDb(actObj, entityType, entityId));
}

function mirrorActivityToContact(contactId, actObj) {
  const s = getState();
  const ca = { ...(s.contactActivities || {}) };
  // Don't double-store if it already has the same id
  if ((ca[contactId] || []).find(a => a.id === actObj.id)) return;
  ca[contactId] = [actObj, ...(ca[contactId] || [])];
  setState({ contactActivities: ca });
}

// Build a Google Calendar URL
function buildGCalURL(title, date, time, durationMins, notes) {
  const d = date || new Date().toISOString().slice(0, 10);
  const t = time || '09:00';
  const [yr, mo, dy] = d.split('-');
  const [hr, mn] = t.split(':');
  const startDT = yr + mo + dy + 'T' + hr + mn + '00';
  const endDate = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(dy), parseInt(hr), parseInt(mn) + durationMins);
  const pad = n => String(n).padStart(2, '0');
  const endDT = endDate.getFullYear() + pad(endDate.getMonth() + 1) + pad(endDate.getDate()) + 'T' + pad(endDate.getHours()) + pad(endDate.getMinutes()) + '00';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startDT}/${endDT}&details=${encodeURIComponent(notes || '')}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE ACTIVITY MODAL
// ══════════════════════════════════════════════════════════════════════════════
function openScheduleModal(entityId, entityType, prefType) {
  schedActivityModal = true;
  schedActivityData = { type: prefType || 'call', title: '', date: '', time: '09:00', duration: 30, entityId, entityType, notes: '' };
  renderPage();
}

function renderScheduleModal() {
  const d = schedActivityData;
  const sd = d.suburb || '';
  const br = d.branch || 'VIC';
  const repName = d.repName || mapSelectedRep || 'all';

  const TYPES = getPickableActivityTypes();

  // Quick time shortcuts
  const addHours = (h) => {
    const dt = new Date(); dt.setHours(dt.getHours() + h);
    const dd = dt.toISOString().slice(0, 10);
    const tt = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    return { date: dd, time: tt };
  };
  const quickSlots = [
    { label: 'In 1h', ...addHours(1) },
    { label: 'In 3h', ...addHours(3) },
    { label: 'Tomorrow', ...addHours(24) },
    { label: 'Next week', ...addHours(168) },
  ];

  // Rep's existing appointments for selected date
  const dayDate = d.date || new Date().toISOString().slice(0, 10);
  const dayApts = MOCK_APPOINTMENTS.filter(a =>
    a.date === dayDate && (repName === 'all' || a.rep === repName)
  ).sort((a, b) => a.time > b.time ? 1 : -1);

  // Time slots for the day view (8am–6pm)
  const HOURS = Array.from({ length: 20 }, (_, i) => {
    const h = Math.floor(i / 2) + 8;
    const m = i % 2 === 0 ? '00' : '30';
    return String(h).padStart(2, '0') + ':' + m;
  });

  // Rep recommendations for this suburb
  const repRecs = sd ? REP_BASES
    .map(r => ({
      ...r, score: scoreRepForLead(r, { suburb: sd, branch: br, status: 'New' }),
      apts: MOCK_APPOINTMENTS.filter(a => a.rep === r.name && a.date === dayDate)
    }))
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score)
    : [];

  const gcalUrl = (d.date && d.time) ? buildGCalURL(
    d.title || (d.type.charAt(0).toUpperCase() + d.type.slice(1)),
    d.date, d.time, d.duration || 30, d.notes || ''
  ) : '';

  return `<div class="modal-bg" onclick="if(event.target===this){schedActivityModal=false;renderPage()}">
    <div class="modal" style="max-width:860px;width:95vw;height:88vh;display:flex;flex-direction:column">

      <!-- Header -->
      <div style="padding:16px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h3 style="margin:0;font-size:17px;font-weight:700;font-family:Syne,sans-serif">Schedule Activity</h3>
        <div style="display:flex;align-items:center;gap:8px">
          ${gcalUrl ? `<a href="${gcalUrl}" target="_blank" class="btn-w" style="font-size:12px;text-decoration:none;gap:5px">📅 Add to Google Cal</a>` : ''}
          <button onclick="schedActivityModal=false;renderPage()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>
        </div>
      </div>

      <!-- Body: left form + right day schedule -->
      <div style="display:grid;grid-template-columns:340px 1fr;flex:1;overflow:hidden">

        <!-- ── LEFT: Activity form ── -->
        <div style="padding:18px;border-right:1px solid #f0f0f0;overflow-y:auto;display:flex;flex-direction:column;gap:14px">

          <!-- Type selector -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Activity Type</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${TYPES.map(t => `<button
                onclick="schedActivityData.type='${t.id}';document.getElementById('sm_type').value='${t.id}';this.closest('.modal').querySelectorAll('.stype-btn').forEach(b=>{b.style.background='#fff';b.style.color='#6b7280';b.style.borderColor='#e5e7eb'});this.style.background='#fff5f6';this.style.color='#c41230';this.style.borderColor='#c41230'"
                class="stype-btn"
                style="display:flex;align-items:center;gap:5px;padding:6px 12px;border:1px solid ${d.type === t.id ? '#c41230' : '#e5e7eb'};border-radius:20px;font-size:12px;cursor:pointer;font-family:inherit;background:${d.type === t.id ? '#fff5f6' : '#fff'};color:${d.type === t.id ? '#c41230' : '#6b7280'};font-weight:500">
                ${t.icon} ${t.label}
              </button>`).join('')}
              <input type="hidden" id="sm_type" value="${d.type || 'call'}">
            </div>
          </div>

          <!-- Title -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Subject</label>
            <input id="sm_title" class="inp" value="${d.title || ''}" placeholder="Activity subject…"
              oninput="schedActivityData.title=this.value" style="font-size:13px">
          </div>

          <!-- Date + quick picks -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Date & Time</label>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              ${quickSlots.map(q => `<button onclick="schedActivityData.date='${q.date}';schedActivityData.time='${q.time}';document.getElementById('sm_date').value='${q.date}';document.getElementById('sm_time').value='${q.time}';mapSelectedDate='${q.date}';renderPage()"
                style="padding:4px 10px;border:1px solid #e5e7eb;border-radius:12px;font-size:11px;cursor:pointer;background:#fff;font-family:inherit;color:#6b7280"
                onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">${q.label}</button>`).join('')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <input type="date" id="sm_date" value="${d.date || new Date().toISOString().slice(0, 10)}"
                oninput="schedActivityData.date=this.value;mapSelectedDate=this.value;renderPage()" class="inp" style="font-size:12px;padding:6px 8px">
              <input type="time" id="sm_time" value="${d.time || '09:00'}"
                oninput="schedActivityData.time=this.value" class="inp" style="font-size:12px;padding:6px 8px">
            </div>
          </div>

          <!-- Duration -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Duration</label>
            <select id="sm_dur" class="sel" onchange="schedActivityData.duration=parseInt(this.value)"
              style="font-size:12px;padding:6px 8px">
              <option value="15" ${(d.duration || 30) === 15 ? 'selected' : ''}>15 min</option>
              <option value="30" ${(d.duration || 30) === 30 ? 'selected' : ''}>30 min</option>
              <option value="60" ${(d.duration || 30) === 60 ? 'selected' : ''}>1 hour</option>
              <option value="90" ${(d.duration || 30) === 90 ? 'selected' : ''}>1.5 hrs</option>
              <option value="120" ${(d.duration || 30) === 120 ? 'selected' : ''}>2 hours</option>
              <option value="180" ${(d.duration || 30) === 180 ? 'selected' : ''}>3 hours</option>
            </select>
          </div>

          <!-- Notes -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Note (private)</label>
            <textarea id="sm_notes" class="inp" rows="3" placeholder="Add a note…"
              oninput="schedActivityData.notes=this.value"
              style="font-size:13px;border:1px solid #e5e7eb;border-radius:8px;padding:8px;resize:none">${d.notes || ''}</textarea>
          </div>

          <!-- Rep recommendation (if location known) -->
          ${repRecs.length > 0 ? `<div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px">Assign Rep ${sd ? '· ' + sd : ''}</label>
            ${repRecs.slice(0, 3).map((r, i) => {
    const coords = getSuburbCoords(sd, br);
    const dist = haversine(r.lat, r.lng, coords.lat, coords.lng);
    const drive = estDriveTime(dist);
    const isSel = (mapSelectedRep === r.name);
    return `<div onclick="mapSelectedRep='${r.name}';schedActivityData.repName='${r.name}';renderPage()"
                style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:9px;border:2px solid ${isSel ? r.col : '#e5e7eb'};background:${isSel ? r.col + '10' : '#fff'};margin-bottom:5px;cursor:pointer">
                <div style="width:26px;height:26px;background:${r.col};border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:600">${r.name}</div>
                  <div style="font-size:11px;color:#6b7280">🚗 ~${drive}min · ${r.apts.length} appts today</div>
                </div>
                ${i === 0 ? `<span style="font-size:9px;background:#fef9c3;color:#92400e;padding:1px 6px;border-radius:8px;font-weight:700;flex-shrink:0">Best fit</span>` : ''}
                ${isSel ? `<span style="color:${r.col};font-size:16px">✓</span>` : ''}
              </div>`;
  }).join('')}
          </div>`: ''}
        </div>

        <!-- ── RIGHT: Day schedule view ── -->
        <div style="overflow-y:auto;background:#f9fafb;display:flex;flex-direction:column">
          <!-- Day header -->
          <div style="padding:12px 16px;background:#fff;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
            <div>
              <div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">
                ${new Date((d.date || new Date().toISOString().slice(0, 10)) + 'T12:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style="font-size:12px;color:#6b7280">${mapSelectedRep === 'all' ? 'All reps' : 'Rep: ' + mapSelectedRep}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button onclick="mapSelectedDate=(d.date||new Date().toISOString().slice(0,10));mapSelectedRep='all';renderPage()" class="btn-g" style="font-size:11px">All reps</button>
              ${REP_BASES.slice(0, 3).map(r => `<button onclick="mapSelectedRep='${r.name}';schedActivityData.repName='${r.name}';renderPage()"
                style="padding:3px 8px;border-radius:8px;border:1px solid ${mapSelectedRep === r.name ? r.col : '#e5e7eb'};background:${mapSelectedRep === r.name ? r.col + '20' : '#fff'};color:${mapSelectedRep === r.name ? r.col : '#6b7280'};font-size:11px;cursor:pointer;font-family:inherit">${r.name.split(' ')[0]}</button>`).join('')}
            </div>
          </div>

          <!-- Time grid -->
          <div style="flex:1;padding:8px 12px;position:relative">
            ${dayApts.length === 0 ? `<div style="padding:24px;text-align:center;color:#9ca3af;font-size:13px">
              <div style="font-size:32px;margin-bottom:8px">📅</div>
              <div style="font-weight:500">No appointments scheduled</div>
              <div style="font-size:12px;margin-top:4px">${mapSelectedRep === 'all' ? 'Select a rep above to see their schedule' : '${mapSelectedRep} is free all day'}</div>
            </div>`: ''}

            ${HOURS.filter((_, i) => i % 2 === 0 || dayApts.some(a => a.time === HOURS[i])).map(hour => {
    const aptsAtHour = dayApts.filter(a => a.time === hour);
    const isNewActTime = (d.time || '').slice(0, 5) === hour;
    return `<div style="display:flex;gap:10px;min-height:38px;align-items:flex-start;padding:3px 0;${isNewActTime ? 'background:#fff5f6;border-radius:6px;margin:0 -4px;padding:3px 4px' : ''}">
                <div style="width:44px;font-size:11px;color:${isNewActTime ? '#c41230' : '#9ca3af'};font-weight:${isNewActTime ? 700 : 400};flex-shrink:0;padding-top:2px;text-align:right">${hour}</div>
                <div style="flex:1;min-width:0">
                  ${isNewActTime ? `<div style="background:#c41230;color:#fff;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:600;margin-bottom:3px">← New: ${d.title || d.type}</div>` : ''}
                  ${aptsAtHour.map(apt => {
      const rep = REP_BASES.find(r => r.name === apt.rep);
      return `<div style="background:#fff;border:1px solid ${rep ? rep.col : '#e5e7eb'};border-left:3px solid ${rep ? rep.col : '#e5e7eb'};border-radius:6px;padding:5px 10px;margin-bottom:3px">
                      <div style="font-size:12px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${apt.client}</div>
                      <div style="font-size:10px;color:#6b7280">📍 ${apt.suburb} · ${apt.type} · ${apt.rep.split(' ')[0]}</div>
                    </div>`;
    }).join('')}
                  ${aptsAtHour.length === 0 && !isNewActTime ? `<div style="height:1px;background:#f0f0f0;margin:16px 0"></div>` : ''}
                </div>
              </div>`;
  }).join('')}
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <div style="font-size:12px;color:#9ca3af">
          ${dayApts.length} appointment${dayApts.length !== 1 ? 's' : ''} on this day${mapSelectedRep !== 'all' ? ' for ' + mapSelectedRep : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="schedActivityModal=false;renderPage()" class="btn-w">Cancel</button>
          <button onclick="saveScheduledActivity()" class="btn-r" style="font-size:13px;padding:7px 22px">Save Activity</button>
        </div>
      </div>
    </div>
  </div>`;
}


function saveScheduledActivity() {
  const d = schedActivityData;
  if (!d.date || !d.time) { addToast('Pick a date and time', 'error'); return; }
  const title = d.title || (d.type.charAt(0).toUpperCase() + d.type.slice(1));
  const calLink = buildGCalURL(title, d.date, d.time, d.duration, d.notes);
  const act = {
    id: 'a' + Date.now(), type: d.type,
    text: title + (d.notes ? '\n' + d.notes : ''),
    date: d.date, time: d.time, duration: d.duration,
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: d.date,
    calLink, scheduled: true,
  };
  saveActivityToEntity(d.entityId, d.entityType, act);
  schedActivityModal = false;
  // Also add to MOCK_APPOINTMENTS so it shows in the map
  const rep = REP_BASES.find(r => r.name === (d.repName || (getCurrentUser() || { name: 'Admin' }).name)) || REP_BASES[0];
  const coords = getSuburbCoords(d.suburb || '', d.branch || rep.branch);
  const entity = d.entityType === 'deal' ? getState().deals.find(x => x.id === d.entityId) :
    d.entityType === 'lead' ? getState().leads.find(x => x.id === d.entityId) : null;
  if (entity) {
    MOCK_APPOINTMENTS.push({
      id: 'ap_' + Date.now(), rep: rep.name, repCol: rep.col,
      date: d.date, time: d.time,
      client: d.entityType === 'deal' ? (entity.title || 'Deal') : ((entity.fn || '') + ' ' + (entity.ln || '')),
      suburb: d.suburb || entity.suburb || '',
      lat: coords.lat, lng: coords.lng,
      type: title, status: 'Confirmed',
    });
    saveAppointments();
  }
  addToast('✓ ' + title + ' scheduled for ' + d.date + ' at ' + d.time, 'success');
}


// ── Email tracking lookup for timeline activities ─────────────────────────────
// Build hover tooltip HTML for email tracking status
function emailTrackTip(act, sentEmails) {
  // Try to match from emailSent array for richer data
  var msg = null;
  if (sentEmails && act.to) {
    msg = sentEmails.find(function (m) { return m.gmailMsgId && m.gmailMsgId === act.gmailMsgId; });
    if (!msg && act.subject) msg = sentEmails.find(function (m) { return m.subject === act.subject && m.date === act.date; });
  }
  var opens = act.opens || (msg && msg.opens) || 0;
  var openedAt = act.openedAt || (msg && msg.openedAt) || null;
  var clicked = act.clicked || (msg && msg.clicked) || false;
  var to = act.to || (msg && msg.to) || '';
  var sentDate = act.date || '';
  var sentTime = act.time || '';
  var lines = [];
  lines.push('<div style="font-weight:700;margin-bottom:4px;font-size:12px">' + (act.subject || 'Email') + '</div>');
  if (to) lines.push('<div style="color:#9ca3af">To: ' + to + '</div>');
  lines.push('<div style="color:#9ca3af">Sent: ' + sentDate + (sentTime ? ' ' + sentTime : '') + '</div>');
  lines.push('<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.15)">');
  if (opens > 0) {
    lines.push('<div style="color:#4ade80;font-weight:600">✓ Opened ' + opens + '× </div>');
    if (openedAt) lines.push('<div style="color:#86efac">Last: ' + openedAt + '</div>');
  } else {
    lines.push('<div style="color:#fbbf24">✗ Not opened yet</div>');
  }
  if (clicked) lines.push('<div style="color:#60a5fa;font-weight:600;margin-top:2px">🔗 Link clicked</div>');
  lines.push('</div>');
  return lines.join('');
}

function getEmailTrackingForActivity(act) {
  // Match activity to sent email by subject/date
  if (act.type !== 'email') return null;
  const sent = getState().emailSent;
  // Match by gmailMsgId first, then by subject+date
  let msg = act.gmailMsgId ? sent.find(m => m.gmailMsgId === act.gmailMsgId) : null;
  if (!msg && act.subject) {
    msg = sent.find(m => m.subject === act.subject && m.date === act.date);
  }
  if (!msg && act.subject) {
    msg = sent.find(m => m.subject.includes(act.subject.slice(0, 20)));
  }
  return msg || null;
}

// Simulate opening a tracked email from the timeline
function simulateOpenFromTimeline(actId, entityId, entityType) {
  const activities = getEntityActivities(entityId, entityType);
  const act = activities.find(a => a.id === actId);
  if (!act) return;
  // Find matching sent email
  const msg = getEmailTrackingForActivity(act);
  if (msg) {
    trackEmailOpen(msg.id);
  } else {
    // Create a virtual tracking event
    const newOpens = (act.opens || 0) + 1;
    const timeStr = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) + ' ' + new Date().toTimeString().slice(0, 5);
    if (entityType === 'deal') {
      setState({
        deals: getState().deals.map(d => {
          if (d.id !== entityId) return d;
          return {
            ...d, activities: (d.activities || []).map(a =>
              a.id === actId ? { ...a, opens: newOpens, opened: true, openedAt: timeStr } : a
            )
          };
        })
      });
    } else if (entityType === 'lead') {
      setState({
        leads: getState().leads.map(l => {
          if (l.id !== entityId) return l;
          return {
            ...l, activities: (l.activities || []).map(a =>
              a.id === actId ? { ...a, opens: newOpens, opened: true, openedAt: timeStr } : a
            )
          };
        })
      });
    } else {
      const ca = { ...(getState().contactActivities || {}) };
      ca[entityId] = (ca[entityId] || []).map(a =>
        a.id === actId ? { ...a, opens: newOpens, opened: true, openedAt: timeStr } : a
      );
      setState({ contactActivities: ca });
    }
    pushEmailOpenNotif({ toName: 'Contact', subject: act.subject || 'Email', opens: newOpens });
    addToast('👁 Email marked as opened', 'success');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PIPEDRIVE-IDENTICAL DETAIL PAGE RENDERER
// Layout: LEFT sidebar (details/person/org) | RIGHT main (tabs + history)
// ══════════════════════════════════════════════════════════════════════════════


// ── Sync a clicked time slot from the inline map back to the activity form ────
function setActivityTime(entityId, time, date, repName) {
  // Update atime input if visible
  const timeEl = document.getElementById('atime_' + entityId);
  if (timeEl) timeEl.value = time;
  const dateEl = document.getElementById('adate_' + entityId);
  if (dateEl && date) dateEl.value = date;
  // Update schedule state
  schedActivityData.time = time;
  if (date) schedActivityData.date = date;
  if (repName) { schedActivityData.repName = repName; mapSelectedRep = repName; }
  // Flash the selected slot visually (re-render)
  renderPage();
}

// (Previous OSM-iframe mount helper removed — the inline map now uses real
//  Google Maps via mountInlineGoogleMap in 14a-google-maps-real.js.)

// ── Inline map scheduler — embeds directly under the Activity tab ─────────────
// Shows rep's day at a glance + book button without opening a separate modal
function renderInlineMapScheduler(entityId, entityType) {
  // Get entity data for location + rep
  const s = getState();
  let suburb = '', branch = 'VIC', repName = (getCurrentUser() || { name: 'Admin' }).name, entityVal = 0;
  if (entityType === 'deal') {
    const d = s.deals.find(x => x.id === entityId);
    if (d) { suburb = d.suburb || ''; branch = d.branch || 'VIC'; repName = d.rep || (getCurrentUser() || { name: 'Admin' }).name; entityVal = d.val; }
  } else if (entityType === 'lead') {
    const l = s.leads.find(x => x.id === entityId);
    if (l) { suburb = l.suburb || ''; branch = l.branch || 'VIC'; repName = l.owner || (getCurrentUser() || { name: 'Admin' }).name; entityVal = l.val; }
  } else {
    const c = s.contacts.find(x => x.id === entityId);
    if (c) { suburb = c.suburb || ''; branch = c.branch || 'VIC'; }
  }

  // Use mapSelectedDate (shared state), default today
  const date = mapSelectedDate || new Date().toISOString().slice(0, 10);

  // Get rep's appointments for the selected day
  const activeRep = mapSelectedRep !== 'all' ? mapSelectedRep : repName;
  const repApts = MOCK_APPOINTMENTS.filter(a => a.date === date && a.rep === activeRep)
    .sort((a, b) => a.time > b.time ? 1 : -1);

  // All reps + scores for this location
  const coords = getSuburbCoords(suburb, branch);
  const repScores = REP_BASES
    .map(r => {
      const score = scoreRepForLead(r, { suburb, branch, status: 'New' });
      const dist = haversine(r.lat, r.lng, coords.lat, coords.lng);
      const drive = estDriveTime(dist);
      const dayApts = MOCK_APPOINTMENTS.filter(a => a.rep === r.name && a.date === date);
      return { ...r, score, dist, drive, dayApts };
    })
    .filter(r => r.score >= 0)
    .sort((a, b) => b.score - a.score);

  const bestRep = repScores[0];

  // Time slots 08:00–17:00 every 30 min
  const SLOTS = [];
  for (let h = 8; h <= 17; h++) {
    SLOTS.push(String(h).padStart(2, '0') + ':00');
    if (h < 17) SLOTS.push(String(h).padStart(2, '0') + ':30');
  }

  // Map centre + plotting handled by mountInlineGoogleMap in 14a-google-maps-real.js.

  return `
  <div style="border-top:2px solid #f0f0f0;background:#fafafa">

    <!-- ── Inline map header ── -->
    <div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;background:#fff;border-bottom:1px solid #e5e7eb">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:700;color:#1a1a1a;font-family:Syne,sans-serif">📍 Schedule Map</span>
        ${suburb ? `<span style="font-size:12px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:10px">${suburb}</span>` : ''}
      </div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <input type="date" value="${date}" onchange="mapSelectedDate=this.value;renderPage()"
          class="inp" style="font-size:12px;padding:4px 8px;width:auto">
        <select onchange="mapSelectedRep=this.value;renderPage()" class="sel" style="font-size:12px;padding:4px 8px;width:auto">
          <option value="all">All reps</option>
          ${REP_BASES.map(r => `<option value="${r.name}" ${activeRep === r.name ? 'selected' : ''}>${r.name.split(' ')[0]} (${r.branch})</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- ── Body: left schedule + right map+recs ── -->
    <div style="display:grid;grid-template-columns:1fr 260px;min-height:300px">

      <!-- LEFT: Day timeline -->
      <div style="border-right:1px solid #e5e7eb;overflow-y:auto;max-height:420px;background:#fff">
        <div style="padding:8px 14px;border-bottom:1px solid #f0f0f0;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;background:#f9fafb">
          ${new Date(date + 'T12:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' })} — ${activeRep.split(' ')[0]}
        </div>

        ${repApts.length === 0 ? `
        <div style="padding:20px 14px;text-align:center;color:#9ca3af">
          <div style="font-size:24px;margin-bottom:6px">📅</div>
          <div style="font-size:12px;font-weight:500">${activeRep.split(' ')[0]} is free all day</div>
          <div style="font-size:11px;margin-top:3px;color:#d1d5db">Great day to book!</div>
        </div>`: ''}

        <!-- Time grid -->
        ${SLOTS.map(slot => {
    const apt = repApts.find(a => a.time === slot);
    const isScheduling = (schedActivityData.time || '').slice(0, 5) === slot && schedActivityModal;
    return `<div style="display:flex;align-items:flex-start;min-height:32px;border-bottom:1px solid #f9fafb;${apt ? 'background:#fff' : ''}">
            <div style="width:40px;font-size:10px;color:#9ca3af;flex-shrink:0;padding:7px 4px 0 8px;text-align:right">${slot}</div>
            <div style="flex:1;padding:2px 8px">
              ${apt ? `<div style="background:${(REP_BASES.find(r => r.name === apt.rep) || { col: '#9ca3af' }).col}18;border-left:3px solid ${(REP_BASES.find(r => r.name === apt.rep) || { col: '#9ca3af' }).col};border-radius:0 6px 6px 0;padding:4px 8px;margin:2px 0">
                <div style="font-size:11px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${apt.client}</div>
                <div style="font-size:10px;color:#6b7280">📍 ${apt.suburb} · ${apt.type}</div>
              </div>`: ''}
              ${!apt && slot.endsWith(':00') ? `<div style="height:1px;background:#f3f4f6;margin:15px 0 0"></div>` : ''}
            </div>
            <!-- Quick-book button on empty slots -->
            ${!apt ? `<button onclick="
                document.getElementById('atime_${entityId}')&&(document.getElementById('atime_${entityId}').value='${slot}');
                schedActivityData.time='${slot}';
                schedActivityData.date='${date}';
                schedActivityData.repName='${activeRep}';
                mapSelectedRep='${activeRep}';
                if(document.getElementById('sm_time'))document.getElementById('sm_time').value='${slot}'"
              style="width:22px;height:22px;border-radius:50%;background:transparent;border:none;cursor:pointer;color:#d1d5db;font-size:14px;flex-shrink:0;margin:4px 4px 0 0;display:flex;align-items:center;justify-content:center;transition:all .15s"
              onmouseover="this.style.background='#f0fdf4';this.style.color='#22c55e';this.title='Book ${slot}'"
              onmouseout="this.style.background='transparent';this.style.color='#d1d5db'"
              title="Set time to ${slot}">+</button>` : '<div style="width:26px;flex-shrink:0"></div>'}
          </div>`;
  }).join('')}
      </div>

      <!-- RIGHT: Map + rep recommendations -->
      <div style="display:flex;flex-direction:column;overflow:hidden">

        <!-- Mini map -->
        <div style="position:relative;flex-shrink:0">
          <div id="inlineMapSlot" style="width:100%;height:160px;overflow:hidden;background:#f3f4f6"></div>
          <!-- Rep dots overlay legend -->
          <div style="position:absolute;bottom:6px;left:6px;right:6px;background:rgba(255,255,255,.95);border-radius:7px;padding:5px 8px;box-shadow:0 1px 6px rgba(0,0,0,.12)">
            ${repScores.slice(0, 3).map(r => `<div style="display:flex;align-items:center;gap:5px;margin-bottom:2px">
              <div style="width:8px;height:8px;border-radius:50%;background:${r.col};flex-shrink:0"></div>
              <span style="font-size:10px;font-weight:500;color:#374151">${r.name.split(' ')[0]}</span>
              <span style="font-size:10px;color:#9ca3af">🚗${r.drive}min · ${r.dayApts.length}apt${r.dayApts.length !== 1 ? 's' : ''}</span>
            </div>`).join('')}
            ${suburb ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(suburb + ', Australia')}&travelmode=driving" target="_blank" style="font-size:10px;color:#3b82f6;text-decoration:none">Get directions ↗</a>` : ''}
          </div>
        </div>

        <!-- Rep recommendations -->
        <div style="flex:1;overflow-y:auto;padding:8px;background:#fafafa">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;margin-bottom:6px;padding:0 2px">Best reps${suburb ? ' for ' + suburb : ''}</div>

          ${repScores.slice(0, 4).map((r, i) => {
    const isSel = activeRep === r.name;
    return `<div onclick="mapSelectedRep='${r.name}';schedActivityData.repName='${r.name}';renderPage()"
              style="display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:8px;border:1.5px solid ${isSel ? r.col : '#e5e7eb'};background:${isSel ? r.col + '14' : '#fff'};margin-bottom:5px;cursor:pointer;transition:all .15s"
              onmouseover="if(!${isSel})this.style.borderColor='${r.col}';if(!${isSel})this.style.background='${r.col}08'"
              onmouseout="if(!${isSel})this.style.borderColor='#e5e7eb';if(!${isSel})this.style.background='#fff'">
              <div style="width:24px;height:24px;border-radius:50%;background:${r.col};color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${r.avatar}</div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:4px">
                  <span style="font-size:11px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.name.split(' ')[0]} ${r.name.split(' ')[1] || ''}</span>
                  ${i === 0 ? `<span style="font-size:8px;background:#fef9c3;color:#92400e;padding:0 4px;border-radius:6px;font-weight:700;flex-shrink:0">Best</span>` : ''}
                </div>
                <div style="font-size:10px;color:#6b7280">🚗${r.drive}min · ${r.dayApts.length} today</div>
              </div>
              ${isSel ? `<span style="color:${r.col};font-size:14px;flex-shrink:0">✓</span>` : ''}
            </div>`;
  }).join('')}

          <!-- View full map -->
          <button onclick="setState({page:'map'})" class="btn-w" style="width:100%;justify-content:center;font-size:11px;margin-top:10px;gap:4px">
            📍 Open full schedule map
          </button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── MOBILE: stage-advance helper ─────────────────────────────────────────────
// Advances a deal one stage forward in its pipeline. If the next stage is the
// Won stage, defers to markDealWon() so the existing payment-method modal,
// job creation, and audit run normally. Adds a 'stage' activity + audit
// entry on regular advances.
function advanceDealStageMobile(dealId) {
  var deal = (getState().deals || []).find(function(d){ return d.id === dealId; });
  if (!deal) return;
  if (deal.won || deal.lost) { addToast('Deal is closed', 'info'); return; }
  var pl = (typeof PIPELINES !== 'undefined' ? PIPELINES : []).find(function(p){ return p.id === deal.pid; });
  if (!pl) return;
  var stages = pl.stages.slice().sort(function(a,b){ return a.ord - b.ord; }).filter(function(s){ return !s.isLost; });
  var curIdx = stages.findIndex(function(s){ return s.id === deal.sid; });
  if (curIdx < 0) curIdx = 0;
  var next = stages[curIdx + 1];
  if (!next) { addToast('Already at the final stage', 'info'); return; }
  if (next.isWon) { if (typeof markDealWon === 'function') markDealWon(dealId); return; }
  // Plain stage move — apply locally, persist, log activity, audit.
  var oldStage = stages[curIdx];
  var deals = getState().deals.slice();
  var i = deals.findIndex(function(x){ return x.id === dealId; });
  deals[i] = Object.assign({}, deals[i], { sid: next.id });
  setState({ deals: deals });
  if (typeof dbUpdate === 'function') dbUpdate('deals', dealId, { sid: next.id });
  if (typeof saveActivityToEntity === 'function') {
    saveActivityToEntity(dealId, 'deal', {
      id: 'a' + Date.now(), type: 'stage',
      text: (oldStage ? oldStage.name : '?') + ' → ' + next.name,
      date: new Date().toISOString().slice(0,10),
      time: new Date().toTimeString().slice(0,5),
      by: (getCurrentUser()||{name:'Admin'}).name,
    });
  }
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'deal', entityId:dealId, action:'deal.stage_changed',
      summary:'Stage changed: ' + (oldStage ? oldStage.name : '?') + ' → ' + next.name,
      before:{ sid: deal.sid }, after:{ sid: next.id },
    });
  }
  addToast('Moved to ' + next.name, 'success');
  // Phase 4: post-action prompt. After a stage advance the natural next
  // activity is a follow-up call/meeting on the new stage — bias the chip
  // toward 'followUp' so the rep just hits a quick-date and saves.
  if (typeof maybePromptNextActivity === 'function') {
    maybePromptNextActivity(dealId, 'deal', 'followUp');
  }
}

// ── MOBILE: camera capture ───────────────────────────────────────────────────
// Uses @capacitor/camera (installed in the wrapper). The plugin resizes
// on-device to 1024px wide @ JPEG 80 — typical capture lands at 100-200KB.
// We upload the binary blob to Supabase Storage (bucket: crm-photos), then
// route the resulting public URL through addEntityFile() — the same helper
// the desktop Files tab uses. That way:
//   • the photo appears in the desktop "Files" tab on the deal/lead
//   • a 'file' activity is logged (existing allowed type, no schema risk)
//   • the entity_files table gets a row alongside spartan_files_X_Y in
//     localStorage so dbLoadAll on other devices picks it up
async function takeMobilePhoto(entityId, entityType) {
  var Camera = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
  if (!Camera) {
    addToast('Camera plugin not loaded — open in the wrapper app', 'error');
    return;
  }
  if (!_sb) {
    if (typeof initSupabase === 'function') initSupabase();
    if (!_sb) { addToast('Database not connected', 'error'); return; }
  }
  try {
    var photo = await Camera.getPhoto({
      quality: 80, width: 1024, allowEditing: false,
      resultType: 'base64', source: 'CAMERA',
    });
    if (!photo || !photo.base64String) return;
    addToast('Uploading…', 'info');
    var binary = atob(photo.base64String);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    var ext = (photo.format || 'jpeg').toLowerCase();
    var mime = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    var blob = new Blob([bytes], { type: mime });
    var cu = getCurrentUser() || {};
    var ts = Date.now();
    var path = (cu.id || 'anon') + '/' + entityType + '-' + entityId + '/' + ts + '.' + ext;
    var up = await _sb.storage.from('crm-photos').upload(path, blob, {
      cacheControl: '3600', upsert: false, contentType: mime,
    });
    if (up && up.error) {
      console.error('[Spartan] photo upload failed:', up.error);
      addToast('Upload failed: ' + (up.error.message || 'storage'), 'error');
      return;
    }
    var pub = _sb.storage.from('crm-photos').getPublicUrl(path);
    var publicUrl = pub && pub.data && pub.data.publicUrl;
    if (!publicUrl) { addToast('Could not resolve photo URL', 'error'); return; }
    var fileName = 'photo-' + new Date().toISOString().slice(0,10).replace(/-/g,'') + '-' + ts + '.' + ext;
    var fileId = 'file_' + ts;
    var byName = cu.name || 'Admin';
    // Replicate addEntityFile's storage writes — we don't call addEntityFile
    // directly because it logs a generic "File uploaded: foo.jpg" activity;
    // for a camera capture we want a richer "📸 Photo captured" entry
    // with the URL as text (so the timeline can render the photo inline).
    //   1) localStorage so desktop Files tab sees the photo without a reload
    if (typeof getEntityFiles === 'function' && typeof saveEntityFiles === 'function') {
      var files = getEntityFiles(entityType, entityId);
      files.push({
        id: fileId, name: fileName, dataUrl: publicUrl,
        size: (blob && blob.size) || 0,
        uploadedBy: byName, uploadedAt: new Date().toISOString(),
      });
      saveEntityFiles(entityType, entityId, files);
    }
    //   2) entity_files row mirrors what desktop's addEntityFile writes
    if (typeof dbInsert === 'function') {
      try {
        dbInsert('entity_files', {
          id: fileId, entity_type: entityType, entity_id: entityId,
          name: fileName, data_url: publicUrl, uploaded_by: byName,
        });
      } catch (e) { /* swallow — same pattern as desktop addEntityFile */ }
    }
    //   3) Photo activity. type='file' to satisfy the existing activities-
    //   table constraint; subject lifts the "Photo captured" caption to the
    //   row header so the body can be just the URL — which the timeline
    //   detects and renders as an inline <img>.
    if (typeof saveActivityToEntity === 'function') {
      saveActivityToEntity(entityId, entityType, {
        id: 'a' + ts, type: 'file',
        subject: '📸 Photo captured',
        text: publicUrl,
        date: new Date().toISOString().slice(0,10),
        time: new Date().toTimeString().slice(0,5),
        by: byName,
      });
    }
    addToast('Photo saved ✓', 'success');
    renderPage();
    // Phase 4: prompt for next activity after a site-visit photo. The natural
    // follow-up after a measure photo is a follow-up call when back at the
    // office, so bias toward 'followUp'.
    if (typeof maybePromptNextActivity === 'function') {
      maybePromptNextActivity(entityId, entityType, 'followUp');
    }
  } catch (e) {
    var msg = (e && e.message) || String(e);
    if (msg.indexOf('cancel') >= 0 || msg.indexOf('Cancel') >= 0) return;
    console.error('[Spartan] camera error:', e);
    addToast('Camera error: ' + msg, 'error');
  }
}

// ── MOBILE: email compose modal ──────────────────────────────────────────────
// Compose-on-mobile via /api/email/send. Sends via Workspace service account
// with domain-wide delegation — recipient sees From:<rep@domain> as if the
// rep had sent from desktop. Body is plain text in the textarea; the server
// converts newlines→<br> and appends the open-tracking pixel before handing
// off to Gmail. State held in module scope so realtime echoes don't drop the
// in-progress draft.
var _pendingMobileEmail = null;          // { entityId, entityType, to, subject, body, sending }
function openMobileEmail(entityId, entityType, prefilledTo) {
  _pendingMobileEmail = {
    entityId: entityId, entityType: entityType,
    to: prefilledTo || '', subject: '', body: '', sending: false,
  };
  renderPage();
  setTimeout(function(){
    var el = document.getElementById('mobEmailSubject');
    if (el) el.focus();
  }, 60);
}
function cancelMobileEmail() { _pendingMobileEmail = null; renderPage(); }
function setMobileEmailField(field, value) {
  if (_pendingMobileEmail) _pendingMobileEmail[field] = value;
}
async function sendMobileEmail() {
  if (!_pendingMobileEmail || _pendingMobileEmail.sending) return;
  var p = _pendingMobileEmail;
  if (!p.to.trim() || !p.subject.trim() || !p.body.trim()) {
    addToast('To, subject and body are required', 'warning'); return;
  }
  // The wrapper persists the Google ID token at sign-in time
  // (10-integrations.js googleSignInForLoginNative). Without it, the
  // backend can't authenticate — fall back to a clear message.
  var idToken = '';
  try { idToken = localStorage.getItem('spartan_native_id_token') || ''; } catch(e){}
  if (!idToken) {
    addToast('Sign in again to send email — token missing', 'error');
    return;
  }
  p.sending = true; renderPage();
  try {
    var resp = await fetch('https://spaartan.tech/api/email/send', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + idToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: p.to.trim(),
        subject: p.subject.trim(),
        body: p.body,
        entityId: p.entityId,
        entityType: p.entityType,
      }),
    });
    var data = {};
    try { data = await resp.json(); } catch(e){}
    if (!resp.ok) {
      var raw = (data && data.error) || ('HTTP ' + resp.status);
      // Translate the most common backend errors into something a sales rep
      // can actually act on. Pre-launch the env var won't be set; sessions
      // expire in an hour so token errors crop up after a long break.
      var friendly;
      if (/SERVICE_ACCOUNT_BASE64|env var not set/i.test(raw)) {
        friendly = 'Email isn\'t set up yet — admin is plugging in credentials.';
      } else if (/expired|empty bearer|invalid.*id token/i.test(raw)) {
        friendly = 'Sign out and back in to refresh your session, then retry.';
      } else if (/not registered/i.test(raw)) {
        friendly = 'Your email isn\'t in the user list — contact admin.';
      } else if (/domain.wide|delegation|unauthorized_client/i.test(raw)) {
        friendly = 'Email permissions not authorised yet — admin needs to finish Workspace setup.';
      } else {
        friendly = raw;
      }
      addToast('Send failed: ' + friendly, 'error');
      p.sending = false; renderPage();
      return;
    }
    _pendingMobileEmail = null;
    addToast('Email sent ✓', 'success');
    renderPage();
  } catch (e) {
    addToast('Send failed: ' + (e.message || e), 'error');
    if (_pendingMobileEmail) { _pendingMobileEmail.sending = false; renderPage(); }
  }
}
function renderMobileEmailModal() {
  if (!_pendingMobileEmail) return '';
  var p = _pendingMobileEmail;
  var safeTo = (p.to || '').replace(/"/g, '&quot;');
  var safeSubj = (p.subject || '').replace(/"/g, '&quot;');
  var safeBody = (p.body || '').replace(/</g, '&lt;');
  var sending = !!p.sending;
  return ''
    + '<div class="modal-bg" onclick="if(event.target===this)cancelMobileEmail()" style="z-index:300">'
    +   '<div class="modal" style="max-width:520px;width:calc(100% - 24px);max-height:90vh;display:flex;flex-direction:column">'
    +     '<div class="modal-header" style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'
    +       '<h3 style="margin:0;font-size:15px;font-weight:700;font-family:Syne,sans-serif">Compose email</h3>'
    +       '<button onclick="cancelMobileEmail()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1;padding:0">×</button>'
    +     '</div>'
    +     '<div class="modal-body" style="padding:14px 18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto">'
    +       '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">To</label>'
    +         '<input type="email" value="' + safeTo + '" oninput="setMobileEmailField(\'to\', this.value)" placeholder="recipient@example.com" style="width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:none;box-sizing:border-box" />' +
    +       '</div>'
    +       '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Subject</label>'
    +         '<input id="mobEmailSubject" value="' + safeSubj + '" oninput="setMobileEmailField(\'subject\', this.value)" placeholder="Subject line" style="width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:none;box-sizing:border-box" />' +
    +       '</div>'
    +       '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Message</label>'
    +         '<textarea rows="8" oninput="setMobileEmailField(\'body\', this.value)" placeholder="Write your message…" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5">' + safeBody + '</textarea>' +
    +       '</div>'
    +     '</div>'
    +     '<div class="modal-footer" style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">'
    +       '<button onclick="cancelMobileEmail()" ' + (sending ? 'disabled' : '') + ' style="padding:9px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:' + (sending ? 'not-allowed' : 'pointer') + ';font-family:inherit;opacity:' + (sending ? '.5' : '1') + '">Cancel</button>'
    +       '<button onclick="sendMobileEmail()" ' + (sending ? 'disabled' : '') + ' style="padding:9px 18px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:13px;font-weight:700;cursor:' + (sending ? 'not-allowed' : 'pointer') + ';font-family:inherit;opacity:' + (sending ? '.7' : '1') + '">' + (sending ? 'Sending…' : '✈ Send') + '</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

// ── MOBILE: typed-note modal ─────────────────────────────────────────────────
// Lightweight bottom-sheet replacement for the desktop notes-tab inline form.
// Lives in module state so a renderPage triggered by setState (e.g. realtime
// echo) doesn't drop the user's typing.
var _pendingMobileNote = null;          // { entityId, entityType, text }
function openMobileNote(entityId, entityType) {
  _pendingMobileNote = { entityId: entityId, entityType: entityType, text: '' };
  renderPage();
  setTimeout(function(){
    var el = document.getElementById('mobNoteInput');
    if (el) el.focus();
  }, 60);
}
function cancelMobileNote() { _pendingMobileNote = null; renderPage(); }
function setMobileNoteDraft(value) { if (_pendingMobileNote) _pendingMobileNote.text = value; }
function saveMobileNote() {
  if (!_pendingMobileNote) return;
  var p = _pendingMobileNote;
  var text = (p.text || '').trim();
  if (!text) { addToast('Note is empty', 'warning'); return; }
  if (typeof saveActivityToEntity === 'function') {
    saveActivityToEntity(p.entityId, p.entityType, {
      id: 'a' + Date.now(), type: 'note', text: text,
      date: new Date().toISOString().slice(0,10),
      time: new Date().toTimeString().slice(0,5),
      by: (getCurrentUser()||{name:'Admin'}).name,
    });
  }
  _pendingMobileNote = null;
  addToast('Note saved', 'success');
  renderPage();
}
function renderMobileNoteModal() {
  if (!_pendingMobileNote) return '';
  var p = _pendingMobileNote;
  var safe = (p.text || '').replace(/</g, '&lt;');
  return ''
    + '<div class="modal-bg" onclick="if(event.target===this)cancelMobileNote()" style="z-index:300">'
    +   '<div class="modal" style="max-width:480px;width:calc(100% - 24px)">'
    +     '<div class="modal-header" style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +       '<h3 style="margin:0;font-size:15px;font-weight:700;font-family:Syne,sans-serif">Add a note</h3>'
    +       '<button onclick="cancelMobileNote()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1;padding:0">×</button>'
    +     '</div>'
    +     '<div class="modal-body" style="padding:14px 18px">'
    +       '<textarea id="mobNoteInput" rows="5" oninput="setMobileNoteDraft(this.value)" placeholder="What happened? Quick recap…" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5">' + safe + '</textarea>'
    +     '</div>'
    +     '<div class="modal-footer" style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end">'
    +       '<button onclick="cancelMobileNote()" style="padding:9px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:pointer;font-family:inherit">Cancel</button>'
    +       '<button onclick="saveMobileNote()" style="padding:9px 18px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Save note</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

// ── MOBILE: schedule-activity modal ──────────────────────────────────────────
// Pipedrive-replacement Phase 2. Bottom-sheet equivalent of the desktop
// schedule modal (openScheduleModal / saveScheduledActivity) but stripped to
// what fits on a phone — type chip row + quick-date chips + time + 1-line note.
//
// Save side does TWO writes:
//   1. activities timeline row (type=picked, scheduled:true, dueDate=picked
//      date) via the existing saveActivityToEntity. Same shape the desktop
//      modal writes, so the timeline reads it identically on both surfaces.
//   2. The Phase 1 next_activity_* triple on the deal/lead row — both
//      in-memory (so Phase 3's chip / Today view picks it up immediately on
//      this device) and via dbUpdate (so the other device picks it up via
//      realtime). This is the denormalized read path Phases 3/5/6/7 use.
//
// Lives in module state so a renderPage triggered by realtime echo doesn't
// drop the user's typing — same pattern as _pendingMobileNote.
var _pendingMobileSchedule = null;
// shape: { entityId, entityType, type, dateISO, time, note, hint }

function _mobileScheduleDefaults(hint) {
  // Default: type = hint || 'call', date = today, time = next round hour.
  // hint biases the type chip after a logged action — Phase 4's post-action
  // prompt will pass 'followUp' after a call, 'call' after an SMS, etc.
  var dt = new Date();
  dt.setHours(dt.getHours() + 1);
  dt.setMinutes(0, 0, 0);
  return {
    type: hint || 'call',
    dateISO: dt.toISOString().slice(0, 10),
    time: String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0'),
  };
}

function openMobileSchedule(entityId, entityType, hint) {
  var def = _mobileScheduleDefaults(hint);
  _pendingMobileSchedule = {
    entityId: entityId, entityType: entityType,
    type: def.type, dateISO: def.dateISO, time: def.time, note: '', hint: hint || null,
  };
  renderPage();
}
function cancelMobileSchedule() { _pendingMobileSchedule = null; renderPage(); }
function setMobileScheduleType(t) {
  if (!_pendingMobileSchedule) return;
  _pendingMobileSchedule.type = t;
  renderPage();
}
function setMobileScheduleQuickDate(slotKey) {
  if (!_pendingMobileSchedule) return;
  var dt = new Date();
  if (slotKey === 'tomorrow') dt.setDate(dt.getDate() + 1);
  else if (slotKey === '3d')  dt.setDate(dt.getDate() + 3);
  else if (slotKey === '7d')  dt.setDate(dt.getDate() + 7);
  // 'today' = no offset.
  _pendingMobileSchedule.dateISO = dt.toISOString().slice(0, 10);
  renderPage();
}
function setMobileScheduleDate(v) { if (_pendingMobileSchedule) _pendingMobileSchedule.dateISO = v; }
function setMobileScheduleTime(v) { if (_pendingMobileSchedule) _pendingMobileSchedule.time = v; }
function setMobileScheduleNote(v) { if (_pendingMobileSchedule) _pendingMobileSchedule.note = v; }

function saveMobileSchedule() {
  if (!_pendingMobileSchedule) return;
  var p = _pendingMobileSchedule;
  if (!p.dateISO || !p.time) { addToast('Pick a date and time', 'error'); return; }

  // Build the Phase 1 next-activity ISO timestamp. Browser local TZ; Supabase
  // stores TIMESTAMPTZ which round-trips cleanly through dbToDeal/dbToLead.
  var nextAt;
  try {
    nextAt = new Date(p.dateISO + 'T' + p.time + ':00').toISOString();
  } catch (e) {
    addToast('Invalid date/time', 'error'); return;
  }

  var typeMeta = (typeof getActivityType === 'function') ? getActivityType(p.type) : null;
  var typeLabel = (typeMeta && typeMeta.label) || (p.type.charAt(0).toUpperCase() + p.type.slice(1));
  var noteText = (p.note || '').trim();
  var actText = typeLabel + (noteText ? ' — ' + noteText : '');

  // Write #1: activities timeline row. Same shape as desktop's
  // saveScheduledActivity (08-sales-crm.js ~2319) — type, text, date, time,
  // scheduled:true, dueDate, by — so the desktop activity tab renders it
  // identically.
  if (typeof saveActivityToEntity === 'function') {
    saveActivityToEntity(p.entityId, p.entityType, {
      id: 'a' + Date.now(),
      type: p.type,
      text: actText,
      date: p.dateISO,
      time: p.time,
      duration: 30,
      by: (getCurrentUser() || { name: 'Admin' }).name,
      done: false,
      dueDate: p.dateISO,
      scheduled: true,
    });
  }

  // Write #2: Phase 1 next_activity_* triple. setState first so the chip /
  // Today view picks it up on this device immediately, then dbUpdate so the
  // other device picks it up via realtime (the deals/leads tables are on the
  // entities channel — see 01-persistence.js setupRealtime).
  var st = getState();
  if (p.entityType === 'deal') {
    setState({
      deals: (st.deals || []).map(function(d) {
        return d.id === p.entityId
          ? Object.assign({}, d, {
              nextActivityAt: nextAt, nextActivityType: p.type, nextActivityNote: noteText,
            })
          : d;
      })
    });
    if (typeof dbUpdate === 'function') {
      dbUpdate('deals', p.entityId, {
        nextActivityAt: nextAt, nextActivityType: p.type, nextActivityNote: noteText,
      });
    }
  } else if (p.entityType === 'lead') {
    setState({
      leads: (st.leads || []).map(function(l) {
        return l.id === p.entityId
          ? Object.assign({}, l, {
              nextActivityAt: nextAt, nextActivityType: p.type, nextActivityNote: noteText,
            })
          : l;
      })
    });
    if (typeof dbUpdate === 'function') {
      dbUpdate('leads', p.entityId, {
        nextActivityAt: nextAt, nextActivityType: p.type, nextActivityNote: noteText,
      });
    }
  }

  _pendingMobileSchedule = null;
  addToast('✓ ' + typeLabel + ' scheduled for ' + p.dateISO + ' at ' + p.time, 'success');
  renderPage();
}

function renderMobileScheduleModal() {
  if (!_pendingMobileSchedule) return '';
  var p = _pendingMobileSchedule;

  // 5 picker types, all from ACTIVITY_TYPES so we don't need to extend the
  // type whitelist or risk an activities-table CHECK-constraint failure.
  // SMS deliberately omitted — reps log "Follow-up" with a note like
  // "Texted re measure" instead, which keeps the type vocabulary small.
  // Boss can promote SMS to its own type later if dogfood demands it.
  var pickIds = ['call', 'email', 'meeting', 'task', 'followUp'];
  var allTypes = (typeof getPickableActivityTypes === 'function') ? getPickableActivityTypes() : [];
  var types = pickIds
    .map(function(id) { return allTypes.find(function(t){ return t.id === id; }); })
    .filter(Boolean);

  // Quick-date offsets — same shape as desktop's quickSlots, minus the
  // "In 1h / In 3h" entries (those are time-only and the time input handles it).
  function fmtQD(off) {
    var dt = new Date();
    dt.setDate(dt.getDate() + off);
    return dt.toISOString().slice(0, 10);
  }
  var quick = [
    { key: 'today',    label: 'Today',    iso: fmtQD(0) },
    { key: 'tomorrow', label: 'Tomorrow', iso: fmtQD(1) },
    { key: '3d',       label: '+3 days',  iso: fmtQD(3) },
    { key: '7d',       label: '+7 days',  iso: fmtQD(7) },
  ];

  function chip(active, label, onclick) {
    var bg = active ? '#fff5f6' : '#fff';
    var col = active ? '#c41230' : '#6b7280';
    var bd = active ? '#c41230' : '#e5e7eb';
    return '<button onclick="' + onclick + '" style="padding:8px 14px;border:1px solid ' + bd + ';border-radius:20px;font-size:13px;cursor:pointer;font-family:inherit;background:' + bg + ';color:' + col + ';font-weight:600">' + label + '</button>';
  }

  var typeChips = types.map(function(t) {
    return chip(p.type === t.id, t.icon + ' ' + t.label, "setMobileScheduleType('" + t.id + "')");
  }).join('');

  var quickChips = quick.map(function(q) {
    return chip(p.dateISO === q.iso, q.label, "setMobileScheduleQuickDate('" + q.key + "')");
  }).join('');

  var safeNote = (p.note || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  return ''
    + '<div class="modal-bg" onclick="if(event.target===this)cancelMobileSchedule()" style="z-index:300">'
    +   '<div class="modal" style="max-width:480px;width:calc(100% - 24px)">'
    +     '<div class="modal-header" style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +       '<h3 style="margin:0;font-size:15px;font-weight:700;font-family:Syne,sans-serif">Schedule next activity</h3>'
    +       '<button onclick="cancelMobileSchedule()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1;padding:0">×</button>'
    +     '</div>'
    +     '<div class="modal-body" style="padding:14px 18px;display:flex;flex-direction:column;gap:14px">'
    +       '<div>'
    +         '<label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Type</label>'
    +         '<div style="display:flex;flex-wrap:wrap;gap:6px">' + typeChips + '</div>'
    +       '</div>'
    +       '<div>'
    +         '<label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">When</label>'
    +         '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">' + quickChips + '</div>'
    +         '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'
    +           '<input type="date" value="' + p.dateISO + '" oninput="setMobileScheduleDate(this.value)" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box">'
    +           '<input type="time" value="' + p.time + '" oninput="setMobileScheduleTime(this.value)" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box">'
    +         '</div>'
    +       '</div>'
    +       '<div>'
    +         '<label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Note (optional)</label>'
    +         '<input id="mobSchedNoteInput" oninput="setMobileScheduleNote(this.value)" placeholder="One-line reminder…" value="' + safeNote + '" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box">'
    +       '</div>'
    +     '</div>'
    +     '<div class="modal-footer" style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end">'
    +       '<button onclick="cancelMobileSchedule()" style="padding:9px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:pointer;font-family:inherit">Cancel</button>'
    +       '<button onclick="saveMobileSchedule()" style="padding:9px 18px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Schedule</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

// ── MOBILE: Deal/Lead detail — boss's reference layout ───────────────────────
// Closely follows SpartanSalesMobile.jsx LeadDetail/DealDetail: black hero,
// quick action bar (Call/SMS/Email), flat key-value Details card, optional
// Notes, bottom action buttons. Drops nearby-leads, quote list, status grid,
// stage bar, full activity timeline — boss intentionally trimmed those.
function _renderEntityDetailMobile(opts) {
  var entityType = opts.entityType;
  var entityId = opts.entityId;
  var title = opts.title;
  var owner = opts.owner;
  var contact = opts.contact || {};
  var backOnclick = opts.backOnclick;
  var backLabel = opts.backLabel || 'Back';
  var st = getState();
  var entity = entityType === 'lead'
    ? (st.leads || []).find(function(l){ return l.id === entityId; })
    : (st.deals || []).find(function(d){ return d.id === entityId; });
  if (!entity) return '<div style="padding:40px;text-align:center;color:#9ca3af">Not found</div>';

  // Resolve fields — prefer entity-level data, fall back to contact.
  var phone = entity.phone || contact.phone || '';
  var email = entity.email || contact.email || '';
  var addr = [
    entity.street || contact.street,
    entity.suburb || contact.suburb,
    entity.state || contact.state,
    entity.postcode || contact.postcode,
  ].filter(Boolean).join(', ');
  var source = entity.source || contact.source || '';
  var created = entity.created || '';
  var status, statusCol;
  if (entityType === 'lead') {
    status = entity.status || 'New';
    var leadStatusColors = { New:'#3b82f6', Contacted:'#f59e0b', Qualified:'#22c55e', Unqualified:'#9ca3af', Archived:'#6b7280' };
    statusCol = leadStatusColors[status] || '#9ca3af';
  } else {
    var pl = (typeof PIPELINES !== 'undefined' ? PIPELINES : []).find(function(p){ return p.id === entity.pid; });
    var stage = pl && pl.stages.find(function(s){ return s.id === entity.sid; });
    status = stage ? stage.name : '—';
    statusCol = stage ? stage.col : '#9ca3af';
  }

  function fmt$$(n) { return '$' + (Number(n)||0).toLocaleString('en-AU', {maximumFractionDigits:0}); }
  function _esc(s) { return String(s||'').replace(/'/g, "\\'"); }
  function fmtRel(iso) {
    if (!iso) return '';
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (isNaN(days)) return iso;
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + 'd ago';
    if (days < 30) return Math.floor(days/7) + 'w ago';
    return Math.floor(days/30) + 'mo ago';
  }

  // Won / Not Proceeding pill (top-right of hero, deals only).
  var wonLostBadge = '';
  if (entityType === 'deal') {
    if (entity.won) wonLostBadge = '<span style="font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px;background:#22c55e;color:#fff;letter-spacing:.04em">✓ WON</span>';
    else if (entity.lost) wonLostBadge = '<span style="font-size:10px;font-weight:800;padding:4px 10px;border-radius:20px;background:#ef4444;color:#fff;letter-spacing:.04em">NOT PROCEEDING</span>';
  }

  // Hero subtitle.
  var subtitle = (source ? source + ' · ' : '') + (created ? 'arrived ' + fmtRel(created) : '');

  // Optional value display (gold) — leads show "~ $X estimate"; deals show "$X".
  var valHtml = '';
  if (entity.val && entity.val > 0) {
    var prefix = entityType === 'lead' ? '~' : '';
    var suffix = entityType === 'lead' ? ' estimate' : '';
    valHtml = '<div style="font-size:24px;font-weight:800;margin-top:8px;font-family:Syne,sans-serif;color:#fbbf24">' + prefix + fmt$$(entity.val) + suffix + '</div>';
  }

  // Display name for the Twilio prompt + tappable rows. Leads carry fn/ln
  // on the entity itself; deals look up the linked contact, falling back to
  // the deal title (which is usually the customer's site address).
  var contactName = entityType === 'lead'
    ? ((entity.fn || '') + ' ' + (entity.ln || '')).trim()
    : (contact && ((contact.fn || '') + ' ' + (contact.ln || '')).trim()) || (entity.title || '');

  // Quick action bar — Call / SMS / Email / Photo. Shows whatever's available
  // (phone-less leads still get the photo button; email-less leads still get
  // call/sms). Photo always renders since every entity supports photos.
  // CALL goes through the Twilio PSTN-bridge (twilioCall → dialViaTwilioBridge
  // on native) so we get recording + call_logs + activity timeline.
  // Top action bar — Call/SMS/Email moved to the floating FAB above the
  // bottom nav (renderMobileFAB in 07-shared-ui.js, Pipedrive-replacement).
  // Photo stays here because it doesn't fit on the FAB and isn't a contact
  // action — it's an on-site capture that belongs near the deal context.
  var actionBar = '<div style="margin-top:-10px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);display:grid;grid-template-columns:1fr;margin-bottom:14px">' +
    '<button onclick="takeMobilePhoto(\'' + _esc(entity.id) + '\',\'' + entityType + '\')" style="display:flex;flex-direction:row;align-items:center;justify-content:center;padding:14px 4px;gap:8px;color:#0a0a0a;text-decoration:none;border:none;background:none;cursor:pointer;font-family:inherit">' +
      '<span style="font-size:18px">📸</span>' +
      '<span style="font-size:11px;font-weight:700;letter-spacing:.04em">TAKE PHOTO</span>' +
    '</button>' +
  '</div>';

  // Files section — reads from the same getEntityFiles() store the desktop
  // Files tab uses. Image-extension entries render as 84px thumbnails (tap
  // → full-size in system browser). Non-image entries render as a single
  // row with the filename and uploader. Hidden when the entity has none.
  var photosHtml = '';
  var entFiles = (typeof getEntityFiles === 'function') ? getEntityFiles(entityType, entity.id) : [];
  if (entFiles && entFiles.length) {
    var imgRe = /\.(jpe?g|png|gif|webp|heic)$/i;
    var imgs = entFiles.filter(function(f){ return f && f.dataUrl && imgRe.test(f.name || ''); });
    var others = entFiles.filter(function(f){ return f && f.dataUrl && !imgRe.test(f.name || ''); });
    var blocks = [];
    if (imgs.length) {
      var thumbs = imgs.slice(0, 12).map(function(f){
        var safeUrl = String(f.dataUrl || '').replace(/"/g, '&quot;');
        return '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="flex-shrink:0;width:84px;height:84px;border-radius:8px;overflow:hidden;display:block;box-shadow:0 1px 3px rgba(0,0,0,.06);background:#f3f4f6"><img src="' + safeUrl + '" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block" alt=""></a>';
      }).join('');
      blocks.push('<div style="display:flex;gap:8px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px">' + thumbs + '</div>');
    }
    if (others.length) {
      blocks.push('<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-top:' + (imgs.length ? '8px' : '0') + '">' +
        others.slice(0, 8).map(function(f, i){
          var safeUrl = String(f.dataUrl || '').replace(/"/g, '&quot;');
          var name = String(f.name || 'File').replace(/</g, '&lt;');
          return '<a href="' + safeUrl + '" target="_blank" rel="noopener" style="display:flex;align-items:center;gap:10px;padding:11px 14px;text-decoration:none;color:#374151;' + (i > 0 ? 'border-top:1px solid #f3f4f6;' : '') + '">' +
            '<span style="font-size:18px;flex-shrink:0">📎</span>' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</div>' +
              (f.uploadedBy ? '<div style="font-size:10px;color:#9ca3af;margin-top:1px">Uploaded by ' + f.uploadedBy + '</div>' : '') +
            '</div>' +
            '<span style="color:#9ca3af;font-size:14px">›</span>' +
          '</a>';
        }).join('') +
      '</div>');
    }
    photosHtml = '<h2 style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#6b7280;margin:18px 4px 8px">Files <span style="color:#9ca3af;font-weight:600">' + entFiles.length + '</span></h2>' +
      blocks.join('');
  }

  // Details rows (skip empties so the card never has dashes).
  // row(label, val)            — static row
  // row(label, val, { tap })  — tappable row. `tap` is either a URL
  //   (tel:/mailto:/sms:/http(s):) which renders as <a>, or a JS
  //   expression which renders as <div onclick=...>. Tappable rows get
  //   blue value text + a › chevron to signal they're actionable, and a
  //   slightly bigger 13px tap target.
  function row(label, val, opts) {
    if (!val || val === '—') return '';
    if (opts && opts.tap) {
      var isUrl = /^(tel:|mailto:|sms:|https?:)/.test(opts.tap);
      var openAttr = isUrl
        ? 'href="' + String(opts.tap).replace(/"/g,'&quot;') + '"' + (opts.tap.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '')
        : 'onclick="' + opts.tap + '"';
      var tag = isUrl ? 'a' : 'div';
      return '<' + tag + ' ' + openAttr + ' style="display:flex;justify-content:space-between;align-items:center;padding:13px 14px;border-bottom:1px solid #f3f4f6;gap:12px;text-decoration:none;color:inherit;cursor:pointer">' +
        '<span style="font-size:11px;color:#9ca3af;flex-shrink:0">' + label + '</span>' +
        '<span style="display:flex;align-items:center;gap:6px;min-width:0">' +
          '<span style="font-size:13px;font-weight:600;color:#3b82f6;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">' + val + '</span>' +
          '<span style="color:#9ca3af;font-size:14px;flex-shrink:0;line-height:1">›</span>' +
        '</span>' +
      '</' + tag + '>';
    }
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 14px;border-bottom:1px solid #f3f4f6;gap:12px">' +
      '<span style="font-size:11px;color:#9ca3af;flex-shrink:0">' + label + '</span>' +
      '<span style="font-size:13px;font-weight:600;color:#374151;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">' + val + '</span>' +
    '</div>';
  }
  var statusBadge = '<span style="display:inline-block;font-size:10px;font-weight:700;padding:3px 9px;border-radius:10px;background:' + statusCol + '20;color:' + statusCol + ';border:1px solid ' + statusCol + '40">' + status + '</span>';
  var ownerVal = owner || (entityType === 'lead'
    ? '<span style="display:inline-block;font-size:10px;font-weight:700;padding:3px 9px;border-radius:10px;background:#fef3c7;color:#92400e;border:1px solid #fde68a">Unassigned</span>'
    : '—');
  // Phone row tap routes through twilioCall (Twilio PSTN-bridge on native,
  // existing WebRTC desktop flow elsewhere) — same path as the CALL button
  // in the quick-action bar above so behaviour is consistent.
  var phoneTap = phone ? "twilioCall('" + _esc(phone) + "','" + _esc(entity.id) + "','" + entityType + "','" + _esc(contactName) + "')" : null;
  // Email row opens the in-app composer (matches the EMAIL quick-action
  // button at the top of the page). Falls back to mailto: if openMobileEmail
  // isn't defined yet (during very early load).
  var emailTap = email ? "openMobileEmail('" + _esc(entity.id) + "','" + entityType + "','" + _esc(email) + "')" : null;
  var addrTap = addr ? 'https://maps.google.com/?q=' + encodeURIComponent(addr) : null;
  var detailsCard = '<div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
    row('Phone', phone, { tap: phoneTap }) +
    row('Email', email, { tap: emailTap }) +
    row('Address', addr, { tap: addrTap }) +
    row(entityType === 'deal' ? 'Stage' : 'Status', statusBadge) +
    row(entityType === 'deal' ? 'Rep' : 'Owner', ownerVal) +
    row('Source', source) +
    row('Branch', entity.branch) +
    row('Created', created ? (fmtRel(created) + (created.length > 5 ? ' (' + created + ')' : '')) : '') +
  '</div>';

  function sec(title) {
    return '<h2 style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#6b7280;margin:18px 4px 8px">' + title + '</h2>';
  }

  // Notes
  var notesHtml = entity.notes
    ? sec('Notes') + '<div style="background:#fff;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,.06);font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.6">' + entity.notes + '</div>'
    : '';

  // Bottom actions (per type). Common across both: a + Schedule button for
  // booking the next activity (Pipedrive-replacement Phase 2 — replaces the
  // earlier + Note button; the schedule modal's optional note field covers
  // the same use case). Editing is desktop-only — sales reps on mobile log
  // activity, they don't tweak deal fields.
  var bottomActions = '';
  // Tap-target sizing: padding:13px + font-size:14px + line-height:1.2 ≈
  // 44px button height, the iOS HIG / Material minimum. Long labels
  // (e.g. "→ Quote Sent") get nowrap+ellipsis so the row stays balanced
  // on narrow screens — three buttons in a flex row with 8px gaps.
  var btnBase = 'flex:1;min-width:0;padding:13px 10px;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  var schedBtn = '<button onclick="openMobileSchedule(\'' + _esc(entity.id) + '\',\'' + entityType + '\')" style="' + btnBase + ';border:1px solid #e5e7eb;background:#fff;color:#374151">+ Schedule</button>';
  var rows = [];
  if (entityType === 'lead') {
    var canEdit = typeof canEditLead === 'function' && canEditLead(entity);
    var actions = [schedBtn];
    if (!entity.owner && !entity.converted && canEdit) {
      actions.push('<button onclick="claimLead(\'' + _esc(entity.id) + '\')" style="' + btnBase + ';border:none;background:#c41230;color:#fff">+ Claim this lead</button>');
    } else if (!entity.converted) {
      actions.push('<button onclick="openConvertLeadModal(\'' + _esc(entity.id) + '\')" style="' + btnBase + ';border:none;background:#c41230;color:#fff">Convert to Deal →</button>');
    }
    rows.push(actions);
  } else {
    // Deal: three-button row.
    //   - Mark Lost (red)        — opens existing reason+note modal
    //   - + Schedule (white)     — opens the mobile schedule modal (Phase 2)
    //   - Advance / Won / Reopen (green) — depends on deal state
    var pl2 = (typeof PIPELINES !== 'undefined' ? PIPELINES : []).find(function(p){ return p.id === entity.pid; });
    var stages2 = pl2 ? pl2.stages.slice().sort(function(a,b){ return a.ord - b.ord; }).filter(function(s){ return !s.isLost; }) : [];
    var curIdx2 = stages2.findIndex(function(s){ return s.id === entity.sid; });
    var nextStage = curIdx2 >= 0 ? stages2[curIdx2 + 1] : null;
    var greenBtn;
    if (entity.won) {
      // Reopen — admin-only per existing unwindDealWon policy. Hide for non-admins.
      var cu = getCurrentUser() || {};
      if (cu.role === 'admin') {
        greenBtn = '<button onclick="unwindDealWon(\'' + _esc(entity.id) + '\')" style="' + btnBase + ';border:none;background:#0a0a0a;color:#fff">↺ Reopen Deal</button>';
      } else {
        greenBtn = '';
      }
    } else if (entity.lost) {
      greenBtn = '';   // Lost is terminal at the moment; reopening lost is desktop-only.
    } else if (nextStage && nextStage.isWon) {
      greenBtn = '<button onclick="markDealWon(\'' + _esc(entity.id) + '\')" style="' + btnBase + ';border:none;background:#22c55e;color:#fff">✓ Mark Won</button>';
    } else if (nextStage) {
      greenBtn = '<button onclick="advanceDealStageMobile(\'' + _esc(entity.id) + '\')" style="' + btnBase + ';border:none;background:#22c55e;color:#fff" title="Move to ' + nextStage.name + '">→ ' + nextStage.name + '</button>';
    } else {
      greenBtn = '';
    }
    var lostBtn = (!entity.won && !entity.lost)
      ? '<button onclick="markDealLost(\'' + _esc(entity.id) + '\')" style="' + btnBase + ';background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">✗ Mark Lost</button>'
      : '';
    var dealRow = [lostBtn, schedBtn, greenBtn].filter(Boolean);
    if (dealRow.length) rows.push(dealRow);
  }
  if (rows.length) {
    bottomActions = rows.map(function(r){
      return '<div style="margin-top:12px;display:flex;gap:8px">' + r.join('') + '</div>';
    }).join('');
  }

  // Compose. Hero pulls -12px to extend edge-to-edge over main's padding.
  return '' +
    '<div style="margin:-12px -12px 0;padding:14px 16px 28px;background:#0a0a0a;color:#fff">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">' +
        '<button onclick="' + backOnclick + '" style="background:none;border:none;color:#fff;font-size:13px;cursor:pointer;font-family:inherit;padding:4px 0;display:inline-flex;align-items:center;gap:4px;font-weight:500">‹ ' + backLabel + '</button>' +
        wonLostBadge +
      '</div>' +
      '<h1 style="font-size:20px;font-weight:800;margin:0;font-family:Syne,sans-serif;line-height:1.2">' + title + '</h1>' +
      (subtitle ? '<div style="font-size:11px;opacity:.7;margin-top:4px">' + subtitle + '</div>' : '') +
      valHtml +
    '</div>' +
    actionBar +
    sec('Details') +
    detailsCard +
    photosHtml +
    notesHtml +
    bottomActions;
}

function renderEntityDetail({
  entityType, entityId,
  title, owner,
  stageBarHtml,               // optional stage progress bar HTML
  wonLostHtml,                // buttons top right
  leftSidebarHtml,            // Summary + Details + Person + Org
  backOnclick, backLabel,
  activities,
  contact,
}) {
  // Native wrapper: use the boss's stripped-down mobile layout (hero +
  // quick actions + flat details + notes + bottom actions). Desktop flow
  // continues below unchanged.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    return _renderEntityDetailMobile({ entityType: entityType, entityId: entityId, title: title, owner: owner, contact: contact, backOnclick: backOnclick, backLabel: backLabel });
  }
  const TABS = [
    { id: 'activity', label: 'Activity', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    { id: 'notes', label: 'Notes', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' },
    { id: 'call', label: 'Call', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>' },
    { id: 'sms', label: 'SMS', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' },
    { id: 'email', label: 'Email', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' },
    { id: 'files', label: 'Files', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>' },
  ];

  // Inline form content
  const inlineForm = renderTabForm(entityId, entityType, detailTab, contact);

  // ── History items ─────────────────────────────────────────────────────────
  const AICON = { note: '📝', call: '📞', email: '✉️', task: '☑️', stage: '🔀', created: '⭐', meeting: '📅', file: '📎', edit: '✏️', photo: '📸' };
  const ACOLBORDER = { note: '#f59e0b', call: '#3b82f6', email: '#8b5cf6', task: '#22c55e', stage: '#9ca3af', created: '#ef4444', meeting: '#0d9488', file: '#6366f1', edit: '#64748b', photo: '#ec4899' };

  const historyItems = activities.length === 0
    ? `<div style="padding:40px 20px;text-align:center">
        <div style="font-size:32px;margin-bottom:10px">📋</div>
        <div style="font-size:14px;font-weight:500;color:#374151;margin-bottom:4px">No activity yet</div>
        <div style="font-size:13px;color:#9ca3af">Scheduled activities, pinned notes and emails will appear here.</div>
        <button onclick="openScheduleModal('${entityId}','${entityType}','call')" class="btn-r" style="margin-top:16px;font-size:12px">+ Schedule an activity</button>
      </div>`
    : `<div>
        ${activities.map((act, idx) => `
          <div style="display:flex;gap:0;padding:14px 20px;${idx < activities.length - 1 ? 'border-bottom:1px solid #f3f4f6' : ''}">
            <!-- Icon column -->
            <div style="display:flex;flex-direction:column;align-items:center;margin-right:14px;flex-shrink:0">
              <div style="width:36px;height:36px;border-radius:50%;background:${ACOLBORDER[act.type] || '#9ca3af'}18;border:2px solid ${ACOLBORDER[act.type] || '#9ca3af'}40;display:flex;align-items:center;justify-content:center;font-size:16px">${AICON[act.type] || '📌'}</div>
              ${idx < activities.length - 1 ? `<div style="width:2px;flex:1;background:#f3f4f6;margin-top:6px;min-height:20px"></div>` : ''}
            </div>
            <!-- Content -->
            <div style="flex:1;min-width:0;padding-bottom:4px">
              <!-- Header row -->
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px">
                <div>
                  <span style="font-size:13px;font-weight:600;color:#111">${act.type === 'created' ? 'Created' : ''}${act.type === 'stage' ? 'Stage change' : ''}</span>
                  ${act.subject ? ('<span style="font-size:13px;font-weight:600;color:#111">' + act.subject + '</span>' + (act.type === 'email' ? ('<span class="etrack" style="display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border-radius:20px;margin-left:8px;' + (act.opens > 0 ? 'background:#f0fdf4;color:#15803d' : 'background:#f3f4f6;color:#9ca3af') + '"> 👁 ' + (act.opens > 0 ? act.opens + '× opened' : 'Not opened') + (act.opens > 0 && act.openedAt ? ' <span style="opacity:.7">· ' + act.openedAt + '</span>' : '') + '<div class="etrack-tip">' + emailTrackTip(act, getState().emailSent) + '</div></span>') : '')) : ''}
                  ${!act.subject && act.type !== 'created' && act.type !== 'stage' ? `<span style="font-size:13px;font-weight:600;color:#111">${act.type.charAt(0).toUpperCase() + act.type.slice(1)}${act.scheduled ? ` <span style="font-size:11px;font-weight:600;color:#0d9488;background:#ccfbf1;padding:1px 7px;border-radius:20px">Scheduled</span>` : ''}</span>` : ''}
                  ${act._source ? `<span style="font-size:11px;color:#9ca3af;margin-left:6px">via ${act._source === 'deal' ? act._dealTitle || 'deal' : act._leadName || 'lead'}</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                  ${act.by ? `<span style="font-size:11px;color:#9ca3af">${act.by}</span>` : ''}
                  <span style="font-size:11px;color:#d1d5db">·</span>
                  <span style="font-size:11px;color:#9ca3af">${act.date || ''} ${act.time || ''}</span>
                </div>
              </div>

              <!-- Body. Brief 6 Phase 1: email activities sanitise + render
                   their HTML body via _sanitizeEmailBody (handles plain-text
                   vs HTML internally, including pre-wrap for plain text).
                   Other activity types stay on the existing pre-wrap raw
                   render — their text is plain and includes intentional
                   newlines from edit/note/call activities. -->
              ${act.text && act.type !== 'stage' ? (
                // Image-URL → render inline <img>. Catches the mobile camera
                // capture flow (type='file', text=publicUrl) AND the older
                // type='photo' shape if any of those rows exist. Anything
                // else falls through to the existing text/email rendering.
                /^https?:\/\/.+\.(jpe?g|png|gif|webp|heic)(\?.*)?$/i.test(act.text)
                  ? `<a href="${String(act.text).replace(/"/g,'&quot;')}" target="_blank" rel="noopener" style="display:inline-block;margin-top:4px;border-radius:8px;overflow:hidden;border:1px solid #f3f4f6;max-width:280px;box-shadow:0 1px 3px rgba(0,0,0,.06)"><img src="${String(act.text).replace(/"/g,'&quot;')}" loading="lazy" style="display:block;max-width:280px;max-height:280px;object-fit:cover" alt="Photo"></a>`
                  : (act.type === 'email' && typeof _sanitizeEmailBody === 'function'
                    ? `<div style="font-size:13px;color:#374151;line-height:1.6;background:#f9fafb;padding:10px 14px;border-radius:8px;border-left:3px solid ${ACOLBORDER[act.type] || '#e5e7eb'};overflow:hidden">${_sanitizeEmailBody(act.text)}</div>`
                    : `<div style="font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap;background:#f9fafb;padding:10px 14px;border-radius:8px;border-left:3px solid ${ACOLBORDER[act.type] || '#e5e7eb'}">${act.text}</div>`)
                ) : ''}
              ${act.type === 'stage' ? `<div style="font-size:13px;color:#6b7280">${act.text}</div>` : ''}

              <!-- Email tracking row (emails only) -->
              ${act.type === 'email' ? ('<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">'
        + '<div class="etrack" style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;' + (act.opens > 0 ? 'background:#f0fdf4;color:#15803d;border:1px solid #86efac' : 'background:#f9fafb;color:#9ca3af;border:1px solid #e5e7eb') + '">'
        + ' 👁 ' + (act.opens > 0 ? act.opens + '× opened' : 'Not yet opened')
        + (act.opens > 0 && act.openedAt ? ' <span style="font-weight:400;opacity:.8">· ' + act.openedAt + '</span>' : '')
        + '<div class="etrack-tip">' + emailTrackTip(act, getState().emailSent) + '</div>'
        + '</div>'
        + (act.clicked ? '<div style="display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd">🔗 Clicked</div>' : '')
        + '<button onclick="emailReplyFromActivity(\'' + act.id + '\',\'' + entityId + '\',\'' + entityType + '\')" style="padding:3px 10px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;font-size:11px;cursor:pointer;font-family:inherit;color:#6b7280">↩ Reply</button>'
        + '</div>') : ''}

              <!-- Task actions -->
              ${act.type === 'task' || act.type === 'call' || act.type === 'meeting' ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">
                ${act.dueDate ? `<span style="font-size:11px;background:#fef9c3;color:#92400e;padding:2px 8px;border-radius:20px;font-weight:500">📅 ${act.dueDate}${act.time ? ' ' + act.time : ''}</span>` : ''}
                ${act.duration ? `<span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px 8px;border-radius:20px">⏱ ${act.duration < 60 ? act.duration + 'min' : act.duration / 60 + 'h'}</span>` : ''}
                <button onclick="toggleActivityDone('${entityId}','${act.id}','${entityType}')" style="font-size:11px;padding:3px 12px;border-radius:20px;border:1px solid;cursor:pointer;font-family:inherit;font-weight:600;${act.done ? 'background:#dcfce7;border-color:#86efac;color:#15803d' : 'background:#f9fafb;border-color:#e5e7eb;color:#6b7280'}">${act.done ? '✓ Done' : 'Mark done'}</button>
                ${act.calLink ? `<a href="${act.calLink}" target="_blank" style="font-size:11px;color:#0369a1;text-decoration:none;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border:1px solid #bae6fd;border-radius:20px;background:#f0f9ff">📅 Calendar</a>` : ''}
              </div>`: ''}
            </div>
          </div>`).join('')}
      </div>`;

  const scheduledActs = activities.filter(a => a.scheduled && !a.done);

  return `
  <div style="margin:-24px;background:#f8f9fa;min-height:calc(100vh - 56px)">

    <!-- ── TOP BAR ── -->
    <div style="background:#fff;border-bottom:1px solid #e5e7eb;padding:0 24px">
      <div style="display:flex;align-items:center;gap:10px;padding:12px 0 8px;flex-wrap:wrap">
        <button onclick="${backOnclick}" style="font-size:13px;color:#6b7280;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500;display:flex;align-items:center;gap:4px;flex-shrink:0" onmouseover="this.style.color='#c41230'" onmouseout="this.style.color='#6b7280'">
          ← ${backLabel}
        </button>
        <span style="color:#e5e7eb">|</span>
        <h1 style="font-size:17px;font-weight:800;margin:0;font-family:Syne,sans-serif;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${title}</h1>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:6px;padding:4px 10px;background:${owner ? '#f3f4f6' : '#fef3c7'};border-radius:8px;border:${owner ? 'none' : '1px solid #fde68a'}">
            <div style="width:22px;height:22px;background:${owner ? '#c41230' : '#f59e0b'};border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${owner ? owner.split(' ').map(w => w[0]).join('').slice(0, 2) : '?'}</div>
            <span style="font-size:12px;font-weight:${owner ? 500 : 700};color:${owner ? '#374151' : '#92400e'}">${owner || 'Unassigned'}</span>
          </div>
          ${wonLostHtml || ''}
        </div>
      </div>
      <!-- Stage bar -->
      ${stageBarHtml ? `<div style="display:flex;overflow-x:auto;border-top:1px solid #f0f0f0">${stageBarHtml}</div>` : ``}
    </div>

    <!-- ── BODY: Left sidebar + Right main ── -->
    <div style="display:grid;grid-template-columns:300px 1fr;min-height:calc(100vh - 120px)">

      <!-- ── LEFT SIDEBAR ── -->
      <div style="background:#fff;border-right:1px solid #e5e7eb;overflow-y:auto;padding:0 0 40px">
        ${leftSidebarHtml || ''}
      </div>

      <!-- ── RIGHT MAIN: Tabs + Feed ── -->
      <div style="overflow-y:auto;padding:0 0 40px">

        <!-- Focus section (scheduled upcoming) -->
        ${scheduledActs.length > 0 ? `<div style="padding:14px 20px 0">
          <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">
            Focus <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          </div>
          ${scheduledActs.slice(0, 3).map(act => `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:13px;font-weight:600;color:#92400e">${act.text.split('\n')[0]}</div>
              <div style="font-size:12px;color:#b45309;margin-top:2px">📅 ${act.date} ${act.time || ''} · ${act.duration ? act.duration + 'min' : ''}</div>
            </div>
            <button onclick="toggleActivityDone('${entityId}','${act.id}','${entityType}')" style="font-size:11px;padding:3px 10px;border:1px solid #fcd34d;border-radius:20px;background:#fff;cursor:pointer;font-family:inherit;color:#92400e;font-weight:600;white-space:nowrap">Mark done</button>
          </div>`).join('')}
        </div>`: ''}

        <!-- Tab bar -->
        <div style="display:flex;border-bottom:1px solid #e5e7eb;background:#fff;position:sticky;top:0;z-index:10">
          ${TABS.map(t => `<button onclick="detailTab='${t.id}';renderPage()" style="display:flex;align-items:center;gap:5px;padding:11px 16px;border:none;border-bottom:2px solid ${detailTab === t.id ? '#1a1a1a' : 'transparent'};background:none;font-size:13px;font-weight:${detailTab === t.id ? '600' : '400'};color:${detailTab === t.id ? '#1a1a1a' : '#6b7280'};cursor:pointer;font-family:inherit;white-space:nowrap">${t.icon} ${t.label}</button>`).join('')}
          <div style="flex:1"></div>
          <button onclick="openScheduleModal('${entityId}','${entityType}','call')" class="btn-r" style="font-size:12px;margin:8px 16px 8px auto;padding:5px 12px;align-self:center">+ Activity</button>
        </div>

        <!-- Inline form -->
        <div style="background:#fff;border-bottom:1px solid ${detailTab === 'activity' ? 'transparent' : '#e5e7eb'}">
          ${inlineForm}
          ${detailTab === 'activity' ? renderInlineMapScheduler(entityId, entityType) : ''}
        </div>

        <!-- History header -->
        <div style="padding:14px 20px 8px;display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:700;color:#374151">History</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
          <span style="font-size:12px;color:#9ca3af">${activities.length} item${activities.length !== 1 ? 's' : ''}</span>
        </div>

        <!-- History feed -->
        <div style="background:#fff;border-radius:0;margin:0 0 16px">
          ${historyItems}
        </div>

        <!-- Gmail threads (if contact has email) -->
        ${contact && contact.email ? renderGmailInbox(contact.email) : ''}

        <!-- Calendar -->
        ${renderCalendarWidget(entityId, entityType, contact ? contact.email : '')}

      </div>
    </div>
  </div>
  ${schedActivityModal ? renderScheduleModal() : ''}
  ${gmailComposerOpen ? renderGmailComposer() : ''}
  ${renderCalendarCreateModal()}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// ENTITY FILES (deals / leads / contacts) — localStorage + Supabase mirror
// Mirrors the job-files pattern (getJobFiles / addJobFile / removeJobFile) so
// every detail-view Files tab behaves the same.
// Caveat: base64 files in localStorage share the ~5 MB per-domain quota. For
// heavier usage, graduate this to Supabase Storage and keep only URLs here.
// ══════════════════════════════════════════════════════════════════════════════
function getEntityFiles(entityType, entityId) {
  try { return JSON.parse(localStorage.getItem('spartan_files_' + entityType + '_' + entityId) || '[]'); }
  catch (e) { return []; }
}
function saveEntityFiles(entityType, entityId, files) {
  localStorage.setItem('spartan_files_' + entityType + '_' + entityId, JSON.stringify(files));
}
function addEntityFile(entityType, entityId, name, dataUrl) {
  var files = getEntityFiles(entityType, entityId);
  var user = getCurrentUser() || { name: 'Admin' };
  files.push({
    id: 'file_' + Date.now(),
    name: name,
    dataUrl: dataUrl,
    size: dataUrl ? dataUrl.length : 0,
    uploadedBy: user.name,
    uploadedAt: new Date().toISOString()
  });
  saveEntityFiles(entityType, entityId, files);
  if (typeof _sb !== 'undefined' && _sb) {
    try { dbInsert('entity_files', { entity_type: entityType, entity_id: entityId, name: name, data_url: dataUrl, uploaded_by: user.name }); } catch (e) { }
  }
  // Log to activity timeline so the History pane shows the upload.
  saveActivityToEntity(entityId, entityType, {
    id: 'a' + Date.now(), type: 'file',
    text: 'File uploaded: ' + name,
    date: new Date().toISOString().slice(0, 10),
    by: user.name, done: false, dueDate: ''
  });
  addToast('Uploaded: ' + name, 'success');
}
function removeEntityFile(entityType, entityId, fileId) {
  var files = getEntityFiles(entityType, entityId);
  var f = files.find(function (x) { return x.id === fileId; });
  saveEntityFiles(entityType, entityId, files.filter(function (x) { return x.id !== fileId; }));
  if (f) addToast('Removed: ' + f.name, 'warning');
  renderPage();
}
function handleEntityFileUpload(entityType, entityId, input) {
  if (!input.files || !input.files.length) return;
  var remaining = input.files.length;
  Array.from(input.files).forEach(function (file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      addEntityFile(entityType, entityId, file.name, e.target.result);
      remaining--;
      if (remaining === 0) renderPage();
    };
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB FORM RENDERER
// ══════════════════════════════════════════════════════════════════════════════
function renderTabForm(entityId, entityType, tab, contact) {
  const emailTo = contact ? (contact.email || '') : '';
  const phone = contact ? (contact.phone || '') : '';
  const name = contact ? (contact.fn + ' ' + contact.ln) : '';

  // ── Notes tab ────────────────────────────────────────────────────────────
  if (tab === 'notes') {
    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <textarea id="tabInput_${entityId}" class="inp" rows="3"
        placeholder="Write a note… (supports @mentions)"
        style="font-size:13px;resize:vertical;min-height:70px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff;line-height:1.5"
        onkeydown="if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){saveTabActivity('${entityId}','${entityType}','note');event.preventDefault();}"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:11px;color:#9ca3af">Cmd+Enter to save</span>
        <button onclick="saveTabActivity('${entityId}','${entityType}','note')" class="btn-r" style="font-size:12px;padding:5px 18px">Save note</button>
      </div>
    </div>`;
  }

  // ── Activity tab — Pipedrive-style: type picker + schedule form ───────────
  if (tab === 'activity') {
    const ATYPES = getPickableActivityTypes();
    const today = new Date().toISOString().slice(0, 10);
    const nowHr = String(new Date().getHours()).padStart(2, '0');
    const nowMin = String(Math.ceil(new Date().getMinutes() / 30) * 30 % 60).padStart(2, '0');
    const nowTime = nowHr + ':' + nowMin;

    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <!-- Activity type selector -->
      <div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">
        ${ATYPES.map(t => `<button id="atype_${entityId}_${t.id}"
          onclick="document.querySelectorAll('[id^=atype_${entityId}_]').forEach(b=>{b.style.background='#fff';b.style.color='#6b7280';b.style.borderColor='#e5e7eb';});this.style.background='#fff5f6';this.style.color='#c41230';this.style.borderColor='#c41230';document.getElementById('atype_hidden_${entityId}').value='${t.id}'"
          style="display:flex;align-items:center;gap:5px;padding:5px 12px;border:1px solid #e5e7eb;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;background:#fff;color:#6b7280;transition:all .15s">
          ${t.icon} ${t.label}
        </button>`).join('')}
      </div>
      <input type="hidden" id="atype_hidden_${entityId}" value="call">

      <!-- Title + quick time -->
      <input id="atitle_${entityId}" class="inp" placeholder="Activity subject…" style="font-size:13px;margin-bottom:8px">

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Due date</label>
          <input type="date" id="adate_${entityId}" value="${today}" class="inp" style="font-size:12px;padding:5px 8px">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Time</label>
          <input type="time" id="atime_${entityId}" value="${nowTime}" class="inp" style="font-size:12px;padding:5px 8px">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Duration</label>
          <select id="adur_${entityId}" class="sel" style="font-size:12px;padding:5px 8px">
            <option value="15">15 min</option>
            <option value="30" selected>30 min</option>
            <option value="60">1 hour</option>
            <option value="90">1.5 hrs</option>
            <option value="120">2 hours</option>
          </select>
        </div>
      </div>

      <textarea id="tabInput_${entityId}" class="inp" rows="2" placeholder="Notes (optional)…"
        style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:10px"></textarea>

      <!-- Bottom actions -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <button onclick="openScheduleWithMap('${entityId}','${entityType}')" class="btn-w" style="font-size:12px;gap:6px">
          📅 Open full schedule modal
        </button>
        <div style="display:flex;gap:6px">
          <button onclick="saveActivityFromTab('${entityId}','${entityType}')" class="btn-r" style="font-size:12px;padding:5px 18px">Save activity</button>
        </div>
      </div>
    </div>`;
  }

  // ── Call tab ──────────────────────────────────────────────────────────────
  if (tab === 'call') {
    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <!-- Contact info bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:12px">
        <div>
          <div style="font-size:13px;font-weight:600">${name || 'Contact'}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:1px">${phone || 'No phone on file'}</div>
        </div>
        <div style="display:flex;gap:6px">
          ${phone ? `<a href="javascript:void(0)" onclick="twilioCall('${phone}','${entityId}','${entityType}')" style="background:#22c55e;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:5px;cursor:pointer">📞 Call</a>` : ''}
          ${phone ? `<a href="https://wa.me/${phone.replace(/\s/g, '')}" target="_blank" style="background:#25d366;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:5px">💬 WhatsApp</a>` : ''}
        </div>
      </div>
      <!-- Call outcome -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Outcome</label>
          <select id="callOutcome_${entityId}" class="sel" style="font-size:12px">
            <option>Answered</option>
            <option>No answer</option>
            <option>Voicemail left</option>
            <option>Callback requested</option>
            <option>Wrong number</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:500;display:block;margin-bottom:3px">Duration</label>
          <input id="callDur_${entityId}" class="inp" placeholder="e.g. 5 min" style="font-size:12px;padding:5px 8px">
        </div>
      </div>
      <textarea id="tabInput_${entityId}" class="inp" rows="3" placeholder="Call notes…"
        style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:10px"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <button onclick="openScheduleWithMap('${entityId}','${entityType}')" class="btn-w" style="font-size:12px;gap:5px">📅 Schedule follow-up</button>
        <button onclick="saveCallLog('${entityId}','${entityType}')" class="btn-r" style="font-size:12px;padding:5px 18px">Log call</button>
      </div>
    </div>`;
  }

  // ── SMS tab (stage 4) ─────────────────────────────────────────────────────
  if (tab === 'sms') {
    const smsAllowed = (typeof hasPermission === 'function') ? hasPermission('phone.sms') : true;
    const allSms = getState().smsLogs || [];
    const thread = allSms
      .filter(m => m.entity_id === entityId && m.entity_type === entityType)
      .sort((a, b) => (a.sent_at || '').localeCompare(b.sent_at || ''));
    const tpls = (getState().smsTemplates || []).slice(0, 5);
    const draft = (typeof _getInlineSmsDraft === 'function') ? _getInlineSmsDraft(entityId) : { body: '' };
    const charCount = (draft.body || '').length;
    const charColor = charCount > 160 ? '#dc2626' : charCount > 140 ? '#f59e0b' : '#6b7280';
    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      ${!smsAllowed ? `<div style="padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;text-align:center;color:#6b7280;font-size:13px;margin-bottom:10px">You don't have permission to send SMS.</div>` : ''}

      <!-- Phone bar -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin-bottom:12px">
        <div>
          <div style="font-size:13px;font-weight:600">${name || 'Contact'}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:1px">${phone || 'No phone on file'}</div>
        </div>
      </div>

      <!-- Thread (max-height with scroll) -->
      ${thread.length > 0 ? `<div style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;padding:8px 4px;margin-bottom:10px;background:#f9fafb;border-radius:10px">
        ${thread.map(m => {
          const out = m.direction === 'outbound';
          const bubble = out
            ? 'background:#c41230;color:#fff;align-self:flex-end;border-radius:14px 14px 4px 14px'
            : 'background:#fff;color:#1a1a1a;align-self:flex-start;border-radius:14px 14px 14px 4px;border:1px solid #e5e7eb';
          const time = (m.sent_at || '').slice(11, 16);
          const statusBadge = out
            ? `<span style="font-size:10px;opacity:.75;margin-left:6px">${escapeHtml(m.status || '')}</span>`
            : '';
          return `<div style="max-width:80%;padding:8px 12px;font-size:13px;line-height:1.4;${bubble}">
            <div>${_escText(m.body || '')}</div>
            <div style="font-size:10px;opacity:.7;margin-top:3px">${time}${statusBadge}</div>
          </div>`;
        }).join('')}
      </div>` : `<div style="padding:18px;text-align:center;color:#9ca3af;font-size:12px;background:#f9fafb;border-radius:10px;margin-bottom:10px">No messages yet</div>`}

      <!-- Templates -->
      ${(smsAllowed && tpls.length > 0) ? `<div style="padding:8px 10px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#92400e;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">📋 Templates</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${tpls.map(t => `<button onclick="applySmsTemplateInline('${t.id}','${entityId}','${entityType}')" style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e;font-weight:600">${_escText(t.name)}</button>`).join('')}
        </div>
      </div>` : ''}

      <!-- Composer -->
      ${smsAllowed ? `<textarea id="smsBody_${entityId}" class="inp" rows="3" placeholder="Type your SMS…" oninput="setInlineSmsDraft('${entityId}',this.value); document.getElementById('smsCharCount_${entityId}').textContent=this.value.length+'/160'; document.getElementById('smsCharCount_${entityId}').style.color=this.value.length>160?'#dc2626':this.value.length>140?'#f59e0b':'#6b7280'" style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px">${_escText(draft.body || '')}</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span id="smsCharCount_${entityId}" style="font-size:11px;color:${charColor}">${charCount}/160</span>
        <button onclick="sendSmsFromTab('${entityId}','${entityType}')" class="btn-r" style="font-size:12px;padding:5px 18px"${(!phone || !smsAllowed) ? ' disabled style="font-size:12px;padding:5px 18px;opacity:.5;cursor:not-allowed"' : ''}>${!phone ? 'No phone' : 'Send SMS'}</button>
      </div>` : ''}
    </div>`;
  }

  // ── Email tab ─────────────────────────────────────────────────────────────
  if (tab === 'email') {
    const connected = getState().gmailConnected;
    // Top 5 templates as quick-apply chips; rest available via "More…" picker.
    const allTpls = (typeof getAllTemplates === 'function') ? getAllTemplates() : [];
    const topTpls = allTpls.slice(0, 5);
    // Custom merge fields available for this entity (includes deal-from-lead).
    const customFields = (typeof getEntityCustomMergeFields === 'function') ? getEntityCustomMergeFields(entityId, entityType) : [];
    const standardFields = (typeof MERGE_FIELDS !== 'undefined') ? MERGE_FIELDS : [];
    // Pull any in-progress draft (template applied + unsent, or mid-typing)
    // so re-renders don't wipe it. Kept per-entity.
    const _draft = (typeof _getInlineEmailDraft === 'function') ? _getInlineEmailDraft(entityId) : { subject: '', body: '' };

    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      ${!connected ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:16px;text-align:center;margin-bottom:12px">
        <div style="font-size:24px;margin-bottom:6px">📧</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:4px">Connect Gmail to send emails</div>
        <!-- Call OAuth directly so the popup opens over the current lead/deal.
             Don't navigate to Settings — detail IDs would override page:'settings'. -->
        <button onclick="gmailConnect()" class="btn-r" style="font-size:12px;margin-top:6px">Connect Gmail →</button>
      </div>` : ''}

      <!-- Template chips — click to fill subject + body with merge-resolved content -->
      ${allTpls.length > 0 ? `
      <div style="padding:8px 10px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#92400e;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">📋 Apply template</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${topTpls.map(t => `<button onclick="applyEmailTemplateInline('${t.id}','${entityId}','${entityType}')"
            style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e;font-weight:600"
            onmouseover="this.style.background='#fffbeb'" onmouseout="this.style.background='#fff'"
            title="${(t.subject || '').replace(/"/g, '&quot;')}">${t.name}</button>`).join('')}
          ${allTpls.length > 5 ? `<button onclick="openTemplatePickerInline('${entityId}','${entityType}')" style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px dashed #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e">More… (${allTpls.length - 5})</button>` : ''}
        </div>
      </div>` : ''}

      <input id="emailTo_${entityId}" class="inp" value="${emailTo}" placeholder="To: email@example.com" style="font-size:13px;margin-bottom:6px">
      <input id="emailSubj_${entityId}" class="inp" value="${_escAttr(_draft.subject)}" oninput="setInlineEmailDraftField('${entityId}','subject',this.value)" placeholder="Subject…" style="font-size:13px;margin-bottom:6px">
      <textarea id="tabInput_${entityId}" class="inp" rows="4" placeholder="Write your email…" oninput="setInlineEmailDraftField('${entityId}','body',this.value)"
        style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px">${_escText(_draft.body)}</textarea>

      <!-- Insert-field dropdown. Custom fields first (with captured values shown),
           then standard merge fields. Selecting inserts {{key}} at the cursor. -->
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <select id="mergeInsert_${entityId}" onchange="insertMergeFieldInline('${entityId}', this.value); this.value=''"
          class="sel" style="font-size:11px;padding:4px 8px;max-width:260px">
          <option value="">{{ }} Insert field…</option>
          ${customFields.length > 0 ? `<optgroup label="From web enquiry / custom fields">
            ${customFields.map(f => {
      const hasVal = f.value !== undefined && f.value !== null && f.value !== '';
      const preview = hasVal ? ' — ' + String(f.value).slice(0, 20) : ' (empty)';
      return `<option value="${f.key}">${f.label}${preview}</option>`;
    }).join('')}
          </optgroup>` : ''}
          <optgroup label="Standard fields">
            ${standardFields.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
          </optgroup>
        </select>
        <span style="font-size:11px;color:#9ca3af">Tokens resolve on Log email / Send</span>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center">
        <button onclick="emailFromEntityTab('${entityId}','${entityType}')" class="btn-w" style="font-size:12px;gap:5px">↗ Open in full composer</button>
        <button onclick="saveEmailLog('${entityId}','${entityType}')" class="btn-r" style="font-size:12px;padding:5px 18px">Log email</button>
      </div>
    </div>`;
  }

  // ── Files tab ─────────────────────────────────────────────────────────────
  if (tab === 'files') {
    var files = getEntityFiles(entityType, entityId);
    var listHtml = files.length === 0
      ? '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:20px">No files yet</div>'
      : '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:12px">'
      + '<thead><tr>'
      + '<th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">Name</th>'
      + '<th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">Uploaded By</th>'
      + '<th style="text-align:left;padding:6px;border-bottom:1px solid #e5e7eb;font-size:11px;color:#6b7280">Date</th>'
      + '<th style="padding:6px;border-bottom:1px solid #e5e7eb"></th>'
      + '</tr></thead><tbody>'
      + files.map(function (f) {
        return '<tr>'
          + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6"><a href="' + f.dataUrl + '" target="_blank" download="' + f.name + '" style="color:#c41230;text-decoration:none;font-weight:600">📎 ' + f.name + '</a></td>'
          + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:#6b7280">' + (f.uploadedBy || '—') + '</td>'
          + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;color:#6b7280">' + new Date(f.uploadedAt).toLocaleDateString('en-AU') + '</td>'
          + '<td style="padding:8px 6px;border-bottom:1px solid #f3f4f6;text-align:right">'
          + '<button onclick="if(confirm(\'Remove this file?\'))removeEntityFile(\'' + entityType + '\',\'' + entityId + '\',\'' + f.id + '\')" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:14px">🗑</button>'
          + '</td></tr>';
      }).join('')
      + '</tbody></table>';

    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <label style="display:block;border:2px dashed #e5e7eb;border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:#fafafa"
        onmouseover="this.style.borderColor='#c41230';this.style.background='#fff5f6'"
        onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#fafafa'">
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
          style="display:none"
          onchange="handleEntityFileUpload('${entityType}','${entityId}',this)">
        <div style="font-size:28px;margin-bottom:8px">📎</div>
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">Drop files here or click to upload</div>
        <div style="font-size:11px;color:#9ca3af">PDF, images, documents</div>
      </label>
      ${listHtml}
    </div>`;
  }

  return '<div style="padding:16px;color:#9ca3af;font-size:13px">Select a tab above</div>';
}



// ── Save activity from the structured activity tab ────────────────────────────
function saveActivityFromTab(entityId, entityType) {
  const type = document.getElementById('atype_hidden_' + entityId)?.value || 'call';
  const title = document.getElementById('atitle_' + entityId)?.value.trim() || '';
  const date = document.getElementById('adate_' + entityId)?.value || new Date().toISOString().slice(0, 10);
  const time = document.getElementById('atime_' + entityId)?.value || '09:00';
  const dur = document.getElementById('adur_' + entityId)?.value || '30';
  const notes = document.getElementById('tabInput_' + entityId)?.value.trim() || '';
  const text = title || (type.charAt(0).toUpperCase() + type.slice(1));
  const fullText = [text, notes].filter(Boolean).join('\n');
  const calLink = buildGCalURL(text, date, time, parseInt(dur), notes);

  saveActivityToEntity(entityId, entityType, {
    id: 'a' + Date.now(), type, text: fullText,
    subject: title || type,
    date, time, duration: parseInt(dur),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: date,
    calLink, scheduled: true,
  });

  // Meetings also need a map pin. Calls / notes / emails / tasks stay
  // activity-only — they're not location-bound. Mirrors saveScheduledActivity
  // (~line 1634) so both entry points behave identically.
  if (type === 'meeting') {
    const entity = entityType === 'deal' ? getState().deals.find(x => x.id === entityId) :
      entityType === 'lead' ? getState().leads.find(x => x.id === entityId) : null;
    if (entity) {
      const repName = entityType === 'deal' ? entity.rep : entity.owner;
      const branch = entity.branch || 'VIC';
      const rep = REP_BASES.find(r => r.name === repName) || REP_BASES[0];
      const coords = getSuburbCoords(entity.suburb || '', branch);
      MOCK_APPOINTMENTS.push({
        id: 'ap_' + Date.now(), rep: rep.name, repCol: rep.col,
        date, time,
        client: entityType === 'deal' ? (entity.title || 'Deal')
          : ((entity.fn || '') + ' ' + (entity.ln || '')).trim(),
        suburb: entity.suburb || '',
        lat: coords.lat, lng: coords.lng,
        type: text, status: 'Confirmed',
      });
      saveAppointments();
    }
  }

  // Clear form
  const titleEl = document.getElementById('atitle_' + entityId);
  const notesEl = document.getElementById('tabInput_' + entityId);
  if (titleEl) titleEl.value = '';
  if (notesEl) notesEl.value = '';
  detailTab = 'activity';
  addToast((type.charAt(0).toUpperCase() + type.slice(1)) + ' scheduled for ' + date + ' at ' + time, 'success');
  renderPage();
}

// ── Open email from entity tab using full composer ────────────────────────────
function emailFromEntityTab(entityId, entityType) {
  const to = document.getElementById('emailTo_' + entityId)?.value.trim() || '';
  const subj = document.getElementById('emailSubj_' + entityId)?.value.trim() || '';
  const body = document.getElementById('tabInput_' + entityId)?.value.trim() || '';
  // Resolve merge tokens so the composer opens with rendered text, not raw {{…}}.
  let subjResolved = subj, bodyResolved = body;
  if (typeof buildMergeContext === 'function' && typeof emailFillTemplate === 'function') {
    const ctx = buildMergeContext(entityId, entityType);
    const filled = emailFillTemplate({ subject: subj, body: body }, ctx);
    subjResolved = filled.subject;
    bodyResolved = filled.body;
  }
  const did = entityType === 'deal' ? entityId : null;
  const cid = entityType === 'contact' ? entityId : null;
  const lid = entityType === 'lead' ? entityId : null;
  // Hand off to the full composer — clear the inline draft since the composer
  // now owns this email's content.
  clearInlineEmailDraft(entityId);
  emailOpenCompose(to, '', subjResolved, bodyResolved, did, cid, lid, null, null);
  setState({ page: 'email' });
}

// Per-entity email draft map. The inline <input>/<textarea> in renderTabForm
// have no value= binding in the HTML, so a re-render (e.g. the addToast below
// firing setState → renderPage → innerHTML rebuild) wipes anything written to
// .value programmatically. Stashing the draft here lets the renderer
// re-populate the inputs' value/content on every render.
var _inlineEmailDrafts = {}; // { [entityId]: {subject, body} }
function _getInlineEmailDraft(entityId) {
  return _inlineEmailDrafts[entityId] || { subject: '', body: '' };
}
function setInlineEmailDraftField(entityId, field, value) {
  var d = _inlineEmailDrafts[entityId] || { subject: '', body: '' };
  d[field] = value;
  _inlineEmailDrafts[entityId] = d;
}
function clearInlineEmailDraft(entityId) { delete _inlineEmailDrafts[entityId]; }

// ── Inline SMS draft (stage 4) ────────────────────────────────────────────
// Same pattern as email — survive renderPage() rebuilds without losing typed
// text. Cleared once the SMS is successfully sent.
var _inlineSmsDrafts = {}; // { [entityId]: { body } }
function _getInlineSmsDraft(entityId) {
  return _inlineSmsDrafts[entityId] || { body: '' };
}
function setInlineSmsDraft(entityId, body) {
  _inlineSmsDrafts[entityId] = { body: body || '' };
}
function clearInlineSmsDraft(entityId) { delete _inlineSmsDrafts[entityId]; }

// Apply an SMS template to the inline composer for an entity. Resolves merge
// fields ({{firstName}}, {{repName}}, etc.) against the live record and
// pre-fills the textarea via the draft so a renderPage() doesn't wipe it.
function applySmsTemplateInline(templateId, entityId, entityType) {
  var s = getState();
  var tpl = (s.smsTemplates || []).find(function(t){ return t.id === templateId; });
  if (!tpl) { addToast('Template not found', 'error'); return; }
  var entity = null;
  if (entityType === 'contact') entity = (s.contacts || []).find(function(c){ return c.id === entityId; });
  else if (entityType === 'lead') entity = (s.leads || []).find(function(l){ return l.id === entityId; });
  else if (entityType === 'deal') entity = (s.deals || []).find(function(d){ return d.id === entityId; });
  var ctx = (typeof smsBuildMergeContext === 'function') ? smsBuildMergeContext(entity, entityType) : {};
  var resolved = (typeof smsApplyMergeFields === 'function') ? smsApplyMergeFields(tpl.body, ctx) : tpl.body;
  setInlineSmsDraft(entityId, resolved);
  renderPage();
}

// Read the body from the textarea (or draft) and dispatch to twilioSendSms.
// Resolves the destination phone from the entity record.
async function sendSmsFromTab(entityId, entityType) {
  var ta = document.getElementById('smsBody_' + entityId);
  var body = ta ? ta.value : (_getInlineSmsDraft(entityId).body || '');
  if (!body || !body.trim()) { addToast('Type a message first', 'warning'); return; }

  var s = getState();
  var phone = '';
  if (entityType === 'contact') {
    var c = (s.contacts || []).find(function(x){ return x.id === entityId; });
    phone = c ? c.phone : '';
  } else if (entityType === 'lead') {
    var l = (s.leads || []).find(function(x){ return x.id === entityId; });
    phone = l ? l.phone : '';
  } else if (entityType === 'deal') {
    var d = (s.deals || []).find(function(x){ return x.id === entityId; });
    var contact = d ? (s.contacts || []).find(function(x){ return x.id === d.cid; }) : null;
    phone = contact ? contact.phone : '';
  }
  if (!phone) { addToast('No phone number on file', 'warning'); return; }

  var result = await twilioSendSms(phone, body, entityId, entityType);
  if (result && result.sid) {
    clearInlineSmsDraft(entityId);
    renderPage();
  }
}

// HTML-escape for use inside attribute values (subject input's `value=`).
function _escAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// HTML-escape for text content inside <textarea>...</textarea>.
function _escText(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Apply a template to the inline Email tab — resolves merge tokens for this
// entity's context (including custom fields from the originating lead) and
// fills the Subject + Body inputs. Persists to the draft store so the values
// survive the re-render that addToast triggers via setState.
function applyEmailTemplateInline(templateId, entityId, entityType) {
  const all = (typeof getAllTemplates === 'function') ? getAllTemplates() : [];
  const tpl = all.find(function (t) { return t.id === templateId; });
  if (!tpl) { addToast('Template not found', 'error'); return; }
  const ctx = buildMergeContext(entityId, entityType);
  const filled = emailFillTemplate({ subject: tpl.subject || '', body: tpl.body || '' }, ctx);
  // Stash in draft state FIRST so the upcoming render (via addToast) picks it up.
  setInlineEmailDraftField(entityId, 'subject', filled.subject);
  setInlineEmailDraftField(entityId, 'body', filled.body);
  // Also write to the DOM right now so the user sees the change immediately,
  // before the re-render fires. The re-render will read back from the draft.
  const subjEl = document.getElementById('emailSubj_' + entityId);
  const bodyEl = document.getElementById('tabInput_' + entityId);
  if (subjEl) subjEl.value = filled.subject;
  if (bodyEl) bodyEl.value = filled.body;
  addToast('Template applied: ' + tpl.name, 'success');
}

// Insert a {{key}} merge token at the current cursor position in the body
// textarea. If focus is elsewhere, append to the end.
function insertMergeFieldInline(entityId, key) {
  if (!key) return;
  const el = document.getElementById('tabInput_' + entityId);
  if (!el) return;
  const token = '{{' + key + '}}';
  if (document.activeElement === el) {
    const start = el.selectionStart, end = el.selectionEnd;
    el.value = el.value.slice(0, start) + token + el.value.slice(end);
    const pos = start + token.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  } else {
    el.value = (el.value || '') + token;
    el.focus();
  }
}

// "More…" picker — shows every template in a modal so the user can pick
// beyond the top 5 chips shown inline.
function openTemplatePickerInline(entityId, entityType) {
  const all = (typeof getAllTemplates === 'function') ? getAllTemplates() : [];
  if (all.length === 0) { addToast('No templates available', 'info'); return; }
  // Group templates by category for a cleaner list.
  const byCat = {};
  all.forEach(function (t) { var c = t.category || 'Other'; (byCat[c] = byCat[c] || []).push(t); });
  const html = '<div class="modal-bg" onclick="if(event.target===this)this.remove()">' +
    '<div class="modal">' +
    '<div class="modal-header">' +
    '<h3 style="margin:0;font-size:15px;font-weight:700">Pick a template</h3>' +
    '<button onclick="this.closest(\'.modal-bg\').remove()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px">×</button>' +
    '</div>' +
    '<div class="modal-body" style="padding:8px">' +
    Object.keys(byCat).sort().map(function (cat) {
      return '<div style="padding:8px 12px 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">' + cat + '</div>' +
        byCat[cat].map(function (t) {
          return '<div onclick="applyEmailTemplateInline(\'' + t.id + '\',\'' + entityId + '\',\'' + entityType + '\'); this.closest(\'.modal-bg\').remove()" ' +
            'style="padding:10px 14px;border-radius:8px;cursor:pointer" ' +
            'onmouseover="this.style.background=\'#fff5f6\'" onmouseout="this.style.background=\'\'">' +
            '<div style="font-size:13px;font-weight:600;color:#111">' + (t.name || 'Untitled') + '</div>' +
            '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + (t.subject || '').slice(0, 80) + '</div>' +
            '</div>';
        }).join('');
    }).join('') +
    '</div></div></div>';
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstChild);
}

// ── Open Schedule modal with map showing rep's day ────────────────────────────
function openScheduleWithMap(entityId, entityType) {
  // Pre-fill the schedule modal with activity tab data
  const type = document.getElementById('atype_hidden_' + entityId)?.value || 'call';
  const title = document.getElementById('atitle_' + entityId)?.value.trim() || '';
  const date = document.getElementById('adate_' + entityId)?.value || new Date().toISOString().slice(0, 10);
  const time = document.getElementById('atime_' + entityId)?.value || '09:00';
  const dur = parseInt(document.getElementById('adur_' + entityId)?.value || '30');
  const notes = document.getElementById('tabInput_' + entityId)?.value.trim() || '';

  // Get entity location for rep matching
  const s = getState();
  let suburb = '', branch = 'VIC', repName = (getCurrentUser() || { name: 'Admin' }).name;
  if (entityType === 'deal') {
    const d = s.deals.find(x => x.id === entityId);
    if (d) { suburb = d.suburb || ''; branch = d.branch || 'VIC'; repName = d.rep || (getCurrentUser() || { name: 'Admin' }).name; }
  } else if (entityType === 'lead') {
    const l = s.leads.find(x => x.id === entityId);
    if (l) { suburb = l.suburb || ''; branch = l.branch || 'VIC'; repName = l.owner || (getCurrentUser() || { name: 'Admin' }).name; }
  } else {
    const c = s.contacts.find(x => x.id === entityId);
    if (c) { suburb = c.suburb || ''; branch = c.branch || 'VIC'; }
  }

  schedActivityModal = true;
  schedActivityData = { type, title, date, time, duration: dur, entityId, entityType, notes, suburb, branch, repName };
  mapSelectedDate = date;
  mapSelectedRep = repName;
  renderPage();
}

function saveTabActivity(entityId, entityType, type) {
  const el = document.getElementById('tabInput_' + entityId);
  const text = el ? el.value.trim() : '';
  if (!text) { addToast('Write something first', 'error'); return; }
  const now = new Date();
  saveActivityToEntity(entityId, entityType, {
    id: 'a' + Date.now(), type,
    text,
    subject: type === 'note' ? text.slice(0, 60) : null,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: '',
  });
  if (el) el.value = '';
  // Stay on notes/activity tab but force re-render so timeline shows new entry
  renderPage();
  addToast(type === 'note' ? 'Note saved' : type.charAt(0).toUpperCase() + type.slice(1) + ' logged', 'success');
}

function saveCallLog(entityId, entityType) {
  const notesEl = document.getElementById('tabInput_' + entityId);
  const outcomeEl = document.getElementById('callOutcome_' + entityId);
  const durEl = document.getElementById('callDur_' + entityId);
  const notes = notesEl ? notesEl.value.trim() : '';
  const outcome = outcomeEl ? outcomeEl.value : '';
  const dur = durEl ? durEl.value : '';
  const text = [outcome && `Outcome: ${outcome}`, dur && `Duration: ${dur}`, notes].filter(Boolean).join('\n');
  if (!text) { addToast('Add call notes first', 'error'); return; }
  const now = new Date();
  saveActivityToEntity(entityId, entityType, {
    id: 'a' + Date.now(), type: 'call', text,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: '',
  });
  // Clear the form inputs so the next visit to the Call tab isn't pre-filled.
  if (notesEl) notesEl.value = '';
  if (outcomeEl) outcomeEl.selectedIndex = 0;
  if (durEl) durEl.value = '';
  // Switch to Activity + explicitly re-render in that order. Without the
  // explicit renderPage, the tab only flips when addToast below incidentally
  // triggers one (fragile — breaks if addToast's side effect ever changes).
  detailTab = 'activity';
  renderPage();
  addToast('Call logged', 'success');
}

function saveEmailLog(entityId, entityType) {
  const subjEl = document.getElementById('emailSubj_' + entityId);
  const bodyEl = document.getElementById('tabInput_' + entityId);
  const toEl = document.getElementById('emailTo_' + entityId);
  const subj = subjEl ? subjEl.value.trim() : '';
  const body = bodyEl ? bodyEl.value.trim() : '';
  const to = toEl ? toEl.value.trim() : '';
  if (!subj && !body) { addToast('Add subject or body', 'error'); return; }
  // Resolve any remaining {{tokens}} using the entity's merge context. Anything
  // typed manually after the template was applied (or entered directly) gets
  // rendered before we write to the activity history.
  let subjResolved = subj, bodyResolved = body;
  if (typeof buildMergeContext === 'function' && typeof emailFillTemplate === 'function') {
    const ctx = buildMergeContext(entityId, entityType);
    const filled = emailFillTemplate({ subject: subj, body: body }, ctx);
    subjResolved = filled.subject;
    bodyResolved = filled.body;
  }
  const now = new Date();
  saveActivityToEntity(entityId, entityType, {
    id: 'a' + Date.now(), type: 'email',
    text: bodyResolved,
    subject: subjResolved || '(no subject)',
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: '',
  });
  // Clear inputs AND the persistent draft so next visit to the Email tab is
  // empty (otherwise the rendered `value=` would reinstate the just-sent text).
  if (subjEl) subjEl.value = '';
  if (bodyEl) bodyEl.value = '';
  clearInlineEmailDraft(entityId);
  // Explicit tab switch + render, same rationale as saveCallLog.
  detailTab = 'activity';
  renderPage();
  addToast('Email logged', 'success');
}

function logFileUpload(entityId, entityType, input) {
  if (!input.files?.length) return;
  const names = Array.from(input.files).map(f => f.name).join(', ');
  saveActivityToEntity(entityId, entityType, {
    id: 'a' + Date.now(), type: 'file',
    text: 'Files uploaded: ' + names,
    date: new Date().toISOString().slice(0, 10),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: '',
  });
  addToast(input.files.length + ' file(s) uploaded', 'success');
}

function toggleActivityDone(entityId, actId, entityType) {
  if (entityType === 'deal') {
    setState({
      deals: getState().deals.map(d => {
        if (d.id !== entityId) return d;
        return { ...d, activities: (d.activities || []).map(a => a.id === actId ? { ...a, done: !a.done } : a) };
      })
    });
  } else if (entityType === 'lead') {
    setState({
      leads: getState().leads.map(l => {
        if (l.id !== entityId) return l;
        return { ...l, activities: (l.activities || []).map(a => a.id === actId ? { ...a, done: !a.done } : a) };
      })
    });
  } else {
    const ca = { ...(getState().contactActivities || {}) };
    ca[entityId] = (ca[entityId] || []).map(a => a.id === actId ? { ...a, done: !a.done } : a);
    setState({ contactActivities: ca });
  }
}

// Legacy compatibility
function openActivityForm(dealId, type) { detailTab = type === 'email' ? 'email' : type === 'call' ? 'call' : 'notes'; renderPage(); }
function saveActivity(dealId, type) { saveTabActivity(dealId, 'deal', 'note'); }
function toggleTaskDone(dealId, actId) { toggleActivityDone(dealId, actId, 'deal'); }
function saveQuickActivity(id, type) { saveTabActivity(id, type, 'note'); }
function saveDetailNote(id, type) { saveTabActivity(id, type, 'note'); }
function saveDetailEmail(id, type) { saveEmailLog(id, type); }
function saveDetailCall(id, type) { saveCallLog(id, type); }

// ══════════════════════════════════════════════════════════════════════════════
// DEAL DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// DEAL ACTION FUNCTIONS (restored)
// ══════════════════════════════════════════════════════════════════════════════

function moveDealToStage(dealId, stageId, opts) {
  opts = opts || {};
  const { deals } = getState();
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  const pl = PIPELINES.find(p => p.id === deal.pid);
  const stage = pl ? pl.stages.find(s => s.id === stageId) : null;
  // Step 4 §1: programmatic stage change to a won stage must route through the
  // quote-selection gate unless we're being called from inside the commit path.
  if (stage && stage.isWon && !opts.skipWonGate) {
    _requestWonTransition(dealId, stageId, { source: opts.source || 'stage-change' });
    return;
  }
  // Brief 1: programmatic stage change to a Lost stage must route through the
  // reason-capture modal. Skip if the deal is already lost (re-entry on drag-
  // and-drop within the Lost lane shouldn't re-prompt).
  if (stage && stage.isLost && !opts.skipLostGate && !deal.lost) {
    _requestLostTransition(dealId, stageId, { source: opts.source || 'stage-change' });
    return;
  }
  const act = {
    id: 'a' + Date.now(), type: 'stage',
    text: 'Stage changed to: ' + (stage ? stage.name : stageId),
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: '',
  };
  var _wd = (stage && stage.isWon) ? new Date().toISOString().slice(0, 10) : (deal.wonDate || null);
  // Brief 4 Phase 2: track stage entry timestamps so the commission engine's
  // age-penalty calculation can derive daysToWin from the relevant
  // "active sales engagement" stage entry (Quote Sent / Proposal Sent in
  // the seed pipelines). Most-recent entry wins on re-entry — matches the
  // intended semantics where a deal that bounces back into Quote Sent
  // restarts its age clock for penalty purposes. Pre-Phase-2 deals
  // without history fall back to deal.created in the calc engine.
  var _stageHistory = Object.assign({}, deal.stageHistory || {});
  _stageHistory[stageId] = new Date().toISOString();
  setState({
    deals: deals.map(d => d.id === dealId
      ? {
        ...d, sid: stageId,
        won: !!(stage && stage.isWon),
        lost: !!(stage && stage.isLost),
        wonDate: _wd,
        stageHistory: _stageHistory,
        activities: [act, ...(d.activities || [])]
      }
      : d)
  });
  dbUpdate('deals', dealId, { sid: stageId, won: !!(stage && stage.isWon), lost: !!(stage && stage.isLost), won_date: _wd, stage_history: _stageHistory });
  dbInsert('activities', actToDb(act, 'deal', dealId));
  if (stage && stage.isWon) { addToast('🎉 Deal Won!', 'success'); }
  // Audit (Brief 2 Phase 2). The Won + Lost transitions write their own
  // audit entries via _commitWon / confirmLostTransition, so this only fires
  // for ordinary mid-pipeline stage moves.
  if (typeof appendAuditEntry === 'function' && !(stage && stage.isWon) && !(stage && stage.isLost)) {
    appendAuditEntry({
      entityType:'deal', entityId:dealId, action:'deal.stage_changed',
      summary:'Stage changed to ' + (stage ? stage.name : stageId),
      before:{ sid:deal.sid }, after:{ sid:stageId },
      metadata:{ source: opts.source || 'stage-change' },
      branch: deal.branch || null,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Step 4: WON FLOW — two-step gate
// ══════════════════════════════════════════════════════════════════════════════
// All three won entry points (drag, button, stage-change) converge on
// _requestWonTransition. It enforces:
//   • zero quotes -> error toast, abort
//   • one quote -> skip the radio modal but still require confirmation
//   • 2+ quotes -> open quote-selection modal, default to activeQuoteId
// On confirmation the single _commitWon() writes atomically through state +
// Supabase, then chains into the existing payment-method modal so the job
// creation logic in confirmDealWon keeps working.

var _pendingWonDealId = null;                  // payment-method phase (existing)
var _pendingWonQuoteSelection = null;          // {dealId, targetStageId, selectedQuoteId}
var _pendingUnwindDealId = null;               // unwind admin modal
// Brief 1 — Lost transition modal. Set when a deal is being marked Lost and
// the user hasn't confirmed a reason yet. Shape:
//   {dealId, targetStageId, source, selectedReasonId, competitorName, details}
// The deal stays in its current stage until confirmLostTransition runs.
// Cancelling closes the modal without changing the deal at all.
var _pendingLostTransition = null;

// ── Brief 5 Phase 4: deal-type inline picker ────────────────────────────────
// When set to a deal id, the picker modal renders with two cards. Clicking a
// card calls setDealType which applies the change, writes an 'edit' activity,
// audits via appendAuditEntry, and clears the picker. Cancelling closes
// without writing anything. Mirrors the _pendingLostTransition pattern.
var _pendingDealTypePicker = null;

// Shared helpers for rendering the type as a badge across surfaces
// (Deal Detail summary, kanban card stripe, contact panel deal list,
// Won table, etc.). Brief 5 standardises blue=residential, purple=
// commercial — the same vocabulary contacts already use, so the
// experience is consistent across the app.
function _dealTypeBadge(d) {
  if (!d) return '';
  var t = d.dealType;
  if (t !== 'residential' && t !== 'commercial') return Badge('Untyped', 'gray');
  var label = t === 'commercial' ? 'Commercial' : 'Residential';
  return Badge(label, t === 'commercial' ? 'purple' : 'blue');
}

// Brief 5 Phase 4: kanban card left-stripe colour. Saturated enough to read
// against the white card; intentionally darker than the badge palette since
// a 3px stripe needs more visual weight to register as type-coding rather
// than as decoration.
function _dealTypeStripeColor(d) {
  if (!d) return 'transparent';
  if (d.dealType === 'commercial') return '#6d28d9';
  if (d.dealType === 'residential') return '#1d4ed8';
  return 'transparent'; // legacy (pre-backfill) deals get no stripe
}

function openDealTypePicker(dealId) {
  var d = (getState().deals || []).find(function (x) { return x.id === dealId; });
  if (!d) return;
  if (typeof canEditDeal === 'function' && !canEditDeal(d)) {
    addToast('Only the deal owner or an admin can change the deal type', 'error');
    return;
  }
  _pendingDealTypePicker = dealId;
  renderPage();
}

function closeDealTypePicker() {
  _pendingDealTypePicker = null;
  renderPage();
}

// Apply a deal-type change. Same audit + activity pattern as saveDealEdit
// (Brief 2 Phase 2 / Brief 5 Phase 1) so timeline and Audit page reflect
// the change consistently. No-op if the new type matches the current one
// (avoids polluting the activity timeline + audit log with empty edits).
function setDealType(dealId, newType) {
  if (newType !== 'residential' && newType !== 'commercial') return;
  var d = (getState().deals || []).find(function (x) { return x.id === dealId; });
  if (!d) { _pendingDealTypePicker = null; renderPage(); return; }
  if (typeof canEditDeal === 'function' && !canEditDeal(d)) {
    addToast('Only the deal owner or an admin can change the deal type', 'error');
    _pendingDealTypePicker = null;
    renderPage();
    return;
  }
  if (d.dealType === newType) { _pendingDealTypePicker = null; renderPage(); return; }

  var oldType = d.dealType || null;
  var oldLabel = oldType === 'commercial' ? 'Commercial' : (oldType === 'residential' ? 'Residential' : 'Untyped');
  var newLabel = newType === 'commercial' ? 'Commercial' : 'Residential';

  var user = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || { name: 'Unknown' };
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'edit',
    subject: user.name + ' changed deal type',
    text: 'Type: "' + oldLabel + '" → "' + newLabel + '"',
    by: user.name,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    done: false,
    changes: [{ field: 'dealType', label: 'Type', from: oldLabel, to: newLabel }],
  };

  var updated = Object.assign({}, d, { dealType: newType });
  updated.activities = [actObj].concat(d.activities || []);
  setState({
    deals: getState().deals.map(function (x) { return x.id === dealId ? updated : x; }),
  });

  // Persist. dbUpdate sends just the deal_type column (snake_case) — the
  // rest of the row is unchanged; this avoids round-tripping through
  // dealToDb which would re-send everything.
  try { dbUpdate('deals', dealId, { deal_type: newType }); } catch (e) {}
  try { dbInsert('activities', actToDb(actObj, 'deal', dealId)); } catch (e) {}

  // Audit (Brief 2 Phase 2 pattern). Distinct metadata.source so the
  // Audit page filter can isolate type-picker edits from drawer edits.
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType: 'deal', entityId: dealId, action: 'deal.field_edited',
      summary: 'Changed type on "' + (updated.title || dealId) + '" — ' + oldLabel + ' → ' + newLabel,
      before: { dealType: oldType },
      after:  { dealType: newType },
      metadata: { source: 'dealtype-picker' },
      branch: updated.branch || null,
    });
  }

  _pendingDealTypePicker = null;
  addToast('Deal type set to ' + newLabel, 'success');
  renderPage();
}

function renderDealTypePickerModal() {
  if (!_pendingDealTypePicker) return '';
  var d = (getState().deals || []).find(function (x) { return x.id === _pendingDealTypePicker; });
  if (!d) return '';
  var cur = d.dealType;
  var resOn = cur === 'residential';
  var comOn = cur === 'commercial';
  return '' +
    '<div class="modal-bg" onclick="if(event.target===this)closeDealTypePicker()">' +
      '<div class="modal" style="max-width:480px">' +
        '<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">' +
          '<h3 style="margin:0;font-size:16px;font-weight:700">Change deal type</h3>' +
          '<button onclick="closeDealTypePicker()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>' +
        '</div>' +
        '<div style="padding:22px;display:flex;flex-direction:column;gap:12px">' +
          '<div style="font-size:12px;color:#6b7280;line-height:1.4">Current: ' + _dealTypeBadge(d) + '. Pick a new type to apply immediately — the change is recorded in the deal\'s activity timeline and the audit log.</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<button onclick="setDealType(\'' + d.id + '\',\'residential\')" style="cursor:pointer;border:2px solid ' + (resOn ? '#1d4ed8' : '#e5e7eb') + ';border-radius:10px;padding:14px;background:' + (resOn ? '#eff6ff' : '#fff') + ';transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px;text-align:left;font-family:inherit">' +
              '<span style="font-size:13px;font-weight:700;color:#1a1a1a">Residential' + (resOn ? ' <span style="font-weight:500;color:#1d4ed8">· current</span>' : '') + '</span>' +
              '<span style="font-size:11px;color:#6b7280;line-height:1.35">Single home, owner-occupied</span>' +
            '</button>' +
            '<button onclick="setDealType(\'' + d.id + '\',\'commercial\')" style="cursor:pointer;border:2px solid ' + (comOn ? '#6d28d9' : '#e5e7eb') + ';border-radius:10px;padding:14px;background:' + (comOn ? '#f5f3ff' : '#fff') + ';transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px;text-align:left;font-family:inherit">' +
              '<span style="font-size:13px;font-weight:700;color:#1a1a1a">Commercial' + (comOn ? ' <span style="font-weight:500;color:#6d28d9">· current</span>' : '') + '</span>' +
              '<span style="font-size:11px;color:#6b7280;line-height:1.35">Builder, body corp, rental, retail</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end">' +
          '<button class="btn-w" onclick="closeDealTypePicker()">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function _findWonStageId(deal) {
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  if (!pl) return null;
  var ws = (pl.stages || []).find(function (s) { return s.isWon; });
  return ws ? ws.id : null;
}

function _findFallbackStageId(deal) {
  // First non-won non-lost stage by ord — used when preWonStageId is null on unwind.
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  if (!pl) return deal.sid;
  var candidates = (pl.stages || [])
    .filter(function (s) { return !s.isWon && !s.isLost; })
    .sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); });
  return candidates.length ? candidates[0].id : deal.sid;
}

function _requestWonTransition(dealId, targetStageId, opts) {
  opts = opts || {};
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  // Resolve target stage — fall back to the pipeline's won stage if caller didn't pass one.
  var resolvedStageId = targetStageId || _findWonStageId(deal);
  if (!resolvedStageId) { addToast('No won stage configured for this pipeline', 'error'); return; }

  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];
  if (quotes.length === 0) {
    addToast('A quote must be designed in CAD before this deal can be won', 'error');
    return;
  }
  if (quotes.length === 1) {
    // Single-quote case: skip the radio modal but still require confirmation.
    var q = quotes[0];
    var label = (q.label || 'Quote 1') + ' ($' + Math.round(q.totalPrice || 0).toLocaleString()
      + ', ' + (q.frameCount || (q.projectItems || []).length) + ' frame'
      + ((q.frameCount || (q.projectItems || []).length) === 1 ? '' : 's') + ')';
    if (!confirm('Mark deal as Won with ' + label + '?')) return;
    _commitWon(dealId, resolvedStageId, q.id);
    return;
  }
  // 2+ quotes: default to active quote, fall back to first.
  var defaultId = (deal.activeQuoteId && quotes.some(function (q) { return q.id === deal.activeQuoteId; }))
    ? deal.activeQuoteId : quotes[0].id;
  _pendingWonQuoteSelection = { dealId: dealId, targetStageId: resolvedStageId, selectedQuoteId: defaultId };
  renderPage();
}

function selectWonQuote(quoteId) {
  if (!_pendingWonQuoteSelection) return;
  _pendingWonQuoteSelection.selectedQuoteId = quoteId;
  renderPage();
}

function cancelWonQuoteSelection() {
  _pendingWonQuoteSelection = null;
  renderPage();
}

function confirmWonQuoteSelection() {
  var pend = _pendingWonQuoteSelection;
  if (!pend || !pend.selectedQuoteId) return;
  _pendingWonQuoteSelection = null;
  _commitWon(pend.dealId, pend.targetStageId, pend.selectedQuoteId);
}

function _commitWon(dealId, targetStageId, selectedQuoteId) {
  var st0 = getState();
  var deal = (st0.deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];
  var selectedQuote = quotes.find(function (q) { return q.id === selectedQuoteId; });
  if (!selectedQuote) { addToast('Selected quote not found', 'error'); return; }

  // Capture the pre-won stage so unwind can restore it. If the deal is already
  // sitting on the won stage for some reason, fall back to a sensible non-won stage.
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  var currentStage = pl ? (pl.stages || []).find(function (s) { return s.id === deal.sid; }) : null;
  var preWonStageId = (currentStage && currentStage.isWon) ? _findFallbackStageId(deal) : deal.sid;

  var todayStr = new Date().toISOString().slice(0, 10);
  var wonPrice = (typeof selectedQuote.totalPrice === 'number') ? selectedQuote.totalPrice : (deal.val || 0);

  // Build the new cadData mirror to match the won quote (same shape as setActiveDealQuote writes).
  var newCadData = {
    projectItems: selectedQuote.projectItems || [],
    totalPrice: selectedQuote.totalPrice || 0,
    savedAt: selectedQuote.savedAt || null,
    quoteNumber: selectedQuote.quoteNumber || '',
    projectName: (deal.cadData && deal.cadData.projectName) || deal.title || '',
    // (v3.1) Carry the time totals onto the cadData mirror so that the
    // deal-to-job conversion below can seed job.estimatedInstallMinutes
    // etc. directly without re-reading the won quote separately.
    totals: selectedQuote.totals || null
  };

  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: 'Deal won with ' + (selectedQuote.label || 'Quote') + ' ($' + Math.round(wonPrice).toLocaleString() + ')',
    date: todayStr,
    time: new Date().toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name,
    done: false, dueDate: '',
  };

  setState({
    deals: st0.deals.map(function (d) {
      if (d.id !== dealId) return d;
      return Object.assign({}, d, {
        wonQuoteId: selectedQuoteId,
        won: true,
        lost: false,
        wonDate: todayStr,
        sid: targetStageId,
        activeQuoteId: selectedQuoteId,
        val: wonPrice,
        preWonStageId: preWonStageId,
        cadData: newCadData,
        activities: [act, ...(d.activities || [])]
      });
    })
  });

  dbUpdate('deals', dealId, {
    won_quote_id: selectedQuoteId,
    won: true,
    lost: false,
    won_date: todayStr,
    active_quote_id: selectedQuoteId,
    sid: targetStageId,
    val: wonPrice,
    pre_won_stage_id: preWonStageId,
    cad_data: newCadData
  });
  dbInsert('activities', actToDb(act, 'deal', dealId));

  // Audit (Brief 2 Phase 2).
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'deal', entityId:dealId, action:'deal.won_marked',
      summary:'Deal won: ' + (deal.title||'') + ' \u2014 $' + Math.round(wonPrice).toLocaleString(),
      before:{ sid: deal.sid, won: false },
      after:{ sid: targetStageId, won: true, wonDate: todayStr, wonQuoteId: selectedQuoteId, val: wonPrice },
      metadata:{ quoteLabel: selectedQuote.label || null, quoteNumber: selectedQuote.quoteNumber || null },
      branch: deal.branch || null,
    });
  }

  // Brief 4 Phase 3: accrue commission on Won. accrueCommission is
  // idempotent \u2014 re-running on an already-accrued deal is a no-op so a
  // setState replay or Won-button double-click can't promote state
  // inadvertently. If the rep's effective realisation gate is 'won'
  // (default), accrueCommission also auto-realises so the deal is
  // immediately payable via toggleCommissionPaid. The post-update deal
  // record (with won/wonDate/val/wonQuoteId set) is passed so the rule
  // lookup uses the correct rep+branch context.
  if (typeof accrueCommission === 'function') {
    var _accrueDeal = Object.assign({}, deal, {
      won: true,
      wonDate: todayStr,
      wonQuoteId: selectedQuoteId,
      val: wonPrice,
    });
    try { accrueCommission(_accrueDeal); } catch (e) { /* defensive \u2014 never block the won flow */ }
  }

  addToast('\ud83c\udf89 Deal Won!', 'success');

  // Chain into the existing payment-method modal. confirmDealWon() now only
  // needs to persist paymentMethod + create the job — the won state is already written.
  _pendingWonDealId = dealId;
  renderPage();
}

function markDealWon(dealId) {
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  // Step 4: route through the gate. It handles zero/one/two+ quote cases and
  // chains into the payment-method modal on confirmation.
  var wonStageId = _findWonStageId(deal);
  _requestWonTransition(dealId, wonStageId, { source: 'mark-button' });
}

function confirmDealWon(paymentMethod) {
  var dealId = _pendingWonDealId;
  _pendingWonDealId = null;
  var modal = document.getElementById('payMethodModal');
  if (modal) modal.style.display = 'none';
  if (!dealId) return;

  // At this point _commitWon has already run — the deal is already won, at the
  // won stage, with wonQuoteId set. All that's left is persisting the payment
  // method and kicking off job creation.
  setState({ deals: getState().deals.map(function (d) { return d.id === dealId ? Object.assign({}, d, { paymentMethod: paymentMethod }) : d; }) });
  dbUpdate('deals', dealId, { payment_method: paymentMethod });
  addToast('Payment method: ' + (paymentMethod === 'zip' ? 'Zip Money' : 'COD'), 'info');

  var updatedDeal = getState().deals.find(function (d) { return d.id === dealId; });
  if (updatedDeal && !updatedDeal.jobRef) {
    createJobFromWonDeal(updatedDeal, paymentMethod);
  }
}

function cancelDealWon() {
  _pendingWonDealId = null;
  var modal = document.getElementById('payMethodModal');
  if (modal) modal.style.display = 'none';
}

// ── Quote selection modal (Step 4 §2) ─────────────────────────────────────
function renderWonQuoteSelectionModal() {
  var pend = _pendingWonQuoteSelection;
  if (!pend) return '';
  var deal = (getState().deals || []).find(function (d) { return d.id === pend.dealId; });
  if (!deal) return '';
  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];

  var rowsHtml = quotes.map(function (q) {
    var sel = q.id === pend.selectedQuoteId;
    var frameCount = (typeof q.frameCount === 'number') ? q.frameCount : (q.projectItems || []).length;
    var savedAtStr = q.savedAt ? new Date(q.savedAt).toLocaleDateString('en-AU') : '\u2014';
    var isActive = deal.activeQuoteId === q.id;
    var rowBg = sel ? '#f0fdf4' : '#ffffff';
    var rowBorder = sel ? '#86efac' : '#e5e7eb';
    return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:' + rowBg + ';border:1px solid ' + rowBorder + ';border-radius:8px;margin-bottom:8px;cursor:pointer" onclick="event.stopPropagation()">'
      + '<input type="radio" name="wonQuote" value="' + q.id + '" ' + (sel ? 'checked' : '') + ' onchange="selectWonQuote(\'' + q.id + '\')" style="margin-top:3px;accent-color:#c41230">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:8px">'
      + (q.label || 'Quote')
      + (isActive ? '<span style="font-size:9px;color:#6b7280;font-weight:500">(currently active)</span>' : '')
      + '</div>'
      + '<div style="font-size:12px;color:#6b7280;margin-top:3px">' + frameCount + ' frame' + (frameCount === 1 ? '' : 's') + ' \u00b7 $' + Math.round(q.totalPrice || 0).toLocaleString() + '</div>'
      + '<div style="font-size:11px;color:#9ca3af;margin-top:2px">Saved: ' + savedAtStr
      + '  <a href="javascript:void(0)" onclick="event.stopPropagation();viewDealQuote(\'' + deal.id + '\',\'' + q.id + '\')" style="color:#c41230;text-decoration:none;margin-left:10px">View design \u2192</a>'
      + '</div>'
      + '</div>'
      + '</label>';
  }).join('');

  var canContinue = !!pend.selectedQuoteId;
  return '<div id="wonQuoteModal" class="modal-bg" style="display:flex" onclick="if(event.target===this)cancelWonQuoteSelection()">'
    + '<div class="modal" style="max-width:520px">'
    + '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0">'
    + '<h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin:0">Which quote did the customer accept?</h3>'
    + '<p style="color:#6b7280;font-size:12px;margin:6px 0 0">Once confirmed, this choice is locked and drives job creation.</p>'
    + '</div>'
    + '<div class="modal-body" style="padding:18px 24px">' + rowsHtml + '</div>'
    + '<div style="padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb">'
    + '<button onclick="cancelWonQuoteSelection()" class="btn-g" style="font-size:12px">Cancel</button>'
    + '<button onclick="confirmWonQuoteSelection()" ' + (canContinue ? '' : 'disabled')
    + ' style="padding:7px 18px;border:none;border-radius:8px;background:' + (canContinue ? '#c41230' : '#e5e7eb') + ';color:' + (canContinue ? '#fff' : '#9ca3af')
    + ';font-size:12px;font-weight:700;cursor:' + (canContinue ? 'pointer' : 'not-allowed') + ';font-family:inherit">Continue</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

// ── Unwind-won admin action (Step 4 §5) ───────────────────────────────────
function unwindDealWon(dealId) {
  var cu = getCurrentUser() || {};
  if (cu.role !== 'admin') { addToast('Admin only', 'error'); return; }
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  if (!deal.won) { addToast('Deal is not won', 'error'); return; }
  _pendingUnwindDealId = dealId;
  renderPage();
  // Focus the confirm input after render for a good UX.
  setTimeout(function () {
    var el = document.getElementById('unwindConfirmInput');
    if (el) el.focus();
  }, 50);
}

function cancelUnwindDealWon() {
  _pendingUnwindDealId = null;
  renderPage();
}

function confirmUnwindDealWon() {
  var dealId = _pendingUnwindDealId;
  if (!dealId) return;
  var el = document.getElementById('unwindConfirmInput');
  var typed = el ? (el.value || '') : '';
  if (typed !== 'UNWIND') { addToast('Type UNWIND exactly to confirm', 'error'); return; }

  // Brief 4 Phase 4: cancellation reason is required so the clawback
  // audit entry has context. Free text — typically "Customer cancelled",
  // "Pricing dispute", "Wrong product", etc.
  var reasonEl = document.getElementById('unwindReasonInput');
  var reason = reasonEl ? String(reasonEl.value || '').trim() : '';
  if (!reason) { addToast('Cancellation reason is required', 'error'); return; }

  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) { _pendingUnwindDealId = null; renderPage(); return; }
  var restoreStageId = deal.preWonStageId || _findFallbackStageId(deal);
  var cu = getCurrentUser() || { name: 'Admin' };

  // Snapshot pre-unwind values for the clawback (before-state) and audit.
  // Brief 4 Phase 4: also snapshot the commission BEFORE unwinding, since
  // the unwind clears wonQuoteId and calcDealCommission would then fall
  // back to activeQuoteId — possibly producing a different multiplier.
  var prevWonDate = deal.wonDate;
  var prevWonQuoteId = deal.wonQuoteId;
  var prevVal = deal.val;
  var prevCommission = 0;
  if (typeof calcDealCommission === 'function') {
    try { prevCommission = calcDealCommission(deal).commission || 0; } catch (e) {}
  }

  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: 'Deal unwound from Won by ' + cu.name + ' — ' + reason,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    by: cu.name, done: false, dueDate: '',
  };

  setState({
    deals: getState().deals.map(function (d) {
      if (d.id !== dealId) return d;
      return Object.assign({}, d, {
        wonQuoteId: null,
        won: false,
        wonDate: null,
        preWonStageId: null,
        sid: restoreStageId,
        // Intentionally do NOT touch activeQuoteId or quotes[] — the rep can
        // still see what was previously won. Job (if any) is NOT deleted.
        activities: [act, ...(d.activities || [])]
      });
    })
  });

  dbUpdate('deals', dealId, {
    sid: restoreStageId,
    won_quote_id: null,
    won: false,
    won_date: null,
    pre_won_stage_id: null
  });
  dbInsert('activities', actToDb(act, 'deal', dealId));

  // Brief 4 Phase 4: clawback the commission. We pass the snapshotted
  // wonDate + commission so the helper doesn't need to read from state
  // (which has already been mutated to the unwound shape). This avoids
  // a setState dance and keeps the render count to one.
  var clawback = null;
  if (typeof clawbackCommission === 'function') {
    try {
      clawback = clawbackCommission(dealId, reason, {
        wonDate: prevWonDate,
        commissionOverride: prevCommission,
      });
    } catch (e) {}
  }

  // Brief 2 Phase 2 + Brief 4 Phase 4: cancellation audit entry. The
  // clawback function writes its own commission.clawed_back entry for
  // the money math; this one captures the deal-level cancellation event.
  if (typeof appendAuditEntry === 'function') {
    try {
      appendAuditEntry({
        entityType: 'deal', entityId: dealId,
        action: 'deal.won_unwound',
        summary: 'Won deal cancelled: ' + (deal.title || dealId) + ' — ' + reason,
        before: { won: true, wonDate: prevWonDate, wonQuoteId: prevWonQuoteId, sid: deal.sid, val: prevVal },
        after:  { won: false, wonDate: null, wonQuoteId: null, sid: restoreStageId, val: prevVal },
        metadata: {
          reason: reason,
          clawbackTier: clawback ? clawback.tier : null,
          clawedBackAmount: clawback ? clawback.clawedBackAmount : null,
          alreadyClawed: clawback ? clawback.alreadyClawed : false,
        },
        branch: deal.branch || null,
      });
    } catch (e) {}
  }

  _pendingUnwindDealId = null;
  // Toast surfaces the clawback outcome so admin sees the math
  // immediately. For 'skipped' tier the message is just "unwound";
  // for 'partial' / 'full' it shows the dollar amount clawed back.
  var toastMsg = 'Deal unwound from Won';
  if (clawback && clawback.tier === 'full') {
    toastMsg += ' — full clawback ($' + clawback.clawedBackAmount.toFixed(2) + ')';
  } else if (clawback && clawback.tier === 'partial') {
    toastMsg += ' — partial clawback (kept ' + clawback.keepPct + '%, clawed $' + clawback.clawedBackAmount.toFixed(2) + ')';
  } else if (clawback && clawback.tier === 'skipped') {
    toastMsg += ' — clawback skipped (' + clawback.daysSinceWon + ' days since won)';
  }
  addToast(toastMsg, 'warning');
  renderPage();
}

function renderUnwindDealModal() {
  var dealId = _pendingUnwindDealId;
  if (!dealId) return '';
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return '';
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  var restoreStageId = deal.preWonStageId || _findFallbackStageId(deal);
  var restoreStage = pl ? (pl.stages || []).find(function (s) { return s.id === restoreStageId; }) : null;
  var restoreStageName = restoreStage ? restoreStage.name : restoreStageId;

  // Find associated job (if any) via jobRef → job.jobNumber.
  var job = null;
  if (deal.jobRef) {
    job = (getState().jobs || []).find(function (j) { return j.jobNumber === deal.jobRef; });
  }

  var jobWarning = job
    ? '<div style="margin-top:10px;padding:10px 12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:12px;color:#92400e">'
    + '\u26a0 Job <b>' + (job.jobNumber || '') + '</b> has already been created from this deal. '
    + 'Unwinding will NOT delete the job \u2014 you\u2019ll need to handle it manually on the Jobs page.'
    + '</div>'
    : '';

  // Brief 4 Phase 4: clawback preview. Show the user what's about to
  // happen to commission BEFORE they confirm. previewClawbackForDeal is
  // a pure-read helper that returns {tier, keepPct, daysSinceWon,
  // originalCommission, clawedBackAmount, remainingCommission} without
  // mutating state.
  var clawbackBlock = '';
  if (typeof previewClawbackForDeal === 'function') {
    var preview = previewClawbackForDeal(deal);
    if (preview && preview.originalCommission > 0) {
      var tierColor = preview.tier === 'full' ? '#b91c1c' : preview.tier === 'partial' ? '#92400e' : '#15803d';
      var tierBg    = preview.tier === 'full' ? '#fee2e2' : preview.tier === 'partial' ? '#fef9c3' : '#f0fdf4';
      var tierLabel = preview.tier === 'full' ? 'Full clawback' : preview.tier === 'partial' ? 'Partial clawback (' + preview.keepPct + '% kept)' : 'No clawback (over threshold)';
      var fmt = function (n) { return '$' + n.toFixed(2); };
      clawbackBlock = '<div style="margin-top:14px;padding:12px 14px;background:' + tierBg + ';border:1px solid ' + tierColor + '40;border-radius:8px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        +   '<div style="font-size:12px;font-weight:700;color:' + tierColor + '">\ud83d\udcb0 ' + tierLabel + '</div>'
        +   '<div style="font-size:11px;color:#6b7280">' + preview.daysSinceWon + ' days since won</div>'
        + '</div>'
        + '<div style="font-size:11px;color:#374151;line-height:1.5">'
        +   'Original commission: <b>' + fmt(preview.originalCommission) + '</b><br>'
        +   (preview.tier === 'skipped'
              ? 'Commission preserved in full \u2014 deal won more than ' + (preview.policy.partialClawbackUnderDays || 90) + ' days ago.'
              : 'Clawing back: <b>' + fmt(preview.clawedBackAmount) + '</b> \u00b7 Remaining: <b>' + fmt(preview.remainingCommission) + '</b>')
        + '</div></div>';
    }
  }

  return '<div id="unwindDealModal" class="modal-bg" style="display:flex" onclick="if(event.target===this)cancelUnwindDealWon()">'
    + '<div class="modal" style="max-width:520px;padding:0;overflow:hidden">'
    + '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0">'
    + '<h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin:0;color:#b91c1c">\u26a0 Unwind won state</h3>'
    + '</div>'
    + '<div style="padding:20px 24px">'
    + '<div style="font-size:13px;color:#374151;line-height:1.5">This will clear the won quote and move the deal back to <b>' + restoreStageName + '</b>.</div>'
    + jobWarning
    + clawbackBlock
    + '<div style="margin-top:16px;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">Cancellation reason <span style="color:#dc2626">*</span></div>'
    + '<input id="unwindReasonInput" type="text" autocomplete="off" placeholder="e.g. Customer cancelled, Pricing dispute" style="width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px">'
    + '<div style="margin-top:16px;font-size:12px;color:#6b7280">Type <code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;font-weight:700;color:#b91c1c">UNWIND</code> to confirm:</div>'
    + '<input id="unwindConfirmInput" type="text" autocomplete="off" style="margin-top:6px;width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:monospace;font-size:13px" placeholder="UNWIND">'
    + '</div>'
    + '<div style="padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb">'
    + '<button onclick="cancelUnwindDealWon()" class="btn-g" style="font-size:12px">Cancel</button>'
    + '<button onclick="confirmUnwindDealWon()" style="padding:7px 18px;border:none;border-radius:8px;background:#b91c1c;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Unwind</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function renderPaymentMethodModal() {
  return '<div id="payMethodModal" class="modal-bg" style="display:flex" onclick="if(event.target===this)cancelDealWon()">'
    + '<div class="modal" style="max-width:420px;padding:0;overflow:hidden">'
    + '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0"><h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;margin:0">\ud83c\udf89 Deal Won! Select Payment Method</h3>'
    + '<p style="color:#6b7280;font-size:13px;margin:6px 0 0">This determines the invoicing structure for the job.</p></div>'
    + '<div style="padding:24px;display:flex;flex-direction:column;gap:12px">'
    // COD option
    + '<div onclick="confirmDealWon(\'cod\')" style="display:flex;align-items:center;gap:14px;padding:18px 20px;border:2px solid #22c55e;border-radius:12px;cursor:pointer;background:#f0fdf4" onmouseover="this.style.background=\'#dcfce7\'" onmouseout="this.style.background=\'#f0fdf4\'">'
    + '<div style="width:48px;height:48px;border-radius:12px;background:#22c55e;color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800">\ud83d\udcb5</div>'
    + '<div><div style="font-size:15px;font-weight:700;color:#15803d">COD \u2014 Cash on Delivery</div>'
    + '<div style="font-size:12px;color:#6b7280;margin-top:2px">Standard 4-stage invoicing: 5% deposit \u2192 45% CM \u2192 45% pre-install \u2192 5% completion</div></div></div>'
    // Zip option
    + '<div onclick="confirmDealWon(\'zip\')" style="display:flex;align-items:center;gap:14px;padding:18px 20px;border:2px solid #a855f7;border-radius:12px;cursor:pointer;background:#faf5ff" onmouseover="this.style.background=\'#f3e8ff\'" onmouseout="this.style.background=\'#faf5ff\'">'
    + '<div style="width:48px;height:48px;border-radius:12px;background:#a855f7;color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800">ZIP</div>'
    + '<div><div style="font-size:15px;font-weight:700;color:#7c3aed">Zip Money \u2014 Finance</div>'
    + '<div style="font-size:12px;color:#6b7280;margin-top:2px">20% deposit invoice raised. Remaining 80% funded by Zip Money. Weekly cap: $20,000.</div></div></div>'
    + '</div>'
    + '<div style="padding:12px 24px;border-top:1px solid #f0f0f0;text-align:right"><button onclick="cancelDealWon()" class="btn-g" style="font-size:12px">Cancel</button></div>'
    + '</div></div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// Brief 1: LOST FLOW — gated transition with mandatory reason capture
// ══════════════════════════════════════════════════════════════════════════════
// All four Lost entry points (drag-to-Lost, kanban Lost button, deal-detail
// Lost button, programmatic moveDealToStage to a Lost stage) converge on
// _requestLostTransition. The deal stays in its current stage until the user
// picks a reason and clicks Save in the modal. Cancelling leaves the deal
// untouched.
//
// Replaces the old askLostReason() prompt-based flow which had a fall-through
// bug (markDealLost returned early before askLostReason fired) and used
// window.prompt() — incompatible with the rest of the modal-based UI.

// localStorage-backed config so the reasons list is admin-editable (Settings
// tab below). Each reason is {id, label, active} so deactivating preserves
// historical references on existing deals.
var DEFAULT_LOST_REASONS = [
  { id: 'price',        label: 'Price',         active: true },
  { id: 'competitor',   label: 'Competitor',    active: true },
  { id: 'timing',       label: 'Timing',        active: true },
  { id: 'ghosted',      label: 'Ghosted',       active: true },
  { id: 'scope_changed', label: 'Scope changed', active: true },
  { id: 'other',        label: 'Other',         active: true },
];

function getLostReasons() {
  try {
    var raw = localStorage.getItem('spartan_lost_reasons');
    if (!raw) return DEFAULT_LOST_REASONS.slice();
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_LOST_REASONS.slice();
  } catch (e) { return DEFAULT_LOST_REASONS.slice(); }
}

function saveLostReasons(arr) {
  try { localStorage.setItem('spartan_lost_reasons', JSON.stringify(arr || [])); } catch (e) {}
}

// Public — used by the Lost Reasons report (09-reports.js) to render the
// human label for a stored lostReasonId, with a fallback for legacy deals
// that have only the legacy lostReason string.
function lostReasonLabelFor(deal) {
  if (!deal) return 'Not specified';
  if (deal.lostReasonId) {
    var match = getLostReasons().find(function (r) { return r.id === deal.lostReasonId; });
    if (match) return match.label;
  }
  return deal.lostReason || 'Not specified';
}

// Entry point — every Lost path calls this. The deal hasn't moved yet; the
// modal's Save handler does the actual mutation.
function _requestLostTransition(dealId, targetStageId, opts) {
  opts = opts || {};
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;

  // If already lost, no-op (don't re-prompt for reason on a deal that's
  // already in a Lost stage with a recorded reason).
  if (deal.lost) {
    addToast('Deal is already marked as Not Proceeding', 'info');
    return;
  }

  // If targetStageId not provided, find the pipeline's Lost stage.
  if (!targetStageId) {
    var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
    var lostStage = pl ? pl.stages.find(function (s) { return s.isLost; }) : null;
    if (!lostStage) {
      addToast('No Lost stage configured on this pipeline', 'error');
      return;
    }
    targetStageId = lostStage.id;
  }

  _pendingLostTransition = {
    dealId: dealId,
    targetStageId: targetStageId,
    source: opts.source || 'unknown',
    selectedReasonId: '',
    competitorName: '',
    details: '',
  };
  renderPage();
}

function cancelLostTransition() {
  _pendingLostTransition = null;
  renderPage();
}

// Internal — radio onchange in the modal updates the draft; we re-render so
// the conditional Competitor input shows/hides without a stale-state glitch.
function setLostReasonDraft(reasonId) {
  if (!_pendingLostTransition) return;
  _pendingLostTransition.selectedReasonId = reasonId;
  renderPage();
}
function setLostCompetitorDraft(value) {
  if (_pendingLostTransition) _pendingLostTransition.competitorName = value;
}
function setLostDetailsDraft(value) {
  if (_pendingLostTransition) _pendingLostTransition.details = value;
}

function confirmLostTransition() {
  var p = _pendingLostTransition;
  if (!p) return;
  if (!p.selectedReasonId) {
    addToast('Pick a reason first', 'error');
    return;
  }

  var s = getState();
  var deal = (s.deals || []).find(function (d) { return d.id === p.dealId; });
  if (!deal) { _pendingLostTransition = null; return; }

  var reasons = getLostReasons();
  var reason = reasons.find(function (r) { return r.id === p.selectedReasonId; }) || { id: p.selectedReasonId, label: p.selectedReasonId };
  var competitor = p.competitorName.trim();
  var details = p.details.trim();
  var oldSid = deal.sid;
  var nowDate = new Date().toISOString().slice(0, 10);
  var nowTime = new Date().toTimeString().slice(0, 5);
  var byUser = (getCurrentUser() || { name: 'Admin' }).name;

  // Activity-timeline entry. Mirrors the dropDeal pattern.
  var summaryParts = ['Deal lost — ' + reason.label];
  if (competitor) summaryParts.push('(' + competitor + ')');
  if (details) summaryParts.push(': ' + details);
  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: summaryParts.join(' '),
    date: nowDate,
    time: nowTime,
    by: byUser,
    done: false,
    dueDate: '',
  };

  setState({
    deals: s.deals.map(function (d) {
      if (d.id !== p.dealId) return d;
      return Object.assign({}, d, {
        sid: p.targetStageId,
        won: false,
        lost: true,
        wonDate: null,
        lostReasonId: reason.id,
        lostReason: reason.label, // legacy field — kept for backwards compat with old reports
        lostCompetitor: competitor || null,
        lostDetails: details || null,
        activities: [act].concat(d.activities || []),
      });
    }),
  });

  // Persist to Supabase. Columns may not exist yet — Supabase will error on
  // the missing columns and the rest of the local state still saves. Schema
  // migration is a separate task per the brief.
  dbUpdate('deals', p.dealId, {
    sid: p.targetStageId,
    won: false,
    lost: true,
    won_date: null,
    lost_reason: reason.label,
    lost_reason_id: reason.id,
    lost_competitor: competitor || null,
    lost_details: details || null,
  });
  dbInsert('activities', actToDb(act, 'deal', p.dealId));

  // Audit (Brief 2 Phase 1 primitive)
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType: 'deal',
      entityId: p.dealId,
      action: 'deal.lost_marked',
      summary: 'Deal lost: ' + reason.label + (competitor ? ' — ' + competitor : ''),
      before: { sid: oldSid, lost: false },
      after: {
        sid: p.targetStageId,
        lost: true,
        lostReasonId: reason.id,
        lostCompetitor: competitor || null,
        lostDetails: details || null,
      },
      metadata: { source: p.source },
      branch: deal.branch || null,
    });
  }

  _pendingLostTransition = null;
  addToast('Deal marked as Not Proceeding — ' + reason.label, 'warning');
  renderPage();
}

// Modal renderer — mounted in 99-init.js:renderPage when _pendingLostTransition is set.
function renderLostReasonModal() {
  if (!_pendingLostTransition) return '';
  var p = _pendingLostTransition;
  var reasons = getLostReasons().filter(function (r) { return r.active; });
  var showCompetitor = p.selectedReasonId === 'competitor';

  return ''
    + '<div class="modal-bg" onclick="if(event.target===this)cancelLostTransition()">'
    +   '<div class="modal" style="max-width:480px">'
    +     '<div class="modal-header">'
    +       '<h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">Why was this deal lost?</h3>'
    +       '<button onclick="cancelLostTransition()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>'
    +     '</div>'
    +     '<div class="modal-body" style="display:flex;flex-direction:column;gap:14px">'
    +       '<div style="display:flex;flex-direction:column;gap:6px">'
    +         reasons.map(function (r) {
                var checked = p.selectedReasonId === r.id;
                return '<label for="lr_reason_' + r.id + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid ' + (checked ? '#c41230' : '#e5e7eb') + ';background:' + (checked ? '#fff5f6' : '#fff') + ';border-radius:10px;cursor:pointer;font-size:13px;font-weight:' + (checked ? '600' : '400') + '">'
                  + '<input type="radio" id="lr_reason_' + r.id + '" name="lr_reason" value="' + r.id + '" ' + (checked ? 'checked' : '') + ' onchange="setLostReasonDraft(\'' + r.id + '\')" style="accent-color:#c41230">'
                  + '<span>' + (r.label || r.id) + '</span>'
                  + '</label>';
              }).join('')
    +       '</div>'
    +       (showCompetitor ? (''
              + '<div>'
              +   '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Competitor name</label>'
              +   '<input id="lr_competitor" class="inp" value="' + (p.competitorName || '').replace(/"/g, '&quot;') + '" placeholder="e.g. ABC Windows" oninput="setLostCompetitorDraft(this.value)" style="font-size:13px">'
              + '</div>'
            ) : '')
    +       '<div>'
    +         '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Optional details</label>'
    +         '<textarea id="lr_details" class="inp" rows="3" placeholder="Anything else worth noting…" oninput="setLostDetailsDraft(this.value)" style="font-size:13px;resize:vertical;border-radius:8px;padding:8px 10px">' + (p.details || '').replace(/</g, '&lt;') + '</textarea>'
    +       '</div>'
    +     '</div>'
    +     '<div class="modal-footer">'
    +       '<button onclick="cancelLostTransition()" class="btn-w" style="font-size:13px">Cancel</button>'
    +       '<button onclick="confirmLostTransition()" class="btn-r" style="font-size:13px;background:#dc2626;border-color:#dc2626">Mark as Not Proceeding</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

// markDealLost — entry point for the Deal Detail action bar's Lost button
// and the kanban quick-edit modal's Lost button. Always gates through
// _requestLostTransition so the modal opens.
function markDealLost(dealId) {
  _requestLostTransition(dealId, null, { source: 'mark-button' });
}

// ── Create Job from Won Deal (replaces old convertDealToJob stub) ────────────
async function createJobFromWonDeal(deal, paymentMethod) {
  if (!deal || deal.jobRef) return;
  var branch = (deal.branch || 'VIC').toUpperCase();
  var cu = getCurrentUser() || { id: 'system', name: 'System' };
  var pm = paymentMethod || deal.paymentMethod || 'cod';

  try {
    var jobNumber = await rpcNextJobNumber(branch);
    var contact = getState().contacts.find(function (c) { return c.id === deal.cid; });

    // Step 4 §4: prefer the won quote as the source design. Fall back to the
    // cadData mirror only for legacy deals that were won before Step 4 shipped
    // AND have no quotes[]. This is the customer-agreed design, not whatever
    // happened to be mirrored last.
    var sourceQuote = null;
    if (deal.wonQuoteId && Array.isArray(deal.quotes)) {
      sourceQuote = deal.quotes.find(function (q) { return q.id === deal.wonQuoteId; }) || null;
    }
    var jobCadData, jobVal, sourceQuoteId;
    if (sourceQuote) {
      jobCadData = {
        projectItems: sourceQuote.projectItems || [],
        totalPrice: sourceQuote.totalPrice || 0,
        savedAt: sourceQuote.savedAt || null,
        quoteNumber: sourceQuote.quoteNumber || '',
        projectName: (deal.cadData && deal.cadData.projectName) || deal.title || '',
        // (v3.1) Carry totals onto the job's cadData blob so any code
        // reading from cadData.totals (rather than the top-level job
        // fields below) still finds them.
        totals: sourceQuote.totals || null
      };
      jobVal = sourceQuote.totalPrice || deal.val || 0;
      sourceQuoteId = sourceQuote.id;
    } else {
      jobCadData = deal.cadData || null;
      jobVal = (deal.cadData && deal.cadData.totalPrice > 0) ? deal.cadData.totalPrice : (deal.val || 0);
      sourceQuoteId = null;
    }

    // (v3.1) Time totals seed values for the new job. We pull from the
    // won quote's totals when available; otherwise from the deal.cadData
    // mirror (covers legacy deals migrated from pre-quotes data); otherwise
    // null (capacity planner falls back to its default heuristic).
    var seedTotals = (sourceQuote && sourceQuote.totals)
      || (deal.cadData && deal.cadData.totals)
      || null;
    var seedInstallMin = (seedTotals && typeof seedTotals.installMinutes === 'number') ? seedTotals.installMinutes : null;
    var seedProductionMin = (seedTotals && typeof seedTotals.productionMinutes === 'number') ? seedTotals.productionMinutes : null;
    var seedStationTimes = (seedTotals && seedTotals.stationTimes && typeof seedTotals.stationTimes === 'object') ? seedTotals.stationTimes : null;

    var job = {
      id: 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      jobNumber: jobNumber,
      dealId: deal.id,
      contactId: deal.cid || null,
      branch: branch,
      legalEntity: JOB_LEGAL_ENTITIES[branch] || '',
      title: deal.title || '',
      val: jobVal,
      cadData: jobCadData, // Design data from the won quote (or legacy mirror)
      sourceQuoteId: sourceQuoteId, // Step 4 §4: which quote this job was built from
      cadSurveyData: null, // Survey/check measure data (added by surveyor)
      street: deal.street || '',
      suburb: deal.suburb || '',
      postcode: deal.postcode || '',
      state: { VIC: 'VIC', ACT: 'ACT', SA: 'SA', TAS: 'TAS' }[branch] || 'VIC',
      lat: null,
      lng: null,
      status: 'a_check_measure',
      statusHistory: [{ status: 'a_check_measure', at: new Date().toISOString(), by: cu.id, note: 'Job created from Won deal' }],
      hold: false,
      holdReason: '',
      cmBookedDate: null,
      cmBookedTime: null,
      cmAssignedTo: null,
      cmCompletedAt: null,
      cmDocUrl: null,
      cmPhotos: [],
      renderWarning: false,
      accessNotes: '',
      parkingNotes: '',
      signatures: {},
      finalSignedAt: null,
      finalSignedPdfUrl: null,
      // Step 5 §2.1 / (v3.1): seed time fields from the won quote's totals
      // when CAD provided them, else null. Nulls keep the legacy
      // pre-Step-5 default behaviour for jobs created from pre-WIP28
      // deals — capacity planner falls back to its heuristic.
      cadFinalData: null,
      estimatedInstallMinutes: seedInstallMin,
      estimatedProductionMinutes: seedProductionMin,
      stationTimes: seedStationTimes,
      finalRenderedPdfUrl: null,
      dispatchDate: null,
      installDate: null,
      installTime: null,
      installCrew: [],
      installDurationHours: null,
      installCompletedAt: null,
      paymentMethod: pm, // 'cod' or 'zip'
      invoice45Id: null,
      invoiceFinalId: null,
      orderSuffix: 'O',
      tags: [],
      notes: '',
      windows: [],
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      createdBy: cu.id,
    };

    // Optimistic state update
    setState({ jobs: [...(getState().jobs || []), job] });

    // Persist job
    dbInsert('jobs', jobToDb(job));

    // Link back to deal via jobRef
    setState({ deals: getState().deals.map(function (d) { return d.id === deal.id ? { ...d, jobRef: jobNumber } : d; }) });
    dbUpdate('deals', deal.id, { job_ref: jobNumber });

    // Log activity on the deal
    var dealAct = {
      id: 'a' + Date.now() + '_dj',
      type: 'note',
      text: '🏗️ Job ' + jobNumber + ' created from this deal',
      date: new Date().toISOString().slice(0, 10),
      by: cu.name, done: false, dueDate: '',
    };
    dbInsert('activities', actToDb(dealAct, 'deal', deal.id));

    // Log activity on the job
    var jobAct = {
      id: 'a' + Date.now() + '_jc',
      type: 'note',
      text: 'Job created from Won deal: ' + deal.title + (contact ? ' — ' + contact.fn + ' ' + contact.ln : ''),
      date: new Date().toISOString().slice(0, 10),
      by: cu.name, done: false, dueDate: '',
    };
    dbInsert('activities', actToDb(jobAct, 'job', job.id));

    // Push notification
    var notif = {
      id: 'n_job_' + Date.now(),
      title: '🏗️ New Job: ' + jobNumber,
      body: deal.title + ' — ready for check measure booking',
      read: false,
      to: 'jobs',
      type: 'job_created',
    };
    setState({ notifs: [notif, ...getState().notifs] });

    // Initialize 4-stage progress claims and auto-generate 5% deposit invoice
    initJobClaims(job.id, job.val, pm);
    if (pm === 'zip') {
      generateJobInvoice(job.id, 'cl_dep', 20, '20% Deposit (Zip Finance) — ' + jobNumber + ' — ' + (deal.title || ''), new Date(Date.now() + 7 * 24 * 3600000).toISOString().slice(0, 10));
      logJobAudit(job.id, 'Job Created', 'Created from Won deal (ZIP MONEY). 20% deposit invoice auto-generated. Remaining 80% via Zip Money.');
    } else {
      generateJobInvoice(job.id, 'cl_dep', 5, '5% Deposit — ' + jobNumber + ' — ' + (deal.title || ''), new Date(Date.now() + 7 * 24 * 3600000).toISOString().slice(0, 10));
      logJobAudit(job.id, 'Job Created', 'Created from Won deal (COD). 5% deposit invoice auto-generated.');
    }

    addToast('Job ' + jobNumber + ' created \u2014 5% deposit invoice sent', 'success');
    return job;
  } catch (e) {
    console.error('[jobs] createJobFromWonDeal failed:', e);
    addToast('Failed to create job — ' + (e.message || e), 'error');
    return null;
  }
}

// Legacy stub — redirects to new function
function convertDealToJob(dealId) {
  var deal = getState().deals.find(function (d) { return d.id === dealId; });
  if (deal) createJobFromWonDeal(deal);
}

function openDealPanel(did) { setState({ dealDetailId: did }); }

function openNewDealModal() { setState({ page: 'deals', dealDetailId: null, modal: { type: 'newDeal' } }); }

function renderDealDetail() {
  const { deals, contacts, dealDetailId, dealFields, dealFieldValues } = getState();
  const d = deals.find(x => x.id === dealDetailId);
  if (!d) {
    // Deal not found in state yet — may be a race with an in-flight dbInsert
    // (e.g. right after lead-to-deal conversion, the realtime echo from the
    // leads update can fire before the deals insert lands). Show a brief
    // loading state and let the next render resolve it, rather than hard-
    // bouncing back to the deals list.
    return '<div style="display:flex;align-items:center;justify-content:center;height:60vh;flex-direction:column;gap:12px;color:#6b7280"><div style="font-family:Syne,sans-serif;font-size:16px;font-weight:600">Opening deal…</div><div style="font-size:12px;color:#9ca3af">If this persists, <span style="color:#c41230;cursor:pointer;text-decoration:underline" onclick="setState({dealDetailId:null})">return to deals</span>.</div></div>';
  }
  const pl = PIPELINES.find(p => p.id === d.pid);
  const stages = pl ? pl.stages.sort((a, b) => a.ord - b.ord) : [];
  const curStage = pl ? pl.stages.find(s => s.id === d.sid) : null;
  const contact = contacts.find(c => c.id === d.cid);
  const fv = (dealFieldValues && dealFieldValues[d.id]) || {};
  const activities = getEntityActivities(d.id, 'deal');
  const pct = curStage ? curStage.prob : 0;

  // Stage bar
  const stageBarHtml = stages.map((st, i) => {
    const idx = stages.findIndex(s => s.id === d.sid);
    const active = st.id === d.sid, past = i < idx;
    return `<button onclick="moveDealToStage('${d.id}','${st.id}')" style="flex:1;min-width:80px;padding:10px 6px;border:none;border-bottom:3px solid ${active ? '#c41230' : 'transparent'};cursor:pointer;font-size:11px;font-weight:${active ? 700 : 500};font-family:inherit;background:none;color:${active ? '#c41230' : past ? '#16a34a' : '#9ca3af'};text-align:center;transition:all .15s" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='none'">
      ${past ? '✓ ' : ''}${st.name}<br><span style="font-size:10px;opacity:.55">${d.age || 0}d</span>
    </button>`;
  }).join('');

  // LEFT SIDEBAR
  const leftSidebar = `
    <!-- Summary -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Summary</span>
      </div>

      <!-- Value -->
      <div style="margin-bottom:14px">
        <div style="font-size:11px;color:#9ca3af;margin-bottom:2px">Deal value</div>
        <div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#1a1a1a">${fmt$(getDealDisplayValue(d))}</div>
        <div style="font-size:11px;color:#9ca3af;margin-top:2px">Weighted: ${fmt$(Math.round(getDealDisplayValue(d) * (pct / 100)))} · ${pct}%</div>
      </div>

      <!-- Type — Brief 5 Phase 4. Click the badge to open the picker. -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f9fafb">
        <span style="font-size:12px;color:#9ca3af">Type</span>
        <span onclick="openDealTypePicker('${d.id}')" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px" title="Click to change">
          ${_dealTypeBadge(d)}
          <span style="font-size:10px;color:#9ca3af">▾</span>
        </span>
      </div>

      <!-- Key fields -->
      ${[
      ['Pipeline → Stage', curStage ? curStage.name : '—', curStage ? curStage.col : ''],
      ['Owner', d.rep, ''],
      ['Branch', d.branch, ''],
      ['Address', [d.street, d.suburb, d.postcode].filter(Boolean).join(', ') || '—', ''],
      ['Expected close', d.closeDate || '—', ''],
      ['Source', contact ? contact.source : '—', ''],
    ].map(([l, v, col]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid #f9fafb">
        <span style="font-size:12px;color:#9ca3af">${l}</span>
        <span style="font-size:12px;font-weight:500;color:${col || '#374151'}">${v}</span>
      </div>`).join('')}
    </div>

    <!-- Person -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Person</span>
        ${contact ? `<button onclick="setState({contactDetailId:'${contact.id}',dealDetailId:null})" class="btn-g" style="font-size:11px;padding:3px 8px">View</button>` : ''}
      </div>
      ${contact ? `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;cursor:pointer" onclick="setState({contactDetailId:'${contact.id}',dealDetailId:null})">
        <div style="width:38px;height:38px;background:#c41230;border-radius:50%;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(contact.fn + ' ' + contact.ln)}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#1a1a1a">${contact.fn} ${contact.ln}</div>
          ${contact.co ? `<div style="font-size:12px;color:#6b7280">${contact.co}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        <a href="mailto:${contact.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:7px">${Icon({ n: 'mail2', size: 13 })} ${contact.email || '—'}</a>
        ${contact.email ? `<button onclick="detailTab='email';renderPage()" class="btn-r" style="font-size:11px;padding:4px 10px;margin-top:4px;width:100%;justify-content:center;gap:5px">${Icon({ n: 'send', size: 12 })} Send Email</button>` : ''}
        ${contact.phone ? `<a href="javascript:void(0)" onclick="twilioCall('${contact.phone}','${contact.id}','contact')" style="font-size:12px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:7px;cursor:pointer">${Icon({ n: 'phone2', size: 13 })} ${contact.phone}</a>` : `<div style="font-size:12px;color:#9ca3af;display:flex;align-items:center;gap:7px">${Icon({ n: 'phone2', size: 13 })} —</div>`}
        <div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:7px">${Icon({ n: 'pin', size: 13 })} ${[contact.street, contact.suburb, contact.state, contact.postcode].filter(Boolean).join(', ') || 'No address'}</div>
      </div>`: `<div style="font-size:13px;color:#9ca3af">No contact linked</div>`}
    </div>

    <!-- Details (custom fields) -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Details</span>
        <button onclick="addToast('Field editor in Settings → Custom Fields','info')" class="btn-g" style="font-size:11px;padding:3px 8px">${Icon({ n: 'edit', size: 12 })}</button>
      </div>
      ${dealFields.sort((a, b) => a.ord - b.ord).map(field => `
        <div style="padding:6px 0;border-bottom:1px solid #f9fafb" onclick="cfStartEdit('${d.id}','${field.id}','deal')">
          <div style="font-size:11px;color:#9ca3af;margin-bottom:2px">${field.label}</div>
          <div id="cf_${d.id}_${field.id}_display" style="font-size:13px;font-weight:500;color:#374151;cursor:pointer">${renderCFValue(field, fv[field.id])}</div>
        </div>`).join('')}
    </div>

    <!-- Invoicing -->
    ${renderDealInvoiceSection(d.id)}

    <!-- Spartan CAD Design — multi-quote (spec §3.2) -->
    ${renderDealQuoteList(d)}

    <!-- Labels -->
    <div style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Labels</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${(d.tags || [contact && contact.tags ? contact.tags[0] : null]).filter(Boolean).map(t => `<span class="tag">${t}</span>`).join('') || '<span style="font-size:12px;color:#9ca3af">+ Add label</span>'}
      </div>
    </div>
  `;

  return renderEntityDetail({
    entityType: 'deal', entityId: d.id,
    title: d.title, owner: d.rep,
    stageBarHtml,
    wonLostHtml: `
      ${canEditDeal(d) ? `<button onclick="openDealEditDrawer('${d.id}')" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({ n: 'edit', size: 12 })} Edit</button>` : ''}
      ${d.jobRef ? `<button onclick="setState({crmMode:'jobs',page:'jobs',jobDetailId:(getState().jobs.find(function(j){return j.jobNumber==='${d.jobRef}'})||{}).id||null})" class="btn-w" style="font-size:12px;width:100%;justify-content:center;margin-top:4px;color:#15803d;border-color:#86efac;background:#f0fdf4">🏗️ Job ${d.jobRef} — View</button>` :
        `<button onclick="convertDealToJob('${d.id}')" class="btn-w" style="font-size:12px;width:100%;justify-content:center;margin-top:4px">🏗️ Create Job</button>`}
      <button onclick="markDealWon('${d.id}')" style="padding:6px 16px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Won</button>
      <button onclick="markDealLost('${d.id}')" style="padding:6px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-left:6px">Not Proceeding</button>
      ${(d.won && (getCurrentUser() || {}).role === 'admin') ? `<button onclick="unwindDealWon('${d.id}')" title="Admin: reverse the won state" style="padding:5px 12px;background:transparent;color:#6b7280;border:1px solid #d1d5db;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;margin-left:6px">↶ Unwind won</button>` : ''}`,
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({dealDetailId:null})",
    backLabel: "Pipeline",
    activities,
    contact,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// LEAD DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════

function setLeadStatus(leadId, status) {
  setState({
    leads: getState().leads.map(l =>
      l.id === leadId ? { ...l, status } : l
    )
  });
  dbUpdate('leads', leadId, { status: status });
  addToast('Status set to ' + status, 'success');
}

// Claim an unassigned lead. Gated by canEditLead so only reps whose
// serviceStates cover the lead's state can take it. Logs an activity for
// the audit trail so "who picked this up" is visible on the lead.
function claimLead(leadId) {
  var u = getCurrentUser();
  if (!u) { addToast('Sign in required', 'error'); return; }
  var lead = getState().leads.find(function (l) { return l.id === leadId; });
  if (!lead) return;
  if (lead.owner) { addToast('Already owned by ' + lead.owner, 'error'); return; }
  if (!canEditLead(lead)) { addToast('Lead is outside your service states', 'error'); return; }
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'claim',
    subject: u.name + ' claimed this lead',
    text: 'Was unassigned — now owned by ' + u.name,
    by: u.name,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    done: false,
  };
  var updated = Object.assign({}, lead, { owner: u.name });
  updated.activities = [actObj].concat(lead.activities || []);
  setState({
    leads: getState().leads.map(function (l) { return l.id === leadId ? updated : l; }),
  });
  try { dbInsert('activities', actToDb(actObj, 'lead', leadId)); } catch (e) { }
  addToast('Claimed — ' + lead.fn + ' ' + lead.ln + ' is now yours', 'success');
}


function renderLeadDetail() {
  const { leads, contacts, leadDetailId } = getState();
  const lead = leads.find(x => x.id === leadDetailId);
  if (!lead) { setState({ leadDetailId: null }); return renderLeads(); }
  const contact = contacts.find(c => c.email === lead.email && lead.email);
  const activities = getEntityActivities(lead.id, 'lead');
  const statusColor = { New: '#3b82f6', Contacted: '#f59e0b', Qualified: '#22c55e', Unqualified: '#9ca3af', Archived: '#6b7280' };
  const col = statusColor[lead.status] || '#9ca3af';

  const leftSidebar = `
    <!-- Details -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:14px">Details</div>
      ${[
      ['Value', fmt$(getLeadDisplayValue(lead))],
      ['Status', `<span class="bdg" style="background:${col}22;color:${col};border:1px solid ${col}44">${lead.status}</span>`],
      ['Source', lead.source || '—'],
      ['Owner', lead.owner
        ? lead.owner
        : `<span class="bdg" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">Unassigned</span>${canEditLead(lead) ? ` <button onclick="claimLead('${lead.id}')" class="btn-r" style="font-size:10px;padding:2px 8px;margin-left:6px">Claim</button>` : ''}`],
      ['Branch', lead.branch || '—'],
      ['Address', [lead.street, lead.suburb, lead.state, lead.postcode].filter(Boolean).join(', ') || '—'],
      ['Created', lead.created || '—'],
    ].map(([l, v]) => `<div style="padding:7px 0;border-bottom:1px solid #f9fafb;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#9ca3af">${l}</span>
        <span style="font-size:12px;font-weight:500;color:#374151">${v}</span>
      </div>`).join('')}
    </div>

    <!-- Person -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:12px">Person</div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
        <div style="width:36px;height:36px;background:#c41230;border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(lead.fn + ' ' + lead.ln)}</div>
        <div>
          <div style="font-size:14px;font-weight:600">${lead.fn} ${lead.ln}</div>
          ${contact ? `<div style="font-size:11px;color:#16a34a">✓ In contacts</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${lead.email ? `<a href="mailto:${lead.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:7px">${Icon({ n: 'mail2', size: 13 })} ${lead.email}</a>` : ''}
        ${lead.phone ? `<a href="javascript:void(0)" onclick="twilioCall('${lead.phone}','${lead.id}','lead')" style="font-size:12px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:7px;cursor:pointer">${Icon({ n: 'phone2', size: 13 })} ${lead.phone}</a>` : ''}
      ${lead.email ? `<a href="mailto:${lead.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:8px">${Icon({ n: 'mail2', size: 13 })} ${lead.email}</a>` : ''}
      <button onclick="detailTab='email';renderPage()" class="btn-r" style="font-size:12px;padding:5px 10px;margin-top:6px;width:100%;justify-content:center;gap:5px">${Icon({ n: 'send', size: 12 })} Send Email</button>
        ${lead.suburb ? `<div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:7px">${Icon({ n: 'pin', size: 13 })} ${[lead.street, lead.suburb, lead.state, lead.postcode].filter(Boolean).join(', ')}</div>` : ''}
      </div>
    </div>

    <!-- Nearby Leads (for efficient scheduling) -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">\ud83d\udccd Nearby Leads</span>
        <button onclick="mapSchedulingLead='${lead.id}';setState({page:'leads'})" class="btn-g" style="font-size:10px;padding:3px 7px">Map view</button>
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">Book these on the same day to reduce driving</div>
      ${renderNearbyLeadsList(lead, 5)}
    </div>

    <!-- Spartan CAD Design — multi-quote (spec §3.2) -->
    ${renderLeadQuoteList(lead)}

    <!-- Status change -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Change Status</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${['New', 'Contacted', 'Qualified', 'Unqualified', 'Archived'].map(s => `<button onclick="setLeadStatus('${lead.id}','${s}')" style="text-align:left;padding:8px 12px;border-radius:8px;border:1px solid ${lead.status === s ? statusColor[s] || '#e5e7eb' : '#e5e7eb'};background:${lead.status === s ? statusColor[s] + '18' : '#fff'};font-size:13px;font-weight:${lead.status === s ? 600 : 400};color:${lead.status === s ? statusColor[s] || '#374151' : '#374151'};cursor:pointer;font-family:inherit">${lead.status === s ? '✓ ' : ''} ${s}</button>`).join('')}
      </div>
    </div>

    <!-- Notes -->
    ${lead.notes ? `<div style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Original Notes</div>
      <p style="font-size:13px;color:#374151;margin:0;line-height:1.6;white-space:pre-wrap">${lead.notes}</p>
    </div>`: ''}

    ${lead.converted && lead.dealRef ? `<div style="padding:14px 16px;margin:0 16px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px">
      <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:6px">✓ Converted to Deal</div>
      <button onclick="setState({page:'deals',dealDetailId:'${lead.dealRef}',leadDetailId:null})" class="btn-w" style="font-size:12px;width:100%;justify-content:center">View Deal →</button>
    </div>`: ''}
  `;

  return renderEntityDetail({
    entityType: 'lead', entityId: lead.id,
    title: lead.fn + ' ' + lead.ln, owner: lead.owner,
    stageBarHtml: null,
    wonLostHtml: (canEditLead(lead) ? `<button onclick="openLeadEditDrawer('${lead.id}')" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({ n: 'edit', size: 12 })} Edit</button>` : '') + (!lead.converted ? `<button onclick="openConvertLeadModal('${lead.id}')" class="btn-r" style="font-size:12px;padding:6px 14px">Convert to Deal →</button>` : Badge('Converted', 'teal')),
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({leadDetailId:null})",
    backLabel: "Leads",
    activities,
    contact: contact || { fn: lead.fn, ln: lead.ln, email: lead.email, phone: lead.phone, suburb: lead.suburb },
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTACT DETAIL PAGE
// ══════════════════════════════════════════════════════════════════════════════
function renderContactDetail() {
  const { contacts, deals, leads, contactDetailId } = getState();
  const c = contacts.find(x => x.id === contactDetailId);
  if (!c) { setState({ contactDetailId: null }); return renderContacts(); }
  const activities = getEntityActivities(c.id, 'contact');
  const cDeals = deals.filter(d => d.cid === c.id);
  const cLeads = leads.filter(l => l.email === c.email && c.email);

  const leftSidebar = `
    <!-- Summary -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <div style="width:50px;height:50px;background:#c41230;border-radius:50%;color:#fff;font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn + ' ' + c.ln)}</div>
        <div>
          <div style="font-size:16px;font-weight:700;font-family:Syne,sans-serif">${c.fn} ${c.ln}</div>
          ${c.co ? `<div style="font-size:13px;color:#6b7280">${c.co}</div>` : ''}
          <div style="margin-top:4px">${Badge(c.type, c.type === 'commercial' ? 'purple' : 'blue')}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <a href="mailto:${c.email}" style="font-size:13px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:8px">${Icon({ n: 'mail2', size: 14 })} <span>${c.email || '—'}</span></a>
        ${c.phone ? `<a href="javascript:void(0)" onclick="twilioCall('${c.phone}','${c.id}','contact')" style="font-size:13px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:8px;cursor:pointer">${Icon({ n: 'phone2', size: 14 })} <span>${c.phone}</span></a>` : `<div style="font-size:13px;color:#9ca3af;display:flex;align-items:center;gap:8px">${Icon({ n: 'phone2', size: 14 })} <span>—</span></div>`}
        <div style="font-size:13px;color:#6b7280;display:flex;align-items:center;gap:8px">${Icon({ n: 'pin', size: 14 })} ${[c.street, c.suburb, c.state, c.postcode].filter(Boolean).join(', ') || 'No address'}</div>
      </div>
    </div>

    <!-- Organisation -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Organisation</div>
      ${c.co ? `
      <button onclick="detailTab='email';renderPage()" class="btn-r" style="font-size:12px;padding:6px 12px;margin-top:8px;width:100%;justify-content:center;gap:5px">${Icon({ n: 'send', size: 12 })} Send Email</button><div style="font-size:13px;font-weight:500;color:#374151">${c.co}</div>` : `<div style="font-size:12px;color:#3b82f6;cursor:pointer">+ Link an organisation</div>`}
    </div>

    <!-- Details -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Details</div>
      ${[
      ['First name', c.fn],
      ['Last name', c.ln],
      ['Company', c.co || '—'],
      ['Street', c.street || '—'],
      ['Suburb', c.suburb || '—'],
      ['State', c.state || '—'],
      ['Postcode', c.postcode || '—'],
      ['Source', c.source || '—'],
      ['Owner/Rep', c.rep || '—'],
      ['Branch', c.branch || '—'],
      ['Tags', (c.tags || []).join(', ') || '—'],
    ].map(([l, v]) => `<div style="padding:6px 0;border-bottom:1px solid #f9fafb;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:12px;color:#9ca3af">${l}</span>
        <span style="font-size:12px;font-weight:500;color:#374151">${v}</span>
      </div>`).join('')}
    </div>

    <!-- Deals linked -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Deals (${cDeals.length})</span>
        <button onclick="setState({page:'deals',contactDetailId:null})" class="btn-g" style="font-size:11px;padding:3px 8px">+ New deal</button>
      </div>
      ${cDeals.length === 0 ? `<div style="font-size:12px;color:#9ca3af">No deals yet</div>` : ''}
      ${cDeals.map(d => `<div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="setState({dealDetailId:'${d.id}',contactDetailId:null})">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
          <div style="font-size:13px;font-weight:600;color:#1a1a1a;flex:1;min-width:0">${d.title}</div>
          ${_dealTypeBadge(d)}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:3px">
          <span style="font-size:12px;color:#9ca3af">${d.suburb || d.branch}</span>
          <span style="font-size:13px;font-weight:700">${fmt$(d.val)}</span>
        </div>
      </div>`).join('')}
    </div>

    <!-- Leads linked -->
    ${cLeads.length > 0 ? `<div style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:10px">Leads (${cLeads.length})</div>
      ${cLeads.map(l => `<div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:6px;cursor:pointer" onclick="setState({leadDetailId:'${l.id}',contactDetailId:null})">
        <div style="font-size:13px;font-weight:600">${l.fn} ${l.ln}</div>
        <div style="font-size:12px;color:#9ca3af">${l.source} · ${fmt$(l.val)}</div>
      </div>`).join('')}
    </div>`: ''}
  `;

  return renderEntityDetail({
    entityType: 'contact', entityId: c.id,
    title: c.fn + ' ' + c.ln, owner: c.rep,
    stageBarHtml: null,
    wonLostHtml: (canEditContact(c) ? `<button onclick="openContactEditDrawer('${c.id}')" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({ n: 'edit', size: 12 })} Edit</button>` : '') + `<button onclick="setState({page:'deals',contactDetailId:null})" class="btn-r" style="font-size:12px;padding:6px 14px">+ Deal</button>`,
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({contactDetailId:null})",
    backLabel: "Contacts",
    activities,
    contact: c,
  });
}


function renderNewDealModal() {
  const { contacts } = getState();
  return `<div class="modal-bg" onclick="if(event.target===this)setState({modal:null})">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">New Deal</h3>
        <button onclick="setState({modal:null})" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div style="padding:24px;display:flex;flex-direction:column;gap:14px">
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Deal Title *</label>
          <input class="inp" id="nd_title" placeholder="e.g. Double glazing - Full home"></div>
        <div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:6px">Deal Type *</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label class="nd-dealtype-card" data-value="residential" onclick="_ndDealTypeSelect('residential')" style="cursor:pointer;border:2px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff;transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px">
              <span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1a1a1a">
                <input type="radio" name="nd_dealType" value="residential" style="margin:0">
                Residential
              </span>
              <span style="font-size:11px;color:#6b7280;line-height:1.35">Single home, owner-occupied</span>
            </label>
            <label class="nd-dealtype-card" data-value="commercial" onclick="_ndDealTypeSelect('commercial')" style="cursor:pointer;border:2px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff;transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px">
              <span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1a1a1a">
                <input type="radio" name="nd_dealType" value="commercial" style="margin:0">
                Commercial
              </span>
              <span style="font-size:11px;color:#6b7280;line-height:1.35">Builder, body corp, rental, retail</span>
            </label>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin-top:6px">Affects commission rules, reports, and routing. You can change it later from Deal Detail.</div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Contact *</label>
          <select class="sel" id="nd_cid"><option value="">Select contact…</option>${contacts.map(c => `<option value="${c.id}">${c.fn} ${c.ln}</option>`).join('')}</select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Value ($)</label>
            <input class="inp" id="nd_val" type="number" min="0" step="any" placeholder="15000">
            <div id="nd_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Branch</label>
            <select class="sel" id="nd_branch">${['VIC', 'ACT', 'SA'].map(b => `<option>${b}</option>`).join('')}</select></div>
        </div>
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Street Address</label>
          <input class="inp" id="nd_street" placeholder="Start typing address…" autocomplete="off"></div>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Suburb</label>
            <input class="inp" id="nd_suburb" placeholder="Richmond"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">State</label>
            <select class="sel" id="nd_state">${['VIC', 'NSW', 'QLD', 'SA', 'WA', 'ACT', 'TAS', 'NT'].map(s => `<option>${s}</option>`).join('')}</select></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Postcode</label>
            <input class="inp" id="nd_postcode" placeholder="3121"></div>
        </div>
      </div>
      <div style="padding:16px 24px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="setState({modal:null})">Cancel</button>
        <button class="btn-r" onclick="saveNewDeal()">Create Deal</button>
      </div>
    </div>
  </div>`;
}

// Brief 5: deal-type radio-card UI helper. Highlights the chosen card and
// checks the underlying radio without re-rendering the whole modal (which
// would blow away other field values the user has typed).
function _ndDealTypeSelect(value) {
  document.querySelectorAll('.nd-dealtype-card').forEach(function (card) {
    var on = card.getAttribute('data-value') === value;
    card.style.borderColor = on ? '#c41230' : '#e5e7eb';
    card.style.background  = on ? '#fff5f6' : '#fff';
    var radio = card.querySelector('input[type="radio"]');
    if (radio) radio.checked = on;
  });
}

function saveNewDeal() {
  const title = document.getElementById('nd_title').value.trim();
  const cid = document.getElementById('nd_cid').value;
  if (!title || !cid) { addToast('Title and contact are required', 'error'); return; }
  // Brief 5: deal type must be explicitly chosen at creation — no silent default.
  // Read from the checked radio inside the card group; null if nothing picked.
  const dealTypeEl = document.querySelector('input[name="nd_dealType"]:checked');
  const dealType = dealTypeEl ? dealTypeEl.value : null;
  if (dealType !== 'residential' && dealType !== 'commercial') {
    addToast('Confirm whether this is a Residential or Commercial deal', 'error');
    return;
  }
  const valEl = document.getElementById('nd_val');
  const valErr = document.getElementById('nd_val_err');
  const valV = validateDealValue(valEl.value);
  if (valErr) { valErr.style.display = valV.ok ? 'none' : 'block'; valErr.textContent = valV.error; }
  if (!valV.ok) { addToast(valV.error, 'error'); return; }
  const pl = PIPELINES.find(p => p.id === dPipeline);
  const creationActivityText = 'Deal created (' + (dealType === 'commercial' ? 'Commercial' : 'Residential') + ').';
  const nd = { id: 'd' + Date.now(), title, cid, pid: dPipeline, sid: pl.stages[0].id, val: valV.normalized, rep: (getCurrentUser() || { name: 'Admin' }).name, branch: document.getElementById('nd_branch').value, street: document.getElementById('nd_street')?.value.trim() || '', suburb: document.getElementById('nd_suburb')?.value.trim() || '', state: document.getElementById('nd_state')?.value || 'VIC', postcode: document.getElementById('nd_postcode')?.value.trim() || '', age: 0, won: false, lost: false, wonDate: null, created: new Date().toISOString().slice(0, 10), dealType: dealType, tags: [], quotes: [], activeQuoteId: null, wonQuoteId: null, activities: [{ id: 'a' + Date.now(), type: 'created', text: creationActivityText, date: new Date().toISOString().slice(0, 10), by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: '' }] };
  setState({ deals: [nd, ...getState().deals], modal: null, page: 'deals', dealDetailId: null });
  dbInsert('deals', dealToDb(nd));
  if (nd.activities && nd.activities[0]) dbInsert('activities', actToDb(nd.activities[0], 'deal', nd.id));
  addToast(`"${title}" created`, 'success');
}

// ── Installer profiles ────────────────────────────────────────────────────────
const INSTALLER_PROFILES = [];

// ── Scheduled entries ─────────────────────────────────────────────────────────
let SCHED_ENTRIES = [
  { id: 'se1', jid: 'j1', instId: 'i1', date: '2024-11-05', startTime: '07:00', durationH: 8 },
  { id: 'se2', jid: 'j1', instId: 'i2', date: '2024-11-05', startTime: '07:00', durationH: 8 },
  { id: 'se3', jid: 'j2', instId: 'i1', date: '2024-11-20', startTime: '07:30', durationH: 10 },
  { id: 'se4', jid: 'j2', instId: 'i3', date: '2024-11-20', startTime: '07:30', durationH: 10 },
  { id: 'se5', jid: 'j2', instId: 'i4', date: '2024-11-21', startTime: '07:30', durationH: 10 },
  { id: 'se6', jid: 'j4', instId: 'i1', date: '2024-11-25', startTime: '07:30', durationH: 12 },
  { id: 'se7', jid: 'j4', instId: 'i3', date: '2024-11-25', startTime: '07:30', durationH: 12 },
  { id: 'se8', jid: 'j4', instId: 'i4', date: '2024-11-26', startTime: '07:30', durationH: 12 },
  { id: 'se9', jid: 'j3', instId: 'i2', date: '2024-11-19', startTime: '08:00', durationH: 6 },
  { id: 'se10', jid: 'j8', instId: 'i1', date: '2024-11-14', startTime: '07:00', durationH: 8 },
  { id: 'se11', jid: 'j8', instId: 'i2', date: '2024-11-14', startTime: '07:00', durationH: 8 },
];

// ── Scheduler module state ────────────────────────────────────────────────────
let schView = 'week';        // 'week' | 'day'
let schOffset = 0;           // week offset from base date
let schDayOffset = 0;        // day offset for day view
let schInstFilter = 'all';   // installer id or 'all'
let schDragEntryId = null;   // entry being dragged (day view)
let schModalOpen = false;
let schModalData = { jid: '', date: '', startTime: '08:00', durationH: 4, staffRequired: 2, assignedIds: [] };

const SCH_BASE_DATE = '2024-11-18'; // Monday reference

// ── Helpers ───────────────────────────────────────────────────────────────────
function schGetWeekDays(offsetWeeks) {
  const base = new Date(SCH_BASE_DATE);
  base.setDate(base.getDate() + offsetWeeks * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function schFmtDate(d) { return d.toISOString().slice(0, 10); }
function schFmtShort(d) { return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); }
function schFmtWeekday(d) { return d.toLocaleDateString('en-AU', { weekday: 'short' }); }

function schTimeToH(t) {
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
}
function schHToTime(h) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function schGetConflicts(instId, date, startTime, durationH, excludeId) {
  const s1 = schTimeToH(startTime);
  const e1 = s1 + durationH;
  return SCHED_ENTRIES.filter(en => {
    if (en.instId !== instId || en.date !== date) return false;
    if (excludeId && en.id === excludeId) return false;
    const s2 = schTimeToH(en.startTime);
    const e2 = s2 + en.durationH;
    return s1 < e2 && e1 > s2;
  });
}

function schGetJobColor(j) {
  if (!j) return '#9ca3af';
  const st = getState().jobStatuses.find(s => s.label === j.status);
  return st ? st.col : '#9ca3af';
}

// ── WEEK VIEW ─────────────────────────────────────────────────────────────────
function renderSchWeek() {
  const { contacts } = getState();
  const jobs = [];
  const days = schGetWeekDays(schOffset);
  const activeInstallers = INSTALLER_PROFILES.filter(i => i.active && (schInstFilter === 'all' || i.id === schInstFilter));

  const unscheduledJobs = getState().deals.filter(d => {
    if (d.won) return false;
    const hasEntry = SCHED_ENTRIES.find(e => e.jid === d.id);
    return !hasEntry;
  }).slice(0, 8);

  return `
    <!-- Controls row -->
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <h1 style="font-size:24px;font-weight:800;margin:0">Scheduler</h1>
        <div style="display:flex;background:#f3f4f6;border-radius:8px;padding:3px;gap:2px">
          ${['week', 'day'].map(v => `<button onclick="schView='${v}';renderPage()" style="padding:5px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;${schView === v ? 'background:#fff;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,.1)' : 'background:transparent;color:#6b7280'}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn-w" style="padding:7px" onclick="schOffset--;renderPage()">${Icon({ n: 'left', size: 14 })}</button>
        <span style="font-size:13px;font-weight:600;min-width:160px;text-align:center">${schFmtShort(days[0])} — ${schFmtShort(days[4])}</span>
        <button class="btn-w" style="padding:7px" onclick="schOffset++;renderPage()">${Icon({ n: 'right', size: 14 })}</button>
        <button class="btn-g" style="font-size:12px" onclick="schOffset=0;renderPage()">Today</button>
        <select class="sel" style="font-size:12px;width:auto;padding:6px 10px" onchange="schInstFilter=this.value;renderPage()">
          <option value="all" ${schInstFilter === 'all' ? 'selected' : ''}>All Installers</option>
          ${INSTALLER_PROFILES.filter(i => i.active).map(i => `<option value="${i.id}" ${schInstFilter === i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
        </select>
        <button class="btn-r" style="font-size:12px" onclick="schOpenModal()">${Icon({ n: 'plus', size: 14 })} Schedule Appointment</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:200px 1fr;gap:16px;align-items:start">

      <!-- Unscheduled sidebar -->
      <div class="card" style="overflow:hidden">
        <div style="padding:12px 14px;border-bottom:1px solid #f0f0f0">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280">Unscheduled (${unscheduledJobs.length})</div>
        </div>
        <div style="padding:8px;max-height:500px;overflow-y:auto">
          ${unscheduledJobs.length === 0 ? '<p style="font-size:12px;color:#9ca3af;text-align:center;padding:16px">All appointments scheduled ✓</p>' : ''}
          ${unscheduledJobs.map(j => {
    const c = contacts.find(x => x.id === j.cid);
    return `<div style="padding:10px;border-radius:10px;border:1.5px dashed #e5e7eb;background:#f9fafb;margin-bottom:6px;cursor:pointer" onclick="schOpenModal('${j.id}')" onmouseover="this.style.borderColor='#c41230';this.style.background='#fff5f6'" onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#f9fafb'">
              <div style="font-family:monospace;font-size:11px;font-weight:700;color:#c41230">${j.id.toUpperCase().slice(-6)}</div>
              <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-top:2px">${j.title?.split(' ').slice(0, 4).join(' ') || j.id}</div>
              <div style="font-size:11px;color:#6b7280">${j.suburb || j.branch || ''}</div>
            </div>`;
  }).join('')}
        </div>
      </div>

      <!-- Resource grid -->
      <div style="overflow-x:auto">
        <div class="card" style="overflow:hidden;min-width:500px">
          <!-- Header -->
          <div style="display:grid;grid-template-columns:110px repeat(5,1fr);background:#f9fafb;border-bottom:1px solid #e5e7eb">
            <div style="padding:10px 8px;border-right:1px solid #e5e7eb"></div>
            ${days.map(d => `<div style="padding:10px 6px;text-align:center;border-right:1px solid #e5e7eb">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af">${schFmtWeekday(d)}</div>
              <div style="font-size:13px;font-weight:700;margin-top:1px">${schFmtShort(d)}</div>
            </div>`).join('')}
          </div>
          <!-- Installer rows -->
          ${activeInstallers.map(inst => `
            <div style="display:grid;grid-template-columns:110px repeat(5,1fr);border-bottom:1px solid #f0f0f0">
              <div style="padding:10px 6px;border-right:1px solid #e5e7eb;background:#f9fafb;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px">
                <div style="width:30px;height:30px;border-radius:50%;background:${inst.col};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${inst.initials}</div>
                <div style="font-size:10px;color:#6b7280;text-align:center;line-height:1.3">${inst.name.split(' ')[0]}</div>
              </div>
              ${days.map(day => {
    const ds = schFmtDate(day);
    const dayEntries = SCHED_ENTRIES.filter(e => e.instId === inst.id && e.date === ds);
    return `<div style="min-height:70px;border-right:1px solid #e5e7eb;padding:3px;position:relative" ondragover="event.preventDefault()" ondrop="schDropWeek('${inst.id}','${ds}')">
                  ${dayEntries.map(en => {
      const j = null; const c = null;
      const col = schGetJobColor(j);
      return `<div style="background:${col};color:#fff;border-radius:6px;padding:5px 7px;margin-bottom:3px;cursor:pointer;font-size:10px;position:relative" onclick="addToast('Deal: '+getState().deals.find(d=>d.id===\'${en.jid}\')?.title||'${en.jid}','info')" draggable="true" ondragstart="schDragEntryId='${en.id}'" ondragend="schDragEntryId=null">
                      <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${en.id.slice(-4)}</div>
                      <div style="opacity:.75">${en.startTime} · ${en.durationH}h</div>
                    </div>`;
    }).join('')}
                  ${dayEntries.length === 0 ? `<div style="height:100%;min-height:60px;display:flex;align-items:center;justify-content:center;cursor:pointer" onclick="schOpenModal(null,'${ds}')" onmouseover="this.style.background='rgba(196,18,48,.04)'" onmouseout="this.style.background=''">
                    <span style="font-size:18px;color:#e5e7eb">+</span>
                  </div>`: ''}
                </div>`;
  }).join('')}
            </div>`).join('')}
        </div>
      </div>
    </div>
    ${schModalOpen ? renderSchModal() : ''}
  `;
}

// ── DAY VIEW ──────────────────────────────────────────────────────────────────
function renderSchDay() {
  const { contacts } = getState();
  const jobs = [];
  const base = new Date(SCH_BASE_DATE);
  base.setDate(base.getDate() + schDayOffset);
  const dateStr = schFmtDate(base);
  const dateLabel = base.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const activeInstallers = INSTALLER_PROFILES.filter(i => i.active && (schInstFilter === 'all' || i.id === schInstFilter));

  const HOURS = Array.from({ length: 27 }, (_, i) => 6 + i * 0.5); // 6:00 to 19:30 in 30min slots
  const TOTAL_H = 13; // 6am to 7pm
  const PX_PER_H = 64;
  const GRID_H = TOTAL_H * PX_PER_H;

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <h1 style="font-size:24px;font-weight:800;margin:0">Scheduler</h1>
        <div style="display:flex;background:#f3f4f6;border-radius:8px;padding:3px;gap:2px">
          ${['week', 'day'].map(v => `<button onclick="schView='${v}';renderPage()" style="padding:5px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;${schView === v ? 'background:#fff;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,.1)' : 'background:transparent;color:#6b7280'}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn-w" style="padding:7px" onclick="schDayOffset--;renderPage()">${Icon({ n: 'left', size: 14 })}</button>
        <span style="font-size:13px;font-weight:600;min-width:200px;text-align:center">${dateLabel}</span>
        <button class="btn-w" style="padding:7px" onclick="schDayOffset++;renderPage()">${Icon({ n: 'right', size: 14 })}</button>
        <button class="btn-g" style="font-size:12px" onclick="schDayOffset=0;renderPage()">Today</button>
        <select class="sel" style="font-size:12px;width:auto;padding:6px 10px" onchange="schInstFilter=this.value;renderPage()">
          <option value="all" ${schInstFilter === 'all' ? 'selected' : ''}>All Installers</option>
          ${INSTALLER_PROFILES.filter(i => i.active).map(i => `<option value="${i.id}" ${schInstFilter === i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
        </select>
        <button class="btn-r" style="font-size:12px" onclick="schOpenModal(null,'${dateStr}')">${Icon({ n: 'plus', size: 14 })} Schedule</button>
      </div>
    </div>

    <div class="card" style="overflow:hidden">
      <div style="display:grid;grid-template-columns:60px ${activeInstallers.map(() => '1fr').join(' ')}">
        <!-- Header -->
        <div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:10px 6px"></div>
        ${activeInstallers.map(inst => `<div style="background:#f9fafb;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;padding:10px 6px;text-align:center">
          <div style="width:28px;height:28px;border-radius:50%;background:${inst.col};color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 4px">${inst.initials}</div>
          <div style="font-size:11px;font-weight:600;color:#374151">${inst.name.split(' ')[0]}</div>
        </div>`).join('')}

        <!-- Time grid body -->
        <div style="position:relative;border-right:1px solid #e5e7eb">
          ${HOURS.map(h => `<div style="height:${PX_PER_H / 2}px;border-bottom:1px solid #f0f0f0;padding:2px 4px;display:flex;align-items:flex-start">
            ${Number.isInteger(h) ? `<span style="font-size:10px;color:#9ca3af;font-weight:600">${String(h).padStart(2, '0')}:00</span>` : ''}
          </div>`).join('')}
        </div>

        ${activeInstallers.map(inst => {
    const dayEntries = SCHED_ENTRIES.filter(e => e.instId === inst.id && e.date === dateStr);
    return `<div style="position:relative;border-right:1px solid #e5e7eb;height:${GRID_H}px;background:#fafafa">
            ${HOURS.map(h => `<div style="position:absolute;top:${(h - 6) * PX_PER_H}px;left:0;right:0;height:${PX_PER_H / 2}px;border-bottom:1px solid ${Number.isInteger(h) ? '#e5e7eb' : '#f3f4f6'}" ondragover="event.preventDefault()" ondrop="schDropDay('${inst.id}','${dateStr}',${h})"></div>`).join('')}
            ${dayEntries.map(en => {
      const col = '#c41230';
      const top = (schTimeToH(en.startTime) - 6) * PX_PER_H;
      const height = Math.max(en.durationH * PX_PER_H - 4, 20);
      return `<div draggable="true"
                ondragstart="schDragEntryId='${en.id}'"
                ondragend="schDragEntryId=null"
                onclick="addToast('Deal: '+getState().deals.find(d=>d.id===\'${en.jid}\')?.title||'${en.jid}','info')"
                style="position:absolute;top:${top}px;left:4px;right:4px;height:${height}px;background:${col};color:#fff;border-radius:8px;padding:6px 8px;cursor:pointer;overflow:hidden;font-size:11px;box-shadow:0 2px 8px rgba(0,0,0,.15)">
                <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${en.id.slice(-4)}</div>

                <div style="opacity:.85">${en.startTime} – ${schHToTime(schTimeToH(en.startTime) + en.durationH)}</div>
              </div>`;
    }).join('')}
          </div>`;
  }).join('')}
      </div>
    </div>
    ${schModalOpen ? renderSchModal() : ''}
  `;
}

// ── MAIN SCHEDULER RENDER ─────────────────────────────────────────────────────
function renderScheduler() {
  return schView === 'day' ? renderSchDay() : renderSchWeek();
}

// ── DRAG HANDLERS ─────────────────────────────────────────────────────────────
function schDropWeek(instId, dateStr) {
  if (!schDragEntryId) return;
  SCHED_ENTRIES = SCHED_ENTRIES.map(e => e.id === schDragEntryId ? { ...e, instId, date: dateStr } : e);
  schDragEntryId = null;
  addToast('Job rescheduled', 'success');
  renderPage();
}

function schDropDay(instId, dateStr, hour) {
  if (!schDragEntryId) return;
  const newStart = schHToTime(Math.floor(hour * 2) / 2); // snap to 30min
  SCHED_ENTRIES = SCHED_ENTRIES.map(e => e.id === schDragEntryId ? { ...e, instId, date: dateStr, startTime: newStart } : e);
  schDragEntryId = null;
  addToast('Job rescheduled to ' + newStart, 'success');
  renderPage();
}

// ── SCHEDULE JOB MODAL ────────────────────────────────────────────────────────
function schOpenModal(jid, date) {
  schModalOpen = true;
  schModalData = {
    jid: jid || '',
    date: date || SCH_BASE_DATE,
    startTime: '08:00',
    durationH: 4,
    staffRequired: 2,
    assignedIds: [],
  };
  renderPage();
}

function renderSchModal() {
  const { contacts } = getState();
  const jobs = [];
  const d = schModalData;
  const availableJobs = getState().deals.filter(d => !d.won && !d.lost).map(d => ({ ...d, jn: d.title, addr: d.suburb || d.branch || '' }))

  // Availability check
  const availability = INSTALLER_PROFILES.filter(i => i.active).map(inst => {
    const conflicts = d.date && d.startTime && d.durationH
      ? schGetConflicts(inst.id, d.date, d.startTime, parseFloat(d.durationH) || 4)
      : [];
    return { inst, conflicts };
  });

  const assignedCount = d.assignedIds.length;
  const staffWarn = assignedCount > 0 && assignedCount < (parseInt(d.staffRequired) || 2);

  return `<div class="modal-bg" onclick="if(event.target===this){schModalOpen=false;renderPage()}">
    <div class="modal" style="max-width:480px">
      <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">Schedule Job</h3>
        <button onclick="schModalOpen=false;renderPage()" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:13px">

        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Job</label>
          <select class="sel" style="font-size:13px" onchange="schModalData.jid=this.value;renderPage()">
            <option value="">Select job…</option>
            ${availableJobs.map(j => {
    const c = contacts.find(x => x.id === j.cid);
    return `<option value="${j.id}" ${d.jid === j.id ? 'selected' : ''}>${j.title || j.id} — ${j.suburb || j.branch || ''}</option>`;
  }).join('')}
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Date</label>
            <input class="inp" type="date" value="${d.date}" style="font-size:13px" oninput="schModalData.date=this.value;renderPage()"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Start Time</label>
            <input class="inp" type="time" value="${d.startTime}" style="font-size:13px" oninput="schModalData.startTime=this.value;renderPage()"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Duration (hours)</label>
            <input class="inp" type="number" value="${d.durationH}" min="1" max="16" step="0.5" style="font-size:13px" oninput="schModalData.durationH=parseFloat(this.value)||4;renderPage()"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Staff required</label>
            <input class="inp" type="number" value="${d.staffRequired}" min="1" max="8" style="font-size:13px" oninput="schModalData.staffRequired=parseInt(this.value)||2;renderPage()"></div>
        </div>

        <!-- Assign installers with availability check -->
        <div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:8px">Assign Installers</label>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${availability.map(({ inst, conflicts }) => {
    const checked = d.assignedIds.includes(inst.id);
    const hasConflict = conflicts.length > 0;
    const conflictJob = null;
    return `<label style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:#f9fafb;border-radius:8px;cursor:pointer;border:1px solid ${checked ? inst.col + '44' : '#f0f0f0'}">
                <div style="display:flex;align-items:center;gap:10px">
                  <input type="checkbox" ${checked ? 'checked' : ''} onchange="schToggleInstaller('${inst.id}')" style="accent-color:${inst.col};width:15px;height:15px">
                  <div style="width:24px;height:24px;border-radius:50%;background:${inst.col};color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">${inst.initials}</div>
                  <span style="font-size:13px;font-weight:500">${inst.name}</span>
                </div>
                ${d.date && d.startTime ? `<span style="font-size:11px;font-weight:600;${hasConflict ? 'color:#d97706' : 'color:#16a34a'}">${hasConflict ? '⚠️ ' + conflictJob?.jn : '✅ Available'}</span>` : ''}
              </label>`;
  }).join('')}
          </div>
          ${staffWarn ? `<div style="margin-top:8px;padding:8px 12px;background:#fef3c7;border-radius:8px;font-size:12px;color:#92400e">⚠️ ${assignedCount} assigned but ${d.staffRequired} staff required</div>` : ''}
        </div>
      </div>

      <div style="padding:14px 20px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-w" onclick="schModalOpen=false;renderPage()">Cancel</button>
        <button class="btn-r" onclick="schSaveModal()">Schedule</button>
      </div>
    </div>
  </div>`;
}

function schToggleInstaller(instId) {
  const ids = schModalData.assignedIds;
  schModalData.assignedIds = ids.includes(instId) ? ids.filter(x => x !== instId) : [...ids, instId];
  renderPage();
}

function schSaveModal() {
  const d = schModalData;
  if (!d.jid || !d.date || !d.startTime) { addToast('Job, date, and time are required', 'error'); return; }
  if (d.assignedIds.length === 0) { addToast('Assign at least one installer', 'error'); return; }
  d.assignedIds.forEach(instId => {
    SCHED_ENTRIES = [...SCHED_ENTRIES, {
      id: 'se' + Date.now() + instId,
      jid: d.jid,
      instId,
      date: d.date,
      startTime: d.startTime,
      durationH: parseFloat(d.durationH) || 4,
    }];
  });
  schModalOpen = false;
  addToast('Job scheduled for ' + d.assignedIds.length + ' installer(s)', 'success');
  renderPage();
}

