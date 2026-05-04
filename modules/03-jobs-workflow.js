// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 03-jobs-workflow.js
// Extracted from original index.html lines 806-1167
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// JOBS MODULE — Constants & Status Workflow
// ══════════════════════════════════════════════════════════════════════════════

const JOB_STATUSES = [
  // group: onboarding
  {key:'a_check_measure',           label:'Check Measure',                          group:'onboarding', col:'#3b82f6'},
  {key:'b_check_status',            label:'Check Status / Book Service / Order',   group:'onboarding', col:'#6366f1'},
  // group: finance
  {key:'c_awaiting_2nd_payment',    label:'Awaiting Second Payment',               group:'finance',    col:'#f59e0b'},
  {key:'c1_final_sign_off',         label:'Final Sign Off',                        group:'finance',    col:'#eab308'},
  // group: order
  {key:'c2_order_schedule_standard',label:'Order & Schedule (Standard Job)',       group:'order',      col:'#14b8a6'},
  {key:'c3_order_schedule_service', label:'Order & Schedule (Service Work)',       group:'order',      col:'#0ea5e9'},
  // group: hold
  {key:'c4_date_change_hold',       label:'Date Change Protocol / HOLD',           group:'hold',       col:'#9ca3af'},
  // group: material
  {key:'d1_awaiting_material',      label:'Awaiting Material',                     group:'material',   col:'#f97316'},
  {key:'d11_awaiting_svc_material', label:'Awaiting Service Work Material',        group:'material',   col:'#fb923c'},
  {key:'d12_svc_material_at_factory',label:'Service Work Material at Factory',     group:'material',   col:'#f59e0b'},
  {key:'d13_svc_in_production',     label:'Service Work Job in Production',        group:'production', col:'#a855f7'},
  {key:'d14_awaiting_glass_svc',    label:'Awaiting Glass for Service Job',        group:'material',   col:'#ec4899'},
  {key:'d2_material_at_factory',    label:'Material at Factory',                   group:'material',   col:'#22c55e'},
  // group: production
  {key:'d3_cutting',                label:'Cutting',                               group:'production', col:'#a855f7'},
  {key:'d4_milling_steel_welding',  label:'Milling / Steel / Welding',             group:'production', col:'#9333ea'},
  {key:'d5_hardware_revealing',     label:'Hardware / Revealing / Screens',        group:'production', col:'#7e22ce'},
  // group: dispatch & install
  {key:'e_dispatch_standard',       label:'In Dispatch (Standard Job)',            group:'dispatch',   col:'#06b6d4'},
  {key:'e1_dispatch_service',       label:'Dispatch (Service Work)',               group:'dispatch',   col:'#0891b2'},
  {key:'f_installing',              label:'Installing in Progress / Dispatched',   group:'install',    col:'#6366f1'},
  // group: final finance
  {key:'g_final_payment',           label:'Final Payment',                         group:'finance',    col:'#22c55e'},
  // group: complete
  {key:'h_completed_standard',      label:'Complete (Standard Job)',               group:'complete',   col:'#16a34a'},
  {key:'h1_completed_service',      label:'Complete (After Service)',              group:'complete',   col:'#15803d'},
  // group: service
  {key:'h_service_booked',          label:'Service Booked',                        group:'service',    col:'#f97316'},
  {key:'h1_awaiting_contractor',    label:'Awaiting Contractor to Complete',       group:'service',    col:'#fb923c'},
  // group: storage
  {key:'i_in_storage',              label:'In Storage Facility',                   group:'hold',       col:'#6b7280'},
];

