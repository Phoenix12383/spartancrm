// ═══════════════════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function box(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }

function cyl(radius, height, x, y, z, rotX, rotZ) {
  const g = new THREE.CylinderGeometry(radius, radius, height, 16);
  if (rotX) g.rotateX(rotX);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return g;
}

function mergeMesh(geos, mat) {
  const pos = [], norm = [], uv = [], idx = []; let off = 0;
  for (const g of geos) {
    const p = g.getAttribute("position"), n = g.getAttribute("normal"), u = g.getAttribute("uv"), ix = g.getIndex();
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
    if (n) for (let i = 0; i < n.count; i++) norm.push(n.getX(i), n.getY(i), n.getZ(i));
    if (u) for (let i = 0; i < u.count; i++) uv.push(u.getX(i), u.getY(i));
    if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
    off += p.count; g.dispose();
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (norm.length) mg.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
  if (uv.length) mg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (idx.length) mg.setIndex(idx);
  const m = new THREE.Mesh(mg, mat); m.castShadow = false; m.receiveShadow = false; return m;
}

// ═══════════════════════════════════════════════════════════════════════════
// MITRED PROFILE GEOMETRY — 45° welded uPVC corner joints
// ═══════════════════════════════════════════════════════════════════════════

// Extrude a 2D profile shape with 45° mitre cuts at both ends
// Shape X = across profile width (0=outer perimeter, pw=inner aperture)
// Shape Y = profile depth (0=exterior, D=interior)
// Extrusion along Z for length len
// Mitre: at z=0 end shift z += x, at z=len end shift z -= x
function extrudeMitred(shape, len) {
  var bev = 0.001; // ~1.0mm micro-bevel for smoother edge highlights
  var geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: true, bevelSegments: 3, bevelSize: bev, bevelThickness: bev, steps: 2 });
  var pos = geo.getAttribute('position');
  var threshold = bev + 0.0012;
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), z = pos.getZ(i);
    if (z < threshold) pos.setZ(i, Math.max(0, x));
    else if (z > len - threshold) pos.setZ(i, Math.min(len, len - x));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Build a rectangular frame with 4 mitred members
// W, H = outer dimensions; pw = profile width; extSh/intSh = exterior/interior half shapes
// mat/mi = exterior/interior materials; zOff = Z offset for sash positioning
function buildMitredRect(W, H, pw, extSh, intSh, mat, mi, zOff) {
  var g = new THREE.Group();
  var zo = zOff || 0;
  function addMember(len, mapFn, flipWinding) {
    [extSh, intSh].forEach(function(sh, si) {
      var geo = extrudeMitred(sh, len);
      var pos = geo.getAttribute('position');
      for (var j = 0; j < pos.count; j++) {
        var r = mapFn(pos.getX(j), pos.getY(j), pos.getZ(j));
        pos.setXYZ(j, r[0], r[1], r[2]);
      }
      pos.needsUpdate = true;
      // If mapping reflects one axis, winding is reversed — flip index buffer to fix
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
      // extSh (si=0) maps to -Z (room side) → interior material
      // intSh (si=1) maps to +Z (weather side) → exterior material
      var mMat = si === 0 ? mi : mat;
      // Interior half: polygonOffset to prevent z-fighting at shared mid-plane
      if (si === 1) { mMat = mMat.clone(); mMat.polygonOffset = true; mMat.polygonOffsetFactor = 1; mMat.polygonOffsetUnits = 1; }
      var m = new THREE.Mesh(geo, mMat);
      m.castShadow = false; m.receiveShadow = false;
      g.add(m);
    });
  }
  // Top: mapping reflects X → needs winding flip
  addMember(W, function(x,y,z){return [z-W/2, H/2-x, y-D/2+zo]}, true);
  // Bottom: no reflection
  addMember(W, function(x,y,z){return [z-W/2, -H/2+x, y-D/2+zo]}, false);
  // Left: no reflection
  addMember(H, function(x,y,z){return [-W/2+x, z-H/2, y-D/2+zo]}, false);
  // Right: mapping reflects X → needs winding flip
  addMember(H, function(x,y,z){return [W/2-x, z-H/2, y-D/2+zo]}, true);
  return g;
}

