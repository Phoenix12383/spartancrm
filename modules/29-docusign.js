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
// Builds a one-page "Final Design Sign-Off" PDF carrying:
//   - Job + customer header
//   - Frame summary table from cadFinalData (or fallback)
//   - Sign-Off Clauses section with anchor strings the DocuSign template
//     references. Conditional anchors only printed when the corresponding
//     job flag is set.
//
// Phoenix's CAD will eventually generate a richer Final Design PDF with the
// same anchor convention; once it does, we can stop generating client-side
// and just forward the CAD-produced PDF.
function buildFinalDesignPdfBase64(job) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    addToast('jsPDF not loaded — cannot generate Final Design PDF', 'error');
    return null;
  }
  var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
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

  // Customer + job summary
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('Customer:', 14, 36); doc.setFont('helvetica', 'normal'); doc.text(customerName, 40, 36);
  doc.setFont('helvetica', 'bold'); doc.text('Job:',      14, 42); doc.setFont('helvetica', 'normal'); doc.text(String(job.jobNumber || job.id), 40, 42);
  doc.setFont('helvetica', 'bold'); doc.text('Address:',  14, 48); doc.setFont('helvetica', 'normal'); doc.text(addr || '—', 40, 48, { maxWidth: 156 });
  doc.setFont('helvetica', 'bold'); doc.text('Frames:',   14, 54); doc.setFont('helvetica', 'normal'); doc.text(String(frames.length), 40, 54);

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
    if (y > 200) { doc.addPage(); y = 20; }
    doc.text(String(i + 1),                                      14, y);
    doc.text(TYPE_LABELS[f.productType] || f.productType || '—', 24, y, { maxWidth: 38 });
    doc.text((f.width || 0) + ' × ' + (f.height || 0),           64, y);
    doc.text(String(f.colour || '').replace(/_/g, ' '),         104, y, { maxWidth: 44 });
    doc.text(String(f.glassSpec || '').replace(/_/g, ' '),      150, y, { maxWidth: 44 });
    y += 5;
  });

  // Sign-Off Clauses section
  if (y > 200) { doc.addPage(); y = 20; }
  y += 6;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Sign-Off Clauses', 14, y); y += 4;
  doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 5;
  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  doc.text('You must sign each applicable clause to authorise production.', 14, y); y += 6;

  // Helper: print a numbered clause + invisible anchor on the right margin.
  // Anchor printed in white at 1pt so DocuSign can find it without the
  // customer seeing visual clutter.
  function clause(num, title, bodyLines, anchor) {
    if (y > 245) { doc.addPage(); y = 20; }
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(num + '. ' + title, 14, y); y += 4;
    doc.setFont('helvetica', 'normal');
    bodyLines.forEach(function(line) { doc.text(line, 14, y, { maxWidth: 150 }); y += 4; });
    // Anchor (white, 1pt — invisible to the customer)
    doc.setTextColor(255, 255, 255); doc.setFontSize(1);
    doc.text(anchor, 165, y - 4);
    doc.setTextColor(0, 0, 0); doc.setFontSize(8);
    y += 6;
  }

  clause('1', 'Opening Direction',
    ['I confirm the opening direction of each sash is as shown in the design above.'],
    '\\sp_sig_opening_dir\\');
  clause('2', 'Glass Type',
    ['I confirm the glass specification listed for each pane is what I have selected.'],
    '\\sp_sig_glass_type\\');
  clause('3', 'Override Clause',
    ['I acknowledge that this Final Design supersedes the original quotation.',
     'Once signed, the dimensions, configuration, colours, glass, hardware, and pricing',
     'in this Final Design are the binding specification for manufacture and install.'],
    '\\sp_sig_override\\');

  if (job.renderWarning) {
    clause('4', 'Render Warning',
      ['My property has rendered brick. I acknowledge that during demolition, render',
       'around the existing window opening may chip or crack. Spartan is not liable',
       'for render repairs unless agreed in writing as a separate quote.'],
      '\\sp_sig_render_warning\\');
  }
  if (job.specialColour) {
    clause('5', 'Special Colour Lead Time',
      ['One or more frames use a special (non-standard) colour. I accept the additional',
       '4–6 week lead time and will not hold Spartan to the standard install date.'],
      '\\sp_sig_special_colour\\');
  }
  if (job.hasVariation) {
    clause('6', 'Variation Acceptance',
      ['I accept the variation in scope and price as detailed in the Variation Quote',
       'I have signed separately. The new total price replaces the original quote price.'],
      '\\sp_sig_variation\\');
  }

  clause('7', 'Production Authorisation',
    ['I authorise Spartan Double Glazing to begin manufacturing the frames specified above.',
     'I understand that once production starts, design changes may incur a Variation Quote',
     'and additional fees, and that delays may apply.'],
    '\\sp_sig_production_auth\\');

  // Footer
  if (y > 270) { doc.addPage(); y = 20; }
  y += 6;
  doc.setFontSize(7); doc.setTextColor(120, 120, 120);
  doc.text('Spartan Double Glazing · ' + new Date().toLocaleDateString('en-AU') +
           ' · Job ' + (job.jobNumber || job.id),
           14, 285);

  // Return base64 (without "data:application/pdf;base64," prefix)
  return doc.output('datauristring').replace(/^data:application\/pdf;base64,/, '');
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

  var contacts = getState().contacts || [];
  var contact = contacts.find(function(c) { return c.id === (job.contactId || job.cid); }) || {};
  var customerName = ((contact.fn || '') + ' ' + (contact.ln || '')).trim();
  var customerEmail = contact.email || '';
  if (!customerName) { addToast('Customer name is required on the contact', 'error'); return; }
  if (!customerEmail) { addToast('Customer email is required on the contact', 'error'); return; }

  // Build PDF synchronously
  var pdfBase64 = buildFinalDesignPdfBase64(job);
  if (!pdfBase64) return;

  if (!_sb) { addToast('Supabase client not initialised — cannot send DocuSign', 'error'); return; }

  addToast('Sending DocuSign envelope…', 'info');

  _sb.functions.invoke('docusign-send', {
    body: {
      jobId: jobId,
      customerName: customerName,
      customerEmail: customerEmail,
      pdfBase64: pdfBase64,
      flags: {
        renderWarning: !!job.renderWarning,
        specialColour: !!job.specialColour,
        hasVariation:  !!job.hasVariation,
      },
    },
  }).then(function(res) {
    if (res.error) {
      console.error('DocuSign send error:', res.error);
      addToast('DocuSign send failed: ' + (res.error.message || 'unknown error'), 'error');
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

// Expose to window for inline onclick handlers
window.sendFinalDesignDocuSign = sendFinalDesignDocuSign;
window.refreshDocuSignStatus = refreshDocuSignStatus;
window.getDocuSignEnvelopeForJob = getDocuSignEnvelopeForJob;
window.buildFinalDesignPdfBase64 = buildFinalDesignPdfBase64;
