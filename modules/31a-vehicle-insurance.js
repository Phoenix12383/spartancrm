// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 31a-vehicle-insurance.js
// Vehicle insurance PDF upload + parsing + expiry alerts.
// PDF.js is loaded in index.html and exposes window.pdfjsLib.
// Storage bucket "vehicle-insurance" + the insurance_* columns on
// public.vehicles are created by supabase/migrations/20260501_vehicle_insurance.sql.
// ═════════════════════════════════════════════════════════════════════════════

// ── Status helpers ─────────────────────────────────────────────────────────
// Returns: { state, daysLeft, label, colour, bg }
//   state ∈ 'missing' | 'expired' | 'soon' | 'valid'
//   "soon" = within INSURANCE_SOON_DAYS of expiry (default 30)
var INSURANCE_SOON_DAYS = 30;

function getVehicleInsuranceStatus(v) {
  var ins = (v && v.insurance) || {};
  var exp = ins.expiryDate;
  if (!exp) return { state:'missing', daysLeft:null, label:'No insurance on file', colour:'#6b7280', bg:'#f3f4f6' };
  var today = new Date(); today.setHours(0,0,0,0);
  var d = new Date(exp + 'T00:00:00');
  var days = Math.round((d - today) / 86400000);
  if (days < 0)  return { state:'expired', daysLeft:days, label:'Expired '+Math.abs(days)+'d ago', colour:'#fff', bg:'#ef4444' };
  if (days <= INSURANCE_SOON_DAYS) return { state:'soon', daysLeft:days, label:'Expires in '+days+'d', colour:'#fff', bg:'#f59e0b' };
  return { state:'valid', daysLeft:days, label:'Valid · '+days+'d left', colour:'#065f46', bg:'#d1fae5' };
}

// ── PDF parsing ────────────────────────────────────────────────────────────
// Reads a PDF File and returns extracted insurance fields + raw text.
// Anything not confidently matched is left blank for the user to fill in.
async function parseInsurancePdf(file) {
  if (!window.pdfjsLib) throw new Error('PDF.js not loaded');
  var buf = await file.arrayBuffer();
  var pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  var textParts = [];
  for (var p = 1; p <= pdf.numPages; p++) {
    var page = await pdf.getPage(p);
    var content = await page.getTextContent();
    textParts.push(content.items.map(function(it){return it.str;}).join(' '));
  }
  var text = textParts.join('\n');
  return Object.assign({ extractedText: text }, extractInsuranceFields(text));
}

function extractInsuranceFields(text) {
  var out = { insurer:'', policyNo:'', startDate:'', expiryDate:'' };
  if (!text) return out;
  var T = text.replace(/\s+/g,' ');

  // Insurer — look for common AU motor insurers near the top of the doc
  var insurers = ['NRMA','AAMI','Allianz','QBE','Suncorp','GIO','RACV','RACQ','Budget Direct','Youi','Bingle','CGU','Vero','Coles Insurance','Woolworths Insurance'];
  for (var i = 0; i < insurers.length; i++) {
    var re = new RegExp('\\b' + insurers[i].replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'i');
    if (re.test(T)) { out.insurer = insurers[i]; break; }
  }

  // Policy number — "Policy Number: ABC-123456" / "Policy No ABC123" etc.
  // Allow hyphens only (not spaces) so we don't run into the next label.
  var polRe = /policy\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-]{3,20}[A-Z0-9])/i;
  var polM = T.match(polRe);
  if (polM) out.policyNo = polM[1].trim();

  // Dates — try labelled forms first, then fall back to first/second date in doc
  var startLabels = /(?:period\s*of\s*insurance|policy\s*period|cover\s*starts?|effective\s*(?:from|date)|inception\s*date|start\s*date)[^\d]{0,30}(\d{1,2}[\/\-\. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-\. ]\d{2,4})/i;
  var endLabels   = /(?:expires?|expiry\s*date|end\s*date|to|until|period\s*ending|renewal\s*date)[^\d]{0,30}(\d{1,2}[\/\-\. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-\. ]\d{2,4})/i;
  var s = T.match(startLabels); if (s) out.startDate = normaliseDate(s[1]);
  var e = T.match(endLabels);   if (e) out.expiryDate = normaliseDate(e[1]);

  // Range form: "1 Jan 2026 to 1 Jan 2027"
  if (!out.startDate || !out.expiryDate) {
    var rng = T.match(/(\d{1,2}[\/\-\. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-\. ]\d{2,4})\s*(?:to|–|-)\s*(\d{1,2}[\/\-\. ](?:\d{1,2}|[A-Za-z]{3,9})[\/\-\. ]\d{2,4})/i);
    if (rng) {
      if (!out.startDate)  out.startDate  = normaliseDate(rng[1]);
      if (!out.expiryDate) out.expiryDate = normaliseDate(rng[2]);
    }
  }
  return out;
}

