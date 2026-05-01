// ═══════════════════════════════════════════════════════════════════════════
// Feature 4: Accurate hardware builders
// ═══════════════════════════════════════════════════════════════════════════

function buildSiegeniaHandle(sW, sH, hwCol) {
  // White tilt-turn handle — tall backplate, flat rectangular lever
  // Matches real Aluplast Ideal 4000 reference photo
  const g = new THREE.Group();
  const wm = makeWhiteABS(hwCol);
  const cm = makeChrome(hwCol);

  // Backplate — white rectangular, 180mm tall x 35mm wide x 8mm deep
  g.add(mergeMesh([box(0.035, 0.180, 0.008, 0, 0, 0)], wm));
  // Slight raised border around backplate edge
  g.add(mergeMesh([
    box(0.037, 0.002, 0.009, 0, 0.090, 0),
    box(0.037, 0.002, 0.009, 0, -0.090, 0),
    box(0.002, 0.180, 0.009, 0.018, 0, 0),
    box(0.002, 0.180, 0.009, -0.018, 0, 0),
  ], wm));

  // Spindle boss — small square raised section at pivot point
  g.add(mergeMesh([box(0.018, 0.018, 0.006, 0, 0.020, 0.006)], wm));

  // Lever — white flat rectangular bar, 120mm long x 18mm wide x 10mm thick
  // Points horizontally to the left in closed position
  const leverGroup = new THREE.Group();
  leverGroup.position.set(0, 0.020, 0.010);
  // Main lever bar
  leverGroup.add(mergeMesh([box(0.018, 0.120, 0.010, 0, 0.060, 0)], wm));
  // Lever tip — slightly rounded/wider end
  leverGroup.add(mergeMesh([box(0.022, 0.020, 0.012, 0, 0.118, 0)], wm));
  // Small keyhole/lock cylinder at base
  leverGroup.add(mergeMesh([cyl(0.004, 0.004, 0, -0.005, 0.003)], cm));

  // Lever rotated horizontal (pointing left when viewed from interior)
  leverGroup.rotation.z = Math.PI / 2;
  g.add(leverGroup);

  // Position on right stile, interior face
  // 1000mm from bottom on tall sashes, center on small ones
  const handleY = sH > 1.2 ? (-sH/2 + 1.0) : 0;
  const zo = -SASH_Z + D/2 + 0.005;
  g.position.set(0, handleY, zo);
  return g;
}