const JOB_STATUS_GROUPS = [
  {key:'onboarding', label:'Onboarding',  col:'#3b82f6'},
  {key:'finance',    label:'Finance',     col:'#f59e0b'},
  {key:'order',      label:'Order',       col:'#14b8a6'},
  {key:'hold',       label:'Hold',        col:'#9ca3af'},
  {key:'material',   label:'Material',    col:'#f97316'},
  {key:'production', label:'Production',  col:'#a855f7'},
  {key:'dispatch',   label:'Dispatch',    col:'#06b6d4'},
  {key:'install',    label:'Install',     col:'#6366f1'},
  {key:'service',    label:'Service',     col:'#f97316'},
  {key:'complete',   label:'Complete',    col:'#16a34a'},
];

// ── KPI Thresholds (manual §4.10) ──────────────────────────────────────────
// Editable in Settings → KPI Thresholds. Admin-tunable so each branch can match
// their actual operating tempo without a code change.
var DEFAULT_KPI_THRESHOLDS = {
  cmFromDeposit:        24,  // hours — deposit cleared but CM not booked → amber on dashboard (manual §3 Step 3)
  staleCheckMeasure:    7,   // days at a_check_measure (manual §4.1)
  staleAwaitingPayment: 14,  // days at c_awaiting_2nd_payment (manual §4.1)
  staleFinalSignOff:    5,   // days at c1_final_sign_off awaiting customer DocuSign (manual §4.1)
  staleCheckStatus:     2,   // days at b_check_status awaiting bookkeeper triage (manual §4.1)
  installOverrunPct:    20,  // % over CAD forecast time → time-overrun alert (manual §7.10)
};
function getKpiThresholds() {
  try {
    var saved = JSON.parse(localStorage.getItem('spartan_kpi_thresholds') || '{}');
    return Object.assign({}, DEFAULT_KPI_THRESHOLDS, saved);
  } catch(e) { return Object.assign({}, DEFAULT_KPI_THRESHOLDS); }
}
function saveKpiThresholds(thresholds) {
  try { localStorage.setItem('spartan_kpi_thresholds', JSON.stringify(thresholds)); } catch(e) {}
  if (typeof _sb !== 'undefined' && _sb && typeof kpiThresholdsToDb === 'function') {
    try { dbUpsert('kpi_thresholds', kpiThresholdsToDb(thresholds)); }
    catch(e) { console.warn('KPI thresholds sync failed', e); }
  }
}
function resetKpiThresholds() {
  try { localStorage.removeItem('spartan_kpi_thresholds'); } catch(e) {}
  if (typeof _sb !== 'undefined' && _sb) {
    try { _sb.from('kpi_thresholds').delete().eq('id', 'singleton'); }
    catch(e) { console.warn('KPI thresholds delete failed', e); }
  }
}
window.getKpiThresholds = getKpiThresholds;
window.saveKpiThresholds = saveKpiThresholds;
window.resetKpiThresholds = resetKpiThresholds;
window.DEFAULT_KPI_THRESHOLDS = DEFAULT_KPI_THRESHOLDS;

// Legacy status keys that have been renamed. Display the new label and let
// callers know the canonical key so any pending writes can migrate the data.
var LEGACY_STATUS_ALIASES = {
  'e_ready_to_schedule': 'c2_order_schedule_standard'
};
function resolveStatusKey(key) { return LEGACY_STATUS_ALIASES[key] || key; }
function getJobStatusObj(key) {
  var canonical = resolveStatusKey(key);
  return JOB_STATUSES.find(function(s){ return s.key === canonical; }) || {key:key, label:key, group:'', col:'#9ca3af'};
}
window.resolveStatusKey = resolveStatusKey;
function getJobStatusLabel(key) { return getJobStatusObj(key).label; }
function getJobStatusCol(key) { return getJobStatusObj(key).col; }
function getJobStatusGroup(key) { return getJobStatusObj(key).group; }

const JOB_LEGAL_ENTITIES = {
  VIC:'Spartan Double Glazing Pty Ltd',
  ACT:'Spartan Double Glazing ACT Pty Ltd',
  SA: 'Spartan Double Glazing SA Pty Ltd',
  TAS:'Spartan Double Glazing TAS Pty Ltd',
};

