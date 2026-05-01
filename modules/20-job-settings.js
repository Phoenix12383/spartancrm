// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 20-job-settings.js
// Extracted from original index.html lines 13914-14202
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// JOB CRM SETTINGS — Separate from Sales CRM settings
// ══════════════════════════════════════════════════════════════════════════════
var jobSettTab = 'installers';
var jsNewField = {label:'',type:'text',options:[],required:false,newOpt:''};
var jsAddingField = false;
var jsEditFieldId = null;
var editingVehicleId = null;
var editingToolId = null;
// Availability-exception modal state. When set, the new-exception modal
// renders over the installer edit form. Captures installerId and (for edits)
// the existing entry id so the same modal handles add + edit later.
var _availModalForInstallerId = null;
var _availModalEditId = null;

function openAvailModal(installerId, editId) {
  _availModalForInstallerId = installerId;
  _availModalEditId = editId || null;
  renderPage();
}
function closeAvailModal() {
  _availModalForInstallerId = null;
  _availModalEditId = null;
  renderPage();
}
function saveAvailModal() {
  var d = document.getElementById('avx_date');
  var t = document.getElementById('avx_type');
  var r = document.getElementById('avx_reason');
  if (!d || !t) return;
  var dateVal = d.value;
  if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    addToast('Pick a valid date', 'error');
    return;
  }
  var entry = { installerId: _availModalForInstallerId, date: dateVal, type: t.value, reason: (r && r.value) ? r.value.trim() : '' };
  if (typeof addAvailabilityEntry === 'function') addAvailabilityEntry(entry);
  closeAvailModal();
}
window.openAvailModal = openAvailModal;
window.closeAvailModal = closeAvailModal;
window.saveAvailModal = saveAvailModal;

function renderAvailExceptionModal() {
  if (!_availModalForInstallerId) return '';
  var inst = (typeof getInstallers === 'function') ? getInstallers().find(function(i){return i.id===_availModalForInstallerId;}) : null;
  var instName = inst ? inst.name : 'Installer';
  var today = new Date().toISOString().slice(0,10);
  return '<div class="modal-bg" onclick="if(event.target===this)closeAvailModal()">'
    +'<div class="modal" style="max-width:440px">'
    +'<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +'<div><h3 style="margin:0;font-size:15px;font-weight:700">📅 Add Availability Exception</h3>'
    +'<div style="font-size:11px;color:#6b7280;margin-top:2px">'+instName+'</div></div>'
    +'<button onclick="closeAvailModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;line-height:1">×</button>'
    +'</div>'
    +'<div class="modal-body" style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Date *</label>'
    +'<input type="date" class="inp" id="avx_date" value="'+today+'" style="font-size:13px;padding:8px;width:100%"></div>'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Type *</label>'
    +'<select class="sel" id="avx_type" style="font-size:13px;padding:8px;width:100%">'
    +'<option value="leave">Leave (full day off)</option>'
    +'<option value="unavailable">Unavailable (full day)</option>'
    +'<option value="half_day_am">Half Day (AM only off)</option>'
    +'<option value="half_day_pm">Half Day (PM only off)</option>'
    +'</select></div>'
    +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Reason <span style="color:#9ca3af;font-weight:400">(optional)</span></label>'
    +'<input type="text" class="inp" id="avx_reason" placeholder="e.g. Annual leave, Sick day, Personal" style="font-size:13px;padding:8px;width:100%"></div>'
    +'<div style="font-size:11px;color:#9ca3af;background:#f9fafb;padding:8px 10px;border-radius:6px">ℹ️ This day will be subtracted from the installer\'s capacity in the Capacity Planner.</div>'
    +'</div>'
    +'<div style="padding:14px 22px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px">'
    +'<button onclick="closeAvailModal()" class="btn-w" style="font-size:13px">Cancel</button>'
    +'<button onclick="saveAvailModal()" class="btn-r" style="font-size:13px">Save Exception</button>'
    +'</div></div></div>';
}
window.renderAvailExceptionModal = renderAvailExceptionModal;

// Add/edit-tool-to-installer modal. Picks from the global tool registry so the
// installer's owned-tool ID matches what jobs reference in toolRequirements.
// Free-text adds via prompt() created random t<timestamp> IDs that getJobToolCoverage
// could never match — every coverage check showed the tool as missing.
//
// _addInstToolEditId: when set, modal is in edit mode for that tool entry;
// the tool dropdown is locked (changing the tool ID would orphan history).
var _addInstToolForId = null;
var _addInstToolEditId = null;

function openAddInstToolModal(installerId, toolEntryId) {
  _addInstToolForId = installerId;
  _addInstToolEditId = toolEntryId || null;
  renderPage();
}
function closeAddInstToolModal() {
  _addInstToolForId = null;
  _addInstToolEditId = null;
  renderPage();
}
function saveAddInstToolModal() {
  var sel = document.getElementById('aitm_tool');
  var serialEl = document.getElementById('aitm_serial');
  var condEl = document.getElementById('aitm_cond');
  var notesEl = document.getElementById('aitm_notes');
  var inst = getInstallers().find(function(i){ return i.id === _addInstToolForId; });
  if (!inst) { addToast('Installer not found', 'error'); _addInstToolForId = null; _addInstToolEditId = null; renderPage(); return; }
  var existing = inst.tools || [];
  if (_addInstToolEditId) {
    // Edit existing — keep the registry id locked, update metadata only.
    var updated = existing.map(function(t){
      if (t.id !== _addInstToolEditId) return t;
      return Object.assign({}, t, {
        serialNumber: (serialEl && serialEl.value) ? serialEl.value.trim() : '',
        condition: (condEl && condEl.value) ? condEl.value : (t.condition || 'good'),
        notes: (notesEl && notesEl.value) ? notesEl.value.trim() : '',
      });
    });
    updateInstaller(_addInstToolForId, { tools: updated });
    addToast('Tool details updated', 'success');
  } else {
    if (!sel || !sel.value) { addToast('Pick a tool', 'error'); return; }
    var registry = (typeof getTools === 'function') ? getTools() : [];
    var picked = registry.find(function(t){ return t.id === sel.value; });
    if (!picked) { addToast('Tool not found in registry', 'error'); return; }
    if (existing.some(function(t){ return t.id === picked.id; })) {
      addToast(picked.name + ' is already in this installer\'s kit', 'warning');
      return;
    }
    var entry = {
      id: picked.id,                       // ← registry ID, not random
      name: picked.name,
      category: picked.category || 'other',
      serialNumber: (serialEl && serialEl.value) ? serialEl.value.trim() : '',
      dateIssued: new Date().toISOString().slice(0,10),
      condition: (condEl && condEl.value) ? condEl.value : 'good',
      notes: (notesEl && notesEl.value) ? notesEl.value.trim() : '',
    };
    updateInstaller(_addInstToolForId, { tools: existing.concat([entry]) });
    addToast(picked.name + ' added to ' + (inst.name || 'installer'), 'success');
  }
  _addInstToolForId = null;
  _addInstToolEditId = null;
  renderPage();
}
window.openAddInstToolModal = openAddInstToolModal;
window.closeAddInstToolModal = closeAddInstToolModal;
window.saveAddInstToolModal = saveAddInstToolModal;

