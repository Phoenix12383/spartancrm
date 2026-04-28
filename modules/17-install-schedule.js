// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 17-install-schedule.js
// Extracted from original index.html lines 12243-13286
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// INSTALL SCHEDULE — Weekly Scheduling Dashboard
// ══════════════════════════════════════════════════════════════════════════════

// Local fallback — used when 04-spartan-cad.js is not loaded.
// Precedence: manual override → CAD estimate (rounded up to 0.25h) → caller fallback.
if (typeof getEffectiveInstallHours === 'undefined') {
  window.getEffectiveInstallHours = function(job, fallback) {
    if (job && job.installDurationHours) return job.installDurationHours;
    if (job && job.estimatedInstallMinutes) return Math.ceil(job.estimatedInstallMinutes / 60 * 4) / 4;
    return fallback !== undefined ? fallback : 4;
  };
}

// Installer CRUD (localStorage-backed)
function getInstallers() { return getState().installers || []; }
function saveInstallers(list) {
  localStorage.setItem('spartan_installers', JSON.stringify(list));
  setState({installers: list});
  if (typeof _sb !== 'undefined' && _sb) {
    list.forEach(function(inst) {
      try { dbUpsert('installers', installerToDb(inst)); } catch(e) { console.warn('Installer sync failed', inst.id, e); }
    });
  }
}
function deleteInstaller(id) {
  saveInstallers(getInstallers().filter(function(i){ return i.id !== id; }));
  if (typeof _sb !== 'undefined' && _sb) {
    try { _sb.from('installers').delete().eq('id', id); } catch(e) { console.warn('Installer delete failed', id, e); }
  }
}

// Setup / teardown overhead (manual §8 demand factors): every install adds a
// fixed 30 min for unloading tools, briefing the customer, packing up, etc.
var INSTALL_OVERHEAD_HOURS = 0.5;

// Australian public holidays per state (2026). Auto-blocked from scheduling.
// Add more years as needed; format YYYY-MM-DD. Common = applies to all states.
var AU_PUBLIC_HOLIDAYS = {
  common: ['2026-01-01','2026-01-26','2026-04-03','2026-04-04','2026-04-05','2026-04-06','2026-04-25','2026-12-25','2026-12-26','2026-12-28'],
  VIC: ['2026-03-09','2026-06-08','2026-09-25','2026-11-03'],
  ACT: ['2026-03-09','2026-05-25','2026-06-08','2026-10-05'],
  SA:  ['2026-03-09','2026-06-08','2026-10-05','2026-12-24'],
  TAS: ['2026-02-09','2026-03-09','2026-04-07','2026-06-08','2026-11-02']
};
function isPublicHoliday(dateStr, branch) {
  if (!dateStr) return false;
  if (AU_PUBLIC_HOLIDAYS.common.indexOf(dateStr) >= 0) return true;
  var stateList = AU_PUBLIC_HOLIDAYS[branch || 'VIC'] || [];
  return stateList.indexOf(dateStr) >= 0;
}
window.isPublicHoliday = isPublicHoliday;
window.AU_PUBLIC_HOLIDAYS = AU_PUBLIC_HOLIDAYS;

// Per-installer efficiency % — stored client-side until Supabase has column.
// Lead installer's efficiency multiplies install duration: 80% → +25% time, 110% → -9% time.
function getInstallerEfficiency(id) {
  try { var m = JSON.parse(localStorage.getItem('spartan_installer_eff') || '{}'); return Number(m[id]) || 100; }
  catch(e) { return 100; }
}
function setInstallerEfficiency(id, pct) {
  try {
    var m = JSON.parse(localStorage.getItem('spartan_installer_eff') || '{}');
    m[id] = Number(pct) || 100;
    localStorage.setItem('spartan_installer_eff', JSON.stringify(m));
  } catch(e) {}
}
window.getInstallerEfficiency = getInstallerEfficiency;
window.setInstallerEfficiency = setInstallerEfficiency;

// Crew-aware install hours. Applies the lead installer's efficiency to base
// hours, plus a fixed setup/teardown overhead per install day.
function getCrewEffectiveHours(job, crewIds, fallback) {
  var base = getEffectiveInstallHours(job, fallback);
  if (base <= 0) return base; // 0 fallback stays 0 (used in capacity sums when no time)
  var pct = (crewIds && crewIds.length) ? getInstallerEfficiency(crewIds[0]) : 100;
  var hours = (pct > 0 && pct !== 100) ? base * 100 / pct : base;
  return Math.ceil((hours + INSTALL_OVERHEAD_HOURS) * 4) / 4;
}
window.getCrewEffectiveHours = getCrewEffectiveHours;

// Auto-schedule entry point — called from the "🪄 Auto-Schedule" button.
window.runAutoSchedule = function() {
  var jobs = getState().jobs || [];
  var branch = getState().branch || 'all';
  var offset = getState().scheduleWeekOffset || 0;
  var weekDates = getWeekDates(offset);
  var ws = isoDate(weekDates[0]); var we = isoDate(weekDates[6]);
  var scoped = branch !== 'all' ? jobs.filter(function(j){return j.branch===branch;}) : jobs;
  var weekJobs = scoped.filter(function(j){return j.installDate && j.installDate>=ws && j.installDate<=we;});
  var ready = ['e_dispatch_standard','e1_dispatch_service','c2_order_schedule_standard','c3_order_schedule_service','d5_hardware_revealing'];
  var unscheduled = scoped.filter(function(j){return !j.installDate && ready.indexOf(j.status)>=0;});
  if (unscheduled.length === 0) { addToast('Nothing to auto-schedule', 'info'); return; }
  var installers = getInstallers().filter(function(i){return i.active;});
  if (installers.length === 0) { addToast('No active installers', 'error'); return; }
  var targets = getState().weeklyTargets || {};
  var targetVal = branch !== 'all' ? (targets[branch]||175000) : Object.values(targets).reduce(function(s,v){return s+v;}, 0);
  if (!confirm('Auto-schedule ' + unscheduled.length + ' unscheduled job' + (unscheduled.length!==1?'s':'') + ' across this week? Existing schedules are preserved.')) return;
  var plan = autoScheduleJobs(weekDates, weekJobs, unscheduled, installers, targetVal);
  if (!plan || plan.length === 0) { addToast('No feasible slots found — capacity may be full', 'warning'); return; }
  applyPlan(plan);
};

// Drop handler for the Install Schedule Gantt — places a job at the dropped
// installer/day/time. If dropped on an installer row not yet in the crew, the
// installer is added as the new lead.
window.dropJobOnGantt = function(jobId, ds, rowId, hourWidth, dayStart, offsetX) {
  if (!jobId) return;
  var hrFloat = (offsetX / hourWidth) + dayStart;
  var hh = Math.floor(hrFloat);
  var min = (hrFloat - hh) >= 0.5 ? '30' : '00';
  if (hh < 0) hh = 0;
  if (hh > 23) hh = 23;
  var t = (hh < 10 ? '0' : '') + hh + ':' + min;
  scheduleJobToDate(jobId, ds);
  setTimeout(function() {
    updateJobField(jobId, 'installTime', t);
    if (rowId && rowId !== '_none') {
      var _j = getState().jobs.find(function(x){ return x.id === jobId; });
      var crew = (_j && _j.installCrew) || [];
      // Make the dropped-on installer the lead. If already in crew, move to front; else replace lead.
      var others = crew.filter(function(c){ return c !== rowId; });
      assignCrewToJob(jobId, [rowId].concat(others.slice(0, Math.max(0, others.length - 0))));
      // If the previous lead was the only one, drop them so the job moves cleanly:
      if (crew.length > 0 && crew[0] !== rowId) {
        // Reassign — keep helpers but drop the previous lead from the front.
        // (helpers stay in the array if there are multiple; if only one, this is a clean swap)
      }
    } else if (rowId === '_none') {
      // Dropped onto the Unassigned row — clear the crew.
      assignCrewToJob(jobId, []);
    }
    addToast('Scheduled ' + (jobId.split('_')[0]||'job') + ' at ' + formatTime12(t), 'success');
    renderPage();
  }, 50);
};

function getVehicles() { try { return JSON.parse(localStorage.getItem('spartan_vehicles') || '[]'); } catch(e) { return []; } }
function saveVehicles(list) { localStorage.setItem('spartan_vehicles', JSON.stringify(list)); }
function addVehicle(data) { var list = getVehicles(); data.id = 'veh_' + Date.now(); data.active = true; list.push(data); saveVehicles(list); renderPage(); }
function updateVehicle(id, changes) { saveVehicles(getVehicles().map(function(v){ return v.id === id ? Object.assign({}, v, changes) : v; })); renderPage(); }
function removeVehicle(id) { saveVehicles(getVehicles().filter(function(v){ return v.id !== id; })); addToast('Vehicle removed', 'warning'); renderPage(); }

// ── Tools registry ──────────────────────────────────────────────────────────
// Tools are either pool-shared (any crew can use) or assigned to an installer.
// Jobs declare toolsRequired[] (array of tool ids); the Smart Recommendations
// flag scheduled jobs whose crew lacks any required tool.
function getTools() { try { return JSON.parse(localStorage.getItem('spartan_tools') || '[]'); } catch(e) { return []; } }
function saveTools(list) { localStorage.setItem('spartan_tools', JSON.stringify(list)); }
function addTool(data) { var list = getTools(); data.id = 'tool_' + Date.now(); data.active = true; list.push(data); saveTools(list); renderPage(); }
function updateTool(id, changes) { saveTools(getTools().map(function(t){ return t.id === id ? Object.assign({}, t, changes) : t; })); renderPage(); }
function removeTool(id) { saveTools(getTools().filter(function(t){ return t.id !== id; })); addToast('Tool removed', 'warning'); renderPage(); }
window.getTools = getTools; window.saveTools = saveTools; window.addTool = addTool; window.updateTool = updateTool; window.removeTool = removeTool;

// Per-job required-tool list (side store — until Supabase has tools_required column on jobs)
function getJobTools(jobId) {
  try { var m = JSON.parse(localStorage.getItem('spartan_job_tools') || '{}'); return m[jobId] || []; }
  catch(e) { return []; }
}
function setJobTools(jobId, toolIds) {
  try {
    var m = JSON.parse(localStorage.getItem('spartan_job_tools') || '{}');
    m[jobId] = toolIds;
    localStorage.setItem('spartan_job_tools', JSON.stringify(m));
  } catch(e) {}
}
window.getJobTools = getJobTools; window.setJobTools = setJobTools;
function addInstaller(name, phone, branch, colour) {
  var list = getInstallers();
  var parts = (name||'').trim().split(' ');
  list.push({id:'inst_'+Date.now(), firstName:parts[0]||'', lastName:parts.slice(1).join(' ')||'', name:name,
    phone:phone||'', email:'', street:'', suburb:'', state:branch||'VIC', postcode:'',
    role:'installer', hourlyRate:45, overtimeRate:67.50, employmentType:'employee',
    abn:'', emergencyName:'', emergencyPhone:'', licenseNumber:'',
    startDate:new Date().toISOString().slice(0,10),
    branch:branch||'VIC', colour:colour||'#3b82f6', maxHoursPerDay:8, active:true,
    loginEmail:'', loginPin:'', notes:''});
  saveInstallers(list);
  addToast(name + ' added as installer', 'success');
}
function updateInstaller(id, changes) {
  var list = getInstallers().map(function(i){ return i.id===id ? Object.assign({},i,changes) : i; });
  if (changes.firstName || changes.lastName) {
    list = list.map(function(i){ return i.id===id ? Object.assign({},i,{name:(i.firstName||'')+' '+(i.lastName||'')}) : i; });
  }
  saveInstallers(list);
}
function removeInstaller(id) { deleteInstaller(id); addToast('Installer removed','warning'); }

