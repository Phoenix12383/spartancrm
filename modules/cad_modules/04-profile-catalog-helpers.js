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
  // User entries override defaults by key (so re-imported geometry wins).
  return Object.assign({}, defaults, user);
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
  var linked = getLinkedProfileEntry(productType, 'frame');
  if (linked) return linked;
  try {
    var profs = _allProfileEntries();
    if (typeof profileKeysForType === 'function') {
      var keys = profileKeysForType(productType);
      if (keys && keys.frame && profs[keys.frame]) return profs[keys.frame];
    }
    for (var k in profs) {
      var p = profs[k];
      if (p && p.role === 'frame' && Array.isArray(p.usedByProductTypes) && p.usedByProductTypes.indexOf(productType) !== -1) {
        return p;
      }
    }
  } catch (e) {}
  return null;
}

// Same pattern for sash and mullion — link override → key lookup → legacy.
function getSashProfileEntry(productType) {
  var linked = getLinkedProfileEntry(productType, 'sash');
  if (linked) return linked;
  try {
    var profs = _allProfileEntries();
    if (typeof profileKeysForType === 'function') {
      var keys = profileKeysForType(productType);
      if (keys && keys.sash && profs[keys.sash]) return profs[keys.sash];
    }
  } catch (e) {}
  return null;
}
function getMullionProfileEntry(productType) {
  var linked = getLinkedProfileEntry(productType, 'mullion');
  if (linked) return linked;
  try {
    var profs = _allProfileEntries();
    if (typeof profileKeysForType === 'function') {
      var keys = profileKeysForType(productType);
      if (keys && keys.mullion && profs[keys.mullion]) return profs[keys.mullion];
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
  // Outer perimeter
  var sh = new THREE.Shape();
  var hull = entry.outerHullMm;
  if (hull.length === 0) return null;
  var p0 = tx(hull[0]); sh.moveTo(p0[0], p0[1]);
  for (var i = 1; i < hull.length; i++) { var p = tx(hull[i]); sh.lineTo(p[0], p[1]); }
  // Chambers as holes
  var chambers = entry.chambersMm || [];
  for (var ci = 0; ci < chambers.length; ci++) {
    var c = chambers[ci];
    if (!c || c.length < 3) continue;
    var hole = new THREE.Path();
    var h0 = tx(c[0]); hole.moveTo(h0[0], h0[1]);
    for (var j = 1; j < c.length; j++) { var hp = tx(c[j]); hole.lineTo(hp[0], hp[1]); }
    sh.holes.push(hole);
  }
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
//   zOffset (m)   — Z translation applied to every member, so a sash sits
//                   stepped from the frame midplane.
function buildOuterFrameFromCatalog(W, H, entry, mat, productType, opts) {
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
  // Convert THREE.Shape from mm to metres by scaling all path points
  function scaleShape(sh) {
    var s = new THREE.Shape();
    var pts = sh.getPoints();
    if (pts.length === 0) return s;
    s.moveTo(pts[0].x / 1000, pts[0].y / 1000);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i].x / 1000, pts[i].y / 1000);
    for (var hi = 0; hi < sh.holes.length; hi++) {
      var hh = sh.holes[hi];
      var hpts = hh.getPoints();
      if (hpts.length < 3) continue;
      var hp = new THREE.Path();
      hp.moveTo(hpts[0].x / 1000, hpts[0].y / 1000);
      for (var j = 1; j < hpts.length; j++) hp.lineTo(hpts[j].x / 1000, hpts[j].y / 1000);
      s.holes.push(hp);
    }
    return s;
  }
  var shape = scaleShape(shapeMm);

  // Build 4 mitred members
  var g = new THREE.Group();
  function addMember(len, mapFn, flipWinding) {
    var geo = extrudeMitred(shape, len);
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
    var m = new THREE.Mesh(geo, mat);
    m.castShadow = false; m.receiveShadow = false;
    g.add(m);
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
  return g;
}

// Sash member built from the catalog. Same mitred-rect construction as the
// outer frame, but with caller-supplied rebate side (sashes glaze opposite
// the frame) and a Z offset matching the sash step. `sashRebSide` may be
// 'int' or 'ext'; `sashZ` is the centre offset in metres.
function buildSashFrameFromCatalog(sW, sH, entry, mat, sashRebSide, sashZ) {
  return buildOuterFrameFromCatalog(sW, sH, entry, mat, null, { rebSideOverride: sashRebSide, zOffset: sashZ || 0 });
}

// Single straight extruded bar — used for mullions / transoms / interlock.
// `axis`='vertical' makes the length run along world Y (mullion); 'horizontal'
// runs it along world X (transom). The bar is centred on world origin so the
// caller can `.position.set(...)` to place it.
function buildMullionBarFromCatalog(length, entry, mat, productType, axis) {
  if (!entry || !entry.outerHullMm) return null;
  var pd = productType ? getProfileDims(productType) : null;
  var rebSide = pd ? pd.rebateSide : 'ext';
  var shapeMm = buildProfileShape(entry, rebSide);
  if (!shapeMm) return null;
  var bb = entry.bboxMm || { w: 84, h: 70 };
  var pw = bb.w / 1000;       // mullion width in metres
  var Dm = bb.h / 1000;       // depth in metres
  // Scale mm → m (same routine as outer frame)
  function scaleShape(sh) {
    var s = new THREE.Shape();
    var pts = sh.getPoints();
    if (pts.length === 0) return s;
    s.moveTo(pts[0].x / 1000, pts[0].y / 1000);
    for (var i = 1; i < pts.length; i++) s.lineTo(pts[i].x / 1000, pts[i].y / 1000);
    for (var hi = 0; hi < sh.holes.length; hi++) {
      var hh = sh.holes[hi];
      var hpts = hh.getPoints();
      if (hpts.length < 3) continue;
      var hp = new THREE.Path();
      hp.moveTo(hpts[0].x / 1000, hpts[0].y / 1000);
      for (var j = 1; j < hpts.length; j++) hp.lineTo(hpts[j].x / 1000, hpts[j].y / 1000);
      s.holes.push(hp);
    }
    return s;
  }
  var shape = scaleShape(shapeMm);
  // Plain extrusion — no mitre on the ends (mullion butts into top/bottom rails)
  var bev = 0.0008;
  var geo = new THREE.ExtrudeGeometry(shape, {
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
  var g = new THREE.Group();
  var m = new THREE.Mesh(geo, mat);
  m.castShadow = false; m.receiveShadow = false;
  g.add(m);
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


