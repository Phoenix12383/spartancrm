// ═══════════════════════════════════════════════════════════════════════════
// DXF PARSER — minimal in-browser parser.
// Two entry points:
//   parseDxfPolylines(text)  — top-level scan; pulls LWPOLYLINE / POLYLINE
//                              that live directly in the ENTITIES section.
//                              Used by the per-profile geometry import.
//   parseDxfAssembly(text)   — full-section scan; pulls polylines + lines
//                              from BOTH the ENTITIES section AND every
//                              named block in BLOCKS, applies INSERT
//                              transforms, and groups by layer name.
//                              Used by the system-assembly viewer.
// Does NOT handle binary DWG (no reliable JS parser exists; export as DXF).
// ═══════════════════════════════════════════════════════════════════════════
function parseDxfPolylines(text) {
  var lines = text.split(/\r?\n/);
  var polys = [];
  var i = 0;
  function readPair() {
    if (i >= lines.length - 1) return null;
    var code = parseInt((lines[i] || '').trim(), 10);
    var val = (lines[i + 1] || '').trim();
    i += 2;
    return { code: code, val: val };
  }
  while (i < lines.length) {
    var p = readPair();
    if (!p) break;
    if (p.code !== 0) continue;
    if (p.val === 'LWPOLYLINE') {
      var verts = [], layer = '0', flags = 0, curX = null;
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) { i -= 2; break; }
        if (q.code === 8) layer = q.val;
        else if (q.code === 70) flags = parseInt(q.val, 10) || 0;
        else if (q.code === 10) curX = parseFloat(q.val);
        else if (q.code === 20 && curX !== null) {
          verts.push([curX, parseFloat(q.val)]);
          curX = null;
        }
      }
      if (verts.length >= 3) polys.push({ closed: !!(flags & 1), vertices: verts, layer: layer });
    } else if (p.val === 'POLYLINE') {
      var pverts = [], player = '0', pflags = 0;
      while (i < lines.length) {
        var q2 = readPair();
        if (!q2) break;
        if (q2.code === 0) {
          if (q2.val === 'VERTEX') {
            var vx = null, vy = null;
            while (i < lines.length) {
              var r = readPair();
              if (!r) break;
              if (r.code === 0) { i -= 2; break; }
              if (r.code === 10) vx = parseFloat(r.val);
              else if (r.code === 20) vy = parseFloat(r.val);
            }
            if (vx !== null && vy !== null) pverts.push([vx, vy]);
          } else if (q2.val === 'SEQEND') { break; }
          else { i -= 2; break; }
        }
        else if (q2.code === 8) player = q2.val;
        else if (q2.code === 70) pflags = parseInt(q2.val, 10) || 0;
      }
      if (pverts.length >= 3) polys.push({ closed: !!(pflags & 1), vertices: pverts, layer: player });
    }
  }
  return { polylines: polys };
}

// Auto-classify polylines: largest closed = hull, smaller closed inside = chambers.
// WIP41: also returns a `candidates` array so assembly DXFs (multiple profiles
// drawn side-by-side, e.g. a section view with frame + sash + bead) can be
// disambiguated by the user. Each candidate is one (hull, chambers) pair.
//
// The first candidate (largest area, ideally on a PVC_OUTSIDE layer) is
// promoted to top-level `hull` / `chambers` for back-compat with existing
// callers that don't know about `candidates`.
function autoClassifyPolylines(polys) {
  var closed = polys.filter(function(p) { return p.closed; });
  var others = polys.filter(function(p){return !p.closed;});
  if (closed.length === 0) return { hull: null, chambers: [], others: others, bbox: null, candidates: [] };
  function bboxOf(pts) {
    var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (var k = 0; k < pts.length; k++) {
      var x = pts[k][0], y = pts[k][1];
      if (x < xmin) xmin = x; if (y < ymin) ymin = y;
      if (x > xmax) xmax = x; if (y > ymax) ymax = y;
    }
    return { xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax, area: (xmax - xmin) * (ymax - ymin) };
  }
  function bboxContains(outer, inner) {
    return inner.xmin >= outer.xmin - 0.01 && inner.ymin >= outer.ymin - 0.01 &&
           inner.xmax <= outer.xmax + 0.01 && inner.ymax <= outer.ymax + 0.01;
  }
  // Layer-name hints: 'hull' (PVC_OUTSIDE), 'chamber' (PVC_INSIDE), 'accessory'
  // (glass, gasket, steel reinforcement, hatch — never extruded as profile),
  // or null (unknown — fall back to area-based classification).
  function classifyLayer(layer) {
    if (!layer) return null;
    var L = String(layer).toUpperCase();
    if (L.indexOf('PVC_OUTSIDE') >= 0) return 'hull';
    if (L.indexOf('PVC_INSIDE') >= 0)  return 'chamber';
    if (L.indexOf('GLASS') >= 0 || L.indexOf('GASKET') >= 0 || L.indexOf('STEEL') >= 0 || L.indexOf('HATCH') >= 0) return 'accessory';
    return null;
  }
  var withBbox = closed.map(function(p) { return Object.assign({}, p, { bbox: bboxOf(p.vertices), _kind: classifyLayer(p.layer) }); });
  withBbox.sort(function(a, b) { return b.bbox.area - a.bbox.area; });

  // Build candidate hulls: a closed polyline is a hull if (a) its layer kind
  // is 'hull', OR (b) layer kind is null/unknown AND no larger non-accessory
  // polyline strictly contains its bbox. 'chamber' and 'accessory' polys are
  // never hulls. Accessories are also never attached as chambers.
  var candidates = [];
  for (var i = 0; i < withBbox.length; i++) {
    var p = withBbox[i];
    if (p._kind === 'chamber' || p._kind === 'accessory') continue;
    // Is this contained by an earlier (larger) hull-eligible polyline?
    var contained = false;
    for (var k = 0; k < i; k++) {
      var q = withBbox[k];
      if (q._kind === 'chamber' || q._kind === 'accessory') continue;
      if (bboxContains(q.bbox, p.bbox)) { contained = true; break; }
    }
    if (contained) continue;
    candidates.push({ hull: p, chambers: [], _idx: i });
  }
  // Now attach every non-hull, non-accessory closed polyline to whichever
  // candidate hull contains it. Prefer the smallest containing hull.
  for (var j = 0; j < withBbox.length; j++) {
    var poly = withBbox[j];
    if (poly._kind === 'accessory') { others.push(poly); continue; }
    if (candidates.some(function(c){ return c._idx === j; })) continue;
    var bestC = null, bestArea = Infinity;
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci];
      if (bboxContains(cand.hull.bbox, poly.bbox) && cand.hull.bbox.area < bestArea) {
        bestC = cand; bestArea = cand.hull.bbox.area;
      }
    }
    if (bestC) bestC.chambers.push(poly);
    else others.push(poly);
  }
  // Strip the temp index. Sort candidates by area, largest first.
  candidates = candidates.map(function(c){ return { hull: c.hull, chambers: c.chambers }; });
  candidates.sort(function(a, b) { return b.hull.bbox.area - a.hull.bbox.area; });

  // Back-compat: top-level hull/chambers = first candidate.
  var first = candidates[0] || null;
  return {
    hull: first ? first.hull : null,
    chambers: first ? first.chambers : [],
    others: others,
    bbox: first ? first.hull.bbox : null,
    candidates: candidates,
  };
}