// ── Job Cost Tracking (localStorage-backed) ─────────────────────────────────
function getJobCosts(jobId) {
  try { return JSON.parse(localStorage.getItem('spartan_job_costs_'+jobId)||'{"labour":[],"materials":[],"additional":[]}'); }
  catch(e) { return {labour:[],materials:[],additional:[]}; }
}
function saveJobCosts(jobId, costs) { localStorage.setItem('spartan_job_costs_'+jobId, JSON.stringify(costs)); }

function addLabourLog(jobId, installerId, date, startTime, endTime, regularH, overtimeH, travelH, notes) {
  var costs = getJobCosts(jobId);
  var inst = getInstallers().find(function(i){return i.id===installerId;});
  var rate = inst ? (inst.hourlyRate||45) : 45;
  var otRate = inst ? (inst.overtimeRate||67.50) : 67.50;
  var labourCost = (regularH||0)*rate + (overtimeH||0)*otRate;
  costs.labour.push({
    id:'lab_'+Date.now(), jobId:jobId, installerId:installerId,
    installerName:inst?inst.name:'Unknown',
    date:date||new Date().toISOString().slice(0,10),
    startTime:startTime||'', endTime:endTime||'',
    regularHours:regularH||0, overtimeHours:overtimeH||0, travelHours:travelH||0,
    hourlyRate:rate, overtimeRate:otRate, labourCost:labourCost,
    notes:notes||''
  });
  saveJobCosts(jobId, costs);
  addToast('Labour logged: $'+labourCost.toFixed(2), 'success');
}
function removeLabourLog(jobId, logId) {
  var costs = getJobCosts(jobId); costs.labour = costs.labour.filter(function(l){return l.id!==logId;});
  saveJobCosts(jobId, costs); addToast('Labour entry removed','warning');
}
function addMaterialCost(jobId, desc, supplier, category, qty, unitCost, date) {
  var costs = getJobCosts(jobId);
  costs.materials.push({id:'mat_'+Date.now(), jobId:jobId, description:desc||'', supplier:supplier||'',
    category:category||'other', qty:qty||1, unitCost:unitCost||0, total:(qty||1)*(unitCost||0),
    date:date||new Date().toISOString().slice(0,10), addedBy:(getCurrentUser()||{name:'Admin'}).name});
  saveJobCosts(jobId, costs); addToast('Material cost added','success');
}
function removeMaterialCost(jobId, costId) {
  var costs = getJobCosts(jobId); costs.materials = costs.materials.filter(function(m){return m.id!==costId;});
  saveJobCosts(jobId, costs); addToast('Material removed','warning');
}
function addAdditionalCost(jobId, desc, category, amount, date) {
  var costs = getJobCosts(jobId);
  costs.additional.push({id:'add_'+Date.now(), jobId:jobId, description:desc||'', category:category||'other',
    amount:amount||0, date:date||new Date().toISOString().slice(0,10), addedBy:(getCurrentUser()||{name:'Admin'}).name});
  saveJobCosts(jobId, costs); addToast('Cost added','success');
}
function removeAdditionalCost(jobId, costId) {
  var costs = getJobCosts(jobId); costs.additional = costs.additional.filter(function(a){return a.id!==costId;});
  saveJobCosts(jobId, costs); addToast('Cost removed','warning');
}
function calcJobCostSummary(job) {
  var costs = getJobCosts(job.id);
  var totalLabour = costs.labour.reduce(function(s,l){return s+l.labourCost;},0);
  var totalLabourHrs = costs.labour.reduce(function(s,l){return s+(l.regularHours||0)+(l.overtimeHours||0);},0);
  var totalTravel = costs.labour.reduce(function(s,l){return s+(l.travelHours||0);},0);
  var totalMaterials = costs.materials.reduce(function(s,m){return s+m.total;},0);
  var totalAdditional = costs.additional.reduce(function(s,a){return s+a.amount;},0);
  var totalCost = totalLabour + totalMaterials + totalAdditional;
  var valExGst = Math.round((job.val||0) / 1.1 * 100) / 100;
  var grossProfit = valExGst - totalCost;
  var marginPct = valExGst > 0 ? Math.round(grossProfit / valExGst * 100) : 0;
  return {totalLabour:totalLabour, totalLabourHrs:totalLabourHrs, totalTravel:totalTravel,
    totalMaterials:totalMaterials, totalAdditional:totalAdditional, totalCost:totalCost,
    valExGst:valExGst, grossProfit:grossProfit, marginPct:marginPct, costs:costs};
}
var editingInstallerId = null;

// ── Job Audit Log (localStorage-backed) ─────────────────────────────────────
function getJobAuditLog(jobId) { try{return JSON.parse(localStorage.getItem('spartan_audit_'+jobId)||'[]');}catch(e){return [];} }
function saveJobAuditLog(jobId, log) { localStorage.setItem('spartan_audit_'+jobId, JSON.stringify(log)); }
function logJobAudit(jobId, action, detail, oldVal, newVal) {
  var log = getJobAuditLog(jobId);
  var user = getCurrentUser() || {name:'System'};
  var entry = {id:'aud_'+Date.now(), action:action, detail:detail||'', oldValue:oldVal||'', newValue:newVal||'', user:user.name, timestamp:new Date().toISOString()};
  log.unshift(entry);
  saveJobAuditLog(jobId, log);
  if(_sb) dbInsert('job_audit', {job_id:jobId, action:action, detail:detail||'', by_user:user.name});
}

// ── Job Files (localStorage-backed + Supabase) ─────────────────────────────
function getJobFiles(jobId) { try{return JSON.parse(localStorage.getItem('spartan_files_'+jobId)||'[]');}catch(e){return [];} }
function saveJobFiles(jobId, files) { localStorage.setItem('spartan_files_'+jobId, JSON.stringify(files)); }
function addJobFile(jobId, name, category, dataUrl) {
  var files = getJobFiles(jobId);
  var user = getCurrentUser() || {name:'Admin'};
  var fileObj = {id:'file_'+Date.now(), name:name, category:category||'general', dataUrl:dataUrl, uploadedBy:user.name, uploadedAt:new Date().toISOString()};
  files.push(fileObj);
  saveJobFiles(jobId, files);
  if(_sb) dbInsert('job_files', {job_id:jobId, name:name, category:category||'general', data_url:dataUrl, uploaded_by:user.name});
  logJobAudit(jobId, 'File Uploaded', name+' ('+category+')');
  addToast('File uploaded: '+name, 'success');
}
function removeJobFile(jobId, fileId) {
  var files = getJobFiles(jobId);
  var file = files.find(function(f){return f.id===fileId;});
  saveJobFiles(jobId, files.filter(function(f){return f.id!==fileId;}));
  if (file) logJobAudit(jobId, 'File Removed', file.name);
  addToast('File removed', 'warning');
}

// ── Progress Claims ─────────────────────────────────────────────────────────
function getJobClaims(jobId) { try{return JSON.parse(localStorage.getItem('spartan_claims_'+jobId)||'[]');}catch(e){return [];} }
function saveJobClaims(jobId, claims) { localStorage.setItem('spartan_claims_'+jobId, JSON.stringify(claims)); }

// Auto-generate progress claim invoice linked to job + invoicing system.
// Keep the record shape in sync with createInvoice() in 25-invoicing.js —
// missing fields (dealTitle, contactAddress, abn, terms, etc.) cause the
// list row and detail panel to render broken / "undefined" text.
function generateJobInvoice(jobId, claimId, pct, description, dueDate) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){return j.id===jobId;});
  if (!job) return null;
  var deal = (getState().deals||[]).find(function(d){return d.id===job.dealId;});
  var contact = (getState().contacts||[]).find(function(c){return c.id===job.contactId;});
  var branch = job.branch || 'VIC';
  var valExGst = Math.round((job.val||0) / 1.1 * 100) / 100;
  var claimExGst = Math.round(valExGst * (pct/100) * 100) / 100;
  var gst = calcGST(claimExGst);
  var invoices = getInvoices();
  var nextNum = 'INV-' + branch + '-' + (invoices.length+1).toString().padStart(4,'0');

  // Count prior progress claims on this deal so the claim number keeps
  // incrementing across the deal's lifecycle.
  var priorClaims = invoices.filter(function(i){
    return i.dealId === (job.dealId||'') && i.type === 'progress_claim' && i.status !== 'void';
  });
  var claimNumber = priorClaims.length + 1;
  var claimedSoFar = priorClaims.reduce(function(s,i){ return s + (i.claimPercent||0); }, 0);
  var today = new Date().toISOString().slice(0,10);

  var inv = {
    id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    invoiceNumber: nextNum,
    dealId: job.dealId || '',
    jobId: jobId,
    jobNumber: job.jobNumber || '',
    contactId: job.contactId || '',
    dealTitle: deal ? deal.title : (job.jobNumber || ''),
    contactName: contact ? contact.fn + ' ' + contact.ln : '',
    contactEmail: contact ? contact.email : '',
    contactPhone: contact ? contact.phone : '',
    contactAddress: contact ? [contact.street,contact.suburb,contact.state,contact.postcode].filter(Boolean).join(', ') : '',
    branch: branch,
    abn: SPARTAN_ABNS[branch] || SPARTAN_ABNS.VIC,
    spartanAddress: SPARTAN_ADDRESSES[branch] || SPARTAN_ADDRESSES.VIC,
    type: 'progress_claim',
    claimNumber: claimNumber,
    claimPercent: pct,
    claimedSoFar: claimedSoFar,
    dealValueIncGst: (deal && deal.val) || job.val || 0,
    dealValueExGst: valExGst,
    description: description,
    lineItems: [{id:'li1', description: description, qty:1, unitPrice:claimExGst, amount:claimExGst}],
    subtotal: claimExGst,
    gst: gst.gst,
    total: gst.total,
    status: 'sent',
    issueDate: today,
    dueDate: dueDate || new Date(Date.now() + 14*24*3600000).toISOString().slice(0,10),
    paidDate: null,
    sentDate: today,
    notes: pct + '% progress claim for ' + (job.jobNumber||''),
    terms: 'Payment due within 14 days.\nBank: ' + SPARTAN_BANK.name + '\nBSB: ' + SPARTAN_BANK.bsb + '\nAccount: ' + SPARTAN_BANK.acc,
    reminders: [],
    autoRemindersEnabled: true,
    createdBy: (getCurrentUser()||{name:'Admin'}).name,
    created: new Date().toISOString(),
  };
  invoices.push(inv);
  saveInvoices(invoices);

  // Update progress claims
  var claims = getJobClaims(jobId);
  claims = claims.map(function(c){ return c.id===claimId ? Object.assign({},c,{status:'invoiced',invoiceId:inv.id,invoiceNumber:nextNum}) : c; });
  saveJobClaims(jobId, claims);

  logJobAudit(jobId, 'Invoice Generated', description + ' — ' + nextNum + ' — $' + gst.total.toLocaleString() + ' inc GST');
  addToast(nextNum + ' generated ($' + gst.total.toLocaleString() + ')', 'success');
  return inv;
}