const JOB_WINDOW_CONFIGS = ['Awning','Casement','Sliding 2-pane','Sliding 3-pane','Fixed','Stacker','Bifold','French Door','Entry Door','Custom'];

const CM_TRIM_CODES = ['50T','92x18SB','25T','SILL','90CG','30T','40T','FLAT','QUAD','SCOTIA','REVEAL'];

// Per manual §6.5 — the 7 binding clauses on the Final Design DocuSign.
// Some are conditional (Render Warning, Special Colour Lead Time, Variation
// Acceptance) — they only render if the relevant flag is set on the job.
const FINAL_SIGNOFF_CLAUSES = [
  {key:'opening_direction',     label:'Opening Direction',       text:'I confirm the opening direction of each sash / door as specified in the Final Design.'},
  {key:'glass_type',            label:'Glass Type',              text:'I confirm the glass specification for each pane (safety / laminate / Low-E / obscure as specified).'},
  {key:'override_clause',       label:'Override Clause',         text:'I acknowledge this Final Signed Order legally overrides the original quotation.'},
  {key:'render_warning',        label:'Render Warning',          text:'I acknowledge the property has rendered brick and that render may chip or be damaged during demolition. Spartan is not liable for render repair.', conditional:'renderWarning'},
  {key:'special_colour',        label:'Special Colour Lead Time',text:'I acknowledge that a special-colour combination has been selected and that this extends the manufacturing lead time.', conditional:'specialColour'},
  {key:'variation_acceptance',  label:'Variation Acceptance',    text:'I accept the price variation arising from Check Measure dimensions or specification changes (or have signed a credit note).', conditional:'hasVariation'},
  {key:'production_authorisation', label:'Production Authorisation', text:'I authorise Spartan to begin manufacture against this Final Signed Order.'},
];

