// ═══════════════════════════════════════════════════════════════════════════
// M6: SERVICE / COMPLETION PDF — full template (contract §5; HTML twin L1756)
// ═══════════════════════════════════════════════════════════════════════════
// Sync. Returns Blob. Structure:
//   Page 1    — Letterhead, title, job/customer/installer/completion block,
//               per-frame commissioning table (installed / sealed / hw-ok)
//   Pages 2.. — Continuation if frames overflow
//   Next      — Agreement of Service Completion (3-option tick box),
//               notes/outstanding items lines, Customer + Installer sigs
//   Final N+  — Service Re-Order & Parts Checklist (20 standard items,
//               5 per page, each with OK/Re-order/N/A tick boxes + note line)
//   Footer    — "Page N of M" on every page
//
// Not yet wired into onRequestSave — no mode='service' trigger exists.
// Exposed on window for ad-hoc invocation until the CRM spec adds a
// post-install save path (Phoenix decision, outside M6 scope).
// ═══════════════════════════════════════════════════════════════════════════

function generateServicePdfBlob(ctx) {
  var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || null;
  if (!jsPDFCtor) throw new Error('jsPDF is not loaded');

  var projectInfo     = ctx.projectInfo || {};
  var projectItems    = ctx.projectItems || [];
  var jobNumber       = ctx.jobNumber || projectInfo.jobNumber || projectInfo.projectNumber || '—';
  var customerName    = ctx.customerName || projectInfo.customerName || projectInfo.clientName || '—';
  var customerAddress = ctx.customerAddress || projectInfo.siteAddress || projectInfo.customerAddress || projectInfo.address || '—';
  var installerName   = ctx.installerName || projectInfo.installerName || '—';
  var completedAt     = new Date().toLocaleDateString('en-AU');

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
    _mmText(doc, 'Spartan Double Glazing Pty Ltd · Completion Document / Service · ' + completedAt, marginL, 289);
    _mmText(doc, 'Page ' + n + ' of ' + tot, pageW - marginR, 289, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function kv(label, value, x, yy) {
    doc.setFont('helvetica', 'bold'); _mmText(doc, label, x, yy);
    doc.setFont('helvetica', 'normal'); _mmText(doc, String(value == null ? '—' : value), x + 28, yy);
  }
  function tickBox(x, yy, size) {
    var s = size || 3.5;
    doc.setDrawColor(80, 80, 80); doc.setLineWidth(0.3);
    doc.rect(x, yy - s + 0.5, s, s);
  }

  // ── Page 1: header + commissioning table ─────────────────────────────
  drawLetterhead();
  var y = 32;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  _mmText(doc, 'COMPLETION DOCUMENT / SERVICE', pageW / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(9);
  var leftX = marginL, rightX = marginL + contentW / 2 + 5;
  kv('Job:', jobNumber, leftX, y);
  kv('Completed:', completedAt, rightX, y); y += 5;
  kv('Customer:', customerName, leftX, y);
  kv('Installer:', installerName, rightX, y); y += 5;
  kv('Site:', customerAddress, leftX, y); y += 9;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setFillColor(240, 240, 240);
  doc.rect(marginL, y - 4, contentW, 6, 'F');
  _mmText(doc, '#',           marginL + 2,   y);
  _mmText(doc, 'Frame',       marginL + 8,   y);
  _mmText(doc, 'Product',     marginL + 55,  y);
  _mmText(doc, 'Installed',   marginL + 105, y);
  _mmText(doc, 'Sealed',      marginL + 130, y);
  _mmText(doc, 'Hardware OK', marginL + 150, y);
  y += 6;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  projectItems.forEach(function(f, i) {
    if (y > 270) { doc.addPage(); drawLetterhead(); y = 32; }
    _mmText(doc, String(i + 1),                                  marginL + 2,   y);
    _mmText(doc, String(f.name || ('F' + (i+1))).slice(0, 22),   marginL + 8,   y);
    _mmText(doc, String(f.productType || '').slice(0, 28),       marginL + 55,  y);
    tickBox(marginL + 112, y);
    tickBox(marginL + 137, y);
    tickBox(marginL + 162, y);
    y += 5;
  });
  y += 8;

  // ── Agreement of Service Completion ──────────────────────────────────
  if (y > 220) { doc.addPage(); drawLetterhead(); y = 32; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  _mmText(doc, 'Agreement of Service Completion', marginL, y); y += 7;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  _mmText(doc, 'Please tick the appropriate box:', marginL, y); y += 7;

  var opts = [
    'I am fully satisfied with the installation and all items are working correctly.',
    'I am mostly satisfied — minor items noted below require follow-up by Spartan.',
    'I am not satisfied — further work is required as detailed in the notes below.'
  ];
  opts.forEach(function(text) {
    if (y > 270) { doc.addPage(); drawLetterhead(); y = 32; }
    tickBox(marginL, y);
    var lines = doc.splitTextToSize(text, contentW - 8);
    lines.forEach(function(line, idx) {
      _mmText(doc, line, marginL + 6, y + (idx * 4.5));
    });
    y += Math.max(6, lines.length * 4.5 + 1);
  });
  y += 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  _mmText(doc, 'Notes / outstanding items:', marginL, y); y += 5;
  doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
  for (var ln = 0; ln < 4; ln++) {
    doc.line(marginL, y + ln * 6, pageW - marginR, y + ln * 6);
  }
  y += 30;

  // Customer + Installer signatures
  if (y > 240) { doc.addPage(); drawLetterhead(); y = 32; }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  _mmText(doc, 'Customer Signature:', marginL, y); y += 14;
  doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.3);
  doc.line(marginL, y, marginL + 95, y);
  doc.line(marginL + 105, y, pageW - marginR, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  _mmText(doc, 'Signature', marginL, y + 4);
  _mmText(doc, 'Date', marginL + 105, y + 4);
  y += 18;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  _mmText(doc, 'Installer Signature:', marginL, y); y += 14;
  doc.line(marginL, y, marginL + 95, y);
  doc.line(marginL + 105, y, pageW - marginR, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  _mmText(doc, 'Signature', marginL, y + 4);
  _mmText(doc, 'Date', marginL + 105, y + 4);

  // ── Service Re-Order & Parts Checklist (20 items, 5 per page) ────────
  var checklist = [
    'Sash operation (open / close smooth)',
    'Handle operation and lock engagement',
    'Tilt function (T&T windows) — tilt lock holds',
    'Weatherseal integrity (visible compression)',
    'Drainage holes clear of debris',
    'Glazing beads firmly seated',
    'Glass clean, free of scratches',
    'External silicone caulking continuous',
    'Internal trims fitted square and flush',
    'Reveal paint / finish free of damage',
    'Fly screens fitted and operating',
    'Hardware colour matches specification',
    'Restrictor stays (awning windows) engage',
    'Security fasteners torqued correctly',
    'Threshold weather-tight (doors)',
    'Door drop-down seals operate',
    'Hinge alignment and clearance',
    'Drain cap / endcap fitted',
    'Keys supplied and tested (all locking points)',
    'Customer operation demonstrated and understood'
  ];

  var perPage = 5;
  for (var cp = 0; cp < checklist.length; cp += perPage) {
    doc.addPage();
    drawLetterhead();
    var cy = 32;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    var header = cp === 0 ? 'Service Re-Order & Parts Checklist'
                          : 'Service Re-Order & Parts Checklist (continued)';
    _mmText(doc, header, marginL, cy); cy += 9;

    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    var slice = checklist.slice(cp, cp + perPage);
    slice.forEach(function(item, idx) {
      var itemNo = cp + idx + 1;
      doc.setFont('helvetica', 'bold');
      _mmText(doc, String(itemNo) + '.', marginL, cy);
      doc.setFont('helvetica', 'normal');
      var lines = doc.splitTextToSize(item, contentW - 60);
      lines.forEach(function(line, li) { _mmText(doc, line, marginL + 8, cy + li * 4.5); });
      var h = Math.max(6, lines.length * 4.5);

      var tbx = marginL + contentW - 50;
      tickBox(tbx, cy);       _mmText(doc, 'OK',       tbx + 5,  cy);
      tickBox(tbx + 16, cy);  _mmText(doc, 'Re-order', tbx + 21, cy);
      tickBox(tbx + 40, cy);  _mmText(doc, 'N/A',      tbx + 45, cy);

      cy += h + 3;
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2);
      doc.line(marginL + 8, cy + 2, pageW - marginR, cy + 2);
      cy += 10;
    });
  }

  var total = doc.internal.getNumberOfPages();
  for (var p = 1; p <= total; p++) { doc.setPage(p); drawFooter(p, total); }

  return doc.output('blob');
}

// Upload PDF to cad-signatures bucket, return public URL.
async function uploadFinalisePdf(designId, blob) {
  var client = sb();
  if (!client) return null;
  try {
    var path = designId + '/quote_' + Date.now() + '.pdf';
    var up = await client.storage.from('cad-signatures').upload(path, blob, {
      cacheControl: '3600', upsert: false, contentType: 'application/pdf',
    });
    if (up.error) throw up.error;
    var urlRes = client.storage.from('cad-signatures').getPublicUrl(path);
    return urlRes.data && urlRes.data.publicUrl || null;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('uploadFinalisePdf failed', e);
    return null;
  }
}