// Create profile shapes for Ideal 4000 frame system
// Hyper-detailed cross-section matching actual Aluplast Ideal 4000 engineering drawings
// pw = profile width (sightline), rebW = glazing rebate width, rebH = rebate step depth
// rebateSide = 'int' (T&T/Fixed) or 'ext' (Awning/Casement)
//
// Shape coordinates: x = 0 (outer perimeter) to pw (inner aperture wall)
//                    y = 0 (interior/-Z face) to D (exterior/+Z face)
// 
// Ideal 4000 cross-section features:
//   - 3mm outer walls with 1.5mm corner chamfers
//   - 3 main chambers: outer, steel reinforcement (largest), inner
//   - 2.5mm internal chamber walls
//   - Seal grooves: 4mm wide x 5mm deep on aperture face
//   - Glazing rebate: 24mm wide, 18mm step
//   - Drainage channels on outer wall base
//   - Steel reinforcement pocket ~25mm wide in center chamber
function makeProfileShapes(pw, rebW, rebH, rebateSide) {
  var ch = 0.0015;    // corner chamfer 1.5mm
  var wt = 0.003;     // outer wall thickness 3mm
  var cw = 0.0025;    // chamber wall thickness 2.5mm
  var sg = 0.004;     // seal groove width 4mm
  var sgd = 0.005;    // seal groove depth 5mm
  var rebOnInt = rebateSide === 'int';
  var midGap = 0.0004; // 0.4mm gap at mid-plane to prevent coplanar faces

  // Chamber wall Y positions (depth locations where internal walls sit)
  // From image: walls at ~30% and ~70% of depth
  var chw1 = D * 0.28;   // first chamber wall ~19.6mm from y=0
  var chw2 = D * 0.50;   // mid-plane wall (coincides with shape split)
  var chw3 = D * 0.72;   // third chamber wall ~50.4mm from y=0

  // Drain channel dimensions
  var drW = 0.006;    // drain slot width 6mm
  var drH = 0.002;    // drain slot depth 2mm

  // Mid-plane Y for each half (offset to prevent coplanar faces)
  var midExt = D/2 - midGap; // exterior half stops short of mid-plane
  var midInt = D/2 + midGap; // interior half starts past mid-plane

  // ── Interior-Z half (y=0 to midExt) — maps to -Z (room side) ──
  var es = new THREE.Shape();
  if (rebOnInt) {
    es.moveTo(pw - rebW - ch, 0);
    es.lineTo(pw - rebW, ch);
    es.lineTo(pw - rebW, rebH);
    es.lineTo(pw - sg, rebH);
    es.lineTo(pw - sg, rebH + sgd);
    es.lineTo(pw, rebH + sgd);
    // Straight aperture wall to mid-plane (no chamber notches — internal detail only)
    es.lineTo(pw, midExt);
    es.lineTo(0, midExt);
    // Clean outer wall (no drain channels)
    es.lineTo(0, ch);
    es.lineTo(ch, 0);
  } else {
    es.moveTo(ch, 0);
    es.lineTo(pw - ch, 0);
    es.lineTo(pw, ch);
    es.lineTo(pw, sgd);
    es.lineTo(pw - sg, sgd);
    es.lineTo(pw - sg, sgd + sg);
    es.lineTo(pw, sgd + sg);
    // Straight aperture wall to mid-plane (no chamber notches)
    es.lineTo(pw, midExt);
    es.lineTo(0, midExt);
    // Clean outer wall (no drain channels)
    es.lineTo(0, ch);
  }

  // ── Exterior-Z half (y=midInt to D) — maps to +Z (weather side) ──
  var is2 = new THREE.Shape();
  is2.moveTo(0, midInt);
  // Straight aperture wall (no chamber notch)
  is2.lineTo(pw, midInt);

  if (!rebOnInt) {
    // Awning/Casement: rebate step on exterior side
    // Seal groove before rebate
    is2.lineTo(pw, D - rebH - sgd - sg);
    is2.lineTo(pw - sg, D - rebH - sgd - sg);
    is2.lineTo(pw - sg, D - rebH - sgd);
    is2.lineTo(pw, D - rebH - sgd);
    // Rebate step
    is2.lineTo(pw, D - rebH);
    is2.lineTo(pw - rebW, D - rebH);
    is2.lineTo(pw - rebW, D - ch);
    is2.lineTo(pw - rebW - ch, D);
  } else {
    // T&T/Fixed: full face on exterior side (no rebate)
    // Seal groove near exterior face
    is2.lineTo(pw, D - sgd - sg);
    is2.lineTo(pw - sg, D - sgd - sg);
    is2.lineTo(pw - sg, D - sgd);
    is2.lineTo(pw, D - sgd);
    // Continue to exterior face
    is2.lineTo(pw, D - ch);
    is2.lineTo(pw - ch, D);
  }
  // Exterior face to outer perimeter
  is2.lineTo(ch, D);
  is2.lineTo(0, D - ch);

  return { ext: es, int: is2 };
}

