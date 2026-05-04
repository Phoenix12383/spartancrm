// ═══════════════════════════════════════════════════════════════════════════
// PROFILE CATALOG HELPERS
// Look up real polygon entries from PRICING_DEFAULTS.profiles by product type.
// Falls back to null when no catalog entry exists — callers should handle that
// case by using the legacy flat-extrusion path (makeProfileShapes).
// ═══════════════════════════════════════════════════════════════════════════
// WIP38: explicit user-defined links from product type → profile, scoped
// by role. Stored at appSettings.pricingConfig.profileLinks and mirrored to
// window.__profileLinks. Shape: { [productType]: { frame?: key, sash?: key,
// mullion?: key } }. When set, this overrides the hardcoded profileKeysForType
// default. Lets a user assign a freshly-imported profile to any product
// without modifying the canonical mapping.
// Merge the factory polygon catalog under any user-edited entries from
// window.__userProfiles. The previous `userProfiles || PRICING_DEFAULTS.profiles`
// pattern silently dropped factory entries whenever __userProfiles was a
// non-null but empty object (e.g. user deleted the i4_frame default), which
// made `getOuterFrameProfileEntry` return null and the 3D scene fall through
// to the simplified procedural shape instead of extruding the catalog DXF.
function _allProfileEntries() {
  var defaults = (typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.profiles) || {};
  var user = (typeof window !== 'undefined' && window.__userProfiles) || {};
  // WIP45: a user-imported DXF can land under several different keys depending
  // on which import path was used — sometimes the factory key (`i4_frame`),
  // sometimes a slug derived from system+role+code (e.g.
  // `aluplast_ideal_4000_frame_14x307`). The resolver below looks up by key,
  // so an import that landed under a slug would never override the factory
  // entry by the same code. We fix that here by:
  //  (1) starting with factory defaults, then
  //  (2) for every user entry, if it has a polygon AND its `code` matches a
  //      factory entry's code, GRAFT the polygon (and orient/bbox/sightline/
  //      depth) onto the factory entry. The factory key wins; the user
  //      polygon wins.
  //  (3) finally, key-level Object.assign so any direct-key user override
  //      still applies (e.g. a user entry literally keyed `i4_frame`).
  // The result: user-imported geometry ALWAYS replaces the factory polygon
  // for the matching code, regardless of which key it was saved under.
  var out = {};
  var k;
  for (k in defaults) out[k] = defaults[k];

  // Build a code → factoryKey index from defaults (only entries that have
  // a code — there should always be one, but defensively skip anything
  // without).
  var codeIndex = {};
  for (k in defaults) {
    var d = defaults[k];
    if (d && d.code) codeIndex[String(d.code).toLowerCase()] = k;
  }

  // Graft user polygons onto factory entries by matching code.
  for (k in user) {
    var u = user[k];
    if (!u) continue;
    if (!u.outerHullMm || !u.outerHullMm.length) continue;
    var ucode = u.code ? String(u.code).toLowerCase() : null;
    if (ucode && codeIndex[ucode]) {
      var factoryKey = codeIndex[ucode];
      // Merge: keep factory's identity (key, code, name, system, role,
      // usedByProductTypes), but take user's geometry + dimensions.
      out[factoryKey] = Object.assign({}, defaults[factoryKey], {
        outerHullMm: u.outerHullMm,
        chambersMm: u.chambersMm || [],
        bboxMm: u.bboxMm || defaults[factoryKey].bboxMm,
        sightlineMm: (typeof u.sightlineMm === 'number') ? u.sightlineMm : defaults[factoryKey].sightlineMm,
        depthMm: (typeof u.depthMm === 'number') ? u.depthMm : defaults[factoryKey].depthMm,
        polygonOrient: u.polygonOrient || defaults[factoryKey].polygonOrient,
        // Render-style controls (per-profile, set in Settings → Product
        // dimensions). When unset, falls through to faithful extrusion.
        renderStyle: u.renderStyle || defaults[factoryKey].renderStyle,
        outboardSide: u.outboardSide || defaults[factoryKey].outboardSide,
        faceDepthMm: (typeof u.faceDepthMm === 'number') ? u.faceDepthMm : defaults[factoryKey].faceDepthMm,
        edgeBandMm: (typeof u.edgeBandMm === 'number') ? u.edgeBandMm : defaults[factoryKey].edgeBandMm,
      });
    }
  }

  // Key-level assign last — a user entry literally keyed `i4_frame` overrides
  // the factory at that key directly. Also lets users add NEW profiles under
  // their own keys (e.g. a custom system) which won't have a factory match.
  for (k in user) {
    if (Object.prototype.hasOwnProperty.call(user, k)) out[k] = user[k];
  }
  return out;
}

// Find a user entry whose `code` matches the given factory entry's code, and
// has geometry. Used as a last-resort fallback by the resolvers below in case
// _allProfileEntries' graft missed (e.g. PRICING_DEFAULTS isn't on the global
// scope yet, or codes don't normalise the same way).
function _findUserEntryByCode(code) {
  if (!code || typeof window === 'undefined') return null;
  var user = window.__userProfiles || {};
  var target = String(code).toLowerCase();
  for (var k in user) {
    var u = user[k];
    if (u && u.code && String(u.code).toLowerCase() === target && u.outerHullMm && u.outerHullMm.length) {
      return u;
    }
  }
  return null;
}