function buildWinder(sW, sH, hwCol) {
  // Truth Encore Awning Operator — sill-mounted, die-cast housing,
  // white snap-on cover with folding handle, steel scissor arms.
  // Cover: 135mm L x 41mm H x 33mm W. Housing: 127mm x 63mm x 20mm.
  // Folding handle: 128mm zinc, recesses flat into cover.
  // Scissor arms: two flat steel bars ~10mm wide x 3mm thick.
  const g = new THREE.Group();
  const wm = makeWhiteABS(hwCol); const cm = makeChrome(hwCol);
  const sealM = makeSeal();

  // --- Housing base (die-cast zinc, painted white) ---
  // 127mm x 63mm x 20mm
  g.add(mergeMesh([box(0.063, 0.020, 0.127, 0, 0, 0)], wm));

  // --- Snap-on cover (white plastic, rounded top profile) ---
  // 135mm L x 41mm H x 33mm W — sits on top of housing
  // Main cover body
  g.add(mergeMesh([box(0.067, 0.025, 0.135, 0, 0.020, 0)], wm));
  // Rounded top ridge (simulates the domed cover top)
  g.add(mergeMesh([box(0.055, 0.006, 0.125, 0, 0.035, 0)], wm));
  // Cover edge lip (thin border around base of cover)
  g.add(mergeMesh([
    box(0.069, 0.003, 0.002, 0, 0.008, 0.068),
    box(0.069, 0.003, 0.002, 0, 0.008, -0.068),
    box(0.002, 0.003, 0.135, 0.034, 0.008, 0),
    box(0.002, 0.003, 0.135, -0.034, 0.008, 0),
  ], wm));

  // --- Handle recess slot (dark groove in cover top) ---
  g.add(mergeMesh([box(0.014, 0.004, 0.110, 0, 0.038, 0)], sealM));

  // --- Folding handle (128mm zinc, rests flat in the recess) ---
  // At rest: handle folded flat into the cover slot
  const handle = new THREE.Group();
  handle.position.set(0, 0.040, 0);
  // Handle bar — flat when folded
  handle.add(mergeMesh([box(0.012, 0.005, 0.100, 0, 0, 0)], cm));
  // Handle grip knob (small bulge at the end)
  handle.add(mergeMesh([box(0.016, 0.007, 0.018, 0, 0, 0.052)], cm));
  // Spindle boss (small cylinder at pivot end)
  handle.add(mergeMesh([cyl(0.006, 0.008, 0, -0.002, -0.048)], cm));
  g.add(handle);
  g.userData.handle = handle;

  // --- Scissor arms (two flat steel bars extending upward to sash) ---
  // Arms span ~150mm upward when closed (folded Z-shape)
  const armMat = makeMat("#888888", 0.4, 0.6); // steel finish
  // Left arm
  g.add(mergeMesh([box(0.010, 0.140, 0.003, -0.012, 0.090, -0.030)], armMat));
  // Right arm (crosses over left)
  g.add(mergeMesh([box(0.010, 0.140, 0.003, 0.012, 0.090, -0.025)], armMat));
  // Arm pivot pin (at the crossing point)
  g.add(mergeMesh([cyl(0.003, 0.020, 0, 0.070, -0.028)], cm));
  // Top arm ends — hook/shoe pieces that attach to sash track
  g.add(mergeMesh([
    box(0.014, 0.008, 0.010, -0.012, 0.162, -0.030),
    box(0.014, 0.008, 0.010, 0.012, 0.162, -0.025),
  ], armMat));
  // Bottom arm pivot brackets on housing
  g.add(mergeMesh([
    box(0.006, 0.012, 0.010, -0.020, 0.010, -0.030),
    box(0.006, 0.012, 0.010, 0.020, 0.010, -0.025),
  ], armMat));

  // --- Mounting screws (4 visible screw heads) ---
  const screwPositions = [[-0.022, -0.008, 0.050], [0.022, -0.008, 0.050],
                          [-0.022, -0.008, -0.050], [0.022, -0.008, -0.050]];
  screwPositions.forEach(([sx, sy, sz]) => {
    g.add(mergeMesh([cyl(0.003, 0.002, sx, sy, sz)], cm));
  });

  // Position: centred on bottom rail of sash, on the interior face
  const zo = D/2 + SASH_Z + 0.005;
  g.position.set(0, -sH/2 + 0.035, zo);
  // Rotate so the long axis (Z=135mm) runs horizontally along the rail
  g.rotation.x = -Math.PI * 0.05; // slight tilt for natural look
  return g;
}

