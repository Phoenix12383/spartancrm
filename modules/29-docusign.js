// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 29-docusign.js
// CRM-side wrapper for the DocuSign Final Design Sign-Off flow.
//
// Flow (per Jobs CRM Manual §6.5):
//   1. Sales Manager clicks "Send DocuSign" on the Final Design tab
//   2. We build a Final Design PDF (jsPDF) with anchor strings printed at
//      each clause location; conditional clauses only printed when the job
//      flag is set (renderWarning / specialColour / hasVariation)
//   3. POST {jobId, customer*, pdfBase64, flags} to docusign-send Edge Function
//   4. Edge Function does JWT auth + creates the envelope from the template
//   5. We store {envelopeId, sentAt, status} on the job (localStorage side
//      store today; Supabase column once the migration lands)
//   6. DocuSign Connect webhook updates the job when customer signs
//
// Until the docusign_envelope_id column is added to the jobs table, the
// envelope→job mapping is held in localStorage (`spartan_docusign_envelopes`).
// The webhook attempts a Supabase lookup by docusign_envelope_id; if that
// column doesn't exist yet, the webhook will log and 200, and the CRM will
// pick up the signed status next time someone clicks "Refresh Envelope".
// ═════════════════════════════════════════════════════════════════════════════

var DOCUSIGN_ENVELOPES_LS_KEY = 'spartan_docusign_envelopes';
var DEV_MODE_LS_KEY = 'spartan_dev_mode';

// ─── Dev mode flag ─────────────────────────────────────────────────────────
// Production gates (per Jobs CRM Manual §4.5 + §6.5) hide the testing
// buttons that fire DocuSign envelopes outside the strict workflow:
//   - Sending before status reaches c1_final_sign_off (45% paid)
//   - Sending before Final Design saved in CAD
//   - Resending after the customer has already signed
// Dev mode bypasses those gates so we can exercise the integration end-
// to-end during sandbox testing.
//
// Toggle:
//   - URL `?dev=1` → enable (also persists via localStorage so it sticks
//     across navigation until cleared)
//   - URL `?dev=0` or `?dev=off` → clear
//   - DevTools console: localStorage.setItem('spartan_dev_mode','true')
function isDevMode() {
  try {
    var qp = new URLSearchParams(location.search);
    var d  = qp.get('dev');
    if (d === '1' || d === 'on' || d === 'true') {
      try { localStorage.setItem(DEV_MODE_LS_KEY, 'true'); } catch (e) {}
      return true;
    }
    if (d === '0' || d === 'off' || d === 'false') {
      try { localStorage.removeItem(DEV_MODE_LS_KEY); } catch (e) {}
      return false;
    }
  } catch (e) {}
  try { return localStorage.getItem(DEV_MODE_LS_KEY) === 'true'; }
  catch (e) { return false; }
}

// ─── Local store: jobId → envelope record ──────────────────────────────────
function _dsLoadEnvelopes() {
  try { return JSON.parse(localStorage.getItem(DOCUSIGN_ENVELOPES_LS_KEY) || '{}'); }
  catch (e) { return {}; }
}
function _dsSaveEnvelopes(map) {
  try { localStorage.setItem(DOCUSIGN_ENVELOPES_LS_KEY, JSON.stringify(map || {})); }
  catch (e) {}
}

function getDocuSignEnvelopeForJob(jobId) {
  var local = _dsLoadEnvelopes()[jobId] || null;
  // Merge in fields that the webhook stamps directly on the job. The webhook
  // doesn't know about localStorage — it writes to docusign_status, etc., on
  // the jobs row. Pulling those in here means the UI shows the latest signed
  // state even if the local rec was never updated.
  var jobs = (typeof getState === 'function' ? getState().jobs : []) || [];
  var job = jobs.find(function(j) { return j.id === jobId; });
  if (!job) return local;
  if (!local && !job.docusignEnvelopeId) return null;
  return Object.assign({}, local || {}, {
    envelopeId: (local && local.envelopeId) || job.docusignEnvelopeId,
    status:     job.docusignStatus     || (local && local.status)     || null,
    sentAt:     (local && local.sentAt) || null,
    signedAt:   job.docusignCompletedAt || (local && local.signedAt) || null,
    declinedAt: job.docusignDeclinedAt  || null,
  });
}