// Translate hull and chambers so hull bbox sits at (0,0).
//
// As of WIP44: also runs extractOuterSilhouette on the hull when chambers
// are present, replacing the raw "polyline that snakes through chamber
// walls" with a clean outer-perimeter trace. This is the auto-detection
// the user expects: import a DXF, see only the outer silhouette in the
// preview AND in the 3D extrusion. Original chamber polylines stay intact
// so chamber detail is still available where needed (Profile Manager
// detail view, milling-aware rebate depths, etc.).
function normalizePolygons(hull, chambers) {
  if (!hull) return { hull: hull, chambers: chambers };
  var dx = -hull.bbox.xmin;
  var dy = -hull.bbox.ymin;
  function tx(pts) { return pts.map(function(p) { return [+(p[0] + dx).toFixed(3), +(p[1] + dy).toFixed(3)]; }); }
  function bboxOf(pts) {
    var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (var k = 0; k < pts.length; k++) {
      var x = pts[k][0], y = pts[k][1];
      if (x < xmin) xmin = x; if (y < ymin) ymin = y;
      if (x > xmax) xmax = x; if (y > ymax) ymax = y;
    }
    return { xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax, area: (xmax - xmin) * (ymax - ymin) };
  }
  // First translate everything to origin
  var hullVerts = tx(hull.vertices);
  var chamberDefs = chambers.map(function(c) { var v = tx(c.vertices); return Object.assign({}, c, { vertices: v, bbox: bboxOf(v) }); });

  // Then auto-extract the outer silhouette using chamber boundaries to
  // identify chamber-wall trace segments. The original hull is kept under
  // `rawVertices` for any caller that wants the as-drawn polyline (e.g.
  // chamber-aware milling-rebate calculations that need the full path).
  var chamberVerts = chamberDefs.map(function(c){ return c.vertices; });
  var silhouette = (typeof extractOuterSilhouette === 'function')
    ? extractOuterSilhouette(hullVerts, chamberVerts, 0.5)
    : hullVerts;

  return {
    hull: Object.assign({}, hull, {
      vertices: silhouette,
      rawVertices: hullVerts,
      bbox: { xmin: 0, ymin: 0, xmax: hull.bbox.xmax + dx, ymax: hull.bbox.ymax + dy, area: hull.bbox.area }
    }),
    chambers: chamberDefs,
  };
}

