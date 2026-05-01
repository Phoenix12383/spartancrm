// ═══════════════════════════════════════════════════════════════════════════
// MILLING SPECS — CNC drill / pocket data for opening sashes & frame keeps.
//
// Spec library, keyed by profile system + role. Each entry is a list of
// "milling operations" that the production CNC needs to perform on a given
// piece of profile. Coordinates are expressed in mm, with a clear textual
// reference (which face, which edge) so a human reading the cut-list sheet
// can verify the setup.
//
// First entry: Aluplast Ideal 4000 Tilt & Turn — handle gear-box prep on the
// opening sash, plus frame keep pocket. Sourced from the Siegenia/Aluplast
// reference drawing (DIN 18267 pattern):
//
//   3 vertical holes on the handle stile, room-side face:
//     - top screw  Ø10 mm  (through, then tapped via insert)
//     - spindle    Ø12 mm  (through-hole for square-pin handle)
//     - bot screw  Ø10 mm
//     - 43 mm pitch overall (centre-to-centre top↔bottom)
//     - centred 15 mm in from the inboard edge of the hardware (DIN) groove
//
//   Frame-side keep (lock side stile, room-side face):
//     - 12 × 48 mm pocket, 12.5 mm in from glazing-side edge
//     - 15 mm reference matches the sash drill axis
//
// Module placement: this file loads AFTER 23-cutlist-xlsx.js. The cutlist
// XLSX generator calls addMillingSheetToWorkbook() via late binding (typeof
// check) so the two stay decoupled.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Spec library ──────────────────────────────────────────────────────────
const MILLING_SPECS = {
  // Aluplast Ideal 4000 — Tilt & Turn opening sash, handle stile.
  // Geometry referenced from Section_12.dxf (i4_sash77 profile, 70 × 77 mm
  // hull, Euro hardware groove ~16 × 13 mm centred on the stile).
  i4_tt_sash_handle: {
    label: 'I4000 T&T — Sash Handle Prep',
    system: 'Aluplast Ideal 4000',
    productTypes: ['tilt_turn_window'],
    appliesTo: 'sash',                    // 'sash' | 'frame'
    member: 'handle_stile',                // which member on the rect
    surface: 'sash_room_face',             // room-side face (-Z in build coords)
    referenceEdge: 'hardware_groove_inboard',
    referenceNote: '15 mm from the inboard edge of the DIN hardware groove (room-side direction).',
    // The "axis" of the drill row, expressed as offset from the reference edge
    // along the face of the profile. For Ideal 4000 the groove inboard edge
    // sits ~25 mm in from the sash exterior face; +15 mm puts us at 40 mm
    // from the exterior face = on the room-side flat where the handle plate
    // bears. (This matches the centre of the standard 35 mm wide backplate.)
    axisOffsetMm: 15,
    drillBitsRequired: [10, 12],           // Ø10 + Ø12 mm
    operations: [
      // pos: position along the stile axis, measured from a "handle datum".
      // The datum is computed at apply-time per frame (handle height, default
      // 1000 mm from sash bottom for tall sashes, sash centre for short ones).
      { id: 'top_screw', pos:  21.5, dia: 10, depth: 'through', desc: 'Top mounting screw clearance' },
      { id: 'spindle',   pos:  0.0,  dia: 12, depth: 'through', desc: 'Handle spindle through-hole (square pin)' },
      { id: 'bot_screw', pos: -21.5, dia: 10, depth: 'through', desc: 'Bottom mounting screw clearance' },
    ],
    // Pitch & summary metadata (helpful for CNC load sheet).
    overallPitchMm: 43,
    backplateMm: { width: 35, height: 180 },
  },

  // Aluplast Ideal 4000 — sash hardware-groove slot (gearbox seat).
  // 48 × 12 mm oval slot routed INTO the back wall of the DIN/Euro hardware
  // groove on the same handle stile as the 3 holes above. The slot sits
  // co-axial with the room-face drill row — the Ø12 spindle hole breaks
  // through into the centre of this slot, giving the Siegenia gearbox a
  // pocket to seat into so the spindle and gear engage cleanly.
  //
  // Cutter: Ø12 mm end-mill (same bit as the spindle drill above). The
  // rounded ends of the slot are formed naturally by the cutter radius; no
  // separate tooling needed. Total slot length 48 mm = 43 mm hole pitch
  // + 2.5 mm clearance each end so the gearbox lugs slip in without binding.
  i4_tt_sash_groove_slot: {
    label: 'I4000 T&T — Sash Hardware-Groove Slot',
    system: 'Aluplast Ideal 4000',
    productTypes: ['tilt_turn_window'],
    appliesTo: 'sash',
    member: 'handle_stile',                // same stile as the 3 drill holes
    surface: 'sash_hardware_groove',       // INSET into the DIN groove back wall
    referenceEdge: 'hardware_groove_centreline',
    referenceNote:
      'Inset into the hardware groove of the opening (sash) profile, centred on '
      + 'the spindle drill axis. Co-axial with the 3-hole row on the room face — '
      + 'the Ø12 spindle hole breaks through into the centre of this slot.',
    // The slot is 12 mm wide (matches groove width / Ø12 cutter) and centred
    // in the groove, so axisOffset is 0 from the groove centreline.
    axisOffsetMm: 0,
    drillBitsRequired: [12],                // Ø12 end-mill cuts the slot
    operations: [
      { id: 'gearbox_slot', pos: 0.0, w: 12, h: 48, kind: 'slot',
        desc: 'Routed slot, 48 × 12 mm oval, inset into hardware groove (Ø12 end-mill)' },
    ],
    slotMm: { width: 12, height: 48 },
  },
};