// ═══════════════════════════════════════════════════════════════════════════
// Ideal 4000 Mullion/Transom — detailed profile with rebate steps
// Cross-section: 84mm wide × 70mm deep (T&T) or 80mm × 70mm (casement)
// Two rebate steps (one per sash), central web, seal grooves
//
// From engineering drawing:
//   Total width: 84mm (mw), depth: 70mm (dd)
//   Glazing rebate: 24mm on each aperture face
//   Central web: mw - 2×rebW = 36mm (T&T) or 32mm (casement)
//   Rebate step height: 18mm from face
//   5mm sash step (formed by sash overlap, not mullion)
//
// For awning/casement: rebate at +Z (exterior), large face at -Z (interior)
// For T&T/fixed: rebate at -Z (interior), large face at +Z (exterior)
// ═══════════════════════════════════════════════════════════════════════════

function buildDetailedMullionBar(length, mw, dd, mat, rebSide, matInt, productType) {
  // Catalog short-circuit: when the user has bound a mullion polygon to this
  // productType, extrude that polygon along the bar instead of building the
  // simplified box-stack below. Procedural fallback runs whenever no link / no
  // entry is found, so the legacy look survives until DXF profiles are uploaded.
  if (productType && typeof getMullionProfileEntry === 'function') {
    var _ent = getMullionProfileEntry(productType);
    if (_ent && typeof buildMullionBarFromCatalog === 'function') {
      var _bar = buildMullionBarFromCatalog(length, _ent, mat, productType, 'vertical');
      if (_bar) return _bar;
    }
  }
  var g = new THREE.Group();
  var mi = matInt || mat;
  var rebW = GLAZING_REBATE;  // 24mm per side
  var rebH = 0.018;            // 18mm rebate step depth
  var neckW = mw - 2 * rebW;  // central web width

  // Gasket material for seal grooves
  var gasketMat = new THREE.MeshPhysicalMaterial({ color: '#0f0f0f', roughness: 0.85, metalness: 0.0, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  var gsktH = 0.003;  // gasket strip height 3mm
  var gsktW = 0.003;  // gasket strip width 3mm

  // Z offsets based on rebate side
  var rebSign = rebSide === 'int' ? -1 : 1;  // -1 = rebate at -Z, +1 = rebate at +Z

  // Main body (full width, partial depth — the non-rebate portion)
  var bodyD = dd - rebH;
  var bodyZ = -rebSign * rebH / 2;
  g.add(mergeMesh([box(mw, length, bodyD, 0, 0, bodyZ)], mat));

  // Neck (between the two rebates — only fills the rebate-height portion)
  var neckZ = rebSign * (dd / 2 - rebH / 2);
  g.add(mergeMesh([box(neckW, length, rebH, 0, 0, neckZ)], mat));

  // Seal groove gaskets — thin black strips on each aperture face
  // Positioned at the rebate shelf, running full length
  var shelfZ = rebSign * (dd / 2 - rebH);
  // Left aperture face gasket (at x = -mw/2 + rebW)
  g.add(mergeMesh([box(gsktW, length, gsktH, -neckW / 2 - gsktW / 2, 0, shelfZ)], gasketMat));
  // Right aperture face gasket (at x = +mw/2 - rebW)
  g.add(mergeMesh([box(gsktW, length, gsktH, neckW / 2 + gsktW / 2, 0, shelfZ)], gasketMat));

  // Additional gasket at the opposite depth face (centre seal)
  var faceSealZ = -rebSign * (dd / 2 - 0.010);
  g.add(mergeMesh([box(gsktW, length, gsktH, -mw / 2 + 0.005, 0, faceSealZ)], gasketMat));
  g.add(mergeMesh([box(gsktW, length, gsktH, mw / 2 - 0.005, 0, faceSealZ)], gasketMat));

  return g;
}

function buildDetailedTransomBar(length, mw, dd, mat, rebSide, matInt, productType) {
  // Catalog short-circuit (mirror of buildDetailedMullionBar) — extrude the
  // bound mullion/transom polygon horizontally if a profile link exists.
  if (productType && typeof getMullionProfileEntry === 'function') {
    var _ent = getMullionProfileEntry(productType);
    if (_ent && typeof buildMullionBarFromCatalog === 'function') {
      var _bar = buildMullionBarFromCatalog(length, _ent, mat, productType, 'horizontal');
      if (_bar) return _bar;
    }
  }
  // Same profile as mullion but oriented horizontally
  // Mullion: width across X, length along Y, depth along Z
  // Transom: width across Y, length along X, depth along Z
  var g = new THREE.Group();
  var mi = matInt || mat;
  var rebW = GLAZING_REBATE;
  var rebH = 0.018;
  var neckW = mw - 2 * rebW;

  var gasketMat = new THREE.MeshPhysicalMaterial({ color: '#0f0f0f', roughness: 0.85, metalness: 0.0, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  var gsktH = 0.003;
  var gsktW = 0.003;

  var rebSign = rebSide === 'int' ? -1 : 1;

  // Main body
  var bodyD = dd - rebH;
  var bodyZ = -rebSign * rebH / 2;
  g.add(mergeMesh([box(length, mw, bodyD, 0, 0, bodyZ)], mat));

  // Neck between rebates
  var neckZ = rebSign * (dd / 2 - rebH / 2);
  g.add(mergeMesh([box(length, neckW, rebH, 0, 0, neckZ)], mat));

  // Seal groove gaskets on aperture faces
  var shelfZ = rebSign * (dd / 2 - rebH);
  g.add(mergeMesh([box(length, gsktW, gsktH, 0, -neckW / 2 - gsktW / 2, shelfZ)], gasketMat));
  g.add(mergeMesh([box(length, gsktW, gsktH, 0, neckW / 2 + gsktW / 2, shelfZ)], gasketMat));

  // Centre seal gaskets
  var faceSealZ = -rebSign * (dd / 2 - 0.010);
  g.add(mergeMesh([box(length, gsktW, gsktH, 0, -mw / 2 + 0.005, faceSealZ)], gasketMat));
  g.add(mergeMesh([box(length, gsktW, gsktH, 0, mw / 2 - 0.005, faceSealZ)], gasketMat));

  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Feature 1: Realistic Ideal 4000 outer frame with 45° welded mitres
// ═══════════════════════════════════════════════════════════════════════════

function buildOuterFrame(W, H, mat, hasThreshold, matInt, frameWidth, productType) {
  // ── Profile catalog short-circuit ───────────────────────────────────────
  // If this productType has a real polygon entry in PRICING_DEFAULTS.profiles,
  // build the frame using extruded polygon geometry (chambers as holes) instead
  // of the simplified flat extrusion. Threshold-bearing variants (french/hinged
  // doors) still fall through to the legacy path so the aluminium threshold
  // construction is preserved.
  // Errors are caught + logged so a malformed polygon falls back to the
  // procedural shape rather than blanking the whole 3D scene; window.__cadDebugFrame
  // exposes which path was taken for the last build (for support / debugging).
  var _dbg = (typeof window !== 'undefined') ? (window.__cadDebugFrame = window.__cadDebugFrame || {}) : {};
  _dbg.lastCall = { productType: productType, hasThreshold: hasThreshold };
  if (!hasThreshold && productType) {
    var profEntry = null;
    try { profEntry = getOuterFrameProfileEntry(productType); }
    catch (e) { console.warn('[cad] getOuterFrameProfileEntry threw:', e); }
    _dbg.profEntry = profEntry ? { code: profEntry.code, system: profEntry.system,
                                    hullPts: profEntry.outerHullMm && profEntry.outerHullMm.length,
                                    chambers: profEntry.chambersMm && profEntry.chambersMm.length } : null;
    if (profEntry && profEntry.outerHullMm && profEntry.outerHullMm.length) {
      var catalogFrame = null;
      try { catalogFrame = buildOuterFrameFromCatalog(W, H, profEntry, mat, productType); }
      catch (e) { console.warn('[cad] buildOuterFrameFromCatalog threw for', productType, ':', e); }
      if (catalogFrame && catalogFrame.children && catalogFrame.children.length) {
        _dbg.path = 'catalog'; return catalogFrame;
      }
    }
  }
  _dbg.path = 'procedural';
  var fw = frameWidth || FW;
  var mi = matInt || mat;
  var pd = productType ? getProfileDims(productType) : null;
  var rebSide = pd ? pd.rebateSide : 'ext';
  var shapes = makeProfileShapes(fw, GLAZING_REBATE, 0.018, rebSide);
  var g;
  if (hasThreshold) {
    // Low aluminium threshold variant — used on French and hinged doors per
    // Aluplast IDEAL 4000 catalogue. The bottom 70mm PVC rail is replaced by
    // a 20mm-tall silver anodised aluminium extrusion (Aluplast U 249060).
    // Build a 3-sided PVC frame (top + 2 jambs), then add the aluminium
    // threshold as a low-profile box at the bottom.
    g = new THREE.Group();
    var threeSidedH = H - fw + 0.020;  // jamb feet sit on top of 20mm threshold
    var threeSidedY = (fw - 0.020) / 2; // shift up so the threshold tucks underneath
    var pvcFrame = buildMitredRect(W, threeSidedH, fw, shapes.ext, shapes.int, mat, mi, 0);
    // We built a closed mitred rect — drop the bottom member by hiding the
    // bottom-most child. buildMitredRect adds members in order: top, bottom,
    // left, right — each contributes 2 child meshes (ext + int half-shapes).
    // Remove children at indices 2 and 3 (bottom ext + bottom int).
    if (pvcFrame.children.length >= 4) {
      pvcFrame.remove(pvcFrame.children[3]);
      pvcFrame.remove(pvcFrame.children[2]);
    }
    pvcFrame.position.y = threeSidedY;
    g.add(pvcFrame);
    // Aluminium threshold — 20mm tall × frame depth, silver anodised. We build
    // it as a simple stepped box: a wider lower base (matches frame width)
    // and a slightly raised step where the door sash seals down. Silver
    // anodised aluminium tone: pale grey with subtle metallic finish.
    var alSilver = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.78, 0.79, 0.80),
      roughness: 0.35, metalness: 0.85,
    });
    var thrH = 0.020;     // 20mm tall
    var thrD = D;         // matches frame depth (70mm)
    var thrW = W;         // full opening width
    var thrY = -H / 2 + thrH / 2;
    // Main base
    var baseGeo = new THREE.BoxGeometry(thrW, thrH, thrD);
    var baseMesh = new THREE.Mesh(baseGeo, alSilver);
    baseMesh.position.set(0, thrY, 0);
    g.add(baseMesh);
    // Raised step on the interior side (where the sash seals against)
    var stepW = thrW - fw * 2 + 0.004; // slightly narrower than opening
    var stepH = 0.005;                  // 5mm raised lip
    var stepD = 0.025;                  // 25mm wide step
    var stepGeo = new THREE.BoxGeometry(stepW, stepH, stepD);
    var stepMesh = new THREE.Mesh(stepGeo, alSilver);
    // Position the step on the interior side (negative Z = room side)
    stepMesh.position.set(0, thrY + thrH / 2 + stepH / 2, -thrD / 2 + stepD / 2 + 0.008);
    g.add(stepMesh);
    // Subtle drainage channel on exterior side — thin dark strip
    var drainMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.45, 0.46, 0.47), roughness: 0.6, metalness: 0.5,
    });
    var drainGeo = new THREE.BoxGeometry(thrW - 0.020, 0.002, 0.006);
    var drainMesh = new THREE.Mesh(drainGeo, drainMat);
    drainMesh.position.set(0, thrY + thrH / 2 + 0.001, thrD / 2 - 0.010);
    g.add(drainMesh);
  } else {
    g = buildMitredRect(W, H, fw, shapes.ext, shapes.int, mat, mi, 0);
  }
  return g;
}

