// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 12-settings.js
// Extracted from original index.html lines 9133-9682
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────

// ─ Email & Gmail ─
defineAction('settings-gmail-disconnect', function(target, ev) {
  gmailDisconnect();
});

defineAction('settings-gmail-connect', function(target, ev) {
  gmailConnect();
});

defineAction('settings-gmail-save-client-id', function(target, ev) {
  const v = document.getElementById('gmailClientId').value.trim();
  if (v) {
    GMAIL_CLIENT_ID = v;
    localStorage.setItem('spartan_gmail_client_id', v);
    gmailInit();
    addToast('Client ID saved', 'success');
  } else {
    addToast('Enter a Client ID', 'error');
  }
});

defineAction('settings-maps-save-key', function(target, ev) {
  saveMapsApiKey();
});

defineAction('settings-maps-test-key', function(target, ev) {
  testMapsApiKey();
});

// ─ Pipeline Manager ─
defineAction('settings-pipeline-add-stage', function(target, ev) {
  const pipelineName = target.dataset.pipelineName;
  addToast('Stage added to ' + pipelineName, 'success');
});

defineAction('settings-pipeline-edit-stage', function(target, ev) {
  addToast('Stage editor in production', 'info');
});

// ─ Custom Fields ─
defineAction('settings-cf-switch-entity', function(target, ev) {
  cfEntityTab = target.dataset.entity;
  cfAddingNew = false;
  cfEditingId = null;
  renderPage();
});

defineAction('settings-cf-move-field', function(target, ev) {
  const entity = target.dataset.entity;
  const fieldId = target.dataset.fieldId;
  const dir = target.dataset.dir;
  cfMoveField(entity, fieldId, dir);
});

defineAction('settings-cf-toggle-required', function(target, ev) {
  const entity = target.dataset.entity;
  const fieldId = target.dataset.fieldId;
  cfToggleRequired(entity, fieldId);
});

defineAction('settings-cf-edit-field', function(target, ev) {
  cfEditingId = target.dataset.fieldId;
  cfAddingNew = false;
  renderPage();
});

defineAction('settings-cf-delete-field-confirm', function(target, ev) {
  const entity = target.dataset.entity;
  const fieldId = target.dataset.fieldId;
  cfDeleteField(entity, fieldId);
});

defineAction('settings-cf-delete-cancel', function(target, ev) {
  stConfirmDeleteId = null;
  renderPage();
});

defineAction('settings-cf-delete-initiate', function(target, ev) {
  stConfirmDeleteId = target.dataset.fieldId;
  renderPage();
});

defineAction('settings-cf-type-change', function(target, ev) {
  cfNewForm.type = target.value;
  renderPage();
});

defineAction('settings-cf-option-remove', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  cfNewForm.options = cfNewForm.options.filter((_, j) => j !== idx);
  renderPage();
});

defineAction('settings-cf-option-add', function(target, ev) {
  const v = document.getElementById('cfNewOpt').value.trim();
  if (v) {
    cfNewForm.options = [...cfNewForm.options, v];
    cfNewForm.newOpt = '';
    renderPage();
    document.getElementById('cfNewOpt').focus();
  }
});

defineAction('settings-cf-option-keydown', function(target, ev) {
  if (ev.key === 'Enter') {
    const v = target.value.trim();
    if (v) {
      cfNewForm.options = [...cfNewForm.options, v];
      target.value = '';
      renderPage();
    }
  }
});

defineAction('settings-cf-required-toggle', function(target, ev) {
  cfNewForm.required = target.checked;
});

defineAction('settings-cf-cancel', function(target, ev) {
  cfAddingNew = false;
  cfEditingId = null;
  cfNewForm = { label: '', type: 'text', options: [], required: false, newOpt: '' };
  renderPage();
});

defineAction('settings-cf-save-field', function(target, ev) {
  const entity = target.dataset.entity;
  const editId = target.dataset.editId || '';
  cfSaveField(entity, editId || null);
});

defineAction('settings-cf-add-new', function(target, ev) {
  cfAddingNew = true;
  cfEditingId = null;
  cfNewForm = { label: '', type: 'text', options: [], required: false, newOpt: '' };
  renderPage();
});

// ─ Statuses ─
defineAction('settings-st-switch-entity', function(target, ev) {
  stEntityTab = target.dataset.entity;
  stEditingId = null;
  stConfirmDeleteId = null;
  renderPage();
});

defineAction('settings-st-open-color-picker', function(target, ev) {
  const entity = target.dataset.entity;
  const id = target.dataset.id;
  stOpenColorPicker(entity, id);
});

defineAction('settings-st-set-color', function(target, ev) {
  const entity = target.dataset.entity;
  const id = target.dataset.id;
  const col = target.dataset.col;
  stSetColor(entity, id, col);
});

defineAction('settings-st-edit-label', function(target, ev) {
  stEditingId = target.dataset.id;
  renderPage();
});

defineAction('settings-st-label-keydown', function(target, ev) {
  if (ev.key === 'Enter') {
    stSaveLabel(target.dataset.entity, target.dataset.id);
  }
});

defineAction('settings-st-save-label', function(target, ev) {
  const entity = target.dataset.entity;
  const id = target.dataset.id;
  stSaveLabel(entity, id);
});

defineAction('settings-st-cancel-label', function(target, ev) {
  stEditingId = null;
  renderPage();
});

defineAction('settings-st-toggle-won', function(target, ev) {
  const id = target.dataset.id;
  stToggleWon(id);
});

defineAction('settings-st-toggle-lost', function(target, ev) {
  const id = target.dataset.id;
  stToggleLost(id);
});

defineAction('settings-st-set-default', function(target, ev) {
  const entity = target.dataset.entity;
  const id = target.dataset.id;
  stSetDefault(entity, id);
});

defineAction('settings-st-delete-confirm', function(target, ev) {
  const entity = target.dataset.entity;
  const id = target.dataset.id;
  stDeleteStatus(entity, id);
});

defineAction('settings-st-delete-initiate', function(target, ev) {
  stConfirmDeleteId = target.dataset.id;
  renderPage();
});

defineAction('settings-st-delete-cancel', function(target, ev) {
  stConfirmDeleteId = null;
  renderPage();
});

defineAction('settings-st-add-status', function(target, ev) {
  const entity = target.dataset.entity;
  stAddStatus(entity);
});

// ─ Lost Reasons ─
defineAction('settings-lr-add-new', function(target, ev) {
  lostReasonAddNew();
});

defineAction('settings-lr-move', function(target, ev) {
  const id = target.dataset.id;
  const direction = parseInt(target.dataset.direction, 10);
  lostReasonMove(id, direction);
});

defineAction('settings-lr-rename', function(target, ev) {
  const id = target.dataset.id;
  lostReasonRename(id, target.value);
});

defineAction('settings-lr-toggle-active', function(target, ev) {
  const id = target.dataset.id;
  lostReasonToggleActive(id);
});

// ─ Tags ─
defineAction('settings-tag-remove', function(target, ev) {
  const tag = target.dataset.tag;
  tags = tags.filter(x => x !== tag);
  renderPage();
  addToast('Tag removed', 'warning');
});

defineAction('settings-tag-add', function(target, ev) {
  const v = document.getElementById('newTag').value;
  if (v) {
    tags = [...tags, v];
    addToast('Tag added', 'success');
    document.getElementById('newTag').value = '';
    renderPage();
  }
});

defineAction('settings-tag-input-keydown', function(target, ev) {
  if (ev.key === 'Enter' && target.value) {
    tags = [...tags, target.value];
    addToast('Tag added', 'success');
    target.value = '';
    renderPage();
  }
});

// ─ SMS Templates ─
defineAction('settings-sms-new-template', function(target, ev) {
  smsTemplateNew();
});

defineAction('settings-sms-edit-template', function(target, ev) {
  const id = target.dataset.id;
  smsTemplateEdit(id);
});

defineAction('settings-sms-delete-template', function(target, ev) {
  const id = target.dataset.id;
  smsTemplateDelete(id);
});

defineAction('settings-sms-template-name-input', function(target, ev) {
  smsTemplateDraft = { ...smsTemplateDraft, name: target.value };
});

defineAction('settings-sms-template-body-input', function(target, ev) {
  const count = target.value.length;
  const charColor = count > 160 ? '#dc2626' : count > 140 ? '#f59e0b' : '#6b7280';
  document.getElementById('smstplCount').textContent = count + '/160';
  document.getElementById('smstplCount').style.color = charColor;
  smsTemplateDraft = { ...smsTemplateDraft, body: target.value };
});

defineAction('settings-sms-cancel-template', function(target, ev) {
  smsTemplateCancel();
});

defineAction('settings-sms-save-template', function(target, ev) {
  smsTemplateSave();
});

defineAction('settings-sms-seed-defaults', function(target, ev) {
  smsTemplateSeedDefaults();
});

// ─ Phone & IVR ─
defineAction('settings-phone-reconnect', function(target, ev) {
  if (typeof twilioInit === 'function') {
    twilioInit(true);
    addToast('Reconnecting...', 'info');
  }
});

defineAction('settings-phone-test-call', function(target, ev) {
  phoneTestCall();
});

defineAction('settings-phone-add-menu-row', function(target, ev) {
  phoneSettingsAddMenuRow();
});

defineAction('settings-phone-remove-menu-row', function(target, ev) {
  const digit = target.dataset.digit;
  phoneSettingsRemoveMenuRow(digit);
});

defineAction('settings-phone-save', function(target, ev) {
  phoneSettingsSave();
});

// ─ Commission Rules ─
defineAction('settings-comm-default-baseRate-change', function(target, ev) {
  setCommissionDefault('baseRate', target.value);
});

defineAction('settings-comm-default-ageThresholdDays-change', function(target, ev) {
  setCommissionDefault('ageThresholdDays', target.value);
});

defineAction('settings-comm-default-agePenaltyPct-change', function(target, ev) {
  setCommissionDefault('agePenaltyPct', target.value);
});

defineAction('settings-comm-default-realisationGate-change', function(target, ev) {
  setCommissionDefault('realisationGate', target.value);
});

defineAction('settings-comm-perRep-baseRate-change', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'baseRate', target.value);
});

defineAction('settings-comm-perRep-ageThresholdDays-change', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'ageThresholdDays', target.value);
});

defineAction('settings-comm-perRep-agePenaltyPct-change', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'agePenaltyPct', target.value);
});

defineAction('settings-comm-perRep-realisationGate-change', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'realisationGate', target.value);
});

defineAction('settings-comm-perBranch-baseRate-change', function(target, ev) {
  const branch = target.dataset.branch;
  setCommissionPerBranch(branch, target.value);
});

defineAction('settings-comm-multiplier-add', function(target, ev) {
  addCommissionMultiplier();
});

defineAction('settings-comm-multiplier-productKey-change', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionMultiplier(idx, 'productKey', target.value);
});

defineAction('settings-comm-multiplier-label-change', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionMultiplier(idx, 'label', target.value);
});

defineAction('settings-comm-multiplier-multiplier-change', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionMultiplier(idx, 'multiplier', target.value);
});

defineAction('settings-comm-multiplier-remove', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  removeCommissionMultiplier(idx);
});

defineAction('settings-comm-bonus-add', function(target, ev) {
  addCommissionBonus();
});

defineAction('settings-comm-bonus-threshold-change', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionBonus(idx, 'threshold', target.value);
});

defineAction('settings-comm-bonus-bonusPct-change', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionBonus(idx, 'bonusPct', target.value);
});

defineAction('settings-comm-bonus-remove', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  removeCommissionBonus(idx);
});

// ─ Installers ─
defineAction('settings-inst-add-installer', function(target, ev) {
  const name = prompt('Installer name:');
  if (!name) return;
  const phone = prompt('Phone number (optional):', '');
  const branch = prompt('Branch (VIC/ACT/SA/TAS):', 'VIC');
  addInstaller(name, phone || '', branch || 'VIC');
});

defineAction('settings-inst-toggle-active', function(target, ev) {
  const instId = target.dataset.instId;
  const l = getInstallers();
  const updated = l.map(function(i) {
    return i.id === instId ? Object.assign({}, i, { active: !i.active }) : i;
  });
  saveInstallers(updated);
  renderPage();
});

defineAction('settings-inst-remove', function(target, ev) {
  const instId = target.dataset.instId;
  removeInstaller(instId);
});

defineAction('settings-targets-blur', function(target, ev) {
  const branch = target.dataset.branch;
  const t = Object.assign({}, getState().weeklyTargets || {});
  t[branch] = parseInt(target.value, 10) || 0;
  setState({ weeklyTargets: t });
});

// ─ Users & Roles ─
defineAction('settings-user-add', function(target, ev) {
  adminAddUser();
});

defineAction('settings-user-edit', function(target, ev) {
  const userId = target.dataset.userId;
  adminEditUser(userId);
});