function _setDocuSignEnvelopeForJob(jobId, rec) {
  var map = _dsLoadEnvelopes();
  map[jobId] = Object.assign({}, map[jobId] || {}, rec);
  _dsSaveEnvelopes(map);
  return map[jobId];
}

// ─── Final Design PDF builder (jsPDF) ──────────────────────────────────────
// Builds a Final Design Sign-Off PDF and tracks the exact (page, x, y) of
// each interactive field as it draws. Returns:
//   {
//     pdfBase64,
//     tabs: {
//       signHereTabs: [...],   // 4-7 sigs depending on job flags
//       fullNameTabs: [...],   // auto-fills customer name in the header
//       dateSignedTabs: [...], // auto-fills today's date when customer signs
//     }
//   }
//
// Coordinates are in DocuSign pixel units (72 dpi, top-left origin). jsPDF
// uses millimetres so we convert at recording time. Tab positions are
// tracked per page; doc.addPage() is wrapped to keep the page counter
// consistent.
//
// Returns null on jsPDF not loaded.
function buildFinalDesignPdfBase64(job) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    addToast('jsPDF not loaded — cannot generate Final Design PDF', 'error');
    return null;
  }
  var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });

  // mm → DocuSign pixels (72 px per inch)
  var MM_PX = 72 / 25.4;
  var px = function(mm) { return String(Math.round(mm * MM_PX)); };

  var page = 1;
  var addPage = function() { doc.addPage(); page++; };

  var contacts = (getState().contacts || []);
  var contact = contacts.find(function(c) { return c.id === (job.contactId || job.cid); }) || {};
  var customerName = ((contact.fn || '') + ' ' + (contact.ln || '')).trim() || 'Customer';
  var addr = [job.street, job.suburb, job.state, job.postcode].filter(Boolean).join(', ');
  var frames = (job.cadFinalData && job.cadFinalData.projectItems)
            || (job.cadSurveyData && job.cadSurveyData.projectItems)
            || (job.cadData && job.cadData.projectItems)
            || (job.windows || []);

  // Header
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text('Spartan Double Glazing', 14, 18);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('Final Design Sign-Off', 14, 25);
  doc.setLineWidth(0.5); doc.line(14, 28, 196, 28);

  // Customer + job summary. We draw a placeholder line under "Customer:"
  // and let DocuSign overlay the auto-fill name tab on top of it. This
  // way the customer sees their name pre-filled by DocuSign at signing.
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Customer:', 14, 36);
  doc.setFont('helvetica', 'normal');
  doc.text(customerName, 40, 36);  // visible default; DocuSign overlays the tab

  doc.setFont('helvetica', 'bold'); doc.text('Job:',      14, 42); doc.setFont('helvetica', 'normal'); doc.text(String(job.jobNumber || job.id), 40, 42);
  doc.setFont('helvetica', 'bold'); doc.text('Address:',  14, 48); doc.setFont('helvetica', 'normal'); doc.text(addr || '—', 40, 48, { maxWidth: 156 });
  doc.setFont('helvetica', 'bold'); doc.text('Frames:',   14, 54); doc.setFont('helvetica', 'normal'); doc.text(String(frames.length), 40, 54);

  // ─── Tab capture ────────────────────────────────────────────────────────
  // FullName: auto-fills the customer's name (read-only) in the header line
  var signHereTabs = [];
  var fullNameTabs = [{
    tabLabel:   'sp_customer_name',
    pageNumber: String(page),
    xPosition:  px(40),       // matches "doc.text(customerName, 40, 36)"
    yPosition:  px(36 - 4),   // -4 mm because text baseline vs. tab top-left
    locked:     'true',       // read-only, customer cannot edit
    font:       'Helvetica',
    fontSize:   'Size10',
  }];
  // DateSigned: auto-fills the date the customer clicks Sign. Top-right.
  var dateSignedTabs = [{
    tabLabel:   'sp_date_signed',
    pageNumber: String(page),
    xPosition:  px(160),
    yPosition:  px(36 - 4),
    font:       'Helvetica',
    fontSize:   'Size10',
  }];

  // Frames table
  var y = 64;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Frame Schedule', 14, y); y += 5;
  doc.setLineWidth(0.3); doc.line(14, y, 196, y); y += 4;
  doc.setFontSize(8); doc.setFont('helvetica', 'bold');
  doc.text('#',         14,  y);
  doc.text('Type',      24,  y);
  doc.text('W × H (mm)', 64, y);
  doc.text('Colour',    104, y);
  doc.text('Glass',     150, y);
  y += 2; doc.line(14, y, 196, y); y += 4;
  doc.setFont('helvetica', 'normal');
  var TYPE_LABELS = {
    awning_window:'Awning', casement_window:'Casement', sliding_window:'Sliding',
    fixed_window:'Fixed', tilt_turn_window:'Tilt & Turn', double_hung_window:'Double Hung',
    bifold_door:'Bifold Door', sliding_door:'Sliding Door', french_door:'French Door',
    entry_door:'Entry Door', stacker_door:'Stacker Door',
  };
  frames.forEach(function(f, i) {
    if (y > 200) { addPage(); y = 20; }
    doc.text(String(i + 1),                                      14, y);
    doc.text(TYPE_LABELS[f.productType] || f.productType || '—', 24, y, { maxWidth: 38 });
    doc.text((f.width || 0) + ' × ' + (f.height || 0),           64, y);
    doc.text(String(f.colour || '').replace(/_/g, ' '),         104, y, { maxWidth: 44 });
    doc.text(String(f.glassSpec || '').replace(/_/g, ' '),      150, y, { maxWidth: 44 });
    y += 5;
  });

  // Sign-Off Clauses section
  if (y > 200) { addPage(); y = 20; }
  y += 6;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Sign-Off Clauses', 14, y); y += 4;
  doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('You must sign each applicable clause to authorise production.', 14, y); y += 6;

  // Helper: print a numbered clause and capture the signature tab position.
  // Visible "Sign here →" label, with the actual signature tab placed
  // alongside it (right margin) at known pixel coordinates.
  function clause(num, title, bodyLines, label) {
    if (y > 250) { addPage(); y = 20; }
    var clauseStartY = y;
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(num + '. ' + title, 14, y); y += 4;
    doc.setFont('helvetica', 'normal');
    bodyLines.forEach(function(line) { doc.text(line, 14, y, { maxWidth: 130 }); y += 4; });
    // Visible "Sign here →" pointer + an underline where the sig will land
    var sigY = clauseStartY + 1;
    doc.setFontSize(8); doc.setTextColor(120, 120, 120);
    doc.text('Sign here →', 138, sigY + 3);
    doc.setTextColor(0, 0, 0);
    doc.setLineWidth(0.2); doc.line(160, sigY + 5, 196, sigY + 5);
    // Capture the DocuSign tab at that position
    signHereTabs.push({
      tabLabel:   label,
      pageNumber: String(page),
      xPosition:  px(160),
      yPosition:  px(sigY - 3),  // top-left of the sig widget
    });
    y += 4; // spacing before next clause
  }

  clause('1', 'Opening Direction',
    ['I confirm the opening direction of each sash is as shown in the design above.'],
    'sp_sig_opening_dir');
  clause('2', 'Glass Type',
    ['I confirm the glass specification listed for each pane is what I have selected.'],
    'sp_sig_glass_type');
  clause('3', 'Override Clause',
    ['I acknowledge that this Final Design supersedes the original quotation.',
     'Once signed, the spec above is binding for manufacture and install.'],
    'sp_sig_override');

  if (job.renderWarning) {
    clause('4', 'Render Warning',
      ['My property has rendered brick. I acknowledge that during demolition,',
       'render around the existing opening may chip or crack. Spartan is not',
       'liable for render repairs unless agreed in writing.'],
      'sp_sig_render_warning');
  }
  if (job.specialColour) {
    clause('5', 'Special Colour Lead Time',
      ['I accept the additional 4–6 week lead time for special-colour frames.'],
      'sp_sig_special_colour');
  }
  if (job.hasVariation) {
    clause('6', 'Variation Acceptance',
      ['I accept the variation as detailed in the separately-signed Variation Quote.'],
      'sp_sig_variation');
  }

  clause('7', 'Production Authorisation',
    ['I authorise Spartan Double Glazing to begin manufacturing the frames above.',
     'Design changes after production starts may incur a Variation Quote.'],
    'sp_sig_production_auth');

  // Footer
  if (y > 270) { addPage(); y = 20; }
  doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  doc.text('Spartan Double Glazing · ' + new Date().toLocaleDateString('en-AU') +
           ' · Job ' + (job.jobNumber || job.id),
           14, 285);

  // Return base64 + tabs. Use arraybuffer instead of datauristring — jsPDF's
  // datauristring is "data:application/pdf;filename=generated.pdf;base64,..."
  // and a naive prefix-strip leaves "filename=...;base64," mixed in, which
  // DocuSign rejects with UNSPECIFIED_ERROR ("not a valid Base-64 string").
  var buf = doc.output('arraybuffer');
  var bytes = new Uint8Array(buf);
  var bin = '';
  var CHUNK = 0x8000;
  for (var i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return {
    pdfBase64: btoa(bin),
    tabs: {
      signHereTabs:   signHereTabs,
      fullNameTabs:   fullNameTabs,
      dateSignedTabs: dateSignedTabs,
    },
  };
}