// ── Gate logic: enforced status transitions ──────────────────────────────────
// Returns {ok:true} or {ok:false, reason:'...'} for every proposed job status change.
// Every UI path that changes job status MUST call this first.
function canTransition(job, toStatus) {
  var from = job.status;
  var cu = getCurrentUser() || {role:'admin'};
  var isAdmin = cu.role === 'admin';

  // Any → c4 (hold): always allowed, but holdReason enforced in the UI
  if (toStatus === 'c4_date_change_hold') {
    return {ok:true};
  }

  // c4 (hold) → previous: always allowed (pop last non-hold status)
  if (from === 'c4_date_change_hold' && toStatus !== 'c4_date_change_hold') {
    return {ok:true};
  }

  // a_check_measure → c_awaiting_2nd_payment
  if (from === 'a_check_measure' && toStatus === 'c_awaiting_2nd_payment') {
    // Accept frames from either source: the legacy manual job.windows[] OR
    // the CAD-side cadSurveyData.projectItems[] (CAD save path stores
    // width/height there, not on job.windows). Without the second branch,
    // any CAD-only flow gets blocked here even when frames were measured.
    var manualWins = (job.windows || []).filter(function(w){ return +w.widthMm > 0 && +w.heightMm > 0; });
    var cadFrames = ((job.cadSurveyData && job.cadSurveyData.projectItems)
                  || (job.cadFinalData  && job.cadFinalData.projectItems)
                  || (job.cadData       && job.cadData.projectItems)
                  || []).filter(function(f){
      var w = +f.widthMm  || +f.width  || 0;
      var h = +f.heightMm || +f.height || 0;
      return w > 0 && h > 0;
    });
    if (manualWins.length === 0 && cadFrames.length === 0) return {ok:false, reason:'At least one frame with valid dimensions is required.'};
    if (!job.cmCompletedAt) return {ok:false, reason:'Check measure must be marked as completed.'};
    if (!job.cmDocUrl) return {ok:false, reason:'Check measure document must be uploaded.'};
    return {ok:true};
  }

  // c_awaiting_2nd_payment → c1_final_sign_off
  if (from === 'c_awaiting_2nd_payment' && toStatus === 'c1_final_sign_off') {
    if (job.invoice45Id) {
      var invoices = getInvoices ? getInvoices() : [];
      var inv45 = invoices.find(function(i){ return i.id === job.invoice45Id; });
      if (inv45 && inv45.status !== 'paid') return {ok:false, reason:'45% invoice must be paid before proceeding to Final Sign Off.'};
    }
    return {ok:true};
  }

  // c1_final_sign_off → c2_order_schedule_standard
  if (from === 'c1_final_sign_off' && (toStatus === 'c2_order_schedule_standard' || toStatus === 'c3_order_schedule_service')) {
    var sigs = job.signatures || {};
    // Only require clauses that apply to this job (conditional clauses gated by job flags).
    var applicable = FINAL_SIGNOFF_CLAUSES.filter(function(cl){
      if (!cl.conditional) return true;
      return !!job[cl.conditional];
    });
    var allSigned = applicable.every(function(cl){ return sigs[cl.key] && sigs[cl.key].signedAt; });
    if (!allSigned) return {ok:false, reason:'All applicable sign-off clauses must be signed ('+applicable.length+' required).'};
    return {ok:true};
  }

  // c2/c3 → d1 (awaiting material): always allowed
  if ((from === 'c2_order_schedule_standard' || from === 'c3_order_schedule_service') &&
      (toStatus === 'd1_awaiting_material' || toStatus === 'd11_awaiting_svc_material')) {
    return {ok:true};
  }

  // d1 → d2: always allowed (manual)
  if (from === 'd1_awaiting_material' && toStatus === 'd2_material_at_factory') return {ok:true};
  if (from === 'd11_awaiting_svc_material' && toStatus === 'd12_svc_material_at_factory') return {ok:true};
  if (from === 'd12_svc_material_at_factory' && toStatus === 'd13_svc_in_production') return {ok:true};
  if (from === 'd13_svc_in_production' && (toStatus === 'd14_awaiting_glass_svc' || toStatus === 'e1_dispatch_service')) return {ok:true};
  if (from === 'd14_awaiting_glass_svc' && toStatus === 'e1_dispatch_service') return {ok:true};

  // Production sequential: d2 → d3 → d4 → d5 → e_dispatch (no skipping)
  var prodSequence = ['d2_material_at_factory','d3_cutting','d4_milling_steel_welding','d5_hardware_revealing','e_dispatch_standard'];
  var fromIdx = prodSequence.indexOf(from);
  var toIdx = prodSequence.indexOf(toStatus);
  if (fromIdx >= 0 && toIdx >= 0) {
    if (toIdx === fromIdx + 1) return {ok:true};
    if (toIdx > fromIdx + 1 && isAdmin) return {ok:true}; // admin override, reason logged in UI
    if (toIdx > fromIdx + 1) return {ok:false, reason:'Production statuses must progress sequentially. Admin override required to skip.'};
    return {ok:false, reason:'Cannot move backwards in production sequence.'};
  }

  // e/e1 → f_installing: require install_date + crew
  if ((from === 'e_dispatch_standard' || from === 'e1_dispatch_service') && toStatus === 'f_installing') {
    if (!job.installDate) return {ok:false, reason:'Install date must be set.'};
    if (!job.installCrew || job.installCrew.length === 0) return {ok:false, reason:'Install crew must be assigned.'};
    return {ok:true};
  }

  // f_installing → g_final_payment: require install_completed_at
  if (from === 'f_installing' && toStatus === 'g_final_payment') {
    if (!job.installCompletedAt) return {ok:false, reason:'Installation must be marked as completed.'};
    return {ok:true};
  }

  // f_installing → b_check_status: allowed (outstanding work)
  if (from === 'f_installing' && toStatus === 'b_check_status') return {ok:true};

  // Service transitions
  if (toStatus === 'h_service_booked' || toStatus === 'h1_awaiting_contractor') return {ok:true};

  // Storage
  if (toStatus === 'i_in_storage') return {ok:true};

  // b_check_status → various follow-ups
  if (from === 'b_check_status') {
    if (['c_awaiting_2nd_payment','c2_order_schedule_standard','c3_order_schedule_service','h_service_booked'].indexOf(toStatus) >= 0) return {ok:true};
  }

  // Admin override: any transition (only enabled in dev mode — the dev-only
  // "Advance status…" dropdown is the sole UI surface for this).
  if (isAdmin && typeof isDevMode === 'function' && isDevMode()) return {ok:true};

  return {ok:false, reason:'This status transition is not allowed from ' + getJobStatusLabel(from) + '.'};
}

