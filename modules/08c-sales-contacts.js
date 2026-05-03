// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08c-sales-contacts.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Contacts list, panel, detail, edit, create.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
defineAction('contacts-open-new', function(target, ev) {
  openNewContactModal();
});
defineAction('contacts-search-input', function(target, ev) {
  cSearch=target.value;renderPage();
});
defineAction('contacts-filter-branch', function(target, ev) {
  cBranch=target.value;renderPage();
});
defineAction('contacts-filter-type', function(target, ev) {
  cType=target.value;renderPage();
});
defineAction('contacts-view-detail', function(target, ev) {
  setState({contactDetailId:target.dataset.contactId,page:'contacts'});
});
defineAction('contacts-close-panel', function(target, ev) {
  if(ev.target===target)setState({panel:null});
});
defineAction('contacts-close-modal', function(target, ev) {
  if(ev.target===target)setState({modal:null});
});
defineAction('contacts-close-modal-btn', function(target, ev) {
  setState({modal:null});
});
defineAction('contacts-close-edit-modal', function(target, ev) {
  if(ev.target===target)setState({editingContactId:null});
});
defineAction('contacts-close-edit-btn', function(target, ev) {
  setState({editingContactId:null});
});
defineAction('contacts-new-cancel', function(target, ev) {
  setState({modal:null});
});
defineAction('contacts-new-create', function(target, ev) {
  saveNewContact();
});
defineAction('contacts-edit-cancel', function(target, ev) {
  setState({editingContactId:null});
});
defineAction('contacts-edit-save', function(target, ev) {
  saveContactEdit();
});
defineAction('contacts-call', function(target, ev) {
  twilioCall(target.dataset.phone,target.dataset.contactId,'contact');
});
defineAction('contacts-send-email', function(target, ev) {
  detailTab='email';renderPage();
});
defineAction('contacts-new-deal', function(target, ev) {
  setState({page:'deals',contactDetailId:null});
});
defineAction('contacts-view-deal', function(target, ev) {
  setState({dealDetailId:target.dataset.dealId,contactDetailId:null});
});
defineAction('contacts-view-lead', function(target, ev) {
  setState({leadDetailId:target.dataset.leadId,contactDetailId:null});
});
defineAction('contacts-edit-drawer', function(target, ev) {
  openContactEditDrawer(target.dataset.contactId);
});
defineAction('contacts-delete', function(target, ev) {
  deleteContact(target.dataset.contactId);
});

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
      <button class="btn-r" data-action="contacts-open-new">
        ${Icon({ n: 'plus', size: 15 })} New Contact
      </button>
    </div>
    <div class="card" style="padding:12px;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <div style="position:relative;flex:1;min-width:200px">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#9ca3af;pointer-events:none">${Icon({ n: 'search', size: 13 })}</span>
        <input id="contactSearchInput" class="inp" value="${cSearch}" placeholder="Search name, email, phone…" style="padding-left:32px;font-size:12px;padding-top:7px;padding-bottom:7px" data-on-input="contacts-search-input">
      </div>
      <select class="sel" style="width:150px;font-size:12px" data-on-change="contacts-filter-branch">
        <option value="all" ${cBranch === 'all' ? 'selected' : ''}>All Branches</option>
        ${['VIC', 'ACT', 'SA'].map(b => `<option ${cBranch === b ? 'selected' : ''}>${b}</option>`).join('')}
      </select>
      <select class="sel" style="width:150px;font-size:12px" data-on-change="contacts-filter-type">
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
            <tr style="cursor:pointer" data-action="contacts-view-detail" data-contact-id="${c.id}" style="cursor:pointer">
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

