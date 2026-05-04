// ═══════════════════════════════════════════════════════════════════════════
// PDF GENERATION (spec §6.3) — Finalise sign-off quote
// Uses jsPDF (loaded via CDN in <head>). Generates an A4 quote PDF with:
//   header / customer block / line items / totals / install plan (if CM done)
//   / T&Cs / signature block. Returns a Blob suitable for upload.
// ═══════════════════════════════════════════════════════════════════════════

function _mmText(doc, text, x, y, opts) {
  // Small wrapper — jsPDF text with safe fallback for undefined values.
  doc.text(String(text == null ? '' : text), x, y, opts || {});
}

function generateFinalisePdfBlob(ctx) {
  // Get jsPDF from the UMD global. CDN exposes it as `jspdf.jsPDF`.
  var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || null;
  if (!jsPDFCtor) throw new Error('jsPDF is not loaded');

  var projectName    = ctx.projectName || 'Project';
  var projectInfo    = ctx.projectInfo || {};
  var projectItems   = ctx.projectItems || [];
  var pc             = ctx.pricingConfig || {};
  var priceListId    = ctx.selectedPriceList || (pc.markups && pc.markups.priceLists && pc.markups.priceLists[0] && pc.markups.priceLists[0].id);
  var taxMode        = ctx.taxMode || 'gst';
  var cm             = ctx.checkMeasure || null;
  var entityRef      = ctx.entityRef || ''; // e.g. "DEAL 123"
  var quoteDate      = new Date().toLocaleDateString('en-AU');
  var expiresInDays  = 14;

  var doc = new jsPDFCtor({ unit: 'mm', format: 'a4' });
  var pageW = doc.internal.pageSize.getWidth();   // 210
  var pageH = doc.internal.pageSize.getHeight();  // 297
  var margin = 15;
  var y = margin;

  // ─── HEADER ────────────────────────────────────────────────────────────
  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, pageW, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  _mmText(doc, 'SPARTAN DOUBLE GLAZING', margin, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  _mmText(doc, 'uPVC Windows & Doors · Australia-wide', margin, 21);
  _mmText(doc, 'spartandg.com.au · (03) 9000 0000', margin, 26);
  // Right side — document type
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  _mmText(doc, 'QUOTATION', pageW - margin, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  _mmText(doc, 'Date: ' + quoteDate, pageW - margin, 22, { align: 'right' });
  if (entityRef) _mmText(doc, 'Ref: ' + entityRef, pageW - margin, 27, { align: 'right' });

  y = 44;
  doc.setTextColor(17, 17, 17);

  // ─── CUSTOMER BLOCK ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  _mmText(doc, 'PREPARED FOR', margin, y);
  _mmText(doc, 'INSTALLATION SITE', pageW / 2 + 5, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  _mmText(doc, projectInfo.customerName || '—', margin, y);
  var siteLine1 = projectInfo.address1 || '';
  _mmText(doc, siteLine1 || '—', pageW / 2 + 5, y);
  y += 5;
  _mmText(doc, projectInfo.email || '', margin, y);
  var siteLine2 = [projectInfo.suburb, projectInfo.postcode].filter(Boolean).join('  ');
  _mmText(doc, siteLine2, pageW / 2 + 5, y);
  y += 5;
  _mmText(doc, projectInfo.phone || '', margin, y);
  y += 10;

  // Project name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  _mmText(doc, 'Project: ' + projectName, margin, y);
  y += 8;

  // ─── LINE ITEMS TABLE ───────────────────────────────────────────────────
  doc.setFillColor(235, 235, 235);
  doc.rect(margin, y - 4, pageW - margin * 2, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  _mmText(doc, '#', margin + 2, y);
  _mmText(doc, 'Frame', margin + 10, y);
  _mmText(doc, 'Room', margin + 36, y);
  _mmText(doc, 'Type', margin + 66, y);
  _mmText(doc, 'W×H (mm)', margin + 96, y);
  _mmText(doc, 'Glass', margin + 125, y);
  _mmText(doc, 'Total', pageW - margin - 2, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  var framesGross = 0, installTotal = 0, costTotal = 0;
  projectItems.forEach(function(f, idx) {
    // Page break check — leave room for totals footer
    if (y > pageH - 80) {
      doc.addPage();
      y = margin;
    }
    var fp;
    try { fp = calculateFramePrice(f, pc); } catch (e) { fp = { costPrice: 0, priceListsFactory: {}, priceListsInstall: {}, fullCost: 0 }; }
    var framePortion   = (priceListId && fp.priceListsFactory && fp.priceListsFactory[priceListId]) || fp.costPrice || 0;
    var installPortion = (priceListId && fp.priceListsInstall && fp.priceListsInstall[priceListId]) || 0;
    var lineTotal = framePortion + installPortion;
    framesGross += framePortion;
    installTotal += installPortion;
    costTotal += (fp.fullCost || fp.costPrice || 0);

    _mmText(doc, String(idx + 1), margin + 2, y);
    _mmText(doc, String(f.name || ''), margin + 10, y);
    _mmText(doc, String(f.room || ''), margin + 36, y);
    var typeLbl = (f.productType || '') + (f.configuration ? (' / ' + f.configuration) : '');
    _mmText(doc, typeLbl.slice(0, 22), margin + 66, y);
    _mmText(doc, (f.widthMm || 0) + ' × ' + (f.heightMm || 0), margin + 96, y);
    _mmText(doc, String(f.glassSpec || '—').slice(0, 16), margin + 125, y);
    _mmText(doc, '$' + lineTotal.toFixed(2), pageW - margin - 2, y, { align: 'right' });
    y += 5;
  });

  // ─── TOTALS ─────────────────────────────────────────────────────────────
  if (y > pageH - 70) { doc.addPage(); y = margin; }
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageW - margin, y);
  y += 6;

  var ancGross = 0;
  (ctx.projectAncillaries || []).forEach(function(a) { ancGross += Number(a.amount) || 0; });

  var totalDiscount = 0;
  (ctx.projectPromotions || []).forEach(function(prm) {
    if (prm.enabled === false) return;
    var base = 0;
    if (prm.applyFrames !== false) base += framesGross;
    if (prm.applyInstall !== false) base += installTotal;
    if (prm.applyAncillaries !== false) base += ancGross;
    var d = prm.kind === 'pct' ? base * ((Number(prm.amount) || 0) / 100) : Math.min(Number(prm.amount) || 0, base);
    totalDiscount += d;
  });

  var subtotal = framesGross + installTotal + ancGross - totalDiscount;
  if (subtotal < 0) subtotal = 0;
  var gst = taxMode === 'gst' ? subtotal * 0.1 : 0;
  var grandTotal = subtotal + gst;

  function totalRow(label, val, bold) {
    if (bold) doc.setFont('helvetica', 'bold'); else doc.setFont('helvetica', 'normal');
    _mmText(doc, label, pageW - margin - 60, y);
    _mmText(doc, '$' + val.toFixed(2), pageW - margin - 2, y, { align: 'right' });
    y += 5;
  }
  totalRow('Frames', framesGross, false);
  if (installTotal > 0) totalRow('Installation', installTotal, false);
  if (ancGross > 0) totalRow('Ancillaries', ancGross, false);
  if (totalDiscount > 0) {
    doc.setTextColor(196, 18, 48);
    totalRow('Discount', -totalDiscount, false);
    doc.setTextColor(17, 17, 17);
  }
  if (taxMode === 'gst') totalRow('GST 10%', gst, false);
  y += 1;
  doc.setDrawColor(17, 17, 17);
  doc.setLineWidth(0.4);
  doc.line(pageW - margin - 62, y, pageW - margin, y);
  doc.setLineWidth(0.2);
  y += 5;
  doc.setFontSize(11);
  totalRow('TOTAL' + (taxMode === 'gst' ? ' (inc GST)' : ''), grandTotal, true);
  doc.setFontSize(9);
  y += 4;

  // ─── INSTALL PLAN (if CM complete) ─────────────────────────────────────
  if (cm && cm.completed) {
    if (y > pageH - 60) { doc.addPage(); y = margin; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    _mmText(doc, 'INSTALLATION PLAN', margin, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    var planLines = [
      'Crew: ' + (cm.crewSizeRequired || '—') + ' installers',
      'Estimated duration: ' + (cm.estimatedInstallDays || '—') + ' day(s)',
      'Earliest install date: ' + (cm.earliestInstallDate || '—'),
      'Lift gear: ' + (cm.liftGearRequired || 'standard'),
      'Scaffold required: ' + (cm.scaffoldRequired ? 'YES' : 'No'),
      'Crane required: ' + (cm.craneRequired ? 'YES' : 'No'),
    ];
    planLines.forEach(function(ln) { _mmText(doc, ln, margin, y); y += 5; });
    y += 3;
  }

  // ─── TERMS & CONDITIONS ────────────────────────────────────────────────
  if (y > pageH - 55) { doc.addPage(); y = margin; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  _mmText(doc, 'TERMS & CONDITIONS', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  var terms = [
    '1. Quote valid for ' + expiresInDays + ' days from the date shown.',
    '2. A 50% deposit is required to commence manufacturing. Balance due on completion of installation.',
    '3. Prices include GST and standard installation unless otherwise noted.',
    '4. Lead time is typically 8–12 weeks from deposit and confirmed check-measure.',
    '5. Customer to provide clear and safe access to the installation site.',
    '6. Warranty: 10 years on uPVC profiles, 5 years on hardware and glass sealed units, 2 years on installation.',
    '7. This quote supersedes all previous quotes for this project.',
  ];
  terms.forEach(function(t) {
    var split = doc.splitTextToSize(t, pageW - margin * 2);
    split.forEach(function(ln) { _mmText(doc, ln, margin, y); y += 3.6; });
  });
  y += 4;

  // ─── SIGNATURE BLOCK ───────────────────────────────────────────────────
  if (y > pageH - 40) { doc.addPage(); y = margin; }
  doc.setDrawColor(180, 180, 180);
  doc.line(margin, y, pageW - margin, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  _mmText(doc, 'CUSTOMER ACCEPTANCE', margin, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  _mmText(doc, 'By signing electronically via the secure link sent to your email, you accept the terms above.', margin, y);
  y += 8;
  // Placeholder signature lines
  doc.setFontSize(9);
  doc.line(margin, y + 6, margin + 70, y + 6);
  doc.line(pageW - margin - 60, y + 6, pageW - margin, y + 6);
  _mmText(doc, 'Signature', margin, y + 10);
  _mmText(doc, 'Date', pageW - margin - 60, y + 10);

  // ─── FOOTER ─────────────────────────────────────────────────────────────
  var totalPages = doc.internal.getNumberOfPages();
  for (var p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    _mmText(doc, 'Spartan Double Glazing Pty Ltd · Page ' + p + ' of ' + totalPages, pageW / 2, pageH - 8, { align: 'center' });
  }

  return doc.output('blob');
}

