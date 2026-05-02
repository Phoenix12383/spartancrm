// ═══════════════════════════════════════════════════════════════════════════
// M6: FINAL DESIGN PDF — full template (contract §5, §9; HTML twin L2050)
// ═══════════════════════════════════════════════════════════════════════════
// Sync. Returns Blob. Structure:
//   Page 1    — Letterhead, title, job/customer/sales/site block, locked
//               specifications table (W×H, colour, opening, glass, hardware)
//               with CM site-note annotations inline where present
//   Pages 2.. — Continuation if the frame count overflows
//   Final     — Design Acceptance prose + DocuSign-ready signature blocks
//               (Client + Sales Manager, side-by-side date/sig lines)
//   Footer    — "Page N of M" on every page
// Canonical frame fields locked (fallbacks removed): f.width, f.height,
// f.colour, f.openStyle, f.glassSpec, f.hardwareColour, f.productType.
// ═══════════════════════════════════════════════════════════════════════════

function generateFinalDesignPdfBlob(ctx) {
  var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || null;
  if (!jsPDFCtor) throw new Error('jsPDF is not loaded');

  var projectInfo     = ctx.projectInfo || {};
  var projectItems    = ctx.projectItems || [];
  var surveyData      = ctx.surveyData || [];
  var jobNumber       = ctx.jobNumber || projectInfo.jobNumber || projectInfo.projectNumber || '—';
  var customerName    = ctx.customerName || projectInfo.customerName || projectInfo.clientName || '—';
  var customerAddress = ctx.customerAddress || projectInfo.siteAddress || projectInfo.customerAddress || projectInfo.address || '—';
  var salesManager    = ctx.salesManager || projectInfo.salesManager || '—';
  // WIP35 (FSO): additional ctx fields for the redesigned header — mirrors
  // the WIP32 CM PDF layout (centered title + centered client name + divider
  // + 2-column meta block). Defaults to '—' when absent.
  var customerPhone   = ctx.customerPhone || projectInfo.customerPhone || projectInfo.phone || '';
  var customerEmail   = ctx.customerEmail || projectInfo.customerEmail || projectInfo.email || '';
  var projectName     = ctx.projectName   || customerName || '';
  var preparedAt      = new Date().toLocaleDateString('en-AU');

  var surveyById = {};
  surveyData.forEach(function(row) { if (row && row.frameId) surveyById[row.frameId] = row; });

  var doc = new jsPDFCtor({ unit: 'mm', format: 'a4' });
  var pageW = 210, marginL = 15, marginR = 15;
  var contentW = pageW - marginL - marginR;

  function drawLetterhead() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(0, 0, 0);
    _mmText(doc, 'SPARTAN DOUBLE GLAZING', marginL, 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(90, 90, 90);
    _mmText(doc, 'Spartan Double Glazing Pty Ltd · spartandoubleglazing.com.au', marginL, 20.5);
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
    doc.line(marginL, 22.5, pageW - marginR, 22.5);
    doc.setTextColor(0, 0, 0);
  }
  function drawFooter(n, tot) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140, 140, 140);
    _mmText(doc, 'Spartan Double Glazing Pty Ltd · Final Sign Off · ' + preparedAt, marginL, 289);
    _mmText(doc, 'Page ' + n + ' of ' + tot, pageW - marginR, 289, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function kv(label, value, x, yy) {
    doc.setFont('helvetica', 'bold'); _mmText(doc, label, x, yy);
    doc.setFont('helvetica', 'normal'); _mmText(doc, String(value == null ? '—' : value), x + 28, yy);
  }

  drawLetterhead();
  var y = 32;

  // ── WIP35 (FSO): redesigned header — mirrors WIP32 CM PDF layout ────
  // Centered document title (18pt bold) → centered client name (14pt) →
  // thin divider line → two-column meta block (Job/Prepared, Phone/Sales,
  // Email full-width, Site full-width). Always renders all rows; missing
  // values fall back to '—'. The visual symmetry distinguishes the FSO
  // PDF as a formal sign-off document and matches the CM PDF for paired
  // reading.
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  _mmText(doc, 'FINAL SIGN OFF (REPLACEMENT)', pageW / 2, y, { align: 'center' });
  y += 8;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(14);
  _mmText(doc, projectName || customerName || '—', pageW / 2, y, { align: 'center' });
  y += 5;

  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3);
  doc.line(marginL + 30, y, pageW - marginR - 30, y);
  y += 6;

  doc.setFontSize(9);
  var leftX = marginL, rightX = marginL + contentW / 2 + 5;
  kv('Job No:',  jobNumber,           leftX,  y);
  kv('Prepared:', preparedAt,         rightX, y); y += 5;
  kv('Phone:',   customerPhone || '—', leftX,  y);
  kv('Sales:',   salesManager,        rightX, y); y += 5;
  kv('Email:',   customerEmail || '—', leftX,  y); y += 5;
  kv('Site:',    customerAddress,     leftX,  y); y += 9;

  // Specifications table
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setFillColor(240, 240, 240);
  doc.rect(marginL, y - 4, contentW, 6, 'F');
  _mmText(doc, '#',        marginL + 2,   y);
  _mmText(doc, 'Frame',    marginL + 8,   y);
  _mmText(doc, 'W × H',    marginL + 45,  y);
  _mmText(doc, 'Colour',   marginL + 75,  y);
  _mmText(doc, 'Opening',  marginL + 105, y);
  _mmText(doc, 'Glass',    marginL + 135, y);
  _mmText(doc, 'Hardware', marginL + 160, y);
  y += 6;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  projectItems.forEach(function(f, i) {
    if (y > 270) { doc.addPage(); drawLetterhead(); y = 32; }
    var dims = (f.width || '—') + ' × ' + (f.height || '—');
    _mmText(doc, String(i + 1),                                   marginL + 2,   y);
    _mmText(doc, String(f.name || ('F' + (i+1))).slice(0, 18),    marginL + 8,   y);
    _mmText(doc, dims,                                            marginL + 45,  y);
    _mmText(doc, String(f.colour || '—').slice(0, 14),            marginL + 75,  y);
    _mmText(doc, String(f.openStyle || '—').slice(0, 14),         marginL + 105, y);
    _mmText(doc, String(f.glassSpec || '—').slice(0, 12),         marginL + 135, y);
    _mmText(doc, String(f.hardwareColour || '—').slice(0, 12),    marginL + 160, y);
    y += 5;

    var sd = surveyById[f.id] || {};
    if (sd.siteNotes) {
      doc.setFont('helvetica', 'italic'); doc.setTextColor(100, 100, 100);
      var note = 'CM note: ' + String(sd.siteNotes).replace(/\s+/g, ' ');
      var nLines = doc.splitTextToSize(note, contentW - 6);
      nLines.forEach(function(ln) {
        if (y > 275) { doc.addPage(); drawLetterhead(); y = 32; }
        _mmText(doc, ln, marginL + 8, y); y += 4.5;
      });
      doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0);
      y += 1;
    }
  });
  y += 8;

  // Design Acceptance
  if (y > 220) { doc.addPage(); drawLetterhead(); y = 32; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  _mmText(doc, 'Design Acceptance', marginL, y); y += 8;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  var accept = 'By signing below, I confirm that I have reviewed the design specifications above and ' +
    'authorise Spartan Double Glazing to proceed with manufacture and installation in accordance with ' +
    'these details. I understand that any changes after this point may incur additional charges.';
  doc.splitTextToSize(accept, contentW).forEach(function(line) {
    _mmText(doc, line, marginL, y); y += 5;
  });
  y += 10;

  // Client signature
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  _mmText(doc, 'Client Signature:', marginL, y); y += 14;
  doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.3);
  doc.line(marginL, y, marginL + 95, y);
  doc.line(marginL + 105, y, pageW - marginR, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  _mmText(doc, 'Signature', marginL, y + 4);
  _mmText(doc, 'Date', marginL + 105, y + 4);
  y += 18;

  // Sales Manager signature
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  _mmText(doc, 'Sales Manager Signature:', marginL, y); y += 14;
  doc.line(marginL, y, marginL + 95, y);
  doc.line(marginL + 105, y, pageW - marginR, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  _mmText(doc, 'Signature', marginL, y + 4);
  _mmText(doc, 'Date', marginL + 105, y + 4);

  var total = doc.internal.getNumberOfPages();
  for (var p = 1; p <= total; p++) { doc.setPage(p); drawFooter(p, total); }

  return doc.output('blob');
}

