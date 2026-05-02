// ═══════════════════════════════════════════════════════════════════════════
// M6: CHECK MEASURE PDF — full template (contract §5, §6; HTML twin L1474)
// ═══════════════════════════════════════════════════════════════════════════
// Async. Returns Promise<Blob>. Structure:
//   Page 1    — Letterhead, title, job/customer/site block, summary table
//               (designed vs measured W×H, photo count, notes line per frame)
//   Pages 2.. — Per-frame detail pages for frames with photos or site notes
//               (full notes, photos downsampled ≤800px long-edge, ≤4 per row)
//   Final     — Surveyor & customer confirmation + Ascora upload disclaimer
//               + signature block
//   Footer    — "Page N of M" on every page
// Canonical frame fields referenced: f.id, f.name, f.productType, f.width,
// f.height. Measurement data from ctx.measurementsByFrameId[f.id] as
// { measuredWidthMm, measuredHeightMm, siteNotes, photos[] }.
// ═══════════════════════════════════════════════════════════════════════════

async function generateCheckMeasurePdfBlob(ctx) {
  var jsPDFCtor = (typeof window !== 'undefined' && window.jspdf && window.jspdf.jsPDF) || null;
  if (!jsPDFCtor) throw new Error('jsPDF is not loaded');

  var projectInfo       = ctx.projectInfo || {};
  var projectItems      = ctx.projectItems || [];
  var measurementsById  = ctx.measurementsByFrameId || {};
  var siteChecklist     = ctx.siteChecklist || null;            // WIP30 (kept)
  var trimCatalogs      = ctx.trimCatalogs || null;             // WIP30 (renamed from coverTrimCatalog) — map of family→catalog
  var jobNumber         = ctx.jobNumber || projectInfo.jobNumber || projectInfo.projectNumber || '—';
  var customerName      = ctx.customerName || projectInfo.customerName || projectInfo.clientName || '—';
  var customerAddress   = ctx.customerAddress || projectInfo.siteAddress || projectInfo.customerAddress || projectInfo.address || '—';
  var customerPhone     = ctx.customerPhone || projectInfo.customerPhone || projectInfo.phone || '';
  var customerEmail     = ctx.customerEmail || projectInfo.customerEmail || projectInfo.email || '';
  var projectName       = ctx.projectName   || customerName || '';
  // WIP34: cut list (computed by computeTrimCuts in onRequestSave). Same
  // shape as msg.trimCutList in the wire payload — { cuts, byTrim, frameColours }.
  // null/undefined when not in survey mode or when no trims selected.
  var trimCutList       = ctx.trimCutList || null;
  var surveyorName      = ctx.surveyorName || projectInfo.surveyorName || '—';
  var surveyedAt        = new Date().toLocaleDateString('en-AU');

  var doc = new jsPDFCtor({ unit: 'mm', format: 'a4' });
  var pageW = 210;
  var marginL = 15, marginR = 15;
  var contentW = pageW - marginL - marginR;

  function drawLetterhead() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    _mmText(doc, 'SPARTAN DOUBLE GLAZING', marginL, 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    _mmText(doc, 'Spartan Double Glazing Pty Ltd · spartandoubleglazing.com.au', marginL, 20.5);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(marginL, 22.5, pageW - marginR, 22.5);
    doc.setTextColor(0, 0, 0);
  }

  function drawFooter(pageNum, totalPages) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    _mmText(doc, 'Spartan Double Glazing Pty Ltd · Check Measure · ' + surveyedAt, marginL, 289);
    _mmText(doc, 'Page ' + pageNum + ' of ' + totalPages, pageW - marginR, 289, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }

  function kv(label, value, x, yy) {
    doc.setFont('helvetica', 'bold');
    _mmText(doc, label, x, yy);
    doc.setFont('helvetica', 'normal');
    _mmText(doc, String(value == null ? '—' : value), x + 28, yy);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WIP34: frame schematic renderer
  // ═══════════════════════════════════════════════════════════════════════════
  // Draws an architectural elevation symbol for a frame: outer rectangle,
  // internal grid divisions (mullions/transoms from gridCols × gridRows),
  // and per-product-type opening direction symbols. All output via jsPDF
  // primitives — no rasterisation, no html2canvas. Renders crisply at any
  // PDF zoom level. Convention: triangle apex points toward the operating
  // edge (handle side); base sits on the hinge edge. Grouped product types:
  //   - fixed_window: no symbol
  //   - awning: apex bottom, base top
  //   - casement, hinged_door, entry_door, french_door: side-hinge triangle
  //   - tilt_turn: combined casement + tilt (top-hinged) triangles
  //   - double_hung: vertical sash arrows (top↓ bottom↑)
  //   - sliding family: horizontal arrows per panel
  //   - bifold: zig-zag fold pattern
  // Anything not matched renders as outline-only (safe default).
  function drawFrameSchematic(frame, boxX, boxY, maxW, maxH) {
    var fW = Number(frame.width) || 0;
    var fH = Number(frame.height) || 0;
    if (fW <= 0 || fH <= 0) return;

    // Fit to box preserving aspect ratio. Reserve 10mm right edge for
    // height label and 5mm above for width label.
    var availW = maxW - 14;
    var availH = maxH - 8;
    var s = Math.min(availW / fW, availH / fH);
    var drawW = fW * s;
    var drawH = fH * s;
    var fx = boxX + (maxW - drawW - 14) / 2 + 4;  // small left padding
    var fy = boxY + (maxH - drawH - 8) / 2 + 6;   // leave 6mm above for label

    // Outer frame
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.7);
    doc.rect(fx, fy, drawW, drawH);

    // Mullions / transoms
    var cols = Math.max(1, Number(frame.gridCols) || 1);
    var rows = Math.max(1, Number(frame.gridRows) || 1);
    doc.setLineWidth(0.5);
    var c, r;
    for (c = 1; c < cols; c++) {
      var mx = fx + (c / cols) * drawW;
      doc.line(mx, fy, mx, fy + drawH);
    }
    for (r = 1; r < rows; r++) {
      var my = fy + (r / rows) * drawH;
      doc.line(fx, my, fx + drawW, my);
    }

    // Opening indicators
    doc.setDrawColor(110, 110, 110);
    doc.setLineWidth(0.35);
    drawOpeningIndicators(frame.productType || '', fx, fy, drawW, drawH, cols, rows);
    doc.setDrawColor(0, 0, 0);

    // Dimension labels
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(70, 70, 70);
    _mmText(doc, fW + ' mm', fx + drawW / 2, fy - 1.5, { align: 'center' });
    _mmText(doc, fH + ' mm', fx + drawW + 1.5, fy + drawH / 2 + 1, { align: 'left' });
    doc.setTextColor(0, 0, 0);
  }

  function drawOpeningIndicators(productType, fx, fy, fw, fh, cols, rows) {
    var cw = fw / cols;
    var ch = fh / rows;

    function eachCell(cb) {
      for (var rr = 0; rr < rows; rr++) {
        for (var cc = 0; cc < cols; cc++) {
          cb(fx + cc * cw, fy + rr * ch, cw, ch, cc, rr);
        }
      }
    }
    function awning(cx, cy) {  // hinge top — apex bottom-center
      var apx = cx + cw / 2, apy = cy + ch * 0.92;
      doc.line(cx + cw * 0.05, cy + ch * 0.05, apx, apy);
      doc.line(cx + cw * 0.95, cy + ch * 0.05, apx, apy);
    }
    function hopper(cx, cy) {  // hinge bottom — apex top-center (used for tilt-turn tilt)
      var apx = cx + cw / 2, apy = cy + ch * 0.08;
      doc.line(cx + cw * 0.05, cy + ch * 0.95, apx, apy);
      doc.line(cx + cw * 0.95, cy + ch * 0.95, apx, apy);
    }
    function casementLeft(cx, cy) {  // hinge left — apex right-center
      var apx = cx + cw * 0.92, apy = cy + ch / 2;
      doc.line(cx + cw * 0.05, cy + ch * 0.05, apx, apy);
      doc.line(cx + cw * 0.05, cy + ch * 0.95, apx, apy);
    }
    function casementRight(cx, cy) {  // hinge right — apex left-center
      var apx = cx + cw * 0.08, apy = cy + ch / 2;
      doc.line(cx + cw * 0.95, cy + ch * 0.05, apx, apy);
      doc.line(cx + cw * 0.95, cy + ch * 0.95, apx, apy);
    }
    function hArrow(cx, cy, dir) {  // horizontal slide arrow
      var midY = cy + ch / 2;
      var startX = dir > 0 ? cx + cw * 0.2 : cx + cw * 0.8;
      var endX   = dir > 0 ? cx + cw * 0.8 : cx + cw * 0.2;
      var headLen = Math.min(cw * 0.12, 3);
      doc.line(startX, midY, endX, midY);
      doc.line(endX, midY, endX - dir * headLen, midY - headLen * 0.7);
      doc.line(endX, midY, endX - dir * headLen, midY + headLen * 0.7);
    }
    function vArrow(cx, cy, dir) {  // vertical slide arrow
      var midX = cx + cw / 2;
      var startY = dir > 0 ? cy + ch * 0.2 : cy + ch * 0.8;
      var endY   = dir > 0 ? cy + ch * 0.8 : cy + ch * 0.2;
      var headLen = Math.min(ch * 0.12, 3);
      doc.line(midX, startY, midX, endY);
      doc.line(midX, endY, midX - headLen * 0.7, endY - dir * headLen);
      doc.line(midX, endY, midX + headLen * 0.7, endY - dir * headLen);
    }

    switch (productType) {
      case 'fixed_window':
        // No operable indicator — outline + grid only.
        break;
      case 'awning_window':
        eachCell(function(cx, cy){ awning(cx, cy); });
        break;
      case 'casement_window':
        // Convention: outermost columns hinge at the outer edge (left col → left
        // hinge, right col → right hinge). Single-column always left-hinge.
        eachCell(function(cx, cy, _w, _h, c){
          if (cols === 1) { casementLeft(cx, cy); }
          else if (c === cols - 1) { casementRight(cx, cy); }
          else { casementLeft(cx, cy); }
        });
        break;
      case 'tilt_turn_window':
        // Casement (left-hinge default) + tilt (top opens inward — hopper symbol)
        eachCell(function(cx, cy){ casementLeft(cx, cy); hopper(cx, cy); });
        break;
      case 'double_hung_window':
        // Top sash slides down, bottom sash slides up. If only one row,
        // assume both sashes operable in that row's vertical span.
        eachCell(function(cx, cy, _w, _h, _c, r){
          vArrow(cx, cy, r === 0 ? 1 : -1);  // row 0 (top) → down arrow; row 1+ (bottom) → up arrow
        });
        break;
      case 'sliding_window':
      case 'sliding_door':
      case 'stacker_door':
      case 'smart_slide_door':
      case 'vario_slide_door':
      case 'lift_slide_door':
        // Horizontal slide arrows. Alternating direction across cols so multi-
        // panel stackers/sliders look distinct from single-direction.
        eachCell(function(cx, cy, _w, _h, c){
          hArrow(cx, cy, (c % 2 === 0) ? 1 : -1);
        });
        break;
      case 'bifold_door':
        // Zig-zag across columns indicating concertina fold.
        eachCell(function(cx, cy, _w, _h, c){
          if (c % 2 === 0) {
            doc.line(cx + cw * 0.05, cy + ch * 0.1, cx + cw * 0.95, cy + ch * 0.9);
          } else {
            doc.line(cx + cw * 0.05, cy + ch * 0.9, cx + cw * 0.95, cy + ch * 0.1);
          }
        });
        break;
      case 'french_door':
        // Two-leaf, each hinged at outer edge. Assumes 2 columns; if not,
        // fall back to outer-edge hinge per column position.
        eachCell(function(cx, cy, _w, _h, c){
          if (c === 0) { casementLeft(cx, cy); }
          else if (c === cols - 1) { casementRight(cx, cy); }
          else { casementLeft(cx, cy); }
        });
        break;
      case 'hinged_door':
      case 'entry_door':
        // Single leaf hinged at left by convention.
        eachCell(function(cx, cy){ casementLeft(cx, cy); });
        break;
      default:
        // Unknown product type — outline + grid only (safe fallback).
        break;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WIP34: trim cut list section renderer
  // ═══════════════════════════════════════════════════════════════════════════
  // Renders the per-trim summary table + per-cut detail table on its own page(s)
  // before the surveyor signature page. Reads ctx.trimCutList (same shape as
  // wire payload's trimCutList — see CAD_CM_AND_FINAL_PDF_HANDOFF.md §3).
  // No-op when trimCutList is missing or empty (e.g. design mode, or survey
  // with no trim selections yet).
  function renderTrimCutListSection() {
    if (!trimCutList) return;
    var byTrim = trimCutList.byTrim || {};
    var cuts = Array.isArray(trimCutList.cuts) ? trimCutList.cuts : [];
    var hasSummary = Object.keys(byTrim).length > 0;
    var hasDetail  = cuts.length > 0;
    if (!hasSummary && !hasDetail) return;

    doc.addPage();
    drawLetterhead();
    var py = 32;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    _mmText(doc, 'TRIM CUT LIST', marginL, py); py += 8;

    // ── Part A: per-trim summary ───────────────────────────────────────
    if (hasSummary) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      _mmText(doc, 'Summary by trim type', marginL, py); py += 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setFillColor(240, 240, 240);
      doc.rect(marginL, py - 4, contentW, 6, 'F');
      _mmText(doc, 'Trim',          marginL + 2,   py);
      _mmText(doc, 'Cuts',          marginL + 70,  py);
      _mmText(doc, 'Total length',  marginL + 95,  py);
      _mmText(doc, 'Bar length',    marginL + 130, py);
      _mmText(doc, 'Bars required', marginL + 158, py);
      py += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      Object.keys(byTrim).forEach(function(key) {
        var entry = byTrim[key] || {};
        if (py > 270) { doc.addPage(); drawLetterhead(); py = 32; }
        _mmText(doc, String(entry.label || key),                  marginL + 2,   py);
        _mmText(doc, String(entry.totalCuts || 0),                marginL + 70,  py);
        _mmText(doc, (entry.totalLengthMm || 0) + ' mm',          marginL + 95,  py);
        _mmText(doc, (entry.barLengthMm || 0) + ' mm',            marginL + 130, py);
        _mmText(doc, String(entry.barsRequired || 0),             marginL + 158, py);
        py += 4.5;
      });
      py += 6;
    }

    // ── Part B: per-cut detail ─────────────────────────────────────────
    if (hasDetail) {
      if (py > 245) { doc.addPage(); drawLetterhead(); py = 32; }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      _mmText(doc, 'Per-cut detail', marginL, py); py += 5;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setFillColor(240, 240, 240);
      doc.rect(marginL, py - 4, contentW, 6, 'F');
      _mmText(doc, '#',            marginL + 2,   py);
      _mmText(doc, 'Frame',        marginL + 8,   py);
      _mmText(doc, 'Surface',      marginL + 30,  py);
      _mmText(doc, 'Side',         marginL + 55,  py);
      _mmText(doc, 'Trim',         marginL + 75,  py);
      _mmText(doc, 'Length',       marginL + 130, py);
      _mmText(doc, 'Frame colour', marginL + 155, py);
      py += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      cuts.forEach(function(cut, i) {
        if (py > 280) { doc.addPage(); drawLetterhead(); py = 32; }
        var trimLabel   = (cut.trim && cut.trim.label) || '—';
        var colourLabel = (cut.frameColourExt && cut.frameColourExt.label)
                       || (cut.frameColourInt && cut.frameColourInt.label)
                       || '—';
        var surfaceLabel = cut.surface ? cut.surface.charAt(0).toUpperCase() + cut.surface.slice(1) : '—';
        var sideLabel    = cut.side ? cut.side.charAt(0).toUpperCase() + cut.side.slice(1) : '—';
        _mmText(doc, String(i + 1),                marginL + 2,   py);
        _mmText(doc, String(cut.frameName || '—'), marginL + 8,   py);
        _mmText(doc, surfaceLabel,                 marginL + 30,  py);
        _mmText(doc, sideLabel,                    marginL + 55,  py);
        _mmText(doc, trimLabel,                    marginL + 75,  py);
        _mmText(doc, (cut.lengthMm || 0) + ' mm',  marginL + 130, py);
        _mmText(doc, colourLabel,                  marginL + 155, py);
        py += 4.2;
      });
    }
  }

  // ── Page 1: title + client header + meta block + summary table ─────
  drawLetterhead();
  var y = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  _mmText(doc, 'CHECK MEASURE (REPLACEMENT)', pageW / 2, y, { align: 'center' });
  y += 9;

  // WIP32: client name as the prominent project title (no prefix, just the
  // name). Phoenix's spec: customer's name IS the project name surfaced at
  // the top of the document. Falls back to '—' if the init payload didn't
  // carry a name (standalone CAD use / smoke-test fixtures).
  doc.setFontSize(14);
  _mmText(doc, projectName || '—', pageW / 2, y, { align: 'center' });
  y += 5;

  // Divider rule under client title
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, pageW - marginR, y);
  y += 6;

  // WIP32: two-column client/job meta block. Always render all rows (with
  // '—' fallback for empty fields) so layout stays consistent regardless of
  // init data quality. Email and Site Address get full width since they're
  // typically long enough to overflow a half-column.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  var leftX = marginL;
  var rightX = marginL + contentW / 2 + 5;
  kv('Job No:',   jobNumber,                  leftX,  y);
  kv('Surveyed:', surveyedAt,                 rightX, y); y += 5;
  kv('Phone:',    customerPhone || '—',       leftX,  y);
  kv('Surveyor:', surveyorName,               rightX, y); y += 5;
  kv('Email:',    customerEmail || '—',       leftX,  y); y += 5;
  kv('Site:',     customerAddress,            leftX,  y); y += 9;

  // Summary table header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setFillColor(240, 240, 240);
  doc.rect(marginL, y - 4, contentW, 6, 'F');
  _mmText(doc, '#',          marginL + 2,   y);
  _mmText(doc, 'Frame',      marginL + 8,   y);
  _mmText(doc, 'Product',    marginL + 45,  y);
  _mmText(doc, 'Designed',   marginL + 92,  y);
  _mmText(doc, 'Measured',   marginL + 125, y);
  _mmText(doc, 'Photos',     marginL + 158, y);
  _mmText(doc, 'Notes',      marginL + 172, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  projectItems.forEach(function(f, i) {
    if (y > 270) { doc.addPage(); drawLetterhead(); y = 32; }
    var m = measurementsById[f.id] || {};
    var designed = (f.width || '—') + ' × ' + (f.height || '—');
    var mw = (typeof m.measuredWidthMm === 'number') ? m.measuredWidthMm : '—';
    var mh = (typeof m.measuredHeightMm === 'number') ? m.measuredHeightMm : '—';
    var measured = mw + ' × ' + mh;
    var photoCount = (m.photos && m.photos.length) || 0;
    var notesLine = (m.siteNotes || '').replace(/\s+/g, ' ').slice(0, 22);
    _mmText(doc, String(i + 1),                                  marginL + 2,   y);
    _mmText(doc, String(f.name || ('F' + (i+1))).slice(0, 20),   marginL + 8,   y);
    _mmText(doc, String(f.productType || '').slice(0, 22),       marginL + 45,  y);
    _mmText(doc, designed,                                       marginL + 92,  y);
    _mmText(doc, measured,                                       marginL + 125, y);
    _mmText(doc, photoCount ? String(photoCount) : '—',          marginL + 158, y);
    _mmText(doc, notesLine || '—',                               marginL + 172, y);
    y += 5;
  });

  // ── Pre-downsample all photos (async) so the detail pass is sync ────
  // WIP30: detail page emits when ANY of the WIP29 per-frame fields are
  // populated, not just photos/site-notes. This ensures the printed PDF
  // reflects what the surveyor entered in the in-app CM form.
  var hasAnyDetail = function(m) {
    if (!m) return false;
    if (m.photos && m.photos.length) return true;
    if (m.siteNotes && String(m.siteNotes).trim()) return true;
    if (m.handleColourInternal || m.handleColourExternal) return true;
    if (m.handleHeightOffsetMm || m.windowDepthMm) return true;
    if (m.revealType) return true;
    if (m.trimInternalTop || m.trimInternalLeft || m.trimInternalRight || m.trimInternalBottom) return true;
    if (m.trimExternalTop || m.trimExternalLeft || m.trimExternalRight || m.trimExternalBottom) return true;
    if (m.designChange || m.frostedGlass || m.tasOakThreshold) return true;
    return false;
  };
  var detailFrames = projectItems.filter(function(f) {
    return hasAnyDetail(measurementsById[f.id] || {});
  });

  var photoMap = {};
  for (var di = 0; di < detailFrames.length; di++) {
    var df = detailFrames[di];
    var m = measurementsById[df.id] || {};
    var photos = m.photos || [];
    var resolved = await Promise.all(photos.map(function(src) {
      return downsamplePhoto(src, 800, 0.7);
    }));
    photoMap[df.id] = resolved.filter(function(d) { return d; });
  }

  // ── Per-frame detail pages ──────────────────────────────────────────
  detailFrames.forEach(function(f) {
    var m = measurementsById[f.id] || {};
    doc.addPage();
    drawLetterhead();
    var dy = 32;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    _mmText(doc, String(f.name || ('Frame ' + f.id)), marginL, dy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    _mmText(doc, String(f.productType || ''), pageW - marginR, dy, { align: 'right' });
    dy += 7;

    doc.setFontSize(9);
    kv('Designed:', (f.width || '—') + ' × ' + (f.height || '—') + ' mm', marginL, dy);
    var mw = (typeof m.measuredWidthMm === 'number') ? m.measuredWidthMm : '—';
    var mh = (typeof m.measuredHeightMm === 'number') ? m.measuredHeightMm : '—';
    kv('Measured:', mw + ' × ' + mh + ' mm', marginL + contentW / 2 + 5, dy);
    dy += 8;

    // ─── WIP34: frame schematic ───────────────────────────────────────
    // Render an architectural elevation of the frame: outline + grid + per-
    // product-type opening direction symbol. Reserves ~62mm of vertical
    // space (centred horizontally on the page). drawFrameSchematic is a
    // closure defined in the helpers block above; bails silently if the
    // frame has no width/height (legacy frames pre-WIP, skipped cleanly).
    var schematicH = 62;
    drawFrameSchematic(f, marginL, dy, contentW, schematicH);
    dy += schematicH + 4;

    // ─── WIP30: render the WIP29 per-frame fields ─────────────────────
    // Helpers (scoped to this iteration):
    var titleCase = function(s) { return s ? (s.charAt(0).toUpperCase() + s.slice(1)) : '—'; };
    var ynLabel = function(v) { return v === 'yes' ? 'YES' : (v === 'no' ? 'NO' : '—'); };
    var revLabel = function(v) {
      if (v === 'inline')   return 'In-Line';
      if (v === 'stepped')  return 'Stepped';
      if (v === 'noreveal') return 'No Reveal';
      return '—';
    };
    var numFromTextOrNum = function(v) {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return isFinite(v) ? v : null;
      var n = Number(v);
      return isFinite(n) ? n : null;
    };
    // ─── WIP30: trim catalog label resolver ─────────────────────────────
    // Trim values may be either a TRIM_DICTIONARY code (e.g. '30 T', '92x18 SB')
    // or a catalog item id (e.g. '12x286_aludec_jetblack_5850'). When a value
    // matches a catalog id, render the human-readable colour label (e.g.
    // "Aludec Jet Black"); otherwise render the value as-is (the dictionary
    // code is already human-readable).
    var trimLabelLookup = function(val) {
      if (!val) return '—';
      if (trimCatalogs && typeof trimCatalogs === 'object') {
        var families = Object.keys(trimCatalogs);
        for (var fi = 0; fi < families.length; fi++) {
          var cat = trimCatalogs[families[fi]];
          if (!cat || !cat.items) continue;
          for (var ii = 0; ii < cat.items.length; ii++) {
            if (cat.items[ii].id === val) return cat.items[ii].colour;
          }
        }
      }
      return val;
    };

    // Block A: Hardware + reveal (5 fields, two columns)
    var anyHwLine = (m.handleColourInternal || m.handleColourExternal || m.handleHeightOffsetMm || m.windowDepthMm || m.revealType);
    if (anyHwLine) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      _mmText(doc, 'Hardware & Reveal:', marginL, dy); dy += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      var halfX = marginL + contentW / 2 + 5;
      kv('Handle (Int):', titleCase(m.handleColourInternal), marginL, dy);
      kv('Handle (Ext):', titleCase(m.handleColourExternal), halfX, dy); dy += 4.5;
      var ho = numFromTextOrNum(m.handleHeightOffsetMm);
      kv('Handle offset:', (ho == null ? '—' : (ho + ' mm')), marginL, dy);
      var wd = numFromTextOrNum(m.windowDepthMm);
      kv('Window depth:', (wd == null ? '—' : (wd + ' mm')), halfX, dy); dy += 4.5;
      kv('Reveal type:', revLabel(m.revealType), marginL, dy); dy += 6;
    }

    // Block B: Trim — internal & external (two side-by-side mini-tables)
    // Values are either TRIM_DICTIONARY codes or catalog item ids; trimLabelLookup
    // resolves catalog ids to colour labels, leaves dictionary codes as-is.
    var anyTrimInt = (m.trimInternalTop || m.trimInternalLeft || m.trimInternalRight || m.trimInternalBottom);
    var anyTrimExt = (m.trimExternalTop || m.trimExternalLeft || m.trimExternalRight || m.trimExternalBottom);
    if (anyTrimInt || anyTrimExt) {
      if (dy > 250) { doc.addPage(); drawLetterhead(); dy = 32; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      _mmText(doc, 'Trim (per side):', marginL, dy); dy += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      var colW = contentW / 2 - 3;
      // Internal column
      doc.setFont('helvetica', 'bold');
      _mmText(doc, 'Internal', marginL, dy);
      doc.setFont('helvetica', 'normal');
      var dyInt = dy + 4;
      ['Top', 'Left', 'Right', 'Bottom'].forEach(function(side) {
        var k = 'trimInternal' + side;
        kv(side + ':', trimLabelLookup(m[k]), marginL, dyInt); dyInt += 4.2;
      });
      // External column
      var extX = marginL + colW + 6;
      doc.setFont('helvetica', 'bold');
      _mmText(doc, 'External', extX, dy);
      doc.setFont('helvetica', 'normal');
      var dyExt = dy + 4;
      ['Top', 'Left', 'Right', 'Bottom'].forEach(function(side) {
        var k = 'trimExternal' + side;
        kv(side + ':', trimLabelLookup(m[k]), extX, dyExt); dyExt += 4.2;
      });
      dy = Math.max(dyInt, dyExt) + 3;
    }

    // Block D: Flags (Design Change / Frosted / Tas Oak)
    if (m.designChange || m.frostedGlass || m.tasOakThreshold) {
      if (dy > 260) { doc.addPage(); drawLetterhead(); dy = 32; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      _mmText(doc, 'Flags:', marginL, dy); dy += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      var thirdW = contentW / 3;
      kv('Design Chg:', ynLabel(m.designChange),    marginL,                  dy);
      kv('Frosted:',    ynLabel(m.frostedGlass),    marginL + thirdW,         dy);
      kv('Tas Oak:',    ynLabel(m.tasOakThreshold), marginL + 2 * thirdW,     dy);
      dy += 6;
    }

    if (m.siteNotes && m.siteNotes.trim()) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      _mmText(doc, 'Site notes:', marginL, dy); dy += 5;
      doc.setFont('helvetica', 'normal');
      var noteLines = doc.splitTextToSize(String(m.siteNotes), contentW);
      noteLines.forEach(function(line) {
        if (dy > 275) { doc.addPage(); drawLetterhead(); dy = 32; }
        _mmText(doc, line, marginL, dy); dy += 4.5;
      });
      dy += 3;
    }

    var frPhotos = photoMap[f.id] || [];
    if (frPhotos.length) {
      if (dy > 255) { doc.addPage(); drawLetterhead(); dy = 32; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      _mmText(doc, 'Photos (' + frPhotos.length + '):', marginL, dy);
      dy += 5;
      var thumbW = 42, thumbH = 32, gap = 3;
      var col = 0;
      frPhotos.forEach(function(dataUrl) {
        if (col === 4) { col = 0; dy += thumbH + gap; }
        if (dy + thumbH > 278) { doc.addPage(); drawLetterhead(); dy = 32; col = 0; }
        var px = marginL + col * (thumbW + gap);
        try {
          doc.addImage(dataUrl, 'JPEG', px, dy, thumbW, thumbH);
        } catch (e) { /* skip bad image */ }
        col++;
      });
      dy += thumbH + 5;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // WIP30: SITE CHECKLIST PAGES (mirrors generateCheckMeasureHTML site pages 1+2)
  // 7 sections, populated from the project-level siteChecklist payload. When
  // the entire siteChecklist is missing or all-blank, the pages are still
  // emitted as a printable form (so the surveyor can fill in by hand if the
  // in-app form was skipped). Filled values render bold; blanks render '—'.
  // ═══════════════════════════════════════════════════════════════════════════
  if (siteChecklist || true) {  // always render for blank-form fallback
    var sc = siteChecklist || {};
    var chkLabel = function(v) { return v === true ? '☑' : '☐'; };
    var ynBoxes = function(yes, no) {
      // Two boxes side by side; one ticked depending on string value 'yes'/'no'/''
      return chkLabel(yes) + ' YES   ' + chkLabel(no) + ' NO';
    };
    var drawCheckRow = function(x, yy, ticked, label) {
      _mmText(doc, chkLabel(ticked), x, yy);
      _mmText(doc, label, x + 5, yy);
    };

    // ─── SITE PAGE 1: Sections 1–3 ────────────────────────────────────
    doc.addPage();
    drawLetterhead();
    var py = 32;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    _mmText(doc, 'SITE CHECKLIST (page 1 of 2)', marginL, py); py += 7;

    // Ascora confirmation banner
    doc.setFontSize(9);
    doc.setFillColor(254, 243, 199); // soft amber
    doc.rect(marginL, py - 4, contentW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    _mmText(doc, 'Manually uploaded into Ascora on day of measure:', marginL + 2, py + 1);
    doc.setFont('helvetica', 'normal');
    _mmText(doc, ynBoxes(sc.ascoraUploaded === 'yes', sc.ascoraUploaded === 'no'), marginL + 105, py + 1);
    py += 10;

    // §1 ACCESS & LOGISTICS
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    _mmText(doc, '1. ACCESS & LOGISTICS', marginL, py); py += 6;
    doc.setFontSize(10); _mmText(doc, 'Vehicle & Parking', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.parking2Vans, 'Adequate parking for 2× large vans (2.4m high)'); py += 4.5;
    drawCheckRow(marginL + 4, py, sc.truck32m, 'Access available for 3.2m truck (if required)'); py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Movement Path', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.cornerCheck, 'Corner check: welded frames fit through gate / hallway'); py += 4.5;
    _mmText(doc, 'Stairs involved?  ' + ynBoxes(sc.stairsInvolved === 'yes', sc.stairsInvolved === 'no'), marginL + 4, py); py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Site Accessibility', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    _mmText(doc, 'Access straightforward?  ' + ynBoxes(sc.accessStraightforward === 'yes', sc.accessStraightforward === 'no'), marginL + 4, py); py += 5;
    if (sc.accessNotes) {
      var accessLines = doc.splitTextToSize('Notes: ' + sc.accessNotes, contentW - 4);
      accessLines.forEach(function(ln){ _mmText(doc, ln, marginL + 4, py); py += 4; });
    } else {
      doc.setDrawColor(180, 180, 180);
      doc.rect(marginL + 4, py, contentW - 8, 10);
      py += 11;
    }
    py += 2;

    // §2 EXISTING CONDITIONS & STRUCTURE
    if (py > 230) { doc.addPage(); drawLetterhead(); py = 32; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    _mmText(doc, '2. EXISTING CONDITIONS & STRUCTURE', marginL, py); py += 6;
    doc.setFontSize(10); _mmText(doc, 'Current Frame Material', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4,             py, sc.frameMaterialAluminium, 'Aluminium');
    drawCheckRow(marginL + 4 + 50,        py, sc.frameMaterialTimber,    'Timber');
    drawCheckRow(marginL + 4 + 95,        py, sc.frameMaterialSteel,     'Steel (WARNING: requires grinding)');
    py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Wall Construction', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4,             py, sc.wallBrickVeneer,    'Brick Veneer');
    drawCheckRow(marginL + 4 + 50,        py, sc.wallDoubleBrick,    'Double Brick'); py += 4.5;
    drawCheckRow(marginL + 4,             py, sc.wallWeatherboard,   'Weatherboard / Cladding');
    drawCheckRow(marginL + 4 + 65,        py, sc.wallRenderedBrick,  'Rendered Brick (render will chip)'); py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Structural Alterations', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.structuralAlteration === 'direct',      'Direct Replacement (no structural change)'); py += 4.5;
    drawCheckRow(marginL + 4, py, sc.structuralAlteration === 'enlargement', 'Opening Enlargement / Cut-out'); py += 4.5;
    if (sc.structuralNotes) {
      var sNotesL = doc.splitTextToSize('Notes: ' + sc.structuralNotes, contentW - 4);
      sNotesL.forEach(function(ln){ _mmText(doc, ln, marginL + 4, py); py += 4; });
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'The Opening', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.sillChecked,   'Sill condition: brick sill level/flat? (else allow grinding/packing)'); py += 4.5;
    drawCheckRow(marginL + 4, py, sc.lintelChecked, 'Lintel check: steel bar/brickwork rusting or sagging?'); py += 6;

    // §3 MEASUREMENTS & TOLERANCES
    if (py > 240) { doc.addPage(); drawLetterhead(); py = 32; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    _mmText(doc, '3. MEASUREMENTS & TOLERANCES', marginL, py); py += 6;
    doc.setFontSize(10); _mmText(doc, 'Sizing Checks', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.tolerance20mm,     'Tolerance: 20mm minimum allowed on H & W'); py += 4.5;
    drawCheckRow(marginL + 4, py, sc.squarenessChecked, 'Squareness: diagonals checked (>10mm out → increase tolerance)'); py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Flooring Levels', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    _mmText(doc, 'Frame lift required?  ' + ynBoxes(sc.frameLiftRequired === 'yes', sc.frameLiftRequired === 'no')
      + (sc.frameLiftRequired === 'yes' && sc.frameLiftMm ? ('   Lift: ' + sc.frameLiftMm + ' mm') : ''),
      marginL + 4, py);
    py += 5;

    // ─── SITE PAGE 2: Sections 4–7 ────────────────────────────────────
    doc.addPage();
    drawLetterhead();
    py = 32;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    _mmText(doc, 'SITE CHECKLIST (page 2 of 2)', marginL, py); py += 7;

    // §4 INTERIORS & CLASH
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    _mmText(doc, '4. INTERIORS & CLASH DETECTION', marginL, py); py += 6;
    doc.setFontSize(10); _mmText(doc, 'Window Coverings', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    _mmText(doc, 'Existing blinds/shutters fit back?  ' + ynBoxes(sc.blindsFitBack === 'yes', sc.blindsFitBack === 'no'), marginL + 4, py); py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Obstructions', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.kitchenTapsClash,    'Kitchen taps: will new sash hit the tap?'); py += 4.5;
    drawCheckRow(marginL + 4, py, sc.alarmSensorsPresent, 'Alarm sensors / reed switches present (client to remove)'); py += 6;

    // §5 PREPARATION & DOCUMENTATION
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    _mmText(doc, '5. PREPARATION & DOCUMENTATION', marginL, py); py += 6;
    doc.setFontSize(10); _mmText(doc, 'Photography (mandatory)', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.photosTaken, 'Photos taken of EVERY window (uploaded to Ascora)'); py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Waste Management', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.wasteVanLoad, 'Van load (standard removal)'); py += 4.5;
    drawCheckRow(marginL + 4, py, sc.wasteSkipBin, 'Skip bin required'); py += 4.5;
    if (sc.wasteSkipBin) {
      _mmText(doc, 'Skip bin space on site?  ' + ynBoxes(sc.skipBinSpace === 'yes', sc.skipBinSpace === 'no'), marginL + 8, py); py += 5;
    }
    py += 1;

    // §6 RESOURCING
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    _mmText(doc, '6. RESOURCING ESTIMATE', marginL, py); py += 6;
    doc.setFontSize(10); _mmText(doc, 'Heavy Lifting', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    drawCheckRow(marginL + 4, py, sc.heavyLifting === 'standard', 'Standard lift'); py += 4.5;
    drawCheckRow(marginL + 4, py, sc.heavyLifting === 'heavy',    'Heavy/oversized (extra manpower / glass suckers)'); py += 5;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); _mmText(doc, 'Estimates', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    kv('Days to complete:', sc.estDays || '—',         marginL,                 py);
    kv('Staff required:',   sc.staffRequired || '—',   marginL + contentW / 2,  py); py += 6;

    // §7 SITE NOTES / SKETCHES
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    _mmText(doc, '7. SITE NOTES / SKETCHES', marginL, py); py += 4;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
    _mmText(doc, '(Detail any brickwork issues, out-of-square openings, or client warnings)', marginL, py); py += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (sc.notes && String(sc.notes).trim()) {
      var noteL2 = doc.splitTextToSize(String(sc.notes), contentW);
      noteL2.forEach(function(ln){
        if (py > 275) { doc.addPage(); drawLetterhead(); py = 32; }
        _mmText(doc, ln, marginL, py); py += 4.5;
      });
    } else {
      // Empty box for handwritten notes
      doc.setDrawColor(180, 180, 180);
      doc.rect(marginL, py, contentW, Math.min(60, 285 - py));
    }
  }

  // ── WIP34: trim cut list section ────────────────────────────────────
  // Renders the cut list summary + per-cut detail on its own page(s) before
  // the signature page. No-op when trimCutList is missing or empty (design
  // mode, or survey with no trim selections yet) — see helper definition.
  renderTrimCutListSection();

  // ── Final page: signature block + Ascora confirmation ───────────────
  doc.addPage();
  drawLetterhead();
  var sy = 36;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  _mmText(doc, 'Surveyor & Customer Confirmation', marginL, sy); sy += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  var disclaimer = 'I confirm the measurements recorded above were taken on site on ' + surveyedAt +
    ' and have been manually uploaded into Ascora on the day of measure.';
  doc.splitTextToSize(disclaimer, contentW).forEach(function(line) {
    _mmText(doc, line, marginL, sy); sy += 5;
  });
  sy += 12;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  _mmText(doc, 'Surveyor:', marginL, sy); sy += 14;
  doc.setDrawColor(140, 140, 140); doc.setLineWidth(0.3);
  doc.line(marginL, sy, marginL + 85, sy);
  doc.line(marginL + 95, sy, marginL + 150, sy);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  _mmText(doc, 'Signature', marginL, sy + 4);
  _mmText(doc, 'Date', marginL + 95, sy + 4);
  sy += 20;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  _mmText(doc, 'Customer:', marginL, sy); sy += 14;
  doc.line(marginL, sy, marginL + 85, sy);
  doc.line(marginL + 95, sy, marginL + 150, sy);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  _mmText(doc, 'Signature', marginL, sy + 4);
  _mmText(doc, 'Date', marginL + 95, sy + 4);

  // ── Apply footers to every page ─────────────────────────────────────
  var total = doc.internal.getNumberOfPages();
  for (var p = 1; p <= total; p++) { doc.setPage(p); drawFooter(p, total); }

  return doc.output('blob');
}

