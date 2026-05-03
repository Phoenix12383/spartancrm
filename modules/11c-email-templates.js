// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11c-email-templates.js
// Extracted from 11-email-page.js on 2026-05-02 as part of monolith breakup.
// ═════════════════════════════════════════════════════════════════════════════


// ── EVENT ACTIONS (Data-driven delegation) ────────────────────────────────────
defineAction('email-templates-set-tab', function(target, ev) {
  var cat = target.dataset.category || 'all';
  emailTemplateTab = cat.toLowerCase();
  renderPage();
});

defineAction('email-templates-open-editor-new', function(target, ev) {
  openTemplateEditor('new');
});

defineAction('email-templates-select-template', function(target, ev) {
  var id = target.dataset.templateId;
  setState({ emailSelectedId: id });
});

defineAction('email-templates-use-template', function(target, ev) {
  var id = target.dataset.templateId;
  var tmpl = getAllTemplates().find(function(t) { return t.id === id; });
  if (tmpl) emailUseTemplate(tmpl);
});

defineAction('email-templates-open-editor-edit', function(target, ev) {
  var id = target.dataset.templateId;
  openTemplateEditor(id);
});

defineAction('email-templates-delete-template', function(target, ev) {
  var id = target.dataset.templateId;
  deleteCustomTemplate(id);
});

defineAction('email-templates-close-editor', function(target, ev) {
  closeTemplateEditor();
});

defineAction('email-templates-save-template', function(target, ev) {
  saveCustomTemplate();
});

// ── CUSTOM TEMPLATES (user-created, stored in localStorage) ───────────────────
function getCustomTemplates() { try { return JSON.parse(localStorage.getItem('spartan_custom_templates') || '[]'); } catch(e){ return []; } }

function saveCustomTemplates(t) { localStorage.setItem('spartan_custom_templates', JSON.stringify(t)); }

function getAllTemplates() { return EMAIL_TEMPLATES.concat(getCustomTemplates()); }


function openTemplateEditor(id) {
  if (id === 'new') { editingTemplateNew = true; editingTemplateId = null; }
  else { editingTemplateNew = false; editingTemplateId = id; }
  renderPage();
}

function closeTemplateEditor() { editingTemplateId = null; editingTemplateNew = false; renderPage(); }


function saveCustomTemplate() {
  var name = document.getElementById('tpl_name').value.trim();
  var subject = document.getElementById('tpl_subject').value.trim();
  var body = document.getElementById('tpl_body').value;
  var category = document.getElementById('tpl_category').value.trim() || 'Custom';
  if (!name || !subject) { addToast('Name and subject are required', 'error'); return; }
  var templates = getCustomTemplates();
  if (editingTemplateNew) {
    templates.push({ id: 'ct' + Date.now(), name: name, category: category, subject: subject, body: body, tags: [], opens: 0, clicks: 0, sent: 0, custom: true });
    addToast('Template created', 'success');
  } else {
    templates = templates.map(function(t) { return t.id === editingTemplateId ? { ...t, name: name, subject: subject, body: body, category: category } : t; });
    addToast('Template updated', 'success');
  }
  saveCustomTemplates(templates);
  editingTemplateId = null; editingTemplateNew = false;
  renderPage();
}

function deleteCustomTemplate(id) {
  if (!confirm('Delete this template?')) return;
  saveCustomTemplates(getCustomTemplates().filter(function(t) { return t.id !== id; }));
  addToast('Template deleted', 'warning');
  editingTemplateId = null; editingTemplateNew = false;
  renderPage();
}