// Calculate business days before a date
function businessDaysBefore(dateStr, days) {
  var d = new Date(dateStr + 'T12:00:00');
  var count = 0;
  while (count < days) {
    d.setDate(d.getDate() - 1);
    var day = d.getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return d.toISOString().slice(0,10);
}

// Mark job as fully complete — triggers final 5% invoice
function markJobComplete(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){return j.id===jobId;});
  if (!job) return;
  if (!job.completionSignedAt) {
    addToast('Cannot complete — customer has not signed the completion certificate yet.', 'error');
    return;
  }
  // Generate final 5% invoice
  var claims = getJobClaims(jobId);
  var finalClaim = claims.find(function(c){return c.id==='cl_final';});
  if (finalClaim && finalClaim.status === 'pending') {
    generateJobInvoice(jobId, 'cl_final', 5, '5% Completion — Final Balance — ' + (job.jobNumber||''), new Date(Date.now()+7*24*3600000).toISOString().slice(0,10));
  }
  // Update job
  setState({jobs: getState().jobs.map(function(j){return j.id===jobId?Object.assign({},j,{installCompletedAt:new Date().toISOString(),status:'h_completed_standard'}):j;})});
  dbUpdate('jobs', jobId, {install_completed_at:new Date().toISOString(), status:'h_completed_standard'});
  logJobAudit(jobId, 'Job Completed', 'Job marked as complete. Final 5% invoice generated.');
  addToast('Job completed! Final invoice sent.', 'success');
}

// Auto-generate pre-install invoice when install date is set
function checkPreInstallInvoice(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j){return j.id===jobId;});
  if (!job || !job.installDate) return;
  var claims = getJobClaims(jobId);
  var preClaim = claims.find(function(c){return c.id==='cl_preinstall';});
  if (preClaim && preClaim.status === 'pending') {
    var dueDate = businessDaysBefore(job.installDate, 7);
    generateJobInvoice(jobId, 'cl_preinstall', 45, '45% Pre-Installation — Due 7 business days before install — ' + (job.jobNumber||''), dueDate);
  }
}

// Initialize 4-stage claims for a job
function initJobClaims(jobId, jobVal, paymentMethod) {
  var valExGst = Math.round((jobVal||0) / 1.1 * 100) / 100;
  var valIncGst = jobVal || 0;
  var pm = paymentMethod || 'cod';
  var claims;

  if (pm === 'zip') {
    // Zip Money: 20% deposit only, remainder is Zip funded
    claims = [
      {id:'cl_dep', stage:'Deposit (20%)', pct:20, amountExGst:Math.round(valExGst*0.20*100)/100, amountIncGst:Math.round(valIncGst*0.20*100)/100, status:'pending', paidDate:'', invoiceId:'', invoiceNumber:''},
      {id:'cl_zip', stage:'Zip Money (80%)', pct:80, amountExGst:Math.round(valExGst*0.80*100)/100, amountIncGst:Math.round(valIncGst*0.80*100)/100, status:'zip_pending', paidDate:'', invoiceId:'', invoiceNumber:'', isZip:true},
    ];
  } else {
    // COD: standard 4-stage
    claims = [
      {id:'cl_dep', stage:'Deposit (5%)', pct:5, amountExGst:Math.round(valExGst*0.05*100)/100, amountIncGst:Math.round(valIncGst*0.05*100)/100, status:'pending', paidDate:'', invoiceId:'', invoiceNumber:''},
      {id:'cl_cm', stage:'Check Measure (45%)', pct:45, amountExGst:Math.round(valExGst*0.45*100)/100, amountIncGst:Math.round(valIncGst*0.45*100)/100, status:'pending', paidDate:'', invoiceId:'', invoiceNumber:''},
      {id:'cl_preinstall', stage:'Pre-Installation (45%)', pct:45, amountExGst:Math.round(valExGst*0.45*100)/100, amountIncGst:Math.round(valIncGst*0.45*100)/100, status:'pending', paidDate:'', invoiceId:'', invoiceNumber:''},
      {id:'cl_final', stage:'Completion (5%)', pct:5, amountExGst:Math.round(valExGst*0.05*100)/100, amountIncGst:Math.round(valIncGst*0.05*100)/100, status:'pending', paidDate:'', invoiceId:'', invoiceNumber:''},
    ];
  }
  saveJobClaims(jobId, claims);
  return claims;
}

// Week date helpers
function getWeekDates(offset) {
  var now = new Date();
  var day = now.getDay(); // 0=Sun
  var mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + (offset||0)*7);
  mon.setHours(0,0,0,0);
  var dates = [];
  for (var i=0; i<7; i++) { var d = new Date(mon); d.setDate(mon.getDate()+i); dates.push(d); }
  return dates;
}
function fmtShortDate(d) { return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][d.getDay()===0?6:d.getDay()-1] + ' ' + d.getDate() + '/' + (d.getMonth()+1); }
function isoDate(d) { return d.toISOString().slice(0,10); }
function isToday(d) { return isoDate(d) === isoDate(new Date()); }

// Assign job to a date
function scheduleJobToDate(jobId, dateStr) {
  var jobs = getState().jobs || [];
  setState({jobs: jobs.map(function(j){ return j.id===jobId ? Object.assign({},j,{installDate:dateStr}) : j; })});
  dbUpdate('jobs', jobId, {install_date:dateStr});
  logJobAudit(jobId, 'Install Scheduled', 'Install date set to ' + dateStr);
  // Auto-generate 45% pre-install invoice if not already done
  checkPreInstallInvoice(jobId);
  addToast('Job scheduled for ' + dateStr, 'success');
}
function unscheduleJob(jobId) {
  var jobs = getState().jobs || [];
  setState({jobs: jobs.map(function(j){ return j.id===jobId ? Object.assign({},j,{installDate:null}) : j; })});
  dbUpdate('jobs', jobId, {install_date:null});
  addToast('Job unscheduled', 'info');
}
function assignCrewToJob(jobId, crewIds) {
  var jobs = getState().jobs || [];
  setState({jobs: jobs.map(function(j){ return j.id===jobId ? Object.assign({},j,{installCrew:crewIds}) : j; })});
  dbUpdate('jobs', jobId, {install_crew:crewIds});
}
function setJobDuration(jobId, hours) {
  var jobs = getState().jobs || [];
  setState({jobs: jobs.map(function(j){ return j.id===jobId ? Object.assign({},j,{installDurationHours:hours}) : j; })});
  dbUpdate('jobs', jobId, {install_duration_hours:hours});
}
function setJobTime(jobId, time) {
  var jobs = getState().jobs || [];
  setState({jobs: jobs.map(function(j){ return j.id===jobId ? Object.assign({},j,{installTime:time}) : j; })});
  dbUpdate('jobs', jobId, {install_time:time});
}
function calcEndTime(startTime, durationHours) {
  if (!startTime || !durationHours) return '';
  var parts = startTime.match(/(\d+):(\d+)/);
  if (!parts) return '';
  var h = parseInt(parts[1]); var m = parseInt(parts[2]);
  var totalMins = h*60 + m + Math.round(durationHours*60);
  var eh = Math.floor(totalMins/60); var em = totalMins%60;
  if (eh >= 24) eh -= 24;
  return (eh<10?'0':'')+eh+':'+(em<10?'0':'')+em;
}
function formatTime12(t) {
  if (!t) return '';
  var parts = t.match(/(\d+):(\d+)/);
  if (!parts) return t;
  var h = parseInt(parts[1]); var m = parts[2];
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 || 12;
  return h12 + ':' + m + ' ' + ampm;
}

