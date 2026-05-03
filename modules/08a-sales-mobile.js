// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08a-sales-mobile.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Mobile today screen, deals kanban, detail modals.
// ═════════════════════════════════════════════════════════════════════════════


// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────

defineAction('mobile-stat-mini-click', function(target, ev) {
  var page = target.dataset.page;
  if (page) setState({page: page});
});

defineAction('mobile-appt-open-deal', function(target, ev) {
  var dealId = target.dataset.dealId;
  if (dealId) setState({dealDetailId: dealId});
});

defineAction('mobile-appt-sync-calendar', function(target, ev) {
  var args = {
    title: target.dataset.title || '',
    location: target.dataset.location || '',
    notes: target.dataset.notes || '',
    startIso: target.dataset.startIso || '',
    durationMinutes: parseInt(target.dataset.durationMinutes) || 60
  };
  if (typeof addToDeviceCalendar === 'function') addToDeviceCalendar(args);
});

defineAction('mobile-work-queue-open', function(target, ev) {
  var entityId = target.dataset.entityId;
  var entityType = target.dataset.entityType;
  var page = entityType === 'deal' ? 'deals' : 'leads';
  var key = entityType === 'deal' ? 'dealDetailId' : 'leadDetailId';
  var st = {};
  st[key] = entityId;
  st['page'] = page;
  setState(st);
});

defineAction('mobile-more-menu-item', function(target, ev) {
  var page = target.dataset.page;
  if (page) setState({page: page, dealDetailId: null, leadDetailId: null, contactDetailId: null, jobDetailId: null});
});

defineAction('mobile-logout', function(target, ev) {
  if (typeof logout === 'function') logout();
});

defineAction('mobile-contact-open', function(target, ev) {
  var contactId = target.dataset.contactId;
  if (contactId) setState({contactDetailId: contactId, page: 'contacts'});
});

defineAction('mobile-contact-add', function(target, ev) {
  if (typeof openNewContactModal === 'function') openNewContactModal();
});

defineAction('mobile-contact-filter-type', function(target, ev) {
  var type = target.dataset.type;
  cType = type;
  renderPage();
});

defineAction('mobile-contact-search-input', function(target, ev) {
  cSearch = target.value;
  renderPage();
});

defineAction('mobile-deal-open', function(target, ev) {
  var dealId = target.dataset.dealId;
  if (dealId) setState({dealDetailId: dealId});
});

defineAction('mobile-filter-toggle', function(target, ev) {
  kFilterOpen = !kFilterOpen;
  renderPage();
});

defineAction('mobile-pipeline-select', function(target, ev) {
  var pipelineId = target.dataset.pipelineId;
  if (pipelineId) {
    dPipeline = pipelineId;
    _mobileDealStageId = null;
    renderPage();
  }
});

defineAction('mobile-filter-chip', function(target, ev) {
  var filterOwners = target.dataset.filterOwners;
  var filterValMin = target.dataset.filterValMin;
  var filterValMax = target.dataset.filterValMax;
  if (filterOwners !== undefined) {
    kFilterOwners = filterOwners === '' ? [] : filterOwners.split(',');
    renderPage();
  }
  if (filterValMin !== undefined || filterValMax !== undefined) {
    kFilterValMin = filterValMin || '';
    kFilterValMax = filterValMax || '';
    renderPage();
  }
});

defineAction('mobile-deal-stage-tab', function(target, ev) {
  var stageId = target.dataset.stageId;
  if (stageId) _jumpToDealStage(stageId);
});

defineAction('mobile-deal-kanban-scroll', function(target, ev) {
  if (typeof _onDealsKanbanScroll === 'function') _onDealsKanbanScroll(ev);
});

defineAction('mobile-email-modal-bg', function(target, ev) {
  if (ev.target === target && typeof cancelMobileEmail === 'function') cancelMobileEmail();
});

defineAction('mobile-email-close', function(target, ev) {
  if (typeof cancelMobileEmail === 'function') cancelMobileEmail();
});

defineAction('mobile-email-to-input', function(target, ev) {
  if (typeof setMobileEmailField === 'function') setMobileEmailField('to', target.value);
});

defineAction('mobile-email-subject-input', function(target, ev) {
  if (typeof setMobileEmailField === 'function') setMobileEmailField('subject', target.value);
});

defineAction('mobile-email-body-input', function(target, ev) {
  if (typeof setMobileEmailField === 'function') setMobileEmailField('body', target.value);
});

defineAction('mobile-email-send', function(target, ev) {
  if (typeof sendMobileEmail === 'function') sendMobileEmail();
});

defineAction('mobile-note-modal-bg', function(target, ev) {
  if (ev.target === target && typeof cancelMobileNote === 'function') cancelMobileNote();
});

defineAction('mobile-note-close', function(target, ev) {
  if (typeof cancelMobileNote === 'function') cancelMobileNote();
});

defineAction('mobile-note-input', function(target, ev) {
  if (typeof setMobileNoteDraft === 'function') setMobileNoteDraft(target.value);
});

defineAction('mobile-note-save', function(target, ev) {
  if (typeof saveMobileNote === 'function') saveMobileNote();
});

defineAction('mobile-schedule-modal-bg', function(target, ev) {
  if (ev.target === target && typeof cancelMobileSchedule === 'function') cancelMobileSchedule();
});

defineAction('mobile-schedule-close', function(target, ev) {
  if (typeof cancelMobileSchedule === 'function') cancelMobileSchedule();
});

defineAction('mobile-schedule-date-input', function(target, ev) {
  if (typeof setMobileScheduleDate === 'function') setMobileScheduleDate(target.value);
});

