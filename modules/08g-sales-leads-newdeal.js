// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08g-sales-leads-newdeal.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Leads detail, claim, new deal modal, stage-advance.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────

defineAction('leads-newdeal-close-deal-loading', function(target, ev) {
  setState({dealDetailId:null});
});

defineAction('leads-newdeal-move-deal-stage', function(target, ev) {
  const dealId = target.dataset.dealId;
  const stageId = target.dataset.stageId;
  moveDealToStage(dealId, stageId);
});

defineAction('leads-newdeal-open-deal-type-picker', function(target, ev) {
  openDealTypePicker(target.dataset.dealId);
});

defineAction('leads-newdeal-view-contact', function(target, ev) {
  setState({contactDetailId:target.dataset.contactId, dealDetailId:null});
});

defineAction('leads-newdeal-send-email', function(target, ev) {
  detailTab='email';
  renderPage();
});

defineAction('leads-newdeal-call-contact', function(target, ev) {
  twilioCall(target.dataset.phone, target.dataset.contactId, target.dataset.type);
});

defineAction('leads-newdeal-field-editor-info', function(target, ev) {
  addToast('Field editor in Settings → Custom Fields','info');
});

defineAction('leads-newdeal-custom-field-edit', function(target, ev) {
  cfStartEdit(target.dataset.dealId, target.dataset.fieldId, 'deal');
});

defineAction('leads-newdeal-open-deal-edit', function(target, ev) {
  openDealEditDrawer(target.dataset.dealId);
});

defineAction('leads-newdeal-view-job', function(target, ev) {
  setState({crmMode:'jobs', page:'jobs', jobDetailId:(getState().jobs.find(function(j){return j.jobNumber===target.dataset.jobRef})||{}).id||null});
});

defineAction('leads-newdeal-convert-deal-to-job', function(target, ev) {
  convertDealToJob(target.dataset.dealId);
});

defineAction('leads-newdeal-mark-won', function(target, ev) {
  markDealWon(target.dataset.dealId);
});

defineAction('leads-newdeal-mark-lost', function(target, ev) {
  markDealLost(target.dataset.dealId);
});

defineAction('leads-newdeal-unwind-won', function(target, ev) {
  unwindDealWon(target.dataset.dealId);
});

defineAction('leads-newdeal-claim-lead', function(target, ev) {
  claimLead(target.dataset.leadId);
});

defineAction('leads-newdeal-call-lead', function(target, ev) {
  twilioCall(target.dataset.phone, target.dataset.leadId, 'lead');
});

defineAction('leads-newdeal-set-lead-status', function(target, ev) {
  setLeadStatus(target.dataset.leadId, target.dataset.status);
});

defineAction('leads-newdeal-view-deal-from-lead', function(target, ev) {
  setState({page:'deals', dealDetailId:target.dataset.dealRef, leadDetailId:null});
});

defineAction('leads-newdeal-open-lead-edit', function(target, ev) {
  openLeadEditDrawer(target.dataset.leadId);
});

defineAction('leads-newdeal-open-convert-lead-modal', function(target, ev) {
  openConvertLeadModal(target.dataset.leadId);
});

defineAction('leads-newdeal-close-modal', function(target, ev) {
  if(ev.target === target) setState({modal:null});
});

defineAction('leads-newdeal-modal-close-button', function(target, ev) {
  setState({modal:null});
});

defineAction('leads-newdeal-select-deal-type', function(target, ev) {
  _ndDealTypeSelect(target.dataset.value);
});

defineAction('leads-newdeal-cancel-new-deal', function(target, ev) {
  setState({modal:null});
});

defineAction('leads-newdeal-create-deal', function(target, ev) {
  saveNewDeal();
});

defineAction('leads-newdeal-open-nearby-leads-map', function(target, ev) {
  mapSchedulingLead=target.dataset.leadId;
  setState({page:'leads'});
});

defineAction('leads-newdeal-view-contact-from-deal', function(target, ev) {
  setState({contactDetailId:target.dataset.contactId, dealDetailId:null});
});

