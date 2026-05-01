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
function autoClassifyPolylines(polys) {
  var closed = polys.filter(function(p) { return p.closed; });
  if (closed.length === 0) return { hull: null, chambers: [], others: polys.filter(function(p){return !p.closed;}), bbox: null };
  function bboxOf(pts) {
    var xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (var k = 0; k < pts.length; k++) {
      var x = pts[k][0], y = pts[k][1];
      if (x < xmin) xmin = x; if (y < ymin) ymin = y;
      if (x > xmax) xmax = x; if (y > ymax) ymax = y;
    }
    return { xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax, area: (xmax - xmin) * (ymax - ymin) };
  }
  var withBbox = closed.map(function(p) { return Object.assign({}, p, { bbox: bboxOf(p.vertices) }); });
  withBbox.sort(function(a, b) { return b.bbox.area - a.bbox.area; });
  var hull = withBbox[0];
  var chambers = [];
  var others = polys.filter(function(p){return !p.closed;});
  for (var n = 1; n < withBbox.length; n++) {
    var c = withBbox[n];
    if (c.bbox.xmin >= hull.bbox.xmin - 0.01 && c.bbox.ymin >= hull.bbox.ymin - 0.01 &&
        c.bbox.xmax <= hull.bbox.xmax + 0.01 && c.bbox.ymax <= hull.bbox.ymax + 0.01) {
      chambers.push(c);
    } else {
      others.push(c);
    }
  }
  return { hull: hull, chambers: chambers, others: others, bbox: hull.bbox };
}

// Translate hull and chambers so hull bbox sits at (0,0).
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
  return {
    hull: Object.assign({}, hull, { vertices: tx(hull.vertices), bbox: { xmin: 0, ymin: 0, xmax: hull.bbox.xmax + dx, ymax: hull.bbox.ymax + dy, area: hull.bbox.area } }),
    chambers: chambers.map(function(c) { var v = tx(c.vertices); return Object.assign({}, c, { vertices: v, bbox: bboxOf(v) }); }),
  };
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
      // Capture only the boundary polyline data; ignore fill pattern. DXF
      // group codes 91 (numPaths), 92 (path-type flags), 93 (numEdges/verts),
      // 10/20 for vertices on a polyline boundary path.
      var hlayer = '0', hverts = [];
      while (i < lines.length) {
        var q = readPair();
        if (!q) break;
        if (q.code === 0) { i -= 2; break; }
        if (q.code === 8) hlayer = q.val;
        else if (q.code === 10) {
          var hx = parseFloat(q.val);
          var nxt = readPair();
          if (nxt && nxt.code === 20) hverts.push([hx, parseFloat(nxt.val)]);
        }
      }
      if (hverts.length >= 3) sink.push({ kind: 'polyline', layer: hlayer, vertices: hverts, closed: true, hatch: true });
    } else if (typeName === 'INSERT') {
      // Block reference — record it; pass 2 will expand it.
      var blockName = '', ix = 0, iy = 0, sx = 1, sy = 1, ilayer = '0';
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
      }
      sink.push({ kind: 'insert', layer: ilayer, blockName: blockName, dx: ix, dy: iy, sx: sx, sy: sy });
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
          var bname = '';
          while (i < lines.length) {
            var q = readPair();
            if (!q) break;
            if (q.code === 0) { i -= 2; break; }
            if (q.code === 2) bname = q.val;
          }
          currentBlock = { name: bname, primitives: [] };
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
  var resolved = [];
  function expand(prims, dx, dy, sx, sy, depth) {
    if (depth > 8) return;  // safety net for circular refs
    for (var n = 0; n < prims.length; n++) {
      var pr = prims[n];
      if (pr.kind === 'insert') {
        var blk = blocks[pr.blockName];
        if (!blk) continue;
        // Compose transforms: parent translate first, then this insert
        var nx = dx + pr.dx * sx;
        var ny = dy + pr.dy * sy;
        var nsx = sx * pr.sx, nsy = sy * pr.sy;
        expand(blk.primitives, nx, ny, nsx, nsy, depth + 1);
      } else {
        // Apply transform to vertices
        var newVerts = pr.vertices.map(function(v) {
          return [v[0] * sx + dx, v[1] * sy + dy];
        });
        resolved.push({ kind: pr.kind, layer: pr.layer, vertices: newVerts, closed: pr.closed, hatch: pr.hatch });
      }
    }
  }
  expand(topPrimitives, 0, 0, 1, 1, 0);

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
    var matched = false;
    for (var i = 0; i < clusters.length; i++) {
      var cb = bboxOfList(clusters[i].polys);
      var overlap = !(pb.xmax+5 < cb.xmin || pb.xmin > cb.xmax+5 || pb.ymax+5 < cb.ymin || pb.ymin > cb.ymax+5);
      if (overlap) {
        clusters[i].polys.push(p);
        matched = true;
        break;
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
      // The sash holds the glass — so the glass rebate's Y-range (or X-range
      // for jamb sections) should fall WITHIN the sash's bbox along the
      // axis perpendicular to the section direction. Compute the fraction
      // of the glass's perpendicular axis that overlaps each cluster.
      function perpOverlap(cb) {
        // Try both axes — the larger fractional overlap wins
        var oxFrac = Math.max(0, Math.min(cb.xmax, glassBbox.xmax) - Math.max(cb.xmin, glassBbox.xmin)) / glassBbox.w;
        var oyFrac = Math.max(0, Math.min(cb.ymax, glassBbox.ymax) - Math.max(cb.ymin, glassBbox.ymin)) / glassBbox.h;
        return Math.max(oxFrac, oyFrac);
      }
      var sash, frame;
      var ov0 = perpOverlap(c0.bbox), ov1 = perpOverlap(c1.bbox);
      if (ov0 > ov1) { sash = c0; frame = c1; }
      else { sash = c1; frame = c0; }

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