defineAction('settings-user-toggle', function(target, ev) {
  const userId = target.dataset.userId;
  adminToggleUser(userId);
});

defineAction('settings-tab-switch', function(target, ev) {
  settTab = target.dataset.tab;
  renderPage();
});

defineAction('settings-tab-mouseover', function(target, ev) {
  target.style.background = '#f9fafb';
});

defineAction('settings-tab-mouseout', function(target, ev) {
  const isActive = settTab === target.dataset.tab;
  target.style.background = isActive ? '#fff5f6' : 'transparent';
});

// ─ Lost Reasons (string-concat migrations) ─
defineAction('settings-lr-move-button', function(target, ev) {
  const id = target.dataset.id;
  const direction = parseInt(target.dataset.direction, 10);
  lostReasonMove(id, direction);
});

defineAction('settings-lr-rename-input', function(target, ev) {
  const id = target.dataset.id;
  lostReasonRename(id, target.value);
});

defineAction('settings-lr-toggle-active-button', function(target, ev) {
  const id = target.dataset.id;
  lostReasonToggleActive(id);
});

// ─ SMS Templates (string-concat migrations) ─
defineAction('settings-sms-template-name-change', function(target, ev) {
  smsTemplateDraft = { ...smsTemplateDraft, name: target.value };
});

defineAction('settings-sms-template-body-change', function(target, ev) {
  smsTemplateDraft = { ...smsTemplateDraft, body: target.value };
  document.getElementById('smstplCount').textContent = target.value.length + '/160';
  document.getElementById('smstplCount').style.color = target.value.length > 160 ? '#dc2626' : target.value.length > 140 ? '#f59e0b' : '#6b7280';
});

defineAction('settings-sms-edit-button', function(target, ev) {
  const id = target.dataset.id;
  smsTemplateEdit(id);
});

defineAction('settings-sms-delete-button', function(target, ev) {
  const id = target.dataset.id;
  smsTemplateDelete(id);
});

// ─ Phone & IVR (string-concat migrations) ─
defineAction('settings-phone-remove-menu-button', function(target, ev) {
  const digit = target.dataset.digit;
  phoneSettingsRemoveMenuRow(digit);
});

// ─ Commission Rules defaults (string-concat migrations) ─
defineAction('settings-comm-default-baseRate-input', function(target, ev) {
  setCommissionDefault('baseRate', target.value);
});

defineAction('settings-comm-default-ageThresholdDays-input', function(target, ev) {
  setCommissionDefault('ageThresholdDays', target.value);
});

defineAction('settings-comm-default-agePenaltyPct-input', function(target, ev) {
  setCommissionDefault('agePenaltyPct', target.value);
});

defineAction('settings-comm-default-realisationGate-radio', function(target, ev) {
  setCommissionDefault('realisationGate', target.value);
});

// ─ Commission Rules per-rep (string-concat migrations) ─
defineAction('settings-comm-perRep-baseRate-input', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'baseRate', target.value);
});

defineAction('settings-comm-perRep-ageThresholdDays-input', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'ageThresholdDays', target.value);
});

defineAction('settings-comm-perRep-agePenaltyPct-input', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'agePenaltyPct', target.value);
});

defineAction('settings-comm-perRep-realisationGate-select', function(target, ev) {
  const repName = target.dataset.repName;
  setCommissionPerRep(repName, 'realisationGate', target.value);
});

// ─ Commission Rules per-branch (string-concat migrations) ─
defineAction('settings-comm-perBranch-baseRate-input', function(target, ev) {
  const branch = target.dataset.branch;
  setCommissionPerBranch(branch, target.value);
});

// ─ Commission Rules multipliers (string-concat migrations) ─
defineAction('settings-comm-multiplier-productKey-input', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionMultiplier(idx, 'productKey', target.value);
});

defineAction('settings-comm-multiplier-label-input', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionMultiplier(idx, 'label', target.value);
});

defineAction('settings-comm-multiplier-multiplier-input', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionMultiplier(idx, 'multiplier', target.value);
});

defineAction('settings-comm-multiplier-remove-button', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  removeCommissionMultiplier(idx);
});

// ─ Commission Rules bonuses (string-concat migrations) ─
defineAction('settings-comm-bonus-threshold-input', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionBonus(idx, 'threshold', target.value);
});

defineAction('settings-comm-bonus-bonusPct-input', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  setCommissionBonus(idx, 'bonusPct', target.value);
});

defineAction('settings-comm-bonus-remove-button', function(target, ev) {
  const idx = parseInt(target.dataset.index, 10);
  removeCommissionBonus(idx);
});

// ─ Installers (string-concat migrations) ─
defineAction('settings-inst-add-button', function(target, ev) {
  const name = prompt('Installer name:');
  if (!name) return;
  const phone = prompt('Phone number (optional):', '');
  const branch = prompt('Branch (VIC/ACT/SA/TAS):', 'VIC');
  addInstaller(name, phone || '', branch || 'VIC');
});

defineAction('settings-inst-toggle-active-button', function(target, ev) {
  const instId = target.dataset.instId;
  const l = getInstallers();
  const updated = l.map(function(i) {
    return i.id === instId ? Object.assign({}, i, { active: !i.active }) : i;
  });
  saveInstallers(updated);
  renderPage();
});

defineAction('settings-inst-remove-button', function(target, ev) {
  const instId = target.dataset.instId;
  removeInstaller(instId);
});

defineAction('settings-targets-input-blur', function(target, ev) {
  const branch = target.dataset.branch;
  const t = Object.assign({}, getState().weeklyTargets || {});
  t[branch] = parseInt(target.value, 10) || 0;
  setState({ weeklyTargets: t });
});

// ─ Users (string-concat migrations) ─
defineAction('settings-user-edit-button', function(target, ev) {
  const userId = target.dataset.userId;
  adminEditUser(userId);
});

defineAction('settings-user-toggle-button', function(target, ev) {
  const userId = target.dataset.userId;
  adminToggleUser(userId);
});

// FIX 4: CUSTOM STATUS HELPERS
// ══════════════════════════════════════════════════════════════════════════════

// Get hex colour for a status label from the appropriate list
function getDealStatusColor(label) {
  const st = getState().dealStatuses.find(s => s.label === label);
  return st ? st.col : '#9ca3af';
}
function getJobStatusColor(label) {
  const st = getState().jobStatuses.find(s => s.label === label);
  return st ? st.col : '#9ca3af';
}

// Render a coloured dot + label badge using custom status colours
function CustomStatusBadge(label, type) {
  let col = '#9ca3af';
  if (type === 'deal') col = getDealStatusColor(label);
  else if (type === 'job') col = getJobStatusColor(label);
  else if (type === 'lead') { const s = getState().leadStatuses.find(x => x.label === label); if (s) col = s.col; }
  else if (type === 'contact') { const s = getState().contactStatuses.find(x => x.label === label); if (s) col = s.col; }
  return '<span class="bdg" style="background:' + col + '22;color:' + col + ';border:1px solid ' + col + '55">' + label + '</span>';
}



// ── Settings state variables ──────────────────────────────────────────────────
let settTab = 'pipelines';
let tags = ['premium','new','urgent','commercial','renovation','heritage','strata'];
let cfEntityTab = 'deals';   // 'deals' or 'jobs' for custom fields tab
let cfAddingNew = false;     // showing the add-new-field inline form
let cfEditingId = null;      // id of field being edited
let cfNewForm = {label:'',type:'text',options:[],required:false,newOpt:''};
let stEntityTab = 'deals';   // 'deals','leads','contacts' for statuses tab
let stEditingId = null;
let stConfirmDeleteId = null;