// ════════════════════════════════════════════════════════════════════════════
// RICH-TEXT EDITOR HELPERS (Brief 6 Phase 2 + Phase 3)
// ════════════════════════════════════════════════════════════════════════════
//
// Generic helpers for any contenteditable element with a formatting toolbar.
// Used by the email composer body (`#ec_body`) and the per-state signature
// editors in Profile (`#sig_default`, `#sig_VIC`, `#sig_NSW`, …). Each helper
// takes an editorId so a single toolbar pattern works across N editors on
// the same page.
//
// State binding: each editor wires its own `oninput=` handler to whatever
// it needs to track (composer pushes innerHTML to state.emailComposeData.body;
// signature editors save on button click, no per-keystroke binding). The
// helpers dispatch a synthetic `input` event after every execCommand so
// the editor's oninput fires reliably even on browsers where execCommand
// silently doesn't (Safari + insertImage).
//
// document.execCommand is technically deprecated but every browser still
// supports it and the spec replacement (Selection / Range API) is roughly
// 20× the code for the same outcome. When the alternative ships and is
// well-supported, swap. TODO: track replacement progress.

// Composer-specific input sync. Wired to the composer's `oninput=` so
// keystrokes flush to state.emailComposeData.body. Signature editors don't
// use this — they save explicitly via their save button.
function _ecOnInput() {
  var el = document.getElementById('ec_body');
  if (!el) return;
  var st = getState();
  if (!st.emailComposeData) return;
  st.emailComposeData.body = el.innerHTML;
}


// ── Template list ─────────────────────────────────────────────────────────────
function renderEmailTemplateList() {
  var all = getAllTemplates();
  var cats = ['all','Sales','Scheduling','Post-Sale','Finance','Marketing','Custom'];
  var filtered = emailTemplateTab==='all' ? all : all.filter(function(t){return t.category.toLowerCase()===emailTemplateTab.toLowerCase();});
  return `
    <div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;background:#fff;display:flex;justify-content:space-between;align-items:center">
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${cats.map(c=>`<button data-action="email-templates-set-tab" data-category="${c.toLowerCase()}" style="padding:4px 10px;border-radius:20px;border:1px solid ${emailTemplateTab===c.toLowerCase()?'#c41230':'#e5e7eb'};background:${emailTemplateTab===c.toLowerCase()?'#fff5f6':'#fff'};color:${emailTemplateTab===c.toLowerCase()?'#c41230':'#6b7280'};font-size:11px;font-weight:600;cursor:pointer;font-family:inherit">${c}</button>`).join('')}
      </div>
      <button data-action="email-templates-open-editor-new" class="btn-r" style="font-size:11px;padding:4px 12px;gap:4px">${Icon({n:'plus',size:12})} New Template</button>
    </div>
    ${filtered.map(t=>{
      var isSelected = getState().emailSelectedId===t.id;
      return `<div data-action="email-templates-select-template" data-template-id="${t.id}"
        style="padding:14px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:${isSelected?'#fff5f6':'#fff'};border-left:3px solid ${isSelected?'#c41230':'transparent'}"
        onmouseover="this.style.background='${isSelected?'#fff5f6':'#f9fafb'}'" onmouseout="this.style.background='${isSelected?'#fff5f6':'#fff'}'">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:3px">${_escHtml(t.name)}</div>
          ${t.custom?'<span style="font-size:9px;padding:1px 6px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">Custom</span>':''}
        </div>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:6px">${_escHtml(t.subject.slice(0,55))}\u2026</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f3f4f6;color:#6b7280;font-weight:600">${_escHtml(t.category)}</span>
          ${t.sent>0?`<span style="font-size:11px;color:#9ca3af">Sent ${t.sent}\u00d7</span><span style="font-size:11px;color:#15803d">\ud83d\udcec ${Math.round(t.opens/Math.max(t.sent,1)*100)}% open</span>`:''}
        </div>
      </div>`;
    }).join('')}`;
}