// Convert "1/1/2026", "01-01-26", "1 Jan 2026", "1 January 2026" → "2026-01-01"
function normaliseDate(s) {
  if (!s) return '';
  s = s.trim();
  var months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  var m = s.match(/^(\d{1,2})[\/\-\. ](\d{1,2})[\/\-\. ](\d{2,4})$/);
  if (m) {
    var d = +m[1], mo = +m[2], y = +m[3];
    if (y < 100) y += 2000;
    return pad4(y) + '-' + pad2(mo) + '-' + pad2(d);
  }
  m = s.match(/^(\d{1,2})[\/\-\. ]?([A-Za-z]{3,9})[\/\-\. ]?(\d{2,4})$/);
  if (m) {
    var mn = months[m[2].slice(0,3).toLowerCase()];
    if (!mn) return '';
    var y2 = +m[3]; if (y2 < 100) y2 += 2000;
    return pad4(y2) + '-' + pad2(mn) + '-' + pad2(+m[1]);
  }
  return '';
}
function pad2(n){ return (n<10?'0':'')+n; }
function pad4(n){ return n>=1000?String(n):('000'+n).slice(-4); }

// ── Storage upload ─────────────────────────────────────────────────────────
// Uploads the PDF to the vehicle-insurance bucket and returns
// { pdfPath, pdfUrl }. Fails loudly so the caller can show a toast.
async function uploadVehicleInsurancePdf(vehicleId, file) {
  if (typeof _sb === 'undefined' || !_sb) throw new Error('Supabase not initialised');
  var ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
  var ts = Date.now();
  var path = vehicleId + '/' + ts + '.' + ext;
  var up = await _sb.storage.from('vehicle-insurance').upload(path, file, {
    cacheControl: '3600', upsert: true, contentType: 'application/pdf'
  });
  if (up && up.error) throw up.error;
  var pub = _sb.storage.from('vehicle-insurance').getPublicUrl(path);
  var url = pub && pub.data && pub.data.publicUrl;
  if (!url) throw new Error('Could not resolve public URL for uploaded PDF');
  return { pdfPath: path, pdfUrl: url };
}

// ── Combined flow (UI calls this) ──────────────────────────────────────────
// Picks the file, parses it, populates the edit-form fields, uploads on save.
// Form field IDs follow vehicle edit form convention: ins_*
async function handleInsurancePdfPicked(fileInputEl) {
  var file = fileInputEl && fileInputEl.files && fileInputEl.files[0];
  if (!file) return;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    addToast('Please pick a PDF file', 'error'); return;
  }
  // Status messages go into the in-form #ins_parse_note rather than via
  // addToast — addToast calls setState which triggers renderPage(), and the
  // renderPage wipes any DOM changes (including the values we just set).
  var note0 = document.getElementById('ins_parse_note');
  if (note0) note0.innerHTML = '<span style="color:#3b82f6">⏳ Reading PDF…</span>';
  try {
    var parsed = await parseInsurancePdf(file);
    var setVal = function(id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('ins_insurer', parsed.insurer);
    setVal('ins_policy', parsed.policyNo);
    setVal('ins_start',  parsed.startDate);
    setVal('ins_expiry', parsed.expiryDate);
    // Stash the file + raw text on the form element so save can grab them.
    fileInputEl._pendingFile = file;
    fileInputEl._extractedText = parsed.extractedText;
    var note = document.getElementById('ins_parse_note');
    if (note) {
      var missing = [];
      if (!parsed.insurer)    missing.push('insurer');
      if (!parsed.policyNo)   missing.push('policy no.');
      if (!parsed.startDate)  missing.push('start date');
      if (!parsed.expiryDate) missing.push('expiry date');
      note.innerHTML = missing.length
        ? '<span style="color:#92400e">⚠ PDF parsed — couldn\'t auto-detect: '+missing.join(', ')+'. Please fill manually before saving.</span>'
        : '<span style="color:#065f46">✓ PDF parsed — all fields auto-detected. Verify and save.</span>';
    }
  } catch (e) {
    console.warn('[insurance] parse failed', e);
    var noteE = document.getElementById('ins_parse_note');
    if (noteE) noteE.innerHTML = '<span style="color:#b91c1c">✗ Could not read PDF: '+(e.message||'unknown error')+'</span>';
  }
}

