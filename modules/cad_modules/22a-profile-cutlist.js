// ═══════════════════════════════════════════════════════════════════════════
// PROFILE CUT-LIST + FFD BAR-PACK OPTIMISER
// Cross-frame nesting of profile cuts. Aggregates every per-frame cut
// (frame perimeter, sash perimeters, mullions, threshold) across the whole
// project, groups by SKU + colour combo, and runs First-Fit-Decreasing
// bin-packing to produce a production cutter sheet.
//
// Architectural twin of 22-trim-cutlist.js. Same FFD heuristic, same
// "Bar Plan" output shape — the existing pattern users already know how
// to read from the Trim Bar Plan sheet.
//
// What's IN scope (Step 1):
//   • Outer frame profile (4 cuts per frame, 3 if hasLowThreshold)
//   • Threshold (1 cut, French/hinged doors only)
//   • Sash profile (4 cuts per sash, count from cellTypes / panelCount)
//   • Mullions (vertical + horizontal from cellTypes / transomPct)
//
// What's NOT yet (deliberate Step-1 cuts):
//   • Glazing beads — different bar lengths, per-aperture; separate module
//   • Vario-Slide cover trims, false mullions, guide rails
//   • Per-cell sash sizing in non-uniform grids (mirrors the same
//     simplification calculateFramePrice already makes)
//   • Existing-offcut-inventory awareness ("use 2400mm leftover from job 47")
//
// FFD details:
//   • Sort cuts longest-first, place each into the first bar that has
//     remaining capacity, open new bar otherwise. Standard heuristic;
//     near-optimal in practice for cut counts <500.
//   • Saw kerf consumed AFTER each cut except the last on a bar.
//   • Bar trim allowance (end-loss before usable region starts) read from
//     pricingConfig.trimAllowanceMm — matches costForPieces convention.
//   • Mitre allowance: standard practice adds ~3mm per mitred end for
//     weld penetration. NOT applied here in Step 1 — matches the existing
//     costForPieces convention so bar counts agree with the cost report.
//     If your factory needs the extra 3mm/end, raise sawKerfMm in pricing
//     config or we add a dedicated mitreAllowanceMm field next.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Cut derivation ───────────────────────────────────────────────────────
// For one frame, return a flat array of cut objects with rich metadata.
// Each cut is a single physical piece of profile that needs to come off
// a bar. Mirrors the piece breakdown calculateFramePrice feeds into
// costForPieces, but with side / member metadata preserved.
//
// Weld allowance: each mitred end consumes ~3mm of material when the welder
// fuses the corner. Cut length is therefore inflated by mitreEnds ×
// weldAllowanceMm (read from the profile catalog entry, default 3mm).
// Frame and sash perimeters get +6mm per piece (2 mitres). Mullions and
// thresholds (butt joints) get +0mm.
function deriveProfileCutsForFrame(frame, pricingConfig, appSettings) {
  if (!frame) return [];
  var pc = pricingConfig || (typeof PRICING_DEFAULTS !== 'undefined' ? PRICING_DEFAULTS : {});
  var pd = (typeof getProfileDims === 'function')
    ? getProfileDims(frame.productType)
    : { frameW: 65, sashW: 77, mullionW: 84 };

  // ─── Profile-key resolution ────────────────────────────────────────────
  // Priority order (matches Settings → Products → Profiles "Linked Products"
  // semantics):
  //   1. per-frame override (set in the editor for one specific frame)
  //   2. settings-level link (Profile Manager → tick a product type box on
  //      the profile — stored at pricingConfig.profileLinks[productType][role])
  //   3. canonical system default from profileKeysForType
  // The "source" string is carried through to the cutlist so the cutter
  // sees exactly where each profile mapping came from.
  var systemDefaults = (typeof profileKeysForType === 'function')
    ? profileKeysForType(frame.productType)
    : { frame: 'i4_frame', sash: 'i4_sash77', mullion: 'i4_mullion84' };
  var po = frame.profileOverrides || {};
  var links = (pc.profileLinks && pc.profileLinks[frame.productType]) || {};

  function resolveRole(role) {
    if (po[role])    return { key: po[role],    source: 'frame override' };
    if (links[role]) return { key: links[role], source: 'settings link' };
    return { key: systemDefaults[role], source: 'system default' };
  }

  var prkFrame   = resolveRole('frame');
  var prkSash    = resolveRole('sash');
  var prkMullion = resolveRole('mullion');

  // Vario-Slide 2-track frame override (matches calculateFramePrice). Only
  // applies when no explicit per-frame override or settings link is set.
  var isVarioSlideType = (frame.productType === 'vario_slide_door' || frame.productType === 'stacker_door');
  if (isVarioSlideType && frame.tracks === 2 && prkFrame.source === 'system default') {
    prkFrame = { key: 'vs_frame50_2t', source: 'system default (2-track)' };
  }

  // Resolve per-profile weld allowance from the catalog. Falls back to the
  // global pricingConfig.defaultWeldAllowanceMm, then to 3mm. Reading from
  // the catalog means a user-edited allowance in the profile manager flows
  // through to the cutter sheet automatically.
  function weldAllowFor(profileKey) {
    var catalog = (pc.profiles) || (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.profiles) || {};
    var entry = catalog[profileKey];
    if (entry && typeof entry.weldAllowanceMm === 'number') return entry.weldAllowanceMm;
    if (typeof pc.defaultWeldAllowanceMm === 'number') return pc.defaultWeldAllowanceMm;
    return 3;
  }

  // Resolve the per-profile sightline (frame width). Prefer the catalog
  // entry's sightlineMm — important when a user links a custom DXF-imported
  // profile with a different sightline. Falls back to PROFILE_DIMS so
  // existing system-default behaviour stays identical for users who haven't
  // linked anything.
  function sightlineFor(profileKey, fallbackMm) {
    var catalog = (pc.profiles) || (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.profiles) || {};
    var entry = catalog[profileKey];
    if (entry) {
      if (typeof entry.sightlineMm === 'number') return entry.sightlineMm;
      if (entry.bboxMm && typeof entry.bboxMm.w === 'number') return entry.bboxMm.w;
    }
    return fallbackMm;
  }

  var W = Number(frame.width) || 0;     // mm (frame outer)
  var H = Number(frame.height) || 0;
  if (W <= 0 || H <= 0) return [];

  // For dimension calc, prefer the linked frame profile's sightline if the
  // user has set a settings link or per-frame override. For the system
  // default case, keep using PROFILE_DIMS.frameW for backwards compatibility
  // with the legacy Profile sheet's numbers.
  var fwMm = (prkFrame.source === 'system default')
    ? (pd.frameW || 65)
    : sightlineFor(prkFrame.key, pd.frameW || 65);
  var hasLowThreshold = (frame.productType === 'french_door' || frame.productType === 'hinged_door');

  var cuts = [];
  var frameId = frame.id || null;
  var frameName = frame.name || '';
  var room = frame.room || '';
  var ext = frame.colour || 'white_body';
  var intCol = frame.colourInt || ext;

  function pushCut(member, side, lengthMm, profileKey, profileSource, mitreEnds, fallbackLabel) {
    if (!lengthMm || lengthMm <= 0) return;
    var baseLen = Math.round(lengthMm);
    var allowPerEnd = weldAllowFor(profileKey);
    var totalAllow = mitreEnds * allowPerEnd;
    var cutLen = baseLen + totalAllow;       // length to cut on the saw
    // Resolve a friendly profile label from the catalog so the cutter sees
    // the linked profile's name + Aluplast code instead of the internal
    // polyKey. Looks first at pricingConfig.profileCosts (where the Profile
    // Manager actually edits names/codes), then PRICING_DEFAULTS.profiles,
    // then falls back to the polyKey-based label.
    var costs = (pc.profileCosts) || {};
    var defaults = (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.profileCosts) || {};
    var entry = costs[profileKey] || defaults[profileKey];
    var label = fallbackLabel;
    if (entry && (entry.name || entry.code)) {
      var name = entry.name || profileKey;
      label = entry.code ? (name + ' (' + entry.code + ')') : name;
    }
    cuts.push({
      frameId: frameId,
      frameName: frameName,
      room: room,
      profileKey: profileKey,
      profileLabel: label,
      profileSource: profileSource,
      member: member,
      side: side,
      baseLengthMm: baseLen,
      weldAllowanceMm: totalAllow,
      lengthMm: cutLen,
      mitreEnds: mitreEnds,
      colourExt: ext,
      colourInt: intCol,
    });
  }

  // ─── Frame perimeter ──────────────────────────────────────────────────
  // 4 mitred pieces (top, bottom, left, right). For french/hinged doors the
  // bottom rail is replaced by an aluminium threshold, so PVC frame is just
  // top + 2 jambs.
  pushCut('frame', 'top',    W, prkFrame.key, prkFrame.source, 2, 'Frame ' + prkFrame.key);
  if (!hasLowThreshold) {
    pushCut('frame', 'bottom', W, prkFrame.key, prkFrame.source, 2, 'Frame ' + prkFrame.key);
  }
  pushCut('frame', 'left',  H, prkFrame.key, prkFrame.source, 2, 'Frame ' + prkFrame.key);
  pushCut('frame', 'right', H, prkFrame.key, prkFrame.source, 2, 'Frame ' + prkFrame.key);

  // ─── Threshold (alu) ──────────────────────────────────────────────────
  // Butt joint, no mitres. Sits in the place of the bottom frame rail.
  if (hasLowThreshold) {
    pushCut('threshold', 'bottom', W, 'i4_threshold_silver', 'system default', 0, 'Alu Threshold 70mm');
  }

  // ─── Sash perimeters ──────────────────────────────────────────────────
  // Count sashes from cellTypes (or panelCount fallback). Each sash =
  // 4 mitred pieces. Uniform sash sizing — same simplification as the
  // existing pricing engine. Per-cell sizing for grids with variable
  // cell dimensions is a follow-up.
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

  if (numSashes > 0) {
    // Sash opening dims. Frame opening = W − 2 × frame_sightline. The sash
    // perimeter sits inside the frame opening with a small air gap on each
    // side (frame–sash gap, measured from the assembly DXF). So:
    //   sash outer = frame opening − 2 × frame_sash_gap.
    // When no system metrics exist (gap = 0), this collapses to the legacy
    // formula sashOuter = openWMm.
    var sysMetrics = (typeof resolveSystemMetrics === 'function')
      ? resolveSystemMetrics(frame.productType, appSettings) : null;
    var fsGap = (sysMetrics && sysMetrics.frameSashGapMm != null) ? sysMetrics.frameSashGapMm : 0;
    var openWMm = W - fwMm * 2;
    var openHMm = H - fwMm * 2;
    // Apply the air gap to the sash perimeter (each side reduces by gap).
    var sashOuterW = openWMm - 2 * fsGap;
    var sashOuterH = openHMm - 2 * fsGap;
    var panelWMm = (panels > 1 && !hasGrid) ? (sashOuterW / panels) : sashOuterW;
    var panelHMm = sashOuterH;
    if (hasGrid) {
      panelWMm = sashOuterW / nCols;
      panelHMm = sashOuterH / nRows;
    }
    for (var si = 0; si < numSashes; si++) {
      var sashIdx = si + 1;
      pushCut('sash_' + sashIdx, 'top',    panelWMm, prkSash.key, prkSash.source, 2, 'Sash ' + prkSash.key);
      pushCut('sash_' + sashIdx, 'bottom', panelWMm, prkSash.key, prkSash.source, 2, 'Sash ' + prkSash.key);
      pushCut('sash_' + sashIdx, 'left',   panelHMm, prkSash.key, prkSash.source, 2, 'Sash ' + prkSash.key);
      pushCut('sash_' + sashIdx, 'right',  panelHMm, prkSash.key, prkSash.source, 2, 'Sash ' + prkSash.key);
    }
  }

  // ─── Mullions / transoms ──────────────────────────────────────────────
  // Verticals span the open height; horizontals (transoms) span the open width.
  // Joint to frame is butt (0 mitres) per standard fabrication.
  var numVMullions = hasGrid ? (nCols - 1) : (panels > 1 ? panels - 1 : 0);
  var numHMullions = hasGrid ? (nRows - 1) : 0;
  if (!hasGrid && frame.transomPct && frame.transomPct > 0.05 && frame.transomPct < 0.95) {
    numHMullions = 1;
  }
  var oH = H - fwMm * 2;
  var oW = W - fwMm * 2;
  for (var vm = 0; vm < numVMullions; vm++) {
    pushCut('mullion_v_' + (vm + 1), 'vertical', oH, prkMullion.key, prkMullion.source, 0, 'Mullion ' + prkMullion.key);
  }
  for (var hm = 0; hm < numHMullions; hm++) {
    pushCut('mullion_h_' + (hm + 1), 'horizontal', oW, prkMullion.key, prkMullion.source, 0, 'Mullion ' + prkMullion.key);
  }

  return cuts;
}

