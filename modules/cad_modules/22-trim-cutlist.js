// ═══════════════════════════════════════════════════════════════════════════
// WIP30: TRIM CUT-LIST COMPUTATION (Phoenix's spec)
// Per-side cut formula:
//   - top / bottom side  →  cut length = frame.width  + 200 mm allowance
//   - left / right side  →  cut length = frame.height + 200 mm allowance
// Allowance is fixed at 200mm per cut (Phoenix's spec) — covers mitre overhang
// + trimming. Applies uniformly whether the trim selection is a TRIM_DICTIONARY
// code (e.g. '30 T', '92x18 SB') or a catalog item id (e.g.
// '12x286_aludec_jetblack_5850').
//
// Returns:
//   {
//     cuts: [
//       { frameId, frameName, surface:'internal'|'external', side, lengthMm,
//         trimValue, trimLabel, isCatalogItem, catalogId, colour, lengthBarMm }
//     ],
//     byTrim: {
//       <trimValue>: {
//         label, isCatalogItem, totalLengthMm, cutCount,
//         barLengthMm, // null for dictionary codes (no catalog)
//         barsRequired, // null for dictionary codes
//         cuts: [<same shape as cuts above>],
//       }
//     },
//   }
//
// Bar yield: when the trim is a catalog item, divide totalLengthMm by
// barLengthMm (rounded up) to get a coarse "bars required" estimate. This is
// not a true FFD pack — that's WIP31 — but gives a good first-cut number for
// ordering. Dictionary codes have no bar length, so barsRequired stays null.
//
// projectItems:           the frames array (or items with width/height, or
//                         widthMm/heightMm — both shapes accepted)
// measurementsByFrameId:  the live or hydrated measurements map
// trimCatalogs:           pricingConfig.trims (map of family→catalog) or null
// allowanceMm:            override the 200mm allowance (default 200)
// ═══════════════════════════════════════════════════════════════════════════
function computeTrimCuts(projectItems, measurementsByFrameId, trimCatalogs, allowanceMm, appSettings) {
  var allow = (typeof allowanceMm === 'number' && isFinite(allowanceMm)) ? allowanceMm : 200;
  var items = Array.isArray(projectItems) ? projectItems : [];
  var byId = measurementsByFrameId || {};
  // Build catalog lookup index: { catalogItemId: { colour, lengthMm, ... } }
  var catalogIndex = {};
  if (trimCatalogs && typeof trimCatalogs === 'object') {
    Object.keys(trimCatalogs).forEach(function(famKey) {
      var cat = trimCatalogs[famKey];
      if (!cat || !cat.items) return;
      cat.items.forEach(function(it) {
        catalogIndex[it.id] = Object.assign({}, it, { _family: famKey });
      });
    });
  }
  // WIP30: dictionary→catalog-family map. When a TRIM_DICTIONARY entry has a
  // `defaultCatalogFamily` (e.g. '30 T' → 'coverMouldings'), generic-code cuts
  // are still packable: we use that catalog's first available bar length as
  // the FFD reference. The cut stays grouped under the dictionary code (the
  // colour isn't decided yet), but the bar plan still computes.
  var dictCatalogMap = {};   // { '30 T': { barLengthMm: 6000, family: 'coverMouldings' } }
  if (typeof TRIM_DICTIONARY !== 'undefined' && Array.isArray(TRIM_DICTIONARY) && trimCatalogs) {
    TRIM_DICTIONARY.forEach(function(grp) {
      (grp.options || []).forEach(function(opt) {
        if (!opt.defaultCatalogFamily) return;
        var fam = trimCatalogs[opt.defaultCatalogFamily];
        if (!fam || !fam.items) return;
        // Use the first available item's bar length (catalogs typically have
        // consistent bar lengths within a family — Aluplast 12x286 ships in
        // 5850 and 6000 mm; either works as a packing reference).
        var ref = null;
        for (var i = 0; i < fam.items.length; i++) {
          if (fam.items[i].availability !== 'discontinued') { ref = fam.items[i]; break; }
        }
        if (ref) {
          dictCatalogMap[opt.code] = {
            barLengthMm: ref.lengthMm,
            family: opt.defaultCatalogFamily,
            familyLabel: fam.description || opt.defaultCatalogFamily,
          };
        }
      });
    });
  }
  // ─── WIP30+: REVEAL SKU INDEX ─────────────────────────────────────────
  // Reveals are NOT in TRIM_DICTIONARY — they're selected via the survey-
  // mode Reveal Type radios (In-Line / Stepped) plus Window Depth, and the
  // software picks the smallest stock width that's wide enough to be ripped
  // down to the required rip dimension. We precompute a sorted index of
  // available reveal SKUs once (cheap — there are only a handful) and use
  // it in the per-frame reveal pass below.
  var revealSkus = [];
  if (trimCatalogs && typeof trimCatalogs === 'object') {
    Object.keys(trimCatalogs).forEach(function(famKey) {
      if (famKey.indexOf('reveals') !== 0) return;
      var fam = trimCatalogs[famKey];
      if (!fam || !fam.items || !fam.items.length) return;
      // Per-row entries — each non-discontinued item is registered as a
      // separate pickable SKU. Effective width is item.widthMm when set,
      // otherwise falls back to family.crossSection.widthMm. This means:
      //   • Families with one item + family-level crossSection still work
      //     (the legacy single-SKU-per-family case).
      //   • Multi-item families now get per-row width discrimination so
      //     the auto-picker can choose between SKU-level rip widths.
      var famDefaultW = (fam.crossSection && fam.crossSection.widthMm) || null;
      var famDefaultT = (fam.crossSection && fam.crossSection.thicknessMm) || null;
      fam.items.forEach(function(it) {
        if (it.availability === 'discontinued') return;
        var effW = (typeof it.widthMm === 'number' && isFinite(it.widthMm)) ? it.widthMm : famDefaultW;
        var effT = (typeof it.thicknessMm === 'number' && isFinite(it.thicknessMm)) ? it.thicknessMm : famDefaultT;
        if (!effW) return;  // can't pick without a width
        revealSkus.push({
          famKey:         famKey,
          familyLabel:    fam.description || famKey,
          widthMm:        effW,
          thicknessMm:    effT,
          itemId:         it.id,
          sku:            it.sku,
          lengthMm:       it.lengthMm,
          isCustomOrder:  !!(fam.isCustomOrder || it.isCustomOrder),
        });
      });
    });
    revealSkus.sort(function(a, b) { return a.widthMm - b.widthMm; });
  }
  function pickRevealSku(ripWidthMm) {
    // First-fit on the sorted list — smallest SKU whose widthMm is wide
    // enough to be ripped to ripWidthMm. Returns null if nothing fits.
    for (var i = 0; i < revealSkus.length; i++) {
      if (revealSkus[i].widthMm >= ripWidthMm) return revealSkus[i];
    }
    return null;
  }
  // Frame-colour resolver: frame.colour / frame.colourInt are colour IDs that
  // map to COLOURS[].label. Falls back to 'White' when unset, mirrors the
  // CAD Spec panel display logic.
  var COLOURS_LIST = (typeof COLOURS !== 'undefined' ? COLOURS : []) || [];
  var resolveColour = function(id) {
    if (!id) return { id: null, label: 'White' };
    for (var i = 0; i < COLOURS_LIST.length; i++) {
      if (COLOURS_LIST[i].id === id) return { id: id, label: COLOURS_LIST[i].label };
    }
    var pretty = String(id).replace(/_/g,' ').replace(/\b\w/g, function(c){return c.toUpperCase();});
    return { id: id, label: pretty };
  };
  var cuts = [];
  var sideMap = ['top', 'left', 'right', 'bottom'];
  var surfaces = [
    { surface:'internal', keyPrefix:'trimInternal' },
    { surface:'external', keyPrefix:'trimExternal' },
  ];
  // Per-frame colour map keyed by frameId — used for cross-references in the
  // wire shape so the CRM doesn't have to re-resolve from the items list.
  var frameColours = {};
  items.forEach(function(f) {
    var m = byId[f.id] || {};
    var w = (typeof m.measuredWidthMm === 'number' && m.measuredWidthMm > 0) ? m.measuredWidthMm
          : (typeof f.widthMm === 'number' ? f.widthMm : (typeof f.width === 'number' ? f.width : 0));
    var h = (typeof m.measuredHeightMm === 'number' && m.measuredHeightMm > 0) ? m.measuredHeightMm
          : (typeof f.heightMm === 'number' ? f.heightMm : (typeof f.height === 'number' ? f.height : 0));
    if (!w || !h) return;
    // Frame colour info — resolved once per frame, attached to every cut on
    // that frame for production-side traceability.
    var fcExt = resolveColour(f.colour);
    var fcInt = resolveColour(f.colourInt || f.colour);
    frameColours[f.id] = {
      external: fcExt,
      internal: fcInt,
    };
    surfaces.forEach(function(surf) {
      sideMap.forEach(function(side) {
        var k = surf.keyPrefix + side.charAt(0).toUpperCase() + side.slice(1);
        var val = m[k];
        if (!val) return;
        var dim = (side === 'top' || side === 'bottom') ? w : h;
        var catItem = catalogIndex[val] || null;
        // Dictionary→catalog mapping fallback (see above).
        var dictMap = !catItem ? dictCatalogMap[val] : null;
        // ─── WIP30: per-family cut overrides ─────────────────────────
        // Some trim families have non-standard cut math:
        //   - flange30: cutAllowanceMm = 30mm (W+30/H+30, not +200), jointStyle = 'mitre'
        // Others use the global default (200mm allowance, butt joint).
        // Resolve the family's defaults block — works for both catalog SKUs
        // (look up family via catItem._family) and dict-mapped codes.
        var familyDefaults = null;
        if (trimCatalogs) {
          var resolvedFamily = catItem ? catItem._family : (dictMap ? dictMap.family : null);
          if (resolvedFamily && trimCatalogs[resolvedFamily] && trimCatalogs[resolvedFamily].defaults) {
            familyDefaults = trimCatalogs[resolvedFamily].defaults;
          }
        }
        var familyAllow = (familyDefaults && typeof familyDefaults.cutAllowanceMm === 'number') ? familyDefaults.cutAllowanceMm : allow;
        var familyJoint = (familyDefaults && familyDefaults.jointStyle) || 'butt';
        var lengthMm = dim + familyAllow;
        cuts.push({
          frameId: f.id,
          frameName: f.name || ('Frame ' + f.id),
          frameColourExt: fcExt,
          frameColourInt: fcInt,
          surface: surf.surface,
          side: side,
          lengthMm: lengthMm,
          allowanceMm: familyAllow,    // per-cut allowance (varies by family)
          jointStyle: familyJoint,     // 'mitre' | 'butt'
          trimValue: val,
          trimLabel: catItem ? catItem.colour : val,
          isCatalogItem: !!catItem,
          catalogId: catItem ? catItem.id : null,
          colour: catItem ? catItem.colour : null,
          lengthBarMm: catItem ? catItem.lengthMm : (dictMap ? dictMap.barLengthMm : null),
          dictMappedFamily: dictMap ? dictMap.family : null,
        });
      });
    });

    // ─── WIP30+: REVEAL CUTS ────────────────────────────────────────
    // When the surveyor picks Reveal Type (In-Line | Stepped) and enters
    // Window Depth on a frame, generate four reveal cuts (T, B, L, R) at
    // exact finished length and route them through the same FFD packer
    // as trims. The SKU is auto-picked from revealSkus by the rip-width
    // heuristic (smallest stock width ≥ rip width). Different rip widths
    // produce separate byTrim groups (and thus separate bar plans) so the
    // workshop rip-stage / cross-cut-stage flow stays coherent.
    //
    // Math (option B confirmed by Phoenix):
    //   - rip_width(in-line)  = window_depth − frame_depth
    //   - rip_width(stepped)  = window_depth − frame_depth + 39
    //                            (18mm reveal overlap on each side + 3mm clearance)
    //   - top/bottom length   = frame width
    //   - left/right length   = frame height − 36   (2 × 18mm reveal thickness;
    //                            jambs butt between head/sill)
    //   - all cuts butt-jointed (jointStyle: 'butt'), allowance: 0
    //   - reveals are always internal-side (no external reveal exists)
    //
    // If no SKU is wide enough we still emit cuts using the widest available
    // SKU but flag revealOversized=true so the UI surfaces the problem.
    var rt = m.revealType;
    var wdRaw = m.windowDepthMm;
    var wd = (typeof wdRaw === 'number' && isFinite(wdRaw) && wdRaw > 0)
           ? wdRaw
           : (typeof wdRaw === 'string' && wdRaw.trim() !== '' ? parseFloat(wdRaw) : null);
    if ((rt === 'inline' || rt === 'stepped') && wd && wd > 0 && revealSkus.length) {
      var profDims = (typeof getProfileDims === 'function') ? getProfileDims(f.productType) : null;
      var frameDepth = (profDims && typeof profDims.depth === 'number') ? profDims.depth : 70;
      // Reveal calc only valid when wall is deeper than frame (otherwise no
      // reveal collar is possible — frame's already proud of the wall).
      if (wd > frameDepth) {
        var ripWidthMm;
        if (rt === 'inline') {
          ripWidthMm = wd - frameDepth;
        } else { // stepped
          ripWidthMm = (wd - frameDepth) + 39;   // 18 + 18 + 3
        }
        ripWidthMm = Math.round(ripWidthMm);   // whole mm — workshop-friendly
        var picked = pickRevealSku(ripWidthMm);
        var oversized = !picked;
        if (oversized) picked = revealSkus[revealSkus.length - 1];
        // Group key includes rip width + type so different rips don't
        // accidentally pack together. The label is workshop-readable.
        var revealGroupKey = '_REV_' + picked.famKey + '_rip' + ripWidthMm + '_' + rt;
        var revealLabel = 'Reveal — rip to ' + ripWidthMm + '×' + picked.thicknessMm + 'mm '
                        + '(' + (rt === 'inline' ? 'in-line' : 'stepped') + ') '
                        + '← ' + picked.widthMm + '×' + picked.thicknessMm + ' stock';
        // Defensive: jambs would be ≤ 0 on tiny frames — skip those rather
        // than emit a negative-length cut.
        // Stepped reveals wrap PAST the frame's outside corners on every
        // end — they screw onto the SIDE of the frame, so each piece must
        // extend ~20mm past the frame edge on each end to land in solid
        // frame meat. Total per-piece length boost = +40mm. In-line
        // reveals sit flush with the frame edge so the boost is zero.
        // The L/R −36 deduction (jambs butt between head/sill) still
        // applies in both modes.
        var revealEndWrapMm = 20;                                // each end
        var revealLenBoost  = (rt === 'stepped') ? (2 * revealEndWrapMm) : 0;
        var topBottomLen = w + revealLenBoost;
        var jambLen      = (h - 36) + revealLenBoost;
        if (jambLen > 0 && topBottomLen > 0) {
          var revealCutsList = [
            { side: 'top',    lengthMm: topBottomLen },
            { side: 'bottom', lengthMm: topBottomLen },
            { side: 'left',   lengthMm: jambLen      },
            { side: 'right',  lengthMm: jambLen      },
          ];
          revealCutsList.forEach(function(rc) {
            cuts.push({
              frameId:        f.id,
              frameName:      f.name || ('Frame ' + f.id),
              frameColourExt: fcExt,
              frameColourInt: fcInt,
              surface:        'internal',     // reveals always internal
              side:           rc.side,
              lengthMm:       rc.lengthMm,
              allowanceMm:    0,               // exact finished length
              jointStyle:     'butt',
              trimValue:      revealGroupKey,
              trimLabel:      revealLabel,
              isCatalogItem:  true,
              catalogId:      picked.itemId,
              colour:         'Primed',
              lengthBarMm:    picked.lengthMm,
              dictMappedFamily: null,
              // Reveal-specific fields (downstream UI keys off these)
              isReveal:             true,
              revealType:           rt,
              revealRipWidthMm:     ripWidthMm,
              revealLenBoostMm:     revealLenBoost,   // 0 (in-line) or 40 (stepped)
              revealEndWrapMm:      (rt === 'stepped') ? revealEndWrapMm : 0,
              revealSourceFamily:   picked.famKey,
              revealSourceSku:      picked.sku,
              revealSourceWidthMm:  picked.widthMm,
              revealStockThickMm:   picked.thicknessMm,
              revealIsCustomOrder:  picked.isCustomOrder,
              revealOversized:      oversized,
              windowDepthMm:        wd,
              frameDepthMm:         frameDepth,
            });
          });
        }
      }
    }
  });

  // ─── Fly screen aluminium frame cuts ──────────────────────────────────
  // Per Settings → Products → Fly screens, each opening sash on a window
  // (with frame.showFlyScreen !== false) emits 4 frame cuts:
  //
  //   2 horizontal: sashW − cfg.deductWidthMm
  //   2 vertical:   sashH − cfg.deductHeightMm
  //
  // The deductions account for gasket clearance + corner-joiner overlap
  // on the screen frame extrusion. Each window product type has its own
  // deduction (gasket profiles vary). Doors are excluded because they
  // don't ship with fly screens in residential applications (gates and
  // commercial entrances are out of scope here).
  //
  // Sliding windows: only the OPENING sash gets a screen. A 2-panel
  // slider has 1 fixed + 1 opening → 1 screen. A 3-panel slider has
  // 1 fixed + 2 opening → 2 screens. cellTypes marks fixed cells when
  // present; fall back to (panelCount − 1) when not.
  //
  // Casement / awning / T&T / fixed: every sash is opening, so every
  // sash gets a screen (fixed has 0 sashes, so emits nothing).
  //
  // The cuts join the same `cuts` array as trims/reveals and flow through
  // the byTrim aggregation + FFD bar packer below — so they appear in
  // Production → Additional Profiles alongside architraves and reveals,
  // grouped by their own SKU + colour.
  // Fall back to hardcoded defaults if appSettings.flyScreenConfig is
  // missing — happens when a user's saved appSettings predates the
  // flyScreenConfig field. Without this fallback the new feature looks
  // broken on existing saved projects.
  var flyScreenCfg = (appSettings && appSettings.flyScreenConfig) || {
    awning_window:    { enabled: true,  deductWidthMm: 8, deductHeightMm: 8, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
    casement_window:  { enabled: true,  deductWidthMm: 8, deductHeightMm: 8, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
    tilt_turn_window: { enabled: true,  deductWidthMm: 6, deductHeightMm: 6, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
    fixed_window:     { enabled: false, deductWidthMm: 0, deductHeightMm: 0, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
    sliding_window:   { enabled: true,  deductWidthMm: 5, deductHeightMm: 5, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
  };
  // Single profile cross-section image shared by every fly-screen cut.
  // The user uploads this once at Settings → Catalogs → Fly screens. We
  // attach it to each cut + the byTrim group so the production tab can
  // render a thumbnail next to the row.
  var flyScreenProfileImage = (appSettings && appSettings.flyScreenProfileImage) || null;
  // Material rates from pricingConfig.ancillaries — same fields the BOM
  // calculator and Pricing → Ancillaries page use, so edits flow through
  // identically. Falls back to PRICING_DEFAULTS when appSettings hasn't
  // landed pricingConfig yet.
  var flyScreenAnc = (appSettings && appSettings.pricingConfig && appSettings.pricingConfig.ancillaries)
                   || (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.ancillaries)
                   || {};
  var flyScreenFramePerMetre = (flyScreenAnc.flyScreenFramePerMetre != null) ? flyScreenAnc.flyScreenFramePerMetre : 5.50;
  var flyScreenPerUnit       = (flyScreenAnc.flyScreenPerUnit != null) ? flyScreenAnc.flyScreenPerUnit : 45;
  if (flyScreenCfg) {
    items.forEach(function(f) {
      // Only windows have fly screens (not doors).
      var pt = f.productType;
      if (!pt || pt.indexOf('window') === -1) return;
      // Honour the editor's fly-screen toggle. Default to true when the
      // field isn't set (matches the legacy default in the editor).
      if (f.showFlyScreen === false) return;
      var cfg = flyScreenCfg[pt];
      if (!cfg || !cfg.enabled) return;

      var measFrame = byId[f.id] || {};
      var W = (typeof measFrame.measuredWidthMm === 'number' && measFrame.measuredWidthMm > 0) ? measFrame.measuredWidthMm
            : (typeof f.widthMm === 'number' ? f.widthMm : (typeof f.width === 'number' ? f.width : 0));
      var H = (typeof measFrame.measuredHeightMm === 'number' && measFrame.measuredHeightMm > 0) ? measFrame.measuredHeightMm
            : (typeof f.heightMm === 'number' ? f.heightMm : (typeof f.height === 'number' ? f.height : 0));
      if (!W || !H) return;

      // Resolve profile dims for this frame (frame sightline, mullion width, etc.).
      var pd;
      try {
        if (typeof getResolvedProfileDims === 'function') {
          pd = getResolvedProfileDims(pt, null, f.profileOverrides || null);
        } else if (typeof getProfileDims === 'function') {
          pd = getProfileDims(pt);
        }
      } catch (e) { pd = null; }
      if (!pd) pd = { frameW: 65, mullionW: 84 };

      var ct = f.cellTypes;
      var nRows = (ct && ct.length) ? ct.length : 1;
      var nCols = (ct && ct[0] && ct[0].length) ? ct[0].length : 1;
      var hasGrid = nRows > 1 || nCols > 1;
      var panels = f.panelCount || 1;

      // Count opening (non-fixed) sashes — same convention as the profile
      // cutlist module. Fixed windows have numSashes = 0 so the loop is
      // a no-op even if enabled in settings (defensive).
      var numSashes = (pt === 'fixed_window') ? 0 : panels;
      if (hasGrid) {
        numSashes = 0;
        for (var rr = 0; rr < nRows; rr++) {
          for (var cc = 0; cc < nCols; cc++) {
            var cell = ct[rr][cc];
            if (cell && cell !== 'fixed' && cell !== 'solid') numSashes++;
          }
        }
      }
      if (numSashes === 0) return;

      // Sash dimensions — uniform sash assumption (matches profile cutlist).
      var openWMm = W - pd.frameW * 2;
      var openHMm = H - pd.frameW * 2;
      var panelWMm, panelHMm;
      if (hasGrid) {
        var nVMull = nCols - 1;
        var nHMull = nRows - 1;
        var availW = openWMm - nVMull * pd.mullionW;
        var availH = openHMm - nHMull * pd.mullionW;
        panelWMm = availW / nCols;
        panelHMm = availH / nRows;
      } else if (panels > 1) {
        panelWMm = (openWMm - (panels - 1) * pd.mullionW) / panels;
        panelHMm = openHMm;
      } else {
        panelWMm = openWMm;
        panelHMm = openHMm;
      }

      // How many fly screens this frame needs.
      // Sliding window: only opening sashes (panels − 1 typically, or
      // count of non-fixed cells when cellTypes is present).
      // Other windows: one screen per sash.
      var numFlyScreens;
      if (pt === 'sliding_window') {
        if (hasGrid) {
          numFlyScreens = numSashes;          // numSashes already excludes fixed cells
        } else {
          numFlyScreens = Math.max(0, panels - 1);
        }
      } else {
        numFlyScreens = numSashes;
      }
      if (numFlyScreens === 0) return;

      var hCutLen = Math.max(0, panelWMm - (cfg.deductWidthMm || 0));
      var vCutLen = Math.max(0, panelHMm - (cfg.deductHeightMm || 0));
      if (hCutLen <= 0 && vCutLen <= 0) return;

      var fcExt2 = resolveColour(f.colour);
      var fcInt2 = resolveColour(f.colourInt || f.colour);
      // Fly screens are always one colour (no ext/int split — single
      // aluminium extrusion). Group key uses the resolved label so each
      // colour gets its own bar pool. fcExt2 is { id, label } from
      // resolveColour above.
      var colourLabel = (fcExt2 && fcExt2.label) || (fcExt2 && fcExt2.id) || 'white';
      var fsTrimValue = 'flyscreen_' + (cfg.profileSku || 'flyscreen_alum_15x7') + '_' + colourLabel;
      var fsTrimLabel = (cfg.profileSku || 'Fly screen') + ' — ' + colourLabel;

      function pushFlyScreenCut(side, lengthMm, screenIdx) {
        if (lengthMm <= 0) return;
        cuts.push({
          frameId: f.id,
          frameName: f.name || ('Frame ' + f.id),
          frameColourExt: fcExt2,
          frameColourInt: fcInt2,
          surface: 'flyscreen',
          side: side,
          lengthMm: Math.round(lengthMm),
          allowanceMm: 0,        // already accounted for via deduction
          jointStyle: 'butt',    // corner joiners, not mitred
          trimValue: fsTrimValue,
          trimLabel: fsTrimLabel,
          isCatalogItem: false,
          catalogId: null,
          colour: colourLabel,
          lengthBarMm: cfg.barLengthMm || 5800,
          dictMappedFamily: null,
          flyScreenIdx: screenIdx,
          flyScreenSku: cfg.profileSku || 'flyscreen_alum_15x7',
          profileImage: flyScreenProfileImage,
        });
      }
      for (var fsi = 0; fsi < numFlyScreens; fsi++) {
        var screenIdx = fsi + 1;
        pushFlyScreenCut('top',    hCutLen, screenIdx);
        pushFlyScreenCut('bottom', hCutLen, screenIdx);
        pushFlyScreenCut('left',   vCutLen, screenIdx);
        pushFlyScreenCut('right',  vCutLen, screenIdx);
      }
    });
  }

  // Aggregate by trimValue.
  var byTrim = {};
  cuts.forEach(function(c) {
    var key = c.trimValue;
    if (!byTrim[key]) {
      byTrim[key] = {
        label: c.trimLabel,
        isCatalogItem: c.isCatalogItem,
        totalLengthMm: 0,
        cutCount: 0,
        barLengthMm: c.lengthBarMm,
        barsRequired: null,
        cuts: [],
        // WIP30: per-family cut traits (joint style, allowance) — same for
        // every cut on a given trim because they're family-level. Surfacing
        // here so the UI doesn't have to dig into cuts[0] every time.
        jointStyle: c.jointStyle || 'butt',
        allowanceMm: c.allowanceMm,
      };
      // WIP30+: reveal-specific traits propagated to the byTrim entry. The
      // group key includes rip width + type so each entry's traits are
      // homogeneous across its cuts (same SKU, same rip, same reveal type).
      if (c.isReveal) {
        byTrim[key].isReveal             = true;
        byTrim[key].revealType           = c.revealType;
        byTrim[key].revealRipWidthMm     = c.revealRipWidthMm;
        byTrim[key].revealSourceFamily   = c.revealSourceFamily;
        byTrim[key].revealSourceSku      = c.revealSourceSku;
        byTrim[key].revealSourceWidthMm  = c.revealSourceWidthMm;
        byTrim[key].revealStockThickMm   = c.revealStockThickMm;
        byTrim[key].revealIsCustomOrder  = c.revealIsCustomOrder;
        byTrim[key].revealOversized      = c.revealOversized;
      }
      // Fly-screen profile cross-section image (data URL). Propagated
      // from the cut so the production tab can show a thumbnail next
      // to the cutting-list row.
      if (c.surface === 'flyscreen' && c.profileImage) {
        byTrim[key].profileImage = c.profileImage;
        byTrim[key].flyScreenSku = c.flyScreenSku;
      }
    }
    byTrim[key].totalLengthMm += c.lengthMm;
    byTrim[key].cutCount += 1;
    byTrim[key].cuts.push(c);
  });
  Object.keys(byTrim).forEach(function(k) {
    var b = byTrim[k];
    // Initial state — FFD overwrites both fields below for packable trims
    // (anything with barLengthMm). Unpackable dict codes (e.g. timber profiles
    // not yet linked to a catalog) stay at null/null.
    b.barsRequired = null;
    b.barPlan = null;
  });
  // ─── WIP30: FFD bar-pack optimiser (per-trim, catalog items only) ──────
  // First-Fit-Decreasing: sort cuts longest-first, place each into the first
  // bar that has enough remaining length, open new bar otherwise. Standard
  // bin-packing heuristic — produces near-optimal results in practice and is
  // O(n²) which is fine for the cut counts we see (typically <100 per trim).
  // Saw kerf is consumed AFTER each cut except the last on a bar (the last
  // cut runs to the bar end with no kerf needed past it).
  // Dictionary codes (no bar length) are skipped — bars are catalog-only.
  var SAW_KERF_MM = 3;     // matches PRICING_DEFAULTS.sawKerfMm; safe default if pc unavailable here
  var OFFCUT_KEEP_MIN_MM = 200;  // per cover-trim catalog defaults; offcuts ≥ this go to "kept" pile
  Object.keys(byTrim).forEach(function(k) {
    var b = byTrim[k];
    // FFD packs anything with a barLengthMm — catalog SKUs AND dictionary
    // codes mapped to a catalog family (e.g. '30 T' → coverMouldings).
    if (!b.barLengthMm) {
      b.barPlan = null;
      b.barsRequired = null;
      return;
    }
    // Sort cuts longest-first. Stable sort: ties keep their original order
    // (which means same-length cuts cluster, slightly better for production
    // ergonomics — cutter can set the saw stop once and pump them out).
    var sorted = b.cuts.slice().sort(function(a, c) { return c.lengthMm - a.lengthMm; });
    var bars = [];
    sorted.forEach(function(cut) {
      var placed = false;
      for (var bi = 0; bi < bars.length; bi++) {
        var bar = bars[bi];
        // Cost on this bar: cut length + kerf (only if not the first cut here).
        var addCost = cut.lengthMm + (bar.cuts.length > 0 ? SAW_KERF_MM : 0);
        if (bar.remainingMm >= addCost) {
          bar.cuts.push({
            frameId:    cut.frameId,
            frameName:  cut.frameName,
            surface:    cut.surface,
            side:       cut.side,
            lengthMm:   cut.lengthMm,
            // Carry the frame-side colour into the bar plan so cutters can
            // verify the right SKU is loaded against the right frame finish.
            frameColour: (cut.surface === 'internal' ? cut.frameColourInt : cut.frameColourExt),
          });
          bar.remainingMm -= addCost;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // New bar — first cut, no kerf.
        bars.push({
          barNo: bars.length + 1,
          cuts: [{
            frameId:   cut.frameId,
            frameName: cut.frameName,
            surface:   cut.surface,
            side:      cut.side,
            lengthMm:  cut.lengthMm,
            frameColour: (cut.surface === 'internal' ? cut.frameColourInt : cut.frameColourExt),
          }],
          remainingMm: b.barLengthMm - cut.lengthMm,
        });
      }
    });
    // Renumber barNo (already correct since we push in order) and finalise
    // each bar's offcut metric.
    bars.forEach(function(bar) {
      bar.offcutMm = Math.max(0, bar.remainingMm);
      bar.offcutKept = bar.offcutMm >= OFFCUT_KEEP_MIN_MM;
      delete bar.remainingMm;  // internal-only field; not exposed in wire shape
    });
    // Aggregate stats
    var totalUsedMm = bars.reduce(function(sum, bar) {
      return sum + bar.cuts.reduce(function(s, c) { return s + c.lengthMm; }, 0);
    }, 0);
    var totalKerfMm = bars.reduce(function(sum, bar) {
      return sum + Math.max(0, bar.cuts.length - 1) * SAW_KERF_MM;
    }, 0);
    var totalCapacityMm = bars.length * b.barLengthMm;
    var totalOffcutMm = bars.reduce(function(sum, bar) { return sum + bar.offcutMm; }, 0);
    var totalKeptOffcutMm = bars.reduce(function(sum, bar) { return sum + (bar.offcutKept ? bar.offcutMm : 0); }, 0);
    b.barPlan = {
      bars: bars,
      barCount: bars.length,                                // OPTIMISED count — replaces coarse barsRequired estimate
      totalUsedMm: totalUsedMm,
      totalKerfMm: totalKerfMm,
      totalOffcutMm: totalOffcutMm,
      totalKeptOffcutMm: totalKeptOffcutMm,
      utilisationPct: totalCapacityMm > 0 ? Math.round((totalUsedMm / totalCapacityMm) * 1000) / 10 : 0,  // one decimal
      kerfPerCutMm: SAW_KERF_MM,
      offcutKeepMinMm: OFFCUT_KEEP_MIN_MM,
    };
    // Overwrite coarse barsRequired with FFD-optimised count.
    b.barsRequired = bars.length;
  });

  // ─── Fly-screen material cost computation ─────────────────────────────
  // For each byTrim group with surface=flyscreen, compute:
  //   • frameMaterialCost = totalLengthMm/1000 × per-metre rate
  //   • miscCost = numberOfScreens × per-unit miscellaneous (mesh, spline,
  //     corners, pull tab — non-aluminium components)
  //   • totalMaterialCost = frame + misc
  // Number of screens = cutCount / 4 (each screen has 4 cuts: top/bot/L/R).
  // The Production tab displays this cost on the by-trim summary row, and
  // the BOM calculator can read it for accurate quote totals (instead of
  // the legacy flat-per-frame approximation).
  Object.keys(byTrim).forEach(function(k) {
    var b = byTrim[k];
    if (!b.cuts || !b.cuts.length) return;
    var firstCut = b.cuts[0];
    if (firstCut.surface !== 'flyscreen') return;
    var numScreens = Math.round((b.cutCount || 0) / 4);
    var frameMat = (b.totalLengthMm / 1000) * flyScreenFramePerMetre;
    var miscMat  = numScreens * flyScreenPerUnit;
    b.numScreens = numScreens;
    b.frameMaterialCost = +frameMat.toFixed(2);
    b.miscMaterialCost = +miscMat.toFixed(2);
    b.totalMaterialCost = +(frameMat + miscMat).toFixed(2);
    b.flyScreenFramePerMetre = flyScreenFramePerMetre;
    b.flyScreenPerUnit = flyScreenPerUnit;
  });

  return { cuts: cuts, byTrim: byTrim, frameColours: frameColours, allowanceMm: allow };
}

