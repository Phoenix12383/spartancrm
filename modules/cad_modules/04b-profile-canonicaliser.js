// ═══════════════════════════════════════════════════════════════════════════
// PROFILE CANONICALISER
//
// THE missing module per the 3D-rebuild research. Takes parser output (raw
// hull + chambers in DXF coordinates) and produces a canonical Profile with
// a strict, single coordinate convention that every downstream stage can
// rely on:
//
//     +X  = sightline   (face width when viewed from outside)
//     +Y  = depth       (interior at +Y, exterior at y = 0)
//     (0, 0) = exterior outer corner of the outer hull
//     Outer hull wound CCW; chambers wound CW
//     All units mm
//
// With this convention:
//   - member transforms in the extruder are pure rotations through origin
//   - the 45° corner mitre plane reduces to z = x (one line of code)
//   - rebate side is implicit (always +Y); downstream code never asks
//
// The canonicaliser detects the rebate side automatically by finding which
// of the four bbox sides has the deepest concavity, then rotates so that
// side is +Y. No more polygonOrient knob for the user to guess.
//
// Public surface:
//   canonicaliseProfile(rawHull, rawChambers, opts) → CanonicalProfile
//   validateCanonicalProfile(profile)               → { ok, errors[] }
//
// CanonicalProfile shape (matches research §4):
//   {
//     schemaVersion: 3,
//     units: 'mm',
//     outerHullMm:    [[x,y], ...],        // CCW, origin (0,0), no orient needed
//     chambersMm:     [[[x,y],...], ...],  // CW, in same canonical frame
//     bboxMm:         { w, h },            // post-canonical (sightline × depth)
//     sightlineMm:    number,
//     depthMm:        number,
//     rebate:         { side: 'interior'|'exterior'|'left'|'right', depthMm, openingMm },
//     validation:     { ok, isClosed, isSimple, isCcw, areaMm2, ... },
//     source: {
//       transformsApplied: [ { op, ..., reason }, ... ],
//       rebateConfidence:  0..1,
//       parsedHullPoints:  number,
//     }
//   }
// ═══════════════════════════════════════════════════════════════════════════

// ─── Geometry primitives ───────────────────────────────────────────────────

function _signedArea2D(pts) {
  // Shoelace. + = CCW, - = CW (in standard math Y-up).
  var a = 0;
  for (var i = 0; i < pts.length; i++) {
    var j = (i + 1) % pts.length;
    a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
  }
  return a / 2;
}

function _bboxOf(pts) {
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (var i = 0; i < pts.length; i++) {
    var x = pts[i][0], y = pts[i][1];
    if (x < xmin) xmin = x; if (y < ymin) ymin = y;
    if (x > xmax) xmax = x; if (y > ymax) ymax = y;
  }
  return { xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax, w: xmax - xmin, h: ymax - ymin };
}

function _dedupePts(pts, eps) {
  if (!pts.length) return [];
  eps = eps || 0.01;
  var out = [pts[0]];
  for (var i = 1; i < pts.length; i++) {
    var prev = out[out.length - 1], cur = pts[i];
    if (Math.abs(cur[0] - prev[0]) > eps || Math.abs(cur[1] - prev[1]) > eps) out.push(cur);
  }
  // Drop trailing point if it duplicates the first (closed-polygon wrap).
  if (out.length > 3) {
    var first = out[0], last = out[out.length - 1];
    if (Math.abs(first[0] - last[0]) < eps && Math.abs(first[1] - last[1]) < eps) out.pop();
  }
  return out;
}