// ─── Main entry: send the Final Design DocuSign ────────────────────────────
function sendFinalDesignDocuSign(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j) { return j.id === jobId; });
  if (!job) { addToast('Job not found', 'error'); return; }
  if (!job.cmCompletedAt) { addToast('Check Measure must be completed first', 'error'); return; }
  if (!job.cadFinalData) {
    if (!confirm('Final Design has not been saved in CAD yet. Send DocuSign anyway? The PDF will use survey/original data.')) return;
  }
  // Variation gate (Option B): block ONLY when Sales Manager hasn't recorded
  // the variation amount yet. 'awaiting_signature' is allowed — the customer
  // accepts the variation as part of the Final Design envelope (the
  // variation_acceptance clause auto-includes when hasVariation=true).
  var _vStatus = job.variationStatus || 'none';
  if (_vStatus === 'awaiting_quote') {
    var _devOverride = (typeof isDevMode === 'function') && isDevMode();
    if (!_devOverride) {
      addToast('🔒 Record the variation amount first (or mark non-material) on the variance card.', 'error');
      return;
    }
    if (typeof logJobAudit === 'function') {
      logJobAudit(jobId, 'Variation Gate Overridden (Dev)', 'Final Design DocuSign sent while variationStatus=' + _vStatus);
    }
  }

  var contacts = getState().contacts || [];
  var contact = contacts.find(function(c) { return c.id === (job.contactId || job.cid); }) || {};
  var customerName = ((contact.fn || '') + ' ' + (contact.ln || '')).trim();
  var customerEmail = contact.email || '';
  if (!customerName) { addToast('Customer name is required on the contact', 'error'); return; }
  if (!customerEmail) { addToast('Customer email is required on the contact', 'error'); return; }

  // Build PDF and capture exact tab positions in one pass.
  var pdfData = buildFinalDesignPdfBase64(job);
  if (!pdfData || !pdfData.pdfBase64) return;

  if (!_sb) { addToast('Supabase client not initialised — cannot send DocuSign', 'error'); return; }

  // Dev-mode auto-advance: bring status forward to c1_final_sign_off so the
  // visible workflow lines up with what's about to happen (envelope sent →
  // customer signs → webhook flips c1 → c2). In production, this only runs
  // when the UI gate already permits the click, which happens at c1.
  // Bypasses canTransition (which has gates we want to skip in dev) by
  // writing the status directly. The webhook will still flip c1 → c2 when
  // the customer signs.
  if ((typeof isDevMode === 'function') && isDevMode()) {
    var advanceFrom = ['a_check_measure', 'c_awaiting_2nd_payment', 'c4_date_change_hold'];
    if (advanceFrom.indexOf(job.status) >= 0) {
      var devNow  = new Date().toISOString();
      var devCu   = (typeof getCurrentUser === 'function' && getCurrentUser()) || {id:'dev', name:'Dev'};
      var devHist = (job.statusHistory || []).concat([{
        status: 'c1_final_sign_off', at: devNow, by: devCu.id,
        note: 'Final Design DocuSign sent (Dev auto-advance)',
      }]);
      setState({ jobs: (getState().jobs || []).map(function(j) {
        return j.id === jobId
          ? Object.assign({}, j, { status: 'c1_final_sign_off', statusHistory: devHist })
          : j;
      })});
      try { dbUpdate('jobs', jobId, { status: 'c1_final_sign_off' }); }
      catch (e) { console.warn('[Dev advance] dbUpdate failed:', e); }
      if (typeof logJobAudit === 'function') {
        logJobAudit(jobId, 'Status Advanced (Dev)', 'Send DocuSign → c1_final_sign_off');
      }
      // Re-read job so the rest of the function sees the new status
      job = (getState().jobs || []).find(function(j){ return j.id === jobId; }) || job;
    }
  }

  // Belt-and-braces: clear any stale shared envelope columns before sending.
  // The variation webhook used to write into these columns (pre-fix), so
  // existing rows can have a phantom 'completed' status / signedAt that would
  // bleed into the Final envelope's badge.
  setState({ jobs: (getState().jobs || []).map(function(j){
    return j.id === jobId ? Object.assign({}, j, {
      docusignEnvelopeId:  null,
      docusignStatus:      null,
      docusignCompletedAt: null,
      docusignDeclinedAt:  null
    }) : j;
  })});
  if (typeof dbUpdate === 'function') {
    try {
      dbUpdate('jobs', jobId, {
        docusign_envelope_id:  null,
        docusign_status:       null,
        docusign_completed_at: null,
        docusign_declined_at:  null
      });
    } catch(e) { /* best-effort */ }
  }

  addToast('Sending DocuSign envelope…', 'info');

  _sb.functions.invoke('docusign-send', {
    body: {
      jobId: jobId,
      customerName: customerName,
      customerEmail: customerEmail,
      pdfBase64: pdfData.pdfBase64,
      tabs: pdfData.tabs,    // programmatic placement: signHere/fullName/dateSigned
      flags: {
        renderWarning: !!job.renderWarning,
        specialColour: !!job.specialColour,
        hasVariation:  !!job.hasVariation,
      },
    },
  }).then(async function(res) {
    if (res.error) {
      // supabase.functions.invoke returns "non-2xx status" with the actual
      // error body buried in error.context (a Response). Pull it out so the
      // user can see why the function rejected.
      var detail = '';
      try {
        if (res.error.context && typeof res.error.context.text === 'function') {
          detail = await res.error.context.text();
        }
      } catch (e) { /* ignore */ }
      console.error('DocuSign send error:', res.error, 'body:', detail);
      addToast('DocuSign send failed: ' + (res.error.message || 'error') + (detail ? ' — ' + detail.slice(0, 200) : ''), 'error');
      return;
    }
    var data = res.data || {};
    if (!data.ok) {
      console.error('DocuSign send rejected:', data);
      addToast('DocuSign send rejected: ' + (data.error || 'unknown error'), 'error');
      return;
    }
    var rec = {
      envelopeId: data.envelopeId,
      status: data.status || 'sent',
      sentAt: data.sentAt || new Date().toISOString(),
      sentBy: ((getCurrentUser() || {}).name) || '',
    };
    _setDocuSignEnvelopeForJob(jobId, rec);
    // Persist the envelope ID on the job so the docusign-webhook can find
    // the matching job when DocuSign Connect fires a status change.
    var stateJobs = getState().jobs || [];
    setState({ jobs: stateJobs.map(function(j) {
      return j.id === jobId
        ? Object.assign({}, j, {
            docusignEnvelopeId: rec.envelopeId,
            docusignStatus: rec.status,
          })
        : j;
    })});
    if (typeof dbUpdate === 'function') {
      try {
        dbUpdate('jobs', jobId, {
          docusign_envelope_id: rec.envelopeId,
          docusign_status: rec.status,
        });
      } catch (e) { console.warn('dbUpdate docusign fields failed', e); }
    }
    if (typeof logJobAudit === 'function') {
      logJobAudit(jobId, 'DocuSign Sent', 'Final Design envelope ' + rec.envelopeId + ' sent to ' + customerEmail);
    }
    addToast('✅ DocuSign sent to ' + customerEmail, 'success');
    if (typeof renderPage === 'function') renderPage();
  }).catch(function(e) {
    console.error('DocuSign send exception:', e);
    addToast('DocuSign send failed: ' + (e.message || String(e)), 'error');
  });
}

