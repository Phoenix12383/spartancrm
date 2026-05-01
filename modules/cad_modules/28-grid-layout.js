// Grid Layout Builder — mullions, transoms, per-cell opening types
// ═══════════════════════════════════════════════════════════════════════════

function buildGridWindow(W, H, mat, cellTypes, opensIn, glassSpec, colonialGrid, matInt, zoneWs, zoneHs, productType, hwCol, cellBreaks, pricingConfig, profileOverrides) {
  // WIP-PROFILE-LINKS: prefer Profile Manager links over hardcoded PROFILE_DIMS.
  // pricingConfig + profileOverrides are optional trailing args — when omitted
  // (legacy callers) the result matches getProfileDims(productType) exactly.
  const pd = (typeof getResolvedProfileDims === 'function')
    ? getResolvedProfileDims(productType || 'awning_window', pricingConfig, profileOverrides)
    : getProfileDims(productType || 'awning_window');
  const fw = pd.frameW * S;
  const sw = pd.sashW * S;
  const dd = pd.depth * S;
  const mw = pd.mullionW * S;
  const frame = new THREE.Group();
  const sashes = [];
  const oW = W - fw*2, oH = H - fw*2;
  const ZP = pd.rebateSide === 'int' ? -SASH_Z : SASH_Z;
  const gs = glassSpec || null;
  const cg = colonialGrid || null;
  const mi = matInt || null;

  frame.add(buildOuterFrame(W, H, mat, false, mi, fw, productType || type));

  const numRows = cellTypes.length;
  const numCols = cellTypes[0] ? cellTypes[0].length : 1;

  // Use custom zone sizes or fall back to equal
  const totalMullionW = (numCols - 1) * mw;
  const totalTransomH = (numRows - 1) * mw;
  const defCellW = (oW - totalMullionW) / numCols;
  const defCellH = (oH - totalTransomH) / numRows;

  // Convert mm zone arrays to world units
  const colWidths = (zoneWs && zoneWs.length === numCols)
    ? zoneWs.map(mm => mm * S) : Array(numCols).fill(defCellW);
  const rowHeights = (zoneHs && zoneHs.length === numRows)
    ? zoneHs.map(mm => mm * S) : Array(numRows).fill(defCellH);

  // WIP10: Defensive rescale. zoneWidths/zoneHeights are supposed to be CELL
  // (opening) widths, so they must sum to (oW - totalMullionW) / (oH - totalTransomH).
  // Legacy 1×1 frames seeded these with the full frame width instead, so when
  // this builder is invoked on such a frame the cells overflow the opening by
  // 2×frameW + (numCuts)*mullionW. Rescale here so we always render a valid
  // geometry — the addNewFrame / loadFrameState migrations fix the root cause
  // but this guard protects against any future state drift.
  const availColW = oW - totalMullionW;
  const availRowH = oH - totalTransomH;
  const cwSum = colWidths.reduce((a, b) => a + b, 0);
  const rhSum = rowHeights.reduce((a, b) => a + b, 0);
  if (cwSum > 0 && Math.abs(cwSum - availColW) > 0.0005) {
    const kw = availColW / cwSum;
    for (let i = 0; i < colWidths.length; i++) colWidths[i] *= kw;
  }
  if (rhSum > 0 && Math.abs(rhSum - availRowH) > 0.0005) {
    const kh = availRowH / rhSum;
    for (let i = 0; i < rowHeights.length; i++) rowHeights[i] *= kh;
  }

  // Compute cumulative X positions for columns
  function colX(c) {
    let x = -oW/2;
    for (let i = 0; i < c; i++) x += colWidths[i] + mw;
    return x;
  }
  // Compute cumulative Y positions for rows (top-down)
  function rowY(r) {
    let y = oH/2;
    for (let i = 0; i < r; i++) y -= (rowHeights[i] + mw);
    return y;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WIP10: Merge-group rendering.
  // ══════════════════════════════════════════════════════════════════════════
  // cellBreaks[r][c] = { up?, left? }. `up` merges cell (r,c) with (r-1,c).
  // `left` merges (r,c) with (r,c-1). Connected cells form a merge group.
  // Rendering:
  //   • Cells: only the group's anchor (top-left cell) is rendered, at the
  //     merged bbox dimensions — so a broken transom/mullion shows continuous
  //     glass instead of a hole.
  //   • Bars: each mullion/transom segment is drawn only when the two adjacent
  //     cells belong to DIFFERENT groups.
  //   • Crossing cubes: at every 4-way intersection we drop a mw×mw block
  //     (unless all 4 corner cells share one group). This fills the gap old
  //     full-length bars used to bridge by overlapping — without it, every
  //     crossing would be a hole.
  // Non-rectangular merges (L-shapes, T-shapes) are resolved by iteratively
  // expanding each group to cover its bbox. That auto-completes the missing
  // cells so the result is always a clean grid of rectangles.
  const _cb = Array.isArray(cellBreaks) ? cellBreaks : null;
  const _key = (r, c) => r + ',' + c;
  const _parent = {};
  for (let r = 0; r < numRows; r++)
    for (let c = 0; c < numCols; c++)
      _parent[_key(r, c)] = _key(r, c);
  const _find = (k) => {
    while (_parent[k] !== k) { _parent[k] = _parent[_parent[k]]; k = _parent[k]; }
    return k;
  };
  const _union = (k1, k2) => {
    const a = _find(k1), b = _find(k2);
    if (a !== b) _parent[a] = b;
  };
  if (_cb) {
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const cb = _cb[r] && _cb[r][c];
        if (!cb) continue;
        if (cb.up   && r > 0) _union(_key(r, c), _key(r-1, c));
        if (cb.left && c > 0) _union(_key(r, c), _key(r, c-1));
      }
    }
  }
  // Iteratively expand each group to fill its bbox (rectangularises L/T shapes).
  for (let iter = 0; iter < numRows * numCols + 1; iter++) {
    const bb = {};
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        const ak = _find(_key(r, c));
        if (!bb[ak]) bb[ak] = { rMin: r, rMax: r, cMin: c, cMax: c };
        else {
          const b = bb[ak];
          if (r < b.rMin) b.rMin = r; if (r > b.rMax) b.rMax = r;
          if (c < b.cMin) b.cMin = c; if (c > b.cMax) b.cMax = c;
        }
      }
    }
    let changed = false;
    for (const ak in bb) {
      const b = bb[ak];
      for (let r = b.rMin; r <= b.rMax; r++) {
        for (let c = b.cMin; c <= b.cMax; c++) {
          const ok = _find(_key(r, c));
          if (ok !== _find(ak)) { _union(_key(r, c), ak); changed = true; }
        }
      }
    }
    if (!changed) break;
  }
  // Final bboxes (post-rectangularisation).
  const _bbox = {};
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      const ak = _find(_key(r, c));
      if (!_bbox[ak]) _bbox[ak] = { rMin: r, rMax: r, cMin: c, cMax: c };
      else {
        const b = _bbox[ak];
        if (r < b.rMin) b.rMin = r; if (r > b.rMax) b.rMax = r;
        if (c < b.cMin) b.cMin = c; if (c > b.cMax) b.cMax = c;
      }
    }
  }
  // isAnchor: (r,c) is the top-left cell of its merge group.
  const isAnchor = (r, c) => {
    const b = _bbox[_find(_key(r, c))];
    return r === b.rMin && c === b.cMin;
  };
  // mergedDims: dimensions + center of the merged aperture containing (r,c).
  const mergedDims = (r, c) => {
    const b = _bbox[_find(_key(r, c))];
    let W = 0;
    for (let cc = b.cMin; cc <= b.cMax; cc++) W += colWidths[cc];
    W += (b.cMax - b.cMin) * mw;
    let H = 0;
    for (let rr = b.rMin; rr <= b.rMax; rr++) H += rowHeights[rr];
    H += (b.rMax - b.rMin) * mw;
    return {
      W, H,
      cx: colX(b.cMin) + W/2,
      cy: rowY(b.rMin) - H/2,
    };
  };

  // Draw mullion segments — one per row between each pair of columns, but only
  // when the two cells on either side belong to different merge groups.
  for (let c = 1; c < numCols; c++) {
    const mx = colX(c) - mw/2;
    for (let r = 0; r < numRows; r++) {
      if (_find(_key(r, c-1)) === _find(_key(r, c))) continue;
      const segLen = rowHeights[r];
      const my = rowY(r) - segLen/2;
      const mul = buildDetailedMullionBar(segLen, mw, dd, mat, pd.rebateSide, mi, productType);
      mul.position.set(mx, my, 0);
      frame.add(mul);
    }
  }
  // Draw transom segments — one per column between each pair of rows.
  for (let r = 1; r < numRows; r++) {
    const my = rowY(r) + mw/2;
    for (let c = 0; c < numCols; c++) {
      if (_find(_key(r-1, c)) === _find(_key(r, c))) continue;
      const segLen = colWidths[c];
      const mx = colX(c) + segLen/2;
      const tra = buildDetailedTransomBar(segLen, mw, dd, mat, pd.rebateSide, mi, productType);
      tra.position.set(mx, my, 0);
      frame.add(tra);
    }
  }
  // Crossing cubes — fill the mw×mw gap at every mullion/transom intersection
  // unless all four adjacent cells are in the same merge group. Required even
  // for totally-unbroken grids since segmented bars end at cell boundaries.
  {
    const rebH = 0.018;
    const rebSign = pd.rebateSide === 'int' ? -1 : 1;
    for (let r = 1; r < numRows; r++) {
      for (let c = 1; c < numCols; c++) {
        const a1 = _find(_key(r-1, c-1)), a2 = _find(_key(r-1, c));
        const a3 = _find(_key(r, c-1)),   a4 = _find(_key(r, c));
        if (a1 === a2 && a1 === a3 && a1 === a4) continue;
        const cx = colX(c) - mw/2;
        const cy = rowY(r) + mw/2;
        frame.add(mergeMesh([box(mw, mw, dd - rebH, cx, cy, -rebSign * rebH / 2)], mat));
      }
    }
  }

  // Build each cell — anchors only, at merged dimensions.
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (!isAnchor(r, c)) continue;
      const ct = cellTypes[r] && cellTypes[r][c] ? cellTypes[r][c] : "fixed";
      const _md = mergedDims(r, c);
      const cellW = _md.W;
      const cellH = _md.H;
      const cx = _md.cx;
      const cy = _md.cy;

      if (ct === "fixed") {
        const fp = buildFixedPanel(cellW, cellH, mat, gs, cg);
        fp.position.set(cx, cy, 0); frame.add(fp);
      } else if (ct === "awning" || ct === "casement") {
        const cellType = ct === "awning" ? "awning_window" : "casement_window";
        const cellPd = (typeof getResolvedProfileDims === "function") ? getResolvedProfileDims(cellType, pricingConfig, profileOverrides) : getProfileDims(cellType);
        const cellSw = cellPd.sashW * S;
        const cellDd = cellPd.depth * S;
        const sash = buildSash(cellW, cellH, mat, cellType, true, gs, cg, true, mi, cellSw, cellDd);
        const pivot = new THREE.Group();
        if (ct === "awning") {
          pivot.position.set(cx, cy + cellH/2, ZP);
          sash.position.set(0, -cellH/2, 0);
          // Hardware added in post-build pass below
        } else {
          pivot.position.set(cx - cellW/2, cy, ZP);
          sash.position.set(cellW/2, 0, 0);
        }
        pivot.add(sash); pivot.userData.cellType = ct; sashes.push(pivot);
      } else if (ct === "casement_l") {
        // Left-hand casement: apex-left in schematic = opens LEFT. Hinge on RIGHT,
        // sash's LEFT edge swings outward.
        const cellPd = (typeof getResolvedProfileDims === "function") ? getResolvedProfileDims("casement_window", pricingConfig, profileOverrides) : getProfileDims("casement_window");
        const sash = buildSash(cellW, cellH, mat, "casement_window", true, gs, cg, true, mi, cellPd.sashW*S, cellPd.depth*S);
        const pivot = new THREE.Group();
        pivot.position.set(cx + cellW/2, cy, ZP);
        sash.position.set(-cellW/2, 0, 0);
        pivot.add(sash); pivot.userData.cellType = "casement_l"; sashes.push(pivot);
      } else if (ct === "casement_r") {
        // Right-hand casement: apex-right in schematic = opens RIGHT. Hinge on LEFT,
        // sash's RIGHT edge swings outward.
        const cellPd = (typeof getResolvedProfileDims === "function") ? getResolvedProfileDims("casement_window", pricingConfig, profileOverrides) : getProfileDims("casement_window");
        const sash = buildSash(cellW, cellH, mat, "casement_window", true, gs, cg, true, mi, cellPd.sashW*S, cellPd.depth*S);
        const pivot = new THREE.Group();
        pivot.position.set(cx - cellW/2, cy, ZP);
        sash.position.set(cellW/2, 0, 0);
        pivot.add(sash); pivot.userData.cellType = "casement_r"; sashes.push(pivot);
      } else if (ct === "tilt_turn" || ct === "tilt_turn_l") {
        const cellPd = (typeof getResolvedProfileDims === "function") ? getResolvedProfileDims("tilt_turn_window", pricingConfig, profileOverrides) : getProfileDims("tilt_turn_window");
        const sash = buildSash(cellW, cellH, mat, "tilt_turn_window", true, gs, cg, false, mi, cellPd.sashW*S, cellPd.depth*S);
        // tilt_turn   = hinge LEFT, handle on RIGHT stile, opens rightward for turn.
        // tilt_turn_l = hinge RIGHT, handle on LEFT stile, opens leftward for turn.
        const hingeLeft = ct === "tilt_turn";
        var gttH = buildTTHandle(cellW, cellH, hwCol);
        gttH.group.position.x = hingeLeft ? (cellW/2 - 0.020) : -(cellW/2 - 0.020);
        gttH.group.position.z = -(cellPd.depth*S/2);
        sash.add(gttH.group);
        // Dual pivot. turnPivot sits on the hinge stile; tiltPivot sits at
        // bottom-centre relative to it so the tilt axis follows the turn pivot
        // if the two motions ever combine.
        const turnPivot = new THREE.Group();
        turnPivot.position.set(cx + (hingeLeft ? -cellW/2 : cellW/2), cy, ZP);
        const tiltPivot = new THREE.Group();
        tiltPivot.position.set(hingeLeft ? cellW/2 : -cellW/2, -cellH/2, 0);
        sash.position.set(0, cellH/2, 0);
        tiltPivot.add(sash);
        turnPivot.add(tiltPivot);
        turnPivot.userData.cellType = ct;
        turnPivot.userData.tiltPivot = tiltPivot;
        turnPivot.userData.handleLever = gttH.lever;
        turnPivot.userData.ttHingeLeft = hingeLeft;
        sashes.push(turnPivot);
      }
    }
  }

  // ── Post-build: Awning hardware (Truth system) ──
  // Truth Maxim HD sash lock placement for multi-sash awning:
  //   Single sash: 1 lock on each stile (2 total)
  //   Multi-sash (2x1 etc): locks side-by-side on mullion (1 per sash meeting at mullion)
  //   Wide single sash (>600mm): 2 locks on stiles
  // Truth Encore winder: 1 per sash, centered on bottom rail
  const zo_aw = -dd/2 - 0.002;
  function addSashLock(lx, ly) {
    var wmH = makeWhiteABS(hwCol); var cmH = makeChrome(hwCol); var olH = makeHardwareOutline(hwCol);
    var lk = new THREE.Group();
    lk.add(mergeMesh([box(0.0231, 0.1201, 0.001, 0, 0, 0.001)], olH));
    lk.add(mergeMesh([box(0.0201, 0.1171, 0.003, 0, 0, 0)], wmH));
    lk.add(mergeMesh([box(0.016, 0.100, 0.008, 0, -0.005, -0.005)], wmH));
    lk.add(mergeMesh([cyl(0.008, 0.016, 0, 0.045, -0.005, 0, Math.PI/2)], wmH));
    lk.add(mergeMesh([cyl(0.008, 0.016, 0, -0.052, -0.005, 0, Math.PI/2)], wmH));
    lk.add(mergeMesh([box(0.004, 0.080, 0.002, 0, -0.005, -0.010)], wmH));
    var cam = new THREE.Group(); cam.position.set(0, 0.040, -0.009);
    cam.add(mergeMesh([box(0.018, 0.010, 0.004, 0, 0, 0)], cmH));
    cam.add(mergeMesh([cyl(0.003, 0.006, 0, -0.002, 0)], cmH));
    lk.add(cam);
    lk.position.set(lx, ly, zo_aw);
    frame.add(lk);
  }
  function addWinder(wx, wy) {
    var wmW = makeWhiteABS(hwCol); var cmW = makeChrome(hwCol);
    var slW = makeSeal(); var olW = makeHardwareOutline(hwCol);
    var wi = new THREE.Group();
    var cW = 0.1354, cH = 0.0501, cD = 0.0103;
    wi.add(mergeMesh([box(cW+0.006,cH+0.006,0.001,0,0,0.001)], olW));
    wi.add(mergeMesh([box(cW,cH,cD,0,0,-cD/2)], wmW));
    wi.add(mergeMesh([box(cW-0.010,cH*0.6,0.003,0,cH*0.08,-cD-0.001)], wmW));
    wi.add(mergeMesh([box(cW+0.002,0.002,cD+0.002,0,cH/2,-cD/2),box(cW+0.002,0.002,cD+0.002,0,-cH/2,-cD/2),box(0.002,cH,cD+0.002,cW/2,0,-cD/2),box(0.002,cH,cD+0.002,-cW/2,0,-cD/2)], olW));
    wi.add(mergeMesh([box(0.100,0.010,0.002,0,cH*0.08,-cD-0.002)], slW));
    var wh = new THREE.Group(); wh.position.set(0, cH*0.08, -cD-0.003);
    wh.add(mergeMesh([box(0.090,0.008,0.003,0,0,0)], cmW));
    wh.add(mergeMesh([box(0.018,0.012,0.005,0.040,0,0)], cmW));
    wh.add(mergeMesh([cyl(0.005,0.005,-0.043,0,0)], cmW));
    wi.add(wh);
    [[-0.050,-cH*0.3],[0.050,-cH*0.3],[-0.050,cH*0.3],[0.050,cH*0.3]].forEach(function(p){
      wi.add(mergeMesh([cyl(0.002,0.002,p[0],p[1],-cD-0.001)], cmW));
    });
    wi.position.set(wx, wy, zo_aw);
    frame.add(wi);
  }

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (!isAnchor(r, c)) continue;
      const ct2 = cellTypes[r] && cellTypes[r][c] ? cellTypes[r][c] : "fixed";
      if (ct2 !== "awning") continue;
      const _md2 = mergedDims(r, c);
      const cW2 = _md2.W, cH2 = _md2.H;
      const cx2 = _md2.cx, cy2 = _md2.cy;
      const cH2_mm = cH2 / S;
      // Lock Y: Truth Maxim placement rules
      var lockOff = cH2_mm < 600 ? 0.150 : cH2_mm < 1200 ? cH2/3 : cH2/4;
      var lockY2 = cy2 - cH2/2 + lockOff;
      // Neighbour checks use the cell to the left/right of THIS group's bbox.
      const _bbA = _bbox[_find(_key(r, c))];
      var leftIsAw  = _bbA.cMin > 0          && cellTypes[r] && cellTypes[r][_bbA.cMin - 1] === "awning";
      var rightIsAw = _bbA.cMax < numCols-1  && cellTypes[r] && cellTypes[r][_bbA.cMax + 1] === "awning";

      if (!leftIsAw && !rightIsAw) {
        // Only awning in this row: locks on both stiles (standard single-sash)
        addSashLock(cx2 - cW2/2 - (_bbA.cMin===0?fw:mw)/2, lockY2);
        addSashLock(cx2 + cW2/2 + (_bbA.cMax===numCols-1?fw:mw)/2, lockY2);
      } else {
        // Multi-sash: place lock on mullion side(s) — side by side with neighbor
        if (rightIsAw) {
          // Lock on RIGHT mullion, offset toward this sash (left side of mullion)
          addSashLock(cx2 + cW2/2 + mw/2 - 0.013, lockY2);
        }
        if (leftIsAw) {
          // Lock on LEFT mullion, offset toward this sash (right side of mullion)
          addSashLock(cx2 - cW2/2 - mw/2 + 0.013, lockY2);
        }
        // Outer stile lock: always add for the end sashes in a run
        if (!leftIsAw) {
          addSashLock(cx2 - cW2/2 - (_bbA.cMin===0?fw:mw)/2, lockY2);
        }
        if (!rightIsAw) {
          addSashLock(cx2 + cW2/2 + (_bbA.cMax===numCols-1?fw:mw)/2, lockY2);
        }
      }
      // Winder per sash on bottom rail
      addWinder(cx2, cy2 - cH2/2 - (_bbA.rMax===numRows-1?fw:mw)/2);
    }
  }

  // ── Post-build: Casement hardware (grid cells) ──
  // Sash lock on hinge-side STILE, winder on BOTTOM RAIL near free side
  var zo_cas = -dd/2 - 0.002;
  function addCasLock2(lx, ly) {
    var wmH = makeWhiteABS(hwCol); var cmH = makeChrome(hwCol); var olH = makeHardwareOutline(hwCol);
    var lk = new THREE.Group();
    lk.add(mergeMesh([box(0.0231, 0.1201, 0.001, 0, 0, 0.001)], olH));
    lk.add(mergeMesh([box(0.0201, 0.1171, 0.003, 0, 0, 0)], wmH));
    lk.add(mergeMesh([box(0.016, 0.100, 0.008, 0, -0.005, -0.005)], wmH));
    lk.add(mergeMesh([cyl(0.008, 0.016, 0, 0.045, -0.005, 0, Math.PI/2)], wmH));
    lk.add(mergeMesh([cyl(0.008, 0.016, 0, -0.052, -0.005, 0, Math.PI/2)], wmH));
    lk.add(mergeMesh([box(0.004, 0.080, 0.002, 0, -0.005, -0.010)], wmH));
    var cam = new THREE.Group(); cam.position.set(0, 0.040, -0.009);
    cam.add(mergeMesh([box(0.018, 0.010, 0.004, 0, 0, 0)], cmH));
    cam.add(mergeMesh([cyl(0.003, 0.006, 0, -0.002, 0)], cmH));
    lk.add(cam);
    lk.position.set(lx, ly, zo_cas);
    frame.add(lk);
  }
  function addCasWinder2(wx, wy) {
    var wmW = makeWhiteABS(hwCol); var cmW = makeChrome(hwCol);
    var slW = makeSeal(); var olW = makeHardwareOutline(hwCol);
    var wi = new THREE.Group();
    var cW = 0.1354, cH = 0.0501, cD = 0.0103;
    wi.add(mergeMesh([box(cW+0.006,cH+0.006,0.001,0,0,0.001)], olW));
    wi.add(mergeMesh([box(cW,cH,cD,0,0,-cD/2)], wmW));
    wi.add(mergeMesh([box(cW-0.010,cH*0.6,0.003,0,cH*0.08,-cD-0.001)], wmW));
    wi.add(mergeMesh([box(cW+0.002,0.002,cD+0.002,0,cH/2,-cD/2),box(cW+0.002,0.002,cD+0.002,0,-cH/2,-cD/2),box(0.002,cH,cD+0.002,cW/2,0,-cD/2),box(0.002,cH,cD+0.002,-cW/2,0,-cD/2)], olW));
    wi.add(mergeMesh([box(0.100,0.010,0.002,0,cH*0.08,-cD-0.002)], slW));
    var wh = new THREE.Group(); wh.position.set(0, cH*0.08, -cD-0.003);
    wh.add(mergeMesh([box(0.090,0.008,0.003,0,0,0)], cmW));
    wh.add(mergeMesh([box(0.018,0.012,0.005,0.040,0,0)], cmW));
    wh.add(mergeMesh([cyl(0.005,0.005,-0.043,0,0)], cmW));
    wi.add(wh);
    [[-0.050,-cH*0.3],[0.050,-cH*0.3],[-0.050,cH*0.3],[0.050,cH*0.3]].forEach(function(p){
      wi.add(mergeMesh([cyl(0.002,0.002,p[0],p[1],-cD-0.001)], cmW));
    });
    wi.position.set(wx, wy, zo_cas);
    frame.add(wi);
  }

  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (!isAnchor(r, c)) continue;
      const ct3 = cellTypes[r] && cellTypes[r][c] ? cellTypes[r][c] : "fixed";
      if (ct3 !== "casement" && ct3 !== "casement_l" && ct3 !== "casement_r") continue;
      const _md3 = mergedDims(r, c);
      const cW3 = _md3.W, cH3 = _md3.H;
      const cx3 = _md3.cx, cy3 = _md3.cy;
      const _bbC = _bbox[_find(_key(r, c))];
      const cH3_mm = cH3 / S;

      // Handedness convention (aligned with buildCasementHardware + 1×1 path):
      //   casement_l = "left_hand"  → handle/free side LEFT,  hinge RIGHT
      //   casement_r = "right_hand" → handle/free side RIGHT, hinge LEFT
      var freeSign = (ct3 === "casement_r") ? 1 : -1;
      var hingeSign = -freeSign;

      // Sash locks on FREE-side stile (opposite the hinge). Always 2, evenly spread
      // at ±openCH/3 about centre — roughly 1/6 from top and bottom of the opening height.
      var freeStileX = cx3 + freeSign * (cW3/2 + ((freeSign > 0 ? (_bbC.cMax===numCols-1?fw:mw) : (_bbC.cMin===0?fw:mw)) / 2));
      var openCH = cH3 - (_bbC.rMin===0?fw:mw) - (_bbC.rMax===numRows-1?fw:mw);
      addCasLock2(freeStileX, cy3 + openCH/3);
      addCasLock2(freeStileX, cy3 - openCH/3);

      // Winder at bottom rail on hinge side
      var bottomRailY = cy3 - cH3/2 - (_bbC.rMax===numRows-1?fw:mw)/2;
      var winderX = cx3 + hingeSign * cW3/2;
      addCasWinder2(winderX, bottomRailY);
    }
  }

  return { frame, sashes, W, H };
}