// ─── extractOuterSilhouette ─────────────────────────────────────────────────
// Aluplast-style DXF profiles are typically drawn as ONE giant closed
// polyline that traces the entire cross-section in a single continuous
// stroke — outer wall, glazing rebate, hardware groove, AND every chamber
// wall that it can reach without lifting the pen. Plot it raw and you get
// a visible scribble winding through chamber territory. autoClassifyPolylines
// puts that polyline into outerHullMm and the genuine separate inner
// chamber polylines into chambersMm.
//
// This function reconstructs the true outer perimeter by walking the hull
// and dropping any segment whose midpoint sits ON a chamber edge (within
// `tolMm`). Those segments are by definition chamber-wall traces and not
// part of the outer silhouette. Adjacent chamber-wall segments collapse
// into one straight-line "shortcut" across the chamber, then a final
// colinear-point cleanup yields the clean perimeter.
//
// Critically, real outer notches (glazing rebates, weather-seal pockets,
// hardware grooves opening to the outside) are PRESERVED — those segments
// don't lie on chamber boundaries so they survive the filter.
//
// Falls through gracefully:
//   - No chambers ⇒ returns the input hull unchanged
//   - All segments coincident with chambers (degenerate) ⇒ returns input hull
//   - Output would be < 3 points ⇒ returns input hull
//
// Default tolerance (0.5mm) is loose enough to catch chamber walls drawn
// with sub-mm DXF rounding and tight enough to leave real notches intact.
function extractOuterSilhouette(hullPts, chambersPts, tolMm) {
  var TOL = tolMm != null ? tolMm : 0.5;
  if (!hullPts || hullPts.length < 4) return hullPts || [];
  if (!chambersPts || chambersPts.length === 0) return hullPts;

  function pointSegDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var L2 = dx * dx + dy * dy;
    if (L2 < 1e-12) {
      var ddx = p[0] - a[0], ddy = p[1] - a[1];
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    var t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    var qx = a[0] + t * dx, qy = a[1] + t * dy;
    var ex = p[0] - qx, ey = p[1] - qy;
    return Math.sqrt(ex * ex + ey * ey);
  }
  function midpointOnAnyChamberEdge(a, b) {
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    for (var c = 0; c < chambersPts.length; c++) {
      var ch = chambersPts[c];
      if (!ch || ch.length < 2) continue;
      var n = ch.length;
      // Stop one short if the polyline duplicates the closing point.
      var endIdx = (n > 2 && ch[0][0] === ch[n - 1][0] && ch[0][1] === ch[n - 1][1]) ? n - 1 : n;
      for (var i = 0; i < endIdx; i++) {
        var ca = ch[i], cb = ch[(i + 1) % n];
        if (pointSegDist([mx, my], ca, cb) < TOL) return true;
      }
    }
    return false;
  }

  // Walk the hull, accumulating only segments that aren't chamber traces.
  // Whenever we drop a segment (or run of segments), the next kept segment's
  // start auto-fills the gap as a straight line — i.e. the chamber excursion
  // is "shortcut" by the next outer-wall segment.
  var keep = [hullPts[0]];
  var droppedAny = false;
  for (var i = 0; i < hullPts.length - 1; i++) {
    var a = hullPts[i], b = hullPts[i + 1];
    if (midpointOnAnyChamberEdge(a, b)) {
      droppedAny = true;
      continue;
    }
    // Make sure 'a' is on the kept list (might have been dropped by the
    // previous iteration).
    var last = keep[keep.length - 1];
    if (last[0] !== a[0] || last[1] !== a[1]) keep.push(a);
    keep.push(b);
  }
  if (!droppedAny) return hullPts;
  if (keep.length < 3) return hullPts;

  // Collapse colinear midpoints (so a 4-corner outer rect with no notches
  // returns 4 points, not the 8-12 it might have post-shortcut).
  function colinearCleanup(pts, tol) {
    if (pts.length < 3) return pts;
    var out = [pts[0]];
    for (var k = 1; k < pts.length - 1; k++) {
      var aa = out[out.length - 1], bb = pts[k], cc = pts[k + 1];
      if (pointSegDist(bb, aa, cc) > tol) out.push(bb);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
  // Drop the closing-duplicate if any
  if (keep.length > 3) {
    var f = keep[0], l = keep[keep.length - 1];
    if (Math.abs(f[0] - l[0]) < 1e-3 && Math.abs(f[1] - l[1]) < 1e-3) keep.pop();
  }
  var cleaned = colinearCleanup(keep, 0.1);

  // Second pass: detect "tip spike" excursions left over when the chamber
  // polyline was traced without its entry/exit edges (rare but possible
  // with badly classified DXFs). A tip spike is a vertex where both edges
  // are extremely short AND nearly opposite-direction AND the start/end
  // points of the two edges are very close to each other (< 1mm).
  // This catches degenerate excursions while leaving real notches intact —
  // a real glazing rebate has its corners at well-separated positions and
  // wouldn't be flagged.
  function removeTipSpikes(pts) {
    if (pts.length < 5) return pts;
    var changed = true;
    var working = pts.slice();
    var maxIter = 10;
    while (changed && maxIter-- > 0) {
      changed = false;
      var n = working.length;
      var out = [];
      for (var i = 0; i < n; i++) {
        var prev = working[(i - 1 + n) % n];
        var cur  = working[i];
        var next = working[(i + 1) % n];
        var prevNextDx = next[0] - prev[0];
        var prevNextDy = next[1] - prev[1];
        var prevNextDist = Math.sqrt(prevNextDx * prevNextDx + prevNextDy * prevNextDy);
        if (prevNextDist < 1.0) {       // prev and next are within 1mm of each other
          var d1x = cur[0] - prev[0], d1y = cur[1] - prev[1];
          var d2x = next[0] - cur[0], d2y = next[1] - cur[1];
          var len1 = Math.sqrt(d1x*d1x + d1y*d1y);
          var len2 = Math.sqrt(d2x*d2x + d2y*d2y);
          if (len1 > 0.1 && len2 > 0.1) {
            var dot = (d1x*d2x + d1y*d2y) / (len1 * len2);
            if (dot < -0.85) {           // nearly perfectly opposite
              changed = true;
              continue;                  // skip cur — collapses the spike
            }
          }
        }
        out.push(cur);
      }
      working = out;
    }
    return working;
  }
  var despike = removeTipSpikes(cleaned);
  despike = colinearCleanup(despike, 0.1);

  if (despike.length < 3) return hullPts;
  return despike;
}

// ─── parseDxfAssembly ──────────────────────────────────────────────────────
// Full DXF parser for an entire assembly section drawing. Unlike the simpler
// parseDxfPolylines above, this:
//   • Walks BOTH the ENTITIES section AND each named block in BLOCKS
//   • Resolves nested INSERT entities (block references with translate/scale)
//   • Captures LINE entities in addition to polylines
//   • Preserves the 'layer' string on every primitive so the renderer can
//     style by layer (PVC_INSIDE, PVC_OUTSIDE, STEEL_OUTSIDE, HATCH_GLASS,
//     HATCH_GASKET, GLAZING_PACKER, etc.)
//
// Returns:
//   { primitives: [ { kind: 'polyline'|'line', layer, vertices, closed }, ... ],
//     bbox: { xmin, ymin, xmax, ymax, w, h },
//     layers: { layerName: count, ... } }
//
// Limitations (fine for cross-section schematics):
//   • Doesn't render HATCH fill explicitly — instead, when a HATCH_* layer is
//     encountered, its boundary path is captured as a closed polyline so the
//     renderer can fill it with the layer's colour.
//   • Doesn't read DIMENSION blocks (skipped — usually system/template noise).
//   • INSERT scale is applied on X/Y; rotation isn't applied (rare in section
//     drawings). If a system DXF needs rotation, we can extend.
function parseDxfAssembly(text) {
  var lines = text.split(/\r?\n/);
  var i = 0;
  function readPair() {
    if (i >= lines.length - 1) return null;
    var code = parseInt((lines[i] || '').trim(), 10);
    var val = (lines[i + 1] || '').trim();
    i += 2;
    return { code: code, val: val };
  }
  // ─── Pass 1 — index BLOCKS by name, with their primitives ──────────────
  // Each block keeps a list of primitives plus any nested INSERT references
  // we'll resolve in pass 2.
  var blocks = {};
  var topPrimitives = [];
  var inSection = null;       // 'ENTITIES' | 'BLOCKS' | other section name
  var currentBlock = null;    // when inside a BLOCK definition

  function eatEntity(typeName, sink) {
    // Consume DXF group-code pairs for one entity, dispatching to the right
    // primitive shape and pushing onto sink.
    if (typeName === 'LWPOLYLINE') {
      var verts = [], layer = '0', flags = 0, curX = null;
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) { i -= 2; break; }
        if (q.code === 8) layer = q.val;
        else if (q.code === 70) flags = parseInt(q.val, 10) || 0;
        else if (q.code === 10) curX = parseFloat(q.val);
        else if (q.code === 20 && curX !== null) { verts.push([curX, parseFloat(q.val)]); curX = null; }
      }
      if (verts.length >= 2) sink.push({ kind: 'polyline', layer: layer, vertices: verts, closed: !!(flags & 1) });
    } else if (typeName === 'POLYLINE') {
      var pverts = [], player = '0', pflags = 0;
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) {
          if (q.val === 'VERTEX') {
            var vx = null, vy = null;
            while (i < lines.length) {
              var r = readPair();
              if (!r) break;
              if (r.code === 0) { i -= 2; break; }
              if (r.code === 10) vx = parseFloat(r.val);
              else if (r.code === 20) vy = parseFloat(r.val);
            }
            if (vx !== null && vy !== null) pverts.push([vx, vy]);
          } else if (q.val === 'SEQEND') { break; }
          else { i -= 2; break; }
        }
        else if (q.code === 8) player = q.val;
        else if (q.code === 70) pflags = parseInt(q.val, 10) || 0;
      }
      if (pverts.length >= 2) sink.push({ kind: 'polyline', layer: player, vertices: pverts, closed: !!(pflags & 1) });
    } else if (typeName === 'LINE') {
      var x1 = 0, y1 = 0, x2 = 0, y2 = 0, llayer = '0';
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) { i -= 2; break; }
        if (q.code === 8) llayer = q.val;
        else if (q.code === 10) x1 = parseFloat(q.val);
        else if (q.code === 20) y1 = parseFloat(q.val);
        else if (q.code === 11) x2 = parseFloat(q.val);
        else if (q.code === 21) y2 = parseFloat(q.val);
      }
      sink.push({ kind: 'line', layer: llayer, vertices: [[x1, y1], [x2, y2]] });
    } else if (typeName === 'HATCH') {
      // Capture only boundary polyline path vertices; ignore the rest of
      // the HATCH entity (pattern definition, elevation point, etc.).
      //
      // HATCH structure (relevant subset):
      //   8  = layer
      //   91 = number of boundary paths      ← starts boundary section
      //   92 = path-type flag (bit 1 set means this path is a polyline)
      //   72 = polyline has bulge (only if path type bit 1)
      //   73 = polyline is closed             (only if path type bit 1)
      //   93 = vertex count                   ← starts vertex list
      //   10/20 = vertex coords × 93 times
      //   42 = bulge per vertex (interleaved if 72 said yes)
      //   97 = source-boundary-objects count   ← ends vertex list
      //   75 = hatch style                    ← starts pattern section
      //   76 = pattern type
      //   ...code 10/20 here is pattern definition data — must skip
      //
      // Strategy: we only add 10/20 pairs to verts when the most recent
      // numeric "section header" code was 93 (vertex count). After 97 or
      // 75 appears, we're out of the boundary path's vertex region.
      var hlayer = '0', hverts = [];
      var inVertexList = false;
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) { i -= 2; break; }
        if (q.code === 8) hlayer = q.val;
        else if (q.code === 93) inVertexList = true;
        else if (q.code === 97 || q.code === 75 || q.code === 78 || q.code === 76 || q.code === 91) {
          // 97 = source boundary objects count (after vertices)
          // 75/76/78 = pattern style/type/lines
          // 91 reset (next path) — vertex list also ends
          inVertexList = false;
        }
        else if (q.code === 10 && inVertexList) {
          var hx = parseFloat(q.val);
          var nxt = readPair();
          if (nxt && nxt.code === 20) hverts.push([hx, parseFloat(nxt.val)]);
          else if (nxt) i -= 2;  // not a code-20 pair, give it back
        }
      }
      if (hverts.length >= 3) sink.push({ kind: 'polyline', layer: hlayer, vertices: hverts, closed: true, hatch: true });
    } else if (typeName === 'INSERT') {
      // Block reference — record it; pass 2 will expand it.
      // Group codes:
      //   2  = block name
      //   10/20 = insert anchor (X,Y) in WCS
      //   41/42 = X/Y scale
      //   50 = rotation in degrees (counter-clockwise, around the insert anchor)
      var blockName = '', ix = 0, iy = 0, sx = 1, sy = 1, rot = 0, ilayer = '0';
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) { i -= 2; break; }
        if (q.code === 2) blockName = q.val;
        else if (q.code === 8) ilayer = q.val;
        else if (q.code === 10) ix = parseFloat(q.val);
        else if (q.code === 20) iy = parseFloat(q.val);
        else if (q.code === 41) sx = parseFloat(q.val) || 1;
        else if (q.code === 42) sy = parseFloat(q.val) || 1;
        else if (q.code === 50) rot = parseFloat(q.val) || 0;
      }
      sink.push({ kind: 'insert', layer: ilayer, blockName: blockName, dx: ix, dy: iy, sx: sx, sy: sy, rot: rot });
    } else {
      // Unknown / unhandled entity — skip group codes until the next 0-code.
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) { i -= 2; break; }
      }
    }
  }

  while (i < lines.length) {
    var p = readPair();
    if (!p) break;
    if (p.code === 0) {
      if (p.val === 'SECTION') {
        // Read the section type from the next 2-pair
        var sec = readPair();
        if (sec && sec.code === 2) inSection = sec.val;
        continue;
      } else if (p.val === 'ENDSEC') { inSection = null; currentBlock = null; continue; }
      if (inSection === 'BLOCKS') {
        if (p.val === 'BLOCK') {
          // BLOCK header carries:
          //   2 = name, 10/20 = base point (relative origin for the block's
          //   primitives — INSERT effectively translates by (insertPoint − basePoint))
          var bname = '', bx = 0, by = 0;
          while (i < lines.length) {
            var q = readPair();
            if (!q) break;
            if (q.code === 0) { i -= 2; break; }
            if (q.code === 2) bname = q.val;
            else if (q.code === 10) bx = parseFloat(q.val);
            else if (q.code === 20) by = parseFloat(q.val);
          }
          currentBlock = { name: bname, primitives: [], baseX: bx, baseY: by };
          blocks[bname] = currentBlock;
          continue;
        } else if (p.val === 'ENDBLK') { currentBlock = null; continue; }
        if (currentBlock) eatEntity(p.val, currentBlock.primitives);
        else { /* skip stray ENDBLK headers etc */
          while (i < lines.length) {
            var q = readPair();
            if (!q) break;
            if (q.code === 0) { i -= 2; break; }
          }
        }
      } else if (inSection === 'ENTITIES') {
        eatEntity(p.val, topPrimitives);
      } else {
        // Skip group codes inside HEADER/CLASSES/TABLES/OBJECTS
        while (i < lines.length) {
          var q = readPair();
          if (!q) break;
          if (q.code === 0) { i -= 2; break; }
        }
      }
    }
  }

  // ─── Pass 2 — expand INSERT references recursively ─────────────────────
  // DXF block-instancing model: an INSERT positions a BLOCK at an anchor
  // point in WCS, scaled and rotated. The block's primitives are drawn in
  // the block's local coordinate system, with the block's base point
  // (group codes 10/20 on the BLOCK header) acting as the origin.
  //
  // The transform applied to each primitive vertex is:
  //   (1) Subtract block base point → primitive relative to block origin
  //   (2) Scale by sx/sy
  //   (3) Rotate by rot degrees CCW around origin
  //   (4) Translate by INSERT insert point (in WCS)
  //
  // Nested INSERTs compose: the parent transform is applied AFTER the
  // child's transform — so we represent the cumulative transform as a 2x3
  // affine matrix [a, b, c, d, e, f] meaning x' = a*x + c*y + e,
  // y' = b*x + d*y + f. Composition is matrix multiplication.
  var resolved = [];
  function applyMatrix(m, x, y) {
    return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
  }
  function multiplyMatrices(A, B) {
    // A * B — A is the parent transform (applied last to the child's coords)
    // Returned matrix M such that applyMatrix(M, v) = applyMatrix(A, applyMatrix(B, v))
    return [
      A[0]*B[0] + A[2]*B[1],
      A[1]*B[0] + A[3]*B[1],
      A[0]*B[2] + A[2]*B[3],
      A[1]*B[2] + A[3]*B[3],
      A[0]*B[4] + A[2]*B[5] + A[4],
      A[1]*B[4] + A[3]*B[5] + A[5],
    ];
  }
  function insertMatrix(insert, baseX, baseY) {
    // Compose: T(insert) * R(rot) * S(sx,sy) * T(-base)
    var rad = (insert.rot || 0) * Math.PI / 180;
    var c = Math.cos(rad), s = Math.sin(rad);
    var sx = insert.sx, sy = insert.sy;
    // S(sx,sy) * T(-base) = [sx, 0, 0, sy, -sx*baseX, -sy*baseY]
    var SBT = [sx, 0, 0, sy, -sx*baseX, -sy*baseY];
    // R * SBT
    var RSBT = [
      c*SBT[0] - s*SBT[1],
      s*SBT[0] + c*SBT[1],
      c*SBT[2] - s*SBT[3],
      s*SBT[2] + c*SBT[3],
      c*SBT[4] - s*SBT[5],
      s*SBT[4] + c*SBT[5],
    ];
    // T(insert) * RSBT
    return [RSBT[0], RSBT[1], RSBT[2], RSBT[3], RSBT[4] + insert.dx, RSBT[5] + insert.dy];
  }
  var IDENTITY = [1, 0, 0, 1, 0, 0];
  function expand(prims, parentMatrix, depth) {
    if (depth > 8) return;  // safety net for circular refs
    for (var n = 0; n < prims.length; n++) {
      var pr = prims[n];
      if (pr.kind === 'insert') {
        var blk = blocks[pr.blockName];
        if (!blk) continue;
        var local = insertMatrix(pr, blk.baseX || 0, blk.baseY || 0);
        var combined = multiplyMatrices(parentMatrix, local);
        expand(blk.primitives, combined, depth + 1);
      } else {
        var newVerts = pr.vertices.map(function(v) {
          return applyMatrix(parentMatrix, v[0], v[1]);
        });
        resolved.push({ kind: pr.kind, layer: pr.layer, vertices: newVerts, closed: pr.closed, hatch: pr.hatch });
      }
    }
  }
  expand(topPrimitives, IDENTITY, 0);

  // ─── Compute bounding box + layer counts ───────────────────────────────
  var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  var layerCounts = {};
  for (var k = 0; k < resolved.length; k++) {
    var pr = resolved[k];
    layerCounts[pr.layer] = (layerCounts[pr.layer] || 0) + 1;
    for (var m = 0; m < pr.vertices.length; m++) {
      var x = pr.vertices[m][0], y = pr.vertices[m][1];
      if (x < xmin) xmin = x;
      if (y < ymin) ymin = y;
      if (x > xmax) xmax = x;
      if (y > ymax) ymax = y;
    }
  }
  var bbox = {
    xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax,
    w: xmax - xmin, h: ymax - ymin,
  };
  return { primitives: resolved, bbox: bbox, layers: layerCounts };
}