// ─── Status refresh: ask Edge Function for current envelope status ─────────
// Useful when the webhook hasn't been configured yet (e.g. local dev) or
// when we want to manually re-check after the customer says they signed.
// Calls a separate Edge Function (docusign-status) which returns the
// envelope's current state. If that function doesn't exist yet, this is a
// no-op stub the user can wire later.
function refreshDocuSignStatus(jobId) {
  var rec = getDocuSignEnvelopeForJob(jobId);
  if (!rec || !rec.envelopeId) { addToast('No DocuSign envelope to refresh', 'warning'); return; }
  if (!_sb) { addToast('Supabase not initialised', 'error'); return; }
  _sb.functions.invoke('docusign-status', {
    body: { jobId: jobId, envelopeId: rec.envelopeId },
  }).then(function(res) {
    var data = (res && res.data) || {};
    if (!data.ok) {
      addToast('Could not refresh status: ' + (data.error || 'function not deployed'), 'warning');
      return;
    }
    _setDocuSignEnvelopeForJob(jobId, { status: data.status, signedAt: data.completedAt || null });
    addToast('Envelope status: ' + data.status, 'info');
    if (typeof renderPage === 'function') renderPage();
  }).catch(function(e) {
    console.error('refreshDocuSignStatus error', e);
    addToast('Status refresh failed: ' + (e.message || String(e)), 'error');
  });
}