// ── Job field mappers (JS camelCase ↔ DB snake_case) ────────────────────────
function dbToJobWindow(r) {
  var photos = r.photo_urls;
  if (typeof photos === 'string') { try { photos = JSON.parse(photos); } catch(e) { photos = []; } }
  return {
    id: r.id, jobId: r.job_id, label: r.label||'', config: r.config||'',
    widthMm: r.width_mm ? Number(r.width_mm) : 0, heightMm: r.height_mm ? Number(r.height_mm) : 0,
    handleHeight: r.handle_height ? Number(r.handle_height) : 1075,
    glassSpec: r.glass_spec||'', reveal: r.reveal||'',
    trimCodes: r.trim_codes||[], openingDir: r.opening_dir||'',
    photoUrls: Array.isArray(photos) ? photos : [],
    cadRef: r.cad_ref||null, cmNotes: r.cm_notes||'',
    designLocked: !!r.design_locked, created: r.created,
  };
}

// ── Job number generation ──────────────────────────────
async function rpcNextJobNumber(branch) {
  if (!_sb) {
    // Generate job number locally
    var jobs = getState().jobs || [];
    var branchJobs = jobs.filter(function(j){ return j.branch === branch; });
    var maxNum = 4000;
    branchJobs.forEach(function(j) {
      var parts = (j.jobNumber||'').split('-');
      var n = parseInt(parts[1]);
      if (n > maxNum) maxNum = n;
    });
    return branch + '-' + (maxNum + 1);
  }
  try {
    var res = await _sb.rpc('next_job_number', {p_branch: branch});
    if (res.error) throw res.error;
    return res.data;
  } catch(e) {
    console.error('[jobs] RPC next_job_number failed, using local fallback:', e);
    var jobs = getState().jobs || [];
    var branchJobs = jobs.filter(function(j){ return j.branch === branch; });
    var maxNum = 4000;
    branchJobs.forEach(function(j) {
      var parts = (j.jobNumber||'').split('-');
      var n = parseInt(parts[1]);
      if (n > maxNum) maxNum = n;
    });
    return branch + '-' + (maxNum + 1);
  }
}

// ── Job Window CRUD ──────────────────────────────────────────────────────────
function addJobWindow(jobId) {
  var job = (getState().jobs||[]).find(function(j){ return j.id === jobId; });
  if (!job) return;
  var idx = (job.windows||[]).length + 1;
  var w = {
    id: 'jw_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    jobId: jobId,
    label: 'W' + idx,
    config: '',
    widthMm: 0,
    heightMm: 0,
    handleHeight: 1075,
    glassSpec: '',
    reveal: '',
    trimCodes: [],
    openingDir: '',
    photoUrls: [],
    cadRef: null,
    cmNotes: '',
    designLocked: false,
    created: new Date().toISOString(),
  };
  var updatedWindows = (job.windows||[]).concat([w]);
  setState({ jobs: getState().jobs.map(function(j){ return j.id === jobId ? Object.assign({}, j, {windows: updatedWindows}) : j; }) });
  dbInsert('job_windows', jobWindowToDb(w));
  renderPage();
}

