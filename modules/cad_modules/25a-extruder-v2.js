// ═══════════════════════════════════════════════════════════════════════════
// EXTRUDER v2 — vertex-plane mitre, hard-fail, no procedural fallback.
//
// What this replaces:
//   buildOuterFrameFromCatalog (in 04-profile-catalog-helpers.js) and the
//   trick extrudeMitred (in 25-geometry-helpers.js). Those functions return
//   null on any error, which the caller silently swallows.
//
// What this does:
//   Takes a CanonicalProfile (schemaVersion 3, +X sightline, +Y depth,
//   origin at exterior outer corner) and produces a fully-mitred member as
//   THREE.BufferGeometry. Every failure throws a typed error reported to
//   SpartanDebug; the caller's red banner replaces silent procedural geometry.
//
//   Mitre is implemented as VERTEX-PLANE PROJECTION (per research §5):
//   the corner half-plane in member-local space is z = x at the start, and
//   z = length - x at the end. Vertices outside the half-plane are clamped
//   onto it. Robust to whatever cross-section orientation the canonicaliser
//   produces, and never introduces the manifold issues CSG does at corners.
//
// Public surface:
//   buildMemberV2(profile, lengthMm, opts)         → THREE.BufferGeometry
//   buildFrameV2(W, H, slotProfiles, mat, opts)    → THREE.Group of 4 mitred meshes
//   disposeGroup(group)                            → recursive dispose for cleanup
//
// Coordinate convention (member-local, before placement):
//   x ∈ [0, sightlineMm]  — across the cross-section, exterior face at x=0
//   y ∈ [0, depthMm]      — through the cross-section, exterior at y=0, interior at y=depth
//   z ∈ [0, lengthMm]     — along the bar
//
// World placement: the member transforms in buildFrameV2 rotate/translate
// each member's local frame into world space. See buildFrameV2 for the four
// canonical mappings.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Three.Shape construction ──────────────────────────────────────────────
// Builds a THREE.Shape from a canonical profile. The hull is the outer
// contour (CCW); chambers become holes (CW). Coordinates are in millimetres
// — the caller is responsible for any scene-unit conversion.

function _shapeFromCanonical(profile) {
  if (!profile || !profile.outerHullMm || profile.outerHullMm.length < 3) {
    throw new Error('buildMemberV2: profile has no usable outerHullMm');
  }
  var hull = profile.outerHullMm;
  var sh = new THREE.Shape();
  sh.moveTo(hull[0][0], hull[0][1]);
  for (var i = 1; i < hull.length; i++) sh.lineTo(hull[i][0], hull[i][1]);
  // Note: THREE.Shape closes implicitly; do not add the closing duplicate.

  var chambers = profile.chambersMm || [];
  for (var ci = 0; ci < chambers.length; ci++) {
    var c = chambers[ci];
    if (!c || c.length < 3) continue;
    var hole = new THREE.Path();
    hole.moveTo(c[0][0], c[0][1]);
    for (var j = 1; j < c.length; j++) hole.lineTo(c[j][0], c[j][1]);
    sh.holes.push(hole);
  }
  return sh;
}

// ─── Vertex-plane mitre projection ─────────────────────────────────────────
// Applied AFTER ExtrudeGeometry has produced a vanilla bar, this clamps
// every vertex outside the corner half-planes onto them.
//
// Corner half-plane at z=0 end: { z >= x }
// Corner half-plane at z=length end: { z <= length - x }
//
// Vertices satisfying both (interior of the bar) are untouched. Vertices
// outside either are projected along the Z axis onto the plane — this is
// safe because the planes are "vertical" in (x, z) and don't depend on y.
//
// For typical frames (length >> sightline) the planes don't intersect,
// and this is a clean two-cut mitre. For very short members where the
// planes overlap (length < 2 * sightline) the result is geometrically
// degenerate — buildMemberV2 throws a guard error in that regime.

function _applyMitreEnds(geometry, lengthMm) {
  var pos = geometry.getAttribute('position');
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i);
    var z = pos.getZ(i);
    // Start mitre: clamp z up to x if it's below.
    if (z < x) pos.setZ(i, x);
    // End mitre: clamp z down to length - x if it's above.
    var endLimit = lengthMm - x;
    if (pos.getZ(i) > endLimit) pos.setZ(i, endLimit);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// ─── Build a single mitred member ──────────────────────────────────────────
//
// opts: {
//   bevelMm:          micro-bevel size for soft-edge highlights (default 1.0mm).
//                     Set 0 to disable. Bevel adds vertices near both ends
//                     that the mitre projection cleans up automatically.
//   scaleToMetres:    true if downstream renderer uses metres (default true,
//                     matching the rest of Spartan's scene). When true,
//                     output geometry is in metres; when false, in mm.
//   noMitre:          when true, skip the corner clipping (used for thresholds
//                     and other straight-cut members like sub-sills).
// }