function buildCasementOperator(sW, sH, hwCol) {
  // Truth Encore Casement Operator — sill-mounted, single arm design.
  // Same housing/cover/handle as awning but with a single push arm
  // instead of scissor arms. Arm extends sideways to push sash open.
  const g = new THREE.Group();
  const wm = makeWhiteABS(hwCol); const cm = makeChrome(hwCol);
  const sealM = makeSeal();

  // --- Housing base (same as awning: 127mm x 63mm x 20mm) ---
  g.add(mergeMesh([box(0.063, 0.020, 0.127, 0, 0, 0)], wm));

  // --- Cover (135mm x 41mm x 33mm white plastic) ---
  g.add(mergeMesh([box(0.067, 0.025, 0.135, 0, 0.020, 0)], wm));
  g.add(mergeMesh([box(0.055, 0.006, 0.125, 0, 0.035, 0)], wm));
  // Cover lip
  g.add(mergeMesh([
    box(0.069, 0.003, 0.002, 0, 0.008, 0.068),
    box(0.069, 0.003, 0.002, 0, 0.008, -0.068),
    box(0.002, 0.003, 0.135, 0.034, 0.008, 0),
    box(0.002, 0.003, 0.135, -0.034, 0.008, 0),
  ], wm));

  // --- Handle recess slot ---
  g.add(mergeMesh([box(0.014, 0.004, 0.110, 0, 0.038, 0)], sealM));

  // --- Folding handle (same as awning, 128mm zinc flat in recess) ---
  const handle = new THREE.Group();
  handle.position.set(0, 0.040, 0);
  handle.add(mergeMesh([box(0.012, 0.005, 0.100, 0, 0, 0)], cm));
  handle.add(mergeMesh([box(0.016, 0.007, 0.018, 0, 0, 0.052)], cm));
  handle.add(mergeMesh([cyl(0.006, 0.008, 0, -0.002, -0.048)], cm));
  g.add(handle);

  // --- Single push arm (extends sideways from housing to sash stile) ---
  // Arm link: ~124mm (4-7/8"), flat stamped steel
  const armMat = makeMat("#888888", 0.4, 0.6);
  // Main arm bar — extends from housing toward the hinge side
  g.add(mergeMesh([box(0.010, 0.003, 0.120, 0, 0.015, -0.090)], armMat));
  // Arm offset link (short connecting piece, ~50mm)
  g.add(mergeMesh([box(0.010, 0.003, 0.050, -0.015, 0.015, -0.155)], armMat));
  // Link pivot pins
  g.add(mergeMesh([
    cyl(0.003, 0.010, 0, 0.015, -0.030),   // housing end pivot
    cyl(0.003, 0.010, -0.015, 0.015, -0.180), // sash end pivot
  ], cm));
  // Stud bracket (clips arm to sash — small L-bracket)
  g.add(mergeMesh([
    box(0.016, 0.012, 0.003, -0.015, 0.008, -0.180),
    box(0.016, 0.003, 0.010, -0.015, 0.002, -0.175),
  ], armMat));

  // --- Mounting screws ---
  const screwPositions = [[-0.022, -0.008, 0.050], [0.022, -0.008, 0.050],
                          [-0.022, -0.008, -0.050], [0.022, -0.008, -0.050]];
  screwPositions.forEach(([sx, sy, sz]) => {
    g.add(mergeMesh([cyl(0.003, 0.002, sx, sy, sz)], cm));
  });

  // Position: bottom sill of sash, offset toward hinge side
  const zo = D/2 + SASH_Z + 0.005;
  g.position.set(0, -sH/2 + 0.035, zo);
  return g;
}

function buildSashLock(sW, sH, hwCol) {
  // Sash lock: body 40x20x12mm, cam lever 30mm
  const g = new THREE.Group(); const cm = makeChrome(hwCol);
  g.add(mergeMesh([box(0.020, 0.040, 0.012, 0, 0, 0)], cm));
  // Cam lever
  const cam = new THREE.Group();
  cam.position.set(0, 0, 0.006);
  cam.add(mergeMesh([box(0.008, 0.030, 0.006, 0, 0.015, 0)], cm));
  g.add(cam);
  g.userData.cam = cam;
  // Position: mid-height of sash, on meeting stile
  const zo = D/2 + SASH_Z + 0.005;
  g.position.set(sW/2 - 0.015, 0, zo);
  return g;
}

function buildEspag(sH, hwCol) {
  // Espagnolette: 8x8mm bar full height, 3 keeper boxes
  const g = new THREE.Group(); const cm = makeChrome(hwCol);
  // Main bar
  g.add(mergeMesh([box(0.008, sH * 0.92, 0.008, 0, 0, 0)], cm));
  // Three keeper boxes at top, middle, bottom
  const keepers = [-sH * 0.38, 0, sH * 0.38];
  keepers.forEach(y => { g.add(mergeMesh([box(0.015, 0.015, 0.012, 0, y, 0.005)], cm)); });
  return g;
}