function renderSettings(){
  const {dealFields,dealStatuses,leadStatuses,contactStatuses,leadFields,contactFields} = getState();
  // Brief 4 Phase 5: gate Commission Rules to admin + sales_manager. Other
  // tabs aren't role-filtered today (the page assumes any logged-in user
  // who reaches Settings has access). Filtering at the TABS-array level
  // hides the tab from non-privileged users entirely.
  const _settCu = (typeof getCurrentUser === 'function') ? getCurrentUser() || {} : {};
  const _canSeeCommissionRules = _settCu.role === 'admin' || _settCu.role === 'sales_manager';
  const TABS=[
    ['email','Email & Gmail'],
    ['pipelines','Pipeline Manager'],
    ['customfields','Custom Fields'],
    ['statuses','Statuses'],
    ['lostreasons','Lost Reasons'],
    ['tags','Tags'],
    ['smstemplates','SMS Templates'],
    ['phoneivr','Phone & IVR'],
    ...(_canSeeCommissionRules ? [['commission_rules','Commission Rules']] : []),
    ['installers','Installers'],
    ['users','Users & Roles'],
  ];
  let content='';

  // ── EMAIL & GMAIL ─────────────────────────────────────────────────────────
  if(settTab==='email'){
    const { gmailConnected, gmailUser } = getState();
    content=`
      <div style="max-width:540px">

        <!-- Connection status banner -->
        <div style="padding:16px;border-radius:12px;border:1px solid ${gmailConnected?'#86efac':'#e5e7eb'};background:${gmailConnected?'#f0fdf4':'#f9fafb'};margin-bottom:24px;display:flex;align-items:center;gap:12px">
          ${gmailConnected?`
            ${gmailUser&&gmailUser.picture?`<img src="${gmailUser.picture}" referrerpolicy="no-referrer" style="width:40px;height:40px;border-radius:50%;flex-shrink:0">`:
              `<div style="width:40px;height:40px;border-radius:50%;background:#EA4335;color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">G</div>`}
            <div style="flex:1">
              <div style="font-size:14px;font-weight:700;color:#15803d">✓ Gmail Connected</div>
              <div style="font-size:12px;color:#16a34a">${gmailUser?gmailUser.email:''} ${gmailUser?'· '+gmailUser.name:''}</div>
            </div>
            <button data-action="settings-gmail-disconnect" class="btn-w" style="font-size:12px;padding:6px 14px;color:#b91c1c;border-color:#fca5a5">Disconnect</button>
          `:`
            <div style="width:40px;height:40px;border-radius:50%;background:#f3f4f6;color:#9ca3af;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0">📧</div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600;color:#374151">Gmail Not Connected</div>
              <div style="font-size:12px;color:#9ca3af">Connect to send emails directly from Spartan CRM</div>
            </div>
            <button data-action="settings-gmail-connect" class="btn-r" style="font-size:13px;padding:8px 18px;gap:8px">
              <svg width="14" height="14" viewBox="0 0 24 24" style="flex-shrink:0"><path fill="#fff" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
              Connect Gmail
            </button>`}
        </div>

        <!-- Google Client ID input -->
        <div style="margin-bottom:20px">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Google OAuth Client ID</label>
          <div style="display:flex;gap:8px">
            <input class="inp" id="gmailClientId" value="${GMAIL_CLIENT_ID||''}" placeholder="123456789-abc….apps.googleusercontent.com" style="font-size:12px;font-family:monospace;flex:1">
            <button data-action="settings-gmail-save-client-id" class="btn-r" style="font-size:12px;white-space:nowrap">Save</button>
          </div>
          <p style="font-size:12px;color:#9ca3af;margin:8px 0 0;line-height:1.6">Your Client ID stays in your browser only and is never sent to any server.</p>
        </div>

        <!-- Google Maps API Key -->
        <div style="margin-bottom:20px">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Google Maps API Key <span style="font-size:11px;font-weight:400;color:#9ca3af">(for address autocomplete)</span></label>
          <div style="display:flex;gap:8px">
            <input class="inp" id="mapsApiKey" value="${MAPS_API_KEY||''}" placeholder="AIzaSy…" style="font-size:12px;font-family:monospace;flex:1">
            <button data-action="settings-maps-save-key" class="btn-r" style="font-size:12px;white-space:nowrap">Save</button>
            <button data-action="settings-maps-test-key" class="btn-w" style="font-size:12px;white-space:nowrap" title="Force-reload Google Maps and see if it works">Test</button>
          </div>
          <div id="mapsStatus" style="margin-top:8px;font-size:12px">
            ${_mapsLoaded
              ? '<span style="color:#15803d">✓ Maps loaded and working</span>'
              : (_mapsLoadError
                  ? '<span style="color:#b91c1c">✗ '+_mapsLoadError+'</span>'
                  : (MAPS_API_KEY ? '<span style="color:#9ca3af">Maps not yet loaded — click Test to check</span>' : '<span style="color:#9ca3af">No key set</span>'))}
          </div>
          <p style="font-size:12px;color:#9ca3af;margin:8px 0 0;line-height:1.6">Enable <strong>Places API</strong> and <strong>Maps JavaScript API</strong> in your Google Cloud project. Create an API key under Credentials. If you restrict the key by HTTP referrer, include <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">spaartan.tech/*</code> and <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">*.spaartan.tech/*</code>.</p>
        </div>

        <!-- Setup instructions -->
        <div style="background:#f8faff;border:1px solid #bfdbfe;border-radius:12px;padding:18px">
          <div style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:12px">⚙️ Setup Instructions</div>
          <ol style="font-size:13px;color:#374151;line-height:1.9;margin:0;padding-left:18px">
            <li>Go to <a href="https://console.cloud.google.com" target="_blank" style="color:#3b82f6">console.cloud.google.com</a></li>
            <li>Create a project (or select existing)</li>
            <li>Enable the <strong>Gmail API</strong>, <strong>Google Calendar API</strong>, <strong>Places API</strong>, and <strong>Maps JavaScript API</strong></li>
            <li>Go to <strong>Credentials → Create OAuth 2.0 Client ID</strong></li>
            <li>Application type: <strong>Web application</strong></li>
            <li>Add to <strong>Authorised JavaScript origins</strong>:<br><code style="font-size:11px;background:#e0e7ff;padding:2px 6px;border-radius:4px">${window.location.origin}</code></li>
            <li>Copy the <strong>Client ID</strong> and paste above</li>
            <li>Click <strong>Connect Gmail</strong></li>
          </ol>
        </div>

        <!-- What's included -->
        <div style="margin-top:20px">
          <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:10px">What you get</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[
              ['✉️','Send emails directly from any deal, lead, or contact page'],
              ['📋','Every sent email is auto-logged to the activity timeline'],
              ['🔍','See Gmail history for any contact — all threads in one place'],
              ['📝','Full email composer with To, Cc, Subject, and your signature'],
              ['🔒','Your OAuth token never leaves your browser'],
            ].map(([em,text])=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f9fafb;border-radius:8px">
              <span style="font-size:16px">${em}</span>
              <span style="font-size:13px;color:#374151">${text}</span>
            </div>`).join('')}
          </div>
        </div>
      </div>
    `;
  } else // ── PIPELINE MANAGER ───────────────────────────────────────────────────────
  if(settTab==='pipelines'){
    content=PIPELINES.map(p=>`<div style="margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="font-weight:700;font-size:14px;margin:0">${p.name}</h4>
        <button class="btn-w" style="font-size:12px" data-action="settings-pipeline-add-stage">+ Add Stage</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${p.stages.map(s=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:10px">
          <div style="width:10px;height:10px;border-radius:50%;background:${s.col};flex-shrink:0"></div>
          <span style="font-size:13px;font-weight:500;flex:1">${s.name}</span>
          <span style="font-size:12px;color:#9ca3af">${s.prob}%</span>
          ${s.isWon?Badge('Won','green'):''}${s.isLost?Badge('Not Proceeding','red'):''}
          <button class="btn-g" style="padding:4px 8px" data-action="settings-pipeline-edit-stage">${Icon({n:'edit',size:13})}</button>
        </div>`).join('')}
      </div>
    </div>`).join('');

  // ── CUSTOM FIELDS ──────────────────────────────────────────────────────────
  } else if(settTab==='customfields'){
    const {leadFields, contactFields} = getState();
    const fieldsMap = {deals:dealFields, leads:leadFields, contacts:contactFields, jobs:getState().jobFields||[]};
    const fields = fieldsMap[cfEntityTab] || dealFields;
    const entityLabel = {deals:'Deal',leads:'Lead',contacts:'Contact',jobs:'Job'}[cfEntityTab]||'Deal';

    // Add new / edit form
    const showForm = cfAddingNew || cfEditingId;
    const editField = cfEditingId ? fields.find(f=>f.id===cfEditingId) : null;
    if(showForm && editField && cfEditingId) {
      cfNewForm = {label:editField.label,type:editField.type,options:[...editField.options],required:editField.required,newOpt:''};
    }

    content=`
      <!-- Entity tabs -->
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${['deals','leads','contacts','jobs'].map(e=>`<button data-action="settings-cf-switch-entity" data-entity="${e}" class="pill${cfEntityTab===e?' on':''}" style="font-family:inherit">${e.charAt(0).toUpperCase()+e.slice(1)}</button>`).join('')}
      </div>

      <!-- Field list -->
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${fields.sort((a,b)=>a.ord-b.ord).map((f,i)=>`
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:10px;${stConfirmDeleteId===f.id?'border:1px solid #fca5a5':''}">
            <!-- Up/Down -->
            <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
              ${i>0?`<button data-action="settings-cf-move-field" data-entity="${cfEntityTab}" data-field-id="${f.id}" data-dir="up" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:1px 4px;font-size:10px;line-height:1" onmouseover="this.style.color='#374151'" onmouseout="this.style.color='#9ca3af'">▲</button>`:'<div style="height:16px"></div>'}
              ${i<fields.length-1?`<button data-action="settings-cf-move-field" data-entity="${cfEntityTab}" data-field-id="${f.id}" data-dir="down" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:1px 4px;font-size:10px;line-height:1" onmouseover="this.style.color='#374151'" onmouseout="this.style.color='#9ca3af'">▼</button>`:'<div style="height:16px"></div>'}
            </div>
            <span style="font-size:13px;font-weight:500;flex:1">${f.label}${f.required?'<span style="color:#c41230;margin-left:2px">*</span>':''}</span>
            <span class="bdg" style="background:#f0f0f0;color:#555;font-size:10px">${CF_TYPE_LABELS[f.type]||f.type}</span>
            <!-- Required toggle -->
            <button data-action="settings-cf-toggle-required" data-entity="${cfEntityTab}" data-field-id="${f.id}" style="font-size:11px;padding:3px 8px;border-radius:20px;border:1px solid;cursor:pointer;font-family:inherit;${f.required?'background:#fee2e2;border-color:#fca5a5;color:#b91c1c':'background:#f9fafb;border-color:#e5e7eb;color:#9ca3af'}">${f.required?'Required':'Optional'}</button>
            <button data-action="settings-cf-edit-field" data-field-id="${f.id}" class="btn-g" style="padding:4px 8px">${Icon({n:'edit',size:13})}</button>
            ${stConfirmDeleteId===f.id?
              `<button data-action="settings-cf-delete-field-confirm" data-entity="${cfEntityTab}" data-field-id="${f.id}" style="font-size:11px;padding:4px 10px;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#b91c1c;cursor:pointer;font-family:inherit;font-weight:600">Confirm delete</button>
               <button data-action="settings-cf-delete-cancel" class="btn-g" style="padding:4px 8px">Cancel</button>`
              :`<button data-action="settings-cf-delete-initiate" data-field-id="${f.id}" class="btn-g" style="padding:4px 8px">${Icon({n:'trash',size:13})}</button>`}
          </div>`).join('')}
      </div>

      <!-- Inline add/edit form -->
      ${showForm?`
      <div style="padding:16px;background:#fff5f6;border-radius:12px;border:1.5px solid #fca5a5;margin-bottom:12px">
        <div style="font-size:13px;font-weight:700;margin-bottom:12px">${cfEditingId?'Edit Field':'Add New '+entityLabel+' Field'}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
          <div>
            <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Label *</label>
            <input class="inp" id="cfNewLabel" value="${cfNewForm.label}" placeholder="Field name" style="font-size:13px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Type</label>
            <select class="sel" id="cfNewType" style="font-size:13px" data-on-change="settings-cf-type-change">
              ${Object.entries(CF_TYPE_LABELS).map(([k,v])=>`<option value="${k}" ${cfNewForm.type===k?'selected':''}>${v}</option>`).join('')}
            </select>
          </div>
        </div>
        ${(cfNewForm.type==='dropdown'||cfNewForm.type==='multiselect')?`
        <div style="margin-bottom:10px">
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Options</label>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:6px">
            ${cfNewForm.options.map((o,i)=>`<div style="display:flex;gap:6px;align-items:center">
              <span style="font-size:13px;flex:1;padding:5px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:6px">${o}</span>
              <button data-action="settings-cf-option-remove" data-index="${i}" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px;line-height:1;padding:0 4px">×</button>
            </div>`).join('')}
          </div>
          <div style="display:flex;gap:6px">
            <input class="inp" id="cfNewOpt" placeholder="Add option…" style="font-size:12px" onkeydown="if(event.key==='Enter'){const v=this.value.trim();if(v){cfNewForm.options=[...cfNewForm.options,v];this.value='';renderPage();}}">
            <button class="btn-w" style="font-size:12px;white-space:nowrap" data-action="settings-cf-option-add">+ Add</button>
          </div>
        </div>`:''}
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px">
            <input type="checkbox" ${cfNewForm.required?'checked':''} data-on-change="settings-cf-required-toggle" style="accent-color:#c41230;width:14px;height:14px">
            Required field
          </label>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-w" data-action="settings-cf-cancel">Cancel</button>
          <button class="btn-r" data-action="settings-cf-save-field" data-entity="${cfEntityTab}" data-edit-id="${cfEditingId||''}">Save Field</button>
        </div>
      </div>`:''}

      <!-- Add field button -->
      ${!showForm?`<button class="btn-r" data-action="settings-cf-add-new">${Icon({n:'plus',size:14})} Add Field</button>`:''}
    `;

  // ── STATUSES ───────────────────────────────────────────────────────────────
  } else if(settTab==='statuses'){
    const stLists = {deals:dealStatuses,leads:leadStatuses,contacts:contactStatuses};
    const stList = stLists[stEntityTab] || [];
    const allEntityRecords = {
      deals: getState().deals,
      leads: getState().leads,
      contacts: getState().contacts,
    };
    const records = allEntityRecords[stEntityTab] || [];
    const usageCount = label => records.filter(r => r.status === label).length;

    content=`
      <!-- Entity tabs -->
      <div style="display:flex;gap:8px;margin-bottom:16px">
        ${['deals','leads','contacts'].map(e=>`<button data-action="settings-st-switch-entity" data-entity="${e}" class="pill${stEntityTab===e?' on':''}" style="font-family:inherit">${e.charAt(0).toUpperCase()+e.slice(1)}</button>`).join('')}
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
        ${stList.map((st,i)=>`
          <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:10px">
            <!-- Colour dot with picker -->
            <div style="position:relative">
              <div data-action="settings-st-open-color-picker" data-entity="${stEntityTab}" data-id="${st.id}" style="width:20px;height:20px;border-radius:50%;background:${st.col};cursor:pointer;border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,.15);flex-shrink:0"></div>
              <div id="colorPicker_${st.id}" style="display:none;position:absolute;top:26px;left:0;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.12);z-index:100;display:none;flex-wrap:wrap;gap:6px;width:168px">
                ${STATUS_COLORS.map(col=>`<div data-action="settings-st-set-color" data-entity="${stEntityTab}" data-id="${st.id}" data-col="${col}" style="width:22px;height:22px;border-radius:50%;background:${col};cursor:pointer;border:2px solid ${st.col===col?'#1a1a1a':'transparent'}" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform=''"></div>`).join('')}
              </div>
            </div>
            <!-- Editable label -->
            ${stEditingId===st.id?
              `<input id="stLabelInput_${st.id}" class="inp" value="${st.label}" style="font-size:13px;flex:1" onkeydown="if(event.key==='Enter')stSaveLabel('${stEntityTab}','${st.id}')">
               <button data-action="settings-st-save-label" data-entity="${stEntityTab}" data-id="${st.id}" class="btn-r" style="font-size:11px;padding:4px 10px">Save</button>
               <button data-action="settings-st-cancel-label" class="btn-w" style="font-size:11px;padding:4px 10px">Cancel</button>`
              :`<span style="font-size:13px;font-weight:500;flex:1;cursor:pointer" data-action="settings-st-edit-label" data-id="${st.id}" title="Click to edit">${st.label}</span>`}
            <!-- Default badge -->
            ${st.isDefault?`<span class="bdg" style="background:#dbeafe;color:#1e40af;font-size:10px">Default</span>`:''}
            <!-- Won/Lost toggles (deals only) -->
            ${stEntityTab==='deals'?`
              <button data-action="settings-st-toggle-won" data-id="${st.id}" style="font-size:10px;padding:3px 8px;border-radius:20px;border:1px solid;cursor:pointer;font-family:inherit;${st.isWon?'background:#dcfce7;border-color:#86efac;color:#15803d':'background:#f9fafb;border-color:#e5e7eb;color:#9ca3af'}">Won</button>
              <button data-action="settings-st-toggle-lost" data-id="${st.id}" style="font-size:10px;padding:3px 8px;border-radius:20px;border:1px solid;cursor:pointer;font-family:inherit;${st.isLost?'background:#fee2e2;border-color:#fca5a5;color:#b91c1c':'background:#f9fafb;border-color:#e5e7eb;color:#9ca3af'}">Not Proceeding</button>
            `:''}
            <!-- Set default -->
            ${!st.isDefault?`<button data-action="settings-st-set-default" data-entity="${stEntityTab}" data-id="${st.id}" class="btn-g" style="font-size:11px;padding:4px 8px">Set default</button>`:''}
            <!-- Delete -->
            ${(()=>{
              const cnt = usageCount(st.label);
              if(cnt>0) return `<span style="font-size:11px;color:#9ca3af;cursor:default" title="${cnt} records use this status">${cnt} in use</span>`;
              if(stConfirmDeleteId===st.id)
                return `<button data-action="settings-st-delete-confirm" data-entity="${stEntityTab}" data-id="${st.id}" style="font-size:11px;padding:4px 10px;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#b91c1c;cursor:pointer;font-family:inherit;font-weight:600">Confirm</button>
                  <button data-action="settings-cf-delete-cancel" class="btn-g" style="padding:4px 8px">Cancel</button>`;
              return `<button data-action="settings-cf-delete-initiate" data-field-id="${st.id}" class="btn-g" style="padding:4px 8px">${Icon({n:'trash',size:13})}</button>`;
            })()}
          </div>`).join('')}
      </div>
      <button class="btn-r" data-action="settings-st-add-status" data-entity="${stEntityTab}">${Icon({n:'plus',size:14})} Add Status</button>
    `;

  // ── LOST REASONS (Brief 1) ─────────────────────────────────────────────────
  } else if(settTab==='lostreasons'){
    var _cuLR = getCurrentUser() || {};
    var _canEditLR = _cuLR.role === 'admin' || _cuLR.role === 'sales_manager';
    var _lrList = (typeof getLostReasons === 'function') ? getLostReasons() : [];
    if (!_canEditLR) {
      content = '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">Only admins and sales managers can manage Lost Reasons.</div>';
    } else {
      content = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div style="font-size:13px;color:#6b7280">${_lrList.length} reason${_lrList.length!==1?'s':''} · drag-handle replaced with up/down for v1</div>
          <button class="btn-r" data-action="settings-lr-add-new" style="font-size:12px">+ Add reason</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${_lrList.map(function(r, i){
            var isFirst = i === 0;
            var isLast  = i === _lrList.length - 1;
            return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:'+(r.active?'#fff':'#f9fafb')+';border:1px solid #e5e7eb;border-radius:10px">'
              +   '<div style="display:flex;flex-direction:column;gap:2px">'
              +     (isFirst ? '<div style="height:14px"></div>' : '<button data-action="settings-lr-move-button" data-id="'+r.id+'" data-direction="-1" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px;line-height:1;padding:1px 4px">▲</button>')
              +     (isLast  ? '<div style="height:14px"></div>' : '<button data-action="settings-lr-move-button" data-id="'+r.id+'" data-direction="1" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px;line-height:1;padding:1px 4px">▼</button>')
              +   '</div>'
              +   '<input id="lr_label_'+r.id+'" class="inp" value="'+(r.label||'').replace(/"/g,'&quot;')+'" data-action="settings-lr-rename-input" data-id="'+r.id+'" style="flex:1;font-size:13px"'+(r.active?'':' disabled')+'>'
              +   '<span style="font-size:10px;font-family:monospace;color:#9ca3af;width:90px;text-align:right">'+r.id+'</span>'
              +   '<button data-action="settings-lr-toggle-active-button" data-id="'+r.id+'" class="btn-w" style="font-size:11px;padding:4px 10px;'+(r.active?'':'background:#fef9c3;border-color:#fde68a;color:#92400e')+'">'+(r.active?'Active':'Inactive')+'</button>'
              + '</div>';
          }).join('')}
        </div>
        <div style="margin-top:18px;padding:14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
          <div style="font-size:12px;color:#475569;line-height:1.7">
            <strong style="color:#0369a1">Heads-up:</strong> Deactivating a reason hides it from the modal but leaves historical references intact — existing lost deals keep their original reason. Renaming a reason changes how it shows in reports without breaking any links. Don't delete reasons; deactivate them instead so historical data stays meaningful.
          </div>
        </div>
      `;
    }

  // ── TAGS ────────────────────────────────────────────────────────────────────
  } else if(settTab==='tags'){
    content=`<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px">
        ${tags.map(t=>`<div style="display:flex;align-items:center;gap:6px;padding:5px 12px;background:#f3f4f6;border-radius:20px;font-size:13px">
          <span>${t}</span>
          <button data-action="settings-tag-remove" data-tag="${t}" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:16px;line-height:1;padding:0">×</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px">
        <input class="inp" id="newTag" placeholder="New tag name…" onkeydown="if(event.key==='Enter'&&this.value){tags=[...tags,this.value];addToast('Tag added','success');this.value='';renderPage()}" style="max-width:220px">
        <button class="btn-r" data-action="settings-tag-add">Add</button>
      </div>`;

  // ── SMS TEMPLATES (stage 4) ─────────────────────────────────────────────────
  } else if(settTab==='smstemplates'){
    var _tpls = getState().smsTemplates || [];
    var _editingId = (typeof smsTemplateEditId !== 'undefined') ? smsTemplateEditId : null;
    var _draft = (typeof smsTemplateDraft !== 'undefined' && smsTemplateDraft) ? smsTemplateDraft : { id:'', name:'', body:'' };
    var _editing = _editingId ? _tpls.find(function(t){return t.id===_editingId;}) : (_editingId === 'new' ? _draft : null);

    content=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
        <div style="font-size:13px;color:#6b7280">${_tpls.length} template${_tpls.length!==1?'s':''} · 160-char single segment recommended</div>
        ${_editingId ? '' : '<button class="btn-r" data-action="settings-sms-new-template" style="font-size:12px">+ New Template</button>'}
      </div>

      ${_editing ? (function(){
        var bodyChars = (_editing.body || '').length;
        var charColor = bodyChars > 160 ? '#dc2626' : bodyChars > 140 ? '#f59e0b' : '#6b7280';
        return `<div style="padding:14px;background:#fff5f6;border:1.5px solid #fca5a5;border-radius:12px;margin-bottom:14px">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px">${_editingId==='new'?'New Template':'Edit Template'}</div>
          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Name</label>
          <input id="smstplName" class="inp" value="${(_editing.name||'').replace(/"/g,'&quot;')}" placeholder="e.g. On My Way" style="font-size:13px;margin-bottom:10px" data-action="settings-sms-template-name-change">

          <label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">Body (use {{firstName}}, {{repName}}, {{dealTitle}}, {{suburb}})</label>
          <textarea id="smstplBody" class="inp" rows="3" placeholder="Type the SMS body…" style="font-size:13px;resize:none;border-radius:8px;padding:8px 10px;margin-bottom:6px" data-action="settings-sms-template-body-change">${(_editing.body||'').replace(/</g,'&lt;')}</textarea>
          <div id="smstplCount" style="font-size:11px;color:${charColor};margin-bottom:12px">${bodyChars}/160</div>

          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button class="btn-w" data-action="settings-sms-cancel-template" style="font-size:12px">Cancel</button>
            <button class="btn-r" data-action="settings-sms-save-template" style="font-size:12px">Save</button>
          </div>
        </div>`;
      })() : ''}

      <div style="display:flex;flex-direction:column;gap:8px">
        ${_tpls.length === 0 ? '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">No SMS templates yet. Click + New Template to create one.</div>' : ''}
        ${_tpls.map(function(t){
          return '<div style="padding:12px 14px;background:#f9fafb;border-radius:10px">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
              + '<div style="font-size:13px;font-weight:600">' + t.name + '</div>'
              + '<div style="display:flex;gap:6px">'
                + '<button data-action="settings-sms-edit-button" data-id="'+t.id+'" class="btn-g" style="font-size:11px;padding:3px 10px">Edit</button>'
                + '<button data-action="settings-sms-delete-button" data-id="'+t.id+'" class="btn-g" style="font-size:11px;padding:3px 10px;color:#b91c1c">Delete</button>'
              + '</div>'
            + '</div>'
            + '<div style="font-size:12px;color:#374151;background:#fff;padding:8px 10px;border-radius:6px;border:1px solid #e5e7eb;line-height:1.5">' + (t.body || '') + '</div>'
          + '</div>';
        }).join('')}
      </div>

      ${_tpls.length === 0 ? '<div style="margin-top:16px"><button class="btn-w" data-action="settings-sms-seed-defaults" style="font-size:12px">📥 Seed 5 default templates</button></div>' : ''}
    `;

  // ── PHONE & IVR (stage 6) ───────────────────────────────────────────────────
  } else if(settTab==='phoneivr'){
    var _isAdmin = (getCurrentUser()||{}).role === 'admin';
    if (!_isAdmin) {
      content = '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">Only admins can manage phone & IVR settings.</div>';
    } else {
      var _ps = getState().phoneSettings || {};
      var _greeting = _ps.greeting || '';
      var _vmGreeting = _ps.voicemail_greeting || '';
      var _voiceName = _ps.voice_name || 'Polly.Nicole';
      var _menu = _ps.ivr_menu || {};
      var _bh = _ps.business_hours || { days:['Mon','Tue','Wed','Thu','Fri'], open_hour:8, close_hour:17 };

      var todayCount = (getState().callLogs || []).filter(function(c){
        if (!c.started_at) return false;
        return c.started_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
      }).length;
      var lastCall = (getState().callLogs || [])[0];
      var lastCallLabel = lastCall ? new Date(lastCall.started_at).toISOString().slice(0, 16).replace('T', ' ') : 'Never';

      content=`
        <!-- Connection status -->
        <div style="padding:16px;background:${window._twilioReady?'#f0fdf4':'#fef9c3'};border:1px solid ${window._twilioReady?'#86efac':'#fde68a'};border-radius:12px;margin-bottom:20px;display:flex;align-items:center;gap:14px">
          <div style="font-size:24px">${window._twilioReady?'✓':'⚠'}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:700;color:${window._twilioReady?'#15803d':'#92400e'}">${window._twilioReady?'Phone connected':'Phone not connected'}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">Account ${(window.TWILIO_ACCOUNT_SID_HINT||'AC...').slice(0,8)}… · Last call: ${lastCallLabel} · ${todayCount} calls today</div>
          </div>
          <div style="display:flex;gap:8px">
            <button data-action="settings-phone-reconnect" class="btn-w" style="font-size:12px">Reconnect</button>
            <button data-action="settings-phone-test-call" class="btn-r" style="font-size:12px">Test call</button>
          </div>
        </div>

        <!-- Greeting -->
        <div style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Greeting (played to inbound callers during business hours)</label>
          <textarea id="ps_greeting" class="inp" rows="3" style="font-size:13px;resize:vertical;border-radius:8px;padding:8px 10px">${_greeting.replace(/</g,'&lt;')}</textarea>
        </div>

        <!-- Voicemail greeting -->
        <div style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Voicemail greeting (after-hours / no-answer)</label>
          <textarea id="ps_vmGreeting" class="inp" rows="3" style="font-size:13px;resize:vertical;border-radius:8px;padding:8px 10px">${_vmGreeting.replace(/</g,'&lt;')}</textarea>
        </div>

        <!-- Voice picker -->
        <div style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Voice</label>
          <select id="ps_voiceName" class="sel" style="font-size:13px;max-width:260px">
            <option value="Polly.Nicole" ${_voiceName==='Polly.Nicole'?'selected':''}>Nicole (AU female)</option>
            <option value="Polly.Russell" ${_voiceName==='Polly.Russell'?'selected':''}>Russell (AU male)</option>
            <option value="Polly.Olivia-Neural" ${_voiceName==='Polly.Olivia-Neural'?'selected':''}>Olivia (AU female, neural)</option>
          </select>
        </div>

        <!-- Business hours -->
        <div style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Business hours (calls outside this window go straight to voicemail)</label>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <div>
              <span style="font-size:12px;color:#6b7280;margin-right:6px">Open</span>
              <input id="ps_openHour" type="number" min="0" max="23" value="${_bh.open_hour}" class="inp" style="width:70px;font-size:13px">
            </div>
            <div>
              <span style="font-size:12px;color:#6b7280;margin-right:6px">Close</span>
              <input id="ps_closeHour" type="number" min="0" max="23" value="${_bh.close_hour}" class="inp" style="width:70px;font-size:13px">
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-left:6px">
              ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(function(d){
                var on = (_bh.days||[]).indexOf(d) >= 0;
                return '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:4px 9px;border-radius:6px;cursor:pointer;background:'+(on?'#dcfce7':'#f3f4f6')+';border:1px solid '+(on?'#86efac':'#e5e7eb')+'"><input type="checkbox" class="ps-day-cb" data-day="'+d+'" '+(on?'checked':'')+' style="width:12px;height:12px;accent-color:#15803d">'+d+'</label>';
              }).join('')}
            </div>
          </div>
        </div>

        <!-- IVR menu -->
        <div style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;color:#374151;display:block;margin-bottom:6px">IVR menu (digit → label → roles to ring)</label>
          <div id="ps_menuRows" style="display:flex;flex-direction:column;gap:6px">
            ${Object.keys(_menu).sort().map(function(d){
              var row = _menu[d] || {};
              return '<div class="ps-menu-row" data-digit="'+d+'" style="display:flex;gap:8px;align-items:center;padding:8px 10px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">'
                + '<span style="font-size:14px;font-weight:700;width:28px;text-align:center">'+d+'</span>'
                + '<input class="inp ps-menu-label" value="'+(row.label||'').replace(/"/g,'&quot;')+'" placeholder="Sales" style="font-size:12px;width:160px">'
                + '<input class="inp ps-menu-roles" value="'+((row.roles||[]).join(', ')).replace(/"/g,'&quot;')+'" placeholder="sales_rep, sales_manager" style="font-size:12px;flex:1;font-family:monospace">'
                + '<button data-action="settings-phone-remove-menu-button" data-digit="'+d+'" class="btn-g" style="font-size:11px;padding:4px 10px;color:#b91c1c">Remove</button>'
              + '</div>';
            }).join('')}
          </div>
          <div style="margin-top:8px">
            <button data-action="settings-phone-add-menu-row" class="btn-w" style="font-size:12px">+ Add menu option</button>
          </div>
        </div>

        <div style="display:flex;justify-content:flex-end;padding-top:12px;border-top:1px solid #f0f0f0;gap:8px">
          <button data-action="settings-phone-save" class="btn-r" style="font-size:13px;padding:8px 18px">Save settings</button>
        </div>

        <!-- Info -->
        <div style="margin-top:20px;padding:12px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12px;color:#475569;line-height:1.7">
          <strong style="color:#0369a1">Heads-up:</strong> changes propagate to inbound calls within ~60 seconds (backend caches settings to keep call latency low). Account credentials (Auth Token, API keys) are stored in Vercel env vars — they cannot be edited here.
        </div>
      `;
    }

  // ── SMS (legacy stub kept for now) ──────────────────────────────────────────
  } else if(settTab==='_disabled_sms'){
    content=[
      ['Measure Confirmation','Hi {firstName}, your measure appointment is confirmed for {date} at {time}. Our team will be in touch if anything changes. – Spartan DG'],
      ['Quote Ready','Hi {firstName}, your quote for {suburb} is ready to view. Click: {link}. Call 1300 912 161 with any questions. – Spartan DG'],
      ['Installation Reminder','Hi {firstName}, your installation at {address} is scheduled for {date}. Please ensure access from 7am. – Spartan DG'],
      ['Invoice Sent','Hi {firstName}, invoice {invoiceNumber} for ${amount} has been emailed. Due {dueDate}. EFT: BSB 033-001 Acc 123456789. – Spartan DG'],
    ].map(([name,body])=>`<div style="padding:16px 0;border-bottom:1px solid #f9fafb">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600">${name}</div>
        <button class="btn-g" style="font-size:12px;padding:5px 10px" data-action="settings-pipeline-add-stage">${Icon({n:'edit',size:13})} Edit</button>
      </div>
      <div style="font-size:12px;color:#6b7280;background:#f9fafb;padding:12px;border-radius:8px;line-height:1.6">${body}</div>
    </div>`).join('');

  // ── INVOICE SETTINGS ─────────────────────────────────────────────────────────
  } else if(settTab==='_disabled_invoice'){
    content=`<div style="display:flex;flex-direction:column;gap:14px;max-width:420px">
      ${[['Company Name','Spartan Double Glazing Pty Ltd'],['ABN','12 345 678 901'],['Phone','1300 912 161'],['Email','accounts@spartandg.com.au'],['Payment Terms','14 days'],['Bank BSB','033-001'],['Bank Account','123456789']].map(([l,v])=>`
        <div><label style="font-size:12px;font-weight:500;color:#6b7280;display:block;margin-bottom:4px">${l}</label>
        <input class="inp" value="${v}"></div>`).join('')}
      <button class="btn-r" style="width:fit-content" data-action="settings-pipeline-add-stage">Save Settings</button>
    </div>`;

  // ── COMMISSION RULES (Brief 4 Phase 5) ────────────────────────────────────────
  } else if(settTab==='commission_rules'){
    var _ccu = getCurrentUser() || {};
    var _commCanEdit = _ccu.role === 'admin' || _ccu.role === 'sales_manager';
    if (!_commCanEdit || typeof getCommissionRules !== 'function') {
      content = '<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">Only admins and sales managers can manage commission rules.</div>';
    } else {
      var _commRules  = getCommissionRules();
      var _commReps   = (typeof getUsers === 'function') ? getUsers().filter(function(u){return u.active && (u.role==='sales_rep' || u.role==='sales_manager' || u.role==='admin');}) : [];
      var _commBranches = ['VIC','ACT','SA','NSW','QLD','WA','TAS','NT'];
      var _commGateOptions = [['won','Won'],['final_signed','Final Sign-Off'],['final_payment','Final Payment']];
      var _commEsc = function(v){ return (v==null?'':String(v)).replace(/"/g,'&quot;'); };

      // Defaults section — base rate, age threshold/penalty, realisation gate radio
      var defaultsHtml = ''
        + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:18px">'
        +   '<div style="font-size:13px;font-weight:700;margin-bottom:12px">Defaults</div>'
        +   '<p style="font-size:12px;color:#6b7280;margin:0 0 14px;line-height:1.5">Apply to every rep / branch unless overridden below.</p>'
        +   '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">'
        +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Base rate (%)</label>'
        +       '<input type="number" step="0.5" min="0" max="100" value="' + _commEsc(_commRules.defaults.baseRate) + '" data-action="settings-comm-default-baseRate-input" style="width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;font-family:Syne,sans-serif;font-weight:700"></div>'
        +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Age threshold (days)</label>'
        +       '<input type="number" step="1" min="0" value="' + _commEsc(_commRules.defaults.ageThresholdDays) + '" data-action="settings-comm-default-ageThresholdDays-input" style="width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px"></div>'
        +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Age penalty (%)</label>'
        +       '<input type="number" step="0.5" min="0" max="100" value="' + _commEsc(_commRules.defaults.agePenaltyPct) + '" data-action="settings-comm-default-agePenaltyPct-input" style="width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px"></div>'
        +   '</div>'
        +   '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:6px">Realisation gate</label>'
        +     '<div style="display:flex;gap:14px;flex-wrap:wrap">'
        +       _commGateOptions.map(function(opt){
                  var checked = _commRules.defaults.realisationGate === opt[0];
                  return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">'
                       +   '<input type="radio" name="comm_default_gate" value="' + opt[0] + '"' + (checked?' checked':'') + ' data-action="settings-comm-default-realisationGate-radio">'
                       +   '<span>' + opt[1] + '</span>'
                       + '</label>';
                }).join('')
        +     '</div>'
        +   '</div>'
        + '</div>';

      // Per-rep section — table with rate / age threshold / penalty / gate
      var perRepHtml = ''
        + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:18px">'
        +   '<div style="font-size:13px;font-weight:700;margin-bottom:8px">Per Rep Overrides</div>'
        +   '<p style="font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.5">Empty cells use the default. Changes save automatically and audit-log.</p>'
        +   '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">'
        +     '<thead><tr style="background:#f9fafb">'
        +       '<th style="text-align:left;padding:8px;font-weight:600;color:#6b7280">Rep</th>'
        +       '<th style="text-align:center;padding:8px;font-weight:600;color:#6b7280">Rate (%)</th>'
        +       '<th style="text-align:center;padding:8px;font-weight:600;color:#6b7280">Age threshold (d)</th>'
        +       '<th style="text-align:center;padding:8px;font-weight:600;color:#6b7280">Age penalty (%)</th>'
        +       '<th style="text-align:left;padding:8px;font-weight:600;color:#6b7280">Realisation gate</th>'
        +     '</tr></thead><tbody>';
      _commReps.forEach(function(u){
        var rec = (_commRules.perRep || {})[u.name] || {};
        perRepHtml += '<tr style="border-top:1px solid #f0f0f0">'
          + '<td style="padding:8px"><div style="display:flex;align-items:center;gap:8px"><div style="width:24px;height:24px;background:#c41230;border-radius:50%;color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">' + u.initials + '</div>' + u.name + '</div></td>'
          + '<td style="padding:8px;text-align:center"><input type="number" step="0.5" min="0" max="100" placeholder="default" value="' + (rec.baseRate != null ? _commEsc(rec.baseRate) : '') + '" data-action="settings-comm-perRep-baseRate-input" data-rep-name="' + u.name.replace(/"/g,'&quot;') + '" style="width:80px;padding:5px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;text-align:center"></td>'
          + '<td style="padding:8px;text-align:center"><input type="number" step="1" min="0" placeholder="default" value="' + (rec.ageThresholdDays != null ? _commEsc(rec.ageThresholdDays) : '') + '" data-action="settings-comm-perRep-ageThresholdDays-input" data-rep-name="' + u.name.replace(/"/g,'&quot;') + '" style="width:80px;padding:5px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;text-align:center"></td>'
          + '<td style="padding:8px;text-align:center"><input type="number" step="0.5" min="0" max="100" placeholder="default" value="' + (rec.agePenaltyPct != null ? _commEsc(rec.agePenaltyPct) : '') + '" data-action="settings-comm-perRep-agePenaltyPct-input" data-rep-name="' + u.name.replace(/"/g,'&quot;') + '" style="width:80px;padding:5px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;text-align:center"></td>'
          + '<td style="padding:8px"><select data-action="settings-comm-perRep-realisationGate-select" data-rep-name="' + u.name.replace(/"/g,'&quot;') + '" style="padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px">'
          +   '<option value=""' + (rec.realisationGate == null ? ' selected' : '') + '>(use default)</option>'
          +   _commGateOptions.map(function(opt){
              return '<option value="' + opt[0] + '"' + (rec.realisationGate === opt[0] ? ' selected' : '') + '>' + opt[1] + '</option>';
            }).join('')
          + '</select></td>'
          + '</tr>';
      });
      perRepHtml += '</tbody></table></div>';
      perRepHtml += '</div>';

      // Per-branch section — table with one column (baseRate)
      var perBranchHtml = ''
        + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:18px">'
        +   '<div style="font-size:13px;font-weight:700;margin-bottom:8px">Per Branch Overrides</div>'
        +   '<p style="font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.5">Branch baseRate overrides the default for any rep in that branch (per-rep still wins). Empty = use default.</p>'
        +   '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">';
      _commBranches.forEach(function(b){
        var br = (_commRules.perBranch || {})[b] || {};
        perBranchHtml += '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">' + b + ' base rate (%)</label>'
          + '<input type="number" step="0.5" min="0" max="100" placeholder="default" value="' + (br.baseRate != null ? _commEsc(br.baseRate) : '') + '" data-action="settings-comm-perBranch-baseRate-input" data-branch="' + b + '" style="width:100%;padding:6px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;text-align:center"></div>';
      });
      perBranchHtml += '</div></div>';

      // Product multipliers list
      var multHtml = ''
        + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:18px">'
        +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:13px;font-weight:700">Product Multipliers</div>'
        +     '<button class="btn-r" style="font-size:11px;padding:4px 12px" data-action="settings-comm-multiplier-add">+ Add</button>'
        +   '</div>'
        +   '<p style="font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.5">Per-product commission uplift. <code>_default</code> is the catch-all for products without a specific entry. Multiplier 1.0 = no uplift.</p>';
      _commRules.productMultipliers.forEach(function(pm, i){
        var isDefault = pm.productKey === '_default';
        multHtml += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:' + (isDefault?'#f9fafb':'#fff') + ';border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px">'
          + '<input placeholder="productKey" value="' + _commEsc(pm.productKey) + '" data-action="settings-comm-multiplier-productKey-input" data-index="' + i + '" style="flex:1;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:monospace"' + (isDefault?' disabled title="Cannot rename _default"':'') + '>'
          + '<input placeholder="Label" value="' + _commEsc(pm.label) + '" data-action="settings-comm-multiplier-label-input" data-index="' + i + '" style="flex:1;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px">'
          + '<input type="number" step="0.05" min="0" placeholder="1.0" value="' + _commEsc(pm.multiplier) + '" data-action="settings-comm-multiplier-multiplier-input" data-index="' + i + '" style="width:80px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:center;font-weight:700;font-family:Syne,sans-serif">'
          + (isDefault ? '<span style="width:32px;text-align:center;color:#9ca3af;font-size:11px" title="Cannot remove _default">—</span>' : '<button data-action="settings-comm-multiplier-remove-button" data-index="' + i + '" style="width:32px;height:30px;background:none;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;color:#dc2626;font-size:14px" title="Remove">×</button>')
          + '</div>';
      });
      if (_commRules.productMultipliers.length === 0) {
        multHtml += '<div style="padding:14px;text-align:center;color:#9ca3af;font-size:12px">No multipliers configured. Click + Add to start.</div>';
      }
      multHtml += '</div>';

      // Volume bonuses list
      var bonusHtml = ''
        + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px">'
        +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:13px;font-weight:700">Volume Bonuses</div>'
        +     '<button class="btn-r" style="font-size:11px;padding:4px 12px" data-action="settings-comm-bonus-add">+ Add</button>'
        +   '</div>'
        +   '<p style="font-size:12px;color:#6b7280;margin:0 0 12px;line-height:1.5">When a rep\'s monthly Won total (ex-GST) crosses a threshold, subsequent deals in that month get the bonus added to their effective rate. Highest tripped threshold wins. Trigger deal does not benefit from itself (subsequent-only).</p>';
      _commRules.volumeBonuses.forEach(function(vb, i){
        bonusHtml += '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px">'
          + '<div style="font-size:11px;color:#6b7280;width:90px">When monthly</div>'
          + '<div style="font-size:12px">≥ $</div>'
          + '<input type="number" step="1000" min="0" placeholder="100000" value="' + _commEsc(vb.threshold) + '" data-action="settings-comm-bonus-threshold-input" data-index="' + i + '" style="flex:1;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;font-family:Syne,sans-serif;font-weight:700">'
          + '<div style="font-size:12px">→ +</div>'
          + '<input type="number" step="0.5" min="0" max="100" placeholder="1" value="' + _commEsc(vb.bonusPct) + '" data-action="settings-comm-bonus-bonusPct-input" data-index="' + i + '" style="width:70px;padding:5px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;text-align:center;font-family:Syne,sans-serif;font-weight:700">'
          + '<div style="font-size:12px">%</div>'
          + '<button data-action="settings-comm-bonus-remove-button" data-index="' + i + '" style="width:32px;height:30px;background:none;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;color:#dc2626;font-size:14px" title="Remove">×</button>'
          + '</div>';
      });
      if (_commRules.volumeBonuses.length === 0) {
        bonusHtml += '<div style="padding:14px;text-align:center;color:#9ca3af;font-size:12px">No bonuses configured. Click + Add to start.</div>';
      }
      bonusHtml += '</div>';

      content = defaultsHtml + perRepHtml + perBranchHtml + multHtml + bonusHtml
        + '<div style="margin-top:18px;padding:14px 18px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;font-size:12px;color:#475569;line-height:1.7">'
        +   '<strong style="color:#0369a1">How rates resolve:</strong> defaults → per-branch → per-rep (last write wins). The calc engine applies <strong>baseRate + volumeBonus − agePenalty</strong> capped at 0, then multiplies by <strong>productMultiplier</strong> on the won quote\'s line items. Every change to these rules writes an audit entry visible in <em>Settings → Audit</em>.'
        + '</div>';
    }

  // ── INSTALLERS ────────────────────────────────────────────────────────────────
  } else if(settTab==='installers'){
    var instList = getInstallers();
    var instColours = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#ec4899','#f97316','#6366f1','#14b8a6'];
    content=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div style="font-size:13px;color:#6b7280">${instList.length} installer${instList.length!==1?'s':''}</div>
        <button class="btn-r" style="font-size:12px" data-action="settings-inst-add-button">${Icon({n:'plus',size:14})} Add Installer</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${instList.map(function(inst,idx){
          return '<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f9fafb;border-radius:10px">'
            +'<div style="width:38px;height:38px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(inst.name||'?')[0]+'</div>'
            +'<div style="flex:1">'
            +'<div style="font-size:14px;font-weight:600">'+inst.name+'</div>'
            +'<div style="font-size:12px;color:#6b7280;margin-top:1px">'+(inst.phone||'No phone')+' · '+inst.branch+' · Max '+inst.maxHoursPerDay+'h/day</div>'
            +'</div>'
            +'<div style="display:flex;align-items:center;gap:8px">'
            +(inst.active?Badge('Active','green'):Badge('Inactive','gray'))
            +'<button data-action="settings-inst-toggle-active-button" data-inst-id="'+inst.id+'" class="btn-g" style="font-size:11px;padding:4px 8px">'+(inst.active?'Deactivate':'Activate')+'</button>'
            +'<button data-action="settings-inst-remove-button" data-inst-id="'+inst.id+'" class="btn-g" style="font-size:11px;padding:4px 8px;color:#ef4444">'+Icon({n:'trash',size:12})+'</button>'
            +'</div></div>';
        }).join('')}
        ${instList.length===0?'<div style="padding:30px;text-align:center;color:#9ca3af;font-size:13px">No installers added yet. Click the button above to add your installation crew.</div>':''}
      </div>
      <div style="margin-top:16px;padding:14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px">
        <div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:4px">Weekly Targets</div>
        <div style="font-size:12px;color:#475569;line-height:1.8">
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">
            ${['VIC','ACT','SA','TAS'].map(function(b){
              var t=getState().weeklyTargets||{};
              return '<div style="display:flex;align-items:center;gap:6px"><strong>'+b+':</strong> $<input type="number" class="inp" value="'+(t[b]||0)+'" style="width:100px;font-size:12px;padding:4px 8px" data-action="settings-targets-input-blur" data-branch="'+b+'"></div>';
            }).join('')}
          </div>
        </div>
      </div>
    `;
  } else if(settTab==='users'){
    const _cu=getCurrentUser()||{role:'viewer',id:''};
    const _isA=_cu.role==='admin';
    const _aus=getUsers();
    const activeCount = _aus.filter(u=>u.active).length;
    const inactiveCount = _aus.filter(u=>!u.active).length;
    content=`
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <div>
          <div style="font-size:14px;font-weight:600;color:#374151">${activeCount} active user${activeCount!==1?'s':''}</div>
          ${inactiveCount>0?'<div style="font-size:12px;color:#9ca3af">'+inactiveCount+' deactivated</div>':''}
        </div>
        ${_isA?'<button data-action="settings-user-add" class="btn-r" style="gap:6px">' + Icon({n:'plus',size:14}) + ' Add User</button>':''}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${_aus.map(function(u){
          var isSelf = u.id===_cu.id;
          var roleLabel = u.role==='admin'?'Admin':u.role==='sales_rep'?'Sales Rep':u.role==='accounts'?'Accounts':u.role==='sales_manager'?'Sales Manager':'Viewer';
          var roleBg = u.role==='admin'?'#fee2e2':u.role==='sales_rep'?'#dbeafe':u.role==='accounts'?'#fef9c3':u.role==='sales_manager'?'#f0fdf4':'#f3f4f6';
          var roleCol = u.role==='admin'?'#b91c1c':u.role==='sales_rep'?'#1d4ed8':u.role==='accounts'?'#92400e':u.role==='sales_manager'?'#15803d':'#6b7280';
          return '<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:'+(u.active?'#fff':'#fafafa')+';border:1px solid '+(u.active?'#e5e7eb':'#f0f0f0')+';border-radius:12px;'+(u.active?'':'opacity:.6')+'">'
            +'<div style="width:36px;height:36px;background:'+(u.active?'#c41230':'#9ca3af')+';border-radius:50%;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(u.googlePic&&u.active?'<img src="'+u.googlePic+'" referrerpolicy="no-referrer" style="width:36px;height:36px;border-radius:50%">':u.initials)+'</div>'
            +'<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;color:#111">'+u.name+(isSelf?' <span style="font-size:11px;color:#c41230;font-weight:500">(you)</span>':'')+'</div><div style="font-size:12px;color:#6b7280">'+u.email+'</div></div>'
            +'<div style="display:flex;align-items:center;gap:8px;flex-shrink:0">'
            +'<span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;background:'+roleBg+';color:'+roleCol+'">'+roleLabel+'</span>'
            +'<span style="font-size:11px;font-weight:500;padding:3px 8px;border-radius:20px;background:#f3f4f6;color:#6b7280">'+u.branch+'</span>'
            +'<span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;background:'+(u.active?'#dcfce7':'#fee2e2')+';color:'+(u.active?'#15803d':'#b91c1c')+'">'+(u.active?'Active':'Inactive')+'</span>'
            +(_isA?'<div style="display:flex;gap:4px;margin-left:8px">'
              +'<button data-action="settings-user-edit-button" data-user-id="'+u.id+'" class="btn-w" style="font-size:11px;padding:5px 10px">Edit</button>'
              +(!isSelf?'<button data-action="settings-user-toggle-button" data-user-id="'+u.id+'" class="btn-w" style="font-size:11px;padding:5px 10px;'+(u.active?'':'color:#15803d')+'">'+(u.active?'Deactivate':'Activate')+'</button>':'')
            +'</div>':'')
            +'</div></div>';
        }).join('')}
      </div>
      ${_isA?'<div style="margin-top:18px;padding:16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px"><div style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:6px">Access Control</div><div style="font-size:12px;color:#475569;line-height:1.7"><strong>Admin:</strong> Full access \u2014 manage users, settings, commission rates, all branches<br><strong>Sales Manager:</strong> Full CRM access + 1% monthly override on all sales (ex-GST) + own commission<br><strong>Accounts:</strong> View all data, manage commission paid/unpaid status, view audit logs<br><strong>Sales Rep:</strong> Create and manage deals, contacts, leads in their branch. View own commission only<br><strong>Viewer:</strong> Read-only access \u2014 cannot create or edit records</div></div>':'<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">Only admins can manage users and access levels.</div>'}
    `;
    if(_isA && adminEditingUser) content += renderAdminUserModal();
  }

  return `
    <div style="margin-bottom:20px"><h1 style="font-size:24px;font-weight:800;margin:0">Settings</h1></div>
    <div style="display:flex;gap:20px">
      <div style="width:180px;flex-shrink:0">
        <div class="card" style="padding:6px">
          ${TABS.map(([id,label])=>`<button data-action="settings-tab-switch" data-tab="${id}" style="width:100%;text-align:left;padding:10px 12px;border-radius:8px;border:none;font-size:13px;font-weight:${settTab===id?'600':'400'};cursor:pointer;font-family:inherit;background:${settTab===id?'#fff5f6':'transparent'};color:${settTab===id?'#c41230':'#374151'};transition:all .1s" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='${settTab===id?'#fff5f6':'transparent'}'">
            ${label}
          </button>`).join('')}
        </div>
      </div>
      <div style="flex:1;min-width:0">
        <div class="card" style="overflow:hidden">
          <div style="padding:16px 20px;border-bottom:1px solid #f0f0f0"><h3 style="font-family:Syne,sans-serif;font-weight:700;font-size:15px;margin:0">${TABS.find(t=>t[0]===settTab)?.[1]||''}</h3></div>
          <div style="padding:20px">${content}</div>
        </div>
      </div>
    </div>`;
}

// ── Custom Fields actions ─────────────────────────────────────────────────────

function cfMoveField(entity, fieldId, dir) {
  const s = getState();
  const keyMap = {deals:'dealFields',leads:'leadFields',contacts:'contactFields',jobs:'jobFields'};
  const key = keyMap[entity]||'dealFields';
  const list = [...(s[key]||[])];
  const sorted = list.sort((a,b)=>a.ord-b.ord);
  const idx = sorted.findIndex(f=>f.id===fieldId);
  if(dir==='up'&&idx>0) { sorted[idx].ord = sorted[idx-1].ord - 0.5; }
  else if(dir==='down'&&idx<sorted.length-1) { sorted[idx].ord = sorted[idx+1].ord + 0.5; }
  sorted.forEach((f,i)=>f.ord=i+1);
  setState({[key]:sorted});
}

function cfToggleRequired(entity, fieldId) {
  const s = getState();
  const keyMap = {deals:'dealFields',leads:'leadFields',contacts:'contactFields',jobs:'jobFields'};
  const key = keyMap[entity]||'dealFields';
  setState({[key]: (s[key]||[]).map(f=>f.id===fieldId?{...f,required:!f.required}:f)});
}

function cfDeleteField(entity, fieldId) {
  const s = getState();
  const keyMap = {deals:'dealFields',leads:'leadFields',contacts:'contactFields',jobs:'jobFields'};
  const key = keyMap[entity]||'dealFields';
  setState({[key]: (s[key]||[]).filter(f=>f.id!==fieldId)});
  stConfirmDeleteId=null;
  addToast('Field deleted','warning');
}

function cfSaveField(entity, editId) {
  const label = document.getElementById('cfNewLabel')?.value.trim();
  const type = document.getElementById('cfNewType')?.value;
  if(!label){addToast('Label is required','error');return;}
  const s = getState();
  const keyMap = {deals:'dealFields',leads:'leadFields',contacts:'contactFields',jobs:'jobFields'};
  const key = keyMap[entity]||'dealFields';
  const list = s[key]||[];
  if(editId) {
    setState({[key]: list.map(f=>f.id===editId?{...f,label,type,options:cfNewForm.options,required:cfNewForm.required}:f)});
    addToast('Field updated','success');
  } else {
    const newField = {id:'cf'+Date.now(),label,type,options:cfNewForm.options,required:cfNewForm.required,ord:list.length+1};
    setState({[key]:[...list,newField]});
    addToast('Field added','success');
  }
  cfAddingNew=false; cfEditingId=null;
  cfNewForm={label:'',type:'text',options:[],required:false,newOpt:''};
}

// ── Status actions ────────────────────────────────────────────────────────────

function stOpenColorPicker(entity, id) {
  const pickerId = 'colorPicker_' + id;
  document.querySelectorAll('[id^=colorPicker_]').forEach(el=>{
    if(el.id!==pickerId) el.style.display='none';
  });
  const el = document.getElementById(pickerId);
  if(el) el.style.display = el.style.display==='flex'?'none':'flex';
}

function stSetColor(entity, id, col) {
  const key = entity==='deals'?'dealStatuses':entity==='leads'?'leadStatuses':'contactStatuses';
  setState({[key]: getState()[key].map(s=>s.id===id?{...s,col}:s)});
  const el = document.getElementById('colorPicker_'+id);
  if(el) el.style.display='none';
}

function stSaveLabel(entity, id) {
  const el = document.getElementById('stLabelInput_'+id);
  if(!el) return;
  const label = el.value.trim();
  if(!label){addToast('Label required','error');return;}
  const key = entity==='deals'?'dealStatuses':entity==='leads'?'leadStatuses':'contactStatuses';
  setState({[key]: getState()[key].map(s=>s.id===id?{...s,label}:s)});
  stEditingId=null;
  addToast('Status updated','success');
}

function stSetDefault(entity, id) {
  const key = entity==='deals'?'dealStatuses':entity==='leads'?'leadStatuses':'contactStatuses';
  setState({[key]: getState()[key].map(s=>({...s,isDefault:s.id===id}))});
  addToast('Default status set','success');
}

function stToggleWon(id) {
  setState({dealStatuses: getState().dealStatuses.map(s=>s.id===id?{...s,isWon:!s.isWon,isLost:false}:s)});
}

function stToggleLost(id) {
  setState({dealStatuses: getState().dealStatuses.map(s=>s.id===id?{...s,isLost:!s.isLost,isWon:false}:s)});
}

function stDeleteStatus(entity, id) {
  const key = entity==='deals'?'dealStatuses':entity==='leads'?'leadStatuses':'contactStatuses';
  setState({[key]: getState()[key].filter(s=>s.id!==id)});
  stConfirmDeleteId=null;
  addToast('Status deleted','warning');
}

function stAddStatus(entity) {
  const key = entity==='deals'?'dealStatuses':entity==='leads'?'leadStatuses':'contactStatuses';
  const list = getState()[key];
  const newSt = {id:'st'+Date.now(),label:'New Status',col:'#9ca3af',isDefault:false,...(entity==='deals'?{isWon:false,isLost:false}:{})};
  setState({[key]:[...list,newSt]});
  stEditingId = newSt.id;
}

// ── SMS Template management (stage 4) ──────────────────────────────────────
// Backed by Supabase public.sms_templates table. Realtime sub picks up
// changes from other browsers within ~1s.
var smsTemplateEditId = null;
var smsTemplateDraft = { id:'', name:'', body:'' };

function smsTemplateNew() {
  smsTemplateEditId = 'new';
  smsTemplateDraft = { id: 'tpl_' + Date.now(), name: '', body: '' };
  renderPage();
}
function smsTemplateEdit(id) {
  var t = (getState().smsTemplates || []).find(function(x){ return x.id === id; });
  if (!t) return;
  smsTemplateEditId = id;
  smsTemplateDraft = { id: t.id, name: t.name || '', body: t.body || '' };
  renderPage();
}
function smsTemplateCancel() {
  smsTemplateEditId = null;
  smsTemplateDraft = { id:'', name:'', body:'' };
  renderPage();
}
function smsTemplateSave() {
  var d = smsTemplateDraft;
  var name = (document.getElementById('smstplName') || {}).value || d.name || '';
  var body = (document.getElementById('smstplBody') || {}).value || d.body || '';
  name = name.trim(); body = body.trim();
  if (!name || !body) { addToast('Name and body are required', 'error'); return; }

  var cu = getCurrentUser() || {};
  var row = {
    id: d.id || ('tpl_' + Date.now()),
    name: name,
    body: body,
    placeholders: extractPlaceholders(body),
    created_by: cu.id || null,
  };

  if (typeof dbUpsert === 'function') dbUpsert('sms_templates', row);

  // Optimistic local insert/update so the UI reflects the change without
  // waiting for the realtime echo.
  var existing = getState().smsTemplates || [];
  var found = false;
  var next = existing.map(function(t){ if (t.id === row.id) { found = true; return row; } return t; });
  if (!found) next = next.concat([row]);
  next.sort(function(a, b){ return (a.name || '').localeCompare(b.name || ''); });
  setState({ smsTemplates: next });

  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'settings', action:'settings.template_edited',
      summary:(found?'Edited':'Created')+' SMS template: '+name,
      after:{ kind:'sms', id:row.id, name:name, body:body },
    });
  }
  smsTemplateEditId = null;
  smsTemplateDraft = { id:'', name:'', body:'' };
  addToast('Template saved', 'success');
  renderPage();
}
function smsTemplateDelete(id) {
  if (!confirm('Delete this template?')) return;
  var prev = (getState().smsTemplates || []).find(function(t){ return t.id === id; });
  if (typeof dbDelete === 'function') dbDelete('sms_templates', id);
  var next = (getState().smsTemplates || []).filter(function(t){ return t.id !== id; });
  setState({ smsTemplates: next });
  if (typeof appendAuditEntry === 'function' && prev) {
    appendAuditEntry({
      entityType:'settings', action:'settings.template_edited',
      summary:'Deleted SMS template: '+prev.name,
      before:{ kind:'sms', id:prev.id, name:prev.name, body:prev.body },
    });
  }
  addToast('Template deleted', 'warning');
  renderPage();
}
function smsTemplateSeedDefaults() {
  var defaults = [
    { id:'tpl_seed_book',     name:'Booking Confirmation', body:'Hi {{firstName}}, your measure is confirmed for {{date}} at {{time}}. — Spartan DG' },
    { id:'tpl_seed_omw',      name:'On My Way',            body:'Hi {{firstName}}, on my way — should be there in about 15 mins. — {{repName}}' },
    { id:'tpl_seed_followup', name:'Follow Up',            body:'Hi {{firstName}}, following up on the quote we sent. Any questions? — Spartan DG' },
    { id:'tpl_seed_quote',    name:'Quote Sent',           body:'Hi {{firstName}}, your quote is ready: {{link}} — Spartan DG' },
    { id:'tpl_seed_install',  name:'Install Reminder',     body:'Hi {{firstName}}, install scheduled for {{date}}. Please ensure access from 7am. — Spartan DG' },
  ];
  var cu = getCurrentUser() || {};
  defaults.forEach(function(t) {
    t.placeholders = extractPlaceholders(t.body);
    t.created_by = cu.id || null;
    if (typeof dbUpsert === 'function') dbUpsert('sms_templates', t);
  });
  setState({ smsTemplates: defaults });
  addToast('5 default templates seeded', 'success');
  renderPage();
}
function extractPlaceholders(body) {
  var matches = String(body || '').match(/\{\{(\w+)\}\}/g) || [];
  var keys = matches.map(function(m){ return m.slice(2, -2); });
  // Dedupe
  var seen = {}; var out = [];
  keys.forEach(function(k){ if (!seen[k]) { seen[k] = 1; out.push(k); } });
  return out;
}

// ── Phone & IVR Settings management (stage 6) ──────────────────────────────
// Backed by Supabase public.phone_settings (singleton row id='singleton').
// Backend reads this on every inbound call (with a 60s cache).

function phoneSettingsAddMenuRow() {
  // Find the next available digit (not already used)
  var existing = (getState().phoneSettings || {}).ivr_menu || {};
  var nextDigit = '0';
  for (var d = 5; d <= 9; d++) { if (!existing[String(d)]) { nextDigit = String(d); break; } }
  if (existing[nextDigit]) {
    // All digits taken — try 0 or *
    nextDigit = !existing['0'] ? '0' : (!existing['*'] ? '*' : '#');
  }
  var ps = JSON.parse(JSON.stringify(getState().phoneSettings || {}));
  ps.ivr_menu = ps.ivr_menu || {};
  ps.ivr_menu[nextDigit] = { label: '', roles: [] };
  setState({ phoneSettings: ps });
}
function phoneSettingsRemoveMenuRow(digit) {
  var ps = JSON.parse(JSON.stringify(getState().phoneSettings || {}));
  ps.ivr_menu = ps.ivr_menu || {};
  delete ps.ivr_menu[digit];
  setState({ phoneSettings: ps });
}
function phoneSettingsSave() {
  // Read current values from the form
  var greeting = (document.getElementById('ps_greeting') || {}).value || '';
  var vmGreeting = (document.getElementById('ps_vmGreeting') || {}).value || '';
  var voiceName = (document.getElementById('ps_voiceName') || {}).value || 'Polly.Nicole';
  var openHour = parseInt((document.getElementById('ps_openHour') || {}).value, 10);
  var closeHour = parseInt((document.getElementById('ps_closeHour') || {}).value, 10);
  if (isNaN(openHour) || openHour < 0 || openHour > 23) { addToast('Open hour must be 0-23', 'error'); return; }
  if (isNaN(closeHour) || closeHour < 0 || closeHour > 23) { addToast('Close hour must be 0-23', 'error'); return; }
  if (closeHour <= openHour) { addToast('Close hour must be after open hour', 'error'); return; }

  var days = [];
  document.querySelectorAll('.ps-day-cb').forEach(function(cb){ if (cb.checked) days.push(cb.dataset.day); });

  var menu = {};
  document.querySelectorAll('.ps-menu-row').forEach(function(rowEl){
    var digit = rowEl.dataset.digit;
    var label = (rowEl.querySelector('.ps-menu-label') || {}).value || '';
    var rolesStr = (rowEl.querySelector('.ps-menu-roles') || {}).value || '';
    var roles = rolesStr.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    if (digit && label) {
      menu[digit] = { label: label.trim(), roles: roles };
    }
  });

  var settings = {
    id: 'singleton',
    greeting: greeting.trim(),
    voicemail_greeting: vmGreeting.trim(),
    voice_name: voiceName,
    ivr_menu: menu,
    business_hours: { days: days, open_hour: openHour, close_hour: closeHour, timezone: 'Australia/Melbourne' },
    updated_by: ((getCurrentUser() || {}).id) || null,
  };

  var prevSettings = getState().phoneSettings;
  if (typeof dbUpsert === 'function') dbUpsert('phone_settings', settings);
  setState({ phoneSettings: settings });
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'settings', action:'settings.phone_edited',
      summary:'Updated Phone & IVR settings (greeting, IVR menu, business hours)',
      before: prevSettings, after: settings,
    });
  }
  addToast('Phone & IVR settings saved — propagates to live calls within 60s', 'success');
  renderPage();
}