// ─── Project-wide aggregation + FFD bar-pack ──────────────────────────────
function computeProfileCuts(projectItems, pricingConfig, appSettings) {
  var pc = pricingConfig || (typeof PRICING_DEFAULTS !== 'undefined' ? PRICING_DEFAULTS : {});
  var SAW_KERF_MM = (pc.sawKerfMm != null) ? pc.sawKerfMm : 3;
  var BAR_TRIM_MM = (pc.trimAllowanceMm != null) ? pc.trimAllowanceMm : 20;  // end-loss per bar (both ends combined)
  var OFFCUT_KEEP_MIN_MM = (pc.profileOffcutKeepMinMm != null) ? pc.profileOffcutKeepMinMm : 300;

  // Resolve bar length for a given profile key. Falls back to 5850mm — the
  // standard Aluplast extrusion length — if the catalog doesn't list it.
  function barLenMmFor(profileKey) {
    var costs = (pc.profileCosts) || {};
    var e = costs[profileKey] || costs[profileKey + '_white'] || costs[profileKey + '_colour'];
    var m = e && e.barLen;
    if (typeof m === 'number' && m > 0) return Math.round(m * 1000);
    return 5850;
  }

  // Step 1 — flatten cuts across all frames.
  var cuts = [];
  (projectItems || []).forEach(function(f) {
    var fc;
    try { fc = deriveProfileCutsForFrame(f, pc, appSettings); } catch (e) { fc = []; }
    fc.forEach(function(c) { cuts.push(c); });
  });

  // Step 2 — group by profile key + colour combo. Two cuts can share a bar
  // ONLY if both the SKU and the colour finish on each face are identical.
  // (You can't run a jet-black foiled cut on a white_body bar.)
  var groups = {};
  cuts.forEach(function(c) {
    var groupKey = c.profileKey + '|' + c.colourExt + '|' + c.colourInt;
    if (!groups[groupKey]) {
      groups[groupKey] = {
        groupKey: groupKey,
        profileKey: c.profileKey,
        profileLabel: c.profileLabel,
        profileSource: c.profileSource,
        colourExt: c.colourExt,
        colourInt: c.colourInt,
        barLengthMm: barLenMmFor(c.profileKey),
        cuts: [],
      };
    }
    groups[groupKey].cuts.push(c);
  });

  // Step 3 — per-group FFD pack. Sort longest-first, place each cut into
  // the first bar with capacity, kerf-aware. Standard bin-packing.
  Object.keys(groups).forEach(function(gk) {
    var g = groups[gk];
    var usableBarMm = Math.max(0, g.barLengthMm - BAR_TRIM_MM);
    var sorted = g.cuts.slice().sort(function(a, b) { return b.lengthMm - a.lengthMm; });

    var bars = [];
    sorted.forEach(function(cut) {
      var placed = false;
      for (var bi = 0; bi < bars.length; bi++) {
        var bar = bars[bi];
        var addCost = cut.lengthMm + (bar.cuts.length > 0 ? SAW_KERF_MM : 0);
        if (bar.remainingMm >= addCost) {
          bar.cuts.push({
            frameId:         cut.frameId,
            frameName:       cut.frameName,
            room:            cut.room,
            member:          cut.member,
            side:            cut.side,
            baseLengthMm:    cut.baseLengthMm,
            weldAllowanceMm: cut.weldAllowanceMm,
            lengthMm:        cut.lengthMm,
            mitreEnds:       cut.mitreEnds,
            profileSource:   cut.profileSource,
          });
          bar.remainingMm -= addCost;
          placed = true;
          break;
        }
      }
      if (!placed) {
        bars.push({
          barNo: bars.length + 1,
          cuts: [{
            frameId:         cut.frameId,
            frameName:       cut.frameName,
            room:            cut.room,
            member:          cut.member,
            side:            cut.side,
            baseLengthMm:    cut.baseLengthMm,
            weldAllowanceMm: cut.weldAllowanceMm,
            lengthMm:        cut.lengthMm,
            mitreEnds:       cut.mitreEnds,
            profileSource:   cut.profileSource,
          }],
          remainingMm: usableBarMm - cut.lengthMm,
        });
      }
    });

    bars.forEach(function(bar) {
      bar.offcutMm = Math.max(0, bar.remainingMm);
      bar.offcutKept = bar.offcutMm >= OFFCUT_KEEP_MIN_MM;
      delete bar.remainingMm;
    });

    var totalUsedMm = bars.reduce(function(sum, bar) {
      return sum + bar.cuts.reduce(function(s, c) { return s + c.lengthMm; }, 0);
    }, 0);
    var totalKerfMm = bars.reduce(function(sum, bar) {
      return sum + Math.max(0, bar.cuts.length - 1) * SAW_KERF_MM;
    }, 0);
    var totalCapacityMm = bars.length * g.barLengthMm;
    var totalOffcutMm = bars.reduce(function(sum, bar) { return sum + bar.offcutMm; }, 0);
    var totalKeptOffcutMm = bars.reduce(function(sum, bar) {
      return sum + (bar.offcutKept ? bar.offcutMm : 0);
    }, 0);

    g.barPlan = {
      bars: bars,
      barCount: bars.length,
      totalUsedMm: totalUsedMm,
      totalKerfMm: totalKerfMm,
      totalOffcutMm: totalOffcutMm,
      totalKeptOffcutMm: totalKeptOffcutMm,
      utilisationPct: totalCapacityMm > 0 ? Math.round((totalUsedMm / totalCapacityMm) * 1000) / 10 : 0,
      kerfPerCutMm: SAW_KERF_MM,
      barTrimMm: BAR_TRIM_MM,
      offcutKeepMinMm: OFFCUT_KEEP_MIN_MM,
    };
    g.cutCount = g.cuts.length;
    g.totalLengthMm = g.cuts.reduce(function(s, c) { return s + c.lengthMm; }, 0);
    g.barsRequired = bars.length;
  });

  return {
    cuts: cuts,
    byProfile: groups,
    sawKerfMm: SAW_KERF_MM,
    barTrimMm: BAR_TRIM_MM,
    offcutKeepMinMm: OFFCUT_KEEP_MIN_MM,
  };
}