function renderInstallSchedule() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  var offset = getState().scheduleWeekOffset || 0;
  var weekDates = getWeekDates(offset);
  var weekStart = isoDate(weekDates[0]);
  var weekEnd = isoDate(weekDates[6]);
  var installers = getInstallers().filter(function(i){return i.active;});
  var targets = getState().weeklyTargets || {};

  if (branch !== 'all') jobs = jobs.filter(function(j){ return j.branch === branch; });
  var weekJobs = jobs.filter(function(j){ return j.installDate && j.installDate >= weekStart && j.installDate <= weekEnd; });
  var readyStatuses = ['e_dispatch_standard','e1_dispatch_service','c2_order_schedule_standard','c3_order_schedule_service','d5_hardware_revealing'];
  var unscheduled = jobs.filter(function(j){ return !j.installDate && readyStatuses.indexOf(j.status) >= 0; });

  // Timeline constants
  var DAY_START = 6; // 6 AM
  var DAY_END = 18;  // 6 PM
  var HOURS = DAY_END - DAY_START; // 12 hours
  var HOUR_W = 55;   // px per hour
  var DAY_W = HOURS * HOUR_W; // 660px per day
  var ROW_H = 64;    // px per installer row
  var NAME_W = 200;  // installer name column width

  // Metrics
  var weekRevenue = weekJobs.reduce(function(s,j){return s+(j.val||0);},0);
  var weekFrames = weekJobs.reduce(function(s,j){return s+(j.windows||[]).length;},0);
  var weekHours = weekJobs.reduce(function(s,j){return s+(getEffectiveInstallHours(j, 0));},0);
  var targetVal = branch!=='all'?(targets[branch]||175000):Object.values(targets).reduce(function(s,v){return s+v;},0);
  var pctTarget = targetVal>0?Math.round(weekRevenue/targetVal*100):0;

  // KPI
  var kpiH = '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap">'
    +'<div class="card" style="flex:1;min-width:150px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Week Revenue</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;color:#c41230;margin-top:2px">$'+Math.round(weekRevenue).toLocaleString()+'</div><div style="margin-top:4px;height:4px;background:#f3f4f6;border-radius:2px;overflow:hidden"><div style="height:100%;background:#c41230;border-radius:2px;width:'+Math.min(pctTarget,100)+'%"></div></div><div style="font-size:9px;color:#9ca3af;margin-top:2px">'+pctTarget+'% of $'+Math.round(targetVal).toLocaleString()+'</div></div>'
    +'<div class="card" style="flex:1;min-width:90px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Frames</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+weekFrames+'</div></div>'
    +'<div class="card" style="flex:1;min-width:90px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Jobs</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+weekJobs.length+'</div></div>'
    +'<div class="card" style="flex:1;min-width:90px;padding:12px 16px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Hours</div><div style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+weekHours+'h</div></div>'
    +'<div class="card" style="flex:1;min-width:120px;padding:12px 16px;border-left:3px solid '+(function(){var zj=weekJobs.filter(function(j){return j.paymentMethod==="zip"});var zv=zj.reduce(function(s,j){return s+(j.val||0)},0);return zv>20000?"#ef4444":zv>16000?"#f59e0b":"#a855f7"})()+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">\ud83d\udcb3 Zip Money</div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:#7c3aed;margin-top:2px">$'+Math.round(weekJobs.filter(function(j){return j.paymentMethod==="zip"}).reduce(function(s,j){return s+(j.val||0)},0)/1000)+'k<span style="font-size:11px;color:#9ca3af;font-weight:500"> / $20k</span></div></div></div>';

  // Week nav
  var navH = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:14px;flex-wrap:wrap">'
    +'<button onclick="setState({scheduleWeekOffset:(getState().scheduleWeekOffset||0)-1})" class="btn-w" style="padding:5px 10px;font-size:12px">\u2190</button>'
    +'<button onclick="setState({scheduleWeekOffset:0})" class="btn-'+(offset===0?'r':'w')+'" style="padding:5px 14px;font-size:12px;font-weight:700">This Week</button>'
    +'<button onclick="setState({scheduleWeekOffset:(getState().scheduleWeekOffset||0)+1})" class="btn-w" style="padding:5px 10px;font-size:12px">\u2192</button>'
    +'<span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;margin-left:8px">'+fmtShortDate(weekDates[0])+' \u2014 '+fmtShortDate(weekDates[6])+'</span>'
    +(unscheduled.length>0 ? '<button onclick="runAutoSchedule()" class="btn-r" style="padding:5px 14px;font-size:12px;margin-left:auto;gap:4px">\ud83e\ude84 Auto-Schedule '+unscheduled.length+' job'+(unscheduled.length!==1?'s':'')+'</button>' : '')
    +'</div>';

  // Installer rows
  var rows = installers.map(function(inst){return {id:inst.id,name:inst.name,colour:inst.colour,max:(inst.maxHoursPerDay||8),status:''};});
  rows.push({id:'_none',name:'Unassigned',colour:'#9ca3af',max:0,status:''});

  // Helper: time string to px offset within a day
  function timeToPx(t) {
    if (!t) return 0;
    var m = t.match(/(\d+):(\d+)/);
    if (!m) return 0;
    var h = parseInt(m[1]) + parseInt(m[2])/60;
    return Math.max(0, (h - DAY_START)) * HOUR_W;
  }
  function durationToPx(hrs) { return Math.max(HOUR_W * 0.5, (hrs||1) * HOUR_W); }

  // ── Gantt grid ────────────────────────────────────────────────────────────
  var totalW = NAME_W + weekDates.length * DAY_W;
  var g = '<div class="card" style="overflow:auto;padding:0;max-height:calc(100vh - 320px)">';
  g += '<div style="position:relative;min-width:'+totalW+'px">';

  // ── Sticky header row: day names + hour ticks ─────────────────────────────
  g += '<div style="display:flex;position:sticky;top:0;z-index:10;background:#fff;border-bottom:2px solid #e5e7eb">';
  // Name column header
  g += '<div style="width:'+NAME_W+'px;min-width:'+NAME_W+'px;flex-shrink:0;padding:6px 12px;border-right:2px solid #e5e7eb;position:sticky;left:0;z-index:12;background:#fff">'
    +'<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">Installer</div></div>';
  // Day headers with hour ticks
  weekDates.forEach(function(d) {
    var td = isToday(d); var wk = d.getDay()===0||d.getDay()===6;
    var ph = isPublicHoliday(isoDate(d), branch);
    g += '<div style="width:'+DAY_W+'px;min-width:'+DAY_W+'px;flex-shrink:0;border-right:1px solid #e5e7eb">';
    // Day label
    g += '<div style="padding:4px 8px;text-align:center;'+(td?'background:#fef2f2;':ph?'background:#fef3c7;':'background:'+(wk?'#fafafa':'#fff')+';')+';border-bottom:1px solid #f3f4f6">'
      +'<span style="font-size:12px;font-weight:700;'+(td?'color:#c41230':ph?'color:#92400e':'color:#374151')+'">'+fmtShortDate(d)+(td?' \u00b7 Today':ph?' \u00b7 Holiday':'')+'</span></div>';
    // Hour tick marks
    g += '<div style="display:flex;height:20px;border-bottom:1px solid #f0f0f0">';
    for (var h = DAY_START; h < DAY_END; h++) {
      var lbl = h <= 12 ? h + (h<12?'a':'p') : (h-12) + 'p';
      g += '<div style="width:'+HOUR_W+'px;min-width:'+HOUR_W+'px;text-align:center;font-size:9px;color:#9ca3af;border-right:1px solid #f3f4f6;line-height:20px">'+lbl+'</div>';
    }
    g += '</div></div>';
  });
  g += '</div>'; // end header

  // ── Installer rows ────────────────────────────────────────────────────────
  rows.forEach(function(row) {
    var rj = weekJobs.filter(function(j){
      if (row.id==='_none') return !(j.installCrew && j.installCrew.length>0);
      // Only show under the lead's row (first crew member) so the job appears once on the Gantt.
      return (j.installCrew||[])[0] === row.id;
    });
    var rh = rj.reduce(function(s,j){return s+(getCrewEffectiveHours(j, j.installCrew, 0));},0);
    var rf = rj.reduce(function(s,j){return s+(j.windows||[]).length;},0);
    var cap = row.max*5; var pct = cap>0?Math.round(rh/cap*100):0;
    var capCol = pct>90?'#ef4444':pct>70?'#f59e0b':'#22c55e';

    g += '<div style="display:flex;border-bottom:1px solid #f0f0f0;min-height:'+ROW_H+'px">';

    // Sticky name cell
    g += '<div style="width:'+NAME_W+'px;min-width:'+NAME_W+'px;flex-shrink:0;padding:8px 10px;border-right:2px solid #e5e7eb;position:sticky;left:0;z-index:5;background:#fff;display:flex;align-items:center;gap:8px">'
      +'<div style="width:28px;height:28px;border-radius:50%;background:'+row.colour+';color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(row.name||'?')[0]+'</div>'
      +'<div style="min-width:0"><div style="font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+row.name+'</div>'
      +'<div style="font-size:9px;color:#9ca3af">'+rj.length+' jobs \u00b7 '+rf+'fr \u00b7 '+rh+'h</div>'
      +(row.id!=='_none'?'<div style="height:3px;background:#f3f4f6;border-radius:2px;margin-top:2px;width:80px"><div style="height:100%;background:'+capCol+';border-radius:2px;width:'+Math.min(pct,100)+'%"></div></div>':'')
      +'</div></div>';

    // Day cells with Gantt bars
    weekDates.forEach(function(d) {
      var ds = isoDate(d); var td = isToday(d); var wk = d.getDay()===0||d.getDay()===6;
      var ph = isPublicHoliday(ds, branch);
      var cellJobs = rj.filter(function(j){return j.installDate===ds;}).sort(function(a,b){return (a.installTime||'99').localeCompare(b.installTime||'99');});

      g += '<div style="width:'+DAY_W+'px;min-width:'+DAY_W+'px;flex-shrink:0;position:relative;border-right:1px solid #e5e7eb;'+(ph?'background:repeating-linear-gradient(45deg,#fef3c7,#fef3c7 6px,#fde68a 6px,#fde68a 12px);':td?'background:#fffbfb':wk?'background:#fafafa':'')+'"'
        +' ondragover="event.preventDefault();this.style.boxShadow=\'inset 0 0 0 2px #3b82f6\';"'
        +' ondragleave="this.style.boxShadow=\'\';"'
        +' ondrop="this.style.boxShadow=\'\';var r=this.getBoundingClientRect();dropJobOnGantt(event.dataTransfer.getData(\'text/plain\'),\''+ds+'\',\''+row.id+'\','+HOUR_W+','+DAY_START+',event.clientX-r.left);event.preventDefault();"'
        +'>';

      // Hour gridlines
      for (var h = DAY_START; h < DAY_END; h++) {
        var lx = (h - DAY_START) * HOUR_W;
        g += '<div style="position:absolute;left:'+lx+'px;top:0;bottom:0;width:1px;background:#f3f4f6;z-index:0"></div>';
      }
      // Now marker
      if (td) {
        var now = new Date();
        var nowH = now.getHours() + now.getMinutes()/60;
        if (nowH >= DAY_START && nowH <= DAY_END) {
          var nowX = (nowH - DAY_START) * HOUR_W;
          g += '<div style="position:absolute;left:'+nowX+'px;top:0;bottom:0;width:2px;background:#c41230;z-index:3;opacity:.6"></div>';
        }
      }

      // Job bars
      cellJobs.forEach(function(j, idx) {
        var c = contacts.find(function(ct){return ct.id===j.contactId;});
        var cn = c ? c.fn + ' ' + c.ln : '';
        var fr = (j.windows||[]).length;
        var startT = j.installTime || '';
        var dur = getCrewEffectiveHours(j, j.installCrew, 2);
        var left = startT ? timeToPx(startT) : (idx * (HOUR_W * 2.2)); // stack if no time
        var width = durationToPx(dur);
        var endT = calcEndTime(startT, dur);
        var barCol = row.colour || '#9ca3af';
        var noTime = !startT;

        // Ensure bars don't overflow the day
        if (left + width > DAY_W) width = DAY_W - left;

        g += '<div draggable="true" ondragstart="event.dataTransfer.setData(\'text/plain\',\''+j.id+'\');event.dataTransfer.effectAllowed=\'move\';this.style.opacity=\'.5\';" ondragend="this.style.opacity=\'\';" style="position:absolute;left:'+left+'px;top:'+(4 + idx * 0)+'px;width:'+width+'px;height:'+(ROW_H - 8)+'px;z-index:2;cursor:grab" onclick="setState({crmMode:\'jobs\',page:\'jobs\',jobDetailId:\''+j.id+'\'})" title="Drag to reschedule, click to open">';
        g += '<div style="height:100%;border-radius:6px;padding:3px 6px;overflow:hidden;display:flex;flex-direction:column;justify-content:center;'
          +'background:'+barCol+'18;border:1.5px solid '+barCol+'50;'
          +(noTime?'border-style:dashed;':'')
          +'">';
        // Bar content
        g += '<div style="display:flex;align-items:center;gap:4px;overflow:hidden">'
          +'<span style="font-size:10px;font-weight:800;color:'+barCol+';white-space:nowrap">'+(j.jobNumber||'')+'</span>'
          +'<span style="font-size:9px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+cn+'</span></div>';
        g += '<div style="display:flex;align-items:center;gap:4px;overflow:hidden">'
          +'<span style="font-size:9px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+(j.suburb||'')+(j.street?', '+j.street:'')+'</span></div>';
        g += '<div style="display:flex;align-items:center;gap:3px">'
          +'<span style="font-size:8px;font-weight:700;color:'+barCol+'">'+(startT?formatTime12(startT)+(endT?' - '+formatTime12(endT):''):'\u23f0 Set time')+'</span>'
          +'<span style="font-size:8px;color:#6b7280">'+fr+'fr</span>'
          +'<span style="font-size:8px;color:#6b7280">'+dur+'h</span>'
          +'<span style="font-size:8px;color:#15803d;font-weight:600">$'+Math.round((j.val||0)/1000)+'k</span>'
          +(j.paymentMethod==='zip'?'<span style="font-size:7px;font-weight:800;color:#7c3aed;background:#f5f3ff;padding:0 3px;border-radius:3px">ZIP</span>':'')
          +'</div>';
        g += '</div></div>';
      });

      // Empty cell — show dropdown if there are unscheduled jobs, otherwise a drop hint
      if (cellJobs.length === 0) {
        if (unscheduled.length > 0) {
          g += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:1;pointer-events:none">'
            +'<select class="sel" style="font-size:9px;padding:2px 4px;color:#9ca3af;background:transparent;border-color:transparent;pointer-events:auto" onchange="if(this.value){scheduleJobToDate(this.value,\''+ds+'\');'
            +(row.id!=='_none'?'var _jid=this.value;setTimeout(function(){var _j=getState().jobs.find(function(x){return x.id===_jid;});if(_j&&(_j.installCrew||[]).indexOf(\''+row.id+'\')<0){assignCrewToJob(_jid,(_j.installCrew||[]).concat([\''+row.id+'\']));}renderPage();},50);':'')
            +'this.value=\'\';}" onclick="event.stopPropagation()" onfocus="this.style.borderColor=\'#e5e7eb\'" onblur="this.style.borderColor=\'transparent\'">'
            +'<option value="">+ schedule ('+unscheduled.length+')</option>'
            +unscheduled.map(function(j){return '<option value="'+j.id+'">'+(j.jobNumber||'')+' '+(j.suburb||'')+'</option>';}).join('')
            +'</select></div>';
        } else {
          g += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:1;pointer-events:none">'
            +'<span style="font-size:9px;color:#d1d5db;font-style:italic">drag to schedule</span></div>';
        }
      }

      g += '</div>'; // end day cell
    });
    g += '</div>'; // end row
  });

  g += '</div></div>'; // end grid

  // ── INTELLIGENCE ENGINE ─────────────────────────────────────────────────────
  var recs = []; // {type, priority, icon, title, detail, action?, actionLabel?}
  var shortfall = targetVal - weekRevenue;

  // Zip Money weekly tracking ($20k cap)
  var ZIP_WEEKLY_CAP = 20000;
  var zipWeekJobs = weekJobs.filter(function(j){return j.paymentMethod==='zip';});
  var zipWeekVal = zipWeekJobs.reduce(function(s,j){return s+(j.val||0);},0);
  var zipRemaining = ZIP_WEEKLY_CAP - zipWeekVal;
  var zipPct = Math.round(zipWeekVal/ZIP_WEEKLY_CAP*100);

  if (zipWeekVal > ZIP_WEEKLY_CAP) {
    recs.push({type:'overload',priority:0,icon:'\u26a0\ufe0f',
      title:'Zip Money weekly cap EXCEEDED! $'+Math.round(zipWeekVal).toLocaleString()+' / $'+ZIP_WEEKLY_CAP.toLocaleString(),
      detail:'Over by $'+Math.round(zipWeekVal-ZIP_WEEKLY_CAP).toLocaleString()+'. Move a Zip job to next week to stay within the $20k limit.',
      jobs:zipWeekJobs});
  } else if (zipWeekVal > ZIP_WEEKLY_CAP * 0.8) {
    recs.push({type:'notime',priority:3,icon:'\ud83d\udcb3',
      title:'Zip Money nearing cap ('+zipPct+'%) \u2014 $'+Math.round(zipRemaining).toLocaleString()+' remaining',
      detail:zipWeekJobs.length+' Zip jobs this week totalling $'+Math.round(zipWeekVal).toLocaleString()+'. Cap is $'+ZIP_WEEKLY_CAP.toLocaleString()+'/week.',
      jobs:[]});
  }

  // 1. Revenue gap analysis
  if (shortfall > 0) {
    var topCandidates = unscheduled.slice().sort(function(a,b){return(b.val||0)-(a.val||0);}).slice(0,5);
    var canClose = topCandidates.reduce(function(s,j){return s+(j.val||0);},0);
    recs.push({type:'revenue',priority:1,icon:'\ud83d\udcc9',
      title:'$'+Math.round(shortfall).toLocaleString()+' short of weekly target',
      detail:'Schedule '+topCandidates.length+' top-value jobs to recover up to $'+Math.round(canClose).toLocaleString()+':',
      jobs:topCandidates
    });
  } else if (weekJobs.length > 0) {
    recs.push({type:'target_met',priority:10,icon:'\u2705',
      title:'Weekly target achieved! $'+Math.round(weekRevenue).toLocaleString()+' / $'+Math.round(targetVal).toLocaleString(),
      detail:''+pctTarget+'% of target reached. Consider front-loading next week.',jobs:[]
    });
  }

  // 2. Per-installer per-day capacity gaps
  var gapRecs = [];
  installers.forEach(function(inst){
    var maxH = inst.maxHoursPerDay || 8;
    weekDates.forEach(function(d){
      var ds = isoDate(d);
      if (d.getDay()===0||d.getDay()===6) return; // skip weekends
      var dayJobs = weekJobs.filter(function(j){return j.installDate===ds&&(j.installCrew||[]).indexOf(inst.id)>=0;});
      var dayH = dayJobs.reduce(function(s,j){return s+(getCrewEffectiveHours(j, j.installCrew, 0));},0);
      var freeH = maxH - dayH;
      if (freeH >= 3) { // 3+ hours free = significant gap
        // Find best-fit unscheduled job for this gap
        var fits = unscheduled.filter(function(j){return (getEffectiveInstallHours(j, 4)) <= freeH;})
          .sort(function(a,b){return (b.val||0)-(a.val||0);});
        if (fits.length > 0) {
          gapRecs.push({inst:inst, date:d, dateStr:ds, freeH:freeH, bestJob:fits[0], dayH:dayH, maxH:maxH});
        }
      }
    });
  });
  gapRecs.sort(function(a,b){return b.freeH-a.freeH;});
  // Dedupe: keep the best gap per unscheduled job, then per installer.
  var seenJobs = {};
  var seenInstDay = {};
  gapRecs = gapRecs.filter(function(gr){
    if (seenJobs[gr.bestJob.id]) return false;
    var key = gr.inst.id;
    if (seenInstDay[key]) return false;
    seenJobs[gr.bestJob.id] = true;
    seenInstDay[key] = true;
    return true;
  });
  gapRecs.slice(0,4).forEach(function(gr){
    var c=contacts.find(function(ct){return ct.id===gr.bestJob.contactId;});var cn=c?c.fn+' '+c.ln:'';
    recs.push({type:'capacity',priority:2,icon:'\ud83d\udcc5',
      title:gr.inst.name+' has '+gr.freeH+'h free on '+fmtShortDate(gr.date),
      detail:'Only '+gr.dayH+'/'+gr.maxH+'h booked. Recommend: '+(gr.bestJob.jobNumber||'')+' ('+cn+', '+(gr.bestJob.suburb||'')+', '+(getEffectiveInstallHours(gr.bestJob, 4))+'h, $'+Math.round((gr.bestJob.val||0)/1000)+'k)',
      actionJob:gr.bestJob.id, actionDate:gr.dateStr, actionInst:gr.inst.id
    });
  });

  // 3. Overload warnings — installer booked > max hours on a day
  installers.forEach(function(inst){
    var maxH = inst.maxHoursPerDay || 8;
    weekDates.forEach(function(d){
      var ds = isoDate(d);
      var dayJobs = weekJobs.filter(function(j){return j.installDate===ds&&(j.installCrew||[]).indexOf(inst.id)>=0;});
      var dayH = dayJobs.reduce(function(s,j){return s+(getCrewEffectiveHours(j, j.installCrew, 0));},0);
      if (dayH > maxH) {
        var overBy = dayH - maxH;
        // Find smallest job to suggest moving
        var movable = dayJobs.slice().sort(function(a,b){return (getEffectiveInstallHours(a, 4))-(getEffectiveInstallHours(b, 4));});
        var toMove = movable[0];
        // Find a day with capacity for this installer
        var bestDay = null; var bestFree = 0;
        weekDates.forEach(function(d2){
          if(isoDate(d2)===ds||d2.getDay()===0||d2.getDay()===6)return;
          var d2Jobs=weekJobs.filter(function(j){return j.installDate===isoDate(d2)&&(j.installCrew||[]).indexOf(inst.id)>=0;});
          var d2H=d2Jobs.reduce(function(s,j){return s+(getEffectiveInstallHours(j, 0));},0);
          var free=maxH-d2H;
          if(free>=(getEffectiveInstallHours(toMove, 4))&&free>bestFree){bestFree=free;bestDay=d2;}
        });
        recs.push({type:'overload',priority:0,icon:'\u26a0\ufe0f',
          title:inst.name+' overloaded on '+fmtShortDate(d)+' ('+dayH+'h / '+maxH+'h max)',
          detail:'Over by '+overBy+'h. '+(bestDay?'Move '+(toMove.jobNumber||'')+' to '+fmtShortDate(bestDay)+' ('+bestFree+'h free)':'Consider reassigning '+(toMove.jobNumber||'')+' to another installer.'),
          moveJob:toMove?toMove.id:null, moveDate:bestDay?isoDate(bestDay):null
        });
      }
    });
  });

  // 4. Batch delivery opportunities (suburb clusters in unscheduled)
  var subG={};unscheduled.forEach(function(j){var k=(j.suburb||'Unknown').trim();if(!subG[k])subG[k]=[];subG[k].push(j);});
  var subs=Object.keys(subG).sort(function(a,b){return subG[b].length-subG[a].length;});
  subs.filter(function(s){return subG[s].length>=2;}).slice(0,3).forEach(function(sub){
    var grp=subG[sub];var gv=grp.reduce(function(s,j){return s+(j.val||0);},0);var gf=grp.reduce(function(s,j){return s+(j.windows||[]).length;},0);
    recs.push({type:'batch',priority:3,icon:'\ud83d\ude9a',
      title:grp.length+' jobs in '+sub+' \u2014 batch delivery',
      detail:'$'+Math.round(gv/1000)+'k total, '+gf+' frames. Schedule on same day to save delivery runs.',
      batchJobs:grp
    });
  });

  // 5. No-time warnings
  var noTimeJobs = weekJobs.filter(function(j){return !j.installTime;});
  if (noTimeJobs.length > 0) {
    recs.push({type:'notime',priority:2,icon:'\u23f0',
      title:noTimeJobs.length+' scheduled job'+(noTimeJobs.length!==1?'s':'')+' without a start time',
      detail:'Set times to avoid scheduling conflicts: '+noTimeJobs.map(function(j){return j.jobNumber;}).join(', '),
      jobs:noTimeJobs
    });
  }

  // 6. Vehicle / capacity validation per scheduled job
  var allVehicles = (typeof getVehicles === 'function' ? getVehicles() : []).filter(function(v){return v.active;});
  var SIZE_LIMITS = {small:1500, medium:2400, large:3000, xl:3600};
  var SIZE_LABEL = {small:'Small', medium:'Medium', large:'Large', xl:'XL'};
  weekJobs.forEach(function(j){
    var crew = j.installCrew || [];
    if (crew.length === 0) return; // separately flagged
    var crewVehicles = allVehicles.filter(function(v){return crew.indexOf(v.assignedTo)>=0;});
    var fr = (j.windows||[]).length;
    var maxDim = (j.windows||[]).reduce(function(s,w){return Math.max(s, w.widthMm||0, w.heightMm||0);}, 0);
    var jobLabel = (j.jobNumber||'') + (j.suburb?' \u00b7 '+j.suburb:'');

    if (crewVehicles.length === 0) {
      var heavy = maxDim >= 1800 || fr >= 4;
      if (heavy) {
        recs.push({type:'overload',priority:1,icon:'\ud83d\ude90',
          title:'No vehicle assigned to crew on '+jobLabel,
          detail:fr+' frames, largest '+(maxDim||'?')+'mm. Lead installer needs an assigned vehicle in Settings \u2192 Vehicles.'
        });
      }
      return;
    }
    var bestSize = crewVehicles.reduce(function(s,v){return Math.max(s, SIZE_LIMITS[v.size]||0);}, 0);
    var bestCap = crewVehicles.reduce(function(s,v){return Math.max(s, v.maxFrames||0);}, 0);
    if (bestSize > 0 && maxDim > bestSize) {
      var fitVeh = allVehicles.find(function(v){return (SIZE_LIMITS[v.size]||0) >= maxDim;});
      recs.push({type:'overload',priority:0,icon:'\u26a0\ufe0f',
        title:'Vehicle too small for '+jobLabel,
        detail:'Largest frame is '+maxDim+'mm but assigned vehicle holds up to '+bestSize+'mm.'+(fitVeh?' \u2192 '+fitVeh.name+' ('+(SIZE_LABEL[fitVeh.size]||fitVeh.size)+') would fit.':' Add a larger vehicle in Settings.')
      });
    }
    if (bestCap > 0 && fr > bestCap) {
      recs.push({type:'overload',priority:0,icon:'\u26a0\ufe0f',
        title:'Too many frames for vehicle on '+jobLabel,
        detail:fr+' frames vs vehicle limit of '+bestCap+'. Consider splitting the job across two days or using a larger vehicle.'
      });
    }
  });

  // 7. Tool match validation per scheduled job
  var allTools = (typeof getTools === 'function' ? getTools() : []).filter(function(t){return t.active!==false;});
  weekJobs.forEach(function(j){
    var crew = j.installCrew || [];
    if (crew.length === 0) return;
    var required = (typeof getJobTools === 'function') ? getJobTools(j.id) : [];
    if (required.length === 0) return;
    var missing = [];
    required.forEach(function(tid){
      var tool = allTools.find(function(t){return t.id===tid;});
      if (!tool) return; // tool was deleted, skip
      // Shared tools assumed available; assigned tools require their owner in the crew.
      if (tool.shared !== false) return;
      if (!tool.assignedTo) { missing.push(tool.name + ' (unassigned)'); return; }
      if (crew.indexOf(tool.assignedTo) < 0) { missing.push(tool.name); }
    });
    if (missing.length > 0) {
      recs.push({type:'overload',priority:1,icon:'\ud83d\udee0\ufe0f',
        title:'Crew missing tool'+(missing.length>1?'s':'')+' for '+(j.jobNumber||'')+(j.suburb?' \u00b7 '+j.suburb:''),
        detail:'Required: '+missing.join(', ')+'. Reassign a crew member who has the tool, or share/reassign the tool in Settings \u2192 Tools.'
      });
    }
  });

  // Sort by priority (0=highest)
  recs.sort(function(a,b){return a.priority-b.priority;});

  // ── Render recommendations panel ──────────────────────────────────────────
  var recsHtml = '<div style="margin-top:16px">';
  recsHtml += '<div class="card" style="padding:16px;margin-bottom:14px;border-left:4px solid '+(shortfall>0?'#f59e0b':'#22c55e')+'">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
    +'<h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:800;margin:0">\ud83e\udde0 Smart Recommendations</h3>'
    +'<span style="font-size:11px;color:#6b7280">'+recs.length+' suggestion'+(recs.length!==1?'s':'')+'</span></div>';

  if (recs.length === 0) {
    recsHtml += '<div style="color:#22c55e;font-size:13px;text-align:center;padding:16px">\u2705 Schedule is optimised. No recommendations.</div>';
  } else {
    recs.forEach(function(r){
      var borderCol = r.type==='overload'?'#ef4444':r.type==='revenue'?'#f59e0b':r.type==='target_met'?'#22c55e':r.type==='capacity'?'#3b82f6':r.type==='batch'?'#06b6d4':r.type==='notime'?'#a855f7':'#e5e7eb';
      var bgCol = r.type==='overload'?'#fef2f2':r.type==='revenue'?'#fffbeb':r.type==='target_met'?'#f0fdf4':r.type==='capacity'?'#eff6ff':r.type==='batch'?'#ecfeff':'#faf5ff';
      recsHtml += '<div style="display:flex;gap:12px;padding:12px 14px;background:'+bgCol+';border:1px solid '+borderCol+'30;border-left:3px solid '+borderCol+';border-radius:8px;margin-bottom:8px;align-items:flex-start">'
        +'<span style="font-size:18px;flex-shrink:0;line-height:1">'+r.icon+'</span>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:2px">'+r.title+'</div>'
        +'<div style="font-size:12px;color:#475569;line-height:1.5">'+r.detail+'</div>';

      // Action buttons
      if (r.type==='revenue' && r.jobs && r.jobs.length > 0) {
        recsHtml += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">';
        r.jobs.forEach(function(j){
          recsHtml += '<div style="display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;padding:3px 8px;font-size:10px">'
            +'<span style="font-weight:700;color:#c41230">'+(j.jobNumber||'')+'</span>'
            +'<span style="color:#6b7280">'+(j.suburb||'')+'</span>'
            +'<span style="font-weight:600;color:#15803d">$'+Math.round((j.val||0)/1000)+'k</span>'
            +'<select class="sel" style="font-size:9px;padding:1px 3px;border-color:#e5e7eb" onchange="if(this.value)scheduleJobToDate(\''+j.id+'\',this.value)" onclick="event.stopPropagation()"><option value="">Book\u2192</option>'
            +weekDates.map(function(d){return '<option value="'+isoDate(d)+'">'+fmtShortDate(d)+'</option>';}).join('')+'</select></div>';
        });
        recsHtml += '</div>';
      }
      if (r.type==='capacity' && r.actionJob) {
        recsHtml += '<div style="margin-top:6px"><button onclick="scheduleJobToDate(\''+r.actionJob+'\',\''+r.actionDate+'\');var _j=getState().jobs.find(function(x){return x.id===\''+r.actionJob+'\'});if(_j&&(_j.installCrew||[]).indexOf(\''+r.actionInst+'\')<0){assignCrewToJob(\''+r.actionJob+'\',(_j.installCrew||[]).concat([\''+r.actionInst+'\']));}" class="btn-r" style="font-size:11px;padding:4px 12px">Schedule this job \u2192</button></div>';
      }
      if (r.type==='overload' && r.moveJob && r.moveDate) {
        recsHtml += '<div style="margin-top:6px"><button onclick="scheduleJobToDate(\''+r.moveJob+'\',\''+r.moveDate+'\')" class="btn-w" style="font-size:11px;padding:4px 12px;border-color:#fca5a5;color:#b91c1c">Move job to suggested day \u2192</button></div>';
      }
      if (r.type==='batch' && r.batchJobs) {
        recsHtml += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px">';
        r.batchJobs.forEach(function(j){
          recsHtml += '<span style="font-size:10px;font-weight:600;background:#dbeafe;color:#1d4ed8;padding:1px 8px;border-radius:10px">'+(j.jobNumber||'')+'</span>';
        });
        recsHtml += '</div>';
      }

      recsHtml += '</div></div>';
    });
  }
  recsHtml += '</div>';

  // ── Unscheduled jobs table ────────────────────────────────────────────────
  recsHtml += '<div style="display:flex;gap:14px;margin-top:14px">';
  recsHtml += '<div class="card" style="flex:1;padding:14px;max-height:280px;overflow-y:auto">'
    +'<div style="font-size:12px;font-weight:700;font-family:Syne,sans-serif;margin-bottom:8px">Unscheduled Jobs <span style="font-weight:400;color:#9ca3af">('+unscheduled.length+')</span></div>';
  if (unscheduled.length === 0) {
    recsHtml += '<div style="color:#22c55e;font-size:12px;text-align:center;padding:16px">\u2705 All dispatch-ready jobs scheduled</div>';
  } else {
    recsHtml += '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr><th class="th" style="font-size:10px">Job</th><th class="th" style="font-size:10px">Client</th><th class="th" style="font-size:10px">Suburb</th><th class="th" style="font-size:10px">Fr</th><th class="th" style="font-size:10px">Value</th><th class="th" style="font-size:10px">Schedule</th></tr></thead><tbody>';
    unscheduled.sort(function(a,b){return(b.val||0)-(a.val||0);}).forEach(function(j){
      var c=contacts.find(function(ct){return ct.id===j.contactId;});var cn=c?c.fn+' '+c.ln:'\u2014';
      recsHtml += '<tr draggable="true" ondragstart="event.dataTransfer.setData(\'text/plain\',\''+j.id+'\');event.dataTransfer.effectAllowed=\'move\';this.style.opacity=\'.5\';" ondragend="this.style.opacity=\'\';" style="cursor:grab" title="Drag to a day/installer cell to schedule">'
        +'<td class="td" style="font-weight:700;color:#c41230">\u22ee\u22ee '+(j.jobNumber||'')+'</td>'
        +'<td class="td">'+cn+'</td>'
        +'<td class="td">'+(j.suburb||'')+'</td>'
        +'<td class="td">'+(j.windows||[]).length+'</td>'
        +'<td class="td">$'+Math.round((j.val||0)/1000)+'k</td>'
        +'<td class="td"><select class="sel" style="font-size:9px;padding:2px 4px" onchange="if(this.value)scheduleJobToDate(\''+j.id+'\',this.value)"><option value="">Book\u2026</option>'
        +weekDates.map(function(d){return '<option value="'+isoDate(d)+'">'+fmtShortDate(d)+'</option>';}).join('')+'</select></td></tr>';
    });
    recsHtml += '</tbody></table>';
  }
  recsHtml += '</div></div>';

  recsHtml += '</div>'; // end bottom section

  // Crew sidebar
  var crew = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">';
  installers.forEach(function(inst){
    var ij=weekJobs.filter(function(j){return(j.installCrew||[]).indexOf(inst.id)>=0;});
    var ih=ij.reduce(function(s,j){return s+(getCrewEffectiveHours(j, j.installCrew, 0));},0);
    var cap=(inst.maxHoursPerDay||8)*5;var pct=cap>0?Math.round(ih/cap*100):0;
    var capCol=pct>90?'#ef4444':pct>70?'#f59e0b':'#22c55e';
    crew += '<div style="display:flex;align-items:center;gap:6px;padding:6px 12px;background:#fff;border:1px solid #e5e7eb;border-radius:8px">'
      +'<div style="width:22px;height:22px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center">'+(inst.name||'?')[0]+'</div>'
      +'<div><div style="font-size:11px;font-weight:600">'+inst.name+'</div>'
      +'<div style="font-size:9px;color:#9ca3af">'+ij.length+' jobs \u00b7 '+ih+'/'+cap+'h</div></div>'
      +'<div style="width:40px;height:4px;background:#f3f4f6;border-radius:2px;margin-left:4px"><div style="height:100%;background:'+capCol+';border-radius:2px;width:'+Math.min(pct,100)+'%"></div></div>'
      +'</div>';
  });
  crew += '<button onclick="jobSettTab=\'installers\';setState({page:\'jobsettings\'})" class="btn-g" style="font-size:11px;padding:6px 12px">'+Icon({n:'settings',size:12})+' Manage Crew</button>';
  crew += '</div>';

  return '<div>'
    +'<div style="margin-bottom:12px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">Installation Schedule</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Weekly Gantt view \u2014 hour by hour, person by person</p></div>'
    +kpiH+crew+navH+g+recsHtml
    +'</div>';
}

