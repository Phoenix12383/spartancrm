// ═══════════════════════════════════════════════════════════════════════════
// Feature 3: Colonial bars
// ═══════════════════════════════════════════════════════════════════════════

function buildColonialBars(glassW, glassH, gridStr, mat) {
  if (!gridStr) return null;
  const [cols, rows] = gridStr.split("x").map(Number);
  const g = new THREE.Group();
  const barW = 0.018; // 18mm wide
  const barD = 0.008; // 8mm proud of glass
  const z = barD/2;

  // Vertical bars
  for (let c = 1; c < cols; c++) {
    const x = -glassW/2 + c * (glassW / cols);
    g.add(mergeMesh([box(barW, glassH, barD, x, 0, z)], mat));
  }
  // Horizontal bars
  for (let r = 1; r < rows; r++) {
    const y = -glassH/2 + r * (glassH / rows);
    g.add(mergeMesh([box(glassW, barW, barD, 0, y, z)], mat));
  }
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
// Feature 1: Sash with realistic profile, weather seal groove
// ═══════════════════════════════════════════════════════════════════════════

function buildSash(sW, sH, mat, type, isLever = false, glassSpec, colonialGrid, opensOut = true, matInt = null, profileSW, profileD) {
  const g = new THREE.Group();
  const mi = matInt || mat;
  const sw = profileSW || SW;
  const dd = profileD || D;

  // Get profile dims for the parent product type to determine rebate orientation
  const pd = getProfileDims(type);
  const frameRebSide = pd.rebateSide || 'ext';
  const sashStep = (pd.sashStep || 5) * S;
  const sashOverlap = (pd.sashOverlap || 12) * S;

  // Sash rebate for glazing is OPPOSITE the frame rebate
  // T&T: frame rebate 'int' → sash glazing rebate 'ext' (glass held from exterior)
  // Awning: frame rebate 'ext' → sash glazing rebate 'int' (glass held from interior)
  let sashRebSide = frameRebSide === 'int' ? 'ext' : 'int';

  // For DOORS: the glazing bead must always be on the SECURE side (opposite to where
  // the door swings). Outward-opening door → bead on interior (secure inside).
  // Inward-opening door → bead on exterior (secure outside, since the door body
  // protects the bead-removal access from the inside). The default sashRebSide above
  // assumes outward swing; when opensOut === false (inward), flip the rebate so the
  // bead, glass, gaskets and IGU all relocate to the correct side together.
  const isDoorType = (type === 'french_door' || type === 'hinged_door' || type === 'casement_window');
  if (isDoorType && opensOut === false) {
    sashRebSide = sashRebSide === 'ext' ? 'int' : 'ext';
  }

  // Sash Z center offset from frame center
  // T&T (rebate 'int'): sash steps toward interior (-Z) → sashZ = -sashStep
  // Awning (rebate 'ext'): sash steps toward exterior (+Z) → sashZ = +sashStep
  const sashZ = frameRebSide === 'int' ? -sashStep : sashStep;

  // Glazing dimensions
  const beadW = 0.008;     // glazing bead width 8mm
  const gW = sW - sw * 2;  // glass width
  const gH = sH - sw * 2;  // glass height

  // Build sash frame with 45° welded mitre joints. If the user has linked a
  // DXF-imported profile to this product type's sash slot, extrude that
  // polygon (chambers as holes) instead of the procedural Ideal 4000 shape.
  // Falls through to the legacy path if no link / no entry.
  var _sdbg = (typeof window !== 'undefined') ? (window.__cadDebugSash = window.__cadDebugSash || {}) : {};
  _sdbg.lastCall = { type: type, sashRebSide: sashRebSide, sW: sW, sH: sH };
  var _sashEntry = null;
  try { _sashEntry = (type && typeof getSashProfileEntry === 'function') ? getSashProfileEntry(type) : null; }
  catch (e) { console.warn('[cad] getSashProfileEntry threw:', e); }
  _sdbg.sashEntry = _sashEntry ? { code: _sashEntry.code, system: _sashEntry.system,
                                    hullPts: _sashEntry.outerHullMm && _sashEntry.outerHullMm.length,
                                    chambers: _sashEntry.chambersMm && _sashEntry.chambersMm.length,
                                    bbox: _sashEntry.bboxMm } : null;
  var _addedSashFromCatalog = false;
  if (_sashEntry && _sashEntry.outerHullMm && _sashEntry.outerHullMm.length) {
    var _catSash = null;
    try {
      _catSash = (typeof buildSashFrameFromCatalog === 'function')
        ? buildSashFrameFromCatalog(sW, sH, _sashEntry, mat, sashRebSide, sashZ, matInt)
        : null;
    } catch (e) { console.warn('[cad] buildSashFrameFromCatalog threw:', e); _sdbg.extrudeError = String(e); }
    _sdbg.catalogChildren = _catSash && _catSash.children ? _catSash.children.length : 0;
    if (_catSash && _catSash.children && _catSash.children.length) {
      g.add(_catSash); _addedSashFromCatalog = true;
    }
  }
  if (!_addedSashFromCatalog) {
    _sdbg.path = 'procedural';
    var sashShapes = makeProfileShapes(sw, GLAZING_REBATE, 0.016, sashRebSide);
    var sashFrame = buildMitredRect(sW, sH, sw, sashShapes.ext, sashShapes.int, mat, mi, sashZ);
    g.add(sashFrame);
  } else {
    _sdbg.path = 'catalog';
  }

  // Glazing bead — 4mm proud, 8mm wide, on the room side for T&T, weather side for awning.
  // Bead is OPPOSITE the sash glazing rebate (it retains the glass against the rebate).
  const beadDir = sashRebSide === 'ext' ? -1 : 1; // -1 = bead on -Z (interior), +1 = bead on +Z (exterior)
  const beadZ = sashZ + beadDir * (dd / 2 + BEAD_PROUD / 2);
  // Bead colour matches the SIDE it sits on: interior side bead → mi (internal colour),
  // exterior side bead → mat (external colour). Previously hardcoded to mat, which made
  // the inside-facing bead show the wrong colour when internal/external colours differed.
  const beadCol = beadDir > 0 ? mat : mi;
  g.add(mergeMesh([
    box(gW + beadW * 2, beadW, BEAD_PROUD, 0, gH / 2 + beadW / 2, beadZ),
    box(gW + beadW * 2, beadW, BEAD_PROUD, 0, -gH / 2 - beadW / 2, beadZ),
    box(beadW, gH, BEAD_PROUD, -gW / 2 - beadW / 2, 0, beadZ),
    box(beadW, gH, BEAD_PROUD, gW / 2 + beadW / 2, 0, beadZ),
  ], beadCol));

  // EPDM gaskets (black rubber seals)
  const gasketCol = new THREE.MeshPhysicalMaterial({ color: '#0f0f0f', roughness: 0.85, metalness: 0.0, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const gsktW = 0.004, gsktT = 0.004;

  // Interior gasket — between bead and glass
  const intGsktZ = beadZ - beadDir * (BEAD_PROUD / 2 + gsktT / 2);
  g.add(mergeMesh([
    box(gW, gsktW, gsktT, 0, gH / 2 - gsktW / 2, intGsktZ),
    box(gW, gsktW, gsktT, 0, -gH / 2 + gsktW / 2, intGsktZ),
    box(gsktW, gH, gsktT, -gW / 2 + gsktW / 2, 0, intGsktZ),
    box(gsktW, gH, gsktT, gW / 2 - gsktW / 2, 0, intGsktZ),
  ], gasketCol));

  // Exterior gasket — between sash rebate and glass
  const extGsktDir = sashRebSide === 'ext' ? 1 : -1;
  const extGsktZ = sashZ + extGsktDir * (dd / 2 - 0.005 - gsktT / 2);
  g.add(mergeMesh([
    box(gW, gsktW, gsktT, 0, gH / 2 - gsktW / 2, extGsktZ),
    box(gW, gsktW, gsktT, 0, -gH / 2 + gsktW / 2, extGsktZ),
    box(gsktW, gH, gsktT, -gW / 2 + gsktW / 2, 0, extGsktZ),
    box(gsktW, gH, gsktT, gW / 2 - gsktW / 2, 0, extGsktZ),
  ], gasketCol));

  // Double-glazed unit (IGU) — positioned in the sash glazing rebate
  // For T&T (sashReb='ext'): glass toward +Z (exterior side of sash)
  // For Awning (sashReb='int'): glass toward -Z (interior side of sash)
  const glassDir = sashRebSide === 'ext' ? 1 : -1;
  const glassZ = sashZ + glassDir * (dd / 2 - GLAZING_REBATE);
  const igu = glassSpec || GLASS_OPTIONS[0];
  const iguT = igu.thickness || 0.020;

  // Outer pane (toward weather)
  const outerPane = new THREE.Mesh(new THREE.PlaneGeometry(gW, gH), makeGlass(glassSpec));
  outerPane.position.z = glassZ + iguT / 2 - 0.002;
  outerPane.renderOrder = 1;
  g.add(outerPane);

  // Inner pane (toward room)
  const innerPane = new THREE.Mesh(new THREE.PlaneGeometry(gW, gH), makeGlass(glassSpec));
  innerPane.position.z = glassZ - iguT / 2 + 0.002;
  innerPane.renderOrder = 1;
  g.add(innerPane);

  // Spacer bar around IGU edge
  const spacerW = 0.003;
  const spacerMat = new THREE.MeshPhysicalMaterial({ color: '#7a7a7a', roughness: 0.25, metalness: 0.8, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 1.2 });
  g.add(mergeMesh([
    box(gW, spacerW, iguT - 0.004, 0, gH / 2 - spacerW / 2, glassZ),
    box(gW, spacerW, iguT - 0.004, 0, -gH / 2 + spacerW / 2, glassZ),
    box(spacerW, gH - spacerW * 2, iguT - 0.004, -gW / 2 + spacerW / 2, 0, glassZ),
    box(spacerW, gH - spacerW * 2, iguT - 0.004, gW / 2 - spacerW / 2, 0, glassZ),
  ], spacerMat));

  // Colonial bars
  const bars = buildColonialBars(gW, gH, colonialGrid, mat);
  if (bars) { bars.position.z = glassZ + 0.002; g.add(bars); }

  return g;
}

function buildFixedPanel(pW, pH, mat, glassSpec, colonialGrid) {
  const g = new THREE.Group();
  const bw = GLAZING_REBATE, bd = 0.016;
  g.add(mergeMesh([
    box(pW, bw, bd, 0, pH/2 - bw/2, 0), box(pW, bw, bd, 0, -pH/2 + bw/2, 0),
    box(bw, pH - bw*2, bd, -pW/2 + bw/2, 0, 0), box(bw, pH - bw*2, bd, pW/2 - bw/2, 0, 0),
  ], mat));
  const gW = pW - bw*2, gH = pH - bw*2;
  // Gasket between bead and glass
  const fGsktCol = new THREE.MeshPhysicalMaterial({ color: '#0f0f0f', roughness: 0.85, metalness: 0.0, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const fGsktW = 0.004, fGsktT = 0.004;
  g.add(mergeMesh([
    box(gW, fGsktW, fGsktT, 0, gH/2 - fGsktW/2, bd/2 + fGsktT/2),
    box(gW, fGsktW, fGsktT, 0, -gH/2 + fGsktW/2, bd/2 + fGsktT/2),
    box(fGsktW, gH, fGsktT, -gW/2 + fGsktW/2, 0, bd/2 + fGsktT/2),
    box(fGsktW, gH, fGsktT, gW/2 - fGsktW/2, 0, bd/2 + fGsktT/2),
  ], fGsktCol));
  // IGU double glazed unit
  const fIguT = 0.020;
  const outerP = new THREE.Mesh(new THREE.PlaneGeometry(gW, gH), makeGlass(glassSpec));
  outerP.position.z = -fIguT/2 + 0.002; outerP.renderOrder = 1; g.add(outerP);
  const innerP = new THREE.Mesh(new THREE.PlaneGeometry(gW, gH), makeGlass(glassSpec));
  innerP.position.z = fIguT/2 - 0.002; innerP.renderOrder = 1; g.add(innerP);
  // Spacer bar
  const fSpW = 0.003;
  const fSpMat = new THREE.MeshPhysicalMaterial({ color: '#7a7a7a', roughness: 0.25, metalness: 0.8, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 1.2 });
  g.add(mergeMesh([
    box(gW, fSpW, fIguT - 0.004, 0, gH/2 - fSpW/2, 0),
    box(gW, fSpW, fIguT - 0.004, 0, -gH/2 + fSpW/2, 0),
    box(fSpW, gH - fSpW*2, fIguT - 0.004, -gW/2 + fSpW/2, 0, 0),
    box(fSpW, gH - fSpW*2, fIguT - 0.004, gW/2 - fSpW/2, 0, 0),
  ], fSpMat));
  const bars = buildColonialBars(gW, gH, colonialGrid, mat);
  if (bars) g.add(bars);
  return g;
}

// ═══════════════════════════════════════════════════════════════════════════