defineAction('mobile-schedule-time-input', function(target, ev) {
  if (typeof setMobileScheduleTime === 'function') setMobileScheduleTime(target.value);
});

defineAction('mobile-schedule-note-input', function(target, ev) {
  if (typeof setMobileScheduleNote === 'function') setMobileScheduleNote(target.value);
});

defineAction('mobile-schedule-save', function(target, ev) {
  if (typeof saveMobileSchedule === 'function') saveMobileSchedule();
});

defineAction('mobile-photo-take', function(target, ev) {
  var entityId = target.dataset.entityId;
  var entityType = target.dataset.entityType;
  if (typeof takeMobilePhoto === 'function') takeMobilePhoto(entityId, entityType);
});

defineAction('mobile-entity-action-exec', function(target, ev) {
  var code = target.dataset.actionCode;
  if (code && typeof Function === 'function') {
    try { new Function(code)(); } catch(e) { console.error('mobile-entity-action error:', e); }
  }
});

defineAction('mobile-entity-tab', function(target, ev) {
  var tabId = target.dataset.tabId;
  if (tabId) setMobileEntityTab(tabId);
});

defineAction('mobile-detail-action', function(target, ev) {
  var code = target.dataset.actionCode;
  if (code && typeof Function === 'function') {
    try { new Function(code)(); } catch(e) { console.error('mobile-detail-action error:', e); }
  }
});

// New actions for helper-fn refactor (2026-05-03)
defineAction('mobile-stat-page-nav', function(target, ev) {
  var page = target.dataset.page;
  if (page) setState({page: page});
});

defineAction('mobile-filter-chip-owner', function(target, ev) {
  var owner = target.dataset.owner;
  if (owner !== undefined) {
    kFilterOwners = [owner];
    renderPage();
  }
});

defineAction('mobile-filter-chip-all-owners', function(target, ev) {
  kFilterOwners = [];
  renderPage();
});

defineAction('mobile-filter-bracket-all', function(target, ev) {
  kFilterValMin = '';
  kFilterValMax = '';
  renderPage();
});

defineAction('mobile-filter-bracket-low', function(target, ev) {
  kFilterValMin = '';
  kFilterValMax = '25000';
  renderPage();
});

defineAction('mobile-filter-bracket-mid', function(target, ev) {
  kFilterValMin = '25000';
  kFilterValMax = '75000';
  renderPage();
});

defineAction('mobile-filter-bracket-high', function(target, ev) {
  kFilterValMin = '75000';
  kFilterValMax = '';
  renderPage();
});

defineAction('mobile-schedule-type-select', function(target, ev) {
  var typeId = target.dataset.typeId;
  if (typeId) setMobileScheduleType(typeId);
});

defineAction('mobile-schedule-quick-date', function(target, ev) {
  var dateKey = target.dataset.dateKey;
  if (dateKey) setMobileScheduleQuickDate(dateKey);
});

defineAction('mobile-row-tap', function(target, ev) {
  var action = target.dataset.tapAction;
  if (action) {
    try { new Function(action)(); } catch(e) { console.error('mobile-row-tap error:', e); }
  }
});

defineAction('mobile-tab-cta', function(target, ev) {
  var code = target.dataset.ctaCode;
  if (code && typeof Function === 'function') {
    try { new Function(code)(); } catch(e) { console.error('mobile-tab-cta error:', e); }
  }
});

defineAction('mobile-entity-back', function(target, ev) {
  var backAction = target.dataset.backAction;
  if (backAction && typeof Function === 'function') {
    try { new Function(backAction)(); } catch(e) { console.error('mobile-entity-back error:', e); }
  }
});

