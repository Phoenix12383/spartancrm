// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08e-sales-deal-detail.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Deal detail view, activities, inline email/SMS, templates.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
defineAction('deal-detail-close-overlay', function(target, ev) {
  if(ev.target === target) setState({editingDealId:null});
});
defineAction('deal-detail-close-drawer', function(target, ev) {
  setState({editingDealId:null});
});
defineAction('deal-detail-save-edit', function(target, ev) {
  saveDealEdit();
});
defineAction('deal-detail-save-note', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  saveTabActivity(entityId, entityType, 'note');
});
defineAction('deal-detail-note-keydown', function(target, ev) {
  if(ev.key==='Enter'&&(ev.metaKey||ev.ctrlKey)){
    var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
    saveTabActivity(entityId, entityType, 'note');
    ev.preventDefault();
  }
});
defineAction('deal-detail-select-activity-type', function(target, ev) {
  var entityId = target.dataset.entityId, typeId = target.dataset.typeId;
  document.querySelectorAll('[data-atype-group="' + entityId + '"]').forEach(function(b){
    b.style.background='#fff';b.style.color='#6b7280';b.style.borderColor='#e5e7eb';
  });
  target.style.background='#fff5f6';target.style.color='#c41230';target.style.borderColor='#c41230';
  document.getElementById('atype_hidden_' + entityId).value=typeId;
});
defineAction('deal-detail-open-schedule', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  openScheduleWithMap(entityId, entityType);
});
defineAction('deal-detail-save-activity', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  saveActivityFromTab(entityId, entityType);
});
defineAction('deal-detail-twilio-call', function(target, ev) {
  var phone = target.dataset.phone, entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  twilioCall(phone, entityId, entityType);
});
defineAction('deal-detail-save-call', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  saveCallLog(entityId, entityType);
});
defineAction('deal-detail-apply-sms-template', function(target, ev) {
  var templateId = target.dataset.templateId, entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  applySmsTemplateInline(templateId, entityId, entityType);
});
defineAction('deal-detail-sms-input', function(target, ev) {
  var entityId = target.dataset.entityId;
  setInlineSmsDraft(entityId, target.value);
  var countEl = document.getElementById('smsCharCount_' + entityId);
  if(countEl) {
    countEl.textContent=target.value.length+'/160';
    countEl.style.color=target.value.length>160?'#dc2626':target.value.length>140?'#f59e0b':'#6b7280';
  }
});
defineAction('deal-detail-send-sms', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  sendSmsFromTab(entityId, entityType);
});
defineAction('deal-detail-gmail-connect', function(target, ev) {
  gmailConnect();
});
defineAction('deal-detail-apply-email-template', function(target, ev) {
  var templateId = target.dataset.templateId, entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  applyEmailTemplateInline(templateId, entityId, entityType);
});
defineAction('deal-detail-open-template-picker', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  openTemplatePickerInline(entityId, entityType);
});
defineAction('deal-detail-email-subject-input', function(target, ev) {
  var entityId = target.dataset.entityId;
  setInlineEmailDraftField(entityId, 'subject', target.value);
});
defineAction('deal-detail-email-body-input', function(target, ev) {
  var entityId = target.dataset.entityId;
  setInlineEmailDraftField(entityId, 'body', target.value);
});
defineAction('deal-detail-insert-merge-field', function(target, ev) {
  var entityId = target.dataset.entityId;
  insertMergeFieldInline(entityId, target.value);
  target.value='';
});
defineAction('deal-detail-open-full-composer', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  emailFromEntityTab(entityId, entityType);
});
defineAction('deal-detail-save-email-log', function(target, ev) {
  var entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  saveEmailLog(entityId, entityType);
});
defineAction('deal-detail-file-upload', function(target, ev) {
  // Triggered by onchange on file input
  var entityType = target.dataset.entityType, entityId = target.dataset.entityId;
  handleEntityFileUpload(entityType, entityId, target);
}, 'change');
defineAction('deal-detail-remove-file', function(target, ev) {
  var entityType = target.dataset.entityType, entityId = target.dataset.entityId, fileId = target.dataset.fileId;
  if(confirm('Remove this file?')) removeEntityFile(entityType, entityId, fileId);
});
defineAction('deal-detail-close-modal', function(target, ev) {
  if(ev.target === target) target.remove();
});
defineAction('deal-detail-apply-template-from-modal', function(target, ev) {
  var templateId = target.dataset.templateId, entityId = target.dataset.entityId, entityType = target.dataset.entityType;
  applyEmailTemplateInline(templateId, entityId, entityType);
  target.closest('.modal-bg').remove();
});
defineAction('deal-detail-close-modal-btn', function(target, ev) {
  target.closest('.modal-bg').remove();
});
defineAction('deal-detail-map-date-change', function(target, ev) {
  mapSelectedDate = target.value;
  renderPage();
});
defineAction('deal-detail-map-rep-change', function(target, ev) {
  mapSelectedRep = target.value;
  renderPage();
});
defineAction('deal-detail-map-book-slot', function(target, ev) {
  var entityId = target.dataset.entityId, slot = target.dataset.slot, date = target.dataset.date, activeRep = target.dataset.activeRep;
  var aTimeEl = document.getElementById('atime_' + entityId);
  if(aTimeEl) aTimeEl.value = slot;
  schedActivityData.time = slot;
  schedActivityData.date = date;
  schedActivityData.repName = activeRep;
  mapSelectedRep = activeRep;
  var smTimeEl = document.getElementById('sm_time');
  if(smTimeEl) smTimeEl.value = slot;
});
defineAction('deal-detail-select-rep', function(target, ev) {
  var repName = target.dataset.repName, entityId = target.dataset.entityId;
  mapSelectedRep = repName;
  schedActivityData.repName = repName;
  renderPage();
});
defineAction('deal-detail-open-full-map', function(target, ev) {
  setState({page:'map'});
});

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
  return `<div class="ovl" data-action="deal-detail-close-overlay">
    <div class="panel" style="width:440px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <h2 style="font-family:Syne,sans-serif;font-weight:700;font-size:16px;margin:0">Edit Deal</h2>
        <button data-action="deal-detail-close-drawer" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
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
        <button class="btn-w" data-action="deal-detail-close-drawer">Cancel</button>
        <button class="btn-r" data-action="deal-detail-save-edit">Save Changes</button>
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
        data-action="deal-detail-note-keydown" data-entity-id="${entityId}" data-entity-type="${entityType}"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span style="font-size:11px;color:#9ca3af">Cmd+Enter to save</span>
        <button data-action="deal-detail-save-note" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-r" style="font-size:12px;padding:5px 18px">Save note</button>
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
          data-action="deal-detail-select-activity-type" data-entity-id="${entityId}" data-type-id="${t.id}" data-atype-group="${entityId}"
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
        <button data-action="deal-detail-open-schedule" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-w" style="font-size:12px;gap:6px">
          📅 Open full schedule modal
        </button>
        <div style="display:flex;gap:6px">
          <button data-action="deal-detail-save-activity" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-r" style="font-size:12px;padding:5px 18px">Save activity</button>
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
          ${phone ? `<a href="javascript:void(0)" data-action="deal-detail-twilio-call" data-phone="${phone}" data-entity-id="${entityId}" data-entity-type="${entityType}" style="background:#22c55e;color:#fff;padding:7px 14px;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;display:flex;align-items:center;gap:5px;cursor:pointer">📞 Call</a>` : ''}
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
        <button data-action="deal-detail-open-schedule" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-w" style="font-size:12px;gap:5px">📅 Schedule follow-up</button>
        <button data-action="deal-detail-save-call" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-r" style="font-size:12px;padding:5px 18px">Log call</button>
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
          ${tpls.map(t => `<button data-action="deal-detail-apply-sms-template" data-template-id="${t.id}" data-entity-id="${entityId}" data-entity-type="${entityType}" style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e;font-weight:600">${_escText(t.name)}</button>`).join('')}
        </div>
      </div>` : ''}

      <!-- Composer -->
      ${smsAllowed ? `<textarea id="smsBody_${entityId}" class="inp" rows="3" placeholder="Type your SMS…" data-action="deal-detail-sms-input" data-entity-id="${entityId}" style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px">${_escText(draft.body || '')}</textarea>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span id="smsCharCount_${entityId}" style="font-size:11px;color:${charColor}">${charCount}/160</span>
        <button data-action="deal-detail-send-sms" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-r" style="font-size:12px;padding:5px 18px"${(!phone || !smsAllowed) ? ' disabled style="font-size:12px;padding:5px 18px;opacity:.5;cursor:not-allowed"' : ''}>${!phone ? 'No phone' : 'Send SMS'}</button>
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
        <button data-action="deal-detail-gmail-connect" class="btn-r" style="font-size:12px;margin-top:6px">Connect Gmail →</button>
      </div>` : ''}

      <!-- Template chips — click to fill subject + body with merge-resolved content -->
      ${allTpls.length > 0 ? `
      <div style="padding:8px 10px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;margin-bottom:10px">
        <div style="font-size:10px;font-weight:700;color:#92400e;margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">📋 Apply template</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${topTpls.map(t => `<button data-action="deal-detail-apply-email-template" data-template-id="${t.id}" data-entity-id="${entityId}" data-entity-type="${entityType}"
            style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e;font-weight:600"
            onmouseover="this.style.background='#fffbeb'" onmouseout="this.style.background='#fff'"
            title="${(t.subject || '').replace(/"/g, '&quot;')}">${t.name}</button>`).join('')}
          ${allTpls.length > 5 ? `<button data-action="deal-detail-open-template-picker" data-entity-id="${entityId}" data-entity-type="${entityType}" style="font-size:11px;padding:4px 10px;border-radius:20px;border:1px dashed #fde68a;background:#fff;cursor:pointer;font-family:inherit;color:#92400e">More… (${allTpls.length - 5})</button>` : ''}
        </div>
      </div>` : ''}

      <input id="emailTo_${entityId}" class="inp" value="${emailTo}" placeholder="To: email@example.com" style="font-size:13px;margin-bottom:6px">
      <input id="emailSubj_${entityId}" class="inp" value="${_escAttr(_draft.subject)}" data-action="deal-detail-email-subject-input" data-entity-id="${entityId}" placeholder="Subject…" style="font-size:13px;margin-bottom:6px">
      <textarea id="tabInput_${entityId}" class="inp" rows="4" placeholder="Write your email…" data-action="deal-detail-email-body-input" data-entity-id="${entityId}"
        style="font-size:13px;resize:none;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px">${_escText(_draft.body)}</textarea>

      <!-- Insert-field dropdown. Custom fields first (with captured values shown),
           then standard merge fields. Selecting inserts {{key}} at the cursor. -->
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px">
        <select id="mergeInsert_${entityId}" data-action="deal-detail-insert-merge-field" data-entity-id="${entityId}"
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
        <button data-action="deal-detail-open-full-composer" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-w" style="font-size:12px;gap:5px">↗ Open in full composer</button>
        <button data-action="deal-detail-save-email-log" data-entity-id="${entityId}" data-entity-type="${entityType}" class="btn-r" style="font-size:12px;padding:5px 18px">Log email</button>
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
          + '<button data-action="deal-detail-remove-file" data-entity-type="' + entityType + '" data-entity-id="' + entityId + '" data-file-id="' + f.id + '" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:14px">🗑</button>'
          + '</td></tr>';
      }).join('')
      + '</tbody></table>';

    return `<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0">
      <label style="display:block;border:2px dashed #e5e7eb;border-radius:10px;padding:24px;text-align:center;cursor:pointer;background:#fafafa"
        onmouseover="this.style.borderColor='#c41230';this.style.background='#fff5f6'"
        onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#fafafa'">
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
          style="display:none"
          data-action="deal-detail-file-upload" data-entity-type="${entityType}" data-entity-id="${entityId}">
        <div style="font-size:28px;margin-bottom:8px">📎</div>
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px">Drop files here or click to upload</div>
        <div style="font-size:11px;color:#9ca3af">PDF, images, documents</div>
      </label>
      ${listHtml}
    </div>`;
  }

  return '<div style="padding:16px;color:#9ca3af;font-size:13px">Select a tab above</div>';
}

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

function _getInlineEmailDraft(entityId) {
  return _inlineEmailDrafts[entityId] || { subject: '', body: '' };
}

function setInlineEmailDraftField(entityId, field, value) {
  var d = _inlineEmailDrafts[entityId] || { subject: '', body: '' };
  d[field] = value;
  _inlineEmailDrafts[entityId] = d;
}

function clearInlineEmailDraft(entityId) { delete _inlineEmailDrafts[entityId]; }

function _getInlineSmsDraft(entityId) {
  return _inlineSmsDrafts[entityId] || { body: '' };
}

function setInlineSmsDraft(entityId, body) {
  _inlineSmsDrafts[entityId] = { body: body || '' };
}

function clearInlineSmsDraft(entityId) { delete _inlineSmsDrafts[entityId]; }

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

function openTemplatePickerInline(entityId, entityType) {
  const all = (typeof getAllTemplates === 'function') ? getAllTemplates() : [];
  if (all.length === 0) { addToast('No templates available', 'info'); return; }
  // Group templates by category for a cleaner list.
  const byCat = {};
  all.forEach(function (t) { var c = t.category || 'Other'; (byCat[c] = byCat[c] || []).push(t); });
  const html = '<div class="modal-bg" data-action="deal-detail-close-modal">' +
    '<div class="modal">' +
    '<div class="modal-header">' +
    '<h3 style="margin:0;font-size:15px;font-weight:700">Pick a template</h3>' +
    '<button data-action="deal-detail-close-modal-btn" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px">×</button>' +
    '</div>' +
    '<div class="modal-body" style="padding:8px">' +
    Object.keys(byCat).sort().map(function (cat) {
      return '<div style="padding:8px 12px 4px;font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">' + cat + '</div>' +
        byCat[cat].map(function (t) {
          return '<div data-action="deal-detail-apply-template-from-modal" data-template-id="' + t.id + '" data-entity-id="' + entityId + '" data-entity-type="' + entityType + '" ' +
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

function openActivityForm(dealId, type) { detailTab = type === 'email' ? 'email' : type === 'call' ? 'call' : 'notes'; renderPage(); }

function saveActivity(dealId, type) { saveTabActivity(dealId, 'deal', 'note'); }

function toggleTaskDone(dealId, actId) { toggleActivityDone(dealId, actId, 'deal'); }

function saveQuickActivity(id, type) { saveTabActivity(id, type, 'note'); }

function saveDetailNote(id, type) { saveTabActivity(id, type, 'note'); }

function saveDetailEmail(id, type) { saveEmailLog(id, type); }

function saveDetailCall(id, type) { saveCallLog(id, type); }

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
