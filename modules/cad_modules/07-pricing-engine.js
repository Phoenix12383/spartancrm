// ═══════════════════════════════════════════════════════════════════════════
// PRICING ENGINE — Production costing, BOM, labour, markups
// Verified material costs from Spartan DG database export (18/03/2026)
// Production times from industry research on uPVC fabrication workflows
// ═══════════════════════════════════════════════════════════════════════════

const PRICING_DEFAULTS = {

  // ═══════════════════════════════════════════════════════════════════════
  // PROFILE GEOMETRY CATALOG — real polygon outlines from Aluplast DWG
  // Canonical orientation: see /docs SPARTAN-CAD-PROFILE-INTEGRATION-HANDOFF.
  // Coords in mm. outerHullMm = perimeter polyline. chambersMm = inner voids
  // rendered as holes (SVG evenodd / THREE.Shape.holes). Used by 2D cross-
  // section, 3D extrusion, and BOM thumbnail. Drip-fed profile by profile.
  // ═══════════════════════════════════════════════════════════════════════
  profiles: {
    'i4_frame': {
      code: '14x307',
      system: 'Aluplast Ideal 4000',
      role: 'frame',
      description: 'Outer frame · 5-chamber · 70mm depth × 70mm sightline',
      usedByProductTypes: ['tilt_turn_window','fixed_window','casement_window','awning_window','french_door','hinged_door','bifold_door'],
      bboxMm: { w: 70, h: 70 },
      depthMm: 70,
      sightlineMm: 70,
      weldAllowanceMm: 3,
      mitreAngleDeg: 45,
      requiresSteelReinforcement: true,
      // WIP39: this DXF was authored with the aperture at low X (rebate at
      // top-left). The 3D extruder convention is outer-at-X=0, so flipX
      // brings it into alignment. New user-uploaded profiles default to no
      // orientation (as-drawn) and can be adjusted via the import modal.
      polygonOrient: { flipX: true },
      // Geometry parsed from Aluplast official DWG (block 140X07).
      // Canonical orientation: rebate flange at top-left (15mm small face),
      // full 70mm large face at bottom. DXF coords, units mm.
      outerHullMm: [[65.402,2.000],[65.000,0.500],[65.000,0.000],[70.000,0.000],[70.000,49.000],[69.000,50.000],[65.000,50.000],[65.000,49.500],[65.402,48.000],[66.500,48.000],[67.500,47.000],[67.500,44.000],[66.500,43.000],[60.700,43.000],[59.700,44.000],[59.700,44.648],[61.000,49.500],[61.000,50.000],[57.268,50.000],[56.785,49.629],[56.517,48.629],[57.000,48.000],[58.010,48.000],[57.404,45.741],[56.438,45.000],[35.995,45.000],[35.553,44.867],[34.447,44.867],[34.005,45.000],[28.081,45.000],[16.192,43.329],[12.877,47.077],[15.000,55.000],[15.000,61.900],[14.000,62.900],[13.500,62.900],[13.500,62.100],[13.000,61.600],[12.000,61.600],[9.500,64.100],[9.500,64.618],[11.353,67.033],[13.122,67.507],[13.500,67.217],[13.500,66.100],[14.000,66.100],[15.000,67.100],[15.000,68.158],[14.688,68.622],[14.688,69.178],[15.000,69.642],[15.000,70.000],[14.700,70.000],[2.224,66.657],[-0.000,63.759],[0.000,0.000],[5.000,0.000],[5.000,0.500],[4.598,2.000],[3.900,2.000],[3.700,1.800],[3.700,1.700],[3.500,1.500],[2.800,1.500],[2.300,2.000],[2.300,6.000],[3.300,7.000],[9.300,7.000],[10.300,6.000],[10.300,5.352],[9.000,0.500],[9.000,0.100],[11.000,0.100],[11.000,0.300],[11.200,0.500],[13.598,0.500],[14.000,2.000],[12.124,2.000],[11.641,2.629],[12.614,6.259],[13.579,7.000],[34.005,7.000],[34.447,7.133],[35.553,7.133],[35.995,7.000],[46.420,7.000],[47.386,6.259],[48.359,2.629],[47.876,2.000],[46.000,2.000],[46.402,0.500],[48.800,0.500],[49.000,0.300],[49.000,0.100],[51.000,0.100],[51.000,0.500],[49.700,5.352],[49.700,6.000],[50.700,7.000],[56.420,7.000],[57.386,6.259],[58.359,2.629],[57.876,2.000],[55.000,2.000],[55.402,0.500],[58.800,0.500],[59.000,0.300],[59.000,0.100],[61.000,0.100],[61.000,0.500],[59.700,5.352],[59.700,6.000],[60.700,7.000],[66.700,7.000],[67.700,6.000],[67.700,2.000],[67.200,1.500],[66.500,1.500],[66.300,1.700],[66.300,1.800],[66.100,2.000]],
      chambersMm: [[[11.623,42.998],[2.831,42.074],[2.500,42.373],[2.500,63.759],[2.871,64.242],[7.289,65.426],[7.539,65.207],[7.500,64.618],[7.500,64.100],[12.000,59.600],[12.700,59.600],[13.000,59.300],[13.000,55.263],[10.945,47.594],[11.762,43.316]],[[2.500,9.300],[2.500,27.060],[2.679,27.259],[9.479,27.974],[9.700,27.775],[9.700,9.200],[9.500,9.000],[2.800,9.000]],[[67.300,9.000],[67.500,9.200],[67.500,23.800],[67.300,24.000],[62.000,24.000],[61.800,23.800],[61.800,9.200],[62.000,9.000]],[[62.000,41.000],[61.800,40.800],[61.800,35.000],[62.000,34.800],[66.200,34.800],[66.294,34.824],[67.000,35.000],[67.300,35.000],[67.500,35.200],[67.500,40.800],[67.300,41.000]],[[20.000,41.615],[20.000,9.200],[19.800,9.000],[10.700,9.000],[10.500,9.200],[10.500,28.670],[10.510,28.733],[14.682,41.242],[14.906,41.376],[16.471,41.349],[19.772,41.813]],[[45.329,9.000],[27.671,9.000],[27.479,9.143],[26.521,9.143],[26.329,9.000],[23.200,9.000],[23.000,9.200],[23.000,10.400],[22.200,10.400],[22.200,9.200],[22.000,9.000],[21.200,9.000],[21.000,9.200],[21.000,20.300],[21.200,20.500],[21.500,20.500],[21.500,21.500],[21.200,21.500],[21.000,21.700],[21.000,34.300],[21.200,34.500],[21.500,34.500],[21.500,35.500],[21.200,35.500],[21.000,35.700],[21.000,41.811],[21.172,42.009],[21.972,42.122],[22.200,41.924],[22.200,41.600],[23.000,41.600],[23.000,42.093],[23.172,42.291],[28.220,43.000],[31.829,43.000],[32.021,42.857],[32.979,42.857],[33.171,43.000],[36.829,43.000],[37.021,42.857],[37.979,42.857],[38.171,43.000],[44.829,43.000],[45.021,42.857],[45.979,42.857],[46.171,43.000],[53.300,43.000],[53.500,42.800],[53.500,35.671],[53.357,35.479],[53.357,34.521],[53.500,34.329],[53.500,21.671],[53.357,21.479],[53.357,20.521],[53.500,20.329],[53.500,9.200],[53.300,9.000],[46.671,9.000],[46.479,9.143],[45.521,9.143]],[[61.000,23.800],[60.800,24.000],[54.700,24.000],[54.500,23.800],[54.500,9.200],[54.700,9.000],[60.800,9.000],[61.000,9.200]],[[13.911,41.459],[9.730,28.922],[9.561,28.787],[2.721,28.068],[2.500,28.267],[2.500,41.055],[2.679,41.254],[12.680,42.305],[12.819,42.267],[13.800,41.706]],[[67.500,31.800],[67.500,30.200],[67.300,30.000],[67.000,30.000],[67.000,27.000],[67.300,27.000],[67.500,26.800],[67.500,25.000],[67.300,24.800],[62.000,24.800],[61.800,25.000],[61.800,33.800],[62.000,34.000],[65.327,34.000],[65.523,33.765],[67.000,32.000],[67.300,32.000]],[[54.500,25.000],[54.700,24.800],[60.800,24.800],[61.000,25.000],[61.000,40.700],[60.700,41.000],[57.943,42.818],[57.667,43.000],[54.700,43.000],[54.500,42.800]]],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // STATION-BASED PRICING — Spartan DG 7-Station Factory Layout
  // Each station has: name, labour rate ($/hr), and operations with times.
  // Labour cost per operation = (time_min / 60) x rate x overheadMultiplier
  // Salespeople see one line per station. Backend tracks every operation.
  // ═══════════════════════════════════════════════════════════════════════════

  overheadMultiplier: 1.22,  // Super 11.5% + WC 2% + payroll tax 5% + tools 3.5%

  // ═══════════════════════════════════════════════════════════════════════════
  // WASTE — per-category, based on 2026 industry research (FeneVision /
  // LogiKal / Stolcad defaults, cross-checked with Australian uPVC fabricators)
  // ─────────────────────────────────────────────────────────────────────────
  //   Profiles  : 7–10% typical (bar nesting losses + saw kerf + damaged ends)
  //   Steel     : 5–7% (straight cuts, less complex than mitred profile)
  //   Glass     : 2–4% (IGUs are pre-cut to order; loss is breakage + re-makes)
  //   Bead      : 10–15% (short pieces, high offcut rate)
  //   Gasket    : 8–12% (coil material, insertion stretch loss)
  //   Hardware  : 0% (discrete units — a handle is a handle)
  //   Ancillary : 0% (discrete — sealant tubes, fixings packs, sills)
  // Values editable in Settings → Pricing → Waste.
  // ═══════════════════════════════════════════════════════════════════════════
  waste: {
    profile:     1.08,  //  8% — uPVC profile offcuts + kerf + trim
    steel:       1.06,  //  6% — galv steel reinforcement offcuts
    glass:       1.03,  //  3% — IGU breakage + re-makes
    bead:        1.12,  // 12% — short pieces, high offcut rate
    gasket:      1.10,  // 10% — EPDM insertion stretch loss
    hardware:    1.00,  //  0% — discrete units, no waste
    ancillaries: 1.00,  //  0% — discrete units, no waste
  },
  wasteFactor: 1.05,   // DEPRECATED — kept only as fallback if waste object missing

  // ═══════════════════════════════════════════════════════════════════════════
  // CUT OPTIMIZATION — toggles how per-profile costs are computed
  //   'linear' (default): length_m × $/m × waste.profile
  //       Simple, assumes project-level bar nesting across frames.
  //       Matches what most industry software shows as the "indicative" cost.
  //   'bar'   : ceil(required_len / usable_bar) × bar_price, per frame
  //       Conservative — treats each frame as paying its own full bar.
  //       Use this when you don't batch frames into shared cut lists.
  // saw_kerf_mm : blade thickness consumed at every cut (default 3mm).
  // trim_mm     : clean-cut allowance at each end of each bar (default 20mm).
  // ═══════════════════════════════════════════════════════════════════════════
  pricingMode:      'linear',
  sawKerfMm:         3,
  trimAllowanceMm:  20,

  // ═══════════════════════════════════════════════════════════════════════════
  // INSTALL PLANNING — per-frame install minutes lookup (WIP9, Phoenix spec)
  //
  // installMinutes(frame) = baseMinutes[propertyType][sizeBucket]
  //                       + floorAddOn[floorBucket]
  //
  // sizeBucket    = areaSqm(frame) < sizeThresholdSqm ? 'under' : 'over'
  // floorBucket   = 'ground' | 'first' | 'second' | 'third' | 'above3'
  //                 (maps from frame.floorLevel 0/1/2/3/4+)
  //
  // Property types:
  //   brick_veneer          — cavity brick-over-timber-frame (AU standard)
  //   double_brick          — solid double-brick wall (slower, thicker)
  //   weatherboard_cladding — includes integral flashing time
  //
  // Editable via Settings → Pricing → Install times (§13968 renderer).
  // All values are per-frame starting defaults; Phoenix will tune.
  // ═══════════════════════════════════════════════════════════════════════════
  installPlanning: {
    sizeThresholdSqm: 2.0,
    baseMinutes: {
      brick_veneer:          { under: 60, over: 120 },
      double_brick:          { under: 75, over: 150 },
      weatherboard_cladding: { under: 90, over: 180 },
    },
    floorAddOn: {
      ground:  0,
      first:  15,
      second: 30,
      third:  45,
      above3: 60,
    },
  },

  stations: {
    // --- STATION 1: Double-Head Profile Saw (CNC, cuts both ends simultaneously) ---
    S1_profileSaw: {
      name: 'Stn 1 - Double Head Saw', rate: 42.00,
      ops: {
        moveStillage:    { t: 1.0, unit: 'per job',   desc: 'Move profile stillage to saw station (fires once per save — enter the per-job share directly; e.g. 1 min/stillage ÷ 3 jobs per stillage ≈ 0.33 min/job)' },
        identifyGrab:    { t: 0.5, unit: 'per bar',   desc: 'Identify length, grab bar from stillage' },
        loadSaw:         { t: 0.3, unit: 'per bar',   desc: 'Load bar into double-head saw, set stops' },
        doubleHeadCut:   { t: 0.5, unit: 'per bar',   desc: 'CNC double-head cut (both 45 deg mitres at once)' },
        offcutReturn:    { t: 0.3, unit: 'per bar',   desc: 'Return offcut to rack, label remnant' },
      },
    },
    // --- STATION 2: Steel Cutting Saw ---
    S2_steelSaw: {
      name: 'Stn 2 - Steel Saw', rate: 38.00,
      ops: {
        identifyGrabSteel: { t: 0.4, unit: 'per piece', desc: 'Identify length, grab from steel stillage' },
        cutSteel:        { t: 0.5, unit: 'per cut',   desc: 'Cut galvanised steel to length' },
        slideInProfile:  { t: 0.5, unit: 'per piece', desc: 'Slide steel inside uPVC profile chamber' },
      },
    },
    // --- STATION 4A: CNC Milling Machine (handle holes, drainage, Siegenia hardware pockets) ---
    // --- STATION 4A: CNC Milling Machine ---
    // WIP22: Stripped the fictional 12-op model (handleHole, lockHole, hingeRecess,
    // keepRecess, drainageSlot, tiltTurnSlot, multiPointSlot, rollerCutout, etc.)
    // because the system had no actual knowledge of which operations applied to
    // which frame — it was pattern-matching on product type with fabricated times.
    //
    // Interim model assumes a basic CNC that does two cycles per frame:
    //   1. Drainage holes on the outer frame (per frame, once)
    //   2. Hardware prep on each sash (one cycle per sash, includes all holes)
    //
    // Both cycles include load/unload/clamp/unclamp time. This is honest about
    // what we don't know. Real cycle times + per-operation detail will be
    // derived from Aluplast + Siegenia DXF uploads (Phase 1 work starting when
    // sample files arrive), at which point this config expands to a structured
    // spec-library lookup.
    S4A_cncMill: {
      name: 'Stn 4A - CNC Mill', rate: 45.00,
      ops: {
        drainageCycle: { t: 2.0, unit: 'per frame', desc: 'Load bottom rail, drill drainage holes, unload' },
        hardwareCycle: { t: 4.0, unit: 'per sash',  desc: 'Load sash, drill all hardware holes (handle/lock/espag/hinges), unload' },
      },
    },
    // --- STATION 4B: Steel Screwing Machine ---
    S4B_steelScrew: {
      name: 'Stn 4B - Steel Screw', rate: 38.00,
      ops: {
        alignSteel:      { t: 0.3, unit: 'per piece', desc: 'Align steel to screw hole positions in profile' },
        driveScrew:      { t: 0.25, unit: 'per screw', desc: 'Drive self-tapping screw through profile into steel' },
      },
      screwsPerSteel: 4,
    },
    // --- WELDING: 2-Head Welder ---
    S_welder: {
      name: 'Welder (2-Head)', rate: 45.00,
      ops: {
        insertBlocks:    { t: 0.5, unit: 'per rect',  desc: 'Put welding blocks in machine' },
        place3Profiles:  { t: 1.0, unit: 'per rect',  desc: 'Place 3 profiles in position, align' },
        weldCycle:       { t: 2.5, unit: 'per weld',  desc: '2-head weld cycle (heat 240 deg C + press + hold)' },
        turnAndPlace4th: { t: 0.8, unit: 'per rect',  desc: 'Turn frame/sash around, place 4th profile' },
        mullionWeld:     { t: 2.0, unit: 'per joint',  desc: 'Weld mullion T-joint to frame' },
      },
    },
    // --- CORNER CLEANING ---
    S_cornerClean: {
      name: 'Corner Cleaner', rate: 40.00,
      ops: {
        cleanCorner:     { t: 1.2, unit: 'per corner', desc: 'Clean corner - all faces (top, bottom, vertical, internal)' },
        moveToTrolley:   { t: 0.5, unit: 'per rect',  desc: 'Move to hardware bench or place in sash trolley' },
      },
    },
    // --- STATION 5: Siegenia Hardware Assembly ---
    // WIP16 restructure: single-mode (bundle) computation. The 14 individual
    // fit ops (handleFit, hingeFit, etc.) were deleted — perSash is now the
    // single source of truth for per-sash hardware time, with 4 per-X op
    // contributions alongside. Gaskets are co-extruded (no factory labour) and
    // drain caps are done on-site, so those two ops are also gone.
    S5_hardware: {
      name: 'Stn 5 - Siegenia Hardware', rate: 42.00,
      ops: {
        manualCornerClean:     { t: 1.5, unit: 'per rect',      desc: 'Manual corner cleaning at hardware bench — touch-up after S_cornerClean machine (covers all 4 corners of the rect)' },
        mullionFit:            { t: 3.0, unit: 'per mullion',   desc: 'Insert mullion, fit end caps, seals and fasteners' },
        cutBead:               { t: 0.3, unit: 'per cut',       desc: 'Cut glazing bead piece to length (moved from S1 in WIP13)' },
        thresholdCut:          { t: 1.5, unit: 'per threshold', desc: 'Cut aluminium threshold to length (french/hinged doors; cut at S5 because aluminium, not PVC saw)' },
        colourCornerTouchUp:   { t: 0.5, unit: 'per corner',    desc: 'Apply colour touch-up at welded corners — coloured frames only (white/creme exempt)' },
      },
      // Summary bundle times per sash, by product type. This is the SINGLE
      // source of truth for per-sash hardware time since WIP16. Drain caps
      // (on-site) and gaskets (co-extruded) are NOT included — both are
      // outside the S5 scope entirely.
      perSash: {
        awning_window:    { t: 12, parts: 'Siegenia winder + 2 stays + lock + handle + 2 keeps' },
        casement_window:  { t: 12, parts: 'Siegenia winder + 2 stays + lock + handle + 2 keeps' },
        tilt_turn_window: { t: 18, parts: 'Siegenia T&T gear + handle + 4 keeps + corner drives + restrictor' },
        fixed_window:     { t: 0,  parts: '(no sash hardware — bead cuts and corner touch-up handled via per-X ops)' },
        sliding_window:   { t: 8,  parts: 'Siegenia 2 rollers + lock + handle + track portion' },
        french_door:      { t: 20, parts: 'Siegenia multi-point + 3 hinges + 2 flush bolts + handle + keeps' },
        hinged_door:      { t: 16, parts: 'Siegenia multi-point + 3 hinges + handle + closer + keeps' },
        bifold_door:      { t: 14, parts: 'Siegenia fold hardware + track portion + 2 hinges + handle' },
        lift_slide_door:  { t: 25, parts: 'Siegenia Portal HS full gear + bogie wheels + handle' },
        smart_slide_door: { t: 14, parts: 'Siegenia smart-slide rollers + lock + handle' },
        vario_slide_door: { t: 12, parts: 'Siegenia vario track rollers + lock + handle' },
        stacker_door:     { t: 12, parts: 'Siegenia stacker track rollers + lock + handle' },
      },
    },
    // ─── GLAZING (factory bead snap, IGU if factory-glazed) ───
    S_glazing: {
      name: 'Glazing (Factory)', rate: 38.00,
      ops: {
        snapBeadPiece:   { t: 0.5,  unit: 'per piece',  desc: 'Insert bead piece into frame/sash rebate (site glazing)' },
        insertGasket:    { t: 0.3,  unit: 'per metre',  desc: 'Insert EPDM glazing gasket strip' },
        positionIGU:     { t: 1.5,  unit: 'per pane',   desc: 'Position IGU + insert packers' },
        sealantRun:      { t: 1.0,  unit: 'per pane',   desc: 'Apply silicone sealant around glazing' },
      },
    },
    // ─── STATION 6: Reveals, Trims, Architraves ───
    S6_reveals: {
      name: 'Stn 6 - Reveals/Trims', rate: 38.00,
      ops: {
        measureReveal:   { t: 0.5, unit: 'per piece', desc: 'Measure and mark reveal trim piece' },
        cutReveal:       { t: 0.8, unit: 'per cut',   desc: 'Cut PVC reveal/architrave piece' },
        assembleSet:     { t: 6.0, unit: 'per set',   desc: 'Assemble reveal set (head + 2 jambs + clips)' },
        cutSill:         { t: 1.0, unit: 'per sill',  desc: 'Cut aluminium external sill to length' },
        fitSill:         { t: 2.0, unit: 'per sill',  desc: 'Dry-fit sill to frame' },
        cutTrim:         { t: 0.6, unit: 'per piece', desc: 'Cut cover strip / trim piece' },
      },
    },
    // ─── STATION 7: Fly Screen Assembly ───
    S7_flyScreen: {
      name: 'Stn 7 - Fly Screens', rate: 36.00,
      ops: {
        cutAlFrame:      { t: 0.6, unit: 'per cut',    desc: 'Cut aluminium fly screen frame extrusion' },
        cutMesh:         { t: 1.5, unit: 'per screen',  desc: 'Cut fiberglass mesh to size' },
        rollSpline:      { t: 3.0, unit: 'per screen',  desc: 'Roll rubber spline into channel to tension mesh' },
        pressCorner:     { t: 0.5, unit: 'per corner',  desc: 'Press-fit corner connector' },
        trimExcess:      { t: 0.5, unit: 'per screen',  desc: 'Trim excess mesh around edges' },
        fitPullTab:      { t: 0.3, unit: 'per screen',  desc: 'Fit pull tab / finger lift' },
      },
    },
    // ─── QC ───
    S_qc: {
      name: 'Quality Control', rate: 45.00,
      ops: {
        dimCheck:        { t: 2.0, unit: 'per frame',  desc: 'Measure dims + diagonals (<= 3mm tolerance)' },
        operationCheck:  { t: 1.5, unit: 'per sash',   desc: 'Open/close/lock each sash, check smooth' },
        sealCheck:       { t: 1.0, unit: 'per frame',  desc: 'Check gasket seating, drainage, weatherseal' },
        visualInspect:   { t: 1.0, unit: 'per frame',  desc: 'Visual - scratches, weld quality, colour match' },
      },
    },
    // ─── DISPATCH ───
    S_dispatch: {
      name: 'Dispatch & Packing', rate: 35.00,
      ops: {
        wrap:            { t: 3.0, unit: 'per unit',   desc: 'Corner guards + stretch wrap + foam' },
        label:           { t: 1.0, unit: 'per unit',   desc: 'Print label + attach spec sheet' },
        loadTruck:       { t: 2.0, unit: 'per unit',   desc: 'Move to truck, position, secure' },
        palletise:       { t: 10.0, unit: 'per order',  desc: 'Palletise full order + strap' },
      },
    },
    // ─── INSTALLATION (on-site) ───
    // WIP23: Restructured — installation time now depends on (productType × installationType).
    //   sealTrim + cleanup are universal add-ons (applied to all non-supply-only)
    //   installTimes[type][productType].t is the base install minutes
    //   bifold_door is special: base.t is PER PANEL; formula multiplies by panels
    //   supply_only installationType zeros out install entirely
    //
    // Retrofit defaults include demo of existing window + patching render/brickwork.
    // New Construction defaults are typically 30-40% less (no demo, better access,
    // openings pre-framed accurately). All values editable in Settings.
    S_install: {
      name: 'Installation', rate: 55.00,
      ops: {
        sealTrim:        { t: 15, unit: 'per unit',    desc: 'Silicone sealant + architrave trim on-site' },
        cleanup:         { t: 10, unit: 'per unit',    desc: 'Clean up, remove packaging, final check' },
      },
      installTimes: {
        retrofit: {
          fixed_window:     { t: 40,  desc: 'Retrofit fixed window install' },
          awning_window:    { t: 45,  desc: 'Retrofit awning window install' },
          casement_window:  { t: 50,  desc: 'Retrofit casement window install' },
          tilt_turn_window: { t: 55,  desc: 'Retrofit tilt-turn window install' },
          sliding_window:   { t: 50,  desc: 'Retrofit sliding window install' },
          french_door:      { t: 75,  desc: 'Retrofit french door install (incl. threshold)' },
          hinged_door:      { t: 70,  desc: 'Retrofit hinged door install' },
          bifold_door:      { t: 20,  desc: 'Retrofit bifold per panel (scales × panel count)' },
          lift_slide_door:  { t: 150, desc: 'Retrofit lift-slide door install' },
          smart_slide_door: { t: 110, desc: 'Retrofit smart-slide door install' },
          vario_slide_door: { t: 90,  desc: 'Retrofit vario-slide door install' },
          stacker_door:     { t: 100, desc: 'Retrofit stacker door install' },
        },
        new_construction: {
          fixed_window:     { t: 25,  desc: 'New construction fixed window install' },
          awning_window:    { t: 30,  desc: 'New construction awning window install' },
          casement_window:  { t: 35,  desc: 'New construction casement window install' },
          tilt_turn_window: { t: 40,  desc: 'New construction tilt-turn window install' },
          sliding_window:   { t: 35,  desc: 'New construction sliding window install' },
          french_door:      { t: 55,  desc: 'New construction french door install' },
          hinged_door:      { t: 50,  desc: 'New construction hinged door install' },
          bifold_door:      { t: 15,  desc: 'New construction bifold per panel (scales × panel count)' },
          lift_slide_door:  { t: 120, desc: 'New construction lift-slide door install' },
          smart_slide_door: { t: 85,  desc: 'New construction smart-slide door install' },
          vario_slide_door: { t: 70,  desc: 'New construction vario-slide door install' },
          stacker_door:     { t: 80,  desc: 'New construction stacker door install' },
        },
      },
    },
  },

  // ─── MATERIAL COSTS ───
  // ─────────────────────────────────────────────────────────────────────
  // PROFILE COSTS — Unified white + colour pricing per profile (WIP36)
  // ONE row per physical profile (one geometry = one row). Colour foil is
  // treated as a price modifier on the same profile, NOT as a separate
  // profile that needs its own DXF / milling data.
  //
  //   perMetreWhite      — base rate, no foil (white body / cream).
  //   perMetreColour     — both faces foiled (full colour, dual-side).
  //   perMetreBilateral  — one face white, one face colour (single-side
  //                        foil, sometimes called "asymmetric"). Optional;
  //                        falls back to a calibrated blend of white+colour
  //                        when absent (see profUnit's colourFactor logic).
  //   barLen             — stock bar length in metres for FFD nesting.
  //
  // KEY = the lookup key used by profileKeysForType / profUnit. The
  // GEOMETRY catalog (PRICING_DEFAULTS.profiles) uses the same keys, so
  // an Ideal 4000 frame's polygon lives under 'i4_frame' alongside its
  // cost entry. DXF imports against an existing cost row write geometry
  // back under the same key — UI Profile cards show one card per key
  // and that card carries everything: geometry, white price, colour
  // price, bar length.
  //
  // Anodised aluminium profiles (silver / black thresholds, guide rails)
  // are NOT pairs — they're separate stock items, kept as standalone keys.
  // ─────────────────────────────────────────────────────────────────────
  profileCosts: {
    // Aluplast Ideal 4000 — outer frames, sashes, mullions
    'i4_frame':       { code:'14x307', name:'I4000 Frame 70mm',          system:'Ideal 4000', role:'frame',     perMetreWhite: 10.42, perMetreColour: 18.15, perMetreBilateral: 16.14, barLen: 5.85 },
    'i4_sash77':      { code:'14x320', name:'I4000 Z77 Sash',            system:'Ideal 4000', role:'sash',      perMetreWhite: 10.36, perMetreColour: 19.47, perMetreBilateral: 17.43, barLen: 5.85 },
    'i4_sash105z':    { code:'14x330', name:'I4000 Z105 Door Sash',      system:'Ideal 4000', role:'sash',      perMetreWhite: 18.07, perMetreColour: 25.88, perMetreBilateral: 23.24, barLen: 5.85 },
    'i4_sash105t':    { code:'14x331', name:'I4000 T105 Door Sash',      system:'Ideal 4000', role:'sash',      perMetreWhite: 18.07, perMetreColour: 29.88, perMetreBilateral: 26.02, barLen: 6.00 },
    'i4_mullion84':   { code:'14x341', name:'I4000 Mullion 84mm',        system:'Ideal 4000', role:'mullion',   perMetreWhite: 12.03, perMetreColour: 23.23, perMetreBilateral: 18.33, barLen: 5.85 },
    'i4_mullion104':  { code:'14x345', name:'I4000 Mullion 104mm',       system:'Ideal 4000', role:'mullion',   perMetreWhite:  6.91, perMetreColour:  6.91, barLen: 6.00 },
    'i4_falsemull':   { code:'14x366', name:'I4000 False Mullion 64mm',  system:'Ideal 4000', role:'floating_mullion', perMetreWhite: 11.57, perMetreColour: 17.82, perMetreBilateral: 15.79, barLen: 5.85 },
    'i4_facade104':   { code:'14x268', name:'I4000 Facade 104mm',        system:'Ideal 4000', role:'facade',    perMetreWhite: 43.64, perMetreColour: 43.64, barLen: 5.85 },

    // Aluplast Ideal 4000 — anodised aluminium threshold (no foil duality)
    'i4_threshold_silver': { code:'247070', name:'I4000 Aluminium Threshold 70mm (silver anodised)', system:'Ideal 4000', role:'threshold', perMetreWhite: 26.81, barLen: 5.80 },

    // Aluplast Casement 4000 — frames, T-sashes, mullions for outward-opening
    'c4_frame60':     { code:'10x353', name:'C4000 Frame 60mm',          system:'Casement 4000', role:'frame',   perMetreWhite: 11.60, perMetreColour: 16.99, barLen: 5.85 },
    'c4_sash755':     { code:'10x355', name:'C4000 T Sash 75.5mm',       system:'Casement 4000', role:'sash',    perMetreWhite: 13.72, perMetreColour: 18.47, perMetreBilateral: 16.99, barLen: 5.85 },
    'c4_mullion70t':  { code:'10x356', name:'C4000 T Mullion 70mm',      system:'Casement 4000', role:'mullion', perMetreWhite: 12.45, perMetreColour: 22.41, barLen: 6.00 },
    'c4_mullion80t':  { code:'10x358', name:'C4000 T Mullion 80mm',      system:'Casement 4000', role:'mullion', perMetreWhite: 15.55, perMetreColour: 27.99, barLen: 5.85 },

    // Aluplast HST 85 — Lift-Slide doors
    'ls_frame':       { code:'17x301', name:'HST85 Frame 184mm',         system:'HST 85', role:'frame',         perMetreWhite: 38.20, perMetreColour: 65.50, barLen: 6.50 },
    'ls_sash100':     { code:'17x381', name:'HST85 Sash 100mm',          system:'HST 85', role:'sash',          perMetreWhite: 20.53, perMetreColour: 36.48, barLen: 6.50 },
    'ls_interlock':   { code:'17x100', name:'HST85 Interlock',           system:'HST 85', role:'interlock',     perMetreWhite: 13.10, perMetreColour: 22.30, barLen: 5.00 },

    // Aluplast Smart-Slide
    'ss_frame140':    { code:'10x091', name:'Smart-Slide Frame 140mm',   system:'Smart-Slide', role:'frame',    perMetreWhite:  9.65, perMetreColour: 17.40, barLen: 5.85 },
    'ss_sash97':      { code:'10x394', name:'Smart-Slide Sash 97mm',     system:'Smart-Slide', role:'sash',     perMetreWhite: 19.37, perMetreColour: 33.95, barLen: 5.85 },
    'ss_interlock':   { code:'10x098', name:'Smart-Slide Interlock',     system:'Smart-Slide', role:'interlock',perMetreWhite: 11.20, perMetreColour: 18.95, barLen: 5.85 },

    // Aluplast Vario-Slide — frames, sashes, cover, interlocks
    'vs_frame50_3t':  { code:'10x084', name:'Vario-Slide 3T Frame 50mm', system:'Vario-Slide', role:'frame',    perMetreWhite: 15.44, perMetreColour: 24.61, perMetreBilateral: 22.32, barLen: 5.85 },
    'vs_frame50_2t':  { code:'10x087', name:'Vario-Slide 2T Frame 50mm', system:'Vario-Slide', role:'frame',    perMetreWhite: 10.51, perMetreColour: 19.12, perMetreBilateral: 17.17, barLen: 5.85 },
    'vs_sash72':      { code:'10x385', name:'Vario-Slide Sash 72mm (window)', system:'Vario-Slide', role:'sash',perMetreWhite: 12.10, perMetreColour: 19.11, perMetreBilateral: 17.36, barLen: 5.85 },
    'vs_sash90':      { code:'10x386', name:'Vario-Slide Sash 90mm (door)',   system:'Vario-Slide', role:'sash',perMetreWhite: 12.40, perMetreColour: 22.68, perMetreBilateral: 20.30, barLen: 5.85 },
    'vs_cover':       { code:'10x286', name:'Vario-Slide Cover Profile', system:'Vario-Slide', role:'cover',    perMetreWhite:  2.07, perMetreColour:  6.14, barLen: 5.85 },
    'vs_interlockW':  { code:'20x083', name:'Vario-Slide Interlock (window)', system:'Vario-Slide', role:'interlock', perMetreWhite: 8.59, perMetreColour:  8.63, barLen: 6.00 },
    'vs_interlockD':  { code:'20x081', name:'Vario-Slide Interlock (door)',   system:'Vario-Slide', role:'interlock', perMetreWhite: 9.63, perMetreColour:  9.63, barLen: 6.00 },
    'vs_interlock':   { code:'10x093', name:'Vario-Slide Interlock',     system:'Vario-Slide', role:'interlock',perMetreWhite:  9.85, perMetreColour: 17.45, barLen: 6.00 },

    // Vario-Slide guide rails — anodised aluminium, no foil duality
    'vs_guideRail_silver': { code:'20x076', name:'Vario-Slide Aluminium Guide Rail (silver anodised)', system:'Vario-Slide', role:'guide_rail', perMetreWhite: 3.32, barLen: 6.00 },
    'vs_guideRail_black':  { code:'20x076', name:'Vario-Slide Aluminium Guide Rail (black anodised)',  system:'Vario-Slide', role:'guide_rail', perMetreWhite: 3.32, barLen: 6.00 },
  },
  steelCosts: {
    'i4_sash_steel_2mm':  { code:'259030', name:'2mm Steel 14x330/331', perMetre: 9.48, barLen:5.80 },
    'i4_frame_steel_2mm': { code:'259023', name:'2mm Rebate Steel I4000', perMetre: 45.79, barLen:1.00 },
    'i4_mull_steel_25mm': { code:'229098', name:'2.5mm Steel Mullion 84mm', perMetre: 5.96, barLen:5.80 },
    'c4_sash_steel_2mm':  { code:'209009', name:'2mm Steel 10x356/357', perMetre: 4.84, barLen:5.80 },
    'c4_frame_steel_15mm':{ code:'209055', name:'1.5mm Steel 10x355', perMetre: 3.08, barLen:5.80 },
    'ls_steel':           { code:'249242', name:'2mm Steel HST85', perMetre: 17.40, barLen:6.00 },
    'generic_2mm':        { code:'generic', name:'Generic 2mm Galv Steel', perMetre: 8.50, barLen:5.80 },
  },
  beadCosts: {
    // Glazing beads — QUBE-LINE snap-fit. White base rates from Aluplast catalogue.
    // Colour rates: 22mm has verified supplier pricing; 28/34/40mm colour rates
    // are calibrated estimates using the 22mm white→colour ratio (1.751x) since
    // foil application cost is near-constant across sizes (thin visible face
    // differs by ±1mm). Override with real supplier numbers in Settings → Beads.
    'bead_22mm_white':  { code:'12x836', name:'22mm Bead (26mm w/gasket)',           perMetre: 3.33, barLen:5.85 },
    'bead_22mm_colour': { code:'12x836', name:'22mm Bead (26mm w/gasket, colour)',   perMetre: 5.83, barLen:6.00 },
    'bead_28mm_white':  { code:'12x838', name:'28mm Bead (32mm w/gasket)',           perMetre: 2.98, barLen:6.00 },
    'bead_28mm_colour': { code:'12x838', name:'28mm Bead (32mm w/gasket, colour)',   perMetre: 5.22, barLen:6.00 },
    'bead_34mm_white':  { code:'12x640', name:'34mm Bead (36mm w/gasket)',           perMetre: 3.27, barLen:6.00 },
    'bead_34mm_colour': { code:'12x640', name:'34mm Bead (36mm w/gasket, colour)',   perMetre: 5.72, barLen:6.00 },
    'bead_40mm_white':  { code:'14x841', name:'40mm Bead (44mm w/gasket)',           perMetre: 3.84, barLen:6.00 },
    'bead_40mm_colour': { code:'14x841', name:'40mm Bead (44mm w/gasket, colour)',   perMetre: 6.72, barLen:6.00 },
  },
  glassCosts: {
    'dgu_4_12_4':      { name:'DGU 4/12air/4 Clear', perSqm: 45.00 },
    'dgu_4_16ar_4low': { name:'DGU 4/16Ar/4 Low-E', perSqm: 68.00 },
    'dgu_4_20ar_4low': { name:'DGU 4/20Ar/4 Low-E (standard)', perSqm: 78.00 },
    'tgu_4_14ar_4_14ar_4': { name:'TGU 4/14Ar/4/14Ar/4', perSqm: 120.00 },
    'dgu_6_12ar_6low': { name:'DGU 6.38/12Ar/6 Low-E (door)', perSqm: 95.00 },
    'obscure_dgu':     { name:'DGU 4/16Ar/4 Obscure', perSqm: 82.00 },
    'acoustic_dgu':    { name:'DGU 6.38/16Ar/6.38 Acoustic', perSqm: 135.00 },
    'laminated_dgu':   { name:'DGU 6.38Lam/16Ar/4 Safety', perSqm: 110.00 },
  },
  hardwareCosts: {
    awning_window: 85, casement_window: 85, tilt_turn_window: 120,
    fixed_window: 8, sliding_window: 65, french_door: 180,
    hinged_door: 150, bifold_door: 110, lift_slide_door: 450,
    smart_slide_door: 160, vario_slide_door: 120, stacker_door: 120,
  },
  ancillaries: {
    flyScreenPerUnit: 45, flyScreenFramePerMetre: 5.50, revealSetPerWindow: 35, revealSetPerDoor: 45,
    sillPerWindow: 18, drainageCapsPerFrame: 2.50, cornerConnectors: 1.80,
    gasketPerMetre: 1.20, sealantPerUnit: 4.50, fixingsPerUnit: 6.00,
    deliveryPerUnit: 25.00,
    // Aluplast 446071 threshold connector — 1 left + 1 right piece per door
    // where a low aluminium threshold is fitted. ~$3 per piece → $6 per door.
    thresholdConnectorPerDoor: 6.00,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRIMS — physical orderable catalog (distinct from TRIM_DICTIONARY which is
  // the legacy/general vocabulary). Each top-level key is a "family"
  // (coverMouldings, future: architraves, skirtings, …). Each family has a
  // stable shape: { productCode, description, crossSection, supplier, items[] }
  // where items[] is the SKU list (one row per colour × bar-length).
  //
  // WIP30: cover mouldings only. Future catalog drops add sibling family keys.
  // Per-meter price is derived (priceExBar / lengthMm × 1000) and persisted for
  // fast reads — Settings UI "Refresh per-meter prices" recomputes (WIP31).
  //
  // CONSUMPTION (revised):
  //   - Catalog SKUs populate the unified Internal/External Trim dropdowns
  //     alongside TRIM_DICTIONARY codes (see buildTrimOptionEls). The state
  //     keys (trimInternalTop/Left/Right/Bottom + trimExternal*) hold either
  //     a dictionary code (e.g. '30 T') OR a catalog item id (e.g.
  //     '12x286_aludec_jetblack_5850'); the two id-spaces are disjoint.
  //   - computeTrimCuts() reads measurementsByFrameId + this catalog map and
  //     produces a per-trim cutting list (top/bottom = W+200, left/right = H+200).
  //   - generateCutListXlsxWorkbook adds a "Trim Cuts" sheet using the same.
  //
  // Catalog spec defaults: jointStyle 'mitre', overhang 5mm/cut, wastage 5%,
  // offcut keep ≥ 200mm. Bottom-skip (door bottom) is now expressed by the
  // surveyor leaving the bottom dropdown empty — no separate boolean state.
  // ═══════════════════════════════════════════════════════════════════════════
  trims: {
    coverMouldings: {
      productCode: '12x286',
      description: 'Aluplast Cover Moulding 30x7mm',
      crossSection: { widthMm: 30, thicknessMm: 7 },
      supplier: 'Aluplast',
      // WIP30: profile cross-section image (data URL, ~6KB JPEG). Renders
      // next to the catalog header in Settings → Catalogs → Trims AND in
      // the Cut List preview's per-trim summary so the cutter visually
      // confirms which physical profile matches the SKU. Per-item
      // profileImage overrides the family default when present.
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',         // 'mitre' | 'butt'
        overhangMmPerCut: 5,         // mm added each end of every cut
        wastagePct: 5,               // % uplift on total lineal demand
        offcutKeepMinMm: 200,        // offcuts >= this are kept; smaller junked
        doorBottomDefault: false,    // bifold/sliding/French: no trim on bottom
      },
      items: [
        { id: '12x286_tropical_5850',          colour: 'Tropical',           colourFamily: 'plain',      lengthMm: 5850, priceExBar: 20.75, priceExPerMeter: 3.547, sku: '1292860005850',  availability: 'available',    stockQty: 9 },
        { id: '12x286_cream_6000',             colour: 'Cream',              colourFamily: 'plain',      lengthMm: 6000, priceExBar: 21.27, priceExPerMeter: 3.545, sku: '128286',         availability: 'available',    stockQty: 21 },
        { id: '12x286_turneroak_toffee_6000',  colour: 'Turner Oak Toffee',  colourFamily: 'turner_oak', lengthMm: 6000, priceExBar: 30.56, priceExPerMeter: 5.093, sku: '120286222',      availability: 'available',    promo: true, stockQty: 53 },
        { id: '12x286_turneroak_walnut_5850',  colour: 'Turner Oak Walnut',  colourFamily: 'turner_oak', lengthMm: 5850, priceExBar: 29.79, priceExPerMeter: 5.092, sku: '1292862355850',  availability: 'coming_soon', stockQty: null },
        { id: '12x286_turneroak_malt_5850',    colour: 'Turner Oak Malt',    colourFamily: 'turner_oak', lengthMm: 5850, priceExBar: 29.79, priceExPerMeter: 5.092, sku: '1292862195850',  availability: 'available',    stockQty: null },
        { id: '12x286_aludec_jetblack_5850',   colour: 'Aludec Jet Black',   colourFamily: 'aludec',     lengthMm: 5850, priceExBar: 29.79, priceExPerMeter: 5.092, sku: '1292862045850',  availability: 'available',    stockQty: null },
        { id: '12x286_aludec_monument_5850',   colour: 'Aludec Monument®',   colourFamily: 'aludec',     lengthMm: 5850, priceExBar: 29.79, priceExPerMeter: 5.092, sku: '1292862735850',  availability: 'coming_soon', stockQty: 70 },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 50x7mm cover trim — Aluplast 12x288. Same family/usage pattern as
    // 12x286 (30x7); wider profile for situations where a heavier visual
    // line is needed at the frame/reveal join. TRIM_DICTIONARY '50 T' code
    // links to this family via defaultCatalogFamily so generic '50 T'
    // selections still pack via FFD. 8 SKUs (one extra vs 30x7 — Sheffield
    // Oak Concrete in 6m bars).
    // ─────────────────────────────────────────────────────────────────────
    coverMouldings50: {
      productCode: '12x288',
      description: 'Aluplast Cover Moulding 50x7mm',
      crossSection: { widthMm: 50, thicknessMm: 7 },
      supplier: 'Aluplast',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        { id: '12x288_sheffield_concrete_6000', colour: 'Sheffield Oak Concrete', colourFamily: 'sheffield_oak', lengthMm: 6000, priceExBar: 46.80, priceExPerMeter: 7.800, sku: '120288221',     availability: 'available',    stockQty: 6 },
        { id: '12x288_tropical_5850',           colour: 'Tropical',               colourFamily: 'plain',         lengthMm: 5850, priceExBar: 23.10, priceExPerMeter: 3.949, sku: '1292880005850', availability: 'available',    stockQty: 11 },
        { id: '12x288_cream_5850',              colour: 'Cream',                  colourFamily: 'plain',         lengthMm: 5850, priceExBar: 23.69, priceExPerMeter: 4.050, sku: '1282880005850', availability: 'available',    stockQty: 21 },
        { id: '12x288_turneroak_toffee_6000',   colour: 'Turner Oak Toffee',      colourFamily: 'turner_oak',    lengthMm: 6000, priceExBar: 46.80, priceExPerMeter: 7.800, sku: '120288222',     availability: 'available',    promo: true, stockQty: 53 },
        { id: '12x288_turneroak_walnut_5850',   colour: 'Turner Oak Walnut',      colourFamily: 'turner_oak',    lengthMm: 5850, priceExBar: 45.62, priceExPerMeter: 7.798, sku: '1292882355850', availability: 'coming_soon', stockQty: null },
        { id: '12x288_aludec_jetblack_5850',    colour: 'Aludec Jet Black',       colourFamily: 'aludec',        lengthMm: 5850, priceExBar: 45.62, priceExPerMeter: 7.798, sku: '1292882045850', availability: 'available',    stockQty: null },
        { id: '12x288_turneroak_malt_5850',     colour: 'Turner Oak Malt',        colourFamily: 'turner_oak',    lengthMm: 5850, priceExBar: 45.62, priceExPerMeter: 7.798, sku: '1292882195850', availability: 'available',    stockQty: null },
        { id: '12x288_aludec_monument_5850',    colour: 'Aludec Monument®',       colourFamily: 'aludec',        lengthMm: 5850, priceExBar: 45.62, priceExPerMeter: 7.798, sku: '1292882735850', availability: 'available',    stockQty: 70 },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 20x20mm angle trim — Aluplast 12x290. NOT a flat cover moulding —
    // this is an L-shaped / angle profile (90 deg corner) used where the
    // trim wraps around an external corner of the reveal. Cross-section is
    // 20x20 with ~3mm wall thickness. TRIM_DICTIONARY '20x20 T' code
    // links to this family for FFD packing. 7 SKUs — Tropical is the
    // budget plain colour ($8.90/bar); the rest are decorative finishes
    // at the standard $34.10 tier (Turner Oak, Aludec, Golden Oak).
    // ─────────────────────────────────────────────────────────────────────
    angleTrims20: {
      productCode: '12x290',
      description: 'Aluplast Angle Trim 20x20mm',
      crossSection: { widthMm: 20, thicknessMm: 20 },
      profileShape: 'angle',
      supplier: 'Aluplast',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        { id: '12x290_tropical_5850',          colour: 'Tropical',           colourFamily: 'plain',      lengthMm: 5850, priceExBar:  8.90, priceExPerMeter: 1.521, sku: '1292900005850', availability: 'available',    stockQty: 12 },
        { id: '12x290_turneroak_malt_5850',    colour: 'Turner Oak Malt',    colourFamily: 'turner_oak', lengthMm: 5850, priceExBar: 34.10, priceExPerMeter: 5.829, sku: '1292903195850', availability: 'coming_soon', stockQty: 43 },
        { id: '12x290_golden_oak_5850',        colour: 'Golden Oak',         colourFamily: 'golden_oak', lengthMm: 5850, priceExBar: 34.10, priceExPerMeter: 5.829, sku: '1292903235850', availability: 'available',    stockQty: 33 },
        { id: '12x290_turneroak_toffee_5850',  colour: 'Turner Oak Toffee',  colourFamily: 'turner_oak', lengthMm: 5850, priceExBar: 34.10, priceExPerMeter: 5.829, sku: '1292903225850', availability: 'available',    promo: true, stockQty: 53 },
        { id: '12x290_aludec_jetblack_5850',   colour: 'Aludec Jet Black',   colourFamily: 'aludec',     lengthMm: 5850, priceExBar: 34.10, priceExPerMeter: 5.829, sku: '1292903045850', availability: 'available',    stockQty: 94 },
        { id: '12x290_turneroak_walnut_5850',  colour: 'Turner Oak Walnut',  colourFamily: 'turner_oak', lengthMm: 5850, priceExBar: 34.10, priceExPerMeter: 5.829, sku: '1292903355850', availability: 'available',    stockQty: null },
        { id: '12x290_aludec_monument_5850',   colour: 'Aludec Monument®',   colourFamily: 'aludec',     lengthMm: 5850, priceExBar: 34.10, priceExPerMeter: 5.829, sku: '1292903735850', availability: 'available',    stockQty: 70 },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 180x80mm large angle trim — Aluplast 12x299. Substantial L-profile
    // (multi-chambered, ~6mm wall) used for heavy-duty applications:
    // commercial reveals, large openings where smaller cover trims would
    // look weak, or where the angle needs to span a wider gap. Significantly
    // pricier than smaller trims (~$120/bar). TRIM_DICTIONARY '180 T'
    // links here. 8 SKUs — first appearance of "Red" colour family.
    // Mix of 5850mm and 6000mm bar lengths within this catalog.
    // ─────────────────────────────────────────────────────────────────────
    angleTrims180: {
      productCode: '12x299',
      description: 'Aluplast Angle Trim 180x80x6mm',
      crossSection: { widthMm: 180, thicknessMm: 6, heightMm: 80 },
      profileShape: 'angle',
      supplier: 'Aluplast',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        { id: '12x299_red_6000',               colour: 'Red',                colourFamily: 'red',        lengthMm: 6000, priceExBar: 124.93, priceExPerMeter: 20.822, sku: '120299232',     availability: 'available',    stockQty: 57 },
        { id: '12x299_turneroak_malt_6000',    colour: 'Turner Oak Malt',    colourFamily: 'turner_oak', lengthMm: 6000, priceExBar: 124.93, priceExPerMeter: 20.822, sku: '120299219',     availability: 'available',    stockQty: 43 },
        { id: '12x299_tropical_5850',          colour: 'Tropical',           colourFamily: 'plain',      lengthMm: 5850, priceExBar:  62.81, priceExPerMeter: 10.737, sku: '1292990005850', availability: 'available',    stockQty: 57 },
        { id: '12x299_cream_5850',             colour: 'Cream',              colourFamily: 'plain',      lengthMm: 5850, priceExBar:  62.81, priceExPerMeter: 10.737, sku: '1282990005850', availability: 'coming_soon', stockQty: 57 },
        { id: '12x299_aludec_jetblack_6000',   colour: 'Aludec Jet Black',   colourFamily: 'aludec',     lengthMm: 6000, priceExBar: 124.93, priceExPerMeter: 20.822, sku: '120299204',     availability: 'available',    stockQty: 94 },
        { id: '12x299_turneroak_walnut_5850',  colour: 'Turner Oak Walnut',  colourFamily: 'turner_oak', lengthMm: 5850, priceExBar: 121.80, priceExPerMeter: 20.821, sku: '1292992355850', availability: 'available',    stockQty: null },
        { id: '12x299_turneroak_toffee_6000',  colour: 'Turner Oak Toffee',  colourFamily: 'turner_oak', lengthMm: 6000, priceExBar: 124.93, priceExPerMeter: 20.822, sku: '120299222',     availability: 'available',    promo: true, stockQty: null },
        { id: '12x299_aludec_monument_5850',   colour: 'Aludec Monument®',   colourFamily: 'aludec',     lengthMm: 5850, priceExBar: 121.80, priceExPerMeter: 20.821, sku: '1292992735850', availability: 'available',    stockQty: 70 },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 30x8mm FLANGE — Aluplast 12x237. Fundamentally different from cover
    // mouldings: the flange CLIPS into the frame profile (note the barbed
    // top in the cross-section) and the body extends down to depth — used
    // when extra window depth is required (+10–12mm depth per 30 FL spec).
    //
    // CUT MATH OVERRIDES (Phoenix's spec):
    //   - cutAllowanceMm: 30        — flange cuts are W+30 / H+30, NOT +200
    //   - jointStyle:    'mitre'    — always 45° mitred, not butt
    //
    // computeTrimCuts respects per-family allowance + jointStyle; the cut
    // list display marks mitred cuts with a 45° badge so cutters set the
    // saw angle correctly.
    //
    // TRIM_DICTIONARY '30 FL' code links here. 8 SKUs. Two-tier pricing:
    // plain (Tropical/Cream) at ~$28.62-29.35; decorative finishes at $52.57.
    // ─────────────────────────────────────────────────────────────────────
    flange30: {
      productCode: '12x237',
      description: 'Aluplast Flange 30x8mm (clip-in)',
      crossSection: { widthMm: 30, thicknessMm: 8 },
      profileShape: 'flange',
      supplier: 'Aluplast',
      profileImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCADwAGIDASIAAhEBAxEB/8QAHAABAQACAwEBAAAAAAAAAAAABgAFBwECBAMI/8QAUBAAAAUCAgMMBAcOAwkAAAAAAAECAwQFBgcRN3a0EiExMjM2QVFxdHWyExdWkRQVFlKTldIiJCUmV2GBgpKUs9PU4SNCgzVTVWNmcnOho//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwD9UiEIBCEIALxZny2bXapdPkvRZ1cnxqSy8yeS2ydcL0ikn0GTSXDzLgyzGFtS3KXZuLEiiW1FKnUtdARKlRGlqNpTxyDQ25kZnkvcpcI1cKt7PgGTuE/jnFi1qWR5t0mJLrLxHwbsyKO1/EeP9UcWp9+Yq3xMMsyis06nIPq3LS3lF/8AcgDw+AaAVSWItp1nEUm3V3ZQq/LelTvSKNxyMxMNLjHDvNfBt4kcBZEfDvjf575GNc2fTI8yZiTbEos2Hqu4paf+XKiNKP8A9qWA2I2tLiErQolJUWaTI8yMugdgPwiqT9Rw7oxTD+/YTR0+Vnw+mjqNlefabef6QwAQhCAQhCAQhCAQjPIsxCPgABLK/DF+XvXs9221Ij0WOo+hMdvduZf6r6y/VFhVnJXeFTPf+G3JMJKutLJIjl/CMWD3+FblShPb1QiVuoom58JuqkrcI+w21tqL8xkLCE/i+i1S3ZH+0KPVpjUkz3jd9K6qQh3LqWh5J+8ugA7AOhF8AxiuuKe98YUunTk9qVPsq8qA8AOAXxpjPU5kbkaRRmqfKX899130yUF/2IIjP/ykA5sT8EXre1vmW5Qc1qsxyP8A3clvJeX5vStOn+sHYBx/vzG2U7F30QLeQxNUXB6R2Qa2U9pJQ6fYsusPAEIQgEIQgEIC7+uC4afWLaoluO0yPJrMl9pb8+Ot5DaW2FO7yUrSeZ7nLhHw+LsV/aSzvqaR/UAHYhriJiXJtGTMpeI6m4sht0lQ6jBp7/wSaypJHvZek3LiVbpKkqPoIy3jHr9eeH3/AB5X7jJ/lgOXPxVxYbc4sC7I3oldSZ8ZJmn9K2N0X+gQqv8AixilR6oj7mJcrCqTKIt4vhLSVvR1n+c0E+j9nqB66b9oF+1G1aZbMp+ozWa/ElrQ3EeR6Jls1G4tSlIIiIkn17+eXSEGKnLWSf8A1PD8joBlValGo9LmVKWrcRobC5DyiLPJCEmpR+4jBLDNhVHsb49rCkMS6sp2uVBaj3mzd+73Jn1NtkhHYgenFw8sKrv6PwLM/gqHkv2FLqGDNbhwGXXpT1CcbaaaIzWtRs8UiLhM+oB3wmivSLefuaa2pudcspdVcSvjNtLIksN/qspbLLrzDYau9aHyjdpFv4evxn572fwqTNp8j0EBlDRnulJyRmZqJKCLdFvn+YZKTRcVZcd2Oq67Vjk6g2zeYo75ON5llukmcjLdFwln0gH4gAYwehtsNodu2+XnEpIlOHcElO7Mi3zyJWRZ8ORDGUGgLo2LbVMp9euSXDhUdcua3Pqr0ptTjrpIZI0rMyIyJt5XuAbSEIQAJeukjDvvk/YnA7AS9dJGHffJ+xOB2fFPsAcGpJHkZl7xxuk/OL3jUNn4cWjeNXvOoXBQINTlouOUyl6Qg1KJCUNZJzz4CzPeCb1GYa+xlH+h/uAcbpPzi94x9et6kXVTV0yswI8+Gs0qNp5OZbojzIy6SMugyBf1GYa+xlH+h/uMNQLQoNm40R4tv0qNTGJFuSXHW46TSlxRSmCIzLPhIjP3gM01gdhyy6hxNpU5RoMlESyUpJ5dZGoyPsMNyUhJZEZERb2XUOxjTeGeFllXRax1atW1Tp89+o1H0sh9s1LXuZrySzPPoIiL9ADcW6T84veOTWkizNRe8BvUZhr7GUf6H+4iwMw1I8/kZRvof7gPdcuJlAt9ZwWJBVatuEZR6RTjJ6U8roLcpz3Ceta8kl0mObAtqfR48+rV1bTlfrUj4VONo822SIiS2wg+lDaCJOfSe6V0jL0K1qFbDBx6HRqfS2lcZESOholdu5Is/wBIygCEIQAJeukjDvvk/YnA7Pin2AJeukjDvvk/YnA7Pin2AAeFXL3trRM8jQeAHhVy97a0TPI0HgCASRpygasStrYDsBJGnKBqxK2tgA7MBcFOYLXiVT258OjAXBTmC14lU9ufAOhCEAhCEAhCEACXrpIw775P2JwOz4p9gCXrpIw775P2JwOz4p9gAHhVy97a0TPI0HgB4Vcve2tEzyNB4AgEkacoGrEra2A7ASRpygasStrYAOzAXBTmC14lU9ufDowFwU5gteJVPbnwDoQhAIQhAIQhAAl66SMO++T9icDs+KfYAl66SMO++T9icDs+KfYAB4Vcve2tEzyNB4AeFXL3trRM8jQeAIBJGnKBqxK2tgOwEkacoGrEra2ADswFwU5gteJVPbnw6MBcFOYLXiVT258A6EIQCEIQCEIQAJeukjDvvk/YnA7Pin2AJeukjDvvk/YnA7Pin2AAeFXL3trRM8jQeAHhVy97a0TPI0HgCASRpygasStrYDsBJGnKBqxK2tgA7MBcFOYLXiVT258OjAXBTmC14lU9ufAOhCEAhCEAhCEACXrpIw775P2JwOz4p9gCXrpIw775P2JwO+EgAPCoy9Pe2tEzyNB5mXWQBLwulR6nVJlIvi5KQ1Upa5rsaMmKpsnVERKMvSMqV/lLpHf1d3B+U+7vo4P9OAdZl1kAb+nKBqxK2tgdvV3cH5T7u+jg/wBOPTbmHjtFub5RT7prdcmJhLgtlOJgkttqWlZ5E22nfzQXCAYmAuCnMFrxKp7c+HRgLgpzBa8Sqe3PgHQhCAQhCAQhCABL10kYd98n7E4HZ8U+wBL10kYd98n7E4HZ8U+wBp+0cOLUvOr3nUbgozFRlt3FKYS68teaW0oaySWSuAszCT1FYceykH9pz7QsKuXvbWiZ5Gg8AA/UVhx7KQf2nPtDEW/aNDszGePDt+nt0+PItyS6620pW5WtMpgiMyMz3yIz942mAkjTlA1YlbWwAdmAuCnMFrxKp7c+HRgLgpzBa8Sqe3PgHQhCAQhCAQhCABL10kYd98n7E4HZ8U+wBL10kYd98n7E4HZ8U+wADwq5e9taJnkaDwA8KuXvbWiZ5Gg8AQCSNOUDViVtbAdgJI05QNWJW1sAHZgLgpzBa8Sqe3Ph0YC4KcwWvEqntz4B0IQgEIQgEIQgAS9dJGHffJ+xOB2fFPsAS9dJGHffJ+xOB2fFPsAA8KuXvbWiZ5Gg8APCrl721omeRoPAEAkjTlA1YlbWwHYCSNOUDViVtbAB2YC4KcwWvEqntz4dGAuCnMFrxKp7c+AdCEIBCEIBCEIAEvXSRh33yfsTgdnxT7AEvXSRh33yfsTgdnxT7AAPCrl721omeRoPADwq5e9taJnkaDwBAJI05QNWJW1sB2AkjTlA1YlbWwAdmAuCnMFrxKp7c+HRgLgpzBa8Sqe3PgHQhCAQhCAQhCABL10kYd98n7E4HZ8U+wBL10kYd98n7E4HZ8U+wADwq5e9taJnkaDwA8KuXvbWiZ5Gg8zIBAJI05QNWJW1sB3mQCP6coGrEra2ADswFwU5gteJVPbnw6MBcFOYLXiVT258A6EIQCEIQCEIQAJeukjDvvk/YnA74SArEmBOZXQLopsJ+oP2/POS7Ejp3Tr0ZxpbTpNp/wAyySvdkXTuMi3zH2hYv2BOYJ1F4URrfyU3JlJYcQfSSkLMlJMuoyIwHhPDKpxKnVJdFvquUhmpzFznYrEeK4hLqySSjI3GlKy+5LezHf5BXX+VK4/3KB/IGS9adh+2lufWTP2hetOw/bS3PrJn7QDG/IK6/wAqVx/uUD+QPRbmH0ukXR8o6pddWrsxMJcBspbMdtKG1OIWeXom05nmguEer1p2H7aW59ZM/aF607D9tLc+smftAFBgLgpzBa8Sqe3PjJetKwz3vlpbn1kz9oYrA55uRh3GeZcQ605PqK0LQeaVJOa+ZGR9JGQB6IQgEIQgEIQgH//Z',
      defaults: {
        jointStyle: 'mitre',         // ALWAYS mitred — overrides global butt default
        cutAllowanceMm: 30,          // W+30 / H+30 instead of global +200mm
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        { id: '12x237_tropical_5850',          colour: 'Tropical',                colourFamily: 'plain',         lengthMm: 5850, priceExBar: 28.62, priceExPerMeter: 4.892, sku: '1292370005850', availability: 'available',    stockQty: 56 },
        { id: '12x237_cream_6000',             colour: 'Cream',                   colourFamily: 'plain',         lengthMm: 6000, priceExBar: 29.35, priceExPerMeter: 4.892, sku: '128237',        availability: 'available',    stockQty: 22 },
        { id: '12x237_aludec_jetblack_6000',   colour: 'Aludec Jet Black',        colourFamily: 'aludec',        lengthMm: 6000, priceExBar: 52.57, priceExPerMeter: 8.762, sku: '121237204',     availability: 'available',    stockQty: 93 },
        { id: '12x237_turneroak_toffee_6000',  colour: 'Turner Oak Toffee',       colourFamily: 'turner_oak',    lengthMm: 6000, priceExBar: 52.57, priceExPerMeter: 8.762, sku: '121237222',     availability: 'available',    promo: true, stockQty: 52 },
        { id: '12x237_turneroak_malt_6000',    colour: 'Turner Oak Malt',         colourFamily: 'turner_oak',    lengthMm: 6000, priceExBar: 52.57, priceExPerMeter: 8.762, sku: '120237219',     availability: 'available',    stockQty: null },
        { id: '12x237_sheffield_concrete_6000',colour: 'Sheffield Oak Concrete',  colourFamily: 'sheffield_oak', lengthMm: 6000, priceExBar: 52.57, priceExPerMeter: 8.762, sku: '121237221',     availability: 'coming_soon', stockQty: null },
        { id: '12x237_turneroak_walnut_6000',  colour: 'Turner Oak Walnut',       colourFamily: 'turner_oak',    lengthMm: 6000, priceExBar: 52.57, priceExPerMeter: 8.762, sku: '121237235',     availability: 'available',    stockQty: null },
        { id: '12x237_aludec_monument_6000',   colour: 'Aludec Monument®',        colourFamily: 'aludec',        lengthMm: 6000, priceExBar: 52.57, priceExPerMeter: 8.762, sku: '121237273',     availability: 'available',    stockQty: 69 },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 50mm FLANGE — Aluplast 12x102. Same clip-in concept as flange30 but
    // wider body. CUT MATH: cutAllowanceMm = 50 (W+50/H+50), jointStyle =
    // mitre (45°). TRIM_DICTIONARY '50 FL' code links here. 6 SKUs.
    // Two-tier pricing — Tropical (plain) at $59.83; decorative finishes
    // at ~$99.57-102.12.
    // ─────────────────────────────────────────────────────────────────────
    flange50: {
      productCode: '12x102',
      description: 'Aluplast Flange 50x12mm (clip-in)',
      crossSection: { widthMm: 50, thicknessMm: 12 },
      profileShape: 'flange',
      supplier: 'Aluplast',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 50,          // W+50 / H+50 per Phoenix's spec
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        { id: '12x102_tropical_5850',          colour: 'Tropical',           colourFamily: 'plain',      lengthMm: 5850, priceExBar:  59.83, priceExPerMeter: 10.227, sku: '1291020985850', availability: 'available',    stockQty: 56 },
        { id: '12x102_turneroak_toffee_6000',  colour: 'Turner Oak Toffee',  colourFamily: 'turner_oak', lengthMm: 6000, priceExBar: 102.12, priceExPerMeter: 17.020, sku: '1211022220098', availability: 'available',    promo: true, stockQty: 52 },
        { id: '12x102_turneroak_malt_6000',    colour: 'Turner Oak Malt',    colourFamily: 'turner_oak', lengthMm: 6000, priceExBar: 102.12, priceExPerMeter: 17.020, sku: '1201022190098', availability: 'available',    stockQty: 43 },
        { id: '12x102_turneroak_walnut_5850',  colour: 'Turner Oak Walnut',  colourFamily: 'turner_oak', lengthMm: 5850, priceExBar:  99.57, priceExPerMeter: 17.020, sku: '1291022355850', availability: 'available',    stockQty: null },
        { id: '12x102_aludec_monument_5850',   colour: 'Aludec Monument®',   colourFamily: 'aludec',     lengthMm: 5850, priceExBar:  99.57, priceExPerMeter: 17.020, sku: '1291022735850', availability: 'coming_soon', stockQty: 69 },
        { id: '12x102_aludec_jetblack_6000',   colour: 'Aludec Jet Black',   colourFamily: 'aludec',     lengthMm: 6000, priceExBar: 102.12, priceExPerMeter: 17.020, sku: '1211022040098', availability: 'available',    stockQty: null },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // ARCHITRAVES — primed timber profiles, sold in bar lengths, painted/
    // stained on-site (no per-colour SKUs like the PVC cover-trims).
    // Settings → Catalogs → Architraves picks this up via familyKey
    // 'architraves'. Cross-section codes follow the standard SB/LT/BN/COL
    // convention (Single Bevel, Lambs Tongue, Bullnose, Colonial).
    //
    // CUT MATH: standard 200mm allowance applies (W+200 / H+200) — same as
    // cover trims. Joint style mitre 45° (architraves are always mitred at
    // corners). Editable per family via the Settings UI.
    // ─────────────────────────────────────────────────────────────────────
    architraves44SB: {
      productCode: 'ARCH-44x18-SB',
      description: 'Primed Timber Architrave 44x18mm Single Bevel',
      crossSection: { widthMm: 44, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',         // architraves always mitre at corners
        cutAllowanceMm: 200,         // standard W+200 / H+200
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,    // architraves go around all 4 sides for windows; doors typically 3-side
      },
      items: [
        // Code '44x18 SB' — Phoenix's first architrave drop. Nominal 44mm
        // finished width (some suppliers spec it as 42mm post-bevel —
        // tolerance varies). 18mm thickness, 5400mm bar. Single bevel
        // profile (standard Australian architrave style). Price TBD —
        // surveyor / settings UI to populate before quotes go out.
        {
          id:           'arch_44x18sb_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '44x18 SB',          // matches TRIM_DICTIONARY entry
          lengthMm:     5400,                  // 5.4m bars
          priceExBar:   0,                     // TBD — Phoenix to set in Settings
          priceExPerMeter: 0,
          sku:          '44x18-SB-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // ─────────────────────────────────────────────────────────────────────
    // 66x18 SB ARCHITRAVE — primed timber, 5.4m bars, single-bevel.
    // Wider profile than 44x18 — used where a heavier visual weight is
    // wanted at the opening edge (often around larger windows or doors).
    // Same supplier conventions as 44x18 (paint-grade primed pine, mitred
    // at corners). Settings UI shows this stacked under the 44x18 card on
    // the Architraves tab. Cut math + joint default identical (200mm allow,
    // mitre 45°), editable per family.
    // ─────────────────────────────────────────────────────────────────────
    architraves66SB: {
      productCode: 'ARCH-66x18-SB',
      description: 'Primed Timber Architrave 66x18mm Single Bevel',
      crossSection: { widthMm: 66, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'arch_66x18sb_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '66x18 SB',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '66x18-SB-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 92x18 SB ARCHITRAVE — primed timber, 5.4m bars, single-bevel.
    // Widest in Spartan's standard SB range. Used around larger openings
    // for visual proportion. Same conventions as 44/66 SB (paint-grade
    // primed pine, mitred at corners, 200mm cut allowance).
    architraves92SB: {
      productCode: 'ARCH-92x18-SB',
      description: 'Primed Timber Architrave 92x18mm Single Bevel',
      crossSection: { widthMm: 92, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'arch_92x18sb_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '92x18 SB',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '92x18-SB-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 66x18 LT ARCHITRAVE — primed timber, 5.4m bars, lambs-tongue profile.
    // Lambs Tongue is the curved/ogee-style edge (heritage Australian look).
    // Note: Spartan does NOT stock 44x18 LT — Lambs Tongue starts at 66mm
    // width. The corresponding dictionary code is removed accordingly.
    architraves66LT: {
      productCode: 'ARCH-66x18-LT',
      description: 'Primed Timber Architrave 66x18mm Lambs Tongue',
      crossSection: { widthMm: 66, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'arch_66x18lt_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '66x18 LT',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '66x18-LT-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 92x18 LT ARCHITRAVE — primed timber, 5.4m bars, lambs-tongue profile,
    // widest size in the LT range. Same conventions as 66 LT.
    architraves92LT: {
      productCode: 'ARCH-92x18-LT',
      description: 'Primed Timber Architrave 92x18mm Lambs Tongue',
      crossSection: { widthMm: 92, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'arch_92x18lt_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '92x18 LT',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '92x18-LT-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 66x18 BN ARCHITRAVE — primed timber, 5.4m bars, bullnose profile
    // (curved single edge). Note: Spartan does NOT stock 44x18 BN —
    // Bullnose starts at 66mm width. Dictionary code removed accordingly.
    architraves66BN: {
      productCode: 'ARCH-66x18-BN',
      description: 'Primed Timber Architrave 66x18mm Bullnose',
      crossSection: { widthMm: 66, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'arch_66x18bn_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '66x18 BN',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '66x18-BN-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 92x18 BN ARCHITRAVE — primed timber, 5.4m bars, bullnose profile
    // (curved single edge). Same shape as 66x18 BN, wider face (92mm).
    // Profile image reuses the 66 BN bullnose asset rendered slightly
    // larger to visually distinguish from the 66 variant in catalog UI.
    architraves92BN: {
      productCode: 'ARCH-92x18-BN',
      description: 'Primed Timber Architrave 92x18mm Bullnose',
      crossSection: { widthMm: 92, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'arch_92x18bn_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '92x18 BN',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '92x18-BN-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 66x18 COL ARCHITRAVE — primed timber, 5.4m bars, Colonial profile
    // (multi-step traditional moulding with stacked beads/coves). First
    // Colonial entry; 92 COL and 44 COL still placeholder dict codes only.
    architraves66COL: {
      productCode: 'ARCH-66x18-COL',
      description: 'Primed Timber Architrave 66x18mm Colonial',
      crossSection: { widthMm: 66, thicknessMm: 18 },
      profileShape: 'architrave',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'arch_66x18col_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '66x18 COL',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '66x18-COL-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 18x18 PRIMED QUAD — primed pine quarter-round beading, 5.4m bars.
    // First Quad/Beading entry; smaller decorative trim used in scotia/
    // bead applications. Routes to its own Settings → Catalogs → Quads
    // tab via the 'quads' family-key prefix.
    quads18: {
      productCode: 'BEAD-18x18-Q',
      description: 'Primed Pine Quad 18x18mm',
      crossSection: { widthMm: 18, thicknessMm: 18 },
      profileShape: 'quad',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'bead_18q_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '18 Q',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '18-Q-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 12x12 PRIMED QUAD — primed pine quarter-round beading, 5.4m bars.
    // Smaller variant of the 18 Q profile (same quarter-round shape).
    // Profile image reuses the 18 Q quarter-round asset rendered with
    // extra padding so the 12mm quad reads visually smaller than the
    // 18mm in the Settings catalog stack.
    quads12: {
      productCode: 'BEAD-12x12-Q',
      description: 'Primed Pine Quad 12x12mm',
      crossSection: { widthMm: 12, thicknessMm: 12 },
      profileShape: 'quad',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'bead_12q_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '12 Q',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '12-Q-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 18x18 PINE TRI QUAD — primed pine triangular quad, 5.4m bars.
    // Variant of the standard Quad with a STRAIGHT hypotenuse (vs the
    // curved quarter-round of quads18). Same 18×18 bounding box, different
    // profile — used where a sharper line is preferred over a soft round.
    quads18Tri: {
      productCode: 'BEAD-18x18-TQ',
      description: 'Primed Pine Tri Quad 18x18mm',
      crossSection: { widthMm: 18, thicknessMm: 18 },
      profileShape: 'quad',
      supplier: 'Various (primed pine)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'bead_18tq_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: '18 TQ',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '18-TQ-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 42x19 HW — Tasmanian Oak DAR (Dressed All Round) hardwood, 5.4m bars.
    // First hardwood entry — natural finish, stain-grade. Distinct material
    // from primed pine architraves: priced higher, stained not painted, used
    // where exposed timber is the design intent. Routes to Settings →
    // Catalogs → Hardwood tab via the 'hardwood' family-key prefix.
    hardwood42: {
      productCode: 'HW-42x19-DAR',
      description: 'Tas Oak Hardwood DAR 42x19mm',
      crossSection: { widthMm: 42, thicknessMm: 19 },
      profileShape: 'hardwood',
      supplier: 'Various (Tasmanian Oak DAR)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'hw_42x19_5400',
          colour:       'Tas Oak (natural)',
          colourFamily: 'hardwood',
          dictionaryCode: '42x19 HW',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '42x19-HW-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 65x19 HW — Tasmanian Oak DAR (KD Select grade), 5.4m bars.
    // Mid-width hardwood section, common architrave/skirting size.
    hardwood65: {
      productCode: 'HW-65x19-DAR',
      description: 'Tas Oak Hardwood DAR 65x19mm KD Select',
      crossSection: { widthMm: 65, thicknessMm: 19 },
      profileShape: 'hardwood',
      supplier: 'Various (Tasmanian Oak DAR, KD Select)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'hw_65x19_5400',
          colour:       'Tas Oak (natural)',
          colourFamily: 'hardwood',
          dictionaryCode: '65x19 HW',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '65x19-HW-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 90x19 HW — Tasmanian Oak DAR (KD Select grade), 5.4m bars.
    // Widest hardwood architrave section in this catalog — equivalent to
    // 92×18 SB in the primed range, used where a substantial timber face
    // is the design intent.
    hardwood90: {
      productCode: 'HW-90x19-DAR',
      description: 'Tas Oak Hardwood DAR 90x19mm KD Select',
      crossSection: { widthMm: 90, thicknessMm: 19 },
      profileShape: 'hardwood',
      supplier: 'Various (Tasmanian Oak DAR, KD Select)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'hw_90x19_5400',
          colour:       'Tas Oak (natural)',
          colourFamily: 'hardwood',
          dictionaryCode: '90x19 HW',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '90x19-HW-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 110x19 HW — Tasmanian Oak DAR (KD Select grade), 5.4m bars.
    // Wide hardwood architrave / skirting board section. Largest hardwood
    // width in the catalog — used for substantial trim or as a small
    // skirting where exposed natural timber is the design intent.
    hardwood110: {
      productCode: 'HW-110x19-DAR',
      description: 'Tas Oak Hardwood DAR 110x19mm KD Select',
      crossSection: { widthMm: 110, thicknessMm: 19 },
      profileShape: 'hardwood',
      supplier: 'Various (Tasmanian Oak DAR, KD Select)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'mitre',
        cutAllowanceMm: 200,
        overhangMmPerCut: 5,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'hw_110x19_5400',
          colour:       'Tas Oak (natural)',
          colourFamily: 'hardwood',
          dictionaryCode: '110x19 HW',
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '110x19-HW-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // ════════════════════════════════════════════════════════════════════
    // REVEALS — primed pine DAR boards used as the visible inside-trim
    // collar around a window opening. Three RAW board widths supplied;
    // installer rips down to the exact width needed for each window
    // (calculation done in survey mode based on Window Depth + frame depth
    // + Reveal Type [In-Line | Stepped]). Routes to Settings → Catalogs
    // → Reveals tab via the 'reveals' family-key prefix. Cut math is
    // butt-jointed (top/bottom run full span, jambs fit between) so
    // jointStyle: 'butt' and a small allowance — the per-cut lengths are
    // computed by the reveal calculator from the dimensional formulas,
    // not from a generic mitre allowance.
    // ════════════════════════════════════════════════════════════════════
    reveals110: {
      productCode: 'REV-110x18-DAR',
      description: 'Primed Pine Reveal DAR 110x18mm (FJ Primed Untreated)',
      crossSection: { widthMm: 110, thicknessMm: 18 },
      profileShape: 'reveal',
      supplier: 'Various (Finger-Jointed Pine, primed, untreated — interior use)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'butt',
        cutAllowanceMm: 0,
        overhangMmPerCut: 0,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'rev_110x18_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: null,
          lengthMm:     5400,
          priceExBar:   0,                     // TBD
          priceExPerMeter: 0,
          sku:          '110x18-REV-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    reveals138: {
      productCode: 'REV-138x18-DAR',
      description: 'Primed Pine Reveal DAR 138x18mm (FJ Primed Untreated)',
      crossSection: { widthMm: 138, thicknessMm: 18 },
      profileShape: 'reveal',
      supplier: 'Various (Finger-Jointed Pine, primed, untreated — interior use)',
      profileImage: 'data:image/jpeg;base64,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',
      defaults: {
        jointStyle: 'butt',
        cutAllowanceMm: 0,
        overhangMmPerCut: 0,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'rev_138x18_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: null,
          lengthMm:     5400,
          priceExBar:   0,
          priceExPerMeter: 0,
          sku:          '138x18-REV-5400',
          availability: 'available',
          stockQty:     null,
        },
      ],
    },

    // 185 REVEAL — CUSTOM ORDER. Not held in stock; requires advance
    // order from supplier. The reveal-pick logic in survey mode (when
    // wired) MUST surface this flag on the cutting list / production
    // brief whenever this SKU is selected, so workshop knows to order
    // before scheduling. Family-level isCustomOrder: true drives the
    // 'CUSTOM ORDER' badge in Settings → Catalogs → Reveals.
    reveals185: {
      productCode: 'REV-185x18-DAR',
      description: 'Primed Pine Reveal DAR 185x18mm (FJ Primed Untreated) — CUSTOM ORDER',
      crossSection: { widthMm: 185, thicknessMm: 18 },
      profileShape: 'reveal',
      supplier: 'Various (Finger-Jointed Pine, primed, untreated — interior use)',
      isCustomOrder: true,
      profileImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAEoAWgDASIAAhEBAxEB/8QAGwABAQADAQEBAAAAAAAAAAAAAAECAwUEBgj/xAAzEAEBAAEDBAAEBQIEBwAAAAAAAQIDETEEIUFxMjNRYRJCcoGRE7EFIiOhFBVSYsHw8f/EABgBAQEBAQEAAAAAAAAAAAAAAAABBAID/8QAHBEBAAIDAQEBAAAAAAAAAAAAAAExAwQRQQIh/9oADAMBAAIRAxEAPwD9UgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADXn1GlhznP27tWXXYz4cbffYHpHgz6zWvH4cfUass88/izyv7g6GfUaWn8Wc/buObMPEAdYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgAa8uo0sOc5fXdqy66T4cLfYPScPDl1erlxZjPtGnLLLP4srl7oOhl1OlhznN/pO7Vl12P5cLffZ42eOlnl429gzy6vVy4sx9Rqyzyz+LLK+62zp/rkzmjhj439g88lvaTdlNHO+Nvb0ybcCdVpx6f65fwzmlhj439swE2+wopx6QBAAAAAAAAAAAAAAAAAAAAAC3bkAa8up0sfzy36Tu1ZdbPy4W+6D0lsnLw5dVq5eZj6jVllcvitvsHvy6jSw5zl9d2rLrZ+XC/u8jKaeV4xoNmXVauXmY+o1ZZXL4srfdbJoW81smhhOe/sHm2ZTSzs+F6pJOJsJ0aP8Ah75rLHQwnMtv3bQExxmPEkXYAAAQWoKbibbqAAD0gKgAAAAAAAAAAAABbJz2AGrLqtLH88t+k7tWXXT8uFvsHqLduXhy6rVy8zH1Gq5ZZfFbfdB78uo08ecpfXdqy62flxt9vIsxyy4lorbl1Wrl5mPqNdyuXfK2+2c0bedoymjjOd6I07LMMrxjXomOM4kUGiaGXmyM5o4zm2tgimOOM4kUgIAAAAAAAAAAVFqCwAAAA9ICoAAAAAWycgDXn1OlhznL67tOfXyfBhb7B6i3bl4Mur1cvMx9Rqyzyz+LK32DoZdRpY85y+u7Vn10nw4W+3j4Xa5cS1Ojdl1erlxZj6jTlbl3yyt9s5o53naM5oTzRWnZZjbxLXox08ceJGQjRNHK/SM5oSc21sAYzDGcSMgUAAAEkABVgQEAAAAAAAAAASi7HAIAKAA9IW7Td4/+Z6eXy8bffY7Ccewtk5c/Lq9XLzMfUarnlnf82VvtR0c+p0sOc5b9u7Vl10/Lhb7eJeeJug3ZdXq5cWYz7NWWWWXe5W+6swyvjb2zmjPNBqMZbxK344YzwzmwrRNLK/ZnNCecr+zYojHHTwx8fyz22SHoFN0m/ldoKACAAACgAAASACKsEUQAAAAAAAoG4gLxdyoCAAoAD0Z/Bl6fOyyzbjvv/D6LP4L6fN5S4ybbcXv/ALM2x49sPq/1NbSs/DbZ5l4e7p5lq6OGd5ym+0c+5zK889//AA6nT/I09uPwucH1MzMLliOdZzCfRltPoitTOmzJF5FFibLFAL9iAqxFgQAAACAAACgAAASACKRSAgAAABSCAqVaAigCC8gILUFAAejL4b6fOWyTvdtn0mXFfNXGf5d5x4Ztnx7YfWGGMv4bPEs/d1+mm3T6c+zkYTeYW897s6/TfI0/TjXuXWamzsoNjOgqAsqpwS7gsUBCKkUUAAAEAAAFAAAAkBURVgQEAAAADyAAAAAAAFRSggsgD0Xivm9rvvf2fR5cV87nO9v/ALyzbPj2w+sbh3ln0sdTp7/o4enOx79/tu6PT/Iw9Ode5dZabQg1s4bhsKjKIvgFAEIqRRQAAAQAAAUAAAAAEVYEBAAAAAAAAAAAAAoUEAFem8V85ne2X07R9HeHzmp8Fv1Z9nx7YfV2727bTh0On+Th6eCXvZfD39Pv/Sx9OMFyuWm3wqRWtnAgKKKEgAhFSKKAAACABAAKAACxAkAVFIAIAAAAAAAAAAAAAAAA9F4fOZz1e9nt9HeHz+U3/as+x49sPqT+9dDp/lY37OdO9/d0dD5WPpzr3LrLTbKborU8CAAvhQEAAIqRRQAAAQAAAUAAFiLCQ2ARQAQAAAAAAAAAAF5ZTTyvPYGCyW8RtmnjOe7IGuaX1o2C8B87Zvl+GTivonz2XNs+rNsePbD6x59R0tD5WPpzcPG2/Dp6HysPTjXuXWWmwBrZwAVkIogABFSKKAAACAAACgAAsRYSsACAAIAAAAAslvEFQbJpW89mcwk8CNUwt8M5pTzWYvAkk4gAAAAAD57Usm+31fQvntX4rN+KzbNQ9sPqY9vpO0mzpaHysfTmznt/8dLp/k4enGvcus1NgDWzgAoyYrAUAQi27IosJFAAAQAAAUAAFiLBYAEAAAWY28RnNL60GtlNPK+G2YzHiKcRhNKTnuzk24BQAAAAAAAAAAfO5b/iy/Vvf5fRPn8+2eX13u38s2x49sPrDizvzXT6f5OH6Y5ss3njvXT0PlYfpjjXuXWamYG7WzioCqEUQAAipFFgAAAEAAAFAABYjLHDK+ARZN+GyaUnN3ZyScROL1qmnbz2ZzTxn3ZCoAAAAAAAAAAAAAAAAPn9TL/Uy+kr6Cvn9XeZZdpzWbYqHthuWO0u30kdPQ+Vh6jl45bSTve2+7qaE20cP0xxr3LrNTM8g1s4UKKsVjyyEAAFRRQAAAQAAGeOnlfszx0sZz3Bqkt4m7OaNvN2bZNhRJhjPCgAAAAAAAAAAAAAAAAAAAAA4GtJLlfvXfr57Vu+dx3/ADX+7NsVD2w2km1u08Ts6mj8rD9McvDvl/s6eh8rD9Mc69yuWmYDU8BdiAooCAAC7JFFAk34Z46VvPYGCzDLLiN2OnjPG/tkI1zR/wCq/wAM5jMeIooAAAAAAAAAAAAAAAAAAAAAAAAAAV89qdta/qv930NcDX7Z39VZtiPyHthuWvD/AC9+93dXRm2lhP8AtjmYdsZPMdPS+Vh+mOdeP2XWWmdQGpnWAChEZY43LiWgDZjoX81/htxwxx4gjRjp5ZeNvbZjoyc92wXgSSdpNgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHzuvlZq52eLl/d9E5fV/wCFZ/iy1NG/j3u/4by8M/zP1H49cX1ET+vBjl+KY2ed9nV0flYeo5Mxyw1NssbPwyz8Nmzq6HycP0x569y7y1DPyMsdPLLiNuPTz8139NTO089meOjleezfMcceJIpwa8dHGc9/bZJtwCgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADXrdNpa8n9TCWzi+YunoYaeMxxnaTabgnIs6zAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf/9k=',
      defaults: {
        jointStyle: 'butt',
        cutAllowanceMm: 0,
        overhangMmPerCut: 0,
        wastagePct: 5,
        offcutKeepMinMm: 200,
        doorBottomDefault: false,
      },
      items: [
        {
          id:           'rev_185x18_5400',
          colour:       'Primed (paint-grade)',
          colourFamily: 'primed',
          dictionaryCode: null,
          lengthMm:     5400,
          priceExBar:   0,
          priceExPerMeter: 0,
          sku:          '185x18-REV-5400',
          availability: 'custom-order',
          stockQty:     null,
        },
      ],
    },
  },

  markups: {
    // Price lists — markup applied to the FULL cost price (material + labour
    // + install) to generate the sell price shown to each customer class.
    // Installation is now INCLUDED in this markup chain so Retail 80% really
    // means 80% on the whole line, not just the factory portion.
    priceLists: [
      { id:'trade', name:'Trade', pct:30 },
      { id:'standard', name:'Standard Builder', pct:50 },
      { id:'retail', name:'Retail', pct:80 },
      { id:'melbourne', name:'Melbourne', pct:55 },
      { id:'canberra', name:'Canberra', pct:60 },
    ],
    // Category markups — applied to each category of material cost BEFORE
    // the price-list markup. Use these to take margin on specific inputs
    // (e.g. 25% on hardware because Siegenia is a high-margin line).
    // Default 0% means transparent pass-through at supplier cost.
    materialMarkup:      15,  // uPVC profiles (frame, sash, mullion, threshold, cover, guide rail)
    steelMarkup:         15,  // galvanised steel reinforcement
    glassMarkup:         15,  // IGU glass
    hardwareMarkup:      25,  // Siegenia hardware sets (door + window)
    beadMarkup:          15,  // glazing beads (grouped with profiles but priced separately)
    gasketMarkup:        15,  // EPDM gaskets
    ancillaryMarkup:      0,  // reveals, sills, fixings, delivery
    installationMarkup:  20,  // on-site labour — applied BEFORE price-list markup
    // Overhead was previously applied twice (via station rate ×1.22 AND here
    // ×1.12). It is now applied ONCE via station overheadMultiplier. This
    // field is kept at 0 for backward-compat; do not restore without auditing.
    overheadPct: 0,
  },
};

// ═══ SPARTAN TERMS & CONDITIONS — verbatim from production quote template ═══
const SPARTAN_TC_TEXT = `I/Spartan Double Glazing Pty Ltd - GENERAL CONDITIONS OF CONTRACT

Payment Terms
5% Initial Deposit
45% on Check Measure
45% Pre-Delivery
5% on Completion

Initial Deposit (5%)
The Owner shall pay Spartan Double Glazing an initial deposit of 5% of the Contract Price upon acceptance of the Contract. This payment is due prior to the Technical Survey.

Check Measure (45%)
Upon completion or prior to the Technical Survey, Spartan Double Glazing will issue a progress payment claim for 45% of the Contract Price. The Owner shall make this payment at the time of completion of measure. Dates of deliveries are not confirmed until this payment is made. You will not be placed in que until this payment is finalised.

Pre-Delivery (45%)
The Owner shall make a further progress payment of 45% of the Contract Price, 7 business days prior to the scheduled installation date. Spartan Double Glazing will issue a progress payment claim for this amount, and the Owner must make the payment within the specified timeframe.

Completion (5%)
Upon successful completion of the installation, Spartan Double Glazing will issue a final claim for the remaining 5% of the Contract Price. The Owner shall make this payment on receipt of the invoice.

[[BANK_DETAILS]]

All payments shall be made in the form of electronic bank transfer to the account specified by Spartan Double Glazing. The Owner is responsible for ensuring that all payments are made by the due dates specified in each payment stage. Failure to make timely payments may result in delays to the project and could lead to termination of the Contract as well costs up to date of termination.

Please note that the payment schedule is subject to the provisions outlined in the Contract, and any deviations or variations from the agreed payment stages must be documented and mutually agreed upon by both parties in writing.

Payment and Warranty Terms and Conditions

1. Late Payment Consequences: In the event that any amount due under the terms of our agreement remains unpaid for 20 days following the due date, such overdue amount will be subject to immediate referral to our designated collections agency. The client acknowledges and agrees that late payment may trigger additional collection fees and interest charges, for which the client will be fully responsible.

2. Impact on Warranties and Guarantees: Please be advised that failure to comply with the payment terms as stipulated may result in the suspension or voiding of any warranties and guarantees provided by Spartan Double Glazing in relation to our products and services. This includes, but is not limited to, guarantees regarding the durability, maintenance, and performance of our window systems.

3. Recovery of Overdue Payments: Any expenses, including but not limited to legal fees, administrative costs, and collection agency fees, incurred by Spartan Double Glazing in the process of recovering overdue payments, will be borne by the client. The client hereby agrees to indemnify Spartan Double Glazing for all such costs.

4. Payment Terms Agreement: By engaging with Spartan Double Glazing for services and products, the client agrees to adhere to the payment terms as outlined in our individual contracts and invoices. It is the client's responsibility to ensure timely and full payment to avoid any adverse effects on their account and the services provided.

5. Further Information and Assistance: Clients are encouraged to refer to our full terms and conditions for more detailed information. If there are any questions or concerns regarding these payment and warranty terms, clients are invited to contact our customer service team for assistance or contact their project manager for more information.

1. APPROVALS
1.1 Spartan Double Glazing will take all necessary steps to obtain all required approvals, consents, or permits (including building permits, planning permits, or owners' corporation consent) for the Works. Spartan Double Glazing will provide written evidence of such approvals, consents, or permits upon request.
1.2 If any necessary approval, consent, or permit has not been obtained within 60 days of the signing of this Contract, Spartan Double Glazing may terminate the Contract by written notice.
1.3 If Spartan Double Glazing terminates the Contract under clause 1.2, the Owner must pay Spartan Double Glazing a reasonable sum for services performed and expenses incurred up to the date of termination.

2. THE SITE
2.1 The Owner must ensure that Spartan Double Glazing and its agents and subcontractors are granted unrestricted and uninterrupted access to the Site from Commencement, and that access is not restricted in any way throughout the performance of the Works. The Owner must also ensure that there is sufficient clear space around the Site for the performance of the Works.

3. COMMENCEMENT AND COMPLETION
3.1 Spartan Double Glazing will do everything reasonably possible to ensure that the Works commence within 14 days of the Owner providing: (a) satisfactory evidence of the Owner's capacity to pay the Contract Price; and (b) written evidence of any approvals, consents, or permits requested by Spartan Double Glazing.
3.2 The Construction Period commences on the date the Works commence.
3.3 Spartan Double Glazing will complete the Works by the Completion Date.

4. SPARTAN DOUBLE GLAZING'S OBLIGATIONS
4.1 Spartan Double Glazing gives the Owner the following guarantees contained in sections 8 and 20 of the Act:
(a) Spartan Double Glazing will carry out the Works in a proper and workmanlike manner and in accordance with the Plans and Specifications set out in the Contract.
(b) Materials supplied by Spartan Double Glazing for use in the Works will be good and suitable for the purpose for which they are to be used, and unless otherwise stated in the Contract, those materials will be new.
(c) Spartan Double Glazing will carry out the Works in accordance with all laws and legal requirements, including, without limiting the generality of this guarantee, the Building Act 1993 and the regulations made under that Act.
(d) Spartan Double Glazing will carry out the Works with reasonable care and skill and will achieve Completion by the date (or within the period) specified in the Contract.
(e) If the Works consist of the erection or construction of a home or work intended to renovate, alter, extend, improve, or repair a home to a stage suitable for occupation, Spartan Double Glazing will carry out the Works so the home will be suitable for occupation at the time the Works achieve Completion.
(f) If the Contract states the particular purpose for which the Works are required, or the result which the Owner wishes the Works to achieve, so as to show that the Owner relies on Spartan Double Glazing's skill and judgment, Spartan Double Glazing warrants that the Works, including any materials used, will be reasonably fit for that purpose or be of such a nature and quality as they might reasonably be expected to achieve that result.
(g) Any prime cost item or provisional sum included by Spartan Double Glazing in the Contract has been calculated with reasonable care and skill, taking into account all information reasonably available at the date the Contract was made, including the nature and location of the land.

4.2 10-year Materials Guarantee: Spartan Double Glazing will, at its own cost, rectify or replace any defective materials supplied under the Contract within 10 years of completion, provided the Owner notifies Spartan Double Glazing within 30 days of the defect first appearing. Notification shall be sent to the address for Spartan Double Glazing shown below. This guarantee covers UPVC materials only.
orders@spartandoubleglazing.com.au

4.3 10-year Non-Condensation Guarantee: Spartan Double Glazing will, at its own cost, rectify any condensation appearing within 10 years of completion within double-glazed units supplied under the Contract and caused by any defective materials or workmanship supplied by Spartan Double Glazing, provided the Owner notifies Spartan Double Glazing within 30 days of the condensation first appearing. Notification shall be sent to the address for Spartan Double Glazing shown below.

4.4 10-year Workmanship Guarantee: Spartan Double Glazing will, at its own cost, rectify or replace any defect caused by workmanship under the Contract within 10 years of completion, provided the Owner notifies Spartan Double Glazing within 30 days of the defect first appearing. Notification shall be sent to the address for Spartan Double Glazing shown below.

4.5 Exclusion: Any product defect caused by house movement. As this is out of Spartan Double Glazing's control, any corrective action, work, or replacement product will be subject to Spartan Double Glazing's standard call-out charge and relevant product charge prevalent at the time.

4.6 The benefits given by the above guarantees are in addition to other rights and remedies of the Owner under the law in relation to the goods or services to which the guarantee relates, and are only applicable if all contracted payments have been met when payment falls due. In the event that payments are not met and paid in full, the guarantee will revert to standard consumer statutory rights.

4.7 Spartan Double Glazing's goods come with guarantees that cannot be excluded under the Australian Consumer Law. The Owner is entitled to a replacement or refund for a major failure and for compensation for any other reasonably foreseeable loss or damage. All payments of compensation will be assessed in line with betterment guidelines.

4.8 Spartan Double Glazing will give the Owner written progress payment claims upon completion of the stages set out in the Progress Payments Table and a written final claim at Completion.

4.9 (a) Spartan Double Glazing does not guarantee that existing flyscreens, blinds, curtains, and shutters will fit once the installation is completed. (a) Glass defects will be determined in accordance with the Australian Glass & Window Association guidelines. (b) All projects are installed according to the Spartan Double Glazing installation procedure guidelines laid out in the TSR (Technical Survey Report).

5. OWNER'S OBLIGATIONS
5.1 The Owner will pay Spartan Double Glazing the Contract Price in accordance with this Contract.
5.2 The parties agree that the progress payments fixed by section 40 of the Act do not apply, and that the Owner will make progress payments to Spartan Double Glazing in accordance with the Progress Payments Table.
5.3 The Owner will make:
(a) each Progress Payment within 7 days of receiving a Progress Claim;
(b) the Final Payment within 7 days of receiving the Final Claim; and
(c) once an installation date has been agreed, the progress payment schedule dates are then fixed, and the 45% stage payment for Delivery becomes due on that date. Should the Customer wish to delay the installation, for whatever reason, the progress payment is still payable based on the originally agreed installation date. Furthermore, Spartan Double Glazing reserves the right to charge the customer a weekly storage charge of a minimum of $100 per week, depending on the number of items, until the installation does take place.
5.4 If the Owner fails to make any payment by the due date under this Contract, Spartan Double Glazing will be entitled to interest on the outstanding amount from the due date at the rate prescribed from time to time under the Penalty Interest Rates Act 1983 (Vic).
5.5 The Owner warrants that any information supplied to Spartan Double Glazing under this Contract, including any plan, is accurate and correct and may be relied on by Spartan Double Glazing in carrying out the Works.
5.6 The Owner is responsible for all delays due to third-party works delaying the installation of Spartan Double Glazing products. In the event that an additional visit is required, the full contracted balance falls due. Any additional visits will be quoted, and a new contract will be formed.
5.7 The owner is responsible for the removal of blinds, shutters, flyscreens, ornamentation, and furnishings from all apertures. In the event that Spartan Double Glazing operatives have to remove any of the above items, this is at the owner's discretion and risk. Spartan Double Glazing does not guarantee that these items will not be damaged.

6. VARIATIONS BY THE OWNER
6.1 If the Owner wishes to vary the Plans or Specifications, then the Owner will give Spartan Double Glazing a written notice describing the variation requested.
6.2 If the Owner gives Spartan Double Glazing a written notice under clause 6.1, then Spartan Double Glazing will give the Owner a written notice that either:
(a) states that Spartan Double Glazing refuses to or is unable to carry out the variation and the reason for that inability or refusal; or
(b) states that Spartan Double Glazing will carry out the variation, and if so, Spartan Double Glazing will, in the notice: State the effect the variation will have on the Works as a whole; State whether or not an amendment to any permit will be required; Give a reasonable estimate of any delay in reaching Completion; State the cost of the variation; and State the effect of that cost on the Contract Price.
6.3 Spartan Double Glazing will not commence any variation requested by the Owner unless the Owner has given Spartan Double Glazing a signed written request or email for the variation, and that written request is attached to the notice required from Spartan Double Glazing under Clause 6.3.
6.4 If any variation agreed to be carried out by Spartan Double Glazing under Clause 6.3 or agreed to by the Owner under Clause 7.2 should result in a decrease in the Contract Price, the amount of the variation will be deducted by Spartan Double Glazing from the next progress claim or the final claim (whichever is applicable), unless otherwise agreed.
6.5 Whenever Spartan Double Glazing has, under Clause 6.3 or 7.2, accepted an obligation to carry out a variation, then the Owner hereby agrees to pay Spartan Double Glazing:
(a) the agreed variation price; or
(b) if the variation falls within Clause 6.2 and no price had been agreed for the variation, the documented cost of carrying out the variation plus 15% of that cost for Spartan Double Glazing's margin, less
(c) any deposit that the Owner has already paid in respect of that variation.

7. VARIATIONS BY SPARTAN DOUBLE GLAZING
7.1 If Spartan Double Glazing wishes to vary the Plans or Specifications, then Spartan Double Glazing will give the Owner a written notice that: (a) Describes the variation; and (b) States why Spartan Double Glazing wishes to make the variation; and (c) Provides the information required in the notice under Clause 6.2(b).
7.2 Spartan Double Glazing will not give effect to any variation requested by the Owner unless either:
(a) The Owner has given Spartan Double Glazing a signed consent, or written consent which can be in the form of an email, letter, or fax, to the variation attached to a copy of the notice required by Clause 7.1; or
(b) The following circumstances apply: A building surveyor or other authorized person under the Building Act 1993 issued a building notice or order under the Act requiring the variation to be made; and The variation arose as a result of circumstances beyond Spartan Double Glazing's control; and Spartan Double Glazing has given the Owner a copy of the building notice or building order, with the notice required by Clause 7.1; and The Owner does not notify Spartan Double Glazing in writing within 5 business days of receiving the notice required by Clause 7.1 that the Owner wishes to dispute the building notice or building order.

8. DELAYS AND EXTENSION OF TIME CLAIMS
8.1 If the progress of the Works is delayed by any variation, any industrial action, inclement weather, or any condition as a result of inclement weather in excess of Spartan Double Glazing's reasonable allowance, any act of the Owner or breach of the Contract by the Owner, or any other cause beyond the reasonable control of Spartan Double Glazing, then Spartan Double Glazing may, within 14 days of becoming aware that Completion will be delayed, notify the Owner in writing of the delay, stating the cause and the reasonable estimated length of the delay.
8.2 If the Owner does not notify Spartan Double Glazing in writing and reject or dispute the cause of the delay and/or the estimated length of the delay within 14 days after receipt of Spartan Double Glazing's notice under Clause 8.1, the Completion Date will be automatically extended by the delay period stated in the said notice.

9. SUSPENSION OF THE WORKS
Spartan Double Glazing may, without prejudice to any of Spartan Double Glazing's rights under this Contract or at law, suspend the Works if the Owner is in breach of this Contract, by immediately notifying the Owner in writing of the suspension and the reason for doing so. The Completion Date will then be automatically extended by the period equivalent to the sum of the number of Days the Works were suspended and the number of Days of any consequential delays. The Owner will remedy the breach or breaches stated in any suspension notice given to the Owner under this Clause 9 within 7 Days after receiving written notice from Spartan Double Glazing. Spartan Double Glazing will recommence the carrying out of the Works within 14 Days of the breach or breaches stated in the suspension notice being remedied by the Owner.

10. RIGHT TO TERMINATE CONTRACT
10.1 If either the Owner or Spartan Double Glazing is in substantial breach of this Contract, then the other party may give written notice by pre-paid post to the defaulting party: (a) Describing the breach or breaches of the Contract; and (b) Stating the other party's intention to terminate the Contract unless the breach or breaches are remedied within 14 days.
10.2 If the defaulting party fails to remedy the breach or breaches stated in the notice within 14 days of receipt of the notice, then the other party may, without prejudice to any other of its rights or remedies, give further written notice by pre-paid post to the defaulting party immediately.
10.3 Upon termination, the defaulting party is liable for any costs, losses, or damages incurred by the non-defaulting party as a result of the breach.
10.4 The right of termination under this clause is in addition to any other rights or remedies available to the parties under this Contract or at law.

COOLING-OFF PERIOD
11.1 The Owner has the right to a cooling-off period of 5 days from the date of signing this Contract. During this period, the Owner may cancel the Contract by providing written notice to Spartan Double Glazing.
11.2 If the Contract is cancelled within the cooling-off period, Spartan Double Glazing will refund any payments made by the Owner, less any reasonable expenses incurred by Spartan Double Glazing up to the date of cancellation.

DAMAGE AND REPAIRS
12.1 The Owner acknowledges that window replacement is a complex process, especially in buildings with challenging structures. This process may necessitate the removal of old frames and can lead to unavoidable damage to render, paint lines, and adjacent areas.
12.2 The Owner is responsible for any repairs and touch-ups to render, paint lines, and adjacent areas that may be required following installation. Spartan Double Glazing will take reasonable steps to minimize such damage. It is important to note that Spartan Double Glazing does not undertake painting or filling of nail holes in the primed timber around the frame. These tasks are best performed by a qualified painter to ensure quality and matching with existing aesthetics.
12.3 Spartan Double Glazing is not liable for damage to brick sills or any structural elements that may occur during the removal of old frames or installation of new windows. The responsibility for repairing or replacing any damaged brick sills rests with the Owner.
12.4 If Spartan is determined to be at fault for damage not relating to pulling the window/door out of the opening, Spartan will rectify that issue by means of repair.

LIMITATION OF LIABILITY
13.1 Spartan Double Glazing is not liable for indirect, incidental, special, consequential, or punitive damages, including loss of profits, even if advised of the possibility of such damages, except as provided by law.
13.2 The liability of Spartan Double Glazing for any breach of this Contract or any statutory duty is limited to the resupply of the service or the payment of the cost of having the service supplied again, at Spartan Double Glazing's discretion.

Architrave Selection and Client Responsibilities:
14.1 Architrave Selection:
a. Spartan DG recommends specific Architraves for the installation of double glazed windows and doors. These recommendations are based on Spartan DG's extensive experience and aim to complement the window systems and minimize impact on surrounding areas.
b. The Client may choose to select Architraves other than those recommended by Spartan DG.
14.2 Client's Responsibility:
a. If the Client opts for Architraves not recommended by Spartan DG, they acknowledge and accept that Spartan DG is not responsible for any compatibility or suitability issues.
b. The Client understands that non-recommended Architraves may lead to additional visible damage, including but not limited to, skirting board and plaster damage.
14.3 Damage Liability:
a. Spartan DG is not liable for damages such as skirting board and plaster damage, which are more likely with non-recommended Architraves.
b. Repairs or additional work due to the use of non-recommended Architraves are the Client's financial and logistical responsibility.
c. There is a risk of skirting boards not aligning correctly with non-recommended Architraves.
14.4 Skirting Board Alignment:
a. Misalignment of skirting boards is common with non-standard or non-recommended Architraves.
b. Spartan DG informs the Client of the risk of misalignment with non-recommended Architraves.
14.5 Non-Liability Clause:
a. Spartan DG is not responsible for misalignment issues between skirting boards and Architraves resulting from the use of non-recommended Architraves.
b. This non-liability includes both aesthetic and functional issues due to misalignment.
14.6 Client's Acknowledgment and Responsibility:
a. The Client acknowledges the risks of misalignment and agrees that Spartan DG will not be responsible for any such issues or costs for rectification.
b. Any additional work for correcting alignment issues is the Client's responsibility.
14.7 Quality Assurance:
Regardless of Architrave selection, Spartan DG commits to high-quality installation of double glazed windows and doors, adhering to industry standards.

MISCELLANEOUS PROVISIONS
15.1 This Contract constitutes the entire agreement between the parties and supersedes all prior negotiations, understandings, or agreements.
15.2 Modifications to this Contract must be in writing and signed by both parties.
15.3 If any part of this Contract is invalid or unenforceable, the remainder will continue in full force and effect.
15.4 This Contract is governed by the laws of Victoria, Australia, and the parties submit to the non-exclusive jurisdiction of its courts.

By accepting this Contract, the Owner agrees to the terms and conditions as set forth herein.`;