// Test call — admin enters their mobile, /api/twilio/voice fires, their phone rings.
// Effectively the same as twilioCall(<their mobile>) but with a confirmation
// modal so the admin can't accidentally fat-finger and dial a customer.
function phoneTestCall() {
  var mobile = prompt('Enter your mobile number to receive the test call (e.g. +61412345678):');
  if (!mobile) return;
  mobile = mobile.trim();
  if (!confirm('Twilio will now place a call to ' + mobile + '. Continue?')) return;
  if (typeof twilioCall === 'function') {
    twilioCall(mobile, null, null);
  } else {
    addToast('Twilio not connected', 'error');
  }
}

// ── Lost Reasons management (Brief 1) ─────────────────────────────────────
function lostReasonAddNew() {
  var list = (typeof getLostReasons === 'function') ? getLostReasons() : [];
  var newId = 'reason_' + Date.now().toString(36);
  list.push({ id: newId, label: 'New reason', active: true });
  if (typeof saveLostReasons === 'function') saveLostReasons(list);
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({ entityType:'settings', action:'settings.lost_reason_edited', summary:'Added Lost Reason: New reason', after:{ id: newId, label: 'New reason', active: true } });
  }
  renderPage();
  // Focus the new label input so the admin types over the placeholder.
  setTimeout(function(){ var el = document.getElementById('lr_label_'+newId); if (el) { el.focus(); el.select(); } }, 50);
}