// ────────────────────────────────────────────────────────────────────────────

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
    return '<div style="display:flex;align-items:center;justify-content:center;height:60vh;flex-direction:column;gap:12px;color:#6b7280"><div style="font-family:Syne,sans-serif;font-size:16px;font-weight:600">Opening deal…</div><div style="font-size:12px;color:#9ca3af">If this persists, <span style="color:#c41230;cursor:pointer;text-decoration:underline" data-action="leads-newdeal-close-deal-loading">return to deals</span>.</div></div>';
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
    return `<button data-action="leads-newdeal-move-deal-stage" data-deal-id="${d.id}" data-stage-id="${st.id}" style="flex:1;min-width:80px;padding:10px 6px;border:none;border-bottom:3px solid ${active ? '#c41230' : 'transparent'};cursor:pointer;font-size:11px;font-weight:${active ? 700 : 500};font-family:inherit;background:none;color:${active ? '#c41230' : past ? '#16a34a' : '#9ca3af'};text-align:center;transition:all .15s" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='none'">
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
        <span data-action="leads-newdeal-open-deal-type-picker" data-deal-id="${d.id}" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px" title="Click to change">
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
        ${contact ? `<button data-action="leads-newdeal-view-contact" data-contact-id="${contact.id}" class="btn-g" style="font-size:11px;padding:3px 8px">View</button>` : ''}
      </div>
      ${contact ? `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;cursor:pointer" data-action="leads-newdeal-view-contact-from-deal" data-contact-id="${contact.id}">
        <div style="width:38px;height:38px;background:#c41230;border-radius:50%;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(contact.fn + ' ' + contact.ln)}</div>
        <div>
          <div style="font-size:14px;font-weight:600;color:#1a1a1a">${contact.fn} ${contact.ln}</div>
          ${contact.co ? `<div style="font-size:12px;color:#6b7280">${contact.co}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:7px">
        <a href="mailto:${contact.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:7px">${Icon({ n: 'mail2', size: 13 })} ${contact.email || '—'}</a>
        ${contact.email ? `<button data-action="leads-newdeal-send-email" class="btn-r" style="font-size:11px;padding:4px 10px;margin-top:4px;width:100%;justify-content:center;gap:5px">${Icon({ n: 'send', size: 12 })} Send Email</button>` : ''}
        ${contact.phone ? `<a href="javascript:void(0)" data-action="leads-newdeal-call-contact" data-phone="${contact.phone}" data-contact-id="${contact.id}" data-type="contact" style="font-size:12px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:7px;cursor:pointer">${Icon({ n: 'phone2', size: 13 })} ${contact.phone}</a>` : `<div style="font-size:12px;color:#9ca3af;display:flex;align-items:center;gap:7px">${Icon({ n: 'phone2', size: 13 })} —</div>`}
        <div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:7px">${Icon({ n: 'pin', size: 13 })} ${[contact.street, contact.suburb, contact.state, contact.postcode].filter(Boolean).join(', ') || 'No address'}</div>
      </div>`: `<div style="font-size:13px;color:#9ca3af">No contact linked</div>`}
    </div>

    <!-- Details (custom fields) -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Details</span>
        <button data-action="leads-newdeal-field-editor-info" class="btn-g" style="font-size:11px;padding:3px 8px">${Icon({ n: 'edit', size: 12 })}</button>
      </div>
      ${dealFields.sort((a, b) => a.ord - b.ord).map(field => `
        <div style="padding:6px 0;border-bottom:1px solid #f9fafb" data-action="leads-newdeal-custom-field-edit" data-deal-id="${d.id}" data-field-id="${field.id}">
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
      ${canEditDeal(d) ? `<button data-action="leads-newdeal-open-deal-edit" data-deal-id="${d.id}" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({ n: 'edit', size: 12 })} Edit</button>` : ''}
      ${d.jobRef ? `<button data-action="leads-newdeal-view-job" data-job-ref="${d.jobRef}" class="btn-w" style="font-size:12px;width:100%;justify-content:center;margin-top:4px;color:#15803d;border-color:#86efac;background:#f0fdf4">🏗️ Job ${d.jobRef} — View</button>` :
        `<button data-action="leads-newdeal-convert-deal-to-job" data-deal-id="${d.id}" class="btn-w" style="font-size:12px;width:100%;justify-content:center;margin-top:4px">🏗️ Create Job</button>`}
      <button data-action="leads-newdeal-mark-won" data-deal-id="${d.id}" style="padding:6px 16px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Won</button>
      <button data-action="leads-newdeal-mark-lost" data-deal-id="${d.id}" style="padding:6px 16px;background:#ef4444;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-left:6px">Not Proceeding</button>
      ${(d.won && (getCurrentUser() || {}).role === 'admin') ? `<button data-action="leads-newdeal-unwind-won" data-deal-id="${d.id}" title="Admin: reverse the won state" style="padding:5px 12px;background:transparent;color:#6b7280;border:1px solid #d1d5db;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;margin-left:6px">↶ Unwind won</button>` : ''}`,
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({dealDetailId:null})",
    backLabel: "Pipeline",
    activities,
    contact,
  });
}