// ─── Variation DocuSign (Manual §6.3) ──────────────────────────────────────
// Builds a single-page Variation Quote PDF with one signature anchor and
// sends it through the same docusign-send Edge Function with kind='variation'.
// The Edge Function stamps the kind on the envelope's customFields so the
// webhook can dispatch correctly when the customer signs.

function buildVariationPdfBase64(job) {
  // jsPDF is loaded globally (via index.html). Use the UMD path: window.jspdf.
  if (!window.jspdf || !window.jspdf.jsPDF) {
    addToast('jsPDF not loaded — cannot build variation PDF', 'error');
    return null;
  }
  var jsPDF = window.jspdf.jsPDF;
  var doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  var contacts = getState().contacts || [];
  var contact = contacts.find(function(c){ return c.id === (job.contactId || job.cid); }) || {};
  var customerName = ((contact.fn||'') + ' ' + (contact.ln||'')).trim() || '—';
  var customerEmail = contact.email || '—';
  var amount = +job.variationAmount || 0;
  var notes = job.variationNotes || '';
  var jobNum = job.jobNumber || job.id;
  var today = new Date().toLocaleDateString('en-AU', {day:'numeric',month:'long',year:'numeric'});
  var signed = '$' + (amount < 0 ? '-' : '') + Math.abs(amount).toLocaleString('en-AU', {minimumFractionDigits:2, maximumFractionDigits:2});

  // Header
  doc.setFont('helvetica','bold'); doc.setFontSize(18);
  doc.text('Spartan Double Glazing — Variation Quote', 20, 25);
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text('Per Manual §6.3 — Final Sign-Off variation acceptance', 20, 32);
  doc.setTextColor(0);

  // Job metadata
  var y = 45;
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('Job Reference', 20, y); doc.setFont('helvetica','normal');
  doc.text(jobNum, 70, y); y += 7;
  doc.setFont('helvetica','bold'); doc.text('Customer', 20, y); doc.setFont('helvetica','normal');
  doc.text(customerName, 70, y); y += 7;
  doc.setFont('helvetica','bold'); doc.text('Email', 20, y); doc.setFont('helvetica','normal');
  doc.text(customerEmail, 70, y); y += 7;
  doc.setFont('helvetica','bold'); doc.text('Date', 20, y); doc.setFont('helvetica','normal');
  doc.text(today, 70, y); y += 12;

  // Variation amount box
  doc.setDrawColor(196, 18, 48); doc.setLineWidth(0.6);
  doc.roundedRect(20, y, 170, 26, 2, 2);
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(110);
  doc.text(amount >= 0 ? 'AMOUNT PAYABLE BY CUSTOMER' : 'CREDIT TO CUSTOMER', 25, y + 8);
  doc.setTextColor(0); doc.setFontSize(20);
  doc.text(signed + ' (incl. GST)', 25, y + 19);
  y += 32;

  // Reason
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Reason for Variation', 20, y); y += 6;
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  var lines = doc.splitTextToSize(notes || 'On-site check measure produced dimensions that materially differ from the original quote, changing the bill of materials. See variance check on the job for frame-by-frame breakdown.', 170);
  doc.text(lines, 20, y); y += (lines.length * 5) + 4;

  // Acceptance clause
  doc.setFillColor(247,247,250); doc.rect(20, y, 170, 30, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('Customer Acceptance', 25, y + 7);
  doc.setFont('helvetica','normal'); doc.setFontSize(10);
  var accLines = doc.splitTextToSize(
    'I accept the price variation stated above and authorise Spartan to incorporate it into the Final Design contract. I understand the Final Design DocuSign cannot be sent until this variation is signed.',
    160);
  doc.text(accLines, 25, y + 13);
  y += 36;

  // Signature anchor — DocuSign places the Customer signHere here.
  doc.setFont('helvetica','bold'); doc.setFontSize(10);
  doc.text('Customer Signature:', 20, y + 15);
  // White-on-white anchor text. DocuSign scans the PDF for this string.
  doc.setTextColor(255,255,255); doc.setFontSize(1);
  doc.text('\\sp_sig_variation_accept\\', 70, y + 15);
  doc.setTextColor(0); doc.setFontSize(10);
  doc.line(70, y + 18, 180, y + 18);

  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(140);
  doc.text('Spartan Double Glazing — page 1 of 1 — generated ' + new Date().toISOString().slice(0,10), 20, 285);

  var dataUri = doc.output('datauristring');
  // Strip the 'data:application/pdf;filename=...;base64,' prefix.
  var commaIdx = dataUri.indexOf(',');
  return commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : null;
}

function sendVariationDocuSign(jobId) {
  var jobs = getState().jobs || [];
  var job = jobs.find(function(j) { return j.id === jobId; });
  if (!job) { addToast('Job not found', 'error'); return; }
  if (typeof job.variationAmount !== 'number') {
    addToast('Variation amount is required (open the variance card first)', 'error');
    return;
  }
  var contacts = getState().contacts || [];
  var contact = contacts.find(function(c){ return c.id === (job.contactId || job.cid); }) || {};
  var customerName = ((contact.fn||'') + ' ' + (contact.ln||'')).trim();
  var customerEmail = contact.email || '';
  if (!customerName)  { addToast('Customer name required on contact', 'error'); return; }
  if (!customerEmail) { addToast('Customer email required on contact', 'error'); return; }
  if (!_sb) { addToast('Supabase not initialised — cannot send Variation DocuSign', 'error'); return; }

  var pdfBase64 = buildVariationPdfBase64(job);
  if (!pdfBase64) return;

  addToast('Sending Variation DocuSign…', 'info');

  _sb.functions.invoke('docusign-send', {
    body: {
      jobId: jobId,
      kind: 'variation',
      customerName: customerName,
      customerEmail: customerEmail,
      pdfBase64: pdfBase64,
      variationAmount: job.variationAmount,
      variationNotes: job.variationNotes || '',
    },
  }).then(async function(res) {
    if (res.error) {
      var detail = '';
      try { if (res.error.context && typeof res.error.context.text === 'function') detail = await res.error.context.text(); } catch(e){}
      addToast('Variation DocuSign failed: ' + (res.error.message || 'error') + (detail ? ' — ' + detail.slice(0,200) : ''), 'error');
      return;
    }
    var data = res.data || {};
    if (!data.ok) {
      addToast('Variation DocuSign rejected: ' + (data.error || 'unknown'), 'error');
      return;
    }
    var now = new Date().toISOString();
    setState({ jobs: (getState().jobs||[]).map(function(j){
      return j.id === jobId ? Object.assign({}, j, {
        variationStatus: 'awaiting_signature',
        variationEnvelopeId: data.envelopeId,
        variationSentAt: now,
      }) : j;
    })});
    if (typeof dbUpdate === 'function') {
      try {
        dbUpdate('jobs', jobId, {
          variation_status: 'awaiting_signature',
          variation_envelope_id: data.envelopeId,
          variation_sent_at: now,
        });
      } catch(e) { console.warn('dbUpdate variation fields failed', e); }
    }
    if (typeof logJobAudit === 'function') {
      logJobAudit(jobId, 'Variation DocuSign Sent', 'Envelope ' + data.envelopeId + ' to ' + customerEmail + ' · $' + job.variationAmount);
    }
    addToast('✅ Variation DocuSign sent to ' + customerEmail, 'success');
    if (typeof renderPage === 'function') renderPage();
  }).catch(function(e) {
    console.error('Variation DocuSign exception:', e);
    addToast('Variation DocuSign failed: ' + (e.message || String(e)), 'error');
  });
}

// Expose to window for inline onclick handlers
window.sendFinalDesignDocuSign = sendFinalDesignDocuSign;
window.sendVariationDocuSign = sendVariationDocuSign;
window.buildVariationPdfBase64 = buildVariationPdfBase64;
window.refreshDocuSignStatus = refreshDocuSignStatus;
window.getDocuSignEnvelopeForJob = getDocuSignEnvelopeForJob;
window.buildFinalDesignPdfBase64 = buildFinalDesignPdfBase64;
window.isDevMode = isDevMode;