// Called from the vehicle save button. Returns the insurance object to merge
// into the vehicle record (uploading the PDF first if a new one was picked).
async function collectInsuranceFromForm(vehicleId, existingInsurance) {
  var ex = existingInsurance || {};
  var fileInput = document.getElementById('ins_pdf');
  var insurer = (document.getElementById('ins_insurer')||{}).value || ex.insurer || '';
  var policyNo = (document.getElementById('ins_policy')||{}).value || ex.policyNo || '';
  var startDate = (document.getElementById('ins_start')||{}).value || ex.startDate || '';
  var expiryDate = (document.getElementById('ins_expiry')||{}).value || ex.expiryDate || '';
  var ins = Object.assign({}, ex, {
    insurer: insurer.trim(),
    policyNo: policyNo.trim(),
    startDate: startDate || '',
    expiryDate: expiryDate || ''
  });
  if (fileInput && fileInput._pendingFile) {
    var up = await uploadVehicleInsurancePdf(vehicleId, fileInput._pendingFile);
    ins.pdfPath = up.pdfPath;
    ins.pdfUrl = up.pdfUrl;
    ins.uploadedAt = new Date().toISOString();
    if (fileInput._extractedText) ins.extractedText = fileInput._extractedText;
  }
  return ins;
}

// ── Save handler invoked by the vehicle edit form Save button ─────────────
// Replaces the previous inline onclick handler in 20-job-settings.js so we
// can await the PDF upload + persist the parsed fields together with the
// rest of the vehicle record.
async function saveVehicleEditForm() {
  var name = (document.getElementById('veh_name')||{}).value;
  name = name ? name.trim() : '';
  if (!name) { addToast('Vehicle name required', 'error'); return; }

  var L = parseInt((document.getElementById('veh_len')||{}).value) || 0;
  var W = parseInt((document.getElementById('veh_wid')||{}).value) || 0;
  var H = parseInt((document.getElementById('veh_hei')||{}).value) || 0;

  var existing = (typeof editingVehicleId !== 'undefined' && editingVehicleId && editingVehicleId !== '_new')
    ? (getVehicles().find(function(v){return v.id===editingVehicleId;}) || {})
    : {};

  // Determine the vehicle ID to use for the storage path. Existing vehicle
  // keeps its ID; new vehicle gets a fresh one now (so the PDF lands in the
  // right folder, and we pass the same ID into addVehicle below).
  var vehicleId = (editingVehicleId && editingVehicleId !== '_new')
    ? editingVehicleId
    : ('veh_' + Date.now());

  var d = {
    name: name,
    rego: ((document.getElementById('veh_rego')||{}).value || '').trim().toUpperCase(),
    type: (document.getElementById('veh_type')||{}).value || 'van',
    size: (document.getElementById('veh_size')||{}).value || 'medium',
    maxFrames: parseInt((document.getElementById('veh_frames')||{}).value) || 8,
    maxWeightKg: parseInt((document.getElementById('veh_weight')||{}).value) || 600,
    assignedTo: (document.getElementById('veh_inst')||{}).value || '',
    notes: (document.getElementById('veh_notes')||{}).value || '',
    internal: { lengthMm: L, widthMm: W, heightMm: H }
  };

  try {
    d.insurance = await collectInsuranceFromForm(vehicleId, existing.insurance || {});
  } catch (e) {
    console.warn('[insurance] upload/collect failed', e);
    addToast('Insurance upload failed: ' + (e.message || 'unknown'), 'error');
    return;
  }

  if (editingVehicleId && editingVehicleId !== '_new') {
    updateVehicle(editingVehicleId, d);
    addToast(name + ' updated', 'success');
  } else {
    // Force the chosen ID through addVehicle so the storage path matches.
    var list = getVehicles();
    d.id = vehicleId; d.active = true;
    list.push(d); saveVehicles(list);
    addToast(name + ' added', 'success');
  }
  editingVehicleId = null;
  renderPage();
}

// Convenience used by dashboard + list badge rendering.
function getVehiclesInsuranceAlerts() {
  var list = (typeof getVehicles === 'function' ? getVehicles() : []).filter(function(v){return v.active!==false;});
  var expired = [], soon = [], missing = [];
  list.forEach(function(v){
    var s = getVehicleInsuranceStatus(v);
    if (s.state === 'expired') expired.push(v);
    else if (s.state === 'soon') soon.push(v);
    else if (s.state === 'missing') missing.push(v);
  });
  return { expired: expired, soon: soon, missing: missing };
}