function updateJobWindow(windowId, field, value) {
  var jobs = getState().jobs || [];
  var foundJob = null;
  jobs.forEach(function(j){
    if (j.windows && j.windows.find(function(w){ return w.id === windowId; })) foundJob = j;
  });
  if (!foundJob) return;
  var updatedWindows = foundJob.windows.map(function(w){
    if (w.id !== windowId) return w;
    var upd = Object.assign({}, w);
    upd[field] = value;
    return upd;
  });
  setState({ jobs: jobs.map(function(j){ return j.id === foundJob.id ? Object.assign({}, j, {windows: updatedWindows}) : j; }) });
  // Map JS field name to DB column
  var dbField = field.replace(/([A-Z])/g, function(m){ return '_' + m.toLowerCase(); });
  var dbVal = value;
  if (field === 'trimCodes' || field === 'photoUrls') dbVal = JSON.stringify(value);
  var changes = {}; changes[dbField] = dbVal;
  dbUpdate('job_windows', windowId, changes);
}

function deleteJobWindow(jobId, windowId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){ return j.id === jobId; });
  if (!job) return;
  var updatedWindows = (job.windows||[]).filter(function(w){ return w.id !== windowId; });
  setState({ jobs: jobs.map(function(j){ return j.id === jobId ? Object.assign({}, j, {windows: updatedWindows}) : j; }) });
  dbDelete('job_windows', windowId);
  renderPage();
}

// ── Check Measure completion + 45% invoice auto-generation ──────────────────
function markCmComplete(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){ return j.id === jobId; });
  if (!job) { addToast('Job not found', 'error'); return; }
  var wins = (job.windows||[]).filter(function(w){ return w.widthMm > 0 && w.heightMm > 0; });
  if (wins.length === 0) { addToast('Add at least one window with valid dimensions first.', 'error'); return; }
  // Mandatory: CM file must be present. Either job_files has a check_measure
  // row (manual upload path, or async upload landed) OR job.cmDocUrl is set
  // (CAD save just wrote the Storage path; row insert is in flight).
  var cmFiles = getJobFiles(jobId).filter(function(f){return f.category==='check_measure';});
  var hasCmDocPointer = !!job.cmDocUrl;
  if (cmFiles.length === 0 && !hasCmDocPointer) {
    addToast('Upload a Check Measure PDF/photo before completing. Go to Files tab and upload with category "Check Measure".', 'error');
    return;
  }
  var cu = getCurrentUser() || {id:'system', name:'System'};
  var now = new Date().toISOString();
  // Use the existing pointer when present; only overwrite cmDocUrl with the
  // file_id form when the manual-upload path is the source.
  var nextCmDocUrl = hasCmDocPointer ? job.cmDocUrl : cmFiles[0].id;
  setState({ jobs: jobs.map(function(j){ return j.id === jobId ? Object.assign({}, j, {cmCompletedAt: now, cmDocUrl: nextCmDocUrl}) : j; }) });
  dbUpdate('jobs', jobId, {cm_completed_at: now, cm_doc_url: nextCmDocUrl});
  // done:true — check measures are logged on completion, not scheduled ahead.
  // A "completions this period" KPI can now filter on type==='checkMeasure' && done===true.
  var act = {id:'a'+Date.now()+'_cm', type:'checkMeasure', subject:'Check measure completed', text:'Check measure completed — ' + wins.length + ' window(s) measured', date:now.slice(0,10), by:cu.name, done:true, dueDate:''};
  dbInsert('activities', actToDb(act, 'job', jobId));
  logJobAudit(jobId, 'CM Completed', wins.length + ' windows measured. CM document: ' + cmFiles[0].name);
  addToast('Check measure complete', 'success');
}