// Replace the polygon of `factoryEntry` with the user-imported geometry that
// has the same code, if one exists. Always returns a valid entry (or the
// factory unchanged if no user override applies). Centralised here so every
// resolver gets the same override behaviour without duplicating the logic.
function _applyUserGeometryOverride(factoryEntry) {
  if (!factoryEntry || !factoryEntry.code) return factoryEntry;
  var u = _findUserEntryByCode(factoryEntry.code);
  if (!u) return factoryEntry;
  return Object.assign({}, factoryEntry, {
    outerHullMm: u.outerHullMm,
    chambersMm: u.chambersMm || [],
    bboxMm: u.bboxMm || factoryEntry.bboxMm,
    sightlineMm: (typeof u.sightlineMm === 'number') ? u.sightlineMm : factoryEntry.sightlineMm,
    depthMm: (typeof u.depthMm === 'number') ? u.depthMm : factoryEntry.depthMm,
    polygonOrient: u.polygonOrient || factoryEntry.polygonOrient,
    renderStyle: u.renderStyle || factoryEntry.renderStyle,
    outboardSide: u.outboardSide || factoryEntry.outboardSide,
    faceDepthMm: (typeof u.faceDepthMm === 'number') ? u.faceDepthMm : factoryEntry.faceDepthMm,
    edgeBandMm: (typeof u.edgeBandMm === 'number') ? u.edgeBandMm : factoryEntry.edgeBandMm,
  });
}

function getLinkedProfileEntry(productType, role) {
  try {
    var links = (typeof window !== 'undefined' && window.__profileLinks) || {};
    var profs = _allProfileEntries();
    var slot = links[productType];
    if (slot && slot[role] && profs[slot[role]]) return profs[slot[role]];
  } catch (e) {}
  return null;
}

function getOuterFrameProfileEntry(productType) {
  // Resolution order:
  //   1. User-defined link (appSettings.pricingConfig.profileLinks)
  //   2. Direct key lookup via profileKeysForType (canonical default)
  //   3. Legacy iteration via usedByProductTypes (back-compat)
  // WIP45: every return path is wrapped in _applyUserGeometryOverride so the
  // resolved entry's polygon is replaced by the user-imported DXF if one
  // exists with the same code. This fixes the case where the import save
  // landed under a slug key that the link/key lookup never finds.
  var linked = getLinkedProfileEntry(productType, 'frame');
  if (linked) return _applyUserGeometryOverride(linked);
  try {
    var profs = _allProfileEntries();
    if (typeof profileKeysForType === 'function') {
      var keys = profileKeysForType(productType);
      if (keys && keys.frame && profs[keys.frame]) return _applyUserGeometryOverride(profs[keys.frame]);
    }
    for (var k in profs) {
      var p = profs[k];
      if (p && p.role === 'frame' && Array.isArray(p.usedByProductTypes) && p.usedByProductTypes.indexOf(productType) !== -1) {
        return _applyUserGeometryOverride(p);
      }
    }
  } catch (e) {}
  return null;
}

// Same pattern for sash and mullion — link override → key lookup → legacy.
// All paths wrapped in _applyUserGeometryOverride (WIP45).
function getSashProfileEntry(productType) {
  var linked = getLinkedProfileEntry(productType, 'sash');
  if (linked) return _applyUserGeometryOverride(linked);
  try {
    var profs = _allProfileEntries();
    if (typeof profileKeysForType === 'function') {
      var keys = profileKeysForType(productType);
      if (keys && keys.sash && profs[keys.sash]) return _applyUserGeometryOverride(profs[keys.sash]);
    }
  } catch (e) {}
  return null;
}
function getMullionProfileEntry(productType) {
  var linked = getLinkedProfileEntry(productType, 'mullion');
  if (linked) return _applyUserGeometryOverride(linked);
  try {
    var profs = _allProfileEntries();
    if (typeof profileKeysForType === 'function') {
      var keys = profileKeysForType(productType);
      if (keys && keys.mullion && profs[keys.mullion]) return _applyUserGeometryOverride(profs[keys.mullion]);
    }
  } catch (e) {}
  return null;
}

