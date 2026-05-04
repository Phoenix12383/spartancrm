// ═══════════════════════════════════════════════════════════════════════════
// FLY SCREEN BUILDER
// T&T: external (+Z), with flange overlap into frame rebate
// Awning/Casement: internal (-Z)
// ═══════════════════════════════════════════════════════════════════════════

function buildFlyScreen(openW, openH, profileDepth, mat, isExternal) {
  const g = new THREE.Group();

  // Fly screen aluminium frame dimensions
  const fsFrameW = 0.015;    // 15mm wide aluminium extrusion
  const fsFrameD = 0.007;    // 7mm deep
  const fsOverlap = 0.005;   // 5mm flange overlap onto window frame (T&T only)
  const fsGap = 0.003;       // 3mm gap between window frame face and fly screen

  // Total fly screen size
  const totalW = isExternal ? openW + fsOverlap * 2 : openW - 0.002;
  const totalH = isExternal ? openH + fsOverlap * 2 : openH - 0.002;
  const meshW = totalW - fsFrameW * 2;
  const meshH = totalH - fsFrameW * 2;

  // Z position
  const zPos = isExternal
    ? profileDepth / 2 + fsGap + fsFrameD / 2
    : -(profileDepth / 2 + fsGap + fsFrameD / 2);

  // --- Frame material: clone the actual window-profile material so the
  //     fly screen frame matches whatever finish the user selected —
  //     including photographic foil/aludec texture uploads, woodgrain,
  //     and clearcoat. Cloning preserves the map/normalMap/roughnessMap
  //     references so the GPU shares the same texture upload.
  //
  //     Reading `mat.color` was the previous approach but for textured
  //     materials `color` defaults to white (the texture supplies the
  //     colour), so the fly screen frame ended up flat white whenever
  //     the user had a wood or photographic aludec colour selected.
  var fsMat;
  if (mat && typeof mat.clone === 'function') {
    fsMat = mat.clone();
    // Slight aluminium feel: nudge metalness up a touch and roughness
    // down a touch, but only if the source isn't already metallic.
    if (typeof fsMat.metalness === 'number' && fsMat.metalness < 0.1) {
      fsMat.metalness = Math.min(1, fsMat.metalness + 0.08);
    }
    if (typeof fsMat.roughness === 'number') {
      fsMat.roughness = Math.max(0.1, fsMat.roughness - 0.05);
    }
  } else {
    // Fallback for the rare case mat isn't a real material — use a
    // neutral aluminium-like default.
    fsMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#cfcfcf'),
      roughness: 0.35, metalness: 0.2,
      clearcoat: 0.3, clearcoatRoughness: 0.4,
    });
  }
  // Track the source colour for the bevel/corner/flange tints. If the
  // material has no `color` channel (texture-driven), use a neutral
  // mid-grey so the inset edges still read as slightly darker frame.
  var srcCol = (mat && mat.color) ? mat.color : new THREE.Color('#888');
  var fr = srcCol.r, fg = srcCol.g, fb = srcCol.b;

  // Build frame extrusion - 4 pieces with visible channel groove
  var frameBoxes = [
    box(totalW, fsFrameW, fsFrameD, 0, totalH / 2 - fsFrameW / 2, zPos),
    box(totalW, fsFrameW, fsFrameD, 0, -totalH / 2 + fsFrameW / 2, zPos),
    box(fsFrameW, totalH - fsFrameW * 2, fsFrameD, -totalW / 2 + fsFrameW / 2, 0, zPos),
    box(fsFrameW, totalH - fsFrameW * 2, fsFrameD, totalW / 2 - fsFrameW / 2, 0, zPos),
  ];
  g.add(mergeMesh(frameBoxes, fsMat));

  // Frame inner bevel/chamfer — slightly darker/matter inset that reads
  // as recessed. Clones the frame material so textured colours (wood,
  // photographic aludec) carry through; we just bump roughness up a
  // notch and dim the tint a little.
  var bevelMat;
  if (typeof fsMat.clone === 'function') {
    bevelMat = fsMat.clone();
    if (typeof bevelMat.roughness === 'number') bevelMat.roughness = Math.min(1, bevelMat.roughness + 0.15);
    if (bevelMat.color) bevelMat.color = new THREE.Color(bevelMat.color.r * 0.88, bevelMat.color.g * 0.88, bevelMat.color.b * 0.88);
  } else {
    bevelMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(fr * 0.88, fg * 0.88, fb * 0.88), roughness: 0.5, metalness: 0.1,
    });
  }
  var bvW = 0.002, bvD = fsFrameD + 0.001;
  var ix = totalW / 2 - fsFrameW + bvW / 2;
  var iy = totalH / 2 - fsFrameW + bvW / 2;
  g.add(mergeMesh([
    box(meshW, bvW, bvD, 0, iy, zPos),
    box(meshW, bvW, bvD, 0, -iy, zPos),
    box(bvW, meshH, bvD, -ix, 0, zPos),
    box(bvW, meshH, bvD, ix, 0, zPos),
  ], bevelMat));

  // Flange lip for external T&T
  if (isExternal) {
    const flangeW = 0.003;
    const flangeD = 0.008;
    var flangeMat;
    if (typeof fsMat.clone === 'function') {
      flangeMat = fsMat.clone();
      if (flangeMat.color) flangeMat.color = new THREE.Color(flangeMat.color.r * 0.92, flangeMat.color.g * 0.92, flangeMat.color.b * 0.92);
    } else {
      flangeMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(fr * 0.92, fg * 0.92, fb * 0.92),
        roughness: 0.35, metalness: 0.15,
      });
    }
    const flangeZ = zPos - fsFrameD / 2 - flangeD / 2;
    g.add(mergeMesh([
      box(totalW - fsOverlap * 2, flangeW, flangeD, 0, totalH / 2 - fsOverlap - flangeW / 2, flangeZ),
      box(totalW - fsOverlap * 2, flangeW, flangeD, 0, -totalH / 2 + fsOverlap + flangeW / 2, flangeZ),
      box(flangeW, totalH - fsOverlap * 2 - flangeW * 2, flangeD, -totalW / 2 + fsOverlap + flangeW / 2, 0, flangeZ),
      box(flangeW, totalH - fsOverlap * 2 - flangeW * 2, flangeD, totalW / 2 - fsOverlap - flangeW / 2, 0, flangeZ),
    ], flangeMat));
  }

  // --- Hyper-realistic fiberglass mesh texture ---
  // Standard insect mesh: 18x16 count (18 strands per inch horizontal, 16 vertical)
  var meshCanvas = document.createElement('canvas');
  var texSize = 256;
  meshCanvas.width = texSize;
  meshCanvas.height = texSize;
  var ctx = meshCanvas.getContext('2d');

  // Light semi-transparent backing so mesh reads as a visible layer
  ctx.fillStyle = 'rgba(40,40,40,0.15)';
  ctx.fillRect(0, 0, texSize, texSize);

  // Draw the mesh strands - charcoal grey, clearly visible
  var strandsH = 48;
  var strandsV = 42;
  var strandW = 2.0; // thicker strands for visibility

  // Horizontal strands
  for (var i = 0; i <= strandsH; i++) {
    var y = (i / strandsH) * texSize;
    var shade = 55 + Math.floor(Math.random() * 20);
    ctx.fillStyle = 'rgba(' + shade + ',' + shade + ',' + shade + ',0.95)';
    ctx.fillRect(0, y - strandW / 2, texSize, strandW);
  }

  // Vertical strands
  for (var j = 0; j <= strandsV; j++) {
    var x = (j / strandsV) * texSize;
    var shade2 = 50 + Math.floor(Math.random() * 18);
    ctx.fillStyle = 'rgba(' + shade2 + ',' + shade2 + ',' + shade2 + ',0.95)';
    ctx.fillRect(x - strandW / 2, 0, strandW, texSize);
  }

  // Intersection bumps - lighter nodes where strands cross
  for (var i = 0; i <= strandsH; i++) {
    for (var j = 0; j <= strandsV; j++) {
      var cx2 = (j / strandsV) * texSize;
      var cy2 = (i / strandsH) * texSize;
      ctx.fillStyle = 'rgba(75,75,75,0.5)';
      ctx.fillRect(cx2 - strandW * 0.8, cy2 - strandW * 0.8, strandW * 1.6, strandW * 1.6);
    }
  }

  var meshTex = new THREE.CanvasTexture(meshCanvas);
  meshTex.wrapS = THREE.RepeatWrapping;
  meshTex.wrapT = THREE.RepeatWrapping;
  // Scale repeats based on actual mesh size in metres
  // Each texture tile covers ~50mm, so repeat = meshSize / 0.05
  meshTex.repeat.set(meshW / 0.045, meshH / 0.045);
  meshTex.minFilter = THREE.LinearMipmapLinearFilter;
  meshTex.magFilter = THREE.LinearFilter;
  meshTex.anisotropy = 4;

  var meshMat2 = new THREE.MeshStandardMaterial({
    map: meshTex,
    transparent: true,
    opacity: 0.85,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: true,
    color: new THREE.Color('#555555'),
  });

  var meshPlane = new THREE.Mesh(new THREE.PlaneGeometry(meshW, meshH), meshMat2);
  meshPlane.position.z = zPos;
  meshPlane.renderOrder = 2;
  g.add(meshPlane);

  // Spline channel - dark rubber strip around inner perimeter
  var splineMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1a1a1a'), roughness: 0.85, metalness: 0.0,
  });
  var spW = 0.003, spD = 0.003;
  var spIx = totalW / 2 - fsFrameW + spW / 2 + 0.0005;
  var spIy = totalH / 2 - fsFrameW + spW / 2 + 0.0005;
  g.add(mergeMesh([
    box(meshW + spW, spW, spD, 0, spIy, zPos + fsFrameD / 2 - spD / 2 + 0.0005),
    box(meshW + spW, spW, spD, 0, -spIy, zPos + fsFrameD / 2 - spD / 2 + 0.0005),
    box(spW, meshH, spD, -spIx, 0, zPos + fsFrameD / 2 - spD / 2 + 0.0005),
    box(spW, meshH, spD, spIx, 0, zPos + fsFrameD / 2 - spD / 2 + 0.0005),
  ], splineMat));

  // Pull tab — clones the frame material so it matches in texture/colour
  var tabMat = (typeof fsMat.clone === 'function') ? fsMat.clone() : fsMat;
  g.add(mergeMesh([
    box(0.030, 0.010, fsFrameD + 0.003, 0, -totalH / 2 + 0.005, zPos),
  ], tabMat));

  // Corner press-fit pieces — same look as frame, slightly dimmed
  var cornerMat;
  if (typeof fsMat.clone === 'function') {
    cornerMat = fsMat.clone();
    if (cornerMat.color) cornerMat.color = new THREE.Color(cornerMat.color.r * 0.9, cornerMat.color.g * 0.9, cornerMat.color.b * 0.9);
  } else {
    cornerMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(fr * 0.9, fg * 0.9, fb * 0.9), roughness: 0.4, metalness: 0.1,
    });
  }
  var cornerSize = 0.009;
  var ccx = totalW / 2 - fsFrameW / 2, ccy = totalH / 2 - fsFrameW / 2;
  g.add(mergeMesh([
    box(cornerSize, cornerSize, fsFrameD + 0.002, -ccx, ccy, zPos),
    box(cornerSize, cornerSize, fsFrameD + 0.002, ccx, ccy, zPos),
    box(cornerSize, cornerSize, fsFrameD + 0.002, -ccx, -ccy, zPos),
    box(cornerSize, cornerSize, fsFrameD + 0.002, ccx, -ccy, zPos),
  ], cornerMat));

  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// 3D Dimension Lines + anchor points for HTML bubble overlay
