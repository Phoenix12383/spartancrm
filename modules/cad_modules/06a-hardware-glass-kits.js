// ═══════════════════════════════════════════════════════════════════════════
// HARDWARE KIT CATALOG
// Per-product-type breakdown of what hardware components a complete window
// or door requires. Drives the "Hardware" tab in the Production view, the
// Hardware section of the cutlist export, and any future purchase-order
// generator.
//
// Each kit is a list of components with:
//   • name         — what to order from supplier
//   • code         — Siegenia / Hoppe / supplier SKU when known
//   • supplier     — typical supplier / manufacturer
//   • qty          — count per frame at base config (multiplied by sash count
//                    for "perSash" components, by 1 for "perFrame")
//   • per          — 'perSash' | 'perFrame' — multiplier basis
//   • description  — short human label for the line
//
// These figures are factory-floor reference data. For Aluplast Ideal 4000 with
// Siegenia gear, this matches a typical small-to-medium window assembly. Door
// hardware adds locks and additional hinges; sliding doors add tracks and
// rollers. The numbers below are reasonable defaults for quoting and
// production planning — confirm against the actual gear you fit before
// putting these on a purchase order.
// ═══════════════════════════════════════════════════════════════════════════
const HARDWARE_KITS = {
  awning_window: {
    label: 'Awning window kit',
    notes: 'Top-hung sash, side-friction stays, single handle.',
    components: [
      { name: 'Friction stay (pair)',          code: 'TS-300',        supplier: 'Truth/Whitco',  qty: 1, per: 'perSash', description: 'Stainless side-mount stays, sized to sash height' },
      { name: 'Cockspur handle',               code: 'CSH-W',         supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Handle + keeper plate' },
      { name: 'Restrictor (child safety)',     code: 'RS-1',          supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Optional — fit if Mode 2 child-safe' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'EPDM perimeter gasket' },
    ],
  },
  casement_window: {
    label: 'Casement window kit',
    notes: 'Side-hung sash, friction stays, espagnolette lock.',
    components: [
      { name: 'Friction stay (pair)',          code: 'TS-400',        supplier: 'Truth/Whitco',  qty: 1, per: 'perSash', description: 'Heavy-duty stays for side-hung' },
      { name: 'Espag lock + handle',           code: 'ESP-W',         supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Single-point espag, key-locking option' },
      { name: 'Strike plate',                  code: 'SP-1',          supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Frame-side strike' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'EPDM perimeter gasket' },
    ],
  },
  tilt_turn_window: {
    label: 'Tilt & Turn window kit',
    notes: 'Siegenia DIN 18267 gear set — verify backplate / pitch against actual gear family.',
    components: [
      { name: 'TBT handle + spindle',          code: 'SI-TBT-H',      supplier: 'Siegenia',      qty: 1, per: 'perSash', description: '7mm spindle, white/silver/anthracite' },
      { name: 'Gearbox (handle stile)',        code: 'SI-GBX-S',      supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Centre lock unit, height-adjustable' },
      { name: 'Top corner drive',              code: 'SI-TCD',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Connects handle stile to head transmission' },
      { name: 'Bottom corner drive',           code: 'SI-BCD',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Connects handle stile to sill transmission' },
      { name: 'Top hinge (head)',              code: 'SI-TH',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Tilt hinge at sash head' },
      { name: 'Bottom corner hinge',           code: 'SI-BCH',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Turn hinge at hinge stile / sill corner' },
      { name: 'Striker plate set (4)',         code: 'SI-STR-4',      supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Frame-side strikers — 4 typical for 1.2m sash' },
      { name: 'Restrictor (limiter)',          code: 'SI-RS',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Optional — opening limiter' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'EPDM perimeter gasket' },
    ],
  },
  fixed_window: {
    label: 'Fixed window kit',
    notes: 'No moving hardware — gasket and glazing-bead clips only.',
    components: [
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
      { name: 'Glazing packers (set)',         code: 'GP-SET',        supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'Bridge / location packers for DGU' },
    ],
  },
  sliding_window: {
    label: 'Sliding window kit',
    notes: '2-track or 3-track horizontal sliding sash.',
    components: [
      { name: 'Bottom roller (pair)',          code: 'SW-BR',         supplier: 'Yale/Whitco',   qty: 1, per: 'perSash', description: 'Wheel carriage, height-adjustable' },
      { name: 'Top guide',                     code: 'SW-TG',         supplier: 'Yale/Whitco',   qty: 1, per: 'perSash', description: 'Top channel guide' },
      { name: 'Sliding sash lock',             code: 'SW-LOCK',       supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Snib + keeper' },
      { name: 'Pull handle',                   code: 'SW-PH',         supplier: 'Whitco',        qty: 1, per: 'perSash', description: 'Recessed or surface-mount' },
      { name: 'Anti-lift block',               code: 'SW-ALB',        supplier: 'Whitco',        qty: 2, per: 'perSash', description: 'Prevents sash being lifted from outside' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  french_door: {
    label: 'French door kit',
    notes: 'Active + passive leaf, multipoint lock on active, shoot bolts on passive.',
    components: [
      { name: 'Multipoint lock body',          code: 'MP-3PT',        supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Active leaf — 3-point or 5-point' },
      { name: 'Lever handle pair',             code: 'LVR-PR',        supplier: 'Hoppe',         qty: 1, per: 'perFrame', description: 'Internal + external on active leaf' },
      { name: 'Shoot bolt set (top + btm)',    code: 'SHB-SET',       supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Passive leaf flush bolts' },
      { name: 'Door hinge (3-knuckle)',        code: 'DH-3K',         supplier: 'Roto/Maco',     qty: 3, per: 'perSash', description: '3 hinges per leaf for 2.1m doors' },
      { name: 'Strike plate set',              code: 'SP-FR',         supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Lock + shoot-bolt strikes' },
      { name: 'Threshold connector pair',      code: '446071',        supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'L+R end caps for alu threshold' },
      { name: 'Cylinder (euro)',               code: 'CYL-EU',        supplier: 'Lockwood',      qty: 1, per: 'perFrame', description: 'Keyed both sides' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  hinged_door: {
    label: 'Hinged door kit',
    notes: 'Single leaf, multipoint lock, lever set, 3 hinges.',
    components: [
      { name: 'Multipoint lock body',          code: 'MP-3PT',        supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: '3-point or 5-point' },
      { name: 'Lever handle pair',             code: 'LVR-PR',        supplier: 'Hoppe',         qty: 1, per: 'perFrame', description: 'Internal + external' },
      { name: 'Door hinge (3-knuckle)',        code: 'DH-3K',         supplier: 'Roto/Maco',     qty: 3, per: 'perFrame', description: '3 hinges per leaf' },
      { name: 'Strike plate',                  code: 'SP-HD',         supplier: 'Roto/Maco',     qty: 1, per: 'perFrame', description: 'Lock keeper' },
      { name: 'Threshold connector pair',      code: '446071',        supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'L+R end caps for alu threshold' },
      { name: 'Cylinder (euro)',               code: 'CYL-EU',        supplier: 'Lockwood',      qty: 1, per: 'perFrame', description: 'Keyed both sides' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  bifold_door: {
    label: 'Bifold door kit',
    notes: 'Top-hung folding sash track + carriers per leaf.',
    components: [
      { name: 'Top track + bottom guide',      code: 'BF-TRACK',      supplier: 'SunFold',       qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Carrier wheel (pair per leaf)', code: 'BF-CW',         supplier: 'SunFold',       qty: 1, per: 'perSash', description: 'Top + bottom rollers per leaf' },
      { name: 'Hinge set (sash-to-sash)',      code: 'BF-HINGE',      supplier: 'SunFold',       qty: 2, per: 'perSash', description: '2 inter-leaf hinges per leaf' },
      { name: 'Multipoint lock (master leaf)', code: 'BF-MP',         supplier: 'SunFold',       qty: 1, per: 'perFrame', description: 'On the locking-master leaf' },
      { name: 'Lever handle pair (master)',    code: 'BF-LVR',        supplier: 'Hoppe',         qty: 1, per: 'perFrame', description: 'Master leaf only' },
      { name: 'Shoot bolt (slave leaves)',     code: 'BF-SHB',        supplier: 'SunFold',       qty: 1, per: 'perSash', description: 'Each non-master leaf' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  lift_slide_door: {
    label: 'Lift & Slide (HST85) kit',
    notes: 'Siegenia HS-Portal gear — heavy lift mechanism, large opening sashes.',
    components: [
      { name: 'HS-Portal gearbox',             code: 'SI-HSP',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Lift mechanism + lock' },
      { name: 'HS handle (large)',             code: 'SI-HSH',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Lift-slide handle, 200mm' },
      { name: 'Trolley carriage (pair)',       code: 'SI-HST',        supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Twin-roller heavy carriage' },
      { name: 'Track (alu, cut to size)',      code: 'SI-TRK',        supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Bottom rolling track' },
      { name: 'Top guide rail',                code: 'SI-TGR',        supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Top guide' },
      { name: 'End cap pair',                  code: 'SI-EC',         supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Track end caps L+R' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  smart_slide_door: {
    label: 'Smart-Slide door kit',
    notes: 'Light-medium sliding system with PSK option.',
    components: [
      { name: 'Sliding handle + lock',         code: 'SS-HL',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Surface-mount lever, key option' },
      { name: 'Bottom roller carriage',        code: 'SS-RC',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Adjustable carriage' },
      { name: 'Top guide',                     code: 'SS-TG',         supplier: 'Siegenia',      qty: 1, per: 'perSash', description: 'Top channel guide' },
      { name: 'Track (alu)',                   code: 'SS-TRK',        supplier: 'Siegenia',      qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  vario_slide_door: {
    label: 'Vario-Slide door kit',
    notes: '3-track configurable sliding panel system.',
    components: [
      { name: 'Vario handle set',              code: 'VS-H',          supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Recessed pull + lock' },
      { name: 'Roller carriage',               code: 'VS-RC',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Per moving panel' },
      { name: 'Top guide',                     code: 'VS-TG',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Top guide block per panel' },
      { name: 'Track (3-channel alu)',         code: 'VS-TRK3',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Interlock seal',                code: 'VS-IL',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Brush + fin seal between panels' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
  stacker_door: {
    label: 'Stacker door kit',
    notes: 'Stacking sliding panels — same gear as Vario-Slide with additional carriages.',
    components: [
      { name: 'Stacker handle set',            code: 'ST-H',          supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Recessed pull + lock' },
      { name: 'Roller carriage',               code: 'ST-RC',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Per stacking panel' },
      { name: 'Top guide',                     code: 'ST-TG',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Per panel' },
      { name: 'Track (3-channel alu)',         code: 'ST-TRK3',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'Cut to opening width' },
      { name: 'Interlock seal',                code: 'ST-IL',         supplier: 'Aluplast',      qty: 1, per: 'perSash', description: 'Brush + fin seal' },
      { name: 'Wedge gasket roll',             code: 'WG-EPDM',       supplier: 'Aluplast',      qty: 1, per: 'perFrame', description: 'EPDM perimeter gasket' },
    ],
  },
};

// Resolve the hardware kit for a frame, multiplying perSash components by sash count.
// Returns an array of resolved line items: { name, code, supplier, qty, description }.
function resolveHardwareForFrame(frame) {
  if (!frame || !frame.productType) return [];
  var kit = HARDWARE_KITS[frame.productType];
  if (!kit) return [];
  // Sash count — same convention as deriveProfileCutsForFrame
  var ct = frame.cellTypes;
  var nRows = (ct && ct.length) ? ct.length : 1;
  var nCols = (ct && ct[0] && ct[0].length) ? ct[0].length : 1;
  var hasGrid = nRows > 1 || nCols > 1;
  var panels = frame.panelCount || 1;
  var numSashes = (frame.productType === 'fixed_window') ? 0 : panels;
  if (hasGrid) {
    numSashes = 0;
    for (var rr = 0; rr < nRows; rr++) {
      for (var cc = 0; cc < nCols; cc++) {
        var cell = ct[rr][cc];
        if (cell && cell !== 'fixed' && cell !== 'solid') numSashes++;
      }
    }
  }
  return (kit.components || []).map(function(c) {
    var multiplier = (c.per === 'perSash') ? Math.max(1, numSashes) : 1;
    return {
      name: c.name,
      code: c.code,
      supplier: c.supplier,
      qty: c.qty * multiplier,
      per: c.per,
      description: c.description,
    };
  });
}

// Aggregate hardware across the whole project — sums qtys for identical SKUs.
// Returns { byCode: { ... }, items: [ ... ], byFrame: [ ... ] }.
function aggregateHardwareForProject(projectItems) {
  var byCode = {};
  var byFrame = [];
  (projectItems || []).forEach(function(f) {
    var lines = resolveHardwareForFrame(f);
    var qty = Number(f.qty) || 1;
    var byFrameLines = [];
    lines.forEach(function(c) {
      var totalQty = c.qty * qty;
      var key = c.code || c.name;
      if (!byCode[key]) {
        byCode[key] = {
          name: c.name, code: c.code, supplier: c.supplier,
          qty: 0, description: c.description,
        };
      }
      byCode[key].qty += totalQty;
      byFrameLines.push(Object.assign({}, c, { qty: totalQty }));
    });
    byFrame.push({
      frameId: f.id, frameName: f.name, room: f.room,
      productType: f.productType, qty: qty,
      kitLabel: (HARDWARE_KITS[f.productType] && HARDWARE_KITS[f.productType].label) || f.productType,
      kitNotes: (HARDWARE_KITS[f.productType] && HARDWARE_KITS[f.productType].notes) || '',
      lines: byFrameLines,
    });
  });
  var items = Object.keys(byCode).map(function(k){ return byCode[k]; });
  items.sort(function(a, b){ return (a.supplier || '').localeCompare(b.supplier || '') || a.name.localeCompare(b.name); });
  return { byCode: byCode, items: items, byFrame: byFrame };
}

// Resolve glass requirements for a frame. One row per cell that has glazing.
// Each row: { aperture, paneWidthMm, paneHeightMm, areaM2, spec, frame, room, qty }.
//
// Sizing assumes:
//   • For sashed cells: pane = sash inner = (cellW − 2*sashSightline) − 2*glazingRebate
//   • For fixed cells: pane = (cellW − 2*frameSightline) for unglazed-edge fixed
//   • Default glazing rebate ~14mm per side (DGU sits in 14mm deep rebate, with
//     ~3mm glass-to-bead clearance built in per AS 1288).
function resolveGlassForFrame(frame, pricingConfig, appSettings) {
  if (!frame) return [];
  var pc = pricingConfig || (typeof PRICING_DEFAULTS !== 'undefined' ? PRICING_DEFAULTS : {});
  var pd = (typeof getResolvedProfileDims === 'function')
    ? getResolvedProfileDims(frame.productType, pc, frame.profileOverrides || null)
    : (typeof getProfileDims === 'function' ? getProfileDims(frame.productType) : { frameW: 70, sashW: 77, mullionW: 84, glazingRebate: 14 });
  // ─── System metrics (from Settings → Products → Window systems) ─────────
  // When a system DXF has been uploaded, its measured / overridden metrics
  // take precedence over the catalog fallbacks. fwMm and swMm are taken
  // from the system; if missing, fall back to PROFILE_DIMS or catalog data.
  var sys = (typeof resolveSystemMetrics === 'function')
    ? resolveSystemMetrics(frame.productType, appSettings) : null;
  var fwMm = (sys && sys.frameSightlineMm) || pd.frameW || 70;
  var swMm = (sys && sys.sashSightlineMm)  || pd.sashW  || 77;
  var mwMm = pd.mullionW || 84;
  var frameSashGapMm     = (sys && sys.frameSashGapMm     != null) ? sys.frameSashGapMm     : 0;
  var paneClearance      = (sys && sys.sashGlassClearanceMm != null) ? sys.sashGlassClearanceMm : 6;
  var W = Number(frame.width) || 0;
  var H = Number(frame.height) || 0;
  if (W <= 0 || H <= 0) return [];

  var glassEntry = (pc.glassCosts && pc.glassCosts[frame.glassSpec]) || null;
  var glassLabel = (glassEntry && glassEntry.name) || (frame.glassSpec || 'unspecified');

  var ct = frame.cellTypes;
  var nRows = (ct && ct.length) ? ct.length : 1;
  var nCols = (ct && ct[0] && ct[0].length) ? ct[0].length : 1;
  var hasGrid = nRows > 1 || nCols > 1;
  var panels = frame.panelCount || 1;

  var openWMm = W - fwMm * 2;
  var openHMm = H - fwMm * 2;
  var rows = [];

  function emitPane(label, isSashed, cellW, cellH) {
    if (cellW <= 0 || cellH <= 0) return;
    // Sashed cells: pane sits inside sash, which sits inside frame opening.
    //   sash outer = cell − 2 × frameSashGap (the air gap at the gasket line)
    //   pane       = sash outer − 2 × sashSightline − sashGlassClearance
    // Fixed cells: pane sits directly inside frame.
    var paneW, paneH;
    if (isSashed) {
      var sashOuterW = cellW - 2 * frameSashGapMm;
      var sashOuterH = cellH - 2 * frameSashGapMm;
      paneW = sashOuterW - swMm * 2 - paneClearance;
      paneH = sashOuterH - swMm * 2 - paneClearance;
    } else {
      paneW = cellW - paneClearance;
      paneH = cellH - paneClearance;
    }
    paneW = Math.max(1, Math.round(paneW));
    paneH = Math.max(1, Math.round(paneH));
    rows.push({
      aperture: label,
      paneWidthMm: paneW,
      paneHeightMm: paneH,
      areaM2: +((paneW * paneH) / 1e6).toFixed(3),
      spec: frame.glassSpec || 'unspecified',
      specLabel: glassLabel,
      isSashed: isSashed,
      systemLabel: sys ? sys._productType : null,
    });
  }

  if (hasGrid) {
    // Grid: cells split openW/openH minus mullions
    var cellW = (openWMm - (nCols - 1) * mwMm) / nCols;
    var cellH = (openHMm - (nRows - 1) * mwMm) / nRows;
    for (var r = 0; r < nRows; r++) {
      for (var c = 0; c < nCols; c++) {
        var cell = ct[r][c];
        if (!cell || cell === 'solid') continue;
        var isSashed = (cell !== 'fixed');
        emitPane('R' + (r+1) + 'C' + (c+1) + ' (' + cell + ')', isSashed, cellW, cellH);
      }
    }
  } else if (frame.productType === 'fixed_window') {
    emitPane('Single fixed', false, openWMm, openHMm);
  } else {
    // Single-cell openable: count from panelCount
    var hasLowThreshold = (frame.productType === 'french_door' || frame.productType === 'hinged_door');
    var paneOpenH = hasLowThreshold ? (H - fwMm) : openHMm;
    var paneCellW = (panels > 1) ? ((openWMm - (panels - 1) * mwMm) / panels) : openWMm;
    for (var pi = 0; pi < panels; pi++) {
      emitPane('Sash ' + (pi+1), true, paneCellW, paneOpenH);
    }
  }
  return rows;
}

// Aggregate glass across the whole project — same shape as hardware aggregator.
// Groups identical W×H×spec combinations and sums quantities.
function aggregateGlassForProject(projectItems, pricingConfig, appSettings) {
  var byKey = {};
  var byFrame = [];
  var totalAreaM2 = 0;
  (projectItems || []).forEach(function(f) {
    var rows = resolveGlassForFrame(f, pricingConfig, appSettings);
    var qty = Number(f.qty) || 1;
    var byFrameRows = [];
    rows.forEach(function(p) {
      var key = p.spec + '|' + p.paneWidthMm + 'x' + p.paneHeightMm;
      if (!byKey[key]) {
        byKey[key] = {
          spec: p.spec, specLabel: p.specLabel,
          paneWidthMm: p.paneWidthMm, paneHeightMm: p.paneHeightMm,
          qty: 0, areaM2: 0,
        };
      }
      byKey[key].qty += qty;
      byKey[key].areaM2 = +((byKey[key].qty * p.areaM2)).toFixed(3);
      totalAreaM2 += p.areaM2 * qty;
      byFrameRows.push(Object.assign({}, p, { qty: qty }));
    });
    byFrame.push({
      frameId: f.id, frameName: f.name, room: f.room,
      productType: f.productType, qty: qty,
      glassSpec: f.glassSpec || 'unspecified',
      panes: byFrameRows,
    });
  });
  var items = Object.keys(byKey).map(function(k){ return byKey[k]; });
  items.sort(function(a, b){
    if (a.spec !== b.spec) return (a.spec || '').localeCompare(b.spec || '');
    if (a.paneWidthMm !== b.paneWidthMm) return b.paneWidthMm - a.paneWidthMm;
    return b.paneHeightMm - a.paneHeightMm;
  });
  return { byKey: byKey, items: items, byFrame: byFrame, totalAreaM2: +totalAreaM2.toFixed(3) };
}

// ─── resolveProductAssembly / resolveSystemMetrics ─────────────────────────
// Look up a frame's product-type assembly entry in appSettings and return
// the effective metrics (override beats extracted). Returns null when no
// entry exists for the product type — caller falls back to legacy formulas.
//
// Returns:
//   { frameSightlineMm, frameDepthMm, sashSightlineMm, sashDepthMm,
//     frameSashGapMm, glassRebateDepthMm, glassRebateHeightMm,
//     glazingPackerThicknessMm, sashGlassClearanceMm, _productTypeLabel }
//
// resolveSystemMetrics is kept as a back-compat alias so existing call
// sites don't need to change.
function resolveProductAssembly(productType, appSettings) {
  if (!productType || !appSettings) return null;
  var ptaMap = appSettings.productTypeAssemblies || {};
  var entry = ptaMap[productType];
  if (!entry) return null;
  var ex = entry.metricsExtracted || {};
  var ov = entry.metricsOverride || {};
  function eff(k) { return (ov[k] != null) ? ov[k] : (ex[k] != null ? ex[k] : null); }
  return {
    frameSightlineMm:         eff('frameSightlineMm'),
    frameDepthMm:             eff('frameDepthMm'),
    sashSightlineMm:          eff('sashSightlineMm'),
    sashDepthMm:              eff('sashDepthMm'),
    frameSashGapMm:           eff('frameSashGapMm'),
    glassRebateDepthMm:       eff('glassRebateDepthMm'),
    glassRebateHeightMm:      eff('glassRebateHeightMm'),
    glazingPackerThicknessMm: eff('glazingPackerThicknessMm'),
    sashGlassClearanceMm:     eff('sashGlassClearanceMm'),
    _productType:             productType,
  };
}
// Back-compat alias for callers that haven't been renamed.
function resolveSystemMetrics(productType, appSettings) {
  return resolveProductAssembly(productType, appSettings);
}

if (typeof window !== 'undefined') {
  window.HARDWARE_KITS = HARDWARE_KITS;
  window.resolveHardwareForFrame = resolveHardwareForFrame;
  window.aggregateHardwareForProject = aggregateHardwareForProject;
  window.resolveGlassForFrame = resolveGlassForFrame;
  window.aggregateGlassForProject = aggregateGlassForProject;
  window.resolveProductAssembly = resolveProductAssembly;
  window.resolveSystemMetrics = resolveSystemMetrics;
}