function buildHardware(type, sW, sH, handlePos, hwCol) {
  const g = new THREE.Group();
  if (type === "awning_window") {
    // Hardware is frame-mounted, added in buildProduct — nothing on sash
    return g;
  } else if (type === "casement_window") {
    g.add(buildCasementOperator(sW, sH, hwCol));
  } else if (type === "sliding_window" || type === "smart_slide_door" || type === "vario_slide_door"
    || type === "stacker_door" || type === "lift_slide_door") {
    g.add(buildSashLock(sW, sH, hwCol));
  } else if (type === "french_door" || type === "hinged_door") {
    g.add(buildSiegeniaHandle(sW, sH, hwCol));
    const espag = buildEspag(sH, hwCol);
    espag.position.set(-sW/2 + 0.006, 0, D/2 + SASH_Z);
    g.add(espag);
  } else {
    g.add(buildSiegeniaHandle(sW, sH, hwCol));
  }
  return g;
}

// Awning window hardware — mounts on FRAME (not sash), INTERIOR face (+Z)
// W, H = full frame outer dimensions
function buildAwningHardware(W, H, hwCol, optFw, optD) {
  var g = new THREE.Group();
  var wm = makeWhiteABS(hwCol);
  var cm = makeChrome(hwCol);
  var sealM = makeSeal();
  var outline = makeHardwareOutline(hwCol);
  var fwLocal = optFw || FW;
  var dLocal = optD || D;

  // Due to ext/int inversion in geometry: -Z is actually the INTERIOR (room side)
  var zo = -dLocal/2 - 0.002;

  // Truth Maxim Sash Lock — spec: 117.1mm H x 20.1mm W
  // Placement rules (Truth Hardware installation guide):
  //   Opening height < 600mm: lock 150mm from bottom of opening
  //   Opening height 600-1200mm: lock at 1/3 height from bottom
  //   Opening height > 1200mm: lock at 1/4 height from bottom
  // On frame stiles, interior face (-Z)
  var openH = H - fwLocal * 2;
  var openH_mm = openH / S;
  var lockOffsetMm = openH_mm < 600 ? 150 : openH_mm < 1200 ? Math.round(openH_mm / 3) : Math.round(openH_mm / 4);
  var lockOffset = lockOffsetMm * S;

  function makeSashLock(xSign) {
    var lock = new THREE.Group();
    // Dark shadow outline behind lock (creates visible border against white frame)
    lock.add(mergeMesh([box(0.0231, 0.1201, 0.001, 0, 0, 0.001)], outline));
    // Backplate
    lock.add(mergeMesh([box(0.0201, 0.1171, 0.003, 0, 0, 0)], wm));
    // Lock body
    lock.add(mergeMesh([box(0.016, 0.100, 0.008, 0, -0.005, -0.005)], wm));
    // Rounded ends
    lock.add(mergeMesh([cyl(0.008, 0.016, 0, 0.045, -0.005, 0, Math.PI/2)], wm));
    lock.add(mergeMesh([cyl(0.008, 0.016, 0, -0.052, -0.005, 0, Math.PI/2)], wm));
    // Centre ridge
    lock.add(mergeMesh([box(0.004, 0.080, 0.002, 0, -0.005, -0.010)], wm));
    // Chrome cam
    var cam = new THREE.Group();
    cam.position.set(0, 0.040, -0.009);
    cam.add(mergeMesh([box(0.018, 0.010, 0.004, 0, 0, 0)], cm));
    cam.add(mergeMesh([cyl(0.003, 0.006, 0, -0.002, 0)], cm));
    lock.add(cam);
    // Position: center of frame stile, lockOffset above bottom of opening
    lock.position.set(xSign * (W/2 - fwLocal/2), -H/2 + fwLocal + lockOffset, zo);
    return lock;
  }
  g.add(makeSashLock(-1));
  g.add(makeSashLock(1));

  // Truth Encore Winder — spec: cover 135.4mm x 50.1mm x 10.3mm
  // On frame bottom rail, dead centre, interior face (-Z)
  var winder = new THREE.Group();
  var covW = 0.1354, covH = 0.0501, covD = 0.0103;
  // Dark shadow outline behind cover
  winder.add(mergeMesh([box(covW + 0.006, covH + 0.006, 0.001, 0, 0, 0.001)], outline));
  // Main cover body
  winder.add(mergeMesh([box(covW, covH, covD, 0, 0, -covD/2)], wm));
  winder.add(mergeMesh([box(covW - 0.010, covH * 0.6, 0.003, 0, covH * 0.08, -covD - 0.001)], wm));
  winder.add(mergeMesh([
    box(covW + 0.002, 0.002, covD + 0.002, 0, covH/2, -covD/2),
    box(covW + 0.002, 0.002, covD + 0.002, 0, -covH/2, -covD/2),
    box(0.002, covH, covD + 0.002, covW/2, 0, -covD/2),
    box(0.002, covH, covD + 0.002, -covW/2, 0, -covD/2),
  ], outline));
  winder.add(mergeMesh([box(0.100, 0.010, 0.002, 0, covH * 0.08, -covD - 0.002)], sealM));
  var handle = new THREE.Group();
  handle.position.set(0, covH * 0.08, -covD - 0.003);
  handle.add(mergeMesh([box(0.090, 0.008, 0.003, 0, 0, 0)], cm));
  handle.add(mergeMesh([box(0.018, 0.012, 0.005, 0.040, 0, 0)], cm));
  handle.add(mergeMesh([cyl(0.005, 0.005, -0.043, 0, 0)], cm));
  winder.add(handle);
  [[-0.050, -covH*0.3], [0.050, -covH*0.3],
   [-0.050, covH*0.3], [0.050, covH*0.3]].forEach(function(p) {
    winder.add(mergeMesh([cyl(0.002, 0.002, p[0], p[1], -covD - 0.001)], cm));
  });
  winder.position.set(0, -H/2 + fwLocal/2, zo);
  g.add(winder);

  return g;
}

