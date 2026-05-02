// ═══════════════════════════════════════════════════════════════════════════
// CUT-LIST XLSX EXPORT (spec §7.6)
// Iterates frames, runs calculateFramePrice to get the BOM array, groups by
// category → one worksheet per category. Also uploads to cad-designs bucket
// and writes the URL to designs.cut_list_url.
// ═══════════════════════════════════════════════════════════════════════════

function generateCutListXlsxWorkbook(projectItems, pc, selectedPriceList, projectName, measurementsByFrameId, appSettings) {
  if (typeof XLSX === 'undefined') throw new Error('SheetJS is not loaded');
  var wb = XLSX.utils.book_new();

  // ─── Summary sheet ─────────────────────────────────────────────────────
  var summaryRows = [
    ['Project', projectName || 'Project'],
    ['Generated', new Date().toLocaleString('en-AU')],
    ['Price list', selectedPriceList || '—'],
    ['Frame count', projectItems.length],
    [],
    ['#', 'Frame', 'Room', 'Type', 'Config', 'Width (mm)', 'Height (mm)', 'Glass', 'Qty', 'Frame $', 'Install $', 'Line Total'],
  ];
  var summaryTotal = 0;
  projectItems.forEach(function(f, idx) {
    var fp;
    try { fp = calculateFramePrice(f, pc); } catch (e) { fp = { costPrice: 0, priceListsFactory: {}, priceListsInstall: {} }; }
    var fP = (selectedPriceList && fp.priceListsFactory && fp.priceListsFactory[selectedPriceList]) || fp.costPrice || 0;
    var iP = (selectedPriceList && fp.priceListsInstall && fp.priceListsInstall[selectedPriceList]) || 0;
    summaryTotal += (fP + iP);
    summaryRows.push([
      idx + 1,
      f.name || '',
      f.room || '',
      f.productType || '',
      f.configuration || '',
      f.widthMm || 0,
      f.heightMm || 0,
      f.glassSpec || '',
      f.qty || 1,
      Number(fP.toFixed ? fP.toFixed(2) : fP),
      Number(iP.toFixed ? iP.toFixed(2) : iP),
      Number((fP + iP).toFixed(2)),
    ]);
  });
  summaryRows.push([]);
  summaryRows.push(['', '', '', '', '', '', '', '', '', '', 'Project total', Number(summaryTotal.toFixed(2))]);
  var summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  // Column widths
  summarySheet['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 },
    { wch: 11 }, { wch: 11 }, { wch: 18 }, { wch: 5 },
    { wch: 11 }, { wch: 11 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // ─── BOM sheets grouped by category ────────────────────────────────────
  // Walk every frame, collect every bom line, tag with position + frame + room.
  var allLines = [];
  projectItems.forEach(function(f, idx) {
    var fp;
    try { fp = calculateFramePrice(f, pc); } catch (e) { fp = { bom: [] }; }
    (fp.bom || []).forEach(function(ln) {
      allLines.push({
        position: idx + 1,
        frameName: f.name || ('Frame ' + (idx + 1)),
        room: f.room || '',
        category: ln.category || 'other',
        keySuffix: ln.keySuffix || '',
        label: ln.label || '',
        lenMm: ln.lenMm || 0,
        qty: ln.qty || 1,
        unitRate: ln.unitRate || ln.ratePerMetre || ln.unitCost || 0,
        lineTotal: ln.lineCost || ln.lineTotal || 0,
      });
    });
  });

  // Group by category
  var byCategory = {};
  allLines.forEach(function(ln) {
    if (!byCategory[ln.category]) byCategory[ln.category] = [];
    byCategory[ln.category].push(ln);
  });

  var categoryOrder = ['profile', 'steel', 'glass', 'bead', 'gasket', 'hardware', 'ancillaries', 'other'];
  var seen = {};
  var sheetNames = categoryOrder.filter(function(c) { return byCategory[c]; }).concat(
    Object.keys(byCategory).filter(function(c) { return categoryOrder.indexOf(c) === -1; })
  );

  sheetNames.forEach(function(cat) {
    if (seen[cat]) return; seen[cat] = true;
    var rows = [
      ['Position', 'Frame', 'Room', 'Sub-type', 'Item', 'Length (mm)', 'Qty', 'Unit Rate', 'Line Total'],
    ];
    // Secondary sort: by keySuffix (groups profiles by colour/series)
    var sorted = byCategory[cat].slice().sort(function(a, b) {
      if (a.keySuffix !== b.keySuffix) return (a.keySuffix || '').localeCompare(b.keySuffix || '');
      return a.position - b.position;
    });
    var catTotal = 0;
    sorted.forEach(function(ln) {
      catTotal += Number(ln.lineTotal) || 0;
      rows.push([
        ln.position,
        ln.frameName,
        ln.room,
        ln.keySuffix,
        ln.label,
        ln.lenMm,
        ln.qty,
        Number((Number(ln.unitRate) || 0).toFixed(4)),
        Number((Number(ln.lineTotal) || 0).toFixed(2)),
      ]);
    });
    rows.push([]);
    rows.push(['', '', '', '', '', '', '', 'Category total', Number(catTotal.toFixed(2))]);
    var sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols'] = [
      { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 32 },
      { wch: 11 }, { wch: 6 }, { wch: 11 }, { wch: 12 },
    ];
    // Sheet name max 31 chars, no invalid chars
    var sheetName = cat.charAt(0).toUpperCase() + cat.slice(1);
    sheetName = sheetName.replace(/[\\/?*\[\]:]/g, '_').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  });

  // ─── WIP30: Trim Cuts sheet ───────────────────────────────────────────
  // Per Phoenix's spec: cut length = (W or H) + 200mm allowance per side.
  // top/bottom → W+200; left/right → H+200. Aggregated by trim id/code, with
  // bars-required estimate when the trim is a catalog item with bar length.
  // Only emitted when at least one trim selection exists in measurements.
  // Caller passes measurementsByFrameId; if null, sheet is skipped silently.
  if (measurementsByFrameId && typeof measurementsByFrameId === 'object') {
    try {
      var catalogs = (pc && pc.trims) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.trims) || null;
      var tc = computeTrimCuts(projectItems, measurementsByFrameId, catalogs, 200);
      if (tc.cuts && tc.cuts.length) {
        // Per-trim summary section
        var trimRows = [
          ['Trim Cut List'],
          ['Generated', new Date().toLocaleString('en-AU')],
          ['Allowance (mm/cut)', tc.allowanceMm],
          ['Total cuts', tc.cuts.length],
          [],
          ['SUMMARY BY TRIM'],
          ['Trim', 'Catalog?', 'Cut count', 'Total length (mm)', 'Bar length (mm)', 'Bars required (coarse)'],
        ];
        Object.keys(tc.byTrim).forEach(function(k) {
          var b = tc.byTrim[k];
          trimRows.push([
            b.label,
            b.isCatalogItem ? 'YES' : 'no (legacy code)',
            b.cutCount,
            b.totalLengthMm,
            b.barLengthMm == null ? '—' : b.barLengthMm,
            b.barsRequired == null ? '—' : b.barsRequired,
          ]);
        });
        // Per-cut detail section
        trimRows.push([]);
        trimRows.push(['DETAIL — every cut, every frame']);
        trimRows.push(['#', 'Frame', 'Frame colour (Ext)', 'Frame colour (Int)', 'Surface', 'Side', 'Trim', 'Cut length (mm)']);
        tc.cuts.forEach(function(c, i) {
          trimRows.push([
            i + 1,
            c.frameName,
            (c.frameColourExt && c.frameColourExt.label) || '—',
            (c.frameColourInt && c.frameColourInt.label) || '—',
            c.surface,
            c.side,
            c.trimLabel,
            c.lengthMm,
          ]);
        });
        var trimSheet = XLSX.utils.aoa_to_sheet(trimRows);
        trimSheet['!cols'] = [
          { wch: 6 }, { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 16 },
        ];
        XLSX.utils.book_append_sheet(wb, trimSheet, 'Trim Cuts');

        // ─── WIP30: Bar Plan sheet — FFD-optimised cut sequence ──────────
        // One row per cut, grouped by trim → bar. Production cutter reads
        // top-to-bottom: load this trim id (= specific colour), cut these
        // lengths in order, mark frame name + side on each piece, end with
        // an offcut. Frame colour shown so the cutter can verify they're
        // pulling the right SKU (e.g. when a job has multiple frame finishes).
        var packedKeys = Object.keys(tc.byTrim).filter(function(k){ return tc.byTrim[k].barPlan; });
        if (packedKeys.length) {
          var bpRows = [
            ['Bar Plan — FFD-optimised cutting sequence'],
            ['Generated', new Date().toLocaleString('en-AU')],
            ['Total bars', packedKeys.reduce(function(s,k){ return s + tc.byTrim[k].barPlan.barCount; }, 0)],
            ['Saw kerf (mm)', tc.byTrim[packedKeys[0]].barPlan.kerfPerCutMm],
            ['Offcut keep threshold (mm)', tc.byTrim[packedKeys[0]].barPlan.offcutKeepMinMm],
            [],
          ];
          packedKeys.forEach(function(k){
            var b = tc.byTrim[k];
            var bp = b.barPlan;
            // Trim header row
            bpRows.push([]);
            bpRows.push(['TRIM:', b.label, '', '', 'Joint:', (b.jointStyle || 'butt').toUpperCase() + (b.jointStyle === 'mitre' ? ' 45°' : ''), 'Allowance:', (b.allowanceMm || 200) + 'mm/cut']);
            bpRows.push(['Bars required:', bp.barCount, 'Bar length (mm):', b.barLengthMm, 'Utilisation:', bp.utilisationPct + '%']);
            bpRows.push(['Total used (mm):', bp.totalUsedMm, 'Kerf (mm):', bp.totalKerfMm, 'Offcut (mm):', bp.totalOffcutMm, 'Kept offcut (mm):', bp.totalKeptOffcutMm]);
            bpRows.push([]);
            bpRows.push(['Bar #', 'Cut #', 'Length (mm)', 'Joint', 'Frame', 'Frame colour', 'Surface', 'Side', 'Bar offcut (mm)', 'Offcut kept?']);
            bp.bars.forEach(function(bar){
              bar.cuts.forEach(function(c, ci){
                bpRows.push([
                  bar.barNo,
                  ci + 1,
                  c.lengthMm,
                  c.jointStyle === 'mitre' ? 'MITRE 45°' : 'butt',
                  c.frameName,
                  (c.frameColour && c.frameColour.label) || '—',
                  c.surface,
                  c.side,
                  ci === 0 ? bar.offcutMm : '',
                  ci === 0 ? (bar.offcutKept ? 'KEEP' : 'scrap') : '',
                ]);
              });
            });
          });
          var bpSheet = XLSX.utils.aoa_to_sheet(bpRows);
          bpSheet['!cols'] = [
            { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
          ];
          XLSX.utils.book_append_sheet(wb, bpSheet, 'Bar Plan');
        }
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('Trim Cuts sheet failed (non-blocking):', e);
    }
  }

  // ─── Profile Cuts + Profile Bar Plan sheets (FFD optimiser) ────────────
  // Late-bound: addProfileCutSheetsToWorkbook lives in 22a-profile-cutlist.js
  // and registers itself on `window`. Cross-frame nesting; if the module
  // isn't loaded the cutlist still builds without these two sheets.
  try {
    var addProfile = (typeof addProfileCutSheetsToWorkbook === 'function')
      ? addProfileCutSheetsToWorkbook
      : (typeof window !== 'undefined' && window.addProfileCutSheetsToWorkbook);
    if (addProfile) addProfile(wb, projectItems, pc, appSettings);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('Profile Cut sheets failed (non-blocking):', e);
  }

  // ─── Milling / Drilling sheet (CNC operations) ─────────────────────────
  // Late-bound: addMillingSheetToWorkbook lives in 23a-milling-specs.js
  // and registers itself on `window`. If that module isn't loaded the call
  // is silently skipped — keeps the two modules decoupled.
  // measurementsByFrameId is forwarded so surveyor handle-height overrides
  // take precedence over design-time handleHeightMm in the milling positions.
  try {
    var addMilling = (typeof addMillingSheetToWorkbook === 'function')
      ? addMillingSheetToWorkbook
      : (typeof window !== 'undefined' && window.addMillingSheetToWorkbook);
    if (addMilling) addMilling(wb, projectItems, measurementsByFrameId);
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('Milling sheet failed (non-blocking):', e);
  }

  return wb;
}

function writeCutListXlsxBlob(wb) {
  var arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Upload cut-list to cad-designs bucket + update designs.cut_list_url.
async function uploadCutListXlsx(designId, blob) {
  var client = sb();
  if (!client) return null;
  try {
    var path = designId + '/cutlist_' + Date.now() + '.xlsx';
    var up = await client.storage.from('cad-designs').upload(path, blob, {
      cacheControl: '3600', upsert: false,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    if (up.error) throw up.error;
    var urlRes = client.storage.from('cad-designs').getPublicUrl(path);
    var url = urlRes.data && urlRes.data.publicUrl || null;
    if (url) {
      try {
        await client.from('designs').update({
          cut_list_url: url,
          updated_at: new Date().toISOString(),
        }).eq('id', designId);
      } catch (e) { /* non-fatal — file still uploaded */ }
    }
    return url;
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('uploadCutListXlsx failed', e);
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.sb = sb;
  window.sbConfigured = sbConfigured;
  window.sbReset = sbReset;
  window.fetchEntityContext = fetchEntityContext;
  window.updateEntityAddress = updateEntityAddress;
  window.loadOrCreateDesign = loadOrCreateDesign;
  window.saveDesignAndItems = saveDesignAndItems;
  window.flushPendingWrites = flushPendingWrites;
  window.pendingCount = pendingCount;
  window.subscribeToDesignChanges = subscribeToDesignChanges;
  window.toDesignItemRow = toDesignItemRow;
  window.designItemRowToFrame = designItemRowToFrame;
  window.contactSnapshotFor = contactSnapshotFor;
  // Check-measure:
  window.autoCalcInstallPlanning = autoCalcInstallPlanning;
  window.loadOrCreateCheckMeasure = loadOrCreateCheckMeasure;
  window.saveCheckMeasure = saveCheckMeasure;
  window.completeCheckMeasure = completeCheckMeasure;
  window.uploadCheckMeasurePhoto = uploadCheckMeasurePhoto;
  // Signature:
  window.createSignatureRequest = createSignatureRequest;
  window.loadSignatureByToken = loadSignatureByToken;
  window.submitSignature = submitSignature;
  // Finalise PDF + cut-list:
  window.generateFinalisePdfBlob = generateFinalisePdfBlob;
  window.uploadFinalisePdf = uploadFinalisePdf;
  window.generateCutListXlsxWorkbook = generateCutListXlsxWorkbook;
  window.writeCutListXlsxBlob = writeCutListXlsxBlob;
  window.uploadCutListXlsx = uploadCutListXlsx;
  // WIP30: trim cut-list computation (testable in isolation; consumed by both
  // the survey-mode inline preview and the cut-list xlsx workbook).
  window.computeTrimCuts = computeTrimCuts;
  // M6: CM / FD / Service PDFs + photo downsampling helper:
  window.generateCheckMeasurePdfBlob = generateCheckMeasurePdfBlob;
  window.generateFinalDesignPdfBlob = generateFinalDesignPdfBlob;
  window.generateServicePdfBlob = generateServicePdfBlob;
  window.downsamplePhoto = downsamplePhoto;
}