// Render a profile catalog entry as inline SVG (outer hull + chambers as
// evenodd holes). Returns SVG markup string ready for dangerouslySetInnerHTML.
//
// Options:
//   padPx        — padding around the bbox (default 12)
//   strokeCol    — base outline colour (default '#222')
//   fillCol      — fill colour for the profile body (default '#f5f3ee')
//   strokeWidth  — base stroke width (default 0.6)
//   flipX        — mirror the polygon horizontally so the wide/exterior face
//                  appears on the chosen side. Sash profiles in some DXF
//                  sources are drawn with the rebate on the LEFT; the
//                  cutting-list UI prefers the rebate on the LEFT (i.e.
//                  exterior coloured face on the RIGHT). Set true to flip.
//   exteriorEdge — 'left' | 'right' | null. When set, draws an extra red
//                  outline along that edge of the bbox to mark the
//                  colour-foiled exterior face. Used in the production cut
//                  list to flag colour-side profiles.
function renderProfileSvg(entry, opts) {
  if (!entry || !entry.outerHullMm) return '';
  opts = opts || {};
  var pad = opts.padPx != null ? opts.padPx : 12;
  var stroke = opts.strokeCol || '#222';
  var fill = opts.fillCol || '#f5f3ee';
  var strokeW = opts.strokeWidth != null ? opts.strokeWidth : 0.6;
  var flipX = !!opts.flipX;
  var exteriorEdge = opts.exteriorEdge || null;
  var bb = entry.bboxMm || { w: 70, h: 70 };
  var W = bb.w, H = bb.h;
  // Build path: outer hull + chambers (each as a sub-path)
  // X is mirrored across the bbox centre when flipX is set; Y is always
  // flipped (DXF Y-up → SVG Y-down).
  function pathFrom(pts) {
    if (!pts || !pts.length) return '';
    function tx(x) { return flipX ? (W - x) : x; }
    var d = 'M' + tx(pts[0][0]).toFixed(2) + ',' + (H - pts[0][1]).toFixed(2);
    for (var i = 1; i < pts.length; i++) d += 'L' + tx(pts[i][0]).toFixed(2) + ',' + (H - pts[i][1]).toFixed(2);
    return d + 'Z';
  }
  var d = pathFrom(entry.outerHullMm);
  var chambers = entry.chambersMm || [];
  for (var i = 0; i < chambers.length; i++) d += ' ' + pathFrom(chambers[i]);
  var vb = (-pad) + ' ' + (-pad) + ' ' + (W + 2*pad) + ' ' + (H + 2*pad);

  // Exterior-face highlight: a thicker red line on the chosen vertical edge
  // of the bbox, sitting just outside the polygon outline.
  var exteriorMarker = '';
  if (exteriorEdge === 'left' || exteriorEdge === 'right') {
    var ex = exteriorEdge === 'left' ? 0 : W;
    var redW = strokeW * 4;  // chunky enough to read at thumbnail scale
    exteriorMarker = '<line x1="' + ex + '" y1="0" x2="' + ex + '" y2="' + H + '" stroke="#dc2626" stroke-width="' + redW + '" stroke-linecap="round"/>';
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;">' +
    '<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeW + '" stroke-linejoin="round" fill-rule="evenodd"/>' +
    exteriorMarker +
    // Dimension annotations: 70 × 70 mm
    '<text x="' + (W/2) + '" y="' + (H + pad - 2) + '" text-anchor="middle" font-size="5" fill="#666" font-family="sans-serif">' + W + ' mm</text>' +
    '<text x="' + (-pad + 4) + '" y="' + (H/2) + '" text-anchor="middle" font-size="5" fill="#666" font-family="sans-serif" transform="rotate(-90 ' + (-pad + 4) + ' ' + (H/2) + ')">' + H + ' mm</text>' +
    '</svg>';
}

// Render a frame + sash side-by-side as one SVG (for the Assembly tab).
// Used when both entries have polygon geometry; falls through to single-entry
// rendering if only one is available.
function renderCombinedProfileSvg(frameEntry, sashEntry, opts) {
  var hasFrame = frameEntry && frameEntry.outerHullMm && frameEntry.outerHullMm.length;
  var hasSash  = sashEntry  && sashEntry.outerHullMm  && sashEntry.outerHullMm.length;
  if (!hasFrame && !hasSash) return '';
  if (hasFrame && !hasSash)  return renderProfileSvg(frameEntry, opts);
  if (!hasFrame && hasSash)  return renderProfileSvg(sashEntry, opts);
  opts = opts || {};
  var pad = opts.padPx != null ? opts.padPx : 12;
  var gap = opts.gapMm != null ? opts.gapMm : 14;
  var stroke = opts.strokeCol || '#222';
  var fill = opts.fillCol || '#f5f3ee';
  var strokeW = opts.strokeWidth != null ? opts.strokeWidth : 0.6;
  var fbb = frameEntry.bboxMm || { w: 70, h: 70 };
  var sbb = sashEntry.bboxMm  || { w: 70, h: 77 };
  var baseH = Math.max(fbb.h, sbb.h);
  var totalW = fbb.w + gap + sbb.w;
  function pathFrom(pts, dx, baselineH) {
    if (!pts || !pts.length) return '';
    var d = 'M' + (pts[0][0] + dx).toFixed(2) + ',' + (baselineH - pts[0][1]).toFixed(2);
    for (var i = 1; i < pts.length; i++) {
      d += 'L' + (pts[i][0] + dx).toFixed(2) + ',' + (baselineH - pts[i][1]).toFixed(2);
    }
    return d + 'Z';
  }
  // Frame on the left, sash on the right, both bottom-aligned to baseH.
  var d = pathFrom(frameEntry.outerHullMm, 0, baseH);
  var fchambers = frameEntry.chambersMm || [];
  for (var i = 0; i < fchambers.length; i++) d += ' ' + pathFrom(fchambers[i], 0, baseH);
  var sashOffset = fbb.w + gap;
  d += ' ' + pathFrom(sashEntry.outerHullMm, sashOffset, baseH);
  var schambers = sashEntry.chambersMm || [];
  for (var j = 0; j < schambers.length; j++) d += ' ' + pathFrom(schambers[j], sashOffset, baseH);
  var vb = (-pad) + ' ' + (-pad) + ' ' + (totalW + 2*pad) + ' ' + (baseH + 2*pad);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;">' +
    '<path d="' + d + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + strokeW + '" stroke-linejoin="round" fill-rule="evenodd"/>' +
    '<text x="' + (fbb.w/2) + '" y="' + (baseH + pad - 2) + '" text-anchor="middle" font-size="5" fill="#666" font-family="sans-serif">Frame ' + Math.round(fbb.w) + '\u00d7' + Math.round(fbb.h) + ' mm</text>' +
    '<text x="' + (sashOffset + sbb.w/2) + '" y="' + (baseH + pad - 2) + '" text-anchor="middle" font-size="5" fill="#666" font-family="sans-serif">Sash ' + Math.round(sbb.w) + '\u00d7' + Math.round(sbb.h) + ' mm</text>' +
    '</svg>';
}

// Build a THREE.Shape from a profile catalog entry, with chambers as holes.
// Applies the canonical-to-extruder coord transform:
//   shape_x = pw - DXF_x   (X mirror — sightline direction reversed)
//   shape_y = (rebateSide==='int') ? D - DXF_y : DXF_y   (Y flip for inwards)
// where pw = sightline mm, D = profile depth mm. This matches the convention
// used by makeProfileShapes / buildMitredRect: x∈[0,pw] outer→aperture,
// y∈[0,D] interior→exterior.
function buildProfileShape(entry, rebateSide) {
  if (!entry || !entry.outerHullMm) return null;
  var bb = entry.bboxMm || { w: 70, h: 70 };
  var pw = bb.w, D = bb.h;
  var flipY = rebateSide === 'int';
  function tx(p) {
    var sx = pw - p[0];
    var sy = flipY ? (D - p[1]) : p[1];
    return [sx, sy];
  }

  // Render style — controls how the DXF cross-section becomes a 3D bar.
  // Per-profile, settable in Settings → Products → Product dimensions.
  //   'faithful' — extrude the DXF outer hull as drawn (default; shows
  //                every step and notch as a horizontal line on the bar's
  //                long surfaces — preferred when the DXF really is a
  //                clean section view of one face)
  //   'box'      — simple bbox-sized box (fastest, lowest detail)
  //   'outboard' — extract only the right-edge curve (the outboard face
  //                of the profile when the DXF is drawn as a half-section)
  //                and cap with flat top/bottom/inboard. Produces the
  //                smooth uniform bar look from manufacturer marketing
  //                photos — uniform along its length, profile detail
  //                visible only at mitred ends.
  //   'outboard_grooves' — same as 'outboard', plus preserved top-edge
  //                and bottom-edge detail within an `edgeBandMm` Y-band.
  //                Captures the decorative grooves that run along the
  //                bar's length (parting lines, bead seats, weather-seal
  //                channels). The bar surface stays uniform along its
  //                length AND has the horizontal groove lines visible.
  var style = entry.renderStyle || 'faithful';
  var sh = new THREE.Shape();
  var hull = entry.outerHullMm;
  if (hull.length === 0) return null;

  if (style === 'box') {
    // Simple rectangle from the bbox
    sh.moveTo(0, 0);
    sh.lineTo(pw, 0);
    sh.lineTo(pw, D);
    sh.lineTo(0, D);
    return sh;
  }

  if (style === 'outboard' || style === 'outboard_grooves') {
    // Extract the outboard face curve. The DXF is conventionally drawn
    // with the outboard (exterior) face on the +X side. We walk the
    // polyline keeping only points within `faceDepth` mm of xmax, then
    // cap the back with a flat wall to xmin.
    //
    // For 'outboard_grooves', we additionally preserve points on the top
    // and bottom edges (within edgeBandMm of ymax/ymin) — those are the
    // decorative grooves that run along the bar's length when extruded.
    var faceDepthMm = (typeof entry.faceDepthMm === 'number' && entry.faceDepthMm > 0) ? entry.faceDepthMm : 8;
    var edgeBandMm = (typeof entry.edgeBandMm === 'number' && entry.edgeBandMm > 0) ? entry.edgeBandMm : 6;
    var outboardSide = entry.outboardSide || 'right';
    var keepGrooves = (style === 'outboard_grooves');
    var xmin0 = Infinity, xmax0 = -Infinity, ymin0 = Infinity, ymax0 = -Infinity;
    for (var ii = 0; ii < hull.length; ii++) {
      if (hull[ii][0] < xmin0) xmin0 = hull[ii][0];
      if (hull[ii][0] > xmax0) xmax0 = hull[ii][0];
      if (hull[ii][1] < ymin0) ymin0 = hull[ii][1];
      if (hull[ii][1] > ymax0) ymax0 = hull[ii][1];
    }
    // A point is "kept" if it's on the outboard face, OR (for grooves
    // mode) if it's in the top or bottom Y-band.
    function isOutboardPt(p) {
      return outboardSide === 'left'
        ? p[0] <= xmin0 + faceDepthMm + 0.01
        : p[0] >= xmax0 - faceDepthMm - 0.01;
    }
    function isTopBandPt(p)    { return p[1] >= ymax0 - edgeBandMm - 0.01; }
    function isBottomBandPt(p) { return p[1] <= ymin0 + edgeBandMm + 0.01; }
    function isKeep(p) {
      if (isOutboardPt(p)) return true;
      if (keepGrooves && (isTopBandPt(p) || isBottomBandPt(p))) return true;
      return false;
    }
    // Find a starting kept vertex
    var startI = -1;
    for (var s = 0; s < hull.length; s++) {
      if (isKeep(hull[s])) { startI = s; break; }
    }
    if (startI < 0) {
      // Nothing recognisable — fall through to faithful below
      style = 'faithful';
    } else {
      var nL = hull.length;
      var inboardX = (outboardSide === 'left') ? xmax0 : xmin0;

      if (!keepGrooves) {
        // Plain outboard mode — just the contiguous outboard arc, capped
        // with flat top + back + bottom. Same logic as before.
        var startArc = startI;
        for (var bi = 0; bi < nL; bi++) {
          var pi = (startI - bi - 1 + nL) % nL;
          if (!isOutboardPt(hull[pi])) { startArc = (startI - bi + nL) % nL; break; }
        }
        var endArc = startI;
        for (var fi = 0; fi < nL; fi++) {
          var ni = (startI + fi + 1) % nL;
          if (!isOutboardPt(hull[ni])) { endArc = (startI + fi) % nL; break; }
        }
        var arc = [];
        var cur = startArc;
        var safety = 0;
        while (safety++ <= nL) {
          arc.push(hull[cur]);
          if (cur === endArc) break;
          cur = (cur + 1) % nL;
        }
        arc.sort(function(a, b) { return a[1] - b[1]; });
        var bottomPt = arc[0], topPt = arc[arc.length - 1];
        var pts = [];
        pts.push([inboardX, bottomPt[1]]);
        for (var ai = 0; ai < arc.length; ai++) pts.push(arc[ai]);
        pts.push([inboardX, topPt[1]]);
        var t0 = tx(pts[0]); sh.moveTo(t0[0], t0[1]);
        for (var pi2 = 1; pi2 < pts.length; pi2++) {
          var tp = tx(pts[pi2]); sh.lineTo(tp[0], tp[1]);
        }
        return sh;
      }

      // outboard_grooves — walk the polyline keeping only points that lie
      // on the outboard face OR in the top/bottom Y-band. Dropped runs
      // between two kept points are bridged by THREE.js lineTo as a
      // straight line. When that bridge would cross the polygon's
      // inboard side (i.e. previous kept and next kept are both on
      // edges, with no outboard contact between them), we insert an
      // inboard corner point to close the loop on the inboard side.
      //
      // Algorithm:
      //   1. Identify which "region" each polyline vertex belongs to:
      //        outboard / top-band / bottom-band / dropped.
      //   2. Find a starting outboard-face vertex.
      //   3. Walk forward, accumulating kept vertices. Track the last
      //      band of the last kept vertex.
      //   4. On each band transition (top→bottom, bottom→top, top→
      //      outboard, outboard→top, etc.), if the previous and next
      //      kept vertices are NOT in the same band AND the bridge
      //      between them would skip over the inboard region, insert
      //      one inboard corner point at (inboardX, midY).
      function bandOf(p) {
        var ob = isOutboardPt(p);
        var tb = isTopBandPt(p);
        var bb = isBottomBandPt(p);
        if (ob && tb) return 'outboard_top';
        if (ob && bb) return 'outboard_bottom';
        if (ob)       return 'outboard';
        if (tb)       return 'top';
        if (bb)       return 'bottom';
        return 'drop';
      }
      // Find the first outboard-face vertex to start from.
      var startOb = -1;
      for (var so = 0; so < nL; so++) {
        if (isOutboardPt(hull[so])) { startOb = so; break; }
      }
      if (startOb < 0) {
        // No outboard face — fall through to faithful below.
        style = 'faithful';
      } else {
        var loop = [];
        var prevBand = null;
        for (var w = 0; w <= nL; w++) {
          var idx = (startOb + w) % nL;
          var p = hull[idx];
          var b = bandOf(p);
          if (b === 'drop') continue;
          // Check if we need to insert an inboard corner cap before this
          // point. We insert one when the band transition crosses from
          // top-only to bottom-only (or v.v.) without going through the
          // outboard band — meaning the polyline took a chamber-side
          // detour we just stripped, and the bridge would cut diagonally
          // across the polygon. Insert an inboard cap so the loop stays
          // closed on the inboard side.
          if (prevBand) {
            var crossingTopBot = (prevBand === 'top'    && b === 'bottom')
                              || (prevBand === 'bottom' && b === 'top');
            if (crossingTopBot) {
              // Insert TWO caps so the cut goes top→inboard-top-corner→
              // inboard-bottom-corner→bottom (or reversed).
              if (prevBand === 'top') {
                loop.push([inboardX, ymax0]);
                loop.push([inboardX, ymin0]);
              } else {
                loop.push([inboardX, ymin0]);
                loop.push([inboardX, ymax0]);
              }
            }
          }
          loop.push(p);
          prevBand = b;
        }
        // Drop closing duplicate
        if (loop.length > 3) {
          var f0 = loop[0], lN = loop[loop.length - 1];
          if (Math.abs(f0[0] - lN[0]) < 1e-3 && Math.abs(f0[1] - lN[1]) < 1e-3) loop.pop();
        }
        // Dedup adjacent identical points (cap-insertion can create them
        // when the polyline starts on or near a corner).
        var dedupedLoop = [];
        for (var di = 0; di < loop.length; di++) {
          var dp = loop[di];
          if (dedupedLoop.length === 0) { dedupedLoop.push(dp); continue; }
          var lastDp = dedupedLoop[dedupedLoop.length - 1];
          if (Math.abs(lastDp[0] - dp[0]) < 1e-3 && Math.abs(lastDp[1] - dp[1]) < 1e-3) continue;
          dedupedLoop.push(dp);
        }
        loop = dedupedLoop;
        if (loop.length < 3) {
          style = 'faithful';
        } else {
          var t0g = tx(loop[0]); sh.moveTo(t0g[0], t0g[1]);
          for (var lpi = 1; lpi < loop.length; lpi++) {
            var tpg = tx(loop[lpi]); sh.lineTo(tpg[0], tpg[1]);
          }
          return sh;
        }
      }
    }
  }

  // Faithful — outer hull as drawn. Chambers are deliberately not extruded
  // as holes here. They exist physically inside the bar but they're not
  // visible from outside — rendering them as holes makes their internal
  // edges show through the extruded geometry. Pricing/cutlist/milling code
  // still reads entry.chambersMm directly when needed.
  var p0 = tx(hull[0]); sh.moveTo(p0[0], p0[1]);
  for (var i = 1; i < hull.length; i++) { var p = tx(hull[i]); sh.lineTo(p[0], p[1]); }
  return sh;
}

// Extrude a profile shape (in mm) along a member of given length (in scene
// units, metres). Maps the 2D shape from mm → metres at extrusion time, then
// applies the standard mitre + reflect mapping used by buildMitredRect.
// Returns a THREE.Group of 4 mitred members forming a closed rectangle.
//
// `opts` (optional): { rebSideOverride, zOffset }
//   rebSideOverride — force a rebate side ('int' or 'ext'), bypassing the
//                     productType lookup. Used when building a sash, whose
//                     glazing rebate is opposite to the frame's.
// Sutherland-Hodgman polygon clip against a horizontal line `y = clipY`.
// `keep` = 'lower' to keep the half with y < clipY, 'upper' for y > clipY.
// Input is an array of [x, y] points (closed polygon, last vertex assumed
// to connect back to the first). Output is a clipped polygon, possibly
// empty if the input was entirely on the rejected side.
//
// Used to split an extrusion cross-section in half at the depth midplane
// so we can render the interior and exterior halves with different
// materials (matching what buildMitredRect does for procedural frames).
// Without this, frames built from the catalog (DXF-imported) path lose
// all interior/exterior colour distinction — both halves end up the same
// colour because the catalog signature originally took only one material.
function clipPolygonHorizontal(pts, clipY, keep) {
  if (!pts || pts.length < 3) return [];
  function inside(p) { return keep === 'lower' ? p[1] <= clipY : p[1] >= clipY; }
  function intersect(a, b) {
    // Linear interpolation on Y to find where segment crosses clipY.
    var dy = b[1] - a[1];
    if (Math.abs(dy) < 1e-9) return [a[0], clipY];
    var t = (clipY - a[1]) / dy;
    return [a[0] + t * (b[0] - a[0]), clipY];
  }
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    var cur = pts[i];
    var prev = pts[(i - 1 + pts.length) % pts.length];
    var curIn = inside(cur);
    var prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out;
}

// Build a closed THREE.Shape from a list of [x,y] points (in metres).
function shapeFromPts(pts) {
  if (!pts || pts.length < 3) return null;
  var s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (var i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  return s;
}

//   zOffset (m)   — Z translation applied to every member, so a sash sits
//                   stepped from the frame midplane.
function buildOuterFrameFromCatalog(W, H, entry, mat, productType, opts, matInt) {
  if (!entry || !entry.outerHullMm) return null;
  var pd = productType ? getProfileDims(productType) : null;
  var rebSide = (opts && opts.rebSideOverride) || (pd ? pd.rebateSide : 'ext');
  var zOff = (opts && typeof opts.zOffset === 'number') ? opts.zOffset : 0;
  var shapeMm = buildProfileShape(entry, rebSide);
  if (!shapeMm) return null;
  // Scale mm → m
  var bb = entry.bboxMm || { w: 70, h: 70 };
  var pw = bb.w / 1000;       // sightline in metres
  var Dm = bb.h / 1000;       // depth in metres

  // Convert THREE.Shape from mm to metres. We also extract the raw points
  // so we can clip them at the depth midplane below.
  var shapePts = [];
  var srcPts = shapeMm.getPoints();
  if (srcPts.length === 0) return null;
  for (var i = 0; i < srcPts.length; i++) {
    shapePts.push([srcPts[i].x / 1000, srcPts[i].y / 1000]);
  }

  // Two-tone split. Match the procedural buildMitredRect convention:
  //   - shape Y < D/2  → maps to scene -Z (room side) → interior material
  //   - shape Y > D/2  → maps to scene +Z (weather side) → exterior material
  //
  // We only split when the two materials genuinely differ. When they're
  // the same object (the common case — user hasn't set a separate
  // interior colour), splitting produces TWO meshes that meet at the
  // depth midplane and texture-sample independently, which on bars with
  // photographic foil/aludec textures shows a visible seam running along
  // the bar's length where the two halves' bevel geometry doesn't align.
  // Single-material → single mesh, no seam.
  var needSplit = (matInt && matInt !== mat);
  var lowerShape = null, upperShape = null;
  if (needSplit) {
    // The polygon is clipped at Y = Dm/2 to make two half-shapes which
    // extrude independently with different materials. No midGap — the
    // two halves share the midplane exactly. polygonOffset on the
    // exterior half handles z-fighting and is enough on its own; a
    // gap here would just create a dead zone visible at the seam.
    var lowerPts = clipPolygonHorizontal(shapePts, Dm / 2, 'lower');
    var upperPts = clipPolygonHorizontal(shapePts, Dm / 2, 'upper');
    lowerShape = (lowerPts.length >= 3) ? shapeFromPts(lowerPts) : null;
    upperShape = (upperPts.length >= 3) ? shapeFromPts(upperPts) : null;
  }

  // Build 4 mitred members
  var g = new THREE.Group();
  function addMember(len, mapFn, flipWinding) {
    // Determine the meshes to build:
    //   • Single material (most common): one mesh from the full shape.
    //     No seam because there's nothing to seam across.
    //   • Two-tone: two meshes, one per half-shape with its own material.
    //     polygonOffset prevents z-fighting at the shared midplane.
    var halves = [];
    if (!needSplit) {
      halves.push({ sh: shapeMm, m: mat, isInterior: false, isOnly: true });
    } else {
      if (lowerShape) halves.push({ sh: lowerShape, m: matInt, isInterior: true });
      if (upperShape) halves.push({ sh: upperShape, m: mat,    isInterior: false });
      if (halves.length === 0) {
        // Degenerate fallback — full shape with exterior material.
        halves.push({ sh: shapeMm, m: mat, isInterior: false, isOnly: true });
      }
    }
    halves.forEach(function(h) {
      var geo = extrudeMitred(h.sh, len);
      var pos = geo.getAttribute('position');
      for (var j = 0; j < pos.count; j++) {
        var r = mapFn(pos.getX(j), pos.getY(j), pos.getZ(j));
        pos.setXYZ(j, r[0], r[1], r[2]);
      }
      pos.needsUpdate = true;
      if (flipWinding) {
        var idx = geo.getIndex();
        if (idx) {
          var arr = idx.array;
          for (var fi = 0; fi < arr.length; fi += 3) {
            var tmp = arr[fi + 1]; arr[fi + 1] = arr[fi + 2]; arr[fi + 2] = tmp;
          }
          idx.needsUpdate = true;
        }
      }
      geo.computeVertexNormals();
      // Polygon-offset on the exterior half ONLY when both halves are
      // present (two-tone). For the single-mesh path, no offset — it
      // would just shift the whole bar by 1 depth unit relative to the
      // glass and gaskets.
      var meshMat = h.m;
      if (!h.isOnly && !h.isInterior) {
        meshMat = meshMat.clone();
        meshMat.polygonOffset = true;
        meshMat.polygonOffsetFactor = 1;
        meshMat.polygonOffsetUnits = 1;
      }
      var m = new THREE.Mesh(geo, meshMat);
      m.castShadow = false; m.receiveShadow = false;
      g.add(m);
    });
  }
  // Same mapping convention as buildMitredRect:
  // shape coords: x ∈ [0, pw] (outer→aperture), y ∈ [0, D] (interior→exterior)
  // Top: reflects X → flip winding
  addMember(W, function(x,y,z){ return [z - W/2, H/2 - x, y - Dm/2 + zOff]; }, true);
  // Bottom: no reflection
  addMember(W, function(x,y,z){ return [z - W/2, -H/2 + x, y - Dm/2 + zOff]; }, false);
  // Left: no reflection
  addMember(H, function(x,y,z){ return [-W/2 + x, z - H/2, y - Dm/2 + zOff]; }, false);
  // Right: reflects X → flip winding
  addMember(H, function(x,y,z){ return [W/2 - x, z - H/2, y - Dm/2 + zOff]; }, true);
  // Weld beads at the four mitre corners (uses the catalog's own pw/Dm
  // since DXF entries may have system depths different from the global D).
  if (typeof buildWeldBeads === 'function') {
    try {
      var beads = buildWeldBeads(W, H, pw, Dm, mat, matInt, zOff);
      if (beads) g.add(beads);
    } catch (e) { /* graceful — beads are aesthetic-only */ }
  }
  return g;
}

// Sash member built from the catalog. Same mitred-rect construction as the
// outer frame, but with caller-supplied rebate side (sashes glaze opposite
// the frame) and a Z offset matching the sash step. `sashRebSide` may be
// 'int' or 'ext'; `sashZ` is the centre offset in metres.
function buildSashFrameFromCatalog(sW, sH, entry, mat, sashRebSide, sashZ, matInt) {
  return buildOuterFrameFromCatalog(sW, sH, entry, mat, null, { rebSideOverride: sashRebSide, zOffset: sashZ || 0 }, matInt);
}

// Single straight extruded bar — used for mullions / transoms / interlock.
// `axis`='vertical' makes the length run along world Y (mullion); 'horizontal'
// runs it along world X (transom). The bar is centred on world origin so the
// caller can `.position.set(...)` to place it.
//
// matInt is optional. When supplied, the bar is split at the depth midplane
// and rendered with two materials (interior face + exterior face) — same
// pattern as buildOuterFrameFromCatalog. When omitted, both halves use mat
// (single-material legacy behaviour).
function buildMullionBarFromCatalog(length, entry, mat, productType, axis, matInt) {
  if (!entry || !entry.outerHullMm) return null;
  var pd = productType ? getProfileDims(productType) : null;
  var rebSide = pd ? pd.rebateSide : 'ext';
  var shapeMm = buildProfileShape(entry, rebSide);
  if (!shapeMm) return null;
  var bb = entry.bboxMm || { w: 84, h: 70 };
  var pw = bb.w / 1000;       // mullion width in metres
  var Dm = bb.h / 1000;       // depth in metres

  // Convert THREE.Shape from mm to metres, capturing raw points for the
  // midplane clip below.
  var srcPts = shapeMm.getPoints();
  if (srcPts.length === 0) return null;
  var shapePts = [];
  for (var i = 0; i < srcPts.length; i++) {
    shapePts.push([srcPts[i].x / 1000, srcPts[i].y / 1000]);
  }

  // Two-tone split — same convention as outer frame. Only split when
  // the materials genuinely differ; otherwise build a single mesh from
  // the full shape to avoid the mid-plane seam that makes photographic
  // textures look broken when both halves are sampled independently.
  var needSplit = (matInt && matInt !== mat);
  var halves = [];
  if (needSplit) {
    var lowerPts = clipPolygonHorizontal(shapePts, Dm / 2, 'lower');
    var upperPts = clipPolygonHorizontal(shapePts, Dm / 2, 'upper');
    var lowerShape = (lowerPts.length >= 3) ? shapeFromPts(lowerPts) : null;
    var upperShape = (upperPts.length >= 3) ? shapeFromPts(upperPts) : null;
    if (lowerShape) halves.push({ sh: lowerShape, m: matInt, isInterior: true });
    if (upperShape) halves.push({ sh: upperShape, m: mat,    isInterior: false });
  }
  if (halves.length === 0) {
    // Single material OR degenerate split fell through.
    halves.push({ sh: shapeMm, m: mat, isInterior: false, isOnly: true });
  }

  var bev = 0.0008;
  var g = new THREE.Group();
  halves.forEach(function(h) {
    var geo = new THREE.ExtrudeGeometry(h.sh, {
      depth: length, bevelEnabled: true, bevelSegments: 2,
      bevelSize: bev, bevelThickness: bev, steps: 1,
    });
    // Re-map shape (x ∈ [0,pw], y ∈ [0,D], extrusion-z ∈ [0,length]) to world.
    // Mullion: ext-z → world Y, shape-x → world X, shape-y → world Z
    // Transom: ext-z → world X, shape-x → world Y, shape-y → world Z
    var pos = geo.getAttribute('position');
    for (var k = 0; k < pos.count; k++) {
      var sx = pos.getX(k), sy = pos.getY(k), ez = pos.getZ(k);
      if (axis === 'horizontal') {
        pos.setXYZ(k, ez - length / 2, sx - pw / 2, sy - Dm / 2);
      } else {
        pos.setXYZ(k, sx - pw / 2, ez - length / 2, sy - Dm / 2);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    // UV remap by dominant face-normal axis — same logic as extrudeMitred.
    // ExtrudeGeometry's default UVs wrap perimeter-based, which stretches
    // photographic textures unpredictably across bar surfaces. We pick
    // the UV pair from the two world-axes perpendicular to the face.
    var TILE = 0.6;
    var nrmM = geo.getAttribute('normal');
    var uvM = geo.getAttribute('uv');
    if (nrmM && uvM) {
      for (var ku = 0; ku < pos.count; ku++) {
        var anx = Math.abs(nrmM.getX(ku));
        var any = Math.abs(nrmM.getY(ku));
        var anz = Math.abs(nrmM.getZ(ku));
        var wpx = pos.getX(ku), wpy = pos.getY(ku), wpz = pos.getZ(ku);
        if (anz >= anx && anz >= any) {
          uvM.setXY(ku, wpx / TILE, wpy / TILE);
        } else if (anx >= any) {
          uvM.setXY(ku, wpy / TILE, wpz / TILE);
        } else {
          uvM.setXY(ku, wpx / TILE, wpz / TILE);
        }
      }
      uvM.needsUpdate = true;
    }
    var meshMat = h.m;
    // polygonOffset only for the exterior half of a true split — never
    // for the single-mesh path (would shift the whole bar by 1 depth unit).
    if (!h.isOnly && !h.isInterior) {
      meshMat = meshMat.clone();
      meshMat.polygonOffset = true;
      meshMat.polygonOffsetFactor = 1;
      meshMat.polygonOffsetUnits = 1;
    }
    var m = new THREE.Mesh(geo, meshMat);
    m.castShadow = false; m.receiveShadow = false;
    g.add(m);
  });
  return g;
}

// Expose for headless tests + 39-main-app debugging.
if (typeof window !== 'undefined') {
  window.buildOuterFrameFromCatalog = buildOuterFrameFromCatalog;
  window.buildSashFrameFromCatalog  = buildSashFrameFromCatalog;
  window.buildMullionBarFromCatalog = buildMullionBarFromCatalog;
  window.getOuterFrameProfileEntry  = getOuterFrameProfileEntry;
  window.getSashProfileEntry        = getSashProfileEntry;
  window.getMullionProfileEntry     = getMullionProfileEntry;
}