// ─── Per-frame computation ─────────────────────────────────────────────────
// Walks a frame's cells and emits a flat list of milling operations with
// resolved real-world positions. Each emitted op has enough info for the CNC
// operator to set up the cut without referring back to the 3D model.
//
// For now this only handles tilt_turn_window cells in single-cell frames (the
// common case). Multi-cell frames with T&T tiles are handled by recursing
// over cells once the cell→stile coordinate map is wired up; that's marked
// TODO below and falls back to a single-tile assumption.
// Per-frame computation. Optionally accepts the surveyor's measurement record
// (the per-frame entry from measurementsByFrameId — see 09-check-measure-html-gen.js
// makeBlankFrameMeasurement). When the surveyor has recorded a non-empty
// handleHeightOffsetMm, that value takes precedence over frame.handleHeightMm.
// This way the cutlist Milling sheet always reflects the most recent intent:
//   1. design value from the main editor → preferred at quoting
//   2. surveyor override after on-site check-measure → preferred for production
//   3. zero (= system default) → fallback for legacy frames with no handle data
function computeMillingForFrame(frame, measurement) {
  if (!frame || frame.productType !== 'tilt_turn_window') return [];

  var W = Number(frame.widthMm) || 0;
  var H = Number(frame.heightMm) || 0;
  if (W <= 0 || H <= 0) return [];

  // Profile dims (Ideal 4000 T&T): frame 65 mm sightline, sash 77 mm.
  // Use the catalog when available; fall back to literals so the function
  // works in headless smoke tests too.
  var pd = (typeof getProfileDims === 'function')
    ? getProfileDims('tilt_turn_window')
    : { frameW: 65, sashW: 77 };
  var fwMm = pd.frameW || 65;
  var swMm = pd.sashW || 77;

  // Sash opening dims (sash outer face, before overlap subtraction — close
  // enough for milling-position purposes; the handle datum tolerates ±5 mm).
  var sashW = W - 2 * fwMm;
  var sashH = H - 2 * fwMm;

  // Handedness: 'tilt_turn' = hinge LEFT, handle RIGHT. 'tilt_turn_l' = handle LEFT.
  // Same convention used in 30-product-builders.js.
  var cellTypes = (frame.cellTypes && frame.cellTypes[0]) || [];
  var ttCellType = cellTypes[0] || 'tilt_turn';
  var hingeLeft = ttCellType !== 'tilt_turn_l';
  var handleSide = hingeLeft ? 'right' : 'left';

  // Handle datum: 1000 mm up from sash bottom on tall sashes, centre on short
  // ones. Resolution order for the offset (additive shift, +N raises, -N lowers):
  //   1. surveyor's handleHeightOffsetMm from the check-measure record (if set,
  //      parsed from text — supports '+100', '-100', '100' or numeric)
  //   2. design-time frame.handleHeightMm from the main editor
  //   3. 0 (system default)
  // Note: an explicit surveyor entry of "0" suppresses the design fallback —
  // the surveyor is overriding to the system default on purpose.
  var handleDatumFromBottomMm = sashH > 1200 ? 1000 : Math.round(sashH / 2);
  var hhOffset = 0;
  var surveyProvided = false;
  if (measurement && measurement.handleHeightOffsetMm != null && measurement.handleHeightOffsetMm !== '') {
    var rawSurvey = measurement.handleHeightOffsetMm;
    var parsedSurvey = (typeof rawSurvey === 'number')
      ? (isFinite(rawSurvey) ? rawSurvey : null)
      : (function(s){ var n = Number(s); return isFinite(n) ? n : null; })(rawSurvey);
    if (parsedSurvey != null) {
      hhOffset = parsedSurvey;
      surveyProvided = true;
    }
  }
  if (!surveyProvided && typeof frame.handleHeightMm === 'number' && isFinite(frame.handleHeightMm)) {
    hhOffset = frame.handleHeightMm;
  }
  handleDatumFromBottomMm += hhOffset;

  var ops = [];

  // ── Sash handle prep (3 holes) ─────────────────────────────────────────
  var sashSpec = MILLING_SPECS.i4_tt_sash_handle;
  sashSpec.operations.forEach(function(o) {
    ops.push({
      specId: 'i4_tt_sash_handle',
      specLabel: sashSpec.label,
      member: 'sash_' + handleSide + '_stile',
      surface: sashSpec.surface,
      referenceEdge: sashSpec.referenceEdge,
      operationId: o.id,
      diameterMm: o.dia,
      depthMm: o.depth,
      // position along the stile axis (Y, from sash bottom): datum + op offset
      alongStileMm: Math.round((handleDatumFromBottomMm + o.pos) * 10) / 10,
      // position across the face (perpendicular to stile axis)
      acrossFaceMm: sashSpec.axisOffsetMm,
      acrossFaceFrom: sashSpec.referenceEdge,
      desc: o.desc,
      kind: 'drill',
    });
  });

  // ── Sash hardware-groove slot (48 × 12 oval, gearbox seat) ─────────────
  // Lives on the same handle stile as the 3 drill holes, but on the
  // hardware-groove face (not the room face). Centred on the spindle along
  // the stile axis (same alongStile coordinate as the spindle hole).
  var slotSpec = MILLING_SPECS.i4_tt_sash_groove_slot;
  slotSpec.operations.forEach(function(o) {
    ops.push({
      specId: 'i4_tt_sash_groove_slot',
      specLabel: slotSpec.label,
      member: 'sash_' + handleSide + '_stile',
      surface: slotSpec.surface,
      referenceEdge: slotSpec.referenceEdge,
      operationId: o.id,
      // slot dims (mm) — width = across-groove, height = along-stile
      slotWMm: o.w,
      slotHMm: o.h,
      // along-stile position: centred on the spindle, same as the spindle
      // drill datum (no ±21.5 offset since the slot itself spans 48 mm)
      alongStileMm: Math.round(handleDatumFromBottomMm * 10) / 10,
      // across-face: 0 = centred in the groove
      acrossFaceMm: slotSpec.axisOffsetMm,
      acrossFaceFrom: slotSpec.referenceEdge,
      // tooling reference — the same Ø12 end-mill that drills the spindle
      cutterDiaMm: 12,
      desc: o.desc,
      kind: 'slot',
    });
  });

  // TODO: multi-cell T&T. When a frame has >1 cell with a tilt_turn tile,
  // we need the cell→stile origin map (from grid-layout) to recurse. For
  // now the single-cell case covers ~all real T&T frames.

  return ops;
}