// ─── Assembly layer styling ────────────────────────────────────────────────
// Maps layer-name patterns onto fill/stroke colours used by the assembly
// viewer. Patterns are matched in order; first match wins. Falls back to a
// neutral grey for unrecognised layers. The full set covers Aluplast's own
// section-drawing convention plus common third-party additions.
var ASSEMBLY_LAYER_STYLES = [
  { match: /^STEEL/i,                            fill: '#94a3b8', stroke: '#475569', strokeWidth: 0.5, label: 'Steel reinforcement' },
  { match: /^HATCH_STEEL$/i,                     fill: '#cbd5e1', stroke: '#64748b', strokeWidth: 0.3, label: 'Steel reinforcement (hatch)' },
  { match: /^GLASS|^HATCH_GLASS/i,               fill: '#bfdbfe', stroke: '#3b82f6', strokeWidth: 0.4, label: 'Glass / DGU', opacity: 0.5 },
  { match: /^GASKET|^HATCH_GASKET/i,             fill: '#1f2937', stroke: '#1f2937', strokeWidth: 0.3, label: 'Gasket / EPDM' },
  { match: /^GLAZING_PACKER/i,                   fill: '#fde68a', stroke: '#b45309', strokeWidth: 0.4, label: 'Glazing packer' },
  { match: /^PVC_OUTSIDE|^PVC_EXTERIOR/i,        fill: '#f8fafc', stroke: '#0f172a', strokeWidth: 0.6, label: 'PVC profile (exterior)' },
  { match: /^PVC_INSIDE|^PVC_INTERIOR/i,         fill: '#f1f5f9', stroke: '#0f172a', strokeWidth: 0.6, label: 'PVC profile (interior)' },
  { match: /^PVC/i,                              fill: '#f5f3ee', stroke: '#1f2937', strokeWidth: 0.5, label: 'PVC profile' },
  { match: /^CONTOUR/i,                          fill: 'none',    stroke: '#1f2937', strokeWidth: 0.4, label: 'Contour' },
  { match: /^DIM/i,                              fill: 'none',    stroke: '#9ca3af', strokeWidth: 0.2, label: 'Dimension', dim: true },
  { match: /^Defpoints/i,                        skip: true },
  { match: /^ASSEMBLY/i,                         fill: 'none',    stroke: '#7c3aed', strokeWidth: 0.5, label: 'Assembly guide' },
];
function styleForLayer(layerName) {
  for (var n = 0; n < ASSEMBLY_LAYER_STYLES.length; n++) {
    var s = ASSEMBLY_LAYER_STYLES[n];
    if (s.match.test(layerName || '')) return s;
  }
  return { fill: '#e5e7eb', stroke: '#6b7280', strokeWidth: 0.3, label: layerName || 'unlabelled' };
}