// ─── XLSX integration ──────────────────────────────────────────────────────
// Adds two sheets to an existing workbook:
//   1. "Profile Cuts" — flat detail, every cut on every frame
//   2. "Profile Bar Plan" — FFD-optimised cutting sequence, per group
// Late-bound from 23-cutlist-xlsx.js via typeof check (same pattern as
// addMillingSheetToWorkbook).
function addProfileCutSheetsToWorkbook(wb, projectItems, pricingConfig, appSettings) {
  if (typeof XLSX === 'undefined') return false;
  if (!wb || !projectItems || !projectItems.length) return false;

  var pc;
  try { pc = computeProfileCuts(projectItems, pricingConfig, appSettings); } catch (e) {
    if (typeof console !== 'undefined') console.warn('Profile cut compute failed:', e);
    return false;
  }
  if (!pc.cuts || !pc.cuts.length) return false;

  // ── Sheet 1: Profile Cuts (flat detail) ────────────────────────────────
  var detailRows = [
    ['Profile Cut List'],
    ['Generated', new Date().toLocaleString('en-AU')],
    ['Saw kerf (mm)', pc.sawKerfMm],
    ['Bar trim allowance (mm)', pc.barTrimMm],
    ['Offcut keep threshold (mm)', pc.offcutKeepMinMm],
    ['Total cuts', pc.cuts.length],
    [],
    ['SUMMARY BY PROFILE + COLOUR'],
    ['Profile', 'Source', 'Colour (Ext)', 'Colour (Int)', 'Cut count', 'Total length (mm)', 'Bar length (mm)', 'Bars required', 'Utilisation (%)'],
  ];
  Object.keys(pc.byProfile).forEach(function(gk) {
    var g = pc.byProfile[gk];
    detailRows.push([
      g.profileLabel,
      g.profileSource || 'system default',
      (g.colourExt || '').replace(/_/g, ' '),
      (g.colourInt || '').replace(/_/g, ' '),
      g.cutCount,
      g.totalLengthMm,
      g.barLengthMm,
      g.barsRequired,
      g.barPlan ? g.barPlan.utilisationPct : '—',
    ]);
  });
  detailRows.push([]);
  detailRows.push(['DETAIL — every cut, every frame']);
  detailRows.push(['Note: "Cut length" includes weld burn-off allowance for mitred pieces (frame & sash). Allowance read per profile from the profile catalog (default 3mm per mitred end → 6mm per piece).']);
  detailRows.push(['Source column shows where each profile mapping came from: "frame override" (per-frame editor), "settings link" (Profile Manager Linked Products), or "system default" (canonical mapping for product type).']);
  detailRows.push([]);
  detailRows.push(['#', 'Frame', 'Room', 'Profile', 'Source', 'Colour (Ext)', 'Colour (Int)', 'Member', 'Side', 'Finished length (mm)', 'Weld allow (mm)', 'Cut length (mm)', 'Mitre ends']);
  pc.cuts.forEach(function(c, i) {
    detailRows.push([
      i + 1,
      c.frameName,
      c.room,
      c.profileLabel,
      c.profileSource || 'system default',
      (c.colourExt || '').replace(/_/g, ' '),
      (c.colourInt || '').replace(/_/g, ' '),
      c.member,
      c.side,
      c.baseLengthMm != null ? c.baseLengthMm : c.lengthMm,
      c.weldAllowanceMm || 0,
      c.lengthMm,
      c.mitreEnds + (c.mitreEnds === 2 ? ' (45° both)' : c.mitreEnds === 1 ? ' (45° one)' : ' (butt)'),
    ]);
  });
  var detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
  detailSheet['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 14 }, { wch: 24 }, { wch: 16 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
    { wch: 14 }, { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Profile Cuts');

  // ── Sheet 2: Profile Bar Plan (FFD-optimised cutting sequence) ─────────
  var packedKeys = Object.keys(pc.byProfile).filter(function(k) { return pc.byProfile[k].barPlan; });
  if (!packedKeys.length) return true;

  var totalBars = packedKeys.reduce(function(s, k) { return s + pc.byProfile[k].barPlan.barCount; }, 0);
  var bpRows = [
    ['Profile Bar Plan — FFD-optimised cutting sequence'],
    ['Generated', new Date().toLocaleString('en-AU')],
    ['Total bars across all profile groups', totalBars],
    ['Saw kerf (mm)', pc.sawKerfMm],
    ['Bar trim allowance (mm)', pc.barTrimMm],
    ['Offcut keep threshold (mm)', pc.offcutKeepMinMm],
    ['Note', 'Cut length = finished length + weld burn-off allowance (frame & sash mitred pieces +6mm; mullions & threshold are butt cuts, +0mm).'],
    [],
  ];
  packedKeys.forEach(function(gk) {
    var g = pc.byProfile[gk];
    var bp = g.barPlan;
    bpRows.push([]);
    bpRows.push([
      'PROFILE:', g.profileLabel,
      'Source:', g.profileSource || 'system default',
      'Colour Ext:', (g.colourExt || '').replace(/_/g, ' '),
      'Colour Int:', (g.colourInt || '').replace(/_/g, ' '),
    ]);
    bpRows.push([
      'Bars required:', bp.barCount,
      'Bar length (mm):', g.barLengthMm,
      'Utilisation:', bp.utilisationPct + '%',
    ]);
    bpRows.push([
      'Total used (mm):', bp.totalUsedMm,
      'Kerf (mm):', bp.totalKerfMm,
      'Offcut (mm):', bp.totalOffcutMm,
      'Kept offcut (mm):', bp.totalKeptOffcutMm,
    ]);
    bpRows.push([]);
    bpRows.push(['Bar #', 'Cut #', 'Finished (mm)', 'Allow (mm)', 'CUT length (mm)', 'Mitre', 'Frame', 'Room', 'Member', 'Side', 'Bar offcut (mm)', 'Offcut kept?']);
    bp.bars.forEach(function(bar) {
      bar.cuts.forEach(function(c, ci) {
        var mitreLabel = c.mitreEnds === 2 ? '45° both' : c.mitreEnds === 1 ? '45° one' : 'butt';
        bpRows.push([
          bar.barNo,
          ci + 1,
          c.baseLengthMm != null ? c.baseLengthMm : c.lengthMm,
          c.weldAllowanceMm || 0,
          c.lengthMm,
          mitreLabel,
          c.frameName,
          c.room,
          c.member,
          c.side,
          ci === 0 ? bar.offcutMm : '',
          ci === 0 ? (bar.offcutKept ? 'KEEP' : 'scrap') : '',
        ]);
      });
    });
  });
  var bpSheet = XLSX.utils.aoa_to_sheet(bpRows);
  bpSheet['!cols'] = [
    { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 11 }, { wch: 16 }, { wch: 12 },
    { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, bpSheet, 'Profile Bar Plan');

  return true;
}

// ─── Window exposure for late-binding + smoke tests ────────────────────────
if (typeof window !== 'undefined') {
  window.deriveProfileCutsForFrame = deriveProfileCutsForFrame;
  window.computeProfileCuts = computeProfileCuts;
  window.addProfileCutSheetsToWorkbook = addProfileCutSheetsToWorkbook;
}
