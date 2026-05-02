// PRODUCT BUILDERS — Feature 3: transom
// ═══════════════════════════════════════════════════════════════════════════

function buildProduct(type, W, H, mat, panels, opensIn, transomPct, glassSpec, colonialGrid, cellTypes, matInt, zoneWs, zoneHs, hwCol, openStyle, cellBreaks, pricingConfig, profileOverrides) {
  // Route through grid layout if cellTypes has multiple rows or columns
  if (cellTypes && (cellTypes.length > 1 || (cellTypes[0] && cellTypes[0].length > 1))) {
    return buildGridWindow(W, H, mat, cellTypes, opensIn, glassSpec, colonialGrid, matInt, zoneWs, zoneHs, type, hwCol, cellBreaks, pricingConfig, profileOverrides);
  }
  // WIP10: also route to the grid builder for a 1x1 aperture when the user
  // has explicitly set the single cell to 'fixed' on a product that would
  // otherwise render a sash (awning / casement / T&T). This lets the user
  // actually see the sash disappear when they click × on the Sashes tab.
  if (cellTypes && cellTypes[0] && cellTypes[0][0] === 'fixed'
      && (type === 'awning_window' || type === 'casement_window' || type === 'tilt_turn_window')) {
    return buildGridWindow(W, H, mat, cellTypes, opensIn, glassSpec, colonialGrid, matInt, zoneWs, zoneHs, type, hwCol, cellBreaks, pricingConfig, profileOverrides);
  }

  // WIP-PROFILE-LINKS: per-product profile dimensions from the resolved catalog
  // entry (Profile Manager link wins over PROFILE_DIMS). Falls back to the
  // legacy hardcoded table when no pricingConfig is supplied — preserves
  // backwards compatibility for any caller still on the old signature.
  const pd = (typeof getResolvedProfileDims === 'function')
    ? getResolvedProfileDims(type, pricingConfig, profileOverrides)
    : getProfileDims(type);
  const fw = pd.frameW * S;    // frame sightline in metres
  const sw = pd.sashW * S;     // sash profile width in metres
  const dd = pd.depth * S;     // profile depth in metres
  const mw = pd.mullionW * S;  // mullion width in metres

  const frame = new THREE.Group(), sashes = [];
  const oW = W - fw*2, oH = H - fw*2;
  const ZP = pd.rebateSide === 'int' ? -SASH_Z : SASH_Z;
  const gs = glassSpec || null;
  const cg = colonialGrid || null;
  const mi = matInt || null;

  // Feature 3: Transom support — splits the frame into top/bottom zones
  let topH = oH, bottomH = 0, transomY = 0;
  if (transomPct && transomPct > 0.1 && transomPct < 0.9) {
    bottomH = oH * transomPct;
    topH = oH - bottomH - mw;
    transomY = -oH/2 + bottomH + mw/2;
  }

  switch (type) {
    case "awning_window": {
      frame.add(buildOuterFrame(W, H, mat, false, mi, fw, type));
      // Hardware mounts on frame, not sash
      frame.add(buildAwningHardware(W, H, hwCol, fw, dd));
      if (transomPct && bottomH > 0) {
        // Transom bar
        { var tra = buildDetailedTransomBar(oW, mw, dd, mat, pd.rebateSide, mi, type); tra.position.set(0, transomY, 0); frame.add(tra); }
        // Top zone: awning sash
        const sash = buildSash(oW, topH, mat, "awning_window", false, gs, cg, true, mi, sw, dd);
        const pivot = new THREE.Group();
        pivot.position.set(0, transomY + mw/2 + topH, ZP);
        sash.position.set(0, -topH/2, 0);
        pivot.add(sash); sashes.push(pivot);
        // Bottom zone: fixed
        const fp = buildFixedPanel(oW, bottomH, mat, gs, cg);
        fp.position.set(0, -oH/2 + bottomH/2, 0);
        frame.add(fp);
      } else {
        const sash = buildSash(oW, oH, mat, "awning_window", false, gs, cg, true, mi, sw, dd);
        const pivot = new THREE.Group();
        pivot.position.set(0, H/2 - fw, ZP);
        sash.position.set(0, -oH/2, 0);
        pivot.add(sash); sashes.push(pivot);
      }
      break;
    }
    case "casement_window": {
      frame.add(buildOuterFrame(W, H, mat, false, mi, fw, type));
      frame.add(buildCasementHardware(W, H, hwCol, openStyle, panels, fw, dd));
      if (panels === 1) {
        const sash = buildSash(oW, oH, mat, "casement_window", false, gs, cg, true, mi, sw, dd);
        const pivot = new THREE.Group();
        if (openStyle === "right_hand") {
          // Right-hand: opens to the RIGHT (apex-right in schematic). Hinge on LEFT,
          // sash's RIGHT edge swings outward.
          pivot.position.set(-oW/2, 0, ZP);
          sash.position.set(oW/2, 0, 0);
        } else {
          // Left-hand (default): opens to the LEFT. Hinge on RIGHT, sash's LEFT edge
          // swings outward.
          pivot.position.set(oW/2, 0, ZP);
          sash.position.set(-oW/2, 0, 0);
        }
        pivot.add(sash); sashes.push(pivot);
      } else {
        const mW2 = mw;
        const pW = (oW - mW2)/2;
        frame.children[0].add(mergeMesh([box(mW2, oH, dd, 0, 0, 0)], mat));
        const ls = buildSash(pW, oH, mat, "casement_window", false, gs, cg, true, mi, sw, dd);
        const lp = new THREE.Group();
        lp.position.set(-oW/2, 0, ZP); ls.position.set(pW/2, 0, 0);
        lp.add(ls); sashes.push(lp);
        const rs = buildSash(pW, oH, mat, "casement_window", false, gs, cg, true, mi, sw, dd);
        const rp = new THREE.Group();
        rp.position.set(oW/2, 0, ZP); rs.position.set(-pW/2, 0, 0);
        rp.add(rs); sashes.push(rp);
      }
      break;
    }
    case "tilt_turn_window": {
      // Tilt & Turn: opens INWARD. Tilt = bottom-hinged, top tilts in. Turn = side-hinged, swings in like door.
      // Direction derives from cellTypes: 'tilt_turn' = hinge LEFT (handle RIGHT), 'tilt_turn_l' = hinge RIGHT (handle LEFT).
      frame.add(buildOuterFrame(W, H, mat, false, mi, fw, type));
      const sash = buildSash(oW, oH, mat, "tilt_turn_window", false, gs, cg, false, mi, sw, dd);

      const ttCellType = (cellTypes && cellTypes[0] && cellTypes[0][0]) || "tilt_turn";
      const ttHingeLeft = ttCellType !== "tilt_turn_l";

      // Siegware 1033 handle on the FREE (non-hinge) stile, interior face
      var ttHandle = buildTTHandle(oW, oH, hwCol);
      ttHandle.group.position.x = ttHingeLeft ? (oW/2 - 0.020) : -(oW/2 - 0.020);
      ttHandle.group.position.z = -(dd/2);
      sash.add(ttHandle.group);

      // Dual pivot: outer for turn (side-hinged), inner for tilt (bottom-hinged)
      const turnPivot = new THREE.Group();
      turnPivot.position.set(ttHingeLeft ? -oW/2 : oW/2, 0, ZP);
      const tiltPivot = new THREE.Group();
      tiltPivot.position.set(ttHingeLeft ? oW/2 : -oW/2, -oH/2, 0);
      sash.position.set(0, oH/2, 0); // sash centre at (0,0,ZP) in world when unrotated
      tiltPivot.add(sash);
      turnPivot.add(tiltPivot);
      turnPivot.userData.tiltPivot = tiltPivot;
      turnPivot.userData.handleLever = ttHandle.lever; // store for animation
      turnPivot.userData.ttHingeLeft = ttHingeLeft;    // drives animation direction
      sashes.push(turnPivot);
      break;
    }
    case "fixed_window": {
      frame.add(buildOuterFrame(W, H, mat, false, mi, fw, type));
      if (transomPct && bottomH > 0) {
        { var tra = buildDetailedTransomBar(oW, mw, dd, mat, pd.rebateSide, mi, type); tra.position.set(0, transomY, 0); frame.add(tra); }
        frame.add(buildFixedPanel(oW, topH, mat, gs, cg));
        frame.children[frame.children.length-1].position.y = transomY + mw/2 + topH/2;
        frame.add(buildFixedPanel(oW, bottomH, mat, gs, cg));
        frame.children[frame.children.length-1].position.y = -oH/2 + bottomH/2;
      } else {
        frame.add(buildFixedPanel(oW, oH, mat, gs, cg));
      }
      break;
    }
    case "sliding_window": {
      const of2 = buildOuterFrame(W, H, mat, false, mi, fw, type); frame.add(of2);
      const trackH = 0.006;
      of2.add(mergeMesh([box(oW, trackH, dd*0.3, 0, oH/2 - trackH/2, dd*0.2)], mat));
      of2.add(mergeMesh([box(oW, trackH, dd*0.3, 0, -oH/2 + trackH/2, dd*0.2)], mat));
      const pH = oH - trackH*2, pW = oW / panels;
      for (let i = 0; i < panels; i++) {
        const isFixed = i % 2 === 0;
        const s = buildSash(pW, pH, mat, isFixed ? "none" : "sliding_window", false, gs, cg, true, mi, sw, dd);
        const xOff = -oW/2 + pW/2 + i*pW;
        s.position.set(0, 0, isFixed ? -dd*0.12 : dd*0.12);
        if (isFixed) { s.position.x = xOff; frame.add(s); }
        else {
          const sg = new THREE.Group();
          sg.position.x = xOff;
          sg.userData = { slideMax: pW * 0.92, startX: xOff };
          sg.add(s); sashes.push(sg);
        }
      }
      break;
    }
    case "french_door": {
      frame.add(buildOuterFrame(W, H, mat, true, mi, fw, type));
      const pW = oW/2, dm = opensIn ? -1 : 1;
      const ls = buildSash(pW, oH, mat, "french_door", true, gs, cg, !opensIn, mi, sw, dd);
      const lp = new THREE.Group();
      lp.position.set(-oW/2, 0, ZP); ls.position.set(pW/2, 0, 0);
      lp.add(ls); lp.userData.dir = dm; sashes.push(lp);
      const rs = buildSash(pW, oH, mat, "french_door", true, gs, cg, !opensIn, mi, sw, dd);
      const rp = new THREE.Group();
      rp.position.set(oW/2, 0, ZP); rs.position.set(-pW/2, 0, 0);
      rp.add(rs); rp.userData.dir = -dm; sashes.push(rp);
      break;
    }
    case "hinged_door": {
      frame.add(buildOuterFrame(W, H, mat, true, mi, fw, type));
      const sash = buildSash(oW, oH, mat, "hinged_door", true, gs, cg, !opensIn, mi, sw, dd);
      const pivot = new THREE.Group();
      const isRight = openStyle === "right_hand";
      const hingeX = isRight ? oW/2 : -oW/2;
      const sashX = isRight ? -oW/2 : oW/2;
      pivot.position.set(hingeX, 0, ZP); sash.position.set(sashX, 0, 0);
      pivot.add(sash); pivot.userData.dir = (opensIn ? -1 : 1) * (isRight ? -1 : 1);
      sashes.push(pivot);
      break;
    }
    case "bifold_door": {
      frame.add(buildOuterFrame(W, H, mat, false, mi, fw, type));
      const pW = oW/panels;
      const dm = opensIn ? 1 : -1; // controls fold direction: outward = all panels toward +Z exterior

      // Determine how many panels fold left vs right based on openStyle
      var leftCount = 0, rightCount = 0;
      if (openStyle === "all_left") { leftCount = panels; rightCount = 0; }
      else if (openStyle === "all_right") { leftCount = 0; rightCount = panels; }
      else if (openStyle === "1L_rest_R") { leftCount = 1; rightCount = panels - 1; }
      else if (openStyle === "1R_rest_L") { leftCount = panels - 1; rightCount = 1; }
      else if (openStyle === "split") { leftCount = Math.floor(panels/2); rightCount = panels - leftCount; }
      else { leftCount = panels; rightCount = 0; } // default all left

      // Build left-folding panels (fold toward left side)
      for (let i = 0; i < leftCount; i++) {
        const s = buildSash(pW, oH, mat, "casement_window", i === 0, gs, cg, !opensIn, mi, sw, dd);
        const pivot = new THREE.Group();
        // Each panel pivots at its LEFT edge (hinge side for left-folding)
        const panelX = -oW/2 + i * pW;
        pivot.position.set(panelX, 0, ZP);
        s.position.set(pW/2, 0, 0);
        pivot.add(s);
        pivot.userData = {
          idx: i, groupIdx: i, total: panels, pW,
          foldDir: 'left', groupSize: leftCount, dm,
          startX: panelX
        };
        sashes.push(pivot);
      }

      // Build right-folding panels (fold toward right side)
      for (let i = 0; i < rightCount; i++) {
        const globalIdx = leftCount + i;
        const rightIdx = rightCount - 1 - i; // reverse order for right group
        const s = buildSash(pW, oH, mat, "casement_window", i === rightCount - 1, gs, cg, !opensIn, mi, sw, dd);
        const pivot = new THREE.Group();
        // Each panel pivots at its RIGHT edge (hinge side for right-folding)
        const panelX = -oW/2 + (globalIdx + 1) * pW;
        pivot.position.set(panelX, 0, ZP);
        s.position.set(-pW/2, 0, 0);
        pivot.add(s);
        pivot.userData = {
          idx: globalIdx, groupIdx: rightIdx, total: panels, pW,
          foldDir: 'right', groupSize: rightCount, dm,
          startX: panelX
        };
        sashes.push(pivot);
      }
      break;
    }
    case "lift_slide_door": {
      frame.add(buildOuterFrame(W, H, mat, true, mi, fw, type));
      const trackH = 0.01;
      frame.children[0].add(mergeMesh([box(oW, trackH, dd*0.35, 0, -oH/2 + trackH/2, 0)], mat));
      const pH = oH - trackH, pW = oW/(panels > 2 ? panels-1 : panels);
      for (let i = 0; i < panels; i++) {
        const isSlide = i === 0;
        const s = buildSash(pW, pH, mat, isSlide ? "lift_slide_door" : "none", isSlide, gs, cg, true, mi, sw, dd);
        const xp = -oW/2 + pW/2 + i*(panels > 1 ? (oW-pW)/(panels-1) : 0);
        s.position.set(xp, trackH/2, isSlide ? dd*0.12 : -dd*0.12);
        if (isSlide) { const sg = new THREE.Group(); sg.add(s); sg.userData = { slideMax: pW*0.92, liftH: 0.007 }; sashes.push(sg); }
        else frame.add(s);
      }
      break;
    }
    case "smart_slide_door": case "vario_slide_door": case "stacker_door": {
      frame.add(buildOuterFrame(W, H, mat, true, mi, fw, type));
      const pW = oW/panels;
      for (let i = 0; i < panels; i++) {
        const isFixed = i === panels - 1;
        const s = buildSash(pW, oH, mat, isFixed ? "none" : type, !isFixed, gs, cg, true, mi, sw, dd);
        s.position.set(-oW/2 + pW/2 + i*pW, 0, (i - panels/2)*dd*0.12);
        if (isFixed) frame.add(s);
        else { const sg = new THREE.Group(); sg.add(s); sg.userData.slideMax = pW*(panels-1-i)*0.92; sashes.push(sg); }
      }
      break;
    }
    default: { frame.add(buildOuterFrame(W, H, mat, false, mi, fw, type)); frame.add(buildFixedPanel(oW, oH, mat, gs, cg)); }
  }
  return { frame, sashes, W, H };
}