function lostReasonRename(id, newLabel) {
  var list = (typeof getLostReasons === 'function') ? getLostReasons() : [];
  var prev = list.find(function(r){ return r.id === id; });
  var prevLabel = prev ? prev.label : '';
  var next = list.map(function(r){ return r.id === id ? Object.assign({}, r, { label: newLabel }) : r; });
  if (typeof saveLostReasons === 'function') saveLostReasons(next);
  // No re-render — the input is mid-typing. Audit happens on blur via the
  // setTimeout debounce below to avoid flooding the audit log on every keystroke.
  if (_lostReasonRenameTimer) clearTimeout(_lostReasonRenameTimer);
  _lostReasonRenameTimer = setTimeout(function(){
    if (typeof appendAuditEntry === 'function' && prevLabel !== newLabel) {
      appendAuditEntry({ entityType:'settings', action:'settings.lost_reason_edited', summary:'Renamed Lost Reason: '+prevLabel+' → '+newLabel, before:{label:prevLabel}, after:{label:newLabel} });
    }
  }, 1500);
}
var _lostReasonRenameTimer = null;

function lostReasonToggleActive(id) {
  var list = (typeof getLostReasons === 'function') ? getLostReasons() : [];
  var prev = list.find(function(r){ return r.id === id; });
  if (!prev) return;
  var next = list.map(function(r){ return r.id === id ? Object.assign({}, r, { active: !r.active }) : r; });
  if (typeof saveLostReasons === 'function') saveLostReasons(next);
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({ entityType:'settings', action:'settings.lost_reason_edited', summary:(prev.active?'Deactivated':'Activated')+' Lost Reason: '+prev.label, before:{active:prev.active}, after:{active:!prev.active} });
  }
  addToast('Reason ' + (prev.active ? 'deactivated' : 'activated'), 'info');
  renderPage();
}

