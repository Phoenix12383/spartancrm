// ═══════════════════════════════════════════════════════════════════════════
// ANIMATIONS
// ═══════════════════════════════════════════════════════════════════════════

function animateSashes(type, sashes, t, opensIn, openStyle) {
  sashes.forEach(s => {
    s.rotation.set(0, 0, 0);
    if (s.userData.startX !== undefined) s.position.x = s.userData.startX;
    if (s.userData.startY !== undefined) s.position.y = s.userData.startY;
  });

  // Per-cell animation for grid layout sashes
  const hasGridCells = sashes.some(s => s.userData.cellType);
  if (hasGridCells) {
    sashes.forEach(s => {
      const ct = s.userData.cellType;
      if (ct === "awning") { s.rotation.x = -t * Math.PI * 0.25; }
      else if (ct === "casement") { s.rotation.y = t * Math.PI * 0.5; }
      else if (ct === "casement_l") { s.rotation.y =  t * Math.PI * 0.5; }
      else if (ct === "casement_r") { s.rotation.y = -t * Math.PI * 0.5; }
      else if (ct === "tilt_turn" || ct === "tilt_turn_l") {
        var ghl = s.userData.handleLever;
        var gtp = s.userData.tiltPivot;
        var ttHL = s.userData.ttHingeLeft;
        // Direction multipliers:
        //   hinge LEFT  (tilt_turn):   handle on right stile, grip routes via -π/2 toward sash;
        //                              turn opens inward with POSITIVE Y rotation.
        //   hinge RIGHT (tilt_turn_l): handle on left stile, grip routes via +π/2 toward sash;
        //                              turn opens inward with NEGATIVE Y rotation.
        var hDir = ttHL ? -1 : 1;
        var tDir = ttHL ? 1 : -1;
        if (gtp) gtp.rotation.set(0, 0, 0);
        s.rotation.y = 0;
        if (t <= 0.06) {
          if (ghl) { ghl.rotation.z = hDir * (t/0.06) * Math.PI; }
        } else if (t <= 0.30) {
          if (ghl) { ghl.rotation.z = hDir * Math.PI; }
          if (gtp) gtp.rotation.x = -((t-0.06)/0.24) * Math.PI * (15/180);
        } else if (t <= 0.42) {
          if (ghl) { ghl.rotation.z = hDir * Math.PI; }
          if (gtp) gtp.rotation.x = -(1-(t-0.30)/0.12) * Math.PI * (15/180);
        } else if (t <= 0.48) {
          if (ghl) { ghl.rotation.z = hDir * Math.PI * (1 - (t-0.42)/0.06); }
        } else if (t <= 0.54) {
          if (ghl) { ghl.rotation.z = hDir * ((t-0.48)/0.06) * Math.PI/2; }
        } else {
          if (ghl) { ghl.rotation.z = hDir * Math.PI/2; }
          s.rotation.y = tDir * ((t-0.54)/0.46) * Math.PI * 0.35;
        }
      }
    });
    return;
  }

  switch (type) {
    case "awning_window":
      sashes.forEach(s => { s.rotation.x = -t * Math.PI * 0.25; });
      break;
    case "casement_window":
      sashes.forEach((s, i) => {
        if (sashes.length === 1) {
          // Direction: pivot-at-RIGHT (left_hand) uses +t so far edge at pivot-local -oW
          // swings toward +Z (outward). Pivot-at-LEFT (right_hand) uses -t so far edge
          // at pivot-local +oW swings toward +Z (outward).
          s.rotation.y = (openStyle === "right_hand" ? -1 : 1) * t * Math.PI * 0.5;
        } else {
          s.rotation.y = (i === 0 ? 1 : -1) * t * Math.PI * 0.5;
        }
      });
      break;
    case "tilt_turn_window":
      sashes.forEach(s => {
        var tp = s.userData.tiltPivot;
        var hl = s.userData.handleLever;
        if (tp) { tp.rotation.set(0,0,0); }
        s.rotation.y = 0;
        // Handle rotates in the sash plane around the spindle axis.
        // hinge LEFT  (tilt_turn):   handle on right stile, grip routes via -π/2 toward sash; turn inward = positive Y.
        // hinge RIGHT (tilt_turn_l): handle on left stile,  grip routes via +π/2 toward sash; turn inward = negative Y.
        var ttHL = s.userData.ttHingeLeft !== false;  // default true (backward compat)
        var hDir = ttHL ? -1 : 1;
        var tDir = ttHL ? 1 : -1;
        if (openStyle === "turn_only") {
          // Handle DOWN→HORIZONTAL toward sash, then turn inward
          if (hl) { hl.rotation.z = t < 0.15 ? hDir * (t/0.15) * Math.PI/2 : hDir * Math.PI/2; }
          if (t > 0.15) { s.rotation.y = tDir * ((t-0.15)/0.85) * Math.PI * 0.35; }
        } else if (openStyle === "tilt_only") {
          // Handle DOWN→UP via toward-sash, then tilt inward
          if (hl) { hl.rotation.z = t < 0.15 ? hDir * (t/0.15) * Math.PI : hDir * Math.PI; }
          if (t > 0.15 && tp) { tp.rotation.x = -((t-0.15)/0.85) * Math.PI * (15/180); }
        } else {
          // Tilt then Turn — 7 phases, handle returns to DOWN between modes.
          // All rotation routes toward the sash (never outside the frame).
          if (t <= 0.06) {
            if (hl) { hl.rotation.z = hDir * (t/0.06) * Math.PI; }
          } else if (t <= 0.30) {
            if (hl) { hl.rotation.z = hDir * Math.PI; }
            if (tp) { tp.rotation.x = -((t-0.06) / 0.24) * Math.PI * (15/180); }
          } else if (t <= 0.42) {
            if (hl) { hl.rotation.z = hDir * Math.PI; }
            if (tp) { tp.rotation.x = -(1 - (t-0.30)/0.12) * Math.PI * (15/180); }
          } else if (t <= 0.48) {
            if (tp) { tp.rotation.x = 0; }
            if (hl) { hl.rotation.z = hDir * Math.PI * (1 - (t-0.42)/0.06); }
          } else if (t <= 0.54) {
            if (tp) { tp.rotation.x = 0; }
            if (hl) { hl.rotation.z = hDir * ((t-0.48)/0.06) * Math.PI/2; }
          } else {
            if (tp) { tp.rotation.x = 0; }
            if (hl) { hl.rotation.z = hDir * Math.PI/2; }
            s.rotation.y = tDir * ((t-0.54)/0.46) * Math.PI * 0.35;
          }
        }
      });
      break;
    case "sliding_window":
      sashes.forEach(s => {
        const dir = openStyle === "left_slides" ? -1 : 1;
        s.position.x = (s.userData.startX || 0) + dir * t * (s.userData.slideMax || 0.3);
      });
      break;
    case "french_door":
      sashes.forEach((s, i) => {
        const shouldOpen = openStyle === "both" || !openStyle
          || (openStyle === "left_hand" && i === 0) || (openStyle === "right_hand" && i === 1);
        if (shouldOpen) s.rotation.y = t * Math.PI * 0.5 * (s.userData.dir || 1);
      });
      break;
    case "hinged_door":
      sashes.forEach(s => { s.rotation.y = t * Math.PI * 0.5 * (s.userData.dir || 1); });
      break;
    case "bifold_door":
      sashes.forEach(s => {
        const { groupIdx, groupSize, pW, foldDir, dm, startX } = s.userData;
        if (!foldDir) return;
        const maxAngle = Math.PI * 0.42; // ~75 deg fold

        // Stagger: panels closer to the hinge wall fold first
        const delay = groupIdx / Math.max(1, groupSize);
        const pt = Math.max(0, Math.min(1, (t - delay * 0.3) / (1 - delay * 0.3)));

        // ALL panels fold to the SAME side of the frame
        // dm: inward = +1 (positive Y = toward -Z interior), outward = -1 (toward +Z exterior)
        // foldDir: left-fold base = +1, right-fold base = -1 (opposite hinge side)
        const baseDir = foldDir === 'left' ? 1 : -1;
        s.rotation.y = baseDir * dm * pt * maxAngle;

        // Translate toward stacking side as panels fold
        const stackDir = foldDir === 'left' ? -1 : 1;
        const slideAmount = groupIdx * pW * 0.88;
        s.position.x = startX + stackDir * pt * slideAmount;
      });
      break;
    case "lift_slide_door":
      sashes.forEach(s => {
        const lt = Math.min(1, t/0.15), st2 = Math.max(0, (t-0.15)/0.85);
        s.position.y = lt * (s.userData.liftH || 0.007);
        s.position.x = st2 * (s.userData.slideMax || 0.5);
      });
      break;
    case "smart_slide_door": case "stacker_door": case "vario_slide_door":
      sashes.forEach((s, i) => {
        const st2 = Math.min(1, t * (1 + i*0.25));
        s.position.x = st2 * (s.userData.slideMax || 0.3);
      });
      break;
  }
}