// ─── renderAssemblySvg ─────────────────────────────────────────────────────
// Render an assembly parse result as inline SVG. Each primitive becomes a
// <polygon>/<polyline>/<line> in its layer-derived style. The viewBox is
// auto-fit to the bbox with a small pad. Returns markup ready for
// dangerouslySetInnerHTML.
//
// Options:
//   padPx        — padding around bbox (default 8)
//   showDimensions — include layers matching DIM* (default false; they're
//                    usually visual noise unless specifically requested)
//   showLabels   — overlay layer-name text labels (default false; debug aid)
//   widthPx, heightPx — explicit SVG dimensions (default fluid 100%/100%)
//   rotateDeg    — rotate the whole drawing (handy for sideways DXF imports;
//                  use 90 or -90 to right the section).
function renderAssemblySvg(parsed, opts) {
  if (!parsed || !parsed.primitives || !parsed.primitives.length) return '';
  opts = opts || {};
  var pad = opts.padPx != null ? opts.padPx : 8;
  var showDim = !!opts.showDimensions;
  var rotate = +(opts.rotateDeg || 0);
  var bb = parsed.bbox;
  var W = bb.w, H = bb.h;

  // Build SVG body
  var body = '';
  // Group by layer so legend & ordering are predictable. Render in a
  // sensible Z-order: GLASS at bottom, then PVC, then GASKET on top,
  // STEEL above PVC, GLAZING_PACKER above STEEL, dimensions last.
  var zOrder = ['^HATCH_GLASS', '^GLASS', '^PVC', '^GLAZING_PACKER', '^STEEL', '^HATCH_STEEL', '^GASKET', '^HATCH_GASKET', '^CONTOUR', '^ASSEMBLY', '^DIM'];
  function zIndex(layer) {
    for (var z = 0; z < zOrder.length; z++) if (new RegExp(zOrder[z], 'i').test(layer || '')) return z;
    return zOrder.length;
  }
  var prims = parsed.primitives.slice().sort(function(a, b) { return zIndex(a.layer) - zIndex(b.layer); });
  for (var n = 0; n < prims.length; n++) {
    var pr = prims[n];
    var st = styleForLayer(pr.layer);
    if (st.skip) continue;
    if (st.dim && !showDim) continue;
    var pts = pr.vertices.map(function(v){ return (v[0] - bb.xmin).toFixed(2) + ',' + (bb.ymax - v[1] + bb.ymin - bb.ymin).toFixed(2); }).join(' ');
    var op = (st.opacity != null ? ' fill-opacity="' + st.opacity + '"' : '');
    if (pr.kind === 'line') {
      var v0 = pr.vertices[0], v1 = pr.vertices[1];
      body += '<line x1="' + (v0[0] - bb.xmin).toFixed(2) + '" y1="' + (bb.ymax - v0[1]).toFixed(2) +
                  '" x2="' + (v1[0] - bb.xmin).toFixed(2) + '" y2="' + (bb.ymax - v1[1]).toFixed(2) +
                  '" stroke="' + st.stroke + '" stroke-width="' + st.strokeWidth + '" stroke-linecap="round"/>';
    } else if (pr.closed || pr.hatch) {
      body += '<polygon points="' + pts + '" fill="' + st.fill + '"' + op +
              ' stroke="' + st.stroke + '" stroke-width="' + st.strokeWidth + '" stroke-linejoin="round"/>';
    } else {
      body += '<polyline points="' + pts + '" fill="none" stroke="' + st.stroke +
              '" stroke-width="' + st.strokeWidth + '" stroke-linecap="round" stroke-linejoin="round"/>';
    }
  }
  var vb = (-pad) + ' ' + (-pad) + ' ' + (W + 2*pad) + ' ' + (H + 2*pad);
  var transform = '';
  if (rotate) {
    transform = ' transform="rotate(' + rotate + ' ' + (W/2) + ' ' + (H/2) + ')"';
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb +
         '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;">' +
         '<g' + transform + '>' + body + '</g></svg>';
}

if (typeof window !== 'undefined') {
  window.parseDxfAssembly = parseDxfAssembly;
  window.renderAssemblySvg = renderAssemblySvg;
  window.styleForLayer = styleForLayer;
  window.ASSEMBLY_LAYER_STYLES = ASSEMBLY_LAYER_STYLES;
  window.measureAssembly = measureAssembly;
}

// ─── measureAssembly ───────────────────────────────────────────────────────
// Inspects a parsed DXF assembly section and extracts the dimensions that
// drive cut sizes:
//
//   glassRebateDepthMm       — depth of the channel that holds the DGU
//                              (HATCH_GLASS bbox, smaller dimension)
//   glassRebateHeightMm      — height of the rebate channel
//                              (HATCH_GLASS bbox, larger dimension)
//   glazingPackerThicknessMm — packer between glass and PVC chamber base
//                              (GLAZING_PACKER bbox, smaller dimension)
//   frameSashOverlapMm       — how much the sash perimeter overlaps the frame
//                              perimeter (gap between PVC clusters)
//   sashGlassClearanceMm     — total clearance (W & H) between glass pane
//                              edge and the PVC rebate inner wall
//                              (rebate channel inner − DGU width)
//   frameSightlineMm, sashSightlineMm — for sanity-check vs profile catalog
//
// Returns null if the DXF has no resolvable section structure.
//
// Strategy: filter primitives to the "main section" cluster (within ±300mm
// of origin to discard scrap entities far away), then bucket by layer name.
// Each metric is a derived measurement on the relevant bucket — typically a
// bbox dimension, sometimes the gap between two clusters.
function measureAssembly(parsed) {
  if (!parsed || !parsed.primitives || !parsed.primitives.length) return null;

  // Find the section "centre". The bbox centroid is unreliable when the
  // DXF has scattered scrap entities (e.g. HATCH_GASKET dragged off the
  // canvas). Instead use the median centroid of small primitives — most
  // section primitives are <100mm in any dimension, and the median will
  // sit firmly inside the actual section even if a few large scrap polys
  // pull the bbox elsewhere.
  var centroids = [];
  parsed.primitives.forEach(function(p) {
    var pb = bboxOfPrim(p);
    // Only consider primitives that look like section content
    if (pb.w > 200 || pb.h > 200) return;
    centroids.push([(pb.xmin + pb.xmax) / 2, (pb.ymin + pb.ymax) / 2]);
  });
  if (centroids.length < 3) return null;
  var xs = centroids.map(function(c){return c[0];}).sort(function(a,b){return a-b;});
  var ys = centroids.map(function(c){return c[1];}).sort(function(a,b){return a-b;});
  var cx = xs[Math.floor(xs.length / 2)];
  var cy = ys[Math.floor(ys.length / 2)];

  // Bucket primitives within ±400mm of the median centroid
  var byLayer = {};
  parsed.primitives.forEach(function(p) {
    var pb = bboxOfPrim(p);
    var primCx = (pb.xmin + pb.xmax) / 2;
    var primCy = (pb.ymin + pb.ymax) / 2;
    if (Math.abs(primCx - cx) > 400 || Math.abs(primCy - cy) > 400) return;
    if (pb.w > 600 || pb.h > 600) return;
    if (!byLayer[p.layer]) byLayer[p.layer] = [];
    byLayer[p.layer].push(p);
  });

  function bboxOfList(prims) {
    if (!prims || !prims.length) return null;
    var xmin=Infinity, ymin=Infinity, xmax=-Infinity, ymax=-Infinity;
    prims.forEach(function(p) {
      p.vertices.forEach(function(v) {
        if (v[0]<xmin) xmin=v[0]; if (v[1]<ymin) ymin=v[1];
        if (v[0]>xmax) xmax=v[0]; if (v[1]>ymax) ymax=v[1];
      });
    });
    return { xmin:xmin, ymin:ymin, xmax:xmax, ymax:ymax, w:xmax-xmin, h:ymax-ymin };
  }
  // Find layers matching any of a set of regexes (for fuzzy layer naming —
  // not all DXFs use the exact Aluplast convention).
  function layersMatching(patterns) {
    var matched = [];
    Object.keys(byLayer).forEach(function(l) {
      for (var i = 0; i < patterns.length; i++) {
        if (patterns[i].test(l)) { matched.push(l); break; }
      }
    });
    return matched;
  }
  function bboxOfLayers(patterns) {
    var ls = layersMatching(patterns);
    var prims = [];
    ls.forEach(function(l) { prims = prims.concat(byLayer[l] || []); });
    return bboxOfList(prims);
  }

  // ─── Glass rebate ──────────────────────────────────────────────────────
  // The channel holding the DGU. Its inside-PVC dimensions are the bbox
  // of HATCH_GLASS (or any GLASS_*) layer. The smaller dimension = rebate
  // depth (perpendicular to glass face); larger = rebate height (parallel).
  var glassBbox = bboxOfLayers([/^HATCH_GLASS/i, /^GLASS_GLASS/i, /^GLASS\b/i]);
  var glassRebateDepthMm = null, glassRebateHeightMm = null;
  if (glassBbox) {
    glassRebateDepthMm  = Math.round(Math.min(glassBbox.w, glassBbox.h) * 10) / 10;
    glassRebateHeightMm = Math.round(Math.max(glassBbox.w, glassBbox.h) * 10) / 10;
  }

  // ─── Glazing packer ────────────────────────────────────────────────────
  var packerBbox = bboxOfLayers([/^GLAZING_PACKER/i, /^PACKER/i]);
  var glazingPackerThicknessMm = packerBbox ? Math.round(Math.min(packerBbox.w, packerBbox.h) * 10) / 10 : null;

  // ─── PVC profile clusters → identify frame vs sash ─────────────────────
  // Each PVC profile in the assembly is a connected group of polygons.
  // Cluster by bbox-overlap (within 5mm tolerance), then sort by area.
  // Largest two clusters = frame (top) + sash (bottom) on a horizontal head
  // section, or left/right on a jamb section. Distinguish by relative
  // position: in a head section the frame sits ABOVE the sash; in a jamb
  // section the frame sits OUTBOARD (away from the glass).
  //
  // Only use PVC_OUTSIDE for clustering — those are the clean exterior
  // silhouettes of each profile (one polygon per profile member). Mixing
  // PVC_INSIDE in muddles the bboxes since inner polygons can wander
  // beyond the silhouette in some Aluplast drawings.
  var pvcOutside = byLayer.PVC_OUTSIDE || [];
  var pvcOutsideKeys = Object.keys(byLayer).filter(function(l) { return /^PVC_OUTSIDE/i.test(l) || /^PVC_EXTERIOR/i.test(l); });
  var allPvc = [];
  pvcOutsideKeys.forEach(function(l) { allPvc = allPvc.concat(byLayer[l] || []); });
  // Fallback: if no PVC_OUTSIDE, use all PVC layers (some DXFs use a single
  // PVC layer; better to over-cluster than to find nothing).
  if (!allPvc.length) {
    Object.keys(byLayer).forEach(function(l) {
      if (/^PVC/i.test(l)) allPvc = allPvc.concat(byLayer[l] || []);
    });
  }

  var clusters = [];
  allPvc.forEach(function(p) {
    var pb = bboxOfList([p]);
    var pbArea = pb.w * pb.h;
    var matched = false;
    for (var i = 0; i < clusters.length; i++) {
      var cb = bboxOfList(clusters[i].polys);
      // Bbox-overlap clustering with a minimum-fraction threshold.
      // Frame and sash on a head section have overlapping bboxes (each
      // square-ish, sitting diagonally) yet are clearly distinct profile
      // pieces. Merge only when the overlap covers >50% of the smaller
      // bbox — that catches genuine adjacency (a small bead poly nestled
      // INSIDE the sash's bounding box) without falsely merging frame
      // with sash.
      var ox = Math.min(pb.xmax, cb.xmax) - Math.max(pb.xmin, cb.xmin);
      var oy = Math.min(pb.ymax, cb.ymax) - Math.max(pb.ymin, cb.ymin);
      if (ox > 0 && oy > 0) {
        var overlapArea = ox * oy;
        var cbArea = cb.w * cb.h;
        var smallerArea = Math.min(pbArea, cbArea);
        if (smallerArea > 0 && overlapArea / smallerArea > 0.5) {
          clusters[i].polys.push(p);
          matched = true;
          break;
        }
      }
    }
    if (!matched) clusters.push({ polys: [p] });
  });
  clusters.forEach(function(c) { c.bbox = bboxOfList(c.polys); c.area = c.bbox.w * c.bbox.h; });
  clusters.sort(function(a, b) { return b.area - a.area; });
  var topClusters = clusters.slice(0, 2);

  var frameSightlineMm = null, frameDepthMm = null;
  var sashSightlineMm  = null, sashDepthMm  = null;
  var frameSashGapMm = null;

  if (topClusters.length === 2) {
    // Determine which cluster is sash vs frame: the sash physically contains
    // (or sits adjacent to) the glass rebate. Check whether the glass bbox
    // overlaps each cluster's bbox in either axis. The cluster with greater
    // overlap is the sash.
    var c0 = topClusters[0], c1 = topClusters[1];
    if (glassBbox) {
      // The sash physically encloses (or is adjacent to) part of the glass
      // channel. Compute how much of the glass bbox falls INSIDE each
      // cluster's bbox, measured as overlap area in mm². The cluster with
      // the larger glass-area-inside wins. If neither overlaps the glass
      // (rare — happens when section drawing has glass fully separated
      // from PVC), fall back to centroid distance.
      function glassAreaInside(cb) {
        var ox = Math.max(0, Math.min(cb.xmax, glassBbox.xmax) - Math.max(cb.xmin, glassBbox.xmin));
        var oy = Math.max(0, Math.min(cb.ymax, glassBbox.ymax) - Math.max(cb.ymin, glassBbox.ymin));
        return ox * oy;
      }
      var sash, frame;
      var area0 = glassAreaInside(c0.bbox), area1 = glassAreaInside(c1.bbox);
      if (area0 === 0 && area1 === 0) {
        var glassCx = (glassBbox.xmin + glassBbox.xmax) / 2;
        var glassCy = (glassBbox.ymin + glassBbox.ymax) / 2;
        function dist(c) {
          var ccx = (c.bbox.xmin + c.bbox.xmax) / 2;
          var ccy = (c.bbox.ymin + c.bbox.ymax) / 2;
          return Math.hypot(ccx - glassCx, ccy - glassCy);
        }
        if (dist(c0) < dist(c1)) { sash = c0; frame = c1; }
        else                     { sash = c1; frame = c0; }
      } else if (area0 > area1) { sash = c0; frame = c1; }
      else                       { sash = c1; frame = c0; }

      // Section orientation: head/sill sections have frame above sash (or
      // vice-versa) — both profiles run HORIZONTALLY across the window,
      // sightline = bbox W, depth = bbox H. Jamb sections have profiles
      // side-by-side running VERTICALLY, sightline = bbox H, depth = bbox W.
      // Detect by checking how the frame and sash are positioned relative
      // to each other: if their X ranges overlap heavily and Y ranges are
      // separated, it's a HEAD section. If their Y ranges overlap and X
      // ranges are separated, it's a JAMB section.
      var fxOverlap = Math.max(0, Math.min(frame.bbox.xmax, sash.bbox.xmax) - Math.max(frame.bbox.xmin, sash.bbox.xmin));
      var fyOverlap = Math.max(0, Math.min(frame.bbox.ymax, sash.bbox.ymax) - Math.max(frame.bbox.ymin, sash.bbox.ymin));
      var isHeadSection = fxOverlap > fyOverlap;

      function dimsOf(c) {
        if (isHeadSection) return { sightline: c.bbox.w, depth: c.bbox.h };
        return                     { sightline: c.bbox.h, depth: c.bbox.w };
      }
      var fd = dimsOf(frame);
      var sd = dimsOf(sash);
      frameSightlineMm = Math.round(fd.sightline * 10) / 10;
      frameDepthMm     = Math.round(fd.depth * 10) / 10;
      sashSightlineMm  = Math.round(sd.sightline * 10) / 10;
      sashDepthMm      = Math.round(sd.depth * 10) / 10;

      // Frame-sash gap: the air gap between frame inner edge and sash outer
      // edge along the section axis. This is what cut formulas need — the
      // sash outer dimension = frame opening − 2 × frame_sightline − 2 × gap.
      // For a head section, that's the Y-distance between frame's bottom
      // edge and sash's top edge (or vice versa). Take the smaller of the
      // two cross-axis gaps to find the actual interface line.
      var gapY = Math.min(
        Math.abs(frame.bbox.ymin - sash.bbox.ymax),
        Math.abs(frame.bbox.ymax - sash.bbox.ymin)
      );
      var gapX = Math.min(
        Math.abs(frame.bbox.xmin - sash.bbox.xmax),
        Math.abs(frame.bbox.xmax - sash.bbox.xmin)
      );
      // For head section: the section direction is horizontal (frame above
      // sash), so the interface gap runs vertically — gapY is the right one.
      // For jamb section it's gapX. Pick the smaller (= the air gap, not
      // the longitudinal stretch).
      frameSashGapMm = Math.round(Math.min(gapX, gapY) * 10) / 10;
    }
  }

  // ─── Sash glass clearance ──────────────────────────────────────────────
  // The total air gap between the DGU and the sash rebate inner walls,
  // summed across both sides. Standard rule of thumb: rebate is ~3mm wider
  // than the glass on each side (so 6mm total), giving room for the packer.
  // From the DXF: rebate depth − glass thickness − packer ≈ small residual.
  // For now: report rebate depth as the total channel; clearance is what's
  // left after the user's chosen DGU thickness is subtracted at runtime.
  var sashGlassClearanceMm = 6;  // sane default; let the user override
  // If we have glassRebateDepth and a typical 24mm DGU, clearance ≈ depth − 24
  // — but we don't know the user's DGU yet, so we leave the default and
  // expose it as editable.

  return {
    glassRebateDepthMm:        glassRebateDepthMm,
    glassRebateHeightMm:       glassRebateHeightMm,
    glazingPackerThicknessMm:  glazingPackerThicknessMm,
    frameSashGapMm:            frameSashGapMm,
    sashGlassClearanceMm:      sashGlassClearanceMm,
    frameSightlineMm:          frameSightlineMm,
    frameDepthMm:              frameDepthMm,
    sashSightlineMm:           sashSightlineMm,
    sashDepthMm:               sashDepthMm,
  };
}

function bboxOfPrim(p) {
  var xmin=Infinity, ymin=Infinity, xmax=-Infinity, ymax=-Infinity;
  for (var i = 0; i < p.vertices.length; i++) {
    var v = p.vertices[i];
    if (v[0]<xmin) xmin=v[0]; if (v[1]<ymin) ymin=v[1];
    if (v[0]>xmax) xmax=v[0]; if (v[1]>ymax) ymax=v[1];
  }
  return { xmin:xmin, ymin:ymin, xmax:xmax, ymax:ymax, w:xmax-xmin, h:ymax-ymin };
}

// ─── measureMullionSection ────────────────────────────────────────────────
// Extracts cut-relevant dimensions from a mullion cross-section DXF (the
// view through a vertical mullion at its midpoint, with sash on each side).
// Inwards-opening systems and outwards-opening systems get separate DXFs
// because the rebate location flips, but the measurement logic is the same.
//
// Returns:
//   mullionSightlineMm — visible face width of the mullion
//   mullionDepthMm     — depth of the mullion profile
//   sashMullionGapMm   — gasket-line air gap between sash edge and mullion
//                        face (analogous to frameSashGapMm but at the
//                        mullion location)
//
// Strategy: find the largest PVC cluster — that's the mullion. The sashes
// on either side are the next two clusters (smaller, lateral). Sightline
// = mullion bbox dim along section direction; gap = distance from mullion
// face to sash bbox edge.
function measureMullionSection(parsed) {
  if (!parsed || !parsed.primitives || !parsed.primitives.length) return null;

  // Median centroid (same robust approach as measureAssembly)
  var centroids = [];
  parsed.primitives.forEach(function(p) {
    var pb = bboxOfPrim(p);
    if (pb.w > 200 || pb.h > 200) return;
    centroids.push([(pb.xmin + pb.xmax) / 2, (pb.ymin + pb.ymax) / 2]);
  });
  if (centroids.length < 3) return null;
  var xs = centroids.map(function(c){return c[0];}).sort(function(a,b){return a-b;});
  var ys = centroids.map(function(c){return c[1];}).sort(function(a,b){return a-b;});
  var cx = xs[Math.floor(xs.length / 2)];
  var cy = ys[Math.floor(ys.length / 2)];

  // Bucket by layer within the section
  var byLayer = {};
  parsed.primitives.forEach(function(p) {
    var pb = bboxOfPrim(p);
    var pcx = (pb.xmin + pb.xmax) / 2;
    var pcy = (pb.ymin + pb.ymax) / 2;
    if (Math.abs(pcx - cx) > 400 || Math.abs(pcy - cy) > 400) return;
    if (pb.w > 600 || pb.h > 600) return;
    if (!byLayer[p.layer]) byLayer[p.layer] = [];
    byLayer[p.layer].push(p);
  });

  function bboxOfList(prims) {
    if (!prims || !prims.length) return null;
    var xmin=Infinity, ymin=Infinity, xmax=-Infinity, ymax=-Infinity;
    prims.forEach(function(p) {
      p.vertices.forEach(function(v) {
        if (v[0]<xmin) xmin=v[0]; if (v[1]<ymin) ymin=v[1];
        if (v[0]>xmax) xmax=v[0]; if (v[1]>ymax) ymax=v[1];
      });
    });
    return { xmin:xmin, ymin:ymin, xmax:xmax, ymax:ymax, w:xmax-xmin, h:ymax-ymin };
  }

  // Build PVC clusters — same approach as measureAssembly
  var pvcOutsideKeys = Object.keys(byLayer).filter(function(l) {
    return /^PVC_OUTSIDE/i.test(l) || /^PVC_EXTERIOR/i.test(l);
  });
  var allPvc = [];
  pvcOutsideKeys.forEach(function(l) { allPvc = allPvc.concat(byLayer[l] || []); });
  if (!allPvc.length) {
    Object.keys(byLayer).forEach(function(l) {
      if (/^PVC/i.test(l)) allPvc = allPvc.concat(byLayer[l] || []);
    });
  }
  var clusters = [];
  allPvc.forEach(function(p) {
    var pb = bboxOfList([p]);
    var pbArea = pb.w * pb.h;
    var matched = false;
    for (var i = 0; i < clusters.length; i++) {
      var cb = bboxOfList(clusters[i].polys);
      // Bbox-overlap clustering with a minimum-fraction threshold.
      // Frame and sash on a head section have overlapping bboxes (each
      // square-ish, sitting diagonally) yet are clearly distinct profile
      // pieces. Merge only when the overlap covers >50% of the smaller
      // bbox — that catches genuine adjacency (a small bead poly nestled
      // INSIDE the sash's bounding box) without falsely merging frame
      // with sash.
      var ox = Math.min(pb.xmax, cb.xmax) - Math.max(pb.xmin, cb.xmin);
      var oy = Math.min(pb.ymax, cb.ymax) - Math.max(pb.ymin, cb.ymin);
      if (ox > 0 && oy > 0) {
        var overlapArea = ox * oy;
        var cbArea = cb.w * cb.h;
        var smallerArea = Math.min(pbArea, cbArea);
        if (smallerArea > 0 && overlapArea / smallerArea > 0.5) {
          clusters[i].polys.push(p);
          matched = true;
          break;
        }
      }
    }
    if (!matched) clusters.push({ polys: [p] });
  });
  clusters.forEach(function(c) { c.bbox = bboxOfList(c.polys); c.area = c.bbox.w * c.bbox.h; });
  clusters.sort(function(a, b) { return b.area - a.area; });

  var mullionSightlineMm = null, mullionDepthMm = null, sashMullionGapMm = null;
  if (clusters.length >= 1) {
    // Largest cluster = mullion (typically central, biggest profile in a
    // mullion section). Sash clusters flank it on left and right.
    var mullion = clusters[0];
    // Detect orientation by comparing the mullion's W vs H to the bbox of
    // all clusters. If the mullion's W > H, it's drawn horizontally
    // (cross-section read horizontally) and sightline = W; otherwise H.
    // Heuristic: a mullion section is conventionally drawn horizontal,
    // so the smaller dim is sightline.
    var allClustersBbox = bboxOfList([].concat.apply([], clusters.map(function(c){return c.polys;})));
    var orientHorizontal = allClustersBbox.w > allClustersBbox.h;
    if (orientHorizontal) {
      mullionSightlineMm = Math.round(mullion.bbox.w * 10) / 10;
      mullionDepthMm     = Math.round(mullion.bbox.h * 10) / 10;
    } else {
      mullionSightlineMm = Math.round(mullion.bbox.h * 10) / 10;
      mullionDepthMm     = Math.round(mullion.bbox.w * 10) / 10;
    }

    // Sash-mullion gap: distance from mullion face to nearest sash cluster
    // edge along the section axis. Use the closest sash cluster, find the
    // gap on the side facing the mullion.
    if (clusters.length >= 2) {
      var sash = clusters[1];
      var gapAlongSection;
      if (orientHorizontal) {
        // Sash sits left or right of mullion — measure horizontal gap
        gapAlongSection = Math.min(
          Math.abs(mullion.bbox.xmin - sash.bbox.xmax),
          Math.abs(mullion.bbox.xmax - sash.bbox.xmin)
        );
      } else {
        gapAlongSection = Math.min(
          Math.abs(mullion.bbox.ymin - sash.bbox.ymax),
          Math.abs(mullion.bbox.ymax - sash.bbox.ymin)
        );
      }
      // Sanity-bound: gap should be small (1-15mm). If we got a large
      // number, the clustering picked up something that isn't really a
      // sash — ignore.
      if (gapAlongSection >= 0 && gapAlongSection < 30) {
        sashMullionGapMm = Math.round(gapAlongSection * 10) / 10;
      }
    }
  }

  return {
    mullionSightlineMm: mullionSightlineMm,
    mullionDepthMm:     mullionDepthMm,
    sashMullionGapMm:   sashMullionGapMm,
  };
}

// ─── measureIntersection ──────────────────────────────────────────────────
// Extracts the coupling-block allowance from a mullion-transom intersection
// DXF. The intersection drawing typically shows the T-junction where a
// horizontal transom meets a vertical mullion — the coupling block sits
// between them and takes up some material.
//
// The allowance = the depth of material the transom loses on each side
// where it meets a mullion. For most Aluplast systems this is 8-15mm.
// We measure it as the distance from the mullion outer face to the nearest
// transom outer face on the side where they meet.
//
// Returns:
//   couplingAllowanceMm — material consumed by each transom-end coupling.
//                         Subtracted from transom cut length: 1 allowance
//                         for each transom end that meets a mullion.
function measureIntersection(parsed) {
  if (!parsed || !parsed.primitives || !parsed.primitives.length) return null;

  var centroids = [];
  parsed.primitives.forEach(function(p) {
    var pb = bboxOfPrim(p);
    if (pb.w > 200 || pb.h > 200) return;
    centroids.push([(pb.xmin + pb.xmax) / 2, (pb.ymin + pb.ymax) / 2]);
  });
  if (centroids.length < 3) return null;
  var xs = centroids.map(function(c){return c[0];}).sort(function(a,b){return a-b;});
  var ys = centroids.map(function(c){return c[1];}).sort(function(a,b){return a-b;});
  var cx = xs[Math.floor(xs.length / 2)];
  var cy = ys[Math.floor(ys.length / 2)];

  var byLayer = {};
  parsed.primitives.forEach(function(p) {
    var pb = bboxOfPrim(p);
    var pcx = (pb.xmin + pb.xmax) / 2;
    var pcy = (pb.ymin + pb.ymax) / 2;
    if (Math.abs(pcx - cx) > 400 || Math.abs(pcy - cy) > 400) return;
    if (pb.w > 600 || pb.h > 600) return;
    if (!byLayer[p.layer]) byLayer[p.layer] = [];
    byLayer[p.layer].push(p);
  });

  function bboxOfList(prims) {
    if (!prims || !prims.length) return null;
    var xmin=Infinity, ymin=Infinity, xmax=-Infinity, ymax=-Infinity;
    prims.forEach(function(p) {
      p.vertices.forEach(function(v) {
        if (v[0]<xmin) xmin=v[0]; if (v[1]<ymin) ymin=v[1];
        if (v[0]>xmax) xmax=v[0]; if (v[1]>ymax) ymax=v[1];
      });
    });
    return { xmin:xmin, ymin:ymin, xmax:xmax, ymax:ymax, w:xmax-xmin, h:ymax-ymin };
  }

  var pvcOutsideKeys = Object.keys(byLayer).filter(function(l) {
    return /^PVC_OUTSIDE/i.test(l) || /^PVC_EXTERIOR/i.test(l);
  });
  var allPvc = [];
  pvcOutsideKeys.forEach(function(l) { allPvc = allPvc.concat(byLayer[l] || []); });
  if (!allPvc.length) {
    Object.keys(byLayer).forEach(function(l) {
      if (/^PVC/i.test(l)) allPvc = allPvc.concat(byLayer[l] || []);
    });
  }
  var clusters = [];
  allPvc.forEach(function(p) {
    var pb = bboxOfList([p]);
    var pbArea = pb.w * pb.h;
    var matched = false;
    for (var i = 0; i < clusters.length; i++) {
      var cb = bboxOfList(clusters[i].polys);
      // Bbox-overlap clustering with a minimum-fraction threshold.
      // Frame and sash on a head section have overlapping bboxes (each
      // square-ish, sitting diagonally) yet are clearly distinct profile
      // pieces. Merge only when the overlap covers >50% of the smaller
      // bbox — that catches genuine adjacency (a small bead poly nestled
      // INSIDE the sash's bounding box) without falsely merging frame
      // with sash.
      var ox = Math.min(pb.xmax, cb.xmax) - Math.max(pb.xmin, cb.xmin);
      var oy = Math.min(pb.ymax, cb.ymax) - Math.max(pb.ymin, cb.ymin);
      if (ox > 0 && oy > 0) {
        var overlapArea = ox * oy;
        var cbArea = cb.w * cb.h;
        var smallerArea = Math.min(pbArea, cbArea);
        if (smallerArea > 0 && overlapArea / smallerArea > 0.5) {
          clusters[i].polys.push(p);
          matched = true;
          break;
        }
      }
    }
    if (!matched) clusters.push({ polys: [p] });
  });
  clusters.forEach(function(c) { c.bbox = bboxOfList(c.polys); c.area = c.bbox.w * c.bbox.h; });
  clusters.sort(function(a, b) { return b.area - a.area; });

  // T-junction has at minimum two clusters: the mullion (vertical bar) and
  // the transom (horizontal bar). The coupling block, if drawn separately,
  // would be a small third cluster between them.
  var couplingAllowanceMm = null;
  if (clusters.length >= 2) {
    var c0 = clusters[0], c1 = clusters[1];
    // The shorter cluster (against its longest dim) is likely the mullion
    // section — the one perpendicular to the transom. Their outer faces
    // should be in contact (or with a small block between them); the
    // distance between c0 and c1 along their meeting axis is the allowance.
    var gapX = Math.max(0, Math.min(
      Math.abs(c0.bbox.xmin - c1.bbox.xmax),
      Math.abs(c0.bbox.xmax - c1.bbox.xmin)
    ));
    var gapY = Math.max(0, Math.min(
      Math.abs(c0.bbox.ymin - c1.bbox.ymax),
      Math.abs(c0.bbox.ymax - c1.bbox.ymin)
    ));
    var gap = Math.min(gapX, gapY);
    // Sanity bound: coupling allowances are 0-30mm. Anything outside that
    // range is probably a misclustered DXF; return null and let the user
    // enter the value manually.
    if (gap >= 0 && gap < 30) {
      couplingAllowanceMm = Math.round(gap * 10) / 10;
    }
  }

  return {
    couplingAllowanceMm: couplingAllowanceMm,
  };
}

if (typeof window !== 'undefined') {
  window.measureMullionSection = measureMullionSection;
  window.measureIntersection = measureIntersection;
}