function lostReasonMove(id, direction) {
  var list = (typeof getLostReasons === 'function') ? getLostReasons() : [];
  var idx = list.findIndex(function(r){ return r.id === id; });
  if (idx < 0) return;
  var newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= list.length) return;
  var item = list[idx];
  list.splice(idx, 1);
  list.splice(newIdx, 0, item);
  if (typeof saveLostReasons === 'function') saveLostReasons(list);
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({ entityType:'settings', action:'settings.lost_reason_edited', summary:'Reordered Lost Reasons', metadata:{ moved: id, direction: direction > 0 ? 'down' : 'up' } });
  }
  renderPage();
}



// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────

// ─ Email & Gmail ─
defineAction('settings-gmail-disconnect', function(target, ev) { gmailDisconnect(); });
defineAction('settings-gmail-connect', function(target, ev) { gmailConnect(); });
defineAction('settings-gmail-save-client-id', function(target, ev) {
  const v = document.getElementById('gmailClientId').value.trim();
  if (v) { GMAIL_CLIENT_ID = v; localStorage.setItem('spartan_gmail_client_id', v); gmailInit(); addToast('Client ID saved', 'success'); }
  else { addToast('Enter a Client ID', 'error'); }
});
defineAction('settings-maps-save-key', function(target, ev) { saveMapsApiKey(); });
defineAction('settings-maps-test-key', function(target, ev) { testMapsApiKey(); });

