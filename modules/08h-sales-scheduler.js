// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08h-sales-scheduler.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Calendar scheduler, appointment booking, job scheduling.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────

defineAction('scheduler-close-activity-modal', function(target, ev) {
  schedActivityModal = false;
  renderPage();
});

defineAction('scheduler-set-activity-type', function(target, ev) {
  const typeId = target.dataset.type;
  schedActivityData.type = typeId;
  document.getElementById('sm_type').value = typeId;
  target.closest('.modal').querySelectorAll('.stype-btn').forEach(b => {
    b.style.background = '#fff';
    b.style.color = '#6b7280';
    b.style.borderColor = '#e5e7eb';
  });
  target.style.background = '#fff5f6';
  target.style.color = '#c41230';
  target.style.borderColor = '#c41230';
});

defineAction('scheduler-set-activity-title', function(target, ev) {
  schedActivityData.title = target.value;
});

defineAction('scheduler-quick-time-slot', function(target, ev) {
  const date = target.dataset.date;
  const time = target.dataset.time;
  schedActivityData.date = date;
  schedActivityData.time = time;
  document.getElementById('sm_date').value = date;
  document.getElementById('sm_time').value = time;
  mapSelectedDate = date;
  renderPage();
});

defineAction('scheduler-set-activity-date', function(target, ev) {
  schedActivityData.date = target.value;
  mapSelectedDate = target.value;
  renderPage();
});

defineAction('scheduler-set-activity-time', function(target, ev) {
  schedActivityData.time = target.value;
});

defineAction('scheduler-set-activity-duration', function(target, ev) {
  schedActivityData.duration = parseInt(target.value);
});

defineAction('scheduler-set-activity-notes', function(target, ev) {
  schedActivityData.notes = target.value;
});

defineAction('scheduler-select-rep', function(target, ev) {
  const repName = target.dataset.repName;
  mapSelectedRep = repName;
  schedActivityData.repName = repName;
  renderPage();
});

defineAction('scheduler-all-reps', function(target, ev) {
  mapSelectedDate = mapSelectedDate || new Date().toISOString().slice(0, 10);
  mapSelectedRep = 'all';
  renderPage();
});

defineAction('scheduler-rep-button', function(target, ev) {
  const repName = target.dataset.repName;
  mapSelectedRep = repName;
  schedActivityData.repName = repName;
  renderPage();
});

defineAction('scheduler-save-activity', function(target, ev) {
  saveScheduledActivity();
});

defineAction('scheduler-toggle-view', function(target, ev) {
  schView = target.dataset.view;
  renderPage();
});

defineAction('scheduler-week-prev', function(target, ev) {
  schOffset--;
  renderPage();
});

defineAction('scheduler-week-next', function(target, ev) {
  schOffset++;
  renderPage();
});

defineAction('scheduler-day-prev', function(target, ev) {
  schDayOffset--;
  renderPage();
});

defineAction('scheduler-day-next', function(target, ev) {
  schDayOffset++;
  renderPage();
});

defineAction('scheduler-today', function(target, ev) {
  schOffset = 0;
  schDayOffset = 0;
  renderPage();
});

defineAction('scheduler-set-installer-filter', function(target, ev) {
  schInstFilter = target.value;
  renderPage();
});

defineAction('scheduler-open-appointment-modal', function(target, ev) {
  const jobId = target.dataset.jobId || null;
  const dateStr = target.dataset.dateStr || null;
  schOpenModal(jobId, dateStr);
});

defineAction('scheduler-open-unscheduled-job', function(target, ev) {
  const jobId = target.dataset.jobId;
  schOpenModal(jobId);
});

defineAction('scheduler-open-empty-slot-week', function(target, ev) {
  const dateStr = target.dataset.dateStr;
  schOpenModal(null, dateStr);
});

defineAction('scheduler-show-job-toast-week', function(target, ev) {
  const jobId = target.dataset.jobId;
  const dealTitle = getState().deals.find(d => d.id === jobId)?.title || jobId;
  addToast('Deal: ' + dealTitle, 'info');
});

defineAction('scheduler-open-empty-slot-day', function(target, ev) {
  const dateStr = target.dataset.dateStr;
  schOpenModal(null, dateStr);
});

defineAction('scheduler-show-job-toast-day', function(target, ev) {
  const jobId = target.dataset.jobId;
  const dealTitle = getState().deals.find(d => d.id === jobId)?.title || jobId;
  addToast('Deal: ' + dealTitle, 'info');
});

defineAction('scheduler-close-modal', function(target, ev) {
  if (target === ev.target) {
    schModalOpen = false;
    schedActivityModal = false;
    renderPage();
  }
});