function buildMemberV2(profile, lengthMm, opts) {
  opts = opts || {};
  if (!profile) throw new Error('buildMemberV2: profile is null');
  if (!(lengthMm > 0)) throw new Error('buildMemberV2: lengthMm must be > 0');

  // Sanity: if member is shorter than 2 × sightline, the two mitre planes
  // overlap and the result is degenerate.
  var sightline = profile.sightlineMm || (profile.bboxMm && profile.bboxMm.w) || 0;
  if (!opts.noMitre && lengthMm < 2 * sightline) {
    throw new Error('buildMemberV2: member length ' + lengthMm.toFixed(1) +
      'mm is shorter than 2× sightline ' + (2 * sightline).toFixed(1) +
      'mm; mitre would self-intersect (use opts.noMitre for straight-cut)');
  }

  var shape = _shapeFromCanonical(profile);
  var bevel = (opts.bevelMm == null) ? 1.0 : Math.max(0, opts.bevelMm);
  var extrudeSettings = {
    depth: lengthMm,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? 2 : 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    steps: 1,
  };

  var geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  if (!opts.noMitre) _applyMitreEnds(geo, lengthMm);
  else geo.computeVertexNormals();

  // Optional unit scaling. Default: convert mm → metres so the rest of
  // Spartan's scene (which uses metres throughout) doesn't need to know
  // about this module's mm-native operation.
  var scaleToMetres = opts.scaleToMetres !== false;
  if (scaleToMetres) {
    var pos = geo.getAttribute('position');
    for (var i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) / 1000, pos.getY(i) / 1000, pos.getZ(i) / 1000);
    }
    pos.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  }

  // Tag for diagnostic overlays / inspector tooltips.
  geo.userData = {
    profileId: profile.id || profile.code || profile.resolvedKey || '?',
    lengthMm: lengthMm,
    sightlineMm: sightline,
    depthMm: profile.depthMm || (profile.bboxMm && profile.bboxMm.h) || 0,
    bevelMm: bevel,
    mitred: !opts.noMitre,
    units: scaleToMetres ? 'm' : 'mm',
  };
  return geo;
}

// ─── World-frame placement maps ────────────────────────────────────────────
// Each member's local (x, y, z) maps into world (X, Y, Z) by one of these
// four reflections-plus-rotations. Reflections that flip an odd number of
// axes invert winding, so the geometry index buffer is reversed to keep
// triangle facing correct.

var _MEMBER_MAPS = {
  // Top: horizontal at +Y; outer face up; length runs left-to-right.
  // local x (sightline)        → world Y (downward to aperture)
  // local y (depth, ext→int)   → world Z
  // local z (length)           → world X
  top: {
    map: function(x, y, z, W, H, D) { return [z - W/2, H/2 - x, y - D/2]; },
    flipWinding: true,  // X-reflection across H/2 - x
  },
  bottom: {
    map: function(x, y, z, W, H, D) { return [z - W/2, -H/2 + x, y - D/2]; },
    flipWinding: false,
  },
  left: {
    map: function(x, y, z, W, H, D) { return [-W/2 + x, z - H/2, y - D/2]; },
    flipWinding: false,
  },
  right: {
    map: function(x, y, z, W, H, D) { return [W/2 - x, z - H/2, y - D/2]; },
    flipWinding: true,  // X-reflection across W/2 - x
  },
};