// ── Helper for building data-action attributes from helper-fn signatures ────
function _attrsForAction(action, dataAttrs) {
  if (!action) return '';
  var s = ' data-action="' + action + '"';
  if (dataAttrs) {
    Object.keys(dataAttrs).forEach(function(k) {
      var key = k.replace(/[A-Z]/g, function(c){return '-' + c.toLowerCase();});
      var v = dataAttrs[k];
      if (v == null) return;
      s += ' data-' + key + '="' + String(v).replace(/"/g, '&quot;') + '"';
    });
  }
  return s;
}

function setMobileEntityTab(tab) {
  _mobileEntityTab = tab;
  if (typeof renderPage === 'function') renderPage();
}

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
  // fmtK consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
  // fmtTime12 consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
  // _esc consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.

  // Compact metric strip cell — replaces the 2x2 grid (Phase 7 above-the-fold
  // tuning). Each cell is ~58px tall vs the old ~78px stat card, so 4 of
  // them in a single horizontal row push the work queue above the fold on a
  // mid-range Android. The 2x2 stat grid was kept as buildable shape but
  // collapsed via a single render path here — old `stat()` builder removed.
  function statMini(label, val, accent, action, dataAttrs) {
    var clickable = action ? 'cursor:pointer' : '';
    var tag = action ? 'button' : 'div';
    return '<' + tag + _attrsForAction(action, dataAttrs) + ' style="flex:1;min-width:0;background:#fff;border-radius:10px;padding:8px 10px;text-align:left;border:none;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);' + clickable + '">' +
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
          (a.dealId ? '<button data-action="mobile-appt-open-deal" data-deal-id="\' + _esc(a.dealId) + \'" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;border:none;background:#fef2f4;color:#c41230;cursor:pointer;font-family:inherit">Open Deal</button>' : '') +
        '</div>' +
        '<div style="font-size:14px;font-weight:700;color:#1a1a1a;margin-bottom:2px">' + nameLine + '</div>' +
        (addr ? '<div style="font-size:11px;color:#6b7280;margin-bottom:8px;display:flex;align-items:center;gap:4px">📍 ' + addr + '</div>' : '<div style="margin-bottom:8px"></div>') +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          (navUrl ? '<a href="' + navUrl + '" target="_blank" rel="noopener" style="flex:1;min-width:62px;text-align:center;padding:7px;border-radius:8px;background:#0a0a0a;color:#fff;font-size:11px;font-weight:700;text-decoration:none">↗ Navigate</a>' : '') +
          (phone ? '<a href="tel:' + String(phone).replace(/[^\d+]/g,'') + '" style="flex:1;min-width:55px;text-align:center;padding:7px;border-radius:8px;background:#22c55e;color:#fff;font-size:11px;font-weight:700;text-decoration:none">☎ Call</a>' : '') +
          (phone ? '<a href="sms:' + String(phone).replace(/[^\d+]/g,'') + '" style="flex:1;min-width:55px;text-align:center;padding:7px;border-radius:8px;background:#3b82f6;color:#fff;font-size:11px;font-weight:700;text-decoration:none">💬 SMS</a>' : '') +
          '<button data-action="mobile-appt-sync-calendar" data-args="' + addCalArgs + ')" title="Add to phone calendar" style="flex:1;min-width:55px;text-align:center;padding:7px;border-radius:8px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:700;border:none;cursor:pointer;font-family:inherit">+📅 Sync</button>' +
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
      '<button data-action="mobile-work-queue-open" data-entity-id="\' + _esc(entity.id) + \'" data-entity-type="\' + entityType + \'" style="flex:1;min-width:0;background:none;border:none;padding:0;text-align:left;font-family:inherit;cursor:pointer">' +
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
      statMini("Today's appts", String(todaysAppts.length), '#c41230', 'mobile-stat-page-nav', {page: 'calendar'}) +
      statMini('Open deals', String(myOpenDeals.length), '#0a0a0a', 'mobile-stat-page-nav', {page: 'deals'}) +
      statMini('Wins/week', String(weekWon.length), '#22c55e', null) +
      statMini('Comm MTD', fmtK(monthCommission), '#f59e0b', 'mobile-stat-page-nav', {page: 'commission'}) +
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
        return '<button data-action="mobile-more-menu-item" data-page="\' + it.id + \'" style="width:100%;text-align:left;padding:14px 16px;background:#fff;border:none;' + (i>0?'border-top:1px solid #f3f4f6;':'') + 'cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:12px;font-size:14px;font-weight:600;color:#1a1a1a">' +
          '<span style="color:#6b7280;display:inline-flex;width:20px;justify-content:center">' + Icon({n: it.icon, size: 16}) + '</span>' +
          '<span style="flex:1">' + it.label + '</span>' +
          '<span style="color:#9ca3af;font-size:18px;line-height:1">›</span>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<button data-action="mobile-logout" style="width:100%;text-align:center;padding:12px;background:#fff;border:1px solid #fecaca;border-radius:12px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:700;color:#b91c1c;margin-top:16px">Sign Out</button>';
}

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
  // _esc consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
  // _attrEsc consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
  function _initials(name) { return (name || '').split(' ').map(function(w){ return (w[0] || '').toUpperCase(); }).join('').slice(0,2); }
  function contactCard(c) {
    var fullName = (c.fn || '') + ' ' + (c.ln || '');
    return '<button data-action="mobile-contact-open" data-contact-id="\' + _esc(c.id) + \'" style="width:100%;background:#fff;border-radius:12px;padding:12px;border:none;cursor:pointer;text-align:left;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:8px">' +
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
        '<button data-action="mobile-contact-add" style="padding:6px 12px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">+ Add</button>' +
      '</div>' +
      '<input id="contactSearchInput" value="' + _attrEsc(cSearch) + '" data-on-input="mobile-contact-search-input" placeholder="Search name, email, phone…" style="width:100%;padding:8px 12px;background:#f3f4f6;border:none;border-radius:8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:8px" />' +
      '<div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px">' +
        ['all','residential','commercial'].map(function(t){
          var on = cType === t;
          var label = t === 'all' ? 'All' : t.charAt(0).toUpperCase() + t.slice(1);
          return '<button data-action="mobile-contact-filter-type" data-type="\' + t + \'" style="flex-shrink:0;padding:5px 12px;border-radius:14px;border:1px solid ' + (on ? '#c41230' : '#e5e7eb') + ';background:' + (on ? '#c41230' : '#fff') + ';color:' + (on ? '#fff' : '#6b7280') + ';font-size:11px;font-weight:' + (on ? 700 : 600) + ';cursor:pointer;font-family:inherit;white-space:nowrap">' + label + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    (filtered.length === 0
      ? '<div style="padding:40px 20px;text-align:center;background:#fff;border-radius:12px;color:#9ca3af;font-size:13px;font-style:italic">No contacts found</div>'
      : filtered.map(contactCard).join(''));
}

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

  // fmtK consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
  // _esc consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
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
    return '<div data-action="mobile-deal-open" data-deal-id="\' + _esc(d.id) + \'" style="background:#fff;border-radius:12px;padding:12px;cursor:pointer;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:8px;border-left:3px solid ' + stage.col + ';' + (veryStale ? 'outline:1px solid #fca5a5;outline-offset:-1px;' : '') + '">' +
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
    function chipBtn(label, active, action, dataAttrs) {
      return '<button' + _attrsForAction(action, dataAttrs) + ' style="padding:4px 10px;border-radius:14px;border:none;background:' + (active?'#c41230':'#f3f4f6') + ';color:' + (active?'#fff':'#374151') + ';font-size:10px;font-weight:700;cursor:pointer;font-family:inherit">' + label + '</button>';
    }
    return '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">' +
      (isManager ?
        '<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#6b7280;margin-bottom:4px">Rep</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
            chipBtn('All reps', kFilterOwners.length===0, 'mobile-filter-chip-all-owners') +
            allOwners.map(function(r){
              return chipBtn(r, kFilterOwners.indexOf(r) >= 0, 'mobile-filter-chip-owner', {owner: r});
            }).join('') +
          '</div></div>'
        : '') +
      '<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#6b7280;margin-bottom:4px">Value bracket</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px">' +
          chipBtn('All', allBracket, 'mobile-filter-bracket-all') +
          chipBtn('< $25k', bLow, 'mobile-filter-bracket-low') +
          chipBtn('$25–75k', bMid, 'mobile-filter-bracket-mid') +
          chipBtn('$75k+', bHigh, 'mobile-filter-bracket-high') +
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
          '<button data-action="mobile-filter-toggle" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;border:none;background:' + (kFilterOpen ? '#c41230' : '#f3f4f6') + ';color:' + (kFilterOpen ? '#fff' : '#374151') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">' +
            'Filter' + (activeFilters > 0 ? '<span style="width:6px;height:6px;border-radius:50%;background:' + (kFilterOpen ? '#fff' : '#c41230') + '"></span>' : '') +
          '</button>' +
        '</div>' +
        // Pipeline segmented control
        '<div style="display:flex;background:#f3f4f6;border-radius:8px;padding:3px;gap:3px">' +
          PIPELINES.map(function(p){
            var on = p.id === dPipeline;
            return '<button data-action="mobile-pipeline-select" data-pipeline-id="\' + _esc(p.id) + \'" style="flex:1;padding:6px;border-radius:6px;border:none;background:' + (on ? '#fff' : 'transparent') + ';color:' + (on ? '#0a0a0a' : '#6b7280') + ';font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;' + (on ? 'box-shadow:0 1px 2px rgba(0,0,0,.06)' : '') + '">' + p.name + '</button>';
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
            return '<button data-stage-id="' + s.id + '" data-stage-col="' + s.col + '" data-action="mobile-deal-stage-tab" data-stage-id="\' + s.id + \'" style="flex-shrink:0;min-width:80px;padding:8px 12px;border:none;background:none;cursor:pointer;border-bottom:2.5px solid ' + (on ? s.col : 'transparent') + ';display:flex;flex-direction:column;align-items:center;gap:2px;font-family:inherit">' +
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
      '<div id="dealKanbanScroll" data-stage-ids="' + stages.map(function(s){return s.id;}).join(',') + '" data-on-scroll="mobile-deal-kanban-scroll" style="flex:1;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch">' +
        stages.map(stageColumn).join('') +
      '</div>' +
    '</div>';
}

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

function _restoreDealsKanbanScroll() {
  var el = document.getElementById('dealKanbanScroll');
  if (!el) return;
  var stages = (el.dataset.stageIds || '').split(',');
  var idx = stages.indexOf(_mobileDealStageId);
  if (idx < 0) idx = 0;
  // Use rAF so the scroll happens after layout has settled.
  requestAnimationFrame(function(){ el.scrollLeft = idx * el.clientWidth; });
}

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

function renderMobileEmailModal() {
  if (!_pendingMobileEmail) return '';
  var p = _pendingMobileEmail;
  var safeTo = (p.to || '').replace(/"/g, '&quot;');
  var safeSubj = (p.subject || '').replace(/"/g, '&quot;');
  var safeBody = (p.body || '').replace(/</g, '&lt;');
  var sending = !!p.sending;
  return ''
    + '<div class="modal-bg" data-action="mobile-email-modal-bg" style="z-index:300">'
    +   '<div class="modal" style="max-width:520px;width:calc(100% - 24px);max-height:90vh;display:flex;flex-direction:column">'
    +     '<div class="modal-header" style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'
    +       '<h3 style="margin:0;font-size:15px;font-weight:700;font-family:Syne,sans-serif">Compose email</h3>'
    +       '<button data-action="mobile-email-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1;padding:0">×</button>'
    +     '</div>'
    +     '<div class="modal-body" style="padding:14px 18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto">'
    +       '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">To</label>'
    +         '<input type="email" value="' + safeTo + '" data-on-input="mobile-email-to-input" placeholder="recipient@example.com" style="width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:none;box-sizing:border-box" />' +
    +       '</div>'
    +       '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Subject</label>'
    +         '<input id="mobEmailSubject" value="' + safeSubj + '" data-on-input="mobile-email-subject-input" placeholder="Subject line" style="width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px;outline:none;box-sizing:border-box" />' +
    +       '</div>'
    +       '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px">Message</label>'
    +         '<textarea rows="8" data-on-input="mobile-email-body-input" placeholder="Write your message…" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5">' + safeBody + '</textarea>' +
    +       '</div>'
    +     '</div>'
    +     '<div class="modal-footer" style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end;flex-shrink:0">'
    +       '<button data-action="mobile-email-close" ' + (sending ? 'disabled' : '') + ' style="padding:9px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:' + (sending ? 'not-allowed' : 'pointer') + ';font-family:inherit;opacity:' + (sending ? '.5' : '1') + '">Cancel</button>'
    +       '<button data-action="mobile-email-send" ' + (sending ? 'disabled' : '') + ' style="padding:9px 18px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:13px;font-weight:700;cursor:' + (sending ? 'not-allowed' : 'pointer') + ';font-family:inherit;opacity:' + (sending ? '.7' : '1') + '">' + (sending ? 'Sending…' : '✈ Send') + '</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

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
    + '<div class="modal-bg" data-action="mobile-note-modal-bg" style="z-index:300">'
    +   '<div class="modal" style="max-width:480px;width:calc(100% - 24px)">'
    +     '<div class="modal-header" style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +       '<h3 style="margin:0;font-size:15px;font-weight:700;font-family:Syne,sans-serif">Add a note</h3>'
    +       '<button data-action="mobile-note-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1;padding:0">×</button>'
    +     '</div>'
    +     '<div class="modal-body" style="padding:14px 18px">'
    +       '<textarea id="mobNoteInput" rows="5" data-on-input="mobile-note-input" placeholder="What happened? Quick recap…" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:14px;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5">' + safe + '</textarea>'
    +     '</div>'
    +     '<div class="modal-footer" style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end">'
    +       '<button data-action="mobile-note-close" style="padding:9px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:pointer;font-family:inherit">Cancel</button>'
    +       '<button data-action="mobile-note-save" style="padding:9px 18px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Save note</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

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

  function chip(active, label, action, dataAttrs) {
    var bg = active ? '#fff5f6' : '#fff';
    var col = active ? '#c41230' : '#6b7280';
    var bd = active ? '#c41230' : '#e5e7eb';
    return '<button' + _attrsForAction(action, dataAttrs) + ' style="padding:8px 14px;border:1px solid ' + bd + ';border-radius:20px;font-size:13px;cursor:pointer;font-family:inherit;background:' + bg + ';color:' + col + ';font-weight:600">' + label + '</button>';
  }

  var typeChips = types.map(function(t) {
    return chip(p.type === t.id, t.icon + ' ' + t.label, 'mobile-schedule-type-select', {typeId: t.id});
  }).join('');

  var quickChips = quick.map(function(q) {
    return chip(p.dateISO === q.iso, q.label, 'mobile-schedule-quick-date', {dateKey: q.key});
  }).join('');

  var safeNote = (p.note || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  return ''
    + '<div class="modal-bg" data-action="mobile-schedule-modal-bg" style="z-index:300">'
    +   '<div class="modal" style="max-width:480px;width:calc(100% - 24px)">'
    +     '<div class="modal-header" style="padding:14px 18px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +       '<h3 style="margin:0;font-size:15px;font-weight:700;font-family:Syne,sans-serif">Schedule next activity</h3>'
    +       '<button data-action="mobile-schedule-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1;padding:0">×</button>'
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
    +           '<input type="date" value="' + p.dateISO + '" data-on-input="mobile-schedule-date-input" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box">'
    +           '<input type="time" value="' + p.time + '" data-on-input="mobile-schedule-time-input" style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box">'
    +         '</div>'
    +       '</div>'
    +       '<div>'
    +         '<label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:8px">Note (optional)</label>'
    +         '<input id="mobSchedNoteInput" data-on-input="mobile-schedule-note-input" placeholder="One-line reminder…" value="' + safeNote + '" style="width:100%;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box">'
    +       '</div>'
    +     '</div>'
    +     '<div class="modal-footer" style="padding:12px 18px;border-top:1px solid #f0f0f0;display:flex;gap:8px;justify-content:flex-end">'
    +       '<button data-action="mobile-schedule-close" style="padding:9px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:13px;font-weight:600;color:#374151;cursor:pointer;font-family:inherit">Cancel</button>'
    +       '<button data-action="mobile-schedule-save" style="padding:9px 18px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Schedule</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

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
  // _esc consolidated to 07-shared-ui.js (2026-05-02). Falls through to global.
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
    '<button data-action="mobile-photo-take" data-entity-id="\' + _esc(entity.id) + \'" data-entity-type="\' + entityType + \'" style="display:flex;flex-direction:row;align-items:center;justify-content:center;padding:14px 4px;gap:8px;color:#0a0a0a;text-decoration:none;border:none;background:none;cursor:pointer;font-family:inherit">' +
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
    if (opts && (opts.tap || opts.action)) {
      var tap = opts.tap;
      var isUrl = tap && /^(tel:|mailto:|sms:|https?:)/.test(tap);
      var openAttr;
      if (isUrl) {
        openAttr = 'href="' + String(tap).replace(/"/g,'&quot;') + '"' + (tap.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '');
      } else if (opts.action) {
        openAttr = _attrsForAction(opts.action, opts.dataAttrs);
      } else {
        openAttr = '';
      }
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
  var schedBtn = '<button data-action="mobile-entity-action-exec" data-action-code="openMobileSchedule(\' + _esc(entity.id) + \',\' + entityType + \')" style="' + btnBase + ';border:1px solid #e5e7eb;background:#fff;color:#374151">+ Schedule</button>';
  var rows = [];
  if (entityType === 'lead') {
    var canEdit = typeof canEditLead === 'function' && canEditLead(entity);
    var actions = [schedBtn];
    if (!entity.owner && !entity.converted && canEdit) {
      actions.push('<button data-action="mobile-entity-action-exec" data-action-code="claimLead(\' + _esc(entity.id) + \')" style="' + btnBase + ';border:none;background:#c41230;color:#fff">+ Claim this lead</button>');
    } else if (!entity.converted) {
      actions.push('<button data-action="mobile-entity-action-exec" data-action-code="openConvertLeadModal(\' + _esc(entity.id) + \')" style="' + btnBase + ';border:none;background:#c41230;color:#fff">Convert to Deal →</button>');
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
        greenBtn = '<button data-action="mobile-entity-action-exec" data-action-code="unwindDealWon(\' + _esc(entity.id) + \')" style="' + btnBase + ';border:none;background:#0a0a0a;color:#fff">↺ Reopen Deal</button>';
      } else {
        greenBtn = '';
      }
    } else if (entity.lost) {
      greenBtn = '';   // Lost is terminal at the moment; reopening lost is desktop-only.
    } else if (nextStage && nextStage.isWon) {
      greenBtn = '<button data-action="mobile-entity-action-exec" data-action-code="markDealWon(\' + _esc(entity.id) + \')" style="' + btnBase + ';border:none;background:#22c55e;color:#fff">✓ Mark Won</button>';
    } else if (nextStage) {
      greenBtn = '<button data-action="mobile-entity-action-exec" data-action-code="advanceDealStageMobile(\' + _esc(entity.id) + \')" style="' + btnBase + ';border:none;background:#22c55e;color:#fff" title="Move to ' + nextStage.name + '">→ ' + nextStage.name + '</button>';
    } else {
      greenBtn = '';
    }
    var lostBtn = (!entity.won && !entity.lost)
      ? '<button data-action="mobile-entity-action-exec" data-action-code="markDealLost(\' + _esc(entity.id) + \')" style="' + btnBase + ';background:#fef2f2;color:#b91c1c;border:1px solid #fecaca">✗ Mark Lost</button>'
      : '';
    var dealRow = [lostBtn, schedBtn, greenBtn].filter(Boolean);
    if (dealRow.length) rows.push(dealRow);
  }
  if (rows.length) {
    bottomActions = rows.map(function(r){
      return '<div style="margin-top:12px;display:flex;gap:8px">' + r.join('') + '</div>';
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 9 — Tab strip + per-tab content
  // ─────────────────────────────────────────────────────────────────────────
  // Six tabs across the top of the detail content. Hero stays above, bottom
  // actions stay below. Each tab is a self-contained content block; the tab
  // strip is sticky just under the hero so it stays visible while scrolling.

  var st = getState();
  var TABS = [
    { id: 'activity', label: 'Activity' },
    { id: 'notes',    label: 'Notes' },
    { id: 'email',    label: 'Email' },
    { id: 'sms',      label: 'SMS' },
    { id: 'files',    label: 'Files' },
    { id: 'person',   label: 'Person' },
  ];
  var activeTab = (typeof _mobileEntityTab === 'string' && TABS.some(function(t){ return t.id === _mobileEntityTab; }))
    ? _mobileEntityTab : 'activity';

  // Tab strip — horizontal scroller so all 6 fit on a 320px screen, with
  // the active tab indicated by a 2px red underline. Tap → setMobileEntityTab.
  var tabStrip = '<div style="background:#fff;border-bottom:1px solid #e5e7eb;overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -12px 12px;border-radius:0">' +
    '<div style="display:flex;min-width:max-content">' +
      TABS.map(function(t){
        var on = t.id === activeTab;
        return '<button data-action="mobile-entity-tab" data-tab-id="\' + t.id + \'" style="flex-shrink:0;padding:11px 16px;border:none;background:none;cursor:pointer;border-bottom:2px solid ' + (on ? '#c41230' : 'transparent') + ';font-family:inherit;font-size:12px;font-weight:700;color:' + (on ? '#0a0a0a' : '#6b7280') + ';letter-spacing:.02em">' + t.label + '</button>';
      }).join('') +
    '</div>' +
  '</div>';

  // Helper for empty-state cards on tabs that have no content yet.
  function emptyCard(emoji, title, body) {
    return '<div style="padding:30px 20px;text-align:center;background:#fff;border-radius:12px;color:#6b7280;font-size:13px;line-height:1.5;box-shadow:0 1px 3px rgba(0,0,0,.06)">' +
      (emoji ? '<div style="font-size:32px;margin-bottom:8px">' + emoji + '</div>' : '') +
      (title ? '<div style="font-weight:600;color:#0a0a0a;margin-bottom:4px">' + title + '</div>' : '') +
      (body ? '<div style="font-size:12px">' + body + '</div>' : '') +
    '</div>';
  }
  function tabHeader(label, count, ctaLabel, ctaAction, ctaDataAttrs) {
    var countSpan = (count !== undefined) ? '<span style="font-size:11px;font-weight:700;color:#9ca3af;margin-left:6px">' + count + '</span>' : '';
    var cta = ctaAction
      ? '<button' + _attrsForAction(ctaAction, ctaDataAttrs) + ' style="padding:6px 12px;border-radius:8px;border:none;background:#c41230;color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit">' + ctaLabel + '</button>'
      : '';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;margin-bottom:8px">' +
      '<h2 style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:#6b7280;margin:0">' + label + countSpan + '</h2>' +
      cta +
    '</div>';
  }

  // ── Phase 10: ACTIVITY tab ──────────────────────────────────────────────
  // Reverse-chrono feed of all activities on the entity, with future
  // scheduled activities pinned to the top in a "Scheduled" section, and
  // completed/logged below in a "History" section. Each row: type icon +
  // type label + relative time + by-user + one-line preview.
  function tabActivity() {
    var acts = (entity.activities || []).slice();
    // Split into future-scheduled vs everything-else (logged + past-due).
    var nowMs = Date.now();
    function actMs(a) {
      try { return new Date((a.dueDate || a.date || '') + 'T' + (a.time || '00:00') + ':00').getTime(); }
      catch(e) { return 0; }
    }
    var scheduled = acts.filter(function(a){ return a && a.scheduled && !a.done && actMs(a) > nowMs; });
    var history   = acts.filter(function(a){ return !(a && a.scheduled && !a.done && actMs(a) > nowMs); });
    // Sort scheduled ascending (soonest first), history descending (newest first).
    scheduled.sort(function(a,b){ return actMs(a) - actMs(b); });
    history.sort(function(a,b){ return actMs(b) - actMs(a); });

    var ICON = { call:'📞', email:'✉', meeting:'📅', task:'☑️', followUp:'🔁', note:'📝', file:'📎', stage:'🔀', created:'⭐', edit:'✏️', sms:'💬', deadline:'⏰' };
    var COL  = { call:'#3b82f6', email:'#7c3aed', meeting:'#0ea5e9', task:'#22c55e', followUp:'#f97316', note:'#f59e0b', file:'#6366f1', stage:'#9ca3af', created:'#ef4444', edit:'#64748b', sms:'#14b8a6', deadline:'#eab308' };

    function actRow(a, isScheduled) {
      var icon = ICON[a.type] || '📌';
      var col = COL[a.type] || '#9ca3af';
      var when = '';
      if (isScheduled) {
        var dt;
        try { dt = new Date((a.dueDate || a.date) + 'T' + (a.time || '00:00') + ':00'); } catch(e){}
        if (dt) {
          var sameDay = dt.toDateString() === new Date().toDateString();
          var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
          if (sameDay) when = 'Today ' + (a.time || '');
          else if (dt.toDateString() === tomorrow.toDateString()) when = 'Tomorrow ' + (a.time || '');
          else when = dt.toLocaleDateString('en-AU', { day:'numeric', month:'short' }) + (a.time ? ' ' + a.time : '');
        }
      } else {
        when = a.date ? fmtRel(a.date) : '';
      }
      var by = a.by ? '<span style="font-size:10px;color:#9ca3af">· ' + a.by + '</span>' : '';
      var preview = (a.subject || a.text || '').slice(0, 80).replace(/</g, '&lt;');
      var preview2 = a.text && a.subject ? '<div style="font-size:11px;color:#6b7280;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + a.text.slice(0, 80).replace(/</g, '&lt;') + '</div>' : '';
      var typeLabel = (a.type === 'followUp' ? 'Follow-up' : a.type === 'checkMeasure' ? 'Check Measure' : (a.type || 'note').charAt(0).toUpperCase() + (a.type || 'note').slice(1));
      var leftBorder = isScheduled ? '3px solid ' + col : '3px solid #f3f4f6';
      return '<div style="display:flex;gap:10px;background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:' + leftBorder + '">' +
        '<div style="width:32px;height:32px;border-radius:50%;background:' + col + '18;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0">' + icon + '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">' +
            '<span style="font-size:13px;font-weight:700;color:#0a0a0a">' + typeLabel + '</span>' +
            (when ? '<span style="font-size:11px;color:#6b7280">· ' + when + '</span>' : '') +
            by +
          '</div>' +
          (preview ? '<div style="font-size:12px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + preview + '</div>' : '') +
          preview2 +
        '</div>' +
      '</div>';
    }

    var out = tabHeader('Activity', acts.length, '+ Schedule', 'mobile-tab-cta', {ctaCode: "openMobileSchedule('" + _esc(entity.id) + "','" + entityType + "')"});
    if (scheduled.length) {
      out += '<div style="margin-bottom:14px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin:0 4px 6px">Scheduled (' + scheduled.length + ')</div>' +
        scheduled.map(function(a){ return actRow(a, true); }).join('') +
      '</div>';
    }
    if (history.length) {
      out += '<div><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;margin:0 4px 6px">History (' + history.length + ')</div>' +
        history.map(function(a){ return actRow(a, false); }).join('') +
      '</div>';
    }
    if (acts.length === 0) {
      out += emptyCard('📋', 'No activity yet', 'Tap + Schedule to plan your next action.');
    }
    return out;
  }

  // ── Phase 11: NOTES tab ──────────────────────────────────────────────────
  // Type='note' activities + entity.notes (legacy free-text on the row),
  // newest first. + Note CTA opens the existing mobile note modal.
  function tabNotes() {
    var notes = (entity.activities || []).filter(function(a){ return a && a.type === 'note' && (a.text || '').trim(); });
    notes.sort(function(a,b){
      try { return new Date((b.date||'') + 'T' + (b.time||'00:00')).getTime() - new Date((a.date||'') + 'T' + (a.time||'00:00')).getTime(); }
      catch(e){ return 0; }
    });
    var legacyBlock = '';
    if (entity.notes && entity.notes.trim()) {
      legacyBlock = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Notes (legacy)</div><div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.5">' + String(entity.notes).replace(/</g, '&lt;') + '</div></div>';
    }
    var out = tabHeader('Notes', notes.length + (legacyBlock ? 1 : 0), '+ Note', 'mobile-tab-cta', {ctaCode: "openMobileNote('" + _esc(entity.id) + "','" + entityType + "')"});
    out += legacyBlock;
    if (notes.length === 0 && !legacyBlock) {
      out += emptyCard('📝', 'No notes yet', 'Quick recaps go here. Tap + Note above.');
    } else {
      out += notes.map(function(n){
        var when = n.date ? fmtRel(n.date) : '';
        var by = n.by || '';
        var safe = String(n.text || '').replace(/</g, '&lt;');
        return '<div style="background:#fff;border-radius:10px;padding:12px;margin-bottom:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:3px solid #f59e0b">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:10px;color:#9ca3af">' +
            '<span>' + by + '</span>' +
            '<span>' + when + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.5">' + safe + '</div>' +
        '</div>';
      }).join('');
    }
    return out;
  }

  // ── Phase 12: EMAIL tab ──────────────────────────────────────────────────
  // emailSent rows where entity_id matches OR (we own this contact's email).
  // Per-row: subject + to + by + date + open status pill. + Compose CTA
  // opens the existing mobile email modal.
  function tabEmail() {
    var sent = (st.emailSent || []).filter(function(m){
      if (!m) return false;
      if (m.entityId === entity.id || m.dealId === entity.id || m.leadId === entity.id) return true;
      if (email && m.to && String(m.to).toLowerCase() === String(email).toLowerCase()) return true;
      return false;
    });
    sent.sort(function(a,b){
      try { return new Date(b.date + ' ' + (b.time||'')).getTime() - new Date(a.date + ' ' + (a.time||'')).getTime(); }
      catch(e){ return 0; }
    });
    var ctaAction = email ? 'mobile-tab-cta' : '';
    var ctaDataAttrs = email ? {ctaCode: "openMobileEmail('" + _esc(entity.id) + "','" + entityType + "','" + _esc(email) + "')"} : {};
    var ctaLabel = email ? '+ Compose' : '';
    var out = tabHeader('Email', sent.length, ctaLabel, ctaAction, ctaDataAttrs);
    if (!email) {
      out += emptyCard('✉', 'No email on file', 'Add the contact\'s email on the Person tab to send and receive.');
      return out;
    }
    if (sent.length === 0) {
      out += emptyCard('✉', 'No email yet', 'Tap + Compose to send your first email — opens, clicks, and replies are tracked.');
    } else {
      out += sent.map(function(m){
        var subject = String(m.subject || '(no subject)').replace(/</g, '&lt;');
        var to = String(m.to || '').replace(/</g, '&lt;');
        var when = m.date ? fmtRel(m.date) : '';
        var openedPill = m.opens > 0
          ? '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#dcfce7;color:#15803d">👁 ' + m.opens + '× opened</span>'
          : '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#9ca3af">Not opened yet</span>';
        return '<div style="background:#fff;border-radius:10px;padding:12px;margin-bottom:6px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:3px solid #7c3aed">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px">' +
            '<div style="font-size:13px;font-weight:700;color:#0a0a0a;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + subject + '</div>' +
            '<span style="font-size:10px;color:#9ca3af;flex-shrink:0">' + when + '</span>' +
          '</div>' +
          '<div style="font-size:11px;color:#6b7280;margin-bottom:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">To: ' + to + (m.by ? ' · ' + m.by : '') + '</div>' +
          openedPill +
        '</div>';
      }).join('');
    }
    return out;
  }

  // ── Phase 13: SMS tab ────────────────────────────────────────────────────
  // smsLogs filtered by phone (we don't have a per-entity column on sms_logs
  // yet — phone match is the join). Each message rendered as a chat bubble:
  // outbound right-aligned (red), inbound left-aligned (white). + Compose
  // opens the device's native sms: handler.
  function tabSms() {
    var logs = (st.smsLogs || []).filter(function(m){
      if (!m || !phone) return false;
      var p = String(phone).replace(/[^\d+]/g, '');
      var to = String(m.to || '').replace(/[^\d+]/g, '');
      var from = String(m.from || '').replace(/[^\d+]/g, '');
      // Match the trailing 8 digits — handles +614 vs 04 prefix variations.
      var pTail = p.slice(-8);
      return (to.endsWith(pTail) || from.endsWith(pTail));
    });
    logs.sort(function(a,b){
      try { return new Date(a.sent_at || a.sentAt || 0).getTime() - new Date(b.sent_at || b.sentAt || 0).getTime(); }
      catch(e){ return 0; }
    });
    var ctaAction = phone ? 'mobile-tab-cta' : '';
    var ctaDataAttrs = phone ? {ctaCode: "window.location.href='sms:" + String(phone).replace(/[^\d+]/g, '') + "'"} : {};
    var ctaLabel = phone ? '+ SMS' : '';
    var out = tabHeader('SMS', logs.length, ctaLabel, ctaAction, ctaDataAttrs);
    if (!phone) {
      out += emptyCard('💬', 'No phone on file', 'Add the contact\'s phone on the Person tab to send and receive SMS.');
      return out;
    }
    if (logs.length === 0) {
      out += emptyCard('💬', 'No SMS yet', 'Tap + SMS to start a thread via your phone\'s composer.');
    } else {
      out += '<div style="background:#fff;border-radius:12px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:8px">' +
        logs.map(function(m){
          var direction = m.direction || (m.from && phone && String(m.from).replace(/[^\d+]/g,'').endsWith(String(phone).replace(/[^\d+]/g,'').slice(-8)) ? 'inbound' : 'outbound');
          var isOut = direction === 'outbound';
          var body = String(m.body || m.text || '').replace(/</g, '&lt;');
          var when = m.sent_at || m.sentAt;
          var whenStr = '';
          try { whenStr = when ? new Date(when).toLocaleString('en-AU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : ''; } catch(e){}
          return '<div style="display:flex;justify-content:' + (isOut ? 'flex-end' : 'flex-start') + '">' +
            '<div style="max-width:78%;background:' + (isOut ? '#c41230' : '#f3f4f6') + ';color:' + (isOut ? '#fff' : '#0a0a0a') + ';border-radius:14px;padding:8px 12px">' +
              '<div style="font-size:13px;line-height:1.4;white-space:pre-wrap">' + body + '</div>' +
              (whenStr ? '<div style="font-size:9px;opacity:.7;margin-top:3px;text-align:right">' + whenStr + '</div>' : '') +
            '</div>' +
          '</div>';
        }).join('') +
      '</div>';
    }
    return out;
  }

  // ── Phase 15: FILES tab ──────────────────────────────────────────────────
  // Existing entity_files render plus the Take Photo CTA at top. Reuses the
  /