// ── Template detail ───────────────────────────────────────────────────────────
function renderEmailTemplateDetail(tmpl) {
  if (!tmpl) {
    // Check if we're editing
    if (editingTemplateNew || editingTemplateId) return renderTemplateEditor();
    return renderEmailEmpty();
  }
  if (editingTemplateNew || editingTemplateId) return renderTemplateEditor();

  var sentCount = Math.max(tmpl.sent||0, 1);
  return `
  <div style="padding:24px;max-width:700px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div>
        <h2 style="font-size:18px;font-weight:700;margin:0 0 4px;font-family:Syne,sans-serif">${_escHtml(tmpl.name)}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#f3f4f6;color:#6b7280;font-weight:600">${_escHtml(tmpl.category)}</span>
          ${(tmpl.tags||[]).map(t=>`<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#e0e7ff;color:#4338ca">${_escHtml(t)}</span>`).join('')}
          ${tmpl.custom?'<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">Custom</span>':''}
        </div>
      </div>
      <div style="display:flex;gap:6px">
        <button data-action="email-templates-use-template" data-template-id="${tmpl.id}" class="btn-r" style="font-size:13px;gap:6px">
          ${Icon({n:'edit',size:14})} Use Template
        </button>
        ${tmpl.custom?`<button data-action="email-templates-open-editor-edit" data-template-id="${tmpl.id}" class="btn-w" style="font-size:12px">Edit</button><button data-action="email-templates-delete-template" data-template-id="${tmpl.id}" class="btn-w" style="font-size:12px;color:#b91c1c">Delete</button>`:''}
      </div>
    </div>

    <!-- Stats -->
    ${tmpl.sent>0?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${[['Sent',tmpl.sent,'#374151'],['Open rate',Math.round((tmpl.opens||0)/sentCount*100)+'%','#15803d'],['Click rate',Math.round((tmpl.clicks||0)/sentCount*100)+'%','#0369a1']].map(([l,v,col])=>`
        <div style="padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;text-align:center">
          <div style="font-size:22px;font-weight:800;color:${col};font-family:Syne,sans-serif">${v}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">${l}</div>
        </div>`).join('')}
    </div>`:''}

    <!-- Subject -->
    <div style="margin-bottom:16px;padding:12px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
      <div style="font-size:11px;color:#0369a1;font-weight:700;margin-bottom:3px;text-transform:uppercase;letter-spacing:.06em">Subject</div>
      <div style="font-size:14px;color:#1a1a1a">${_escHtml(tmpl.subject)}</div>
    </div>

    <!-- Body preview (escaped — template bodies may contain user-entered HTML) -->
    <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:12px;padding:20px 24px;font-size:14px;line-height:1.8;color:#374151;white-space:pre-wrap;font-family:'DM Sans',sans-serif">${_escHtml(tmpl.body||'')}</div>

    <!-- Merge fields legend -->
    <div style="margin-top:16px;padding:12px 16px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px">
      <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px">Available Merge Fields — auto-fill from contact/deal data</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        ${MERGE_FIELDS.map(f=>`<code style="font-size:11px;background:#fff;padding:2px 7px;border-radius:4px;border:1px solid #fde68a;color:#92400e" title="${f.label}: ${f.example}">{{${f.key}}}</code>`).join('')}
      </div>
    </div>
  </div>`;
}


function renderTemplateEditor() {
  var isNew = editingTemplateNew;
  var tmpl = isNew ? {name:'',subject:'',body:'',category:'Custom'} : getCustomTemplates().find(function(t){return t.id===editingTemplateId;}) || {name:'',subject:'',body:'',category:'Custom'};
  return `<div style="padding:24px;max-width:700px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:18px;font-weight:700;margin:0;font-family:Syne,sans-serif">${isNew?'Create Template':'Edit Template'}</h2>
      <button data-action="email-templates-close-editor" class="btn-w" style="font-size:12px">Cancel</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px">
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Template Name *</label>
          <input class="inp" id="tpl_name" value="${_escHtml(tmpl.name)}" placeholder="e.g. Quote Follow-Up"></div>
        <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Category</label>
          <select class="sel" id="tpl_category">${['Sales','Scheduling','Post-Sale','Finance','Marketing','Custom'].map(function(c){return '<option'+(tmpl.category===c?' selected':'')+'>'+c+'</option>';}).join('')}</select></div>
      </div>
      <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Subject Line *</label>
        <input class="inp" id="tpl_subject" value="${_escHtml(tmpl.subject)}" placeholder="Following up on your quote \u2014 {{dealTitle}}"></div>
      <div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Body</label>
        <textarea class="inp" id="tpl_body" rows="12" style="resize:vertical;font-family:inherit;line-height:1.8" placeholder="Hi {{firstName}},\n\nYour email content here...\n\nKind regards,\n{{ownerName}}">${_escHtml(tmpl.body)}</textarea></div>
      <div style="padding:12px 16px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px">
        <div style="font-size:11px;font-weight:700;color:#92400e;margin-bottom:6px">Available Merge Fields \u2014 click to copy</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${MERGE_FIELDS.map(function(f){return '<code style="font-size:11px;background:#fff;padding:2px 7px;border-radius:4px;border:1px solid #fde68a;color:#92400e;cursor:default" title="'+f.label+': e.g. '+f.example+'">{{'+f.key+'}}</code>';}).join('')}
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button data-action="email-templates-close-editor" class="btn-w">Cancel</button>
        <button data-action="email-templates-save-template" class="btn-r">${isNew?'Create Template':'Save Changes'}</button>
      </div>
    </div>
  </div>`;
}


// Resolve a token expression with optional fallback chain. Examples:
//   {{firstName}}                     → context.firstName
//   {{dealTitle|fullName}}            → dealTitle if set, else fullName
//   {{dealTitle|fullName|suburb}}     → first non-empty of the three
//   {{ dealTitle | fullName }}        → whitespace around | is tolerated
// If every key in the chain resolves to empty/undefined, return the ⚠️
// missing-placeholder using the FIRST key's humanised name.
function emailFillTemplate(template, context) {
  function _humanise(key) {
    return String(key).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }
  function _resolve(expr) {
    var keys = expr.split('|').map(function(s){ return s.trim(); }).filter(Boolean);
    for (var i = 0; i < keys.length; i++) {
      var v = context[keys[i]];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }
    return '⚠️ [' + _humanise(keys[0] || expr) + ' — missing]';
  }
  // Allow letters, digits, underscores, pipe, and whitespace inside {{...}}.
  var tokenRegex = /\{\{([a-zA-Z0-9_|\s]+)\}\}/g;
  var body    = String(template.body    || '').replace(tokenRegex, function(_, expr){ return _resolve(expr); });
  var subject = String(template.subject || '').replace(tokenRegex, function(_, expr){ return _resolve(expr); });
  return { body: body, subject: subject };
}


// Convert a custom-field label into a camelCase merge key.
// "Property Type"           → "propertyType"
// "How Did You Hear About Us?" → "howDidYouHearAboutUs"
function _fieldLabelToMergeKey(label) {
  if (!label) return '';
  var cleaned = String(label).replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  var parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts.map(function(w, i) {
    var lower = w.toLowerCase();
    return i === 0 ? lower : (lower.charAt(0).toUpperCase() + lower.slice(1));
  }).join('');
}


// Given an entity, return the custom-field merge keys available for it,
// INCLUDING fields from the originating lead (for deals converted from leads).
// Used by the inline template picker's "Insert field…" dropdown.
// Deal values take precedence over lead values when labels collide.
function getEntityCustomMergeFields(entityId, entityType) {
  var s = getState();
  var out = [];
  var seen = {};
  function push(group, field, value) {
    var key = _fieldLabelToMergeKey(field.label);
    if (!key || seen[key]) return;
    seen[key] = true;
    out.push({ key: key, label: field.label, value: value, group: group });
  }
  if (entityType === 'deal') {
    var deal = s.deals.find(function(d){ return d.id === entityId; });
    var dfv = (s.dealFieldValues||{})[entityId] || {};
    (s.dealFields||[]).forEach(function(f){ push('Deal custom fields', f, dfv[f.id]); });
    if (deal) {
      // Trace back to the lead that was converted into this deal — expose its
      // web-enquiry custom fields under the same keys, losing ties to the deal.
      var origLead = s.leads.find(function(l){ return l.dealRef === deal.id; });
      if (origLead) {
        var lfv = (s.leadFieldValues||{})[origLead.id] || {};
        (s.leadFields||[]).forEach(function(f){ push('From web enquiry', f, lfv[f.id]); });
      }
    }
  } else if (entityType === 'lead') {
    var lfv2 = (s.leadFieldValues||{})[entityId] || {};
    (s.leadFields||[]).forEach(function(f){ push('Lead custom fields', f, lfv2[f.id]); });
  } else if (entityType === 'contact') {
    var cfv = (s.contactFieldValues||{})[entityId] || {};
    (s.contactFields||[]).forEach(function(f){ push('Contact custom fields', f, cfv[f.id]); });
  }
  return out;
}


function buildMergeContext(entityId, entityType) {
  var s = getState();
  var cu = getCurrentUser() || {name:'Admin',email:'',phone:''};
  var todayStr = new Date().toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
  var nowStr = new Date().toLocaleTimeString('en-AU',{hour:'2-digit',minute:'2-digit',hour12:true});
  var ctx = {
    ownerName: s.gmailUser ? s.gmailUser.name : cu.name,
    ownerEmail: s.gmailUser ? s.gmailUser.email : cu.email || '',
    ownerPhone: cu.phone || '',
    // {{date}} / {{time}} historically mean "today/now" in existing templates.
    // Keep that semantics for back-compat; templates that want the appointment
    // date should use {{appointmentDate}} / {{appointmentTime}} instead.
    today: todayStr,
    now: nowStr,
    date: todayStr,
    time: nowStr,
  };
  var contact = null;
  var deal = null;
  var lead = null;
  if (entityType === 'deal') {
    deal = s.deals.find(function(d){ return d.id === entityId; });
    if (deal) { ctx.dealTitle = deal.title; ctx.dealValue = fmt$(deal.val); ctx.suburb = deal.suburb || ''; ctx.branch = deal.branch || ''; contact = s.contacts.find(function(c){ return c.id === deal.cid; }); }
  } else if (entityType === 'lead') {
    lead = s.leads.find(function(l){ return l.id === entityId; });
    if (lead) { ctx.firstName = lead.fn; ctx.lastName = lead.ln; ctx.fullName = lead.fn + ' ' + lead.ln; ctx.email = lead.email; ctx.phone = lead.phone; ctx.suburb = lead.suburb || ''; ctx.branch = lead.branch || ''; ctx.dealValue = fmt$(lead.val); }
  } else if (entityType === 'contact') {
    contact = s.contacts.find(function(c){ return c.id === entityId; });
  }
  if (contact) { ctx.firstName = contact.fn; ctx.lastName = contact.ln; ctx.fullName = contact.fn + ' ' + contact.ln; ctx.email = contact.email; ctx.phone = contact.phone; ctx.company = contact.co || ''; ctx.suburb = contact.suburb || ''; ctx.address = [contact.street,contact.suburb,contact.state,contact.postcode].filter(Boolean).join(', '); ctx.branch = contact.branch || ''; }

  // ── Job lookup ────────────────────────────────────────────────────────────
  // A deal gets jobNumber via its jobRef; a lead with a converted deal can
  // trace forward the same way. {{address}} on jobs is often more precise
  // than the contact's address, so prefer the job's if present.
  var job = null;
  if (deal && deal.jobRef) {
    job = (s.jobs || []).find(function(j){ return j.jobNumber === deal.jobRef; });
  }
  if (!job && lead && lead.dealRef) {
    var leadDeal = s.deals.find(function(d){ return d.id === lead.dealRef; });
    if (leadDeal && leadDeal.jobRef) {
      job = (s.jobs || []).find(function(j){ return j.jobNumber === leadDeal.jobRef; });
    }
  }
  if (job) {
    ctx.jobNumber = job.jobNumber || job.id;
    var jAddr = [job.street, job.suburb, job.state, job.postcode].filter(Boolean).join(', ');
    if (jAddr) ctx.address = jAddr;
  }

  // ── Appointment lookup ────────────────────────────────────────────────────
  // MOCK_APPOINTMENTS keys off the client name string "Fn Ln". Match against
  // the resolved contact/lead name. Pick the earliest upcoming appointment
  // (or the most recent if no future ones).
  var apts = (typeof MOCK_APPOINTMENTS !== 'undefined' && Array.isArray(MOCK_APPOINTMENTS)) ? MOCK_APPOINTMENTS : [];
  var clientName = ctx.fullName || (contact ? (contact.fn + ' ' + contact.ln) : '') || (lead ? (lead.fn + ' ' + lead.ln) : '');
  if (clientName) {
    var lcName = clientName.trim().toLowerCase();
    var matched = apts.filter(function(a){ return (a.client || '').trim().toLowerCase() === lcName; });
    if (matched.length > 0) {
      var todayISO = new Date().toISOString().slice(0,10);
      var upcoming = matched.filter(function(a){ return a.date && a.date >= todayISO; });
      var pick = (upcoming.length > 0)
        ? upcoming.sort(function(a,b){ return (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')); })[0]
        : matched.sort(function(a,b){ return (b.date + (b.time||'')).localeCompare(a.date + (a.time||'')); })[0];
      if (pick) {
        // Render as en-AU long-form for visual consistency with {{today}}.
        try {
          ctx.appointmentDate = new Date(pick.date + 'T12:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
        } catch(e) { ctx.appointmentDate = pick.date; }
        ctx.appointmentTime = pick.time || '';
      }
    }
  }

  // ── Invoice lookup ────────────────────────────────────────────────────────
  // Prefer newest unpaid (status sent/overdue). Fall back to newest of any
  // status if none outstanding.
  var invoices = s.invoices || [];
  var relatedInvs = invoices.filter(function(i) {
    if (deal && i.dealId === deal.id) return true;
    if (job  && i.jobId  === job.id)  return true;
    if (job  && i.jobNumber && i.jobNumber === job.jobNumber) return true;
    return false;
  });
  if (relatedInvs.length > 0) {
    var unpaid = relatedInvs.filter(function(i){ return i.status === 'sent' || i.status === 'overdue'; });
    var pickInv = (unpaid.length > 0 ? unpaid : relatedInvs).sort(function(a,b){
      return (b.date || '').localeCompare(a.date || '');
    })[0];
    if (pickInv) {
      ctx.invoiceNumber = pickInv.invoiceNumber || pickInv.id || '';
      if (typeof pickInv.total === 'number') ctx.invoiceAmount = fmt$(pickInv.total);
      if (pickInv.dueDate) {
        try {
          ctx.invoiceDueDate = new Date(pickInv.dueDate + 'T12:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'});
        } catch(e) { ctx.invoiceDueDate = pickInv.dueDate; }
      }
    }
  }

  // Fold in custom-field values last so they're available as tokens like
  // {{propertyType}}, {{timeframe}}, {{numberOfWindows}}. getEntityCustomMergeFields
  // already handles the deal→lead trace-back and precedence.
  var cfs = getEntityCustomMergeFields(entityId, entityType);
  cfs.forEach(function(cf) {
    if (cf.value !== undefined && cf.value !== null && cf.value !== '' && ctx[cf.key] === undefined) {
      ctx[cf.key] = String(cf.value);
    }
  });
  return ctx;
}