function triggerCmInvoiceAndAdvance(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){ return j.id === jobId; });
  if (!job) return;
  var check = canTransition(job, 'c_awaiting_2nd_payment');
  if (!check.ok) { addToast(check.reason, 'error'); return; }
  // Auto-generate 45% CM invoice using new system
  generateJobInvoice(jobId, 'cl_cm', 45, '45% Check Measure Complete — ' + (job.jobNumber||''), new Date().toISOString().slice(0,10));
  transitionJobStatus(jobId, 'c_awaiting_2nd_payment', '45% CM progress claim issued — due same day');
}

// Complete CM: validates survey + file, marks complete, triggers 45% invoice, advances to final design
function completeCmAndInvoice(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){return j.id===jobId;});
  if (!job) return;
  // Require CM file pointer. Either a job_files row (manual upload / async
  // landed) OR job.cmDocUrl set by CAD save (Storage upload still in flight).
  // Without the second branch, calling this right after a CAD save races the
  // upload's row insert and the user gets stranded.
  var cmFiles = getJobFiles(jobId).filter(function(f){return f.category==='check_measure';});
  if (cmFiles.length === 0 && !job.cmDocUrl) {
    addToast('Upload a Check Measure file before completing.','error');
    return;
  }
  // Mark CM complete
  var cu = getCurrentUser() || {id:'system',name:'System'};
  var now = new Date().toISOString();
  setState({jobs: getState().jobs.map(function(j){return j.id===jobId?Object.assign({},j,{cmCompletedAt:now}):j;})});
  dbUpdate('jobs', jobId, {cm_completed_at:now});
  var fileLabel = (cmFiles[0] && cmFiles[0].name) || 'CAD-generated PDF (' + (job.cmDocUrl || '') + ')';
  logJobAudit(jobId, 'CM Completed', 'Check measure finalised. CM file: ' + fileLabel);
  // Trigger 45% invoice (for COD jobs)
  var pm = job.paymentMethod || 'cod';
  if (pm === 'cod') {
    generateJobInvoice(jobId, 'cl_cm', 45, '45% Check Measure Complete — '+(job.jobNumber||''), now.slice(0,10));
    transitionJobStatus(jobId, 'c_awaiting_2nd_payment', '45% CM invoice auto-generated');
  }
  addToast('\u2705 Check measure completed! '+(pm==='cod'?'45% invoice sent.':''), 'success');
  renderPage();
}

// Mark final design as signed and advance to installation scheduling
function markFinalDesignSigned(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){return j.id===jobId;});
  if (!job) { addToast('Job not found','error'); return; }
  if (!job.cmCompletedAt) { addToast('Check measure must be completed first','error'); return; }
  var now = new Date().toISOString();
  setState({jobs: getState().jobs.map(function(j){return j.id===jobId?Object.assign({},j,{finalSignedAt:now}):j;})});
  dbUpdate('jobs', jobId, {final_signed_at:now});
  logJobAudit(jobId, 'Final Design Signed', 'Client signature received. Advancing to installation scheduling.');
  // Brief 4 Phase 3: realise commission for deals whose configured gate
  // is 'final_signed'. Cross-module wiring: Jobs CRM directly calls into
  // commission. Realisation is idempotent (no-op if already realised), so
  // re-firing this hook can't double-realise. Defensive guards for
  // load-order safety.
  if (job.dealId && typeof realiseCommission === 'function' && typeof getEffectiveRuleForRep === 'function') {
    try {
      var _deal = (getState().deals || []).find(function (d) { return d.id === job.dealId; });
      if (_deal) {
        var _rule = getEffectiveRuleForRep(_deal.rep, _deal.branch);
        if (_rule && _rule.realisationGate === 'final_signed') {
          realiseCommission(job.dealId, 'final_signed');
        }
      }
    } catch (e) { /* defensive — never block the sign-off flow */ }
  }
  // Advance status to scheduling
  transitionJobStatus(jobId, 'c2_order_schedule_standard', 'Final design signed — sent to Factory CRM for production');
  addToast('\u2705 Final design signed! Job ready for install scheduling.', 'success');
  renderPage();
}