// Apply a member-side world placement to an already-extruded BufferGeometry.
// Operates in the geometry's current units — call this AFTER any unit
// scaling has happened.
function _placeMemberInWorld(geo, side, W, H, D) {
  var spec = _MEMBER_MAPS[side];
  if (!spec) throw new Error('_placeMemberInWorld: unknown side ' + side);
  var pos = geo.getAttribute('position');
  for (var i = 0; i < pos.count; i++) {
    var r = spec.map(pos.getX(i), pos.getY(i), pos.getZ(i), W, H, D);
    pos.setXYZ(i, r[0], r[1], r[2]);
  }
  pos.needsUpdate = true;
  if (spec.flipWinding) {
    var idx = geo.getIndex();
    if (idx) {
      var arr = idx.array;
      for (var k = 0; k < arr.length; k += 3) {
        var t = arr[k + 1]; arr[k + 1] = arr[k + 2]; arr[k + 2] = t;
      }
      idx.needsUpdate = true;
    }
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// ─── Build a complete mitred frame ─────────────────────────────────────────
//
// slotProfiles: {
//   frameTop:    CanonicalProfile,
//   frameBottom: CanonicalProfile,
//   frameLeft:   CanonicalProfile,
//   frameRight:  CanonicalProfile
// }
//
// The four can be the same profile (regular window) or different (door
// with a threshold profile on frameBottom). The world depth used for
// placement is the MAX depth across all four, so a thinner threshold sits
// flush with the thicker frame.
//
// Throws on any failure. Reports to SpartanDebug for the banner.

function buildFrameV2(W, H, slotProfiles, mat, opts) {
  opts = opts || {};
  var SD = (typeof SpartanDebug !== 'undefined') ? SpartanDebug : null;

  if (!slotProfiles) {
    var err = new Error('buildFrameV2: slotProfiles is null');
    if (SD) SD.fail('lastBuild', err, { stage: 'buildFrameV2' });
    throw err;
  }
  var sides = ['frameTop', 'frameBottom', 'frameLeft', 'frameRight'];
  for (var s = 0; s < sides.length; s++) {
    if (!slotProfiles[sides[s]]) {
      var e2 = new Error('buildFrameV2: missing profile for ' + sides[s]);
      if (SD) SD.fail('lastBuild', e2, { stage: 'buildFrameV2', slot: sides[s] });
      throw e2;
    }
  }

  var scaleToMetres = opts.scaleToMetres !== false;
  // Pick world depth = max of all member depths (in metres if scaling).
  var depths = sides.map(function(side) { return slotProfiles[side].depthMm; });
  var Dmm = Math.max.apply(null, depths);
  var D = scaleToMetres ? Dmm / 1000 : Dmm;
  // World W and H are passed in scene units (metres or mm — the caller is
  // consistent). Member length must match.
  // Convention: W and H are in metres if scaleToMetres else mm.
  var lenMmTop    = scaleToMetres ? W * 1000 : W;
  var lenMmBottom = scaleToMetres ? W * 1000 : W;
  var lenMmLeft   = scaleToMetres ? H * 1000 : H;
  var lenMmRight  = scaleToMetres ? H * 1000 : H;

  var grp = new THREE.Group();
  grp.userData = {
    kind: 'frame-v2',
    productType: opts.productType || null,
    sideProfiles: sides.reduce(function(o, side) { o[side] = slotProfiles[side].resolvedKey || slotProfiles[side].id; return o; }, {}),
  };

  var memberSpecs = [
    { side: 'top',    slot: 'frameTop',    lenMm: lenMmTop },
    { side: 'bottom', slot: 'frameBottom', lenMm: lenMmBottom },
    { side: 'left',   slot: 'frameLeft',   lenMm: lenMmLeft },
    { side: 'right',  slot: 'frameRight',  lenMm: lenMmRight },
  ];

  for (var m = 0; m < memberSpecs.length; m++) {
    var spec = memberSpecs[m];
    var profile = slotProfiles[spec.slot];
    var geo;
    try {
      geo = buildMemberV2(profile, spec.lenMm, {
        bevelMm: opts.bevelMm,
        scaleToMetres: scaleToMetres,
      });
    } catch (e) {
      if (SD) SD.fail('lastBuild', e, {
        stage: 'buildMemberV2', slot: spec.slot,
        profileId: profile.id || profile.resolvedKey, member: spec.side,
      });
      throw e;
    }
    _placeMemberInWorld(geo, spec.side, W, H, D);
    var mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = Object.assign({ member: spec.side, slot: spec.slot }, geo.userData);
    grp.add(mesh);
  }

  if (SD) SD.report('lastBuild', {
    profileId: 'frame-v2:' + (opts.productType || 'unknown'),
    member: 'frame',
    ok: true,
    meshes: grp.children.length,
    Wmm: lenMmTop, Hmm: lenMmLeft,
  });

  return grp;
}

// ─── Resource cleanup ──────────────────────────────────────────────────────
// Three.js does not auto-dispose. The scene-builder useEffect cleanup MUST
// call this on the previous group every time the frame is rebuilt, or the
// app leaks geometry across re-renders. (See research §9.)

function disposeGroup(group) {
  if (!group) return;
  group.traverse(function(obj) {
    if (obj.geometry && typeof obj.geometry.dispose === 'function') obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(function(mm) { if (typeof mm.dispose === 'function') mm.dispose(); });
      } else if (typeof obj.material.dispose === 'function') {
        obj.material.dispose();
      }
    }
  });
  if (group.parent) group.parent.remove(group);
}

if (typeof window !== 'undefined') {
  window.SpartanExtruder = {
    buildMemberV2: buildMemberV2,
    buildFrameV2: buildFrameV2,
    disposeGroup: disposeGroup,
  };
}
