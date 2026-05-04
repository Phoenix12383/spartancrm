// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT BUILDER V2 SHIM — drop-in replacement for buildOuterFrame.
//
// Goal: minimal-touch cutover. Existing call sites in 30-product-builders.js
// invoke `buildOuterFrame(W, H, mat, hasThreshold, matInt, frameWidth, productType)`.
// This shim provides the same signature but routes through the V2 pipeline
// (resolver v2 → extruder v2). On failure it throws; SpartanDebug surfaces
// a red banner. There is no procedural fallback.
//
// Feature flag:
//   window.SpartanCAD.use3DRebuildV2 = true   → V2 pipeline (default once stable)
//   window.SpartanCAD.use3DRebuildV2 = false  → legacy buildOuterFrame
//
// Defaults: V2 ON. To roll back during testing, set the flag to false in
// devtools and refresh; existing buildOuterFrame remains untouched at module 25.
//
// THRESHOLD HANDLING
//   French/hinged/bifold doors no longer short-circuit. The resolver v2's
//   frameBottom slot can be linked to a threshold profile (e.g. 'i4_threshold');
//   the V2 frame builder uses that profile for the bottom rail. If no
//   frameBottom-specific link exists, frameBottom falls back to the regular
//   frame profile (link at .frame), which is fine for non-threshold cases.
//
//   For visual fidelity (silver anodised aluminium look), the legacy
//   aluminium-threshold add-on is layered ON TOP of the V2 frame ONLY when:
//     - opts.legacyAluThresholdOverlay === true, AND
//     - hasThreshold && doors with no dedicated threshold profile in catalog
//   This is a transitional accommodation; the proper fix is to ship a
//   threshold profile DXF in the catalog and link it via frameBottom.
//
// CALL SITE DELTA
//   In 30-product-builders.js, replace:
//     frame.add(buildOuterFrame(W, H, mat, true, mi, fw, type));
//   with:
//     frame.add(buildOuterFrameDispatched(W, H, mat, true, mi, fw, type));
//   The dispatcher reads the feature flag and routes accordingly.
// ═══════════════════════════════════════════════════════════════════════════

// Default the flag to ON. Devtools can flip to false at runtime.
if (typeof window !== 'undefined') {
  window.SpartanCAD = window.SpartanCAD || {};
  if (typeof window.SpartanCAD.use3DRebuildV2 === 'undefined') {
    window.SpartanCAD.use3DRebuildV2 = true;
  }
}

// ─── V2 outer-frame builder (uses resolver v2 + extruder v2) ───────────────
// Signature mirrors buildOuterFrame so it slots in as a drop-in replacement
// at every existing call site.

function buildOuterFrameV2(W, H, mat, hasThreshold, matInt, frameWidth, productType) {
  var SD = (typeof SpartanDebug !== 'undefined') ? SpartanDebug : null;

  if (!productType) {
    var e1 = new Error('buildOuterFrameV2: productType required (no procedural fallback)');
    if (SD) SD.fail('lastResolve', e1, { stage: 'buildOuterFrameV2' });
    throw e1;
  }

  // Resolve all four sides. Throws ResolveError on missing links.
  var slotProfiles;
  try {
    slotProfiles = resolveAllFrameSlots(productType);
  } catch (e) {
    if (SD) SD.fail('lastResolve', e, {
      stage: 'resolveAllFrameSlots', productType: productType,
    });
    throw e;
  }
  if (SD) SD.report('lastResolve', {
    productType: productType,
    ok: true,
    slots: {
      frameTop:    slotProfiles.frameTop.resolvedKey,
      frameBottom: slotProfiles.frameBottom.resolvedKey,
      frameLeft:   slotProfiles.frameLeft.resolvedKey,
      frameRight:  slotProfiles.frameRight.resolvedKey,
    },
  });

  // Build the V2 frame.
  var grp = buildFrameV2(W, H, slotProfiles, mat, {
    productType: productType,
    bevelMm: 1.0,
    scaleToMetres: true,
  });

  // Transitional aluminium-threshold overlay. Only fires when:
  //   - hasThreshold (caller wants the silver look)
  //   - frameBottom is the same as frameTop (no dedicated threshold profile yet)
  // Once a threshold profile is in the catalog and linked, this no-ops.
  if (hasThreshold && slotProfiles.frameBottom.resolvedKey === slotProfiles.frameTop.resolvedKey) {
    grp.add(_legacyAluThresholdOverlay(W, H, slotProfiles.frameBottom, mat));
  }

  return grp;
}

// Aluminium threshold overlay used until a real threshold profile is shipped
// in the catalog. Renders a 20mm-tall silver-anodised band across the
// bottom of the frame, sitting in front of the bottom rail. Geometry is a
// simple stepped box; matches the legacy 25-geometry-helpers code.
//
// This will be deleted once 'i4_threshold' (or equivalent) is a real
// canonical profile linked via window.__profileLinks[productType].frameBottom.

function _legacyAluThresholdOverlay(W, H, bottomProfile, baseMat) {
  var alMat = new THREE.MeshPhysicalMaterial({
    color: '#c8cccf', roughness: 0.35, metalness: 0.85,
    clearcoat: 0.2, clearcoatRoughness: 0.4,
  });
  var thrH = 0.020;  // 20mm tall
  var thrD = bottomProfile.depthMm / 1000;  // match frame depth
  var thrW = W;
  var grp = new THREE.Group();
  grp.userData = { kind: 'alu-threshold-overlay', note: 'transitional; replace with linked threshold profile' };
  var box = new THREE.BoxGeometry(thrW, thrH, thrD);
  box.translate(0, -H/2 + thrH/2, 0);
  grp.add(new THREE.Mesh(box, alMat));
  return grp;
}

// ─── Dispatcher ────────────────────────────────────────────────────────────
// The function existing call sites should use. Reads the feature flag and
// routes accordingly. When the flag is on (default), V2 throws on any
// failure and SpartanDebug shows the red banner.
//
// IMPORTANT: this is the only function that should be referenced from
// 30-product-builders.js after cutover. Do NOT re-introduce a conditional
// "if v2 throws, try v1" — that's exactly the silent fallback the rebuild
// is designed to remove.

function buildOuterFrameDispatched(W, H, mat, hasThreshold, matInt, frameWidth, productType) {
  var useV2 = (typeof window !== 'undefined' && window.SpartanCAD && window.SpartanCAD.use3DRebuildV2);
  if (useV2) {
    return buildOuterFrameV2(W, H, mat, hasThreshold, matInt, frameWidth, productType);
  }
  // Legacy path — only used when the flag is explicitly turned off.
  if (typeof buildOuterFrame !== 'function') {
    throw new Error('buildOuterFrameDispatched: legacy buildOuterFrame is not defined and V2 flag is off');
  }
  return buildOuterFrame(W, H, mat, hasThreshold, matInt, frameWidth, productType);
}

if (typeof window !== 'undefined') {
  window.SpartanCAD = window.SpartanCAD || {};
  window.SpartanCAD.buildOuterFrameV2 = buildOuterFrameV2;
  window.SpartanCAD.buildOuterFrameDispatched = buildOuterFrameDispatched;
}
