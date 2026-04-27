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
  {key:'a_check_measure',           label:'a. Check Measure',                          group:'onboarding', col:'#3b82f6'},
  {key:'b_check_status',            label:'b. Check Status / Book Service / Order',   group:'onboarding', col:'#6366f1'},
  // group: finance
  {key:'c_awaiting_2nd_payment',    label:'c. Awaiting Second Payment',               group:'finance',    col:'#f59e0b'},
  {key:'c1_final_sign_off',         label:'c.1 Final Sign Off',                       group:'finance',    col:'#eab308'},
  // group: order
  {key:'c2_order_schedule_standard',label:'c.2 Order & Schedule (Standard Job)',      group:'order',      col:'#14b8a6'},
  {key:'c3_order_schedule_service', label:'c.3 Order & Schedule (Service Work)',      group:'order',      col:'#0ea5e9'},
  // group: hold
  {key:'c4_date_change_hold',       label:'c.4 Date Change Protocol / HOLD',          group:'hold',       col:'#9ca3af'},
  // group: material
  {key:'d1_awaiting_material',      label:'d.1 Awaiting Material',                    group:'material',   col:'#f97316'},
  {key:'d11_awaiting_svc_material', label:'d.11 Awaiting Service Work Material',      group:'material',   col:'#fb923c'},
  {key:'d12_svc_material_at_factory',label:'d.12 Service Work Material at Factory',   group:'material',   col:'#f59e0b'},
  {key:'d13_svc_in_production',     label:'d.13 Service Work Job in Production',      group:'production', col:'#a855f7'},
  {key:'d14_awaiting_glass_svc',    label:'d.14 Awaiting Glass for Service Job',      group:'material',   col:'#ec4899'},
  {key:'d2_material_at_factory',    label:'d.2 Material at Factory',                  group:'material',   col:'#22c55e'},
  // group: production
  {key:'d3_cutting',                label:'d.3 Cutting',                              group:'production', col:'#a855f7'},
  {key:'d4_milling_steel_welding',  label:'d.4 Milling / Steel / Welding',            group:'production', col:'#9333ea'},
  {key:'d5_hardware_revealing',     label:'d.5 Hardware / Revealing / Screens',       group:'production', col:'#7e22ce'},
  // group: dispatch & install
  {key:'e_dispatch_standard',       label:'e. In Dispatch (Standard Job)',            group:'dispatch',   col:'#06b6d4'},
  {key:'e1_dispatch_service',       label:'e.1 Dispatch (Service Work)',              group:'dispatch',   col:'#0891b2'},
  {key:'f_installing',              label:'f. Installing in Progress / Dispatched',   group:'install',    col:'#6366f1'},
  // group: final finance
  {key:'g_final_payment',           label:'g. Final Payment',                         group:'finance',    col:'#22c55e'},
  // group: service
  {key:'h_service_booked',          label:'h. Service Booked',                        group:'service',    col:'#f97316'},
  {key:'h1_awaiting_contractor',    label:'h.1 Awaiting Contractor to Complete',      group:'service',    col:'#fb923c'},
  // group: storage
  {key:'i_in_storage',              label:'I. In Storage Facility',                   group:'hold',       col:'#6b7280'},
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
];

function getJobStatusObj(key) { return JOB_STATUSES.find(function(s){ return s.key === key; }) || {key:key, label:key, group:'', col:'#9ca3af'}; }
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

const FINAL_SIGNOFF_CLAUSES = [
  {key:'clause1', label:'Opening Direction',  text:'I confirm the opening direction of each window / door as specified.'},
  {key:'clause2', label:'Glass Type',         text:'I confirm the glass specification for each opening (safety glass / laminate / Low-E / obscure).'},
  {key:'clause3', label:'Colour & Profile',   text:'I confirm the exterior and interior colours and profile selections.'},
  {key:'clause4', label:'Hardware & Handles', text:'I confirm the hardware finish and handle height (standard 1075mm unless noted).'},
  {key:'clause5', label:'Flyscreens & Trims', text:'I confirm the flyscreen mesh type and trim / architrave selections.'},
  {key:'clause6', label:'Override Clause',    text:'I acknowledge this Final Signed Order legally overrides the original quotation.'},
  {key:'clause7', label:'Site Conditions',    text:'I acknowledge render chipping, access limitations, and other site conditions that may affect installation.'},
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
    var wins = (job.windows || []);
    var validWins = wins.filter(function(w){ return w.widthMm > 0 && w.heightMm > 0; });
    if (validWins.length === 0) return {ok:false, reason:'At least one window with valid dimensions is required.'};
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
    var allSigned = FINAL_SIGNOFF_CLAUSES.every(function(cl){ return sigs[cl.key] && sigs[cl.key].signedAt; });
    if (!allSigned) return {ok:false, reason:'All 7 sign-off clauses must be signed.'};
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

  // Admin override: any transition with reason
  // TODO: confirm with Phoenix — currently Admin only
  if (isAdmin) return {ok:true};

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
  // Mandatory: CM file must be uploaded
  var cmFiles = getJobFiles(jobId).filter(function(f){return f.category==='check_measure';});
  if (cmFiles.length === 0) { addToast('Upload a Check Measure PDF/photo before completing. Go to Files tab and upload with category "Check Measure".', 'error'); return; }
  var cu = getCurrentUser() || {id:'system', name:'System'};
  var now = new Date().toISOString();
  setState({ jobs: jobs.map(function(j){ return j.id === jobId ? Object.assign({}, j, {cmCompletedAt: now, cmDocUrl: cmFiles[0].id}) : j; }) });
  dbUpdate('jobs', jobId, {cm_completed_at: now, cm_doc_url: cmFiles[0].id, updated: now});
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
  // Require CM file
  var cmFiles = getJobFiles(jobId).filter(function(f){return f.category==='check_measure';});
  if (cmFiles.length === 0) { addToast('Upload a Check Measure file before completing.','error'); return; }
  // Mark CM complete
  var cu = getCurrentUser() || {id:'system',name:'System'};
  var now = new Date().toISOString();
  setState({jobs: getState().jobs.map(function(j){return j.id===jobId?Object.assign({},j,{cmCompletedAt:now}):j;})});
  dbUpdate('jobs', jobId, {cm_completed_at:now, updated:now});
  logJobAudit(jobId, 'CM Completed', 'Check measure finalised. CM file: '+cmFiles[0].name);
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
  dbUpdate('jobs', jobId, {final_signed_at:now, updated:now});
  logJobAudit(jobId, 'Final Design Signed', 'Client signature received. Advancing to installation scheduling.');
  // Advance status to scheduling
  transitionJobStatus(jobId, 'e_ready_to_schedule', 'Final design signed — ready for installation scheduling');
  addToast('\u2705 Final design signed! Job ready for install scheduling.', 'success');
  renderPage();
}