// ─── XLSX integration ──────────────────────────────────────────────────────
// Adds a "Milling" sheet to an existing workbook. Iterates project items,
// emits one row per milling op. Called by generateCutListXlsxWorkbook in
// 23-cutlist-xlsx.js via late-binding typeof check, so this file is
// optional — if it's not loaded, the cutlist still builds.
//
// measurementsByFrameId is the survey/check-measure data keyed by frame id.
// When supplied, surveyor handle-height overrides take precedence over the
// design-time handleHeightMm (see computeMillingForFrame).
function addMillingSheetToWorkbook(wb, projectItems, measurementsByFrameId) {
  if (typeof XLSX === 'undefined') return false;
  if (!wb || !projectItems || !projectItems.length) return false;
  var byId = measurementsByFrameId || {};

  // Collect every op across every frame.
  var rows = [
    ['Milling / Drilling Operations'],
    ['Generated', new Date().toLocaleString('en-AU')],
    ['Source', 'Aluplast Ideal 4000 T&T — Siegenia DIN 18267 pattern'],
    [],
    ['#', 'Frame', 'Room', 'Spec', 'Member', 'Surface', 'Operation',
     'Type', 'Ø (mm)', 'Slot/Pocket W×H (mm)', 'Along stile (mm)', 'Across face (mm)',
     'Reference edge', 'Description'],
  ];

  var rowCount = 0;
  projectItems.forEach(function(f, idx) {
    var ops;
    var m = (f && f.id && byId[f.id]) || null;
    try { ops = computeMillingForFrame(f, m); }
    catch (e) { ops = []; if (typeof console !== 'undefined') console.warn('milling calc failed for', f && f.name, e); }
    ops.forEach(function(o) {
      // Resolve W×H regardless of which kind the op is (slot uses slotW/H,
      // pocket uses pocketW/H — drills have neither).
      var wDim = o.slotWMm != null ? o.slotWMm : o.pocketWMm;
      var hDim = o.slotHMm != null ? o.slotHMm : o.pocketHMm;
      // Show the cutter diameter for slot ops too, so the CNC operator can
      // see "Ø12 end-mill" alongside the slot dimensions.
      var dia = o.diameterMm != null ? o.diameterMm
              : (o.cutterDiaMm != null ? o.cutterDiaMm : '');
      rowCount++;
      rows.push([
        rowCount,
        f.name || ('Frame ' + (idx + 1)),
        f.room || '',
        o.specLabel,
        o.member,
        o.surface,
        o.operationId,
        o.kind,
        dia,
        (wDim != null && hDim != null) ? (wDim + ' × ' + hDim) : '',
        o.alongStileMm != null ? o.alongStileMm : '',
        o.acrossFaceMm != null ? o.acrossFaceMm : '',
        o.referenceEdge || '',
        o.desc || '',
      ]);
    });
  });

  if (rowCount === 0) return false;       // no T&T frames in this project — skip the sheet

  // Tooling summary block at the bottom: one row per distinct drill
  // diameter, count of holes (very useful for CNC bit setup).
  rows.push([]);
  rows.push(['TOOLING SUMMARY']);
  rows.push(['Tool', 'Hole count', 'Notes']);
  var bitCounts = {};
  var slotCount = 0;
  projectItems.forEach(function(f) {
    var ops;
    var m = (f && f.id && byId[f.id]) || null;
    try { ops = computeMillingForFrame(f, m); } catch (e) { ops = []; }
    var qty = Number(f.qty) || 1;
    ops.forEach(function(o) {
      if (o.kind === 'drill' && o.diameterMm) {
        var k = 'Ø' + o.diameterMm + ' mm';
        bitCounts[k] = (bitCounts[k] || 0) + qty;
      } else if (o.kind === 'slot') {
        slotCount += qty;
      }
    });
  });
  Object.keys(bitCounts).sort().forEach(function(k) {
    var note = k === 'Ø12 mm'
      ? 'spindle through-hole + slot cutter (same Ø12 end-mill)'
      : 'screw clearance';
    rows.push([k + ' drill / end-mill', bitCounts[k], note]);
  });
  if (slotCount) {
    rows.push(['48 × 12 mm slot (Ø12 end-mill)', slotCount,
               'inset into hardware groove on sash handle stile — gearbox seat']);
  }

  var sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 5 },  { wch: 16 }, { wch: 14 }, { wch: 32 }, { wch: 22 },
    { wch: 18 }, { wch: 14 }, { wch: 8 },  { wch: 8 },  { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 30 }, { wch: 42 },
  ];
  XLSX.utils.book_append_sheet(wb, sheet, 'Milling');
  return true;
}

// ─── Window exposure for ad-hoc / smoke-test access ────────────────────────
if (typeof window !== 'undefined') {
  window.MILLING_SPECS = MILLING_SPECS;
  window.computeMillingForFrame = computeMillingForFrame;
  window.addMillingSheetToWorkbook = addMillingSheetToWorkbook;
}