// Casement window hardware — mounts on FRAME, INTERIOR face
// Winder: BOTTOM RAIL, at the edge where the sash starts (free side)
// Sash lock: HINGE-SIDE STILE (single), or MULLION (double opening, 2 locks)
function buildCasementHardware(W, H, hwCol, openStyle, panels, optFw, optD) {
  var g = new THREE.Group();
  var wm = makeWhiteABS(hwCol); var cm = makeChrome(hwCol);
  var sealM = makeSeal(); var outline = makeHardwareOutline(hwCol);
  var fwLocal = optFw || FW;
  var dLocal = optD || D;
  var zo = -dLocal/2 - 0.002;

  var openH = H - fwLocal * 2;
  var openH_mm = openH / S;

  // Handedness: the "_l/_r" / "left_hand/right_hand" suffix names the HANDLE side.
  // casement_l / left_hand  = handle LEFT, hinge RIGHT.
  // casement_r / right_hand = handle RIGHT, hinge LEFT.
  // Schematic apex points in the opening direction (= handle side / free side).
  var freeSideX = (openStyle === "right_hand") ? 1 : -1;
  var hingeSideX = -freeSideX;

  // --- Sash Locks on FREE-side stile (interior face), always 2, evenly spread ---
  function makeCasLock(yPos) {
    var lock = new THREE.Group();
    lock.add(mergeMesh([box(0.0231, 0.1201, 0.001, 0, 0, 0.001)], outline));
    lock.add(mergeMesh([box(0.0201, 0.1171, 0.003, 0, 0, 0)], wm));
    lock.add(mergeMesh([box(0.016, 0.100, 0.008, 0, -0.005, -0.005)], wm));
    lock.add(mergeMesh([cyl(0.008, 0.016, 0, 0.045, -0.005, 0, Math.PI/2)], wm));
    lock.add(mergeMesh([cyl(0.008, 0.016, 0, -0.052, -0.005, 0, Math.PI/2)], wm));
    lock.add(mergeMesh([box(0.004, 0.080, 0.002, 0, -0.005, -0.010)], wm));
    var cam = new THREE.Group();
    cam.position.set(0, 0.040, -0.009);
    cam.add(mergeMesh([box(0.018, 0.010, 0.004, 0, 0, 0)], cm));
    cam.add(mergeMesh([cyl(0.003, 0.006, 0, -0.002, 0)], cm));
    lock.add(cam);
    lock.position.set(freeSideX * (W/2 - fwLocal/2), yPos, zo);
    return lock;
  }

  if (panels === 1) {
    // Always 2 locks, at ±openH/3 about centre (evenly spread).
    g.add(makeCasLock(openH / 3));
    g.add(makeCasLock(-openH / 3));
  } else {
    // 2-panel double opening: 2 sash locks at the center mullion, one per panel
    var mwCas = getProfileDims("casement_window").mullionW * S;
    g.add(makeCasLock(0));  // lock 1 at center (uses hingeSideX but for 2-panel we override below)
    // For double opening, locks go on the center mullion (meeting point)
    // Override: place both locks on the mullion stile, one for each panel
    g.children[g.children.length - 1].position.x = mwCas / 2;
    var lock2 = makeCasLock(0);
    lock2.position.x = -mwCas / 2;
    g.add(lock2);
  }

  // --- Winder on BOTTOM RAIL (interior face) ---
  var covW = 0.1354, covH = 0.0501, covD = 0.0103;
  function makeCasWinder(xPos) {
    var winder = new THREE.Group();
    winder.add(mergeMesh([box(covW + 0.006, covH + 0.006, 0.001, 0, 0, 0.001)], outline));
    winder.add(mergeMesh([box(covW, covH, covD, 0, 0, -covD/2)], wm));
    winder.add(mergeMesh([box(covW - 0.010, covH * 0.6, 0.003, 0, covH * 0.08, -covD - 0.001)], wm));
    winder.add(mergeMesh([
      box(covW + 0.002, 0.002, covD + 0.002, 0, covH/2, -covD/2),
      box(covW + 0.002, 0.002, covD + 0.002, 0, -covH/2, -covD/2),
      box(0.002, covH, covD + 0.002, covW/2, 0, -covD/2),
      box(0.002, covH, covD + 0.002, -covW/2, 0, -covD/2),
    ], outline));
    winder.add(mergeMesh([box(0.100, 0.010, 0.002, 0, covH * 0.08, -covD - 0.002)], sealM));
    var handle = new THREE.Group();
    handle.position.set(0, covH * 0.08, -covD - 0.003);
    handle.add(mergeMesh([box(0.090, 0.008, 0.003, 0, 0, 0)], cm));
    handle.add(mergeMesh([box(0.018, 0.012, 0.005, 0.040, 0, 0)], cm));
    handle.add(mergeMesh([cyl(0.005, 0.005, -0.043, 0, 0)], cm));
    winder.add(handle);
    [[-0.050, -covH*0.3], [0.050, -covH*0.3],
     [-0.050, covH*0.3], [0.050, covH*0.3]].forEach(function(p) {
      winder.add(mergeMesh([cyl(0.002, 0.002, p[0], p[1], -covD - 0.001)], cm));
    });
    winder.position.set(xPos, -H/2 + fwLocal/2, zo);
    return winder;
  }

  if (panels === 1) {
    // Winder at the hinge-side edge of the bottom rail
    g.add(makeCasWinder(hingeSideX * (W/2 - fwLocal)));
  } else {
    // 2-panel: winder at each panel's free-side edge (the outer frame stile edges)
    g.add(makeCasWinder(W/2 - fwLocal));
    g.add(makeCasWinder(-(W/2 - fwLocal)));
  }

  return g;
}