defineAction('scheduler-close-modal-button', function(target, ev) {
  schModalOpen = false;
  schedActivityModal = false;
  renderPage();
});

defineAction('scheduler-set-job', function(target, ev) {
  schModalData.jid = target.value;
  renderPage();
});

defineAction('scheduler-set-modal-date', function(target, ev) {
  schModalData.date = target.value;
  renderPage();
});

defineAction('scheduler-set-modal-time', function(target, ev) {
  schModalData.startTime = target.value;
  renderPage();
});

defineAction('scheduler-set-modal-duration', function(target, ev) {
  schModalData.durationH = parseFloat(target.value) || 4;
  renderPage();
});

defineAction('scheduler-set-modal-staff', function(target, ev) {
  schModalData.staffRequired = parseInt(target.value) || 2;
  renderPage();
});

defineAction('scheduler-toggle-installer', function(target, ev) {
  const instId = target.dataset.instId;
  schToggleInstaller(instId);
});

defineAction('scheduler-cancel-modal', function(target, ev) {
  schModalOpen = false;
  renderPage();
});

defineAction('scheduler-save-modal', function(target, ev) {
  schSaveModal();
});

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

  return `<div class="modal-bg" data-action="scheduler-close-modal">
    <div class="modal" style="max-width:860px;width:95vw;height:88vh;display:flex;flex-direction:column">

      <!-- Header -->
      <div style="padding:16px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h3 style="margin:0;font-size:17px;font-weight:700;font-family:Syne,sans-serif">Schedule Activity</h3>
        <div style="display:flex;align-items:center;gap:8px">
          ${gcalUrl ? `<a href="${gcalUrl}" target="_blank" class="btn-w" style="font-size:12px;text-decoration:none;gap:5px">📅 Add to Google Cal</a>` : ''}
          <button data-action="scheduler-close-activity-modal" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>
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
                data-action="scheduler-set-activity-type"
                data-type="${t.id}"
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
              data-on-input="scheduler-set-activity-title" style="font-size:13px">
          </div>

          <!-- Date + quick picks -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Date & Time</label>
            <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
              ${quickSlots.map(q => `<button data-action="scheduler-quick-time-slot" data-date="${q.date}" data-time="${q.time}"
                style="padding:4px 10px;border:1px solid #e5e7eb;border-radius:12px;font-size:11px;cursor:pointer;background:#fff;font-family:inherit;color:#6b7280"
                onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">${q.label}</button>`).join('')}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <input type="date" id="sm_date" value="${d.date || new Date().toISOString().slice(0, 10)}"
                data-on-input="scheduler-set-activity-date" class="inp" style="font-size:12px;padding:6px 8px">
              <input type="time" id="sm_time" value="${d.time || '09:00'}"
                data-on-input="scheduler-set-activity-time" class="inp" style="font-size:12px;padding:6px 8px">
            </div>
          </div>

          <!-- Duration -->
          <div>
            <label style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Duration</label>
            <select id="sm_dur" class="sel" data-on-change="scheduler-set-activity-duration"
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
              data-on-input="scheduler-set-activity-notes"
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
    return `<div data-action="scheduler-select-rep" data-rep-name="${r.name}"
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
              <button data-action="scheduler-all-reps" class="btn-g" style="font-size:11px">All reps</button>
              ${REP_BASES.slice(0, 3).map(r => `<button data-action="scheduler-rep-button" data-rep-name="${r.name}"
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
          <button data-action="scheduler-close-activity-modal" class="btn-w">Cancel</button>
          <button data-action="scheduler-save-activity" class="btn-r" style="font-size:13px;padding:7px 22px">Save Activity</button>
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
          ${['week', 'day'].map(v => `<button data-action="scheduler-toggle-view" data-view="${v}" style="padding:5px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;${schView === v ? 'background:#fff;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,.1)' : 'background:transparent;color:#6b7280'}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn-w" style="padding:7px" data-action="scheduler-week-prev">${Icon({ n: 'left', size: 14 })}</button>
        <span style="font-size:13px;font-weight:600;min-width:160px;text-align:center">${schFmtShort(days[0])} — ${schFmtShort(days[4])}</span>
        <button class="btn-w" style="padding:7px" data-action="scheduler-week-next">${Icon({ n: 'right', size: 14 })}</button>
        <button class="btn-g" style="font-size:12px" data-action="scheduler-today">Today</button>
        <select class="sel" style="font-size:12px;width:auto;padding:6px 10px" data-on-change="scheduler-set-installer-filter">
          <option value="all" ${schInstFilter === 'all' ? 'selected' : ''}>All Installers</option>
          ${INSTALLER_PROFILES.filter(i => i.active).map(i => `<option value="${i.id}" ${schInstFilter === i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
        </select>
        <button class="btn-r" style="font-size:12px" data-action="scheduler-open-appointment-modal">${Icon({ n: 'plus', size: 14 })} Schedule Appointment</button>
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
    return `<div style="padding:10px;border-radius:10px;border:1.5px dashed #e5e7eb;background:#f9fafb;margin-bottom:6px;cursor:pointer" data-action="scheduler-open-unscheduled-job" data-job-id="${j.id}" onmouseover="this.style.borderColor='#c41230';this.style.background='#fff5f6'" onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#f9fafb'">
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
      return `<div style="background:${col};color:#fff;border-radius:6px;padding:5px 7px;margin-bottom:3px;cursor:pointer;font-size:10px;position:relative" data-action="scheduler-show-job-toast-week" data-job-id="${en.jid}" draggable="true" ondragstart="schDragEntryId='${en.id}'" ondragend="schDragEntryId=null">
                      <div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">#${en.id.slice(-4)}</div>
                      <div style="opacity:.75">${en.startTime} · ${en.durationH}h</div>
                    </div>`;
    }).join('')}
                  ${dayEntries.length === 0 ? `<div style="height:100%;min-height:60px;display:flex;align-items:center;justify-content:center;cursor:pointer" data-action="scheduler-open-empty-slot-week" data-date-str="${ds}" onmouseover="this.style.background='rgba(196,18,48,.04)'" onmouseout="this.style.background=''">
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
          ${['week', 'day'].map(v => `<button data-action="scheduler-toggle-view" data-view="${v}" style="padding:5px 12px;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;${schView === v ? 'background:#fff;color:#1a1a1a;box-shadow:0 1px 3px rgba(0,0,0,.1)' : 'background:transparent;color:#6b7280'}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn-w" style="padding:7px" data-action="scheduler-day-prev">${Icon({ n: 'left', size: 14 })}</button>
        <span style="font-size:13px;font-weight:600;min-width:200px;text-align:center">${dateLabel}</span>
        <button class="btn-w" style="padding:7px" data-action="scheduler-day-next">${Icon({ n: 'right', size: 14 })}</button>
        <button class="btn-g" style="font-size:12px" data-action="scheduler-today">Today</button>
        <select class="sel" style="font-size:12px;width:auto;padding:6px 10px" data-on-change="scheduler-set-installer-filter">
          <option value="all" ${schInstFilter === 'all' ? 'selected' : ''}>All Installers</option>
          ${INSTALLER_PROFILES.filter(i => i.active).map(i => `<option value="${i.id}" ${schInstFilter === i.id ? 'selected' : ''}>${i.name}</option>`).join('')}
        </select>
        <button class="btn-r" style="font-size:12px" data-action="scheduler-open-appointment-modal" data-date-str="${dateStr}">${Icon({ n: 'plus', size: 14 })} Schedule</button>
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
                data-action="scheduler-show-job-toast-day"
                data-job-id="${en.jid}"
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

function renderScheduler() {
  return schView === 'day' ? renderSchDay() : renderSchWeek();
}

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

  return `<div class="modal-bg" data-action="scheduler-close-modal">
    <div class="modal" style="max-width:480px">
      <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">Schedule Job</h3>
        <button data-action="scheduler-close-modal-button" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:13px">

        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Job</label>
          <select class="sel" style="font-size:13px" data-on-change="scheduler-set-job">
            <option value="">Select job…</option>
            ${availableJobs.map(j => {
    const c = contacts.find(x => x.id === j.cid);
    return `<option value="${j.id}" ${d.jid === j.id ? 'selected' : ''}>${j.title || j.id} — ${j.suburb || j.branch || ''}</option>`;
  }).join('')}
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Date</label>
            <input class="inp" type="date" value="${d.date}" style="font-size:13px" data-on-input="scheduler-set-modal-date"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Start Time</label>
            <input class="inp" type="time" value="${d.startTime}" style="font-size:13px" data-on-input="scheduler-set-modal-time"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Duration (hours)</label>
            <input class="inp" type="number" value="${d.durationH}" min="1" max="16" step="0.5" style="font-size:13px" data-on-input="scheduler-set-modal-duration"></div>
          <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Staff required</label>
            <input class="inp" type="number" value="${d.staffRequired}" min="1" max="8" style="font-size:13px" data-on-input="scheduler-set-modal-staff"></div>
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
                  <input type="checkbox" ${checked ? 'checked' : ''} data-action="scheduler-toggle-installer" data-inst-id="${inst.id}" style="accent-color:${inst.col};width:15px;height:15px">
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
        <button class="btn-w" data-action="scheduler-cancel-modal">Cancel</button>
        <button class="btn-r" data-action="scheduler-save-modal">Schedule</button>
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