// ─ Pipeline Manager ─
defineAction('settings-pipeline-add-stage', function(target, ev) { addToast('Stage added to ' + target.dataset.pipelineName, 'success'); });
defineAction('settings-pipeline-edit-stage', function(target, ev) { addToast('Stage editor in production', 'info'); });

// ─ Custom Fields ─
defineAction('settings-cf-switch-entity', function(target, ev) { cfEntityTab = target.dataset.entity; cfAddingNew = false; cfEditingId = null; renderPage(); });
defineAction('settings-cf-move-field', function(target, ev) { cfMoveField(target.dataset.entity, target.dataset.fieldId, target.dataset.dir); });
defineAction('settings-cf-toggle-required', function(target, ev) { cfToggleRequired(target.dataset.entity, target.dataset.fieldId); });
defineAction('settings-cf-edit-field', function(target, ev) { cfEditingId = target.dataset.fieldId; cfAddingNew = false; renderPage(); });
defineAction('settings-cf-delete-field-confirm', function(target, ev) { cfDeleteField(target.dataset.entity, target.dataset.fieldId); });
defineAction('settings-cf-delete-cancel', function(target, ev) { stConfirmDeleteId = null; renderPage(); });
defineAction('settings-cf-delete-initiate', function(target, ev) { stConfirmDeleteId = target.dataset.fieldId; renderPage(); });
defineAction('settings-cf-type-change', function(target, ev) { cfNewForm.type = target.value; renderPage(); });
defineAction('settings-cf-option-remove', function(target, ev) { const idx = parseInt(target.dataset.index, 10); cfNewForm.options = cfNewForm.options.filter((_, j) => j !== idx); renderPage(); });
defineAction('settings-cf-option-add', function(target, ev) { const v = document.getElementById('cfNewOpt').value.trim(); if (v) { cfNewForm.options = [...cfNewForm.options, v]; document.getElementById('cfNewOpt').value = ''; renderPage(); document.getElementById('cfNewOpt').focus(); } });
defineAction('settings-cf-option-keydown', function(target, ev) { if (ev.key === 'Enter') { const v = target.value.trim(); if (v) { cfNewForm.options = [...cfNewForm.options, v]; target.value = ''; renderPage(); } } });
defineAction('settings-cf-required-toggle', function(target, ev) { cfNewForm.required = target.checked; });
defineAction('settings-cf-cancel', function(target, ev) { cfAddingNew = false; cfEditingId = null; cfNewForm = { label: '', type: 'text', options: [], required: false, newOpt: '' }; renderPage(); });
defineAction('settings-cf-save-field', function(target, ev) { cfSaveField(target.dataset.entity, target.dataset.editId || null); });
defineAction('settings-cf-add-new', function(target, ev) { cfAddingNew = true; cfEditingId = null; cfNewForm = { label: '', type: 'text', options: [], required: false, newOpt: '' }; renderPage(); });