// ══════════════════════════════════════════════════════════════════════════════
// SMART CAPACITY PLANNING — Auto-scheduling engine
// ══════════════════════════════════════════════════════════════════════════════

function autoScheduleJobs(weekDates, weekJobs, unscheduled, installers, targetVal) {
  // Deep-clone the inputs so we can simulate without mutating state
  var plan = []; // [{jobId, installDate, installTime, crewIds:[], score, reason}]
  var simBooked = {}; // {installerId: {dateStr: hoursBooked}}
  var simDayRevenue = {}; // {dateStr: revenue}
  var simDaySuburbs = {}; // {dateStr: {installerId: [suburbs]}}

  // Seed from existing scheduled jobs
  installers.forEach(function(inst){
    simBooked[inst.id] = {};
    weekDates.forEach(function(d){ simBooked[inst.id][isoDate(d)] = 0; });
  });
  weekDates.forEach(function(d){ simDayRevenue[isoDate(d)] = 0; simDaySuburbs[isoDate(d)] = {}; });
  weekJobs.forEach(function(j){
    var ds = j.installDate;
    simDayRevenue[ds] = (simDayRevenue[ds]||0) + (j.val||0);
    (j.installCrew||[]).forEach(function(cid){
      if (simBooked[cid]) simBooked[cid][ds] = (simBooked[cid][ds]||0) + (getEffectiveInstallHours(j, 4));
      if (!simDaySuburbs[ds][cid]) simDaySuburbs[ds][cid] = [];
      if (j.suburb) simDaySuburbs[ds][cid].push(j.suburb.toLowerCase().trim());
    });
  });

  // Zip Money weekly cap tracking
  var ZIP_CAP = 20000;
  var simZipTotal = weekJobs.filter(function(j){return j.paymentMethod==='zip';}).reduce(function(s,j){return s+(j.val||0);},0);

  // Sort unscheduled: oldest first, then highest value
  var candidates = unscheduled.slice().sort(function(a,b){
    var ageDiff = (a.created||'').localeCompare(b.created||'');
    if (ageDiff !== 0) return ageDiff;
    return (b.val||0) - (a.val||0);
  });

  // Daily revenue target (spread evenly across weekdays)
  var dailyTarget = targetVal / 5;

  candidates.forEach(function(job) {
    var dur = getEffectiveInstallHours(job, 4);
    var suburb = (job.suburb||'').toLowerCase().trim();
    var bestScore = -Infinity;
    var bestSlot = null;

    weekDates.forEach(function(d, di) {
      if (d.getDay() === 0 || d.getDay() === 6) return; // skip weekends
      var ds = isoDate(d);
      if (isPublicHoliday(ds, job.branch)) return; // skip public holidays

      installers.forEach(function(inst) {
        var maxH = inst.maxHoursPerDay || 8;
        var booked = simBooked[inst.id][ds] || 0;
        var remaining = maxH - booked;
        if (remaining < dur) return; // doesn't fit

        // Zip Money cap: skip if adding this Zip job would exceed $20k/week
        if (job.paymentMethod === 'zip' && (simZipTotal + (job.val||0)) > ZIP_CAP) return;

        // Score components
        var score = 0;

        // 1. Area clustering bonus (big): same suburb = +50, nearby = +20
        var instSuburbs = simDaySuburbs[ds][inst.id] || [];
        if (instSuburbs.indexOf(suburb) >= 0) score += 50;
        else if (instSuburbs.length === 0) score += 10; // empty day, neutral

        // 2. Revenue balancing: prefer days below daily target
        var dayRev = simDayRevenue[ds] || 0;
        if (dayRev < dailyTarget) score += 30;
        else score += 5;

        // 3. Utilisation preference: prefer filling gaps (installer at 30-70% = ideal)
        var utilPct = (booked + dur) / maxH * 100;
        if (utilPct >= 40 && utilPct <= 85) score += 20;
        else if (utilPct > 85) score += 5;
        else score += 10;

        // 4. Earlier in the week preferred (jobs get done sooner)
        score += (7 - di) * 2;

        // 5. Value bonus: prioritise high-value when below target
        if (dayRev < dailyTarget && (job.val||0) > 20000) score += 15;

        if (score > bestScore) {
          bestScore = score;
          bestSlot = {ds:ds, date:d, instId:inst.id, instName:inst.name, instColour:inst.colour, score:score, booked:booked, remaining:remaining};
        }
      });
    });

    if (bestSlot) {
      // Calculate a sensible start time (after existing bookings for that installer)
      var startHour = 7 + (bestSlot.booked || 0); // stack after existing hours
      if (startHour > 16) startHour = 7; // reset if too late
      var startTime = (startHour < 10 ? '0' : '') + startHour + ':00';

      var reason = [];
      var instSubs = simDaySuburbs[bestSlot.ds][bestSlot.instId] || [];
      if (instSubs.indexOf(suburb) >= 0) reason.push('Same area as existing job');
      if ((simDayRevenue[bestSlot.ds]||0) < dailyTarget) reason.push('Day needs revenue');
      if (bestSlot.remaining >= dur * 1.5) reason.push('Good capacity fit');
      reason.push(bestSlot.instName + ' has ' + bestSlot.remaining + 'h free');

      plan.push({
        jobId: job.id, job: job,
        installDate: bestSlot.ds, dateObj: bestSlot.date,
        installTime: startTime,
        crewIds: [bestSlot.instId],
        instName: bestSlot.instName, instColour: bestSlot.instColour,
        score: bestSlot.score, reasons: reason
      });

      // Update simulation
      simBooked[bestSlot.instId][bestSlot.ds] = (simBooked[bestSlot.instId][bestSlot.ds]||0) + dur;
      simDayRevenue[bestSlot.ds] = (simDayRevenue[bestSlot.ds]||0) + (job.val||0);
      if (!simDaySuburbs[bestSlot.ds][bestSlot.instId]) simDaySuburbs[bestSlot.ds][bestSlot.instId] = [];
      if (suburb) simDaySuburbs[bestSlot.ds][bestSlot.instId].push(suburb);
      if (job.paymentMethod === 'zip') simZipTotal += (job.val||0);
    }
  });

  return plan;
}