function renderAddInstToolModal() {
  if (!_addInstToolForId) return '';
  var inst = (typeof getInstallers === 'function') ? getInstallers().find(function(i){ return i.id === _addInstToolForId; }) : null;
  var instName = inst ? inst.name : 'Installer';
  var registry = (typeof getTools === 'function') ? getTools().filter(function(t){ return t.active !== false; }) : [];
  var ownedIds = {};
  (inst && inst.tools || []).forEach(function(t){ if (t && t.id) ownedIds[t.id] = true; });
  var TCATS = {lifting:'Lifting',access:'Access',sealing:'Sealing',fastening:'Fastening',measuring:'Measuring',other:'Other',power_tool:'Power Tool',access_equipment:'Access Equipment',lifting_gear:'Lifting Gear',licence:'Licence',consumable:'Consumable'};
  var isEdit = !!_addInstToolEditId;
  var editingEntry = isEdit ? (inst && inst.tools || []).find(function(t){ return t.id === _addInstToolEditId; }) : null;
  if (isEdit && !editingEntry) { _addInstToolEditId = null; isEdit = false; } // entry vanished
  var available = registry.filter(function(t){ return !ownedIds[t.id]; });
  var optsHtml = '<option value="">— Pick a tool —</option>'
    + available.map(function(t){ return '<option value="'+t.id+'">'+t.name+' ('+(TCATS[t.category]||t.category||'?')+')</option>'; }).join('');
  var title = isEdit ? '✏️ Edit Tool' : '🛠️ Add Tool to Installer';
  var ctaLabel = isEdit ? 'Save Changes' : 'Add Tool';
  var serialVal = (editingEntry && editingEntry.serialNumber) || '';
  var condVal = (editingEntry && editingEntry.condition) || 'good';
  var notesVal = (editingEntry && editingEntry.notes) || '';
  // Whether to show form fields. Add mode needs available > 0; edit mode always allows.
  var showFields = isEdit || (registry.length > 0 && available.length > 0);

  return '<div class="modal-bg" onclick="if(event.target===this)closeAddInstToolModal()">'
    +'<div class="modal" style="max-width:480px">'
    +'<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +'<div><h3 style="margin:0;font-size:15px;font-weight:700">'+title+'</h3>'
    +'<div style="font-size:11px;color:#6b7280;margin-top:2px">'+instName+(isEdit && editingEntry?' · '+editingEntry.name:'')+'</div></div>'
    +'<button onclick="closeAddInstToolModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:18px;line-height:1">×</button>'
    +'</div>'
    +'<div class="modal-body" style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">'
    +(!isEdit && registry.length === 0
      ? '<div style="font-size:12px;color:#92400e;background:#fffbeb;padding:10px 12px;border-radius:6px">⚠ Tool registry is empty. Add tools in <strong>Settings → Tools</strong> first, then come back here to assign them to installers.</div>'
      : !isEdit && available.length === 0
        ? '<div style="font-size:12px;color:#15803d;background:#f0fdf4;padding:10px 12px;border-radius:6px">✅ This installer already owns every tool in the registry.</div>'
        : (
          (isEdit
            ? '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Tool</label>'
              +'<div style="font-size:13px;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;color:#374151;font-weight:600">'+(editingEntry.name||'')+' <span style="font-weight:400;color:#9ca3af;font-size:11px">('+(TCATS[editingEntry.category]||editingEntry.category||'?')+')</span></div></div>'
            : '<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Tool *</label>'
              +'<select class="sel" id="aitm_tool" style="font-size:13px;padding:8px;width:100%">'+optsHtml+'</select></div>'
          )
          +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
          +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Serial Number <span style="color:#9ca3af;font-weight:400">(optional)</span></label>'
          +'<input type="text" class="inp" id="aitm_serial" value="'+(serialVal.replace(/"/g,'&quot;'))+'" placeholder="e.g. SN-12345" style="font-size:13px;padding:8px;width:100%"></div>'
          +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Condition</label>'
          +'<select class="sel" id="aitm_cond" style="font-size:13px;padding:8px;width:100%">'
          +['good','fair','poor'].map(function(c){return '<option value="'+c+'"'+(condVal===c?' selected':'')+'>'+c.charAt(0).toUpperCase()+c.slice(1)+'</option>';}).join('')
          +'</select></div>'
          +'</div>'
          +'<div><label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px">Notes <span style="color:#9ca3af;font-weight:400">(optional)</span></label>'
          +'<textarea class="inp" id="aitm_notes" rows="2" placeholder="Wear, repairs, location, etc." style="font-size:12px;padding:8px;width:100%;resize:vertical">'+(notesVal.replace(/"/g,'&quot;').replace(/</g,'&lt;'))+'</textarea></div>'
          +(!isEdit ? '<div style="font-size:11px;color:#9ca3af;background:#f9fafb;padding:8px 10px;border-radius:6px">ℹ️ Picking from the registry links the tool by its global ID — required tools on jobs will count this installer as covering it.</div>' : '')
        )
    )
    +'</div>'
    +'<div style="padding:14px 22px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px">'
    +'<button onclick="closeAddInstToolModal()" class="btn-w" style="font-size:13px">Cancel</button>'
    +(showFields ? '<button onclick="saveAddInstToolModal()" class="btn-r" style="font-size:13px">'+ctaLabel+'</button>' : '')
    +'</div></div></div>';
}
window.renderAddInstToolModal = renderAddInstToolModal;

function renderJobSettings() {
  var TABS = [
    ['installers','Installers & Crew'],
    ['vehicles','Vehicles'],
    ['tools','Tools'],
    ['capacity','Capacity'],
    ['kpi','KPI Thresholds'],
    ['targets','Weekly Targets'],
    ['jobfields','Job Custom Fields'],
    ['jobnumbers','Job Numbers & Entities'],
    ['checkmeasure','Check Measure'],
    ['statuses','Job Statuses'],
  ];
  var content = '';

  // ── INSTALLERS ────────────────────────────────────────────────────────────
  if (jobSettTab === 'installers') {
    var instList = getInstallers();
    var instColours = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#f97316','#6366f1','#14b8a6'];
    var ROLES = {lead_installer:'Lead Installer',installer:'Installer',apprentice:'Apprentice',contractor:'Contractor',labourer:'Labourer'};
    var editInst = editingInstallerId ? instList.find(function(i){return i.id===editingInstallerId;}) : null;
    var isAdmin = ((getCurrentUser()||{role:''}).role === 'admin');

    // ── Add/Edit form ────────────────────────────────────────────────────────
    if ((editingInstallerId === '_new' || editInst) && isAdmin) {
      var v = editInst || {firstName:'',lastName:'',phone:'',email:'',street:'',suburb:'',state:'VIC',postcode:'',role:'installer',hourlyRate:45,overtimeRate:67.50,employmentType:'employee',abn:'',emergencyName:'',emergencyPhone:'',licenseNumber:'',startDate:new Date().toISOString().slice(0,10),branch:'VIC',colour:instColours[instList.length%instColours.length],maxHoursPerDay:8,loginEmail:'',loginPin:'',notes:'',tools:[],licenses:[]};
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<h4 style="font-size:15px;font-weight:700;margin:0">'+(editInst?'Edit Installer':'New Installer')+'</h4>'
        +'<button onclick="editingInstallerId=null;renderPage()" class="btn-g" style="font-size:12px">Cancel</button></div>';
      content += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'
        // Personal details
        +'<div class="card" style="padding:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:12px">Personal Details</div>'
        +'<div style="display:grid;gap:10px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">First Name *</label><input class="inp" id="inst_fn" value="'+(v.firstName||'')+'" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Last Name *</label><input class="inp" id="inst_ln" value="'+(v.lastName||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Phone</label><input class="inp" id="inst_ph" value="'+(v.phone||'')+'" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Email</label><input class="inp" id="inst_em" value="'+(v.email||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Street Address</label><input class="inp" id="inst_st" placeholder="Start typing address…" value="'+(v.street||'')+'" style="font-size:13px;padding:8px" autocomplete="off"></div>'
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Suburb</label><input class="inp" id="inst_sub" value="'+(v.suburb||'')+'" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">State</label><select class="sel" id="inst_state" style="font-size:13px;padding:8px">'+['VIC','ACT','SA','TAS','NSW','QLD'].map(function(s){return '<option value="'+s+'"'+(v.state===s?' selected':'')+'>'+s+'</option>';}).join('')+'</select></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Postcode</label><input class="inp" id="inst_pc" value="'+(v.postcode||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Emergency Contact</label><input class="inp" id="inst_ecn" value="'+(v.emergencyName||'')+'" placeholder="Name" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Emergency Phone</label><input class="inp" id="inst_ecp" value="'+(v.emergencyPhone||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'</div></div>'
        // Employment & rates
        +'<div class="card" style="padding:16px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:12px">Employment & Rates</div>'
        +'<div style="display:grid;gap:10px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Role</label><select class="sel" id="inst_role" style="font-size:13px;padding:8px">'+Object.entries(ROLES).map(function(e){return '<option value="'+e[0]+'"'+(v.role===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Employment Type</label><select class="sel" id="inst_etype" style="font-size:13px;padding:8px"><option value="employee"'+(v.employmentType==='employee'?' selected':'')+'>Employee</option><option value="contractor"'+(v.employmentType==='contractor'?' selected':'')+'>Contractor</option></select></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#c41230">Hourly Rate ($) *</label><input type="number" class="inp" id="inst_rate" value="'+(v.hourlyRate||45)+'" step="0.50" style="font-size:14px;padding:8px;font-weight:700"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280;white-space:nowrap">OT Rate ($)</label><input type="number" class="inp" id="inst_otrate" value="'+(v.overtimeRate||67.50)+'" step="0.50" style="font-size:14px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Max Hrs/Day</label><input type="number" class="inp" id="inst_maxh" value="'+(v.maxHoursPerDay||8)+'" style="font-size:14px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280" title="100% = average. New installers start ~80%. Faster workers exceed 100%.">Efficiency %</label><input type="number" class="inp" id="inst_eff" value="'+(editingInstallerId&&editingInstallerId!=='_new'&&typeof getInstallerEfficiency==='function'?getInstallerEfficiency(editingInstallerId):100)+'" min="50" max="150" style="font-size:14px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">Branch</label><select class="sel" id="inst_branch" style="font-size:13px;padding:8px">'+['VIC','ACT','SA','TAS'].map(function(b){return '<option value="'+b+'"'+(v.branch===b?' selected':'')+'>'+b+'</option>';}).join('')+'</select></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Start Date</label><input type="date" class="inp" id="inst_start" value="'+(v.startDate||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">ABN (contractors)</label><input class="inp" id="inst_abn" value="'+(v.abn||'')+'" placeholder="XX XXX XXX XXX" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">License Number</label><input class="inp" id="inst_lic" value="'+(v.licenseNumber||'')+'" style="font-size:13px;padding:8px"></div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label style="font-size:10px;font-weight:600;color:#6b7280">App Login Email</label><input class="inp" id="inst_login" value="'+(v.loginEmail||'')+'" placeholder="For tablet/mobile app" style="font-size:13px;padding:8px"></div><div><label style="font-size:10px;font-weight:600;color:#6b7280">Tablet PIN (4 digit)</label><input class="inp" id="inst_pin" value="'+(v.loginPin||'')+'" maxlength="4" placeholder="0000" style="font-size:13px;padding:8px;letter-spacing:4px;text-align:center"></div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Colour</label><div style="display:flex;gap:4px;margin-top:4px">'+instColours.map(function(c){return '<div onclick="document.getElementById(\'inst_col\').value=\''+c+'\';this.parentNode.querySelectorAll(\'div\').forEach(function(d){d.style.border=\'2px solid transparent\'});this.style.border=\'2px solid #111\'" style="width:26px;height:26px;border-radius:50%;background:'+c+';cursor:pointer;border:2px solid '+(v.colour===c?'#111':'transparent')+'"></div>';}).join('')+'<input type="hidden" id="inst_col" value="'+(v.colour||instColours[0])+'"></div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Notes</label><textarea class="inp" id="inst_notes" rows="2" style="font-size:12px;resize:vertical">'+(v.notes||'')+'</textarea></div>'
        +'</div></div></div>';

      // ── Tools & Equipment ───────────────────────────────────────────────────
      var tools = v.tools || [];
      content += '<div class="card" style="padding:16px;margin-top:14px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af">\ud83d\udee0\ufe0f Tools & Equipment <span style="font-weight:400">('+tools.length+')</span></div>'
        +'<button onclick="openAddInstToolModal(\''+editingInstallerId+'\')" class="btn-w" style="font-size:11px;padding:4px 10px">+ Add Tool</button></div>';
      if (tools.length === 0) {
        content += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No tools registered</div>';
      } else {
        content += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th" style="font-size:10px">Tool</th><th class="th" style="font-size:10px">Serial Number</th><th class="th" style="font-size:10px">Category</th><th class="th" style="font-size:10px">Issued</th><th class="th" style="font-size:10px">Condition</th><th class="th" style="font-size:10px"></th></tr></thead><tbody>';
        tools.forEach(function(t){
          var catLabels = {power_tool:'Power Tool',hand_tool:'Hand Tool',safety:'Safety',measuring:'Measuring',vehicle:'Vehicle',other:'Other'};
          var condCol = t.condition==='good'?'#22c55e':t.condition==='fair'?'#f59e0b':'#ef4444';
          content += '<tr><td class="td" style="font-weight:600">'+t.name+'</td>'
            +'<td class="td" style="font-family:monospace;font-size:11px;color:#374151;background:#f9fafb;letter-spacing:.5px">'+(t.serialNumber||'\u2014')+'</td>'
            +'<td class="td"><span class="bdg" style="font-size:9px">'+(catLabels[t.category]||t.category)+'</span></td>'
            +'<td class="td">'+(t.dateIssued||'')+'</td>'
            +'<td class="td"><span style="color:'+condCol+';font-weight:600;font-size:10px">\u25cf '+(t.condition||'good')+'</span></td>'
            +'<td class="td" style="white-space:nowrap;text-align:right">'
            +'<button onclick="openAddInstToolModal(\''+editingInstallerId+'\',\''+t.id+'\')" title="Edit" style="background:#f3f4f6;border:1px solid #e5e7eb;color:#374151;cursor:pointer;font-size:11px;padding:3px 8px;border-radius:4px;margin-right:4px">\u270f\ufe0f Edit</button>'
            +'<button onclick="if(confirm(\'Remove '+(t.name||'this tool').replace(/\'/g,"\\'")+' from this installer?\')){var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;inst.tools=(inst.tools||[]).filter(function(x){return x.id!==\''+t.id+'\'});updateInstaller(\''+editingInstallerId+'\',{tools:inst.tools});renderPage()}" title="Remove" style="background:#fef2f2;border:1px solid #fecaca;color:#dc2626;cursor:pointer;font-size:11px;padding:3px 8px;border-radius:4px;font-weight:600">\u2715 Remove</button>'
            +'</td></tr>';
        });
        content += '</tbody></table>';
      }
      content += '</div>';

      // ── Licenses & Certifications ─────────────────────────────────────────
      var lics = v.licenses || [];
      content += '<div class="card" style="padding:16px;margin-top:14px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af">\ud83c\udfa3 Licenses & Certifications <span style="font-weight:400">('+lics.length+')</span></div>'
        +'<button onclick="var n=prompt(\'License / Certificate name:\');if(!n)return;var num=prompt(\'License number:\',\'\');var exp=prompt(\'Expiry date (YYYY-MM-DD):\',\'\');'
        +'var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;var l=inst.licenses||[];l.push({id:\'lic\'+Date.now(),name:n,number:num||\'\',issueDate:new Date().toISOString().slice(0,10),expiryDate:exp||\'\',attachmentData:\'\',attachmentName:\'\',notes:\'\'});updateInstaller(\''+editingInstallerId+'\',{licenses:l});renderPage();" class="btn-w" style="font-size:11px;padding:4px 10px">+ Add License</button></div>';
      if (lics.length === 0) {
        content += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No licenses registered</div>';
      } else {
        lics.forEach(function(lic){
          var expired = lic.expiryDate && lic.expiryDate < new Date().toISOString().slice(0,10);
          var expSoon = !expired && lic.expiryDate && lic.expiryDate < new Date(Date.now()+90*86400000).toISOString().slice(0,10);
          content += '<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:8px;margin-bottom:6px;border-left:3px solid '+(expired?'#ef4444':expSoon?'#f59e0b':'#22c55e')+'">'
            +'<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">'+lic.name+(lic.number?' <span style="font-family:monospace;font-size:11px;color:#6b7280">#'+lic.number+'</span>':'')+'</div>'
            +'<div style="font-size:11px;color:#6b7280;margin-top:2px">Issued: '+(lic.issueDate||'\u2014')+' \u00b7 Expires: '+(lic.expiryDate||'N/A')
            +(expired?' <span style="color:#ef4444;font-weight:700">\u2014 EXPIRED</span>':'')
            +(expSoon?' <span style="color:#f59e0b;font-weight:600">\u2014 Expiring soon</span>':'')
            +'</div>'
            +(lic.attachmentData?'<div style="margin-top:4px"><a href="'+lic.attachmentData+'" target="_blank" download="'+(lic.attachmentName||'license')+'" style="font-size:11px;color:#3b82f6;text-decoration:none">\ud83d\udcce '+(lic.attachmentName||'View attachment')+'</a></div>':'')
            +'</div>'
            +'<div style="display:flex;gap:4px;flex-shrink:0">'
            +'<label style="font-size:10px;padding:3px 8px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;color:#3b82f6;white-space:nowrap">\ud83d\udcce Attach<input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" style="display:none" onchange="var file=this.files[0];if(!file)return;var reader=new FileReader();reader.onload=function(e){var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;inst.licenses=(inst.licenses||[]).map(function(l){return l.id===\''+lic.id+'\'?Object.assign({},l,{attachmentData:e.target.result,attachmentName:file.name}):l;});updateInstaller(\''+editingInstallerId+'\',{licenses:inst.licenses});renderPage();};reader.readAsDataURL(file);"></label>'
            +'<button onclick="var inst=getInstallers().find(function(i){return i.id===\''+editingInstallerId+'\';});if(!inst)return;inst.licenses=(inst.licenses||[]).filter(function(x){return x.id!==\''+lic.id+'\'});updateInstaller(\''+editingInstallerId+'\',{licenses:inst.licenses});renderPage()" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px">\u2715</button></div></div>';
        });
      }
      content += '</div>';

      // ── Availability Exceptions (Capacity Planner spec §4.5) ──────────────
      // Records leave / sick / half-day exceptions. Standard work week comes
      // from installer.workDays (defaults Mon–Fri); this list only stores
      // deviations. Capacity Planner subtracts these days when projecting.
      var avail = (editingInstallerId && editingInstallerId !== '_new' && typeof getInstallerAvailability === 'function')
        ? getInstallerAvailability(editingInstallerId).slice().sort(function(a,b){return (a.date||'').localeCompare(b.date||'');})
        : [];
      var AV_TYPES = {unavailable:'Unavailable',leave:'Leave',half_day_am:'Half Day (AM)',half_day_pm:'Half Day (PM)'};
      content += '<div class="card" style="padding:16px;margin-top:14px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af">📅 Availability Exceptions <span style="font-weight:400">('+avail.length+')</span></div>'
        +(editingInstallerId && editingInstallerId !== '_new'
          ? '<button onclick="openAvailModal(\''+editingInstallerId+'\')" class="btn-w" style="font-size:11px;padding:4px 10px">+ Add Exception</button>'
          : '<span style="font-size:10px;color:#9ca3af;font-style:italic">Save the installer first to add exceptions</span>')
        +'</div>';
      if (avail.length === 0) {
        content += '<div style="color:#9ca3af;font-size:12px;text-align:center;padding:12px">No availability exceptions — using standard work week</div>';
      } else {
        content += '<div style="display:flex;flex-direction:column;gap:4px">';
        avail.forEach(function(a){
          var typeCol = a.type === 'unavailable' || a.type === 'leave' ? '#dc2626' : '#d97706';
          var typeBg  = a.type === 'unavailable' || a.type === 'leave' ? '#fef2f2' : '#fffbeb';
          var typeLabel = AV_TYPES[a.type] || a.type;
          var dateLabel = (function(){ try { var d=new Date(a.date+'T12:00'); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()] + ' ' + a.date; } catch(e){ return a.date; } })();
          var inPast = a.date < new Date().toISOString().slice(0,10);
          content += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:'+typeBg+';border-radius:6px;border-left:3px solid '+typeCol+';opacity:'+(inPast?'.55':'1')+'">'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:12px;font-weight:600;color:#374151">'+dateLabel+(inPast?' <span style="font-size:10px;color:#9ca3af">· past</span>':'')+'</div>'
            +'<div style="font-size:11px;color:'+typeCol+';font-weight:600;margin-top:1px">'+typeLabel+(a.reason?' <span style="color:#6b7280;font-weight:400">· '+a.reason+'</span>':'')+'</div>'
            +'</div>'
            +'<button onclick="if(confirm(\'Remove this exception?\')){removeAvailabilityEntry(\''+a.id+'\');renderPage();}" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px">✕</button>'
            +'</div>';
        });
        content += '</div>';
      }
      content += '</div>';

      // Save button
      content += '<div style="display:flex;gap:8px;margin-top:14px">'
        +'<button onclick="var fn=document.getElementById(\'inst_fn\').value.trim();var ln=document.getElementById(\'inst_ln\').value.trim();if(!fn){addToast(\'First name required\',\'error\');return;}'
        +'var d={firstName:fn,lastName:ln,name:fn+\' \'+ln,phone:document.getElementById(\'inst_ph\').value,email:document.getElementById(\'inst_em\').value,street:document.getElementById(\'inst_st\').value,suburb:document.getElementById(\'inst_sub\').value,state:document.getElementById(\'inst_state\').value,postcode:document.getElementById(\'inst_pc\').value,role:document.getElementById(\'inst_role\').value,hourlyRate:parseFloat(document.getElementById(\'inst_rate\').value)||45,overtimeRate:parseFloat(document.getElementById(\'inst_otrate\').value)||67.50,maxHoursPerDay:parseInt(document.getElementById(\'inst_maxh\').value)||8,efficiencyPct:parseInt(document.getElementById(\'inst_eff\').value)||100,employmentType:document.getElementById(\'inst_etype\').value,branch:document.getElementById(\'inst_branch\').value,startDate:document.getElementById(\'inst_start\').value,abn:document.getElementById(\'inst_abn\').value,licenseNumber:document.getElementById(\'inst_lic\').value,loginEmail:document.getElementById(\'inst_login\').value,loginPin:document.getElementById(\'inst_pin\').value,colour:document.getElementById(\'inst_col\').value,emergencyName:document.getElementById(\'inst_ecn\').value,emergencyPhone:document.getElementById(\'inst_ecp\').value,notes:document.getElementById(\'inst_notes\').value};'
        +'var _eff=parseInt(document.getElementById(\'inst_eff\').value)||100;'
        +'if(editingInstallerId&&editingInstallerId!==\'_new\'){updateInstaller(editingInstallerId,d);if(typeof setInstallerEfficiency===\'function\')setInstallerEfficiency(editingInstallerId,_eff);addToast(fn+\' updated\',\'success\');}else{var l=getInstallers();d.id=\'inst_\'+Date.now();d.active=true;d.tools=[];d.licenses=[];l.push(d);saveInstallers(l);if(typeof setInstallerEfficiency===\'function\')setInstallerEfficiency(d.id,_eff);addToast(fn+\' \'+ln+\' added\',\'success\');}editingInstallerId=null;renderPage();" class="btn-r" style="font-size:13px;padding:8px 24px">'+(editInst?'Update Installer':'Add Installer')+'</button>'
        +'<button onclick="editingInstallerId=null;renderPage()" class="btn-w" style="font-size:13px">Cancel</button></div>';
    } else {
      // ── List view ──────────────────────────────────────────────────────────
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div style="font-size:13px;color:#6b7280">'+instList.length+' installer'+(instList.length!==1?'s':'')+'</div>'
        +(isAdmin?'<button class="btn-r" style="font-size:12px" onclick="editingInstallerId=\'_new\';renderPage()">'+Icon({n:'plus',size:14})+' New Installer</button>':'<span style="font-size:11px;color:#9ca3af;padding:6px 10px;background:#f9fafb;border-radius:6px">Only admins can add/edit installers</span>')
        +'</div>';
      content += '<div style="display:flex;flex-direction:column;gap:8px">';
      instList.forEach(function(inst) {
        var roleLabel = ROLES[inst.role] || inst.role || 'Installer';
        var toolCount = (inst.tools||[]).length;
        var licCount = (inst.licenses||[]).length;
        var expiredLics = (inst.licenses||[]).filter(function(l){return l.expiryDate && l.expiryDate < new Date().toISOString().slice(0,10);}).length;
        content += '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f9fafb;border-radius:10px;'+(isAdmin?'cursor:pointer':'cursor:default')+'" '+(isAdmin?'onclick="editingInstallerId=\''+inst.id+'\';renderPage()" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#f9fafb\'"':'')+'>'
          +'<div style="width:42px;height:42px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:15px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
          +'<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600">'+(inst.name||inst.firstName+' '+inst.lastName)+'</div>'
          +'<div style="font-size:12px;color:#6b7280;margin-top:1px">'+roleLabel+' \u00b7 '+(inst.phone||'No phone')+' \u00b7 '+inst.branch+'</div>'
          +'<div style="display:flex;gap:6px;margin-top:3px">'
          +(toolCount>0?'<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:4px">\ud83d\udee0 '+toolCount+' tools</span>':'')
          +(licCount>0?'<span style="font-size:10px;background:'+(expiredLics>0?'#fee2e2':'#f0fdf4')+';color:'+(expiredLics>0?'#b91c1c':'#15803d')+';padding:1px 6px;border-radius:4px">\ud83c\udfa3 '+licCount+' license'+(licCount!==1?'s':'')+(expiredLics>0?' ('+expiredLics+' expired)':'')+'</span>':'')
          +'</div></div>'
          +'<div style="text-align:right;flex-shrink:0">'
          +'<div style="font-size:15px;font-weight:800;color:#c41230;font-family:Syne,sans-serif">$'+(inst.hourlyRate||45).toFixed(2)+'/h</div>'
          +'<div style="font-size:10px;color:#6b7280">OT $'+(inst.overtimeRate||67.50).toFixed(2)+'/h</div></div>'
          +'<div style="display:flex;align-items:center;gap:6px;flex-shrink:0">'
          +(inst.active?Badge('Active','green'):Badge('Inactive','gray'))
          +(isAdmin?'<span style="font-size:11px;color:#6b7280">'+Icon({n:'right',size:14})+'</span>':'')
          +'</div></div>';
      });
      if (instList.length === 0) content += '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">No installers added yet.'+(isAdmin?' Click "New Installer" to add your first crew member.':' Ask an admin to add installers.')+'</div>';
      content += '</div>';
    }


  // ── VEHICLES ──────────────────────────────────────────────────────────────
  } else if (jobSettTab === 'vehicles') {
    var vehList = getVehicles();
    var isAdmin = ((getCurrentUser()||{role:''}).role === 'admin');
    var VSIZES = {small:'Small Van',medium:'Medium Van',large:'Large Van',xl:'Truck / XL'};
    var VTYPES = {van:'Van',ute:'Ute',truck:'Truck',trailer:'Trailer'};
    var editVeh = editingVehicleId ? vehList.find(function(v){return v.id===editingVehicleId;}) : null;

    if ((editingVehicleId === '_new' || editVeh) && isAdmin) {
      var vv = editVeh || {name:'',rego:'',type:'van',size:'medium',maxFrames:8,maxWeightKg:600,assignedTo:'',notes:'',active:true,internal:{lengthMm:0,widthMm:0,heightMm:0}};
      var _vint = vv.internal || {};
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<h4 style="font-size:15px;font-weight:700;margin:0">'+(editVeh?'Edit Vehicle':'New Vehicle')+'</h4>'
        +'<button onclick="editingVehicleId=null;renderPage()" class="btn-g" style="font-size:12px">Cancel</button></div>';
      content += '<div class="card" style="padding:16px;max-width:600px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Vehicle Name *</label><input class="inp" id="veh_name" value="'+(vv.name||'')+'" placeholder="e.g. Van 1, Transit" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Registration</label><input class="inp" id="veh_rego" value="'+(vv.rego||'')+'" placeholder="ABC 123" style="font-size:13px;padding:8px;text-transform:uppercase"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Type</label><select class="sel" id="veh_type" style="font-size:13px;padding:8px">'+Object.entries(VTYPES).map(function(e){return '<option value="'+e[0]+'"'+(vv.type===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Size</label><select class="sel" id="veh_size" style="font-size:13px;padding:8px">'+Object.entries(VSIZES).map(function(e){return '<option value="'+e[0]+'"'+(vv.size===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Max Frames Capacity</label><input type="number" class="inp" id="veh_frames" value="'+(vv.maxFrames||8)+'" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Max Weight (kg)</label><input type="number" class="inp" id="veh_weight" value="'+(vv.maxWeightKg||600)+'" style="font-size:13px;padding:8px"></div>'
        +'<div style="grid-column:span 2;padding-top:8px;border-top:1px dashed #e5e7eb;margin-top:4px"><div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px">Internal Bed Dimensions (mm) — optional, enables exact fit calc</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'
        +'<div><label style="font-size:10px;color:#9ca3af">Length</label><input type="number" class="inp" id="veh_len" value="'+(+_vint.lengthMm||'')+'" placeholder="e.g. 4200" style="font-size:13px;padding:6px"></div>'
        +'<div><label style="font-size:10px;color:#9ca3af">Width</label><input type="number" class="inp" id="veh_wid" value="'+(+_vint.widthMm||'')+'" placeholder="e.g. 1900" style="font-size:13px;padding:6px"></div>'
        +'<div><label style="font-size:10px;color:#9ca3af">Height</label><input type="number" class="inp" id="veh_hei" value="'+(+_vint.heightMm||'')+'" placeholder="e.g. 2100" style="font-size:13px;padding:6px"></div>'
        +'</div></div>'
        +'<div style="grid-column:span 2"><label style="font-size:10px;font-weight:600;color:#6b7280">Assigned Installer (optional)</label>'
        +'<select class="sel" id="veh_inst" style="font-size:13px;padding:8px"><option value="">Unassigned (Pool)</option>'
        +getInstallers().filter(function(i){return i.active;}).map(function(i){return '<option value="'+i.id+'"'+(vv.assignedTo===i.id?' selected':'')+'>'+i.name+'</option>';}).join('')
        +'</select></div>'
        +'<div style="grid-column:span 2"><label style="font-size:10px;font-weight:600;color:#6b7280">Notes</label><textarea class="inp" id="veh_notes" rows="2" style="font-size:12px;resize:vertical">'+(vv.notes||'')+'</textarea></div>'
        +'</div></div>';

      // ── Insurance section ────────────────────────────────────────────
      var _ins = vv.insurance || {};
      var _insStatus = (typeof getVehicleInsuranceStatus === 'function') ? getVehicleInsuranceStatus(vv) : null;
      var _statusPill = _insStatus ? '<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:'+_insStatus.bg+';color:'+_insStatus.colour+'">'+_insStatus.label+'</span>' : '';
      content += '<div class="card" style="padding:16px;max-width:600px;margin-top:14px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
        +'<h5 style="font-size:13px;font-weight:700;margin:0">🛡️ Insurance</h5>'+_statusPill+'</div>'
        +'<div style="font-size:11px;color:#6b7280;margin-bottom:10px">Upload the certificate of currency PDF — we\'ll auto-detect insurer, policy number, and dates. Verify before saving.</div>'
        +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">'
        +'<input type="file" id="ins_pdf" accept="application/pdf,.pdf" onchange="handleInsurancePdfPicked(this)" style="font-size:12px">'
        +(_ins.pdfUrl ? '<a href="'+_ins.pdfUrl+'" target="_blank" rel="noopener" style="font-size:12px;color:#3b82f6;text-decoration:underline">View current PDF</a>' : '')
        +'</div>'
        +'<div id="ins_parse_note" style="font-size:11px;margin-bottom:10px;min-height:14px"></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Insurer</label><input class="inp" id="ins_insurer" value="'+(_ins.insurer||'')+'" placeholder="e.g. NRMA, Allianz" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Policy Number</label><input class="inp" id="ins_policy" value="'+(_ins.policyNo||'')+'" placeholder="e.g. ABC123456" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Cover Start</label><input type="date" class="inp" id="ins_start" value="'+(_ins.startDate||'')+'" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Expiry Date</label><input type="date" class="inp" id="ins_expiry" value="'+(_ins.expiryDate||'')+'" style="font-size:13px;padding:8px"></div>'
        +'</div></div>';

      content += '<div style="display:flex;gap:8px;margin-top:14px">'
        +'<button onclick="saveVehicleEditForm()" class="btn-r" style="font-size:13px;padding:8px 24px">'+(editVeh?'Update Vehicle':'Add Vehicle')+'</button>'
        +'<button onclick="editingVehicleId=null;renderPage()" class="btn-w" style="font-size:13px">Cancel</button></div>';
    } else {
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div style="font-size:13px;color:#6b7280">'+vehList.length+' vehicle'+(vehList.length!==1?'s':'')+'</div>'
        +(isAdmin?'<button class="btn-r" style="font-size:12px" onclick="editingVehicleId=\'_new\';renderPage()">+ New Vehicle</button>':'<span style="font-size:11px;color:#9ca3af;padding:6px 10px;background:#f9fafb;border-radius:6px">Only admins can add vehicles</span>')
        +'</div>';
      if (vehList.length === 0) {
        content += '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No vehicles added yet.'+(isAdmin?' Click "New Vehicle" to add your first vehicle.':' Ask an admin to add vehicles.')+'</div>';
      } else {
        content += '<div style="display:flex;flex-direction:column;gap:8px">';
        vehList.forEach(function(v){
          var sizeLabel = VSIZES[v.size] || v.size;
          var typeLabel = VTYPES[v.type] || v.type;
          var assignedInst = v.assignedTo ? getInstallers().find(function(i){return i.id===v.assignedTo;}) : null;
          var sizeCol = {small:'#22c55e',medium:'#3b82f6',large:'#f59e0b',xl:'#ef4444'}[v.size] || '#9ca3af';
          content += '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f9fafb;border-radius:10px;'+(isAdmin?'cursor:pointer':'cursor:default')+'" '+(isAdmin?'onclick="editingVehicleId=\''+v.id+'\';renderPage()" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#f9fafb\'"':'')+'>'
            +'<div style="width:42px;height:42px;border-radius:10px;background:'+sizeCol+';color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0">🚐</div>'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:14px;font-weight:600">'+v.name+(v.rego?' <span style="font-size:11px;font-family:monospace;color:#6b7280;background:#f3f4f6;padding:1px 6px;border-radius:4px">'+v.rego+'</span>':'')+'</div>'
            +'<div style="font-size:12px;color:#6b7280;margin-top:2px">'+typeLabel+' · '+sizeLabel+' · '+v.maxFrames+' frames max · '+v.maxWeightKg+'kg</div>'
            +(assignedInst?'<div style="font-size:11px;color:#3b82f6;margin-top:2px">Assigned to '+assignedInst.name+'</div>':'<div style="font-size:11px;color:#9ca3af;margin-top:2px">Pool vehicle</div>')
            +'</div>'
            +'<div style="display:flex;gap:6px;align-items:center">'
            +(function(){
              var s = (typeof getVehicleInsuranceStatus === 'function') ? getVehicleInsuranceStatus(v) : null;
              if (!s) return '';
              return '<span title="Insurance" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;background:'+s.bg+';color:'+s.colour+'">🛡️ '+s.label+'</span>';
            })()
            +(v.active?'<span style="font-size:10px;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-weight:600">Active</span>':'<span style="font-size:10px;background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:4px;font-weight:600">Inactive</span>')
            +(isAdmin?'<button onclick="event.stopPropagation();updateVehicle(\''+v.id+'\',{active:'+(!v.active)+'});addToast(\''+(v.active?'Deactivated':'Activated')+'\',\'success\')" class="btn-g" style="font-size:11px;padding:4px 8px">'+(v.active?'Deactivate':'Activate')+'</button>':'')
            +(isAdmin?'<button onclick="event.stopPropagation();if(confirm(\'Remove '+v.name+'?\')){removeVehicle(\''+v.id+'\')}" class="btn-g" style="font-size:11px;padding:4px 8px;color:#ef4444">✕</button>':'')
            +'</div></div>';
        });
        content += '</div>';
      }
    }

  // ── TOOLS ─────────────────────────────────────────────────────────────────
  } else if (jobSettTab === 'tools') {
    var toolList = (typeof getTools === 'function') ? getTools() : [];
    var isAdmin = ((getCurrentUser()||{role:''}).role === 'admin');
    var TCATS = {lifting:'Lifting',access:'Access',sealing:'Sealing',fastening:'Fastening',measuring:'Measuring',other:'Other'};
    var TICONS = {lifting:'🏗️',access:'🪜',sealing:'🧴',fastening:'🔩',measuring:'📏',other:'🛠️'};
    var editTool = editingToolId ? toolList.find(function(t){return t.id===editingToolId;}) : null;

    if ((editingToolId === '_new' || editTool) && isAdmin) {
      var tt = editTool || {name:'',category:'lifting',assignedTo:'',shared:true,notes:'',active:true};
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<h4 style="font-size:15px;font-weight:700;margin:0">'+(editTool?'Edit Tool':'New Tool')+'</h4>'
        +'<button onclick="editingToolId=null;renderPage()" class="btn-g" style="font-size:12px">Cancel</button></div>';
      content += '<div class="card" style="padding:16px;max-width:600px">'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
        +'<div style="grid-column:span 2"><label style="font-size:10px;font-weight:600;color:#6b7280">Tool Name *</label><input class="inp" id="tool_name" value="'+(tt.name||'')+'" placeholder="e.g. Bifold Lift Jig, Aluminium Scaffold" style="font-size:13px;padding:8px"></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Category</label><select class="sel" id="tool_cat" style="font-size:13px;padding:8px">'+Object.entries(TCATS).map(function(e){return '<option value="'+e[0]+'"'+(tt.category===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')+'</select></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Availability</label><select class="sel" id="tool_shared" style="font-size:13px;padding:8px"><option value="true"'+(tt.shared!==false?' selected':'')+'>Shared (depot pool)</option><option value="false"'+(tt.shared===false?' selected':'')+'>Assigned to one installer</option></select></div>'
        +'<div style="grid-column:span 2"><label style="font-size:10px;font-weight:600;color:#6b7280">Assigned Installer (only if not shared)</label>'
        +'<select class="sel" id="tool_inst" style="font-size:13px;padding:8px"><option value="">— none —</option>'
        +getInstallers().filter(function(i){return i.active;}).map(function(i){return '<option value="'+i.id+'"'+(tt.assignedTo===i.id?' selected':'')+'>'+i.name+'</option>';}).join('')
        +'</select></div>'
        +'<div style="grid-column:span 2"><label style="font-size:10px;font-weight:600;color:#6b7280">Notes</label><textarea class="inp" id="tool_notes" rows="2" style="font-size:12px;resize:vertical">'+(tt.notes||'')+'</textarea></div>'
        +'</div></div>';
      content += '<div style="display:flex;gap:8px;margin-top:14px">'
        +'<button onclick="var name=document.getElementById(\'tool_name\').value.trim();if(!name){addToast(\'Tool name required\',\'error\');return;}'
        +'var d={name:name,category:document.getElementById(\'tool_cat\').value,shared:document.getElementById(\'tool_shared\').value===\'true\',assignedTo:document.getElementById(\'tool_inst\').value,notes:document.getElementById(\'tool_notes\').value};'
        +'if(editingToolId&&editingToolId!==\'_new\'){updateTool(editingToolId,d);addToast(name+\' updated\',\'success\');}else{addTool(d);addToast(name+\' added\',\'success\');}editingToolId=null;renderPage();" class="btn-r" style="font-size:13px;padding:8px 24px">'+(editTool?'Update Tool':'Add Tool')+'</button>'
        +'<button onclick="editingToolId=null;renderPage()" class="btn-w" style="font-size:13px">Cancel</button></div>';
    } else {
      content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
        +'<div style="font-size:13px;color:#6b7280">'+toolList.length+' tool'+(toolList.length!==1?'s':'')+'</div>'
        +(isAdmin?'<button class="btn-r" style="font-size:12px" onclick="editingToolId=\'_new\';renderPage()">+ New Tool</button>':'<span style="font-size:11px;color:#9ca3af;padding:6px 10px;background:#f9fafb;border-radius:6px">Only admins can add tools</span>')
        +'</div>';
      if (toolList.length === 0) {
        content += '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No tools added yet.'+(isAdmin?' Click "New Tool" to add bifold lift jigs, scaffolds, ladders, etc.':'')+'</div>';
      } else {
        content += '<div style="display:flex;flex-direction:column;gap:8px">';
        toolList.forEach(function(t){
          var assignedInst = (!t.shared && t.assignedTo) ? getInstallers().find(function(i){return i.id===t.assignedTo;}) : null;
          var catCol = {lifting:'#f59e0b',access:'#3b82f6',sealing:'#22c55e',fastening:'#a855f7',measuring:'#06b6d4',other:'#6b7280'}[t.category] || '#9ca3af';
          content += '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f9fafb;border-radius:10px;'+(isAdmin?'cursor:pointer':'cursor:default')+'" '+(isAdmin?'onclick="editingToolId=\''+t.id+'\';renderPage()" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#f9fafb\'"':'')+'>'
            +'<div style="width:42px;height:42px;border-radius:10px;background:'+catCol+';color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(TICONS[t.category]||'🛠️')+'</div>'
            +'<div style="flex:1;min-width:0">'
            +'<div style="font-size:14px;font-weight:600">'+t.name+'</div>'
            +'<div style="font-size:12px;color:#6b7280;margin-top:2px">'+(TCATS[t.category]||t.category)+(t.shared!==false?' · Shared (pool)':assignedInst?' · '+assignedInst.name:' · Assigned (installer missing)')+'</div>'
            +(t.notes?'<div style="font-size:11px;color:#9ca3af;margin-top:2px">'+t.notes+'</div>':'')
            +'</div>'
            +'<div style="display:flex;gap:6px;align-items:center">'
            +(t.active!==false?'<span style="font-size:10px;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-weight:600">Active</span>':'<span style="font-size:10px;background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:4px;font-weight:600">Inactive</span>')
            +(isAdmin?'<button onclick="event.stopPropagation();updateTool(\''+t.id+'\',{active:'+(!(t.active!==false))+'});addToast(\''+(t.active!==false?'Deactivated':'Activated')+'\',\'success\')" class="btn-g" style="font-size:11px;padding:4px 8px">'+(t.active!==false?'Deactivate':'Activate')+'</button>':'')
            +(isAdmin?'<button onclick="event.stopPropagation();if(confirm(\'Remove '+t.name.replace(/\'/g,'\\\'')+'?\')){removeTool(\''+t.id+'\')}" class="btn-g" style="font-size:11px;padding:4px 8px;color:#ef4444">✕</button>':'')
            +'</div></div>';
        });
        content += '</div>';
      }
    }

  // ── CAPACITY ──────────────────────────────────────────────────────────────
  } else if (jobSettTab === 'capacity') {
    var installers = getInstallers().filter(function(i){return i.active;});
    var branches = ['VIC','ACT','SA','TAS'];
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">Daily capacity is calculated from each installer\'s max hours per day. The buffer % reserves time for travel, setup, and unexpected delays.</div>';

    branches.forEach(function(b){
      var branchInstallers = installers.filter(function(i){return i.branch===b;});
      if (branchInstallers.length === 0) return;
      var totalHours = branchInstallers.reduce(function(sum,i){return sum+(i.maxHoursPerDay||8);},0);
      var bufferKey = 'capacity_buffer_'+b;
      var buffer = parseInt(localStorage.getItem(bufferKey)||'20');
      var effectiveHours = Math.round(totalHours * (1 - buffer/100));

      content += '<div class="card" style="padding:16px;margin-bottom:12px">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
        +'<div style="font-size:14px;font-weight:700">'+b+' Branch</div>'
        +'<span style="font-size:11px;color:#6b7280">'+branchInstallers.length+' active installer'+(branchInstallers.length!==1?'s':'')+'</span></div>'

        +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">'
        +'<div style="padding:12px;background:#f9fafb;border-radius:8px;text-align:center"><div style="font-size:10px;color:#6b7280;margin-bottom:4px">TOTAL HOURS/DAY</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif">'+totalHours+'h</div></div>'
        +'<div style="padding:12px;background:#fff5f6;border-radius:8px;text-align:center"><div style="font-size:10px;color:#6b7280;margin-bottom:4px">BUFFER</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230">'+buffer+'%</div></div>'
        +'<div style="padding:12px;background:#f0fdf4;border-radius:8px;text-align:center"><div style="font-size:10px;color:#6b7280;margin-bottom:4px">EFFECTIVE/DAY</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#15803d">'+effectiveHours+'h</div></div>'
        +'</div>'

        +'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'
        +'<label style="font-size:12px;font-weight:600;color:#374151;white-space:nowrap">Capacity Buffer %</label>'
        +'<input type="range" min="0" max="50" value="'+buffer+'" style="flex:1" oninput="this.nextElementSibling.textContent=this.value+\'%\';localStorage.setItem(\''+bufferKey+'\',this.value);renderPage()">'
        +'<span style="font-size:13px;font-weight:700;width:40px;text-align:right">'+buffer+'%</span></div>'

        +'<div style="border-top:1px solid #f0f0f0;padding-top:12px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#9ca3af;margin-bottom:8px">Installers</div>'
        +'<div style="display:flex;flex-direction:column;gap:6px">';

      branchInstallers.forEach(function(inst){
        var pct = Math.round((inst.maxHoursPerDay||8) / totalHours * 100);
        content += '<div style="display:flex;align-items:center;gap:10px">'
          +'<div style="width:32px;height:32px;border-radius:50%;background:'+(inst.colour||'#3b82f6')+';color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
          +'<div style="flex:1;min-width:0">'
          +'<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12px;font-weight:600">'+(inst.name||'')+'</span><span style="font-size:11px;color:#6b7280">'+(inst.maxHoursPerDay||8)+'h · '+pct+'% of team</span></div>'
          +'<div style="height:6px;background:#e5e7eb;border-radius:3px"><div style="height:6px;background:'+(inst.colour||'#3b82f6')+';border-radius:3px;width:'+pct+'%"></div></div>'
          +'</div></div>';
      });

      content += '</div></div></div>';
    });

    if (installers.length === 0) {
      content = '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No active installers found. Add installers first to configure capacity.</div>';
    }

  // ── WEEKLY TARGETS ────────────────────────────────────────────────────────
  // ── KPI THRESHOLDS ────────────────────────────────────────────────────────
  } else if (jobSettTab === 'kpi') {
    var isAdmin = ((getCurrentUser()||{role:''}).role === 'admin');
    var k = (typeof getKpiThresholds === 'function') ? getKpiThresholds() : {};
    var defaults = (typeof DEFAULT_KPI_THRESHOLDS === 'object') ? DEFAULT_KPI_THRESHOLDS : {};
    var FIELDS = [
      {key:'cmFromDeposit',        label:'CM Booking KPI',                   unit:'hours', desc:'Flag jobs amber if Check Measure not booked within this many hours of deposit clearing.', section:'CM Stage'},
      {key:'staleCheckMeasure',    label:'Stale at Check Measure',           unit:'days',  desc:'Job sits at "a. Check Measure" longer than this → red flag on dashboard.', section:'Status Staleness'},
      {key:'staleAwaitingPayment', label:'Stale Awaiting 45%',               unit:'days',  desc:'Job at "c. Awaiting Second Payment" longer than this → red flag.', section:'Status Staleness'},
      {key:'staleFinalSignOff',    label:'Stale Final Sign Off',             unit:'days',  desc:'Job at "d. Final Sign Off" awaiting customer DocuSign longer than this → red flag.', section:'Status Staleness'},
      {key:'staleCheckStatus',     label:'Stale Check Status / Triage',      unit:'days',  desc:'Job at "b. Check Status / Book Service" awaiting bookkeeper triage longer than this → red flag.', section:'Status Staleness'},
      {key:'installOverrunPct',    label:'Install Time Overrun',             unit:'%',     desc:'Alert install manager when on-site time exceeds CAD forecast by this percentage. Manual §7.10.', section:'Install Day'},
    ];
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">KPI thresholds drive the amber/red flags on the Job Dashboard, the staleness colour-coding on the Status card, and the install-overrun alerts in the Smart Recommendations panel. Defaults match the manual; tune them to your operating tempo.</div>';
    var sections = ['CM Stage','Status Staleness','Install Day'];
    sections.forEach(function(sec){
      content += '<div style="margin-bottom:16px"><div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">'+sec+'</div>'
        +'<div style="display:flex;flex-direction:column;gap:8px">';
      FIELDS.filter(function(f){return f.section===sec;}).forEach(function(f){
        var cur = (typeof k[f.key] === 'number') ? k[f.key] : defaults[f.key];
        var def = defaults[f.key];
        var changed = cur !== def;
        content += '<div class="card" style="padding:14px;display:grid;grid-template-columns:1fr 200px;gap:14px;align-items:center">'
          +'<div><div style="font-size:13px;font-weight:600;color:#111;margin-bottom:2px">'+f.label+(changed?' <span style="font-size:9px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:700">CUSTOM</span>':'')+'</div>'
          +'<div style="font-size:11px;color:#6b7280;line-height:1.5">'+f.desc+'</div>'
          +'<div style="font-size:10px;color:#9ca3af;margin-top:3px">Default: '+def+' '+f.unit+'</div></div>'
          +'<div style="display:flex;align-items:center;gap:6px">'
          +(isAdmin?'<input type="number" id="kpi_'+f.key+'" value="'+cur+'" min="1" style="font-size:14px;padding:8px 10px;width:80px;border:1px solid #e5e7eb;border-radius:6px;text-align:right;font-weight:700">':'<span style="font-size:14px;font-weight:700">'+cur+'</span>')
          +'<span style="font-size:12px;color:#6b7280">'+f.unit+'</span>'
          +'</div></div>';
      });
      content += '</div></div>';
    });
    if (isAdmin) {
      content += '<div style="display:flex;gap:8px;margin-top:14px;padding-top:14px;border-top:1px solid #f0f0f0">'
        +'<button onclick="var t={};'+FIELDS.map(function(f){return 't.'+f.key+'=parseInt(document.getElementById(\'kpi_'+f.key+'\').value)||'+defaults[f.key]+';';}).join('')+'saveKpiThresholds(t);addToast(\'KPI thresholds saved\',\'success\');renderPage();" class="btn-r" style="font-size:13px;padding:8px 24px">Save Thresholds</button>'
        +'<button onclick="if(confirm(\'Reset all KPI thresholds to manual defaults?\')){resetKpiThresholds();addToast(\'Reset to defaults\',\'success\');renderPage();}" class="btn-w" style="font-size:13px">Reset to Manual Defaults</button>'
        +'</div>';
    } else {
      content += '<div style="margin-top:14px;font-size:11px;color:#9ca3af;padding:10px 14px;background:#f9fafb;border-radius:8px">Only admins can edit KPI thresholds.</div>';
    }

  } else if (jobSettTab === 'targets') {
    var t = getState().weeklyTargets || {};
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">Set weekly installation revenue targets per branch. These drive the KPI bars on the Installation Schedule and Smart Planner.</div>';
    content += '<div style="display:flex;flex-direction:column;gap:12px;max-width:400px">';
    ['VIC','ACT','SA','TAS'].forEach(function(b){
      content += '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f9fafb;border-radius:10px">'
        +'<span style="font-size:14px;font-weight:700;width:40px">'+b+'</span>'
        +'<div style="flex:1"><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:3px">Weekly Target ($)</label>'
        +'<input type="number" class="inp" value="'+(t[b]||0)+'" style="font-size:14px;padding:8px" onblur="var t=Object.assign({},getState().weeklyTargets||{});t[\''+b+'\']=parseInt(this.value)||0;setState({weeklyTargets:t})"></div>'
        +'<div style="font-size:12px;color:#9ca3af;text-align:right"><div>$'+Math.round((t[b]||0)/5).toLocaleString()+'/day</div><div>$'+Math.round((t[b]||0)*52).toLocaleString()+'/yr</div></div></div>';
    });
    content += '</div>';

  // ── JOB CUSTOM FIELDS ─────────────────────────────────────────────────────
  } else if (jobSettTab === 'jobfields') {
    var fields = getState().jobFields || [];
    var sorted = fields.slice().sort(function(a,b){return a.ord-b.ord;});
    content = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
      +'<div style="font-size:13px;color:#6b7280">'+fields.length+' custom field'+(fields.length!==1?'s':'')+'</div>'
      +'<button class="btn-r" style="font-size:12px" onclick="jsAddingField=true;jsEditFieldId=null;jsNewField={label:\'\',type:\'text\',options:[],required:false,newOpt:\'\'};renderPage()">'+Icon({n:'plus',size:14})+' Add Field</button></div>';

    // Field list with drag handles
    content += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">';
    sorted.forEach(function(f,i){
      content += '<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:'+(jsEditFieldId===f.id?'#fff5f6':'#f9fafb')+';border-radius:10px;'+(jsEditFieldId===f.id?'border:1.5px solid #fca5a5':'border:1px solid transparent')+'">'
        +'<div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0">'
        +(i>0?'<button onclick="cfMoveField(\'jobs\',\''+f.id+'\',\'up\')" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:1px 4px;font-size:10px;line-height:1" onmouseover="this.style.color=\'#374151\'" onmouseout="this.style.color=\'#9ca3af\'">\u25b2</button>':'<div style="height:14px"></div>')
        +(i<sorted.length-1?'<button onclick="cfMoveField(\'jobs\',\''+f.id+'\',\'down\')" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:1px 4px;font-size:10px;line-height:1" onmouseover="this.style.color=\'#374151\'" onmouseout="this.style.color=\'#9ca3af\'">\u25bc</button>':'<div style="height:14px"></div>')
        +'</div>'
        +'<span style="font-size:13px;font-weight:500;flex:1">'+f.label+(f.required?'<span style="color:#c41230;margin-left:2px">*</span>':'')+'</span>'
        +'<span class="bdg" style="background:#f0f0f0;color:#555;font-size:10px">'+(CF_TYPE_LABELS[f.type]||f.type)+'</span>'
        +'<button onclick="cfToggleRequired(\'jobs\',\''+f.id+'\')" style="font-size:10px;padding:2px 8px;border-radius:16px;border:1px solid;cursor:pointer;font-family:inherit;'+(f.required?'background:#fee2e2;border-color:#fca5a5;color:#b91c1c':'background:#f9fafb;border-color:#e5e7eb;color:#9ca3af')+'">'+(f.required?'Required':'Optional')+'</button>'
        +'<button onclick="jsEditFieldId=\''+f.id+'\';jsAddingField=false;jsNewField={label:\''+f.label.replace(/'/g,"\\'")+'\',type:\''+f.type+'\',options:'+JSON.stringify(f.options||[])+',required:'+!!f.required+',newOpt:\'\'};renderPage()" class="btn-g" style="padding:4px 8px">'+Icon({n:'edit',size:12})+'</button>'
        +'<button onclick="cfDeleteField(\'jobs\',\''+f.id+'\')" class="btn-g" style="padding:4px 8px;color:#ef4444">'+Icon({n:'trash',size:12})+'</button>'
        +'</div>';
    });
    content += '</div>';

    // Add/Edit form
    if (jsAddingField || jsEditFieldId) {
      content += '<div style="padding:16px;background:#fff5f6;border-radius:12px;border:1.5px solid #fca5a5;margin-bottom:12px">'
        +'<div style="font-size:13px;font-weight:700;margin-bottom:12px">'+(jsEditFieldId?'Edit Field':'Add New Job Field')+'</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">'
        +'<div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Label *</label>'
        +'<input class="inp" id="jsFieldLabel" value="'+jsNewField.label+'" placeholder="Field name" style="font-size:13px"></div>'
        +'<div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Type</label>'
        +'<select class="sel" id="jsFieldType" style="font-size:13px" onchange="jsNewField.type=this.value;renderPage()">'
        +Object.entries(CF_TYPE_LABELS).map(function(e){return '<option value="'+e[0]+'"'+(jsNewField.type===e[0]?' selected':'')+'>'+e[1]+'</option>';}).join('')
        +'</select></div></div>';
      if (jsNewField.type==='dropdown'||jsNewField.type==='multiselect') {
        content += '<div style="margin-bottom:10px"><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Options</label>'
          +'<div style="display:flex;flex-direction:column;gap:4px;margin-bottom:6px">'
          +jsNewField.options.map(function(o,i){return '<div style="display:flex;gap:6px;align-items:center"><span style="font-size:13px;flex:1;padding:4px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:6px">'+o+'</span><button onclick="jsNewField.options=jsNewField.options.filter(function(_,j){return j!=='+i+'});renderPage()" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:14px">\u00d7</button></div>';}).join('')
          +'</div>'
          +'<div style="display:flex;gap:6px"><input class="inp" id="jsNewOpt" placeholder="Add option" style="font-size:12px;flex:1" onkeypress="if(event.key===\'Enter\'){var v=this.value.trim();if(v){jsNewField.options.push(v);renderPage();}}"><button onclick="var v=document.getElementById(\'jsNewOpt\').value.trim();if(v){jsNewField.options.push(v);renderPage();}" class="btn-w" style="font-size:11px;padding:4px 10px">Add</button></div></div>';
      }
      content += '<div style="display:flex;gap:8px">'
        +'<button onclick="var label=document.getElementById(\'jsFieldLabel\').value.trim();var type=document.getElementById(\'jsFieldType\').value;if(!label){addToast(\'Label required\',\'error\');return;}var s=getState();var list=s.jobFields||[];if(jsEditFieldId){setState({jobFields:list.map(function(f){return f.id===jsEditFieldId?Object.assign({},f,{label:label,type:type,options:jsNewField.options,required:jsNewField.required}):f;})});addToast(\'Field updated\',\'success\');}else{setState({jobFields:list.concat([{id:\'jf\'+Date.now(),label:label,type:type,options:jsNewField.options,required:jsNewField.required,ord:list.length+1}])});addToast(\'Field added\',\'success\');}jsAddingField=false;jsEditFieldId=null;jsNewField={label:\'\',type:\'text\',options:[],required:false,newOpt:\'\'};renderPage();" class="btn-r" style="font-size:12px">Save</button>'
        +'<button onclick="jsAddingField=false;jsEditFieldId=null;renderPage()" class="btn-w" style="font-size:12px">Cancel</button></div></div>';
    }

  // ── JOB NUMBERS & LEGAL ENTITIES ──────────────────────────────────────────
  } else if (jobSettTab === 'jobnumbers') {
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">Configure job number prefixes and legal entity names per branch.</div>';
    content += '<div style="display:flex;flex-direction:column;gap:12px;max-width:600px">';
    ['VIC','ACT','SA','TAS'].forEach(function(b){
      content += '<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;background:#f9fafb;border-radius:10px">'
        +'<span style="font-size:15px;font-weight:800;width:45px;color:#c41230">'+b+'</span>'
        +'<div style="flex:1;display:grid;gap:8px">'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Job Number Prefix</label><div style="font-size:14px;font-weight:600;margin-top:2px">'+b+'-</div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">Legal Entity</label><div style="font-size:13px;margin-top:2px">'+(JOB_LEGAL_ENTITIES[b]||'\u2014')+'</div></div>'
        +'<div><label style="font-size:10px;font-weight:600;color:#6b7280">ABN</label><div style="font-size:13px;margin-top:2px">'+(SPARTAN_ABNS[b]||'\u2014')+'</div></div>'
        +'</div></div>';
    });
    content += '</div>';
    content += '<div style="margin-top:16px;padding:12px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12px;color:#475569">Job numbers auto-increment per branch (e.g., VIC-4001, VIC-4002\u2026). The counter is managed locally per branch.</div>';

  // ── CHECK MEASURE SETTINGS ────────────────────────────────────────────────
  } else if (jobSettTab === 'checkmeasure') {
    content = '<div style="max-width:600px">';
    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Window Configurations</h4>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">'
      +JOB_WINDOW_CONFIGS.map(function(c){return '<span class="bdg" style="font-size:12px;padding:4px 12px">'+c+'</span>';}).join('')
      +'</div>';

    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Trim Codes Dictionary</h4>'
      +'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">'
      +CM_TRIM_CODES.map(function(c){return '<span class="bdg" style="font-size:12px;padding:4px 12px">'+c+'</span>';}).join('')
      +'</div>';

    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Default Progress Claim Percentages</h4>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">'
      +'<div style="padding:14px;background:#f9fafb;border-radius:10px;text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Deposit</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif">5%</div></div>'
      +'<div style="padding:14px;background:#f9fafb;border-radius:10px;text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Check Measure</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#c41230">45%</div></div>'
      +'<div style="padding:14px;background:#f9fafb;border-radius:10px;text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:4px">Final Balance</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif">50%</div></div>'
      +'</div>';

    content += '<h4 style="font-size:14px;font-weight:700;margin:0 0 12px">Final Sign-Off Clauses</h4>'
      +'<div style="display:flex;flex-direction:column;gap:6px">';
    FINAL_SIGNOFF_CLAUSES.forEach(function(cl,i){
      content += '<div style="display:flex;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:8px">'
        +'<span style="font-size:12px;font-weight:700;color:#c41230;width:20px;flex-shrink:0">'+(i+1)+'</span>'
        +'<div style="flex:1"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="font-size:12px;font-weight:600">'+cl.label+'</span>'
        +(cl.conditional?'<span style="font-size:9px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:8px;font-weight:600">Conditional</span>':'')+'</div>'
        +'<div style="font-size:11px;color:#6b7280">'+cl.text+'</div></div></div>';
    });
    content += '</div></div>';

  // ── JOB STATUSES ──────────────────────────────────────────────────────────
  } else if (jobSettTab === 'statuses') {
    content = '<div style="font-size:13px;color:#6b7280;margin-bottom:16px">The 25-status workflow for job progression. Statuses are enforced by gate logic \u2014 jobs cannot skip required steps.</div>';
    var groups = {};
    JOB_STATUSES.forEach(function(s){ if(!groups[s.group]) groups[s.group]=[]; groups[s.group].push(s); });
    JOB_STATUS_GROUPS.forEach(function(g){
      var grpStatuses = groups[g.key] || [];
      if (grpStatuses.length === 0) return;
      content += '<div style="margin-bottom:16px">'
        +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:'+g.col+';margin-bottom:8px">'+g.label+'</div>'
        +'<div style="display:flex;flex-direction:column;gap:4px">';
      grpStatuses.forEach(function(s){
        content += '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:#f9fafb;border-radius:8px;border-left:3px solid '+s.col+'">'
          +'<div style="width:10px;height:10px;border-radius:50%;background:'+s.col+';flex-shrink:0"></div>'
          +'<span style="font-size:13px;font-weight:500;flex:1">'+s.label+'</span>'
          +'<span class="bdg" style="font-size:10px;background:'+s.col+'15;color:'+s.col+'">'+s.group+'</span></div>';
      });
      content += '</div></div>';
    });
  }

  return '<div>'
    +'<div style="margin-bottom:20px"><h1 style="font-size:24px;font-weight:800;margin:0;font-family:Syne,sans-serif">Job CRM Settings</h1>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Configuration for the Job CRM module \u2014 separate from Sales CRM settings</p></div>'
    +'<div style="display:flex;gap:20px">'
    +'<div style="width:200px;flex-shrink:0"><div class="card" style="padding:6px">'
    +TABS.map(function(t){return '<button onclick="jobSettTab=\''+t[0]+'\';renderPage()" style="width:100%;text-align:left;padding:10px 12px;border-radius:8px;border:none;font-size:13px;font-weight:'+(jobSettTab===t[0]?'600':'400')+';cursor:pointer;font-family:inherit;background:'+(jobSettTab===t[0]?'#fff5f6':'transparent')+';color:'+(jobSettTab===t[0]?'#c41230':'#374151')+';transition:all .1s" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\''+(jobSettTab===t[0]?'#fff5f6':'transparent')+'\'">'+t[1]+'</button>';}).join('')
    +'</div></div>'
    +'<div style="flex:1;min-width:0"><div class="card" style="overflow:hidden">'
    +'<div style="padding:16px 20px;border-bottom:1px solid #f0f0f0"><h3 style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;margin:0">'+(TABS.find(function(t){return t[0]===jobSettTab;})||['',''])[1]+'</h3></div>'
    +'<div style="padding:20px">'+content+'</div>'
    +'</div></div></div></div>';
}