// Test whether a polygon is simple (non-self-intersecting). O(n²); fine for
// profile-scale polygons (typically 50-500 points).
function _isSimplePolygon(pts) {
  var n = pts.length;
  if (n < 4) return true;
  function segIntersect(a, b, c, d) {
    function ccw(p, q, r) { return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); }
    var d1 = ccw(c, d, a), d2 = ccw(c, d, b), d3 = ccw(a, b, c), d4 = ccw(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return false;
  }
  for (var i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    for (var j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      var c = pts[j], d = pts[(j + 1) % n];
      if (segIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

// Apply rotation around origin (degrees). Pure function.
function _rotatePts(pts, deg) {
  var r = deg * Math.PI / 180;
  var cs = Math.cos(r), sn = Math.sin(r);
  return pts.map(function(p) { return [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs]; });
}

function _translatePts(pts, dx, dy) {
  return pts.map(function(p) { return [p[0] + dx, p[1] + dy]; });
}

function _flipYPts(pts, axis) {
  // Reflect across y = axis. Reverses winding.
  return pts.map(function(p) { return [p[0], 2 * axis - p[1]]; });
}

// ─── Rebate detection ──────────────────────────────────────────────────────
// Detect which bbox edge has been cut into by the rebate. Approach:
// "polygon-along-edge ratio" — for each bbox edge, sum the lengths of
// polygon segments that lie ALONG that edge (within a small tolerance),
// then divide by the bbox edge length. A non-rebated edge has ratio ≈ 1.0
// (the polygon hugs it); the rebated edge has ratio < 1.0 (some of its
// length is occupied by the notch instead).
//
// This is robust to:
//  - Asymmetric notches (a top notch doesn't pollute left/right metrics)
//  - Rotation (each side is measured independently)
//  - Different polygon point densities (we measure segment length, not count)
//
// Returns:
//   { side: 'top'|'bottom'|'left'|'right',
//     completeness: ratio along that edge,
//     confidence: 1 - completeness,  (deeper notch → higher confidence)
//     allSides: { top, bottom, left, right } completeness ratios }
//
// Confidence < 0.15 means the rebate isn't clearly on one side — could be
// a symmetric profile (mullion / transom) or a malformed import. Surface
// this in the import UI for the user to confirm.

function _detectRebateSide(hull) {
  var bb = _bboxOf(hull);
  var w = bb.w, h = bb.h;
  if (w <= 0 || h <= 0) return null;

  // Tolerance for "on the bbox edge". Tight enough to catch authoring
  // imprecision, loose enough not to miss segments that are slightly off.
  var TOL = Math.max(0.5, Math.min(w, h) * 0.005);

  var alongTop = 0, alongBot = 0, alongLeft = 0, alongRight = 0;

  for (var i = 0; i < hull.length; i++) {
    var a = hull[i];
    var b = hull[(i + 1) % hull.length];
    // A segment lies along the TOP edge if both endpoints have y ≈ ymax.
    if (Math.abs(a[1] - bb.ymax) < TOL && Math.abs(b[1] - bb.ymax) < TOL) {
      alongTop += Math.abs(b[0] - a[0]);
    }
    if (Math.abs(a[1] - bb.ymin) < TOL && Math.abs(b[1] - bb.ymin) < TOL) {
      alongBot += Math.abs(b[0] - a[0]);
    }
    if (Math.abs(a[0] - bb.xmin) < TOL && Math.abs(b[0] - bb.xmin) < TOL) {
      alongLeft += Math.abs(b[1] - a[1]);
    }
    if (Math.abs(a[0] - bb.xmax) < TOL && Math.abs(b[0] - bb.xmax) < TOL) {
      alongRight += Math.abs(b[1] - a[1]);
    }
  }

  // Ratios: 1.0 = polygon edge is the full bbox edge (no rebate)
  //         0.0 = polygon doesn't touch this edge at all (extreme)
  // Cap at 1.0 in case of slight overshoot from tolerance fuzz.
  var rTop   = Math.min(1, alongTop   / w);
  var rBot   = Math.min(1, alongBot   / w);
  var rLeft  = Math.min(1, alongLeft  / h);
  var rRight = Math.min(1, alongRight / h);

  // Pick the LOWEST ratio — that's the most-notched edge.
  var sides = [
    { name: 'top',    ratio: rTop },
    { name: 'bottom', ratio: rBot },
    { name: 'left',   ratio: rLeft },
    { name: 'right',  ratio: rRight },
  ];
  sides.sort(function(a, b) { return a.ratio - b.ratio; });
  var winner = sides[0];
  var runnerUp = sides[1];

  // Confidence = how much MORE notched the winner is vs the runner-up.
  // For a single-rebate profile, winner ≈ 0.5–0.7, others ≈ 1.0 → conf ≈ 0.3–0.5
  // For a two-rebate profile (sash with int+ext rebates), the deeper one wins
  // by a small margin → conf ≈ 0.05–0.15 (caller can flag uncertainty).
  // For a symmetric profile (mullion), all near 1.0 → conf ≈ 0.
  var confidence = Math.max(0, Math.min(1, runnerUp.ratio - winner.ratio));

  return {
    side: winner.name,
    completeness: winner.ratio,
    confidence: confidence,
    allSides: { top: rTop, bottom: rBot, left: rLeft, right: rRight },
  };
}

// ─── The main canonicaliser ────────────────────────────────────────────────
//
// Pipeline:
//   1. Dedupe points (within 0.01mm)
//   2. Hard-fail if < 3 points or area < 100mm² or bbox < 20mm
//   3. Hard-fail if self-intersecting
//   4. Detect rebate side
//   5. Build the rotation that puts the rebate on +Y (top)
//   6. Apply that rotation to hull + chambers
//   7. Translate so exterior outer corner = (0, 0)
//   8. Force CCW winding on hull
//   9. Force CW winding on chambers
//  10. Compute final bbox, sightline, depth, validation
//  11. Record every transform in source.transformsApplied
//
// opts:
//   { units: 'mm' (default) | 'in',
//     overrideRebateSide: 'top'|'bottom'|'left'|'right' (skips auto-detect),
//     scaleToMm: explicit factor if input isn't mm }

function canonicaliseProfile(rawHull, rawChambers, opts) {
  opts = opts || {};
  var transforms = [];
  var hull = (rawHull || []).slice();
  var chambers = (rawChambers || []).map(function(c) { return c.slice(); });

  // Step 0: unit handling. If input is inches, scale to mm. Heuristic
  // detection: if bbox is < 5 in any axis, assume inches (a frame profile
  // is at least 30mm sightline). The user can override via opts.scaleToMm.
  if (opts.scaleToMm && opts.scaleToMm !== 1) {
    var s = opts.scaleToMm;
    hull = hull.map(function(p) { return [p[0] * s, p[1] * s]; });
    chambers = chambers.map(function(c) { return c.map(function(p) { return [p[0] * s, p[1] * s]; }); });
    transforms.push({ op: 'scale', factor: s, reason: 'unit conversion' });
  } else {
    var bb0 = _bboxOf(hull);
    if (bb0.w < 5 && bb0.h < 5) {
      // Likely inches — scale ×25.4
      hull = hull.map(function(p) { return [p[0] * 25.4, p[1] * 25.4]; });
      chambers = chambers.map(function(c) { return c.map(function(p) { return [p[0] * 25.4, p[1] * 25.4]; }); });
      transforms.push({ op: 'scale', factor: 25.4, reason: 'auto-detected inch units' });
    }
  }

  // Step 1: dedupe
  var beforeDedupe = hull.length;
  hull = _dedupePts(hull, 0.01);
  if (hull.length !== beforeDedupe) {
    transforms.push({ op: 'dedupe', removed: beforeDedupe - hull.length, reason: 'duplicate / coincident points' });
  }
  chambers = chambers.map(function(c) { return _dedupePts(c, 0.01); }).filter(function(c) { return c.length >= 3; });

  // Step 2: hard validation
  if (hull.length < 3) {
    throw new Error('hull has < 3 points after dedupe');
  }
  var areaInitial = Math.abs(_signedArea2D(hull));
  if (areaInitial < 100) {
    throw new Error('hull area ' + areaInitial.toFixed(1) + 'mm² is too small (min 100mm²) — likely wrong units');
  }
  var bbInitial = _bboxOf(hull);
  if (bbInitial.w < 20 || bbInitial.h < 20) {
    throw new Error('hull bbox ' + bbInitial.w.toFixed(1) + '×' + bbInitial.h.toFixed(1) +
      'mm is too small for a window profile (min 20×20)');
  }

  // Step 3: simplicity check
  if (!_isSimplePolygon(hull)) {
    throw new Error('hull is self-intersecting — DXF authoring problem');
  }

  // Step 4: detect rebate side
  var rebate = opts.overrideRebateSide
    ? { side: opts.overrideRebateSide, depthMm: 0, confidence: 1, allSides: null }
    : _detectRebateSide(hull);

  // Step 5: rotation to put rebate on +Y (top)
  // Current bbox axes: top = +Y, bottom = -Y, left = -X, right = +X
  // We want rebate side → +Y. Rotation needed:
  //   top    → 0°    (already there)
  //   bottom → 180°
  //   left   → -90°  (counter-clockwise → +Y)... actually +90° (CCW puts -X side at +Y)
  //   right  → +90°  (CW)... actually -90°
  // Verify by tracking a marker point (mid of rebate side):
  //   bottom mid is (cx, ymin). Rotating 180°: (-cx, -ymin). Then we'd need
  //   to translate. Cleaner to rotate around bbox centre.
  var bb1 = _bboxOf(hull);
  var cx = (bb1.xmin + bb1.xmax) / 2;
  var cy = (bb1.ymin + bb1.ymax) / 2;
  var rotDeg = 0;
  if (rebate.side === 'top')         rotDeg = 0;
  else if (rebate.side === 'bottom') rotDeg = 180;
  else if (rebate.side === 'left')   rotDeg = -90;  // CW: left side → top
  else if (rebate.side === 'right')  rotDeg = 90;   // CCW: right side → top

  if (rotDeg !== 0) {
    // Rotate around bbox centre to keep coords nearby.
    hull = _translatePts(hull, -cx, -cy);
    hull = _rotatePts(hull, rotDeg);
    hull = _translatePts(hull, cx, cy);
    chambers = chambers.map(function(c) {
      c = _translatePts(c, -cx, -cy);
      c = _rotatePts(c, rotDeg);
      return _translatePts(c, cx, cy);
    });
    transforms.push({ op: 'rotate', deg: rotDeg, reason: 'rebate on ' + rebate.side + ' → +Y (interior)' });
  }

  // Step 6: flip Y so interior is at +Y (rebate side).
  // After the rotation above, the rebate IS on +Y, so this is identity.
  // We retain the explicit step in case future profile types need it.

  // Step 7: translate so the EXTERIOR outer corner is at (0,0).
  // After putting rebate (interior) at +Y, exterior is at -Y. The exterior
  // outer corner is the bottom-left of the new bbox: (xmin, ymin).
  var bb2 = _bboxOf(hull);
  var dx = -bb2.xmin, dy = -bb2.ymin;
  if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) {
    hull = _translatePts(hull, dx, dy);
    chambers = chambers.map(function(c) { return _translatePts(c, dx, dy); });
    transforms.push({ op: 'translate', dx: dx, dy: dy, reason: 'exterior outer corner → origin' });
  }

  // Step 8: force CCW winding on hull
  if (_signedArea2D(hull) < 0) {
    hull = hull.slice().reverse();
    transforms.push({ op: 'reverse', target: 'hull', reason: 'force CCW (THREE.Shape requires CCW outer)' });
  }
  // Step 9: force CW winding on chambers (they become THREE.Path holes)
  chambers = chambers.map(function(c) {
    if (_signedArea2D(c) > 0) return c.slice().reverse();
    return c;
  });

  // Step 10: final geometry summary
  var bb = _bboxOf(hull);
  var sightlineMm = +(bb.w.toFixed(2));
  var depthMm = +(bb.h.toFixed(2));
  var hullArea = Math.abs(_signedArea2D(hull));

  // Round all output points to 0.01mm — no useful precision below that and
  // it makes diffs/storage smaller.
  function r3(p) { return [+(p[0].toFixed(3)), +(p[1].toFixed(3))]; }
  hull = hull.map(r3);
  chambers = chambers.map(function(c) { return c.map(r3); });

  // Step 11: estimate rebate opening width (along sightline) and depth
  // (along Y). The rebate's mouth sits on the +Y edge after canonicalisation.
  // Find the longest run of points on +Y edge that are pulled inward more
  // than (depth × 0.05). Approximate; primarily for human inspection.
  var rebateOpening = 0, rebateMouthY = depthMm;
  (function() {
    if (rebate.confidence < 0.2) return;
    var threshold = depthMm * 0.95;  // points below this are inside rebate
    var minX = Infinity, maxX = -Infinity;
    for (var i = 0; i < hull.length; i++) {
      var x = hull[i][0], y = hull[i][1];
      if (y < threshold && y > depthMm * 0.5) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (isFinite(minX) && isFinite(maxX)) rebateOpening = maxX - minX;
  })();

  var canonical = {
    schemaVersion: 3,
    units: 'mm',
    outerHullMm: hull,
    chambersMm: chambers,
    bboxMm: { w: sightlineMm, h: depthMm },
    sightlineMm: sightlineMm,
    depthMm: depthMm,
    rebate: {
      side: 'interior',                                // always after canonicalisation
      sourceSide: rebate.side,                         // which DXF side it came from
      completeness: +(rebate.completeness.toFixed(3)), // 0–1, lower = deeper rebate
      openingMm: +(rebateOpening.toFixed(2)),
      confidence: +(rebate.confidence.toFixed(3)),
    },
    validation: {
      ok: true,
      isClosed: true,
      isSimple: true,
      isCcw: _signedArea2D(hull) > 0,
      areaMm2: +(hullArea.toFixed(2)),
      hullPoints: hull.length,
      chamberCount: chambers.length,
    },
    source: {
      transformsApplied: transforms,
      rebateConfidence: +(rebate.confidence.toFixed(3)),
      rebateSidesScan: rebate.allSides,
      parsedHullPoints: beforeDedupe,
    },
  };

  return canonical;
}

// ─── Validation (post-load, e.g. for catalog reads) ────────────────────────

function validateCanonicalProfile(p) {
  var errors = [];
  if (!p) errors.push('null profile');
  else {
    if (p.schemaVersion !== 3) errors.push('schemaVersion ' + p.schemaVersion + ' != 3');
    if (p.units !== 'mm') errors.push('units must be mm');
    if (!Array.isArray(p.outerHullMm) || p.outerHullMm.length < 3) errors.push('outerHullMm < 3 points');
    if (!p.bboxMm || !p.bboxMm.w || !p.bboxMm.h) errors.push('missing bboxMm');
    if (!p.sightlineMm || p.sightlineMm < 20) errors.push('sightlineMm too small');
    if (!p.depthMm || p.depthMm < 20) errors.push('depthMm too small');
    if (p.outerHullMm && p.outerHullMm.length >= 3) {
      if (_signedArea2D(p.outerHullMm) <= 0) errors.push('outerHullMm not CCW');
    }
  }
  return { ok: errors.length === 0, errors: errors };
}

// ─── Convenience: canonicalise from parser output ──────────────────────────
// Takes the result of normalizePolygons() (the parser's output) directly.

function canonicaliseFromParser(parsed, opts) {
  if (!parsed || !parsed.hull) throw new Error('parser returned no hull');
  var hullVerts = parsed.hull.vertices;
  var chamberVerts = (parsed.chambers || []).map(function(c) { return c.vertices; });
  return canonicaliseProfile(hullVerts, chamberVerts, opts);
}

// Expose to window for ad-hoc inspection.
if (typeof window !== 'undefined') {
  window.canonicaliseProfile = canonicaliseProfile;
  window.canonicaliseFromParser = canonicaliseFromParser;
  window.validateCanonicalProfile = validateCanonicalProfile;
}