// ═══════════════════════════════════════════════════════════════════════════
function buildDimensionLines(W, H, fw, mw, zoneWs, zoneHs, numC, numR) {
  var g = new THREE.Group();
  var lineMat = new THREE.LineBasicMaterial({ color: 0x888888, depthTest: false, transparent: true, opacity: 0.6 });
  var tickLen = 0.008;
  var offset = 0.065;
  var oW = W - fw * 2;
  var oH = H - fw * 2;
  var anchors = []; // {pos: Vector3, mm: number, axis: 'w'|'h', idx: number}

  function mkLine(x1,y1,x2,y2) {
    var pts = [new THREE.Vector3(x1,y1,0), new THREE.Vector3(x2,y2,0)];
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
  }

  // ── BOTTOM: width dimensions ──
  // WIP10: dimension from mullion centerline to mullion/frame centerline, per
  // fabrication convention ("measured from the middle"). First & last segments
  // span half of the adjacent mullion; middle segments span full mullion.
  var by = -H/2 - offset;
  if (numC > 1 && zoneWs && zoneWs.length === numC) {
    // Build centerline boundaries in scene units.
    var cBounds = [-oW/2];
    var cAcc = -oW/2;
    for (var c = 0; c < numC; c++) {
      var zw = zoneWs[c] * S;
      if (c < numC - 1) {
        cAcc += zw + mw/2;     // advance through cell + half the mullion → centerline
        cBounds.push(cAcc);
        cAcc += mw/2;          // advance through the other half of the mullion
      } else {
        cAcc += zw;            // final cell ends at frame inner edge
      }
    }
    cBounds.push(oW/2);
    for (var c = 0; c < numC; c++) {
      var x1 = cBounds[c], x2 = cBounds[c+1];
      g.add(mkLine(x1, by, x2, by));
      g.add(mkLine(x1, by - tickLen, x1, by + tickLen));
      g.add(mkLine(x2, by - tickLen, x2, by + tickLen));
      if (c === 0) g.add(mkLine(x1, -H/2, x1, by - tickLen));
      g.add(mkLine(x2, -H/2, x2, by - tickLen));
      var segMm = Math.round((x2 - x1) / S);
      anchors.push({ pos: new THREE.Vector3((x1+x2)/2, by, 0), mm: segMm, axis: 'w', idx: c });
    }
  } else {
    // Single width
    g.add(mkLine(-W/2, by, W/2, by));
    g.add(mkLine(-W/2, by - tickLen, -W/2, by + tickLen));
    g.add(mkLine(W/2, by - tickLen, W/2, by + tickLen));
    g.add(mkLine(-W/2, -H/2, -W/2, by - tickLen));
    g.add(mkLine(W/2, -H/2, W/2, by - tickLen));
    anchors.push({ pos: new THREE.Vector3(0, by, 0), mm: Math.round(W/S), axis: 'total_w', idx: -1 });
  }

  // ── LEFT: height dimensions ──
  var lx = -W/2 - offset;
  if (numR > 1 && zoneHs && zoneHs.length === numR) {
    var rBounds = [oH/2];
    var rAcc = oH/2;
    for (var r = 0; r < numR; r++) {
      var zh = zoneHs[r] * S;
      if (r < numR - 1) {
        rAcc -= zh + mw/2;     // advance down through cell + half transom → centerline
        rBounds.push(rAcc);
        rAcc -= mw/2;
      } else {
        rAcc -= zh;
      }
    }
    rBounds.push(-oH/2);
    for (var r = 0; r < numR; r++) {
      var y1 = rBounds[r], y2 = rBounds[r+1];
      g.add(mkLine(lx, y1, lx, y2));
      g.add(mkLine(lx - tickLen, y1, lx + tickLen, y1));
      g.add(mkLine(lx - tickLen, y2, lx + tickLen, y2));
      if (r === 0) g.add(mkLine(-W/2, y1, lx - tickLen, y1));
      g.add(mkLine(-W/2, y2, lx - tickLen, y2));
      var segMmH = Math.round((y1 - y2) / S);
      anchors.push({ pos: new THREE.Vector3(lx, (y1+y2)/2, 0), mm: segMmH, axis: 'h', idx: r });
    }
  } else {
    g.add(mkLine(lx, -H/2, lx, H/2));
    g.add(mkLine(lx - tickLen, -H/2, lx + tickLen, -H/2));
    g.add(mkLine(lx - tickLen, H/2, lx + tickLen, H/2));
    g.add(mkLine(-W/2, -H/2, lx - tickLen, -H/2));
    g.add(mkLine(-W/2, H/2, lx - tickLen, H/2));
    anchors.push({ pos: new THREE.Vector3(lx, 0, 0), mm: Math.round(H/S), axis: 'total_h', idx: -1 });
  }

  g.renderOrder = 10;
  g.userData.dimAnchors = anchors;
  return g;
}