function applyPlan(plan) {
  var count = 0;
  plan.forEach(function(p){
    scheduleJobToDate(p.jobId, p.installDate);
    if (p.installTime) setJobTime(p.jobId, p.installTime);
    if (p.crewIds && p.crewIds.length > 0) {
      var j = getState().jobs.find(function(x){return x.id===p.jobId;});
      var existing = j ? (j.installCrew||[]) : [];
      var merged = existing.slice();
      p.crewIds.forEach(function(cid){ if (merged.indexOf(cid)<0) merged.push(cid); });
      assignCrewToJob(p.jobId, merged);
    }
    if (p.job && p.job.installDurationHours) setJobDuration(p.jobId, p.job.installDurationHours);
    count++;
  });
  addToast(count + ' jobs auto-scheduled', 'success');
}

function applySinglePlan(p) {
  scheduleJobToDate(p.jobId, p.installDate);
  if (p.installTime) setJobTime(p.jobId, p.installTime);
  if (p.crewIds && p.crewIds.length > 0) {
    var j = getState().jobs.find(function(x){return x.id===p.jobId;});
    var existing = j ? (j.installCrew||[]) : [];
    var merged = existing.slice();
    p.crewIds.forEach(function(cid){ if (merged.indexOf(cid)<0) merged.push(cid); });
    assignCrewToJob(p.jobId, merged);
  }
  addToast((p.job?p.job.jobNumber:'Job') + ' scheduled to ' + p.installDate, 'success');
}