function renderContactPanel(c) {
  return `<div class="ovl" data-action="contacts-close-panel">
    <div class="panel" style="width:480px">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:start">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <div style="width:40px;height:40px;background:#c41230;border-radius:50%;color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center">${avatar(c.fn + ' ' + c.ln)}</div>
            <div><div style="font-family:Syne,sans-serif;font-weight:700;font-size:16px">${c.fn} ${c.ln}</div>${c.co ? `<div style="font-size:12px;color:#6b7280">${c.co}</div>` : ''}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${Badge(c.type, c.type === 'commercial' ? 'purple' : 'blue')} ${Badge(c.branch, 'gray')} ${c.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        </div>
        <button data-action="contacts-close-panel" style="background:none;border:none;cursor:pointer;padding:6px;border-radius:8px;color:#9ca3af" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">${Icon({ n: 'x', size: 16 })}</button>
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
  return `<div class="modal-bg" data-action="contacts-close-modal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">New Contact</h3>
        <button data-action="contacts-close-modal-btn" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
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
        <button class="btn-w" data-action="contacts-new-cancel">Cancel</button>
        <button class="btn-r" data-action="contacts-new-create">Create Contact</button>
      </div>
    </div>
  </div>`;
}

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
  return `<div class="modal-bg" data-action="contacts-close-edit-modal">
    <div class="modal">
      <div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0;font-size:16px;font-weight:700">Edit Contact</h3>
        <button data-action="contacts-close-edit-btn" style="background:none;border:none;cursor:pointer;color:#9ca3af">${Icon({ n: 'x', size: 16 })}</button>
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
        <button class="btn-w" data-action="contacts-edit-cancel">Cancel</button>
        <button class="btn-r" data-action="contacts-edit-save">Save Changes</button>
      </div>
    </div>
  </div>`;
}

function deleteContact(id) {
  var c = getState().contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  if (!confirm('Delete ' + c.fn + ' ' + c.ln + '? This cannot be undone.')) return;
  setState({ contacts: getState().contacts.filter(function(x) { return x.id !== id; }), contactDetailId: null });
  if (typeof dbDelete === 'function') { try { dbDelete('contacts', id); } catch(e) {} }
  addToast('Contact deleted', 'warning');
  renderPage();
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

function saveNewContact() {
  const fn = document.getElementById('nc_fn').value.trim();
  const ln = document.getElementById('nc_ln').value.trim();
  if (!fn || !ln) { addToast('First and last name are required', 'error'); return; }
  const nc = { id: 'c' + Date.now(), fn, ln, co: document.getElementById('nc_co').value.trim(), email: document.getElementById('nc_email').value, phone: document.getElementById('nc_phone').value, street: document.getElementById('nc_street').value.trim(), suburb: document.getElementById('nc_suburb').value.trim(), state: document.getElementById('nc_state').value, postcode: document.getElementById('nc_postcode').value.trim(), type: document.getElementById('nc_type').value, source: document.getElementById('nc_source').value, branch: document.getElementById('nc_branch').value, rep: (getCurrentUser() || { name: 'Admin' }).name, tags: ['new'] };
  setState({ contacts: [nc, ...getState().contacts], modal: null });
  dbInsert('contacts', contactToDb(nc));
  addToast(`${fn} ${ln} created`, 'success');
}

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
        ${c.phone ? `<a href="javascript:void(0)" data-action="contacts-call" data-phone="${c.phone}" data-contact-id="${c.id}" style="font-size:13px;color:#374151;text-decoration:none;display:flex;align-items:center;gap:8px;cursor:pointer">${Icon({ n: 'phone2', size: 14 })} <span>${c.phone}</span></a>` : `<div style="font-size:13px;color:#9ca3af;display:flex;align-items:center;gap:8px">${Icon({ n: 'phone2', size: 14 })} <span>—</span></div>`}
        <div style="font-size:13px;color:#6b7280;display:flex;align-items:center;gap:8px">${Icon({ n: 'pin', size: 14 })} ${[c.street, c.suburb, c.state, c.postcode].filter(Boolean).join(', ') || 'No address'}</div>
      </div>
    </div>

    <!-- Organisation -->
    <div style="padding:16px;border-bottom:1px solid #f0f0f0">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Organisation</div>
      ${c.co ? `
      <button data-action="contacts-send-email" class="btn-r" style="font-size:12px;padding:6px 12px;margin-top:8px;width:100%;justify-content:center;gap:5px">${Icon({ n: 'send', size: 12 })} Send Email</button><div style="font-size:13px;font-weight:500;color:#374151">${c.co}</div>` : `<div style="font-size:12px;color:#3b82f6;cursor:pointer">+ Link an organisation</div>`}
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
        <button data-action="contacts-new-deal" class="btn-g" style="font-size:11px;padding:3px 8px">+ New deal</button>
      </div>
      ${cDeals.length === 0 ? `<div style="font-size:12px;color:#9ca3af">No deals yet</div>` : ''}
      ${cDeals.map(d => `<div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:6px;cursor:pointer" data-action="contacts-view-deal" data-deal-id="${d.id}">
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
      ${cLeads.map(l => `<div style="padding:8px;background:#f9fafb;border-radius:8px;margin-bottom:6px;cursor:pointer" data-action="contacts-view-lead" data-lead-id="${l.id}">
        <div style="font-size:13px;font-weight:600">${l.fn} ${l.ln}</div>
        <div style="font-size:12px;color:#9ca3af">${l.source} · ${fmt$(l.val)}</div>
      </div>`).join('')}
    </div>`: ''}
  `;

  return renderEntityDetail({
    entityType: 'contact', entityId: c.id,
    title: c.fn + ' ' + c.ln, owner: c.rep,
    stageBarHtml: null,
    wonLostHtml: (canEditContact(c) ? `<button data-action="contacts-edit-drawer" data-contact-id="${c.id}" class="btn-w" style="font-size:12px;padding:6px 14px;margin-right:6px">${Icon({ n: 'edit', size: 12 })} Edit</button>` : '') + `<button data-action="contacts-delete" data-contact-id="${c.id}" style="font-size:12px;padding:6px 14px;margin-right:6px;background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:500">Delete</button>` + `<button data-action="contacts-new-deal" class="btn-r" style="font-size:12px;padding:6px 14px">+ Deal</button>`,
    leftSidebarHtml: leftSidebar,
    backOnclick: "setState({contactDetailId:null})",
    backLabel: "Contacts",
    activities,
    contact: c,
  });
}