// ─ Statuses ─
defineAction('settings-st-switch-entity', function(target, ev) { stEntityTab = target.dataset.entity; stEditingId = null; stConfirmDeleteId = null; renderPage(); });
defineAction('settings-st-open-color-picker', function(target, ev) { stOpenColorPicker(target.dataset.entity, target.dataset.id); });
defineAction('settings-st-set-color', function(target, ev) { stSetColor(target.dataset.entity, target.dataset.id, target.dataset.col); });
defineAction('settings-st-edit-label', function(target, ev) { stEditingId = target.dataset.id; renderPage(); });
defineAction('settings-st-label-keydown', function(target, ev) { if (ev.key === 'Enter') stSaveLabel(target.dataset.entity, target.dataset.id); });
defineAction('settings-st-save-label', function(target, ev) { stSaveLabel(target.dataset.entity, target.dataset.id); });
defineAction('settings-st-cancel-label', function(target, ev) { stEditingId = null; renderPage(); });
defineAction('settings-st-toggle-won', function(target, ev) { stToggleWon(target.dataset.id); });
defineAction('settings-st-toggle-lost', function(target, ev) { stToggleLost(target.dataset.id); });
defineAction('settings-st-set-default', function(target, ev) { stSetDefault(target.dataset.entity, target.dataset.id); });
defineAction('settings-st-delete-confirm', function(target, ev) { stDeleteStatus(target.dataset.entity, target.dataset.id); });
defineAction('settings-st-delete-initiate', function(target, ev) { stConfirmDeleteId = target.dataset.id; renderPage(); });
defineAction('settings-st-delete-cancel', function(target, ev) { stConfirmDeleteId = null; renderPage(); });
defineAction('settings-st-add-status', function(target, ev) { stAddStatus(target.dataset.entity); });

// ─ Lost Reasons ─
defineAction('settings-lr-add-new', function(target, ev) { lostReasonAddNew(); });
defineAction('settings-lr-move', function(target, ev) { lostReasonMove(target.dataset.id, parseInt(target.dataset.direction, 10)); });
defineAction('settings-lr-rename', function(target, ev) { lostReasonRename(target.dataset.id, target.value); });
defineAction('settings-lr-toggle-active', function(target, ev) { lostReasonToggleActive(target.dataset.id); });

// ─ Tags ─
defineAction('settings-tag-remove', function(target, ev) { tags = tags.filter(x => x !== target.dataset.tag); renderPage(); addToast('Tag removed', 'warning'); });
defineAction('settings-tag-add', function(target, ev) { const v = document.getElementById('newTag').value; if (v) { tags = [...tags, v]; addToast('Tag added', 'success'); document.getElementById('newTag').value = ''; renderPage(); } });
defineAction('settings-tag-input-keydown', function(target, ev) { if (ev.key === 'Enter' && target.value) { tags = [...tags, target.value]; addToast('Tag added', 'success'); target.value = ''; renderPage(); } });

// ─ SMS Templates ─
defineAction('settings-sms-new-template', function(target, ev) { smsTemplateNew(); });
defineAction('settings-sms-edit-template', function(target, ev) { smsTemplateEdit(target.dataset.id); });
defineAction('settings-sms-delete-template', function(target, ev) { smsTemplateDelete(target.dataset.id); });
defineAction('settings-sms-template-name-input', function(target, ev) { smsTemplateDraft = { ...smsTemplateDraft, name: target.value }; });
defineAction('settings-sms-template-body-input', function(target, ev) { const count = target.value.length; const charColor = count > 160 ? '#dc2626' : count > 140 ? '#f59e0b' : '#6b7280'; document.getElementById('smstplCount').textContent = count + '/160'; document.getElementById('smstplCount').style.color = charColor; smsTemplateDraft = { ...smsTemplateDraft, body: target.value }; });
defineAction('settings-sms-cancel-template', function(target, ev) { smsTemplateCancel(); });
defineAction('settings-sms-save-template', function(target, ev) { smsTemplateSave(); });
defineAction('settings-sms-seed-defaults', function(target, ev) { smsTemplateSeedDefaults(); });

// ─ Phone & IVR ─
defineAction('settings-phone-reconnect', function(target, ev) { if (typeof twilioInit === 'function') { twilioInit(true); addToast('Reconnecting...', 'info'); } });
defineAction('settings-phone-test-call', function(target, ev) { phoneTestCall(); });
defineAction('settings-phone-add-menu-row', function(target, ev) { phoneSettingsAddMenuRow(); });
defineAction('settings-phone-remove-menu-row', function(target, ev) { phoneSettingsRemoveMenuRow(target.dataset.digit); });
defineAction('settings-phone-save', function(target, ev) { phoneSettingsSave(); });

// ─ Commission Rules ─
defineAction('settings-comm-default-change', function(target, ev) { setCommissionDefault(target.dataset.field, target.value); });
defineAction('settings-comm-perRep-change', function(target, ev) { setCommissionPerRep(target.dataset.repName, target.dataset.field, target.value); });
defineAction('settings-comm-perBranch-change', function(target, ev) { setCommissionPerBranch(target.dataset.branch, target.value); });
defineAction('settings-comm-multiplier-add', function(target, ev) { addCommissionMultiplier(); });
defineAction('settings-comm-multiplier-change', function(target, ev) { setCommissionMultiplier(parseInt(target.dataset.index, 10), target.dataset.field, target.value); });
defineAction('settings-comm-multiplier-remove', function(target, ev) { removeCommissionMultiplier(parseInt(target.dataset.index, 10)); });
defineAction('settings-comm-bonus-add', function(target, ev) { addCommissionBonus(); });
defineAction('settings-comm-bonus-change', function(target, ev) { setCommissionBonus(parseInt(target.dataset.index, 10), target.dataset.field, target.value); });
defineAction('settings-comm-bonus-remove', function(target, ev) { removeCommissionBonus(parseInt(target.dataset.index, 10)); });

// ─ Installers ─
defineAction('settings-inst-add-installer', function(target, ev) { const name = prompt('Installer name:'); if (!name) return; const phone = prompt('Phone number (optional):', ''); const branch = prompt('Branch (VIC/ACT/SA/TAS):', 'VIC'); addInstaller(name, phone || '', branch || 'VIC'); });
defineAction('settings-inst-toggle-active', function(target, ev) { const l = getInstallers(); const updated = l.map(function(i) { return i.id === target.dataset.instId ? Object.assign({}, i, { active: !i.active }) : i; }); saveInstallers(updated); renderPage(); });
defineAction('settings-inst-remove', function(target, ev) { removeInstaller(target.dataset.instId); });
defineAction('settings-targets-blur', function(target, ev) { const t = Object.assign({}, getState().weeklyTargets || {}); t[target.dataset.branch] = parseInt(target.value, 10) || 0; setState({ weeklyTargets: t }); });

// ─ Users & Roles ─
defineAction('settings-user-add', function(target, ev) { adminAddUser(); });
defineAction('settings-user-edit', function(target, ev) { adminEditUser(target.dataset.userId); });
defineAction('settings-user-toggle', function(target, ev) { adminToggleUser(target.dataset.userId); });

// ─ Sidebar navigation ─
defineAction('settings-tab-switch', function(target, ev) { settTab = target.dataset.tab; renderPage(); });