// Store the last generated plan so buttons can reference it
var _lastCapacityPlan = [];

function renderCapacityPlanning() {
  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var branch = getState().branch || 'all';
  var offset = getState().scheduleWeekOffset || 0;
  var weekDates = getWeekDates(offset);
  var weekStart = isoDate(weekDates[0]);
  var weekEnd = isoDate(weekDates[6]);
  var installers = getInstallers().filter(function(i){return i.active;});
  var targets = getState().weeklyTargets || {};

  if (branch !== 'all') jobs = jobs.filter(function(j){ return j.branch === branch; });
  var weekJobs = jobs.filter(function(j){ return j.installDate && j.installDate >= weekStart && j.installDate <= weekEnd; });
  var readyStatuses = ['e_dispatch_standard','e1_dispatch_service','c2_order_schedule_standard','c3_order_schedule_service','d5_hardware_revealing'];
  var unscheduled = jobs.filter(function(j){ return !j.installDate && readyStatuses.indexOf(j.status) >= 0; });
  var targetVal = branch!=='all'?(targets[branch]||175000):Object.values(targets).reduce(function(s,v){return s+v;},0);

  // Run the auto-scheduler
  var plan = autoScheduleJobs(weekDates, weekJobs, unscheduled, installers, targetVal);
  _lastCapacityPlan = plan;

  // Current vs projected metrics
  var curRevenue = weekJobs.reduce(function(s,j){return s+(j.val||0);},0);
  var planRevenue = plan.reduce(function(s,p){return s+(p.job.val||0);},0);
  var projectedRevenue = curRevenue + planRevenue;
  var curFrames = weekJobs.reduce(function(s,j){return s+(j.windows||[]).length;},0);
  var planFrames = plan.reduce(function(s,p){return s+(p.job.windows||[]).length;},0);
  var curHours = weekJobs.reduce(function(s,j){return s+(getEffectiveInstallHours(j, 0));},0);
  var planHours = plan.reduce(function(s,p){return s+(getEffectiveInstallHours(p.job, 4));},0);
  var pctCur = targetVal>0?Math.round(curRevenue/targetVal*100):0;
  var pctProj = targetVal>0?Math.round(projectedRevenue/targetVal*100):0;

  // Week nav
  var navH = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:14px">'
    +'<button onclick="setState({scheduleWeekOffset:(getState().scheduleWeekOffset||0)-1})" class="btn-w" style="padding:5px 10px;font-size:12px">\u2190</button>'
    +'<button onclick="setState({scheduleWeekOffset:0})" class="btn-'+(offset===0?'r':'w')+'" style="padding:5px 14px;font-size:12px;font-weight:700">This Week</button>'
    +'<button onclick="setState({scheduleWeekOffset:(getState().scheduleWeekOffset||0)+1})" class="btn-w" style="padding:5px 10px;font-size:12px">\u2192</button>'
    +'<span style="font-family:Syne,sans-serif;font-weight:700;font-size:14px;margin-left:8px">'+fmtShortDate(weekDates[0])+' \u2014 '+fmtShortDate(weekDates[6])+'</span></div>';

  // ── Projection KPI cards ──────────────────────────────────────────────────
  var kpi = '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  // Revenue projection
  kpi += '<div class="card" style="flex:2;min-width:250px;padding:16px 20px">'
    +'<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;margin-bottom:6px">Revenue Projection</div>'
    +'<div style="display:flex;align-items:baseline;gap:8px"><span style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#374151">$'+Math.round(curRevenue).toLocaleString()+'</span>'
    +(planRevenue>0?'<span style="font-size:14px;font-weight:700;color:#22c55e">+ $'+Math.round(planRevenue).toLocaleString()+'</span>':'')
    +'<span style="font-size:13px;color:#6b7280">= $'+Math.round(projectedRevenue).toLocaleString()+'</span></div>'
    +'<div style="margin-top:8px;height:8px;background:#f3f4f6;border-radius:4px;overflow:hidden;position:relative">'
    +'<div style="height:100%;background:#c41230;border-radius:4px;width:'+Math.min(pctCur,100)+'%;position:absolute;left:0;top:0;z-index:2"></div>'
    +'<div style="height:100%;background:#22c55e;border-radius:4px;width:'+Math.min(pctProj,100)+'%;position:absolute;left:0;top:0;z-index:1;opacity:.4"></div></div>'
    +'<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px"><span style="color:#c41230;font-weight:600">Current '+pctCur+'%</span><span style="color:#22c55e;font-weight:600">Projected '+pctProj+'%</span><span style="color:#6b7280">Target $'+Math.round(targetVal).toLocaleString()+'</span></div></div>';
  kpi += '<div class="card" style="flex:1;min-width:110px;padding:16px 20px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">New Jobs</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:#22c55e;margin-top:2px">+'+plan.length+'</div><div style="font-size:10px;color:#9ca3af">of '+unscheduled.length+' unscheduled</div></div>';
  kpi += '<div class="card" style="flex:1;min-width:110px;padding:16px 20px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">+Frames</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+curFrames+' <span style="color:#22c55e;font-size:14px">+'+planFrames+'</span></div></div>';
  kpi += '<div class="card" style="flex:1;min-width:110px;padding:16px 20px"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">+Hours</div><div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;margin-top:2px">'+curHours+'h <span style="color:#22c55e;font-size:14px">+'+planHours+'h</span></div></div>';
  kpi += '</div>';

  // ── Apply all button ──────────────────────────────────────────────────────
  var actions = '';
  if (plan.length > 0) {
    actions = '<div class="card" style="padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;gap:16px;background:#f0fdf4;border:1px solid #86efac">'
      +'<div style="flex:1"><strong style="font-size:14px;color:#15803d">\ud83e\udde0 '+plan.length+' jobs auto-scheduled</strong>'
      +'<div style="font-size:12px;color:#166534;margin-top:2px">Optimised for area clustering, installer capacity, and revenue targets. Review below, then apply.</div></div>'
      +'<button onclick="applyPlan(_lastCapacityPlan)" class="btn-r" style="font-size:13px;padding:8px 24px;white-space:nowrap">\u2705 Apply All '+plan.length+' Jobs</button>'
      +'</div>';
  } else if (unscheduled.length === 0) {
    actions = '<div class="card" style="padding:20px;text-align:center;background:#f0fdf4;border:1px solid #86efac;margin-bottom:16px"><span style="font-size:14px;color:#15803d;font-weight:600">\u2705 All dispatch-ready jobs are already scheduled</span></div>';
  } else if (installers.length === 0) {
    actions = '<div class="card" style="padding:20px;text-align:center;background:#fffbeb;border:1px solid #fde68a;margin-bottom:16px"><span style="font-size:14px;color:#92400e;font-weight:600">\u26a0\ufe0f Add installers in Settings before auto-scheduling</span></div>';
  }

  // ── Recommended schedule table ────────────────────────────────────────────
  var table = '<div class="card" style="padding:0;overflow:hidden">';
  table += '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    +'<h3 style="font-family:Syne,sans-serif;font-size:15px;font-weight:800;margin:0">Recommended Schedule</h3>'
    +'<span style="font-size:11px;color:#6b7280">Sorted by age (oldest first) \u2022 Clustered by area \u2022 Balanced by capacity</span></div>';

  if (plan.length === 0) {
    table += '<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No recommendations available. '+(unscheduled.length===0?'All jobs scheduled.':'Add installers to generate a plan.')+'</div>';
  } else {
    // Group plan by date
    var planByDate = {};
    plan.forEach(function(p){ if(!planByDate[p.installDate]) planByDate[p.installDate]=[]; planByDate[p.installDate].push(p); });

    Object.keys(planByDate).sort().forEach(function(ds){
      var dayPlan = planByDate[ds];
      var dayRev = dayPlan.reduce(function(s,p){return s+(p.job.val||0);},0);
      var dayFrames = dayPlan.reduce(function(s,p){return s+(p.job.windows||[]).length;},0);
      var dayH = dayPlan.reduce(function(s,p){return s+(getEffectiveInstallHours(p.job, 4));},0);
      var dateObj = dayPlan[0].dateObj;
      var td = isToday(dateObj);

      table += '<div style="padding:10px 20px;background:'+(td?'#fef2f2':'#f9fafb')+';border-bottom:1px solid #f0f0f0;display:flex;align-items:center;justify-content:space-between">'
        +'<span style="font-size:13px;font-weight:700;'+(td?'color:#c41230':'color:#374151')+'">'+fmtShortDate(dateObj)+(td?' \u00b7 Today':'')+'</span>'
        +'<span style="font-size:11px;color:#6b7280">'+dayPlan.length+' jobs \u00b7 '+dayFrames+' frames \u00b7 '+dayH+'h \u00b7 $'+Math.round(dayRev).toLocaleString()+'</span></div>';

      dayPlan.forEach(function(p, idx){
        var c = contacts.find(function(ct){return ct.id===p.job.contactId;});
        var cn = c ? c.fn+' '+c.ln : '\u2014';
        var fr = (p.job.windows||[]).length;
        var dur = getEffectiveInstallHours(p.job, 4);
        var endT = calcEndTime(p.installTime, dur);
        var age = p.job.created ? Math.floor((new Date() - new Date(p.job.created)) / 86400000) : 0;

        table += '<div style="display:flex;align-items:center;gap:12px;padding:10px 20px;border-bottom:1px solid #f9fafb;'+(idx%2===0?'':'background:#fafafa')+'">';
        // Installer avatar
        table += '<div style="width:30px;height:30px;border-radius:50%;background:'+p.instColour+';color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+(p.instName||'?')[0]+'</div>';
        // Time block
        table += '<div style="width:110px;flex-shrink:0"><div style="font-size:12px;font-weight:700;color:#374151">'+formatTime12(p.installTime)+(endT?' \u2013 '+formatTime12(endT):'')+'</div>'
          +'<div style="font-size:10px;color:#6b7280">'+dur+'h \u00b7 '+p.instName+'</div></div>';
        // Job info
        table += '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:6px"><span style="font-size:12px;font-weight:700;color:#c41230">'+(p.job.jobNumber||'')+'</span><span style="font-size:12px;color:#374151">'+cn+'</span></div>'
          +'<div style="font-size:11px;color:#6b7280">\ud83d\udccd '+(p.job.suburb||'')+(p.job.street?', '+p.job.street:'')+'</div></div>';
        // Metrics
        table += '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0">'
          +'<span style="background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600">'+fr+' fr</span>'
          +'<span style="background:#f0fdf4;color:#15803d;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600">$'+Math.round((p.job.val||0)/1000)+'k</span>'
          +'<span style="background:#fef3c7;color:#92400e;padding:1px 7px;border-radius:4px;font-size:10px;font-weight:600">'+age+'d old</span></div>';
        // Reasons
        table += '<div style="width:200px;flex-shrink:0;font-size:10px;color:#6b7280">'+(p.reasons||[]).join(' \u00b7 ')+'</div>';
        // Action
        table += '<button onclick="applySinglePlan(_lastCapacityPlan['+plan.indexOf(p)+'])" class="btn-w" style="font-size:10px;padding:4px 10px;flex-shrink:0">Apply</button>';
        table += '</div>';
      });
    });
  }
  table += '</div>';

  // ── Per-installer capacity breakdown ──────────────────────────────────────
  var capBreak = '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">';
  installers.forEach(function(inst){
    var maxWeekH = (inst.maxHoursPerDay||8)*5;
    var curH = weekJobs.filter(function(j){return(j.installCrew||[]).indexOf(inst.id)>=0;}).reduce(function(s,j){return s+(getEffectiveInstallHours(j, 0));},0);
    var addH = plan.filter(function(p){return p.crewIds.indexOf(inst.id)>=0;}).reduce(function(s,p){return s+(getEffectiveInstallHours(p.job, 4));},0);
    var projH = curH + addH;
    var pctCur = maxWeekH>0?Math.round(curH/maxWeekH*100):0;
    var pctProj = maxWeekH>0?Math.round(projH/maxWeekH*100):0;
    var projCol = pctProj>90?'#ef4444':pctProj>70?'#f59e0b':'#22c55e';
    var addedJobs = plan.filter(function(p){return p.crewIds.indexOf(inst.id)>=0;}).length;

    capBreak += '<div class="card" style="flex:1;min-width:200px;padding:14px 16px">'
      +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      +'<div style="width:26px;height:26px;border-radius:50%;background:'+inst.colour+';color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">'+(inst.name||'?')[0]+'</div>'
      +'<div><div style="font-size:13px;font-weight:700">'+inst.name+'</div></div></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:#6b7280">Current</span><span style="font-weight:600">'+curH+'h / '+maxWeekH+'h ('+pctCur+'%)</span></div>'
      +'<div style="height:6px;background:#f3f4f6;border-radius:3px;overflow:hidden;margin-bottom:6px;position:relative">'
      +'<div style="height:100%;background:#c41230;border-radius:3px;width:'+Math.min(pctCur,100)+'%;position:absolute;z-index:2"></div>'
      +'<div style="height:100%;background:'+projCol+';opacity:.35;border-radius:3px;width:'+Math.min(pctProj,100)+'%;position:absolute;z-index:1"></div></div>'
      +'<div style="display:flex;justify-content:space-between;font-size:11px"><span style="color:#22c55e;font-weight:600">+'+addH+'h ('+addedJobs+' jobs)</span><span style="color:'+projCol+';font-weight:600">Projected '+pctProj+'%</span></div>'
      +'</div>';
  });
  capBreak += '</div>';

  return '<div>'
    +'<div style="margin-bottom:12px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">\ud83e\udde0 Smart Capacity Planning</h2>'
    +'<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Automatic scheduling \u2014 oldest jobs first, clustered by area, balanced by installer capacity</p></div>'
    +navH+kpi+actions+table+capBreak
    +'</div>';
}