function setLeadStatus(leadId, status) {
  setState({
    leads: getState().leads.map(l =>
      l.id === leadId ? { ...l, status } : l
    )
  });
  dbUpdate('leads', leadId, { status: status });
  addToast('Status set to ' + status, 'success');
}

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
        : `<span class="bdg" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a">Unassigned</span>${canEditLead(lead) ? ` <button data-action="leads-newdeal-claim-lead" data-lead-id="${lead.id}" class="btn-r" style="font-size:10px;padding:2px 8px;margin-left:6px">Claim</button>` : ''}`],
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
        ${lead.phone ? `<a href="javascript:void(0)" data-action="leads-newdeal-call-lead" data-phone="${lead.phone}" data-lead-id="${lead.id}" style="font-size:12px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:7px;cursor:pointer">${Icon({ n: 'phone2', size: 13 })} ${lead.phone}</a>` : ''}
      ${lead.email ? `<a href="mailto:${lead.email}" style="font-size:12px;color:#3b82f6;text-decoration:none;display:flex;align-items:center;gap:8px">${Icon({ n: 'mail2', size: 13 })} ${lead.email}</a>` : ''}
      <button data-action="leads-newdeal-send-email" class="btn-r" style="font-size:12px;padding:5px 10px;margin-top:6px;width:100%;justify-content:center;gap:5px">${Icon({ n: 'send', size: 12 })} Send Email</button>
        ${lead.suburb ? `<div style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:7px">${Icon({ n: 'pin', size: 13 })} ${[lead.street, lead.suburb, lead.state, lead.postcode].filter(Boolean).join(', ')}</div>` : ''}
      </div>
    </div>

    <!-- Nearby Leads (for efficient scheduling) -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">\ud83d\udccd Nearby Leads</span>
        <button data-action="leads-newdeal-open-nearby-leads-map" data-lead-id="${lead.id}" class="btn-g" style="font-size:10px;padding:3px 7px">Map view</button>
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
        ${['New', 'Contacted', 'Qualified', 'Unqualified', 'Archived'].map(s => `<button data-action="leads-newdeal-set-lead-status" data-lead-id="${lead.id}" data-status="${s}" style="text-align:left;padding:8px 12px;border-radius:8px;border:1px solid ${lead.status === s ? statusColor[s] || '#e5e7eb' : '#e5e7eb'};background:${lead.status === s ? statusColor[s] + '18' : '#fff'};font-size:13px;font-weight:${lead.status === s ? 600 : 400};color:${lead.status === s ? statusColor[s] || '#374151' : '#374151'};cursor:pointer;font-family:inherit">${lead.status === s ? '✓ ' : ''} ${s}</button>`).join('')}
      </div>
    </div>

    <!-- Notes -->
    ${lead.notes ? `<div style="padding:16px">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Original Notes</div>
      <p style="font-size:13px;color:#374151;margin:0;line-height:1.6;white-space:pre-wrap">${lead.notes}</p>
    </div>`: ''}

    ${lead.converted && lead.dealRef ? `<div style="padding:14px 16px;margin:0 16px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px">
      <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:6px">✓ Converted to Deal</div>
      <button data-action="leads-newdeal-view-deal-from-lead" data-deal-ref="${lead.dealRef}" class="btn-w" style="font-size:12px;width:100%;justify-content:center">View Deal →</button>
    </div>`: ''}
  `;

  return renderEntityDetail({
    entityType: 'lead', entityId: lead.id,
    title: lead.fn + ' ' + lead.ln, owner: lead.owner,
    stageBarHtml: null,
    wonLostHtml: (canEditLead(lead) ? `<button data-action="leads-newdeal-open-lead-edit" data-lead-id="${lead.id}" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({ n: 'edit', size: 12 })} Edit</button>` : '') + (!lead.converted ? `<button data-action="leads-newdeal-open-convert-lead-modal" data-lead-id="${lead.id}" class="btn-r" style="font-size:12px;padding:6px 14px">Convert to Deal →</button>` : Badge('Converted', 'teal')),
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({leadDetailId:null})",
    backLabel: "Leads",
    activities,
    contact: contact || { fn: lead.fn, ln: lead.ln, email: lead.email, phone: lead.phone, suburb: lead.suburb },
  });
}

function renderNewDealModal() {
  const { contacts } = getState();
  return `<div class="modal-bg" data-action="leads-newdeal-close-modal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">New Deal</h3>
        <button data-action="leads-newdeal-modal-close-button" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
      </div>
      <div style="padding:24px;display:flex;flex-direction:column;gap:14px">
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Deal Title *</label>
          <input class="inp" id="nd_title" placeholder="e.g. Double glazing - Full home"></div>
        <div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:6px">Deal Type *</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <label class="nd-dealtype-card" data-value="residential" data-action="leads-newdeal-select-deal-type" style="cursor:pointer;border:2px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff;transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px">
              <span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#1a1a1a">
                <input type="radio" name="nd_dealType" value="residential" style="margin:0">
                Residential
              </span>
              <span style="font-size:11px;color:#6b7280;line-height:1.35">Single home, owner-occupied</span>
            </label>
            <label class="nd-dealtype-card" data-value="commercial" data-action="leads-newdeal-select-deal-type" style="cursor:pointer;border:2px solid #e5e7eb;border-radius:10px;padding:12px 14px;background:#fff;transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px">
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
        <button class="btn-w" data-action="leads-newdeal-cancel-new-deal">Cancel</button>
        <button class="btn-r" data-action="leads-newdeal-create-deal">Create Deal</button>
      </div>
    </div>
  </div>`;
}

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
