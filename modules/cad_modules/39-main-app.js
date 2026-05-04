// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
// Emergency storage shim — runs immediately at script-eval time. If
// 41-build-storage.js is not deployed (modules/ folder missing the file),
// this provides a minimal localStorage-only fallback so Save still works.
// The full 41-build-storage.js (when deployed) installs FIRST in module
// order if its filename sorts before 39, but actually 41 > 39 so this
// shim runs first; 41's IIFE checks `if (window.SpartanBuildStorage) return`
// and would skip. We override that by force-installing from 41 — but 41
// pre-checks too. Solution: this shim ONLY installs if the global is
// missing AT INSTALL TIME, AND 41 is loaded LATER in the bundle and
// will overwrite. To make that work, 41 needs to ALWAYS install (not
// pre-check). For now (until 41 is patched), the shim is a defensive
// last-resort and you should still deploy 41 for full features (Supabase
// sync, snapshots, JSON export, search index, etc.).
//
// The shim provides ONLY: loadIndex, saveBuild, loadBuild, deleteBuild,
// getActiveBuildId, setActiveBuildId, newLocalBuildId, buildIdFromCrm,
// listSnapshots (returns []), storageUsageBytes. Cloud sync functions
// return "not configured". Snapshot/JSON/restore are no-ops.
//
// Keep this small — full implementation lives in 41-build-storage.js.
(function installEmergencyShim() {
  if (typeof window === 'undefined') return;
  if (window.SpartanBuildStorage && window.SpartanBuildStorage._fullImpl) return;
  // Only install if no full impl is present. The full impl in 41 sets
  // _fullImpl: true on its export object. If a previous shim is here,
  // we let it stay (it's harmless).
  if (window.SpartanBuildStorage) return;
  console.log('[SpartanCAD] Installing emergency build-storage shim. For full features (Supabase sync, snapshots, JSON export), deploy 41-build-storage.js.');
  var BUILD_PREFIX    = 'spartan_cad_build_';
  var INDEX_KEY       = 'spartan_cad_builds_index';
  var ACTIVE_KEY      = 'spartan_cad_active_build_id';
  function loadIndex() {
    try { var raw = localStorage.getItem(INDEX_KEY); return raw ? (JSON.parse(raw) || []) : []; }
    catch (e) { return []; }
  }
  function writeIndex(a) { try { localStorage.setItem(INDEX_KEY, JSON.stringify(a || [])); } catch (e) {} }
  function upsertRow(buildId, summary) {
    var idx = loadIndex();
    var pos = -1;
    for (var i = 0; i < idx.length; i++) if (idx[i].buildId === buildId) { pos = i; break; }
    var row = Object.assign({ buildId: buildId }, summary);
    if (pos >= 0) idx[pos] = row; else idx.unshift(row);
    writeIndex(idx);
    return row;
  }
  function loadBuild(id) {
    if (!id) return null;
    try { var raw = localStorage.getItem(BUILD_PREFIX + id); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function saveBuild(id, payload) {
    if (!id) throw new Error('saveBuild: buildId required');
    var s = JSON.stringify(payload || {});
    try { localStorage.setItem(BUILD_PREFIX + id, s); }
    catch (e) {
      var err = new Error('Local save failed: ' + (e.name === 'QuotaExceededError' ? 'storage full' : (e.message || 'unknown')));
      err.code = e.name; err.cause = e; throw err;
    }
    var summary = {
      customerName:  (payload && payload.customerName) || '',
      address:       (payload && payload.address) || '',
      jobNumber:     (payload && payload.jobNumber) || '',
      quoteNumber:   (payload && payload.quoteNumber) || '',
      designId:      (payload && payload.designId) || '',
      lastSaved:     Date.now(),
      phase:         (payload && payload.phase) || 'design',
      frameCount:    (payload && Array.isArray(payload.projectItems)) ? payload.projectItems.length : 0,
      snapshotCount: 0,
      sizeBytes:     s.length,
    };
    upsertRow(id, summary);
    return summary;
  }
  function deleteBuild(id) {
    if (!id) return;
    try { localStorage.removeItem(BUILD_PREFIX + id); } catch (e) {}
    var idx = loadIndex().filter(function(r) { return r.buildId !== id; });
    writeIndex(idx);
    if (getActiveBuildId() === id) setActiveBuildId(null);
  }
  function getActiveBuildId() { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; } }
  function setActiveBuildId(id) { try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch (e) {} }
  function newLocalBuildId() { return 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }
  function buildIdFromCrm(crmLink) {
    if (!crmLink || !crmLink.design || !crmLink.design.id) return null;
    return 'crm_' + crmLink.design.id;
  }
  function storageUsageBytes() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf(BUILD_PREFIX) === 0 || k === INDEX_KEY) {
          var v = localStorage.getItem(k) || '';
          total += k.length + v.length;
        }
      }
    } catch (e) {}
    return total;
  }
  // No-ops / "not configured" for advanced features
  var notImpl = function(){ return null; };
  var promiseNotConfigured = function(){ return Promise.resolve({ ok: false, reason: 'not configured' }); };
  window.SpartanBuildStorage = {
    _isShim: true,            // marker for diagnostic logging
    loadIndex:                 loadIndex,
    saveBuild:                 saveBuild,
    loadBuild:                 loadBuild,
    deleteBuild:               deleteBuild,
    listSnapshots:             function(){ return []; },
    saveSnapshot:              notImpl,
    loadSnapshot:              notImpl,
    deleteSnapshot:            function(){},
    getActiveBuildId:          getActiveBuildId,
    setActiveBuildId:          setActiveBuildId,
    newLocalBuildId:           newLocalBuildId,
    buildIdFromCrm:            buildIdFromCrm,
    promoteLocalToCrm:         function(localId, crmDesignId) {
      if (!localId || !crmDesignId) return null;
      var crmId = 'crm_' + crmDesignId;
      var p = loadBuild(localId);
      if (p) { p.designId = crmDesignId; saveBuild(crmId, p); deleteBuild(localId); }
      return crmId;
    },
    downloadAllBuildsJSON:     function(){ alert('Backup download requires the full 41-build-storage.js module. Please deploy it.'); return null; },
    restoreBuildsFromJSON:     function(){ return { imported: 0, skipped: 0, errors: ['Restore requires full 41-build-storage.js. Please deploy it.'] }; },
    storageUsageBytes:         storageUsageBytes,
    syncBuildToSupabase:       promiseNotConfigured,
    listBuildsFromSupabase:    function(){ return Promise.resolve({ ok: false, reason: 'shim', rows: [] }); },
    loadBuildFromSupabase:     function(){ return Promise.resolve(null); },
    mergeSupabaseIndex:        function(){ return Promise.resolve({ ok: false, reason: 'shim', added: 0, updated: 0 }); },
    deleteBuildFromSupabase:   function(){ return Promise.resolve({ ok: false }); },
    MAX_SNAPSHOTS_PER_BUILD: 0,
  };
})();

// ─────────────────────────────────────────────────────────────────────────
// WIP36 profile catalog migration — converts any legacy
// profileCosts['x_white'] / ['x_colour'] pairs into unified entries with
// perMetreWhite / perMetreColour / perMetreBilateral fields. Idempotent —
// safe to run on already-migrated settings. Returns a NEW pricingConfig
// (or the original reference if no migration was needed).
// ─────────────────────────────────────────────────────────────────────────
function migrateProfileCostsToUnified(pricingConfig) {
  if (!pricingConfig || !pricingConfig.profileCosts) return pricingConfig;
  const pcs = pricingConfig.profileCosts;
  // Find any *_white or *_colour suffixed keys.
  const legacyKeys = Object.keys(pcs).filter(k => /_(white|colour)$/.test(k));
  if (legacyKeys.length === 0) return pricingConfig;

  const next = {};
  // Copy non-legacy keys first.
  Object.keys(pcs).forEach(k => {
    if (!/_(white|colour)$/.test(k)) next[k] = pcs[k];
  });
  // Group legacy keys by base prefix.
  const seen = {};
  legacyKeys.forEach(k => {
    const base = k.replace(/_(white|colour)$/, '');
    if (seen[base]) return;
    seen[base] = true;
    const w_ = pcs[base + '_white'];
    const c_ = pcs[base + '_colour'];
    const ref = w_ || c_;
    next[base] = {
      code: ref.code,
      name: (ref.name || '').replace(/\s*\(colour\)\s*$/i, '').trim(),
      system: ref.system,
      role: ref.role,
      perMetreWhite: w_ && typeof w_.perMetre === 'number' ? w_.perMetre : null,
      perMetreColour: c_ && typeof c_.perMetre === 'number' ? c_.perMetre : null,
      perMetreBilateral: c_ && typeof c_.bilateralPerMetre === 'number' ? c_.bilateralPerMetre : null,
      barLen: ref.barLen || 5.85,
    };
  });
  return Object.assign({}, pricingConfig, { profileCosts: next });
}


function SpartanCADPreview() {
  const containerRef = useRef(null);
  const sceneData = useRef({});
  const dimOverlayRef = useRef(null);
  const [editingDim, setEditingDim] = useState(null);
  const [showDimensions, setShowDimensions] = useState(true);
  // WIP10: Customise Layout panel (transoms / mullions / sashes)
  const [showLayoutPanel, setShowLayoutPanel] = useState(false);
  const [layoutTab, setLayoutTab] = useState('transoms'); // 'transoms' | 'mullions' | 'sashes'
  const [selectedCell, setSelectedCell] = useState(null); // {r, c} or null
  const [dimAnchors, setDimAnchors] = useState([]); // {axis, idx, mm}
  const [productType, setProductType] = useState("awning_window");
  const [colour, setColour] = useState("white_body");
  const [colourVersion, setColourVersion] = useState(0);
  // sceneEpoch is bumped by the THREE init useEffect every time it builds a
  // fresh renderer/scene AFTER the first mount (e.g. on render-quality
  // changes that require a full teardown). The geometry rebuild useEffect
  // lists this in its deps so it re-runs after the new scene is in place —
  // without depending on React's multi-effect firing order, which is fragile
  // across React versions and Strict Mode. Without this signal, changing any
  // render-quality setting would leave an empty viewport because the old
  // productGroup is held by the disposed old scene.
  const [sceneEpoch, setSceneEpoch] = useState(0);
  // initRanOnce skips the epoch bump on first mount (the rebuild useEffect
  // already fires on initial mount via its other deps; bumping on first
  // mount would cause an unnecessary double-build with a brief flash).
  const initRanOnce = useRef(false);
  const syncColours = (newList) => { COLOURS.length = 0; newList.forEach(c => COLOURS.push(c)); setColourVersion(v => v + 1); };
  const [colourInt, setColourInt] = useState("white_body");
  const [colTarget, setColTarget] = useState("ext");
  const [openPct, setOpenPct] = useState(0);
  const [width, setWidth] = useState(900);
  const [height, setHeight] = useState(900);
  const [panelCount, setPanelCount] = useState(1);
  const [opensIn, setOpensIn] = useState(false);
  const [openStyle, setOpenStyle] = useState("top_hung");
  const [viewMode, setViewMode] = useState("3d");
  const [propertyType, setPropertyType] = useState("brick_veneer");
  const [floorLevel, setFloorLevel] = useState(0);
  // WIP25: per-frame installation type — inherits project default on new/legacy frames.
  const [installationType, setInstallationType] = useState("retrofit");
  const [hovCol, setHovCol] = useState(null);
  // Feature 3: new state
  const [transomPct, setTransomPct] = useState(null);
  const [glassTint, setGlassTint] = useState("clear");
  const [colonialGrid, setColonialGrid] = useState(null);
  const [showFlyScreen, setShowFlyScreen] = useState(true);
  const [glassSpec, setGlassSpec] = useState('dgu_4_12_4');
  const [glassCat, setGlassCat] = useState('All');
  const [applyColourAll, setApplyColourAll] = useState(false);
  const [applyGlassAll, setApplyGlassAll] = useState(false);
  // Grid layout state: columns, rows, per-cell opening types
  const [gridCols, setGridCols] = useState(1);
  const [gridRows, setGridRows] = useState(1);
  const [cellTypes, setCellTypes] = useState([["fixed"]]);
  // WIP10: per-segment divider breaks. Parallel to cellTypes: cellBreaks[r][c]
  // is { up?: bool, left?: bool }. `up` means the transom segment above this
  // cell is removed (cell (r,c) shares its top edge with cell (r-1,c) — no bar
  // between them). `left` means the mullion segment to the left is removed.
  // Used by both the schematic × badges and buildGridWindow's segmented bar
  // rendering so you can delete individual segments of a divider rather than
  // the whole row/column at once.
  const [cellBreaks, setCellBreaks] = useState([[{}]]);
  // Zone dimension arrays (mm) — custom sizes for each column/row
  const [zoneWidths, setZoneWidths] = useState([900]);
  const [zoneHeights, setZoneHeights] = useState([900]);
  const [hardwareColour, setHardwareColour] = useState("white");
  // Handle height OFFSET in mm from the system default (T&T = 1000mm from sash
  // bottom on tall sashes, sash centre on short ones; sliding = sash centre).
  // -100 = lower than default, +100 = higher. 0 = default. Pre-populates the
  // surveyor's handleHeightOffsetMm in the check-measure form.
  const [handleHeightMm, setHandleHeightMm] = useState(0);

  // === Project & Pricing State ===
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState('profiles');
  // Production view — modal showing factory-floor cut/build lists across 4 tabs
  // (Profile / Milling / Hardware / Glass). Replaces the dashboard-inline Profile
  // Cut List that was crowding the project view.
  const [showProduction, setShowProduction] = useState(false);
  const [productionTab, setProductionTab] = useState('profile');
  const [markupUnlocked, setMarkupUnlocked] = useState(false);
  const [settingsPath, setSettingsPath] = useState('personalisation');
  const [settingsListIdx, setSettingsListIdx] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState({account:true,products:true,pricing:true,catalogs:true,projects:true,frames:false,printing:true});

  // Settings persistence: lazy initializer reads localStorage synchronously so
  // the very first render already has the user's saved state. A useEffect
  // below loads the Supabase copy (if reachable) and merges it over the top,
  // and a debounced useEffect saves on every change to both layers.
  function _defaultAppSettings() { return ({
    theme: 'light',
    accentColour: '#c41230',
    textColour: '#333333',
    company: {
      name:'Spartan Double Glazing',
      address1:'162-164 Nicholson Street, Abbotsford VIC',
      address2:'40/25 Val Reid Crescent, Hume ACT',
      address3:'2/7 Wireless Rd, Glynde SA 5070',
      phone:'1300 912 161',
      email:'sales@spartandoubleglazing.com.au',
      website:'spartandoubleglazing.com.au',
      abn:'89 933 629 169',
      abnVic:'89 933 629 169',
      abnAct:'62 324 172 482',
      abnSa:'20 929 144 905',
      bankVic:{ name:'Spartan Double Glazing PTY LTD', bsb:'062-692', account:'7770 4053' },
      bankAct:{ name:'Spartan Double Glazing ACT PTY LTD', bsb:'067-873', account:'1905 2592' },
      bankSa: { name:'Spartan Double Glazing SA PTY LTD',  bsb:'065-156', account:'1076 5871' },
    },
    passwords: { markup:'1234', admin:'admin' },
    // Per-product-type assembly catalog. Each entry holds the section DXF
    // for that product type plus the dimensions extracted from it
    // (metricsExtracted) and any user overrides (metricsOverride). Cut
    // formulas read effective metrics (override || extracted) directly
    // from this map. The product type IS the system — Awning / Casement /
    // Tilt&Turn etc. each carry their own assembly drawing and dimensions
    // because their cross-sections genuinely differ even when they share
    // the same underlying profile family (e.g. Aluplast I4000).
    //
    // Slots are forward-looking: assemblyDxf is what's wired today; the
    // hardware / drainage / milling slots reserve the schema so per-type
    // CNC data can be attached later without another migration.
    productTypeAssemblies: {
      // Empty by default — populated when the user uploads via the
      // Product types settings page. Shape per entry:
      // {
      //   assembly: { parsed, fileName, uploadedAt, rotateDeg, showDimensions } | null,
      //   metricsExtracted: { frameSightlineMm, frameSashGapMm, ... } | null,
      //   metricsOverride: { frameSashGapMm: 14, ... },
      //   hardwareDxf: null,    // future
      //   drainageDxf: null,    // future
      //   millingDxf: null,     // future
      //   notes: '',
      // }
    },
    // ─── Mullion / transom assembly catalog (GLOBAL) ──────────────────────
    // Three uploads at the system level — separate from per-product-type
    // assemblies because mullion profiles are typically the same across
    // every product in a system family. Split by opening direction because
    // the rebate / gasket geometry flips between inwards-opening (T&T,
    // French door) and outwards-opening (awning, casement).
    //
    // The third slot is the mullion-transom intersection: a section through
    // the T-junction where a horizontal transom butts into a vertical
    // mullion. Used to extract the coupling-block allowance that shortens
    // every transom cut.
    //
    // A frame's opening direction is auto-detected from its product type
    // (see getOpeningDirection() in the cutter module). Once detected, the
    // appropriate mullion slot's metrics are mixed into the per-type metrics
    // when the cuts are computed.
    mullionAssemblies: {
      inwards: null,    // { assembly, metricsExtracted, metricsOverride, notes }
      outwards: null,   // { assembly, metricsExtracted, metricsOverride, notes }
      intersection: null, // { assembly, metricsExtracted, metricsOverride, notes }
    },
    statuses: [
      {id:'st1',name:'New Enquiry',colour:'#3B82F6',checks:'None'},
      {id:'st2',name:'Quote Sent',colour:'#EAB308',checks:'None'},
      {id:'st3',name:'Deposit Paid',colour:'#22C55E',checks:'Deposit'},
      {id:'st4',name:'In Production',colour:'#6366F1',checks:'None'},
      {id:'st5',name:'Install Complete',colour:'#15803D',checks:'None'},
      {id:'st6',name:'Not Proceeding',colour:'#DC2626',checks:'None'},
    ],
    customFields: {
      projects: [{id:'cf1',name:'Name',type:'text',options:[]},{id:'cf2',name:'Comments',type:'textarea',options:[]}],
      frames: [{id:'ff1',name:'Width',type:'number',options:[]},{id:'ff2',name:'Height',type:'number',options:[]}],
    },
    ancillaries: [
      {id:'an1',name:'Van Delivery',                                                 desc:'', amount:384.89, addToNew:true, disc:true},
      {id:'an2',name:'Rubbish Disposal Van Removal',                                  desc:'', amount:380.25, addToNew:true, disc:true},
      {id:'an3',name:'Timber Reveals, Architraves, Trims, Silicones, and all Consumables', desc:'', amount:235.25, addToNew:true, disc:true},
    ],
    quoteTemplates: [
      {id:'qt1',name:'Quotation',kind:'quotation',general:{fontSize:'normal',text:''},header:{showLogo:true,showName:true,showAddress:true,showContact:true,showQuoteNum:true,showDate:true,showClientName:true,showClientAddress:true},frames:{showSchematic:true,showDimensions:true,showGlassSpec:true,showColours:true,showUnitPrice:true,showItemNotes:true},summary:{showSubtotal:true,showGST:true,showTotal:true,showValidity:true,validityDays:30},terms:'',mfg:{cuttingList:false}},
      {id:'qt2',name:'Check Measure (Replacement)',kind:'check_measure',general:{fontSize:'normal',text:''},header:{showLogo:true,showName:true,showAddress:true,showContact:true,showQuoteNum:false,showDate:true,showClientName:true,showClientAddress:true},frames:{showSchematic:true,showDimensions:true,showGlassSpec:true,showColours:true,showUnitPrice:false,showItemNotes:true},summary:{showSubtotal:false,showGST:false,showTotal:false,showValidity:false,validityDays:0},terms:'',mfg:{cuttingList:false}},
      {id:'qt3',name:'Completion Document / Service',kind:'completion',general:{fontSize:'normal',text:''},header:{showLogo:true,showName:true,showAddress:true,showContact:true,showQuoteNum:false,showDate:true,showClientName:true,showClientAddress:true},frames:{showSchematic:true,showDimensions:true,showGlassSpec:false,showColours:false,showUnitPrice:false,showItemNotes:true},summary:{showSubtotal:false,showGST:false,showTotal:false,showValidity:false,validityDays:0},terms:'',mfg:{cuttingList:false}},
      {id:'qt4',name:'Final Sign Off (Replacement)',kind:'final_sign_off',general:{fontSize:'normal',text:''},header:{showLogo:true,showName:true,showAddress:true,showContact:true,showQuoteNum:false,showDate:true,showClientName:true,showClientAddress:true},frames:{showSchematic:true,showDimensions:true,showGlassSpec:true,showColours:true,showUnitPrice:false,showItemNotes:false},summary:{showSubtotal:false,showGST:false,showTotal:false,showValidity:false,validityDays:0},terms:'',mfg:{cuttingList:false}},
    ],
    forewords: [{id:'fw1',name:'Standard',text:"Windows as seen on Channel Nine's The Block.\n5% Price Beat or Price Match Guarantee (Terms & Conditions Apply).\nAll Extrusion Lengths are Imported from Germany's Aluplast.\nAll Hardware is Imported from Germany's Siegware\nAll Glass is Furnaced Locally.\nAll Windows are manufactured Locally in Sunshine\n\nWhat's Included in the Installation?\nSite Surveying.\nDelivery.\nRemoval of Existing Frames.\nRubbish Removal.\nWindow Installation.\nGlazing.\nInternal Foam Filling for Insulation.\nPre-Primed Timber Reveals\nStandard Architraves\nAll aspects of Carpentry\nExternal Caulking and Silicone Sealing.\nExternal Trimming/Finishing Off.\n\nWhat's Not Included in the Installation?\nAny painting work.\nBlinds, Curtains, Shutters, or any window covering removal or installation. You are required to remove your own blinds.\n\nWhat's Covered?\n10 Year Unconditional Guarantee on all windows & doors. Our Service Technicians are available to assist you at any time.\nQualified, accredited installers, with years of experience. Our installers have a high attention to detail, quality work, and trained to treat your home as if it was theirs.\n\nAdditional Information:\nALL WINDOWS INCLUDE FLY SCREENS EXCLUDING PUSH OUT WINDOWS UNLESS QUOTED.\nDOOR SCREENS SOLD SEPARATELY."}],
    termsAndConditions: [{id:'tc1',name:'Standard Terms',text:SPARTAN_TC_TEXT}],
    signing: {client:'visible',installer:'visible',salesMgr:'hidden',windowSignOff:false},
    pageSetup: {paperSize:'A4',orientation:'portrait',margins:{top:15,bottom:15,left:15,right:15},headerHeight:30,footerHeight:15},
    // 3D renderer settings — user-tunable from Settings → 3D Renderer →
    // Render quality. Defaults preserve existing visual behaviour: flat
    // grey HDRI, exposure 1.8, no shadows, no RectAreaLight. Users opt
    // into the enhanced lighting from the settings panel.
    //
    // Each field is read by the THREE init useEffect on mount and any
    // change tears down + re-initialises the renderer. Bridged values
    // (envIntensityMult) are also mirrored to window so the catalog
    // material builder can read them synchronously.
    renderQuality: {
      // ─── Tone & exposure ───────────────────────────────────────────
      toneExposure: 1.8,         // 0.5–2.5; multiplied into renderer.toneMappingExposure
      toneMapping: 'aces',       // 'aces' | 'cineon' | 'reinhard' | 'linear' | 'none'
      // ─── Environment & background ──────────────────────────────────
      hdriStyle: 'flat',         // 'flat' (current grey) | 'studio' (procedural softbox)
      hdriRotation: 0,           // 0–360° — rotates the studio HDRI around vertical axis
      backgroundMode: 'theme',   // 'theme' (matches dark/light) | 'solid' | 'hdri'
      backgroundColor: '#fafafa',// solid colour when backgroundMode='solid'
      envIntensityMult: 1.0,     // 0.25–3.0; global multiplier on every material's envMapIntensity
      // ─── Lighting balance ──────────────────────────────────────────
      ambientIntensity: 0.30,    // 0–2 — overall fill (was hard-coded 0.30)
      hemiIntensity: 1.00,       // 0–2 — sky/ground hemi (was hard-coded 1.00)
      fillIntensity: 1.00,       // 0–2 — multiplier on the four directional fills
      // ─── Shadows ───────────────────────────────────────────────────
      shadows: false,            // toggle PCFSoft shadow maps + ground plane
      shadowSoftness: 4,         // shadow.radius (0–10)
      shadowMapSize: 2048,       // 1024 | 2048 | 4096
      // ─── Highlight (RectAreaLight) ─────────────────────────────────
      rectAreaLight: false,      // toggle the elongated softbox highlight
      rectAreaIntensity: 3,      // 0–10
      // ─── Camera ────────────────────────────────────────────────────
      cameraFov: 32,             // 18–60° (default 32 matches legacy)
      // ─── Post-processing (custom shader pass after FXAA) ───────────
      saturation: 1.0,           // 0–2 — 1.0 unchanged; <1 desaturate, >1 punchy
      contrast: 1.0,             // 0.5–1.8 — 1.0 unchanged; >1 deeper blacks
    },
    // Per-product-type fly-screen configuration. Drives the additional-
    // profiles cutlist: when a window has a fly screen attached, four
    // frame cuts are emitted per opening sash, sized as
    //   horizontal cut: sashW − deductWidthMm
    //   vertical cut:   sashH − deductHeightMm
    // The deductions account for the gasket clearance + corner-joiner
    // overlap on the fly screen frame extrusion. Each window product type
    // gets its own deductions because gasket profiles and screen-channel
    // recess depths differ.
    //
    // Sliding windows have multiple sashes but only the OPENING sash gets
    // a fly screen — the cutlist generator handles that explicitly.
    // Fixed windows default to disabled (no opening sash).
    //
    // profileSku: catalog key for the fly-screen frame extrusion. Defaults
    // to 'flyscreen_alum_15x7' (15mm × 7mm aluminium, the most common
    // residential profile). barLengthMm defaults to 5800mm (typical
    // aluminium extrusion bar length). These can be retargeted by the
    // user per type.
    flyScreenConfig: {
      awning_window:    { enabled: true,  deductWidthMm: 8, deductHeightMm: 8, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
      casement_window:  { enabled: true,  deductWidthMm: 8, deductHeightMm: 8, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
      tilt_turn_window: { enabled: true,  deductWidthMm: 6, deductHeightMm: 6, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
      fixed_window:     { enabled: false, deductWidthMm: 0, deductHeightMm: 0, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
      sliding_window:   { enabled: true,  deductWidthMm: 5, deductHeightMm: 5, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
    },
    // Products — editable, syncs to CAD live
    editColours: COLOURS.map(c => ({...c})),
    editGlass: GLASS_OPTIONS.map(g => ({...g})),
    pricingConfig: JSON.parse(JSON.stringify(PRICING_DEFAULTS)),
    profileSystems: [
      { id:'ps1', name:'Aluplast Ideal 4000', depth:70, frameW:65, sashW:77, mullionW:84, transomW:84, glazingRebate:24, weldAllowance:5, minGlassClearance:2, maxGlazingThick:42, steelThreshW:400, steelThreshH:400, stockBarLen:6500, kerfAllow:3, compatProducts:['tilt_turn_window','fixed_window','sliding_window','french_door','hinged_door','bifold_door'],
        profiles: [
          // Frames — Catalog Ch.02 B
          { id:'pf1', type:'Frame', name:'Frame 65mm (Standard)', code:'140007', width:65, height:70, chambers:5, rebatePrimary:20, rebateSecondary:18, steelW:32, steelH:30, steelThick:[1.25,1.5,2.0], desc:'Standard outer frame — 5-chamber, 70mm depth, 65mm sightline. Tilt-turn and fixed windows.' },
          { id:'pf1b', type:'Frame', name:'Frame 55mm (Low sightline)', code:'140005', width:55, height:70, chambers:5, rebatePrimary:20, rebateSecondary:18, steelW:32, steelH:30, steelThick:[1.5,2.0], desc:'Reduced sightline frame 55mm. Maximises glazing area for fixed lights.' },
          // Sashes — Catalog Ch.02 C
          { id:'pf2', type:'Sash', name:'Z77 Sash (CL)', code:'140020', width:77, height:70, chambers:5, rebatePrimary:24, rebateSecondary:16, sashOverlap:12, sashStep:5, steelW:27, steelH:35, steelThick:[1.0,1.5,2.0], desc:'Classic-line 77mm Z-sash. Standard for tilt-turn. Depth 70mm. Overlap 12mm, step 5mm. Glazing 4-41mm. Total assembly 119mm with frame.' },
          { id:'pf2b', type:'Sash', name:'Z97 Sash (CL)', code:'140028', width:97, height:77, chambers:5, rebatePrimary:20, rebateSecondary:15, steelW:40, steelH:47, steelThick:[1.25,2.0], desc:'Wide 97mm Z-sash. Visible height 77mm. For larger IGUs, glazing 4-42mm.' },
          { id:'pf2c', type:'Sash', name:'Z105/T105 Sash (CL)', code:'140030', width:105, height:85, chambers:5, rebatePrimary:20, rebateSecondary:15, steelW:40, steelH:35, steelThick:[1.5,2.0], desc:'Door sash 105mm. Visible height 85mm. For hinged/french/bifold doors.' },
          { id:'pf2d', type:'Sash', name:'T105 Open-Out Sash', code:'140031', width:105, height:85, chambers:5, rebatePrimary:20, rebateSecondary:15, steelW:40, steelH:35, steelThick:[2.0], desc:'Outward-opening door sash 105mm. Has 21.5mm extended overlap.' },
          // Mullions/Transoms — Catalog Ch.02 D
          { id:'pf7', type:'Mullion', name:'Mullion/Transom 84mm (CL)', code:'140041', width:84, height:44, chambers:3, rebatePrimary:14, rebateSecondary:14, steelW:20, steelH:35, steelThick:[1.25,1.5,2.5], desc:'Standard symmetrical mullion/transom 84mm. All multi-panel configs.' },
          // False mullion — Catalog Ch.02 E
          { id:'pf8', type:'Floating mullion', name:'False Mullion 64mm', code:'140066', width:64, height:74, chambers:2, rebatePrimary:0, rebateSecondary:0, steelW:48, steelH:14.5, steelThick:[2.0], desc:'French door meeting stile. Screws directly to sash. End caps X447340/X449340.' },
          // Glazing beads — Catalog Ch.03
          { id:'pf9', type:'Bead', name:'Glazing Bead 24mm (QUBE-LINE)', code:'120846', width:24, height:4, desc:'Snap-fit QUBE-LINE glazing bead. Standard for 24mm DGU.' },
          { id:'pf9b', type:'Bead', name:'Glazing Bead 40mm (QUBE-LINE)', code:'120876', width:40, height:4, desc:'Deep QUBE-LINE glazing bead for 36-40mm triple-glazed units.' },
          // Thresholds/Sills
          { id:'pf11', type:'Threshold', name:'Alu Threshold 70mm', code:'249060', width:70, height:20, desc:'Aluminium low-level threshold. 70mm system depth.' },
          { id:'pf11b', type:'Threshold', name:'Alu Threshold 85mm', code:'269060', width:85, height:20, desc:'Aluminium threshold 85mm for deeper reveals.' },
          { id:'pf12', type:'Sill', name:'External Windowsill 150mm', code:'100220', width:150, height:20, desc:'Aluminium external windowsill/drip cap 150mm.' },
        ],
      },
      { id:'ps1c', name:'Aluplast Ideal 4000 Casement', depth:70, frameW:75, sashW:75.5, mullionW:80, transomW:80, glazingRebate:24, weldAllowance:5, minGlassClearance:2, maxGlazingThick:40, steelThreshW:400, steelThreshH:400, stockBarLen:6500, kerfAllow:3, compatProducts:['awning_window','casement_window'],
        profiles: [
          // Casement-specific frames (AU market — 75mm sightline)
          { id:'pfc1', type:'Frame', name:'Frame 75mm (Casement)', code:'140007C75', width:75, height:70, chambers:5, steelW:32, steelH:30, steelThick:[1.5,2.0], desc:'Casement outer frame 75mm sightline. For Australian awning and casement windows. Co-extruded gaskets.' },
          { id:'pfc1b', type:'Frame', name:'Frame 60mm (Casement)', code:'140007C60', width:60, height:70, chambers:5, steelW:32, steelH:30, steelThick:[1.5,2.0], desc:'Casement frame 60mm sightline option.' },
          { id:'pfc1c', type:'Frame', name:'Frame 50mm (Casement)', code:'140007C50', width:50, height:70, chambers:5, steelW:32, steelH:30, steelThick:[1.5,2.0], desc:'Casement frame 50mm minimal sightline.' },
          // T-sash for outward opening
          { id:'pfc2', type:'Sash', name:'T Sash 75.5mm (Casement)', code:'140020T', width:75.5, height:70, chambers:5, steelW:27, steelH:35, steelThick:[1.5,2.0], desc:'Outward-opening T-shaped sash 75.5mm. Standard for AU awning and casement. Glazes from inside.' },
          // Mullions
          { id:'pfc7', type:'Mullion', name:'Mullion 80mm (Casement)', code:'140041C80', width:80, height:44, chambers:3, steelW:20, steelH:33, steelThick:[1.5,2.5], desc:'Casement mullion 80mm. Accommodates wind load for AU conditions.' },
          { id:'pfc7b', type:'Mullion', name:'Mullion 70mm (Casement)', code:'140041C70', width:70, height:44, chambers:3, steelW:20, steelH:33, steelThick:[1.5], desc:'Narrow casement mullion 70mm.' },
          // Same beads and thresholds as Ideal 4000 T&T
          { id:'pfc9', type:'Bead', name:'Glazing Bead 24mm (QUBE-LINE)', code:'120846', width:24, height:4, desc:'Standard QUBE-LINE bead for casement system.' },
          { id:'pfc12', type:'Sill', name:'External Windowsill 150mm', code:'100220', width:150, height:20, desc:'Aluminium external windowsill.' },
        ],
      },
      { id:'ps5', name:'Aluplast Ideal 2000', depth:70, frameW:70, sashW:77, mullionW:84, transomW:84, glazingRebate:20, weldAllowance:5, minGlassClearance:2, maxGlazingThick:36, steelThreshW:400, steelThreshH:400, stockBarLen:6500, kerfAllow:3, compatProducts:['awning_window','casement_window','tilt_turn_window','fixed_window','french_door','hinged_door'],
        profiles: [
          { id:'pf50', type:'Frame', name:'Frame 70mm', code:'100097', width:70, height:70, rebatePrimary:18, rebateSecondary:16, steelW:30, steelH:28, desc:'Ideal 2000 outer frame 70mm. Economy system, 5-chamber design.' },
          { id:'pf51', type:'Sash', name:'77mm Z Sash CL', code:'100286', width:77, height:70, rebatePrimary:18, rebateSecondary:14, steelW:25, steelH:33, desc:'Ideal 2000 Classic-line 77mm Z-sash. Accepts 4-36mm glazing.' },
          { id:'pf52', type:'Mullion', name:'84mm Mullion/Transom', code:'110093', width:84, height:70, rebatePrimary:14, rebateSecondary:14, steelW:20, steelH:33, desc:'Ideal 2000 mullion/transom 84mm symmetrical.' },
          { id:'pf53', type:'Bead', name:'Glazing Bead', code:'120132', width:20, height:4, rebatePrimary:0, rebateSecondary:0, steelW:0, steelH:0, desc:'Ideal 2000 snap-fit glazing bead.' },
          { id:'pf54', type:'Threshold', name:'70mm Threshold', code:'249062', width:70, height:20, rebatePrimary:0, rebateSecondary:0, steelW:0, steelH:0, desc:'Aluminium threshold for Ideal 2000 doors.' },
        ],
      },
      { id:'ps2', name:'Aluplast Vario-Slide', depth:70, frameW:70, sashW:77, mullionW:84, transomW:84, glazingRebate:24, weldAllowance:5, minGlassClearance:2, maxGlazingThick:42, steelThreshW:600, steelThreshH:600, stockBarLen:6500, kerfAllow:3, compatProducts:['vario_slide_door','stacker_door'],
        profiles: [
          { id:'pf20', type:'Frame', name:'Vario-Slide Frame 70mm', code:'409084', width:70, height:70, rebatePrimary:20, rebateSecondary:18, steelW:32, steelH:30, desc:'Vario-Slide outer frame. Compatible with Ideal 4000 frame profile.' },
          { id:'pf21', type:'Frame', name:'Vario-Slide Top Frame', code:'409185', width:70, height:70, rebatePrimary:20, rebateSecondary:18, steelW:32, steelH:30, desc:'Vario-Slide top rail frame with integrated track.' },
          { id:'pf22', type:'Sash', name:'Vario-Slide Sash 77mm', code:'449901', width:77, height:70, rebatePrimary:20, rebateSecondary:15, steelW:27, steelH:35, desc:'Vario-Slide sliding sash. Uses CL 77mm profile with integrated hardware track.' },
          { id:'pf23', type:'Mullion', name:'Vario-Slide Interlock', code:'446073', width:84, height:70, rebatePrimary:14, rebateSecondary:14, steelW:20, steelH:35, desc:'Vario-Slide interlock mullion. Meeting stile for sliding panels.' },
          { id:'pf24', type:'Threshold', name:'Vario-Slide Sill Track', code:'459933', width:70, height:25, rebatePrimary:0, rebateSecondary:0, steelW:0, steelH:0, desc:'Aluminium sill track with integrated drainage.' },
        ],
      },
      { id:'ps3', name:'Aluplast Smart-Slide', depth:70, frameW:70, sashW:85, mullionW:84, transomW:84, glazingRebate:24, weldAllowance:5, minGlassClearance:2, maxGlazingThick:42, steelThreshW:600, steelThreshH:600, stockBarLen:6500, kerfAllow:3, compatProducts:['smart_slide_door'],
        profiles: [
          { id:'pf30', type:'Frame', name:'Smart-Slide Frame 70mm', code:'409284', width:70, height:70, rebatePrimary:20, rebateSecondary:18, steelW:32, steelH:30, desc:'Smart-Slide outer frame with integrated track system.' },
          { id:'pf31', type:'Sash', name:'Smart-Slide Sash 85mm', code:'449901', width:85, height:70, rebatePrimary:20, rebateSecondary:15, steelW:35, steelH:40, desc:'Smart-Slide sliding sash 85mm. Wider profile for sliding hardware mechanism.' },
          { id:'pf32', type:'Mullion', name:'Smart-Slide Interlock', code:'477025', width:84, height:70, rebatePrimary:14, rebateSecondary:14, steelW:20, steelH:35, desc:'Smart-Slide interlock profile for meeting stiles.' },
          { id:'pf33', type:'Threshold', name:'Smart-Slide Sill Track', code:'459922', width:70, height:25, rebatePrimary:0, rebateSecondary:0, steelW:0, steelH:0, desc:'Smart-Slide aluminium sill track with drainage.' },
        ],
      },
      { id:'ps4', name:'Aluplast Lift-Slide HST85', depth:85, frameW:85, sashW:105, mullionW:84, transomW:84, glazingRebate:24, weldAllowance:5, minGlassClearance:2, maxGlazingThick:51, steelThreshW:600, steelThreshH:600, stockBarLen:6500, kerfAllow:3, compatProducts:['lift_slide_door'],
        maxDims: { schemeA: { w:3500, h:2500 }, overall: { w:6500, h:2800 }, maxWeight:400 },
        profiles: [
          { id:'pf40', type:'Frame', name:'HST85 Frame', code:'670901', width:85, height:85, chambers:6, desc:'Lift-Slide outer frame. 85mm depth, 6-chamber. Max sash weight 400kg.' },
          { id:'pf41', type:'Frame', name:'HST85 Top Rail', code:'670301', width:85, height:85, chambers:6, desc:'Lift-Slide top rail with integrated guide track.' },
          { id:'pf42', type:'Sash', name:'HST85 Sash 105mm', code:'652923', width:105, height:85, chambers:6, desc:'Heavy-duty sliding sash 105mm. Accepts IGU up to 51mm. SIEGENIA PORTAL HS hardware.' },
          { id:'pf43', type:'Mullion', name:'HST85 Interlock', code:'646370', width:84, height:85, desc:'Lift-Slide interlock mullion for meeting stiles between fixed and sliding panels.' },
          { id:'pf44', type:'Threshold', name:'HST85 Sill Track (Basic)', code:'HST-BASIC', width:85, height:48, desc:'Aluminium threshold 48mm — Basic variant. Can be recessed flush with floor.' },
          { id:'pf44b', type:'Threshold', name:'HST85 Sill Track (Premium)', code:'HST-PREMIUM', width:85, height:48, desc:'GRP (glass-fibre reinforced) threshold — Premium variant. Passive house rated.' },
          { id:'pf45', type:'Bead', name:'HST85 Glazing Bead', code:'120218', width:28, height:4, desc:'Deep glazing bead for HST85 system.' },
        ],
      },
    ],
    frameStyles: PRODUCTS.map(p => ({...p, minW:300, maxW:p.cat==='door'?3000:2400, minH:300, maxH:p.cat==='door'?2700:2400, maxArea:5.0})),
    customFrameStyles: [],
  }); }
  const [appSettings, setAppSettings] = useState(function() {
    return mergeAppSettings(_defaultAppSettings(), loadAppSettingsLocal());
  });

  // Mount: pull the Supabase copy ONLY if it's strictly newer than the local
  // copy. If localStorage has unsynced edits (savedAt > lastSyncedAt) and is
  // at least as new as remote, push the local copy up instead. This stops a
  // hard-refresh from clobbering fresh local edits with stale remote data —
  // the bug that made saves appear to "not stick".
  React.useEffect(function() {
    var cancelled = false;
    loadAppSettingsFromSupabase().then(function(remote) {
      if (cancelled) return;
      var env = (typeof loadAppSettingsLocalEnvelope === 'function') ? loadAppSettingsLocalEnvelope() : null;
      var localSavedMs   = (env && typeof env.savedAt === 'number')      ? env.savedAt      : 0;
      var localSyncedMs  = (env && typeof env.lastSyncedAt === 'number') ? env.lastSyncedAt : 0;
      var remoteMs = (remote && remote.updatedAtMs) || 0;
      // If local has unsynced edits at least as new as remote → push local up.
      if (env && localSavedMs > localSyncedMs && localSavedMs >= remoteMs) {
        saveAppSettingsToSupabase(env.data);
        return;
      }
      // Remote strictly newer than local → merge it in.
      if (remote && remote.data && remoteMs > localSavedMs) {
        setAppSettings(function(prev) { return mergeAppSettings(prev, remote.data); });
        if (typeof markAppSettingsSynced === 'function') markAppSettingsSynced(remoteMs);
      }
    });
    return function() { cancelled = true; };
  }, []);

  // Save status — visible in the Settings top-bar so the user knows whether
  // their edits have actually persisted. 'idle' | 'saving' | 'saved' | 'error'
  const [saveStatus, setSaveStatus] = useState('idle');

  // Save on every change. localStorage runs synchronously so a browser refresh
  // always restores the latest edit; Supabase is debounced 800ms so a burst of
  // edits collapses into one network call.
  var _appSettingsFirstRun = React.useRef(true);
  React.useEffect(function() {
    if (_appSettingsFirstRun.current) { _appSettingsFirstRun.current = false; return; }
    saveAppSettingsLocal(appSettings);
    setSaveStatus('saving');
    var t = setTimeout(function() {
      saveAppSettingsToSupabase(appSettings).then(function(res) {
        setSaveStatus(res && res.ok ? 'saved' : 'error');
      });
    }, 800);
    return function() { clearTimeout(t); };
  }, [appSettings]);

  // Force-save callback for the explicit "Save" button. Cancels any pending
  // debounce and writes immediately, returning the result so the click
  // handler can show inline feedback.
  const forceSaveAppSettings = React.useCallback(async function() {
    saveAppSettingsLocal(appSettings);
    setSaveStatus('saving');
    var res = await saveAppSettingsToSupabase(appSettings);
    setSaveStatus(res && res.ok ? 'saved' : (res && res.offline ? 'saved' : 'error'));
    return res;
  }, [appSettings]);
  // Expose for headless tests + DevTools.
  React.useEffect(function() {
    if (typeof window !== 'undefined') window.forceSaveAppSettings = forceSaveAppSettings;
  }, [forceSaveAppSettings]);

  // Computed theme — every UI element references T
  const dk = appSettings.theme === 'dark';
  const T = {
    // Backgrounds
    bg: dk ? '#111118' : '#e8eaed',
    bgPanel: dk ? '#1a1a22' : '#ffffff',
    bgCard: dk ? '#22222c' : '#f9f9f9',
    bgInput: dk ? '#2a2a34' : '#ffffff',
    bgHover: dk ? '#2e2e3a' : '#f0f0f0',
    bgBar: '#1a1a1a',
    bgControls: dk ? '#16161e' : '#ffffff',
    bgViewport: dk ? '#1e1e28' : '#e8eaed',
    // Borders
    border: dk ? '#333340' : '#e0e0e0',
    borderLight: dk ? '#2a2a36' : '#f0f0f0',
    // Text
    text: appSettings.textColour || (dk ? '#e0e0e0' : '#333333'),
    textSub: dk ? '#999' : '#888',
    textMuted: dk ? '#666' : '#aaa',
    textFaint: dk ? '#555' : '#bbb',
    // Accent
    accent: appSettings.accentColour,
  };

  // Mirror the user-editable polygon catalog onto window.__userProfiles so
  // top-level helpers (getOuterFrameProfileEntry, 3D builders, 2D
  // CrossSection2D) pick up DXF-imported profiles immediately without a
  // page reload. This is the bridge from React state → top-level lookup.
  useEffect(() => {
    try { window.__userProfiles = (appSettings.pricingConfig && appSettings.pricingConfig.profiles) || {}; } catch (e) {}
  }, [appSettings.pricingConfig && appSettings.pricingConfig.profiles]);

  // WIP38: mirror profileLinks (user-defined product→profile overrides) so
  // getLinkedProfileEntry sees changes without a reload.
  useEffect(() => {
    try { window.__profileLinks = (appSettings.pricingConfig && appSettings.pricingConfig.profileLinks) || {}; } catch (e) {}
  }, [appSettings.pricingConfig && appSettings.pricingConfig.profileLinks]);

  // WIP36: one-shot legacy migration — if appSettings.pricingConfig still
  // has _white / _colour suffixed cost keys (from a previous save), merge
  // them into unified entries. Runs once per session; idempotent.
  useEffect(() => {
    setAppSettings((s) => {
      const migrated = migrateProfileCostsToUnified(s.pricingConfig);
      if (migrated === s.pricingConfig) return s;
      return Object.assign({}, s, { pricingConfig: migrated });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    const [projectItems, setProjectItems] = useState([]);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [quoteNumber] = useState(() => 'Q-' + new Date().getFullYear() + '-' + String(Math.floor(Math.random()*9000)+1000));
  const [activeTemplateId, setActiveTemplateId] = useState('qt1');

  // Dashboard navigation state
  const [currentView, setCurrentView] = useState('dashboard');
  const [activeFrameIdx, setActiveFrameIdx] = useState(-1);
  const [showNewFrame, setShowNewFrame] = useState(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [styleApertures, setStyleApertures] = useState(1);
  const [showPricePanel, setShowPricePanel] = useState(false);
  const [projectName, setProjectName] = useState('Project 1');
  const [projectStatus, setProjectStatus] = useState('New Enquiry');
  // Project customer details — editable via clicking the project name in the header.
  // These flow into the quote/check-measure/completion documents.
  const [projectInfo, setProjectInfo] = useState({
    customerName: '', address1: '', address2: '', suburb: '', postcode: '',
    phone: '', email: '', reference: '', comments: '',
    propertyType: 'brick_veneer',
    installationType: 'retrofit',  // WIP23: project-level default, inherited by new frames
  });
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  // Snapshot of the site address at the moment the project info modal opens.
  // Used for change-detection so the "Also update CRM address?" checkbox only
  // appears when the user has actually edited something. Set by the opener.
  const [projectInfoOpenSnap, setProjectInfoOpenSnap] = useState(null);
  // User's choice for back-propagating the site address to the CRM row on
  // Save. Default true when CRM-linked — on by default matches spec §4.5.
  const [projectInfoBackprop, setProjectInfoBackprop] = useState(true);
  // Busy flag while the back-prop write is in flight.
  const [projectInfoBusy, setProjectInfoBusy] = useState(false);
  const [selectedPriceList, setSelectedPriceList] = useState('trade');
  // Tracks which frames have their expanded cost breakdown open in the Price Panel.
  const [expandedFrameIds, setExpandedFrameIds] = useState({});
  const [taxMode, setTaxMode] = useState('gst');
  const [taxApplication, setTaxApplication] = useState('item');
  // Per-project add-ons. Ancillaries are line items on the quote (name + $).
  // Promotions are discounts, either pct of subtotal or fixed $, with toggleable
  // application targets (frames / installation / ancillaries).
  const [projectAncillaries, setProjectAncillaries] = useState([]);
  const [projectPromotions, setProjectPromotions] = useState([]);

  // ═══ CRM LINK STATE ═══════════════════════════════════════════════════════
  // Populated on mount if URL params match §3.1 of the CRM integration spec.
  // If null, CAD is running standalone — no Supabase writes, no header bar.
  // crmLink shape: { type, id, mode, returnUrl, entity, contact, design }
  const [crmLink, setCrmLink] = useState(null);
  const [crmConfigured, setCrmConfigured] = useState(false);
  // syncStatus: 'idle' | 'saving' | 'saved' | 'offline' | 'error'
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError, setSyncError] = useState(null);
  const [pendingWrites, setPendingWrites] = useState(0);
  // Prevents debounced autosave from firing until after initial entity load.
  const [crmBooted, setCrmBooted] = useState(false);
  // Sticky "last saved at" display so user knows when the data was last confirmed.
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // v2.0: global read-only mode retired. The WIP4-era `?mode=view` gate is
  // gone; per-field locking in `mode: 'final'` (driven by `lockedFields[]`)
  // lands in Milestone 5. This const stays as `false` so the ~30 downstream
  // call sites (`disabled={isReadOnly}`, `{!isReadOnly && ...}`, `readOnly=`)
  // continue to compile and behave as "editable" without per-site edits.
  const isReadOnly = false;

  // ═══ CHECK-MEASURE STATE ══════════════════════════════════════════════════
  // The active check_measures row (in progress or most recent). Null until the
  // user enters CM mode and it's loaded from Supabase (or initialised locally
  // for standalone demo use).
  const [checkMeasure, setCheckMeasure] = useState(null);
  const [cmSaving, setCmSaving] = useState(false);
  const [cmLastSavedAt, setCmLastSavedAt] = useState(null);
  // Which frame's CM fields are currently expanded in the CM screen.
  const [cmExpandedFrame, setCmExpandedFrame] = useState(null);

  // ═══ SIGNATURE STATE ══════════════════════════════════════════════════════
  // When the URL contains ?sign=<token> the app enters the signing-page route
  // and skips all normal CAD UI. signatureRecord is the loaded signature row.
  const [signingToken, setSigningToken] = useState(null);
  const [signatureRecord, setSignatureRecord] = useState(null);
  const [signatureBusy, setSignatureBusy] = useState(false);
  // Finalise flow:
  const [showFinaliseModal, setShowFinaliseModal] = useState(false);
  const [finaliseBusy, setFinaliseBusy] = useState(false);
  const [finaliseResult, setFinaliseResult] = useState(null); // { signatureId, signingUrl }

  // ═══ v2.0 POSTMESSAGE BRIDGE — init payload from CRM ═════════════════════
  // Populated by __cadBridge.onInit when CRM sends spartan-cad-init.
  // M1: payload is stashed but not consumed by the UI beyond providing
  // context for save builds. M2+ will hydrate canvas from payload.quotes.
  const [crmInit, setCrmInit] = useState(null);

  // ─── M5: lockedFieldSet (spec §4.3, contract §4.4) ────────────────────
  // Per-field lock in mode: 'final'. Core expected values for v2:
  // ['widthMm', 'heightMm', 'surveyMeasurements']. Pure derivation from
  // crmInit.lockedFields — no state slice, no skipNext* ref needed
  // (a useMemo isn't watched by the dirty effect, and the input is
  // payload-authoritative not user-editable).
  //
  // DO NOT copy M4b's container-lock pattern (Controls sidebar
  // pointerEvents:none). M4b locks ALL controls in survey mode; M5
  // locks SOME fields while colour/openStyle/glassSpec/hardware stay
  // editable. Per-field via lockedFieldSet.has('widthMm') etc.
  //
  // WIP35 (FSO): auto-include 'widthMm' and 'heightMm' when mode === 'final',
  // even if the CRM didn't pass lockedFields explicitly. The Final Sign Off
  // contract (CAD_FSO_HANDOFF.md §3) treats W×H as immutable post-CM —
  // this defends against a CRM-side oversight forgetting to set lockedFields.
  // If the CRM also passes them, they merge cleanly (Set dedupes).
  const lockedFieldSet = React.useMemo(
    function() {
      var base = new Set((crmInit && crmInit.lockedFields) || []);
      if (crmInit && crmInit.mode === 'final') {
        base.add('widthMm');
        base.add('heightMm');
      }
      return base;
    },
    [crmInit]
  );

  // ─── M5: lock toast (spec §4.3) ───────────────────────────────────────
  // One-shot auto-dismiss toast surfaced when the user tries to edit a
  // locked field (e.g. clicks a locked W/H dimension pill). No existing
  // in-CAD toast mechanism — added here for this purpose. Namespaced as
  // "lockToast" to reserve the unqualified "toast" identifier for any
  // future general-purpose toast. Render site: near the viewport banner
  // anchor (was placeholder "Final-mode lock indicators land in M5").
  const [lockToast, setLockToast] = React.useState(null);
  const lockToastTimerRef = React.useRef(null);
  const showLockToast = React.useCallback(function(msg) {
    if (lockToastTimerRef.current) clearTimeout(lockToastTimerRef.current);
    setLockToast(msg || 'Locked — dimensions come from Check Measure and cannot be changed here.');
    lockToastTimerRef.current = setTimeout(function() { setLockToast(null); }, 3000);
  }, []);

  // ═══ v2.0 POSTMESSAGE BRIDGE — React wiring ══════════════════════════════
  // Wires the top-level __cadBridge to React state/refs on mount. The
  // dispatcher (`handleCrmMessage` at top-level) holds these callbacks and
  // invokes them when a CRM message arrives. We use refs to avoid stale
  // closures — projectItems and crmInit change often; the callbacks must
  // always see the latest values.
  const projectItemsBridgeRef = React.useRef(projectItems);
  const crmInitRef = React.useRef(crmInit);
  const appSettingsRef = React.useRef(appSettings);
  React.useEffect(function(){ projectItemsBridgeRef.current = projectItems; }, [projectItems]);
  React.useEffect(function(){ crmInitRef.current = crmInit; }, [crmInit]);
  React.useEffect(function(){ appSettingsRef.current = appSettings; }, [appSettings]);

  // ─── Pre-save flush refs (dimension-commit fix) ───────────────────────
  // Mirrors the editor's per-frame React state into refs so onRequestSave
  // can flush it into projectItems[activeFrameIdx] before serialising.
  // Fixes the bug where typing a new dimension (or any other editor field)
  // in the right-hand panel and clicking Save posted the previous
  // (template-default) value, because the local width/height/etc. useState
  // was never written back to projectItems until the user switched frames
  // or returned to the dashboard.
  //
  // saveCurrentFrameStateRef is assigned during render (below, immediately
  // after saveCurrentFrameState is defined) — useEffect would run too late
  // to keep the closure fresh for a same-tick onRequestSave call.
  //
  // currentViewRef gates the flush: it must only run when the user is
  // actually in the design-editor view ('editor'). Survey / check-measure
  // mode mutates projectItems[idx].width directly via applyDimToFrame —
  // we must NOT clobber those writes with stale editor-local useState
  // left over from a prior editor visit.
  const saveCurrentFrameStateRef = React.useRef(null);
  const activeFrameIdxRef = React.useRef(-1);
  const currentViewRef = React.useRef('dashboard');
  React.useEffect(function(){ activeFrameIdxRef.current = activeFrameIdx; }, [activeFrameIdx]);
  React.useEffect(function(){ currentViewRef.current = currentView; }, [currentView]);

  // ─── M3: multi-quote state ─────────────────────────────────────────────
  // currentQuoteId tracks the user's active quote selection. Seeded from
  // init.activeQuoteId on hydrate; diverges once the user switches quotes
  // via the dropdown or creates a new one. null = new/unsaved quote (save
  // payload echoes quoteId: null, CRM allocates the next id).
  //
  // quoteDirty tracks unsaved edits on the current quote. Flipped to true
  // whenever projectItems changes after hydration; reset to false on
  // hydrate, on new-quote, and on save. Drives the confirm-before-switch
  // guard in handleQuoteSwitch.
  //
  // activeQuoteIdRef mirrors currentQuoteId for the bridge callbacks, per
  // the same pattern as projectItemsBridgeRef / crmInitRef / appSettingsRef.
  // onRequestSave reads this instead of init.activeQuoteId so post-switch
  // saves target the selected quote, not the one the CRM originally asked for.
  const [currentQuoteId, setCurrentQuoteId] = useState(null);
  const [quoteDirty, setQuoteDirty] = useState(false);
  const activeQuoteIdRef = React.useRef(currentQuoteId);
  React.useEffect(function(){ activeQuoteIdRef.current = currentQuoteId; }, [currentQuoteId]);

  // M3: dirty-tracking. Every projectItems change flips quoteDirty to true,
  // except when the change came from a hydration / new-quote / switch —
  // those set skipNextDirtyRef to true beforehand so the effect skips once.
  // Initial mount is also skipped (the [] → [] useState default is not a
  // user edit).
  const skipNextDirtyRef = React.useRef(true);
  React.useEffect(function() {
    if (skipNextDirtyRef.current) {
      skipNextDirtyRef.current = false;
      return;
    }
    setQuoteDirty(true);
  }, [projectItems]);

  // ─── M4: survey-mode measurements ─────────────────────────────────────
  // measurementsByFrameId is a { [frameId]: { measuredWidthMm, measuredHeightMm,
  // siteNotes, photos } } map. Stored separately from projectItems because:
  //   - survey-mode data round-trips through payload.surveyData, not frame fields;
  //   - emission in surveyMeasurements[] is mode-gated (only when mode==='survey');
  //   - embedding on frames would bleed survey state into design-mode saves.
  // Photos are held internally only — spec §2.4 surveyMeasurements[] shape does
  // NOT include a photos field. Photos will be embedded in the Check Measure PDF
  // (M4b/M6). A future spec clarification may extend the payload with a
  // surveyPhotos[] slice; for now they live client-side until PDF generation.
  //
  // measurementsBridgeRef mirrors the state for the bridge callbacks, same
  // pattern as projectItemsBridgeRef / activeQuoteIdRef. onRequestSave reads
  // the ref so it always sees the user's latest edits.
  //
  // Edits to measurements flip quoteDirty via a parallel dirty-tracking effect.
  // A fresh survey hydration (M4b: from payload.surveyData) sets
  // skipNextMeasurementDirtyRef beforehand so the hydration is not treated as
  // a user edit.
  const [measurementsByFrameId, setMeasurementsByFrameId] = useState({});
  const measurementsBridgeRef = React.useRef(measurementsByFrameId);
  React.useEffect(function(){ measurementsBridgeRef.current = measurementsByFrameId; }, [measurementsByFrameId]);
  const skipNextMeasurementDirtyRef = React.useRef(true);
  React.useEffect(function() {
    if (skipNextMeasurementDirtyRef.current) {
      skipNextMeasurementDirtyRef.current = false;
      return;
    }
    setQuoteDirty(true);
  }, [measurementsByFrameId]);

  // ─── WIP29: site-checklist (project-level CM data) ────────────────────
  // siteChecklist holds the 7 sections of the printed Check Measure
  // template's site pages — access, existing conditions, measurements,
  // interiors, prep, resourcing, notes. Stored separately from
  // measurementsByFrameId because it is project-level (one entry per save,
  // not per frame), and emission in the save msg is one top-level field
  // (siteChecklist), not an array. Mirrors the measurementsBridgeRef +
  // skipNextDirtyRef pattern so onRequestSave reads the latest user edits
  // and a fresh hydration doesn't trip the dirty effect.
  const [siteChecklist, setSiteChecklist] = useState(makeBlankSiteChecklist);
  const siteChecklistBridgeRef = React.useRef(siteChecklist);
  React.useEffect(function(){ siteChecklistBridgeRef.current = siteChecklist; }, [siteChecklist]);
  const skipNextChecklistDirtyRef = React.useRef(true);
  React.useEffect(function() {
    if (skipNextChecklistDirtyRef.current) {
      skipNextChecklistDirtyRef.current = false;
      return;
    }
    setQuoteDirty(true);
  }, [siteChecklist]);

  // Project info dirty effect — when the customer name, address, phone,
  // email etc. change, mark the quote dirty so the auto-save fires and
  // the search index gets the updated values. Without this, editing a
  // customer name in the project-info modal wouldn't update the search
  // index until something else changed too. Same skip-ref pattern as
  // above so hydration / load doesn't trip it.
  const skipNextProjectInfoDirtyRef = React.useRef(true);
  React.useEffect(function() {
    if (skipNextProjectInfoDirtyRef.current) {
      skipNextProjectInfoDirtyRef.current = false;
      return;
    }
    setQuoteDirty(true);
  }, [projectInfo]);

  // ═══ Build storage (local-first second copy, separate from CRM) ═════════
  // Auto-saves the live build to localStorage 2s after the last edit.
  // Manual snapshots, search, and the Builds panel read from the same
  // SpartanBuildStorage namespace defined in 41-build-storage.js.
  //
  // The local copy is INTENDED to coexist with the CRM/Supabase save path —
  // it's a defensive backup, not a replacement. When the CRM hydrates a
  // design, we snapshot the current local state (`pre_crm_hydrate`) before
  // applying the incoming payload, so accidental clobbering can be undone.
  const [activeBuildId, setActiveBuildId] = useState(function() {
    return (window.SpartanBuildStorage && window.SpartanBuildStorage.getActiveBuildId()) || null;
  });
  const [showBuildsPanel, setShowBuildsPanel] = useState(false);
  const [showBuildSearch, setShowBuildSearch] = useState(false);
  const [buildsLastSavedTs, setBuildsLastSavedTs] = useState(0);  // refresh trigger for index display
  const [buildSaveError, setBuildSaveError] = useState(null);     // surfaced on the top bar when save fails
  const [buildSearchQuery, setBuildSearchQuery] = useState('');   // search dropdown input
  const [saveFlashAt, setSaveFlashAt] = useState(0);              // brief "Saved" indicator timestamp
  // When saveFlashAt is set, force a re-render 2 seconds later so the
  // "Saved" pill goes back to "Save". No setInterval — single-shot timer
  // each save. Cleanup cancels if the component unmounts or another
  // save lands within the window.
  React.useEffect(function() {
    if (!saveFlashAt) return;
    var t = setTimeout(function() { setSaveFlashAt(function(v){ return v === saveFlashAt ? 0 : v; }); }, 2100);
    return function() { clearTimeout(t); };
  }, [saveFlashAt]);

  // ─── Cloud auto-merge on boot ───────────────────────────────────────
  // When the app first loads, pull any builds from Supabase that aren't
  // yet in the local index. This is what makes builds saved on Device A
  // appear in Search on Device B without the user clicking anything.
  // Async + non-blocking — UI is fully responsive while this happens.
  // Only runs once per session (ref guard prevents StrictMode double-run).
  const cloudMergedRef = React.useRef(false);
  React.useEffect(function() {
    if (cloudMergedRef.current) return;
    if (!window.SpartanBuildStorage || typeof window.SpartanBuildStorage.mergeSupabaseIndex !== 'function') return;
    cloudMergedRef.current = true;
    // Defer slightly so it doesn't fight the initial CRM hydration for
    // network bandwidth. Fire-and-forget; failure is silent.
    var t = setTimeout(function() {
      window.SpartanBuildStorage.mergeSupabaseIndex().then(function(r) {
        if (r && r.ok && (r.added > 0 || r.updated > 0)) {
          if (typeof console !== 'undefined') console.log('[SpartanCAD] Cloud sync on boot: ' + r.added + ' added, ' + r.updated + ' updated.');
          setBuildsLastSavedTs(Date.now());
        }
      }).catch(function(){ /* silent */ });
    }, 1500);
    return function() { clearTimeout(t); };
  }, []);

  // Bridge ref pattern — auto-save reads the latest values via refs so the
  // debounced timer doesn't capture stale closure state.
  const buildSaveStateRef = React.useRef({});
  React.useEffect(function() {
    buildSaveStateRef.current = {
      projectItems:           projectItemsBridgeRef.current,
      measurementsByFrameId:  measurementsBridgeRef.current,
      siteChecklist:          siteChecklistBridgeRef.current,
      crmLink:                crmLink,
      activeQuoteId:          activeQuoteIdRef.current,
    };
  });

  // Build a serialisable payload from the live React state — what we
  // actually write to localStorage. Lean: no big derived data, no React
  // refs, no functions.
  function buildLocalSavePayload() {
    var s = buildSaveStateRef.current;
    var crm = s.crmLink || {};
    var pi = projectInfo || {};
    // Stitch the multi-part address into one human-readable string. The
    // search index uses this for substring matching, and the Builds panel
    // displays it on each row. Empty parts are dropped so we don't get
    // ugly trailing commas like "12 Main St, , VIC, 3000".
    var addressParts = [pi.address1, pi.address2, pi.suburb, pi.state, pi.postcode]
      .filter(function(p) { return p && String(p).trim(); })
      .map(function(p) { return String(p).trim(); });
    var addressStr = addressParts.join(', ');
    return {
      _format:               'spartan_cad_build_v1',
      _savedAt:              new Date().toISOString(),
      // Identity / search-keyable fields
      designId:              (crm.design && crm.design.id) || '',
      crmType:               crm.type || '',
      crmId:                 crm.id || '',
      activeQuoteId:         s.activeQuoteId || '',
      jobNumber:             pi.jobNumber || pi.reference || '',
      quoteNumber:           pi.quoteNumber || (typeof quoteNumber !== 'undefined' ? quoteNumber : '') || '',
      customerName:          pi.customerName || '',
      address:               addressStr,
      // Persist the address parts too so loading restores them into the
      // project-info form fields, not just the stitched string.
      address1:              pi.address1 || '',
      address2:              pi.address2 || '',
      suburb:                pi.suburb || '',
      postcode:              pi.postcode || '',
      state:                 pi.state || '',
      customerPhone:         pi.phone || '',
      customerEmail:         pi.email || '',
      reference:             pi.reference || '',
      comments:              pi.comments || '',
      propertyType:          pi.propertyType || 'brick_veneer',
      installationType:      pi.installationType || 'retrofit',
      projectName:           (typeof projectName !== 'undefined' ? projectName : '') || '',
      // Phase
      phase:                 pi.phase || 'design',
      // Build content
      projectItems:          s.projectItems || [],
      measurementsByFrameId: s.measurementsByFrameId || {},
      siteChecklist:         s.siteChecklist || null,
    };
  }

  // Resolve the build id we should write to. If we have a CRM link, use
  // its design id (canonical). Otherwise reuse the current local id, or
  // mint a new one. This is called from the auto-save effect.
  function resolveBuildIdForSave() {
    var s = buildSaveStateRef.current;
    var crm = s.crmLink;
    var crmId = window.SpartanBuildStorage.buildIdFromCrm(crm);
    if (crmId) {
      // If the user was working on a local build that's now linked, promote.
      if (activeBuildId && activeBuildId.indexOf('local_') === 0) {
        var promoted = window.SpartanBuildStorage.promoteLocalToCrm(activeBuildId, crm.design.id);
        if (promoted) setActiveBuildId(promoted);
        return promoted || crmId;
      }
      return crmId;
    }
    // No CRM link
    if (activeBuildId) return activeBuildId;
    var fresh = window.SpartanBuildStorage.newLocalBuildId();
    setActiveBuildId(fresh);
    window.SpartanBuildStorage.setActiveBuildId(fresh);
    return fresh;
  }

  // Auto-save: debounced 2 seconds after any change to projectItems,
  // measurementsByFrameId, or siteChecklist. quoteDirty is the dependency
  // because it's set by the existing dirty-tracking effects whenever the
  // user makes a change.
  React.useEffect(function() {
    if (!window.SpartanBuildStorage) return;
    if (!quoteDirty) return;
    var timer = setTimeout(function() {
      var payload, id;
      try {
        payload = buildLocalSavePayload();
        // Skip writing an empty draft — nothing useful to recover.
        if ((!payload.projectItems || payload.projectItems.length === 0)
            && Object.keys(payload.measurementsByFrameId || {}).length === 0) {
          return;
        }
        id = resolveBuildIdForSave();
        window.SpartanBuildStorage.saveBuild(id, payload);
        window.SpartanBuildStorage.setActiveBuildId(id);
        setBuildSaveError(null);
        setBuildsLastSavedTs(Date.now());
      } catch (e) {
        console.warn('Build auto-save failed:', e);
        // Friendlier message for the common quota case.
        var msg;
        if (e && e.code === 'QuotaExceededError') {
          msg = 'Local storage is full. Open Builds → Download backup, then delete old builds. Cloud save will still attempt to run.';
        } else {
          msg = (e && e.message) ? e.message : 'Local save failed';
        }
        setBuildSaveError(msg);
      }
      // Cloud mirror — runs whether the local save succeeded or failed.
      // If local succeeded the cloud is a backup; if local failed the
      // cloud might be the only successful save.
      if (typeof window.SpartanBuildStorage.syncBuildToSupabase === 'function'
          && payload && id) {
        try {
          window.SpartanBuildStorage.syncBuildToSupabase(id, payload).catch(function(){});
        } catch (e) {}
      }
    }, 2000);
    return function() { clearTimeout(timer); };
  }, [quoteDirty]);

  // Manual snapshot — user clicks "Snapshot" or a phase boundary fires.
  function makeBuildSnapshot(label, phase) {
    if (!window.SpartanBuildStorage) return null;
    try {
      var payload = buildLocalSavePayload();
      var id = activeBuildId || resolveBuildIdForSave();
      // Save the live state first so the snapshot lines up with it.
      window.SpartanBuildStorage.saveBuild(id, payload);
      var key = window.SpartanBuildStorage.saveSnapshot(id, payload, label || '', phase || 'manual');
      setBuildsLastSavedTs(Date.now());
      return key;
    } catch (e) {
      console.warn('Snapshot failed:', e);
      setBuildSaveError(e && e.message ? e.message : 'Snapshot failed');
      return null;
    }
  }

  // ─── Save (the user-visible action) ────────────────────────────────────
  // Single unified save: writes the current state locally AND, when the
  // Supabase backend is configured, also mirrors the build to the
  // cad_builds table so other devices can find it. If a CRM iframe bridge
  // is connected, also nudges the host's save flow. The local store is the
  // source of truth — it's fast, offline-capable, and the search index
  // reads from it. Supabase is the second backend for cross-device reach.
  //
  // Status semantics:
  //   localOk:    true if the localStorage write succeeded
  //   storageMissing: true if 41-build-storage.js wasn't loaded (NOT a
  //                   failure — just nothing to save TO. We don't alert.)
  //   hadCrm:     true if we successfully posted to the parent CRM frame
  //   sbQueued:   true if we kicked off a Supabase upsert (result async)
  //
  // The Save button only shows an error if localOk is false AND
  // storageMissing is false (i.e. storage exists but the write threw).
  function saveBuildNow() {
    // Commit any in-flight editor state to projectItems before saving,
    // so the saved build reflects what the user sees on screen — not the
    // last-committed state. Same fix as the Production / Price buttons.
    commitEditorStateToProject(false);
    var localOk = false;
    var storageMissing = false;
    var hadCrm = false;
    var sbQueued = false;
    var localError = null;       // captured Error from the localStorage write
    var savedPayload = null;     // hoisted so the Supabase fallback can use it
    var savedId = null;
    if (window.SpartanBuildStorage) {
      try {
        savedPayload = buildLocalSavePayload();
        savedId = resolveBuildIdForSave();
        window.SpartanBuildStorage.saveBuild(savedId, savedPayload);
        window.SpartanBuildStorage.setActiveBuildId(savedId);
        setBuildSaveError(null);
        setBuildsLastSavedTs(Date.now());
        localOk = true;

        // ─── Supabase mirror (fire-and-forget) ────────────────────────
        // Try to push to the cloud. We do NOT block the UI on this —
        // user's already seen "Saved" by the time the network round
        // trips. Failures queue for retry inside syncBuildToSupabase.
        if (typeof window.SpartanBuildStorage.syncBuildToSupabase === 'function') {
          try {
            window.SpartanBuildStorage.syncBuildToSupabase(savedId, savedPayload).then(function(r) {
              if (r && r.ok) {
                if (typeof console !== 'undefined') console.log('[SpartanCAD] Build synced to cloud:', savedId);
              } else if (r && r.reason === 'not configured') {
                // Supabase not set up. Silent — local save was enough.
              } else {
                if (typeof console !== 'undefined') console.warn('[SpartanCAD] Build cloud sync failed (queued):', r);
              }
            }).catch(function(err) {
              if (typeof console !== 'undefined') console.warn('[SpartanCAD] Build cloud sync threw:', err);
            });
            sbQueued = true;
          } catch (e) {
            if (typeof console !== 'undefined') console.warn('[SpartanCAD] Cloud sync call failed:', e);
          }
        }
      } catch (e) {
        // localStorage failed (most likely quota exceeded, or disabled
        // in private/incognito mode). Capture details for both the user-
        // visible alert and the inline error pill, then fall through to
        // try Supabase as a last-resort cloud-only save.
        console.warn('Local save failed:', e);
        localError = e;
        // Friendlier message for the common quota case.
        var msg;
        if (e && e.code === 'QuotaExceededError') {
          msg = 'Local storage full. ' +
                'Open the Builds panel to download a backup, then delete old builds. ' +
                'Cloud save will be attempted as a fallback.';
        } else if (e && e.message) {
          msg = e.message;
        } else {
          msg = 'Local save failed (unknown error)';
        }
        setBuildSaveError(msg);

        // Cloud-only fallback: even though local failed, try Supabase
        // directly. If it succeeds, the build IS persisted (just not
        // mirrored locally yet). Better than nothing.
        if (typeof window.SpartanBuildStorage.syncBuildToSupabase === 'function'
            && savedPayload && savedId) {
          try {
            window.SpartanBuildStorage.syncBuildToSupabase(savedId, savedPayload).then(function(r) {
              if (r && r.ok) {
                if (typeof console !== 'undefined') console.log('[SpartanCAD] Local failed but cloud succeeded:', savedId);
                // Treat as a successful save for the UI flash. The dirty
                // flag is cleared by the cloud save returning ok.
                setSaveFlashAt(Date.now());
                setQuoteDirty(false);
              }
            }).catch(function(){});
            sbQueued = true;
          } catch (eSb) { /* nothing more to try */ }
        }
      }
    } else {
      // 41-build-storage.js wasn't loaded. This is a deployment issue,
      // not a user-facing "save failure". We log once and skip — the CRM
      // path may still work below if connected.
      storageMissing = true;
      if (typeof console !== 'undefined' && !window._spartanStorageWarned) {
        console.warn('[SpartanCAD] Build storage module (41-build-storage.js) not loaded. Save button will only fire CRM bridge.');
        window._spartanStorageWarned = true;
      }
    }
    // CRM save — only if the bridge is wired (CRM-launched session). In
    // dev mode there's no parent frame listening, so skip silently.
    try {
      if (window.__cadBridge && typeof window.__cadBridge.requestSave === 'function') {
        window.__cadBridge.requestSave();
        hadCrm = true;
      } else if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ type: 'spartan-cad-save-request' }, '*');
          hadCrm = true;
        } catch (e) { /* cross-origin block — non-fatal */ }
      }
    } catch (e) {
      console.warn('CRM save bridge call failed:', e);
    }
    if (localOk) setQuoteDirty(false);
    if (localOk || hadCrm) {
      setSaveFlashAt(Date.now());
    }
    return {
      localOk: localOk,
      storageMissing: storageMissing,
      hadCrm: hadCrm,
      sbQueued: sbQueued,
      localError: localError,
    };
  }
  // ─── End save action ───────────────────────────────────────────────────

  // Restore from a build payload — replaces React state. Used when the
  // user clicks "Load" on a build in the Builds panel, OR when restoring
  // from a snapshot. Sets the skip flags so the dirty effects don't
  // immediately mark the restored state as dirty (which would re-save it).
  function loadBuildIntoEditor(buildId, payloadOverride) {
    if (!window.SpartanBuildStorage) return false;
    var payload = payloadOverride || window.SpartanBuildStorage.loadBuild(buildId);
    if (!payload) return false;
    // Pre-load snapshot of CURRENT state so we never lose data even if the
    // user loads the wrong build by mistake.
    if (activeBuildId && activeBuildId !== buildId) {
      try {
        var current = buildLocalSavePayload();
        if (current.projectItems && current.projectItems.length > 0) {
          window.SpartanBuildStorage.saveSnapshot(activeBuildId, current, 'Auto: before switching to ' + (payload.customerName || buildId), 'pre_switch');
        }
      } catch (e) { /* non-fatal */ }
    }
    // Set skip flags BEFORE the setState calls so the dirty effects skip.
    skipNextDirtyRef.current = true;
    skipNextMeasurementDirtyRef.current = true;
    skipNextChecklistDirtyRef.current = true;
    skipNextProjectInfoDirtyRef.current = true;
    setProjectItems(Array.isArray(payload.projectItems) ? payload.projectItems : []);
    setMeasurementsByFrameId(payload.measurementsByFrameId || {});
    if (payload.siteChecklist) setSiteChecklist(payload.siteChecklist);
    // Restore the project info (customer, address, etc.) so the search-
    // surfaced fields actually populate when a build is loaded. Without
    // this, loading a build brought back the frames but left the customer
    // name + address blank — which is what made it look like saving
    // wasn't working. We Object.assign over the existing shape so any
    // newer fields the build doesn't carry stay at their state default.
    setProjectInfo(function(prev) {
      return Object.assign({}, prev, {
        customerName:     payload.customerName     || '',
        address1:         payload.address1         || '',
        address2:         payload.address2         || '',
        suburb:           payload.suburb           || '',
        postcode:         payload.postcode         || '',
        state:            payload.state            || '',
        phone:            payload.customerPhone    || '',
        email:            payload.customerEmail    || '',
        reference:        payload.reference        || '',
        comments:         payload.comments         || '',
        propertyType:     payload.propertyType     || prev.propertyType || 'brick_veneer',
        installationType: payload.installationType || prev.installationType || 'retrofit',
        jobNumber:        payload.jobNumber        || '',
        quoteNumber:      payload.quoteNumber      || '',
      });
    });
    if (typeof setProjectName === 'function' && payload.projectName) {
      setProjectName(payload.projectName);
    }
    setActiveFrameIdx(0);
    setActiveBuildId(buildId);
    window.SpartanBuildStorage.setActiveBuildId(buildId);
    setShowBuildsPanel(false);
    setShowBuildSearch(false);
    setQuoteDirty(false);  // freshly loaded, not dirty
    return true;
  }

  // "New project" — clear the editor and start a fresh local build.
  // Snapshots the current state first if it has any content, so accidentally
  // hitting New doesn't destroy work.
  function startNewProject() {
    if (window.SpartanBuildStorage && activeBuildId) {
      try {
        var current = buildLocalSavePayload();
        if (current.projectItems && current.projectItems.length > 0) {
          window.SpartanBuildStorage.saveSnapshot(activeBuildId, current, 'Auto: before new project', 'pre_new_project');
          window.SpartanBuildStorage.saveBuild(activeBuildId, current);
        }
      } catch (e) { /* non-fatal */ }
    }
    skipNextDirtyRef.current = true;
    skipNextMeasurementDirtyRef.current = true;
    skipNextChecklistDirtyRef.current = true;
    skipNextProjectInfoDirtyRef.current = true;
    setProjectItems([]);
    setMeasurementsByFrameId({});
    setSiteChecklist(makeBlankSiteChecklist());
    // Clear customer/address details too — without this, the previous
    // job's customer info hangs around on the fresh project, which made
    // the search index look like multiple builds had the same customer.
    setProjectInfo({
      customerName: '', address1: '', address2: '', suburb: '', postcode: '', state: '',
      phone: '', email: '', reference: '', comments: '',
      propertyType: 'brick_veneer', installationType: 'retrofit',
    });
    if (typeof setProjectName === 'function') setProjectName('Project 1');
    setActiveFrameIdx(-1);
    var freshId = window.SpartanBuildStorage ? window.SpartanBuildStorage.newLocalBuildId() : null;
    setActiveBuildId(freshId);
    if (window.SpartanBuildStorage) window.SpartanBuildStorage.setActiveBuildId(freshId);
    setQuoteDirty(false);
    setShowBuildsPanel(false);
    setShowBuildSearch(false);
  }
  // ═══ End build storage ════════════════════════════════════════════════

  React.useEffect(function() {
    // ─── onInit ──────────────────────────────────────────────────────────
    __cadBridge.onInit = function(payload) {
      setCrmInit(payload);

      // ─── WIP32: project name hydration ────────────────────────────────
      // The React state default is 'Project 1' (placeholder for un-bridged
      // standalone use). When the CRM hands us a job/deal/lead, the project
      // label in the top bar should reflect the customer — Phoenix's spec is
      // explicit that the customer's name IS the project name in CAD's UX.
      // Fallback chain: customer.name → projectInfo.customerName → clientName
      // → init.projectName (job number) → 'Project'. skipNextDirtyRef guards
      // the dirty-tracking effect from flagging this hydration as user edit.
      var hydratedProjectName =
        (payload.customer && payload.customer.name)
        || (payload.projectInfo && (payload.projectInfo.customerName || payload.projectInfo.clientName))
        || payload.projectName
        || 'Project';
      if (typeof setProjectName === 'function') {
        skipNextDirtyRef.current = true;
        setProjectName(hydratedProjectName);
      }

      // M2/M3: hydrate canvas from active quote if present.
      // M3 also seeds currentQuoteId so the dropdown reflects the active
      // quote on load, and resets quoteDirty because a fresh hydration is
      // definitionally not-dirty. skipNextDirtyRef is set before
      // setProjectItems so the dirty-tracking effect ignores this change.
      //
      // WIP33: hydratedFromQuotes flag added so we can fall through to the
      // designData / projectItems hydration paths when no active quote is
      // supplied (the typical case for jobs in survey/final mode — jobs are
      // single-quote, the CRM stores the CAD save as a flat cadSurveyData
      // snapshot and sends it back as payload.designData on re-open).
      var hydratedFromQuotes = false;
      if (payload.activeQuoteId && Array.isArray(payload.quotes)) {
        var q = payload.quotes.find(function(x){ return x && x.id === payload.activeQuoteId; });
        if (q && Array.isArray(q.projectItems)) {
          skipNextDirtyRef.current = true;
          setProjectItems(q.projectItems);
          setCurrentQuoteId(payload.activeQuoteId);
          setQuoteDirty(false);
          hydratedFromQuotes = true;
        } else {
          // activeQuoteId supplied but quote not found / malformed —
          // treat as new-canvas per contract §4.1 task 4.
          setCurrentQuoteId(null);
          setQuoteDirty(false);
        }
      } else {
        // No activeQuoteId, or quotes[] missing — fall through to
        // designData/projectItems hydration (WIP33) before defaulting to
        // a blank canvas.
        setCurrentQuoteId(null);
        setQuoteDirty(false);
      }

      // ─── WIP33: designData / projectItems fallback hydration ─────────
      // The contract (§2) lists THREE possible projectItems sources in the
      // init payload:
      //   1. payload.quotes[activeQuoteId].projectItems  — handled above
      //   2. payload.designData.projectItems             — full save snapshot
      //                                                    (jobs in survey/
      //                                                    final mode use this)
      //   3. payload.projectItems                        — direct top-level
      //                                                    convenience field
      // Without this fallback, jobs opened in survey mode show a blank
      // canvas because there is no quotes[] for jobs (they're single-quote).
      // Original WIP7 patch (e345d50a, 19 Apr 2026) added this for the
      // previous CAD lineage; it never made it into the v2.0 WIP31 base.
      if (!hydratedFromQuotes) {
        var fallbackItems = null;
        if (payload.designData && Array.isArray(payload.designData.projectItems) && payload.designData.projectItems.length > 0) {
          fallbackItems = payload.designData.projectItems;
        } else if (Array.isArray(payload.projectItems) && payload.projectItems.length > 0) {
          fallbackItems = payload.projectItems;
        }
        if (fallbackItems) {
          // ─── WIP35 (FSO): finalData overlay for resume ──────────────
          // CAD_FSO_HANDOFF.md §2 specifies that when re-opening an FSO
          // job after a partial save, the SM's prior edits live in
          // payload.finalData.projectItems. We use finalData as the
          // canvas state (it's the SM's authoritative last save), but
          // defensively pin W×H to designData by id — the FSO contract
          // marks dimensions immutable post-CM, and we don't trust
          // finalData to honour that on its own (legacy / hand-tampered
          // payloads would otherwise be able to drift dims here).
          //
          // Frames present in finalData but not in designData are
          // dropped (per spec §2 last paragraph: "Frames in finalData
          // not present in designData are ignored").
          if (payload.mode === 'final'
              && payload.finalData
              && Array.isArray(payload.finalData.projectItems)
              && payload.finalData.projectItems.length > 0) {
            var dimsByDesignId = {};
            fallbackItems.forEach(function(df) {
              if (df && df.id) dimsByDesignId[df.id] = { width: df.width, height: df.height };
            });
            var overlaid = payload.finalData.projectItems
              .filter(function(ff) { return ff && ff.id && dimsByDesignId[ff.id]; })
              .map(function(ff) {
                var dims = dimsByDesignId[ff.id];
                return Object.assign({}, ff, { width: dims.width, height: dims.height });
              });
            if (overlaid.length > 0) {
              fallbackItems = overlaid;
            }
          }
          skipNextDirtyRef.current = true;
          setProjectItems(fallbackItems);
        }
      }

      // ─── M4: survey measurements hydration ───────────────────────────
      // When CRM re-opens a job for Check Measure after a prior save, the
      // init payload carries payload.surveyData = [{ frameId, measuredWidthMm,
      // measuredHeightMm, siteNotes, ... }, ...] (the same shape CAD emits in
      // surveyMeasurements[]). We hydrate measurementsByFrameId from it so
      // the surveyor can resume where they left off. skipNextMeasurementDirtyRef
      // suppresses the dirty-effect on this hydration, matching the
      // skipNextDirtyRef pattern for projectItems.
      //
      // Photos are not part of the wire shape (see comment at measurement
      // state declaration) — they start fresh on every open in M4a.
      //
      // WIP29: hydration extended to cover the printed-template per-frame
      // fields (handle ×2, height offset, depth, reveal, trim ×8, 3 flags).
      // Wire shape uses nested trimInternal/trimExternal objects; state
      // uses 8 flat keys — translation happens here on read, mirrored on
      // emit in onRequestSave's surveyMeasurements builder.
      if (Array.isArray(payload.surveyData) && payload.surveyData.length > 0) {
        var map = {};
        payload.surveyData.forEach(function(entry) {
          if (!entry || !entry.frameId) return;
          var nestInt = (entry.trimInternal && typeof entry.trimInternal === 'object') ? entry.trimInternal : {};
          var nestExt = (entry.trimExternal && typeof entry.trimExternal === 'object') ? entry.trimExternal : {};
          // Normalise tri-state flag values: incoming may be true/false/null/undefined
          // (wire shape) — translate back to 'yes'/'no'/'' for radio-input compat.
          var flagToRadio = function(v) {
            if (v === true) return 'yes';
            if (v === false) return 'no';
            return '';
          };
          // Numeric fields: incoming number → string for text input; null/undefined → ''.
          var numToText = function(v) {
            return (typeof v === 'number' && isFinite(v)) ? String(v) : '';
          };
          map[entry.frameId] = {
            measuredWidthMm: (typeof entry.measuredWidthMm === 'number') ? entry.measuredWidthMm : null,
            measuredHeightMm: (typeof entry.measuredHeightMm === 'number') ? entry.measuredHeightMm : null,
            siteNotes: entry.siteNotes || '',
            photos: [],
            handleColourInternal: entry.handleColourInternal || '',
            handleColourExternal: entry.handleColourExternal || '',
            handleHeightOffsetMm: numToText(entry.handleHeightOffsetMm),
            windowDepthMm: numToText(entry.windowDepthMm),
            revealType: entry.revealType || '',
            trimInternalTop:    nestInt.top    || '',
            trimInternalLeft:   nestInt.left   || '',
            trimInternalRight:  nestInt.right  || '',
            trimInternalBottom: nestInt.bottom || '',
            trimExternalTop:    nestExt.top    || '',
            trimExternalLeft:   nestExt.left   || '',
            trimExternalRight:  nestExt.right  || '',
            trimExternalBottom: nestExt.bottom || '',
            trimInternalAllSame: !!entry.trimInternalAllSame,
            trimExternalAllSame: !!entry.trimExternalAllSame,
            designChange:    flagToRadio(entry.designChange),
            frostedGlass:    flagToRadio(entry.frostedGlass),
            tasOakThreshold: flagToRadio(entry.tasOakThreshold),
          };
        });
        skipNextMeasurementDirtyRef.current = true;
        setMeasurementsByFrameId(map);
      } else {
        // No surveyData on the payload. PRESERVE existing measurements
        // when present — this is the common case for the dev-mode survey
        // toggle (which sends no surveyData) and for any future scenario
        // where the host re-emits onInit without resending all the data
        // (e.g. mode switch). Only fall through to a clean slate if we
        // genuinely have nothing — and even then, try the local build
        // store first so survey work survives page refreshes.
        var existingMeasurements = measurementsBridgeRef.current || {};
        var hasExisting = existingMeasurements && Object.keys(existingMeasurements).length > 0;
        if (hasExisting) {
          // Already have measurements — keep them. No state change needed,
          // but we still flip the skip ref so the next dirty-tracking pass
          // doesn't treat this as a fresh user edit.
          skipNextMeasurementDirtyRef.current = true;
        } else if (window.SpartanBuildStorage) {
          // Try to hydrate from local build storage. We can't use
          // activeBuildId here directly since the React state may not
          // have settled yet on the first onInit call — go through the
          // storage layer's getActiveBuildId() which is sync.
          var liveActiveId = window.SpartanBuildStorage.getActiveBuildId();
          var liveBuild = liveActiveId ? window.SpartanBuildStorage.loadBuild(liveActiveId) : null;
          if (liveBuild && liveBuild.measurementsByFrameId && Object.keys(liveBuild.measurementsByFrameId).length > 0) {
            skipNextMeasurementDirtyRef.current = true;
            setMeasurementsByFrameId(liveBuild.measurementsByFrameId);
          } else {
            skipNextMeasurementDirtyRef.current = true;
            setMeasurementsByFrameId({});
          }
        } else {
          skipNextMeasurementDirtyRef.current = true;
          setMeasurementsByFrameId({});
        }
      }

      // ─── WIP29: site-checklist hydration ─────────────────────────────
      // payload.siteChecklist (when present) has the same flat shape as
      // makeBlankSiteChecklist returns. We Object.assign onto the blank to
      // preserve any new fields a future CAD adds that this CRM payload
      // doesn't yet know about. skipNextChecklistDirtyRef suppresses the
      // dirty effect on hydration.
      if (payload.siteChecklist && typeof payload.siteChecklist === 'object') {
        skipNextChecklistDirtyRef.current = true;
        setSiteChecklist(Object.assign(makeBlankSiteChecklist(), payload.siteChecklist));
      } else {
        // No siteChecklist on the payload. Same preservation logic as
        // measurements — keep what we already have if anything; otherwise
        // try the local store before resetting to blank.
        var existingChecklist = siteChecklistBridgeRef.current;
        var checklistHasContent = existingChecklist && Object.keys(existingChecklist).some(function(k) {
          var v = existingChecklist[k];
          if (v == null || v === '' || v === false) return false;
          if (typeof v === 'object' && Object.keys(v).length === 0) return false;
          return true;
        });
        if (checklistHasContent) {
          skipNextChecklistDirtyRef.current = true;
          // No state change needed — keep current.
        } else if (window.SpartanBuildStorage) {
          var liveActiveId2 = window.SpartanBuildStorage.getActiveBuildId();
          var liveBuild2 = liveActiveId2 ? window.SpartanBuildStorage.loadBuild(liveActiveId2) : null;
          if (liveBuild2 && liveBuild2.siteChecklist) {
            skipNextChecklistDirtyRef.current = true;
            setSiteChecklist(Object.assign(makeBlankSiteChecklist(), liveBuild2.siteChecklist));
          } else {
            skipNextChecklistDirtyRef.current = true;
            setSiteChecklist(makeBlankSiteChecklist());
          }
        } else {
          skipNextChecklistDirtyRef.current = true;
          setSiteChecklist(makeBlankSiteChecklist());
        }
      }
    };

    // ─── onRequestSave ───────────────────────────────────────────────────
    // Builds a minimal spartan-cad-save per CRM spec §2.4. M1 payload is
    // deliberately skeletal: totals are zeros (time estimation → M2), PDFs
    // omitted (→ M6), surveyMeasurements wired in M4 (this milestone).
    // The core round-trip is the contract; richer payloads attach over
    // later milestones.
    __cadBridge.onRequestSave = function() {
      // ─── Pre-save flush of in-flight editor state ──────────────────────
      // Without this, any width/height/colour/glass/etc. field the user
      // typed in the right-hand DIMENSIONS / OPTIONS panel but didn't blur
      // stays trapped in local React state until they switch frames or
      // return to the dashboard. Save would then post stale values
      // (template defaults for fresh frames; the previous value otherwise).
      //
      // Gated on currentView === 'editor' because that's the ONLY view
      // where the design-mode local-state inputs are rendered. In
      // survey/check-measure mode, applyDimToFrame writes measured W/H
      // straight into projectItems[idx].width — a flush here would clobber
      // those writes with the stale editor-local width/height useState
      // left over from an earlier editor visit. See saveCurrentFrameState
      // and the ref declarations above for context.
      try {
        var _patchView = currentViewRef.current;
        var _patchIdx  = activeFrameIdxRef.current;
        var _patchSnap = saveCurrentFrameStateRef.current;
        if (_patchView === 'editor'
            && typeof _patchSnap === 'function'
            && _patchIdx >= 0) {
          var _patchCurrent = projectItemsBridgeRef.current || [];
          if (_patchIdx < _patchCurrent.length) {
            var _patchSnapState = _patchSnap();
            var _patchNext = _patchCurrent.slice();
            _patchNext[_patchIdx] = Object.assign({}, _patchNext[_patchIdx], _patchSnapState);
            // Update the ref synchronously so the very next line
            // (var items = projectItemsBridgeRef.current...) sees the
            // flushed values without waiting for React to commit.
            projectItemsBridgeRef.current = _patchNext;
            setProjectItems(_patchNext);
          }
        }
      } catch (e) { /* never block save on a flush hiccup */ }

      var init = crmInitRef.current || {};
      var items = projectItemsBridgeRef.current || [];
      var settings = appSettingsRef.current || null;
      var mode = init.mode || 'design';

      // M2: per-frame enrichment with install + production minutes.
      // We call estimateStationTimes twice per frame (once in .map, once in
      // .forEach). This is intentional — the clearer version is preferred
      // over the micro-optimisation of stashing station times on the
      // enriched frames. Revisit only if profiling shows it matters.
      var enrichedItems = items.map(function(f) {
        var im = estimateInstallMinutes(f, settings);
        var st = estimateStationTimes(f, settings);
        var pm = 0;
        for (var k in st) if (st.hasOwnProperty(k)) pm += st[k];
        return Object.assign({}, f, {
          installMinutes: im,
          productionMinutes: Math.round(pm)
        });
      });
      var totalInstall = 0, totalProd = 0;
      var stationSums = {
        S1_saw: 0, S2_steel: 0, S4A_cnc: 0, S4B_screw: 0, S_weld: 0,
        S_clean: 0, S5_hw: 0, S6_reveal: 0, S7_fly: 0, S_qc: 0, S_disp: 0
      };
      enrichedItems.forEach(function(f) {
        totalInstall += f.installMinutes;
        totalProd += f.productionMinutes;
        var st = estimateStationTimes(f, settings);
        for (var k in stationSums) if (stationSums.hasOwnProperty(k)) stationSums[k] += (st[k] || 0);
      });

      // ─── WIP14: per-save (per-job) overhead ───────────────────────────────
      // moveStillage fires once per save (per customer order), not per frame.
      // The stored time IS the per-job share — the user back-calculates from
      // their shop reality (e.g. 1 min per stillage move ÷ 3 jobs per stillage
      // ≈ 0.33 min/job). We add it directly to totals once per save so
      // per-frame productionMinutes stays clean ("time for this frame alone").
      // Skipped when items.length === 0 (empty save shouldn't be billed any
      // overhead). Same pattern will apply to S_dispatch.palletise when that
      // op gets wired up.
      if (items.length > 0) {
        var _pc = (settings && settings.pricingConfig)
               || (typeof window !== 'undefined' && window.PRICING_DEFAULTS)
               || null;
        var _s1 = _pc && _pc.stations && _pc.stations.S1_profileSaw;
        if (_s1 && _s1.ops && _s1.ops.moveStillage) {
          var _stillageMin = +_s1.ops.moveStillage.t || 0;
          stationSums.S1_saw += _stillageMin;
          totalProd          += _stillageMin;
        }
      }

      // ─── M6b: required-fields pre-save validation (spec §12 scenario 7) ─
      // Any frame missing a required design field fails the save with a
      // specific reason. Applies to all modes — a frame without glassSpec
      // (or width / height / colour / openStyle / hardwareColour) is
      // unsaveable regardless of mode. Runs BEFORE the survey-mode
      // measurement check so spec-level frame validity is gated first.
      var requiredFields = ['width', 'height', 'colour', 'openStyle', 'glassSpec', 'hardwareColour'];
      var invalidFrames = [];
      items.forEach(function(f, idx) {
        var missingFields = requiredFields.filter(function(k) {
          var v = f[k];
          if (k === 'width' || k === 'height') {
            return typeof v !== 'number' || v <= 0;
          }
          return !v;
        });
        if (missingFields.length > 0) {
          invalidFrames.push({ name: f.name || ('Frame ' + (idx + 1)), missing: missingFields });
        }
      });
      if (invalidFrames.length > 0) {
        var firstInvalid = invalidFrames[0];
        var invalidReason = invalidFrames.length === 1
          ? firstInvalid.name + ' missing: ' + firstInvalid.missing.join(', ')
          : invalidFrames.length + ' frames have missing required fields (' + firstInvalid.name + ': ' + firstInvalid.missing.join(', ') + ', …)';
        postToCrm({ type: 'spartan-cad-save-error', reason: invalidReason });
        return;
      }

      // ─── M4: survey-mode pre-save validation ────────────────────────
      // Contract §4.3 + spec §6.2: save button must show "Missing
      // measurements: N of M frames" until all frames have both measured
      // width and height. Here we translate that gate into a save-error
      // emission so the CRM surfaces the blocker via its toast channel
      // (§2.5). The save-button count label itself is rendered from the
      // same missing-count computation — see the derived memo below.
      if (mode === 'survey') {
        var measMap = measurementsBridgeRef.current || {};
        var missing = 0;
        items.forEach(function(f) {
          var m = measMap[f.id];
          if (!m || typeof m.measuredWidthMm !== 'number' || typeof m.measuredHeightMm !== 'number') {
            missing += 1;
          }
        });
        if (missing > 0) {
          postToCrm({
            type: 'spartan-cad-save-error',
            reason: 'Missing measurements: ' + missing + ' of ' + items.length + ' frame' + (items.length === 1 ? '' : 's')
          });
          return;
        }
      }

      // M6: totalPrice aggregation via calculateFramePrice (contract §5.2).
      // Defensive typeof checks keep this safe across renames/refactors of
      // the React closure's scope; silent failure per frame emits a partial
      // total rather than a zeroed one.
      var salesTotal = 0;
      try {
        (items || []).forEach(function(f) {
          try {
            var fp = (typeof calculateFramePrice === 'function')
              ? calculateFramePrice(f, (typeof appSettings !== 'undefined' && appSettings && appSettings.pricingConfig) || null)
              : null;
            if (fp) {
              // M6b §6.1 fix: use canonical React state name selectedPriceList
              // (was selectedPriceListId — that's the param name inside
              // buildCadDataCache, not the useState binding at L8776).
              var pl = (typeof selectedPriceList !== 'undefined' && selectedPriceList) ? selectedPriceList : 'trade';
              salesTotal += (fp.priceLists && fp.priceLists[pl]) || fp.fullCost || 0;
            }
          } catch (e) { /* skip broken frame */ }
        });
      } catch (e) { /* nop */ }

      var msg = {
        type: 'spartan-cad-save',
        mode: mode,
        entityType: init.entityType || null,
        entityId: init.entityId || null,
        quoteId: activeQuoteIdRef.current || null,   // M3: reads the user's current selection, not the initial payload's activeQuoteId. null = new-quote.
        projectItems: enrichedItems,            // per-frame installMinutes/productionMinutes attached
        totalPrice: +salesTotal.toFixed(2),     // M6: aggregated via calculateFramePrice, pricelist-aware
        quoteNumber: quoteNumber,               // M3: existing CAD-generated Q-YYYY-NNNN label
        projectName: init.projectName || null,
        totals: {
          installMinutes: Math.round(totalInstall),
          productionMinutes: Math.round(totalProd),
          stationTimes: (function(){
            // Round each key once at emission. Per-frame contributions are
            // integer already (from estimateStationTimes); the per-save
            // amortised shares are fractional and only collapse to int here.
            var out = {};
            for (var _k in stationSums) if (stationSums.hasOwnProperty(_k)) out[_k] = Math.round(stationSums[_k]);
            return out;
          })(),
        },
        savedAt: new Date().toISOString(),
      };

      // ─── M4 + WIP29: surveyMeasurements[] emission ───────────────────
      // Only populate in survey mode (spec §2.4: "undefined otherwise").
      //
      // Per-element wire shape (post-WIP29):
      //   {
      //     frameId, measuredWidthMm, measuredHeightMm, siteNotes,
      //     handleColourInternal, handleColourExternal,        // strings|null
      //     handleHeightOffsetMm, windowDepthMm,                // numbers|null
      //     revealType,                                          // string|null
      //     trimInternal: { top, left, right, bottom } | null,
      //     trimExternal: { top, left, right, bottom } | null,
      //     designChange, frostedGlass, tasOakThreshold,         // bool|null
      //   }
      //
      // Translation rules:
      //   - Empty strings collapse to null (no value entered).
      //   - Numeric text fields parse to Number; non-finite → null.
      //   - Trim objects emit null when ALL four sides are unset (cleaner
      //     CRM merge semantics than {top:null,left:null,...}).
      //   - 'yes'/'no' radios emit true/false; '' → null.
      //
      // Photos remain excluded from the wire shape (spec §2.4) — embedded
      // in pdfs.checkMeasure only.
      if (mode === 'survey') {
        var measMap2 = measurementsBridgeRef.current || {};
        var emptyToNull = function(s) { return (s === '' || s == null) ? null : s; };
        var textToNum = function(s) {
          if (s === '' || s == null) return null;
          var n = Number(s);
          return isFinite(n) ? n : null;
        };
        var radioToBool = function(s) {
          if (s === 'yes') return true;
          if (s === 'no')  return false;
          return null;
        };
        var trimObj = function(t, l, r, b) {
          var anySet = (t || l || r || b);
          if (!anySet) return null;
          return {
            top:    t || null,
            left:   l || null,
            right:  r || null,
            bottom: b || null,
          };
        };
        msg.surveyMeasurements = items.map(function(f) {
          var m = measMap2[f.id] || {};
          return {
            frameId: f.id,
            measuredWidthMm: (typeof m.measuredWidthMm === 'number') ? m.measuredWidthMm : null,
            measuredHeightMm: (typeof m.measuredHeightMm === 'number') ? m.measuredHeightMm : null,
            siteNotes: m.siteNotes || '',
            handleColourInternal:  emptyToNull(m.handleColourInternal),
            handleColourExternal:  emptyToNull(m.handleColourExternal),
            handleHeightOffsetMm:  textToNum(m.handleHeightOffsetMm),
            windowDepthMm:         textToNum(m.windowDepthMm),
            revealType:            emptyToNull(m.revealType),
            trimInternal: trimObj(m.trimInternalTop, m.trimInternalLeft, m.trimInternalRight, m.trimInternalBottom),
            trimExternal: trimObj(m.trimExternalTop, m.trimExternalLeft, m.trimExternalRight, m.trimExternalBottom),
            trimInternalAllSame: !!m.trimInternalAllSame,
            trimExternalAllSame: !!m.trimExternalAllSame,
            designChange:    radioToBool(m.designChange),
            frostedGlass:    radioToBool(m.frostedGlass),
            tasOakThreshold: radioToBool(m.tasOakThreshold),
          };
        });

        // ─── WIP29: siteChecklist emission ──────────────────────────────
        // Project-level — single top-level field. Emitted as the live state
        // shape (booleans, radio strings, free-text) since the consumer
        // (CRM) defines the canonical schema in its own spec; flag fields
        // stay '' rather than null to match the input convention. CRM
        // should accept extra/missing keys gracefully (per contract §12).
        msg.siteChecklist = Object.assign({}, siteChecklistBridgeRef.current || makeBlankSiteChecklist());
      }

      // ─── trimCutList emission (Factory CRM production handoff) ───────
      // Lifted out of the survey-only branch in WIP38 so design-mode and
      // final-mode saves AFTER check measure also re-emit the trim cuts.
      // The measurementsByFrameId map is captured in survey mode and
      // persists in React state across mode transitions, so any save
      // post-CM still has the trim selections to compute against. Saves
      // before CM produce an empty cuts array — harmless on the CRM side
      // (Production view simply renders nothing until CM lands data).
      //
      // Full computed cutting list with frame colour info per cut. Per
      // Phoenix's spec: top/bottom = W+200mm, left/right = H+200mm, applied
      // to ALL trim selections (catalog SKUs and legacy dictionary codes).
      // Per cut: frameId, frame name, frame colours (ext+int, id+label),
      // surface, side, length, trim value/label, catalog flags, bar length.
      // Per byTrim aggregate: label, totals, bars-required estimate.
      // Wrapped in try/catch so a computation glitch never blocks the save.
      try {
        var _measMapForCuts = measurementsBridgeRef.current || {};
        var _pcForCuts = (appSettings && appSettings.pricingConfig) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS) || {};
        var _trimCatalogsForCuts = (_pcForCuts && _pcForCuts.trims) || null;
        msg.trimCutList = computeTrimCuts(items, _measMapForCuts, _trimCatalogsForCuts, 200, appSettings);
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('trimCutList emit failed (non-blocking):', e);
        msg.trimCutList = null;
      }

      // ─── M4b: pdfs.checkMeasure emission (contract §6, §9.5 task 7) ──
      // Async branch — generateCheckMeasurePdfBlob returns a Blob; we must
      // FileReader.readAsDataURL it to base64 before posting. Design-mode
      // saves stay synchronous (no pdfs payload until M6 wires quote PDF).
      // On PDF failure we still emit the save so surveyMeasurements[] is
      // never blocked by a PDF bug — the PDF is a convenience artifact
      // alongside the canonical data channel, not its replacement.
      if (mode === 'survey') {
        try {
          var cmFilename = 'CM_' + (
            (init.projectInfo && (init.projectInfo.jobNumber || init.projectInfo.projectNumber)) ||
            (init.job && init.job.number) ||
            'job'
          ) + '.pdf';
          generateCheckMeasurePdfBlob({
            projectInfo: init.projectInfo || init.project || {},
            projectItems: items,
            measurementsByFrameId: measurementsBridgeRef.current || {},
            // WIP30: pass siteChecklist + the FULL trims map (all families) so
            // the PDF can resolve any catalog item id back to a colour label.
            siteChecklist: siteChecklistBridgeRef.current || makeBlankSiteChecklist(),
            trimCatalogs: (
              (appSettings && appSettings.pricingConfig && appSettings.pricingConfig.trims)
              || (window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.trims)
              || null
            ),
            jobNumber: (init.projectInfo && (init.projectInfo.jobNumber || init.projectInfo.projectNumber)) || (init.job && init.job.number) || '',
            customerName: (init.projectInfo && (init.projectInfo.customerName || init.projectInfo.clientName)) || (init.customer && init.customer.name) || '',
            customerAddress: (init.projectInfo && (init.projectInfo.siteAddress || init.projectInfo.customerAddress)) || (init.customer && (init.customer.address || init.customer.siteAddress)) || '',
            // WIP32: extra client-detail fields for CM PDF header. Phone/email
            // come straight off init.customer (contract §2). projectName is the
            // customer-name-as-display-title (matches the in-app top-bar label
            // Phoenix wants surfaced as the document's primary heading).
            customerPhone: (init.customer && (init.customer.phone || init.customer.mobile)) || (init.projectInfo && init.projectInfo.customerPhone) || '',
            customerEmail: (init.customer && init.customer.email) || (init.projectInfo && init.projectInfo.customerEmail) || '',
            projectName: (init.customer && init.customer.name) || (init.projectInfo && (init.projectInfo.customerName || init.projectInfo.clientName)) || init.projectName || '',
            // WIP34: pass already-computed cut list through to the PDF generator
            // so the rendered cut list and the wire-payload's trimCutList come
            // from the same source. msg.trimCutList was set above (L12772 in
            // WIP33 numbering) inside the same survey-mode branch — safe to
            // reference here.
            trimCutList: msg.trimCutList || null,
          }).then(function(cmBlob) {
            var rd = new FileReader();
            rd.onload = function() {
              var dataUrl = String(rd.result || '');
              var commaIdx = dataUrl.indexOf(',');
              var b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
              msg.pdfs = Object.assign({}, msg.pdfs || {}, { checkMeasure: { filename: cmFilename, base64: b64 } });
              postToCrm(msg);
              setQuoteDirty(false);
            };
            rd.onerror = function() {
              // PDF read failed — emit save without pdfs.checkMeasure.
              postToCrm(msg);
              setQuoteDirty(false);
            };
            rd.readAsDataURL(cmBlob);
          }).catch(function(err) {
            if (typeof console !== 'undefined') console.warn('CM PDF generation failed, posting save without pdfs.checkMeasure:', err);
            postToCrm(msg);
            setQuoteDirty(false);
          });
          return; // async path owns the post/dirty-clear
        } catch (err) {
          if (typeof console !== 'undefined') console.warn('CM PDF generation failed, posting save without pdfs.checkMeasure:', err);
          // Fall through to synchronous post below.
        }
      }

      // ─── M5: pdfs.finalDesign emission (contract §6, §9.6 task 5) ──
      // Mirrors the M4b checkMeasure branch above — same async FileReader
      // pattern, same blob→base64 conversion, same error-fallthrough policy
      // (save emits even if the PDF scaffold fails; finalDesign is a
      // convenience artifact, not the canonical data channel). Mode gate
      // swapped to 'final', generator swapped to generateFinalDesignPdfBlob,
      // filename prefix swapped to 'Final_'. M6 refactor: unify both branches
      // into a "build all applicable PDFs → Promise.all the reads → single
      // post" helper. Until then, the two branches are mutually exclusive
      // (mode is exactly one of 'survey' / 'final' / 'design' at a time), so
      // duplicating the pattern is safe.
      if (mode === 'final') {
        try {
          var fdBlob = generateFinalDesignPdfBlob({
            projectInfo: init.projectInfo || init.project || {},
            projectItems: items,
            surveyData: init.surveyData || [],
            jobNumber: (init.projectInfo && (init.projectInfo.jobNumber || init.projectInfo.projectNumber)) || (init.job && init.job.number) || '',
            customerName: (init.projectInfo && (init.projectInfo.customerName || init.projectInfo.clientName)) || (init.customer && init.customer.name) || '',
            customerAddress: (init.projectInfo && (init.projectInfo.siteAddress || init.projectInfo.customerAddress)) || (init.customer && (init.customer.address || init.customer.siteAddress)) || '',
            // WIP35 (FSO): mirror the WIP32 CM PDF ctx fields so the redesigned
            // FSO header can show phone/email/sales manager alongside the
            // job number. Falls back through customer → projectInfo for each.
            customerPhone: (init.customer && (init.customer.phone || init.customer.mobile)) || (init.projectInfo && init.projectInfo.customerPhone) || '',
            customerEmail: (init.customer && init.customer.email) || (init.projectInfo && init.projectInfo.customerEmail) || '',
            projectName: (init.customer && init.customer.name) || (init.projectInfo && (init.projectInfo.customerName || init.projectInfo.clientName)) || init.projectName || '',
            salesManager: (init.projectInfo && init.projectInfo.salesManager) || '',
          });
          var fdFilename = 'Final_' + (
            (init.projectInfo && (init.projectInfo.jobNumber || init.projectInfo.projectNumber)) ||
            (init.job && init.job.number) ||
            'job'
          ) + '.pdf';
          var rdFd = new FileReader();
          rdFd.onload = function() {
            var dataUrl = String(rdFd.result || '');
            var commaIdx = dataUrl.indexOf(',');
            var b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
            msg.pdfs = Object.assign({}, msg.pdfs || {}, { finalDesign: { filename: fdFilename, base64: b64 } });
            postToCrm(msg);
            setQuoteDirty(false);
          };
          rdFd.onerror = function() {
            // PDF read failed — emit save without pdfs.finalDesign.
            postToCrm(msg);
            setQuoteDirty(false);
          };
          rdFd.readAsDataURL(fdBlob);
          return; // async path owns the post/dirty-clear
        } catch (err) {
          if (typeof console !== 'undefined') console.warn('Final Design PDF scaffold failed, posting save without pdfs.finalDesign:', err);
          // Fall through to synchronous post below.
        }
      }

      postToCrm(msg);
      // M3: save clears dirty flag. The user now has no unsaved edits on
      // this quote. quoteDirty will flip back to true on the next
      // projectItems or measurementsByFrameId change.
      setQuoteDirty(false);
    };

    // ─── Replay pre-mount init ───────────────────────────────────────────
    // If CRM fired spartan-cad-init before React mounted, the dispatcher
    // stashed it in __cadBridge.lastInit. Replay it now so the payload
    // reaches React state. The spartan-cad-ready has already been posted
    // by the dispatcher at message time; we don't re-post.
    if (__cadBridge.lastInit) {
      setCrmInit(__cadBridge.lastInit);
    }

    return function() {
      __cadBridge.onInit = null;
      __cadBridge.onRequestSave = null;
    };
  }, []);

  // ═══ CRM BOOTSTRAP ════════════════════════════════════════════════════════
  // Runs once on mount. Reads URL params; if an entity handoff is present AND
  // Supabase is configured, loads context and either loads or creates the
  // draft design. If either is missing, CAD runs standalone.
  // Also detects the ?sign=<token> route which renders a separate anonymous
  // signing page — no normal CAD bootstrap.
  React.useEffect(function() {
    var cancelled = false;

    // ─── Signing-page route (anonymous, no entity handoff) ───────────────────
    var urlSignToken = (function(){
      try {
        var qp = new URLSearchParams(window.location.search);
        return qp.get('sign') || null;
      } catch (e) { return null; }
    })();
    if (urlSignToken) {
      setSigningToken(urlSignToken);
      (async function(){
        if (!sbConfigured()) { setCrmBooted(true); return; }
        var rec = await loadSignatureByToken(urlSignToken);
        if (cancelled) return;
        setSignatureRecord(rec);
        // Mark as viewed (spec §6.5 step 4)
        try {
          var client = sb();
          if (client && rec && rec.status === 'sent') {
            await client.from('design_signatures').update({
              status: 'viewed', viewed_at: new Date().toISOString(),
            }).eq('signing_token', urlSignToken);
          }
        } catch (e) {}
        setCrmBooted(true);
      })();
      return function(){ cancelled = true; };
    }

    setCrmConfigured(sbConfigured());
    // v2.0: legacy URL-parameter handoff retired (contract §9.2 task 3;
    // the dependent 80-line IIFE below it was deleted in M2). CAD is now
    // iframe-embedded and receives its context via `spartan-cad-init` —
    // see handleCrmMessage at top-level and the __cadBridge.onInit
    // wiring inside this component. The Supabase helpers that the old
    // IIFE called (fetchEntityContext, loadOrCreateDesign,
    // designItemRowToFrame) are retained as top-level functions for
    // potential re-entry in Phase 2; they're currently only reachable
    // via their window.* exports.
    setCrmBooted(true);
    return function() { cancelled = true; };
  }, []);

  // ═══ DEBOUNCED AUTOSAVE ═══════════════════════════════════════════════════
  // Watches the project state; any change triggers a 1.5s debounce then a
  // write to Supabase (designs + design_items + entity cad_data). Skipped in
  // standalone mode — there's nothing to sync to. Also skipped in read-only
  // (view) mode — spec §3.1 forbids mutation of designs opened via mode=view.
  React.useEffect(function() {
    if (!crmBooted) return;
    if (!crmLink || !crmLink.design) return;
    if (isReadOnly) return;
    var timer = setTimeout(async function() {
      setSyncStatus('saving');
      setSyncError(null);
      try {
        var res = await saveDesignAndItems(
          crmLink.design.id, crmLink.type, crmLink.id,
          projectItems, appSettings, selectedPriceList,
          { status: crmLink.design.status || 'draft', stage: crmLink.design.stage || 'design' },
          measurementsByFrameId
        );
        if (res.ok) {
          setSyncStatus(res.offline ? 'offline' : 'saved');
          setLastSavedAt(new Date());
          // v2.0: legacy `design_created` and `design_saved` postMessage
          // emissions removed. The CRM↔CAD surface is now the `spartan-cad-*`
          // protocol only (see handleCrmMessage). The internal Supabase
          // autosave above is unchanged — only the outbound notifications
          // to a CRM opener are gone.
        } else {
          setSyncStatus('offline');
          setSyncError(res.error && res.error.message || 'queued for retry');
        }
        setPendingWrites(pendingCount());
      } catch (e) {
        setSyncStatus('error');
        setSyncError(e && e.message || String(e));
        setPendingWrites(pendingCount());
      }
    }, 1500);
    return function() { clearTimeout(timer); };
  }, [crmBooted, projectItems, projectAncillaries, projectPromotions, selectedPriceList, crmLink, isReadOnly]);

  // ═══ RECONNECT / FLUSH QUEUE ══════════════════════════════════════════════
  // When the browser goes online again OR periodically every 30s, attempt to
  // flush any queued writes from localStorage.
  React.useEffect(function() {
    var flushing = false;
    async function tryFlush() {
      if (flushing) return;
      if (pendingCount() === 0) { setPendingWrites(0); return; }
      if (!crmConfigured) return;
      flushing = true;
      try {
        var r = await flushPendingWrites();
        setPendingWrites(pendingCount());
        if (pendingCount() === 0) setSyncStatus('saved');
      } catch (e) { /* swallow — will try again */ }
      flushing = false;
    }
    tryFlush();
    window.addEventListener('online', tryFlush);
    var id = setInterval(tryFlush, 30000);
    return function() { window.removeEventListener('online', tryFlush); clearInterval(id); };
  }, [crmConfigured]);

  // Save current editor state into a frame object
  function saveCurrentFrameState() {
    return {
      productType, colour, colourInt, width, height, panelCount, opensIn,
      openStyle, glassSpec, colonialGrid, transomPct, cellTypes, cellBreaks,
      gridCols, gridRows, zoneWidths, zoneHeights, hardwareColour, showFlyScreen,
      handleHeightMm,
      propertyType, floorLevel, installationType
    };
  }
  // Keep the ref pointed at the latest closure each render so the bridge's
  // onRequestSave (set inside an empty-deps useEffect) can call this without
  // hitting React's stale-closure trap. Ref mutation during render is safe
  // and is the canonical pattern for surfacing per-render closures to event
  // handlers / async callbacks that outlive their original render.
  saveCurrentFrameStateRef.current = saveCurrentFrameState;

  // Load frame state into editor
  function loadFrameState(frame) {
    if (!frame) return;
    setProductType(frame.productType || 'awning_window');
    setColour(frame.colour || 'white_body');
    setColourInt(frame.colourInt || 'white_body');
    setWidth(frame.width || 900);
    setHeight(frame.height || 900);
    setPanelCount(frame.panelCount || 1);
    setOpensIn(frame.opensIn || false);
    setOpenStyle(frame.openStyle || 'top_hung');
    setGlassSpec(frame.glassSpec || 'dgu_4_12_4');
    setColonialGrid(frame.colonialGrid || null);
    setTransomPct(frame.transomPct || null);
    // WIP10: migrate legacy frames. Earlier versions defaulted every new frame
    // to cellTypes=[['fixed']] regardless of product, but rendered the natural
    // sash anyway via panelCount. Promote those frames so the Sashes tab and
    // the 3D scene agree.
    var _loadCT = frame.cellTypes || [['fixed']];
    var _isLegacy1x1Fixed = _loadCT.length === 1 && _loadCT[0] && _loadCT[0].length === 1 && _loadCT[0][0] === 'fixed';
    var _legacyMigrateProduct = (frame.productType === 'awning_window' || frame.productType === 'casement_window' || frame.productType === 'tilt_turn_window');
    if (_isLegacy1x1Fixed && _legacyMigrateProduct) {
      _loadCT = [[defaultSashTypeFor(frame.productType)]];
    }
    setCellTypes(_loadCT);
    // WIP10: load cellBreaks parallel to cellTypes. Legacy frames have no
    // breaks data — default to an all-empty grid the same shape as cellTypes.
    var _loadCB = frame.cellBreaks;
    var _ctRows = _loadCT.length;
    var _ctCols = _loadCT[0] ? _loadCT[0].length : 1;
    if (!Array.isArray(_loadCB) || _loadCB.length !== _ctRows
        || !_loadCB.every(function(row){ return Array.isArray(row) && row.length === _ctCols; })) {
      _loadCB = Array.from({length:_ctRows}, function(){
        return Array.from({length:_ctCols}, function(){ return {}; });
      });
    }
    setCellBreaks(_loadCB);
    setGridCols(frame.gridCols || 1);
    setGridRows(frame.gridRows || 1);
    // WIP10: migrate legacy zoneWidths/zoneHeights that were seeded with frame
    // dims instead of opening dims. If the sum of zones doesn't match the
    // current opening (within 1mm), rescale proportionally. Older frames in
    // particular were saved with e.g. zoneWidths=[900] for a 900mm frame —
    // which causes buildGridWindow to overflow the opening by ~150mm once
    // 1×1 fixed cells started routing through it.
    var _loadPd = getProfileDims(frame.productType) || { frameW: 70, mullionW: 84 };
    var _loadOpenW = (frame.width || 900) - _loadPd.frameW * 2;
    var _loadOpenH = (frame.height || 900) - _loadPd.frameW * 2;
    var _loadMw = _loadPd.mullionW;
    var _loadGC = frame.gridCols || 1;
    var _loadGR = frame.gridRows || 1;
    var _zw = (frame.zoneWidths && frame.zoneWidths.length === _loadGC) ? frame.zoneWidths.slice() : [_loadOpenW];
    var _zh = (frame.zoneHeights && frame.zoneHeights.length === _loadGR) ? frame.zoneHeights.slice() : [_loadOpenH];
    var _availW = _loadOpenW - (_loadGC - 1) * _loadMw;
    var _availH = _loadOpenH - (_loadGR - 1) * _loadMw;
    var _zwSum = _zw.reduce(function(a,b){return a+(b||0);}, 0);
    var _zhSum = _zh.reduce(function(a,b){return a+(b||0);}, 0);
    if (_zwSum > 0 && Math.abs(_zwSum - _availW) > 1) {
      var _kw = _availW / _zwSum;
      _zw = _zw.map(function(z){ return Math.max(150, Math.round(z * _kw)); });
    }
    if (_zhSum > 0 && Math.abs(_zhSum - _availH) > 1) {
      var _kh = _availH / _zhSum;
      _zh = _zh.map(function(z){ return Math.max(150, Math.round(z * _kh)); });
    }
    setZoneWidths(_zw);
    setZoneHeights(_zh);
    setHardwareColour(frame.hardwareColour || 'white');
    setShowFlyScreen(frame.showFlyScreen !== false);
    setHandleHeightMm(typeof frame.handleHeightMm === 'number' ? frame.handleHeightMm : 0);
    // WIP10: clear any stale Customise Layout selection — cell indices do not
    // carry over between frames with different grid shapes.
    setSelectedCell(null);
    // WIP9: install-planning fields. Fall back to project default for legacy
    // frames so the viewport dropdown shows a sensible value.
    setPropertyType(frame.propertyType || (projectInfo && projectInfo.propertyType) || 'brick_veneer');
    setFloorLevel(typeof frame.floorLevel === 'number' ? frame.floorLevel : 0);
    // WIP25: installation type — per-frame, falls back to project default.
    // Legacy supplyOnly:true frames map to 'supply_only' via the same rule
    // used in calculateFramePrice, so old saves open with the correct type.
    setInstallationType(
      frame.installationType
      || (frame.supplyOnly ? 'supply_only' : null)
      || (projectInfo && projectInfo.installationType)
      || 'retrofit'
    );
  }

  // Wraps makeBlankFrameMeasurement with a frame-or-id lookup so the
  // design-time handleHeightMm pre-fills the surveyor's handleHeightOffsetMm
  // regardless of whether the call site has the frame object or just its id.
  function blankMeasurementFor(frameOrId) {
    if (frameOrId && typeof frameOrId === 'object') return makeBlankFrameMeasurement(frameOrId);
    var f = projectItems.find(function(x){ return x && x.id === frameOrId; });
    return makeBlankFrameMeasurement(f);
  }

  // Capture BOTH front (external) and back (internal) 3D snapshots
  // by temporarily repositioning the camera. Returns { front, back, thumbnail }.
  function captureFrameSnapshots() {
    var sd = sceneData.current;
    if (!sd || !sd.renderer || !sd.scene || !sd.camera) return null;
    try {
      // Save everything we're about to touch
      var origPos = sd.camera.position.clone();
      var origRot = sd.camera.rotation.clone();
      var origFov = sd.camera.fov;
      var origAspect = sd.camera.aspect;
      var origSize = new THREE.Vector2();
      sd.renderer.getSize(origSize);
      var origBg = sd.scene.background;
      var origT = openPct / 100;

      // Frame dimensions in metres
      var W = width / 1000, H = height / 1000;

      // Target the vertical centre of the window model (the product is built
      // with its base at y=0 and extends up to y=H, so the centre is H/2).
      // Previously this was (0,0,0) which pointed the camera at the floor and
      // caused the window to look cut off at the top in the captured images.
      var target = new THREE.Vector3(0, H / 2, 0);

      // Render at a dedicated capture size matching the quote display aspect
      // (280×260 in the quote → 800×740 at ~2.85x for high-DPI crispness)
      var captureW = 800, captureH = 740;
      sd.renderer.setSize(captureW, captureH, false);
      sd.camera.aspect = captureW / captureH;
      sd.camera.fov = 28;
      sd.camera.updateProjectionMatrix();

      // Pure white background — matches the quote page so the window
      // blends into the page rather than sitting in a grey box
      sd.scene.background = new THREE.Color('#ffffff');

      // ── INTERNAL VIEW ── straight-on, closed
      // Distance calibrated so the window fills ~90% of the frame,
      // leaving a tiny margin that lines up with the dimension ticks.
      // For FOV=28°, window_fills_pct = window / (2 * d * tan(14°))
      // To fill 90%: d ≈ W * 2.23
      var distInt = Math.max(W, H) * 2.23;
      if (sd.sashes) { try { animateSashes(sd.productTypeId, sd.sashes, 0, opensIn, openStyle); } catch(_){} }
      sd.camera.position.set(0, H / 2, -distInt);
      sd.camera.lookAt(target);
      sd.renderer.render(sd.scene, sd.camera);
      var internalImg = sd.renderer.domElement.toDataURL('image/jpeg', 0.92);

      // ── EXTERNAL VIEW ── 3/4 angle, sash cracked open
      // Slightly further back so the opened sash stays in frame;
      // sash open reduced to 20% (gentler, keeps the sash within bounds)
      var distExt = Math.max(W, H) * 2.5;
      if (sd.sashes) { try { animateSashes(sd.productTypeId, sd.sashes, 0.20, opensIn, openStyle); } catch(_){} }
      sd.camera.position.set(distExt * 0.42, H / 2, distExt * 0.92);
      sd.camera.lookAt(target);
      sd.renderer.render(sd.scene, sd.camera);
      var externalImg = sd.renderer.domElement.toDataURL('image/jpeg', 0.92);

      // ── RESTORE everything so the live editor view is unchanged ──
      sd.scene.background = origBg;
      sd.camera.fov = origFov;
      sd.camera.aspect = origAspect;
      sd.camera.updateProjectionMatrix();
      sd.camera.position.copy(origPos);
      sd.camera.rotation.copy(origRot);
      sd.renderer.setSize(origSize.x, origSize.y, false);
      if (sd.sashes) { try { animateSashes(sd.productTypeId, sd.sashes, origT, opensIn, openStyle); } catch(_){} }
      sd.renderer.render(sd.scene, sd.camera);
      var thumbImg = sd.renderer.domElement.toDataURL('image/jpeg', 0.7);

      return { front: externalImg, back: internalImg, thumbnail: thumbImg };
    } catch(e) { console.warn('snapshot capture failed', e); return null; }
  }

  // Commit the editor's local state (cellTypes, gridCols, hardware, colours,
  // fly screen, etc.) back to projectItems[activeFrameIdx]. Without this,
  // changes made in the editor (Frame Styles presets, colour picks, fly-
  // screen toggles) only live in editor-local React state and never make
  // it into projectItems — so the Production/Price/Save engines see stale
  // data. Both openFrameEditor and returnToDashboard call this; so do
  // the Production and Price buttons. Returns the new projectItems array
  // so callers that need it synchronously (e.g. before reading projectItems
  // in the same handler) can use it.
  function commitEditorStateToProject(captureThumbs) {
    if (activeFrameIdx < 0 || activeFrameIdx >= projectItems.length) return projectItems;
    var items = [...projectItems];
    var snaps = captureThumbs ? captureFrameSnapshots() : null;
    items[activeFrameIdx] = {
      ...items[activeFrameIdx],
      ...saveCurrentFrameState(),
      thumbnail:      (snaps && snaps.thumbnail) || items[activeFrameIdx].thumbnail,
      thumbnailFront: (snaps && snaps.front)     || items[activeFrameIdx].thumbnailFront,
      thumbnailBack:  (snaps && snaps.back)      || items[activeFrameIdx].thumbnailBack,
    };
    setProjectItems(items);
    // Update the bridge ref synchronously so same-tick reads (e.g.
    // saveBuildNow → buildLocalSavePayload) see the new state. The
    // useEffect that maintains this ref runs post-render, which would
    // be too late.
    projectItemsBridgeRef.current = items;
    if (buildSaveStateRef && buildSaveStateRef.current) {
      buildSaveStateRef.current.projectItems = items;
    }
    return items;
  }

  // Open a frame in the editor
  function openFrameEditor(idx) {
    // Save current frame if we're editing one (with thumbnails)
    commitEditorStateToProject(true);
    // Load the target frame
    if (idx >= 0 && idx < projectItems.length) {
      loadFrameState(projectItems[idx]);
    }
    setActiveFrameIdx(idx);
    setCurrentView('editor');
  }

  // Return to dashboard, saving current frame with 3D thumbnails
  function returnToDashboard() {
    commitEditorStateToProject(true);
    setCurrentView('dashboard');
  }

  // ═══ M3: multi-quote handlers ═══════════════════════════════════════════
  // Pair of handlers for the quote dropdown in the dashboard header.
  //
  // handleQuoteSwitch(quoteId): switch to a different quote from the init
  // payload's quotes[]. Confirms before discarding unsaved edits (contract
  // §3.2: "CAD should confirm before discarding unsaved edits"). Sets
  // skipNextDirtyRef so the re-hydration doesn't trip the dirty effect.
  //
  // handleNewQuote(): start a blank canvas with quoteId=null; next save
  // will echo quoteId:null and the CRM will allocate a new id. Same dirty
  // guard as handleQuoteSwitch.
  //
  // Both are no-ops if the CRM init payload has no quotes[] (standalone
  // mode — the dropdown is hidden in that case anyway, but guard
  // defensively for programmatic callers).
  function handleQuoteSwitch(quoteId) {
    if (quoteId === currentQuoteId) return;
    var init = crmInit || {};
    var quotes = Array.isArray(init.quotes) ? init.quotes : [];
    var target = quotes.find(function(q){ return q && q.id === quoteId; });
    if (!target || !Array.isArray(target.projectItems)) return;
    if (quoteDirty) {
      var ok = (typeof window !== 'undefined' && typeof window.confirm === 'function')
        ? window.confirm('You have unsaved changes on the current quote. Discard and switch?')
        : true;
      if (!ok) return;
    }
    skipNextDirtyRef.current = true;
    setProjectItems(target.projectItems);
    setCurrentQuoteId(quoteId);
    setQuoteDirty(false);
  }

  function handleNewQuote() {
    if (quoteDirty) {
      var ok = (typeof window !== 'undefined' && typeof window.confirm === 'function')
        ? window.confirm('You have unsaved changes on the current quote. Discard and start a new quote?')
        : true;
      if (!ok) return;
    }
    skipNextDirtyRef.current = true;
    setProjectItems([]);
    setCurrentQuoteId(null);
    setQuoteDirty(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO 3D CAPTURE — iterates frames that lack thumbnails and renders each
  // in the hidden editor canvas (it stays mounted with display:none, so the
  // Three.js renderer is always alive). Never switches views during capture,
  // which sidesteps React state-after-view-change issues.
  // ══════════════════════════════════════════════════════════════════════════
  const [captureProgress, setCaptureProgress] = useState(null); // null | { current, total, label }

  function wait(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

  // Read-through ref so async callbacks see the latest projectItems (state
  // captured in closures goes stale across awaits).
  const projectItemsRef = useRef(projectItems);
  React.useEffect(function(){ projectItemsRef.current = projectItems; }, [projectItems]);

  async function ensureAllFrameCaptures(targetView) {
    // Pick frames that still need 3D snapshots
    var needing = [];
    var current = projectItemsRef.current;
    for (var i = 0; i < current.length; i++) {
      if (!current[i].thumbnailFront || !current[i].thumbnailBack) needing.push(i);
    }
    if (needing.length === 0) {
      setCurrentView(targetView);
      return;
    }

    // Remember what the user had open
    var prevActiveIdx = activeFrameIdx;

    setCaptureProgress({ current: 0, total: needing.length, label: 'Preparing 3D views…' });

    // Ensure the editor canvas is mounted — the wrapper uses display:none
    // toggling, so the renderer stays alive once mounted. If we've never
    // been in the editor yet, this is the first time it gets built.
    if (currentView !== 'editor') {
      setCurrentView('editor');
      await wait(1200); // let React mount + useEffect + Three.js init + HDRI
    }

    try {
      for (var j = 0; j < needing.length; j++) {
        var idx = needing[j];
        setCaptureProgress({ current: j + 1, total: needing.length, label: 'Rendering frame ' + (idx + 1) + '…' });

        var frame = projectItemsRef.current[idx];
        loadFrameState(frame);
        await wait(1100);

        var snaps = captureFrameSnapshots();
        if (snaps) {
          setProjectItems(function(prev) {
            if (idx >= prev.length) return prev;
            var next = prev.slice();
            next[idx] = Object.assign({}, next[idx], {
              thumbnail: snaps.thumbnail || next[idx].thumbnail,
              thumbnailFront: snaps.front || next[idx].thumbnailFront,
              thumbnailBack: snaps.back || next[idx].thumbnailBack,
            });
            return next;
          });
        }
      }

      if (prevActiveIdx >= 0) {
        var cur = projectItemsRef.current;
        if (prevActiveIdx < cur.length) loadFrameState(cur[prevActiveIdx]);
      }
    } catch(err) {
      console.error('Capture sequence failed:', err);
    } finally {
      setCaptureProgress(null);
      // Use double requestAnimationFrame to switch views on a clean render tick
      // after React has flushed pending state updates. Plain setTimeout was
      // unreliable in this Babel-in-browser setup — RAF ties to the paint loop
      // and fires deterministically.
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          setCurrentView(targetView);
        });
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FINALISE PDF GENERATION (spec §6.3)
  // Builds a "sign-off" PDF with: header, customer, line items, totals,
  // install details, T&Cs, signature block. Returns a Blob + data URL.
  // ═══════════════════════════════════════════════════════════════════════════
  function generateFinalisePdf() {
    // jsPDF UMD registers itself as window.jspdf.jsPDF
    var jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF not loaded');
    var doc = new jsPDFCtor({ unit: 'pt', format: 'a4' });
    var page = doc.internal.pageSize;
    var pageW = page.getWidth();
    var margin = 40;
    var y = margin;

    // Helpers
    function hr(lineY) {
      doc.setDrawColor(200); doc.setLineWidth(0.5);
      doc.line(margin, lineY, pageW - margin, lineY);
    }
    function text(s, x, yy, opts) {
      doc.text(String(s == null ? '' : s), x, yy, opts || {});
    }
    function ensureSpace(h) {
      if (y + h > page.getHeight() - margin) { doc.addPage(); y = margin; }
    }

    // Header
    doc.setFontSize(18); doc.setFont(undefined, 'bold');
    text('Spartan Double Glazing', margin, y); y += 22;
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    text('Design Sign-Off & Order Confirmation', margin, y); y += 14;
    text('Spartan Double Glazing Pty Ltd · spaartan.tech', margin, y); y += 18;
    hr(y); y += 14;

    // Customer block
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    text('Customer', margin, y); y += 14;
    doc.setFontSize(10); doc.setFont(undefined, 'normal');
    var cust = projectInfo || {};
    text(cust.customerName || projectName || '—', margin, y); y += 12;
    if (cust.email) { text(cust.email, margin, y); y += 12; }
    if (cust.phone) { text(cust.phone, margin, y); y += 12; }
    var addrLine = [cust.address1, cust.suburb, cust.postcode].filter(Boolean).join(', ');
    if (addrLine) { text(addrLine, margin, y); y += 12; }
    if (crmLink && crmLink.id) { text('Reference: ' + (crmLink.type || '') + ' ' + crmLink.id, margin, y); y += 12; }
    text('Design date: ' + new Date().toLocaleDateString('en-AU'), margin, y); y += 16;
    hr(y); y += 14;

    // Line items
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    text('Line Items', margin, y); y += 14;
    doc.setFontSize(9); doc.setFont(undefined, 'bold');
    // Header row
    text('#', margin, y);
    text('Frame', margin + 24, y);
    text('Product', margin + 90, y);
    text('W x H (mm)', margin + 220, y);
    text('Colour', margin + 310, y);
    text('Line Total', pageW - margin, y, { align: 'right' });
    y += 10; hr(y); y += 10;
    doc.setFont(undefined, 'normal');

    var selPl = (appSettings.pricingConfig.markups.priceLists.find(function(p){return p.id===selectedPriceList;}))
      || appSettings.pricingConfig.markups.priceLists[0];
    var pid = selPl ? selPl.id : null;
    var framesGross = 0, installTotal = 0;
    projectItems.forEach(function(f, i) {
      ensureSpace(14);
      try {
        var fp = calculateFramePrice(f, appSettings.pricingConfig);
        var framePortion = (pid && fp.priceListsFactory && fp.priceListsFactory[pid]) || fp.costPrice || 0;
        var installPortion = (pid && fp.priceListsInstall && fp.priceListsInstall[pid]) || 0;
        var lineTotal = framePortion + installPortion;
        framesGross += framePortion; installTotal += installPortion;
        text(String(i + 1), margin, y);
        text(f.name || '', margin + 24, y);
        text(f.productType || '', margin + 90, y);
        text((f.width || 0) + ' x ' + (f.height || 0), margin + 220, y);
        text((f.colour || '').replace(/_/g, ' '), margin + 310, y);
        text('$' + lineTotal.toFixed(2), pageW - margin, y, { align: 'right' });
        y += 13;
      } catch (e) {
        text(String(i + 1) + '. ' + (f.name || '') + ' (pricing error)', margin, y); y += 13;
      }
    });
    y += 4; hr(y); y += 14;

    // Ancillaries
    if (projectAncillaries && projectAncillaries.length) {
      doc.setFont(undefined, 'bold'); text('Ancillaries', margin, y); y += 12;
      doc.setFont(undefined, 'normal');
      projectAncillaries.forEach(function(a) {
        ensureSpace(13);
        text(a.label || a.name || 'Item', margin, y);
        text('$' + (Number(a.amount) || 0).toFixed(2), pageW - margin, y, { align: 'right' });
        y += 12;
      });
      y += 6; hr(y); y += 14;
    }

    // Totals
    var ancDisc = 0, ancNonDisc = 0;
    (projectAncillaries || []).forEach(function(a){
      var amt = Number(a.amount) || 0;
      if (a.disc !== false) ancDisc += amt; else ancNonDisc += amt;
    });
    var ancGross = ancDisc + ancNonDisc;
    var totalDiscount = 0;
    (projectPromotions || []).forEach(function(prm){
      if (prm.enabled === false) return;
      var base = 0;
      if (prm.applyFrames !== false) base += framesGross;
      if (prm.applyInstall !== false) base += installTotal;
      if (prm.applyAncillaries !== false) base += ancDisc;
      var d = prm.kind === 'pct' ? base * ((Number(prm.amount)||0)/100) : Math.min(Number(prm.amount)||0, base);
      totalDiscount += d;
    });
    var subtotal = Math.max(0, framesGross + installTotal + ancGross - totalDiscount);
    var gst = taxMode === 'gst' ? subtotal * 0.1 : 0;
    var grand = subtotal + gst;

    doc.setFont(undefined, 'normal');
    function totalLine(label, amt, bold) {
      ensureSpace(14);
      if (bold) doc.setFont(undefined, 'bold');
      text(label, pageW - margin - 140, y);
      text('$' + amt.toFixed(2), pageW - margin, y, { align: 'right' });
      if (bold) doc.setFont(undefined, 'normal');
      y += 13;
    }
    totalLine('Frames (' + (selPl ? selPl.name : '') + ')', framesGross);
    if (installTotal > 0) totalLine('Installation', installTotal);
    if (ancGross > 0) totalLine('Ancillaries', ancGross);
    if (totalDiscount > 0) totalLine('Discounts', -totalDiscount);
    totalLine('Subtotal', subtotal);
    if (taxMode === 'gst') totalLine('GST 10%', gst);
    y += 2; hr(y); y += 10;
    totalLine('TOTAL' + (taxMode === 'gst' ? ' (inc GST)' : ''), grand, true);
    y += 10;

    // Install details (if CM complete)
    if (checkMeasure && checkMeasure.completed) {
      ensureSpace(80);
      hr(y); y += 14;
      doc.setFontSize(11); doc.setFont(undefined, 'bold');
      text('Installation Details', margin, y); y += 14;
      doc.setFontSize(10); doc.setFont(undefined, 'normal');
      if (checkMeasure.crew_size_required) { text('Crew size: ' + checkMeasure.crew_size_required, margin, y); y += 12; }
      if (checkMeasure.estimated_install_days) { text('Estimated install days: ' + checkMeasure.estimated_install_days, margin, y); y += 12; }
      if (checkMeasure.earliest_install_date) { text('Earliest install date: ' + checkMeasure.earliest_install_date, margin, y); y += 12; }
      if (checkMeasure.preferred_install_date) { text('Preferred install date: ' + checkMeasure.preferred_install_date, margin, y); y += 12; }
      y += 4;
    }

    // T&Cs (brief)
    ensureSpace(110);
    hr(y); y += 14;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    text('Terms & Conditions', margin, y); y += 14;
    doc.setFontSize(8); doc.setFont(undefined, 'normal');
    var tcs = [
      '1. 50% deposit payable on signing; balance due on completion of installation.',
      '2. Manufacturing lead time 6–10 weeks from deposit and completed check-measure.',
      '3. Quote valid for 30 days from issue. Prices inc GST where indicated.',
      '4. Installation subject to site access as per the check-measure report.',
      '5. 10-year warranty on uPVC profile, 5 years on hardware, 10 years on IGU seal.',
      '6. By signing, customer confirms the line items, dimensions, colours and site details above are correct.',
    ];
    tcs.forEach(function(t) { var lines = doc.splitTextToSize(t, pageW - 2*margin); lines.forEach(function(ln){ ensureSpace(11); text(ln, margin, y); y += 11; }); });
    y += 10;

    // Signature block
    ensureSpace(100);
    hr(y); y += 18;
    doc.setFontSize(10); doc.setFont(undefined, 'bold');
    text('Customer Acceptance', margin, y); y += 16;
    doc.setFont(undefined, 'normal');
    text('Signature: ________________________________', margin, y); y += 22;
    text('Print name: _______________________________', margin, y); y += 20;
    text('Date: ____________________________________', margin, y); y += 18;

    // Return blob + dataUrl
    var blob = doc.output('blob');
    var dataUrl = doc.output('datauristring');
    return { blob: blob, dataUrl: dataUrl };
  }

  // Build the PDF, upload to cad-signatures bucket, return the public URL.
  async function uploadFinalisePdf(blob, designId) {
    var client = sb(); if (!client) return null;
    try {
      var path = (designId || 'draft') + '/finalise_' + Date.now() + '.pdf';
      var up = await client.storage.from('cad-signatures').upload(path, blob, {
        contentType: 'application/pdf', cacheControl: '3600', upsert: false,
      });
      if (up.error) throw up.error;
      var res = client.storage.from('cad-signatures').getPublicUrl(path);
      return res && res.data && res.data.publicUrl || null;
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('uploadFinalisePdf failed', e);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // XLSX CUT-LIST EXPORT (spec §7.6)
  // Groups BOM entries from calculateFramePrice by category + keySuffix, writes
  // one worksheet per category. Downloads locally and, if CRM-linked, uploads
  // to cad-designs bucket and records cut_list_url on the design.
  // ═══════════════════════════════════════════════════════════════════════════
  async function exportCutListXlsx() {
    if (typeof XLSX === 'undefined') { alert('SheetJS not loaded'); return; }
    if (!projectItems || projectItems.length === 0) { alert('No frames to export'); return; }

    // Collect all BOM rows tagged with frame context
    var rowsByCategory = {};
    projectItems.forEach(function(frame, frameIdx) {
      try {
        var fp = calculateFramePrice(frame, appSettings.pricingConfig);
        if (!fp || !fp.bom) return;
        fp.bom.forEach(function(ln) {
          var cat = ln.category || 'other';
          if (!rowsByCategory[cat]) rowsByCategory[cat] = [];
          rowsByCategory[cat].push({
            'Position': frameIdx + 1,
            'Frame': frame.name || '',
            'Room': frame.room || '',
            'Product': frame.productType || '',
            'Colour Ext': (frame.colour || '').replace(/_/g, ' '),
            'Colour Int': (frame.colourInt || '').replace(/_/g, ' '),
            'W (mm)': frame.width || '',
            'H (mm)': frame.height || '',
            'Item': ln.label || ln.name || '',
            'Profile/Key': ln.keySuffix || '',
            'Length (mm)': ln.lenMm != null ? ln.lenMm : '',
            'Qty': ln.qty != null ? ln.qty : 1,
            'Unit Rate': ln.unitRate != null ? Number(ln.unitRate).toFixed(4) : '',
            'Line Total': ln.lineTotal != null ? Number(ln.lineTotal).toFixed(2)
                          : (ln.cost != null ? Number(ln.cost).toFixed(2) : ''),
            'Notes': ln.notes || '',
          });
        });
      } catch (e) { /* skip frame on pricing error */ }
    });

    // Build workbook — one sheet per category (sorted), plus a "Summary" sheet
    var wb = XLSX.utils.book_new();

    // Summary sheet (one row per frame)
    var summaryRows = projectItems.map(function(f, i) {
      var fp; try { fp = calculateFramePrice(f, appSettings.pricingConfig); } catch (e) { fp = null; }
      return {
        'Position': i + 1, 'Frame': f.name || '', 'Room': f.room || '',
        'Product': f.productType || '',
        'W (mm)': f.width || 0, 'H (mm)': f.height || 0,
        'Colour Ext': (f.colour || '').replace(/_/g, ' '),
        'Colour Int': (f.colourInt || '').replace(/_/g, ' '),
        'Glass': f.glassSpec || '',
        'Hardware Colour': f.hardwareColour || '',
        'Cost Price': fp ? Number(fp.costPrice || 0).toFixed(2) : '',
        'Full Cost (inc install)': fp ? Number(fp.fullCost || 0).toFixed(2) : '',
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary');

    // Per-category sheets, sorted alphabetically
    var cats = Object.keys(rowsByCategory).sort();
    cats.forEach(function(cat) {
      var rows = rowsByCategory[cat];
      if (!rows || rows.length === 0) return;
      var ws = XLSX.utils.json_to_sheet(rows);
      // Excel sheet names max 31 chars, no [ ] : * ? / \
      var name = cat.charAt(0).toUpperCase() + cat.slice(1);
      name = name.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });

    // Generate filename
    var designId = (crmLink && crmLink.design && crmLink.design.id) || ('draft_' + Date.now());
    var fileName = 'cutlist-' + designId + '.xlsx';

    // Write and trigger download
    try {
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('Cut-list download failed', e);
      alert('Cut-list generation failed: ' + (e && e.message || 'unknown error'));
      return;
    }

    // Upload to cad-designs bucket and write cut_list_url on the design (if linked)
    if (crmLink && crmLink.design && crmLink.design.id && sbConfigured()) {
      try {
        var blob = new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        var client = sb();
        var path = designId + '/' + fileName;
        var up = await client.storage.from('cad-designs').upload(path, blob, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          cacheControl: '3600', upsert: true,
        });
        if (!up.error) {
          var pub = client.storage.from('cad-designs').getPublicUrl(path);
          var url = pub && pub.data && pub.data.publicUrl;
          if (url) {
            await client.from('designs').update({
              cut_list_url: url, updated_at: new Date().toISOString(),
            }).eq('id', designId);
          }
        }
      } catch (e) {
        if (typeof console !== 'undefined') console.warn('Cut-list upload failed (download still succeeded)', e);
      }
    }
  }

  // Rename a frame
  function renameFrame(idx, newName) {
    var items = [...projectItems];
    items[idx] = { ...items[idx], name: newName };
    setProjectItems(items);
  }

  // Add a new frame
  function addNewFrame(type, w, h, name) {
    var meta = PRODUCTS.find(function(p){return p.id===type}) || PRODUCTS[0];
    var defW = w || meta.w; var defH = h || meta.h;
    // WIP10: zoneWidths/zoneHeights are CELL (opening) dims, not frame dims.
    // Seed the single aperture with the inside-frame opening so buildGridWindow
    // renders correctly when 1×1 fixed cells route through it.
    var _newPd = getProfileDims(type) || { frameW: 70 };
    var _openW = defW - _newPd.frameW * 2;
    var _openH = defH - _newPd.frameW * 2;
    var newFrame = {
      id: 'frame_' + Date.now(),
      name: name || ((meta.cat === 'door' ? 'D' : 'W') + String(projectItems.length + 1).padStart(2, '0')),
      productType: type,
      colour: applyColourAll ? colour : 'white_body',
      colourInt: applyColourAll ? colourInt : 'white_body',
      width: defW, height: defH,
      panelCount: meta.p || 1, opensIn: false,
      openStyle: DEFAULT_STYLES[type] || 'top_hung',
      glassSpec: applyGlassAll ? glassSpec : 'dgu_4_12_4',
      colonialGrid: null, transomPct: null,
      // WIP10: seed the single aperture with the product's natural sash type
      // so the Customise Layout → Sashes tab schematic and the 3D scene agree.
      cellTypes: [[defaultSashTypeFor(type)]], cellBreaks: [[{}]], gridCols: 1, gridRows: 1,
      zoneWidths: [_openW], zoneHeights: [_openH],
      hardwareColour: 'white', showFlyScreen: true, price: 0,
      handleHeightMm: 0,           // mm offset from default handle height (T&T / sliding only)
      // ─── Pricing overrides (null = use defaults from pricingConfig) ───
      hardwareCostOverride: null,  // $ per sash to override hardwareCosts[type]
      profileOverrides: null,      // { frame, sash, mullion } keys — advanced
      supplyOnly: false,           // LEGACY: kept for back-compat with old saves. New code reads installationType.
      installationType: (projectInfo && projectInfo.installationType) || 'retrofit',  // WIP23: inherits project default
      tracks: null,                // 2 or 3 for Vario-Slide; null = default (3)
      // ─── CRM design_items alignment (§5.4) ───
      room: '',                    // 'Master bedroom' etc.
      floorLevel: 0,               // 0 = ground, 1 = first, ... (WIP9 bucket: floorLevelToBucket)
      propertyType: (projectInfo && projectInfo.propertyType) || 'brick_veneer',  // WIP9: inherits project default
      accessMethod: null,          // 'ground' | 'ladder' | 'scaffold' | 'scissor_lift' | 'crane'
      surroundType: null,          // 'brick' | 'timber' | 'cladding' | 'render' (CM-workflow field — distinct from propertyType)
      siteHazards: '',             // free text
      flashing: false,
      revealType: null,            // 'timber' | 'aluminium' | 'none'
      // ─── Check-measure overrides (populated in CM mode) ───
      cmWidthMm: null,
      cmHeightMm: null,
      cmNotes: '',
      cmConfirmed: false
    };
    setProjectItems(function(prev) { return [...prev, newFrame]; });
    setShowNewFrame(false);
  }

  // Delete a frame
  function deleteFrame(idx) {
    setProjectItems(function(prev) { return prev.filter(function(_,i){return i!==idx}); });
    if (activeFrameIdx === idx) setActiveFrameIdx(-1);
  }

  // Get product label
  function getProductLabel(typeId) {
    var p = PRODUCTS.find(function(pr){return pr.id===typeId});
    return p ? p.label : typeId;
  }

  const CRM_CONTACTS = [
    { id: 'c001', name: 'Marcus & Julia Thompson', suburb: 'Hawthorn VIC' },
    { id: 'c002', name: 'Sarah Chen', suburb: 'Woden ACT' },
    { id: 'c003', name: 'Rob & Tanya Parsons', suburb: 'Northcote VIC' },
    { id: 'c004', name: 'David & Lisa Moretti', suburb: 'Belconnen ACT' },
    { id: 'c005', name: 'Angela Wright', suburb: 'Brunswick VIC' },
    { id: 'c006', name: 'Peter & Mei-Lin Zhang', suburb: 'Coburg VIC' },
    { id: 'c007', name: 'Nicole Patterson', suburb: 'Yarralumla ACT' },
  ];

  const [pricing, setPricing] = useState({
    profileSystems: {
      ideal_4000: { name: 'Aluplast Ideal 4000', frameRatePerM: 0, sashRatePerM: 0, mullionRatePerM: 0 },
      ideal_2000: { name: 'Aluplast Ideal 2000', frameRatePerM: 0, sashRatePerM: 0, mullionRatePerM: 0 },
      vario_slide: { name: 'Aluplast Vario-Slide', frameRatePerM: 0, sashRatePerM: 0, mullionRatePerM: 0 },
      lift_slide: { name: 'Lift-Slide HST85', frameRatePerM: 0, sashRatePerM: 0, mullionRatePerM: 0 },
      smart_slide: { name: 'Aluplast Smart-Slide', frameRatePerM: 0, sashRatePerM: 0, mullionRatePerM: 0 },
    },
    glassRates: { dgu_4_12_4: 0, dgu_4_16_4: 0, dgu_6_12_6: 0, lowe_4_12_4: 0, lowe_4_16_4: 0, argon_4_16_4: 0, acoustic_6_12_6: 0, acoustic_plus: 0, obscure_4_12_4: 0, satin_6_12_4: 0, safety_5_12_5: 0, safety_lowe: 0 },
    colourSurcharges: { smooth: 0, aludec: 0, wood: 0 },
    fixedAddOns: [
      { id: 'hardware', label: 'Hardware set', costPerItem: 0, enabled: false },
      { id: 'installation', label: 'Installation (per item)', costPerItem: 0, enabled: false },
      { id: 'delivery', label: 'Delivery (per job)', costPerJob: 0, enabled: false },
    ],
    // Production times now managed via pricingConfig.productionTimes
    productionRatePerHour: 0, minimumItemCharge: 0,
    markupPct: 0, markupPassword: '1234', gstRate: 10,
  });

  const [pdfSettings, setPdfSettings] = useState({
    companyName: 'Spartan Double Glazing', addressLine1: '2/7 Wireless Rd', addressLine2: 'Glynde SA 5070',
    phone: '1300 912 161', email: 'sales@spartandoubleglazing.com.au', website: 'www.spartandoubleglazing.com.au', abn: '89 933 629 169',
    showSchematic: true, showDimensions: true, showGlassSpec: true, showColours: true, showLinearMetres: false, showGlassArea: false, showGST: true, showValidity: true, validityDays: 30,
    footerLines: ["All windows as seen on Channel Nine's The Block", '1% Price Beat or Price Match Guarantee (T&Cs Apply)', 'All Hardware Imported from Germany (Siegenia)', ''],
    termsAndConditions: '',
  });

  function updatePricing(path, val) {
    setPricing(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split('.'); let obj = next;
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]];
      obj[keys[keys.length-1]] = val; return next;
    });
  }

  // WIP10: Compute opening dimensions using the ACTUAL profile dims for the
  // current product, not hardcoded 70/84. Previously `openingWMm = width - 140`
  // and `mullionMm = 84` assumed a 65/70mm frame. Awning/casement uses 75mm
  // frame and 80mm mullion — so fitZones emitted values that didn't match the
  // rendered geometry, and centred layouts showed asymmetric bubble dims.
  const _pdForZones = getProfileDims(productType) || { frameW: 70, mullionW: 84 };
  const openingWMm = width - _pdForZones.frameW * 2;
  const openingHMm = height - _pdForZones.frameW * 2;
  const mullionMm = _pdForZones.mullionW;
  const MIN_ZONE = 150;

  // Recalculate zones to fit current dimensions
  function fitZones(zones, totalMm, count) {
    const muls = (count - 1) * mullionMm;
    const avail = totalMm - muls;
    if (zones.length === count) {
      const sum = zones.reduce((a, b) => a + b, 0);
      return zones.map(z => Math.max(MIN_ZONE, Math.round(z / sum * avail)));
    }
    const each = Math.round(avail / count);
    return Array(count).fill(each);
  }

  // Update a single zone dimension with clamping
  function updateZoneWidth(idx, newVal) {
    const muls = (gridCols - 1) * mullionMm;
    const avail = openingWMm - muls;
    const next = [...zoneWidths];
    const clamped = Math.max(MIN_ZONE, Math.min(avail - (gridCols - 1) * MIN_ZONE, Math.round(newVal)));
    const diff = clamped - next[idx];
    next[idx] = clamped;
    // Distribute the difference to adjacent zones
    if (idx < next.length - 1) next[idx + 1] = Math.max(MIN_ZONE, next[idx + 1] - diff);
    else if (idx > 0) next[idx - 1] = Math.max(MIN_ZONE, next[idx - 1] - diff);
    setZoneWidths(next);
  }

  function updateZoneHeight(idx, newVal) {
    const muls = (gridRows - 1) * mullionMm;
    const avail = openingHMm - muls;
    const next = [...zoneHeights];
    const clamped = Math.max(MIN_ZONE, Math.min(avail - (gridRows - 1) * MIN_ZONE, Math.round(newVal)));
    const diff = clamped - next[idx];
    next[idx] = clamped;
    if (idx < next.length - 1) next[idx + 1] = Math.max(MIN_ZONE, next[idx + 1] - diff);
    else if (idx > 0) next[idx - 1] = Math.max(MIN_ZONE, next[idx - 1] - diff);
    setZoneHeights(next);
  }

  const meta = PRODUCTS.find(p => p.id === productType);
  const colourDef = appSettings.editColours.find(c => c.id === colour) || COLOURS.find(c => c.id === colour);
  const colourDefInt = appSettings.editColours.find(c => c.id === colourInt) || COLOURS.find(c => c.id === colourInt);
  const glassSpecObj = (appSettings.editGlass || GLASS_OPTIONS).find(g => g.id === glassSpec) || GLASS_OPTIONS[0];

  // Init THREE scene
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !el.clientWidth || !el.clientHeight) return;
    // Read render-quality settings — defaults preserve existing visual
    // behaviour for users who haven't opened the new panel yet.
    const rq = (appSettings && appSettings.renderQuality) || {};
    const _toneExposure   = typeof rq.toneExposure === 'number' ? rq.toneExposure : 1.8;
    const _toneMapping    = rq.toneMapping || 'aces';
    const _hdriStyle      = rq.hdriStyle || 'flat';
    const _hdriRotation   = typeof rq.hdriRotation === 'number' ? rq.hdriRotation : 0;
    const _bgMode         = rq.backgroundMode || 'theme';
    const _bgColor        = rq.backgroundColor || '#fafafa';
    const _envIntMult     = typeof rq.envIntensityMult === 'number' ? rq.envIntensityMult : 1.0;
    const _ambIntensity   = typeof rq.ambientIntensity === 'number' ? rq.ambientIntensity : 0.30;
    const _hemiIntensity  = typeof rq.hemiIntensity === 'number' ? rq.hemiIntensity : 1.00;
    const _fillIntensity  = typeof rq.fillIntensity === 'number' ? rq.fillIntensity : 1.00;
    const _shadowsOn      = !!rq.shadows;
    const _shadowSoftness = typeof rq.shadowSoftness === 'number' ? rq.shadowSoftness : 4;
    const _shadowMapSize  = typeof rq.shadowMapSize === 'number' ? rq.shadowMapSize : 2048;
    const _ralOn          = !!rq.rectAreaLight;
    const _ralIntensity   = typeof rq.rectAreaIntensity === 'number' ? rq.rectAreaIntensity : 3;
    const _camFov         = typeof rq.cameraFov === 'number' ? rq.cameraFov : 32;
    const _saturation     = typeof rq.saturation === 'number' ? rq.saturation : 1.0;
    const _contrast       = typeof rq.contrast === 'number' ? rq.contrast : 1.0;

    // Bridge global env-mult to window so the catalog material builder
    // (24-materials-textures.js → makeProfileMat) can read it without
    // holding a React ref. Mirror pattern matches __r3dProfiles bridge.
    try { window.__renderQualityEnvMult = _envIntMult; } catch (e) {}

    // Resolve tone-mapping mode → Three.js constant.
    var _tmConst = THREE.ACESFilmicToneMapping;
    if (_toneMapping === 'cineon')   _tmConst = THREE.CineonToneMapping;
    else if (_toneMapping === 'reinhard') _tmConst = THREE.ReinhardToneMapping;
    else if (_toneMapping === 'linear')   _tmConst = THREE.LinearToneMapping;
    else if (_toneMapping === 'none')     _tmConst = THREE.NoToneMapping;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio * 2, 4));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = _tmConst;
    renderer.toneMappingExposure = _toneExposure;
    renderer.outputEncoding = THREE.sRGBEncoding;
    if (_shadowsOn) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Background mode: 'theme' = legacy theme-aware, 'solid' = user picker,
    // 'hdri' = use the studio HDRI (only meaningful when hdriStyle='studio';
    // falls back to theme grey otherwise).
    var _themeBg = appSettings.theme === 'dark' ? '#1a1a24' : '#fafafa';
    if (_bgMode === 'solid') {
      scene.background = new THREE.Color(_bgColor);
    } else if (_bgMode === 'hdri' && _hdriStyle === 'studio') {
      // Set later once the HDRI is generated (requires the canvas).
      scene.background = new THREE.Color(_themeBg); // temporary
    } else {
      scene.background = new THREE.Color(_themeBg);
    }
    const camera = new THREE.PerspectiveCamera(_camFov, el.clientWidth/el.clientHeight, 0.1, 50);
    camera.position.set(0.6, 0.5, 2.5);

    // Lighting — soft ambient-dominant, no specular hotspots.
    // Intensities are now scaled by render-quality multipliers so users
    // can dial the whole scene moodier/brighter without altering exposure.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xeae6e2, _hemiIntensity));
    scene.add(new THREE.AmbientLight(0xffffff, _ambIntensity));
    // Very gentle directional fills for form definition only (no specular).
    // _fillIntensity scales all four together — pull below 1 for moodier
    // look, push above 1 for fully-lit showroom feel.
    { const kf = new THREE.DirectionalLight(0xffffff, 0.35 * _fillIntensity); kf.position.set(0, 5, 6); scene.add(kf); }
    { const kb = new THREE.DirectionalLight(0xffffff, 0.35 * _fillIntensity); kb.position.set(0, 5, -6); scene.add(kb); }
    { const fl = new THREE.DirectionalLight(0xffffff, 0.20 * _fillIntensity); fl.position.set(-5, 3, 0); scene.add(fl); }
    { const fr = new THREE.DirectionalLight(0xffffff, 0.20 * _fillIntensity); fr.position.set(5, 3, 0); scene.add(fr); }

    // Optional shadow-caster key light — only when the user has opted into
    // shadows from the Render quality panel. Without this, the four
    // existing fills cast no shadows (none of them have castShadow=true)
    // so the existing flat look is preserved by default.
    var _shadowKey = null;
    if (_shadowsOn) {
      _shadowKey = new THREE.DirectionalLight(0xffffff, 0.6);
      _shadowKey.position.set(2, 4, 3);
      _shadowKey.castShadow = true;
      _shadowKey.shadow.mapSize.set(_shadowMapSize, _shadowMapSize);
      _shadowKey.shadow.camera.left = -2;
      _shadowKey.shadow.camera.right = 2;
      _shadowKey.shadow.camera.top = 2;
      _shadowKey.shadow.camera.bottom = -2;
      _shadowKey.shadow.camera.near = 0.1;
      _shadowKey.shadow.camera.far = 12;
      _shadowKey.shadow.bias = -0.0001;
      _shadowKey.shadow.normalBias = 0.02;
      _shadowKey.shadow.radius = _shadowSoftness;
      scene.add(_shadowKey);
    }

    // Optional RectAreaLight — adds the elongated softbox highlight
    // typical of product photography. Glass and metal hardware show a
    // directional gleam rather than the matte hemisphere look. Requires
    // RectAreaLightUniformsLib to be initialised; we guard for whether
    // it's loaded (it's an examples module, not core).
    var _ralLight = null;
    if (_ralOn && THREE.RectAreaLight) {
      try {
        if (THREE.RectAreaLightUniformsLib && typeof THREE.RectAreaLightUniformsLib.init === 'function') {
          THREE.RectAreaLightUniformsLib.init();
        }
        _ralLight = new THREE.RectAreaLight(0xffffff, _ralIntensity, 2.0, 0.5);
        _ralLight.position.set(0, 3, 1.5);
        _ralLight.lookAt(0, 0, 0);
        scene.add(_ralLight);
      } catch (e) { /* graceful fallback if uniforms lib missing */ }
    }

    // Soft shadow under the frame.
    // Two paths:
    //   • _shadowsOn = false (default): vertex-coloured ellipse "fake" — opaque
    //     match-the-background ring, no real shadow casting. Cheap, looks
    //     fine for the schematic "floating frame" view.
    //   • _shadowsOn = true: ShadowMaterial plane that receives the
    //     directional key light's shadow. Realistic, anchors the frame
    //     to a ground plane, but requires meshes to opt-in via
    //     castShadow/receiveShadow (handled by the rebuild useEffect
    //     that walks productGroup after construction).
    var _fakeShadow = null;
    var _realShadowPlane = null;
    if (_shadowsOn) {
      _realShadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.ShadowMaterial({ opacity: 0.22 })
      );
      _realShadowPlane.rotation.x = -Math.PI / 2;
      _realShadowPlane.position.y = -0.001;
      _realShadowPlane.receiveShadow = true;
      scene.add(_realShadowPlane);
    } else {
      _fakeShadow = (function() {
        var geo = new THREE.CircleGeometry(0.5, 64);
        var colors = [];
        var pos = geo.getAttribute('position');
        var bg = 250 / 255; // exact #fafafa match
        for (var i = 0; i < pos.count; i++) {
          var x = pos.getX(i), y = pos.getY(i);
          var d = Math.min(1, Math.sqrt(x * x + y * y) / 0.5);
          var f = d * d * d; // cubic falloff
          var v = bg - 0.18 * (1.0 - f);
          colors.push(v, v, v);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        var mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = -0.0005;
        scene.add(mesh);
        return mesh;
      })();
    }

    // HDRI environment.
    //   • 'flat' (default): 64×32 uniform grey. Zero hotspots — produces
    //     the schematic look the existing UI was tuned for.
    //   • 'studio': 256×128 procedural softbox HDRI with a key softbox
    //     above-front and a smaller side fill. Adds believable
    //     reflections to glass and metal hardware, and brings out the
    //     depth in woodgrain foils. Costs nothing to deploy (no asset
    //     fetch — generated in-canvas) and lifts perceived material
    //     quality substantially when paired with photographic textures.
    const hdriCanvas = document.createElement('canvas');
    var hdriW, hdriH;
    if (_hdriStyle === 'studio') {
      hdriW = 256; hdriH = 128;
      hdriCanvas.width = hdriW; hdriCanvas.height = hdriH;
      const hctx = hdriCanvas.getContext('2d');
      const skyGrad = hctx.createLinearGradient(0, 0, 0, hdriH);
      skyGrad.addColorStop(0.00, '#f4f4f3');
      skyGrad.addColorStop(0.42, '#e0e0e0');
      skyGrad.addColorStop(0.50, '#d2d2d2');
      skyGrad.addColorStop(0.70, '#b8b8b6');
      skyGrad.addColorStop(1.00, '#9e9e9c');
      hctx.fillStyle = skyGrad;
      hctx.fillRect(0, 0, hdriW, hdriH);
      // Front softbox (key)
      var sbX = hdriW * 0.5, sbY = hdriH * 0.30;
      var sbW = hdriW * 0.32, sbH = hdriH * 0.18;
      var sbGrad = hctx.createRadialGradient(sbX, sbY, 0, sbX, sbY, Math.max(sbW, sbH));
      sbGrad.addColorStop(0.0, 'rgba(255,255,254,0.95)');
      sbGrad.addColorStop(0.4, 'rgba(255,255,254,0.55)');
      sbGrad.addColorStop(1.0, 'rgba(255,255,254,0.0)');
      hctx.fillStyle = sbGrad;
      hctx.beginPath();
      hctx.ellipse(sbX, sbY, sbW, sbH, 0, 0, Math.PI * 2);
      hctx.fill();
      // Side fill softbox
      var sb2X = hdriW * 0.78, sb2Y = hdriH * 0.36;
      var sb2W = hdriW * 0.16, sb2H = hdriH * 0.14;
      var sb2Grad = hctx.createRadialGradient(sb2X, sb2Y, 0, sb2X, sb2Y, Math.max(sb2W, sb2H));
      sb2Grad.addColorStop(0.0, 'rgba(252,250,245,0.55)');
      sb2Grad.addColorStop(1.0, 'rgba(252,250,245,0.0)');
      hctx.fillStyle = sb2Grad;
      hctx.beginPath();
      hctx.ellipse(sb2X, sb2Y, sb2W, sb2H, 0, 0, Math.PI * 2);
      hctx.fill();
    } else {
      hdriW = 64; hdriH = 32;
      hdriCanvas.width = hdriW; hdriCanvas.height = hdriH;
      const hctx = hdriCanvas.getContext('2d');
      hctx.fillStyle = '#d8d8d8';
      hctx.fillRect(0, 0, hdriW, hdriH);
    }

    // Apply HDRI rotation (only meaningful for studio HDRI — flat is uniform).
    // Rotation is implemented as a horizontal pixel shift on the equirect
    // canvas, since r128 doesn't expose scene.environmentRotation. The
    // softbox positions wrap horizontally because the canvas is set to
    // RepeatWrapping. Rotation in degrees → pixel offset.
    if (_hdriStyle === 'studio' && _hdriRotation !== 0) {
      try {
        var rotPx = Math.round((((_hdriRotation % 360) + 360) % 360) / 360 * hdriW);
        if (rotPx !== 0) {
          var rotCvs = document.createElement('canvas');
          rotCvs.width = hdriW; rotCvs.height = hdriH;
          var rotCtx = rotCvs.getContext('2d');
          // Draw two halves shifted to wrap around the seam.
          rotCtx.drawImage(hdriCanvas, -rotPx, 0);
          rotCtx.drawImage(hdriCanvas, hdriW - rotPx, 0);
          // Replace original canvas content
          var orig = hdriCanvas.getContext('2d');
          orig.clearRect(0, 0, hdriW, hdriH);
          orig.drawImage(rotCvs, 0, 0);
        }
      } catch (e) { /* ignore — fall back to unrotated */ }
    }

    const hdriTex = new THREE.CanvasTexture(hdriCanvas);
    hdriTex.mapping = THREE.EquirectangularReflectionMapping;
    hdriTex.wrapS = THREE.RepeatWrapping; hdriTex.wrapT = THREE.RepeatWrapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    var _envPmrem = pmrem.fromEquirectangular(hdriTex).texture;
    scene.environment = _envPmrem;
    // Background mode 'hdri': use the same PMREM-blurred env texture as
    // the scene background, so the studio softbox visibly surrounds the
    // frame. Falls back to the temporary theme-grey otherwise.
    if (_bgMode === 'hdri' && _hdriStyle === 'studio') {
      scene.background = _envPmrem;
    }
    hdriTex.dispose(); pmrem.dispose();

    // EffectComposer pipeline: RenderPass → SSAOPass → FXAA
    // NOTE: EffectComposer may not have setPixelRatio in r128, so we manage
    // physical pixel dimensions explicitly via render target sizing.
    const hasComposer = !!(THREE.EffectComposer && THREE.RenderPass && THREE.SSAOPass && THREE.SSAOShader && THREE.SimplexNoise && THREE.ShaderPass && THREE.FXAAShader);
    let composer = null;
    let fxaaPass = null;
    let rt = null, fxaaMat = null; // fallback refs
    const _pr = renderer.getPixelRatio();
    const _pw = Math.round(el.clientWidth * _pr), _ph = Math.round(el.clientHeight * _pr);

    if (hasComposer) {
      try {
        // Create EffectComposer with explicit physical-pixel render target
        var composerRT = new THREE.WebGLRenderTarget(_pw, _ph, {
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
          stencilBuffer: false,
        });
        composer = new THREE.EffectComposer(renderer, composerRT);
        composer.addPass(new THREE.RenderPass(scene, camera));
        // FXAA anti-aliasing only — no SSAO
        fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
        fxaaPass.uniforms['resolution'].value.set(1/_pw, 1/_ph);
        composer.addPass(fxaaPass);
        // Saturation + contrast post-processing pass — only added when the
        // user has dialled either away from neutral (1.0). Avoids paying
        // shader cost when the controls are at default.
        if (Math.abs(_saturation - 1.0) > 0.001 || Math.abs(_contrast - 1.0) > 0.001) {
          var satConShader = {
            uniforms: {
              tDiffuse:   { value: null },
              saturation: { value: _saturation },
              contrast:   { value: _contrast },
            },
            vertexShader:
              'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
            fragmentShader:
              'precision highp float;' +
              'uniform sampler2D tDiffuse;' +
              'uniform float saturation;' +
              'uniform float contrast;' +
              'varying vec2 vUv;' +
              'void main(){' +
              '  vec4 c = texture2D(tDiffuse, vUv);' +
              // Saturation — mix between luminance and original colour
              '  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));' +
              '  vec3 sat = mix(vec3(l), c.rgb, saturation);' +
              // Contrast — push around 0.5 mid-grey
              '  vec3 con = (sat - 0.5) * contrast + 0.5;' +
              '  gl_FragColor = vec4(con, c.a);' +
              '}',
          };
          var satConPass = new THREE.ShaderPass(satConShader);
          composer.addPass(satConPass);
        }
      } catch(e) {
        console.warn('EffectComposer init failed, using fallback FXAA:', e);
        composer = null;
      }
    }
    if (!composer) {
      // Fallback: render target + manual FXAA — matches composer path resolution exactly
      rt = new THREE.WebGLRenderTarget(_pw, _ph, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
      fxaaMat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: rt.texture }, resolution: { value: new THREE.Vector2(1/_pw, 1/_ph) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'precision highp float; uniform sampler2D tDiffuse; uniform vec2 resolution; varying vec2 vUv; void main(){ vec3 luma=vec3(0.299,0.587,0.114); vec3 rgbNW=texture2D(tDiffuse,vUv+vec2(-1,-1)*resolution).rgb; vec3 rgbNE=texture2D(tDiffuse,vUv+vec2(1,-1)*resolution).rgb; vec3 rgbSW=texture2D(tDiffuse,vUv+vec2(-1,1)*resolution).rgb; vec3 rgbSE=texture2D(tDiffuse,vUv+vec2(1,1)*resolution).rgb; vec3 rgbM=texture2D(tDiffuse,vUv).rgb; float lNW=dot(rgbNW,luma),lNE=dot(rgbNE,luma),lSW=dot(rgbSW,luma),lSE=dot(rgbSE,luma),lM=dot(rgbM,luma); float lMin=min(lM,min(min(lNW,lNE),min(lSW,lSE))); float lMax=max(lM,max(max(lNW,lNE),max(lSW,lSE))); vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE))); float dirR=max((lNW+lNE+lSW+lSE)*0.03125,0.0078125); float rcpD=1.0/(min(abs(dir.x),abs(dir.y))+dirR); dir=min(vec2(8.0),max(vec2(-8.0),dir*rcpD))*resolution; vec3 A=0.5*(texture2D(tDiffuse,vUv+dir*(1.0/3.0-0.5)).rgb+texture2D(tDiffuse,vUv+dir*(2.0/3.0-0.5)).rgb); vec3 B=A*0.5+0.25*(texture2D(tDiffuse,vUv+dir*-0.5).rgb+texture2D(tDiffuse,vUv+dir*0.5).rgb); float lB=dot(B,luma); gl_FragColor=vec4((lB<lMin||lB>lMax)?A:B,1.0); }',
        depthTest: false, depthWrite: false,
      });
    }
    const postQuad = !composer ? new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fxaaMat) : null;
    const postScene = !composer ? (() => { const s = new THREE.Scene(); s.add(postQuad); return s; })() : null;
    const postCam = !composer ? new THREE.OrthographicCamera(-1,1,1,-1,0,1) : null;

    let isDrag = false, prevX = 0, prevY = 0, startX = 0, startY = 0;
    let theta = 0.28, phi = 0.32, radius = 2.5;
    // Tracks which side ('ext'/'int') of the model the camera was on last frame, so the
    // External/Internal colour tab can auto-switch to match. Initial theta=0.28 → cos>0 → 'ext'.
    let _lastCamSide = 'ext';
    let targetX = 0, targetY = 0.5, targetZ = 0;
    // Smooth animation targets
    let goalX = 0, goalY = 0.5, goalZ = 0, goalR = 2.5;
    let animating = false;
    const _raycaster = new THREE.Raycaster();
    const _mouseVec = new THREE.Vector2();

    const onDown = e => {
      isDrag = true;
      const t = e.touches ? e.touches[0] : e;
      prevX = t.clientX; prevY = t.clientY;
      startX = t.clientX; startY = t.clientY;
    };
    const onMove = e => {
      if (!isDrag) return;
      const t = e.touches ? e.touches[0] : e;
      theta -= (t.clientX - prevX) * 0.012;
      phi = Math.max(0.05, Math.min(Math.PI * 0.45, phi - (t.clientY - prevY) * 0.012));
      prevX = t.clientX; prevY = t.clientY;
    };
    const onUp = e => {
      if (!isDrag) { isDrag = false; return; }
      isDrag = false;
      // Click detection — if mouse barely moved, it's a click-to-zoom
      const t = e.changedTouches ? e.changedTouches[0] : e;
      const dx = t.clientX - startX, dy = t.clientY - startY;
      if (dx * dx + dy * dy < 9) {
        // Raycast from click position
        const rect = renderer.domElement.getBoundingClientRect();
        _mouseVec.set(((t.clientX - rect.left) / rect.width) * 2 - 1, -((t.clientY - rect.top) / rect.height) * 2 + 1);
        _raycaster.setFromCamera(_mouseVec, camera);
        var sd2 = sceneData.current;
        if (sd2.productGroup) {
          var hits = _raycaster.intersectObject(sd2.productGroup, true);
          if (hits.length > 0) {
            var pt = hits[0].point;
            goalX = pt.x; goalY = pt.y; goalZ = pt.z;
            goalR = Math.max(0.4, radius * 0.45);
            animating = true;
          }
        }
      }
    };
    const onWheel = e => { e.preventDefault(); radius = Math.max(0.3, Math.min(8, radius + e.deltaY * 0.015)); goalR = radius; };

    const cvs = renderer.domElement;
    cvs.addEventListener("mousedown", onDown); cvs.addEventListener("mousemove", onMove);
    cvs.addEventListener("mouseup", onUp); cvs.addEventListener("mouseleave", onUp);
    cvs.addEventListener("wheel", onWheel, { passive: false });
    cvs.addEventListener("touchstart", onDown, { passive: true }); cvs.addEventListener("touchmove", onMove, { passive: true }); cvs.addEventListener("touchend", onUp);

    sceneData.current = { renderer, scene, camera, productGroup: null, sashes: [], fakeShadow: _fakeShadow,
      getOrbit: () => ({ theta, phi, radius, targetY, targetX, targetZ }),
      setOrbit: (t, p, r, ty) => { theta = t; phi = p; radius = r; goalR = r; targetY = ty; goalY = ty; targetX = 0; goalX = 0; targetZ = 0; goalZ = 0; animating = false; },
      resetOrbit: () => {
        var sd3 = sceneData.current;
        var h2 = sd3.productGroup ? sd3.productGroup.position.y : 0.5;
        goalX = 0; goalY = h2; goalZ = 0;
        var W2 = sd3._lastW || 0.9, H2 = sd3._lastH || 0.9;
        goalR = Math.max(W2, H2) * 1.8;
        animating = true;
      }
    };
    // Signal the geometry rebuild useEffect that a fresh scene is ready to
    // receive the productGroup. The bump triggers a re-render, the rebuild
    // effect picks up the new sceneData.current via its sceneEpoch dep, and
    // attaches geometry to the new scene. Robust across effect-ordering and
    // React Strict Mode — does not rely on rebuild's deps including any
    // render-quality field, which previously only worked by accident.
    //
    // Skip the bump on the very first mount: the rebuild useEffect already
    // fires on initial render via its other deps (currentView, productType,
    // colour, etc. all transitioning from undefined/null to defined values).
    // Bumping here too would cause an unnecessary double-build with a brief
    // visual flash. After the first mount we always bump.
    if (initRanOnce.current) {
      setSceneEpoch(function (e) { return e + 1; });
    }
    initRanOnce.current = true;

    let animId;
    const loop = () => {
      animId = requestAnimationFrame(loop);
      // Smooth lerp toward goal when animating (click-to-zoom or reset)
      if (animating) {
        targetX += (goalX - targetX) * 0.1;
        targetY += (goalY - targetY) * 0.1;
        targetZ += (goalZ - targetZ) * 0.1;
        radius += (goalR - radius) * 0.1;
        if (Math.abs(targetX - goalX) < 0.0005 && Math.abs(targetY - goalY) < 0.0005 && Math.abs(radius - goalR) < 0.001) {
          targetX = goalX; targetY = goalY; targetZ = goalZ; radius = goalR;
          animating = false;
        }
      }
      camera.position.x = targetX + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.y = targetY + radius * Math.cos(phi);
      camera.position.z = targetZ + radius * Math.sin(phi) * Math.cos(theta);
      camera.lookAt(targetX, targetY, targetZ);
      // Auto-switch the External/Internal colour tab to match what the user is looking at.
      // Camera at +Z (cos(theta) > 0) → exterior view; at -Z → interior view.
      // Small dead-band around ±90° (|cos| < 0.05) avoids tab flicker on profile-edge views.
      // Only fires on side change so React stays quiet.
      var _camCos = Math.cos(theta);
      var _side = _camCos > 0.05 ? 'ext' : (_camCos < -0.05 ? 'int' : null);
      if (_side && _side !== _lastCamSide) {
        _lastCamSide = _side;
        setColTarget(_side);
      }
      if (composer) {
        composer.render();
      } else {
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(postScene, postCam);
      }
      // Project dimension anchor points to screen for HTML bubbles
      var sd2 = sceneData.current;
      if (sd2.dimAnchors && sd2.productGroup && dimOverlayRef.current) {
        var bubbles = dimOverlayRef.current.children;
        for (var di = 0; di < sd2.dimAnchors.length; di++) {
          var anc = sd2.dimAnchors[di];
          var wp = anc.pos.clone();
          sd2.productGroup.localToWorld(wp);
          wp.project(camera);
          var sx = (wp.x * 0.5 + 0.5) * el.clientWidth;
          var sy = (-wp.y * 0.5 + 0.5) * el.clientHeight;
          if (bubbles[di]) {
            bubbles[di].style.transform = 'translate(-50%,-50%) translate(' + sx + 'px,' + sy + 'px)';
          }
        }
      }
    };
    loop();

    const ro = new ResizeObserver(() => {
      if (!el || !el.clientWidth || !el.clientHeight) return;
      var rpr = renderer.getPixelRatio();
      var rpw = Math.round(el.clientWidth * rpr), rph = Math.round(el.clientHeight * rpr);
      camera.aspect = el.clientWidth/el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
      if (composer) {
        composer.setSize(rpw, rph);
        if (fxaaPass) { fxaaPass.uniforms['resolution'].value.set(1/rpw, 1/rph); }
      } else if (rt) {
        rt.setSize(rpw, rph);
        if (fxaaMat) fxaaMat.uniforms.resolution.value.set(1/rpw, 1/rph);
      }
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(animId); ro.disconnect();
      try { if (composer && typeof composer.dispose === 'function') composer.dispose(); } catch(_){}
      try { if (rt) rt.dispose(); } catch(_){}
      try { if (fxaaMat) fxaaMat.dispose(); } catch(_){}
      try { renderer.dispose(); } catch(_){}
      try { if (el.contains(cvs)) el.removeChild(cvs); } catch(_){}
    };
  }, [currentView, appSettings.renderQuality]);

  // Rebuild geometry
  useEffect(() => {
    if (currentView !== 'editor') return;
    const sd = sceneData.current; if (!sd.scene) return;
    if (sd.productGroup) { sd.scene.remove(sd.productGroup); sd.productGroup.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
    const W = width*S, H = height*S;
    const mat = makeProfileMat(colourDef);
    const matInt = makeProfileMat(colourDefInt);
    const { frame, sashes } = buildProduct(productType, W, H, mat, panelCount, opensIn, transomPct, glassSpecObj, colonialGrid, cellTypes, matInt, zoneWidths, zoneHeights, hardwareColour, openStyle, cellBreaks, (appSettings && appSettings.pricingConfig) || null, null);
    const group = new THREE.Group(); group.add(frame); sashes.forEach(s => group.add(s));

    // Fly screen — per cell for grid layouts, single for simple windows.
    // WIP10: only add fly screen to cells that are actually sashes.
    if (showFlyScreen && ['tilt_turn_window','awning_window','casement_window'].indexOf(productType) >= 0) {
      const pd = (typeof getResolvedProfileDims === 'function')
        ? getResolvedProfileDims(productType, (appSettings && appSettings.pricingConfig) || null, null)
        : getProfileDims(productType);
      const fw_m = pd.frameW * S;
      const mw_m = pd.mullionW * S;
      const oW_fs = W - fw_m * 2;
      const oH_fs = H - fw_m * 2;
      const isExternal = productType === 'tilt_turn_window';
      const fsMaterial = isExternal ? mat : matInt;
      const numR = cellTypes.length;
      const numC = cellTypes[0] ? cellTypes[0].length : 1;

      if (numR > 1 || numC > 1) {
        // Grid layout — individual fly screen per cell (sashes only)
        var totalMulW = (numC - 1) * mw_m;
        var totalTraH = (numR - 1) * mw_m;
        var defCW = (oW_fs - totalMulW) / numC;
        var defCH = (oH_fs - totalTraH) / numR;
        var cwArr = (zoneWidths && zoneWidths.length === numC) ? zoneWidths.map(function(mm){return mm * S}) : Array(numC).fill(defCW);
        var chArr = (zoneHeights && zoneHeights.length === numR) ? zoneHeights.map(function(mm){return mm * S}) : Array(numR).fill(defCH);

        // Defensive rescale — mirror buildGridWindow's behaviour so the fly
        // screens stay aligned with the window cells when the user changes
        // overall width/height in the bottom toolbar without explicitly
        // editing the zoneWidths/zoneHeights arrays. Without this rescale
        // the fly screens were stuck at the old cell sizes while the window
        // stretched to the new dimensions, leaving them floating in the
        // middle of each aperture.
        var availColW_fs = oW_fs - totalMulW;
        var availRowH_fs = oH_fs - totalTraH;
        var cwSumFs = cwArr.reduce(function(a, b){ return a + b; }, 0);
        var chSumFs = chArr.reduce(function(a, b){ return a + b; }, 0);
        if (cwSumFs > 0 && Math.abs(cwSumFs - availColW_fs) > 0.0005) {
          var kwFs = availColW_fs / cwSumFs;
          for (var i = 0; i < cwArr.length; i++) cwArr[i] *= kwFs;
        }
        if (chSumFs > 0 && Math.abs(chSumFs - availRowH_fs) > 0.0005) {
          var khFs = availRowH_fs / chSumFs;
          for (var j = 0; j < chArr.length; j++) chArr[j] *= khFs;
        }

        for (var fr = 0; fr < numR; fr++) {
          for (var fc = 0; fc < numC; fc++) {
            // WIP10: skip fixed cells — no sash, no fly screen
            if (cellTypes[fr] && cellTypes[fr][fc] === 'fixed') continue;
            var cw2 = cwArr[fc], ch2 = chArr[fr];
            // Cell center X
            var ccx = -oW_fs / 2;
            for (var ci = 0; ci < fc; ci++) ccx += cwArr[ci] + mw_m;
            ccx += cw2 / 2;
            // Cell center Y
            var ccy = oH_fs / 2;
            for (var ri = 0; ri < fr; ri++) ccy -= (chArr[ri] + mw_m);
            ccy -= ch2 / 2;

            var cellFs = buildFlyScreen(cw2, ch2, pd.depth * S, fsMaterial, isExternal);
            cellFs.position.set(ccx, ccy, 0);
            group.add(cellFs);
          }
        }
      } else {
        // Simple window — single fly screen for entire opening
        var fs = buildFlyScreen(oW_fs, oH_fs, pd.depth * S, fsMaterial, isExternal);
        group.add(fs);
      }
    }

    // 3D Dimension lines — only when showDimensions is enabled
    if (showDimensions) {
      const pd2 = getProfileDims(productType);
      const fw2 = pd2.frameW * S;
      const mw2 = pd2.mullionW * S;
      const nC = cellTypes[0] ? cellTypes[0].length : 1;
      const nR = cellTypes.length;
      const dims = buildDimensionLines(W, H, fw2, mw2, zoneWidths, zoneHeights, nC, nR);
      group.add(dims);
      sd.dimAnchors = dims.userData.dimAnchors || [];
      setDimAnchors(sd.dimAnchors);
    } else {
      sd.dimAnchors = [];
      setDimAnchors([]);
    }

    group.position.y = H/2; sd.scene.add(group);
    sd.productGroup = group; sd.sashes = sashes; sd.productTypeId = productType; sd._lastW = W; sd._lastH = H;
    // When shadows are enabled in Render quality settings, opt every mesh
    // in the product group into shadow casting + receiving. mergeMesh and
    // the catalog-path builders set these to false by default; we flip
    // them post-construction so the same builders work for both shadowed
    // and non-shadowed renders without per-builder branching.
    var _rq = (appSettings && appSettings.renderQuality) || {};
    if (_rq.shadows) {
      group.traverse(function(c) {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
      });
    }
    // Scale fake shadow to fit under this product (only if it exists —
    // shadow path replaces fakeShadow with a real ShadowMaterial plane).
    if (sd.fakeShadow) { sd.fakeShadow.scale.set(W * 1.05 + 0.04, W * 0.22 + 0.03, 1); }
    const orb = sd.getOrbit(); sd.setOrbit(orb.theta, orb.phi, Math.max(W, H)*1.8, H/2);
  }, [currentView, productType, colour, colourInt, appSettings.editColours, width, height, panelCount, opensIn, openStyle, transomPct, glassSpec, colonialGrid, cellTypes, cellBreaks, zoneWidths, zoneHeights, hardwareColour, showFlyScreen, showDimensions,
      // Rebuild when DXF-imported polygons or product→profile links change so
      // the 3D viewport reflects newly-imported uPVC profiles immediately.
      appSettings.pricingConfig && appSettings.pricingConfig.profiles,
      appSettings.pricingConfig && appSettings.pricingConfig.profileLinks,
      // Rebuild when the THREE init useEffect creates a fresh scene (e.g. on
      // any render-quality change that requires a teardown). The init bumps
      // sceneEpoch after sceneData.current is reassigned; this dep then
      // re-fires the rebuild so the productGroup is attached to the new
      // scene rather than orphaned in the disposed one.
      sceneEpoch]);

  // Animate sashes
  useEffect(() => {
    const sd = sceneData.current; if (!sd.sashes) return;
    animateSashes(sd.productTypeId, sd.sashes, openPct/100, opensIn, openStyle);
  }, [openPct, productType, panelCount, opensIn, openStyle]);

  // Update 3D scene background when theme changes
  useEffect(() => {
    const sd = sceneData.current; if (!sd.scene) return;
    sd.scene.background = new THREE.Color(appSettings.theme === 'dark' ? '#1a1a24' : '#fafafa');
  }, [appSettings.theme]);

  const handleProductChange = id => {
    const m = PRODUCTS.find(p => p.id === id); if (!m) return;
    setProductType(id); setWidth(m.w); setHeight(m.h); setPanelCount(m.p); setOpenPct(0); setOpensIn(false);
    setOpenStyle(DEFAULT_STYLES[id] || "left_hand");
    setTransomPct(null);
    setGridCols(1); setGridRows(1); setCellTypes([["fixed"]]); setCellBreaks([[{}]]);
    setZoneWidths([m.w - 140]); setZoneHeights([m.h - 140]);
  };

  
  const applyStylePreset = (preset) => {
    const avW = width - 140; // opening width
    const avH = height - 140;
    const mw = mullionMm;
    const cols = preset.cols;
    const rows = preset.rows;
    const wrSum = preset.wr.reduce((a,b) => a+b, 0);
    const hrSum = preset.hr.reduce((a,b) => a+b, 0);
    const availW = avW - (cols - 1) * mw;
    const availH = avH - (rows - 1) * mw;
    const zw = preset.wr.map(r => Math.round(r / wrSum * availW));
    const zh = preset.hr.map(r => Math.round(r / hrSum * availH));
    setGridCols(cols);
    setGridRows(rows);
    setCellTypes(preset.cells);
    setCellBreaks(Array.from({length: rows}, () => Array.from({length: cols}, () => ({}))));
    setZoneWidths(zw);
    setZoneHeights(zh);
    setShowStylePicker(false);
  };

  const selCol = colTarget === "ext" ? colour : colourInt;
  const handleColClick = id => {
    // 1. Update the editor-local colour state — this is what the scene
    //    rebuild useEffect watches via deps.
    if (colTarget === "ext") setColour(id); else setColourInt(id);
    // 2. Persist into projectItems[activeFrameIdx] so the colour stays
    //    when the user navigates away and back. The editor-local state
    //    doesn't auto-persist; saveCurrentFrameState only runs on
    //    openFrameEditor / returnToDashboard / Production / Save.
    if (activeFrameIdx >= 0 && activeFrameIdx < projectItems.length) {
      setProjectItems(function(prev) {
        var next = prev.slice();
        var upd = {};
        if (colTarget === "ext") upd.colour = id; else upd.colourInt = id;
        next[activeFrameIdx] = Object.assign({}, next[activeFrameIdx], upd);
        return next;
      });
    }
    // 3. Apply to all frames if the "Apply to all" checkbox is on.
    if (applyColourAll) {
      setProjectItems(function(prev) {
        return prev.map(function(item) {
          var upd = {};
          if (colTarget === "ext") upd.colour = id; else upd.colourInt = id;
          return Object.assign({}, item, upd);
        });
      });
    }
    // 4. Mark dirty so auto-save fires.
    setQuoteDirty(true);
  };
  const handleGlassChange = id => {
    setGlassSpec(id);
    if (applyGlassAll) {
      setProjectItems(function(prev) {
        return prev.map(function(item) { return Object.assign({}, item, { glassSpec: id }); });
      });
    }
  };
  const windows = PRODUCTS.filter(p => p.cat === "window"), doors = PRODUCTS.filter(p => p.cat === "door");

  const styleIcons = {
    left_hand: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="10,2 4,8 10,14"/></svg>,
    right_hand: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="6,2 12,8 6,14"/></svg>,
    both: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="9,2 3,8 9,14"/><polyline points="7,2 13,8 7,14"/></svg>,
    tilt_only: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3,2"><polyline points="2,12 8,5 14,12"/></svg>,
    turn_only: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="10,2 4,8 10,14"/></svg>,
    tilt_turn: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="10,3 5,8 10,13"/><polyline points="3,12 8,6 13,12" strokeDasharray="2,2"/></svg>,
    left_slides: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="8" x2="4" y2="8"/><polyline points="7,5 4,8 7,11"/></svg>,
    right_slides: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="4" y1="8" x2="12" y2="8"/><polyline points="9,5 12,8 9,11"/></svg>,
    both_slide: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="2" y1="8" x2="14" y2="8"/><polyline points="5,5 2,8 5,11"/><polyline points="11,5 14,8 11,11"/></svg>,
    all_left: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><line x1="12" y1="8" x2="4" y2="8"/><polyline points="7,5 4,8 7,11"/><line x1="3" y1="3" x2="3" y2="13" strokeWidth="1.8"/><line x1="7" y1="4" x2="7" y2="12" strokeDasharray="2,1"/></svg>,
    all_right: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><line x1="4" y1="8" x2="12" y2="8"/><polyline points="9,5 12,8 9,11"/><line x1="13" y1="3" x2="13" y2="13" strokeWidth="1.8"/><line x1="9" y1="4" x2="9" y2="12" strokeDasharray="2,1"/></svg>,
    "1L_rest_R": <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><polyline points="5,5 2,8 5,11"/><polyline points="9,5 12,8 9,11"/><line x1="6" y1="3" x2="6" y2="13" strokeWidth="1.5"/></svg>,
    "1R_rest_L": <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><polyline points="7,5 4,8 7,11"/><polyline points="11,5 14,8 11,11"/><line x1="10" y1="3" x2="10" y2="13" strokeWidth="1.5"/></svg>,
    split: <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2"><polyline points="6,5 3,8 6,11"/><polyline points="10,5 13,8 10,11"/><line x1="8" y1="3" x2="8" y2="13" strokeWidth="1.5" strokeDasharray="2,1"/></svg>,
  };

  const canTransom = ["awning_window", "fixed_window"].includes(productType);

  // Product categories for new frame panel
  var frameCats = [
    { id:'windows', label:'PVCu Windows', types: PRODUCTS.filter(function(p){return p.cat==='window'}) },
    { id:'doors', label:'PVCu Doors', types: PRODUCTS.filter(function(p){return p.cat==='door'}) },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: T.bg, fontFamily: "'Segoe UI',Tahoma,Geneva,Verdana,sans-serif", color: T.text }}>

      {/* ═══════════════════════════════════════════════════════════════════
          TEMP DEV — survey-mode toggle (REMOVE BEFORE SHIP / WIP31 cleanup)
          Floating button, fixed position. Clicking flips crmInit.mode.
          - Click "Test: Survey Mode" → calls __cadBridge.onInit({ mode:'survey', ... })
            with a synthetic projectInfo so the form has letterhead data. Existing
            canvas frames stay (the bridge only overwrites items when activeQuoteId
            is supplied, which we don't pass here).
          - Click "Back to Design" → calls __cadBridge.onInit({ mode:'design' }).
          The badge shows current mode (or "—" if no init has fired).
          Search for "TEMP DEV" to find + remove this block.
          WIP35 (FSO-M1: TEMP DEV) — added Final Mode button. Per
          CAD_FSO_HANDOFF.md §6 Option C: lets Phoenix smoke-test FSO without
          a real job. The button bundles current canvas projectItems as
          designData so existing frames become the FSO test scope (the CAD
          init handler reads designData.projectItems via the WIP33 fallback).
          REMOVE BEFORE SHIP — grep "FSO-M1: TEMP DEV" to find this block.
          ═══════════════════════════════════════════════════════════════════ */}
      <div style={{
        position:'fixed', bottom:8, right:8, zIndex:99999,
        background:'#fef3c7', border:'2px solid #f59e0b', borderRadius:6,
        padding:'6px 10px', boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
        fontSize:11, fontFamily:'monospace', display:'flex', alignItems:'center', gap:8
      }}>
        <span style={{ fontWeight:700, color:'#7c2d12' }}>🧪 TEMP DEV</span>
        <span style={{ color:'#7c2d12' }}>mode:</span>
        <span style={{
          background:'white', padding:'2px 6px', borderRadius:3, fontWeight:700,
          color: (crmInit && crmInit.mode === 'survey') ? '#166534' : (crmInit && crmInit.mode === 'final') ? '#9a3412' : '#1f2937'
        }}>
          {(crmInit && crmInit.mode) || '—'}
        </span>
        {(!crmInit || (crmInit.mode !== 'survey' && crmInit.mode !== 'final')) && (
          <button onClick={function(){
            try {
              window.__cadBridge.onInit({
                mode: 'survey',
                projectInfo: {
                  jobNumber: 'TEST-' + Math.floor(Math.random()*9000+1000),
                  customerName: 'Test Customer',
                  siteAddress: '123 Test St, Melbourne VIC 3000',
                  surveyorName: 'Phoenix',
                  clientName: 'Test Customer',
                },
              });
            } catch (e) { console.error('Bridge call failed:', e); alert('Bridge call failed: ' + e.message); }
          }}
          style={{
            background:'#16a34a', color:'white', border:'none', borderRadius:3,
            padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
            fontFamily:'monospace'
          }}>
            → Survey Mode
          </button>
        )}
        {/* FSO-M1: TEMP DEV — Final Mode toggle. Synthesises designData from
            the current canvas. The CAD-side onInit honours payload.designData
            even when the canvas already has frames (WIP35 finalData overlay
            takes designData as the dim source of truth). Tests:
            - FSO banner appears (amber sub-bar below dashboard header)
            - New Frame button hides
            - Frame ✕ delete hides
            - W×H pills lock with toast feedback
            - Save → Final_TEST-NNNN.pdf with redesigned header */}
        {(!crmInit || (crmInit.mode !== 'survey' && crmInit.mode !== 'final')) && (
          <button onClick={function(){
            try {
              var jobNum = 'TEST-' + Math.floor(Math.random()*9000+1000);
              var snap = projectItemsBridgeRef.current || [];
              window.__cadBridge.onInit({
                mode: 'final',
                projectInfo: {
                  jobNumber: jobNum,
                  customerName: 'Test Customer',
                  siteAddress: '123 Test St, Melbourne VIC 3000',
                  salesManager: 'Phoenix Cooper',
                  clientName: 'Test Customer',
                },
                customer: { name: 'Test Customer', phone: '0400 000 000', email: 'test@example.com' },
                designData: { projectItems: snap },
              });
            } catch (e) { console.error('Bridge call failed:', e); alert('Bridge call failed: ' + e.message); }
          }}
          style={{
            background:'#9a3412', color:'white', border:'none', borderRadius:3,
            padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
            fontFamily:'monospace'
          }}>
            → Final Mode
          </button>
        )}
        {(crmInit && (crmInit.mode === 'survey' || crmInit.mode === 'final')) && (
          <button onClick={function(){
            try { window.__cadBridge.onInit({ mode: 'design' }); }
            catch (e) { console.error('Bridge call failed:', e); }
          }}
          style={{
            background:'#1f2937', color:'white', border:'none', borderRadius:3,
            padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer',
            fontFamily:'monospace'
          }}>
            ← Back to Design
          </button>
        )}
      </div>
      {/* ═══════════════════ END TEMP DEV ═══════════════════════════════ */}

      {/* ═══ DASHBOARD VIEW ═══ */}
      {currentView === 'dashboard' && <React.Fragment>
        {/* Dashboard Header */}
        <div style={{ height: 56, background: "#0e0e0e", display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0, borderBottom: "3px solid #c41230" }}>
          <img src={SPARTAN_LOGO} alt="Spartan DG" style={{ height:44 }}/>
          <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
            <span style={{ color:'white', fontSize:11, fontWeight:700, letterSpacing:1.5 }}>SPARTAN <span style={{ fontWeight:400, opacity:0.5 }}>CAD</span></span>
            <span style={{ color:'rgba(255,255,255,0.35)', fontSize:8, letterSpacing:0.8 }}>WINDOW & DOOR DESIGN</span>
          </div>
          <div style={{ width:1, height:28, background:'rgba(255,255,255,0.1)', margin:'0 4px' }}/>
          <span onClick={function(){
              setProjectInfoOpenSnap({
                address1: projectInfo.address1 || '',
                address2: projectInfo.address2 || '',
                suburb: projectInfo.suburb || '',
                postcode: projectInfo.postcode || '',
                state: projectInfo.state || '',
              });
              setProjectInfoBackprop(!!(crmLink && crmLink.type && crmLink.id));
              setShowProjectInfo(true);
            }}
            title="Click to edit customer details"
            style={{ color:'white', fontSize:13, fontWeight:600, cursor:'pointer', padding:'4px 8px', borderRadius:4, transition:'background 0.15s', display:'flex', alignItems:'center', gap:6 }}
            onMouseEnter={function(e){ e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={function(e){ e.currentTarget.style.background = 'transparent'; }}>
            {projectName}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{opacity:0.5}}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginLeft:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background: projectStatus==='New Enquiry'?'#3B82F6':projectStatus==='Quote Sent'?'#EAB308':'#22C55E' }}/>
            <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10 }}>{projectStatus}</span>
          </div>

          {/* WIP27: Special-colour project summary. Counts frames whose
              exterior/interior combination falls outside the standard set
              (see isStandardColourCombo). Click opens Price Panel so the
              rep can see which frame(s) need attention. */}
          {(function(){
            var specials = (projectItems || []).filter(function(f){
              var c = isStandardColourCombo(f.colour, f.colourInt);
              return !c.standard;
            });
            if (specials.length === 0) return null;
            return <div onClick={function(){ setShowPricePanel(true); }}
                        title={specials.length + ' frame(s) with non-standard colour combinations. Click to review in the Price panel.'}
                        style={{ display:'flex', alignItems:'center', gap:5, marginLeft:8, padding:'3px 8px',
                                 background:'#fbbf24', color:'#78350f', borderRadius:4, cursor:'pointer',
                                 border:'1px solid #f59e0b', fontWeight:700, fontSize:10, letterSpacing:0.5 }}>
              <span style={{ fontSize:12 }}>⚠</span>
              <span>{specials.length} SPECIAL COLOUR{specials.length === 1 ? '' : 'S'}</span>
            </div>;
          })()}

          {/* WIP9: project-level default Property type, inline next to the project name.
              Changes here update projectInfo.propertyType; addNewFrame and loadFrameState
              inherit it as the default for new windows on this project. Always visible
              so the rep can sight-check / change it at a glance. */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:12, padding:'4px 8px', background:'rgba(255,255,255,0.06)', borderRadius:6, border:'1px solid rgba(255,255,255,0.12)' }}
               title="Default property type for new windows on this project — override per-window from the 3D editor">
            <span style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.5)', letterSpacing:0.7, textTransform:'uppercase' }}>Property</span>
            <select value={projectInfo.propertyType || 'brick_veneer'}
                    onChange={function(e){ setProjectInfo(function(prev){ return Object.assign({}, prev, { propertyType: e.target.value }); }); }}
                    style={{ background:'transparent', color:'white', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4, fontSize:11, fontWeight:600, padding:'2px 6px', outline:'none', cursor:'pointer' }}>
              {(typeof PROPERTY_TYPES !== 'undefined' ? PROPERTY_TYPES : []).map(function(p){
                return <option key={p.id} value={p.id} style={{ color:'#111', background:'white' }}>{p.label}</option>;
              })}
            </select>
          </div>

          {/* WIP23: project-level Installation type — default for new frames.
              Per-frame installationType can still override via the Price Panel
              frame overrides section. Selecting "Supply Only" from the top bar
              only affects NEW frames; existing frames keep their own setting. */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:8, padding:'4px 8px', background:'rgba(255,255,255,0.06)', borderRadius:6, border:'1px solid rgba(255,255,255,0.12)' }}
               title="Default installation type for new frames on this project — override per-frame from the Price panel">
            <span style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.5)', letterSpacing:0.7, textTransform:'uppercase' }}>Install</span>
            <select value={projectInfo.installationType || 'retrofit'}
                    onChange={function(e){ setProjectInfo(function(prev){ return Object.assign({}, prev, { installationType: e.target.value }); }); }}
                    style={{ background:'transparent', color:'white', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4, fontSize:11, fontWeight:600, padding:'2px 6px', outline:'none', cursor:'pointer' }}>
              {(typeof INSTALLATION_TYPES !== 'undefined' ? INSTALLATION_TYPES : []).map(function(p){
                return <option key={p.id} value={p.id} style={{ color:'#111', background:'white' }}>{p.label}</option>;
              })}
            </select>
          </div>

          {/* ═══ M3: quote dropdown ═══
              Renders only when the CRM init payload supplied one or more
              quotes. Standalone mode (no CRM handshake) hides this block
              entirely, so the header looks unchanged for local/dev use.
              Selecting a quote calls handleQuoteSwitch which re-hydrates
              the canvas and confirms before discarding unsaved edits.
              The "+ New Quote" button clears the canvas and sets
              currentQuoteId to null so the next save echoes quoteId:null
              and the CRM allocates a fresh id. An orange dot next to the
              select signals unsaved edits on the current quote. */}
          {(function() {
            var init = crmInit || {};
            // M4: survey and final modes are single-quote contexts
            // (contract §4.3/§4.4). The won quote is preloaded and cannot
            // be switched — hide the dropdown to avoid implying otherwise.
            if (init.mode === 'survey' || init.mode === 'final') return null;
            var quotes = Array.isArray(init.quotes) ? init.quotes : [];
            if (quotes.length === 0) return null;
            var selectedValue = currentQuoteId || '__new__';
            return <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:12, paddingLeft:12, borderLeft:'1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color:'rgba(255,255,255,0.35)', fontSize:9, letterSpacing:0.8, textTransform:'uppercase' }}>Quote</span>
              <select
                value={selectedValue}
                onChange={function(e){
                  var v = e.target.value;
                  if (v === '__new__') { handleNewQuote(); }
                  else { handleQuoteSwitch(v); }
                }}
                style={{ background:'rgba(255,255,255,0.08)', color:'white', border:'1px solid rgba(255,255,255,0.12)', borderRadius:4, padding:'4px 8px', fontSize:11, fontWeight:500, cursor:'pointer', minWidth:200 }}>
                {quotes.map(function(q){
                  var label = q.label || q.id;
                  var priceStr = (typeof q.totalPrice === 'number') ? ('$' + Math.round(q.totalPrice).toLocaleString('en-AU')) : null;
                  var framesStr = (typeof q.frameCount === 'number') ? (q.frameCount + ' frame' + (q.frameCount === 1 ? '' : 's')) : null;
                  var suffix = [priceStr, framesStr].filter(Boolean).join(' · ');
                  var text = suffix ? (label + ' · ' + suffix) : label;
                  return <option key={q.id} value={q.id}>{text}</option>;
                })}
                <option value="__new__">+ New Quote</option>
              </select>
              {quoteDirty && <span title="Unsaved changes" style={{ width:7, height:7, borderRadius:'50%', background:'#F59E0B' }}/>}
            </div>;
          })()}

          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            {/* ── Build save + search controls (top toolbar) ──
                These match the visual style of Production/Price (translucent
                white). Visible from every view, including the empty-frames
                landing page. The corresponding buttons below on the per-frame
                toolbar were removed to avoid duplication. */}
            {buildSaveError && (
              <span onClick={function(){
                       if (confirm('Save error:\n\n' + buildSaveError + '\n\nDismiss this warning?')) {
                         setBuildSaveError(null);
                       }
                     }}
                     title="Click for details"
                     style={{ color:'#fca5a5', fontSize:10, fontFamily:'monospace', padding:'3px 6px', background:'rgba(255,0,0,0.15)', border:'1px solid rgba(255,0,0,0.3)', borderRadius:3, cursor:'pointer' }}>
                ⚠ Save failed
              </span>
            )}
            <button onClick={function(){ setShowBuildSearch(function(s){ return !s; }); }}
                    title="Search saved builds (customer, address, job number)"
                    style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer', color:'white', fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
              Search
            </button>
            <button onClick={function(){ setShowBuildsPanel(true); }}
                    title="Manage saved builds — load, snapshot, download backup"
                    style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer', color:'white', fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7l9-4 9 4v10l-9 4-9-4V7z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>
              Builds
            </button>
            <button onClick={function(){
                      if (projectItems && projectItems.length > 0) {
                        if (!confirm('Start a new project? Save your current work first if you want to keep editing it.')) return;
                      }
                      startNewProject();
                    }}
                    title="Start a new project (current is snapshotted first)"
                    style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer', color:'white', fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              New
            </button>
            <button onClick={function(){
                      var result = saveBuildNow();
                      // Three failure modes from the user's POV:
                      //  1) Storage module not loaded AND no CRM — nothing
                      //     is wired up. Most common cause of "save broken".
                      //  2) Storage tried but threw (quota, disabled, etc.)
                      //  3) Some other path that didn't write anywhere.
                      // All three need an alert — silent failure is the
                      // worst possible behaviour for "Save."
                      if (result.storageMissing && !result.hadCrm) {
                        alert(
                          'Save failed: build storage module not loaded.\n\n' +
                          'The 41-build-storage.js file is missing from your deployed bundle. ' +
                          'Copy 41-build-storage.js into the modules/ folder and rebuild.\n\n' +
                          '(Open the browser console for the full warning.)'
                        );
                      } else if (!result.localOk && !result.hadCrm && !result.sbQueued) {
                        var detail = (result.localError && result.localError.message) || 'unknown error';
                        alert('Save failed.\n\n' + detail + '\n\nOpen the browser console for full details.');
                      } else if (!result.localOk && !result.hadCrm && result.sbQueued) {
                        // Local failed but cloud was queued — quieter notification.
                        // The error pill in the top bar will show details.
                      }
                    }}
                    title={activeBuildId ? 'Save this job (local + cloud if connected)' : 'Save this job'}
                    style={{
                      background: (Date.now() - saveFlashAt < 2000) ? '#16a34a' : (quoteDirty ? '#f59e0b' : 'rgba(255,255,255,0.12)'),
                      border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer',
                      color:'white', fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:4,
                      transition:'background 0.2s'
                    }}>
              {(Date.now() - saveFlashAt < 2000) ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Saved
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {quoteDirty ? 'Save *' : 'Save'}
                </>
              )}
            </button>
            <button
              onClick={function(){
                // Commit any in-flight editor state (Frame Style preset,
                // colour, fly screen, hardware) back to projectItems
                // before opening the production view — otherwise the cut
                // engine reads stale data and the lists come up empty.
                commitEditorStateToProject(false);
                setShowProduction(true);
                setProductionTab('profile');
              }}
              disabled={projectItems.length === 0}
              title={projectItems.length === 0 ? 'Add at least one frame to view production lists' : 'Open production lists — Profile, Milling, Hardware, Glass'}
              style={{
                background: projectItems.length === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.12)',
                border:'none', borderRadius:5, padding:'5px 12px',
                cursor: projectItems.length === 0 ? 'not-allowed' : 'pointer',
                color: projectItems.length === 0 ? 'rgba(255,255,255,0.4)' : 'white',
                fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:4,
                opacity: projectItems.length === 0 ? 0.5 : 1,
              }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              Production
            </button>
            <button onClick={function(){ commitEditorStateToProject(false); setShowPricePanel(true); }} style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer', color:'white', fontSize:10, fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
              Price
            </button>
            <button onClick={function(){setShowSettings(true)}} style={{ background:'#c41230', border:'none', borderRadius:5, padding:'5px 10px', cursor:'pointer', color:'white', fontSize:10, fontWeight:600 }}>Settings</button>
          </div>
        </div>

        {/* ═══ WIP35 (FSO): FINAL SIGN OFF banner ═══════════════════════
            Amber sub-bar below the dashboard header. Renders only when
            crmInit.mode === 'final' (postMessage-based handoff — separate
            from crmLink for URL-based handoff). Conveys two things:
            (1) the document being prepared (Final Sign Off for [customer])
            (2) the dimension lock — W×H come from Check Measure and can't
            be changed here. The lock toast (showLockToast / lockToast) sits
            inside this banner area when fired, so the SM gets feedback in
            the same visual region as the contextual hint.
            Per CAD_FSO_HANDOFF.md §5.3 / §8 anchor "FSO-M1 dashboard banner". */}
        {(crmInit && crmInit.mode === 'final') && (function(){
          var custLabel = (crmInit.customer && crmInit.customer.name)
                       || (crmInit.projectInfo && (crmInit.projectInfo.customerName || crmInit.projectInfo.clientName))
                       || crmInit.projectName
                       || '—';
          var jobLabel = (crmInit.projectInfo && (crmInit.projectInfo.jobNumber || crmInit.projectInfo.projectNumber)) || '';
          return <div style={{
            background:'#fef3c7', borderBottom:'1px solid #f59e0b',
            padding:'8px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0,
            fontSize:11, color:'#7c2d12'
          }}>
            <span style={{ fontSize:14 }}>📝</span>
            <span style={{ fontWeight:700, letterSpacing:0.5, textTransform:'uppercase' }}>Final Sign Off</span>
            <span style={{ color:'#92400e' }}>·</span>
            <span style={{ fontWeight:600 }}>{custLabel}{jobLabel ? ' · ' + jobLabel : ''}</span>
            <span style={{ color:'#92400e', marginLeft:'auto', fontStyle:'italic' }}>
              Dimensions locked from Check Measure — colour, glass, hardware &amp; opening style remain editable.
            </span>
            {lockToast && <span style={{
              marginLeft:12, padding:'3px 10px', background:'#c41230', color:'white',
              borderRadius:3, fontSize:10, fontWeight:700, animation:'fadeIn 0.2s'
            }}>{lockToast}</span>}
          </div>;
        })()}

        {/* ═══ CRM LINK STATUS BAR ═══
            Appears only when CAD has been opened with a ?type=&id= handoff
            from Spartan CRM. Shows the linked entity, the customer context,
            and the current sync status. Click the entity chip to return to
            the CRM page that opened us. */}
        {crmLink && (function(){
          var entityLabel = crmLink.type
            ? crmLink.type.charAt(0).toUpperCase() + crmLink.type.slice(1) + ' ' + (crmLink.id || '')
            : '';
          var mode = crmLink.mode || 'design';
          var modeLabel = mode === 'check_measure' ? 'CHECK MEASURE' : mode === 'final' ? 'FINAL' : mode === 'survey' ? 'SURVEY' : 'DESIGN';
          var statusColour =
            syncStatus === 'saving' ? '#EAB308' :
            syncStatus === 'saved'  ? '#22C55E' :
            syncStatus === 'offline'? '#F59E0B' :
            syncStatus === 'error'  ? '#EF4444' : '#94a3b8';
          var statusLabel =
            syncStatus === 'saving' ? 'Saving…' :
            syncStatus === 'saved'  ? (lastSavedAt ? 'Saved ' + lastSavedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Saved') :
            syncStatus === 'offline'? ('Offline — ' + pendingWrites + ' queued') :
            syncStatus === 'error'  ? ('Error: ' + (syncError || 'unknown')) : '—';
          var snap = contactSnapshotFor(crmLink.type, crmLink.entity, crmLink.contact);
          return <div style={{ height:32, background: crmLink.configurationMissing ? '#7c2d12' : '#1e293b',
                               borderBottom: '1px solid '+(crmLink.configurationMissing ? '#9a3412' : '#334155'),
                               display:'flex', alignItems:'center', padding:'0 14px', gap:12, flexShrink:0, fontSize:11 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, color:'#cbd5e1' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
              <span style={{ fontWeight:600, color:'white' }}>LINKED TO CRM</span>
              <span style={{ padding:'1px 6px', border:'1px solid #475569', borderRadius:3, fontSize:9, color:'#cbd5e1', letterSpacing:0.5 }}>{modeLabel}</span>
              {entityLabel && <span style={{ color:'#94a3b8' }}>· {entityLabel}</span>}
            </div>
            {snap.contact_name && <div style={{ display:'flex', alignItems:'center', gap:10, color:'#cbd5e1' }}>
              <span style={{ color:'#e2e8f0', fontWeight:500 }}>{snap.contact_name}</span>
              {snap.contact_phone && <span style={{ color:'#94a3b8' }}>· {snap.contact_phone}</span>}
              {snap.contact_email && <span style={{ color:'#94a3b8' }}>· {snap.contact_email}</span>}
              {(snap.site_street || snap.site_suburb) && <span style={{ color:'#94a3b8' }}>· {[snap.site_street, snap.site_suburb, snap.site_state, snap.site_postcode].filter(Boolean).join(', ')}</span>}
            </div>}
            {crmLink.configurationMissing && <span style={{ color:'#fde68a', fontWeight:500 }}>⚠ Supabase credentials not set — open Settings → CRM Connection to configure</span>}
            {crmLink.notFound && <span style={{ color:'#fecaca' }}>⚠ Entity not found in Supabase</span>}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ display:'flex', alignItems:'center', gap:4, color: statusColour }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background: statusColour, animation: syncStatus==='saving' ? 'pulse 1.5s infinite' : 'none' }}/>
                {statusLabel}
              </span>
              {crmLink.returnUrl && <button onClick={function(){ window.location.href = crmLink.returnUrl; }}
                title="Return to CRM"
                style={{ background:'transparent', border:'1px solid #475569', color:'#cbd5e1', borderRadius:3, padding:'2px 8px', fontSize:10, cursor:'pointer' }}>
                ← Return to CRM
              </button>}
            </div>
          </div>;
        })()}

        {/* ═══ v2.0: mode-specific banners ═══
            Survey banner → M4 (this milestone). Final-mode lock indicators → M5.
            WIP4's `?mode=view` read-only banner removed per contract §9.2. */}
        {(function(){
          var init = crmInit || {};
          if (init.mode !== 'survey') return null;
          var cust = init.customer || {};
          var job = init.jobNumber || '—';
          var who = cust.name || '—';
          var addr = cust.address || cust.siteAddress || '—';
          // M4: live missing-measurement count. Spec §6.2 + contract §4.3
          // require "Missing measurements: N of M frames" until all frames
          // have both measured W and H. Rendered as a badge on the banner
          // so the surveyor sees the gating reason before pressing save.
          var total = Array.isArray(projectItems) ? projectItems.length : 0;
          var missing = 0;
          if (total > 0) {
            projectItems.forEach(function(f) {
              var m = measurementsByFrameId[f.id];
              if (!m || typeof m.measuredWidthMm !== 'number' || typeof m.measuredHeightMm !== 'number') {
                missing += 1;
              }
            });
          }
          var ready = total > 0 && missing === 0;
          return <div style={{
            display:'flex', alignItems:'center', gap:12,
            background:'linear-gradient(90deg, #7c2d12 0%, #9a3412 100%)',
            color:'#fff7ed', padding:'8px 14px', fontSize:12, fontWeight:500,
            borderBottom:'1px solid #431407', flexShrink:0
          }}>
            <span style={{
              display:'inline-flex', alignItems:'center', gap:5,
              background:'rgba(255,255,255,0.15)', padding:'2px 8px',
              borderRadius:3, fontSize:10, fontWeight:700, letterSpacing:0.6,
              textTransform:'uppercase'
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m7.5 10.5 2 2"/><path d="m10.5 7.5 2 2"/><path d="m13.5 4.5 2 2"/><path d="m4.5 13.5 2 2"/></svg>
              Check Measure
            </span>
            <span>
              <span style={{ opacity:0.75 }}>Job</span>{' '}
              <strong>{job}</strong>
              <span style={{ opacity:0.5, margin:'0 8px' }}>·</span>
              <strong>{who}</strong>
              <span style={{ opacity:0.5, margin:'0 8px' }}>·</span>
              <span style={{ opacity:0.85 }}>{addr}</span>
            </span>
            <span style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              {total === 0
                ? <span style={{
                    background:'rgba(0,0,0,0.25)', padding:'3px 10px',
                    borderRadius:3, fontSize:11, fontWeight:600, letterSpacing:0.3
                  }}>No frames on this quote</span>
                : ready
                  ? <span style={{
                      background:'#166534', padding:'3px 10px', borderRadius:3,
                      fontSize:11, fontWeight:700, letterSpacing:0.3,
                      display:'inline-flex', alignItems:'center', gap:5
                    }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      Ready to save · {total} of {total} measured
                    </span>
                  : <span style={{
                      background:'#78350f', padding:'3px 10px', borderRadius:3,
                      fontSize:11, fontWeight:700, letterSpacing:0.3
                    }}>
                      Missing measurements: {missing} of {total} frame{total === 1 ? '' : 's'}
                    </span>
              }
              {/* ── Survey-mode Save button ──
                  Same unified save action as the top-bar Save: writes
                  the current survey state to local storage immediately
                  (so it persists across mode toggles and refreshes), and
                  if the CRM bridge is connected also fires the CRM save
                  round-trip. Brief "Saved" confirmation flashes for 2s. */}
              <button onClick={function(){
                        var result = saveBuildNow();
                        if (result.storageMissing && !result.hadCrm) {
                          alert(
                            'Save failed: build storage module not loaded.\n\n' +
                            'The 41-build-storage.js file is missing from your deployed bundle. ' +
                            'Copy 41-build-storage.js into the modules/ folder and rebuild.'
                          );
                        } else if (!result.localOk && !result.hadCrm && !result.sbQueued) {
                          var detail = (result.localError && result.localError.message) || 'unknown error';
                          alert('Save failed.\n\n' + detail + '\n\nOpen the browser console for full details.');
                        }
                      }}
                      title="Save this check measure (local + cloud if connected)"
                      style={{
                        background: (Date.now() - saveFlashAt < 2000) ? 'rgba(22,163,74,0.85)' : 'rgba(255,255,255,0.15)',
                        border:'1px solid rgba(255,255,255,0.3)', color:'#fff7ed', borderRadius:3,
                        padding:'3px 12px', fontSize:11, fontWeight:600, cursor:'pointer',
                        display:'inline-flex', alignItems:'center', gap:5, transition:'background 0.2s'
                      }}>
                {(Date.now() - saveFlashAt < 2000) ? (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Saved
                  </>
                ) : (
                  <>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    {quoteDirty ? 'Save *' : 'Save'}
                  </>
                )}
              </button>
            </span>
          </div>;
        })()}

        {/* Quotation templates bar */}
        <div style={{ height:32, background:T.bgPanel, borderBottom:'1px solid '+T.border, display:'flex', alignItems:'center', padding:'0 14px', gap:12, overflowX:'auto', flexShrink:0 }}>
          {(appSettings.quoteTemplates||[]).map(function(qt) {
            return <div key={qt.id} onClick={function(){
              if (!projectItems || projectItems.length === 0) {
                alert('Add at least one frame before opening ' + qt.name + '.');
                return;
              }
              setActiveTemplateId(qt.id);
              var targetView = (qt.kind === 'check_measure') ? 'checkmeasure'
                             : (qt.kind === 'completion') ? 'completion'
                             : (qt.kind === 'final_sign_off') ? 'finalsignoff'
                             : 'quotation';
              // Ensure every frame has a 3D capture before showing the document.
              // If captures are already present this resolves immediately; if not,
              // iterates through the frames silently while showing a progress overlay.
              ensureAllFrameCaptures(targetView);
            }} style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', whiteSpace:'nowrap', padding:'4px 8px', borderRadius:4, transition:'background 0.15s' }}
              onMouseEnter={function(e){e.currentTarget.style.background=T.bgHover}}
              onMouseLeave={function(e){e.currentTarget.style.background='transparent'}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.textMuted} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <span style={{ fontSize:10, color:T.textSub }}>{qt.name}</span>
            </div>;
          })}
        </div>

        {/* Main dashboard content */}
        <div style={{ flex:1, overflow:'auto', padding:20 }}>
          {/* New frame button + item count. M4b: button hidden in survey
              mode — can't add frames during Check Measure (contract §4.3).
              WIP35 (FSO): also hidden in final mode — frames are immutable
              post-CM (CAD_FSO_HANDOFF.md §3). */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            {(crmInit && (crmInit.mode === 'survey' || crmInit.mode === 'final')) ? <span/> : (
            <button onClick={function(){setShowNewFrame(true)}} disabled={isReadOnly}
                    title={isReadOnly ? 'Read-only mode — design cannot be modified' : ''}
                    style={{ background: isReadOnly ? '#888' : '#1a1a1a', color:'white', border:'none', borderRadius:6, padding:'8px 16px', fontSize:12, fontWeight:600, cursor: isReadOnly ? 'not-allowed' : 'pointer', opacity: isReadOnly ? 0.5 : 1, display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:16, lineHeight:1 }}>+</span> New Frame
            </button>
            )}
            <span style={{ fontSize:11, color:T.textMuted }}>{projectItems.length} item{projectItems.length !== 1 ? 's' : ''}</span>
          </div>

          {/* ═══ WIP29: SURVEY-MODE FULL-PAGE CHECK MEASURE FORM ═══════
              Renders only when crmInit.mode === 'survey'. Replaces the
              dashboard frame grid (which is gated to non-survey below).
              Mirrors the printed Check Measure template:
                §1-3: Access / Existing Conditions / Measurements (page 1)
                §4-7: Interiors / Prep / Resourcing / Notes        (page 2)
                Per-frame extended form (matches printed page 3+ per frame)

              Wire shape extension (per WIP29 plan §5):
                surveyMeasurements[] elements gain handleColour×2, height
                offset, depth, reveal, trim×8, 3 flags. siteChecklist is
                a new top-level msg field (one object per save).

              All updates use the functional setState pattern + the
              measurementsBridgeRef / siteChecklistBridgeRef pattern in
              onRequestSave to avoid stale closures (per WIP28 §9495+). */}
          {crmInit && crmInit.mode === 'survey' && (function(){
            // Field-update helpers. Functional setState preserves
            // measurementsByFrameId invariants and lets onRequestSave
            // see the latest writes via the ref.
            var updateFrameField = function(frameId, key, value) {
              setMeasurementsByFrameId(function(prev) {
                var existing = prev[frameId] || blankMeasurementFor(frameId);
                var updated = Object.assign({}, existing);
                updated[key] = value;
                var out = Object.assign({}, prev);
                out[frameId] = updated;
                return out;
              });
            };
            // WIP30: when the surveyor enters a measured W/H in survey mode,
            // also mutate the underlying projectItem so the CAD Spec panel,
            // Schematic2D render, pricing, and cut-list math all reflect the
            // measurement live. Per Phoenix: "the sizes should change in the
            // CAD once you enter the dimensions in survey mode." We update
            // BOTH the canonical key (width/height) and the alt key
            // (widthMm/heightMm) since different parts of the codebase use
            // different conventions. Clearing the measurement field does NOT
            // revert the frame — the surveyor must type the value they want.
            // setProjectItems triggers the dirty-tracking effect (appropriate
            // — the project IS dirty after a measurement change).
            var applyDimToFrame = function(frameId, axis, v) {
              if (typeof v !== 'number' || !isFinite(v) || v <= 0) return;
              setProjectItems(function(prev) {
                var idx = -1;
                for (var i = 0; i < prev.length; i++) {
                  if (prev[i] && prev[i].id === frameId) { idx = i; break; }
                }
                if (idx === -1) return prev;
                var updated = Object.assign({}, prev[idx]);
                if (axis === 'width')  { updated.width  = v; updated.widthMm  = v; }
                if (axis === 'height') { updated.height = v; updated.heightMm = v; }
                var out = prev.slice();
                out[idx] = updated;
                return out;
              });
            };
            var updateChecklist = function(key, value) {
              setSiteChecklist(function(prev) {
                var next = Object.assign({}, prev);
                next[key] = value;
                return next;
              });
            };
            // Photo helpers — preserved from M4b mini-form so the new
            // full-page form retains photo capture per frame.
            var addFramePhotos = function(frameId, fileList) {
              if (!fileList || !fileList.length) return;
              var arr = Array.prototype.slice.call(fileList);
              Promise.all(arr.map(function(f){
                return new Promise(function(res){
                  var rd = new FileReader();
                  rd.onload = function(){ res(String(rd.result || '')); };
                  rd.onerror = function(){ res(''); };
                  rd.readAsDataURL(f);
                });
              })).then(function(dataUrls){
                var added = dataUrls.filter(function(s){ return s && s.indexOf('data:image/') === 0; });
                if (!added.length) return;
                setMeasurementsByFrameId(function(prev) {
                  var existing = prev[frameId] || blankMeasurementFor(frameId);
                  var updated = Object.assign({}, existing, { photos: (existing.photos || []).concat(added) });
                  var out = Object.assign({}, prev);
                  out[frameId] = updated;
                  return out;
                });
              });
            };
            var removeFramePhoto = function(frameId, photoIdx) {
              setMeasurementsByFrameId(function(prev) {
                var existing = prev[frameId] || blankMeasurementFor(frameId);
                var nextPhotos = (existing.photos || []).filter(function(_, i){ return i !== photoIdx; });
                var updated = Object.assign({}, existing, { photos: nextPhotos });
                var out = Object.assign({}, prev);
                out[frameId] = updated;
                return out;
              });
            };
            // Reusable input/label styles (kept inline so this block is
            // self-contained — no dependency on a global stylesheet).
            var labelSty = { fontSize:11, fontWeight:600, color:T.text, marginBottom:4, display:'block' };
            var subLabelSty = { fontSize:10, color:T.textMuted, fontWeight:400 };
            var textInpSty = { width:'100%', fontSize:12, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, background:'white', color:T.text, outline:'none', boxSizing:'border-box', fontFamily:'inherit' };
            var selSty = Object.assign({}, textInpSty, { padding:'5px 6px', fontSize:11 });
            var sectionH1 = { fontSize:13, fontWeight:700, color:T.text, margin:'18px 0 8px 0', paddingBottom:4, borderBottom:'1px solid '+T.border };
            var sectionH2 = { fontSize:11, fontWeight:700, color:T.text, margin:'12px 0 4px 0', textTransform:'uppercase', letterSpacing:0.4 };
            var chkRow = { display:'flex', alignItems:'center', gap:8, padding:'4px 0', fontSize:12, color:T.text, cursor:'pointer' };
            var radioRow = { display:'flex', alignItems:'center', gap:14, padding:'2px 0', fontSize:12, color:T.text };
            // Renders a yes/no radio group bound to a checklist key.
            var ynChk = function(key, opts) {
              opts = opts || ['yes', 'no'];
              var labels = opts.map(function(o){ return o.toUpperCase(); });
              return (
                <div style={radioRow}>
                  {opts.map(function(opt, i){
                    return (
                      <label key={opt} style={{display:'inline-flex', alignItems:'center', gap:4, cursor:'pointer'}}>
                        <input type="radio" name={'cl_'+key} checked={siteChecklist[key] === opt}
                               onChange={function(){ updateChecklist(key, opt); }}/>
                        <span>{labels[i]}</span>
                      </label>
                    );
                  })}
                  {siteChecklist[key] && (
                    <button onClick={function(){ updateChecklist(key, ''); }}
                            style={{ fontSize:10, color:T.textMuted, background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>clear</button>
                  )}
                </div>
              );
            };
            // Renders a checkbox bound to a checklist key.
            var chk = function(key, label) {
              return (
                <label style={chkRow}>
                  <input type="checkbox" checked={!!siteChecklist[key]}
                         onChange={function(e){ updateChecklist(key, e.target.checked); }}/>
                  <span>{label}</span>
                </label>
              );
            };
            // Per-frame yes/no/clear radio.
            var frameYn = function(frameId, key, opts) {
              opts = opts || ['yes', 'no'];
              var m = measurementsByFrameId[frameId] || blankMeasurementFor(frameId);
              var labels = opts.map(function(o){ return o.toUpperCase(); });
              return (
                <div style={radioRow}>
                  {opts.map(function(opt, i){
                    return (
                      <label key={opt} style={{display:'inline-flex', alignItems:'center', gap:4, cursor:'pointer'}}>
                        <input type="radio" name={frameId+'_'+key} checked={m[key] === opt}
                               onChange={function(){ updateFrameField(frameId, key, opt); }}/>
                        <span>{labels[i]}</span>
                      </label>
                    );
                  })}
                  {m[key] && (
                    <button onClick={function(){ updateFrameField(frameId, key, ''); }}
                            style={{ fontSize:10, color:T.textMuted, background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>clear</button>
                  )}
                </div>
              );
            };
            // Per-frame trim select. WIP30: dropdown options now span both
            // TRIM_DICTIONARY and pricingConfig.trims (all catalog families) —
            // catalog cached once per render to avoid rebuilding option lists
            // for every frame row.
            var trimCatalogsForRender = (
              (appSettings && appSettings.pricingConfig && appSettings.pricingConfig.trims)
              || (window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.trims)
              || null
            );
            var trimOptionElsCached = buildTrimOptionEls(trimCatalogsForRender);
            // trimSel: sync-aware. When the surface's "all sides same" flag is
            // set, propagates the user's selection to all four sides instead
            // of just the side they edited.
            var trimSel = function(frameId, key) {
              var m = measurementsByFrameId[frameId] || blankMeasurementFor(frameId);
              var isInternal = key.indexOf('trimInternal') === 0;
              var allSameKey = isInternal ? 'trimInternalAllSame' : 'trimExternalAllSame';
              var prefix     = isInternal ? 'trimInternal' : 'trimExternal';
              return (
                <select value={m[key] || ''}
                        onChange={function(e){
                          var v = e.target.value;
                          var locked = !!m[allSameKey];
                          if (!locked) { updateFrameField(frameId, key, v); return; }
                          // Locked: mirror to all four sides in one update
                          setMeasurementsByFrameId(function(prev) {
                            var existing = prev[frameId] || blankMeasurementFor(frameId);
                            var updated = Object.assign({}, existing);
                            updated[prefix + 'Top']    = v;
                            updated[prefix + 'Left']   = v;
                            updated[prefix + 'Right']  = v;
                            updated[prefix + 'Bottom'] = v;
                            var out = Object.assign({}, prev);
                            out[frameId] = updated;
                            return out;
                          });
                        }}
                        style={selSty}>
                  {trimOptionElsCached}
                </select>
              );
            };
            // trimAllSameBox: per-surface checkbox. Toggling ON syncs all four
            // sides to the first non-empty value (Top → Left → Right → Bottom
            // search order). Toggling OFF leaves values as-is — the four sides
            // simply become independent again.
            var trimAllSameBox = function(frameId, surface) {
              var m = measurementsByFrameId[frameId] || blankMeasurementFor(frameId);
              var key = 'trim' + surface + 'AllSame';
              var prefix = 'trim' + surface;
              return (
                <label style={{display:'inline-flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:11, fontWeight:400, color:T.textMuted}}>
                  <input type="checkbox" checked={!!m[key]}
                         onChange={function(e){
                           var nowOn = e.target.checked;
                           setMeasurementsByFrameId(function(prev) {
                             var existing = prev[frameId] || blankMeasurementFor(frameId);
                             var updated = Object.assign({}, existing);
                             updated[key] = nowOn;
                             if (nowOn) {
                               var first = existing[prefix + 'Top']
                                        || existing[prefix + 'Left']
                                        || existing[prefix + 'Right']
                                        || existing[prefix + 'Bottom']
                                        || '';
                               updated[prefix + 'Top']    = first;
                               updated[prefix + 'Left']   = first;
                               updated[prefix + 'Right']  = first;
                               updated[prefix + 'Bottom'] = first;
                             }
                             var out = Object.assign({}, prev);
                             out[frameId] = updated;
                             return out;
                           });
                         }}/>
                  <span>all sides same</span>
                </label>
              );
            };
            // Missing-frame summary for the form footer.
            var missingFrames = projectItems.filter(function(f){
              var m = measurementsByFrameId[f.id];
              return !m || typeof m.measuredWidthMm !== 'number' || typeof m.measuredHeightMm !== 'number';
            }).length;

            return (
              <div onClick={function(e){e.stopPropagation();}}>
                {/* Title strip */}
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:18, fontWeight:700, color:T.text }}>Check Measure</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginTop:2 }}>
                    Capture measurements, trims, hardware, and site conditions for {projectItems.length} frame{projectItems.length === 1 ? '' : 's'}.
                    {missingFrames > 0 && (
                      <span style={{ marginLeft:8, color:'#9a3412', background:'#ffedd5', padding:'2px 8px', borderRadius:3, fontWeight:700 }}>
                        Missing measurements: {missingFrames} of {projectItems.length}
                      </span>
                    )}
                  </div>
                </div>

                {/* ═════ SITE CHECKLIST PANEL ═════════════════════════ */}
                <div style={{ background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'16px 20px', marginBottom:20 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:4 }}>Site Checklist</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:6 }}>Project-level data captured during the Check Measure visit. One entry per job.</div>

                  <div style={{ marginTop:6, marginBottom:8, padding:'8px 10px', background:'#fef3c7', borderRadius:4, fontSize:11, color:'#7c2d12' }}>
                    <b>I have manually uploaded this Check Measure into Ascora on the day of measure.</b>
                    <div style={{ marginTop:4 }}>{ynChk('ascoraUploaded')}</div>
                  </div>

                  <div style={sectionH1}>1. Access &amp; Logistics <span style={{fontSize:10, fontWeight:400, color:'#c41230', fontStyle:'italic'}}>— uPVC frames are rigid &amp; do not flat-pack</span></div>

                  <div style={sectionH2}>Vehicle &amp; Parking</div>
                  {chk('parking2Vans', 'Adequate parking for 2× large vans (2.4m high)')}
                  {chk('truck32m',     'Access available for 3.2m truck (if required)')}

                  <div style={sectionH2}>Movement Path</div>
                  {chk('cornerCheck', 'Corner check: welded frames fit through gate / hallway')}
                  <div style={{ ...chkRow, fontWeight:600 }}>Stairs involved?</div>
                  {ynChk('stairsInvolved', ['no','yes'])}

                  <div style={sectionH2}>Site Accessibility</div>
                  <div style={{ ...chkRow, fontWeight:600 }}>Is access straightforward?</div>
                  {ynChk('accessStraightforward')}
                  <textarea value={siteChecklist.accessNotes} placeholder="Access notes (if NO above, describe)…"
                            onChange={function(e){ updateChecklist('accessNotes', e.target.value); }}
                            rows={2}
                            style={Object.assign({}, textInpSty, { resize:'vertical', marginTop:4 })}/>

                  <div style={sectionH1}>2. Existing Conditions &amp; Structure</div>

                  <div style={sectionH2}>Current Frame Material</div>
                  {chk('frameMaterialAluminium', 'Aluminium')}
                  {chk('frameMaterialTimber',    'Timber')}
                  {chk('frameMaterialSteel',     'Steel  (warning: requires grinding — extra labour allowed?)')}

                  <div style={sectionH2}>Wall Construction</div>
                  {chk('wallBrickVeneer',    'Brick veneer')}
                  {chk('wallDoubleBrick',    'Double brick')}
                  {chk('wallWeatherboard',   'Weatherboard / cladding')}
                  {chk('wallRenderedBrick',  'Rendered brick  (warning: render will chip — client notified?)')}

                  <div style={sectionH2}>Structural Alterations</div>
                  {ynChk('structuralAlteration', ['direct','enlargement'])}
                  <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>
                    DIRECT = no structural change.&nbsp; ENLARGEMENT = opening cut-out.
                  </div>
                  <textarea value={siteChecklist.structuralNotes} placeholder="Structural notes (if enlargement, describe)…"
                            onChange={function(e){ updateChecklist('structuralNotes', e.target.value); }}
                            rows={2}
                            style={Object.assign({}, textInpSty, { resize:'vertical', marginTop:4 })}/>

                  <div style={sectionH2}>The Opening</div>
                  {chk('sillChecked',   'Sill condition: brick sill level / flat (if NO, allow grinding/packing)')}
                  {chk('lintelChecked', 'Lintel check: steel bar / brickwork rusting or sagging')}

                  <div style={sectionH1}>3. Measurements &amp; Tolerances</div>

                  <div style={sectionH2}>Sizing Checks</div>
                  {chk('tolerance20mm',     'Tolerance: 20mm minimum allowed on H &amp; W')}
                  {chk('squarenessChecked', 'Squareness: diagonals checked (if &gt;10mm out, increase tolerance)')}

                  <div style={sectionH2}>Flooring Levels</div>
                  <div style={{ ...chkRow, fontWeight:600 }}>Frame lift required for future flooring (tiles / timber)?</div>
                  {ynChk('frameLiftRequired', ['no','yes'])}
                  {siteChecklist.frameLiftRequired === 'yes' && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:4 }}>
                      <input type="number" inputMode="numeric" value={siteChecklist.frameLiftMm}
                             onChange={function(e){ updateChecklist('frameLiftMm', e.target.value); }}
                             placeholder="mm"
                             style={Object.assign({}, textInpSty, { width:120 })}/>
                      <span style={{ fontSize:11, color:T.textMuted }}>mm lift</span>
                    </div>
                  )}

                  <div style={sectionH1}>4. Interiors &amp; Clash Detection</div>

                  <div style={sectionH2}>Window Coverings</div>
                  <div style={{ ...chkRow, fontWeight:600 }}>Will existing blinds / shutters fit back in?</div>
                  {ynChk('blindsFitBack')}
                  <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>If NO, handles clash — client to remove / replace.</div>

                  <div style={sectionH2}>Obstructions</div>
                  {chk('kitchenTapsClash',     'Kitchen taps: will new sash hit the tap?')}
                  {chk('alarmSensorsPresent',  'Alarm sensors: reed switches present (client to remove)')}

                  <div style={sectionH1}>5. Preparation &amp; Documentation</div>

                  <div style={sectionH2}>Photography (mandatory)</div>
                  {chk('photosTaken', 'Photos taken of EVERY window (uploaded to Ascora)')}
                  <div style={{ fontSize:10, color:T.textMuted, paddingLeft:24 }}>Must show obstructions, difficult sills, &amp; access path.</div>

                  <div style={sectionH2}>Waste Management</div>
                  {chk('wasteVanLoad', 'Van load (standard removal)')}
                  {chk('wasteSkipBin', 'Skip bin required')}
                  {siteChecklist.wasteSkipBin && (
                    <div style={{ paddingLeft:24, marginTop:2 }}>
                      <span style={{ fontSize:11, color:T.textMuted, marginRight:8 }}>Space on site for skip?</span>
                      {ynChk('skipBinSpace')}
                    </div>
                  )}

                  <div style={sectionH1}>6. Resourcing Estimate</div>

                  <div style={sectionH2}>Heavy Lifting</div>
                  {ynChk('heavyLifting', ['standard','heavy'])}
                  <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>HEAVY = oversized / requires extra manpower / glass suckers.</div>

                  <div style={sectionH2}>Estimates</div>
                  <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginTop:4 }}>
                    <label style={{ fontSize:11, color:T.text }}>
                      <span style={{marginRight:6}}>Est. days to complete:</span>
                      <input type="text" value={siteChecklist.estDays}
                             onChange={function(e){ updateChecklist('estDays', e.target.value); }}
                             style={Object.assign({}, textInpSty, { width:140, display:'inline-block' })}/>
                    </label>
                    <label style={{ fontSize:11, color:T.text }}>
                      <span style={{marginRight:6}}>Staff required:</span>
                      <input type="text" value={siteChecklist.staffRequired}
                             onChange={function(e){ updateChecklist('staffRequired', e.target.value); }}
                             style={Object.assign({}, textInpSty, { width:140, display:'inline-block' })}/>
                    </label>
                  </div>

                  <div style={sectionH1}>7. Site Notes / Sketches</div>
                  <div style={{ fontSize:10, color:T.textMuted, marginBottom:4 }}>Detail any brickwork issues, out-of-square openings, or client warnings.</div>
                  <textarea value={siteChecklist.notes} placeholder="Site notes…"
                            onChange={function(e){ updateChecklist('notes', e.target.value); }}
                            rows={5}
                            style={Object.assign({}, textInpSty, { resize:'vertical' })}/>
                </div>

                {/* ═════ PER-FRAME CARDS ══════════════════════════════ */}
                <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:8 }}>Frames</div>
                {projectItems.length === 0 && (
                  <div style={{ textAlign:'center', padding:'40px 0', color:T.textMuted, background:T.bgPanel, border:'1px dashed '+T.border, borderRadius:8 }}>
                    <div style={{ fontSize:13 }}>No frames in this quote.</div>
                    <div style={{ fontSize:11, marginTop:4 }}>Survey mode requires a populated quote — this is a CRM payload issue.</div>
                  </div>
                )}
                {projectItems.map(function(frame, idx){
                  var prodMeta = PRODUCTS.find(function(p){return p.id===frame.productType;});
                  var prodLabel = prodMeta ? prodMeta.label : frame.productType;
                  var m = measurementsByFrameId[frame.id] || blankMeasurementFor(frame);
                  var hasW = typeof m.measuredWidthMm === 'number' && isFinite(m.measuredWidthMm);
                  var hasH = typeof m.measuredHeightMm === 'number' && isFinite(m.measuredHeightMm);
                  var missing = !hasW || !hasH;
                  // Tilt & Turn / Sliding only — handle-height-offset gating
                  // matches the printed template's note (cm-table row).
                  var pt = frame.productType || '';
                  var showHandleOffset = (pt === 'tilt_turn' || pt === 'sliding_window' || pt === 'sliding_door' || pt.indexOf('sliding') >= 0 || pt.indexOf('tilt') >= 0);
                  var photoCount = (m.photos || []).length;
                  var inputId = 'cm-fp-photo-' + frame.id;
                  return (
                    <div key={frame.id} style={{ background:T.bgPanel, border:'1px solid '+(missing ? '#fb923c' : T.border), borderRadius:8, padding:'14px 18px', marginBottom:14 }}>
                      {/* Header strip */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, paddingBottom:8, borderBottom:'1px solid '+T.border }}>
                        <div>
                          <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{frame.name}</span>
                          <span style={{ fontSize:11, color:T.textMuted, marginLeft:10 }}>
                            {prodLabel} &middot; {frame.width}×{frame.height}mm &middot; {(frame.panelCount || 1)}× panel
                          </span>
                        </div>
                        {missing
                          ? <span style={{ fontSize:10, fontWeight:700, color:'#9a3412', background:'#ffedd5', padding:'3px 8px', borderRadius:3 }}>Missing W/H</span>
                          : <span style={{ fontSize:10, fontWeight:700, color:'#166534', background:'#dcfce7', padding:'3px 8px', borderRadius:3 }}>✓ Measured</span>}
                      </div>

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:20 }}>
                        {/* Left column — fillable form */}
                        <div>
                          {/* W × H */}
                          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                            <div style={{ flex:1 }}>
                              <label style={labelSty}>Measured Width <span style={subLabelSty}>(mm)</span></label>
                              <input type="number" inputMode="numeric" value={hasW ? m.measuredWidthMm : ''}
                                     placeholder="W mm"
                                     onChange={function(e){
                                       var v = e.target.value === '' ? null : Number(e.target.value);
                                       if (v !== null && !isFinite(v)) v = null;
                                       updateFrameField(frame.id, 'measuredWidthMm', v);
                                       applyDimToFrame(frame.id, 'width', v);
                                     }}
                                     style={textInpSty}/>
                            </div>
                            <div style={{ flex:1 }}>
                              <label style={labelSty}>Measured Height <span style={subLabelSty}>(mm)</span></label>
                              <input type="number" inputMode="numeric" value={hasH ? m.measuredHeightMm : ''}
                                     placeholder="H mm"
                                     onChange={function(e){
                                       var v = e.target.value === '' ? null : Number(e.target.value);
                                       if (v !== null && !isFinite(v)) v = null;
                                       updateFrameField(frame.id, 'measuredHeightMm', v);
                                       applyDimToFrame(frame.id, 'height', v);
                                     }}
                                     style={textInpSty}/>
                            </div>
                          </div>

                          {/* Handle Colour */}
                          <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                            <div style={{ flex:1 }}>
                              <label style={labelSty}>Handle Colour — Internal</label>
                              <select value={m.handleColourInternal || ''}
                                      onChange={function(e){ updateFrameField(frame.id, 'handleColourInternal', e.target.value); }}
                                      style={selSty}>
                                <option value="">— Select —</option>
                                <option value="white">White</option>
                                <option value="black">Black</option>
                                <option value="silver">Silver</option>
                              </select>
                            </div>
                            <div style={{ flex:1 }}>
                              <label style={labelSty}>Handle Colour — External</label>
                              <select value={m.handleColourExternal || ''}
                                      onChange={function(e){ updateFrameField(frame.id, 'handleColourExternal', e.target.value); }}
                                      style={selSty}>
                                <option value="">— Select —</option>
                                <option value="white">White</option>
                                <option value="black">Black</option>
                                <option value="silver">Silver</option>
                              </select>
                            </div>
                          </div>

                          {/* Handle Height (cond.) + Window Depth */}
                          <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                            {showHandleOffset && (
                              <div style={{ flex:1 }}>
                                <label style={labelSty}>
                                  Handle Height Offset
                                  <span style={subLabelSty}> (mm — e.g. -100 lower / +100 higher)</span>
                                </label>
                                <input type="text" value={m.handleHeightOffsetMm}
                                       placeholder="e.g. -100"
                                       onChange={function(e){ updateFrameField(frame.id, 'handleHeightOffsetMm', e.target.value); }}
                                       style={textInpSty}/>
                              </div>
                            )}
                            <div style={{ flex:1 }}>
                              <label style={labelSty}>Window Depth <span style={subLabelSty}>(mm)</span></label>
                              <input type="number" inputMode="numeric" value={m.windowDepthMm}
                                     placeholder="e.g. 70"
                                     onChange={function(e){ updateFrameField(frame.id, 'windowDepthMm', e.target.value); }}
                                     style={textInpSty}/>
                            </div>
                          </div>

                          {/* Reveal Type */}
                          <div style={{ marginBottom:10 }}>
                            <label style={labelSty}>Reveal Type</label>
                            <div style={radioRow}>
                              {[['inline','In-Line'], ['stepped','Stepped'], ['noreveal','No Reveal']].map(function(pair){
                                return (
                                  <label key={pair[0]} style={{display:'inline-flex', alignItems:'center', gap:4, cursor:'pointer'}}>
                                    <input type="radio" name={frame.id+'_rv'} checked={m.revealType === pair[0]}
                                           onChange={function(){ updateFrameField(frame.id, 'revealType', pair[0]); }}/>
                                    <span>{pair[1]}</span>
                                  </label>
                                );
                              })}
                              {m.revealType && (
                                <button onClick={function(){ updateFrameField(frame.id, 'revealType', ''); }}
                                        style={{ fontSize:10, color:T.textMuted, background:'none', border:'none', cursor:'pointer', padding:'2px 6px' }}>clear</button>
                              )}
                            </div>
                          </div>

                          {/* Internal Trim */}
                          <div style={{ marginBottom:10 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                              <label style={Object.assign({}, labelSty, { marginBottom:0 })}>Internal Trim <span style={subLabelSty}>(per side, from catalog)</span></label>
                              {trimAllSameBox(frame.id, 'Internal')}
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto 1fr', gap:'4px 8px', alignItems:'center', fontSize:11 }}>
                              <span>Top:</span>    {trimSel(frame.id, 'trimInternalTop')}
                              <span>Left:</span>   {trimSel(frame.id, 'trimInternalLeft')}
                              <span>Right:</span>  {trimSel(frame.id, 'trimInternalRight')}
                              <span>Bottom:</span> {trimSel(frame.id, 'trimInternalBottom')}
                            </div>
                          </div>

                          {/* External Trim */}
                          <div style={{ marginBottom:10 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                              <label style={Object.assign({}, labelSty, { marginBottom:0 })}>External Trim <span style={subLabelSty}>(per side, from catalog)</span></label>
                              {trimAllSameBox(frame.id, 'External')}
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto 1fr', gap:'4px 8px', alignItems:'center', fontSize:11 }}>
                              <span>Top:</span>    {trimSel(frame.id, 'trimExternalTop')}
                              <span>Left:</span>   {trimSel(frame.id, 'trimExternalLeft')}
                              <span>Right:</span>  {trimSel(frame.id, 'trimExternalRight')}
                              <span>Bottom:</span> {trimSel(frame.id, 'trimExternalBottom')}
                            </div>
                          </div>

                          {/* Flags */}
                          <div style={{ display:'flex', gap:18, flexWrap:'wrap', marginBottom:10 }}>
                            <div>
                              <label style={labelSty}>Design Change</label>
                              {frameYn(frame.id, 'designChange')}
                            </div>
                            <div>
                              <label style={labelSty}>Frosted Glass</label>
                              {frameYn(frame.id, 'frostedGlass')}
                            </div>
                            <div>
                              <label style={labelSty}>
                                Tas Oak Threshold
                                <span style={{ ...subLabelSty, color:'#c41230', marginLeft:6 }}>(if YES, deduct 20mm from H)</span>
                              </label>
                              {frameYn(frame.id, 'tasOakThreshold')}
                            </div>
                          </div>

                          {/* Site notes */}
                          <div style={{ marginBottom:10 }}>
                            <label style={labelSty}>Site Notes</label>
                            <textarea value={m.siteNotes || ''} placeholder="Anything specific to this frame…"
                                      onChange={function(e){ updateFrameField(frame.id, 'siteNotes', e.target.value); }}
                                      rows={2}
                                      style={Object.assign({}, textInpSty, { resize:'vertical' })}/>
                          </div>

                          {/* Photos */}
                          <div>
                            <label style={labelSty}>Photos</label>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                              <label htmlFor={inputId} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, fontWeight:600, color:'#555', padding:'5px 10px', border:'1px solid '+T.border, borderRadius:4, cursor:'pointer', background:'white' }}>
                                <span style={{ fontSize:13 }}>📸</span>
                                {photoCount > 0 ? (photoCount + ' photo' + (photoCount === 1 ? '' : 's')) : 'Add photo'}
                              </label>
                              <input id={inputId} type="file" accept="image/*" multiple
                                     onChange={function(e){ addFramePhotos(frame.id, e.target.files); e.target.value = ''; }}
                                     style={{ display:'none' }}/>
                            </div>
                            {photoCount > 0 && (
                              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                {(m.photos || []).map(function(src, pi){
                                  return (
                                    <div key={pi} style={{ position:'relative', width:54, height:54, borderRadius:4, overflow:'hidden', border:'1px solid '+T.border }}>
                                      <img src={src} alt={'p'+pi} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                                      <button onClick={function(){ removeFramePhoto(frame.id, pi); }}
                                              style={{ position:'absolute', top:0, right:0, width:18, height:18, borderRadius:0, border:'none', background:'rgba(0,0,0,0.55)', color:'white', fontSize:11, lineHeight:1, cursor:'pointer', padding:0 }}>✕</button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Right column — read-only spec summary (mirrors printed template right col) */}
                        <div>
                          <div style={{ background:'white', border:'1px solid '+T.border, borderRadius:6, padding:'10px 12px' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:140, background:'#f4f6f8', borderRadius:4, marginBottom:8 }}>
                              {frame.thumbnail ? (
                                <img src={frame.thumbnail} alt={frame.name} style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }}/>
                              ) : (
                                <div style={{ transform:'scale(0.6)' }}>
                                  <Schematic2D productType={frame.productType} widthMm={frame.width} heightMm={frame.height}
                                    panelCount={frame.panelCount} openingStyle={frame.openStyle} transomPct={frame.transomPct}
                                    colonialGrid={frame.colonialGrid} cellTypes={frame.cellTypes} zoneWidths={frame.zoneWidths} zoneHeights={frame.zoneHeights}
                                    pricingConfig={(appSettings && appSettings.pricingConfig) || null} profileOverrides={frame.profileOverrides || null}/>
                                </div>
                              )}
                            </div>
                            <div style={{ fontSize:10, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>CAD Spec</div>
                            <div style={{ fontSize:11, color:T.text, lineHeight:1.55 }}>
                              <div><b>Type:</b> {prodLabel}</div>
                              <div><b>Size:</b> {frame.width} × {frame.height} mm</div>
                              <div><b>Panels:</b> {frame.panelCount || 1}</div>
                              <div><b>Colour Ext:</b> {frame.colour || 'White'}</div>
                              <div><b>Colour Int:</b> {frame.colourInt || frame.colour || 'White'}</div>
                              <div><b>Glass:</b> {frame.glassSpec || '4/12/4'}</div>
                              <div><b>Hardware:</b> {frame.hardwareColour ? (frame.hardwareColour[0].toUpperCase() + frame.hardwareColour.slice(1)) : 'White'}</div>
                            </div>
                            <div style={{ fontSize:9, color:T.textMuted, marginTop:8, fontStyle:'italic' }}>
                              Frame dimensions update live as you enter measurements. Other spec fields stay read-only in survey mode.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* ═════ TRIM CUT PREVIEW (WIP30) ═══════════════════════════
                    Live preview of every cut implied by the trim selections
                    above. Updates as soon as the surveyor picks/changes any
                    Internal/External Trim dropdown. Cut formula per Phoenix:
                      top/bottom side → cut = W + 200mm
                      left/right side → cut = H + 200mm
                    Aggregated by trim id. Catalog items show colour + bars
                    required (coarse); legacy dictionary codes show as-is.
                    "Download Cut List" button writes the existing cut-list
                    xlsx with the new "Trim Cuts" sheet appended. */}
                {(function(){
                  // WIP30: defensive catalog resolution. Merge any user-edited
                  // catalog (appSettings.pricingConfig.trims) onto the global
                  // defaults (window.PRICING_DEFAULTS.trims) so a missing key
                  // in the user copy doesn't hide a default family.
                  var defTrims = (window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.trims) || {};
                  var userTrims = (appSettings && appSettings.pricingConfig && appSettings.pricingConfig.trims) || {};
                  var catalogs = Object.assign({}, defTrims, userTrims);
                  if (!Object.keys(catalogs).length) catalogs = null;
                  var tc = computeTrimCuts(projectItems, measurementsByFrameId, catalogs, 200, appSettings);
                  // Diagnostic — visible in the preview header so we can see
                  // catalog state at a glance during smoke testing.
                  var diagCatalogs = catalogs ? Object.keys(catalogs).map(function(k){
                    var n = (catalogs[k] && catalogs[k].items) ? catalogs[k].items.length : 0;
                    return k + '(' + n + ')';
                  }).join(', ') : 'none';
                  if (!tc.cuts.length) {
                    return (
                      <div style={{ marginTop:18, padding:'14px 18px', background:T.bgPanel, border:'1px dashed '+T.border, borderRadius:8, fontSize:12, color:T.textMuted, textAlign:'center' }}>
                        <b>Trim Cut List</b> — no cuts yet. Either pick a trim on a frame's Internal/External Trim dropdown, or set Reveal Type (In-Line / Stepped) + Window Depth on a frame to generate reveal cuts.
                        <div style={{ fontSize:9, opacity:0.6, marginTop:4, fontFamily:'monospace' }}>catalogs: {diagCatalogs}</div>
                      </div>
                    );
                  }
                  var keys = Object.keys(tc.byTrim);
                  return (
                    <div style={{ marginTop:18, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Trim Cut List</div>
                          <div style={{ fontSize:11, color:T.textMuted }}>
                            {tc.cuts.length} cut{tc.cuts.length === 1 ? '' : 's'} across {keys.length} trim{keys.length === 1 ? '' : 's'} · allowance {tc.allowanceMm}mm/cut · top/bottom = W+{tc.allowanceMm}, left/right = H+{tc.allowanceMm}
                          </div>
                          <div style={{ fontSize:9, color:T.textMuted, opacity:0.7, fontFamily:'monospace', marginTop:2 }}>catalogs loaded: {diagCatalogs}</div>
                        </div>
                        <button onClick={function(){
                          try {
                            var pInfo = (crmInit && crmInit.projectInfo) || {};
                            var jn = pInfo.jobNumber || pInfo.projectNumber || 'cm-preview';
                            var wb = generateCutListXlsxWorkbook(projectItems, (appSettings && appSettings.pricingConfig) || window.PRICING_DEFAULTS, null, jn, measurementsByFrameId, appSettings);
                            var fname = 'cutlist-trim-' + jn + '-' + new Date().toISOString().slice(0,10) + '.xlsx';
                            XLSX.writeFile(wb, fname);
                          } catch (e) { console.error('Cut list xlsx failed:', e); alert('Cut list export failed: ' + e.message); }
                        }} style={{ background:'#1f2937', color:'white', border:'none', borderRadius:4, padding:'7px 14px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                          ⬇ Download Cut List xlsx
                        </button>
                      </div>
                      {/* Per-trim summary table */}
                      <div style={{ overflowX:'auto', background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                        <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
                          <thead>
                            <tr style={{ background:'#f4f6f8', fontWeight:700, color:T.textMuted, textTransform:'uppercase', fontSize:9, letterSpacing:0.4 }}>
                              <th style={{ textAlign:'left',  padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Trim</th>
                              <th style={{ textAlign:'left',  padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Catalog?</th>
                              <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Cuts</th>
                              <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Total length (mm)</th>
                              <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Bar (mm)</th>
                              <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Bars (FFD)</th>
                              <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Utilisation</th>
                            </tr>
                          </thead>
                          <tbody>
                            {keys.map(function(k){
                              var b = tc.byTrim[k];
                              var util = b.barPlan ? (b.barPlan.utilisationPct + '%') : '—';
                              // Catalog? cell: distinguishes specific SKU vs
                              // dict code linked to a family vs orphan dict.
                              var firstCut = b.cuts[0];
                              var dictLinked = !b.isCatalogItem && firstCut && firstCut.dictMappedFamily;
                              var catalogCellLabel = b.isCatalogItem
                                ? 'yes (SKU)'
                                : (dictLinked ? ('linked → ' + firstCut.dictMappedFamily) : 'legacy code');
                              var catalogCellColor = b.isCatalogItem
                                ? '#166534'
                                : (dictLinked ? '#1e40af' : '#7c2d12');
                              return (
                                <tr key={k}>
                                  <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', fontWeight:600 }}>{b.label}</td>
                                  <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', color: catalogCellColor }}>{catalogCellLabel}</td>
                                  <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{b.cutCount}</td>
                                  <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{b.totalLengthMm.toLocaleString()}</td>
                                  <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{b.barLengthMm == null ? '—' : b.barLengthMm}</td>
                                  <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontWeight:700 }}>{b.barsRequired == null ? '—' : b.barsRequired}</td>
                                  <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right', color: b.barPlan && b.barPlan.utilisationPct >= 90 ? '#166534' : (b.barPlan && b.barPlan.utilisationPct >= 75 ? '#7c2d12' : '#9a3412') }}>{util}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* WIP30: Per-bar pack visualisation (FFD output) */}
                      {(function(){
                        var packedKeys = keys.filter(function(k){ return tc.byTrim[k].barPlan; });
                        if (!packedKeys.length) return null;
                        var totalBars = packedKeys.reduce(function(s,k){ return s + tc.byTrim[k].barPlan.barCount; }, 0);
                        return (
                          <details style={{ marginTop:8 }} open>
                            <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer', fontWeight:700 }}>
                              📐 Optimised Bar Plan ({totalBars} bar{totalBars === 1 ? '' : 's'} across {packedKeys.length} trim{packedKeys.length === 1 ? '' : 's'})
                            </summary>
                            <div style={{ marginTop:8 }}>
                              {packedKeys.map(function(k){
                                var b = tc.byTrim[k];
                                var bp = b.barPlan;
                                // Resolve profile image for this trim — same lookup
                                // used in summary; rendered prominently next to the
                                // trim label so cutters scanning the page can match
                                // the physical profile to the cut plan instantly.
                                var profileImg = null;
                                if (catalogs) {
                                  var firstCutTrim = b.cuts[0];
                                  var famKey = null;
                                  // Reveals carry the source family explicitly because
                                  // their trimValue is a synthetic group key, not a
                                  // catalog item id, so the SKU-id scan below would miss.
                                  if (b.isReveal && b.revealSourceFamily) {
                                    famKey = b.revealSourceFamily;
                                  } else if (b.isCatalogItem) {
                                    Object.keys(catalogs).forEach(function(fk){
                                      var fam = catalogs[fk];
                                      if (!fam || !fam.items) return;
                                      if (fam.items.some(function(it){ return it.id === firstCutTrim.trimValue; })) famKey = fk;
                                    });
                                  } else if (firstCutTrim && firstCutTrim.dictMappedFamily) {
                                    famKey = firstCutTrim.dictMappedFamily;
                                  }
                                  if (famKey && catalogs[famKey] && catalogs[famKey].profileImage) {
                                    profileImg = catalogs[famKey].profileImage;
                                  }
                                }
                                return (
                                  <div key={k} style={{ marginBottom:14, background:'white', border: b.revealOversized ? '2px solid #dc2626' : '1px solid '+T.border, borderRadius:4, padding:'10px 12px' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                                      {profileImg && (
                                        <img src={profileImg} alt={b.label + ' profile'} title={b.label + ' cross-section'}
                                             style={{ width:90, height:'auto', maxHeight:54, display:'block', flexShrink:0, borderRadius:3, border:'1px solid '+T.border, background:'white', objectFit:'contain' }}/>
                                      )}
                                      <div style={{ flex:1, display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
                                        <span style={{ fontWeight:700, fontSize:13 }}>{b.label}</span>
                                        {b.isReveal && (
                                          <span title="Reveal cuts — auto-calculated from frame size + window depth + reveal type"
                                                style={{ fontSize:10, fontWeight:700, background:'#dbeafe', color:'#1e3a8a', padding:'2px 6px', borderRadius:3, border:'1px solid #3b82f6', letterSpacing:0.3 }}>
                                            🪟 REVEAL · {b.revealType === 'inline' ? 'IN-LINE' : 'STEPPED'}
                                          </span>
                                        )}
                                        {b.isReveal && (
                                          <span title={'Rip stock down to ' + b.revealRipWidthMm + 'mm before cross-cutting. Source: ' + b.revealSourceWidthMm + '×' + b.revealStockThickMm + 'mm board (SKU ' + b.revealSourceSku + ').'}
                                                style={{ fontSize:11, fontWeight:700, background:'#fef9c3', color:'#713f12', padding:'2px 8px', borderRadius:3, border:'1px solid #eab308', fontFamily:'monospace' }}>
                                            ⤓ RIP TO {b.revealRipWidthMm}mm
                                          </span>
                                        )}
                                        {b.revealIsCustomOrder && (
                                          <span title="This reveal SKU is a CUSTOM ORDER — not held in stock, requires advance order from supplier. Surface on the production brief."
                                                style={{ fontSize:10, fontWeight:700, background:'#fff3cd', color:'#7a4d00', padding:'2px 8px', borderRadius:3, border:'1px solid #f0c14b', letterSpacing:0.5, textTransform:'uppercase' }}>
                                            ⚑ Custom Order
                                          </span>
                                        )}
                                        {b.revealOversized && (
                                          <span title="Required rip width exceeds the largest available reveal SKU. Workshop must source a wider board or split the reveal."
                                                style={{ fontSize:10, fontWeight:700, background:'#fee2e2', color:'#7f1d1d', padding:'2px 8px', borderRadius:3, border:'1px solid #dc2626', letterSpacing:0.5, textTransform:'uppercase' }}>
                                            ⚠ OVERSIZED — re-source
                                          </span>
                                        )}
                                        {b.jointStyle === 'mitre' && (
                                          <span title="All cuts mitred at 45°"
                                                style={{ fontSize:10, fontWeight:700, background:'#fef3c7', color:'#7c2d12', padding:'2px 6px', borderRadius:3, border:'1px solid #f59e0b', letterSpacing:0.3 }}>
                                            ⟋ MITRE 45°
                                          </span>
                                        )}
                                        <span style={{ fontSize:10, color:T.textMuted, fontFamily:'monospace', background:T.bgInput, padding:'1px 6px', borderRadius:3 }}>
                                          {b.isReveal
                                            ? (b.revealType === 'stepped'
                                                ? 'T/B = W+40 · L/R = H−36+40   (+20mm wrap each end)'
                                                : 'T/B = W · L/R = H−36')
                                            : ('T/B = W+' + b.allowanceMm + ' · L/R = H+' + b.allowanceMm)}
                                        </span>
                                        <span style={{ fontSize:10, color:T.textMuted }}>
                                          {bp.barCount} × {b.barLengthMm}mm bar{bp.barCount === 1 ? '' : 's'} · used {bp.totalUsedMm.toLocaleString()}mm · kerf {bp.totalKerfMm}mm · offcut {bp.totalOffcutMm.toLocaleString()}mm ({bp.totalKeptOffcutMm.toLocaleString()}mm kept ≥{bp.offcutKeepMinMm}mm) · utilisation <b style={{ color: bp.utilisationPct >= 90 ? '#166534' : '#9a3412' }}>{bp.utilisationPct}%</b>
                                        </span>
                                      </div>
                                    </div>
                                    {bp.bars.map(function(bar){
                                      var totalLen = b.barLengthMm;
                                      return (
                                        <div key={bar.barNo} style={{ marginBottom:6 }}>
                                          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:T.textMuted, marginBottom:2 }}>
                                            <span style={{ fontWeight:700, color:T.text }}>Bar {bar.barNo}</span>
                                            <span>·</span>
                                            <span>{bar.cuts.length} cut{bar.cuts.length === 1 ? '' : 's'}</span>
                                            <span>·</span>
                                            <span>offcut {bar.offcutMm}mm{bar.offcutKept ? ' (KEEP)' : ' (scrap)'}</span>
                                          </div>
                                          {/* Frame-name labels above the bar (window number per cut, proportional widths matching segments below) */}
                                          <div style={{ display:'flex', height:14, fontSize:9, fontWeight:700, color:T.text, marginBottom:1 }}>
                                            {bar.cuts.map(function(c, ci){
                                              var pct = (c.lengthMm / totalLen) * 100;
                                              return (
                                                <div key={'lbl-'+ci}
                                                     style={{ width: pct+'%', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', whiteSpace:'nowrap', padding:'0 2px' }}>
                                                  {c.frameName}
                                                </div>
                                              );
                                            })}
                                            {bar.offcutMm > 0 && (
                                              <div style={{ width: (bar.offcutMm / totalLen) * 100 + '%' }}/>
                                            )}
                                          </div>
                                          {/* Visual bar with proportional cut segments */}
                                          <div style={{ display:'flex', height:24, border:'1px solid #d1d5db', borderRadius:3, overflow:'hidden', background:'#f9fafb', fontSize:9, color:'white', fontWeight:700 }}>
                                            {bar.cuts.map(function(c, ci){
                                              var pct = (c.lengthMm / totalLen) * 100;
                                              var bg = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4'][ci % 6];
                                              var mitre = c.jointStyle === 'mitre';
                                              return (
                                                <div key={ci} title={c.frameName + ' / ' + c.surface + ' / ' + c.side + ' / ' + c.lengthMm + 'mm' + (mitre ? ' (mitred 45°)' : '') + (c.frameColour ? ' (frame: ' + c.frameColour.label + ')' : '')}
                                                     style={{ width: pct+'%', background:bg, borderRight:'1px solid white', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', whiteSpace:'nowrap', padding:'0 4px' }}>
                                                  {mitre && <span style={{ marginRight:3, opacity:0.85 }}>⟋</span>}
                                                  {c.lengthMm}
                                                  {mitre && <span style={{ marginLeft:3, opacity:0.85 }}>⟍</span>}
                                                </div>
                                              );
                                            })}
                                            {bar.offcutMm > 0 && (
                                              <div title={'Offcut: ' + bar.offcutMm + 'mm' + (bar.offcutKept ? ' (KEEP)' : ' (scrap)')}
                                                   style={{ width: (bar.offcutMm / totalLen) * 100 + '%', background: bar.offcutKept ? '#a7f3d0' : '#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', whiteSpace:'nowrap', padding:'0 4px', color: bar.offcutKept ? '#065f46' : '#7f1d1d' }}>
                                                {bar.offcutMm}
                                              </div>
                                            )}
                                          </div>
                                          {/* Compact text legend per cut */}
                                          <div style={{ display:'flex', flexWrap:'wrap', gap:'2px 10px', fontSize:9, color:T.textMuted, marginTop:2 }}>
                                            {bar.cuts.map(function(c, ci){
                                              var mitre = c.jointStyle === 'mitre';
                                              return (
                                                <span key={ci}>
                                                  <b>{mitre ? '⟋' : ''}{c.lengthMm}mm{mitre ? '⟍' : ''}</b> {c.frameName} {c.surface} {c.side}
                                                  {mitre ? ' · 45°' : ''}
                                                  {c.frameColour && c.frameColour.label ? ' · frame: ' + c.frameColour.label : ''}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          </details>
                        );
                      })()}
                      <details style={{ marginTop:8 }}>
                        <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer' }}>Show every cut ({tc.cuts.length})</summary>
                        <div style={{ overflowX:'auto', marginTop:6, background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                          <table style={{ borderCollapse:'collapse', width:'100%', fontSize:10 }}>
                            <thead>
                              <tr style={{ background:'#f4f6f8', fontSize:9, color:T.textMuted, textTransform:'uppercase' }}>
                                <th style={{ textAlign:'left',  padding:'4px 8px' }}>#</th>
                                <th style={{ textAlign:'left',  padding:'4px 8px' }}>Frame</th>
                                <th style={{ textAlign:'left',  padding:'4px 8px' }}>Frame colour (this side)</th>
                                <th style={{ textAlign:'left',  padding:'4px 8px' }}>Surface</th>
                                <th style={{ textAlign:'left',  padding:'4px 8px' }}>Side</th>
                                <th style={{ textAlign:'left',  padding:'4px 8px' }}>Trim</th>
                                <th style={{ textAlign:'right', padding:'4px 8px' }}>Length (mm)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tc.cuts.map(function(c, i){
                                var fcThisSide = c.surface === 'internal' ? c.frameColourInt : c.frameColourExt;
                                return (
                                  <tr key={i}>
                                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #f6f6f6' }}>{i+1}</td>
                                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #f6f6f6' }}>{c.frameName}</td>
                                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #f6f6f6' }}>{fcThisSide && fcThisSide.label}</td>
                                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #f6f6f6' }}>{c.surface}</td>
                                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #f6f6f6' }}>{c.side}</td>
                                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #f6f6f6' }}>{c.trimLabel}</td>
                                    <td style={{ padding:'3px 8px', borderBottom:'1px solid #f6f6f6', textAlign:'right' }}>{c.lengthMm}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* Frame grid */}
          {!(crmInit && crmInit.mode === 'survey') && <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
            {projectItems.map(function(frame, idx) {
              var prodMeta = PRODUCTS.find(function(p){return p.id===frame.productType});
              return <div key={frame.id} style={{
                width:220, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:10,
                overflow:'hidden', transition:'box-shadow 0.15s',
              }} onMouseEnter={function(e){e.currentTarget.style.boxShadow='0 6px 24px rgba(0,0,0,0.12)'}}
                 onMouseLeave={function(e){e.currentTarget.style.boxShadow='none'}}>
                {/* Thumbnail area — click to edit. Always renders the 2D
                    Schematic2D — per Phoenix the dashboard overview is for
                    quickly identifying a frame's opening style + dimensions,
                    which the schematic conveys clearly; the 3D snapshot was
                    too dense at this size and varied between frames depending
                    on whether they'd been opened in the editor yet. */}
                <div onClick={function(){openFrameEditor(idx)}} style={{ height:160, background:'#e8eaed', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', cursor:'pointer' }}>
                  <div style={{ opacity:0.6, transform:'scale(0.7)' }}>
                    <Schematic2D productType={frame.productType} widthMm={frame.width} heightMm={frame.height}
                      panelCount={frame.panelCount} openingStyle={frame.openStyle} transomPct={frame.transomPct}
                      colonialGrid={frame.colonialGrid} cellTypes={frame.cellTypes} zoneWidths={frame.zoneWidths} zoneHeights={frame.zoneHeights}
                      pricingConfig={(appSettings && appSettings.pricingConfig) || null} profileOverrides={frame.profileOverrides || null}/>
                  </div>
                  {/* Edit overlay on hover */}
                  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0)', transition:'background 0.15s', display:'flex', alignItems:'center', justifyContent:'center' }}
                    onMouseEnter={function(e){e.currentTarget.style.background='rgba(0,0,0,0.25)';e.currentTarget.children[0].style.opacity='1'}}
                    onMouseLeave={function(e){e.currentTarget.style.background='rgba(0,0,0,0)';e.currentTarget.children[0].style.opacity='0'}}>
                    <span style={{ color:'white', fontSize:11, fontWeight:600, background:'rgba(0,0,0,0.5)', padding:'4px 12px', borderRadius:4, opacity:0, transition:'opacity 0.15s' }}>Edit Frame</span>
                  </div>
                  {!isReadOnly && !(crmInit && (crmInit.mode === 'survey' || crmInit.mode === 'final')) && <button onClick={function(e){e.stopPropagation();deleteFrame(idx)}} style={{ position:'absolute', top:6, right:6, width:24, height:24, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.4)', color:'white', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>}
                </div>
                {/* Info — editable name (read-only in survey mode: frame
                    identity must stay stable — the CM PDF references by name) */}
                <div style={{ padding:'10px 12px' }}>
                  <input value={frame.name} onChange={function(e){renameFrame(idx, e.target.value)}}
                    onClick={function(e){e.stopPropagation()}}
                    readOnly={isReadOnly || (crmInit && (crmInit.mode === 'survey' || crmInit.mode === 'final'))}
                    style={{ fontSize:13, fontWeight:600, color:T.text, border:'none', background:'transparent', width:'100%', padding:'2px 0', outline:'none', borderBottom:'1px solid transparent', cursor: (isReadOnly || (crmInit && (crmInit.mode === 'survey' || crmInit.mode === 'final'))) ? 'default' : 'text' }}
                    onFocus={function(e){ if(!isReadOnly && !(crmInit && (crmInit.mode === 'survey' || crmInit.mode === 'final'))) e.target.style.borderBottomColor=T.accent }}
                    onBlur={function(e){e.target.style.borderBottomColor='transparent'}}/>
                  <div style={{ fontSize:9, color:T.textMuted, marginTop:2 }}>PVCu | {prodMeta ? prodMeta.label : frame.productType} | {frame.width}x{frame.height}mm</div>
                  {(function(){
                    try {
                      var fp = calculateFramePrice(frame, appSettings.pricingConfig);
                      var selList = appSettings.pricingConfig.markups.priceLists[0];
                      var sellPrice = fp.priceLists[selList ? selList.id : 'trade'] || fp.costPrice;
                      return React.createElement('div', {style:{fontSize:11,fontWeight:600,color:T.accent,marginTop:3}}, '$' + sellPrice.toFixed(2));
                    } catch(e) { return null; }
                  })()}
                  {/* ═══ M4b: Per-frame Check Measure row (spec §6.2) ═══
                      Renders only when crmInit.mode === 'survey'. Binds to
                      measurementsByFrameId[frame.id] via setMeasurementsByFrameId
                      with the functional-update pattern from the M4a handoff
                      (preserves { measuredWidthMm, measuredHeightMm, siteNotes,
                      photos } invariant). Photos stored as base64 data URLs
                      in local state only; wire shape remains spec-strict
                      (Option A, Phoenix default). */}
                  {crmInit && crmInit.mode === 'survey' && (function(){
                    var m = measurementsByFrameId[frame.id] || { measuredWidthMm:null, measuredHeightMm:null, siteNotes:'', photos:[] };
                    var hasW = typeof m.measuredWidthMm === 'number' && isFinite(m.measuredWidthMm);
                    var hasH = typeof m.measuredHeightMm === 'number' && isFinite(m.measuredHeightMm);
                    var missing = !hasW || !hasH;
                    var photoCount = (m.photos || []).length;
                    var updateMeasurement = function(field, rawVal) {
                      var next = rawVal === '' || rawVal == null ? null : Number(rawVal);
                      if (next !== null && !isFinite(next)) next = null;
                      setMeasurementsByFrameId(function(prev) {
                        var existing = prev[frame.id] || { measuredWidthMm:null, measuredHeightMm:null, siteNotes:'', photos:[] };
                        var updated = Object.assign({}, existing);
                        updated[field] = next;
                        var out = Object.assign({}, prev);
                        out[frame.id] = updated;
                        return out;
                      });
                    };
                    var updateNotes = function(val) {
                      setMeasurementsByFrameId(function(prev) {
                        var existing = prev[frame.id] || { measuredWidthMm:null, measuredHeightMm:null, siteNotes:'', photos:[] };
                        var updated = Object.assign({}, existing, { siteNotes: val });
                        var out = Object.assign({}, prev);
                        out[frame.id] = updated;
                        return out;
                      });
                    };
                    var addPhotos = function(fileList) {
                      if (!fileList || !fileList.length) return;
                      var arr = Array.prototype.slice.call(fileList);
                      Promise.all(arr.map(function(f){
                        return new Promise(function(res){
                          var rd = new FileReader();
                          rd.onload = function(){ res(String(rd.result || '')); };
                          rd.onerror = function(){ res(''); };
                          rd.readAsDataURL(f);
                        });
                      })).then(function(dataUrls){
                        var added = dataUrls.filter(function(s){ return s && s.indexOf('data:image/') === 0; });
                        if (!added.length) return;
                        setMeasurementsByFrameId(function(prev) {
                          var existing = prev[frame.id] || { measuredWidthMm:null, measuredHeightMm:null, siteNotes:'', photos:[] };
                          var updated = Object.assign({}, existing, { photos: (existing.photos || []).concat(added) });
                          var out = Object.assign({}, prev);
                          out[frame.id] = updated;
                          return out;
                        });
                      });
                    };
                    var removePhoto = function(photoIdx) {
                      setMeasurementsByFrameId(function(prev) {
                        var existing = prev[frame.id] || { measuredWidthMm:null, measuredHeightMm:null, siteNotes:'', photos:[] };
                        var nextPhotos = (existing.photos || []).filter(function(_, i){ return i !== photoIdx; });
                        var updated = Object.assign({}, existing, { photos: nextPhotos });
                        var out = Object.assign({}, prev);
                        out[frame.id] = updated;
                        return out;
                      });
                    };
                    var inputId = 'cm-photo-' + frame.id;
                    var numInpStyle = { width:'100%', fontSize:12, fontWeight:600, padding:'5px 6px', border:'1px solid ' + (missing ? '#fb923c' : T.border), borderRadius:4, background:'white', color:T.text, outline:'none', textAlign:'center', boxSizing:'border-box' };
                    return (
                      <div onClick={function(e){e.stopPropagation();}} style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #eee' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                          <span style={{ fontSize:9, fontWeight:700, color:'#7c2d12', textTransform:'uppercase', letterSpacing:0.6 }}>Measured</span>
                          {missing
                            ? <span style={{ fontSize:9, fontWeight:700, color:'#9a3412', background:'#ffedd5', padding:'2px 6px', borderRadius:3 }}>Missing</span>
                            : <span style={{ fontSize:9, fontWeight:700, color:'#166534', background:'#dcfce7', padding:'2px 6px', borderRadius:3 }}>✓</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                          <input type="number" inputMode="numeric" value={hasW ? m.measuredWidthMm : ''} placeholder="W"
                                 onChange={function(e){ updateMeasurement('measuredWidthMm', e.target.value); }}
                                 style={numInpStyle}/>
                          <span style={{ fontSize:11, color:T.textMuted }}>×</span>
                          <input type="number" inputMode="numeric" value={hasH ? m.measuredHeightMm : ''} placeholder="H"
                                 onChange={function(e){ updateMeasurement('measuredHeightMm', e.target.value); }}
                                 style={numInpStyle}/>
                          <span style={{ fontSize:9, color:T.textMuted, whiteSpace:'nowrap' }}>mm</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                          <label htmlFor={inputId} style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:600, color:'#555', padding:'4px 8px', border:'1px solid '+T.border, borderRadius:4, cursor:'pointer', background:'#fafafa' }}>
                            <span style={{ fontSize:12 }}>📸</span>
                            {photoCount > 0 ? (photoCount + ' photo' + (photoCount === 1 ? '' : 's')) : 'Add photo'}
                          </label>
                          <input id={inputId} type="file" accept="image/*" multiple
                                 onChange={function(e){ addPhotos(e.target.files); e.target.value = ''; }}
                                 style={{ display:'none' }}/>
                        </div>
                        {photoCount > 0 && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:3, marginBottom:6 }}>
                            {(m.photos || []).map(function(src, pi){
                              return (
                                <div key={pi} style={{ position:'relative', width:34, height:34, borderRadius:3, overflow:'hidden', border:'1px solid '+T.border }}>
                                  <img src={src} alt={'p'+pi} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                                  <button onClick={function(e){ e.stopPropagation(); removePhoto(pi); }}
                                          style={{ position:'absolute', top:0, right:0, width:14, height:14, borderRadius:0, border:'none', background:'rgba(0,0,0,0.55)', color:'white', fontSize:9, lineHeight:1, cursor:'pointer', padding:0 }}>✕</button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <textarea value={m.siteNotes || ''} placeholder="Site notes (optional)"
                                  onChange={function(e){ updateNotes(e.target.value); }}
                                  rows={2}
                                  style={{ width:'100%', fontSize:11, padding:'5px 6px', border:'1px solid '+T.border, borderRadius:4, background:'white', color:T.text, outline:'none', resize:'vertical', fontFamily:'inherit', boxSizing:'border-box' }}/>
                      </div>
                    );
                  })()}
                </div>
              </div>;
            })}
          </div>}

          {!(crmInit && crmInit.mode === 'survey') && projectItems.length === 0 && <div style={{ textAlign:'center', padding:'60px 0', color:T.textMuted }}>
            <div style={{ fontSize:40, marginBottom:12 }}>▢</div>
            <div style={{ fontSize:13 }}>No frames yet</div>
            <div style={{ fontSize:11, marginTop:4 }}>Click <strong>+ New Frame</strong> to add your first window or door</div>
          </div>}
        </div>

        {/* ═══ NEW FRAME PANEL ═══ */}
        {showNewFrame && <div style={{ position:'fixed', inset:0, zIndex:9998, display:'flex' }}>
          <div style={{ width:520, background:'white', boxShadow:'4px 0 24px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', zIndex:2 }}>
            {/* Header */}
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #e8e8e8', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <span style={{ fontSize:16, fontWeight:700 }}>New</span>
                <span style={{ fontSize:13, color:'#888', marginLeft:12 }}>Frame</span>
              </div>
              <div onClick={function(){setShowNewFrame(false)}} style={{ cursor:'pointer', fontSize:18, color:'#999' }}>✕</div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}>
              {/* Name */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, color:'#888', marginBottom:4 }}>Name</div>
                <input id="newFrameName" type="text" defaultValue={'W' + String(projectItems.length + 1).padStart(2, '0')} style={{ width:'100%', padding:'6px 10px', border:'1px solid #e0e0e0', borderRadius:4, fontSize:13, color:'#333', boxSizing:'border-box' }}/>
              </div>

              {/* Categories */}
              {frameCats.map(function(cat) {
                return <div key={cat.id} style={{ borderTop:'1px solid #eee', padding:'16px 0' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.5">
                      {cat.id === 'windows'
                        ? <React.Fragment><rect x="2" y="2" width="20" height="20" rx="1"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></React.Fragment>
                        : <React.Fragment><rect x="4" y="1" width="16" height="22" rx="1"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="17" cy="11" r="1"/></React.Fragment>
                      }
                    </svg>
                    <span style={{ fontSize:14, fontWeight:700, color:'#333' }}>{cat.label}</span>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8, paddingLeft:4 }}>
                    {cat.types.map(function(prod) {
                      // Generate proper 2D schematic thumbnail per product type
                      var S = 56, f = 4, s = 3, c = '#888', cl = '#bbb';
                      var inner = [];
                      var pId = prod.id;
                      var iw = S-f*2, ih = S-f*2;
                      // Opening triangles and type-specific markings
                      if (pId === 'awning_window') {
                        // Triangle pointing down to bottom (top-hinged, opens
                        // outward at the bottom — Spartan house convention).
                        inner.push(<polygon key="t" points={(f+s)+","+(f+s)+' '+(f+iw-s)+","+(f+s)+' '+(f+iw/2)+","+(f+ih-s)} fill="none" stroke={cl} strokeWidth="0.8"/>);
                        inner.push(<rect key="s" x={f+s} y={f+s} width={iw-s*2} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                      } else if (pId === 'casement_window') {
                        // Triangle pointing left (left-hand hinge)
                        inner.push(<polygon key="t" points={(f+s)+","+(f+ih/2)+' '+(f+iw-s)+","+(f+s)+' '+(f+iw-s)+","+(f+ih-s)} fill="none" stroke={cl} strokeWidth="0.8"/>);
                        inner.push(<rect key="s" x={f+s} y={f+s} width={iw-s*2} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                      } else if (pId === 'tilt_turn_window') {
                        // Triangle from bottom + triangle from side (dual opening)
                        inner.push(<polygon key="t1" points={(f+iw/2)+","+(f+s)+' '+(f+s)+","+(f+ih-s)+' '+(f+iw-s)+","+(f+ih-s)} fill="none" stroke={cl} strokeWidth="0.5" strokeDasharray="2,2"/>);
                        inner.push(<polygon key="t2" points={(f+s)+","+(f+ih/2)+' '+(f+iw-s)+","+(f+s)+' '+(f+iw-s)+","+(f+ih-s)} fill="none" stroke={cl} strokeWidth="0.8"/>);
                        inner.push(<rect key="s" x={f+s} y={f+s} width={iw-s*2} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                      } else if (pId === 'fixed_window') {
                        // Just X cross
                        inner.push(<line key="d1" x1={f+s} y1={f+s} x2={f+iw-s} y2={f+ih-s} stroke={cl} strokeWidth="0.6"/>);
                        inner.push(<line key="d2" x1={f+iw-s} y1={f+s} x2={f+s} y2={f+ih-s} stroke={cl} strokeWidth="0.6"/>);
                        inner.push(<rect key="s" x={f+s} y={f+s} width={iw-s*2} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                      } else if (pId === 'sliding_window') {
                        // Two panels, arrow between
                        var hw = (iw-s*2)/2 - 1;
                        inner.push(<rect key="s1" x={f+s} y={f+s} width={hw} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<rect key="s2" x={f+s+hw+2} y={f+s} width={hw} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<line key="a" x1={f+s+hw-6} y1={f+ih/2} x2={f+s+hw+8} y2={f+ih/2} stroke={cl} strokeWidth="1"/>);
                        inner.push(<polygon key="ah" points={(f+s+hw+8)+","+(f+ih/2)+' '+(f+s+hw+4)+","+(f+ih/2-3)+' '+(f+s+hw+4)+","+(f+ih/2+3)} fill={cl}/>);
                      } else if (pId === 'french_door') {
                        // Two panels with opposing triangles, taller
                        var hw2 = (iw-s*2)/2 - 1;
                        inner.push(<polygon key="t1" points={(f+s)+","+(f+ih/2)+' '+(f+s+hw2)+","+(f+s)+' '+(f+s+hw2)+","+(f+ih-s)} fill="none" stroke={cl} strokeWidth="0.7"/>);
                        inner.push(<polygon key="t2" points={(f+iw-s)+","+(f+ih/2)+' '+(f+s+hw2+2)+","+(f+s)+' '+(f+s+hw2+2)+","+(f+ih-s)} fill="none" stroke={cl} strokeWidth="0.7"/>);
                        inner.push(<rect key="s1" x={f+s} y={f+s} width={hw2} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<rect key="s2" x={f+s+hw2+2} y={f+s} width={hw2} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                      } else if (pId === 'hinged_door') {
                        // Single panel with triangle hinge side
                        inner.push(<polygon key="t" points={(f+s)+","+(f+ih/2)+' '+(f+iw-s)+","+(f+s)+' '+(f+iw-s)+","+(f+ih-s)} fill="none" stroke={cl} strokeWidth="0.7"/>);
                        inner.push(<rect key="s" x={f+s} y={f+s} width={iw-s*2} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<circle key="h" cx={f+iw-s-4} cy={f+ih/2} r="1.5" fill={c}/>);
                      } else if (pId === 'bifold_door') {
                        // Multiple folding panels
                        var pw = (iw-s*2)/4;
                        for(var bi=0;bi<4;bi++) {
                          var bx = f+s+bi*pw;
                          inner.push(<rect key={'bf'+bi} x={bx} y={f+s} width={pw} height={ih-s*2} fill="none" stroke={c} strokeWidth="0.8"/>);
                          if(bi<3) inner.push(<line key={'bfl'+bi} x1={bx+pw} y1={f+s} x2={bx+pw} y2={f+ih-s} stroke={c} strokeWidth="0.5" strokeDasharray="2,1"/>);
                        }
                        inner.push(<polygon key="ba" points={(f+iw/2-8)+","+(f+ih/2)+' '+(f+iw/2+8)+","+(f+ih/2-4)+' '+(f+iw/2+8)+","+(f+ih/2+4)} fill={cl}/>);
                      } else if (pId === 'lift_slide_door') {
                        // Two large panels, one with arrow
                        var hw3 = (iw-s*2)/2 - 1;
                        inner.push(<rect key="s1" x={f+s} y={f+s} width={hw3} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<rect key="s2" x={f+s+hw3+2} y={f+s} width={hw3} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<line key="a" x1={f+s+4} y1={f+ih/2} x2={f+s+hw3-4} y2={f+ih/2} stroke={cl} strokeWidth="1.2"/>);
                        inner.push(<polygon key="ah" points={(f+s+hw3-4)+","+(f+ih/2)+' '+(f+s+hw3-10)+","+(f+ih/2-4)+' '+(f+s+hw3-10)+","+(f+ih/2+4)} fill={cl}/>);
                      } else if (pId === 'smart_slide_door') {
                        var hw4 = (iw-s*2)/2 - 1;
                        inner.push(<rect key="s1" x={f+s} y={f+s} width={hw4} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<rect key="s2" x={f+s+hw4+2} y={f+s} width={hw4} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<line key="a" x1={f+s+hw4+6} y1={f+ih/2} x2={f+iw-s-4} y2={f+ih/2} stroke={cl} strokeWidth="1.2"/>);
                        inner.push(<polygon key="ah" points={(f+iw-s-4)+","+(f+ih/2)+' '+(f+iw-s-10)+","+(f+ih/2-4)+' '+(f+iw-s-10)+","+(f+ih/2+4)} fill={cl}/>);
                      } else if (pId === 'vario_slide_door') {
                        var hw5 = (iw-s*2)/2 - 1;
                        inner.push(<rect key="s1" x={f+s} y={f+s} width={hw5} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<rect key="s2" x={f+s+hw5+2} y={f+s} width={hw5} height={ih-s*2} fill="none" stroke={c} strokeWidth="1"/>);
                        inner.push(<line key="a1" x1={f+s+4} y1={f+ih/2} x2={f+s+hw5-4} y2={f+ih/2} stroke={cl} strokeWidth="0.8"/>);
                        inner.push(<polygon key="a1h" points={(f+s+hw5-4)+","+(f+ih/2)+' '+(f+s+hw5-9)+","+(f+ih/2-3)+' '+(f+s+hw5-9)+","+(f+ih/2+3)} fill={cl}/>);
                        inner.push(<line key="a2" x1={f+iw-s-4} y1={f+ih/2} x2={f+s+hw5+6} y2={f+ih/2} stroke={cl} strokeWidth="0.8"/>);
                        inner.push(<polygon key="a2h" points={(f+s+hw5+6)+","+(f+ih/2)+' '+(f+s+hw5+11)+","+(f+ih/2-3)+' '+(f+s+hw5+11)+","+(f+ih/2+3)} fill={cl}/>);
                      } else if (pId === 'stacker_door') {
                        var pw2 = (iw-s*2)/3;
                        for(var si2=0;si2<3;si2++) {
                          inner.push(<rect key={'st'+si2} x={f+s+si2*pw2} y={f+s} width={pw2} height={ih-s*2} fill="none" stroke={c} strokeWidth="0.8"/>);
                        }
                        inner.push(<line key="sa" x1={f+s+4} y1={f+ih/2} x2={f+s+pw2-4} y2={f+ih/2} stroke={cl} strokeWidth="0.8"/>);
                        inner.push(<polygon key="sah" points={(f+s+pw2-4)+","+(f+ih/2)+' '+(f+s+pw2-9)+","+(f+ih/2-3)+' '+(f+s+pw2-9)+","+(f+ih/2+3)} fill={cl}/>);
                      } else {
                        // Fallback X
                        inner.push(<line key="d1" x1={f} y1={f} x2={S-f} y2={S-f} stroke={cl} strokeWidth="0.5"/>);
                        inner.push(<line key="d2" x1={S-f} y1={f} x2={f} y2={S-f} stroke={cl} strokeWidth="0.5"/>);
                      }

                      return <div key={prod.id} onClick={function(){
                        var wEl = document.getElementById('newFrameW');
                        var hEl = document.getElementById('newFrameH');
                        var nEl = document.getElementById('newFrameName');
                        var wVal = wEl ? parseInt(wEl.value, 10) : 0;
                        var hVal = hEl ? parseInt(hEl.value, 10) : 0;
                        var nVal = nEl ? nEl.value.trim() : '';
                        addNewFrame(prod.id, wVal || prod.w, hVal || prod.h, nVal || undefined);
                      }}
                        style={{ width:120, cursor:'pointer', textAlign:'center', padding:'10px 6px', borderRadius:8, border:'1px solid #e0e0e0', transition:'all 0.15s' }}
                        onMouseEnter={function(e){e.currentTarget.style.background='#f5f5f5';e.currentTarget.style.borderColor='#c41230'}}
                        onMouseLeave={function(e){e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='#e0e0e0'}}>
                        <div style={{ width:S, height:S, margin:'0 auto 6px' }}>
                          <svg width={S} height={S} viewBox={'0 0 '+S+' '+S}>
                            <rect x={f/2} y={f/2} width={S-f} height={S-f} fill="#f8f8f8" stroke="#999" strokeWidth="1.5" rx="1"/>
                            {inner}
                          </svg>
                        </div>
                        <div style={{ fontSize:10, color:'#555', fontWeight:500, lineHeight:1.3 }}>{prod.label}</div>
                      </div>;
                    })}
                  </div>
                </div>;
              })}
            </div>

            {/* Footer with dimensions */}
            <div style={{ padding:'12px 20px', borderTop:'1px solid #e8e8e8', display:'flex', alignItems:'center', gap:12 }}>
              <div>
                <div style={{ fontSize:10, color:'#888' }}>Width</div>
                <input type="number" defaultValue={900} id="newFrameW" style={{ width:60, padding:'4px 6px', border:'1px solid #ddd', borderRadius:4, fontSize:12 }}/>
              </div>
              <div>
                <div style={{ fontSize:10, color:'#888' }}>Height</div>
                <input type="number" defaultValue={900} id="newFrameH" style={{ width:60, padding:'4px 6px', border:'1px solid #ddd', borderRadius:4, fontSize:12 }}/>
              </div>
            </div>
          </div>
          {/* Click-away backdrop */}
          <div onClick={function(){setShowNewFrame(false)}} style={{ flex:1, background:'rgba(0,0,0,0.2)' }}/>
        </div>}

        {/* ═══ PRICE PANEL ═══ */}
        {showPricePanel && <div style={{ position:'fixed', inset:0, zIndex:9998, display:'flex' }}>
          <div style={{ width:380, background:'white', boxShadow:'4px 0 24px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', zIndex:2 }}>
            {/* Header */}
            <div style={{ padding:'16px 20px', borderBottom:'1px solid #e8e8e8', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span style={{ fontSize:16, fontWeight:700 }}>{projectName} Price</span>
              <div onClick={function(){setShowPricePanel(false)}} style={{ cursor:'pointer', fontSize:18, color:'#999' }}>✕</div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}>
              {/* Price list selection — dynamic from pricingConfig */}
              {appSettings.pricingConfig.markups.priceLists.map(function(pl) {
                return <label key={pl.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', cursor:'pointer' }}>
                  <input type="radio" name="priceList" checked={selectedPriceList===pl.id} onChange={function(){setSelectedPriceList(pl.id)}} style={{ accentColor:'#1a1a1a' }}/>
                  <span style={{ fontSize:12 }}>{pl.name} ({pl.pct}%)</span>
                </label>;
              })}

              <div style={{ borderTop:'1px solid #eee', margin:'12px 0', padding:'12px 0' }}>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:6 }}>Tax</div>
                <select value={taxMode} onChange={function(e){setTaxMode(e.target.value)}} style={{ padding:'4px 8px', border:'1px solid #ddd', borderRadius:4, fontSize:12 }}>
                  <option value="gst">GST</option><option value="none">None</option>
                </select>
                <div style={{ marginTop:8 }}>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, cursor:'pointer' }}>
                    <input type="radio" name="taxApp" checked={taxApplication==='item'} onChange={function(){setTaxApplication('item')}} style={{ accentColor:'#1a1a1a' }}/> Add to each item
                  </label>
                  <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, cursor:'pointer', marginTop:4 }}>
                    <input type="radio" name="taxApp" checked={taxApplication==='total'} onChange={function(){setTaxApplication('total')}} style={{ accentColor:'#1a1a1a' }}/> Add at total
                  </label>
                </div>
              </div>

              {/* Frame prices — CALCULATED */}
              <div style={{ borderTop:'1px solid #eee', paddingTop:12 }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Frames</div>
                {projectItems.map(function(frame, idx) {
                  try {
                    var fp = calculateFramePrice(frame, appSettings.pricingConfig);
                    var selPl = appSettings.pricingConfig.markups.priceLists.find(function(p){return p.id===selectedPriceList}) || appSettings.pricingConfig.markups.priceLists[0];
                    var pid = selPl ? selPl.id : null;
                    // Split frame vs install portion for the selected price list so the
                    // salesperson sees the same two-line structure that appears on the
                    // customer quote. Falls back to fullCost if new fields are absent.
                    var framePortion   = (fp.priceListsFactory && pid && fp.priceListsFactory[pid]) || fp.costPrice || 0;
                    var installPortion = (fp.priceListsInstall && pid && fp.priceListsInstall[pid]) || 0;
                    var sellPrice = framePortion + installPortion;
                    var expanded = !!expandedFrameIds[frame.id];
                    var hwOverride = frame.hardwareCostOverride;
                    var defaultHw = (appSettings.pricingConfig.hardwareCosts || {})[frame.productType] || 85;
                    var numSashes = (fp.production && fp.production.numSashes) || 1;

                    function updateFrame(patch) {
                      setProjectItems(function(prev){
                        return prev.map(function(f, i){ return i === idx ? Object.assign({}, f, patch) : f; });
                      });
                    }

                    return <div key={frame.id} style={{ marginBottom:10, borderBottom:'1px solid #f0f0f0', paddingBottom:8 }}>
                      <div onClick={function(){ setExpandedFrameIds(function(p){ var n = Object.assign({}, p); n[frame.id] = !n[frame.id]; return n; }); }}
                        style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, fontWeight:600, cursor:'pointer', padding:'4px 0' }}>
                        <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ color:'#888', fontSize:10, width:10 }}>{expanded ? '▾' : '▸'}</span>
                          {frame.name}
                          {(function(){
                            var effType = frame.installationType || (frame.supplyOnly ? 'supply_only' : null);
                            if (effType === 'supply_only') return <span style={{ fontSize:8, color:'#999', background:'#f0f0f0', padding:'1px 5px', borderRadius:3 }}>SUPPLY ONLY</span>;
                            if (effType === 'new_construction') return <span style={{ fontSize:8, color:'#1a5d3a', background:'#ecfdf5', padding:'1px 5px', borderRadius:3 }}>NEW BUILD</span>;
                            return null;
                          })()}
                          {(function(){
                            var c = (typeof isStandardColourCombo === 'function') ? isStandardColourCombo(frame.colour, frame.colourInt) : { standard: true };
                            if (c.standard) return null;
                            return <span style={{ fontSize:8, color:'#78350f', background:'#fbbf24', padding:'1px 5px', borderRadius:3, fontWeight:700 }} title={c.reason}>⚠ SPECIAL</span>;
                          })()}
                          {hwOverride != null && <span style={{ fontSize:8, color:'#c41230', background:'#fef2f2', padding:'1px 5px', borderRadius:3 }}>HW CUSTOM</span>}
                        </span>
                        <span>${sellPrice.toFixed(2)}</span>
                      </div>
                      <div style={{ fontSize:9, color:'#aaa', marginTop:2, paddingLeft:16 }}>
                        Frame ${framePortion.toFixed(2)}{installPortion > 0 && <React.Fragment> · Install ${installPortion.toFixed(2)}</React.Fragment>}
                        {' · '}{frame.productType.replace(/_/g,' ')} {frame.width}×{frame.height}
                      </div>

                      {expanded && <div style={{ marginTop:8, padding:'8px 12px', background:'#fafafa', borderRadius:4, fontSize:10, color:'#555' }}>
                        {/* Cost breakdown — WIP23: markup percentages hidden from client view */}
                        <div style={{ fontSize:10, fontWeight:700, color:'#333', marginBottom:4 }}>Cost breakdown</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:2, fontFamily:'monospace' }}>
                          <span>Profiles (frame/sash/mullion/cover)</span><span>${(fp.materials.profileGroupFinal||0).toFixed(2)}</span>
                          <span>Steel reinforcement</span>            <span>${(fp.materials.steelFinal||0).toFixed(2)}</span>
                          <span>Glazing beads</span>                   <span>${(fp.materials.beadFinal||0).toFixed(2)}</span>
                          <span>Glass IGU ({fp.glassArea.toFixed(2)} m²)</span><span>${(fp.materials.glassFinal||0).toFixed(2)}</span>
                          <span>Hardware ({numSashes} sash{hwOverride != null ? ' custom' : ''})</span><span>${(fp.materials.hardwareFinal||0).toFixed(2)}</span>
                          <span>EPDM gasket</span>                     <span>${(fp.materials.gasketFinal||0).toFixed(2)}</span>
                          <span>Ancillaries (reveals, sill, fixings, delivery)</span><span>${(fp.materials.ancillariesFinal||0).toFixed(2)}</span>
                          <span style={{ borderTop:'1px solid #ddd', paddingTop:2, fontWeight:700 }}>Total materials</span>
                          <span style={{ borderTop:'1px solid #ddd', paddingTop:2, fontWeight:700 }}>${fp.materials.totalMaterial.toFixed(2)}</span>
                          <span>Factory labour ({fp.production.factoryMinutes.toFixed(0)} min)</span>
                          <span>${fp.production.factoryLabour.toFixed(2)}</span>
                          <span style={{ fontWeight:700 }}>Factory cost price</span>
                          <span style={{ fontWeight:700 }}>${fp.costPrice.toFixed(2)}</span>
                          {(function(){
                            var effType = frame.installationType || (frame.supplyOnly ? 'supply_only' : (projectInfo && projectInfo.installationType) || 'retrofit');
                            var typeLabel = (INSTALLATION_TYPES.find(function(it){return it.id===effType;}) || {}).label || effType;
                            if (effType === 'supply_only') {
                              return <React.Fragment>
                                <span style={{ fontStyle:'italic', color:'#888' }}>Installation — {typeLabel}</span>
                                <span style={{ fontStyle:'italic', color:'#888' }}>—</span>
                              </React.Fragment>;
                            }
                            return <React.Fragment>
                              <span>Installation — {typeLabel} ({fp.installation.minutes.toFixed(0)} min)</span>
                              <span>${(fp.installation.costMarked||0).toFixed(2)}</span>
                            </React.Fragment>;
                          })()}
                          <span style={{ fontWeight:700 }}>Full cost (factory + install)</span>
                          <span style={{ fontWeight:700 }}>${fp.fullCost.toFixed(2)}</span>
                          <span style={{ color:'#c41230' }}>{selPl ? selPl.name : 'Price'}</span>
                          <span style={{ color:'#c41230', fontWeight:700 }}>${sellPrice.toFixed(2)}</span>
                        </div>

                        {/* Per-station minutes — compact bars */}
                        <div style={{ fontSize:10, fontWeight:700, color:'#333', marginTop:10, marginBottom:4 }}>Production time per station (min)</div>
                        <div style={{ fontSize:9, fontFamily:'monospace' }}>
                          {Object.entries(fp.production.stationMinutes || {}).map(function(kv){
                            return <div key={kv[0]} style={{ display:'flex', justifyContent:'space-between', padding:'1px 0' }}>
                              <span style={{ color:'#666' }}>{kv[0].replace(/^S[_0-9A-Z]*_?/,'').replace(/([A-Z])/g,' $1').trim() || kv[0]}</span>
                              <span>{kv[1].toFixed(1)}</span>
                            </div>;
                          })}
                        </div>

                        {/* Per-frame overrides */}
                        <div style={{ fontSize:10, fontWeight:700, color:'#333', marginTop:10, marginBottom:4 }}>Per-frame overrides</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:6, alignItems:'center' }}>
                          <span>Room / location</span>
                          <input type="text" value={frame.room || ''} placeholder="(optional)"
                            onChange={function(e){ updateFrame({ room: e.target.value }); }}
                            style={{ width:130, padding:'3px 6px', border:'1px solid #ddd', borderRadius:3, fontSize:10 }}/>
                          <span>Hardware cost (override $/sash)</span>
                          <div style={{ display:'flex', alignItems:'center', gap:3 }}>
                            <input type="number" step="1" min="0" value={hwOverride != null ? hwOverride : ''}
                              placeholder={String(defaultHw)}
                              onChange={function(e){
                                var v = e.target.value;
                                updateFrame({ hardwareCostOverride: v === '' ? null : +v });
                              }}
                              style={{ width:70, padding:'3px 6px', border:'1px solid '+(hwOverride != null ? '#c41230' : '#ddd'), borderRadius:3, fontSize:10, fontFamily:'monospace', textAlign:'right' }}/>
                            {hwOverride != null && <button onClick={function(){ updateFrame({ hardwareCostOverride: null }); }}
                              title="Clear override — use default"
                              style={{ width:18, height:18, border:'none', background:'transparent', color:'#c00', cursor:'pointer', fontSize:12 }}>×</button>}
                          </div>
                          <span>Installation type</span>
                          <select value={frame.installationType || (frame.supplyOnly ? 'supply_only' : (projectInfo && projectInfo.installationType) || 'retrofit')}
                            onChange={function(e){
                              var v = e.target.value;
                              // Clear legacy supplyOnly once user explicitly sets installationType
                              updateFrame({ installationType: v, supplyOnly: v === 'supply_only' });
                            }}
                            style={{ padding:'3px 6px', border:'1px solid #ddd', borderRadius:3, fontSize:10 }}>
                            {(typeof INSTALLATION_TYPES !== 'undefined' ? INSTALLATION_TYPES : []).map(function(it){
                              return <option key={it.id} value={it.id}>{it.label}</option>;
                            })}
                          </select>
                          {'sliding_window vario_slide_door stacker_door'.split(' ').indexOf(frame.productType) >= 0 && <React.Fragment>
                            <span>Vario-Slide tracks</span>
                            <select value={frame.tracks || 3}
                              onChange={function(e){ updateFrame({ tracks: +e.target.value }); }}
                              style={{ padding:'3px 6px', border:'1px solid #ddd', borderRadius:3, fontSize:10 }}>
                              <option value="2">2-track (10x087)</option>
                              <option value="3">3-track (10x084)</option>
                            </select>
                          </React.Fragment>}
                        </div>

                        {/* Geometry snapshot */}
                        <div style={{ fontSize:9, color:'#999', marginTop:8 }}>
                          {fp.production.numSashes} sash · {fp.production.numRects} rect(s) · {fp.production.numMullions} mullion(s) · {fp.production.totalCorners} corners · {fp.production.profileBars} profile cuts · {fp.production.steelPieces} steels
                        </div>

                        {/* Bill of materials — inline */}
                        <details style={{ marginTop:8 }}>
                          <summary style={{ fontSize:10, fontWeight:700, color:'#333', cursor:'pointer' }}>Bill of materials ({(fp.bom||[]).length} lines)</summary>
                          <table style={{ width:'100%', fontSize:9, fontFamily:'monospace', marginTop:4, borderCollapse:'collapse' }}>
                            <thead>
                              <tr style={{ color:'#888', borderBottom:'1px solid #ddd' }}>
                                <th style={{ textAlign:'left', padding:'2px 4px' }}>Category</th>
                                <th style={{ textAlign:'left', padding:'2px 4px' }}>Item</th>
                                <th style={{ textAlign:'right', padding:'2px 4px' }}>Len (mm)</th>
                                <th style={{ textAlign:'right', padding:'2px 4px' }}>Qty</th>
                                <th style={{ textAlign:'right', padding:'2px 4px' }}>$/unit</th>
                                <th style={{ textAlign:'right', padding:'2px 4px' }}>Line $</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(fp.bom || []).map(function(ln, bi){
                                return <tr key={bi} style={{ borderBottom:'1px dotted #eee' }}>
                                  <td style={{ padding:'2px 4px', color:'#888' }}>{ln.category}</td>
                                  <td style={{ padding:'2px 4px' }}>{ln.label}{ln.areaM2 ? ' ('+ln.areaM2+'m²)' : ''}</td>
                                  <td style={{ padding:'2px 4px', textAlign:'right', color:'#888' }}>{ln.lenMm || ''}</td>
                                  <td style={{ padding:'2px 4px', textAlign:'right' }}>{ln.qty}</td>
                                  <td style={{ padding:'2px 4px', textAlign:'right' }}>{(ln.unitRate || 0).toFixed(2)}</td>
                                  <td style={{ padding:'2px 4px', textAlign:'right' }}>{(ln.lineTotal || 0).toFixed(2)}</td>
                                </tr>;
                              })}
                            </tbody>
                          </table>
                        </details>
                      </div>}
                    </div>;
                  } catch(e) {
                    return <div key={frame.id} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:12 }}>
                      <span>{frame.name}</span><span style={{ color:'#c00', fontSize:10 }}>calc error: {e.message}</span>
                    </div>;
                  }
                })}
                {projectItems.length === 0 && <div style={{ fontSize:11, color:'#999', padding:'8px 0' }}>No frames added yet</div>}
              </div>

              {/* Ancillaries */}
              <div style={{ borderTop:'1px solid #eee', paddingTop:12, marginTop:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>Ancillaries</div>
                  {!isReadOnly && <button onClick={function(){
                    setProjectAncillaries(function(prev){ return [...prev, { id:'anc_'+Date.now(), name:'New ancillary', amount:0, disc:true }]; });
                  }} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 12px', border:'1px solid #ddd', borderRadius:4, background:'white', fontSize:11, cursor:'pointer' }}>+ Ancillary</button>}
                </div>
                {/* Quick-add from settings library */}
                {!isReadOnly && (appSettings.ancillaries || []).length > 0 && (
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                    {(appSettings.ancillaries || []).map(function(libAnc){
                      var alreadyAdded = projectAncillaries.some(function(p){ return p.libId === libAnc.id; });
                      return <button key={libAnc.id} disabled={alreadyAdded} onClick={function(){
                        setProjectAncillaries(function(prev){ return [...prev, { id:'anc_'+Date.now(), libId:libAnc.id, name:libAnc.name, amount:Number(libAnc.amount)||0, disc:libAnc.disc !== false }]; });
                      }} style={{ padding:'3px 8px', border:'1px solid '+(alreadyAdded?'#eee':'#ddd'), borderRadius:3, background:alreadyAdded?'#f5f5f5':'white', fontSize:10, cursor:alreadyAdded?'default':'pointer', color:alreadyAdded?'#bbb':'#555' }} title={libAnc.name}>+ {libAnc.name.length > 22 ? libAnc.name.slice(0,22)+'…' : libAnc.name}</button>;
                    })}
                  </div>
                )}
                {projectAncillaries.length === 0 && <div style={{ fontSize:11, color:'#999', padding:'4px 0' }}>None added</div>}
                {projectAncillaries.map(function(anc, i){
                  return <div key={anc.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 0', fontSize:12 }}>
                    <input value={anc.name} onChange={function(e){ var v=e.target.value; setProjectAncillaries(function(prev){ var n=[...prev]; n[i]={...n[i], name:v}; return n; }); }} style={{ flex:1, padding:'3px 6px', border:'1px solid #e0e0e0', borderRadius:3, fontSize:11 }}/>
                    <span style={{ fontSize:11, color:'#888' }}>$</span>
                    <input type="number" step="0.01" value={anc.amount} onChange={function(e){ var v=+e.target.value; setProjectAncillaries(function(prev){ var n=[...prev]; n[i]={...n[i], amount:v}; return n; }); }} style={{ width:80, padding:'3px 6px', border:'1px solid '+T.border, borderRadius:3, fontSize:11, fontFamily:'monospace', textAlign:'right' }}/>
                    <label style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'#666', cursor:'pointer' }} title="Discountable — promotions can apply to this">
                      <input type="checkbox" checked={anc.disc !== false} onChange={function(e){ var v=e.target.checked; setProjectAncillaries(function(prev){ var n=[...prev]; n[i]={...n[i], disc:v}; return n; }); }}/>disc
                    </label>
                    {!isReadOnly && <button onClick={function(){ setProjectAncillaries(function(prev){ return prev.filter(function(_,j){return j!==i;}); }); }} style={{ width:20, height:20, border:'none', background:'transparent', color:'#c00', cursor:'pointer', fontSize:14 }} title="Remove">×</button>}
                  </div>;
                })}
              </div>

              {/* Promotions */}
              <div style={{ borderTop:'1px solid #eee', paddingTop:12, marginTop:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>Promotions</div>
                  {!isReadOnly && <button onClick={function(){
                    setProjectPromotions(function(prev){ return [...prev, { id:'prm_'+Date.now(), name:'New promo', kind:'pct', amount:10, enabled:true, applyFrames:true, applyInstall:true, applyAncillaries:true }]; });
                  }} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 12px', border:'1px solid #ddd', borderRadius:4, background:'white', fontSize:11, cursor:'pointer' }}>+ Promotion</button>}
                </div>
                {projectPromotions.length === 0 && <div style={{ fontSize:11, color:'#999', padding:'4px 0' }}>None added</div>}
                {projectPromotions.map(function(prm, i){
                  var isOn = prm.enabled !== false;
                  return <div key={prm.id} style={{ padding:'6px 0', borderBottom:'1px dashed #eee', fontSize:12, opacity: isOn ? 1 : 0.5 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <button onClick={function(){ setProjectPromotions(function(prev){ var n=[...prev]; n[i]={...n[i], enabled: !isOn}; return n; }); }}
                        title={isOn ? 'Click to disable' : 'Click to enable'}
                        style={{ width:42, height:20, padding:0, border:'1px solid '+(isOn ? '#22C55E' : '#bbb'), borderRadius:10, background: isOn ? '#22C55E' : '#e8e8e8', cursor:'pointer', position:'relative', flexShrink:0 }}>
                        <span style={{ position:'absolute', top:1, left: isOn ? 22 : 1, width:16, height:16, borderRadius:'50%', background:'white', boxShadow:'0 1px 2px rgba(0,0,0,0.2)', transition:'left 0.15s' }}/>
                        <span style={{ position:'absolute', top:3, left: isOn ? 5 : 21, fontSize:8, fontWeight:700, color: isOn ? 'white' : '#888', letterSpacing:0.3 }}>{isOn ? 'ON' : 'OFF'}</span>
                      </button>
                      <input value={prm.name} onChange={function(e){ var v=e.target.value; setProjectPromotions(function(prev){ var n=[...prev]; n[i]={...n[i], name:v}; return n; }); }} style={{ flex:1, padding:'3px 6px', border:'1px solid #e0e0e0', borderRadius:3, fontSize:11 }}/>
                      <select value={prm.kind} onChange={function(e){ var v=e.target.value; setProjectPromotions(function(prev){ var n=[...prev]; n[i]={...n[i], kind:v}; return n; }); }} style={{ padding:'3px 4px', border:'1px solid '+T.border, borderRadius:3, fontSize:11 }}>
                        <option value="pct">% off</option>
                        <option value="fixed">$ off</option>
                      </select>
                      <input type="number" step="0.01" value={prm.amount} onChange={function(e){ var v=+e.target.value; setProjectPromotions(function(prev){ var n=[...prev]; n[i]={...n[i], amount:v}; return n; }); }} style={{ width:70, padding:'3px 6px', border:'1px solid '+T.border, borderRadius:3, fontSize:11, fontFamily:'monospace', textAlign:'right' }}/>
                      <span style={{ fontSize:10, color:'#666', minWidth:14 }}>{prm.kind === 'pct' ? '%' : '$'}</span>
                      {!isReadOnly && <button onClick={function(){ setProjectPromotions(function(prev){ return prev.filter(function(_,j){return j!==i;}); }); }} style={{ width:20, height:20, border:'none', background:'transparent', color:'#c00', cursor:'pointer', fontSize:14 }} title="Remove">×</button>}
                    </div>
                    <div style={{ display:'flex', gap:10, marginTop:4, fontSize:10, color:'#666' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:3, cursor:'pointer' }}>
                        <input type="checkbox" checked={prm.applyFrames !== false} onChange={function(e){ var v=e.target.checked; setProjectPromotions(function(prev){ var n=[...prev]; n[i]={...n[i], applyFrames:v}; return n; }); }}/>Frames
                      </label>
                      <label style={{ display:'flex', alignItems:'center', gap:3, cursor:'pointer' }}>
                        <input type="checkbox" checked={prm.applyInstall !== false} onChange={function(e){ var v=e.target.checked; setProjectPromotions(function(prev){ var n=[...prev]; n[i]={...n[i], applyInstall:v}; return n; }); }}/>Installation
                      </label>
                      <label style={{ display:'flex', alignItems:'center', gap:3, cursor:'pointer' }}>
                        <input type="checkbox" checked={prm.applyAncillaries !== false} onChange={function(e){ var v=e.target.checked; setProjectPromotions(function(prev){ var n=[...prev]; n[i]={...n[i], applyAncillaries:v}; return n; }); }}/>Ancillaries (only discountable)
                      </label>
                    </div>
                  </div>;
                })}
              </div>

              {/* Total — CALCULATED */}
              <div style={{ borderTop:'2px solid #333', paddingTop:12, marginTop:16 }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>Total</div>
                {(function() {
                  var selPl = appSettings.pricingConfig.markups.priceLists.find(function(p){return p.id===selectedPriceList}) || appSettings.pricingConfig.markups.priceLists[0];
                  var pid = selPl ? selPl.id : null;
                  // framesGross = factory portion at the selected price-list markup.
                  // installTotal = install portion at the same markup (NOT raw install).
                  // Together they sum to priceLists[id] for each frame; the costTotal
                  // row shows unmarked-up factory cost for margin visibility.
                  var framesGross = 0; var costTotal = 0; var installTotal = 0;
                  projectItems.forEach(function(f) {
                    try {
                      var fp = calculateFramePrice(f, appSettings.pricingConfig);
                      var framePortion   = (pid && fp.priceListsFactory && fp.priceListsFactory[pid])
                                         || fp.costPrice || 0;
                      var installPortion = (pid && fp.priceListsInstall && fp.priceListsInstall[pid])
                                         || 0;
                      framesGross  += framePortion;
                      installTotal += installPortion;
                      costTotal    += (fp.fullCost || fp.costPrice || 0);
                    } catch(e) {}
                  });
                  // Project ancillaries — split into discountable / non-discountable so
                  // a "20% off everything" promotion only applies to disc-marked lines.
                  var ancDisc = 0, ancNonDisc = 0;
                  projectAncillaries.forEach(function(a){
                    var amt = Number(a.amount) || 0;
                    if (a.disc !== false) ancDisc += amt; else ancNonDisc += amt;
                  });
                  var ancGross = ancDisc + ancNonDisc;
                  // Promotions: apply each to its toggled targets. Pct first (off the
                  // gross of selected targets), then fixed-$ off the remaining subtotal.
                  // Promotions with enabled === false are skipped entirely.
                  var promoBreakdown = []; var totalDiscount = 0;
                  projectPromotions.forEach(function(prm){
                    if (prm.enabled === false) return;
                    var base = 0;
                    if (prm.applyFrames !== false) base += framesGross;
                    if (prm.applyInstall !== false) base += installTotal;
                    if (prm.applyAncillaries !== false) base += ancDisc;
                    var d = prm.kind === 'pct' ? base * ((Number(prm.amount)||0) / 100) : Math.min(Number(prm.amount)||0, base);
                    totalDiscount += d;
                    promoBreakdown.push({
                      name: prm.name || 'Promo',
                      amount: d,
                      // Display label: "20% off" or "$50 off". For % we also show the effective $ rate.
                      label: prm.kind === 'pct' ? ((Number(prm.amount)||0) + '% off') : ('$' + (Number(prm.amount)||0).toFixed(2) + ' off'),
                    });
                  });
                  var subtotal = framesGross + installTotal + ancGross - totalDiscount;
                  if (subtotal < 0) subtotal = 0;
                  // Effective overall discount % = totalDiscount / pre-discount subtotal
                  var preDiscount = framesGross + installTotal + ancGross;
                  var effectivePct = preDiscount > 0 ? (totalDiscount / preDiscount * 100) : 0;
                  var gst = taxMode === 'gst' ? subtotal * 0.1 : 0;
                  var total = subtotal + gst;
                  return <React.Fragment>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'4px 0' }}>
                      <span>Frames ({selectedPriceList})</span><span style={{ fontWeight:600 }}>${framesGross.toFixed(2)}</span>
                    </div>
                    {installTotal > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'2px 0' }}>
                      <span>Installation</span><span>${installTotal.toFixed(2)}</span>
                    </div>}
                    {ancGross > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'2px 0' }}>
                      <span>Ancillaries</span><span>${ancGross.toFixed(2)}</span>
                    </div>}
                    {promoBreakdown.map(function(p, i){ return <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0', color:'#c41230' }}>
                      <span>− {p.name} ({p.label})</span><span>−${p.amount.toFixed(2)}</span>
                    </div>; })}
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0', color:'#888' }}>
                      <span>Cost price</span><span>${costTotal.toFixed(2)}</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'2px 0', color:'#888' }}>
                      <span>Margin</span><span>${(subtotal-costTotal).toFixed(2)} ({subtotal>0?((subtotal-costTotal)/subtotal*100).toFixed(1):0}%)</span>
                    </div>
                    {taxMode === 'gst' && <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'4px 0', color:'#888' }}>
                      <span>GST 10%</span><span>${gst.toFixed(2)}</span>
                    </div>}
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:700, padding:'8px 0', borderTop:'1px solid #ccc', marginTop:4 }}>
                      <span>Total{taxMode==='gst'?' (inc GST)':''}</span><span>${total.toFixed(2)}</span>
                    </div>
                    {totalDiscount > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, padding:'4px 0', color:'#c41230', fontWeight:600 }}>
                      <span>Total discount applied</span><span>−${totalDiscount.toFixed(2)} ({effectivePct.toFixed(1)}%)</span>
                    </div>}
                  </React.Fragment>;
                })()}
              </div>
            </div>
            {/* ─── Price Panel footer: action buttons ──────────────────────── */}
            {/* Finalise & Send (spec §6.3), Export Cut-List (spec §7.6), Check Measure entry point (handoff TODO) */}
            <div style={{ padding:'12px 20px', borderTop:'1px solid #e8e8e8', display:'flex', flexDirection:'column', gap:8, background:'#fafafa' }}>
              {/* Finalise & Send */}
              <button
                onClick={function(){
                  if (!projectItems.length) { alert('Add at least one frame before finalising.'); return; }
                  setFinaliseResult(null); // clear any previous result so modal opens in form state
                  setShowFinaliseModal(true);
                }}
                disabled={projectItems.length === 0}
                style={{
                  padding:'10px 14px', fontSize:13, fontWeight:600,
                  background: projectItems.length === 0 ? '#ccc' : '#111',
                  color:'#fff', border:'none', borderRadius:4,
                  cursor: projectItems.length === 0 ? 'not-allowed' : 'pointer',
                  fontFamily:'inherit',
                }}
                title="Generate PDF and send for customer signature"
              >Finalise & Send for Signature →</button>
              {/* Secondary actions */}
              <div style={{ display:'flex', gap:8 }}>
                <button
                  onClick={async function(){
                    if (!projectItems.length) { alert('No frames to export.'); return; }
                    try {
                      var wb = generateCutListXlsxWorkbook(projectItems, appSettings.pricingConfig, selectedPriceList, projectName, measurementsByFrameId, appSettings);
                      // Immediate local download for the user
                      var fname = 'cutlist-' + (projectName || 'project').replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-' + new Date().toISOString().slice(0,10) + '.xlsx';
                      XLSX.writeFile(wb, fname);
                      // Also upload to storage if we have a design
                      if (crmLink && crmLink.design) {
                        var blob = writeCutListXlsxBlob(wb);
                        var url = await uploadCutListXlsx(crmLink.design.id, blob);
                        if (url) {
                          // Update local crmLink so UI reflects the new cut_list_url
                          setCrmLink(Object.assign({}, crmLink, {
                            design: Object.assign({}, crmLink.design, { cut_list_url: url }),
                          }));
                        }
                      }
                    } catch (e) {
                      alert('Cut-list export failed: ' + (e && e.message || String(e)));
                    }
                  }}
                  disabled={projectItems.length === 0}
                  style={{
                    flex:1, padding:'8px 12px', fontSize:12, fontWeight:500,
                    background:'#fff', color:'#333', border:'1px solid #ccc', borderRadius:4,
                    cursor: projectItems.length === 0 ? 'not-allowed' : 'pointer',
                    fontFamily:'inherit',
                    opacity: projectItems.length === 0 ? 0.5 : 1,
                  }}
                  title="Download XLSX cut-list grouped by component category"
                >📋 Export Cut-List</button>
                {/* Check Measure entry point (handoff §2) — only shown if we have a design linked */}
                {crmLink && crmLink.design && <button
                  onClick={async function(){
                    setShowPricePanel(false);
                    // Create/load the CM row if we don't already have one
                    if (!checkMeasure) {
                      var cmRow = await loadOrCreateCheckMeasure(crmLink.design.id, crmLink.type, crmLink.id);
                      if (cmRow) setCheckMeasure(cmRow);
                    }
                    setCurrentView('check_measure');
                  }}
                  style={{
                    flex:1, padding:'8px 12px', fontSize:12, fontWeight:500,
                    background:'#fff', color:'#333', border:'1px solid #ccc', borderRadius:4,
                    cursor:'pointer', fontFamily:'inherit',
                  }}
                  title="Open the check-measure workflow for this design"
                >📏 Check Measure</button>}
              </div>
              {/* Link to previously-uploaded cut-list if present */}
              {crmLink && crmLink.design && crmLink.design.cut_list_url && <div style={{ fontSize:10, color:'#666', textAlign:'center', paddingTop:2 }}>
                Last cut-list: <a href={crmLink.design.cut_list_url} target="_blank" rel="noopener noreferrer" style={{ color:'#0066cc' }}>download ↗</a>
              </div>}
            </div>
          </div>
          <div onClick={function(){setShowPricePanel(false)}} style={{ flex:1, background:'rgba(0,0,0,0.2)' }}/>
        </div>}
      </React.Fragment>}

      {/* ═══ FINALISE MODAL (spec §6.3) ═══════════════════════════════════════
          Triggered by "Finalise & Send" button in the Price Panel footer OR
          by URL mode=final on bootstrap. Generates a quote PDF, uploads it,
          creates a design_signatures row, and posts a send_signature_email
          event back to the CRM opener per spec §6.6. */}
      {!signingToken && showProjectInfo && (
        <ProjectInfoModal
          projectInfo={projectInfo}
          projectName={projectName}
          crmLink={crmLink}
          isReadOnly={isReadOnly}
          onClose={function(){ setShowProjectInfo(false); }}
          onSave={async function(next, opts){
            // Apply projectInfo update locally first — UX optimisation so the
            // header reflects the change immediately.
            setProjectInfo(function(prev){ return Object.assign({}, prev, next); });
            if (opts && opts.projectName) setProjectName(opts.projectName);

            // Opt-in back-propagation of the site address to the source CRM row.
            // Only attempted when the user checked the box AND we have both a
            // linked entity and Supabase configured. Errors surface as alerts
            // but don't block the local update.
            if (opts && opts.propagateAddress && crmLink && crmLink.type && crmLink.id && sbConfigured()) {
              try {
                var res = await updateEntityAddress(crmLink.type, crmLink.id, {
                  street:   next.address1,
                  suburb:   next.suburb,
                  state:    next.state,
                  postcode: next.postcode,
                });
                if (!res.ok && !res.noop) {
                  alert('Saved locally, but the CRM address update failed: ' +
                        ((res.error && res.error.message) || 'unknown error'));
                } else {
                  // Update the local entity snapshot so contactSnapshotFor
                  // returns the new values without a reload.
                  setCrmLink(function(prev){
                    if (!prev || !prev.entity) return prev;
                    var ent = Object.assign({}, prev.entity, {
                      street:   next.address1 || prev.entity.street,
                      suburb:   next.suburb   || prev.entity.suburb,
                      state:    next.state    || prev.entity.state,
                      postcode: next.postcode || prev.entity.postcode,
                    });
                    return Object.assign({}, prev, { entity: ent });
                  });
                }
              } catch (e) {
                alert('Saved locally, but the CRM address update threw: ' + (e && e.message || e));
              }
            }
            setShowProjectInfo(false);
          }}
        />
      )}

      {!signingToken && showFinaliseModal && (function(){
        // Local state via a ref since we want a simple form that doesn't need
        // to trigger re-renders of the whole tree. But for email/subject/body
        // controlled inputs we reach for finaliseRecipient etc. which are held
        // on the modal itself via React state below — so use a sub-component.
        return <FinaliseModal
          busy={finaliseBusy}
          result={finaliseResult}
          projectInfo={projectInfo}
          crmLink={crmLink}
          frameCount={projectItems.length}
          onClose={function(){
            setShowFinaliseModal(false);
            // Don't wipe finaliseResult — keep it so re-opening shows the last
            // signing URL without re-sending.
          }}
          onSend={async function(recipientEmail, subject, body) {
            // Guard: need frames, need a design, need Supabase.
            if (!projectItems.length) { alert('Add at least one frame before finalising.'); return; }
            if (!crmLink || !crmLink.design) {
              alert('CAD is running standalone — finalisation needs a CRM-linked design. Open this design from the CRM to send for signature.');
              return;
            }
            if (!sbConfigured()) { alert('Supabase is not configured — check Settings → CRM Connection.'); return; }

            setFinaliseBusy(true);
            try {
              // 1. Generate PDF
              var blob = generateFinalisePdfBlob({
                projectName: projectName,
                projectInfo: projectInfo,
                projectItems: projectItems,
                pricingConfig: appSettings.pricingConfig,
                selectedPriceList: selectedPriceList,
                taxMode: taxMode,
                checkMeasure: checkMeasure,
                projectAncillaries: projectAncillaries,
                projectPromotions: projectPromotions,
                entityRef: (crmLink.type || '').toUpperCase() + ' ' + (crmLink.id || ''),
              });

              // 2. Upload to cad-signatures
              var pdfUrl = await uploadFinalisePdf(crmLink.design.id, blob);
              if (!pdfUrl) {
                alert('PDF upload failed — please check your connection and try again.');
                setFinaliseBusy(false);
                return;
              }

              // 3. Create signature request DB row. Resolve the currently
              //    authenticated user (if any) to populate the audit trail
              //    on the signatures row. Falls back to null silently if
              //    the session has expired or auth isn't used.
              var currentUserId = null;
              try {
                var sbc = sb();
                if (sbc && sbc.auth && typeof sbc.auth.getUser === 'function') {
                  var userRes = await sbc.auth.getUser();
                  currentUserId = (userRes && userRes.data && userRes.data.user && userRes.data.user.id) || null;
                }
              } catch(_authErr) { currentUserId = null; }
              var sigRes = await createSignatureRequest(
                crmLink.design.id, crmLink.type, crmLink.id,
                recipientEmail, pdfUrl, currentUserId
              );
              if (!sigRes.ok) {
                alert('Signature request failed: ' + (sigRes.error && sigRes.error.message || 'unknown error'));
                setFinaliseBusy(false);
                return;
              }

              // v2.0: legacy `design_finalised`, `signature_sent`, and
              // `send_signature_email` outbound notifications removed.
              // The CRM↔CAD surface is now `spartan-cad-*` protocol only;
              // finalise status reaches the CRM via the next spartan-cad-save
              // payload (see handleCrmMessage). DocuSign/email dispatch is
              // CRM-side per CRM spec §9.

              // 5. Reflect the design status change in local crmLink so the
              // autosave doesn't immediately flip it back.
              setCrmLink(Object.assign({}, crmLink, {
                design: Object.assign({}, crmLink.design, { status: 'awaiting_signature', stage: 'final' }),
              }));

              setFinaliseResult({
                signatureId: sigRes.signatureId,
                signingUrl: sigRes.signingUrl,
                pdfUrl: pdfUrl,
                recipient: recipientEmail,
              });
            } catch (e) {
              alert('Finalisation failed: ' + (e && e.message || String(e)));
            } finally {
              setFinaliseBusy(false);
            }
          }}
        />;
      })()}

      {/* ═══ SIGNING PAGE ROUTE (standalone, anonymous) ═══════════════════════
          When ?sign=<token> is present, we render only the signing page and
          skip the whole CAD dashboard / editor. Per spec §6.5. */}
      {signingToken && <SigningPage
        token={signingToken}
        signature={signatureRecord}
        busy={signatureBusy}
        onSubmit={async function(typedName, signatureDataUrl) {
          setSignatureBusy(true);
          var res = await submitSignature(signingToken, typedName, signatureDataUrl);
          setSignatureBusy(false);
          if (res.ok) {
            setSignatureRecord(Object.assign({}, signatureRecord, res.signature || {
              status: 'signed', signed_name: typedName, signature_data: signatureDataUrl,
              signed_at: new Date().toISOString(),
            }));
          } else {
            alert('Signing failed: ' + (res.error && res.error.message || 'please try again'));
          }
        }}
      />}

      {/* ═══ CHECK-MEASURE VIEW ═══════════════════════════════════════════════
          Shown when URL mode === 'check_measure' OR user clicks the "Check
          Measure" button. Renders the per-frame CM form + overall install
          planning form + completion handoff. Autosave on every field blur. */}
      {!signingToken && currentView === 'check_measure' && (function(){
        var planning = autoCalcInstallPlanning(projectItems, appSettings);
        var cm = checkMeasure || {
          crewSizeRequired: planning.crewSizeRequired,
          liftingGearRequired: planning.liftingGearRequired,
          scaffoldRequired: planning.scaffoldRequired,
          craneRequired: planning.craneRequired,
          estimatedInstallDays: planning.estimatedInstallDays,
          earliestInstallDate: '', customerPreferredDate: '',
          parkingNotes: '', deliveryAccessNotes: '',
          siteNotes: '', overallHazards: '', photoUrls: [], completed: false,
        };
        var totalFrames = projectItems.length;
        var confirmedFrames = projectItems.filter(function(f){ return f.cmConfirmed; }).length;
        var missingRequired = projectItems.filter(function(f){
          return !f.cmConfirmed || !f.cmWidthMm || !f.cmHeightMm || !f.accessMethod || !f.surroundType || !f.revealType || f.weightKg == null;
        });
        var canComplete = totalFrames > 0 && missingRequired.length === 0 && cm.earliestInstallDate;
        var designDraft = crmLink && crmLink.design && crmLink.design.stage === 'design' && crmLink.design.status === 'draft';

        function patchFrame(id, patch) {
          setProjectItems(function(prev){
            return prev.map(function(f){ return f.id === id ? Object.assign({}, f, patch) : f; });
          });
        }
        function patchCm(patch) {
          setCheckMeasure(function(prev){ return Object.assign({}, prev || cm, patch); });
        }
        async function autosaveCm() {
          if (!crmLink || !crmLink.design) return;
          var merged = Object.assign({}, cm,
                                     { designId: crmLink.design.id, entityType: crmLink.type, entityId: crmLink.id });
          setCmSaving(true);
          var res = await saveCheckMeasure(merged);
          setCmSaving(false);
          if (res.ok) setCmLastSavedAt(new Date());
        }
        async function onCompleteClick() {
          if (!canComplete) {
            alert('Cannot complete — ' + missingRequired.length + ' frame(s) have missing required fields.');
            return;
          }
          if (!confirm('Complete check measure? This will advance the job status and notify the CRM.')) return;
          var merged = Object.assign({}, cm,
                                     { designId: crmLink.design.id, entityType: crmLink.type, entityId: crmLink.id,
                                       completed: true });
          // Persist CM itself
          var res = await completeCheckMeasure(merged, crmLink.design.id, crmLink.type, crmLink.id);
          if (res.ok) {
            setCheckMeasure(merged);
            setCrmLink(function(p){ return Object.assign({}, p, { design: Object.assign({}, p.design, { status: 'check_measured', stage: 'check_measure' }) }); });
            // v2.0: legacy `check_measure_completed` notification removed.
            // CM completion reaches CRM via the next spartan-cad-save.
            alert('Check measure completed. The CRM has been notified.' + (res.offline ? ' (Changes queued — will sync when online.)' : ''));
          } else {
            alert('Failed to complete: ' + (res.error && res.error.message || 'unknown error'));
          }
        }

        return <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: '#f5f5f4', display: 'flex', flexDirection: 'column' }}>
          {/* Header bar */}
          <div style={{ padding: '16px 24px', background: '#1e293b', color: 'white', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '3px solid #c41230' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, letterSpacing: 1.5, opacity: 0.6, marginBottom: 2 }}>CHECK MEASURE</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{projectName}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                {crmLink && crmLink.entity ? ((crmLink.type || '').toUpperCase() + ' · ' + (crmLink.entity.title || crmLink.id)) : 'Standalone'}
                {' · '}{confirmedFrames}/{totalFrames} frames confirmed
              </div>
            </div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>
              {cmSaving ? <span>Saving…</span> :
                cmLastSavedAt ? <span>Saved {cmLastSavedAt.toLocaleTimeString()}</span> :
                <span>Not yet saved</span>}
            </div>
            <button onClick={function(){ setCurrentView('dashboard'); }}
              style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: 4, padding: '6px 12px', fontSize: 11, cursor: 'pointer' }}>
              Exit CM
            </button>
          </div>

          {/* Mode-mismatch warning per spec §9.5 */}
          {designDraft && <div style={{ padding: '10px 24px', background: '#fef3c7', color: '#92400e', fontSize: 12, borderBottom: '1px solid #fcd34d' }}>
            ⚠ This design is still a draft. You should normally finalise the design before check measuring.
            <button onClick={function(){ setCurrentView('dashboard'); }} style={{ marginLeft: 12, background: 'transparent', border: '1px solid #92400e', color: '#92400e', padding: '2px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
              Switch to design mode
            </button>
          </div>}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, padding: 16, flex: 1, minHeight: 0 }}>

            {/* LEFT: Per-frame CM form */}
            <div style={{ overflow: 'auto' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#111' }}>Per-frame confirmation</div>
              {projectItems.length === 0 && <div style={{ padding: 24, background: 'white', borderRadius: 6, textAlign: 'center', color: '#666' }}>
                This design has no frames. Return to design mode to add frames before check measuring.
              </div>}
              {projectItems.map(function(f) {
                var expanded = cmExpandedFrame === f.id;
                var missing = !f.cmConfirmed || !f.cmWidthMm || !f.cmHeightMm || !f.accessMethod || !f.surroundType || !f.revealType || f.weightKg == null;
                var defaultWeight = 0;
                try {
                  var pc = (appSettings.pricingConfig || {});
                  defaultWeight = calcFrameWeightKg(calculateFramePrice(f, pc));
                } catch (e) { defaultWeight = 0; }
                var widthDelta = f.cmWidthMm ? (+f.cmWidthMm - f.width) : 0;
                var heightDelta = f.cmHeightMm ? (+f.cmHeightMm - f.height) : 0;

                return <div key={f.id} style={{ background: 'white', borderRadius: 6, marginBottom: 8, border: '1px solid '+(missing ? '#fca5a5' : '#d1d5db') }}>
                  <div onClick={function(){ setCmExpandedFrame(expanded ? null : f.id); }}
                    style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', gap: 10 }}>
                    <div style={{ color: '#888', fontSize: 12, width: 14 }}>{expanded ? '▾' : '▸'}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                      {f.name}
                      <span style={{ color: '#666', fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                        {f.productType.replace(/_/g, ' ')} · {f.width}×{f.height} · {f.room || 'no room'}
                      </span>
                    </div>
                    {f.cmConfirmed
                      ? <span style={{ fontSize: 10, color: '#065f46', background: '#d1fae5', padding: '2px 8px', borderRadius: 3 }}>CONFIRMED</span>
                      : missing && <span style={{ fontSize: 10, color: '#991b1b', background: '#fee2e2', padding: '2px 8px', borderRadius: 3 }}>MISSING INFO</span>}
                  </div>

                  {expanded && <div style={{ padding: '0 14px 14px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', fontSize: 12 }}>
                    <div style={{ gridColumn: '1 / 3', fontSize: 11, color: '#666', marginTop: 4 }}>
                      Design: {f.width} × {f.height}mm. Confirm on-site measurements below.
                    </div>
                    <label>Confirmed width (mm) <span style={{ color: '#c41230' }}>*</span>
                      <input type="number" value={f.cmWidthMm || ''} placeholder={String(f.width)}
                        onChange={function(e){ patchFrame(f.id, { cmWidthMm: e.target.value ? +e.target.value : null }); }}
                        onBlur={autosaveCm}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}/>
                      {widthDelta !== 0 && <span style={{ fontSize: 10, color: Math.abs(widthDelta) > 5 ? '#c41230' : '#666' }}>Δ {widthDelta > 0 ? '+' : ''}{widthDelta}mm vs design</span>}
                    </label>
                    <label>Confirmed height (mm) <span style={{ color: '#c41230' }}>*</span>
                      <input type="number" value={f.cmHeightMm || ''} placeholder={String(f.height)}
                        onChange={function(e){ patchFrame(f.id, { cmHeightMm: e.target.value ? +e.target.value : null }); }}
                        onBlur={autosaveCm}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}/>
                      {heightDelta !== 0 && <span style={{ fontSize: 10, color: Math.abs(heightDelta) > 5 ? '#c41230' : '#666' }}>Δ {heightDelta > 0 ? '+' : ''}{heightDelta}mm vs design</span>}
                    </label>
                    <label>Weight (kg) <span style={{ color: '#c41230' }}>*</span>
                      <input type="number" step="0.1" value={f.weightKg == null ? '' : f.weightKg}
                        placeholder={defaultWeight ? defaultWeight.toFixed(1) : ''}
                        onChange={function(e){ patchFrame(f.id, { weightKg: e.target.value === '' ? null : +e.target.value }); }}
                        onBlur={autosaveCm}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}/>
                      <span style={{ fontSize: 10, color: '#666' }}>Calc'd: {defaultWeight.toFixed(1)} kg — feeds crew size</span>
                    </label>
                    <label>Floor level
                      <input type="number" min="0" value={f.floorLevel == null ? 0 : f.floorLevel}
                        onChange={function(e){ patchFrame(f.id, { floorLevel: +e.target.value }); }}
                        onBlur={autosaveCm}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}/>
                    </label>
                    <label>Access method <span style={{ color: '#c41230' }}>*</span>
                      <select value={f.accessMethod || ''}
                        onChange={function(e){ patchFrame(f.id, { accessMethod: e.target.value || null }); }}
                        onBlur={autosaveCm}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}>
                        <option value="">— Select —</option>
                        <option value="ground">Ground</option>
                        <option value="ladder">Ladder</option>
                        <option value="scaffold">Scaffold</option>
                        <option value="scissor_lift">Scissor lift</option>
                        <option value="crane">Crane</option>
                      </select>
                    </label>
                    <label>Surround type <span style={{ color: '#c41230' }}>*</span>
                      <select value={f.surroundType || ''}
                        onChange={function(e){ patchFrame(f.id, { surroundType: e.target.value || null }); }}
                        onBlur={autosaveCm}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}>
                        <option value="">— Select —</option>
                        <option value="brick">Brick</option>
                        <option value="timber">Timber</option>
                        <option value="cladding">Cladding</option>
                        <option value="render">Render</option>
                      </select>
                    </label>
                    <label>Reveal type <span style={{ color: '#c41230' }}>*</span>
                      <select value={f.revealType || ''}
                        onChange={function(e){ patchFrame(f.id, { revealType: e.target.value || null }); }}
                        onBlur={autosaveCm}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}>
                        <option value="">— Select —</option>
                        <option value="timber">Timber</option>
                        <option value="aluminium">Aluminium</option>
                        <option value="none">None</option>
                      </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 18 }}>
                      <input type="checkbox" checked={!!f.flashing}
                        onChange={function(e){ patchFrame(f.id, { flashing: e.target.checked }); }}
                        onBlur={autosaveCm}/>
                      Flashing required
                    </label>
                    <label style={{ gridColumn: '1 / 3' }}>Site hazards / notes
                      <textarea rows={2} value={f.siteHazards || ''}
                        onChange={function(e){ patchFrame(f.id, { siteHazards: e.target.value }); }}
                        onBlur={autosaveCm}
                        placeholder="e.g. power lines close, pool access restriction, fragile garden"
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2, fontFamily: 'inherit' }}/>
                    </label>
                    <label style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: f.cmConfirmed ? '#d1fae5' : '#f3f4f6', borderRadius: 3, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!f.cmConfirmed}
                        onChange={function(e){ patchFrame(f.id, { cmConfirmed: e.target.checked }); autosaveCm(); }}/>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Confirm this frame — measurements verified on site</span>
                    </label>
                  </div>}
                </div>;
              })}
            </div>

            {/* RIGHT: Overall install planning + photos + completion */}
            <div style={{ overflow: 'auto' }}>
              <div style={{ background: 'white', borderRadius: 6, padding: 16, border: '1px solid #d1d5db' }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Install planning</div>
                <div style={{ fontSize: 11, color: '#666', marginBottom: 12 }}>
                  Auto-calculated from frame data. Override if needed.
                </div>

                <div style={{ display: 'grid', gap: 10, fontSize: 12 }}>
                  <label>Crew size required
                    <select value={cm.crewSizeRequired || planning.crewSizeRequired}
                      onChange={function(e){ patchCm({ crewSizeRequired: +e.target.value }); }}
                      onBlur={autosaveCm}
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}>
                      <option value="1">1 person</option>
                      <option value="2">2 people</option>
                      <option value="3">3 people</option>
                    </select>
                    <span style={{ fontSize: 10, color: '#666' }}>Auto: {planning.crewSizeRequired} (max frame {planning.maxWeightKg} kg)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={cm.liftingGearRequired}
                      onChange={function(e){ patchCm({ liftingGearRequired: e.target.checked }); autosaveCm(); }}/>
                    Lifting gear required
                    <span style={{ fontSize: 10, color: '#666', marginLeft: 'auto' }}>Auto: {planning.liftingGearRequired ? 'Yes' : 'No'}</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={cm.scaffoldRequired}
                      onChange={function(e){ patchCm({ scaffoldRequired: e.target.checked }); autosaveCm(); }}/>
                    Scaffold required
                    <span style={{ fontSize: 10, color: '#666', marginLeft: 'auto' }}>Auto: {planning.scaffoldRequired ? 'Yes' : 'No'}</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={cm.craneRequired}
                      onChange={function(e){ patchCm({ craneRequired: e.target.checked }); autosaveCm(); }}/>
                    Crane required
                    <span style={{ fontSize: 10, color: '#666', marginLeft: 'auto' }}>Auto: {planning.craneRequired ? 'Yes' : 'No'}</span>
                  </label>

                  <label>Estimated install days
                    <input type="number" step="0.5" min="0.5" value={cm.estimatedInstallDays || planning.estimatedInstallDays}
                      onChange={function(e){ patchCm({ estimatedInstallDays: +e.target.value }); }}
                      onBlur={autosaveCm}
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}/>
                    <span style={{ fontSize: 10, color: '#666' }}>Auto: {planning.estimatedInstallDays} day(s) from {planning.estimatedInstallHours}h</span>
                  </label>

                  <label>Earliest install date <span style={{ color: '#c41230' }}>*</span>
                    <input type="date" value={cm.earliestInstallDate || ''}
                      onChange={function(e){ patchCm({ earliestInstallDate: e.target.value }); }}
                      onBlur={autosaveCm}
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}/>
                  </label>

                  <label>Customer preferred date
                    <input type="date" value={cm.customerPreferredDate || ''}
                      onChange={function(e){ patchCm({ customerPreferredDate: e.target.value }); }}
                      onBlur={autosaveCm}
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2 }}/>
                  </label>

                  <label>Parking notes
                    <textarea rows={2} value={cm.parkingNotes}
                      onChange={function(e){ patchCm({ parkingNotes: e.target.value }); }}
                      onBlur={autosaveCm}
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2, fontFamily: 'inherit' }}/>
                  </label>

                  <label>Delivery access notes
                    <textarea rows={2} value={cm.deliveryAccessNotes}
                      onChange={function(e){ patchCm({ deliveryAccessNotes: e.target.value }); }}
                      onBlur={autosaveCm}
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2, fontFamily: 'inherit' }}/>
                  </label>

                  <label>Site notes
                    <textarea rows={2} value={cm.siteNotes}
                      onChange={function(e){ patchCm({ siteNotes: e.target.value }); }}
                      onBlur={autosaveCm}
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2, fontFamily: 'inherit' }}/>
                  </label>

                  <label>Overall hazards
                    <textarea rows={2} value={cm.overallHazards}
                      onChange={function(e){ patchCm({ overallHazards: e.target.value }); }}
                      onBlur={autosaveCm}
                      placeholder="If non-empty, triggers SWMS"
                      style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 3, marginTop: 2, fontFamily: 'inherit' }}/>
                  </label>
                </div>

                {/* Photo upload */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Site photos</div>
                  <input type="file" accept="image/*" multiple
                    onChange={async function(e){
                      var files = Array.from(e.target.files || []);
                      if (!files.length || !crmLink || !crmLink.design) return;
                      setCmSaving(true);
                      var newUrls = [];
                      for (var i = 0; i < files.length; i++) {
                        var url = await uploadCheckMeasurePhoto(crmLink.design.id, files[i]);
                        if (url) newUrls.push(url);
                      }
                      var next = (cm.photoUrls || []).concat(newUrls);
                      patchCm({ photoUrls: next });
                      await saveCheckMeasure(Object.assign({}, cm, { photoUrls: next,
                        designId: crmLink.design.id, entityType: crmLink.type, entityId: crmLink.id }));
                      setCmSaving(false);
                      setCmLastSavedAt(new Date());
                      e.target.value = '';
                    }}
                    style={{ fontSize: 11 }}/>
                  {(cm.photoUrls || []).length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
                    {cm.photoUrls.map(function(url, i){
                      return <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 3 }} alt={'CM photo '+(i+1)}/>
                      </a>;
                    })}
                  </div>}
                </div>
              </div>

              {/* Complete button */}
              <div style={{ marginTop: 12, background: 'white', borderRadius: 6, padding: 14, border: '1px solid #d1d5db' }}>
                {!canComplete && <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 8 }}>
                  {missingRequired.length > 0 && <div>· {missingRequired.length} frame(s) missing required fields</div>}
                  {!cm.earliestInstallDate && <div>· Earliest install date required</div>}
                </div>}
                <button onClick={onCompleteClick} disabled={!canComplete}
                  style={{ width: '100%', padding: '10px 12px', background: canComplete ? '#059669' : '#9ca3af',
                           color: 'white', border: 'none', borderRadius: 5, fontSize: 13, fontWeight: 600,
                           cursor: canComplete ? 'pointer' : 'not-allowed' }}>
                  Complete Check Measure
                </button>
                <div style={{ fontSize: 10, color: '#666', marginTop: 6, textAlign: 'center' }}>
                  Advances job status, updates Smart Planner, notifies CRM.
                </div>
              </div>
            </div>
          </div>
        </div>;
      })()}

      {/* ═══ QUOTATION VIEW (inline iframe preview) ═══ */}
      {!signingToken && currentView === 'quotation' && (function(){
        var selectedClient = CRM_CONTACTS.find(function(c){ return c.id === selectedClientId; });
        var clientName = selectedClient ? selectedClient.name : projectName;
        var priceListId = selectedPriceList || 'trade';
        var quoteHtml;
        try {
          quoteHtml = generateQuoteHTML({
            items: projectItems,
            appSettings: appSettings,
            projectName: projectName,
            quoteNumber: quoteNumber,
            clientName: clientName,
            priceListId: priceListId,
            logoSrc: SPARTAN_LOGO,
            projectAncillaries: projectAncillaries,
            projectPromotions: projectPromotions,
          });
        } catch(err) {
          quoteHtml = '<html><body style="font-family:sans-serif;padding:40px;"><h2>Quote generation failed</h2><pre>'+String(err.message||err)+'</pre></body></html>';
        }
        return <div style={{ position:'fixed', inset:0, background:'#1a1a1a', zIndex:9999, display:'flex', flexDirection:'column' }}>
          {/* Quotation toolbar */}
          <div style={{ height:50, background:'#0e0e0e', borderBottom:'3px solid #c41230', display:'flex', alignItems:'center', padding:'0 16px', gap:12, flexShrink:0 }}>
            <div onClick={function(){setCurrentView('dashboard')}} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'rgba(255,255,255,0.7)', fontSize:11, padding:'5px 10px', borderRadius:4, background:'rgba(255,255,255,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
              Back to Dashboard
            </div>
            <img src={SPARTAN_LOGO} alt="Spartan DG" style={{ height:38 }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <span style={{ color:'white', fontSize:10, fontWeight:700, letterSpacing:1.2 }}>SPARTAN <span style={{ fontWeight:400, opacity:0.4 }}>CAD</span></span>
              <span style={{ color:'rgba(255,255,255,0.45)', fontSize:8, letterSpacing:0.8 }}>QUOTATION PREVIEW</span>
            </div>
            <div style={{ width:1, height:24, background:'rgba(255,255,255,0.1)', margin:'0 4px' }}/>
            <span style={{ color:'white', fontSize:12, fontWeight:600 }}>{projectName}</span>
            <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10, marginLeft:4 }}>{projectItems.length} item{projectItems.length !== 1 ? 's' : ''}</span>
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={function(){
                try {
                  var iframe = document.getElementById('quote-iframe');
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                  } else { window.print(); }
                } catch(e) { window.print(); }
              }} style={{ background:'#c41230', border:'none', borderRadius:5, padding:'7px 16px', cursor:'pointer', color:'white', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print / Save PDF
              </button>
              <button onClick={function(){
                try {
                  var blob = new Blob([quoteHtml], { type:'text/html' });
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement('a');
                  a.href = url; a.download = (projectName || 'Quotation') + '.html';
                  a.click();
                  setTimeout(function(){ URL.revokeObjectURL(url); }, 100);
                } catch(e) { alert('Download failed: ' + e.message); }
              }} style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'7px 14px', cursor:'pointer', color:'white', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download HTML
              </button>
            </div>
          </div>
          {/* Iframe with the rendered quote — uses srcDoc so it's fully self-contained */}
          <iframe id="quote-iframe" srcDoc={quoteHtml} style={{ flex:1, border:'none', background:'#f0f0f0', width:'100%' }} title="Quotation Preview"/>
        </div>;
      })()}

      {/* ═══ 3D CAPTURE PROGRESS OVERLAY ═══ shown while ensureAllFrameCaptures runs */}
      {captureProgress && <div style={{ position:'fixed', inset:0, background:'rgba(10,10,15,0.88)', zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
        <div style={{ background:'#1a1a22', border:'1px solid #333', borderRadius:10, padding:'28px 40px', minWidth:360, textAlign:'center', boxShadow:'0 18px 60px rgba(0,0,0,0.55)' }}>
          <img src={SPARTAN_LOGO} alt="Spartan" style={{ height:44, marginBottom:16, opacity:0.9 }}/>
          <div style={{ color:'white', fontSize:13, fontWeight:600, marginBottom:6 }}>Generating 3D previews</div>
          <div style={{ color:'rgba(255,255,255,0.55)', fontSize:11, marginBottom:14 }}>{captureProgress.label}</div>
          <div style={{ height:5, background:'#2a2a36', borderRadius:3, overflow:'hidden', marginBottom:8 }}>
            <div style={{ height:'100%', background:'#c41230', borderRadius:3, width:((captureProgress.current / captureProgress.total) * 100) + '%', transition:'width 0.3s ease' }}/>
          </div>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:10 }}>{captureProgress.current} of {captureProgress.total}</div>
        </div>
      </div>}

      {/* ═══ CHECK MEASURE VIEW (inline iframe with fillable form) ═══ */}
      {currentView === 'checkmeasure' && (function(){
        var cmHtml;
        try {
          cmHtml = generateCheckMeasureHTML({
            items: projectItems,
            appSettings: appSettings,
            projectName: projectName,
            logoSrc: SPARTAN_LOGO,
          });
        } catch(err) {
          cmHtml = '<html><body style="font-family:sans-serif;padding:40px;"><h2>Check Measure generation failed</h2><pre>'+String(err.message||err)+'</pre></body></html>';
        }
        return <div style={{ position:'fixed', inset:0, background:'#1a1a1a', zIndex:9999, display:'flex', flexDirection:'column' }}>
          <div style={{ height:50, background:'#0e0e0e', borderBottom:'3px solid #c41230', display:'flex', alignItems:'center', padding:'0 16px', gap:12, flexShrink:0 }}>
            <div onClick={function(){setCurrentView('dashboard')}} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'rgba(255,255,255,0.7)', fontSize:11, padding:'5px 10px', borderRadius:4, background:'rgba(255,255,255,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
              Back to Dashboard
            </div>
            <img src={SPARTAN_LOGO} alt="Spartan DG" style={{ height:38 }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <span style={{ color:'white', fontSize:10, fontWeight:700, letterSpacing:1.2 }}>SPARTAN <span style={{ fontWeight:400, opacity:0.4 }}>CAD</span></span>
              <span style={{ color:'rgba(255,255,255,0.45)', fontSize:8, letterSpacing:0.8 }}>CHECK MEASURE (REPLACEMENT)</span>
            </div>
            <div style={{ width:1, height:24, background:'rgba(255,255,255,0.1)', margin:'0 4px' }}/>
            <span style={{ color:'white', fontSize:12, fontWeight:600 }}>{projectName}</span>
            <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10, marginLeft:4 }}>{projectItems.length} item{projectItems.length !== 1 ? 's' : ''}</span>
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={function(){
                try {
                  var iframe = document.getElementById('checkmeasure-iframe');
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                  } else { window.print(); }
                } catch(e) { window.print(); }
              }} style={{ background:'#c41230', border:'none', borderRadius:5, padding:'7px 16px', cursor:'pointer', color:'white', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print / Save PDF
              </button>
              <button onClick={function(){
                try {
                  // Grab the CURRENT iframe document (with filled-in values preserved)
                  var iframe = document.getElementById('checkmeasure-iframe');
                  var toSave = cmHtml;
                  if (iframe && iframe.contentDocument) {
                    // Serialize current iframe DOM so filled-in values are kept
                    toSave = '<!DOCTYPE html>' + iframe.contentDocument.documentElement.outerHTML;
                  }
                  var blob = new Blob([toSave], { type:'text/html' });
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement('a');
                  a.href = url; a.download = (projectName || 'CheckMeasure') + '-CheckMeasure.html';
                  a.click();
                  setTimeout(function(){ URL.revokeObjectURL(url); }, 100);
                } catch(e) { alert('Download failed: ' + e.message); }
              }} style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'7px 14px', cursor:'pointer', color:'white', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Filled Form
              </button>
            </div>
          </div>
          <iframe id="checkmeasure-iframe" srcDoc={cmHtml} style={{ flex:1, border:'none', background:'#f0f0f0', width:'100%' }} title="Check Measure Form"/>
        </div>;
      })()}

      {/* ═══ COMPLETION DOCUMENT VIEW (inline iframe with fillable form) ═══ */}
      {currentView === 'completion' && (function(){
        var cdHtml;
        try {
          cdHtml = generateCompletionDocumentHTML({
            items: projectItems,
            appSettings: appSettings,
            projectName: projectName,
            logoSrc: SPARTAN_LOGO,
          });
        } catch(err) {
          cdHtml = '<html><body style="font-family:sans-serif;padding:40px;"><h2>Completion Document generation failed</h2><pre>'+String(err.message||err)+'</pre></body></html>';
        }
        return <div style={{ position:'fixed', inset:0, background:'#1a1a1a', zIndex:9999, display:'flex', flexDirection:'column' }}>
          <div style={{ height:50, background:'#0e0e0e', borderBottom:'3px solid #c41230', display:'flex', alignItems:'center', padding:'0 16px', gap:12, flexShrink:0 }}>
            <div onClick={function(){setCurrentView('dashboard')}} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'rgba(255,255,255,0.7)', fontSize:11, padding:'5px 10px', borderRadius:4, background:'rgba(255,255,255,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
              Back to Dashboard
            </div>
            <img src={SPARTAN_LOGO} alt="Spartan DG" style={{ height:38 }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <span style={{ color:'white', fontSize:10, fontWeight:700, letterSpacing:1.2 }}>SPARTAN <span style={{ fontWeight:400, opacity:0.4 }}>CAD</span></span>
              <span style={{ color:'rgba(255,255,255,0.45)', fontSize:8, letterSpacing:0.8 }}>COMPLETION DOCUMENT / SERVICE</span>
            </div>
            <div style={{ width:1, height:24, background:'rgba(255,255,255,0.1)', margin:'0 4px' }}/>
            <span style={{ color:'white', fontSize:12, fontWeight:600 }}>{projectName}</span>
            <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10, marginLeft:4 }}>{projectItems.length} item{projectItems.length !== 1 ? 's' : ''}</span>
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={function(){
                try {
                  var iframe = document.getElementById('completion-iframe');
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                  } else { window.print(); }
                } catch(e) { window.print(); }
              }} style={{ background:'#c41230', border:'none', borderRadius:5, padding:'7px 16px', cursor:'pointer', color:'white', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print / Save PDF
              </button>
              <button onClick={function(){
                try {
                  // Serialize the CURRENT iframe DOM so filled-in values are preserved
                  var iframe = document.getElementById('completion-iframe');
                  var toSave = cdHtml;
                  if (iframe && iframe.contentDocument) {
                    toSave = '<!DOCTYPE html>' + iframe.contentDocument.documentElement.outerHTML;
                  }
                  var blob = new Blob([toSave], { type:'text/html' });
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement('a');
                  a.href = url; a.download = (projectName || 'Completion') + '-CompletionDocument.html';
                  a.click();
                  setTimeout(function(){ URL.revokeObjectURL(url); }, 100);
                } catch(e) { alert('Download failed: ' + e.message); }
              }} style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'7px 14px', cursor:'pointer', color:'white', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Filled Form
              </button>
            </div>
          </div>
          <iframe id="completion-iframe" srcDoc={cdHtml} style={{ flex:1, border:'none', background:'#f0f0f0', width:'100%' }} title="Completion Document"/>
        </div>;
      })()}

      {/* ═══ FINAL SIGN OFF VIEW (inline iframe with per-frame sign-off + agreement) ═══ */}
      {currentView === 'finalsignoff' && (function(){
        var fsoHtml;
        try {
          fsoHtml = generateFinalSignOffHTML({
            items: projectItems,
            appSettings: appSettings,
            projectName: projectName,
            logoSrc: SPARTAN_LOGO,
          });
        } catch(err) {
          fsoHtml = '<html><body style="font-family:sans-serif;padding:40px;"><h2>Final Sign Off generation failed</h2><pre>'+String(err.message||err)+'</pre></body></html>';
        }
        return <div style={{ position:'fixed', inset:0, background:'#1a1a1a', zIndex:9999, display:'flex', flexDirection:'column' }}>
          <div style={{ height:50, background:'#0e0e0e', borderBottom:'3px solid #c41230', display:'flex', alignItems:'center', padding:'0 16px', gap:12, flexShrink:0 }}>
            <div onClick={function(){setCurrentView('dashboard')}} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'rgba(255,255,255,0.7)', fontSize:11, padding:'5px 10px', borderRadius:4, background:'rgba(255,255,255,0.08)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
              Back to Dashboard
            </div>
            <img src={SPARTAN_LOGO} alt="Spartan DG" style={{ height:38 }}/>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <span style={{ color:'white', fontSize:10, fontWeight:700, letterSpacing:1.2 }}>SPARTAN <span style={{ fontWeight:400, opacity:0.4 }}>CAD</span></span>
              <span style={{ color:'rgba(255,255,255,0.45)', fontSize:8, letterSpacing:0.8 }}>FINAL SIGN OFF (REPLACEMENT)</span>
            </div>
            <div style={{ width:1, height:24, background:'rgba(255,255,255,0.1)', margin:'0 4px' }}/>
            <span style={{ color:'white', fontSize:12, fontWeight:600 }}>{projectName}</span>
            <span style={{ color:'rgba(255,255,255,0.45)', fontSize:10, marginLeft:4 }}>{projectItems.length} item{projectItems.length !== 1 ? 's' : ''}</span>
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <button onClick={function(){
                try {
                  var iframe = document.getElementById('finalsignoff-iframe');
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                  } else { window.print(); }
                } catch(e) { window.print(); }
              }} style={{ background:'#c41230', border:'none', borderRadius:5, padding:'7px 16px', cursor:'pointer', color:'white', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                Print / Save PDF
              </button>
              <button onClick={function(){
                try {
                  var iframe = document.getElementById('finalsignoff-iframe');
                  var toSave = fsoHtml;
                  if (iframe && iframe.contentDocument) {
                    toSave = '<!DOCTYPE html>' + iframe.contentDocument.documentElement.outerHTML;
                  }
                  var blob = new Blob([toSave], { type:'text/html' });
                  var url = URL.createObjectURL(blob);
                  var a = document.createElement('a');
                  a.href = url; a.download = (projectName || 'Project') + '-FinalSignOff.html';
                  a.click();
                  setTimeout(function(){ URL.revokeObjectURL(url); }, 100);
                } catch(e) { alert('Download failed: ' + e.message); }
              }} style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:5, padding:'7px 14px', cursor:'pointer', color:'white', fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Download Filled Form
              </button>
            </div>
          </div>
          <iframe id="finalsignoff-iframe" srcDoc={fsoHtml} style={{ flex:1, border:'none', background:'#f0f0f0', width:'100%' }} title="Final Sign Off"/>
        </div>;
      })()}

      {/* ═══ EDITOR VIEW (always mounted, hidden when dashboard) ═══ */}
      <div style={{ display: currentView === 'editor' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Editor Header */}
      <div style={{ height: 50, background: "#0e0e0e", display: "flex", alignItems: "center", padding: "0 14px", gap: 8, flexShrink: 0, borderBottom: "3px solid #c41230" }}>
        <div onClick={function(){returnToDashboard()}} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'rgba(255,255,255,0.6)', fontSize:11, marginRight:2, padding:'4px 8px', borderRadius:4, background:'rgba(255,255,255,0.06)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
          Back
        </div>
        <img src={SPARTAN_LOGO} alt="Spartan DG" style={{ height:38 }}/>
        <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
          <span style={{ color:'white', fontSize:10, fontWeight:700, letterSpacing:1.2 }}>SPARTAN <span style={{ fontWeight:400, opacity:0.4 }}>CAD</span></span>
          <span style={{ color:'rgba(255,255,255,0.3)', fontSize:7 }}>WINDOW & DOOR DESIGN</span>
        </div>
        <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.1)" }}/>
        <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 11 }}>{activeFrameIdx >= 0 && projectItems[activeFrameIdx] ? projectItems[activeFrameIdx].name + ' — ' : ''}{meta?.label}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}>{width} x {height}mm</span>
          <button onClick={() => setShowSettings(true)} style={{ background: "#c41230", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, color: "white", fontSize: 10, fontWeight: 600 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            Settings
          </button>
        </div>
      </div>

      {/* M5: LockToast render (spec §4.3). position:fixed — render-scope
          independent. Banner indicator deliberately not added: spec/contract
          require only padlock + toast, and the padlock on the dimension pill
          IS the lock indicator. If a future requirement wants a persistent
          mode banner, add it separately (not re-using the M4b survey banner
          pattern — that's container-scoped and visually heavier than needed). */}
      {lockToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(40,40,40,0.95)', color: 'white', padding: '10px 18px',
          borderRadius: 6, fontSize: 13, fontWeight: 500, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', maxWidth: '90vw', textAlign: 'center',
          pointerEvents: 'none'
        }}>
          🔒 {lockToast}
        </div>
      )}

      {/* Viewport */}
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%", cursor: "grab", display: viewMode === "3d" ? "block" : "none" }}/>
        {/* Dimension bubble overlay — circular pills projected from 3D */}
        {viewMode === "3d" && showDimensions && <div ref={dimOverlayRef} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "hidden" }}>
          {dimAnchors.map((anc, di) => (
            <div key={di} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "auto" }}>
              {editingDim && editingDim.axis === anc.axis && editingDim.idx === anc.idx ? (
                <input autoFocus type="number" defaultValue={anc.mm} style={{ width: 64, padding: "4px 6px", fontSize: 12, fontWeight: 700, fontFamily: "monospace", border: "2px solid #c41230", borderRadius: 20, textAlign: "center", outline: "none", background: "white" }}
                  onBlur={(e) => {
                    var val = parseInt(e.target.value);
                    if (!val || val < 50) { setEditingDim(null); return; }
                    // M5: belt-and-braces guard — if the field was locked after
                    // the input opened (e.g. crmInit arrived mid-edit), ignore
                    // the commit and surface the toast. Primary guard is the
                    // pill onClick below; this covers the init-race edge case.
                    if (anc.axis === 'total_w' && lockedFieldSet.has('widthMm')) { setEditingDim(null); showLockToast(); return; }
                    if (anc.axis === 'total_h' && lockedFieldSet.has('heightMm')) { setEditingDim(null); showLockToast(); return; }
                    // WIP10: bubbles now carry centerline-based dims. Convert
                    // back to the cell (zone) value before writing, then use
                    // the neighbour-compensating updater so the total is
                    // preserved.
                    if (anc.axis === 'w') {
                      var zVal = val;
                      if (gridCols > 1) {
                        if (anc.idx === 0 || anc.idx === gridCols - 1) zVal = val - mullionMm / 2;
                        else zVal = val - mullionMm;
                      }
                      updateZoneWidth(anc.idx, zVal);
                    }
                    else if (anc.axis === 'h') {
                      var zValH = val;
                      if (gridRows > 1) {
                        if (anc.idx === 0 || anc.idx === gridRows - 1) zValH = val - mullionMm / 2;
                        else zValH = val - mullionMm;
                      }
                      updateZoneHeight(anc.idx, zValH);
                    }
                    else if (anc.axis === 'total_w') { setWidth(val); }
                    else if (anc.axis === 'total_h') { setHeight(val); }
                    setEditingDim(null);
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingDim(null); }}
                />
              ) : (function() {
                // M5: per-field lock on outer W×H dimension pills (spec §4.3,
                // contract §4.4). Zone-axis pills (anc.axis 'w' / 'h') are
                // transom/mullion divisions and stay editable per contract
                // §4.4 ("transom/mullion positions MAY move within the locked
                // envelope"). Only 'total_w' / 'total_h' pills respect the
                // lock.
                var isOuterW = anc.axis === 'total_w';
                var isOuterH = anc.axis === 'total_h';
                var pillLocked = (isOuterW && lockedFieldSet.has('widthMm'))
                              || (isOuterH && lockedFieldSet.has('heightMm'));
                return (
                  <div onClick={() => { if (pillLocked) { showLockToast(); return; } setEditingDim({ axis: anc.axis, idx: anc.idx }); }} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 700, fontFamily: "monospace", background: pillLocked ? "#f5f5f5" : "white", border: "1.5px solid " + (pillLocked ? "#888" : "#aaa"), borderRadius: 20, cursor: pillLocked ? "not-allowed" : "pointer", boxShadow: "0 1px 6px rgba(0,0,0,0.15)", whiteSpace: "nowrap", userSelect: "none", color: pillLocked ? "#777" : "#333", minWidth: 48, textAlign: "center", opacity: pillLocked ? 0.85 : 1 }}>
                    {anc.mm}mm{pillLocked ? ' 🔒' : ''}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>}
        {viewMode === "2d" && (
          <div style={{ display: 'flex', width: '100%', height: '100%', background: T.bgPanel }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Schematic2D productType={productType} widthMm={width} heightMm={height} panelCount={panelCount} openingStyle={openStyle} transomPct={transomPct} colonialGrid={colonialGrid} cellTypes={cellTypes} zoneWidths={zoneWidths} zoneHeights={zoneHeights} pricingConfig={(appSettings && appSettings.pricingConfig) || null} profileOverrides={null}/>
            </div>
            <div style={{ width: 1, background: '#e0e0e0', flexShrink: 0 }}/>
            <div style={{ width: 340, flexShrink: 0, overflowY: 'auto', borderLeft: '1px solid #eee' }}>
              <CrossSection2D productType={productType} gridCols={gridCols} gridRows={gridRows}/>
            </div>
          </div>
        )}
        {/* WIP30: shift toolbar left by the cross-section panel width
            (340px + 10px gap) when in 2D mode so the buttons land over
            the schematic instead of overlapping the right-side panel. */}
        <div style={{ position: "absolute", top: 10, right: viewMode === "2d" ? 350 : 10, display: "flex", gap: 4, alignItems: "center" }}>
          <div style={{ display: "flex", background: dk ? "rgba(30,30,40,0.92)" : "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", borderRadius: 8, padding: 2, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", border: "1px solid " + T.border }}>
            {["3d", "2d"].map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{ padding: "5px 12px", fontSize: 10, fontWeight: 800, border: "none", borderRadius: 6, cursor: "pointer", background: viewMode === m ? T.accent : "transparent", color: viewMode === m ? "white" : T.textSub, transition: "all 0.15s", letterSpacing: 0.5 }}>{m.toUpperCase()}</button>
            ))}
          </div>
          <button onClick={() => setShowDimensions(!showDimensions)} style={{ padding: "5px 10px", fontSize: 10, fontWeight: 700, border: showDimensions ? "1.5px solid " + T.accent : "1px solid " + T.border, borderRadius: 8, cursor: "pointer", background: showDimensions ? (dk ? "rgba(196,18,48,0.15)" : "#fef2f2") : (dk ? "rgba(30,30,40,0.92)" : "rgba(255,255,255,0.92)"), backdropFilter: "blur(8px)", color: showDimensions ? T.accent : T.textSub, transition: "all 0.15s", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
            {showDimensions ? "⊞ Dims" : "⊞ Dims"}
          </button>
          <button onClick={() => { setShowLayoutPanel(true); setSelectedCell(null); }} title="Transoms, mullions, sashes" style={{ padding: "5px 10px", fontSize: 10, fontWeight: 700, border: showLayoutPanel ? "1.5px solid " + T.accent : "1px solid " + T.border, borderRadius: 8, cursor: "pointer", background: showLayoutPanel ? (dk ? "rgba(196,18,48,0.15)" : "#fef2f2") : (dk ? "rgba(30,30,40,0.92)" : "rgba(255,255,255,0.92)"), backdropFilter: "blur(8px)", color: showLayoutPanel ? T.accent : T.textSub, transition: "all 0.15s", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
            ⊟ Layout
          </button>
          <button onClick={() => { var sd = sceneData.current; if (sd.resetOrbit) sd.resetOrbit(); }} style={{ padding: "5px 10px", fontSize: 10, fontWeight: 700, border: "1px solid " + T.border, borderRadius: 8, cursor: "pointer", background: dk ? "rgba(30,30,40,0.92)" : "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", color: T.textSub, transition: "all 0.15s", boxShadow: "0 1px 6px rgba(0,0,0,0.08)" }}>
            ↺ Reset
          </button>
        </div>
        {/* WIP9 (revised): install-planning per-frame controls. Styled as a
            clearly-visible extension of the toolbar above — solid background,
            explicit labels, high z-index so WebGL canvas never covers them.
            Property type inherits from projectInfo on new / legacy frames;
            floor level defaults to ground.
            WIP30: hidden in 2D mode to avoid overlapping the right-side
            cross-section panel (340px). Install settings remain accessible
            via 3D mode and the per-frame overrides in the Price panel. */}
        {viewMode !== "2d" && <div style={{ position: "absolute", top: 50, right: 10, zIndex: 10, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: T.accent, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 1, paddingRight: 4 }}>Install</div>
          {/* WIP25: Installation type selector in the 3D viewport.
              Inherits project default on new frames; can be overridden per-frame.
              Property type + Floor selectors only appear for 'retrofit' — supply-only
              has no install, and new construction doesn't need existing-property context. */}
          <div style={{ background: dk ? "rgba(30,30,40,0.96)" : "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", borderRadius: 8, padding: "5px 8px", border: "1px solid " + T.border, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.textSub, letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 }}>Type</span>
            <select value={installationType}
                    onChange={function(e){ setInstallationType(e.target.value); }}
                    style={{ flex: 1, border: "1px solid " + T.border, background: dk ? "#2a2a3a" : "#fff", color: T.text, fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 6, outline: "none", cursor: "pointer" }}>
              {(typeof INSTALLATION_TYPES !== 'undefined' ? INSTALLATION_TYPES : []).map(function(p){
                return <option key={p.id} value={p.id}>{p.label}</option>;
              })}
            </select>
          </div>
          {installationType === 'retrofit' && <React.Fragment>
            <div style={{ background: dk ? "rgba(30,30,40,0.96)" : "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", borderRadius: 8, padding: "5px 8px", border: "1px solid " + T.border, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.textSub, letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 }}>Property</span>
              <select value={propertyType}
                      onChange={function(e){ setPropertyType(e.target.value); }}
                      style={{ flex: 1, border: "1px solid " + T.border, background: dk ? "#2a2a3a" : "#fff", color: T.text, fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 6, outline: "none", cursor: "pointer" }}>
                {(typeof PROPERTY_TYPES !== 'undefined' ? PROPERTY_TYPES : []).map(function(p){
                  return <option key={p.id} value={p.id}>{p.label}</option>;
                })}
              </select>
            </div>
            <div style={{ background: dk ? "rgba(30,30,40,0.96)" : "rgba(255,255,255,0.96)", backdropFilter: "blur(8px)", borderRadius: 8, padding: "5px 8px", border: "1px solid " + T.border, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 8, minWidth: 220 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.textSub, letterSpacing: 0.5, textTransform: "uppercase", flexShrink: 0 }}>Floor</span>
              <select value={floorLevel}
                      onChange={function(e){ setFloorLevel(Number(e.target.value)); }}
                      style={{ flex: 1, border: "1px solid " + T.border, background: dk ? "#2a2a3a" : "#fff", color: T.text, fontSize: 11, fontWeight: 600, padding: "3px 6px", borderRadius: 6, outline: "none", cursor: "pointer" }}>
                {(typeof FLOOR_LEVELS !== 'undefined' ? FLOOR_LEVELS : []).map(function(fl){
                  return <option key={fl.id} value={fl.n}>{fl.label}</option>;
                })}
              </select>
            </div>
          </React.Fragment>}
        </div>}

        {/* WIP27: Special-colour caution banner — shown when the current
            frame's exterior/interior colour combo falls outside Phoenix's
            "standard" set. Uses the global helper isStandardColourCombo.
            Positioned top-center so it's the first thing seen when editing
            a frame with a non-standard colour choice. */}
        {(function(){
          var check = (typeof isStandardColourCombo === 'function') ? isStandardColourCombo(colour, colourInt) : { standard: true };
          if (check.standard) return null;
          return <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 11,
                               background: "#fbbf24", color: "#78350f", padding: "8px 16px", borderRadius: 8,
                               fontSize: 11, fontWeight: 700, letterSpacing: 0.3, boxShadow: "0 2px 12px rgba(251,191,36,0.4)",
                               border: "2px solid #f59e0b", display: "flex", alignItems: "center", gap: 8, maxWidth: 560 }}
                      title={check.reason}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span>SPECIAL ORDER COLOUR</span>
            <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.85 }}>— CRM will be flagged. Check lead time + surcharge.</span>
          </div>;
        })()}
        <div style={{ position: "absolute", bottom: 10, left: 10, background: dk ? "rgba(20,20,30,0.92)" : "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", borderRadius: 8, padding: "5px 10px", fontSize: 11, fontFamily: "monospace", color: T.textSub, boxShadow: "0 1px 6px rgba(0,0,0,0.08)", border: "1px solid " + T.border, display: "flex", gap: 12 }}>
          <span>W: <b style={{ color: T.text }}>{width}</b></span><span>H: <b style={{ color: T.text }}>{height}</b></span><span>Open: <b style={{ color: T.accent }}>{openPct}%</b></span>
        </div>
        {hovCol && <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(26,26,26,0.9)", color: "white", padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 500, display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: hovCol.hex, border: "1px solid rgba(255,255,255,0.3)" }}/>{hovCol.label}</div>}
        {/* Dimension Overlay removed — replaced by 3D floating bubbles */}

        {/* Frame Style Picker Overlay */}
        {showStylePicker && (() => {
          var allP = [...FRAME_STYLE_PRESETS, ...(appSettings.customFrameStyles || [])];
          var filt = allP.filter(p => p.type === productType && (styleApertures >= 5 ? p.ap >= 5 : p.ap === styleApertures));
          return <div style={{ position: "absolute", top: 0, right: 0, width: 300, height: "100%", background: dk ? "rgba(30,30,40,0.97)" : "rgba(255,255,255,0.97)", backdropFilter: "blur(12px)", borderLeft: "1px solid " + T.border, zIndex: 20, display: "flex", flexDirection: "column", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.border }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{meta ? meta.label : 'Window'} Styles</div>
                <div onClick={() => setShowStylePicker(false)} style={{ cursor: "pointer", fontSize: 16, color: T.textMuted, padding: "2px 6px" }}>x</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {[1,2,3,4,5].map(n => (
                  <div key={n} onClick={() => setStyleApertures(n)}
                    style={{ width: 22, height: 22, borderRadius: 3, cursor: "pointer", border: "1.5px solid " + (n <= styleApertures ? "#333" : "#ccc"),
                      background: n <= styleApertures ? "#1a1a1a" : (dk ? "#2a2a3a" : "#fff"), transition: "all 0.12s" }}/>
                ))}
                <span style={{ fontSize: 11, color: T.textSub, marginLeft: 6 }}>{styleApertures >= 5 ? "5+" : styleApertures} Aperture{styleApertures !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {filt.length === 0 && <div style={{ fontSize: 11, color: T.textMuted, padding: 20, textAlign: "center" }}>No presets for {styleApertures >= 5 ? "5+" : styleApertures} aperture{styleApertures !== 1 ? "s" : ""}</div>}
              {filt.map(preset => {
                var tw = 72, th = 48, pf = 3, iw2 = tw-pf*2, ih2 = th-pf*2;
                return <div key={preset.id} onClick={() => applyStylePreset(preset)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", marginBottom: 3, borderRadius: 6, cursor: "pointer", border: "1px solid " + T.border, transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = dk ? "rgba(196,18,48,0.08)" : "rgba(196,18,48,0.04)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "transparent"; }}>
                  <svg width={tw} height={th} viewBox={"0 0 "+tw+" "+th} style={{ flexShrink: 0 }}>
                    <rect x={1} y={1} width={tw-2} height={th-2} fill={dk?"#2a2a3a":"#f8f8f8"} stroke="#999" strokeWidth="1.5" rx="1"/>
                    {preset.cells.map((row, ri) => {
                      var wrS=preset.wr.reduce((a,b)=>a+b,0), hrS=preset.hr.reduce((a,b)=>a+b,0);
                      var cy3=pf; for(var j3=0;j3<ri;j3++) cy3+=preset.hr[j3]/hrS*ih2+2;
                      var ch3=preset.hr[ri]/hrS*ih2-(preset.rows>1?2:0);
                      return row.map((cell,ci) => {
                        var cx3=pf; for(var k3=0;k3<ci;k3++) cx3+=preset.wr[k3]/wrS*iw2+2;
                        var cw3=preset.wr[ci]/wrS*iw2-(preset.cols>1?2:0);
                        var cl3=cell==="fixed"?"#bbb":"#666";
                        return <React.Fragment key={ri+'_'+ci}>
                          <rect x={cx3} y={cy3} width={cw3} height={ch3} fill="none" stroke={cl3} strokeWidth="0.8" rx="0.5"/>
                          {cell!=="fixed" && <React.Fragment><line x1={cx3+2} y1={cy3+ch3-2} x2={cx3+cw3/2} y2={cy3+2} stroke={cl3} strokeWidth="0.6"/><line x1={cx3+cw3-2} y1={cy3+ch3-2} x2={cx3+cw3/2} y2={cy3+2} stroke={cl3} strokeWidth="0.6"/></React.Fragment>}
                          {cell==="fixed" && <React.Fragment><line x1={cx3+1} y1={cy3+1} x2={cx3+cw3-1} y2={cy3+ch3-1} stroke="#ccc" strokeWidth="0.4"/><line x1={cx3+cw3-1} y1={cy3+1} x2={cx3+1} y2={cy3+ch3-1} stroke="#ccc" strokeWidth="0.4"/></React.Fragment>}
                        </React.Fragment>;
                      });
                    })}
                  </svg>
                  <div style={{ fontSize: 11, color: T.text, lineHeight: 1.3 }}>{preset.label}</div>
                </div>;
              })}
            </div>
            <div style={{ padding: "10px 16px", borderTop: "1px solid " + T.border, display: "flex", gap: 8 }}>
              <button onClick={() => setShowStylePicker(false)} style={{ flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 700, border: "none", borderRadius: 6, cursor: "pointer", background: T.accent, color: "white" }}>Done</button>
              <button onClick={() => setShowStylePicker(false)} style={{ flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 600, border: "1px solid " + T.border, borderRadius: 6, cursor: "pointer", background: "transparent", color: T.text }}>Cancel</button>
            </div>
          </div>;
        })()}

        {/* ── WIP10: Customise Layout panel — transoms / mullions / sashes ── */}
        {showLayoutPanel && (() => {
          const wrS = (zoneWidths.reduce((a,b)=>a+(b||0),0)) || 1;
          const hrS = (zoneHeights.reduce((a,b)=>a+(b||0),0)) || 1;
          const sw = 280, sh = 200, spd = 6;
          const iw = sw - spd*2, ih = sh - spd*2;
          const gutter = 2;

          // Allowed cell types per product
          const pt = productType;
          // (allowedSashTypes picker replaced by direct +/× actions per cell in WIP10)

          const addMullion = () => {
            if (gridCols >= 4) return;
            const nc = gridCols + 1;
            setGridCols(nc);
            setCellTypes(prev => prev.map(row => [...row, 'fixed']));
            setCellBreaks(prev => prev.map(row => [...row, {}]));
            setZoneWidths(prev => fitZones([...prev, prev[prev.length-1] || 300], openingWMm, nc));
            setTransomPct(null);
          };
          const addTransom = () => {
            if (gridRows >= 4) return;
            const nr = gridRows + 1;
            setGridRows(nr);
            setCellTypes(prev => { const next = [...prev]; next.push(Array(gridCols).fill('fixed')); return next; });
            setCellBreaks(prev => {
              const next = [...prev];
              next.push(Array.from({length: gridCols}, () => ({})));
              return next;
            });
            setZoneHeights(prev => fitZones([...prev, prev[prev.length-1] || 300], openingHMm, nr));
            setTransomPct(null);
          };
          const removeColAt = (idx) => {
            if (gridCols <= 1) return;
            const nc = gridCols - 1;
            setGridCols(nc);
            setCellTypes(prev => prev.map(row => { const next = [...row]; next.splice(idx + 1, 1); return next; }));
            setCellBreaks(prev => prev.map(row => {
              // Remove column at idx+1. Anything to the right of idx+1 shifts
              // left; `left` flags on the shifted-in column are preserved.
              const next = [...row]; next.splice(idx + 1, 1);
              // After splice, the cell now at position idx (merged result) may
              // have inherited stale flags — clear `left` flag if idx === 0
              // (no column to its left anymore).
              if (idx === 0 && next[0]) next[0] = { ...next[0], left: false };
              return next;
            }));
            setZoneWidths(prev => {
              const next = [...prev];
              const merged = (next[idx] || 0) + (next[idx+1] || 0);
              next[idx] = merged; next.splice(idx + 1, 1);
              return fitZones(next, openingWMm, nc);
            });
            setSelectedCell(null);
          };
          const removeRowAt = (idx) => {
            if (gridRows <= 1) return;
            const nr = gridRows - 1;
            setGridRows(nr);
            setCellTypes(prev => { const next = [...prev]; next.splice(idx + 1, 1); return next; });
            setCellBreaks(prev => {
              const next = [...prev]; next.splice(idx + 1, 1);
              // If we just collapsed down to row 0 being merged, clear stale up flags.
              if (idx === 0 && next[0]) next[0] = next[0].map(cb => ({ ...cb, up: false }));
              return next;
            });
            setZoneHeights(prev => {
              const next = [...prev];
              const merged = (next[idx] || 0) + (next[idx+1] || 0);
              next[idx] = merged; next.splice(idx + 1, 1);
              return fitZones(next, openingHMm, nr);
            });
            setSelectedCell(null);
          };
          // WIP10: toggle a single transom segment (the part of the transom
          // between row r and r+1 that sits above column c). Break = no bar in
          // 3D and cells share that edge; restore puts the bar back.
          const toggleTransomSegment = (r, c) => {
            setCellBreaks(prev => {
              const next = prev.map(row => row.map(cb => ({ ...cb })));
              if (!next[r+1]) return prev;
              if (!next[r+1][c]) next[r+1][c] = {};
              next[r+1][c].up = !next[r+1][c].up;
              return next;
            });
          };
          // Toggle a mullion segment between column c and c+1 in row r.
          const toggleMullionSegment = (r, c) => {
            setCellBreaks(prev => {
              const next = prev.map(row => row.map(cb => ({ ...cb })));
              if (!next[r] || !next[r][c+1]) return prev;
              next[r][c+1].left = !next[r][c+1].left;
              return next;
            });
          };
          const setCellTypeAt = (r, c, t) => {
            setCellTypes(prev => {
              const next = prev.map(row => [...row]);
              if (next[r] && next[r][c] !== undefined) next[r][c] = t;
              return next;
            });
          };
          const adjustWidthAt = (idx, newMm) => {
            // adjust zone idx, compensate neighbour idx+1 to maintain total
            const next = [...zoneWidths];
            const total = next[idx] + (next[idx+1] || 0);
            const clamped = Math.max(150, Math.min(total - 150, Math.round(newMm)));
            next[idx] = clamped;
            if (idx+1 < next.length) next[idx+1] = total - clamped;
            setZoneWidths(next);
          };
          const adjustHeightAt = (idx, newMm) => {
            const next = [...zoneHeights];
            const total = next[idx] + (next[idx+1] || 0);
            const clamped = Math.max(150, Math.min(total - 150, Math.round(newMm)));
            next[idx] = clamped;
            if (idx+1 < next.length) next[idx+1] = total - clamped;
            setZoneHeights(next);
          };

          const hasSashes = frameHasAnySash({ productType, cellTypes });
          const panelBg = dk ? "rgba(30,30,40,0.97)" : "rgba(255,255,255,0.97)";

          // WIP10: the one sash type this product allows. Used by the Sashes
          // tab so "+" always adds the right kind of sash (no picker).
          const naturalSashType = defaultSashTypeFor(productType);
          const productAllowsSashes = naturalSashType !== 'fixed';
          const productLabel = (PRODUCTS.find(p => p.id === productType) || {}).label || productType;

          // ── Schematic renderer ──
          // mode === 'display'        → read-only preview (small gutter)
          // mode === 'sashEdit'       → cells are buttons: + / × / ↔
          // mode === 'transomsEdit'   → extra-wide gutters on horizontal lines
          //                             with clickable × to delete that transom
          // mode === 'mullionsEdit'   → extra-wide gutters on vertical lines
          //                             with clickable × to delete that mullion
          const renderSchematic = (mode) => {
            const sashEdit       = mode === 'sashEdit';
            const transomsEdit   = mode === 'transomsEdit';
            const mullionsEdit   = mode === 'mullionsEdit';
            // Use a wider gutter on the axis we're editing so the × badge has
            // room to land on the mullion/transom strip.
            const gutterH = mullionsEdit ? 18 : gutter;   // width of vertical gutters (between columns)
            const gutterV = transomsEdit ? 18 : gutter;   // height of horizontal gutters (between rows)
            return (
              <svg width={sw} height={sh} viewBox={`0 0 ${sw} ${sh}`} style={{ background: dk ? "#1a1a25" : "#fafafa", borderRadius: 6, border: "1px solid " + T.border }}>
                <rect x={1} y={1} width={sw-2} height={sh-2} fill={dk?"#2a2a3a":"#f8f8f8"} stroke="#999" strokeWidth="1.5" rx="2"/>
                {cellTypes.map((row, r) => {
                  let cy = spd; for (let j = 0; j < r; j++) cy += (zoneHeights[j]||0)/hrS * ih + gutterV;
                  const ch = (zoneHeights[r]||0)/hrS * ih - (gridRows>1 ? gutterV : 0);
                  return row.map((cell, c) => {
                    let cx = spd; for (let k = 0; k < c; k++) cx += (zoneWidths[k]||0)/wrS * iw + gutterH;
                    const cw = (zoneWidths[c]||0)/wrS * iw - (gridCols>1 ? gutterH : 0);
                    const isOpener = cell !== 'fixed';
                    const isCasement = cell === 'casement_l' || cell === 'casement_r';
                    const isTT       = cell === 'tilt_turn'  || cell === 'tilt_turn_l';
                    const strokeCol = isOpener ? "#666" : "#bbb";
                    const strokeW = 1.2;

                    // Interaction availability for sashEdit mode
                    const canAdd    = sashEdit && !isOpener && productAllowsSashes;
                    const canDelete = sashEdit && isOpener;
                    const canFlip   = sashEdit && (
                      (isCasement && productType === 'casement_window') ||
                      (isTT       && productType === 'tilt_turn_window')
                    );

                    // Cell rect + main glyph. Whole-cell click = primary action
                    // (add if fixed, or no-op if sash — delete is on its own icon).
                    const primaryClick = canAdd ? () => setCellTypeAt(r, c, naturalSashType) : undefined;

                    // Tiny badge geometry (top-right = delete, top-left = flip)
                    const badgeR = Math.min(7, cw/5, ch/5);
                    const delBadgeCX = cx + cw - badgeR - 2;
                    const delBadgeCY = cy + badgeR + 2;
                    const flipBadgeCX = cx + badgeR + 2;
                    const flipBadgeCY = cy + badgeR + 2;

                    return (
                      <g key={`${r}-${c}`}>
                        <rect x={cx} y={cy} width={cw} height={ch} fill="none" stroke={strokeCol} strokeWidth={strokeW} rx="2"
                          style={primaryClick ? { cursor: "pointer" } : {}}
                          onClick={primaryClick}/>
                        {/* Sash-type glyphs (visible in every mode) */}
                        {cell === 'awning' && (
                          <React.Fragment>
                            <line x1={cx+3} y1={cy+ch-3} x2={cx+cw/2} y2={cy+3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                            <line x1={cx+cw-3} y1={cy+ch-3} x2={cx+cw/2} y2={cy+3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                          </React.Fragment>
                        )}
                        {cell === 'casement_l' && (
                          <React.Fragment>
                            <line x1={cx+3} y1={cy+ch/2} x2={cx+cw-3} y2={cy+3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                            <line x1={cx+3} y1={cy+ch/2} x2={cx+cw-3} y2={cy+ch-3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                          </React.Fragment>
                        )}
                        {cell === 'casement_r' && (
                          <React.Fragment>
                            <line x1={cx+cw-3} y1={cy+ch/2} x2={cx+3} y2={cy+3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                            <line x1={cx+cw-3} y1={cy+ch/2} x2={cx+3} y2={cy+ch-3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                          </React.Fragment>
                        )}
                        {(cell === 'tilt_turn' || cell === 'tilt_turn_l') && (
                          <React.Fragment>
                            {/* Tilt triangle (apex UP, base BOTTOM) */}
                            <line x1={cx+3} y1={cy+ch-3} x2={cx+cw/2} y2={cy+3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                            <line x1={cx+cw-3} y1={cy+ch-3} x2={cx+cw/2} y2={cy+3} stroke={strokeCol} strokeWidth="0.9" pointerEvents="none"/>
                            <line x1={cx+3} y1={cy+ch/2} x2={cx+cw-3} y2={cy+ch/2} stroke={strokeCol} strokeWidth="0.6" strokeDasharray="2,2" pointerEvents="none"/>
                            {/* Hinge-side marker (thicker vertical line) */}
                            {cell === 'tilt_turn' && (
                              <line x1={cx+3} y1={cy+3} x2={cx+3} y2={cy+ch-3} stroke={strokeCol} strokeWidth="2.4" pointerEvents="none"/>
                            )}
                            {cell === 'tilt_turn_l' && (
                              <line x1={cx+cw-3} y1={cy+3} x2={cx+cw-3} y2={cy+ch-3} stroke={strokeCol} strokeWidth="2.4" pointerEvents="none"/>
                            )}
                          </React.Fragment>
                        )}
                        {cell === 'fixed' && !sashEdit && (
                          <React.Fragment>
                            <line x1={cx+2} y1={cy+2} x2={cx+cw-2} y2={cy+ch-2} stroke="#d0d0d0" strokeWidth="0.5" pointerEvents="none"/>
                            <line x1={cx+cw-2} y1={cy+2} x2={cx+2} y2={cy+ch-2} stroke="#d0d0d0" strokeWidth="0.5" pointerEvents="none"/>
                          </React.Fragment>
                        )}

                        {/* SASH EDIT MODE — big "+" on every fixed cell (clickable) */}
                        {sashEdit && cell === 'fixed' && productAllowsSashes && (
                          <g style={{ cursor: "pointer" }} onClick={primaryClick}>
                            <circle cx={cx+cw/2} cy={cy+ch/2} r={Math.min(14, cw/3, ch/3)}
                              fill={dk ? "rgba(196,18,48,0.18)" : "rgba(196,18,48,0.10)"}
                              stroke={T.accent} strokeWidth="1.5"/>
                            <line x1={cx+cw/2 - Math.min(8, cw/5)} y1={cy+ch/2} x2={cx+cw/2 + Math.min(8, cw/5)} y2={cy+ch/2} stroke={T.accent} strokeWidth="2" strokeLinecap="round"/>
                            <line x1={cx+cw/2} y1={cy+ch/2 - Math.min(8, ch/5)} x2={cx+cw/2} y2={cy+ch/2 + Math.min(8, ch/5)} stroke={T.accent} strokeWidth="2" strokeLinecap="round"/>
                            <title>Add {productLabel} sash</title>
                          </g>
                        )}
                        {/* SASH EDIT MODE — fixed cell on a product that can't take a sash (fixed_window) */}
                        {sashEdit && cell === 'fixed' && !productAllowsSashes && (
                          <React.Fragment>
                            <line x1={cx+cw*0.3} y1={cy+ch*0.3} x2={cx+cw*0.7} y2={cy+ch*0.7} stroke="#ccc" strokeWidth="0.7" pointerEvents="none"/>
                            <line x1={cx+cw*0.7} y1={cy+ch*0.3} x2={cx+cw*0.3} y2={cy+ch*0.7} stroke="#ccc" strokeWidth="0.7" pointerEvents="none"/>
                          </React.Fragment>
                        )}
                        {/* SASH EDIT MODE — delete badge (top-right) on sash cells */}
                        {canDelete && badgeR >= 5 && (
                          <g style={{ cursor: "pointer" }} onClick={() => setCellTypeAt(r, c, 'fixed')}>
                            <circle cx={delBadgeCX} cy={delBadgeCY} r={badgeR} fill="white" stroke={T.accent} strokeWidth="1"/>
                            <line x1={delBadgeCX - badgeR*0.4} y1={delBadgeCY - badgeR*0.4} x2={delBadgeCX + badgeR*0.4} y2={delBadgeCY + badgeR*0.4} stroke={T.accent} strokeWidth="1.4" strokeLinecap="round"/>
                            <line x1={delBadgeCX + badgeR*0.4} y1={delBadgeCY - badgeR*0.4} x2={delBadgeCX - badgeR*0.4} y2={delBadgeCY + badgeR*0.4} stroke={T.accent} strokeWidth="1.4" strokeLinecap="round"/>
                            <title>Delete sash</title>
                          </g>
                        )}
                        {/* SASH EDIT MODE — flip L/R badge (top-left) on casement + T&T sash cells */}
                        {canFlip && badgeR >= 5 && (
                          <g style={{ cursor: "pointer" }} onClick={() => {
                            const next =
                              cell === 'casement_l' ? 'casement_r' :
                              cell === 'casement_r' ? 'casement_l' :
                              cell === 'tilt_turn'   ? 'tilt_turn_l' :
                              cell === 'tilt_turn_l' ? 'tilt_turn'   : cell;
                            setCellTypeAt(r, c, next);
                          }}>
                            <circle cx={flipBadgeCX} cy={flipBadgeCY} r={badgeR} fill="white" stroke="#666" strokeWidth="1"/>
                            <text x={flipBadgeCX} y={flipBadgeCY + badgeR*0.35} textAnchor="middle" fontSize={badgeR*1.3} fill="#333" fontFamily="Arial" fontWeight="700">↔</text>
                            <title>Flip hinge L/R</title>
                          </g>
                        )}
                      </g>
                    );
                  });
                })}
                {/* ─── Mullion segment badges (mullionsEdit mode) ─── */}
                {/* One badge per (row × between-columns) segment. Red × on an
                    unbroken segment removes just that segment (the mullion
                    between cells in that row). Green + on a broken segment
                    restores it. The full-column delete (merge columns) stays
                    available on the per-mullion card below. */}
                {mullionsEdit && Array.from({ length: Math.max(0, gridCols - 1) }).map((_, mc) => {
                  let mullionX = spd;
                  for (let k = 0; k <= mc; k++) mullionX += (zoneWidths[k] || 0) / wrS * iw;
                  mullionX += mc * gutterH;
                  const r = 9;
                  return (
                    <g key={`mullion-strip-${mc}`}>
                      <rect x={mullionX - gutterH/2} y={spd} width={gutterH} height={ih}
                        fill={dk ? "rgba(196,18,48,0.20)" : "rgba(196,18,48,0.12)"} pointerEvents="none"/>
                      <line x1={mullionX} y1={spd} x2={mullionX} y2={spd+ih} stroke={T.accent} strokeWidth="0.8" strokeDasharray="3,2" pointerEvents="none"/>
                      {/* Per-row badges. */}
                      {Array.from({ length: gridRows }).map((_, rowIdx) => {
                        let cy = spd; for (let j = 0; j < rowIdx; j++) cy += (zoneHeights[j]||0)/hrS * ih + gutterV;
                        const ch = (zoneHeights[rowIdx]||0)/hrS * ih - (gridRows>1 ? gutterV : 0);
                        const badgeCY = cy + ch/2;
                        const isBroken = !!(cellBreaks[rowIdx] && cellBreaks[rowIdx][mc+1] && cellBreaks[rowIdx][mc+1].left);
                        if (isBroken) {
                          // Green + to restore
                          return (
                            <g key={`mullion-seg-${rowIdx}`} style={{ cursor: 'pointer' }} onClick={() => toggleMullionSegment(rowIdx, mc)}>
                              <circle cx={mullionX} cy={badgeCY} r={r} fill="#1f9e4f" stroke="white" strokeWidth="1.5"/>
                              <line x1={mullionX - r*0.45} y1={badgeCY} x2={mullionX + r*0.45} y2={badgeCY} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                              <line x1={mullionX} y1={badgeCY - r*0.45} x2={mullionX} y2={badgeCY + r*0.45} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                              <title>Restore this mullion segment</title>
                            </g>
                          );
                        }
                        // Red × to break this segment
                        return (
                          <g key={`mullion-seg-${rowIdx}`} style={{ cursor: 'pointer' }} onClick={() => toggleMullionSegment(rowIdx, mc)}>
                            <circle cx={mullionX} cy={badgeCY} r={r} fill={T.accent} stroke="white" strokeWidth="1.5"/>
                            <line x1={mullionX - r*0.45} y1={badgeCY - r*0.45} x2={mullionX + r*0.45} y2={badgeCY + r*0.45} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                            <line x1={mullionX + r*0.45} y1={badgeCY - r*0.45} x2={mullionX - r*0.45} y2={badgeCY + r*0.45} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                            <title>Delete this mullion segment</title>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                {/* ─── Transom segment badges (transomsEdit mode) ─── */}
                {transomsEdit && Array.from({ length: Math.max(0, gridRows - 1) }).map((_, tr) => {
                  let transomY = spd;
                  for (let j = 0; j <= tr; j++) transomY += (zoneHeights[j] || 0) / hrS * ih;
                  transomY += tr * gutterV;
                  const br = 9;
                  return (
                    <g key={`transom-strip-${tr}`}>
                      <rect x={spd} y={transomY - gutterV/2} width={iw} height={gutterV}
                        fill={dk ? "rgba(196,18,48,0.20)" : "rgba(196,18,48,0.12)"} pointerEvents="none"/>
                      <line x1={spd} y1={transomY} x2={spd+iw} y2={transomY} stroke={T.accent} strokeWidth="0.8" strokeDasharray="3,2" pointerEvents="none"/>
                      {/* Per-column badges. */}
                      {Array.from({ length: gridCols }).map((_, colIdx) => {
                        let cx = spd; for (let k = 0; k < colIdx; k++) cx += (zoneWidths[k]||0)/wrS * iw + gutterH;
                        const cw = (zoneWidths[colIdx]||0)/wrS * iw - (gridCols>1 ? gutterH : 0);
                        const badgeCX = cx + cw/2;
                        const isBroken = !!(cellBreaks[tr+1] && cellBreaks[tr+1][colIdx] && cellBreaks[tr+1][colIdx].up);
                        if (isBroken) {
                          // Green + to restore
                          return (
                            <g key={`transom-seg-${colIdx}`} style={{ cursor: 'pointer' }} onClick={() => toggleTransomSegment(tr, colIdx)}>
                              <circle cx={badgeCX} cy={transomY} r={br} fill="#1f9e4f" stroke="white" strokeWidth="1.5"/>
                              <line x1={badgeCX - br*0.45} y1={transomY} x2={badgeCX + br*0.45} y2={transomY} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                              <line x1={badgeCX} y1={transomY - br*0.45} x2={badgeCX} y2={transomY + br*0.45} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                              <title>Restore this transom segment</title>
                            </g>
                          );
                        }
                        return (
                          <g key={`transom-seg-${colIdx}`} style={{ cursor: 'pointer' }} onClick={() => toggleTransomSegment(tr, colIdx)}>
                            <circle cx={badgeCX} cy={transomY} r={br} fill={T.accent} stroke="white" strokeWidth="1.5"/>
                            <line x1={badgeCX - br*0.45} y1={transomY - br*0.45} x2={badgeCX + br*0.45} y2={transomY + br*0.45} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                            <line x1={badgeCX + br*0.45} y1={transomY - br*0.45} x2={badgeCX - br*0.45} y2={transomY + br*0.45} stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                            <title>Delete this transom segment</title>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            );
          };

          return (
            <div style={{ position: "absolute", top: 0, right: 0, width: 320, height: "100%", background: panelBg, backdropFilter: "blur(12px)", borderLeft: "1px solid " + T.border, zIndex: 20, display: "flex", flexDirection: "column", boxShadow: "-4px 0 20px rgba(0,0,0,0.1)" }}>
              {/* Header */}
              <div style={{ padding: "12px 16px", borderBottom: "1px solid " + T.border }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Customise Layout</div>
                  <div onClick={() => { setShowLayoutPanel(false); setSelectedCell(null); }} style={{ cursor: "pointer", fontSize: 16, color: T.textMuted, padding: "2px 8px" }}>×</div>
                </div>
                {/* Tabs */}
                <div style={{ display: "flex", gap: 2, borderBottom: "1px solid " + T.border, marginBottom: -12, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}>
                  {[{id:'transoms',label:'Transoms'},{id:'mullions',label:'Mullions'},{id:'sashes',label:'Sashes'}].map(tab => (
                    <button key={tab.id} onClick={() => { setLayoutTab(tab.id); setSelectedCell(null); }}
                      style={{ flex: 1, padding: "8px 0", fontSize: 11, fontWeight: 700, border: "none", borderBottom: layoutTab === tab.id ? "2px solid " + T.accent : "2px solid transparent", background: "transparent", color: layoutTab === tab.id ? T.accent : T.textSub, cursor: "pointer", transition: "all 0.15s" }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
                {/* Live schematic preview */}
                <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
                  {renderSchematic(
                    layoutTab === 'sashes'   ? 'sashEdit' :
                    layoutTab === 'mullions' ? 'mullionsEdit' :
                    layoutTab === 'transoms' ? 'transomsEdit' :
                    'display'
                  )}
                </div>

                {/* ═══ TRANSOMS TAB ═══ */}
                {layoutTab === 'transoms' && (
                  <React.Fragment>
                    <div style={{ fontSize: 10, color: T.textSub, marginBottom: 8, lineHeight: 1.4 }}>
                      Transoms split the frame horizontally. Each new transom adds a row.
                    </div>
                    <button onClick={addTransom} disabled={gridRows >= 4}
                      style={{ width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 700, border: "1.5px solid " + T.accent, borderRadius: 8, cursor: gridRows >= 4 ? "not-allowed" : "pointer", background: gridRows >= 4 ? "#f0f0f0" : (dk ? "rgba(196,18,48,0.12)" : "#fef2f2"), color: gridRows >= 4 ? "#999" : T.accent, marginBottom: 12, transition: "all 0.15s" }}>
                      + Add Transom {gridRows >= 4 ? "(max 3)" : ""}
                    </button>
                    {gridRows <= 1 && <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", padding: "12px 0" }}>No transoms yet.</div>}
                    {gridRows > 1 && Array.from({ length: gridRows - 1 }, (_, i) => i).map(idx => {
                      const above = zoneHeights[idx] || 0;
                      const below = zoneHeights[idx+1] || 0;
                      const total = above + below;
                      // WIP10: display centerline-based segment dims so the
                      // numbers here match the 3D dimension bubbles.
                      const segAbove = above + ((idx === 0) ? mullionMm/2 : mullionMm);
                      const segBelow = below + ((idx+1 === gridRows - 1) ? mullionMm/2 : mullionMm);
                      return (
                        <div key={idx} style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 8, border: "1px solid " + T.border, background: dk ? "rgba(40,40,50,0.5)" : "#fafafa" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Transom {idx + 1}</span>
                            <button onClick={() => removeRowAt(idx)} title="Delete transom (merges rows)"
                              style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, border: "1px solid " + T.border, borderRadius: 5, cursor: "pointer", background: "transparent", color: T.textSub }}>
                              🗑 Delete
                            </button>
                          </div>
                          <div style={{ fontSize: 9, color: T.textFaint, marginBottom: 3 }}>Position (above {Math.round(segAbove)}mm · below {Math.round(segBelow)}mm, to centerline)</div>
                          <input type="range" min={150} max={Math.max(151, total - 150)} value={above}
                            onChange={e => adjustHeightAt(idx, Number(e.target.value))}
                            style={{ width: "100%", accentColor: T.accent, height: 3 }}/>
                        </div>
                      );
                    })}
                  </React.Fragment>
                )}

                {/* ═══ MULLIONS TAB ═══ */}
                {layoutTab === 'mullions' && (
                  <React.Fragment>
                    <div style={{ fontSize: 10, color: T.textSub, marginBottom: 8, lineHeight: 1.4 }}>
                      Mullions split the frame vertically. Each new mullion adds a column.
                    </div>
                    <button onClick={addMullion} disabled={gridCols >= 4}
                      style={{ width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 700, border: "1.5px solid " + T.accent, borderRadius: 8, cursor: gridCols >= 4 ? "not-allowed" : "pointer", background: gridCols >= 4 ? "#f0f0f0" : (dk ? "rgba(196,18,48,0.12)" : "#fef2f2"), color: gridCols >= 4 ? "#999" : T.accent, marginBottom: 12, transition: "all 0.15s" }}>
                      + Add Mullion {gridCols >= 4 ? "(max 3)" : ""}
                    </button>
                    {gridCols <= 1 && <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", padding: "12px 0" }}>No mullions yet.</div>}
                    {gridCols > 1 && Array.from({ length: gridCols - 1 }, (_, i) => i).map(idx => {
                      const left = zoneWidths[idx] || 0;
                      const right = zoneWidths[idx+1] || 0;
                      const total = left + right;
                      // WIP10: display centerline-based segment dims so the
                      // numbers here match the 3D dimension bubbles.
                      const segLeft  = left  + ((idx === 0) ? mullionMm/2 : mullionMm);
                      const segRight = right + ((idx+1 === gridCols - 1) ? mullionMm/2 : mullionMm);
                      return (
                        <div key={idx} style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 8, border: "1px solid " + T.border, background: dk ? "rgba(40,40,50,0.5)" : "#fafafa" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Mullion {idx + 1}</span>
                            <button onClick={() => removeColAt(idx)} title="Delete mullion (merges columns)"
                              style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, border: "1px solid " + T.border, borderRadius: 5, cursor: "pointer", background: "transparent", color: T.textSub }}>
                              🗑 Delete
                            </button>
                          </div>
                          <div style={{ fontSize: 9, color: T.textFaint, marginBottom: 3 }}>Position (left {Math.round(segLeft)}mm · right {Math.round(segRight)}mm, to centerline)</div>
                          <input type="range" min={150} max={Math.max(151, total - 150)} value={left}
                            onChange={e => adjustWidthAt(idx, Number(e.target.value))}
                            style={{ width: "100%", accentColor: T.accent, height: 3 }}/>
                        </div>
                      );
                    })}
                  </React.Fragment>
                )}

                {/* ═══ SASHES TAB ═══ */}
                {layoutTab === 'sashes' && (
                  <React.Fragment>
                    <div style={{ fontSize: 10, color: T.textSub, marginBottom: 10, lineHeight: 1.4 }}>
                      {productAllowsSashes
                        ? <span>On the schematic above, click the <b style={{ color: T.accent }}>+</b> inside any aperture to add an <b>{productLabel}</b> sash. Click the small × on an existing sash to remove it. Fly screens are fitted only to apertures that have a sash.</span>
                        : <span>The <b>{productLabel}</b> product has no opening sashes — every aperture is fixed glass. Change the product type from the bottom toolbar if you need a sash.</span>}
                    </div>
                    {((productType === 'casement_window' || productType === 'tilt_turn_window') && frameHasAnySash({ productType, cellTypes })) && (
                      <div style={{ fontSize: 10, color: T.textSub, marginBottom: 10, padding: "8px 10px", borderRadius: 6, background: dk ? "rgba(40,40,50,0.5)" : "#f5f5f5", lineHeight: 1.4 }}>
                        Sashes default to <b>left-hinged</b>. Click the small <b>↔</b> on a sash to flip to right-hinged.
                      </div>
                    )}
                    {(() => {
                      let totalCells = 0, sashCells = 0;
                      for (const row of cellTypes) for (const c of row) { totalCells++; if (c !== 'fixed') sashCells++; }
                      return (
                        <div style={{ padding: "10px 12px", marginBottom: 8, borderRadius: 8, border: "1px solid " + T.border, background: dk ? "rgba(40,40,50,0.5)" : "#fafafa", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Sashes</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: sashCells > 0 ? T.accent : T.textMuted }}>{sashCells} of {totalCells} aperture{totalCells !== 1 ? 's' : ''}</span>
                        </div>
                      );
                    })()}
                    {/* Legend */}
                    <div style={{ marginTop: 12, padding: "8px 10px", borderRadius: 6, background: dk ? "rgba(40,40,50,0.5)" : "#f5f5f5", fontSize: 9, color: T.textSub, lineHeight: 1.8 }}>
                      <div><b style={{ color: T.text }}>△</b> Awning · <b style={{ color: T.text }}>◁</b> Cas. L · <b style={{ color: T.text }}>▷</b> Cas. R · <b style={{ color: T.text }}>◇</b> Tilt &amp; Turn</div>
                    </div>
                  </React.Fragment>
                )}

                {/* Fly screen summary */}
                <div style={{ marginTop: 14, padding: "8px 10px", borderRadius: 6, background: dk ? "rgba(40,40,50,0.5)" : "#f5f5f5", fontSize: 10, color: T.textSub, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Fly screens</span>
                  <span style={{ fontWeight: 700, color: hasSashes && showFlyScreen ? T.accent : T.textMuted }}>
                    {!hasSashes ? "No sashes — disabled" : (showFlyScreen ? "On (sashes only)" : "Off")}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid " + T.border }}>
                <button onClick={() => { setShowLayoutPanel(false); setSelectedCell(null); }}
                  style={{ width: "100%", padding: "10px 0", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer", background: T.accent, color: "white", transition: "all 0.15s" }}>
                  Done
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Width Dimension Bar — proportional, measures to center of mullions */}
      {/* Width dimension bar removed — replaced by 3D floating bubbles */}

      {/* Controls sidebar. v2.0: pointer-lock removed — per-field locking
          driven by `lockedFields[]` lands in M5.
          M4b: when mode==='survey', lock the sidebar as a whole via
          pointerEvents:none + opacity. Scope satisfies contract §4.3
          (product type, glass spec, colour, panel count, frame geometry are
          all children of this container — one lock cascades). The WIP4
          ?mode=view pointer-lock was removed in WIP1 (see isReadOnly comment
          ~L8140) so this is the fallback path recommended in the M4a handoff. */}
      <div style={Object.assign({ flexShrink: 0, background: T.bgControls, borderTop: "1px solid " + T.border, boxShadow: "0 -2px 12px rgba(0,0,0,0.04)" },
        (crmInit && crmInit.mode === 'survey') ? { pointerEvents: 'none', opacity: 0.5, filter: 'grayscale(0.4)' } : {})}
        title={(crmInit && crmInit.mode === 'survey') ? 'Design controls locked in Check Measure mode' : undefined}>
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #f0f0f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, maxWidth: 860, margin: "0 auto" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: openPct === 0 ? "#999" : T.accent, textTransform: "uppercase", letterSpacing: 1, width: 46, textAlign: "right", transition: "color 0.2s" }}>
              {openPct === 0 ? "Closed" : openPct === 100 ? "Open" : `${openPct}%`}
            </span>
            <input type="range" min={0} max={100} value={openPct} onChange={e => setOpenPct(+e.target.value)} style={{ flex: 1, accentColor: T.accent, height: 4, cursor: "pointer" }}/>
            <div style={{ display: "flex", gap: 2 }}>
              {[0, 50, 100].map(v => (
                <button key={v} onClick={() => setOpenPct(v)} style={{ padding: "2px 7px", fontSize: 9, fontWeight: 700, border: "none", borderRadius: 4, cursor: "pointer", background: openPct === v ? T.accent : "#f0f0f0", color: openPct === v ? "white" : "#666", transition: "all 0.15s" }}>
                  {v === 0 ? "CLOSED" : v === 100 ? "OPEN" : "50%"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "8px 14px", overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", minWidth: "max-content" }}>
            {/* Product types */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Windows</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginBottom: 5 }}>
                {windows.map(p => (
                  <button key={p.id} onClick={() => handleProductChange(p.id)} style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, border: "1px solid", borderRadius: 5, cursor: "pointer", transition: "all 0.15s", background: productType === p.id ? T.accent : "white", color: productType === p.id ? "white" : "#555", borderColor: productType === p.id ? T.accent : "#e0e0e0" }}>{p.label}</button>
                ))}
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Doors</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {doors.map(p => (
                  <button key={p.id} onClick={() => handleProductChange(p.id)} style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, border: "1px solid", borderRadius: 5, cursor: "pointer", transition: "all 0.15s", background: productType === p.id ? T.accent : "#fafafa", color: productType === p.id ? "white" : "#555", borderColor: productType === p.id ? T.accent : "#e0e0e0" }}>{p.label}</button>
                ))}
              </div>
              {/* Inward/Outward swing toggle — only for hinged/french/bifold doors.
                  Flips frame.opensIn so the 3D builder mirrors the swing direction
                  and the swing-arc indicator updates immediately. */}
              {(productType === "french_door" || productType === "hinged_door" || productType === "bifold_door") && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: 0.8 }}>Swing</span>
                  <div style={{ display: "flex", background: T.bgHover, borderRadius: 5, padding: 2 }}>
                    {[
                      { val: false, label: "Outward" },
                      { val: true,  label: "Inward"  },
                    ].map(opt => (
                      <button
                        key={String(opt.val)}
                        onClick={() => setOpensIn(opt.val)}
                        style={{
                          padding: "2px 9px", fontSize: 9, fontWeight: 600, border: "none", borderRadius: 4,
                          cursor: "pointer",
                          background: opensIn === opt.val ? "white" : "transparent",
                          color: opensIn === opt.val ? "#333" : "#999",
                          boxShadow: opensIn === opt.val ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                          transition: "all 0.15s",
                        }}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 65, background: T.border, alignSelf: "center", flexShrink: 0 }}/>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Layout</div>
              <button onClick={() => setShowStylePicker(true)} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, border: "1px solid " + T.accent, borderRadius: 6, cursor: "pointer", background: "transparent", color: T.accent, display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                Frame Styles
              </button>
              <div style={{ fontSize: 9, color: T.textMuted, marginTop: 3 }}>{gridCols}x{gridRows} grid</div>
            </div>
            <div style={{ width: 1, height: 65, background: T.border, alignSelf: "center", flexShrink: 0 }}/>
            {/* Colours + Glass Tint */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2 }}>Colour</span>
                <div style={{ display: "flex", background: T.bgHover, borderRadius: 5, padding: 2 }}>
                  {["ext", "int"].map(t => (
                    <button key={t} onClick={() => setColTarget(t)} style={{ padding: "1px 7px", fontSize: 9, fontWeight: 600, border: "none", borderRadius: 4, cursor: "pointer", background: colTarget === t ? "white" : "transparent", color: colTarget === t ? "#333" : "#999", boxShadow: colTarget === t ? "0 1px 3px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>{t === "ext" ? "External" : "Internal"}</button>
                  ))}
                </div>
              </div>
              {(() => { const cats = []; appSettings.editColours.forEach(c => { if (!cats.includes(c.cat)) cats.push(c.cat); }); return cats; })().map(cat => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 3, marginBottom: 3 }}>
                  <span style={{ fontSize: 8, color: T.textFaint, width: 36, textAlign: "right" }}>{cat === "smooth" ? "Smooth" : cat === "aludec" ? "Aludec" : cat === "wood" ? "Wood" : cat.charAt(0).toUpperCase() + cat.slice(1)}</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    {appSettings.editColours.filter(c => c.cat === cat).map(c => {
                      const tc = new THREE.Color(c.hex);
                      const lum = tc.r * 0.299 + tc.g * 0.587 + tc.b * 0.114;
                      return <button key={c.id} onClick={() => handleColClick(c.id)} onMouseEnter={() => setHovCol(c)} onMouseLeave={() => setHovCol(null)} style={{ width: 22, height: 22, borderRadius: "50%", cursor: "pointer", background: c.hex, border: `2px solid ${selCol === c.id ? T.accent : "#d0d0d0"}`, boxShadow: selCol === c.id ? "0 0 0 2px #c41230" : "none", transform: selCol === c.id ? "scale(1.12)" : "scale(1)", transition: "all 0.15s" }}>
                        {selCol === c.id && <svg style={{ display: "block", margin: "auto" }} width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke={lum < 0.45 ? "white" : "#1a1a1a"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>;
                    })}
                  </div>
                </div>
              ))}
              <label onClick={() => setApplyColourAll(!applyColourAll)} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", marginTop: 4, padding: "2px 0" }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: applyColourAll ? "2px solid #c41230" : "1px solid #ccc", background: applyColourAll ? "#c41230" : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {applyColourAll && <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{ fontSize: 8, color: T.textMuted }}>Apply to all frames</span>
              </label>
            </div>
            <div style={{ width: 1, height: 65, background: T.border, alignSelf: "center", flexShrink: 0 }}/>

            {/* Glass Selector */}
            <div style={{ maxWidth: 180 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>Glass</div>
              <div style={{ display: "flex", gap: 2, marginBottom: 4, flexWrap: "wrap" }}>
                {['All', ...new Set((appSettings.editGlass || GLASS_OPTIONS).map(g => g.cat))].map(cat => (
                  <button key={cat} onClick={() => setGlassCat(cat)} style={{ padding: "1px 5px", fontSize: 8, fontWeight: 600, border: "none", borderRadius: 3, cursor: "pointer", background: glassCat === cat ? T.accent : "#f0f0f0", color: glassCat === cat ? "white" : "#888", transition: "all 0.15s" }}>{cat}</button>
                ))}
              </div>
              <div style={{ maxHeight: 70, overflowY: "auto", border: "1px solid #eee", borderRadius: 4, marginBottom: 4 }}>
                {(appSettings.editGlass || GLASS_OPTIONS).filter(g => glassCat === "All" || g.cat === glassCat).map(g => (
                  <div key={g.id} onClick={() => handleGlassChange(g.id)} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 5px", cursor: "pointer", borderLeft: glassSpec === g.id ? "3px solid #c41230" : "3px solid transparent", background: glassSpec === g.id ? "#fef2f2" : "transparent", transition: "all 0.1s" }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: g.tint, opacity: 0.6, flexShrink: 0, border: "1px solid #ddd" }}/>
                    <span style={{ fontSize: 8, color: "#444", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.label}</span>
                    <span style={{ fontSize: 7, color: T.textMuted, fontFamily: "monospace", flexShrink: 0 }}>U{g.uValue}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 7, color: T.textMuted, lineHeight: 1.3 }}>
                <b style={{ color: T.text }}>{glassSpecObj.label}</b> — {glassSpecObj.desc}<br/>
                U-value: {glassSpecObj.uValue} W/m2K · {Math.round(glassSpecObj.thickness*1000)}mm
              </div>
              <label onClick={() => setApplyGlassAll(!applyGlassAll)} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", marginTop: 4, padding: "2px 0" }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: applyGlassAll ? "2px solid #c41230" : "1px solid #ccc", background: applyGlassAll ? "#c41230" : "white", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {applyGlassAll && <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
                <span style={{ fontSize: 8, color: T.textMuted }}>Apply to all frames</span>
              </label>
            </div>
            <div style={{ width: 1, height: 65, background: T.border, alignSelf: "center", flexShrink: 0 }}/>

            {/* Dimensions */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 5 }}>Dimensions</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["Width", width, setWidth], ["Height", height, setHeight]].map(([label, val, setter]) => (
                  <div key={label}><div style={{ fontSize: 8, color: T.textFaint, marginBottom: 1 }}>{label}</div>
                    <input type="number" value={val} step={50} min={300} max={7000} onChange={e => setter(+e.target.value)} style={{ width: 66, padding: "4px 5px", fontSize: 11, fontFamily: "monospace", border: "1px solid " + T.border, borderRadius: 5, outline: "none" }} onFocus={e => e.target.style.borderColor=T.accent} onBlur={e => e.target.style.borderColor="#e0e0e0"}/>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ width: 1, height: 65, background: T.border, alignSelf: "center", flexShrink: 0 }}/>

            {/* Options */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 5 }}>Options</div>
              {meta && meta.maxP > meta.minP && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 8, color: T.textFaint, marginBottom: 2 }}>Panels</div>
                  <div style={{ display: "flex", gap: 2 }}>
                    {Array.from({ length: meta.maxP - meta.minP + 1 }, (_, i) => meta.minP + i).map(n => (
                      <button key={n} onClick={() => setPanelCount(n)} style={{ width: 24, height: 24, fontSize: 10, fontWeight: 700, border: "none", borderRadius: 5, cursor: "pointer", background: panelCount === n ? T.accent : "#f0f0f0", color: panelCount === n ? "white" : "#666", transition: "all 0.15s" }}>{n}</button>
                    ))}
                  </div>
                </div>
              )}
              {/* Direction toggle moved to the SWING control next to the Doors selector
                  (bottom-left toolbar) so it sits with the door type buttons. */}
              {meta?.styles.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 8, color: T.textFaint, marginBottom: 2 }}>Opening Style</div>
                  <div style={{ display: "flex", gap: 2 }}>
                    {meta.styles.map(st => (
                      <button key={st} onClick={() => setOpenStyle(st)} title={STYLE_LABELS[st] || st} style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", border: openStyle === st ? "2px solid #c41230" : "1px solid " + T.border, borderRadius: 5, cursor: "pointer", transition: "all 0.15s", background: openStyle === st ? "#fef2f2" : "white", color: openStyle === st ? T.accent : "#666" }}>{styleIcons[st]}</button>
                    ))}
                  </div>
                </div>
              )}
              {/* Feature 3: Colonial bars */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 8, color: T.textFaint, marginBottom: 2 }}>Colonial Bars</div>
                <div style={{ display: "flex", gap: 2 }}>
                  {COLONIAL_GRIDS.map(g => (
                    <button key={g || "none"} onClick={() => setColonialGrid(g)} style={{ padding: "2px 6px", fontSize: 9, fontWeight: 600, border: colonialGrid === g ? "2px solid #c41230" : "1px solid " + T.border, borderRadius: 4, cursor: "pointer", background: colonialGrid === g ? "#fef2f2" : "white", color: colonialGrid === g ? T.accent : "#666", transition: "all 0.15s" }}>{g || "None"}</button>
                  ))}
                </div>
              </div>
              {/* Fly Screen toggle — only for window types that have at least one sash */}
              {['tilt_turn_window','awning_window','casement_window'].indexOf(productType) >= 0 && frameHasAnySash({ productType, cellTypes }) && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 8, color: T.textFaint, marginBottom: 2 }}>Fly Screen</div>
                <button onClick={() => setShowFlyScreen(!showFlyScreen)}
                  style={{ padding: "3px 10px", fontSize: 9, fontWeight: 600,
                    border: showFlyScreen ? "2px solid #c41230" : "1px solid " + T.border,
                    borderRadius: 4, cursor: "pointer",
                    background: showFlyScreen ? "#fef2f2" : "white",
                    color: showFlyScreen ? T.accent : "#666",
                    transition: "all 0.15s" }}>
                  {showFlyScreen ? "✓ On" : "Off"}
                </button>
                {showFlyScreen && <span style={{ fontSize: 8, color: T.textMuted, marginLeft: 6 }}>
                  {productType === 'tilt_turn_window' ? 'External' : 'Internal'}
                </span>}
              </div>
              )}
              {/* Hardware Colour */}
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 8, color: T.textFaint, marginBottom: 2 }}>Hardware</div>
                <div style={{ display: "flex", gap: 3 }}>
                  {[["white","#dcdcdc","White"],["silver","#a0a0a0","Silver"],["black","#1a1a1a","Black"]].map(function(opt) {
                    var sel2 = hardwareColour === opt[0];
                    return <button key={opt[0]} onClick={function(){setHardwareColour(opt[0])}} title={opt[2]} style={{ width: 22, height: 22, borderRadius: "50%", cursor: "pointer", background: opt[1], border: sel2 ? "2px solid "+T.accent : "2px solid #d0d0d0", boxShadow: sel2 ? "0 0 0 2px #c41230" : "none", transform: sel2 ? "scale(1.12)" : "scale(1)", transition: "all 0.15s" }}/>;
                  })}
                </div>
              </div>
              {/* Handle Height — T&T and sliding windows only.
                  Offset in mm from the system default position (0 = default,
                  -100 = lower, +100 = higher). Pre-populates the surveyor's
                  handleHeightOffsetMm in the check-measure form. */}
              {(productType === 'tilt_turn_window' || (productType || '').indexOf('sliding') !== -1) && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 8, color: T.textFaint, marginBottom: 2 }} title="Offset from default handle height. -100 = lower, +100 = higher.">
                    Handle Height (mm offset)
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <input type="number" step="10" value={handleHeightMm}
                      onChange={function(e){
                        var v = e.target.value;
                        setHandleHeightMm(v === '' ? 0 : Number(v));
                      }}
                      style={{
                        width: 60, padding: "3px 6px",
                        border: "1px solid " + (handleHeightMm !== 0 ? T.accent : T.border),
                        borderRadius: 3, fontSize: 10, fontFamily: "monospace", textAlign: "right",
                        background: handleHeightMm !== 0 ? "#fef2f2" : "white",
                        color: handleHeightMm !== 0 ? T.accent : "#333"
                      }}/>
                    {handleHeightMm !== 0 && (
                      <button onClick={function(){ setHandleHeightMm(0); }}
                        title="Reset to default"
                        style={{ width: 18, height: 18, border: "none", background: "transparent", color: "#c00", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                    )}
                  </div>
                </div>
              )}
              {/* Feature 3: Transom */}
              {canTransom && gridCols <= 1 && gridRows <= 1 && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                    <span style={{ fontSize: 8, color: T.textFaint }}>Transom</span>
                    <button onClick={() => setTransomPct(transomPct ? null : 0.5)} style={{ padding: "1px 6px", fontSize: 8, fontWeight: 700, border: "1px solid " + T.border, borderRadius: 3, cursor: "pointer", background: transomPct ? T.accent : "#f0f0f0", color: transomPct ? "white" : "#666" }}>{transomPct ? "On" : "Off"}</button>
                  </div>
                  {transomPct !== null && (
                    <input type="range" min={20} max={80} value={Math.round((transomPct || 0.5)*100)} onChange={e => setTransomPct(e.target.value/100)} style={{ width: 80, accentColor: T.accent, height: 3 }}/>
                  )}
                </div>
              )}
            </div>
            <div style={{ width: 1, height: 65, background: T.border, alignSelf: "center", flexShrink: 0 }}/>

            {/* WIP10: Layout is now edited in the Customise Layout slide-in.
                Open with the ⊟ Layout button in the top-right toolbar. This
                summary block shows the current state and offers a shortcut. */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 5 }}>Layout</div>
              <div style={{ fontSize: 10, color: T.textSub, marginBottom: 6, lineHeight: 1.5 }}>
                {gridRows - 1} transom{gridRows - 1 !== 1 ? 's' : ''} · {gridCols - 1} mullion{gridCols - 1 !== 1 ? 's' : ''}
                {(() => {
                  let opens = 0;
                  for (const row of cellTypes) for (const c of row) if (c && c !== 'fixed') opens++;
                  const total = gridCols * gridRows;
                  return <span> · {opens}/{total} sash{opens !== 1 ? 'es' : ''}</span>;
                })()}
              </div>
              <button onClick={() => { setShowLayoutPanel(true); setSelectedCell(null); setLayoutTab('transoms'); }}
                style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, border: "1.5px solid " + T.accent, borderRadius: 6, cursor: "pointer", background: "#fef2f2", color: T.accent, transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: 5 }}>
                ⊟ Customise Layout
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
      {/* ═══ Full-screen Production view ═══════════════════════════════
          Tabbed modal showing per-project production lists. Replaces the
          dashboard-inline Profile Cut List with a dedicated workspace that
          gives the factory floor four focused views:
            • Profile  — the visual segmented bar plan + per-profile thumbs
            • Milling  — CNC drill/route ops (read-only, from MILLING_SPECS)
            • Hardware — kit per frame + project-wide aggregate
            • Glass    — pane sizes per frame + project-wide aggregate
          Opens via the "Production" button in the dashboard header. */}
      {showProduction && <div style={{ position:'fixed', inset:0, zIndex:9999, background:T.bg, display:'flex', flexDirection:'column', fontFamily:"'Segoe UI',Tahoma,Geneva,Verdana,sans-serif" }}>
        {/* Top bar — dark, with close + tabs + xlsx export */}
        <div style={{ height:48, background:'#1a1a1a', display:'flex', alignItems:'center', padding:'0 20px', gap:18, flexShrink:0 }}>
          <div onClick={() => setShowProduction(false)} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:6, color:'rgba(255,255,255,0.6)', fontSize:13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
            Back
          </div>
          <div style={{ width:1, height:20, background:'rgba(255,255,255,0.15)' }}/>
          <div style={{ color:'white', fontSize:13, fontWeight:700 }}>Production · {projectName || 'Project'}</div>
          <div style={{ display:'flex', gap:0, marginLeft:24, height:'100%' }}>
            {[
              { id:'profile',  label:'Profile',  icon:'⟋' },
              { id:'milling',  label:'Milling',  icon:'⚙' },
              { id:'hardware', label:'Hardware', icon:'⚒' },
              { id:'glass',    label:'Glass',    icon:'▢' },
              { id:'steel',    label:'Steel',    icon:'▤' },
              { id:'assembly', label:'Assembly', icon:'◫' },
              { id:'trims',    label:'Additional Profiles', icon:'▭' },
            ].map(function(tab){
              var active = productionTab === tab.id;
              return (
                <button key={tab.id} onClick={function(){ setProductionTab(tab.id); }}
                  style={{
                    background: active ? '#fff' : 'transparent',
                    color: active ? '#1a1a1a' : 'rgba(255,255,255,0.7)',
                    border:'none', borderBottom: active ? '3px solid #c41230' : '3px solid transparent',
                    padding:'0 18px', cursor:'pointer', fontSize:12, fontWeight:600,
                    display:'flex', alignItems:'center', gap:6, height:'100%',
                  }}>
                  <span style={{ fontSize:14 }}>{tab.icon}</span> {tab.label}
                </button>
              );
            })}
          </div>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
            <button onClick={async function(){
              if (!projectItems.length) { alert('No frames to export.'); return; }
              try {
                var wb = generateCutListXlsxWorkbook(projectItems, appSettings.pricingConfig, selectedPriceList, projectName, measurementsByFrameId, appSettings);
                var fname = 'cutlist-' + (projectName || 'project').replace(/[^a-z0-9]+/gi,'-').toLowerCase() + '-' + new Date().toISOString().slice(0,10) + '.xlsx';
                XLSX.writeFile(wb, fname);
                if (crmLink && crmLink.design) {
                  var blob = writeCutListXlsxBlob(wb);
                  var url = await uploadCutListXlsx(crmLink.design.id, blob);
                  if (url) {
                    setCrmLink(Object.assign({}, crmLink, {
                      design: Object.assign({}, crmLink.design, { cut_list_url: url }),
                    }));
                  }
                }
              } catch (e) { alert('Cut-list export failed: ' + (e && e.message || String(e))); }
            }} style={{ background:'rgba(255,255,255,0.12)', color:'white', border:'none', borderRadius:5, padding:'6px 14px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
              ⬇ Download xlsx
            </button>
          </div>
        </div>

        {/* Body — scrollable */}
        <div style={{ flex:1, overflowY:'auto', background:T.bg, padding:'18px 24px' }}>

          {/* ─── PROFILE TAB ───────────────────────────────────────────── */}
          {productionTab === 'profile' && (function(){
            if (typeof computeProfileCuts !== 'function') return null;
            var pcConfig = (appSettings && appSettings.pricingConfig) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS) || {};
            var pcResult;
            try { pcResult = computeProfileCuts(projectItems, pcConfig, appSettings); }
            catch (e) { console.warn('Profile cut compute failed:', e); return null; }
            if (!pcResult || !pcResult.cuts || !pcResult.cuts.length) {
              return (
                <div style={{ padding:'14px 18px', background:T.bgPanel, border:'1px dashed '+T.border, borderRadius:8, fontSize:12, color:T.textMuted, textAlign:'center' }}>
                  <b>Profile Cut List</b> — no cuts yet. Add at least one frame to see the optimised cut sequence.
                </div>
              );
            }
            var keys = Object.keys(pcResult.byProfile);
            var profilesCatalog = (pcConfig.profiles) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.profiles) || {};
            var coloursList = (appSettings && appSettings.editColours) || (typeof COLOURS !== 'undefined' ? COLOURS : []);
            function colourSwatchFor(colourId) {
              var def = coloursList.find(function(c){ return c.id === colourId; });
              if (!def) return { label: colourId || '—', hex: '#cccccc' };
              return { label: def.label || def.id, hex: def.hex || def.outerHex || '#cccccc' };
            }
            return (
              <div style={{ background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Profile Cut List</div>
                  <div style={{ fontSize:11, color:T.textMuted }}>
                    {pcResult.cuts.length} cut{pcResult.cuts.length === 1 ? '' : 's'} across {keys.length} profile{keys.length === 1 ? '' : 's'} · saw kerf {pcResult.sawKerfMm}mm · bar trim {pcResult.barTrimMm}mm · weld allowance applied to mitred pieces
                  </div>
                </div>
                <div style={{ overflowX:'auto', background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                  <table style={{ borderCollapse:'collapse', width:'100%', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'#f4f6f8', fontWeight:700, color:T.textMuted, textTransform:'uppercase', fontSize:9, letterSpacing:0.4 }}>
                        <th style={{ textAlign:'left',  padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Profile</th>
                        <th style={{ textAlign:'left',  padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Source</th>
                        <th style={{ textAlign:'left',  padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Colour</th>
                        <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Cuts</th>
                        <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Total length (mm)</th>
                        <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Bar (mm)</th>
                        <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Bars (FFD)</th>
                        <th style={{ textAlign:'right', padding:'6px 10px', borderBottom:'1px solid '+T.border }}>Utilisation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map(function(k){
                        var g = pcResult.byProfile[k];
                        var util = g.barPlan ? (g.barPlan.utilisationPct + '%') : '—';
                        var srcColour = g.profileSource === 'settings link' ? '#1e40af'
                          : g.profileSource === 'frame override' ? '#7c2d12' : '#166534';
                        var extSwatch = colourSwatchFor(g.colourExt);
                        var intSwatch = colourSwatchFor(g.colourInt);
                        var sameColour = g.colourExt === g.colourInt;
                        // Order swatches to match the cross-section reading
                        // L → R. Catalog declares which side is exterior on
                        // the rendered polygon (colouredFaceSide). The swatch
                        // pair mirrors that: interior swatch precedes exterior
                        // when exterior is on the right (typical outwards-
                        // opening), and vice-versa for inwards-opening.
                        var sumPolyEntry = profilesCatalog[g.profileKey] || null;
                        var sumColouredSide = (sumPolyEntry && sumPolyEntry.colouredFaceSide) || 'right';
                        var sumFirst  = sumColouredSide === 'right' ? intSwatch : extSwatch;
                        var sumSecond = sumColouredSide === 'right' ? extSwatch : intSwatch;
                        var sumFirstLbl  = sumColouredSide === 'right' ? 'Interior' : 'Exterior';
                        var sumSecondLbl = sumColouredSide === 'right' ? 'Exterior' : 'Interior';
                        return (
                          <tr key={k}>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', fontWeight:600 }}>{g.profileLabel}</td>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', color:srcColour, fontSize:10 }}>{g.profileSource || 'system default'}</td>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0' }}>
                              <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:10 }}>
                                <span title={sumFirstLbl + ': ' + sumFirst.label} style={{ display:'inline-block', width:14, height:14, background:sumFirst.hex, border:'1px solid #ccc', borderRadius:2 }}/>
                                {!sameColour && <span title={sumSecondLbl + ': ' + sumSecond.label} style={{ display:'inline-block', width:14, height:14, background:sumSecond.hex, border:'1px solid #ccc', borderRadius:2 }}/>}
                                <span style={{ color:T.textMuted }}>{sameColour ? extSwatch.label : (sumFirst.label + ' / ' + sumSecond.label)}</span>
                              </span>
                            </td>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{g.cutCount}</td>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{g.totalLengthMm.toLocaleString()}</td>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{g.barLengthMm}</td>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontWeight:700 }}>{g.barsRequired}</td>
                            <td style={{ padding:'5px 10px', borderBottom:'1px solid #f0f0f0', textAlign:'right', color: g.barPlan && g.barPlan.utilisationPct >= 90 ? '#166534' : (g.barPlan && g.barPlan.utilisationPct >= 75 ? '#7c2d12' : '#9a3412') }}>{util}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {(function(){
                  var packedKeys = keys.filter(function(k){ return pcResult.byProfile[k].barPlan; });
                  if (!packedKeys.length) return null;
                  var totalBars = packedKeys.reduce(function(s,k){ return s + pcResult.byProfile[k].barPlan.barCount; }, 0);
                  return (
                    <details style={{ marginTop:8 }} open>
                      <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer', fontWeight:700 }}>
                        📐 Optimised Bar Plan ({totalBars} bar{totalBars === 1 ? '' : 's'} across {packedKeys.length} profile{packedKeys.length === 1 ? '' : 's'})
                      </summary>
                      <div style={{ marginTop:8 }}>
                        {packedKeys.map(function(k){
                          var g = pcResult.byProfile[k];
                          var bp = g.barPlan;
                          var polyEntry = profilesCatalog[g.profileKey] || null;
                          var hasPoly = !!(polyEntry && polyEntry.outerHullMm && polyEntry.outerHullMm.length);
                          // ─── Cross-section orientation + coloured-face marker ─
                          // Each profile in the catalog declares which side of its
                          // cross-section is the exterior (colour-foiled) face via
                          // colouredFaceSide ('left' | 'right'). That setting lives
                          // in Settings → Products → Profiles → Geometry tab.
                          // Convention: catalog DXFs are drawn rebate-on-LEFT for
                          // outwards-opening systems (casement / awning) so the
                          // exterior is on the RIGHT; T&T / French door inwards-
                          // opening profiles flip this. Per-profile override means
                          // sliding/lift-slide/door members can be set independently.
                          // The polygon is NOT mirrored — we only move the red
                          // highlight to the correct edge so the operator sees the
                          // cross-section in its native catalog orientation.
                          var colouredSide = (polyEntry && polyEntry.colouredFaceSide) || 'right';
                          var oppositeSide = colouredSide === 'right' ? 'left' : 'right';
                          var extIsColoured = g.colourExt && g.colourExt !== 'white_body';
                          var intIsColoured = g.colourInt && g.colourInt !== 'white_body' && g.colourInt !== g.colourExt;
                          var redEdge = null;
                          if (extIsColoured) redEdge = colouredSide;
                          else if (intIsColoured) redEdge = oppositeSide;
                          var svgMarkup = hasPoly ? renderProfileSvg(polyEntry, {
                            padPx: 4, fillCol:'#f5f3ee', strokeCol:'#333', strokeWidth:0.5,
                            exteriorEdge: redEdge,
                          }) : '';
                          var extSwatch = colourSwatchFor(g.colourExt);
                          var intSwatch = colourSwatchFor(g.colourInt);
                          var sameColour = g.colourExt === g.colourInt;
                          var hasMitre = g.cuts.some(function(c){ return c.mitreEnds > 0; });
                          // Same swatch-ordering rule as the summary table:
                          // mirror the cross-section L → R reading order.
                          var bpFirst  = colouredSide === 'right' ? intSwatch : extSwatch;
                          var bpSecond = colouredSide === 'right' ? extSwatch : intSwatch;
                          var bpFirstLbl  = colouredSide === 'right' ? 'Interior' : 'Exterior';
                          var bpSecondLbl = colouredSide === 'right' ? 'Exterior' : 'Interior';
                          return (
                            <div key={k} style={{ marginBottom:14, background:'white', border:'1px solid '+T.border, borderRadius:4, padding:'10px 12px' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                                {hasPoly ? (
                                  <div style={{ width:90, height:54, flexShrink:0, borderRadius:3, border:'1px solid '+T.border, background:'white', padding:3 }}
                                       dangerouslySetInnerHTML={{ __html: svgMarkup }}/>
                                ) : (
                                  <div style={{ width:90, height:54, flexShrink:0, borderRadius:3, border:'1px dashed '+T.border, background:'#fafafa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:T.textMuted, textAlign:'center', lineHeight:1.2 }}>
                                    No DXF<br/>geometry
                                  </div>
                                )}
                                <div style={{ flex:1, display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
                                  <span style={{ fontWeight:700, fontSize:13 }}>{g.profileLabel}</span>
                                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:10, background:T.bgInput, padding:'2px 7px', borderRadius:3 }}>
                                    <span title={bpFirstLbl + ': ' + bpFirst.label} style={{ display:'inline-block', width:12, height:12, background:bpFirst.hex, border:'1px solid #ccc', borderRadius:2 }}/>
                                    {!sameColour && <span title={bpSecondLbl + ': ' + bpSecond.label} style={{ display:'inline-block', width:12, height:12, background:bpSecond.hex, border:'1px solid #ccc', borderRadius:2 }}/>}
                                    <span style={{ color:T.text, fontWeight:600 }}>{sameColour ? extSwatch.label : (bpFirst.label + ' / ' + bpSecond.label)}</span>
                                  </span>
                                  {hasMitre && (
                                    <span title="Frame & sash perimeter pieces are mitred at 45° both ends. Cut length includes weld burn-off allowance."
                                          style={{ fontSize:10, fontWeight:700, background:'#fef3c7', color:'#7c2d12', padding:'2px 6px', borderRadius:3, border:'1px solid #f59e0b', letterSpacing:0.3 }}>
                                      ⟋ MITRE 45°
                                    </span>
                                  )}
                                  <span title={'Source: ' + (g.profileSource || 'system default')}
                                        style={{ fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:3,
                                                 background: g.profileSource === 'settings link' ? '#dbeafe' : g.profileSource === 'frame override' ? '#fee2e2' : '#dcfce7',
                                                 color:    g.profileSource === 'settings link' ? '#1e3a8a' : g.profileSource === 'frame override' ? '#7f1d1d' : '#14532d',
                                                 border:   '1px solid ' + (g.profileSource === 'settings link' ? '#3b82f6' : g.profileSource === 'frame override' ? '#dc2626' : '#22c55e') }}>
                                    {g.profileSource || 'system default'}
                                  </span>
                                  <span style={{ fontSize:10, color:T.textMuted }}>
                                    {bp.barCount} × {g.barLengthMm}mm bar{bp.barCount === 1 ? '' : 's'} · used {bp.totalUsedMm.toLocaleString()}mm · kerf {bp.totalKerfMm}mm · offcut {bp.totalOffcutMm.toLocaleString()}mm ({bp.totalKeptOffcutMm.toLocaleString()}mm kept ≥{bp.offcutKeepMinMm}mm) · utilisation <b style={{ color: bp.utilisationPct >= 90 ? '#166534' : '#9a3412' }}>{bp.utilisationPct}%</b>
                                  </span>
                                </div>
                              </div>
                              {bp.bars.map(function(bar){
                                var totalLen = g.barLengthMm;
                                return (
                                  <div key={bar.barNo} style={{ marginBottom:6 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:T.textMuted, marginBottom:2 }}>
                                      <span style={{ fontWeight:700, color:T.text }}>Bar {bar.barNo}</span>
                                      <span>·</span>
                                      <span>{bar.cuts.length} cut{bar.cuts.length === 1 ? '' : 's'}</span>
                                      <span>·</span>
                                      <span>offcut {bar.offcutMm}mm{bar.offcutKept ? ' (KEEP)' : ' (scrap)'}</span>
                                    </div>
                                    <div style={{ display:'flex', height:14, fontSize:9, fontWeight:700, color:T.text, marginBottom:1 }}>
                                      {bar.cuts.map(function(c, ci){
                                        var pct = (c.lengthMm / totalLen) * 100;
                                        return (
                                          <div key={'lbl-'+ci}
                                               style={{ width: pct+'%', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', whiteSpace:'nowrap', padding:'0 2px' }}>
                                            {c.frameName}
                                          </div>
                                        );
                                      })}
                                      {bar.offcutMm > 0 && (
                                        <div style={{ width: (bar.offcutMm / totalLen) * 100 + '%' }}/>
                                      )}
                                    </div>
                                    <div style={{ display:'flex', height:24, border:'1px solid #d1d5db', borderRadius:3, overflow:'hidden', background:'#f9fafb', fontSize:9, color:'white', fontWeight:700 }}>
                                      {bar.cuts.map(function(c, ci){
                                        var pct = (c.lengthMm / totalLen) * 100;
                                        var bg = ['#3b82f6','#8b5cf6','#ec4899','#f59e0b','#10b981','#06b6d4'][ci % 6];
                                        var mitre = c.mitreEnds > 0;
                                        var memberLabel = c.member.replace(/_/g, ' ');
                                        return (
                                          <div key={ci} title={c.frameName + ' · ' + memberLabel + ' ' + c.side + ' · finished ' + c.baseLengthMm + 'mm + ' + c.weldAllowanceMm + 'mm allow = cut ' + c.lengthMm + 'mm' + (mitre ? ' (45° both ends)' : ' (butt)')}
                                               style={{ width: pct+'%', background:bg, borderRight:'1px solid white', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', whiteSpace:'nowrap', padding:'0 4px' }}>
                                            {mitre && <span style={{ marginRight:3, opacity:0.85 }}>⟋</span>}
                                            {c.lengthMm}
                                            {mitre && <span style={{ marginLeft:3, opacity:0.85 }}>⟍</span>}
                                          </div>
                                        );
                                      })}
                                      {bar.offcutMm > 0 && (
                                        <div title={'Offcut: ' + bar.offcutMm + 'mm' + (bar.offcutKept ? ' (KEEP)' : ' (scrap)')}
                                             style={{ width: (bar.offcutMm / totalLen) * 100 + '%', background: bar.offcutKept ? '#a7f3d0' : '#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', whiteSpace:'nowrap', padding:'0 4px', color: bar.offcutKept ? '#065f46' : '#7f1d1d' }}>
                                          {bar.offcutMm}
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:'2px 10px', fontSize:9, color:T.textMuted, marginTop:2 }}>
                                      {bar.cuts.map(function(c, ci){
                                        var mitre = c.mitreEnds > 0;
                                        var memberLabel = c.member.replace(/_/g, ' ');
                                        return (
                                          <span key={ci}>
                                            <b>{mitre ? '⟋' : ''}{c.lengthMm}mm{mitre ? '⟍' : ''}</b> {c.frameName} {memberLabel} {c.side}
                                            {mitre ? ' · 45° (' + c.baseLengthMm + '+' + c.weldAllowanceMm + ')' : ' · butt'}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })()}
              </div>
            );
          })()}

          {/* ─── MILLING TAB ───────────────────────────────────────────── */}
          {productionTab === 'milling' && (function(){
            if (typeof MILLING_SPECS === 'undefined' || typeof computeMillingForFrame !== 'function') {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>Milling module not loaded.</div>;
            }
            // Compute per-frame ops, only for frames with milling
            var perFrameOps = projectItems.map(function(f) {
              var m = (f && f.id && measurementsByFrameId && measurementsByFrameId[f.id]) || null;
              var ops = [];
              try { ops = computeMillingForFrame(f, m); } catch (e) { ops = []; }
              return { frame: f, ops: ops };
            }).filter(function(x){ return x.ops && x.ops.length > 0; });

            if (!perFrameOps.length) {
              return (
                <div style={{ padding:'14px 18px', background:T.bgPanel, border:'1px dashed '+T.border, borderRadius:8, fontSize:12, color:T.textMuted, textAlign:'center' }}>
                  <b>Milling Operations</b> — no operations for the current project. Milling specs apply to tilt &amp; turn windows; add a T&amp;T frame to see CNC drill / slot operations.
                </div>
              );
            }
            return (
              <div style={{ background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                <div style={{ marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:T.text }}>CNC Milling &amp; Drilling Operations</div>
                  <div style={{ fontSize:11, color:T.textMuted }}>
                    Per-frame drill / slot ops as they would be programmed at the CNC station. Catalogue lives in Settings → Products → Hardware &amp; milling.
                  </div>
                </div>
                {perFrameOps.map(function(entry){
                  var f = entry.frame;
                  return (
                    <div key={f.id} style={{ marginBottom:12, background:'white', border:'1px solid '+T.border, borderRadius:4, padding:'10px 12px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:700, fontSize:13, color:T.text }}>{f.name}</span>
                        <span style={{ fontSize:10, color:T.textMuted }}>{f.productType.replace(/_/g, ' ')} · {f.width}×{f.height} mm</span>
                        {f.room && <span style={{ fontSize:10, color:T.textMuted, background:T.bgInput, padding:'1px 6px', borderRadius:3 }}>{f.room}</span>}
                        <span style={{ fontSize:10, fontWeight:700, color:'#166534', background:'#dcfce7', padding:'2px 6px', borderRadius:3, border:'1px solid #22c55e' }}>{entry.ops.length} ops</span>
                      </div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                        <thead>
                          <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Op</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Type</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Member</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Surface</th>
                            <th style={{ textAlign:'right', padding:'4px 8px' }}>Along stile (mm)</th>
                            <th style={{ textAlign:'right', padding:'4px 8px' }}>Across face (mm)</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Tool</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.ops.map(function(op, oi){
                            var isSlot = op.kind === 'slot';
                            var size = isSlot ? (op.w + ' × ' + op.h + ' mm') : ('Ø' + op.dia + ' mm');
                            return (
                              <tr key={oi}>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', fontFamily:'monospace' }}>{op.operationId}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color: isSlot ? '#7c3aed' : '#0369a1', fontWeight:600 }}>{isSlot ? 'slot' : 'drill'}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{(op.member || '').replace(/_/g, ' ')}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{(op.surface || '').replace(/_/g, ' ')}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}>{op.alongStileMm}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}>{op.acrossFaceMm}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', fontFamily:'monospace' }}>{size}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color:T.textSub }}>{op.description}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                <div style={{ marginTop:10, padding:'10px 14px', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:4, fontSize:10, color:'#78350f', lineHeight:1.5 }}>
                  <strong>Datum rule:</strong> "along stile" is measured from a per-frame handle datum.
                  For tilt &amp; turn, the datum sits 1000 mm from the sash bottom on tall sashes (sash height &gt; 1200 mm),
                  or at the sash centre on shorter sashes. Surveyor's <em>Handle Height (mm offset)</em> shifts the datum.
                </div>
              </div>
            );
          })()}

          {/* ─── HARDWARE TAB ──────────────────────────────────────────── */}
          {productionTab === 'hardware' && (function(){
            if (typeof aggregateHardwareForProject !== 'function') {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>Hardware kit module not loaded.</div>;
            }
            var hw = aggregateHardwareForProject(projectItems);
            if (!hw.byFrame.length) {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>No frames in project.</div>;
            }
            return (
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-start' }}>
                {/* Per-frame breakdown */}
                <div style={{ flex:'2 1 540px', minWidth:540, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Hardware Kit — per frame</div>
                    <div style={{ fontSize:11, color:T.textMuted }}>What to fit at the assembly station for each opening.</div>
                  </div>
                  {hw.byFrame.map(function(fb, fi){
                    return (
                      <div key={fb.frameId || fi} style={{ marginBottom:12, background:'white', border:'1px solid '+T.border, borderRadius:4, padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
                          <span style={{ fontWeight:700, fontSize:13, color:T.text }}>{fb.frameName}</span>
                          <span style={{ fontSize:10, color:T.textMuted }}>{fb.kitLabel}</span>
                          {fb.qty > 1 && <span style={{ fontSize:10, fontWeight:700, color:'#7c2d12', background:'#fef3c7', padding:'1px 6px', borderRadius:3 }}>× {fb.qty}</span>}
                          {fb.room && <span style={{ fontSize:10, color:T.textMuted, background:T.bgInput, padding:'1px 6px', borderRadius:3 }}>{fb.room}</span>}
                        </div>
                        {fb.kitNotes && <div style={{ fontSize:10, color:T.textSub, fontStyle:'italic', marginBottom:6 }}>{fb.kitNotes}</div>}
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                          <thead>
                            <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                              <th style={{ textAlign:'right', padding:'4px 8px', width:50 }}>Qty</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Component</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Code</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Supplier</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fb.lines.map(function(c, ci){
                              return (
                                <tr key={ci}>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontWeight:700, fontFamily:'monospace' }}>{c.qty}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{c.name}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', fontFamily:'monospace', color:T.textMuted }}>{c.code || '—'}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color:T.textMuted }}>{c.supplier || '—'}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color:T.textSub, fontSize:9 }}>{c.description || ''}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
                {/* Project-wide aggregate */}
                <div style={{ flex:'1 1 320px', minWidth:320, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px', position:'sticky', top:0 }}>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Project total</div>
                    <div style={{ fontSize:11, color:T.textMuted }}>Order this from suppliers — qtys aggregated across all frames.</div>
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10, background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                    <thead>
                      <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                        <th style={{ textAlign:'right', padding:'4px 8px', width:40 }}>Qty</th>
                        <th style={{ textAlign:'left',  padding:'4px 8px' }}>Component</th>
                        <th style={{ textAlign:'left',  padding:'4px 8px' }}>Code</th>
                        <th style={{ textAlign:'left',  padding:'4px 8px' }}>Supplier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hw.items.map(function(c, ci){
                        return (
                          <tr key={ci}>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontWeight:700, fontFamily:'monospace' }}>{c.qty}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{c.name}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', fontFamily:'monospace', color:T.textMuted }}>{c.code || '—'}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color:T.textMuted }}>{c.supplier || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ─── GLASS TAB ─────────────────────────────────────────────── */}
          {productionTab === 'glass' && (function(){
            if (typeof aggregateGlassForProject !== 'function') {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>Glass module not loaded.</div>;
            }
            var pcConfig = (appSettings && appSettings.pricingConfig) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS) || {};
            var gl = aggregateGlassForProject(projectItems, pcConfig, appSettings);
            if (!gl.byFrame.length) {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>No frames in project.</div>;
            }
            return (
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-start' }}>
                {/* Per-frame panes */}
                <div style={{ flex:'2 1 540px', minWidth:540, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Glass — per frame</div>
                    <div style={{ fontSize:11, color:T.textMuted }}>Pane sizes for each aperture. Pane W×H = aperture inner − 6 mm bead clearance, sash openings further reduced by 2× sash sightline.</div>
                  </div>
                  {gl.byFrame.map(function(fb, fi){
                    return (
                      <div key={fb.frameId || fi} style={{ marginBottom:12, background:'white', border:'1px solid '+T.border, borderRadius:4, padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
                          <span style={{ fontWeight:700, fontSize:13, color:T.text }}>{fb.frameName}</span>
                          <span style={{ fontSize:10, color:T.textMuted }}>{fb.productType.replace(/_/g, ' ')}</span>
                          {fb.qty > 1 && <span style={{ fontSize:10, fontWeight:700, color:'#7c2d12', background:'#fef3c7', padding:'1px 6px', borderRadius:3 }}>× {fb.qty}</span>}
                          {fb.room && <span style={{ fontSize:10, color:T.textMuted, background:T.bgInput, padding:'1px 6px', borderRadius:3 }}>{fb.room}</span>}
                          <span style={{ fontSize:10, fontWeight:600, color:'#1e3a8a', background:'#dbeafe', padding:'1px 6px', borderRadius:3 }}>{fb.glassSpec}</span>
                        </div>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                          <thead>
                            <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Aperture</th>
                              <th style={{ textAlign:'right', padding:'4px 8px' }}>Pane W (mm)</th>
                              <th style={{ textAlign:'right', padding:'4px 8px' }}>Pane H (mm)</th>
                              <th style={{ textAlign:'right', padding:'4px 8px' }}>Area (m²)</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fb.panes.map(function(p, pi){
                              return (
                                <tr key={pi}>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{p.aperture}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{p.paneWidthMm}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{p.paneHeightMm}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{p.areaM2}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color: p.isSashed ? '#1e3a8a' : '#7c2d12' }}>{p.isSashed ? 'sash DGU' : 'fixed DGU'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
                {/* Project-wide aggregate */}
                <div style={{ flex:'1 1 320px', minWidth:320, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Project total</div>
                    <div style={{ fontSize:11, color:T.textMuted }}>Order this from glazier — identical sizes grouped. Total area: <b>{gl.totalAreaM2} m²</b></div>
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10, background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                    <thead>
                      <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                        <th style={{ textAlign:'right', padding:'4px 8px', width:40 }}>Qty</th>
                        <th style={{ textAlign:'left',  padding:'4px 8px' }}>Spec</th>
                        <th style={{ textAlign:'right', padding:'4px 8px' }}>W (mm)</th>
                        <th style={{ textAlign:'right', padding:'4px 8px' }}>H (mm)</th>
                        <th style={{ textAlign:'right', padding:'4px 8px' }}>Area (m²)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gl.items.map(function(g, gi){
                        return (
                          <tr key={gi}>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontWeight:700, fontFamily:'monospace' }}>{g.qty}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }} title={g.specLabel}>{g.spec}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}>{g.paneWidthMm}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}>{g.paneHeightMm}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>{g.areaM2}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* ─── STEEL TAB ─────────────────────────────────────────────── */}
          {productionTab === 'steel' && (function(){
            // Build steel cuts: for every frame, walk its profile members and
            // pull the linked steel reinforcement profile from the catalog.
            // Steel cuts are STRAIGHT (no mitre, no weld allowance) — they
            // sit inside the PVC chamber so they're sized to the inner
            // chamber length, typically (memberLength − 100mm). Using a
            // simple −100mm allowance here as the default; can be made
            // per-profile later if your factory uses a different inset.
            var pcConfig = (appSettings && appSettings.pricingConfig) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS) || {};
            var profilesCatalog = (pcConfig.profiles) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.profiles) || {};
            // Resolve which steel profile a given pvc profile uses. Catalog
            // entries with role:'reinforcement' that name a parent profile
            // via .reinforcesProfile are the linked steel inserts.
            function steelForPvc(pvcKey) {
              if (!pvcKey) return null;
              var pvc = profilesCatalog[pvcKey];
              if (!pvc) return null;
              if (!pvc.requiresSteelReinforcement) return null;
              if (pvc.steelProfileKey && profilesCatalog[pvc.steelProfileKey]) {
                return Object.assign({ key: pvc.steelProfileKey }, profilesCatalog[pvc.steelProfileKey]);
              }
              // Fallback: scan catalog for a reinforcement profile referencing this pvc
              for (var k in profilesCatalog) {
                var p = profilesCatalog[k];
                if (p && p.role === 'reinforcement' && p.reinforcesProfile === pvcKey) {
                  return Object.assign({ key: k }, p);
                }
              }
              return null;
            }

            // Walk every cut from the profile cutter (we already have
            // computeProfileCuts) and emit a steel cut wherever the parent
            // profile requires reinforcement.
            if (typeof computeProfileCuts !== 'function') {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>Profile cutlist module not loaded.</div>;
            }
            var pcResult;
            try { pcResult = computeProfileCuts(projectItems, pcConfig, appSettings); }
            catch (e) { return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>Failed to compute cuts: {e.message}</div>; }

            var STEEL_INSET_MM = 100;  // total length deduction (50mm each end)
            var steelCuts = [];
            (pcResult.cuts || []).forEach(function(c) {
              var steel = steelForPvc(c.profileKey);
              if (!steel) return;
              steelCuts.push({
                frameId: c.frameId,
                frameName: c.frameName,
                room: c.room,
                pvcKey: c.profileKey,
                pvcLabel: c.profileLabel,
                steelKey: steel.key,
                steelLabel: (steel.name || steel.key) + (steel.code ? ' (' + steel.code + ')' : ''),
                steelEntry: steel,
                member: c.member,
                side: c.side,
                pvcLengthMm: c.baseLengthMm,
                steelLengthMm: Math.max(0, c.baseLengthMm - STEEL_INSET_MM),
              });
            });

            if (!steelCuts.length) {
              return (
                <div style={{ padding:'14px 18px', background:T.bgPanel, border:'1px dashed '+T.border, borderRadius:8, fontSize:12, color:T.textMuted, textAlign:'center', lineHeight:1.6 }}>
                  <b>Steel Cut List</b> — no steel reinforcement required for the current project.
                  <br/><br/>
                  Steel inserts only appear here when a profile in <i>Settings → Products → Profiles</i>
                  has <b>Requires steel reinforcement</b> ticked AND a linked steel profile uploaded
                  (Geometry tab → Steel reinforcement section). The reinforcement profile itself is
                  uploaded as a separate DXF with role <code>reinforcement</code>.
                </div>
              );
            }

            // Group by steel profile for FFD-like aggregation
            var steelGroups = {};
            steelCuts.forEach(function(sc) {
              if (!steelGroups[sc.steelKey]) {
                steelGroups[sc.steelKey] = { key: sc.steelKey, label: sc.steelLabel, entry: sc.steelEntry, cuts: [], totalLengthMm: 0 };
              }
              steelGroups[sc.steelKey].cuts.push(sc);
              steelGroups[sc.steelKey].totalLengthMm += sc.steelLengthMm;
            });

            return (
              <div style={{ background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                <div style={{ marginBottom:10 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Steel Cut List</div>
                  <div style={{ fontSize:11, color:T.textMuted }}>
                    {steelCuts.length} cuts across {Object.keys(steelGroups).length} steel profile{Object.keys(steelGroups).length === 1 ? '' : 's'} · steel inset 50mm both ends ({STEEL_INSET_MM}mm total) · butt cut both ends, no weld allowance
                  </div>
                </div>
                {Object.keys(steelGroups).map(function(gk) {
                  var g = steelGroups[gk];
                  var hasGeom = !!(g.entry && g.entry.outerHullMm && g.entry.outerHullMm.length);
                  var svgMarkup = hasGeom ? renderProfileSvg(g.entry, { padPx:4, fillCol:'#cbd5e1', strokeCol:'#475569', strokeWidth:0.6 }) : '';
                  return (
                    <div key={gk} style={{ marginBottom:14, background:'white', border:'1px solid '+T.border, borderRadius:4, padding:'10px 12px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                        {hasGeom ? (
                          <div style={{ width:80, height:48, flexShrink:0, borderRadius:3, border:'1px solid '+T.border, background:'white', padding:3 }}
                               dangerouslySetInnerHTML={{ __html: svgMarkup }}/>
                        ) : (
                          <div style={{ width:80, height:48, flexShrink:0, borderRadius:3, border:'1px dashed '+T.border, background:'#fafafa', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:T.textMuted }}>
                            no DXF
                          </div>
                        )}
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:T.text }}>{g.label}</div>
                          <div style={{ fontSize:10, color:T.textMuted }}>
                            {g.cuts.length} cut{g.cuts.length === 1 ? '' : 's'} · total {g.totalLengthMm.toLocaleString()}mm
                          </div>
                        </div>
                      </div>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                        <thead>
                          <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Frame</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Member</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Side</th>
                            <th style={{ textAlign:'right', padding:'4px 8px' }}>PVC length (mm)</th>
                            <th style={{ textAlign:'right', padding:'4px 8px' }}>Steel CUT (mm)</th>
                            <th style={{ textAlign:'left',  padding:'4px 8px' }}>Inside profile</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.cuts.map(function(sc, ci) {
                            return (
                              <tr key={ci}>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{sc.frameName}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{sc.member.replace(/_/g, ' ')}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }}>{sc.side}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}>{sc.pvcLengthMm}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{sc.steelLengthMm}</td>
                                <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color:T.textSub }}>{sc.pvcLabel}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
                <div style={{ marginTop:10, padding:'10px 14px', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:4, fontSize:10, color:'#78350f', lineHeight:1.5 }}>
                  <strong>How steel cuts are derived:</strong> Steel length = PVC member length − {STEEL_INSET_MM}mm
                  (50mm at each end inside the PVC chamber). Both ends are butt-cut, no weld allowance.
                  Steel reinforcement is only generated for PVC profiles that have <b>Requires steel reinforcement</b>
                  ticked in Settings → Products → Profiles AND a linked steel profile (role <code>reinforcement</code>).
                </div>
              </div>
            );
          })()}

          {/* ─── ASSEMBLY TAB ──────────────────────────────────────────── */}
          {productionTab === 'assembly' && (function(){
            // Show assembly DXFs uploaded under Settings → Products → Product
            // types — restricted to product types actually used in the
            // current project so the factory floor sees only the assemblies
            // they need for this job. Each product type gets a card with its
            // rendered cross-section + frame count + per-frame sizes.
            var ptaMap = appSettings.productTypeAssemblies || {};
            var typesInProject = {};
            (projectItems || []).forEach(function(f) {
              if (!f || !f.productType) return;
              if (!typesInProject[f.productType]) typesInProject[f.productType] = [];
              typesInProject[f.productType].push(f);
            });
            var typeIds = Object.keys(typesInProject);
            // Partition into "has assembly" and "missing assembly" so we can
            // both render uploaded ones and warn about missing ones.
            var withAsm = typeIds.filter(function(id){ return ptaMap[id] && ptaMap[id].assembly && ptaMap[id].assembly.parsed; });
            var missing = typeIds.filter(function(id){ return !ptaMap[id] || !ptaMap[id].assembly || !ptaMap[id].assembly.parsed; });

            if (!typeIds.length) {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>No frames in project.</div>;
            }
            var ptList = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []);
            function ptLabel(id) { var pt = ptList.find(function(p){return p.id===id;}); return pt ? pt.label : id; }

            return (
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:T.text, marginBottom:4 }}>Assembly drawings</div>
                <div style={{ fontSize:11, color:T.textMuted, marginBottom:14 }}>
                  Cross-sections for the {typeIds.length} product type{typeIds.length === 1 ? '' : 's'} used in this project.
                  Colour-coded by layer: PVC, steel reinforcement, glass, gasket, glazing packer.
                  Upload or edit drawings in <b>Settings → Products → Product types</b>.
                </div>
                {missing.length > 0 && (
                  <div style={{ marginBottom:14, padding:'10px 14px', background:'#fef3c7', border:'1px solid #f59e0b', borderRadius:4, fontSize:11, color:'#7c2d12', lineHeight:1.5 }}>
                    <b>{missing.length} product type{missing.length === 1 ? '' : 's'}</b> in this project don't have an assembly DXF yet:
                    {' ' + missing.map(ptLabel).join(', ')}.
                    Cuts for these frames use legacy formulas. Upload section DXFs in Settings → Products → Product types.
                  </div>
                )}
                <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:16 }}>
                  {withAsm.map(function(typeId) {
                    var entry = ptaMap[typeId];
                    var asm = entry.assembly;
                    var frames = typesInProject[typeId];
                    var layerCount = Object.keys(asm.parsed.layers).length;
                    var ex = entry.metricsExtracted || {};
                    var ov = entry.metricsOverride || {};
                    function eff(k) { return (ov[k] != null) ? ov[k] : ex[k]; }
                    var hasOverrides = Object.keys(ov).length > 0;
                    return (
                      <div key={typeId} style={{ background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                        <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:6, flexWrap:'wrap' }}>
                          <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{ptLabel(typeId)}</div>
                          <span style={{ fontSize:10, fontFamily:'monospace', color:T.textMuted, background:T.bgInput, padding:'2px 6px', borderRadius:3 }}>{typeId}</span>
                          <span style={{ fontSize:10, fontWeight:600, color:'#1e3a8a', background:'#dbeafe', padding:'2px 6px', borderRadius:3 }}>{frames.length} frame{frames.length === 1 ? '' : 's'}</span>
                          {hasOverrides && <span title={Object.keys(ov).length + ' dimensions overridden in Settings'} style={{ fontSize:10, fontWeight:600, color:'#7c2d12', background:'#fef3c7', padding:'2px 6px', borderRadius:3 }}>OVERRIDES</span>}
                          <span style={{ fontSize:10, color:T.textMuted }}>{asm.parsed.primitives.length} entities · {layerCount} layers · {Math.round(asm.parsed.bbox.w)} × {Math.round(asm.parsed.bbox.h)} mm</span>
                        </div>
                        {entry.notes && <div style={{ fontSize:11, color:T.textSub, fontStyle:'italic', marginBottom:10 }}>{entry.notes}</div>}
                        <div style={{ width:'100%', height:560, background:'white', borderRadius:6, padding:12, border:'1px solid '+T.border }}>
                          <div style={{ width:'100%', height:'100%' }}
                            dangerouslySetInnerHTML={{ __html: renderAssemblySvg(asm.parsed, { padPx:4, rotateDeg: asm.rotateDeg || 0, showDimensions: !!asm.showDimensions }) }}/>
                        </div>
                        {/* Compact layer legend */}
                        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:8, fontSize:9, color:T.textMuted }}>
                          {(function(){
                            var seenLabels = {};
                            return Object.keys(asm.parsed.layers).sort().map(function(layer) {
                              var st = styleForLayer(layer);
                              if (st.skip || seenLabels[st.label]) return null;
                              seenLabels[st.label] = true;
                              return (
                                <span key={layer} style={{ display:'inline-flex', alignItems:'center', gap:4 }}>
                                  <span style={{ display:'inline-block', width:10, height:10, background: st.fill === 'none' ? 'transparent' : st.fill, border:'1px solid '+st.stroke, borderRadius:2 }}/>
                                  {st.label}
                                </span>
                              );
                            });
                          })()}
                        </div>
                        {/* Quick reference: the metrics that drive cuts for these frames */}
                        {(eff('frameSashGapMm') != null || eff('glassRebateDepthMm') != null || eff('sashSightlineMm') != null) && (
                          <div style={{ display:'flex', flexWrap:'wrap', gap:14, marginTop:10, padding:'8px 12px', background:'white', border:'1px solid '+T.border, borderRadius:4, fontSize:10, color:T.textSub }}>
                            <span><b>Frame–sash gap:</b> {eff('frameSashGapMm') != null ? eff('frameSashGapMm') + ' mm' : '—'}</span>
                            <span><b>Glass rebate:</b> {eff('glassRebateDepthMm') != null ? eff('glassRebateDepthMm') + ' × ' + (eff('glassRebateHeightMm') != null ? eff('glassRebateHeightMm') : '—') + ' mm' : '—'}</span>
                            <span><b>Sash–glass clearance:</b> {eff('sashGlassClearanceMm') != null ? eff('sashGlassClearanceMm') + ' mm' : '—'}</span>
                            <span><b>Frame:</b> {eff('frameSightlineMm') != null ? eff('frameSightlineMm') + ' × ' + (eff('frameDepthMm') || '—') + ' mm' : '—'}</span>
                            <span><b>Sash:</b> {eff('sashSightlineMm') != null ? eff('sashSightlineMm') + ' × ' + (eff('sashDepthMm') || '—') + ' mm' : '—'}</span>
                          </div>
                        )}
                        {/* Frames using this assembly */}
                        <details style={{ marginTop:8 }}>
                          <summary style={{ fontSize:10, color:T.textMuted, cursor:'pointer' }}>{frames.length} frame{frames.length === 1 ? '' : 's'} using this assembly</summary>
                          <div style={{ marginTop:6, fontSize:10, color:T.textSub, display:'flex', flexWrap:'wrap', gap:'4px 12px' }}>
                            {frames.map(function(f) { return <span key={f.id}><b>{f.name}</b> {f.width}×{f.height} mm{f.qty > 1 ? ' × ' + f.qty : ''}</span>; })}
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* ─── TRIMS TAB ─────────────────────────────────────────────
              Architraves, cover trims (e.g. 30T, 92x18 SB), and reveals,
              with cut lengths derived from frame dims + the per-family
              allowance (200mm default; 30mm for flange30). Selections
              live in measurementsByFrameId — they're populated during
              Check Measure, so this tab is empty (with a banner) until
              CM has been completed for at least one frame. The same
              data already ships to the CRM in msg.trimCutList AND is
              stored on cad_data.trimCutList by buildCadDataCache. */}
          {productionTab === 'trims' && (function(){
            if (typeof computeTrimCuts !== 'function') {
              return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>Trim cut module not loaded.</div>;
            }
            var pcConfig = (appSettings && appSettings.pricingConfig) || (typeof window !== 'undefined' && window.PRICING_DEFAULTS) || {};
            var trimCatalogs = (pcConfig && pcConfig.trims) || null;
            var measMap = measurementsByFrameId || {};
            var tc;
            try { tc = computeTrimCuts(projectItems, measMap, trimCatalogs, 200, appSettings); }
            catch (e) {
              console.warn('Trim cut compute failed:', e);
              return <div style={{ padding:24, color:'#7c2d12', fontSize:12 }}>Trim cut computation failed: {String(e && e.message || e)}</div>;
            }
            if (!tc || !tc.cuts || !tc.cuts.length) {
              return (
                <div style={{ padding:'14px 18px', background:T.bgPanel, border:'1px dashed '+T.border, borderRadius:8, fontSize:12, color:T.textMuted, textAlign:'center', maxWidth:640, margin:'24px auto' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:6 }}>No additional profile cuts yet</div>
                  <div>Architrave, cover trim, and reveal selections are captured during <b>Check Measure</b> — pick the profiles per frame in survey mode. Once at least one frame has selections, this tab populates with cut lengths, per-bar plans, and aggregate totals for the production line.</div>
                </div>
              );
            }
            // Group cuts by frame for the per-frame card list.
            var byFrame = {};
            tc.cuts.forEach(function(c){
              if (!byFrame[c.frameId]) byFrame[c.frameId] = { frameName: c.frameName, frameColourExt: c.frameColourExt, frameColourInt: c.frameColourInt, cuts: [] };
              byFrame[c.frameId].cuts.push(c);
            });
            var frameIds = Object.keys(byFrame);
            var trimKeys = Object.keys(tc.byTrim);
            // Project totals across all trim groups
            var totalCuts = tc.cuts.length;
            var totalLengthMm = 0;
            var totalBars = 0;
            trimKeys.forEach(function(k){
              var b = tc.byTrim[k];
              totalLengthMm += (b.totalLengthMm || 0);
              if (typeof b.barsRequired === 'number') totalBars += b.barsRequired;
            });
            return (
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-start' }}>
                {/* Per-frame breakdown */}
                <div style={{ flex:'2 1 540px', minWidth:540, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Additional profiles — per frame</div>
                    <div style={{ fontSize:11, color:T.textMuted }}>One row per cut. Allowance: 200 mm/cut (30 mm for flange30 family). Length = (W or H) + allowance, except reveals (exact finished length).</div>
                  </div>
                  {frameIds.map(function(fid){
                    var fb = byFrame[fid];
                    var extLbl = (fb.frameColourExt && fb.frameColourExt.label) || '—';
                    var intLbl = (fb.frameColourInt && fb.frameColourInt.label) || '—';
                    return (
                      <div key={fid} style={{ marginBottom:12, background:'white', border:'1px solid '+T.border, borderRadius:4, padding:'10px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
                          <span style={{ fontWeight:700, fontSize:13, color:T.text }}>{fb.frameName}</span>
                          <span style={{ fontSize:10, color:T.textMuted }}>Ext: {extLbl}</span>
                          <span style={{ fontSize:10, color:T.textMuted }}>Int: {intLbl}</span>
                          <span style={{ fontSize:10, fontWeight:600, color:'#1e3a8a', background:'#dbeafe', padding:'1px 6px', borderRadius:3 }}>{fb.cuts.length} cut{fb.cuts.length === 1 ? '' : 's'}</span>
                        </div>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10 }}>
                          <thead>
                            <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Surface</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Side</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Trim</th>
                              <th style={{ textAlign:'right', padding:'4px 8px' }}>Length (mm)</th>
                              <th style={{ textAlign:'left',  padding:'4px 8px' }}>Joint</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fb.cuts.map(function(c, ci){
                              return (
                                <tr key={ci}>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textTransform:'capitalize' }}>{c.surface}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textTransform:'capitalize' }}>{c.side}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }} title={c.catalogId || c.trimValue}>{c.trimLabel}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{c.lengthMm}</td>
                                  <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', color: c.jointStyle === 'mitre' ? '#7c2d12' : T.textMuted }}>{c.jointStyle || 'butt'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
                {/* Project-wide aggregate by trim type */}
                <div style={{ flex:'1 1 320px', minWidth:320, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:8, padding:'14px 18px' }}>
                  <div style={{ marginBottom:8 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Project total</div>
                    <div style={{ fontSize:11, color:T.textMuted }}>Bars required is a coarse estimate (totalLength ÷ barLength rounded up). The Bar Plan in the xlsx export uses an FFD packer for the actual cut sequence.</div>
                    <div style={{ fontSize:11, color:T.text, marginTop:6 }}>
                      <b>{totalCuts}</b> cuts &middot; <b>{(totalLengthMm/1000).toFixed(2)}</b> m total &middot; <b>{totalBars || '—'}</b> bars (est.)
                    </div>
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:10, background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                    {(function(){
                      // Show the Material Cost column only when at least one
                      // group has a cost computed. Today that's fly screens
                      // (frame metres × per-metre rate + per-unit miscellaneous);
                      // architraves/trims/reveals don't yet emit a cost on the
                      // byTrim entry, so the column stays hidden for them.
                      var hasCost = trimKeys.some(function(k){ return typeof tc.byTrim[k].totalMaterialCost === 'number'; });
                      return <thead>
                        <tr style={{ background:'#f4f6f8', color:T.textMuted, textTransform:'uppercase', fontSize:9 }}>
                          <th style={{ textAlign:'left',  padding:'4px 8px' }}>Trim</th>
                          <th style={{ textAlign:'right', padding:'4px 8px' }}>Cuts</th>
                          <th style={{ textAlign:'right', padding:'4px 8px' }}>Total (mm)</th>
                          <th style={{ textAlign:'right', padding:'4px 8px' }}>Bars</th>
                          {hasCost && <th style={{ textAlign:'right', padding:'4px 8px' }}>Material&nbsp;($)</th>}
                        </tr>
                      </thead>;
                    })()}
                    <tbody>
                      {trimKeys.map(function(k){
                        var b = tc.byTrim[k];
                        var hasCost = trimKeys.some(function(kk){ return typeof tc.byTrim[kk].totalMaterialCost === 'number'; });
                        return (
                          <tr key={k}>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0' }} title={b.isCatalogItem ? ('catalog: ' + k) : ('legacy code: ' + k)}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                {b.profileImage && (
                                  <img src={b.profileImage} alt="profile cross-section"
                                       style={{ width:32, height:32, objectFit:'contain', border:'1px solid '+T.border, borderRadius:3, background:'#f8f8f8', flexShrink:0 }}/>
                                )}
                                <span>
                                  {b.label}
                                  {!b.isCatalogItem && <span style={{ fontSize:9, color:'#7c2d12', marginLeft:4 }}>(legacy)</span>}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontWeight:700, fontFamily:'monospace' }}>{b.cutCount}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}>{b.totalLengthMm}</td>
                            <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}>{b.barsRequired == null ? '—' : b.barsRequired}</td>
                            {hasCost && (
                              <td style={{ padding:'3px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace' }}
                                  title={typeof b.totalMaterialCost === 'number' ?
                                    ('Frame: $' + (b.frameMaterialCost || 0).toFixed(2) +
                                     ' (' + (b.totalLengthMm/1000).toFixed(2) + 'm × $' + (b.flyScreenFramePerMetre || 0).toFixed(2) + '/m) +' +
                                     ' Misc: $' + (b.miscMaterialCost || 0).toFixed(2) +
                                     ' (' + (b.numScreens || 0) + ' screen' + ((b.numScreens || 0) === 1 ? '' : 's') + ' × $' + (b.flyScreenPerUnit || 0).toFixed(2) + ')') : '—'}>
                                {typeof b.totalMaterialCost === 'number' ? '$' + b.totalMaterialCost.toFixed(2) : '—'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ fontSize:10, color:T.textMuted, marginTop:8, fontStyle:'italic' }}>
                    Full cut detail + FFD bar plan are in the xlsx export (top-right) — the CRM also receives this list as <code>cadData.trimCutList</code> for downstream production handoff.
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      </div>}

      {/* ─── Search dropdown — small floating panel from top-right ──────
          Toggled by the Search button in the top bar. Reads from the
          builds index (no need to load full builds for a search hit) and
          filters by substring across customerName / address / jobNumber /
          quoteNumber. Click a result to load it. */}
      {showBuildSearch && (function(){
        var idx = (window.SpartanBuildStorage && window.SpartanBuildStorage.loadIndex()) || [];
        return (
          <div style={{ position:'fixed', top:42, right:16, zIndex:10000, width:480, maxHeight:'70vh', background:'white', border:'1px solid #ccc', borderRadius:6, boxShadow:'0 8px 32px rgba(0,0,0,0.25)', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'10px 12px', borderBottom:'1px solid #eee', display:'flex', alignItems:'center', gap:8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
              <input type="text" id="build-search-input"
                     autoFocus
                     placeholder="Search by customer, address, job, or quote number…"
                     onChange={function(e){ setBuildSearchQuery(e.target.value); }}
                     style={{ flex:1, border:'none', outline:'none', fontSize:13, background:'transparent' }}/>
              <button onClick={function(){ setShowBuildSearch(false); }}
                      style={{ background:'transparent', border:'none', cursor:'pointer', fontSize:14, color:'#999' }}>✕</button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {idx.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', fontSize:12, color:'#999' }}>
                  No saved builds yet. Builds auto-save 2 seconds after each edit.
                </div>
              ) : (function(){
                var q = (buildSearchQuery || '').toLowerCase().trim();
                var rows = idx.filter(function(r){
                  if (!q) return true;
                  var hay = ((r.customerName || '') + ' ' + (r.address || '') + ' ' + (r.jobNumber || '') + ' ' + (r.quoteNumber || '')).toLowerCase();
                  return hay.indexOf(q) !== -1;
                });
                if (rows.length === 0) return (
                  <div style={{ padding:24, textAlign:'center', fontSize:12, color:'#999' }}>
                    No matches for "{buildSearchQuery}".
                  </div>
                );
                return rows.map(function(r){
                  var isActive = r.buildId === activeBuildId;
                  var when = r.lastSaved ? new Date(r.lastSaved) : null;
                  var whenStr = when ? when.toLocaleString() : '—';
                  return (
                    <div key={r.buildId}
                         onClick={function(){
                           // Always open on click — even if this is already
                           // the active build, the user expects something
                           // to happen (and a reload from storage doesn't
                           // hurt; if anything, it recovers from any
                           // unsaved-on-screen-only weirdness).
                           if (!isActive && quoteDirty && projectItems && projectItems.length > 0) {
                             if (!confirm('Switch builds? Save your current changes first if you want to keep them.')) return;
                           }
                           var ok = loadBuildIntoEditor(r.buildId);
                           if (!ok) alert('Could not open this build — its data is missing or corrupted in storage.');
                         }}
                         style={{ padding:'10px 14px', borderBottom:'1px solid #f0f0f0', cursor:'pointer', background: isActive ? '#fff7e6' : 'transparent' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#222' }}>
                          {r.customerName || <span style={{ color:'#999', fontStyle:'italic' }}>Unnamed build</span>}
                          {isActive && <span style={{ marginLeft:6, fontSize:9, fontWeight:600, color:'#1d4ed8', background:'#dbeafe', padding:'1px 6px', borderRadius:3 }}>ACTIVE</span>}
                        </div>
                        <div style={{ fontSize:10, color:'#999', fontFamily:'monospace' }}>{r.frameCount} frame{r.frameCount === 1 ? '' : 's'}</div>
                      </div>
                      {r.address && <div style={{ fontSize:11, color:'#666', marginTop:2 }}>{r.address}</div>}
                      <div style={{ display:'flex', gap:10, marginTop:4, fontSize:10, color:'#999' }}>
                        {r.jobNumber && <span>Job: <b style={{ color:'#555' }}>{r.jobNumber}</b></span>}
                        {r.quoteNumber && <span>Quote: <b style={{ color:'#555' }}>{r.quoteNumber}</b></span>}
                        <span style={{ marginLeft:'auto' }}>{whenStr}</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <div style={{ padding:'8px 12px', borderTop:'1px solid #eee', fontSize:10, color:'#999', display:'flex', justifyContent:'space-between' }}>
              <span>{idx.length} build{idx.length === 1 ? '' : 's'} saved locally</span>
              <span style={{ cursor:'pointer', color:'#1d4ed8' }} onClick={function(){ setShowBuildSearch(false); setShowBuildsPanel(true); }}>
                Open Builds panel →
              </span>
            </div>
          </div>
        );
      })()}

      {/* ─── Builds panel — full-screen modal ──────────────────────────
          Lists every saved build with edit / load / delete / download.
          For the active build, also lists snapshots with restore.
          Footer: Download all / Restore from file / Storage usage. */}
      {showBuildsPanel && (function(){
        var idx = (window.SpartanBuildStorage && window.SpartanBuildStorage.loadIndex()) || [];
        var usageBytes = (window.SpartanBuildStorage && window.SpartanBuildStorage.storageUsageBytes()) || 0;
        var usageKB = (usageBytes / 1024).toFixed(0);
        var usageMB = (usageBytes / 1024 / 1024).toFixed(2);
        return (
          <div style={{ position:'fixed', inset:0, zIndex:9999, background:'#f4f6f8', display:'flex', flexDirection:'column', fontFamily:"'Segoe UI',Tahoma,Geneva,Verdana,sans-serif" }}>
            <div style={{ height:40, background:'#1a1a1a', display:'flex', alignItems:'center', padding:'0 16px', gap:14, flexShrink:0 }}>
              <div onClick={function(){ setShowBuildsPanel(false); }} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:6, color:'rgba(255,255,255,0.6)', fontSize:13 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
                Back
              </div>
              <span style={{ color:'white', fontSize:13, fontWeight:600 }}>Builds</span>
              <span style={{ color:'rgba(255,255,255,0.4)', fontSize:11 }}>{idx.length} saved · {usageBytes >= 1024*1024 ? usageMB+' MB' : usageKB+' KB'}</span>
              <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
                <button onClick={function(){
                          if (!window.SpartanBuildStorage || typeof window.SpartanBuildStorage.mergeSupabaseIndex !== 'function') {
                            alert('Cloud sync not available. Make sure 41-build-storage.js is loaded.');
                            return;
                          }
                          window.SpartanBuildStorage.mergeSupabaseIndex().then(function(r) {
                            if (!r.ok) {
                              alert('Could not reach cloud: ' + (r.reason || 'unknown') + '.\n\nMake sure Supabase is configured and the cad_builds table exists. See 41-build-storage.js for the schema.');
                              return;
                            }
                            var msg = 'Synced from cloud:\n• ' + r.added + ' new build' + (r.added === 1 ? '' : 's') + ' added\n• ' + r.updated + ' updated\n• ' + r.total + ' total in cloud';
                            alert(msg);
                            setBuildsLastSavedTs(Date.now());
                          }).catch(function(err) {
                            alert('Cloud sync failed: ' + (err && err.message ? err.message : 'unknown'));
                          });
                        }}
                        title="Pull all cloud-saved builds into this device"
                        style={{ background:'#16a34a', color:'white', border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                  ☁ Sync from cloud
                </button>
                <button onClick={function(){
                          var data = window.SpartanBuildStorage.downloadAllBuildsJSON();
                          alert('Downloaded ' + Object.keys(data.builds || {}).length + ' build(s). Keep the file safe — it\'s your off-machine backup.');
                        }}
                        style={{ background:'#1d4ed8', color:'white', border:'none', borderRadius:5, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                  ⬇ Download backup
                </button>
                <input type="file" accept="application/json" id="builds-restore-input" style={{ display:'none' }}
                       onChange={function(e){
                         var f = e.target.files && e.target.files[0];
                         if (!f) return;
                         var reader = new FileReader();
                         reader.onload = function(ev){
                           var report = window.SpartanBuildStorage.restoreBuildsFromJSON(ev.target.result);
                           var msg = 'Restore complete:\n• ' + report.imported + ' imported\n• ' + report.skipped + ' skipped (older than local)';
                           if (report.errors.length) msg += '\n\nErrors:\n' + report.errors.join('\n');
                           alert(msg);
                           setBuildsLastSavedTs(Date.now());
                         };
                         reader.onerror = function(){ alert('Could not read file.'); };
                         reader.readAsText(f);
                         e.target.value = '';
                       }}/>
                <label htmlFor="builds-restore-input"
                       style={{ background:'rgba(255,255,255,0.1)', color:'white', border:'1px solid rgba(255,255,255,0.2)', borderRadius:5, padding:'5px 12px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                  ⬆ Restore from file
                </label>
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'24px 32px' }}>
              {idx.length === 0 ? (
                <div style={{ padding:'60px 40px', textAlign:'center', color:'#666', fontSize:13 }}>
                  <div style={{ fontSize:36, marginBottom:12, color:'#bbb' }}>📁</div>
                  <div style={{ fontWeight:600, fontSize:15, color:'#333', marginBottom:6 }}>No saved builds yet</div>
                  <div style={{ maxWidth:480, margin:'0 auto', lineHeight:1.5 }}>
                    Builds auto-save 2 seconds after each edit. Add some frames in the editor and they'll appear here automatically.
                  </div>
                </div>
              ) : (
                <div style={{ display:'flex', gap:24, alignItems:'flex-start' }}>
                  {/* Builds list */}
                  <div style={{ flex:'1 1 0', minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'#333', marginBottom:10 }}>All builds <span style={{ color:'#999', fontWeight:400, marginLeft:4 }}>({idx.length})</span></div>
                    {idx.map(function(r){
                      var isActive = r.buildId === activeBuildId;
                      var when = r.lastSaved ? new Date(r.lastSaved) : null;
                      var whenStr = when ? when.toLocaleString() : '—';
                      var sizeKB = r.sizeBytes ? (r.sizeBytes / 1024).toFixed(1) : '?';
                      return (
                        <div key={r.buildId}
                             style={{ marginBottom:8, padding:'12px 16px', background:'white', border:'1px solid '+(isActive ? '#fbbf24' : '#e5e7eb'), borderRadius:6, boxShadow:isActive ? '0 0 0 2px #fef3c7' : 'none' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:10, marginBottom:4 }}>
                            <div>
                              <span style={{ fontSize:14, fontWeight:600, color:'#222' }}>{r.customerName || <span style={{ color:'#999', fontStyle:'italic' }}>Unnamed build</span>}</span>
                              {isActive && <span style={{ marginLeft:8, fontSize:9, fontWeight:600, color:'#92400e', background:'#fef3c7', padding:'2px 8px', borderRadius:3 }}>ACTIVE</span>}
                              <span style={{ marginLeft:8, fontSize:9, color:'#999', fontFamily:'monospace' }}>{r.buildId.slice(0, 24)}{r.buildId.length > 24 ? '…' : ''}</span>
                            </div>
                            <div style={{ display:'flex', gap:6 }}>
                              <button onClick={function(){
                                        if (!isActive && quoteDirty && projectItems && projectItems.length > 0) {
                                          if (!confirm('Open this build? Save your current changes first if you want to keep them.')) return;
                                        }
                                        var ok = loadBuildIntoEditor(r.buildId);
                                        if (!ok) alert('Could not open this build — its data is missing or corrupted in storage.');
                                      }}
                                      title={isActive ? 'Reload this build from storage (refresh in case of stale state)' : 'Open this build in the editor'}
                                      style={{ background:'#1d4ed8', color:'white', border:'none', borderRadius:4, padding:'4px 10px', cursor:'pointer', fontSize:10, fontWeight:600 }}>
                                {isActive ? 'Reload' : 'Open'}
                              </button>
                              <button onClick={function(){
                                        var data = window.SpartanBuildStorage.loadBuild(r.buildId);
                                        if (!data) return alert('Build not found.');
                                        var blob = new Blob([JSON.stringify({ _format:'spartan_cad_builds_v1', _version:1, _exportedAt:new Date().toISOString(), index:[r], builds:{[r.buildId]:data}, snapshots:{} }, null, 2)], { type:'application/json' });
                                        var url = URL.createObjectURL(blob);
                                        var ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
                                        var a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'build-' + (r.customerName ? r.customerName.replace(/[^a-z0-9]/gi,'_') : r.buildId) + '-' + ts + '.json';
                                        document.body.appendChild(a); a.click();
                                        setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
                                      }}
                                      style={{ background:'transparent', color:'#1d4ed8', border:'1px solid #ccc', borderRadius:4, padding:'4px 10px', cursor:'pointer', fontSize:10 }}>
                                ⬇ Export
                              </button>
                              <button onClick={function(){
                                        if (!confirm('Delete this build? This cannot be undone unless you have a downloaded backup file.')) return;
                                        window.SpartanBuildStorage.deleteBuild(r.buildId);
                                        // Mirror the delete to Supabase so the cloud
                                        // doesn't keep reviving deleted builds when
                                        // another device syncs.
                                        if (typeof window.SpartanBuildStorage.deleteBuildFromSupabase === 'function') {
                                          try { window.SpartanBuildStorage.deleteBuildFromSupabase(r.buildId); } catch (e) {}
                                        }
                                        setBuildsLastSavedTs(Date.now());
                                        if (r.buildId === activeBuildId) setActiveBuildId(null);
                                      }}
                                      style={{ background:'transparent', color:'#dc2626', border:'1px solid '+(isActive ? '#fbbf24' : '#fecaca'), borderRadius:4, padding:'4px 10px', cursor:'pointer', fontSize:10 }}>
                                Delete
                              </button>
                            </div>
                          </div>
                          {r.address && <div style={{ fontSize:11, color:'#555', marginBottom:4 }}>{r.address}</div>}
                          <div style={{ display:'flex', gap:14, fontSize:10, color:'#999', flexWrap:'wrap' }}>
                            {r.jobNumber && <span>Job: <b style={{ color:'#555' }}>{r.jobNumber}</b></span>}
                            {r.quoteNumber && <span>Quote: <b style={{ color:'#555' }}>{r.quoteNumber}</b></span>}
                            <span>Frames: <b style={{ color:'#555' }}>{r.frameCount}</b></span>
                            <span>Size: <b style={{ color:'#555' }}>{sizeKB} KB</b></span>
                            <span>Phase: <b style={{ color:'#555' }}>{r.phase || 'design'}</b></span>
                            <span style={{ marginLeft:'auto' }}>Saved: {whenStr}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Full-screen Settings — WindowCAD style */}
      {showSettings && <div style={{ position:'fixed', inset:0, zIndex:9999, background:T.bg, display:'flex', flexDirection:'column', fontFamily:"'Segoe UI',Tahoma,Geneva,Verdana,sans-serif" }}>
        {/* Top bar — dark */}
        <div style={{ height:40, background:'#1a1a1a', display:'flex', alignItems:'center', padding:'0 16px', gap:14, flexShrink:0 }}>
          <div onClick={() => setShowSettings(false)} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:6, color:'rgba(255,255,255,0.6)', fontSize:13 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
            Settings
          </div>
          <div onClick={async () => {
              const res = await forceSaveAppSettings();
              if (res && res.ok) {
                // Auto-close on success so the user gets the same UX as before,
                // but only after the upsert has actually landed.
                setTimeout(function(){ setShowSettings(false); }, 250);
              }
              // On error, leave the panel open so the user sees the status.
            }} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'rgba(255,255,255,0.85)', fontSize:12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/></svg>
            Save
          </div>
          {/* Save status badge — narrates whether autosave / explicit save is in flight. */}
          {saveStatus !== 'idle' && (
            <div style={{
              fontSize:10, padding:'2px 8px', borderRadius:10, letterSpacing:0.3,
              background: saveStatus === 'error' ? 'rgba(239,68,68,0.15)'
                        : saveStatus === 'saving' ? 'rgba(255,255,255,0.10)'
                        : 'rgba(34,197,94,0.20)',
              color: saveStatus === 'error' ? '#fca5a5'
                   : saveStatus === 'saving' ? 'rgba(255,255,255,0.7)'
                   : '#86efac',
            }}>
              {saveStatus === 'saving' ? 'Saving…'
                : saveStatus === 'saved' ? 'Saved'
                : 'Save failed — click Save to retry'}
            </div>
          )}
          <div style={{ flex:1 }}/>
          <img src={SPARTAN_LOGO} alt="Spartan DG" style={{ height:28 }}/>
        </div>

        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {/* LEFT SIDEBAR — light, matching WindowCAD */}
          <div style={{ width:165, background:T.bgPanel, borderRight:'1px solid #e0e0e0', overflowY:'auto', flexShrink:0, padding:'6px 0', fontSize:13 }}>
            {[
              {key:'account', label:'Account', items:[
                {id:'personalisation', label:'Personalisation', icon:'☼'},
                {id:'passwords', label:'Passwords', icon:'🔒'},
              ]},
              {key:'products', label:'Products', items:[
                {id:'prod-colours', label:'Colours', icon:'◔'},
                {id:'prod-profiles', label:'Profiles', icon:'◱'},
                {id:'prod-glazing', label:'Glazing', icon:'◻'},
                {id:'prod-framestyles', label:'Frame styles', icon:'◫'},
                {id:'prod-customlayouts', label:'Custom layouts', icon:'▦'},
                {id:'prod-types',         label:'Product types',  icon:'❑'},
                {id:'prod-mullions',      label:'Mullions',       icon:'╫'},
                {id:'prod-hardware', label:'Hardware & milling', icon:'⚒'},
              ]},
              {key:'pricing', label:'Pricing', items:[
                {id:'price-steel', label:'Steel costs', icon:'⊞'},
                {id:'price-glass', label:'Glass IGU costs', icon:'◻'},
                {id:'price-hardware', label:'Hardware costs', icon:'⊕'},
                {id:'price-beads', label:'Glazing beads', icon:'◱'},
                {id:'price-production', label:'Production times', icon:'⏱'},
                {id:'price-install', label:'Install times', icon:'⚒'},
                {id:'price-labour', label:'Labour rates', icon:'♟'},
                {id:'price-markups', label:'Markups & price lists', icon:'%'},
                {id:'price-ancillaries', label:'Ancillaries', icon:'⊕'},
              ]},
              {key:'catalogs', label:'Catalogs', items:[
                {id:'catalog-trims',       label:'Trims (cover mouldings)', icon:'▭'},
                {id:'catalog-architraves', label:'Architraves',             icon:'▥'},
                {id:'catalog-quads',       label:'Quads',                   icon:'◷'},
                {id:'catalog-hardwood',    label:'Hardwood (DAR)',          icon:'▦'},
                {id:'catalog-reveals',     label:'Reveals',                 icon:'▤'},
                {id:'catalog-flyscreens',  label:'Fly screens',             icon:'▦'},
              ]},
              {key:'renderer', label:'3D Renderer', items:[
                {id:'render-quality', label:'Render quality', icon:'✦'},
              ]},
              {key:'projects', label:'Projects', items:[
                {id:'statuses', label:'Statuses', icon:'☰'},
                {id:'info', label:'Info', icon:'⊞'},
                {id:'ancillaries', label:'Ancillaries', icon:'⊕'},
              ]},
              {key:'frames', label:'Frames', items:[
                {id:'frame-info', label:'Info', icon:'⊞'},
              ]},
              {key:'printing', label:'Printing', items:[
                {id:'page-setup', label:'Page setup', icon:'▤'},
                {id:'forewords', label:'Forewords', icon:'☰'},
                {id:'terms', label:'Terms', icon:'☰'},
                {id:'documents', label:'Documents', icon:'☰'},
                {id:'signing', label:'Signing', icon:'✎'},
              ]},
              {key:'integrations', label:'Integrations', items:[
                {id:'crm-connection', label:'CRM Connection', icon:'⚯'},
              ]},
            ].map(sec => (
              <div key={sec.key}>
                <div onClick={() => setSidebarOpen(p => ({...p,[sec.key]:!p[sec.key]}))} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, fontWeight:600, color:T.text, display:'flex', alignItems:'center', gap:4, userSelect:'none' }}>
                  <span style={{ fontSize:8, color:T.textMuted, transform: sidebarOpen[sec.key] ? 'rotate(90deg)' : 'rotate(0deg)', transition:'0.15s', display:'inline-block' }}>▶</span>
                  {sec.label}
                </div>
                {sidebarOpen[sec.key] && sec.items.map(item => (
                  <div key={item.id} onClick={() => { setSettingsPath(item.id); setSettingsListIdx(0); }}
                    style={{ padding:'6px 12px 6px 28px', cursor:'pointer', fontSize:12, color: settingsPath===item.id ? '#333' : '#666',
                    background: settingsPath===item.id ? '#e8e8f0' : 'transparent',
                    borderLeft: settingsPath===item.id ? '3px solid ' + appSettings.accentColour : '3px solid transparent',
                    fontWeight: settingsPath===item.id ? 600 : 400 }}>
                    {item.label}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* RIGHT CONTENT */}
          <div style={{ flex:1, overflowY:'auto', background:T.bg }}>
            {(() => {
              const field = (label, value, onChange, type) => (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>{label}</div>
                  {type === 'textarea' ? 
                    <textarea value={value} onChange={e => onChange(e.target.value)} style={{ width:'100%', maxWidth:400, padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'inherit', background:T.bgInput, color:T.text, resize:'vertical', height:120 }}/> :
                    <input value={value} onChange={e => onChange(e.target.value)} type={type||'text'} style={{ width:'100%', maxWidth:400, padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'inherit', background:T.bgInput, color:T.text }}/>
                  }
                </div>
              );
              const toggle = (label, value, onChange) => (
                <div style={{ marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
                  <div onClick={() => onChange(!value)} style={{ width:34, height:18, borderRadius:9, background: value ? '#5b5fc7' : '#ccc', cursor:'pointer', padding:2, transition:'0.2s' }}>
                    <div style={{ width:14, height:14, borderRadius:7, background:T.bgPanel, transform: value ? 'translateX(16px)' : '', transition:'0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                  </div>
                  <span style={{ fontSize:12, color:T.text }}>{value ? 'On' : 'Off'}</span>
                  <span style={{ fontSize:12, color:T.text, marginLeft:4 }}>{label}</span>
                </div>
              );
              const listSwap = (list, setList, dir) => {
                const to = settingsListIdx + dir;
                if (to < 0 || to >= list.length) return;
                const n = [...list]; const tmp = n[settingsListIdx]; n[settingsListIdx] = n[to]; n[to] = tmp;
                setList(n); setSettingsListIdx(to);
              };
              const toolbar = (onNew, onDelete, onUp, onDown) => (
                <div style={{ padding:'8px 16px', borderBottom:'1px solid '+T.border, background:T.bgCard, display:'flex', gap:16, fontSize:12, color:T.text }}>
                  {onNew && <div onClick={onNew} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}><span style={{fontSize:14}}>+</span> New</div>}
                  {onDelete && <div onClick={onDelete} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>🗑 Delete</div>}
                  {onUp && <div onClick={onUp} style={{ cursor:'pointer' }}>&#8593; Up</div>}
                  {onDown && <div onClick={onDown} style={{ cursor:'pointer' }}>&#8595; Down</div>}
                </div>
              );

              // === PERSONALISATION ===
              if (settingsPath === 'personalisation') return <div style={{ padding:24 }}>
                <div style={{ background:T.bgPanel, borderRadius:8, padding:20, marginBottom:16, border:'1px solid '+T.border }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:12 }}>Theme</div>
                  <div style={{ display:'flex', gap:8 }}>
                    {['light','dark'].map(t => (
                      <div key={t} onClick={() => setAppSettings(p => ({...p, theme:t}))} style={{ padding:'16px 24px', border: appSettings.theme===t ? '2px solid '+appSettings.accentColour : '2px solid #e0e0e0', borderRadius:8, textAlign:'center', cursor:'pointer', background: appSettings.theme===t ? (t==='dark' ? '#1e1e2e' : '#fff') : 'transparent', color: appSettings.theme===t ? (t==='dark' ? '#fff' : '#333') : '#999' }}>
                        <div style={{ fontSize:18 }}>{t==='light' ? '\u2600' : '\u263D'}</div>
                        <div style={{ fontSize:11, marginTop:4 }}>{t==='light' ? 'Light' : 'Dark'}</div>
                        {appSettings.theme===t && <div style={{ width:6, height:6, borderRadius:3, background:appSettings.accentColour, margin:'4px auto 0' }}/>}
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background:T.bgPanel, borderRadius:8, padding:20, border:'1px solid '+T.border }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>Accent</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:12 }}>Current: <span style={{ color:appSettings.accentColour, fontWeight:700 }}>{appSettings.accentColour}</span></div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                    {['#c41230','#C8A951','#D4A843','#E8C840','#C94040','#E07040','#F0A040',
                      '#983838','#D04048','#882888','#7848A8','#4848B8','#4070C8',
                      '#6848C8','#A848C8','#3868A8','#2858A0','#5080D0','#68B8D8',
                      '#285848','#308848','#48A850','#50B868','#78C868','#A8D848'].map(c => (
                      <div key={c} onClick={() => setAppSettings(p => ({...p, accentColour:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border: appSettings.accentColour===c ? '3px solid #333' : '3px solid transparent', boxSizing:'border-box', transition:'0.15s' }}/>
                    ))}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ fontSize:11, color:T.textSub }}>Custom hex:</div>
                    <input value={appSettings.accentColour} onChange={e => setAppSettings(p => ({...p, accentColour:e.target.value}))} style={{ width:100, padding:'4px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                    <div style={{ width:24, height:24, borderRadius:4, background:appSettings.accentColour, border:'1px solid '+T.border }}/>
                  </div>
                </div>
                <div style={{ background:dk?'#22222c':'#fff', borderRadius:8, padding:20, border:'1px solid '+(dk?'#333340':'#e8e8e8'), marginTop:16 }}>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4, color:T.text }}>Text Colour</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:12 }}>Current: <span style={{ color:appSettings.textColour, fontWeight:700 }}>{appSettings.textColour}</span></div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                    {['#000000','#1a1a1a','#333333','#555555','#777777','#999999',
                      '#ffffff','#e0e0e0','#c0c0c0','#a0a0a0',
                      '#1e293b','#334155','#0f172a','#f8fafc'].map(c => (
                      <div key={c} onClick={() => setAppSettings(p => ({...p, textColour:c}))} style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border: appSettings.textColour===c ? '3px solid '+(dk?'#fff':'#000') : '3px solid transparent', boxSizing:'border-box', boxShadow:'inset 0 0 0 1px rgba(128,128,128,0.3)' }}/>
                    ))}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ fontSize:11, color:T.textSub }}>Custom hex:</div>
                    <input value={appSettings.textColour} onChange={e => setAppSettings(p => ({...p, textColour:e.target.value}))} style={{ width:100, padding:'4px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                    <div style={{ width:24, height:24, borderRadius:4, background:appSettings.textColour, border:'1px solid '+T.border }}/>
                    <div style={{ fontSize:11, color:T.textMuted, marginLeft:8 }}>Preview: <span style={{ color:appSettings.textColour }}>The quick brown fox</span></div>
                  </div>
                </div>
              </div>;

              // === PASSWORDS ===
              if (settingsPath === 'passwords') return <div style={{ padding:24 }}>
                <div style={{ background:T.bgPanel, borderRadius:8, padding:20, border:'1px solid '+T.border, maxWidth:400 }}>
                  <div style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>Change Password</div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Current password</div>
                    <input id="pw-cur" type="password" style={{ width:'100%', maxWidth:300, padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13 }}/>
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>New password</div>
                    <input id="pw-new" type="password" style={{ width:'100%', maxWidth:300, padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13 }}/>
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Confirm new password</div>
                    <input id="pw-confirm" type="password" style={{ width:'100%', maxWidth:300, padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13 }}/>
                  </div>
                  <button onClick={() => {
                    const cur = document.getElementById('pw-cur').value;
                    const nw = document.getElementById('pw-new').value;
                    const cf = document.getElementById('pw-confirm').value;
                    if (cur !== appSettings.passwords.admin) { alert('Incorrect current password'); return; }
                    if (nw.length < 4) { alert('New password must be at least 4 characters'); return; }
                    if (nw !== cf) { alert('Passwords do not match'); return; }
                    setAppSettings(p => ({...p, passwords:{...p.passwords, admin:nw}}));
                    document.getElementById('pw-cur').value = '';
                    document.getElementById('pw-new').value = '';
                    document.getElementById('pw-confirm').value = '';
                    alert('Password changed successfully');
                  }} style={{ padding:'8px 20px', background:appSettings.accentColour, color:'#fff', border:'none', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer' }}>Change password</button>
                </div>
              </div>;

              // === STATUSES ===
              if (settingsPath === 'statuses') {
                const list = appSettings.statuses;
                const sel = list[settingsListIdx];
                const swatches = ['#C94040','#F97316','#EAB308','#F59E0B','#22C55E','#10B981','#14B8A6','#06B6D4','#3B82F6','#6366F1','#8B5CF6','#A855F7','#983838','#D04048','#16A34A','#166534','#2563EB','#1E3A8A','#7C3AED','#EC4899','#9CA3AF','#4B5563','#1F2937','#000000'];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { const n={id:'st'+Date.now(),name:'New Status',colour:'#9CA3AF',checks:'None'}; setAppSettings(p=>({...p,statuses:[...p.statuses,n]})); setSettingsListIdx(list.length); },
                    () => { if(list.length>1){ setAppSettings(p=>({...p,statuses:p.statuses.filter((_,i)=>i!==settingsListIdx)})); setSettingsListIdx(Math.max(0,settingsListIdx-1)); }},
                    () => listSwap(list, n => setAppSettings(p=>({...p,statuses:n})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,statuses:n})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:200, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((s,i) => (
                        <div key={s.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? '#f0f0f8' : '#fff', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid '+T.borderLight }}>
                          <div style={{ width:10, height:10, borderRadius:3, background:s.colour, flexShrink:0 }}/>
                          {s.name}
                        </div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
                        <div style={{ width:14, height:14, borderRadius:4, background:sel.colour }}/>
                        <span style={{ fontSize:16, fontWeight:600 }}>{sel.name}</span>
                      </div>
                      {field('Name', sel.name, v => { const n=[...list]; n[settingsListIdx]={...sel,name:v}; setAppSettings(p=>({...p,statuses:n})); })}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:6 }}>Colour</div>
                        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                          {swatches.map(c => <div key={c} onClick={() => { const n=[...list]; n[settingsListIdx]={...sel,colour:c}; setAppSettings(p=>({...p,statuses:n})); }} style={{ width:26, height:26, borderRadius:'50%', background:c, cursor:'pointer', border: sel.colour===c ? '3px solid #333' : '3px solid transparent', boxSizing:'border-box' }}/>)}
                        </div>
                      </div>
                    </div>}
                  </div>
                </div>;
              }

              // === INFO (Project custom fields) ===
              if (settingsPath === 'info') {
                const list = appSettings.customFields.projects;
                const sel = list[settingsListIdx];
                const typeIcons = {text:'Abc',email:'✉',phone:'📞',switch:'⊘',dropdown:'▤',textarea:'¶'};
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { const n={id:'cf'+Date.now(),name:'New Field',type:'text',options:[]}; setAppSettings(p=>({...p,customFields:{...p.customFields,projects:[...p.customFields.projects,n]}})); setSettingsListIdx(list.length); },
                    () => { if(list.length>1){ setAppSettings(p=>({...p,customFields:{...p.customFields,projects:p.customFields.projects.filter((_,i)=>i!==settingsListIdx)}})); setSettingsListIdx(Math.max(0,settingsListIdx-1)); }},
                    () => listSwap(list, n => setAppSettings(p=>({...p,customFields:{...p.customFields,projects:n}})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,customFields:{...p.customFields,projects:n}})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:200, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((f,i) => (
                        <div key={f.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? '#f0f0f8' : '#fff', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid '+T.borderLight }}>
                          <span style={{ fontSize:10, color:T.textMuted, fontFamily:'monospace', width:20 }}>{typeIcons[f.type]||'T'}</span>
                          {f.name}
                        </div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ fontSize:16, fontWeight:600, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:14, color:T.textSub }}>{typeIcons[sel.type]}</span> {sel.name}
                      </div>
                      {field('Name', sel.name, v => { const n=[...list]; n[settingsListIdx]={...sel,name:v}; setAppSettings(p=>({...p,customFields:{...p.customFields,projects:n}})); })}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:6 }}>Type</div>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          {[['text','Text','Abc'],['email','Email','✉'],['phone','Phone','📞'],['switch','Switch','⊘'],['dropdown','Dropdown','▤'],['textarea','Text area','¶']].map(([t,l,ic]) => (
                            <div key={t} onClick={() => { const n=[...list]; n[settingsListIdx]={...sel,type:t}; setAppSettings(p=>({...p,customFields:{...p.customFields,projects:n}})); }}
                              style={{ padding:'10px 14px', border: sel.type===t ? '2px solid #5b5fc7' : '2px solid #e0e0e0', borderRadius:8, textAlign:'center', cursor:'pointer', minWidth:60 }}>
                              <div style={{ fontSize:16 }}>{ic}</div><div style={{ fontSize:10, marginTop:2, color: sel.type===t ? '#333' : '#999' }}>{l}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {(sel.type === 'dropdown') && <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:6 }}>Options</div>
                        {sel.options.map((opt,oi) => (
                          <div key={oi} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                            <input type="checkbox" style={{ opacity:0.4 }}/>
                            <input value={opt} onChange={e => { const opts=[...sel.options]; opts[oi]=e.target.value; const n=[...list]; n[settingsListIdx]={...sel,options:opts}; setAppSettings(p=>({...p,customFields:{...p.customFields,projects:n}})); }} style={{ flex:1, maxWidth:300, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12 }}/>
                            <span onClick={() => { const opts=sel.options.filter((_,j)=>j!==oi); const n=[...list]; n[settingsListIdx]={...sel,options:opts}; setAppSettings(p=>({...p,customFields:{...p.customFields,projects:n}})); }} style={{ cursor:'pointer', color:T.textFaint, fontSize:16 }}>🗑</span>
                          </div>
                        ))}
                        <div onClick={() => { const n=[...list]; n[settingsListIdx]={...sel,options:[...sel.options,'']}; setAppSettings(p=>({...p,customFields:{...p.customFields,projects:n}})); }} style={{ cursor:'pointer', fontSize:12, color:'#5b5fc7', marginTop:6 }}>+ New</div>
                      </div>}
                    </div>}
                  </div>
                </div>;
              }

              // === ANCILLARIES ===
              if (settingsPath === 'ancillaries') {
                const list = appSettings.ancillaries;
                const sel = list[settingsListIdx];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { setAppSettings(p=>({...p,ancillaries:[...p.ancillaries,{id:'an'+Date.now(),name:'New Item',desc:'',addToNew:false,disc:true}]})); setSettingsListIdx(list.length); },
                    () => { if(list.length>1){ setAppSettings(p=>({...p,ancillaries:p.ancillaries.filter((_,i)=>i!==settingsListIdx)})); setSettingsListIdx(Math.max(0,settingsListIdx-1)); }},
                    () => listSwap(list, n => setAppSettings(p=>({...p,ancillaries:n})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,ancillaries:n})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:220, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((a,i) => (
                        <div key={a.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:11, background: i===settingsListIdx ? '#f0f0f8' : '#fff', borderBottom:'1px solid '+T.borderLight }}>{a.name}</div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>{sel.name}</div>
                      {field('Description', sel.name, v => { const n=[...list]; n[settingsListIdx]={...sel,name:v}; setAppSettings(p=>({...p,ancillaries:n})); })}
                      {toggle('Add to new projects', sel.addToNew, v => { const n=[...list]; n[settingsListIdx]={...sel,addToNew:v}; setAppSettings(p=>({...p,ancillaries:n})); })}
                      {toggle('Discountable', sel.disc, v => { const n=[...list]; n[settingsListIdx]={...sel,disc:v}; setAppSettings(p=>({...p,ancillaries:n})); })}
                    </div>}
                  </div>
                </div>;
              }

              // === FRAME INFO ===
              if (settingsPath === 'frame-info') {
                const list = appSettings.customFields.frames;
                const sel = list[settingsListIdx];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { setAppSettings(p=>({...p,customFields:{...p.customFields,frames:[...p.customFields.frames,{id:'ff'+Date.now(),name:'New Field',type:'text',options:[]}]}})); setSettingsListIdx(list.length); },
                    null,
                    () => listSwap(list, n => setAppSettings(p=>({...p,customFields:{...p.customFields,frames:n}})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,customFields:{...p.customFields,frames:n}})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:200, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((f,i) => (
                        <div key={f.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? '#f0f0f8' : '#fff', borderBottom:'1px solid '+T.borderLight }}>{f.name}</div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24 }}>
                      <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>{sel.name}</div>
                      {field('Name', sel.name, v => { const n=[...list]; n[settingsListIdx]={...sel,name:v}; setAppSettings(p=>({...p,customFields:{...p.customFields,frames:n}})); })}
                    </div>}
                  </div>
                </div>;
              }

              // === PAGE SETUP ===
              if (settingsPath === 'page-setup') return <div style={{ padding:24 }}>
                <div style={{ background:T.bgPanel, borderRadius:8, padding:20, border:'1px solid '+T.border, maxWidth:500 }}>
                  <div style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>Page Setup</div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Paper size</div>
                    <select value={appSettings.pageSetup.paperSize} onChange={e => setAppSettings(p => ({...p, pageSetup:{...p.pageSetup, paperSize:e.target.value}}))} style={{ padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, width:160 }}>
                      <option value="A4">A4</option><option value="Letter">Letter</option>
                    </select>
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Orientation</div>
                    <select value={appSettings.pageSetup.orientation} onChange={e => setAppSettings(p => ({...p, pageSetup:{...p.pageSetup, orientation:e.target.value}}))} style={{ padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, width:160 }}>
                      <option value="portrait">Portrait</option><option value="landscape">Landscape</option>
                    </select>
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:10, marginTop:20 }}>Margins (mm)</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, maxWidth:300 }}>
                    {['top','bottom','left','right'].map(s => (
                      <div key={s}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>{s.charAt(0).toUpperCase()+s.slice(1)}</div>
                        <input type="number" value={appSettings.pageSetup.margins[s]} onChange={e => setAppSettings(p => ({...p, pageSetup:{...p.pageSetup, margins:{...p.pageSetup.margins, [s]:+e.target.value}}}))} style={{ width:'100%', padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop:16, marginBottom:16 }}>
                    <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Header height (mm)</div>
                    <input type="number" value={appSettings.pageSetup.headerHeight} onChange={e => setAppSettings(p => ({...p, pageSetup:{...p.pageSetup, headerHeight:+e.target.value}}))} style={{ width:100, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                  </div>
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Footer height (mm)</div>
                    <input type="number" value={appSettings.pageSetup.footerHeight} onChange={e => setAppSettings(p => ({...p, pageSetup:{...p.pageSetup, footerHeight:+e.target.value}}))} style={{ width:100, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                  </div>
                </div>
              </div>;

              // === FOREWORDS ===
              if (settingsPath === 'forewords') {
                const list = appSettings.forewords;
                const sel = list[settingsListIdx];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { setAppSettings(p=>({...p,forewords:[...p.forewords,{id:'fw'+Date.now(),name:'New Foreword',text:''}]})); setSettingsListIdx(list.length); },
                    () => { if(list.length>0){ setAppSettings(p=>({...p,forewords:p.forewords.filter((_,i)=>i!==settingsListIdx)})); setSettingsListIdx(Math.max(0,settingsListIdx-1)); }},
                    () => listSwap(list, n => setAppSettings(p=>({...p,forewords:n})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,forewords:n})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:200, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((fw,i) => (
                        <div key={fw.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? '#f0f0f8' : '#fff', borderBottom:'1px solid '+T.borderLight }}>{fw.name}</div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>{sel.name}</div>
                      {field('Name', sel.name, v => { const n=[...list]; n[settingsListIdx]={...sel,name:v}; setAppSettings(p=>({...p,forewords:n})); })}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Font size</div>
                        <select value={sel.fontSize || 'medium'} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,fontSize:e.target.value}; setAppSettings(p=>({...p,forewords:n})); }} style={{ padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, background:T.bgInput, color:T.text }}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select>
                      </div>
                      <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Text</div>
                      <textarea value={sel.text} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,text:e.target.value}; setAppSettings(p=>({...p,forewords:n})); }} style={{ width:'100%', height:300, padding:10, border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'inherit', background:T.bgInput, color:T.text, resize:'vertical' }}/>
                    </div>}
                  </div>
                </div>;
              }

              // === TERMS ===
              if (settingsPath === 'terms') {
                const list = appSettings.termsAndConditions;
                const sel = list[settingsListIdx];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { setAppSettings(p=>({...p,termsAndConditions:[...p.termsAndConditions,{id:'tc'+Date.now(),name:'New Terms',text:''}]})); setSettingsListIdx(list.length); },
                    null,
                    () => listSwap(list, n => setAppSettings(p=>({...p,termsAndConditions:n})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,termsAndConditions:n})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:200, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((tc,i) => (
                        <div key={tc.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? '#f0f0f8' : '#fff', borderBottom:'1px solid '+T.borderLight }}>{tc.name}</div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      {field('Name', sel.name, v => { const n=[...list]; n[settingsListIdx]={...sel,name:v}; setAppSettings(p=>({...p,termsAndConditions:n})); })}
                      <textarea value={sel.text} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,text:e.target.value}; setAppSettings(p=>({...p,termsAndConditions:n})); }} style={{ width:'100%', height:400, padding:10, border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'inherit', background:T.bgInput, color:T.text, resize:'vertical' }}/>
                    </div>}
                  </div>
                </div>;
              }

              // === DOCUMENTS ===
              if (settingsPath === 'documents') {
                const list = appSettings.quoteTemplates;
                const sel = list[settingsListIdx];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { setAppSettings(p=>({...p,quoteTemplates:[...p.quoteTemplates,{id:'qt'+Date.now(),name:'New Document',general:{fontSize:'normal',text:''},header:{showLogo:true,showName:true,showAddress:true,showContact:true,showQuoteNum:true,showDate:true,showClientName:true,showClientAddress:true},frames:{showSchematic:true,showDimensions:true,showGlassSpec:true,showColours:true,showUnitPrice:true,showItemNotes:true},summary:{showSubtotal:true,showGST:true,showTotal:true,showValidity:true,validityDays:30},terms:'',mfg:{cuttingList:false}}]})); setSettingsListIdx(list.length); },
                    null,
                    () => listSwap(list, n => setAppSettings(p=>({...p,quoteTemplates:n})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,quoteTemplates:n})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:220, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((d,i) => (
                        <div key={d.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:11, background: i===settingsListIdx ? '#f0f0f8' : '#fff', borderBottom:'1px solid '+T.borderLight }}>{d.name}</div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ fontSize:16, fontWeight:600, marginBottom:20 }}>{sel.name}</div>
                      {field('Name', sel.name, v => { const n=[...list]; n[settingsListIdx]={...sel,name:v}; setAppSettings(p=>({...p,quoteTemplates:n})); })}
                      <div style={{ fontSize:13, fontWeight:600, marginTop:16, marginBottom:8 }}>Header</div>
                      {[['showLogo','Show company logo'],['showName','Show company name'],['showQuoteNum','Show quote number'],['showDate','Show date'],['showClientName','Show client name']].map(([k,l]) => 
                        toggle(l, sel.header[k], v => { const n=[...list]; n[settingsListIdx]={...sel,header:{...sel.header,[k]:v}}; setAppSettings(p=>({...p,quoteTemplates:n})); })
                      )}
                      <div style={{ fontSize:13, fontWeight:600, marginTop:16, marginBottom:8 }}>Frames</div>
                      {[['showSchematic','Show 2D schematic'],['showDimensions','Show dimensions'],['showGlassSpec','Show glass specification'],['showColours','Show colours'],['showUnitPrice','Show unit price']].map(([k,l]) => 
                        toggle(l, sel.frames[k], v => { const n=[...list]; n[settingsListIdx]={...sel,frames:{...sel.frames,[k]:v}}; setAppSettings(p=>({...p,quoteTemplates:n})); })
                      )}
                      <div style={{ fontSize:13, fontWeight:600, marginTop:16, marginBottom:8 }}>Summary</div>
                      {[['showSubtotal','Show subtotal'],['showGST','Show GST breakdown'],['showTotal','Show total'],['showValidity','Show validity period']].map(([k,l]) => 
                        toggle(l, sel.summary[k], v => { const n=[...list]; n[settingsListIdx]={...sel,summary:{...sel.summary,[k]:v}}; setAppSettings(p=>({...p,quoteTemplates:n})); })
                      )}
                    </div>}
                  </div>
                </div>;
              }

              // === SIGNING ===
              if (settingsPath === 'signing') return <div style={{ padding:24 }}>
                <div style={{ background:T.bgPanel, borderRadius:8, padding:20, border:'1px solid '+T.border, maxWidth:500 }}>
                  {toggle('Client signature', appSettings.signing.client==='visible', v => setAppSettings(p=>({...p,signing:{...p.signing,client:v?'visible':'hidden'}})))}
                  {toggle('Installer signature', appSettings.signing.installer==='visible', v => setAppSettings(p=>({...p,signing:{...p.signing,installer:v?'visible':'hidden'}})))}
                  {toggle('Sales manager signature', appSettings.signing.salesMgr==='visible', v => setAppSettings(p=>({...p,signing:{...p.signing,salesMgr:v?'visible':'hidden'}})))}
                  {toggle('Window sign-off section', appSettings.signing.windowSignOff, v => setAppSettings(p=>({...p,signing:{...p.signing,windowSignOff:v}})))}
                </div>
              </div>;

              
              // === PRODUCTS: COLOURS ===
              if (settingsPath === 'prod-colours') {
                try {
                const list = appSettings.editColours;
                // Defensive: if list is empty or settingsListIdx is out of
                // range, sel can be undefined. Coerce to a safe fallback
                // entry so renderColourSwatch + the right-pane never crash.
                var safeIdx = (list && list.length > 0)
                  ? Math.max(0, Math.min(settingsListIdx, list.length - 1))
                  : 0;
                const sel = (list && list[safeIdx]) || { id:'_fallback', label:'(empty)', hex:'#cccccc', cat:'smooth', r:0.3, m:0, cc:0.4, ccr:0.3, envI:0.5 };

                // Material-aware swatch renderer. Replaces the flat-hex
                // `<div style={{ background: c.hex }}>` rectangles that were
                // showing every colour as a featureless coloured square,
                // ignoring roughness/metalness/clearcoat/envI entirely.
                //
                // For wood: shows the procedural grain (or the uploaded
                // photographic albedo when texturePack.albedo is set) as
                // background-image. For aludec/smooth: builds a CSS
                // gradient sphere that responds to the material settings —
                // small for the list, larger for the header. The same
                // visual language as the Material Preview ball below, just
                // shrunk down so users can see how their settings look at
                // a glance while scrolling through colours.
                function renderColourSwatch(c, size, opts) {
                  opts = opts || {};
                  var rad = opts.shape === 'square' ? Math.max(2, size / 8) : size / 2;
                  var borderRad = opts.shape === 'square' ? rad : '50%';
                  var r = typeof c.r === 'number' ? c.r : 0.3;
                  var m = typeof c.m === 'number' ? c.m : 0;
                  var cc = typeof c.cc === 'number' ? c.cc : 0;
                  var ccr = typeof c.ccr === 'number' ? c.ccr : 0.3;
                  var envI = typeof c.envI === 'number' ? c.envI : 0.5;

                  // Wood OR aludec with photographic albedo upload — show actual texture
                  if ((c.cat === 'wood' || c.cat === 'aludec') && c.texturePack && c.texturePack.albedo) {
                    return <div style={{
                      width: size, height: size, borderRadius: borderRad,
                      backgroundImage: 'url(' + c.texturePack.albedo + ')',
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      border: '1px solid ' + T.border, flexShrink: 0,
                      boxShadow: 'inset -1px -2px 4px rgba(0,0,0,0.18)',
                    }}/>;
                  }
                  // Wood with procedural grain
                  if (c.cat === 'wood') {
                    var woodUrl = '';
                    try { woodUrl = makeWoodPreviewDataURL(c, Math.max(48, size * 2), Math.max(48, size * 2)); }
                    catch (e) { /* fallback below */ }
                    return <div style={{
                      width: size, height: size, borderRadius: borderRad,
                      backgroundImage: woodUrl ? 'url(' + woodUrl + ')' : undefined,
                      backgroundColor: woodUrl ? undefined : c.hex,
                      backgroundSize: 'cover', backgroundPosition: 'center',
                      border: '1px solid ' + T.border, flexShrink: 0,
                      boxShadow: 'inset -1px -2px 4px rgba(0,0,0,0.18)',
                    }}/>;
                  }

                  // Smooth/aludec/anything else — pseudo-3D CSS sphere/square
                  // Same gradient math the Material Preview uses; shrunk.
                  var col;
                  try { col = new THREE.Color(c.hex); } catch (e) { col = { r:0.5, g:0.5, b:0.5 }; }
                  var lightR = Math.min(255, Math.round(col.r * 255 * (1.4 - r * 0.3)));
                  var lightG = Math.min(255, Math.round(col.g * 255 * (1.4 - r * 0.3)));
                  var lightB = Math.min(255, Math.round(col.b * 255 * (1.4 - r * 0.3)));
                  var darkR = Math.round(col.r * 255 * 0.5);
                  var darkG = Math.round(col.g * 255 * 0.5);
                  var darkB = Math.round(col.b * 255 * 0.5);
                  var hlPos = (35 + (1 - r) * 15) + '% ' + (30 + (1 - r) * 10) + '%';
                  var bg = 'radial-gradient(circle at ' + hlPos + ', '
                         + 'rgb(' + lightR + ',' + lightG + ',' + lightB + '), '
                         + c.hex + ' 50%, '
                         + 'rgb(' + darkR + ',' + darkG + ',' + darkB + ') 100%)';
                  // Highlight overlay for clearcoat
                  var ccOverlay = null;
                  if (cc > 0.05) {
                    var hlW = Math.max(3, size * 0.36 * (1 - ccr * 0.6));
                    var hlH = Math.max(2, size * 0.18 * (1 - ccr * 0.6));
                    ccOverlay = <div style={{
                      position: 'absolute', top: size * 0.08, left: size * 0.22,
                      width: hlW, height: hlH, borderRadius: '50%', pointerEvents: 'none',
                      background: 'radial-gradient(ellipse, rgba(255,255,255,' + (cc * 0.7 * (1 - ccr)).toFixed(3) + ') 0%, rgba(255,255,255,0) 100%)',
                    }}/>;
                  }
                  // Metallic rim light
                  var metalRim = null;
                  if (m > 0.02) {
                    metalRim = <div style={{
                      position: 'absolute', top: 0, left: 0, width: size, height: size,
                      borderRadius: borderRad, pointerEvents: 'none',
                      background: 'radial-gradient(circle at 70% 70%, transparent 40%, rgba(255,255,255,' + (m * 0.6).toFixed(3) + ') 80%, transparent 100%)',
                    }}/>;
                  }
                  return <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
                    <div style={{
                      width: size, height: size, borderRadius: borderRad,
                      background: bg,
                      boxShadow: 'inset -1px -2px ' + Math.round(size * 0.12) + 'px rgba(0,0,0,' + (0.15 + r * 0.15).toFixed(2) + ')',
                      filter: 'saturate(' + (1 + m * 0.5) + ')',
                      border: '1px solid ' + T.border,
                    }}/>
                    {ccOverlay}
                    {metalRim}
                  </div>;
                }

                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { const n={id:'col_'+Date.now(),label:'New Colour',hex:'#CCCCCC',cat:'smooth',r:0.25,m:0.0,cc:0.4,ccr:0.3,envI:0.5,sn:0.0}; setAppSettings(p=>({...p,editColours:[...p.editColours,n]})); setSettingsListIdx(list.length); },
                    () => { if(list.length>1){ setAppSettings(p=>({...p,editColours:p.editColours.filter((_,i)=>i!==settingsListIdx)})); setSettingsListIdx(Math.max(0,settingsListIdx-1)); }},
                    () => listSwap(list, n => setAppSettings(p=>({...p,editColours:n})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,editColours:n})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:220, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((c,i) => (
                        <div key={c.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? (dk?'#2a2a3a':'#f0f0f8') : 'transparent', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid '+T.borderLight }}>
                          {renderColourSwatch(c, 22, { shape:'square' })}
                          <div><div style={{ fontWeight: i===settingsListIdx?600:400, color:T.text }}>{c.label}</div><div style={{ fontSize:9, color:T.textMuted }}>{c.cat}</div></div>
                        </div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                        {renderColourSwatch(sel, 36, { shape:'square' })}
                        <div style={{ fontSize:16, fontWeight:600, color:T.text }}>{sel.label}</div>
                        <span style={{ fontSize:10, color:T.textMuted, fontFamily:'monospace' }}>{sel.hex}</span>
                      </div>
                      {field('Name', sel.label, v => { const n=[...list]; n[settingsListIdx]={...sel,label:v}; setAppSettings(p=>({...p,editColours:n})); syncColours(n); })}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Hex colour</div>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <input type="color" value={sel.hex} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,hex:e.target.value}; setAppSettings(p=>({...p,editColours:n})); syncColours(n); }} style={{ width:40, height:32, border:'none', cursor:'pointer' }}/>
                          <input value={sel.hex} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,hex:e.target.value}; setAppSettings(p=>({...p,editColours:n})); syncColours(n); }} style={{ width:100, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                        </div>
                      </div>
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Category</div>
                        <select value={sel.cat} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,cat:e.target.value}; setAppSettings(p=>({...p,editColours:n})); syncColours(n); }} style={{ padding:'6px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, background:T.bgInput, color:T.text }}>
                          <option value="smooth">Smooth</option><option value="aludec">Aludec</option><option value="wood">Woodgrain</option>
                        </select>
                      </div>
                      {sel.cat === 'wood' && <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Grain Preset</div>
                        <select value={sel.grain||'golden'} onChange={e => {
                          var presets = {fine:{gDensity:450,gDarkness:0.35,gWave:1.5,gBands:14,gCath:2,gKnots:1},heavy:{gDensity:550,gDarkness:0.5,gWave:1.2,gBands:20,gCath:3,gKnots:2},broad:{gDensity:300,gDarkness:0.38,gWave:3.5,gBands:12,gCath:2,gKnots:2},golden:{gDensity:500,gDarkness:0.32,gWave:2.0,gBands:16,gCath:3,gKnots:1},golden_rich:{gDensity:480,gDarkness:0.38,gWave:2.8,gBands:18,gCath:3,gKnots:2}};
                          var pr = presets[e.target.value]||presets.golden;
                          var n=[...list]; n[settingsListIdx]={...sel,grain:e.target.value,...pr}; setAppSettings(p=>({...p,editColours:n})); syncColours(n);
                        }} style={{ padding:'6px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, background:T.bgInput, color:T.text, marginBottom:12, width:'100%' }}>
                          {[['fine','Fine Oak'],['heavy','Heavy Oak'],['broad','Broad Grain'],['golden','Golden Oak'],['golden_rich','Rich Golden Oak']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                        </select>

                        <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:8 }}>Grain Properties</div>
                        {[
                          ['gDensity', 'Grain Density', 100, 700, 10, 'Number of visible grain lines. Higher = denser, more detailed grain texture',
                            {fine:450,heavy:550,broad:300,golden:500,golden_rich:480}],
                          ['gDarkness', 'Grain Darkness', 0, 1, 0.01, 'How dark and prominent the grain lines appear. Higher = bolder grain contrast',
                            {fine:0.35,heavy:0.5,broad:0.38,golden:0.32,golden_rich:0.38}],
                          ['gWave', 'Grain Waviness', 0.2, 5, 0.1, 'How much the grain lines curve and flow. Low = straight, High = wavy organic look',
                            {fine:1.5,heavy:1.2,broad:3.5,golden:2.0,golden_rich:2.8}],
                          ['gBands', 'Growth Bands', 0, 30, 1, 'Wider annual ring shadows visible across the grain. Creates depth and natural variation',
                            {fine:14,heavy:20,broad:12,golden:16,golden_rich:18}],
                          ['gCath', 'Cathedral Arcs', 0, 6, 1, 'Curved arch patterns from flat-sawn timber growth rings. Signature oak foil feature',
                            {fine:2,heavy:3,broad:2,golden:3,golden_rich:3}],
                          ['gKnots', 'Knots', 0, 5, 1, 'Dark knot areas where grain curves around branch points',
                            {fine:1,heavy:2,broad:2,golden:1,golden_rich:2}],
                        ].map(([key, label, min, max, step, tip, defaults]) => {
                          var defVal = (defaults[sel.grain]||defaults.golden);
                          var val = sel[key] !== undefined ? sel[key] : defVal;
                          return <div key={key} style={{ marginBottom:10 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                              <span style={{ fontSize:10, color:T.textSub }}>{label}</span>
                              <span style={{ fontSize:10, fontFamily:'monospace', color:T.accent, fontWeight:600 }}>{typeof val === 'number' ? (step < 1 ? val.toFixed(2) : val) : val}</span>
                            </div>
                            <input type="range" min={min} max={max} step={step} value={val}
                              onChange={e => { var n=[...list]; n[settingsListIdx]={...sel,[key]:+e.target.value}; setAppSettings(p=>({...p,editColours:n})); syncColours(n); }}
                              style={{ width:'100%', accentColor:T.accent }}/>
                            <div style={{ fontSize:8, color:T.textFaint, marginTop:1 }}>{tip}</div>
                          </div>;
                        })}
                      </div>}

                      {/* ───── Photographic texture uploads (wood + aludec) ─────
                          Shared across both categories that benefit from real
                          photographic textures: woodgrain foils and aludec
                          powder-coats. Wood uses long-strip scans aligned to
                          grain direction; aludec uses small tileable scans of
                          the powder-coat surface.

                          When sel.texturePack.albedo is present, the material
                          constructor (24-materials-textures.js, makeProfileMat)
                          loads it as the colour map and skips the procedural
                          path. Normal and roughness maps are optional add-ons.

                          Stored as base64 data URLs on the colour entry so
                          they round-trip through Save/Load with the rest of
                          editColours. Files >2MB warn the user. */}
                      {(sel.cat === 'wood' || sel.cat === 'aludec') && (function(){
                        var isWood = sel.cat === 'wood';
                        var sectionTitle = isWood ? 'Photographic foil textures' : 'Photographic powder-coat textures';
                        var sectionBlurb = isWood
                          ? 'Upload a scan/photo of the actual foil to override the procedural grain. Albedo is the colour image — the only required map. Normal and roughness improve realism but are optional. Typical size: 2048 × 512 px, JPEG, with grain running along the long axis. Recommended for timber colours where the procedural grain doesn\'t match a specific manufacturer foil.'
                          : 'Upload a scan/photo of the actual powder-coat surface to override the procedural granular texture. Albedo is the colour image — the only required map. Normal and roughness improve depth but are optional. Aludec is a uniform texture so a small tileable square works fine: 512 × 512 px, JPEG. Recommended when the procedural speckle doesn\'t match a specific manufacturer\'s grain.';
                        var slots = isWood ? [
                          { key:'albedo',    label:'Albedo (colour)',    hint:'The base colour image. JPEG works fine. Long-strip scan, grain running along the long axis.' },
                          { key:'normal',    label:'Normal map',         hint:'Optional. Adds surface relief. PNG only.' },
                          { key:'roughness', label:'Roughness map',      hint:'Optional. Greyscale: dark = glossy, light = matte.' },
                        ] : [
                          { key:'albedo',    label:'Albedo (colour)',    hint:'The base colour image. Tileable square (e.g. 512×512). JPEG works fine.' },
                          { key:'normal',    label:'Normal map',         hint:'Optional. Captures the powder-coat micro-relief. PNG only.' },
                          { key:'roughness', label:'Roughness map',      hint:'Optional. Greyscale: dark = glossy, light = matte.' },
                        ];
                        function setTexSlot(slotKey, dataUrl) {
                          var n = [...list];
                          var nextPack = Object.assign({}, sel.texturePack || {});
                          if (dataUrl) nextPack[slotKey] = dataUrl;
                          else delete nextPack[slotKey];
                          n[settingsListIdx] = Object.assign({}, sel,
                            Object.keys(nextPack).length ? { texturePack: nextPack } : (function(){ var c = Object.assign({}, sel); delete c.texturePack; return c; })()
                          );
                          setAppSettings(p => ({ ...p, editColours: n }));
                          syncColours(n);
                        }
                        function readFileAsDataUrl(file, slotKey) {
                          if (!file) return;
                          if (file.size > 2 * 1024 * 1024) {
                            if (!confirm('This file is ' + (file.size / 1024 / 1024).toFixed(1) + ' MB. Files over 2 MB can slow loading and may exceed browser storage limits if you have several. Continue?')) return;
                          }
                          if (slotKey === 'normal' && !/png/i.test(file.type)) {
                            if (!confirm('Normal maps are best as PNG. The chosen file is ' + (file.type || 'unknown type') + ' — JPEG compression artefacts can introduce surface noise. Continue?')) return;
                          }
                          var reader = new FileReader();
                          reader.onload = function(ev) { setTexSlot(slotKey, ev.target.result); };
                          reader.onerror = function() { alert('Failed to read file.'); };
                          reader.readAsDataURL(file);
                        }
                        var tp = sel.texturePack || {};
                        var overrideNotice = isWood
                          ? 'Photographic textures are active for this colour. The procedural grain settings above are ignored until you remove the albedo upload.'
                          : 'Photographic textures are active for this colour. The procedural speckle (driven by Roughness/Metalness/Env) is replaced by your uploaded image until you remove the albedo upload.';
                        return <div style={{ marginBottom:16, padding:14, background:T.bgCard, border:'1px solid '+T.borderLight, borderRadius:6 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:4 }}>{sectionTitle}</div>
                          <div style={{ fontSize:10, color:T.textMuted, marginBottom:10, lineHeight:1.4 }}>{sectionBlurb}</div>
                          {slots.map(function(slot){
                            var hasMap = !!tp[slot.key];
                            var inputId = 'tex-' + sel.id + '-' + slot.key;
                            return <div key={slot.key} style={{ display:'flex', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px dashed '+T.borderLight }}>
                              <div style={{ width:48, height:48, flexShrink:0, background:'#f4f4f4', border:'1px solid '+T.border, borderRadius:3, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                {hasMap ? (
                                  <img src={tp[slot.key]} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                                ) : (
                                  <span style={{ fontSize:18, color:'#9aa' }}>▢</span>
                                )}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:11, fontWeight:600, color:T.text }}>{slot.label}</div>
                                <div style={{ fontSize:9, color:T.textMuted, marginTop:1, lineHeight:1.3 }}>{slot.hint}</div>
                                <div style={{ marginTop:4, display:'flex', gap:4 }}>
                                  <input type="file" accept="image/*" id={inputId} style={{ display:'none' }}
                                         onChange={function(e){
                                           var f = e.target.files && e.target.files[0];
                                           if (f) readFileAsDataUrl(f, slot.key);
                                           e.target.value = '';
                                         }}/>
                                  <label htmlFor={inputId}
                                         style={{ background: hasMap ? 'transparent' : '#1f2937', color: hasMap ? T.text : 'white', border: hasMap ? '1px solid '+T.border : 'none', borderRadius:3, padding:'3px 9px', fontSize:9, fontWeight:600, cursor:'pointer' }}>
                                    {hasMap ? 'Replace' : '⬆ Upload'}
                                  </label>
                                  {hasMap && (
                                    <button onClick={function(){ setTexSlot(slot.key, null); }}
                                            style={{ background:'transparent', color:'#dc2626', border:'1px solid '+T.border, borderRadius:3, padding:'3px 9px', fontSize:9, fontWeight:600, cursor:'pointer' }}>
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>;
                          })}
                          {tp.albedo && (
                            <div style={{ marginTop:8, fontSize:9, fontStyle:'italic', color:'#92400e', background:'#fffbeb', border:'1px solid #fcd34d', padding:'5px 9px', borderRadius:3 }}>
                              {overrideNotice}
                            </div>
                          )}
                        </div>;
                      })()}

                      {/* Material Properties — slider ranges and help text are
                          tuned to the dramatic amplification curves in
                          24-materials-textures.js. The displayed range is the
                          slider's literal value; the renderer multiplies up
                          (e.g. metalness 0.5 reads as fully metallic in 3D). */}
                      <div style={{ marginTop:20, padding:16, background:T.bgCard, borderRadius:8, border:'1px solid '+T.borderLight }}>
                        <div style={{ fontSize:12, fontWeight:600, color:T.text, marginBottom:12 }}>Material Properties</div>
                        {[
                          ['r',    'Roughness',           0, 1, 0.01, 'S-curve amplified — dragging toward 0 quickly reads as mirror-glossy, dragging toward 1 reads as fully matte. Mid-range 0.4–0.6 is the working zone.'],
                          ['m',    'Metalness',           0, 1, 0.01, '×2.2 amplified. 0 = plastic/foil, 0.45 already reads fully metallic, 1.0 = chrome-like. Frames are non-metals — keep low; satin metallics 0.10–0.25.'],
                          ['cc',   'Clearcoat',           0, 1, 0.01, 'Power-curve amplified. Even cc=0.10 produces visible sheen; 0.5+ reads as a strong lacquer; 1.0 is full mirror coat.'],
                          ['ccr',  'Clearcoat Roughness', 0, 1, 0.01, 'Power-curve amplified — drag toward 0 for sharp mirror-like coat highlights, toward 1 for muted satin coat.'],
                          ['envI', 'Environment Intensity', 0, 2, 0.05, '×2.5 amplified, then scaled by the global render-quality multiplier. Drives how much the HDRI surroundings reflect in the surface.'],
                          ['sn',   'Sheen',               0, 1, 0.01, 'Velvety glow at grazing angles. Adds depth to woodgrain and dark anthracite/black colours without changing base reflectance.'],
                        ].map(([key, label, min, max, step, tip]) => (
                          <div key={key} style={{ marginBottom:12 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                              <span style={{ fontSize:11, color:T.textSub }}>{label}</span>
                              <span style={{ fontSize:11, fontFamily:'monospace', color:T.accent, fontWeight:600 }}>{(sel[key]||0).toFixed(2)}</span>
                            </div>
                            <input type="range" min={min} max={max} step={step} value={sel[key]||0}
                              onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,[key]:+e.target.value}; setAppSettings(p=>({...p,editColours:n})); syncColours(n); }}
                              style={{ width:'100%', accentColor:T.accent }}/>
                            <div style={{ fontSize:9, color:T.textFaint, marginTop:1 }}>{tip}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ marginTop:16, padding:16, background:T.bgCard, borderRadius:8, border:'1px solid '+T.borderLight }}>
                        <div style={{ fontSize:10, color:T.textMuted, marginBottom:8 }}>Material Preview</div>
                        <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                          {/* Sphere preview — defensively coerce all material
                              params to numbers, since a colour entry missing a
                              field would otherwise inject NaN into a CSS string
                              and break the gradient. The visual rules try to
                              echo the dramatic amplification curves used by
                              makeProfileMat in 24-materials-textures.js, so
                              what users see here matches the 3D viewport. */}
                          {(() => {
                            var sR  = typeof sel.r   === 'number' ? sel.r   : 0.3;
                            var sM  = typeof sel.m   === 'number' ? sel.m   : 0;
                            var sCc = typeof sel.cc  === 'number' ? sel.cc  : 0;
                            var sCr = typeof sel.ccr === 'number' ? sel.ccr : 0.3;
                            var sE  = typeof sel.envI=== 'number' ? sel.envI: 0.5;
                            var sSn = typeof sel.sn  === 'number' ? sel.sn  : 0;
                            var sH  = sel.hex || '#888888';
                            // Mirror the renderer's roughness S-curve so the
                            // preview matches the 3D viewport.
                            var sRamp = sR <= 0.5 ? 0.5 * Math.pow(sR * 2, 1.6) : 1 - 0.5 * Math.pow((1 - sR) * 2, 1.6);
                            // Metalness amplification 2.2× to match renderer.
                            var sMamp = Math.min(1.0, sM * 2.2);
                            // Clearcoat amplification — power curve.
                            var sCcAmp = Math.min(1.0, Math.pow(sCc, 0.55) * 1.05);
                            return (
                          <div style={{ position:'relative', width:100, height:100, flexShrink:0 }}>
                            {/* Base sphere */}
                            <div style={{
                              width:100, height:100, borderRadius:'50%',
                              background: 'radial-gradient(circle at ' + (35 + (1-sRamp)*15) + '% ' + (30 + (1-sRamp)*10) + '%, ' +
                                (sH === '#FFFFFF' || sH === '#ffffff' ? '#fff' : (function(){ var c = new THREE.Color(sH); return 'rgb(' + Math.min(255,Math.round(c.r*255*1.4)) + ',' + Math.min(255,Math.round(c.g*255*1.4)) + ',' + Math.min(255,Math.round(c.b*255*1.4)) + ')'; })()) + ', ' +
                                sH + ' 50%, ' +
                                (function(){ var c = new THREE.Color(sH); return 'rgb(' + Math.round(c.r*255*0.5) + ',' + Math.round(c.g*255*0.5) + ',' + Math.round(c.b*255*0.5) + ')'; })() + ' 100%)',
                              boxShadow: 'inset -3px -6px 12px rgba(0,0,0,' + (0.15 + sRamp * 0.15).toFixed(3) + '), 4px 6px 16px rgba(0,0,0,0.2)',
                              filter: 'saturate(' + (1 + sMamp * 0.5).toFixed(3) + ')',
                            }}/>
                            {/* Clearcoat highlight */}
                            {sCcAmp > 0.05 && <div style={{
                              position:'absolute', top:8, left:22, width: 36 - sCr*20, height: 18 - sCr*10,
                              borderRadius:'50%',
                              background: 'radial-gradient(ellipse, rgba(255,255,255,' + (sCcAmp * 0.85 * (1-sCr)).toFixed(3) + ') 0%, rgba(255,255,255,0) 100%)',
                              pointerEvents:'none',
                            }}/>}
                            {/* Environment reflection band — amplified to match renderer */}
                            {sE > 0.1 && <div style={{
                              position:'absolute', top:28, left:6, width:40, height:20, borderRadius:'50%',
                              background: 'radial-gradient(ellipse, rgba(200,220,240,' + Math.min(0.6, sE * 0.20 * (1-sRamp)).toFixed(3) + ') 0%, transparent 100%)',
                              pointerEvents:'none', transform:'rotate(-20deg)',
                            }}/>}
                            {/* Metallic rim light */}
                            {sMamp > 0.02 && <div style={{
                              position:'absolute', top:0, left:0, width:100, height:100, borderRadius:'50%',
                              background: 'radial-gradient(circle at 70% 70%, transparent 40%, rgba(255,255,255,' + (sMamp * 0.6).toFixed(3) + ') 80%, transparent 100%)',
                              pointerEvents:'none',
                            }}/>}
                            {/* Sheen — soft glow at the silhouette */}
                            {sSn > 0.05 && <div style={{
                              position:'absolute', top:0, left:0, width:100, height:100, borderRadius:'50%',
                              background: 'radial-gradient(circle at 50% 50%, transparent 55%, rgba(255,250,240,' + (sSn * 0.55).toFixed(3) + ') 92%, transparent 100%)',
                              pointerEvents:'none', mixBlendMode:'screen',
                            }}/>}
                          </div>
                            );
                          })()}
                          {/* Material-aware swatch — uses makeMaterialPreviewDataURL
                              so the canvas-rendered preview reflects the actual
                              roughness / metalness / clearcoat / envI sliders.
                              When a texturePack.albedo is uploaded for any
                              category that supports it (wood + aludec), the
                              uploaded photo replaces the procedural preview.
                              Smooth always uses the canvas-rendered swatch.
                              The math handles dark colours (Anthracite, Jet
                              Black) by widening the tonal spread additively
                              rather than multiplying from a near-zero base. */}
                          <div style={{ flex:1 }}>
                            {(() => {
                              // Build a backgroundImage / backgroundColor pair
                              // that always renders something visible. Defends
                              // against the previous ReferenceError where a
                              // non-existent makeMaterialPreviewDataURL crashed
                              // the entire Settings IIFE and blanked the page.
                              var bg = { image: null, color: sel.hex || '#cccccc' };
                              try {
                                if ((sel.cat === 'wood' || sel.cat === 'aludec') && sel.texturePack && sel.texturePack.albedo) {
                                  bg.image = 'url(' + sel.texturePack.albedo + ')';
                                } else if (sel.cat === 'wood' && typeof makeWoodPreviewDataURL === 'function') {
                                  bg.image = 'url(' + makeWoodPreviewDataURL(sel, 320, 80) + ')';
                                } else {
                                  // Smooth / aludec / fallback — use the same
                                  // 3-stop CSS gradient as the sphere preview so
                                  // roughness/metalness/clearcoat read on the
                                  // wide swatch. Pure CSS, no canvas needed.
                                  var c = new THREE.Color(sel.hex || '#888888');
                                  var lr2 = Math.min(255, Math.round(c.r * 255 * (1.4 - sel.r * 0.3)));
                                  var lg2 = Math.min(255, Math.round(c.g * 255 * (1.4 - sel.r * 0.3)));
                                  var lb2 = Math.min(255, Math.round(c.b * 255 * (1.4 - sel.r * 0.3)));
                                  var dr2 = Math.round(c.r * 255 * 0.55);
                                  var dg2 = Math.round(c.g * 255 * 0.55);
                                  var db2 = Math.round(c.b * 255 * 0.55);
                                  bg.image = 'linear-gradient(135deg, rgb(' + lr2 + ',' + lg2 + ',' + lb2 + ') 0%, ' + sel.hex + ' 50%, rgb(' + dr2 + ',' + dg2 + ',' + db2 + ') 100%)';
                                }
                              } catch (e) {
                                // any failure → flat colour, never blank
                                bg.image = null;
                                bg.color = sel.hex || '#cccccc';
                              }
                              return <div style={{
                                height: sel.cat === 'wood' ? 60 : 50,
                                borderRadius: 6,
                                border: '1px solid ' + T.border,
                                marginBottom: 8,
                                overflow: 'hidden',
                                backgroundImage: bg.image || undefined,
                                backgroundColor: bg.color,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                boxShadow: 'inset 0 -3px 8px rgba(0,0,0,0.18), inset 0 3px 8px rgba(255,255,255,0.06)'
                              }}/>;
                            })()}
                            <div style={{ fontSize:9, color:T.textFaint, lineHeight:1.6 }}>
                              {sel.cat === 'smooth' && 'Smooth uPVC \u2014 clean glossy finish with clearcoat shine'}
                              {sel.cat === 'aludec' && (sel.texturePack && sel.texturePack.albedo
                                ? 'Aludec \u2014 uploaded photographic texture (procedural speckle replaced)'
                                : 'Aludec \u2014 granular powder-coat finish with subtle metallic texture')}
                              {sel.cat === 'wood' && (sel.texturePack && sel.texturePack.albedo
                                ? 'Woodgrain foil \u2014 uploaded photographic texture (procedural grain settings ignored)'
                                : ('Woodgrain foil \u2014 ' + (sel.grain||'fine') + ' grain pattern, matte natural wood finish'))}
                              <br/>
                              R:{(sel.r||0).toFixed(2)} M:{(sel.m||0).toFixed(2)} CC:{(sel.cc||0).toFixed(2)} Env:{(sel.envI||0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>}
                  </div>
                </div>;
                } catch (e) {
                  // If any render fails, show the error instead of blanking
                  // the page. This lets the user see what's wrong and lets
                  // us diagnose without a black-box "blank screen".
                  console.error('[prod-colours render error]', e);
                  return <div style={{ padding:24, color:T.text, fontFamily:'monospace', fontSize:12 }}>
                    <div style={{ fontWeight:700, color:'#c41230', marginBottom:8 }}>Colours panel render error</div>
                    <div style={{ marginBottom:8 }}>{(e && e.message) || String(e)}</div>
                    <div style={{ fontSize:10, color:T.textMuted, whiteSpace:'pre-wrap' }}>{(e && e.stack) || ''}</div>
                  </div>;
                }
              }

              // === PRODUCTS: PROFILES (unified Profile Manager — replaces legacy
              // Products→Profile systems and Pricing→Profile costs UIs)
              if (settingsPath === 'prod-profiles') {
                return <ProfileManager T={T} dk={dk} appSettings={appSettings} setAppSettings={setAppSettings}/>;
              }

              // === PRODUCTS: GLAZING ===
              if (settingsPath === 'prod-glazing') {
                const list = appSettings.editGlass;
                const sel = list[settingsListIdx];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(
                    () => { const n={id:'g_'+Date.now(),label:'New Glass',cat:'Clear IGU',tint:'#88bbcc',opacity:0.13,thickness:0.020,uValue:'2.8',desc:'New glass specification'}; setAppSettings(p=>({...p,editGlass:[...p.editGlass,n]})); setSettingsListIdx(list.length); GLASS_OPTIONS.length=0; [...appSettings.editGlass,n].forEach(g=>GLASS_OPTIONS.push(g)); },
                    () => { if(list.length>1){ const ng=list.filter((_,i)=>i!==settingsListIdx); setAppSettings(p=>({...p,editGlass:ng})); setSettingsListIdx(Math.max(0,settingsListIdx-1)); GLASS_OPTIONS.length=0; ng.forEach(g=>GLASS_OPTIONS.push(g)); }},
                    () => listSwap(list, n => { setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }, -1),
                    () => listSwap(list, n => { setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }, 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:250, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((g,i) => (
                        <div key={g.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:11, background: i===settingsListIdx ? (dk?'#2a2a3a':'#f0f0f8') : 'transparent', borderBottom:'1px solid '+T.borderLight, color:T.text }}>
                          <div style={{ fontWeight: i===settingsListIdx?600:400 }}>{g.label}</div>
                          <div style={{ fontSize:9, color:T.textMuted }}>{g.cat} \u00b7 U={g.uValue}</div>
                        </div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:20 }}>{sel.label}</div>
                      {field('Name', sel.label, v => { const n=[...list]; n[settingsListIdx]={...sel,label:v}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); })}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Category</div>
                        <select value={sel.cat} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,cat:e.target.value}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }} style={{ padding:'6px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, background:T.bgInput, color:T.text }}>
                          {['Clear IGU','Low-E','Tinted','Acoustic','Obscure','Safety'].map(c => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                        <div>
                          <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Thickness (m)</div>
                          <input type="number" step="0.001" value={sel.thickness} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,thickness:+e.target.value}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }} style={{ width:'100%', padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>U-Value</div>
                          <input value={sel.uValue} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,uValue:e.target.value}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }} style={{ width:'100%', padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Opacity</div>
                          <input type="number" step="0.01" value={sel.opacity} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,opacity:+e.target.value}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }} style={{ width:'100%', padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Tint colour</div>
                          <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                            <input type="color" value={sel.tint} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,tint:e.target.value}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }} style={{ width:32, height:28, border:'none', cursor:'pointer' }}/>
                            <input value={sel.tint} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,tint:e.target.value}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); }} style={{ flex:1, padding:'4px 6px', border:'1px solid '+T.border, borderRadius:4, fontSize:11, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                          </div>
                        </div>
                      </div>
                      {field('Description', sel.desc, v => { const n=[...list]; n[settingsListIdx]={...sel,desc:v}; setAppSettings(p=>({...p,editGlass:n})); GLASS_OPTIONS.length=0; n.forEach(g=>GLASS_OPTIONS.push(g)); })}
                    </div>}
                  </div>
                </div>;
              }

              // === PRODUCTS: FRAME STYLES ===
              if (settingsPath === 'prod-framestyles') {
                const list = appSettings.frameStyles;
                const sel = list[settingsListIdx];
                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  {toolbar(null, null,
                    () => listSwap(list, n => setAppSettings(p=>({...p,frameStyles:n})), -1),
                    () => listSwap(list, n => setAppSettings(p=>({...p,frameStyles:n})), 1)
                  )}
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:220, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {list.map((fs,i) => (
                        <div key={fs.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? (dk?'#2a2a3a':'#f0f0f8') : 'transparent', borderBottom:'1px solid '+T.borderLight, color:T.text }}>
                          <div style={{ fontWeight: i===settingsListIdx?600:400 }}>{fs.label}</div>
                          <div style={{ fontSize:9, color:T.textMuted }}>{fs.cat}</div>
                        </div>
                      ))}
                    </div>
                    {sel && <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ fontSize:16, fontWeight:600, color:T.text, marginBottom:6 }}>{sel.label}</div>
                      <div style={{ fontSize:11, color:T.textMuted, marginBottom:20 }}>Default: {sel.w} \u00d7 {sel.h}mm \u00b7 {sel.p} panel(s) \u00b7 {sel.cat}</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
                        {[['minW','Minimum width (mm)'],['maxW','Maximum width (mm)'],['minH','Minimum height (mm)'],['maxH','Maximum height (mm)'],['maxArea','Maximum m\u00b2']].map(([k,l]) => (
                          <div key={k}>
                            <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>{l}</div>
                            <input type="number" step={k==='maxArea'?0.1:1} value={sel[k]} onChange={e => { const n=[...list]; n[settingsListIdx]={...sel,[k]:+e.target.value}; setAppSettings(p=>({...p,frameStyles:n})); }} style={{ width:'100%', padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:13, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                          </div>
                        ))}
                      </div>
                      {toggle('Mirror lines', false, () => {})}
                      {toggle('Apply frame colour %', false, () => {})}
                      {toggle('Default hanging', true, () => {})}
                    </div>}
                  </div>
                </div>;
              }

              // ═══ PRICING SETTINGS SECTIONS ═══
              // === CUSTOM FRAME LAYOUTS ===
              // These are user-defined frame style presets. They show up in the
              // Frame Styles modal (the "Layout" button in the editor) alongside
              // the built-in FRAME_STYLE_PRESETS. Each one is bound to a single
              // product type — Awning, Casement, Sliding, etc. — because the
              // valid cell types differ by product (you can't have an "awning"
              // sash in a sliding-door layout).
              if (settingsPath === 'prod-customlayouts') {
                const cfs = appSettings.customFrameStyles || [];
                const cSel = cfs[settingsListIdx];
                const prodOpts = PRODUCTS.map(p => p.id);
                // Per-product valid cell types — what the user can cycle through
                // when clicking a cell. Awning windows allow only awning + fixed
                // sashes; casement allows L/R hinge variants; sliding is panel-
                // count-driven so cells just toggle fixed/sliding; fixed is
                // always 'fixed'.
                function cellOptionsFor(productType) {
                  if (productType === 'awning_window')   return ['fixed','awning'];
                  if (productType === 'casement_window') return ['fixed','casement_l','casement_r'];
                  if (productType === 'tilt_turn_window') return ['fixed','tilt_turn'];
                  if (productType === 'fixed_window')    return ['fixed'];
                  if (productType === 'sliding_window')  return ['fixed','sliding'];
                  if (productType && productType.indexOf('door') >= 0) return ['fixed','sliding','panel'];
                  return ['fixed','awning','casement_l','casement_r','tilt_turn','sliding'];
                }
                const cellOpts = cellOptionsFor(cSel ? cSel.type : 'awning_window');
                // Default cell type for a freshly-created layout under each type.
                function defaultCellFor(productType) {
                  var opts = cellOptionsFor(productType);
                  // Prefer the first non-fixed option as the active sash so
                  // a 1x1 layout isn't trivially equivalent to a fixed window.
                  for (var i = 0; i < opts.length; i++) if (opts[i] !== 'fixed') return opts[i];
                  return 'fixed';
                }
                // Build a sensible default new layout for a product type.
                // 1x1 single sash, named "<Type> 1x1" — user can rename + grow.
                function makeDefaultLayoutFor(productType) {
                  var prod = PRODUCTS.find(function(p){ return p.id === productType; });
                  var typeLabel = (prod && prod.label) || productType;
                  var defCell = defaultCellFor(productType);
                  return {
                    id:    'cfs_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
                    type:  productType,
                    label: typeLabel + ' 1x1 (custom)',
                    cols:  1,
                    rows:  1,
                    cells: [[defCell]],
                    wr:    [1],
                    hr:    [1],
                    ap:    1,
                  };
                }
                // Group the list by product type for display, so users with
                // many custom layouts can find theirs at a glance.
                var groupedCfs = {};
                cfs.forEach(function(fs, i) {
                  var t = fs.type || 'other';
                  if (!groupedCfs[t]) groupedCfs[t] = [];
                  groupedCfs[t].push({ fs: fs, idx: i });
                });
                // Stable display order: same as PRODUCTS array so groups
                // appear in the canonical type order.
                var groupOrder = prodOpts.filter(function(t){ return groupedCfs[t]; });

                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  <div style={{ padding:'8px 16px', borderBottom:'1px solid '+T.border, background:T.bgCard, display:'flex', gap:16, fontSize:12, color:T.text, alignItems:'center', flexWrap:'wrap' }}>
                    {/* New: pick product type then create. Inline buttons so the user
                        doesn't have to deal with a modal — one click per type. */}
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontWeight:600 }}>+ New layout for:</span>
                      {prodOpts.map(function(po) {
                        var prod = PRODUCTS.find(function(p){ return p.id === po; });
                        var label = (prod && prod.label) || po;
                        return <button key={po} onClick={function() {
                          var n = makeDefaultLayoutFor(po);
                          setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: [...(p.customFrameStyles || []), n] }); });
                          setSettingsListIdx(cfs.length);
                        }} style={{
                          padding:'4px 10px', fontSize:11, border:'1px solid '+T.border,
                          background:T.bgInput, color:T.text, borderRadius:4,
                          cursor:'pointer', fontWeight:500
                        }}>{label}</button>;
                      })}
                    </div>
                    <div style={{ flex:1 }}/>
                    {cSel && <div onClick={function() {
                      if (!confirm('Delete custom layout "' + cSel.label + '"?')) return;
                      setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: (p.customFrameStyles || []).filter(function(_, i){ return i !== settingsListIdx; }) }); });
                      setSettingsListIdx(Math.max(0, settingsListIdx - 1));
                    }} style={{ cursor:'pointer', display:'flex', alignItems:'center', gap:4, color:'#dc2626' }}>🗑 Delete</div>}
                    {cSel && <div onClick={function(){ listSwap(cfs, function(n){ setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); }); }, -1); }} style={{ cursor:'pointer' }}>&#8593; Up</div>}
                    {cSel && <div onClick={function(){ listSwap(cfs, function(n){ setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); }); }, 1); }} style={{ cursor:'pointer' }}>&#8595; Down</div>}
                  </div>
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:240, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {cfs.length === 0 && <div style={{ padding:16, fontSize:11, color:T.textMuted, textAlign:'center' }}>No custom layouts yet. Click a product type above to create your first one.</div>}
                      {/* Grouped list — section header per product type */}
                      {groupOrder.map(function(t) {
                        var prod = PRODUCTS.find(function(p){ return p.id === t; });
                        var groupLabel = (prod && prod.label) || t;
                        return <div key={t}>
                          <div style={{ padding:'6px 12px', fontSize:9, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.5, background:T.bgCard, borderBottom:'1px solid '+T.borderLight, position:'sticky', top:0 }}>
                            {groupLabel} <span style={{ color:T.textFaint, fontWeight:500 }}>({groupedCfs[t].length})</span>
                          </div>
                          {groupedCfs[t].map(function(rec) {
                            var fs = rec.fs;
                            var i = rec.idx;
                            return <div key={fs.id} onClick={function(){ setSettingsListIdx(i); }} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? (dk?'#2a2a3a':'#f0f0f8') : 'transparent', borderBottom:'1px solid '+T.borderLight, color:T.text }}>
                              <div style={{ fontWeight: i===settingsListIdx?600:400 }}>{fs.label}</div>
                              <div style={{ fontSize:9, color:T.textMuted }}>{fs.cols}x{fs.rows} - {fs.ap} apertures</div>
                            </div>;
                          })}
                        </div>;
                      })}
                    </div>
                    {cSel && <div style={{ flex:1, padding:20, overflowY:'auto' }}>
                      <div style={{ fontSize:15, fontWeight:600, color:T.text, marginBottom:16 }}>{cSel.label}</div>
                      {field('Name', cSel.label, function(v){ const n=[...cfs]; n[settingsListIdx]={...cSel,label:v}; setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); }); })}
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Product type</div>
                        <select value={cSel.type} onChange={function(e){
                          var nt = e.target.value;
                          // Reset cells to valid types for the new product when
                          // switching, otherwise the user could leave invalid
                          // cells (e.g. an awning sash in a sliding layout).
                          var newOpts = cellOptionsFor(nt);
                          var newCells = cSel.cells.map(function(row){
                            return row.map(function(c){ return newOpts.indexOf(c) >= 0 ? c : (newOpts[1] || newOpts[0]); });
                          });
                          const n=[...cfs]; n[settingsListIdx]={...cSel,type:nt,cells:newCells};
                          setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); });
                        }} style={{ padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, background:T.bgInput, color:T.text }}>
                          {prodOpts.map(function(po){ return <option key={po} value={po}>{PRODUCTS.find(function(p){ return p.id===po; })?.label || po}</option>; })}
                        </select>
                      </div>
                      <div style={{ display:'flex', gap:12, marginBottom:12 }}>
                        <div>
                          <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Columns</div>
                          <input type="number" min={1} max={5} value={cSel.cols} onChange={function(e){
                            var nc=Math.max(1,Math.min(5,+e.target.value));
                            var nr=cSel.rows;
                            var defCell = defaultCellFor(cSel.type);
                            var cells=[];for(var rr=0;rr<nr;rr++){cells[rr]=[];for(var cc=0;cc<nc;cc++) cells[rr][cc]=(cSel.cells[rr]&&cSel.cells[rr][cc])||defCell;}
                            var wr=Array(nc).fill(1);
                            const n=[...cfs]; n[settingsListIdx]={...cSel,cols:nc,cells:cells,wr:wr,ap:nc*nr};
                            setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); });
                          }} style={{ width:50, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, background:T.bgInput, color:T.text }}/>
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:T.textSub, marginBottom:4 }}>Rows</div>
                          <input type="number" min={1} max={5} value={cSel.rows} onChange={function(e){
                            var nr=Math.max(1,Math.min(5,+e.target.value));
                            var nc=cSel.cols;
                            var defCell = defaultCellFor(cSel.type);
                            var cells=[];for(var rr=0;rr<nr;rr++){cells[rr]=[];for(var cc=0;cc<nc;cc++) cells[rr][cc]=(cSel.cells[rr]&&cSel.cells[rr][cc])||defCell;}
                            var hr=Array(nr).fill(1);
                            const n=[...cfs]; n[settingsListIdx]={...cSel,rows:nr,cells:cells,hr:hr,ap:nc*nr};
                            setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); });
                          }} style={{ width:50, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, background:T.bgInput, color:T.text }}/>
                        </div>
                      </div>
                      <div style={{ fontSize:11, color:T.textSub, marginBottom:6 }}>Cell types <span style={{color:T.textFaint}}>(click to cycle through valid types for {PRODUCTS.find(function(p){ return p.id===cSel.type; })?.label || cSel.type})</span></div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat('+cSel.cols+', 1fr)', gap:4, marginBottom:16, maxWidth:300 }}>
                        {cSel.cells.map(function(row,ri){ return row.map(function(cell,ci){
                          var idx2 = cellOpts.indexOf(cell);
                          if (idx2 < 0) idx2 = 0;  // unknown cell type for this product → start from top
                          return <div key={ri+'_'+ci} onClick={function(){
                            var next = cellOpts[(idx2+1)%cellOpts.length];
                            var nc2=cSel.cells.map(function(r){ return [...r]; }); nc2[ri][ci]=next;
                            const n=[...cfs]; n[settingsListIdx]={...cSel,cells:nc2};
                            setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); });
                          }} style={{ padding:'8px 4px', border:'1px solid '+T.border, borderRadius:4, cursor:'pointer', textAlign:'center', fontSize:10, fontWeight:600, background: cell==='fixed'?T.bgPanel:(dk?'#2a2a3a':'#e8e8f0'), color:T.text }}>
                            {cell}
                          </div>;
                        }); })}
                      </div>
                      <div style={{ fontSize:11, color:T.textSub, marginBottom:6 }}>Width ratios (proportional)</div>
                      <div style={{ display:'flex', gap:4, marginBottom:12 }}>
                        {cSel.wr.map(function(w,i){ return (
                          <input key={'wr'+i} type="number" min={1} max={5} value={w} onChange={function(e){
                            var nw=[...cSel.wr]; nw[i]=Math.max(1,+e.target.value);
                            const n=[...cfs]; n[settingsListIdx]={...cSel,wr:nw};
                            setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); });
                          }} style={{ width:40, padding:'4px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, textAlign:'center', background:T.bgInput, color:T.text }}/>
                        ); })}
                      </div>
                      <div style={{ fontSize:11, color:T.textSub, marginBottom:6 }}>Height ratios (proportional)</div>
                      <div style={{ display:'flex', gap:4, marginBottom:12 }}>
                        {cSel.hr.map(function(h,i){ return (
                          <input key={'hr'+i} type="number" min={1} max={5} value={h} onChange={function(e){
                            var nh=[...cSel.hr]; nh[i]=Math.max(1,+e.target.value);
                            const n=[...cfs]; n[settingsListIdx]={...cSel,hr:nh};
                            setAppSettings(function(p){ return Object.assign({}, p, { customFrameStyles: n }); });
                          }} style={{ width:40, padding:'4px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, textAlign:'center', background:T.bgInput, color:T.text }}/>
                        ); })}
                      </div>

                      {/* Live preview — proportional grid that mimics what the
                          frame will look like in the Frame Styles modal. */}
                      <div style={{ marginTop:24, paddingTop:16, borderTop:'1px solid '+T.border }}>
                        <div style={{ fontSize:11, color:T.textSub, marginBottom:6 }}>Preview</div>
                        {(function(){
                          var wrSum = cSel.wr.reduce(function(a,b){return a+b;},0) || 1;
                          var hrSum = cSel.hr.reduce(function(a,b){return a+b;},0) || 1;
                          return <div style={{ display:'inline-block', border:'2px solid #444', background:'#fff', padding:2 }}>
                            <div style={{ display:'grid',
                                          gridTemplateColumns: cSel.wr.map(function(w){ return (w/wrSum*200) + 'px'; }).join(' '),
                                          gridTemplateRows:    cSel.hr.map(function(h){ return (h/hrSum*150) + 'px'; }).join(' '),
                                          gap:1, background:'#888' }}>
                              {cSel.cells.map(function(row, ri){ return row.map(function(cell, ci){
                                var color = cell === 'fixed' ? '#e8eef5'
                                          : cell === 'awning' ? '#fef3c7'
                                          : cell.indexOf('casement') === 0 ? '#dcfce7'
                                          : cell === 'tilt_turn' ? '#fce7f3'
                                          : cell === 'sliding' ? '#dbeafe'
                                          : '#f3f4f6';
                                return <div key={'pv'+ri+'_'+ci} style={{ background: color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#444', padding:2 }}>
                                  {cell}
                                </div>;
                              }); })}
                            </div>
                          </div>;
                        })()}
                        <div style={{ fontSize:10, color:T.textMuted, marginTop:8 }}>
                          This layout will appear in the Frame Styles modal when you build a new <b>{PRODUCTS.find(function(p){ return p.id===cSel.type; })?.label || cSel.type}</b>.
                        </div>
                      </div>
                    </div>}
                  </div>
                </div>;
              }



              if (settingsPath === 'render-quality') {
                // ─── 3D Renderer — Render quality settings ───────────────────
                // User-tunable controls for the 3D viewport. These live at
                // appSettings.renderQuality and are read by the THREE init
                // useEffect on mount; changing any value triggers a clean
                // teardown + re-init (the dep array includes
                // appSettings.renderQuality), so changes are immediate. The
                // geometry rebuild useEffect also depends on renderQuality
                // so the productGroup re-attaches to the freshly-built scene.
                //
                // Defaults preserve existing visual behaviour: flat-grey
                // HDRI, no shadow maps, no RectAreaLight, exposure 1.8,
                // ACES tone mapping, neutral saturation/contrast, 1.0
                // env multiplier. Users opt into every enhancement.
                var rqDefaults = {
                  toneExposure: 1.8, toneMapping: 'aces',
                  hdriStyle: 'flat', hdriRotation: 0,
                  backgroundMode: 'theme', backgroundColor: '#fafafa',
                  envIntensityMult: 1.0,
                  ambientIntensity: 0.30, hemiIntensity: 1.00, fillIntensity: 1.00,
                  shadows: false, shadowSoftness: 4, shadowMapSize: 2048,
                  rectAreaLight: false, rectAreaIntensity: 3,
                  cameraFov: 32,
                  saturation: 1.0, contrast: 1.0,
                };
                var rq = Object.assign({}, rqDefaults, (appSettings && appSettings.renderQuality) || {});
                function setRq(key, val) {
                  setAppSettings(function(prev) {
                    var next = Object.assign({}, prev.renderQuality || {}, {});
                    next[key] = val;
                    return Object.assign({}, prev, { renderQuality: next });
                  });
                }
                function resetRq() {
                  if (!confirm('Reset 3D render quality to defaults? Your other settings stay untouched.')) return;
                  setAppSettings(function(prev) {
                    return Object.assign({}, prev, { renderQuality: Object.assign({}, rqDefaults) });
                  });
                }
                var hasOverride = JSON.stringify(rq) !== JSON.stringify(rqDefaults);

                // Reusable card + slider helpers — keeps the JSX below
                // readable and ensures every control has consistent
                // styling. Section header is just a heading + subtitle.
                var cardStyle = { marginBottom:16, padding:14, background:T.bgCard, border:'1px solid '+T.border, borderRadius:6 };
                var sectionHeaderStyle = { fontSize:13, fontWeight:700, color:T.text, marginTop:24, marginBottom:8, paddingBottom:6, borderBottom:'2px solid '+T.border, textTransform:'uppercase', letterSpacing:0.4 };
                function rqSlider(label, key, min, max, step, helper, fmt) {
                  fmt = fmt || function(v){ return Number(v).toFixed(2); };
                  return (
                    <div style={cardStyle} key={key}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:T.text }}>{label}</div>
                        <span style={{ fontFamily:'monospace', fontSize:11, fontWeight:600, color:T.accent }}>{fmt(rq[key])}</span>
                      </div>
                      {helper && <div style={{ fontSize:10, color:T.textMuted, marginBottom:8, lineHeight:1.4 }}>{helper}</div>}
                      <input type="range" min={min} max={max} step={step} value={rq[key]}
                             onChange={function(e){ setRq(key, Number(e.target.value)); }}
                             style={{ width:'100%', accentColor:T.accent }}/>
                    </div>
                  );
                }

                return <div style={{ padding:24, maxWidth:720, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>3D Render Quality</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:18, lineHeight:1.5 }}>
                    Tune how the 3D viewport renders frames. Changes apply immediately. Defaults preserve the original schematic look — opt into shadows, studio HDRI, the area light, and the post-process controls for a more photographic finish.
                    {hasOverride && (
                      <button onClick={resetRq}
                              style={{ marginLeft:12, background:'transparent', color:T.text, border:'1px solid '+T.border, borderRadius:3, padding:'2px 8px', fontSize:9, fontWeight:600, cursor:'pointer' }}>
                        Reset all to defaults
                      </button>
                    )}
                  </div>

                  {/* ═══════════════ TONE & EXPOSURE ═══════════════ */}
                  <div style={sectionHeaderStyle}>Tone &amp; Exposure</div>

                  {rqSlider('Tone exposure', 'toneExposure', 0.5, 2.5, 0.05,
                    'Overall scene brightness multiplier. Lower = moodier with more material contrast; higher = brighter showroom feel. With studio HDRI on, around 1.2–1.4 looks natural; with flat HDRI, the legacy 1.8 fits the brighter ambient.')}

                  {/* Tone-mapping mode picker */}
                  <div style={cardStyle}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:4 }}>Tone-mapping curve</div>
                    <div style={{ fontSize:10, color:T.textMuted, marginBottom:8, lineHeight:1.4 }}>
                      How highlights are compressed into the visible range. <b>ACES</b> is filmic and forgiving (default). <b>Cineon</b> is similar with cooler shadows. <b>Reinhard</b> is gentle and slightly washed. <b>Linear</b> is uncompressed (clips bright highlights). <b>None</b> is raw output (mostly for debugging).
                    </div>
                    <div style={{ display:'flex', gap:0, border:'1px solid '+T.border, borderRadius:3, overflow:'hidden', width:'fit-content', flexWrap:'wrap' }}>
                      {[
                        { id:'aces',     label:'ACES filmic' },
                        { id:'cineon',   label:'Cineon' },
                        { id:'reinhard', label:'Reinhard' },
                        { id:'linear',   label:'Linear' },
                        { id:'none',     label:'None' },
                      ].map(function(opt, idx) {
                        var active = rq.toneMapping === opt.id;
                        return <button key={opt.id}
                                       onClick={function(){ setRq('toneMapping', opt.id); }}
                                       style={{
                                         background: active ? '#1f2937' : 'transparent',
                                         color: active ? 'white' : T.text,
                                         border:'none', borderLeft: idx === 0 ? 'none' : '1px solid '+T.border,
                                         padding:'5px 11px', fontSize:10, fontWeight:600, cursor:'pointer'
                                       }}>{opt.label}</button>;
                      })}
                    </div>
                  </div>

                  {/* ═══════════════ ENVIRONMENT ═══════════════ */}
                  <div style={sectionHeaderStyle}>Environment &amp; Background</div>

                  {/* HDRI style */}
                  <div style={cardStyle}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:4 }}>Environment lighting (HDRI)</div>
                    <div style={{ fontSize:10, color:T.textMuted, marginBottom:8, lineHeight:1.4 }}>
                      The "world" surrounding the frame, used for reflections on glass, metal hardware, and clearcoat foils. Flat is uniform grey. Studio adds a procedural softbox setup with key + side fill that gives glass believable reflections and makes woodgrain depth read better.
                    </div>
                    <div style={{ display:'flex', gap:0, border:'1px solid '+T.border, borderRadius:3, overflow:'hidden', width:'fit-content' }}>
                      {[
                        { id:'flat',   label:'Flat grey',         hint:'Uniform grey, zero hotspots (current default)' },
                        { id:'studio', label:'Studio softbox',    hint:'Procedural softbox HDRI with key + side fill' },
                      ].map(function(opt, idx) {
                        var active = rq.hdriStyle === opt.id;
                        return <button key={opt.id}
                                       title={opt.hint}
                                       onClick={function(){ setRq('hdriStyle', opt.id); }}
                                       style={{
                                         background: active ? '#1f2937' : 'transparent',
                                         color: active ? 'white' : T.text,
                                         border:'none', borderLeft: idx === 0 ? 'none' : '1px solid '+T.border,
                                         padding:'5px 11px', fontSize:10, fontWeight:600, cursor:'pointer'
                                       }}>{opt.label}</button>;
                      })}
                    </div>
                    {rq.hdriStyle === 'studio' && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:10, color:T.textSub }}>HDRI rotation</span>
                          <span style={{ fontFamily:'monospace', fontSize:10, color:T.accent, fontWeight:600 }}>{rq.hdriRotation.toFixed(0)}°</span>
                        </div>
                        <input type="range" min="0" max="360" step="5" value={rq.hdriRotation}
                               onChange={function(e){ setRq('hdriRotation', Number(e.target.value)); }}
                               style={{ width:'100%', accentColor:T.accent }}/>
                        <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>Spins the softbox around the frame. Useful for moving the bright reflection off glazing or hardware.</div>
                      </div>
                    )}
                  </div>

                  {rqSlider('Material reflection intensity (global)', 'envIntensityMult', 0.25, 3.0, 0.05,
                    'Scales every material\u2019s envMapIntensity globally. <1.0 muted reflections, 1.0 normal, >1.0 cranks reflections higher across all colours at once. Most powerful single dial for "premium" feel.')}

                  {/* Background mode */}
                  <div style={cardStyle}>
                    <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:4 }}>Background</div>
                    <div style={{ fontSize:10, color:T.textMuted, marginBottom:8, lineHeight:1.4 }}>
                      What sits behind the frame in the viewport. <b>Theme</b> follows light/dark mode (legacy). <b>Solid</b> uses a custom colour picker. <b>HDRI</b> shows the studio softbox itself (only with HDRI: Studio).
                    </div>
                    <div style={{ display:'flex', gap:0, border:'1px solid '+T.border, borderRadius:3, overflow:'hidden', width:'fit-content', marginBottom:10 }}>
                      {[
                        { id:'theme', label:'Theme' },
                        { id:'solid', label:'Solid colour' },
                        { id:'hdri',  label:'Show HDRI' },
                      ].map(function(opt, idx) {
                        var active = rq.backgroundMode === opt.id;
                        var disabled = opt.id === 'hdri' && rq.hdriStyle !== 'studio';
                        return <button key={opt.id}
                                       disabled={disabled}
                                       title={disabled ? 'Switch HDRI to Studio softbox first' : ''}
                                       onClick={function(){ if (!disabled) setRq('backgroundMode', opt.id); }}
                                       style={{
                                         background: active ? '#1f2937' : 'transparent',
                                         color: active ? 'white' : (disabled ? T.textFaint : T.text),
                                         border:'none', borderLeft: idx === 0 ? 'none' : '1px solid '+T.border,
                                         padding:'5px 11px', fontSize:10, fontWeight:600,
                                         cursor: disabled ? 'not-allowed' : 'pointer',
                                         opacity: disabled ? 0.5 : 1,
                                       }}>{opt.label}</button>;
                      })}
                    </div>
                    {rq.backgroundMode === 'solid' && (
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <input type="color" value={rq.backgroundColor}
                               onChange={function(e){ setRq('backgroundColor', e.target.value); }}
                               style={{ width:48, height:32, border:'none', cursor:'pointer' }}/>
                        <input type="text" value={rq.backgroundColor}
                               onChange={function(e){ setRq('backgroundColor', e.target.value); }}
                               style={{ width:120, padding:'6px 8px', border:'1px solid '+T.border, borderRadius:4, fontSize:11, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                      </div>
                    )}
                  </div>

                  {/* ═══════════════ LIGHTING BALANCE ═══════════════ */}
                  <div style={sectionHeaderStyle}>Lighting Balance</div>

                  {rqSlider('Ambient light', 'ambientIntensity', 0.0, 2.0, 0.05,
                    'Flat fill across every surface. Higher = less material contrast (everything lit). Lower = punchier shadows but darker mid-tones.')}

                  {rqSlider('Hemisphere light (sky/ground)', 'hemiIntensity', 0.0, 2.0, 0.05,
                    'Soft top/bottom gradient fill. Drives the natural-looking ambient that picks up sky-grey on top of the frame and warmer floor-bounce underneath.')}

                  {rqSlider('Directional fill lights', 'fillIntensity', 0.0, 2.0, 0.05,
                    'Multiplier on the four corner directional fills that define the frame\u2019s form (front, back, left, right). Below 1.0 reads moody; above 1.0 fully-lit showroom.')}

                  {/* ═══════════════ SHADOWS ═══════════════ */}
                  <div style={sectionHeaderStyle}>Shadows</div>

                  <div style={cardStyle}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:T.text }}>Cast shadows</div>
                      <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                        <input type="checkbox" checked={!!rq.shadows}
                               onChange={function(e){ setRq('shadows', e.target.checked); }}/>
                        <span style={{ fontSize:11, color:T.text }}>Enabled</span>
                      </label>
                    </div>
                    <div style={{ fontSize:10, color:T.textMuted, marginBottom:8, lineHeight:1.4 }}>
                      Real shadow maps anchor the frame to a ground plane and add depth at corners and rebates. Off by default — the schematic look uses a fake circle shadow underneath instead. Costs a small amount of GPU time.
                    </div>
                    {rq.shadows && (
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:10, color:T.textSub }}>Shadow softness</span>
                          <span style={{ fontFamily:'monospace', fontSize:10, color:T.accent, fontWeight:600 }}>{rq.shadowSoftness}</span>
                        </div>
                        <input type="range" min="0" max="10" step="1" value={rq.shadowSoftness}
                               onChange={function(e){ setRq('shadowSoftness', Number(e.target.value)); }}
                               style={{ width:'100%', accentColor:T.accent, marginBottom:10 }}/>
                        <div style={{ fontSize:9, color:T.textFaint, marginBottom:10 }}>Higher = softer, more diffuse shadow edges. Lower = crisper, more directional.</div>

                        <div style={{ fontSize:10, color:T.textSub, marginBottom:6 }}>Shadow map resolution</div>
                        <div style={{ display:'flex', gap:0, border:'1px solid '+T.border, borderRadius:3, overflow:'hidden', width:'fit-content' }}>
                          {[1024, 2048, 4096].map(function(sz, idx) {
                            var active = rq.shadowMapSize === sz;
                            return <button key={sz}
                                           onClick={function(){ setRq('shadowMapSize', sz); }}
                                           style={{
                                             background: active ? '#1f2937' : 'transparent',
                                             color: active ? 'white' : T.text,
                                             border:'none', borderLeft: idx === 0 ? 'none' : '1px solid '+T.border,
                                             padding:'4px 12px', fontSize:10, fontWeight:600, cursor:'pointer'
                                           }}>{sz}px</button>;
                          })}
                        </div>
                        <div style={{ fontSize:9, color:T.textFaint, marginTop:4 }}>Higher = sharper shadow edges, but bigger GPU memory footprint. 4096 only on desktop GPUs.</div>
                      </div>
                    )}
                  </div>

                  {/* ═══════════════ HIGHLIGHTS ═══════════════ */}
                  <div style={sectionHeaderStyle}>Highlights</div>

                  <div style={cardStyle}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:T.text }}>Overhead area light</div>
                      <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                        <input type="checkbox" checked={!!rq.rectAreaLight}
                               onChange={function(e){ setRq('rectAreaLight', e.target.checked); }}/>
                        <span style={{ fontSize:11, color:T.text }}>Enabled</span>
                      </label>
                    </div>
                    <div style={{ fontSize:10, color:T.textMuted, marginBottom:8, lineHeight:1.4 }}>
                      Adds an elongated softbox highlight typical of product photography. Glass picks up a directional gleam, metal hardware reflects more naturally. Off by default — adds shader cost.
                    </div>
                    {rq.rectAreaLight && (
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:10, color:T.textSub }}>Intensity</span>
                          <span style={{ fontFamily:'monospace', fontSize:10, color:T.accent, fontWeight:600 }}>{rq.rectAreaIntensity.toFixed(2)}</span>
                        </div>
                        <input type="range" min="0" max="10" step="0.25" value={rq.rectAreaIntensity}
                               onChange={function(e){ setRq('rectAreaIntensity', Number(e.target.value)); }}
                               style={{ width:'100%', accentColor:T.accent }}/>
                        <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>Higher = brighter highlight. Around 3 is a good start.</div>
                      </div>
                    )}
                  </div>

                  {/* ═══════════════ CAMERA ═══════════════ */}
                  <div style={sectionHeaderStyle}>Camera</div>

                  {rqSlider('Field of view (FOV)', 'cameraFov', 18, 60, 1,
                    'Camera focal length. Lower (18–25°) = telephoto, less perspective distortion, professional product-shot look. Default 32° matches the legacy view. Higher (45–60°) = wide-angle with more depth/exaggeration.',
                    function(v){ return Math.round(v) + '°'; })}

                  {/* ═══════════════ POST-PROCESSING ═══════════════ */}
                  <div style={sectionHeaderStyle}>Post-Processing</div>

                  {rqSlider('Saturation', 'saturation', 0.0, 2.0, 0.05,
                    'Colour intensity. 0 = greyscale, 1.0 = unchanged, 1.4–1.6 = punchy showroom finish that reads well in marketing photos. Above 2 risks clipping.')}

                  {rqSlider('Contrast', 'contrast', 0.5, 1.8, 0.05,
                    'Difference between highlights and shadows. 1.0 = unchanged. Above 1 deepens blacks and brightens highlights for a richer image. Below 1 flattens — useful when shadows are crushing detail.')}

                  <div style={{ marginTop:24, padding:'12px 14px', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:4, fontSize:10, color:'#78350f', lineHeight:1.6 }}>
                    <div style={{ fontSize:11, fontWeight:700, marginBottom:4 }}>Recipe — &ldquo;photographic timber&rdquo;</div>
                    HDRI: <b>Studio softbox</b> · Cast shadows: <b>on</b> · Tone exposure: <b>1.30</b> · Material reflections: <b>1.40</b> · Saturation: <b>1.20</b> · Contrast: <b>1.10</b> · Overhead area light: <b>on at 4.0</b>. Then upload photographic foil textures per timber colour in <b>Settings → Products → Colours</b>. Procedural grain still works as the fallback when no photo is uploaded.
                  </div>

                  <div style={{ marginTop:12, padding:'12px 14px', background: T.bgCard, border:'1px solid '+T.border, borderRadius:4, fontSize:10, color:T.textSub, lineHeight:1.6 }}>
                    <div style={{ fontSize:11, fontWeight:700, marginBottom:4, color:T.text }}>Recipe — &ldquo;moody hero&rdquo;</div>
                    HDRI: <b>Flat grey</b> · Tone exposure: <b>0.95</b> · Ambient: <b>0.10</b> · Hemi: <b>0.50</b> · Fill: <b>0.65</b> · Saturation: <b>1.30</b> · Contrast: <b>1.30</b> · Background: <b>Solid</b> with a deep colour. Best for dark-anthracite or jet-black showroom shots.
                  </div>
                </div>;
              }

              if (settingsPath === 'prod-types') {
                // ─── Product Types — Per-type Assembly DXF ────────────────
                // Each product type (Awning, Casement, Tilt&Turn, etc.)
                // owns its own assembly cross-section drawing. The DXF is
                // parsed on upload, dimensions extracted, and the values
                // drive the Profile / Glass / Steel cut formulas at runtime
                // for any frame of that type.
                //
                // appSettings.productTypeAssemblies is keyed by product
                // type id ('awning_window', 'tilt_turn_window', …). A type
                // with no entry gets legacy fallback formulas (gap = 0,
                // clearance = 6) — same behaviour as before this feature
                // existed.
                var ptList = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).slice();
                var ptaMap = appSettings.productTypeAssemblies || {};
                var selectedType = ptList[settingsListIdx] || ptList[0];
                if (!selectedType) {
                  return <div style={{ padding:24, color:T.textMuted, fontSize:12 }}>No product types defined.</div>;
                }
                var entry = ptaMap[selectedType.id] || {};

                function updPta(typeId, patch) {
                  setAppSettings(function(p) {
                    var existing = (p.productTypeAssemblies && p.productTypeAssemblies[typeId]) || {};
                    var next = Object.assign({}, p.productTypeAssemblies || {});
                    next[typeId] = Object.assign({}, existing, patch);
                    return Object.assign({}, p, { productTypeAssemblies: next });
                  });
                }
                function clearPta(typeId) {
                  if (!confirm('Clear all assembly data for this product type? Cuts will revert to legacy formulas until you upload a new DXF.')) return;
                  setAppSettings(function(p) {
                    var next = Object.assign({}, p.productTypeAssemblies || {});
                    delete next[typeId];
                    return Object.assign({}, p, { productTypeAssemblies: next });
                  });
                }
                function uploadAssemblyForType(typeId, file) {
                  var reader = new FileReader();
                  reader.onload = function(e) {
                    var text = e.target.result;
                    try {
                      var asm = parseDxfAssembly(text);
                      if (!asm.primitives || !asm.primitives.length) {
                        alert('No drawable entities found in this DXF. Ensure it contains LWPOLYLINE, LINE, or HATCH boundary entities.');
                        return;
                      }
                      var metrics = (typeof measureAssembly === 'function') ? measureAssembly(asm) : null;
                      updPta(typeId, {
                        assembly: {
                          parsed: asm,
                          fileName: file.name,
                          uploadedAt: Date.now(),
                          rotateDeg: -90,
                          showDimensions: false,
                        },
                        metricsExtracted: metrics,
                      });
                    } catch (err) {
                      alert('Failed to parse DXF: ' + err.message);
                    }
                  };
                  reader.readAsText(file);
                }

                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:240, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {ptList.map(function(pt, i) {
                        var hasAsm = !!(ptaMap[pt.id] && ptaMap[pt.id].assembly && ptaMap[pt.id].assembly.parsed);
                        var hasMetrics = !!(ptaMap[pt.id] && ptaMap[pt.id].metricsExtracted);
                        return (
                          <div key={pt.id} onClick={() => setSettingsListIdx(i)} style={{ padding:'10px 12px', cursor:'pointer', fontSize:12, background: i===settingsListIdx ? (dk?'#2a2a3a':'#f0f0f8') : 'transparent', borderBottom:'1px solid '+T.borderLight, color:T.text }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                              <div style={{ fontWeight: i===settingsListIdx?700:400, flex:1 }}>{pt.label}</div>
                              {hasAsm && <span style={{ fontSize:8, color:'#166534', background:'#dcfce7', padding:'1px 4px', borderRadius:2, fontWeight:700 }}>DXF</span>}
                              {hasMetrics && <span style={{ fontSize:8, color:'#1e3a8a', background:'#dbeafe', padding:'1px 4px', borderRadius:2, fontWeight:700 }}>📐</span>}
                            </div>
                            <div style={{ fontSize:9, color:T.textMuted, marginTop:2 }}>{pt.cat} · {pt.id}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      {/* Header */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                        <div>
                          <div style={{ fontSize:18, fontWeight:700, color:T.text }}>{selectedType.label}</div>
                          <div style={{ fontSize:11, color:T.textMuted, marginTop:2, fontFamily:'monospace' }}>{selectedType.id} · {selectedType.cat}</div>
                        </div>
                        {entry.assembly && (
                          <button onClick={() => clearPta(selectedType.id)}
                            style={{ background:'transparent', color:'#dc2626', border:'1px solid #dc2626', borderRadius:4, padding:'6px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            Clear assembly data
                          </button>
                        )}
                      </div>

                      {/* Notes */}
                      <div style={{ marginBottom:16, maxWidth:700 }}>
                        <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Notes (system reference, supplier, etc.)</div>
                        <textarea value={entry.notes || ''}
                          onChange={(e) => updPta(selectedType.id, { notes: e.target.value })}
                          placeholder={'e.g. "Aluplast Ideal 4000, 70mm 5-chamber"'}
                          rows={2}
                          style={{ width:'100%', padding:'6px 10px', fontSize:12, background:T.bgInput, color:T.text, border:'1px solid '+T.border, borderRadius:3, resize:'vertical', fontFamily:'inherit' }}/>
                      </div>

                      {/* Assembly DXF upload */}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Assembly section DXF</div>
                          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                            <input type="file" accept=".dxf" id={'assembly-dxf-' + selectedType.id} style={{ display:'none' }}
                              onChange={(e) => { var f = e.target.files && e.target.files[0]; if (f) uploadAssemblyForType(selectedType.id, f); e.target.value = ''; }}/>
                            <label htmlFor={'assembly-dxf-' + selectedType.id} style={{ background:'#1f2937', color:'white', border:'none', borderRadius:4, padding:'6px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                              ⬆ {entry.assembly ? 'Replace DXF' : 'Upload DXF'}
                            </label>
                          </div>
                        </div>
                        {entry.assembly && entry.assembly.parsed ? (
                          <div>
                            <div style={{ fontSize:10, color:T.textMuted, marginBottom:8 }}>
                              <b>{entry.assembly.fileName}</b> · {entry.assembly.parsed.primitives.length} entities · bbox {Math.round(entry.assembly.parsed.bbox.w)} × {Math.round(entry.assembly.parsed.bbox.h)} mm · {Object.keys(entry.assembly.parsed.layers).length} layers
                            </div>
                            <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
                              <label style={{ fontSize:11, color:T.text, display:'flex', alignItems:'center', gap:6 }}>
                                Rotate
                                <select value={entry.assembly.rotateDeg || 0}
                                  onChange={(e) => updPta(selectedType.id, { assembly: Object.assign({}, entry.assembly, { rotateDeg: +e.target.value }) })}
                                  style={{ padding:'4px 8px', fontSize:11, fontFamily:'monospace', background:T.bgInput, color:T.text, border:'1px solid '+T.border, borderRadius:3 }}>
                                  <option value="0">0°</option>
                                  <option value="90">90°</option>
                                  <option value="-90">-90°</option>
                                  <option value="180">180°</option>
                                </select>
                              </label>
                              <label style={{ fontSize:11, color:T.text, display:'flex', alignItems:'center', gap:6 }}>
                                <input type="checkbox" checked={!!entry.assembly.showDimensions}
                                  onChange={(e) => updPta(selectedType.id, { assembly: Object.assign({}, entry.assembly, { showDimensions: e.target.checked }) })}/>
                                Show dimensions
                              </label>
                            </div>
                            <div style={{ width:'100%', height:520, background:dk ? '#0a0a10' : '#fafafa', borderRadius:6, padding:12, border:'1px solid '+T.borderLight }}>
                              <div style={{ width:'100%', height:'100%' }}
                                dangerouslySetInnerHTML={{ __html: renderAssemblySvg(entry.assembly.parsed, { padPx:4, rotateDeg: entry.assembly.rotateDeg || 0, showDimensions: !!entry.assembly.showDimensions }) }}/>
                            </div>
                            {/* Layer legend */}
                            <details style={{ marginTop:10 }}>
                              <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer', fontWeight:600 }}>Layer legend ({Object.keys(entry.assembly.parsed.layers).length})</summary>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:6, marginTop:8 }}>
                                {Object.keys(entry.assembly.parsed.layers).sort().map(function(layerName) {
                                  var st = styleForLayer(layerName);
                                  if (st.skip) return null;
                                  return (
                                    <div key={layerName} style={{ display:'flex', alignItems:'center', gap:8, fontSize:10, padding:'3px 6px', background:'white', border:'1px solid '+T.border, borderRadius:3 }}>
                                      <span style={{ display:'inline-block', width:14, height:14, background:st.fill === 'none' ? 'transparent' : st.fill, border:'1px solid '+st.stroke, borderRadius:2 }}/>
                                      <span style={{ fontFamily:'monospace', flex:1, color:T.text }}>{layerName}</span>
                                      <span style={{ color:T.textMuted }}>{entry.assembly.parsed.layers[layerName]}×</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>

                            {/* Extracted metrics + editable overrides */}
                            {(function(){
                              var ex = entry.metricsExtracted || {};
                              var ov = entry.metricsOverride || {};
                              function effective(k) { return (ov[k] != null) ? ov[k] : ex[k]; }
                              function setOverride(k, v) {
                                var newOv = Object.assign({}, ov);
                                if (v === '' || v == null || isNaN(+v)) delete newOv[k];
                                else newOv[k] = +v;
                                updPta(selectedType.id, { metricsOverride: newOv });
                              }
                              function reExtract() {
                                if (!entry.assembly || !entry.assembly.parsed) return;
                                var newMetrics = measureAssembly(entry.assembly.parsed);
                                updPta(selectedType.id, { metricsExtracted: newMetrics });
                              }
                              var fields = [
                                { key:'frameSightlineMm',        label:'Frame sightline',         hint:'Visible face width of the outer frame' },
                                { key:'frameDepthMm',            label:'Frame depth',             hint:'Depth of the frame profile' },
                                { key:'sashSightlineMm',         label:'Sash sightline',          hint:'Visible face width of the sash' },
                                { key:'sashDepthMm',             label:'Sash depth',              hint:'Depth of the sash profile' },
                                { key:'frameSashGapMm',          label:'Frame–sash gap',          hint:'Air gap at the gasket compression line. Subtract 2× this from the frame opening to get sash outer dimension.' },
                                { key:'glassRebateDepthMm',      label:'Glass rebate depth',      hint:'Width of the channel that holds the DGU. Should equal the DGU thickness (e.g. 24 = 4-12-4 IGU + tolerance).' },
                                { key:'glassRebateHeightMm',     label:'Glass rebate height',     hint:'Height of the rebate channel; constrains how much glass edge sits inside the sash.' },
                                { key:'glazingPackerThicknessMm',label:'Glazing packer',          hint:'Thickness of the bridge / location packers under the glass.' },
                                { key:'sashGlassClearanceMm',    label:'Sash–glass clearance',    hint:'Total air gap (W & H) between glass edge and sash rebate inner walls. Standard ~6mm.' },
                              ];
                              var anyExtracted = Object.keys(ex).some(function(k){ return ex[k] != null; });
                              return (
                                <details style={{ marginTop:10 }} open>
                                  <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer', fontWeight:600 }}>📐 Extracted dimensions (drives cut sizes for {selectedType.label})</summary>
                                  <div style={{ marginTop:8, padding:'12px 14px', background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
                                      <div style={{ fontSize:11, color:T.textSub, lineHeight:1.5, flex:1, minWidth:280 }}>
                                        These dimensions were measured from the DXF and feed the Profile and Glass cut
                                        formulas for every <b>{selectedType.label}</b> frame. Edit any value to override
                                        the auto-extracted measurement; clear the field to revert.
                                      </div>
                                      <button onClick={reExtract}
                                        style={{ background:T.bgInput, border:'1px solid '+T.border, borderRadius:3, padding:'5px 10px', fontSize:10, fontWeight:600, cursor:'pointer', color:T.text }}>
                                        Re-extract from DXF
                                      </button>
                                    </div>
                                    {!anyExtracted && (
                                      <div style={{ padding:'10px 12px', background:'#fef3c7', border:'1px solid #f59e0b', borderRadius:4, fontSize:11, color:'#7c2d12', marginBottom:10 }}>
                                        ⚠ No dimensions could be extracted from this DXF. The drawing may be missing
                                        standard layers (HATCH_GLASS, PVC_OUTSIDE, etc.). You can still enter all values manually below.
                                      </div>
                                    )}
                                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                      <thead>
                                        <tr style={{ background:'#f4f6f8', color:T.textMuted, fontSize:9, textTransform:'uppercase' }}>
                                          <th style={{ textAlign:'left',  padding:'5px 8px' }}>Dimension</th>
                                          <th style={{ textAlign:'right', padding:'5px 8px', width:90 }}>From DXF (mm)</th>
                                          <th style={{ textAlign:'right', padding:'5px 8px', width:120 }}>Override (mm)</th>
                                          <th style={{ textAlign:'right', padding:'5px 8px', width:90 }}>Effective</th>
                                          <th style={{ textAlign:'left',  padding:'5px 8px' }}>Notes</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {fields.map(function(f) {
                                          var exVal = ex[f.key];
                                          var ovVal = ov[f.key];
                                          var effVal = effective(f.key);
                                          var isOverridden = ovVal != null;
                                          return (
                                            <tr key={f.key}>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', fontWeight:600 }}>{f.label}</td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', color:T.textMuted }}>
                                                {exVal != null ? exVal : '—'}
                                              </td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>
                                                <input type="number" step="0.5" placeholder={exVal != null ? String(exVal) : ''}
                                                  value={ovVal != null ? ovVal : ''}
                                                  onChange={(e) => setOverride(f.key, e.target.value)}
                                                  style={{ width:90, padding:'3px 6px', fontSize:11, fontFamily:'monospace', textAlign:'right',
                                                            background: isOverridden ? '#fef3c7' : T.bgInput,
                                                            color:T.text, border:'1px solid ' + (isOverridden ? '#f59e0b' : T.border), borderRadius:3 }}/>
                                              </td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', fontWeight:700, color: isOverridden ? '#7c2d12' : T.text }}>
                                                {effVal != null ? effVal : '—'}
                                              </td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', fontSize:10, color:T.textSub, lineHeight:1.4 }}>{f.hint}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                    {Object.keys(ov).length > 0 && (
                                      <div style={{ marginTop:8, fontSize:10, color:'#7c2d12', display:'flex', alignItems:'center', gap:8 }}>
                                        <span>{Object.keys(ov).length} value{Object.keys(ov).length === 1 ? '' : 's'} overridden</span>
                                        <button onClick={() => updPta(selectedType.id, { metricsOverride: {} })}
                                          style={{ background:'transparent', border:'1px solid #dc2626', color:'#dc2626', borderRadius:3, padding:'2px 8px', fontSize:9, fontWeight:600, cursor:'pointer' }}>
                                          Reset all to extracted
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </details>
                              );
                            })()}
                          </div>
                        ) : (
                          <div style={{ padding:'28px 20px', background:'white', border:'1px dashed '+T.border, borderRadius:6, textAlign:'center', fontSize:12, color:T.textMuted, lineHeight:1.6 }}>
                            No assembly DXF for <b style={{ color:T.text }}>{selectedType.label}</b> yet. Upload a section drawing showing the
                            complete cross-section (frame, sash, mullion, glazing, gaskets, steel reinforcement)
                            for this product type. Once uploaded, dimensions are extracted automatically and feed
                            the Profile / Glass / Steel cut formulas for every {selectedType.label} frame.
                            <br/><br/>
                            DXF format only (export from AutoCAD as DXF; binary DWG is not supported).
                            <br/><br/>
                            <span style={{ color:T.textSub, fontSize:11 }}>
                              Until a DXF is uploaded, cuts use legacy formulas with no frame-sash gap and a 6mm glass clearance.
                            </span>
                          </div>
                        )}

                        {/* Future-feature placeholders — schema reserved */}
                        <details style={{ marginTop:14 }}>
                          <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer', fontWeight:600 }}>Hardware, drainage &amp; milling DXFs (coming soon)</summary>
                          <div style={{ marginTop:8, padding:'10px 12px', background:'white', border:'1px solid '+T.border, borderRadius:4, fontSize:11, color:T.textSub, lineHeight:1.5 }}>
                            Future slots reserved for per-product-type CAD data:
                            <ul style={{ margin:'6px 0 0 18px', padding:0 }}>
                              <li><b>Hardware DXF</b> — handle / hinge / strike-plate positioning</li>
                              <li><b>Drainage DXF</b> — drain hole positions and dimensions</li>
                              <li><b>Milling DXF</b> — CNC operations (currently in <i>Hardware &amp; milling</i> as a code-defined catalog)</li>
                            </ul>
                            All will live alongside the Assembly DXF on this page when wired up.
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>;
              }


              if (settingsPath === 'catalog-flyscreens') {
                // ─── Fly Screen Frame — Per-Product-Type Cutting Deductions ────
                // Lives at the Catalogs → Fly screens page so all fly-screen
                // settings (cutting deductions + future SKU catalog) are in
                // one location for the user.
                //
                // Drives the additional-profiles cutlist. For each window
                // type that's flyScreenConfig.enabled, four frame cuts are
                // emitted per OPENING sash: 2 horizontal at (sashW − deductW)
                // and 2 vertical at (sashH − deductH). The deduction
                // accounts for the gasket clearance plus the corner-joiner
                // overlap on the screen frame extrusion.
                //
                // Sliding windows have multiple sashes, but ONLY the
                // opening sash gets a fly screen — the cutlist generator
                // recognises this and emits a single screen per slider.
                // Fixed windows have no opening sash, so default to off.
                //
                // profileSku selects which fly-screen profile family the
                // cuts belong to. Different SKUs may have different bar
                // lengths (typical aluminium extrusions are 5800mm). The
                // cuts will pack into bars of that length in the cutting
                // sheet, separate from the PVC frame profile bars.
                var fsConfig = appSettings.flyScreenConfig || {};
                // Show only window product types — fly screens don't apply
                // to doors. Use PRODUCTS for canonical labels.
                var windowTypes = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []).filter(function(p) {
                  return p.cat === 'window';
                });
                function updFs(typeId, patch) {
                  setAppSettings(function(p) {
                    var existing = (p.flyScreenConfig && p.flyScreenConfig[typeId]) || {};
                    var next = Object.assign({}, p.flyScreenConfig || {});
                    next[typeId] = Object.assign({}, existing, patch);
                    return Object.assign({}, p, { flyScreenConfig: next });
                  });
                }
                function resetType(typeId) {
                  if (!confirm('Reset fly-screen settings for this product type to defaults?')) return;
                  // Pull defaults from getDefaultSettings if available, else
                  // hardcoded.
                  var defaults = {
                    awning_window:    { enabled: true,  deductWidthMm: 8, deductHeightMm: 8, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
                    casement_window:  { enabled: true,  deductWidthMm: 8, deductHeightMm: 8, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
                    tilt_turn_window: { enabled: true,  deductWidthMm: 6, deductHeightMm: 6, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
                    fixed_window:     { enabled: false, deductWidthMm: 0, deductHeightMm: 0, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
                    sliding_window:   { enabled: true,  deductWidthMm: 5, deductHeightMm: 5, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 },
                  };
                  var d = defaults[typeId] || { enabled: false, deductWidthMm: 0, deductHeightMm: 0, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 };
                  setAppSettings(function(p) {
                    var next = Object.assign({}, p.flyScreenConfig || {});
                    next[typeId] = Object.assign({}, d);
                    return Object.assign({}, p, { flyScreenConfig: next });
                  });
                }

                return <div style={{ padding:24, maxWidth:880, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Fly Screen Frame Cutting Deductions</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:18, lineHeight:1.5 }}>
                    Per-product-type cutting list config for fly screen aluminium frames. Each opening sash emits four cuts: two horizontal (sash width − width deduction) and two vertical (sash height − height deduction). Adjust the deductions to match your screen-frame supplier's gasket clearance and corner-joiner overlap.
                    <br/><br/>
                    <b>Sliding windows:</b> only the opening sash gets a fly screen. The fixed sash is excluded automatically.
                    <br/>
                    <b>Fixed windows:</b> no opening sash, so off by default. Enable if you want to allow a fly screen to be added manually.
                  </div>

                  {/* ───── Profile cross-section image upload ─────
                      Single PNG/JPEG slot — shared across all window
                      types and SKUs. Stored as a base64 data URL on
                      appSettings.flyScreenProfileImage and threaded
                      through computeTrimCuts onto every fly-screen cut
                      so the Production → Additional Profiles tab shows
                      a thumbnail next to the row. */}
                  {(function(){
                    var img = appSettings.flyScreenProfileImage || null;
                    function setImg(dataUrl) {
                      setAppSettings(function(p) {
                        if (dataUrl) {
                          return Object.assign({}, p, { flyScreenProfileImage: dataUrl });
                        }
                        var next = Object.assign({}, p);
                        delete next.flyScreenProfileImage;
                        return next;
                      });
                    }
                    function readImg(file) {
                      if (!file) return;
                      if (!/png|jpe?g/i.test(file.type)) {
                        alert('Please use PNG or JPEG. Got: ' + (file.type || 'unknown'));
                        return;
                      }
                      if (file.size > 1.5 * 1024 * 1024) {
                        if (!confirm('This file is ' + (file.size / 1024 / 1024).toFixed(1) + ' MB. Profile cross-sections are usually < 200 KB. Continue?')) return;
                      }
                      var reader = new FileReader();
                      reader.onload = function(ev) { setImg(ev.target.result); };
                      reader.onerror = function() { alert('Failed to read file.'); };
                      reader.readAsDataURL(file);
                    }
                    var inputId = 'flyscreen-profile-image-upload';
                    return <div style={{ marginBottom:18, padding:14, background:T.bgCard, border:'1px solid '+T.borderLight, borderRadius:6 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:4 }}>Profile Cross-Section Image</div>
                      <div style={{ fontSize:10, color:T.textMuted, marginBottom:12, lineHeight:1.4 }}>
                        Optional PNG or JPEG of the fly-screen profile cross-section. Appears as a thumbnail next to the cutting-list row in Production → Additional Profiles, so the cutter can confirm the right extrusion is loaded. One image, shared across every window type.
                      </div>
                      <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                        <div style={{ width:88, height:88, flexShrink:0, background:'#f4f4f4', border:'1px solid '+T.border, borderRadius:4, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          {img ? (
                            <img src={img} alt="Fly screen profile" style={{ width:'100%', height:'100%', objectFit:'contain' }}/>
                          ) : (
                            <span style={{ fontSize:24, color:'#9aa' }}>▢</span>
                          )}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, color:T.textMuted, marginBottom:6, lineHeight:1.4 }}>
                            {img ? 'Image uploaded. Replace to swap, Remove to clear.' : 'No image yet. PNG or JPEG, typically < 200 KB.'}
                          </div>
                          <input type="file" accept="image/png,image/jpeg" id={inputId} style={{ display:'none' }}
                                 onChange={function(e){
                                   var f = e.target.files && e.target.files[0];
                                   if (f) readImg(f);
                                   e.target.value = '';
                                 }}/>
                          <div style={{ display:'flex', gap:6 }}>
                            <label htmlFor={inputId}
                                   style={{ background: img ? 'transparent' : '#1f2937', color: img ? T.text : 'white', border: img ? '1px solid '+T.border : 'none', borderRadius:3, padding:'5px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                              {img ? 'Replace' : '⬆ Upload PNG'}
                            </label>
                            {img && (
                              <button onClick={function(){ if (confirm('Remove the fly-screen profile image?')) setImg(null); }}
                                      style={{ background:'transparent', color:'#dc2626', border:'1px solid '+T.border, borderRadius:3, padding:'5px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>;
                  })()}

                  {windowTypes.map(function(pt) {
                    var cfg = fsConfig[pt.id] || { enabled: false, deductWidthMm: 0, deductHeightMm: 0, profileSku: 'flyscreen_alum_15x7', barLengthMm: 5800 };
                    var isSliding = pt.id === 'sliding_window';
                    var isFixed = pt.id === 'fixed_window';
                    return <div key={pt.id} style={{
                      marginBottom: 18,
                      padding: 16,
                      background: T.bgCard,
                      border: '1px solid ' + (cfg.enabled ? T.accent : T.border),
                      borderLeft: cfg.enabled ? '3px solid ' + T.accent : '1px solid ' + T.border,
                      borderRadius: 6,
                      opacity: cfg.enabled ? 1 : 0.78,
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: cfg.enabled ? 12 : 0 }}>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700, color:T.text }}>{pt.label}</div>
                          <div style={{ fontSize:9, color:T.textMuted, marginTop:2 }}>
                            {isSliding ? 'Fly screen on opening sash only — fixed sash excluded' :
                             isFixed ? 'No opening sash — fly screens not typical' :
                             'One fly screen per sash'}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <label style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
                            <input type="checkbox" checked={!!cfg.enabled}
                                   onChange={function(e){ updFs(pt.id, { enabled: e.target.checked }); }}/>
                            <span style={{ fontSize:12, color:T.text, fontWeight:600 }}>Enabled</span>
                          </label>
                          <button onClick={function(){ resetType(pt.id); }}
                                  style={{ background:'transparent', color:T.textMuted, border:'1px solid '+T.border, borderRadius:3, padding:'2px 8px', fontSize:9, fontWeight:600, cursor:'pointer' }}>
                            Reset
                          </button>
                        </div>
                      </div>

                      {cfg.enabled && (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:8 }}>
                          {/* Width deduction */}
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Width deduction (mm)</div>
                            <input type="number" min="0" max="50" step="0.5"
                                   value={cfg.deductWidthMm}
                                   onChange={function(e){
                                     var v = e.target.value === '' ? 0 : Number(e.target.value);
                                     updFs(pt.id, { deductWidthMm: isFinite(v) ? v : 0 });
                                   }}
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                            <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>
                              Subtracted from the sash WIDTH for horizontal screen frame cuts. Cut length = sashW − {cfg.deductWidthMm}mm.
                            </div>
                          </div>

                          {/* Height deduction */}
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Height deduction (mm)</div>
                            <input type="number" min="0" max="50" step="0.5"
                                   value={cfg.deductHeightMm}
                                   onChange={function(e){
                                     var v = e.target.value === '' ? 0 : Number(e.target.value);
                                     updFs(pt.id, { deductHeightMm: isFinite(v) ? v : 0 });
                                   }}
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                            <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>
                              Subtracted from the sash HEIGHT for vertical screen frame cuts. Cut length = sashH − {cfg.deductHeightMm}mm.
                            </div>
                          </div>

                          {/* Profile SKU */}
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Profile SKU</div>
                            <input type="text" value={cfg.profileSku}
                                   onChange={function(e){ updFs(pt.id, { profileSku: e.target.value }); }}
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                            <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>
                              Cutlist profile key. Cuts share a bar plan with other entries using the same SKU.
                            </div>
                          </div>

                          {/* Bar length */}
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Bar length (mm)</div>
                            <input type="number" min="2000" max="7500" step="10"
                                   value={cfg.barLengthMm}
                                   onChange={function(e){
                                     var v = e.target.value === '' ? 5800 : Number(e.target.value);
                                     updFs(pt.id, { barLengthMm: isFinite(v) ? v : 5800 });
                                   }}
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                            <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>
                              Stock bar length for this profile. Used by the cutting-list optimiser to pack cuts into bars.
                            </div>
                          </div>

                          {/* Worked example */}
                          <div style={{ gridColumn:'1 / span 2', marginTop:6, padding:'8px 12px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:4, fontSize:10, color:'#075985', lineHeight:1.5 }}>
                            <b>Example:</b> a 900 × 1200mm sash with these settings produces:
                            <br/>
                            <span style={{ fontFamily:'monospace' }}>
                              2 × {(900 - cfg.deductWidthMm).toFixed(0)}mm horizontal + 2 × {(1200 - cfg.deductHeightMm).toFixed(0)}mm vertical
                            </span>
                            {isSliding && (
                              <div style={{ marginTop:4 }}>
                                <b>Note:</b> sliding window with 2 panels of 900mm each — only the opening sash gets a screen, so just 4 cuts total.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>;
                  })}

                  {/* ───── Pricing & Production ─────
                      Surfaces the existing pricingConfig.ancillaries and
                      pricingConfig.productionTimes fields that the BOM and
                      labour calculators already consume — so the user can
                      tune fly-screen cost in one place without hunting
                      through Pricing → Ancillaries and Pricing → Production
                      Times separately.

                      All edits write back to pricingConfig (NOT a parallel
                      copy), which means changes here are identical to
                      changes made on the Pricing pages. The xlsx exports
                      and quote totals pick them up the same way. */}
                  {(function(){
                    var pc = appSettings.pricingConfig || {};
                    var anc = pc.ancillaries || {};
                    var pt = (pc.productionTimes || (typeof PRICING_DEFAULTS !== 'undefined' ? PRICING_DEFAULTS.productionTimes : {})) || {};
                    var s7 = pt.S7_flyScreen || ((typeof PRICING_DEFAULTS !== 'undefined' && PRICING_DEFAULTS.productionTimes && PRICING_DEFAULTS.productionTimes.S7_flyScreen) || { ops: {}, rate: 36 });
                    var perMetre = anc.flyScreenFramePerMetre != null ? anc.flyScreenFramePerMetre : 5.50;
                    var perUnit  = anc.flyScreenPerUnit != null ? anc.flyScreenPerUnit : 45;
                    function updAnc(key, val) {
                      setAppSettings(function(p){
                        var lpc = p.pricingConfig || {};
                        var lanc = lpc.ancillaries || {};
                        return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { ancillaries: Object.assign({}, lanc, { [key]: val }) }) });
                      });
                    }

                    // Worked-example calc on a 900×1200 awning sash.
                    // Sash = 770 × 1070 (frame deduction 65mm × 2 = 130mm).
                    // Awning default deduction 8/8 → screen = 762 × 1062.
                    // Perimeter = 2*(762+1062) = 3648 mm = 3.648 m.
                    var exPerim = 2 * ((900 - 130 - 8) + (1200 - 130 - 8));
                    var exMaterial = (exPerim / 1000) * perMetre + perUnit;
                    var ops = s7.ops || {};
                    var s7Mins = (4 * ((ops.cutAlFrame && ops.cutAlFrame.t) || 0)
                                + ((ops.cutMesh && ops.cutMesh.t) || 0)
                                + ((ops.rollSpline && ops.rollSpline.t) || 0)
                                + 4 * ((ops.pressCorner && ops.pressCorner.t) || 0)
                                + ((ops.trimExcess && ops.trimExcess.t) || 0)
                                + ((ops.fitPullTab && ops.fitPullTab.t) || 0));
                    var rate = (typeof s7.rate === 'number') ? s7.rate : 36;
                    var s7Cost = s7Mins * (rate / 60);
                    var exTotal = exMaterial + s7Cost;

                    var opsList = [
                      ['cutAlFrame',  'Cut aluminium frame', 'per cut'],
                      ['cutMesh',     'Cut mesh',            'per screen'],
                      ['rollSpline',  'Roll spline',         'per screen'],
                      ['pressCorner', 'Press-fit corner',    'per corner'],
                      ['trimExcess',  'Trim excess mesh',    'per screen'],
                      ['fitPullTab',  'Fit pull tab',        'per screen'],
                    ];

                    return <div style={{ marginTop:18, padding:14, background:T.bgCard, border:'1px solid '+T.borderLight, borderRadius:6 }}>
                      <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:4 }}>Pricing</div>
                      <div style={{ fontSize:10, color:T.textMuted, marginBottom:14, lineHeight:1.4 }}>
                        Material cost inputs for fly screens. Edits write directly to <code>pricingConfig.ancillaries</code> — the same fields used by the BOM calculator and quote totals. Assembly time per task is configured on the Pricing → Production Times page (Stn 7 - Fly Screens).
                      </div>

                      {/* Material costs */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                        <div>
                          <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Aluminium frame ($ / metre)</div>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ fontSize:11, color:T.textMuted }}>$</span>
                            <input type="number" step="0.10" min="0" value={perMetre}
                                   onChange={function(e){ updAnc('flyScreenFramePerMetre', +e.target.value); }}
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, fontFamily:'monospace', textAlign:'right', background:T.bgInput, color:T.text }}/>
                          </div>
                          <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>Cost per linear metre of the aluminium extrusion. BOM = perimeter × this rate.</div>
                        </div>
                        <div>
                          <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Misc. per screen ($ / unit)</div>
                          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                            <span style={{ fontSize:11, color:T.textMuted }}>$</span>
                            <input type="number" step="0.10" min="0" value={perUnit}
                                   onChange={function(e){ updAnc('flyScreenPerUnit', +e.target.value); }}
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, fontFamily:'monospace', textAlign:'right', background:T.bgInput, color:T.text }}/>
                          </div>
                          <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>Mesh + spline + corner connectors + pull tab. Per fly screen, regardless of size.</div>
                        </div>
                      </div>

                      {/* Read-only summary of S7 task times — full editing on
                          Pricing → Production Times. Shown here as reference
                          so the user can see the basis for the labour cost in
                          the worked example below without editing twice. */}
                      <div style={{ marginBottom:8, padding:10, background:'#f9fafb', border:'1px dashed '+T.border, borderRadius:4 }}>
                        <div style={{ fontSize:10, color:T.textMuted, marginBottom:6, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span><b>Stn 7 task times</b> — total <span style={{ fontFamily:'monospace', color:T.text }}>{s7Mins.toFixed(1)} min</span> per screen @ <span style={{ fontFamily:'monospace', color:T.text }}>${rate.toFixed(2)}/hr</span></span>
                          <span style={{ fontSize:9, fontStyle:'italic' }}>Edit on Pricing → Production Times</span>
                        </div>
                        <div style={{ fontSize:10, color:T.textMuted, fontFamily:'monospace', lineHeight:1.6 }}>
                          {opsList.map(function(o, i) {
                            var key = o[0], label = o[1], unit = o[2];
                            var t = (ops[key] && ops[key].t) != null ? ops[key].t : 0;
                            return <span key={key}>
                              {i > 0 ? ' · ' : ''}
                              {label}: <span style={{ color:T.text }}>{t.toFixed(1)} min</span>
                              <span style={{ color:T.textFaint }}> ({unit})</span>
                            </span>;
                          })}
                        </div>
                      </div>

                      {/* Worked example */}
                      <div style={{ marginTop:12, padding:'8px 12px', background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:4, fontSize:10, color:'#075985', lineHeight:1.6 }}>
                        <b>Worked example — 900 × 1200 awning sash:</b><br/>
                        Screen size 762 × 1062 mm, perimeter <span style={{ fontFamily:'monospace' }}>{(exPerim).toFixed(0)} mm</span> = <span style={{ fontFamily:'monospace' }}>{(exPerim/1000).toFixed(3)} m</span><br/>
                        Frame: <span style={{ fontFamily:'monospace' }}>{(exPerim/1000).toFixed(3)} m × ${perMetre.toFixed(2)}/m = ${((exPerim/1000)*perMetre).toFixed(2)}</span><br/>
                        Misc: <span style={{ fontFamily:'monospace' }}>${perUnit.toFixed(2)}</span><br/>
                        Labour: <span style={{ fontFamily:'monospace' }}>{s7Mins.toFixed(1)} min × ${(rate/60).toFixed(3)}/min = ${s7Cost.toFixed(2)}</span><br/>
                        <b>Total per screen: <span style={{ fontFamily:'monospace' }}>${exTotal.toFixed(2)}</span></b>
                        <span style={{ fontSize:9, color:'#0369a1', marginLeft:6 }}>(before waste &amp; markup)</span>
                      </div>
                    </div>;
                  })()}

                  <div style={{ marginTop:14, padding:'10px 14px', background:'#f5f5f5', border:'1px solid '+T.border, borderRadius:4, fontSize:10, color:T.textMuted, lineHeight:1.5 }}>
                    <b>Where this shows up:</b> Production → Additional Profiles tab. The fly-screen frame cuts appear there alongside architraves, trims, and reveals — separate from the PVC profile cutlist (different bar length, different SKU).
                    <br/><br/>
                    <b>Tip:</b> turn off a type if your factory orders pre-cut fly screens from a supplier. The screen frame still renders in the 3D viewport (controlled by the editor toolbar's fly-screen toggle), but won't appear in the cutlist.
                  </div>
                </div>;
              }

              if (settingsPath === 'prod-mullions') {
                // ─── Mullions / Transoms ──────────────────────────────────
                // Three GLOBAL DXF uploads, distinct from per-product-type
                // assemblies because mullion profiles are typically system-
                // wide assets.
                //
                //   1. Inwards-opening mullion section  (T&T, French door)
                //   2. Outwards-opening mullion section (awning, casement)
                //   3. Mullion-transom intersection T-junction
                //
                // Each upload runs its own measurement function:
                //   sections    → measureMullionSection (sightline, depth, sashMullionGap)
                //   intersection → measureIntersection  (couplingAllowanceMm)
                //
                // Frames consume these via resolveMullionMetrics() at runtime,
                // which auto-picks the right section by frame.productType's
                // opening direction.
                var ma = appSettings.mullionAssemblies || {};

                // Tabs to switch between the 3 slots
                var slots = [
                  { id:'inwards',      label:'Mullion — Inwards (T&T, French door)',     hint:'Sash swings INTO the room. Used by Tilt & Turn, French Door, Hinged Door.' },
                  { id:'outwards',     label:'Mullion — Outwards (Awning, Casement)',    hint:'Sash swings OUTSIDE. Used by Awning, Casement.' },
                  { id:'intersection', label:'Mullion–Transom intersection',             hint:'T-junction where a horizontal transom meets a vertical mullion. Drives transom cut length via the coupling-block allowance.' },
                ];
                var slotIdx = settingsListIdx >= 0 && settingsListIdx < slots.length ? settingsListIdx : 0;
                var slot = slots[slotIdx];
                var entry = ma[slot.id] || {};

                function updMull(slotId, patch) {
                  setAppSettings(function(p) {
                    var existing = (p.mullionAssemblies && p.mullionAssemblies[slotId]) || {};
                    var next = Object.assign({}, p.mullionAssemblies || {});
                    next[slotId] = Object.assign({}, existing, patch);
                    return Object.assign({}, p, { mullionAssemblies: next });
                  });
                }
                function clearMull(slotId) {
                  if (!confirm('Clear the DXF and metrics for this mullion slot? Cuts using this slot will revert to legacy formulas.')) return;
                  setAppSettings(function(p) {
                    var next = Object.assign({}, p.mullionAssemblies || {});
                    next[slotId] = null;
                    return Object.assign({}, p, { mullionAssemblies: next });
                  });
                }
                function uploadMullionDxf(slotId, file) {
                  var reader = new FileReader();
                  reader.onload = function(e) {
                    var text = e.target.result;
                    try {
                      var asm = parseDxfAssembly(text);
                      if (!asm.primitives || !asm.primitives.length) {
                        alert('No drawable entities found in this DXF.');
                        return;
                      }
                      var metrics;
                      if (slotId === 'intersection') {
                        metrics = (typeof measureIntersection === 'function') ? measureIntersection(asm) : null;
                      } else {
                        metrics = (typeof measureMullionSection === 'function') ? measureMullionSection(asm) : null;
                      }
                      updMull(slotId, {
                        assembly: { parsed: asm, fileName: file.name, uploadedAt: Date.now(), rotateDeg: 0, showDimensions: false },
                        metricsExtracted: metrics,
                      });
                    } catch (err) {
                      alert('Failed to parse DXF: ' + err.message);
                    }
                  };
                  reader.readAsText(file);
                }

                // Field defs depend on which slot
                function fieldsFor(slotId) {
                  if (slotId === 'intersection') {
                    return [
                      { key:'couplingAllowanceMm', label:'Coupling allowance', hint:'Material consumed at each end of a transom where it meets a mullion. Subtracted from transom cut length × 2 (one allowance per end).' },
                    ];
                  }
                  return [
                    { key:'mullionSightlineMm', label:'Mullion sightline', hint:'Visible face width of the mullion profile.' },
                    { key:'mullionDepthMm',     label:'Mullion depth',     hint:'Depth of the mullion profile.' },
                    { key:'sashMullionGapMm',   label:'Sash–mullion gap',  hint:'Gasket-line air gap between sash edge and mullion face. Same physical seal as frame–sash gap, but measured at the mullion location.' },
                  ];
                }

                return <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
                  <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
                    <div style={{ width:280, borderRight:'1px solid '+T.border, background:T.bgPanel, overflowY:'auto' }}>
                      {slots.map(function(s, i) {
                        var hasAsm = !!(ma[s.id] && ma[s.id].assembly && ma[s.id].assembly.parsed);
                        return (
                          <div key={s.id} onClick={() => setSettingsListIdx(i)}
                            style={{ padding:'10px 12px', cursor:'pointer', fontSize:11, background: i===slotIdx ? (dk?'#2a2a3a':'#f0f0f8') : 'transparent', borderBottom:'1px solid '+T.borderLight, color:T.text }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                              <div style={{ fontWeight: i===slotIdx?700:500, flex:1, lineHeight:1.3 }}>{s.label}</div>
                              {hasAsm && <span style={{ fontSize:8, color:'#166534', background:'#dcfce7', padding:'1px 4px', borderRadius:2, fontWeight:700 }}>DXF</span>}
                            </div>
                            <div style={{ fontSize:9, color:T.textMuted, marginTop:3, lineHeight:1.4 }}>{s.hint}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ flex:1, padding:24, overflowY:'auto' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                        <div>
                          <div style={{ fontSize:18, fontWeight:700, color:T.text }}>{slot.label}</div>
                          <div style={{ fontSize:11, color:T.textMuted, marginTop:2 }}>{slot.hint}</div>
                        </div>
                        {entry.assembly && (
                          <button onClick={() => clearMull(slot.id)}
                            style={{ background:'transparent', color:'#dc2626', border:'1px solid #dc2626', borderRadius:4, padding:'6px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Notes */}
                      <div style={{ marginBottom:16, maxWidth:700 }}>
                        <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Notes</div>
                        <textarea value={entry.notes || ''}
                          onChange={(e) => updMull(slot.id, { notes: e.target.value })}
                          rows={2}
                          style={{ width:'100%', padding:'6px 10px', fontSize:12, background:T.bgInput, color:T.text, border:'1px solid '+T.border, borderRadius:3, resize:'vertical', fontFamily:'inherit' }}/>
                      </div>

                      {/* DXF upload */}
                      <div style={{ marginBottom:16 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Section DXF</div>
                          <div>
                            <input type="file" accept=".dxf" id={'mullion-dxf-' + slot.id} style={{ display:'none' }}
                              onChange={(e) => { var f = e.target.files && e.target.files[0]; if (f) uploadMullionDxf(slot.id, f); e.target.value = ''; }}/>
                            <label htmlFor={'mullion-dxf-' + slot.id} style={{ background:'#1f2937', color:'white', borderRadius:4, padding:'6px 12px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                              ⬆ {entry.assembly ? 'Replace DXF' : 'Upload DXF'}
                            </label>
                          </div>
                        </div>
                        {entry.assembly && entry.assembly.parsed ? (
                          <div>
                            <div style={{ fontSize:10, color:T.textMuted, marginBottom:8 }}>
                              <b>{entry.assembly.fileName}</b> · {entry.assembly.parsed.primitives.length} entities · {Math.round(entry.assembly.parsed.bbox.w)} × {Math.round(entry.assembly.parsed.bbox.h)} mm
                            </div>
                            <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
                              <label style={{ fontSize:11, color:T.text, display:'flex', alignItems:'center', gap:6 }}>
                                Rotate
                                <select value={entry.assembly.rotateDeg || 0}
                                  onChange={(e) => updMull(slot.id, { assembly: Object.assign({}, entry.assembly, { rotateDeg: +e.target.value }) })}
                                  style={{ padding:'4px 8px', fontSize:11, background:T.bgInput, color:T.text, border:'1px solid '+T.border, borderRadius:3 }}>
                                  <option value="0">0°</option><option value="90">90°</option><option value="-90">-90°</option><option value="180">180°</option>
                                </select>
                              </label>
                            </div>
                            <div style={{ width:'100%', height:440, background:dk ? '#0a0a10' : '#fafafa', borderRadius:6, padding:12, border:'1px solid '+T.borderLight }}>
                              <div style={{ width:'100%', height:'100%' }}
                                dangerouslySetInnerHTML={{ __html: renderAssemblySvg(entry.assembly.parsed, { padPx:4, rotateDeg: entry.assembly.rotateDeg || 0 }) }}/>
                            </div>

                            {/* Extracted dimensions */}
                            {(function(){
                              var ex = entry.metricsExtracted || {};
                              var ov = entry.metricsOverride || {};
                              function effective(k) { return (ov[k] != null) ? ov[k] : ex[k]; }
                              function setOverride(k, v) {
                                var newOv = Object.assign({}, ov);
                                if (v === '' || v == null || isNaN(+v)) delete newOv[k];
                                else newOv[k] = +v;
                                updMull(slot.id, { metricsOverride: newOv });
                              }
                              function reExtract() {
                                if (!entry.assembly || !entry.assembly.parsed) return;
                                var newMetrics;
                                if (slot.id === 'intersection') newMetrics = measureIntersection(entry.assembly.parsed);
                                else newMetrics = measureMullionSection(entry.assembly.parsed);
                                updMull(slot.id, { metricsExtracted: newMetrics });
                              }
                              var fields = fieldsFor(slot.id);
                              return (
                                <details style={{ marginTop:10 }} open>
                                  <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer', fontWeight:600 }}>📐 Extracted dimensions</summary>
                                  <div style={{ marginTop:8, padding:'12px 14px', background:'white', border:'1px solid '+T.border, borderRadius:4 }}>
                                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, flexWrap:'wrap', gap:8 }}>
                                      <div style={{ fontSize:11, color:T.textSub, lineHeight:1.5, flex:1, minWidth:280 }}>
                                        Measurements driving cut sizes for frames using this mullion DXF.
                                        Edit any value to override.
                                      </div>
                                      <button onClick={reExtract}
                                        style={{ background:T.bgInput, border:'1px solid '+T.border, borderRadius:3, padding:'5px 10px', fontSize:10, fontWeight:600, cursor:'pointer', color:T.text }}>
                                        Re-extract from DXF
                                      </button>
                                    </div>
                                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                                      <thead>
                                        <tr style={{ background:'#f4f6f8', color:T.textMuted, fontSize:9, textTransform:'uppercase' }}>
                                          <th style={{ textAlign:'left',  padding:'5px 8px' }}>Dimension</th>
                                          <th style={{ textAlign:'right', padding:'5px 8px', width:90 }}>From DXF (mm)</th>
                                          <th style={{ textAlign:'right', padding:'5px 8px', width:120 }}>Override (mm)</th>
                                          <th style={{ textAlign:'right', padding:'5px 8px', width:90 }}>Effective</th>
                                          <th style={{ textAlign:'left',  padding:'5px 8px' }}>Notes</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {fields.map(function(f) {
                                          var exVal = ex[f.key];
                                          var ovVal = ov[f.key];
                                          var effVal = effective(f.key);
                                          var isOverridden = ovVal != null;
                                          return (
                                            <tr key={f.key}>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', fontWeight:600 }}>{f.label}</td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', color:T.textMuted }}>{exVal != null ? exVal : '—'}</td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right' }}>
                                                <input type="number" step="0.5" placeholder={exVal != null ? String(exVal) : ''}
                                                  value={ovVal != null ? ovVal : ''}
                                                  onChange={(e) => setOverride(f.key, e.target.value)}
                                                  style={{ width:90, padding:'3px 6px', fontSize:11, fontFamily:'monospace', textAlign:'right',
                                                            background: isOverridden ? '#fef3c7' : T.bgInput,
                                                            color:T.text, border:'1px solid ' + (isOverridden ? '#f59e0b' : T.border), borderRadius:3 }}/>
                                              </td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', textAlign:'right', fontFamily:'monospace', fontWeight:700, color: isOverridden ? '#7c2d12' : T.text }}>{effVal != null ? effVal : '—'}</td>
                                              <td style={{ padding:'4px 8px', borderBottom:'1px solid #f0f0f0', fontSize:10, color:T.textSub, lineHeight:1.4 }}>{f.hint}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </details>
                              );
                            })()}
                          </div>
                        ) : (
                          <div style={{ padding:'28px 20px', background:'white', border:'1px dashed '+T.border, borderRadius:6, textAlign:'center', fontSize:12, color:T.textMuted, lineHeight:1.6 }}>
                            No DXF uploaded for this slot.
                            {slot.id === 'intersection' ? (
                              <div style={{ marginTop:8, fontSize:11 }}>Upload a section DXF showing the T-junction where a transom meets a vertical mullion.</div>
                            ) : (
                              <div style={{ marginTop:8, fontSize:11 }}>Upload a section DXF showing a vertical slice through the mullion at its midpoint, with sash on each side.</div>
                            )}
                            <div style={{ marginTop:14, fontSize:11, color:T.textSub }}>Until uploaded, frames using this slot fall back to legacy formulas (no end-cap or coupling allowance, sash–mullion gap = frame–sash gap from product-type DXF).</div>
                          </div>
                        )}
                      </div>

                      {/* Frame opening direction reference */}
                      {slot.id !== 'intersection' && (
                        <details style={{ marginTop:14 }}>
                          <summary style={{ fontSize:11, color:T.textMuted, cursor:'pointer', fontWeight:600 }}>Which product types use this slot?</summary>
                          <div style={{ marginTop:8, padding:'10px 12px', background:'white', border:'1px solid '+T.border, borderRadius:4, fontSize:11, color:T.text, lineHeight:1.6 }}>
                            {slot.id === 'inwards' ? (
                              <span>Tilt &amp; Turn · French Door · Hinged Door</span>
                            ) : (
                              <span>Awning · Casement · Sliding · Fixed (mullions only) · all sliding doors</span>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                </div>;
              }


              if (settingsPath === 'prod-hardware') {
                // ─── Hardware & Milling Catalogue ──────────────────────────
                // Read-only view of MILLING_SPECS (defined in 23a-milling-specs.js).
                // Shows each hardware system's CNC drilling and slot operations
                // exactly as they flow through to the cutlist Milling sheet.
                // Editable hardware catalog (add new systems, edit dimensions,
                // per-frame hardware selection) is a planned follow-up.
                var specs = (typeof MILLING_SPECS !== 'undefined') ? MILLING_SPECS : {};
                var specEntries = Object.keys(specs).map(function(k){ return [k, specs[k]]; });
                return <div style={{ padding:24, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Hardware &amp; Milling Catalogue</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:20, maxWidth:780, lineHeight:1.5 }}>
                    CNC drill and slot operations for each hardware system fitted at the factory.
                    Positions are measured from a per-frame handle datum (see footnote).
                    Dimensions and tooling for every operation flow through to the cutlist
                    export Milling sheet alongside the per-frame member lengths.
                    <br/><br/>
                    <span style={{ fontStyle:'italic' }}>
                      Read-only for now. Editable hardware catalog (add new systems, edit dimensions,
                      link to per-frame hardware selection) is planned as a follow-up.
                    </span>
                  </div>

                  {specEntries.length === 0 && (
                    <div style={{ padding:24, background:T.bgCard, border:'1px dashed '+T.border, borderRadius:6, color:T.textMuted, fontSize:12 }}>
                      No milling specs loaded. The 23a-milling-specs.js module may be missing from the bundle.
                    </div>
                  )}

                  {specEntries.map(function(entry){
                    var key = entry[0]; var sp = entry[1];
                    var ops = sp.operations || [];
                    var bits = (sp.drillBitsRequired || []).map(function(b){ return 'Ø'+b+' mm'; }).join(', ');
                    return <div key={key} style={{ marginBottom:18, background:T.bgCard, border:'1px solid '+T.border, borderRadius:6, overflow:'hidden' }}>
                      {/* Title bar */}
                      <div style={{ padding:'10px 14px', background:'#fafafa', borderBottom:'1px solid '+T.borderLight, display:'flex', justifyContent:'space-between', alignItems:'center', gap:10 }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{sp.label}</div>
                          <div style={{ fontSize:10, color:T.textMuted, marginTop:2 }}>{sp.system} · spec id <code style={{ background:'#eee', padding:'1px 4px', borderRadius:2 }}>{key}</code></div>
                        </div>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                          {(sp.productTypes || []).map(function(pt){
                            return <span key={pt} style={{ fontSize:9, color:'#1a5d3a', background:'#ecfdf5', padding:'2px 7px', borderRadius:3, fontWeight:600 }}>
                              {pt.replace(/_/g,' ')}
                            </span>;
                          })}
                        </div>
                      </div>

                      {/* Meta grid */}
                      <div style={{ padding:'12px 14px', display:'grid', gridTemplateColumns:'auto 1fr', columnGap:14, rowGap:5, fontSize:11 }}>
                        <span style={{ color:T.textMuted }}>Applies to</span>
                        <span style={{ color:T.text }}>{sp.appliesTo || '—'}</span>
                        <span style={{ color:T.textMuted }}>Member</span>
                        <span style={{ color:T.text }}>{(sp.member || '—').replace(/_/g,' ')}</span>
                        <span style={{ color:T.textMuted }}>Surface</span>
                        <span style={{ color:T.text }}>{(sp.surface || '—').replace(/_/g,' ')}</span>
                        <span style={{ color:T.textMuted }}>Reference edge</span>
                        <span style={{ color:T.text }}>{(sp.referenceEdge || '—').replace(/_/g,' ')}</span>
                        {sp.axisOffsetMm != null && <React.Fragment>
                          <span style={{ color:T.textMuted }}>Axis offset</span>
                          <span style={{ color:T.text, fontFamily:'monospace' }}>{sp.axisOffsetMm} mm</span>
                        </React.Fragment>}
                        <span style={{ color:T.textMuted }}>Tooling</span>
                        <span style={{ color:T.text }}>{bits || '—'}</span>
                        {sp.referenceNote && <React.Fragment>
                          <span style={{ color:T.textMuted }}>Notes</span>
                          <span style={{ color:T.textSub, fontStyle:'italic', lineHeight:1.5 }}>{sp.referenceNote}</span>
                        </React.Fragment>}
                      </div>

                      {/* Operations table */}
                      {ops.length > 0 && <div style={{ borderTop:'1px solid '+T.borderLight, padding:'10px 14px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:T.textMuted, textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                          Operations ({ops.length})
                        </div>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11, fontFamily:'monospace' }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid '+T.borderLight, color:T.textMuted, textAlign:'left' }}>
                              <th style={{ padding:'4px 6px', fontWeight:600 }}>ID</th>
                              <th style={{ padding:'4px 6px', fontWeight:600 }}>Type</th>
                              <th style={{ padding:'4px 6px', fontWeight:600, textAlign:'right' }}>Pos (mm)</th>
                              <th style={{ padding:'4px 6px', fontWeight:600 }}>Size</th>
                              <th style={{ padding:'4px 6px', fontWeight:600 }}>Depth</th>
                              <th style={{ padding:'4px 6px', fontWeight:600, fontFamily:'inherit' }}>Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ops.map(function(op){
                              var isSlot = op.kind === 'slot';
                              var size = isSlot ? (op.w + ' × ' + op.h + ' mm') : ('Ø' + op.dia + ' mm');
                              var typ = isSlot ? 'slot' : 'drill';
                              return <tr key={op.id} style={{ borderBottom:'1px solid '+T.borderLight }}>
                                <td style={{ padding:'4px 6px', color:T.text }}>{op.id}</td>
                                <td style={{ padding:'4px 6px', color: isSlot ? '#7c3aed' : '#0369a1', fontWeight:600 }}>{typ}</td>
                                <td style={{ padding:'4px 6px', textAlign:'right', color:T.text }}>
                                  {op.pos > 0 ? '+' + op.pos : op.pos}
                                </td>
                                <td style={{ padding:'4px 6px', color:T.text }}>{size}</td>
                                <td style={{ padding:'4px 6px', color:T.text }}>{op.depth || '—'}</td>
                                <td style={{ padding:'4px 6px', color:T.textSub, fontFamily:'inherit' }}>{op.desc}</td>
                              </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>}

                      {/* Footer dimensions */}
                      {(sp.overallPitchMm != null || sp.backplateMm || sp.slotMm) && (
                        <div style={{ borderTop:'1px solid '+T.borderLight, padding:'8px 14px', background:'#fafafa', fontSize:10, color:T.textMuted, display:'flex', gap:18, flexWrap:'wrap' }}>
                          {sp.overallPitchMm != null && <span>Pitch: <strong style={{ color:T.text }}>{sp.overallPitchMm} mm</strong></span>}
                          {sp.backplateMm && <span>Backplate: <strong style={{ color:T.text }}>{sp.backplateMm.width} × {sp.backplateMm.height} mm</strong></span>}
                          {sp.slotMm && <span>Slot: <strong style={{ color:T.text }}>{sp.slotMm.width} × {sp.slotMm.height} mm</strong></span>}
                        </div>
                      )}
                    </div>;
                  })}

                  {/* Footnote: datum rule */}
                  <div style={{ marginTop:20, padding:'10px 14px', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:4, fontSize:10, color:'#78350f', lineHeight:1.5 }}>
                    <strong>Datum rule:</strong> "pos" values above are measured from the per-frame
                    handle datum. For tilt &amp; turn, the datum sits 1000 mm from the sash bottom on
                    tall sashes (sash height &gt; 1200 mm), or at the sash centre on shorter sashes.
                    A non-zero <em>Handle Height (mm offset)</em> set on a frame in the editor shifts
                    the datum up (+) or down (−) by that amount before any operation is positioned.
                    Handedness (which stile carries the prep) flips automatically based on the
                    frame's tilt-turn direction.
                  </div>
                </div>;
              }


              if (settingsPath === 'price-profiles') {
                // Profile costs are now managed inside the unified Profile Manager
                // (Products → Profiles, "Cost" tab on each profile detail).
                return <div style={{ padding:40, textAlign:'center', color:T.textMuted, fontSize:13 }}>
                  <div style={{ fontSize:14, color:T.text, marginBottom:8 }}>Profile costs moved</div>
                  <div style={{ fontSize:11, marginBottom:16 }}>$/metre and bar length now live alongside geometry under <b>Products \u2192 Profiles</b>.</div>
                  <button onClick={() => setSettingsPath('prod-profiles')} style={{ padding:'8px 16px', background:T.accent, color:'#fff', border:'none', borderRadius:4, fontSize:11, cursor:'pointer', fontWeight:600 }}>Open Profile Manager \u2192</button>
                </div>;
              }

              if (settingsPath === 'price-steel') {
                const pc = appSettings.pricingConfig;
                const entries = Object.entries(pc.steelCosts);
                const upd = (key, field, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lsc = lpc.steelCosts || {};
                    const cur = lsc[key] || {};
                    return {...p, pricingConfig: {...lpc, steelCosts: {...lsc, [key]: {...cur, [field]: val}}}};
                  });
                };
                return <div style={{ padding:24, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Steel Reinforcement Costs</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Galvanised steel per-metre costs. Matched to Aluplast profile articles.</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:T.bgCard, borderBottom:'2px solid '+T.border }}>
                      <th style={{textAlign:'left',padding:'6px 8px',color:T.textSub}}>Steel</th>
                      <th style={{textAlign:'left',padding:'6px 8px',color:T.textSub}}>Code</th>
                      <th style={{textAlign:'right',padding:'6px 8px',color:T.textSub}}>$/metre</th>
                      <th style={{textAlign:'right',padding:'6px 8px',color:T.textSub}}>Bar (m)</th>
                    </tr></thead>
                    <tbody>{entries.map(([k,v]) => (
                      <tr key={k} style={{ borderBottom:'1px solid '+T.borderLight }}>
                        <td style={{padding:'5px 8px',color:T.text}}>{v.name}</td>
                        <td style={{padding:'5px 8px',color:T.textMuted,fontFamily:'monospace',fontSize:11}}>{v.code}</td>
                        <td style={{padding:'3px 4px',textAlign:'right'}}><input type="number" step="0.01" value={v.perMetre} onChange={e => upd(k,'perMetre',+e.target.value)} style={{width:80,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/></td>
                        <td style={{padding:'3px 4px',textAlign:'right'}}><input type="number" step="0.1" value={v.barLen} onChange={e => upd(k,'barLen',+e.target.value)} style={{width:60,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>;
              }

              if (settingsPath === 'price-glass') {
                const pc = appSettings.pricingConfig;
                const entries = Object.entries(pc.glassCosts);
                const upd = (key, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lgc = lpc.glassCosts || {};
                    const cur = lgc[key] || {};
                    return {...p, pricingConfig: {...lpc, glassCosts: {...lgc, [key]: {...cur, perSqm: val}}}};
                  });
                };
                return <div style={{ padding:24, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Glass IGU Costs</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Per square metre costs for insulated glass units. Standard is DGU 4/20Ar/4 Low-E.</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:T.bgCard, borderBottom:'2px solid '+T.border }}>
                      <th style={{textAlign:'left',padding:'6px 8px',color:T.textSub}}>Glass Type</th>
                      <th style={{textAlign:'right',padding:'6px 8px',color:T.textSub}}>$/m2</th>
                    </tr></thead>
                    <tbody>{entries.map(([k,v]) => (
                      <tr key={k} style={{ borderBottom:'1px solid '+T.borderLight }}>
                        <td style={{padding:'5px 8px',color:T.text}}>{v.name}</td>
                        <td style={{padding:'3px 4px',textAlign:'right'}}><input type="number" step="1" value={v.perSqm} onChange={e => upd(k,+e.target.value)} style={{width:80,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>;
              }

              if (settingsPath === 'price-hardware') {
                const pc = appSettings.pricingConfig;
                const entries = Object.entries(pc.hardwareCosts);
                const upd = (key, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lhc = lpc.hardwareCosts || {};
                    return {...p, pricingConfig: {...lpc, hardwareCosts: {...lhc, [key]: val}}};
                  });
                };
                const labels = {awning_window:'Awning Window',casement_window:'Casement Window',tilt_turn_window:'Tilt & Turn Window',fixed_window:'Fixed Window',sliding_window:'Sliding Window',french_door:'French Door',hinged_door:'Hinged Door',bifold_door:'Bifold Door (per panel)',lift_slide_door:'Lift & Slide Door',smart_slide_door:'Smart Slide Door',vario_slide_door:'Vario Slide Door',stacker_door:'Stacker Door'};
                return <div style={{ padding:24, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Hardware Set Costs</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Cost per hardware set by product type. Includes locks, hinges, handles, gears.</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, maxWidth:500 }}>
                    <thead><tr style={{ background:T.bgCard, borderBottom:'2px solid '+T.border }}>
                      <th style={{textAlign:'left',padding:'6px 8px',color:T.textSub}}>Product Type</th>
                      <th style={{textAlign:'right',padding:'6px 8px',color:T.textSub}}>$ per set</th>
                    </tr></thead>
                    <tbody>{entries.map(([k,v]) => (
                      <tr key={k} style={{ borderBottom:'1px solid '+T.borderLight }}>
                        <td style={{padding:'5px 8px',color:T.text}}>{labels[k]||k}</td>
                        <td style={{padding:'3px 4px',textAlign:'right'}}><input type="number" step="1" value={v} onChange={e => upd(k,+e.target.value)} style={{width:80,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>;
              }

              if (settingsPath === 'price-beads') {
                const pc = appSettings.pricingConfig;
                const entries = Object.entries(pc.beadCosts);
                const upd = (key, field, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lbc = lpc.beadCosts || {};
                    const cur = lbc[key] || {};
                    return {...p, pricingConfig: {...lpc, beadCosts: {...lbc, [key]: {...cur, [field]: val}}}};
                  });
                };
                return <div style={{ padding:24, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Glazing Bead Costs</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Per-metre costs for QUBE-LINE snap-fit glazing beads.</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, maxWidth:600 }}>
                    <thead><tr style={{ background:T.bgCard, borderBottom:'2px solid '+T.border }}>
                      <th style={{textAlign:'left',padding:'6px 8px',color:T.textSub}}>Bead</th>
                      <th style={{textAlign:'left',padding:'6px 8px',color:T.textSub}}>Code</th>
                      <th style={{textAlign:'right',padding:'6px 8px',color:T.textSub}}>$/m</th>
                    </tr></thead>
                    <tbody>{entries.map(([k,v]) => (
                      <tr key={k} style={{ borderBottom:'1px solid '+T.borderLight }}>
                        <td style={{padding:'5px 8px',color:T.text}}>{v.name}</td>
                        <td style={{padding:'5px 8px',color:T.textMuted,fontFamily:'monospace',fontSize:11}}>{v.code}</td>
                        <td style={{padding:'3px 4px',textAlign:'right'}}><input type="number" step="0.01" value={v.perMetre} onChange={e => upd(k,'perMetre',+e.target.value)} style={{width:80,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>;
              }

              if (settingsPath === 'price-install') {
                const pc = appSettings.pricingConfig;
                const ip = pc.installPlanning || { sizeThresholdSqm: 2.0, baseMinutes: {}, floorAddOn: {} };
                const updBase = (ptype, bucket, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lip = lpc.installPlanning || { sizeThresholdSqm: 2.0, baseMinutes: {}, floorAddOn: {} };
                    const lbm = lip.baseMinutes || {};
                    const row = Object.assign({}, lbm[ptype] || { under: 0, over: 0 }, { [bucket]: val });
                    return {...p, pricingConfig: {...lpc, installPlanning: {...lip, baseMinutes: {...lbm, [ptype]: row}}}};
                  });
                };
                const updFloor = (bucket, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lip = lpc.installPlanning || { sizeThresholdSqm: 2.0, baseMinutes: {}, floorAddOn: {} };
                    const lfa = lip.floorAddOn || {};
                    return {...p, pricingConfig: {...lpc, installPlanning: {...lip, floorAddOn: {...lfa, [bucket]: val}}}};
                  });
                };
                const updThreshold = (val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lip = lpc.installPlanning || { sizeThresholdSqm: 2.0, baseMinutes: {}, floorAddOn: {} };
                    return {...p, pricingConfig: {...lpc, installPlanning: {...lip, sizeThresholdSqm: val}}};
                  });
                };
                const ptypes = (typeof PROPERTY_TYPES !== 'undefined' ? PROPERTY_TYPES : []);
                const fbuckets = (typeof FLOOR_LEVELS !== 'undefined' ? FLOOR_LEVELS : []);
                const numStyle = { width: 70, padding: '3px 5px', border: '1px solid ' + T.border, borderRadius: 3, fontSize: 12, fontFamily: 'monospace', textAlign: 'right', background: T.bgInput, color: T.text };
                return <div style={{ padding: 24, overflowY: 'auto', maxHeight: '100%' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 4 }}>Install Times</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 12 }}>
                    All four sections below contribute to the same per-frame install minutes total. Edits to any of them propagate to both the saved <b>installMinutes</b> field and the install cost in the price.
                  </div>
                  <div style={{ fontSize: 11, color: T.text, background: T.bgCard, border: '1px solid ' + T.border, borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontFamily: 'monospace' }}>
                    install minutes = <b>matrix base</b>[install type][product] (× panels for bifold)<br/>
                    &nbsp;&nbsp;+ <b>S_install ops</b> (sealTrim + cleanup, from Production Times)<br/>
                    &nbsp;&nbsp;+ <b>property-type adjustment</b>[type][size]<br/>
                    &nbsp;&nbsp;+ <b>floor add-on</b>[level]
                  </div>

                  {/* Property-type adjustment table (was 'Base minutes'). After
                      WIP38 unification this layers ON TOP of the Install Times
                      Matrix base, capturing site-specific extras (double brick
                      slower, weatherboard flashing time, etc.). */}
                  <div style={{ marginBottom: 24, background: T.bgPanel, borderRadius: 8, border: '1px solid ' + T.border, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: T.bgCard, borderBottom: '1px solid ' + T.border }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Property-type adjustment</div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>Additional minutes per window, on top of the matrix base. Use this for substrate-specific extras (double-brick takes longer; weatherboard needs flashing). Split by window size — large windows usually need more crew time.</div>
                    </div>
                    <div style={{ padding: '0 14px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid ' + T.border, fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        <span>Property type</span>
                        <span style={{ textAlign: 'right' }}>Under {ip.sizeThresholdSqm} m² (+min)</span>
                        <span style={{ textAlign: 'right' }}>Over {ip.sizeThresholdSqm} m² (+min)</span>
                      </div>
                      {ptypes.map(pt => {
                        const row = ip.baseMinutes[pt.id] || { under: 0, over: 0 };
                        return <div key={pt.id} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid ' + T.borderLight }}>
                          <span style={{ fontSize: 12, color: T.text }}>{pt.label}</span>
                          <div style={{ textAlign: 'right' }}>
                            <input type="number" min="0" step="5" value={row.under}
                                   onChange={e => updBase(pt.id, 'under', +e.target.value)}
                                   style={numStyle}/>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <input type="number" min="0" step="5" value={row.over}
                                   onChange={e => updBase(pt.id, 'over', +e.target.value)}
                                   style={numStyle}/>
                          </div>
                        </div>;
                      })}
                    </div>
                    <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid ' + T.border, background: T.bgCard }}>
                      <div>
                        <div style={{ fontSize: 12, color: T.text }}>Size threshold</div>
                        <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>Windows below this area use "under"; at or above use "over".</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" min="0.5" max="10" step="0.1" value={ip.sizeThresholdSqm}
                               onChange={e => updThreshold(+e.target.value)}
                               style={numStyle}/>
                        <span style={{ fontSize: 10, color: T.textMuted, width: 22 }}>m²</span>
                      </div>
                    </div>
                  </div>

                  {/* Floor add-on table */}
                  <div style={{ marginBottom: 24, background: T.bgPanel, borderRadius: 8, border: '1px solid ' + T.border, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: T.bgCard, borderBottom: '1px solid ' + T.border }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Floor level add-on</div>
                      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 1 }}>Extra minutes per window, added on top of the base. Accounts for scaffold / crane / access.</div>
                    </div>
                    <div style={{ padding: '0 14px' }}>
                      {fbuckets.map(fl => (
                        <div key={fl.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid ' + T.borderLight }}>
                          <span style={{ fontSize: 12, color: T.text }}>{fl.label}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min="0" step="5" value={ip.floorAddOn[fl.id] == null ? 0 : ip.floorAddOn[fl.id]}
                                   onChange={e => updFloor(fl.id, +e.target.value)}
                                   style={numStyle}/>
                            <span style={{ fontSize: 10, color: T.textMuted, width: 22 }}>min</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* ─── WIP23: Installation Times Matrix ─────────────────── */}
                  {/* Per-product × per-installation-type base minutes. Sits on top of
                      the older property-type × size-bucket model — both coexist; this
                      matrix is what calculateFramePrice reads for S_install. */}
                  {(function(){
                    const iops = (pc.stations && pc.stations.S_install && pc.stations.S_install.installTimes) || {};
                    const updInstallTime = (installType, productType, val) => {
                      setAppSettings(p => {
                        const lpc = p.pricingConfig || {};
                        const lst = lpc.stations || {};
                        const sinst = lst.S_install || {};
                        const cur = sinst.installTimes || {};
                        const curType = cur[installType] || {};
                        const curEntry = curType[productType] || {};
                        const newType = {...curType, [productType]: {...curEntry, t: val}};
                        const newTimes = {...cur, [installType]: newType};
                        return {...p, pricingConfig: {...lpc, stations: {...lst, S_install: {...sinst, installTimes: newTimes}}}};
                      });
                    };
                    const updInstallOp = (opKey, val) => {
                      setAppSettings(p => {
                        const lpc = p.pricingConfig || {};
                        const lst = lpc.stations || {};
                        const sinst = lst.S_install || {};
                        const lops = sinst.ops || {};
                        const cur = lops[opKey];
                        if (!cur) return p;
                        return {...p, pricingConfig: {...lpc, stations: {...lst, S_install: {...sinst, ops: {...lops, [opKey]: {...cur, t: val}}}}}};
                      });
                    };
                    const installableTypes = (typeof INSTALLATION_TYPES !== 'undefined' ? INSTALLATION_TYPES : []).filter(function(it){ return it.id !== 'supply_only'; });
                    const productTypes = (typeof PRODUCTS !== 'undefined' ? PRODUCTS : []);
                    const installOps = (pc.stations && pc.stations.S_install && pc.stations.S_install.ops) || {};
                    return <React.Fragment>
                      {installableTypes.map(installType => (
                        <div key={installType.id} style={{ marginBottom:24, background:T.bgPanel, borderRadius:8, border:'1px solid '+T.border, overflow:'hidden' }}>
                          <div style={{ padding:'10px 14px', background:T.bgCard, borderBottom:'1px solid '+T.border }}>
                            <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Install time — {installType.label}</div>
                            <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>
                              Base minutes per product. Bifold entry is PER PANEL (multiplied by panel count). sealTrim + cleanup below are added to every installation.
                            </div>
                          </div>
                          <div style={{ padding:'0 14px' }}>
                            {productTypes.map(pt => {
                              const entry = (iops[installType.id] && iops[installType.id][pt.id]) || { t:0, desc:'' };
                              return <div key={pt.id} style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:8, alignItems:'center', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                                <div>
                                  <span style={{ fontSize:12, color:T.text }}>{pt.label || pt.id}</span>
                                  {pt.id === 'bifold_door' && <span style={{ fontSize:9, color:T.textMuted, marginLeft:6 }}>(per panel)</span>}
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end' }}>
                                  <input type="number" min="0" step="1" value={entry.t || 0}
                                         onChange={e => updInstallTime(installType.id, pt.id, +e.target.value)}
                                         style={numStyle}/>
                                  <span style={{ fontSize:10, color:T.textMuted, width:22 }}>min</span>
                                </div>
                              </div>;
                            })}
                          </div>
                        </div>
                      ))}
                      {/* Universal add-ons (sealTrim, cleanup) — shown once below the per-type matrices */}
                      <div style={{ marginBottom:24, background:T.bgPanel, borderRadius:8, border:'1px solid '+T.border, overflow:'hidden' }}>
                        <div style={{ padding:'10px 14px', background:T.bgCard, borderBottom:'1px solid '+T.border }}>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Universal install add-ons</div>
                          <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>Applied to every frame that isn't Supply Only, on top of the base time above.</div>
                        </div>
                        <div style={{ padding:'0 14px' }}>
                          {Object.entries(installOps).map(([opKey, op]) => (
                            <div key={opKey} style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:8, alignItems:'center', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                              <div>
                                <span style={{ fontSize:12, color:T.text }}>{op.desc || opKey}</span>
                                <span style={{ fontSize:9, color:T.textMuted, marginLeft:6 }}>({op.unit})</span>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end' }}>
                                <input type="number" min="0" step="1" value={op.t || 0}
                                       onChange={e => updInstallOp(opKey, +e.target.value)}
                                       style={numStyle}/>
                                <span style={{ fontSize:10, color:T.textMuted, width:22 }}>min</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </React.Fragment>;
                  })()}
                </div>;
              }

              if (settingsPath === 'price-production') {
                const pc = appSettings.pricingConfig;
                const stations = pc.stations || {};
                // WIP19: state updaters use the latest React state (p) rather than
                // the render-time closure (pc/stations). Using closure values could
                // silently discard concurrent updates to appSettings between render
                // and event dispatch. Functionally identical for a single edit;
                // correct for rapid or cross-component updates.
                const updOp = (stnKey, opKey, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lst = lpc.stations || {};
                    const cur = lst[stnKey];
                    if (!cur || !cur.ops || !cur.ops[opKey]) return p;
                    const newStn = {...cur, ops: {...cur.ops, [opKey]: {...cur.ops[opKey], t: val}}};
                    return {...p, pricingConfig: {...lpc, stations: {...lst, [stnKey]: newStn}}};
                  });
                };
                const updRate = (stnKey, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lst = lpc.stations || {};
                    const cur = lst[stnKey];
                    if (!cur) return p;
                    return {...p, pricingConfig: {...lpc, stations: {...lst, [stnKey]: {...cur, rate: val}}}};
                  });
                };
                const stnOrder = ['S1_profileSaw','S2_steelSaw','S4A_cncMill','S4B_steelScrew','S_welder','S_cornerClean','S5_hardware','S_glazing','S6_reveals','S7_flyScreen','S_qc','S_dispatch','S_install'];
                return <div style={{ padding:24, overflowY:'auto', maxHeight:'100%' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Production Times & Station Rates</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:8 }}>Each station has its own labour rate ($/hr). Every operation has a time in minutes.</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Labour per operation = (time / 60) x rate x overhead ({(pc.overheadMultiplier||1.22)}x)</div>
                  {stnOrder.map(stnKey => {
                    const stn = stations[stnKey]; if (!stn) return null;
                    const ops = stn.ops || {};
                    return <div key={stnKey} style={{ marginBottom:24, background:T.bgPanel, borderRadius:8, border:'1px solid '+T.border, overflow:'hidden' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:T.bgCard, borderBottom:'1px solid '+T.border }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:T.text }}>{stn.name}</div>
                          <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>{stnKey}</div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:11, color:T.textSub }}>$/hr</span>
                          <input type="number" step="1" value={stn.rate} onChange={e => updRate(stnKey,+e.target.value)} style={{width:65,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:13,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text,fontWeight:600}}/>
                        </div>
                      </div>
                      <div style={{ padding:'8px 14px' }}>
                        {Object.entries(ops).map(([opKey, op]) => (
                          <div key={opKey} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid '+T.borderLight }}>
                            <div style={{ flex:1, minWidth:0 }}>
                              <span style={{ fontSize:12, color:T.text }}>{op.desc || opKey}</span>
                              <span style={{ fontSize:9, color:T.textMuted, marginLeft:6 }}>({op.unit})</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                              <input type="number" step="0.05" value={op.t} onChange={e => updOp(stnKey, opKey, +e.target.value)} style={{width:60,padding:'3px 5px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/>
                              <span style={{ fontSize:10, color:T.textMuted, width:22 }}>min</span>
                            </div>
                          </div>
                        ))}
                        {/* Show per-sash hardware bundles for S5 */}
                        {stnKey === 'S5_hardware' && stn.perSash && <div style={{ marginTop:8, paddingTop:8, borderTop:'2px solid '+T.border }}>
                          <div style={{ fontSize:11, fontWeight:600, color:T.textSub, marginBottom:6 }}>Per-sash summary by window type</div>
                          {Object.entries(stn.perSash).map(([typeKey, bundle]) => (
                            <div key={typeKey} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid '+T.borderLight }}>
                              <div style={{ flex:1, minWidth:0 }}>
                                <span style={{ fontSize:12, color:T.text }}>{typeKey.replace(/_/g,' ')}</span>
                                <span style={{ fontSize:9, color:T.textMuted, display:'block', marginTop:1 }}>{bundle.parts}</span>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
                                <input type="number" step="0.5" value={bundle.t}
                                  onChange={e => {
                                    const newT = +e.target.value;
                                    setAppSettings(p => {
                                      const lpc = p.pricingConfig || {};
                                      const lst = lpc.stations || {};
                                      const cur = lst[stnKey];
                                      if (!cur || !cur.perSash || !cur.perSash[typeKey]) return p;
                                      const newStn = {...cur, perSash: {...cur.perSash, [typeKey]: {...cur.perSash[typeKey], t: newT}}};
                                      return {...p, pricingConfig: {...lpc, stations: {...lst, [stnKey]: newStn}}};
                                    });
                                  }}
                                  style={{width:60,padding:'3px 5px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/>
                                <span style={{ fontSize:10, color:T.textMuted, width:22 }}>min</span>
                              </div>
                            </div>
                          ))}
                        </div>}
                      </div>
                    </div>;
                  })}
                  <div style={{ marginBottom:24, background:T.bgPanel, borderRadius:8, border:'1px solid '+T.border, padding:14 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:8 }}>Global Factors</div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                      <div>
                        <div style={{ fontSize:12, color:T.text }}>Overhead Multiplier</div>
                        <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>Super 11.5% + WC 2% + payroll tax 5% + tools 3.5% — applied to station rate ONCE (no double-dip)</div>
                      </div>
                      <input type="number" step="0.01" value={pc.overheadMultiplier||1.22} onChange={e => { const v = +e.target.value; setAppSettings(p => { const lpc = p.pricingConfig || {}; return {...p, pricingConfig: {...lpc, overheadMultiplier: v}}; }); }} style={{width:70,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/>
                    </div>

                    <div style={{ marginTop:10, marginBottom:6, fontSize:12, fontWeight:600, color:T.textSub }}>Per-Category Waste Factors</div>
                    <div style={{ fontSize:10, color:T.textMuted, marginBottom:8 }}>Industry defaults shown. 1.00 = no waste, 1.10 = 10% waste allowance. Hardware and ancillaries should stay at 1.00 (discrete units).</div>
                    {[
                      ['profile',     'uPVC profiles (frame, sash, mullion, bead-less)',    '1.08 (8% typical — offcuts + kerf + damaged ends)'],
                      ['steel',       'Galvanised steel reinforcement',                     '1.06 (6%)'],
                      ['glass',       'IGU glass (pre-cut to order)',                       '1.03 (3% — breakage + re-makes)'],
                      ['bead',        'Glazing bead (short pieces, high offcut)',           '1.12 (12%)'],
                      ['gasket',      'EPDM gasket (coil material)',                        '1.10 (10%)'],
                      ['hardware',    'Hardware sets (discrete units)',                     '1.00 (0% — no waste)'],
                      ['ancillaries', 'Ancillaries (sills, fixings, sealant, reveals)',     '1.00 (0% — discrete)'],
                    ].map(([key,label,hint]) => {
                      var current = (pc.waste && pc.waste[key]) != null ? pc.waste[key] : (pc.wasteFactor || 1.05);
                      return <div key={key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                        <div style={{ flex:1, minWidth:0, paddingRight:8 }}>
                          <div style={{ fontSize:12, color:T.text }}>{label}</div>
                          <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>{hint}</div>
                        </div>
                        <input type="number" step="0.01" min="1" value={current}
                          onChange={e => {
                            var v = +e.target.value;
                            setAppSettings(p => {
                              const lpc = p.pricingConfig || {};
                              const lw = lpc.waste || {};
                              return {...p, pricingConfig: {...lpc, waste: {...lw, [key]: v}}};
                            });
                          }}
                          style={{width:70,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text,flexShrink:0}}/>
                      </div>;
                    })}

                    <div style={{ marginTop:14, marginBottom:6, fontSize:12, fontWeight:600, color:T.textSub }}>Cut Optimization</div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                      <div style={{ flex:1, paddingRight:8 }}>
                        <div style={{ fontSize:12, color:T.text }}>Pricing Mode</div>
                        <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>Linear = total length × $/m (assumes project-level bar sharing). Bar = per-frame bar-nest with FFD algorithm (conservative).</div>
                      </div>
                      <select value={pc.pricingMode || 'linear'}
                        onChange={e => { const v = e.target.value; setAppSettings(p => { const lpc = p.pricingConfig || {}; return {...p, pricingConfig: {...lpc, pricingMode: v}}; }); }}
                        style={{padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,background:T.bgInput,color:T.text,flexShrink:0}}>
                        <option value="linear">Linear (default)</option>
                        <option value="bar">Bar-nested per frame</option>
                      </select>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                      <div style={{ flex:1, paddingRight:8 }}>
                        <div style={{ fontSize:12, color:T.text }}>Saw Kerf (mm)</div>
                        <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>Blade thickness consumed at each cut (bar mode only)</div>
                      </div>
                      <input type="number" step="0.5" value={pc.sawKerfMm || 3}
                        onChange={e => { const v = +e.target.value; setAppSettings(p => { const lpc = p.pricingConfig || {}; return {...p, pricingConfig: {...lpc, sawKerfMm: v}}; }); }}
                        style={{width:70,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text,flexShrink:0}}/>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                      <div style={{ flex:1, paddingRight:8 }}>
                        <div style={{ fontSize:12, color:T.text }}>Bar Trim Allowance (mm)</div>
                        <div style={{ fontSize:10, color:T.textMuted, marginTop:1 }}>Clean-cut allowance at each end of a fresh bar (bar mode only)</div>
                      </div>
                      <input type="number" step="5" value={pc.trimAllowanceMm || 20}
                        onChange={e => { const v = +e.target.value; setAppSettings(p => { const lpc = p.pricingConfig || {}; return {...p, pricingConfig: {...lpc, trimAllowanceMm: v}}; }); }}
                        style={{width:70,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text,flexShrink:0}}/>
                    </div>

                    {/* WIP16: Hardware Labour Mode dropdown removed — S5 now has
                        a single (bundle-per-sash + per-X) computation path. */}
                  </div>
                </div>;
              }

              if (settingsPath === 'price-labour') {
                const pc = appSettings.pricingConfig;
                const stations = pc.stations || {};
                const stnOrder = ['S1_profileSaw','S2_steelSaw','S4A_cncMill','S4B_steelScrew','S_welder','S_cornerClean','S5_hardware','S_glazing','S6_reveals','S7_flyScreen','S_qc','S_dispatch','S_install'];
                return <div style={{ padding:24, overflowY:'auto' }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Labour Rates by Station</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Per-station hourly rates. Operators move between stations - rate reflects the skill level required at each station. Overhead multiplier ({(pc.overheadMultiplier||1.22)}x) is applied automatically.</div>
                  <table style={{ width:'100%', maxWidth:600, borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:T.bgCard, borderBottom:'2px solid '+T.border }}>
                      <th style={{textAlign:'left',padding:'8px',color:T.textSub}}>Station</th>
                      <th style={{textAlign:'right',padding:'8px',color:T.textSub}}>Base $/hr</th>
                      <th style={{textAlign:'right',padding:'8px',color:T.textSub}}>Effective $/hr</th>
                    </tr></thead>
                    <tbody>{stnOrder.map(stnKey => {
                      const stn = stations[stnKey]; if (!stn) return null;
                      const eff = (stn.rate * (pc.overheadMultiplier || 1.22)).toFixed(2);
                      return <tr key={stnKey} style={{ borderBottom:'1px solid '+T.borderLight }}>
                        <td style={{padding:'6px 8px',color:T.text}}>{stn.name}</td>
                        <td style={{padding:'4px',textAlign:'right'}}>
                          <input type="number" step="1" value={stn.rate}
                            onChange={e => {
                              const v = +e.target.value;
                              setAppSettings(p => {
                                const lpc = p.pricingConfig || {};
                                const lst = lpc.stations || {};
                                const cur = lst[stnKey];
                                if (!cur) return p;
                                return {...p, pricingConfig: {...lpc, stations: {...lst, [stnKey]: {...cur, rate: v}}}};
                              });
                            }}
                            style={{width:70,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/>
                        </td>
                        <td style={{padding:'6px 8px',textAlign:'right',fontWeight:600,color:T.text,fontFamily:'monospace'}}>${eff}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>;
              }

              if (settingsPath === 'price-markups') {
                const pc = appSettings.pricingConfig;
                const mk = pc.markups;
                const updPl = (idx, field, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lmk = lpc.markups || {};
                    const lpl = lmk.priceLists || [];
                    const npl = [...lpl];
                    if (!npl[idx]) return p;
                    npl[idx] = {...npl[idx], [field]: val};
                    return {...p, pricingConfig: {...lpc, markups: {...lmk, priceLists: npl}}};
                  });
                };
                const updMk = (key, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lmk = lpc.markups || {};
                    return {...p, pricingConfig: {...lpc, markups: {...lmk, [key]: val}}};
                  });
                };
                return <div style={{ padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Markups & Price Lists</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Configure markup percentages for materials and define named price lists.</div>
                  <div style={{ maxWidth:520, marginBottom:24 }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:4, color:T.text }}>Category Markups (%)</div>
                    <div style={{ fontSize:11, color:T.textMuted, marginBottom:10 }}>Applied to each cost category BEFORE the price-list markup. Use these to take margin on specific inputs (e.g. 25% on hardware because Siegenia is a high-margin line).</div>
                    {[
                      ['materialMarkup',      'uPVC Profiles (frame/sash/mullion/threshold/cover/rail)'],
                      ['steelMarkup',         'Steel Reinforcement'],
                      ['beadMarkup',          'Glazing Beads'],
                      ['glassMarkup',         'Glass IGUs'],
                      ['hardwareMarkup',      'Hardware Sets (Siegenia)'],
                      ['gasketMarkup',        'EPDM Gaskets'],
                      ['ancillaryMarkup',     'Ancillaries (reveals, sills, fixings, delivery)'],
                      ['installationMarkup',  'Installation Labour'],
                    ].map(function(row) {
                      var k = row[0], label = row[1];
                      var val = (typeof mk[k] === 'number') ? mk[k] : 0;
                      return <div key={k} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                        <span style={{ fontSize:12, color:T.text }}>{label}</span>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <input type="number" step="1" value={val} onChange={e => updMk(k,+e.target.value)} style={{width:70,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/>
                          <span style={{fontSize:11,color:T.textMuted}}>%</span>
                        </div>
                      </div>;
                    })}
                    <div style={{ marginTop:6, fontSize:10, color:T.textMuted, fontStyle:'italic' }}>
                      Legacy overhead-% field ({(mk.overheadPct || 0)}%) is now 0 by default — the overhead multiplier on station rates ({(pc.overheadMultiplier||1.22)}x) already covers it. Don't restore without auditing.
                    </div>
                  </div>
                  <div style={{ maxWidth:500 }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:10, color:T.text }}>Price Lists</div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead><tr style={{ background:T.bgCard, borderBottom:'2px solid '+T.border }}>
                        <th style={{textAlign:'left',padding:'6px 8px',color:T.textSub}}>Name</th>
                        <th style={{textAlign:'right',padding:'6px 8px',color:T.textSub}}>Markup %</th>
                      </tr></thead>
                      <tbody>{mk.priceLists.map((pl,i) => (
                        <tr key={pl.id} style={{ borderBottom:'1px solid '+T.borderLight }}>
                          <td style={{padding:'4px 8px'}}><input value={pl.name} onChange={e => updPl(i,'name',e.target.value)} style={{width:150,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,background:T.bgInput,color:T.text}}/></td>
                          <td style={{padding:'3px 4px',textAlign:'right'}}><input type="number" step="1" value={pl.pct} onChange={e => updPl(i,'pct',+e.target.value)} style={{width:70,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/></td>
                        </tr>
                      ))}</tbody>
                    </table>
                    <div onClick={() => { const npl=[...mk.priceLists,{id:'pl_'+Date.now(),name:'New List',pct:40}]; updMk('priceLists',npl); }} style={{ padding:'8px 12px', cursor:'pointer', fontSize:12, color:T.accent, marginTop:8 }}>+ Add price list</div>
                  </div>
                </div>;
              }

              if (settingsPath === 'price-ancillaries') {
                const pc = appSettings.pricingConfig;
                const anc = pc.ancillaries;
                const upd = (key, val) => {
                  setAppSettings(p => {
                    const lpc = p.pricingConfig || {};
                    const lanc = lpc.ancillaries || {};
                    return {...p, pricingConfig: {...lpc, ancillaries: {...lanc, [key]: val}}};
                  });
                };
                const items = [
                  ['flyScreenPerUnit','Fly Screen — misc. (mesh, spline, corners, tab) per unit'],
                  ['flyScreenFramePerMetre','Fly Screen — aluminium frame per metre'],
                  ['revealSetPerWindow','Reveal Set per window'],
                  ['revealSetPerDoor','Reveal Set per door'],['sillPerWindow','External Sill per window'],
                  ['drainageCapsPerFrame','Drainage Caps per frame'],['cornerConnectors','Corner Connectors (each)'],
                  ['gasketPerMetre','EPDM Gasket per metre'],['sealantPerUnit','Sealant per unit'],
                  ['fixingsPerUnit','Fixings per unit'],['deliveryPerUnit','Delivery per unit'],
                  ['thresholdConnectorPerDoor','Threshold Connector Set (per door)'],
                ];
                return <div style={{ padding:24 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>Ancillary Costs</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:16 }}>Per-unit costs for fly screens, reveals, gaskets, fixings, delivery.</div>
                  <div style={{ maxWidth:450 }}>
                    {items.map(([k,label]) => (
                      <div key={k} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid '+T.borderLight }}>
                        <span style={{ fontSize:12, color:T.text }}>{label}</span>
                        <div style={{display:'flex',alignItems:'center',gap:4}}>
                          <span style={{fontSize:11,color:T.textMuted}}>$</span>
                          <input type="number" step="0.1" value={anc[k]} onChange={e => upd(k,+e.target.value)} style={{width:80,padding:'4px 6px',border:'1px solid '+T.border,borderRadius:3,fontSize:12,fontFamily:'monospace',textAlign:'right',background:T.bgInput,color:T.text}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>;
              }

              // ═══════════════════════════════════════════════════════════════
              // WIP30: CATALOG SETTINGS — view/edit physical orderable trim
              // catalogs (cover mouldings, architraves, reveals, fly screens).
              // Editable: priceExBar, availability, stockQty per row + a
              // "Recalc per-meter prices" button. Non-editable: id, colour,
              // bar length, sku (those come from the supplier and shouldn't
              // be hand-tweaked through the UI).
              //
              // Pattern reused for all 4 sub-pages — only the catalog family
              // key differs. Architraves/Reveals/Flyscreens are placeholders
              // until catalogs are uploaded; the page shows what's there OR
              // what the dropdown would currently fall back to.
              // ═══════════════════════════════════════════════════════════════
              if (settingsPath === 'catalog-trims' ||
                  settingsPath === 'catalog-architraves' ||
                  settingsPath === 'catalog-reveals' ||
                  settingsPath === 'catalog-quads' ||
                  settingsPath === 'catalog-hardwood') {
                // WIP30: catalog-trims renders ALL families in pricingConfig.trims
                // (coverMouldings 30x7, coverMouldings50 50x7, angleTrims20 20x20,
                // future: more). Each family gets its own card with cross-section
                // image + editable items table. Other catalog pages stay
                // single-family until those catalogs land.
                var familyKeys;
                var allTrimsKeys = Object.keys((appSettings && appSettings.pricingConfig && appSettings.pricingConfig.trims) || (window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.trims) || {});
                // Family-key prefix conventions for routing each settings tab.
                // Architrave families start with 'architraves' (architraves44SB,
                // architraves66SB, future architraves92SB / architravesLT etc).
                // Reveal families start with 'reveals'. Flyscreen families with
                // 'flyScreens'. Anything else is a cover-trim/angle/flange and
                // shows on the Trims tab. Keeps each settings tab tidy as
                // catalogs grow.
                var isArchitraveFamily = function(k){ return k.indexOf('architraves') === 0; };
                var isRevealFamily     = function(k){ return k.indexOf('reveals') === 0; };
                var isFlyScreenFamily  = function(k){ return k.indexOf('flyScreens') === 0; };
                var isQuadFamily       = function(k){ return k.indexOf('quads') === 0; };
                var isHardwoodFamily   = function(k){ return k.indexOf('hardwood') === 0; };
                if (settingsPath === 'catalog-trims') {
                  familyKeys = allTrimsKeys.filter(function(k){
                    return !isArchitraveFamily(k) && !isRevealFamily(k) && !isFlyScreenFamily(k) && !isQuadFamily(k) && !isHardwoodFamily(k);
                  });
                  if (!familyKeys.length) familyKeys = ['coverMouldings'];
                } else if (settingsPath === 'catalog-architraves') {
                  familyKeys = allTrimsKeys.filter(isArchitraveFamily);
                  if (!familyKeys.length) familyKeys = ['architraves44SB'];
                } else if (settingsPath === 'catalog-reveals') {
                  familyKeys = allTrimsKeys.filter(isRevealFamily);
                  if (!familyKeys.length) familyKeys = ['reveals'];
                } else if (settingsPath === 'catalog-quads') {
                  familyKeys = allTrimsKeys.filter(isQuadFamily);
                  if (!familyKeys.length) familyKeys = ['quads18'];
                } else if (settingsPath === 'catalog-hardwood') {
                  familyKeys = allTrimsKeys.filter(isHardwoodFamily);
                  if (!familyKeys.length) familyKeys = ['hardwood42'];
                }
                var pageTitle = ({
                  'catalog-trims':       'Cover Trim Catalogs',
                  'catalog-architraves': 'Architrave Catalog',
                  'catalog-reveals':     'Reveal Catalog',
                  'catalog-quads':       'Quad / Beading Catalog',
                  'catalog-hardwood':    'Hardwood (DAR) Catalog',
                })[settingsPath];
                var pageBlurb = ({
                  'catalog-trims':       'Aluplast cover mouldings + angle trims — 30×7mm (12×286), 50×7mm (12×288), 20×20 angle (12×290), 180×80×6 angle (12×299). These appear in the survey-mode Internal/External Trim dropdowns and feed the FFD-optimised cutting list. Generic dictionary codes (30 T, 50 T, 20x20 T, 180 T) link to their respective family for FFD packing.',
                  'catalog-architraves': 'Primed timber architraves (paint-grade). Currently 44×18 Single Bevel — more profiles arriving as drops land. These appear in the survey-mode Internal Trim dropdowns and feed the FFD-optimised cutting list. Generic dictionary codes (44x18 SB, 92x18 LT, etc.) link to their respective family for FFD packing.',
                  'catalog-reveals':     'Primed pine DAR reveal boards — three raw widths: 110×18 (stock), 138×18 (stock), 185×18 (CUSTOM ORDER — not held, requires advance order from supplier). Installer rips each down to the required width based on Window Depth + Frame Depth + Reveal Type (In-Line or Stepped). Auto-selection logic in survey mode picks the smallest SKU wider than the calculated rip width, then generates the cutting list (top/bottom + jambs) per the reveal-type formulas. When the 185 SKU is auto-picked the cutting list will flag the custom-order requirement so production can place the supplier order before scheduling.',
                  'catalog-quads':       'Quads (quarter-round beading) — small decorative trims used for scotia, bead, and corner finishing. Currently 18×18 Primed Pine — more profiles (12 Q, 12/19 Q HW) arriving as drops land. Generic dictionary codes (18 Q, 12 Q, etc.) link to their respective family for FFD packing in the survey-mode cut list.',
                  'catalog-hardwood':    'Hardwood DAR (Dressed All Round) — natural-finish Tasmanian Oak rectangular sections, stain-grade. Distinct material from primed pine architraves: priced higher, used where exposed timber is the design intent. Generic dictionary codes (42x19 HW, 65x19 HW, etc.) link to their respective family for FFD packing.',
                })[settingsPath];

                // Per-family CRUD operations — pass familyKey at call time
                // so a single set of handlers serves all rendered families.
                var updItem = function(familyKey, idx, field, val) {
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    var lcat = ltrims[familyKey] || { items: [] };
                    var litems = (lcat.items || []).slice();
                    var cur = Object.assign({}, litems[idx] || {});
                    cur[field] = val;
                    if (field === 'priceExBar' && cur.lengthMm) {
                      cur.priceExPerMeter = +(val / (cur.lengthMm / 1000)).toFixed(3);
                    }
                    if (field === 'lengthMm' && cur.priceExBar && val) {
                      cur.priceExPerMeter = +(cur.priceExBar / (val / 1000)).toFixed(3);
                    }
                    litems[idx] = cur;
                    var newCat = Object.assign({}, lcat, { items: litems });
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = newCat;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };
                // Patch a top-level family field — description, productCode,
                // supplier, isCustomOrder. crossSection.widthMm/thicknessMm
                // use updFamilyCrossSection. The patched value is written
                // verbatim; pass null/'' to clear a field.
                var updFamilyMeta = function(familyKey, field, val) {
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    var lcat = ltrims[familyKey] || { items: [] };
                    var newCat = Object.assign({}, lcat);
                    if (val === null || val === undefined || val === '') delete newCat[field];
                    else newCat[field] = val;
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = newCat;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };
                var updFamilyCrossSection = function(familyKey, dim, val) {
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    var lcat = ltrims[familyKey] || { items: [] };
                    var cs = Object.assign({}, lcat.crossSection || {});
                    cs[dim] = (val === '' || val == null) ? null : Number(val);
                    var newCat = Object.assign({}, lcat, { crossSection: cs });
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = newCat;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };
                // Add a new blank item row to a family's items[]. New rows
                // get a random id so React keys stay stable across edits.
                var addItem = function(familyKey) {
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    var lcat = ltrims[familyKey] || { items: [] };
                    var litems = (lcat.items || []).slice();
                    var newId = 'item_' + Date.now() + '_' + Math.floor(Math.random()*999);
                    // Inherit defaults from the most recent row if any
                    var template = litems[litems.length-1] || {};
                    litems.push({
                      id: newId,
                      sku: '',
                      code: '',
                      colour: 'New colour',
                      colourFamily: template.colourFamily || 'plain',
                      lengthMm: template.lengthMm || 5800,
                      priceExBar: 0,
                      priceExPerMeter: 0,
                      stockQty: null,
                      availability: 'available',
                      image: null,
                    });
                    var newCat = Object.assign({}, lcat, { items: litems });
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = newCat;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };
                var deleteItem = function(familyKey, idx) {
                  var lpc = appSettings.pricingConfig || {};
                  var lcat = (lpc.trims || {})[familyKey] || { items: [] };
                  var label = ((lcat.items || [])[idx] && lcat.items[idx].colour) || 'this row';
                  if (!confirm('Delete "' + label + '"? This affects the survey-mode dropdown immediately.')) return;
                  setAppSettings(function(p) {
                    var inner_lpc = p.pricingConfig || {};
                    var ltrims = inner_lpc.trims || {};
                    var inner_lcat = ltrims[familyKey] || { items: [] };
                    var litems = (inner_lcat.items || []).slice();
                    litems.splice(idx, 1);
                    var newCat = Object.assign({}, inner_lcat, { items: litems });
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = newCat;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, inner_lpc, { trims: newTrims }) });
                  });
                };
                // PNG/JPEG upload per item — base64 data URL stored on
                // item.image. The same validation gates as the fly-screen
                // profile uploader (1.5MB warn threshold, image type check).
                var uploadItemImage = function(familyKey, idx, file) {
                  if (!file) return;
                  if (!/png|jpe?g/i.test(file.type)) {
                    alert('Please use PNG or JPEG. Got: ' + (file.type || 'unknown'));
                    return;
                  }
                  if (file.size > 1.5 * 1024 * 1024) {
                    if (!confirm('This file is ' + (file.size/1024/1024).toFixed(1) + ' MB. Cross-section thumbnails are usually < 200 KB. Continue?')) return;
                  }
                  var reader = new FileReader();
                  reader.onload = function(ev){ updItem(familyKey, idx, 'image', ev.target.result); };
                  reader.onerror = function(){ alert('Failed to read file.'); };
                  reader.readAsDataURL(file);
                };
                // WIP30: per-family defaults editor — patches one key inside
                // catalog.defaults (cutAllowanceMm, jointStyle, etc). Used by
                // the cut-allowance number input and joint-style dropdown in
                // the metadata strip. Empty/null val for cutAllowanceMm
                // resets the family back to using the global 200mm default.
                var updFamilyDefault = function(familyKey, key, val) {
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    var lcat = ltrims[familyKey] || { items: [] };
                    var newDefaults = Object.assign({}, lcat.defaults || {});
                    if (val === null || val === undefined || val === '') {
                      delete newDefaults[key];
                    } else {
                      newDefaults[key] = val;
                    }
                    var newCat = Object.assign({}, lcat, { defaults: newDefaults });
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = newCat;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };
                var recalcAllPpm = function(familyKey) {
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    var lcat = ltrims[familyKey];
                    if (!lcat || !lcat.items) return p;
                    var litems = lcat.items.map(function(it) {
                      if (!it.lengthMm || !it.priceExBar) return it;
                      return Object.assign({}, it, { priceExPerMeter: +(it.priceExBar / (it.lengthMm / 1000)).toFixed(3) });
                    });
                    var newCat = Object.assign({}, lcat, { items: litems });
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = newCat;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };
                var resetToDefaults = function(familyKey, familyTitle) {
                  if (!confirm('Reset ' + familyTitle + ' to factory defaults? Local edits will be lost.')) return;
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    var defCat = (window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.trims && window.PRICING_DEFAULTS.trims[familyKey]) || null;
                    var newTrims = Object.assign({}, ltrims, {});
                    if (defCat) newTrims[familyKey] = JSON.parse(JSON.stringify(defCat));
                    else delete newTrims[familyKey];
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };
                // Create a new family — given a family key + initial metadata,
                // writes an empty {description, productCode, supplier,
                // crossSection, defaults, items[]} skeleton to pricingConfig.
                // Caller is responsible for applying the right family-key
                // prefix so the family appears on the correct settings tab
                // (e.g. 'architraves' prefix for the architraves page).
                var createFamily = function(familyKey, meta) {
                  setAppSettings(function(p) {
                    var lpc = p.pricingConfig || {};
                    var ltrims = lpc.trims || {};
                    if (ltrims[familyKey]) return p;  // safety: don't clobber existing
                    var skeleton = {
                      description: meta.description || familyKey,
                      productCode: meta.productCode || '',
                      supplier: meta.supplier || '',
                      crossSection: {
                        widthMm: meta.widthMm != null ? Number(meta.widthMm) : null,
                        thicknessMm: meta.thicknessMm != null ? Number(meta.thicknessMm) : null,
                      },
                      defaults: { cutAllowanceMm: 200, jointStyle: 'butt' },
                      items: [],
                    };
                    var newTrims = Object.assign({}, ltrims, {});
                    newTrims[familyKey] = skeleton;
                    return Object.assign({}, p, { pricingConfig: Object.assign({}, lpc, { trims: newTrims }) });
                  });
                };

                var thSty = { textAlign:'left', padding:'8px 10px', borderBottom:'1px solid '+T.border, fontSize:10, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, fontWeight:700, background:'#f4f6f8' };
                var thRight = Object.assign({}, thSty, { textAlign:'right' });
                var tdSty = { padding:'6px 10px', borderBottom:'1px solid #f0f0f0', fontSize:12, color:T.text };
                var tdRight = Object.assign({}, tdSty, { textAlign:'right' });
                var inpSty = { width:'100%', padding:'4px 6px', border:'1px solid '+T.border, borderRadius:3, fontSize:11, background:T.bgInput, color:T.text };

                var pc = (appSettings && appSettings.pricingConfig) || {};
                var trims = pc.trims || {};

                return <div style={{ padding:24, overflow:'auto' }}>
                  <div style={{ marginBottom:16 }}>
                    <h2 style={{ margin:0, fontSize:18, color:T.text }}>{pageTitle}</h2>
                    <p style={{ margin:'6px 0 0 0', fontSize:11, color:T.textMuted, maxWidth:760, lineHeight:1.5 }}>{pageBlurb}</p>
                  </div>

                  {/* ── Add-new-family inline form ─────────────────────
                      Family-key prefix is enforced per page so the new
                      family appears on the right tab. Trims tab is the
                      catch-all, others use their distinguishing prefix.
                      User picks a short suffix; we build the final key
                      automatically (e.g. "92SB" → "architraves92SB").  */}
                  {(function(){
                    var prefixMap = {
                      'catalog-trims':       '',           // No prefix — anything not matching another tab's prefix lives here
                      'catalog-architraves': 'architraves',
                      'catalog-quads':       'quads',
                      'catalog-hardwood':    'hardwood',
                      'catalog-reveals':     'reveals',
                    };
                    var prefix = prefixMap[settingsPath];
                    if (prefix === undefined) return null;
                    var labelHint = ({
                      'catalog-trims':       'e.g. coverMouldings80, angleTrims40',
                      'catalog-architraves': 'e.g. 92SB → "architraves92SB", 66LT → "architraves66LT"',
                      'catalog-quads':       'e.g. 12 → "quads12", 19HW → "quads19HW"',
                      'catalog-hardwood':    'e.g. 65 → "hardwood65", 90 → "hardwood90"',
                      'catalog-reveals':     'e.g. 220 → "reveals220" (only one reveals family normally)',
                    })[settingsPath];

                    return <details style={{ marginBottom:18, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:6 }}>
                      <summary style={{ padding:'10px 14px', cursor:'pointer', fontSize:12, fontWeight:600, color:T.text, listStyle:'none', display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:14, color:T.accent }}>＋</span> Add new family
                      </summary>
                      <div style={{ padding:'4px 14px 14px 14px', fontSize:11, color:T.textMuted, lineHeight:1.5 }}>
                        Add a new {settingsPath.replace('catalog-','')} family. Once created, you'll see it as a card below — add SKUs from there.
                        <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Key suffix <span style={{ color:'#dc2626' }}>*</span></div>
                            <input type="text" id={'newfam-key-' + settingsPath}
                                   placeholder={prefix ? '92SB' : 'coverMouldings80'}
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, background:T.bgInput, color:T.text }}/>
                            <div style={{ fontSize:9, color:T.textFaint, marginTop:2 }}>
                              {prefix ? <>Final key: <code>{prefix}</code><i>(your suffix)</i></> : <>{labelHint}</>}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Description <span style={{ color:'#dc2626' }}>*</span></div>
                            <input type="text" id={'newfam-desc-' + settingsPath}
                                   placeholder="e.g. 92×18 Single Bevel Architrave"
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, background:T.bgInput, color:T.text }}/>
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Width (mm)</div>
                            <input type="number" id={'newfam-w-' + settingsPath}
                                   placeholder="44"
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, background:T.bgInput, color:T.text, fontFamily:'monospace' }}/>
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:T.textSub, marginBottom:3 }}>Thickness (mm)</div>
                            <input type="number" id={'newfam-t-' + settingsPath}
                                   placeholder="18"
                                   style={{ width:'100%', padding:'5px 8px', border:'1px solid '+T.border, borderRadius:3, fontSize:12, background:T.bgInput, color:T.text, fontFamily:'monospace' }}/>
                          </div>
                        </div>
                        <button onClick={function(){
                          var sfx = (document.getElementById('newfam-key-' + settingsPath).value || '').trim();
                          var desc = (document.getElementById('newfam-desc-' + settingsPath).value || '').trim();
                          var w = +(document.getElementById('newfam-w-' + settingsPath).value || 0);
                          var t = +(document.getElementById('newfam-t-' + settingsPath).value || 0);
                          if (!sfx || !desc) { alert('Key suffix and description are required.'); return; }
                          if (!/^[a-zA-Z0-9_]+$/.test(sfx)) { alert('Key suffix must be letters/digits/underscore only.'); return; }
                          var fullKey = prefix ? (prefix + sfx) : sfx;
                          if ((appSettings.pricingConfig && appSettings.pricingConfig.trims && appSettings.pricingConfig.trims[fullKey])
                              || (window.PRICING_DEFAULTS && window.PRICING_DEFAULTS.trims && window.PRICING_DEFAULTS.trims[fullKey])) {
                            alert('A family with key "' + fullKey + '" already exists.');
                            return;
                          }
                          createFamily(fullKey, { description: desc, widthMm: w || null, thicknessMm: t || null });
                          // Clear inputs after success
                          document.getElementById('newfam-key-' + settingsPath).value = '';
                          document.getElementById('newfam-desc-' + settingsPath).value = '';
                          document.getElementById('newfam-w-' + settingsPath).value = '';
                          document.getElementById('newfam-t-' + settingsPath).value = '';
                        }} style={{ marginTop:12, padding:'6px 14px', background:T.accent, color:'white', border:'none', borderRadius:4, fontSize:11, fontWeight:600, cursor:'pointer' }}>
                          Create family
                        </button>
                      </div>
                    </details>;
                  })()}

                  {familyKeys.map(function(familyKey){
                    var cat = trims[familyKey] || null;
                    var items = (cat && Array.isArray(cat.items)) ? cat.items : [];
                    var familyTitle = cat ? (cat.description || familyKey) : familyKey;
                    var isReveal = isRevealFamily(familyKey);

                    return <div key={familyKey} style={{ marginBottom:32, paddingBottom:20, borderBottom: familyKeys.length > 1 ? '2px solid '+T.border : 'none' }}>
                      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                        <h3 style={{ margin:0, fontSize:14, color:T.text }}>{familyTitle} <span style={{ fontSize:10, color:T.textMuted, fontWeight:400, marginLeft:6 }}>{familyKey}</span></h3>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={function(){ recalcAllPpm(familyKey); }} disabled={!cat || !items.length}
                                  style={{ padding:'5px 9px', fontSize:10, background:T.bgInput, border:'1px solid '+T.border, color:T.text, borderRadius:4, cursor: cat && items.length ? 'pointer' : 'not-allowed', opacity: cat && items.length ? 1 : 0.5 }}>
                            Recalc per-m
                          </button>
                          <button onClick={function(){ resetToDefaults(familyKey, familyTitle); }}
                                  style={{ padding:'5px 9px', fontSize:10, background:T.bgInput, border:'1px solid '+T.border, color:T.text, borderRadius:4, cursor:'pointer' }}
                                  title="Restore this family from PRICING_DEFAULTS — local edits will be lost.">
                            Reset to defaults
                          </button>
                        </div>
                      </div>

                      {/* ── Family-level cross-section image + metadata ──
                          The PRICING_DEFAULTS factory catalogs ship with a
                          profileImage data URL on each family — a small
                          line-drawing of the cross-section. We restore that
                          here as a 240px panel on the left, with Replace/
                          Remove buttons. The per-row item.image (in the
                          items table below) is a separate slot for per-
                          colour swatches or photos. */}
                      {cat && (
                        <div style={{ display:'flex', gap:14, marginBottom:10, alignItems:'flex-start' }}>
                          {(function(){
                            var familyImgInputId = 'famimg-' + familyKey;
                            return <div style={{ flexShrink:0, background:'white', border:'1px solid '+T.border, borderRadius:6, padding:8, width:240 }}>
                              <div style={{ fontSize:9, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, fontWeight:700, marginBottom:6 }}>Cross-section profile</div>
                              <input type="file" accept="image/png,image/jpeg" id={familyImgInputId} style={{ display:'none' }}
                                     onChange={function(e){
                                       var f = e.target.files && e.target.files[0];
                                       if (!f) return;
                                       if (!/png|jpe?g/i.test(f.type)) { alert('PNG or JPEG only.'); return; }
                                       if (f.size > 1.5 * 1024 * 1024) {
                                         if (!confirm('Image is ' + (f.size/1024/1024).toFixed(1) + ' MB. Profile diagrams are usually < 200 KB. Continue?')) return;
                                       }
                                       var reader = new FileReader();
                                       reader.onload = function(ev){ updFamilyMeta(familyKey, 'profileImage', ev.target.result); };
                                       reader.onerror = function(){ alert('Failed to read file.'); };
                                       reader.readAsDataURL(f);
                                       e.target.value = '';
                                     }}/>
                              {cat.profileImage ? (
                                <>
                                  <img src={cat.profileImage} alt={(cat.description || 'profile') + ' cross-section'}
                                       style={{ width:'100%', height:'auto', display:'block', borderRadius:3 }}/>
                                  {cat.crossSection && cat.crossSection.widthMm != null && (
                                    <div style={{ fontSize:10, color:T.textMuted, marginTop:6, textAlign:'center', fontFamily:'monospace' }}>
                                      {cat.crossSection.widthMm}×{cat.crossSection.thicknessMm || '—'}mm
                                    </div>
                                  )}
                                  <div style={{ display:'flex', gap:4, marginTop:8 }}>
                                    <label htmlFor={familyImgInputId} style={{ flex:1, textAlign:'center', padding:'4px 8px', background:T.bgInput, border:'1px solid '+T.border, color:T.text, borderRadius:3, fontSize:10, cursor:'pointer' }}>Replace</label>
                                    <button onClick={function(){
                                      if (confirm('Remove the cross-section image?')) updFamilyMeta(familyKey, 'profileImage', null);
                                    }} style={{ flex:1, padding:'4px 8px', background:'transparent', border:'1px solid '+T.borderLight, color:'#dc2626', borderRadius:3, fontSize:10, cursor:'pointer' }}>Remove</button>
                                  </div>
                                </>
                              ) : (
                                <label htmlFor={familyImgInputId} style={{ display:'block', cursor:'pointer' }}>
                                  <div style={{ background:'#fafafa', border:'1px dashed '+T.border, borderRadius:4, padding:'40px 12px', textAlign:'center', color:T.textMuted, fontSize:11 }}>
                                    <div style={{ fontSize:28, color:'#bbb', marginBottom:6 }}>⬆</div>
                                    <div style={{ fontWeight:600, color:T.text }}>Upload PNG/JPEG</div>
                                    <div style={{ fontSize:9, color:T.textMuted, marginTop:4 }}>Cross-section diagram for this family</div>
                                  </div>
                                </label>
                              )}
                            </div>;
                          })()}

                          {/* Metadata strip — flexes to fill remaining width */}
                          <div style={{ flex:1, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:6, padding:'10px 14px', display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', gap:10, alignItems:'end' }}>
                            <div>
                              <div style={{ fontSize:9, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, marginBottom:3 }}>Description</div>
                              <input type="text" value={cat.description || ''}
                                     onChange={function(e){ updFamilyMeta(familyKey, 'description', e.target.value); }}
                                     style={Object.assign({}, inpSty, { fontSize:12, fontWeight:600 })}/>
                          </div>
                          <div>
                            <div style={{ fontSize:9, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, marginBottom:3 }}>Product code</div>
                            <input type="text" value={cat.productCode || ''}
                                   onChange={function(e){ updFamilyMeta(familyKey, 'productCode', e.target.value); }}
                                   style={Object.assign({}, inpSty, { fontFamily:'monospace' })}/>
                          </div>
                          <div>
                            <div style={{ fontSize:9, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, marginBottom:3 }}>Supplier</div>
                            <input type="text" value={cat.supplier || ''}
                                   onChange={function(e){ updFamilyMeta(familyKey, 'supplier', e.target.value); }}
                                   style={inpSty}/>
                          </div>
                          <div>
                            <div style={{ fontSize:9, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, marginBottom:3 }}>Width (mm)</div>
                            <input type="number" value={(cat.crossSection && cat.crossSection.widthMm != null) ? cat.crossSection.widthMm : ''}
                                   onChange={function(e){ updFamilyCrossSection(familyKey, 'widthMm', e.target.value); }}
                                   style={Object.assign({}, inpSty, { fontFamily:'monospace', textAlign:'right' })}/>
                          </div>
                          <div>
                            <div style={{ fontSize:9, color:T.textMuted, textTransform:'uppercase', letterSpacing:0.4, marginBottom:3 }}>Thickness (mm)</div>
                            <input type="number" value={(cat.crossSection && cat.crossSection.thicknessMm != null) ? cat.crossSection.thicknessMm : ''}
                                   onChange={function(e){ updFamilyCrossSection(familyKey, 'thicknessMm', e.target.value); }}
                                   style={Object.assign({}, inpSty, { fontFamily:'monospace', textAlign:'right' })}/>
                          </div>
                          {/* Cut allowance + joint style on a second row */}
                          <div style={{ gridColumn:'1 / -1', display:'flex', gap:14, alignItems:'center', paddingTop:8, borderTop:'1px solid '+T.borderLight, marginTop:4 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:T.textMuted }}>
                              <span>Cut allowance:</span>
                              <input type="number"
                                     value={(cat.defaults && typeof cat.defaults.cutAllowanceMm === 'number') ? cat.defaults.cutAllowanceMm : ''}
                                     placeholder="200"
                                     title="mm added to each cut. Top/bottom = W + this; left/right = H + this. Negative values shorten cuts. Blank uses the global 200mm default."
                                     onChange={function(e){
                                       var v = e.target.value === '' ? null : Number(e.target.value);
                                       if (v !== null && !isFinite(v)) v = null;
                                       updFamilyDefault(familyKey, 'cutAllowanceMm', v);
                                     }}
                                     style={{ width:60, padding:'2px 4px', border:'1px solid '+T.border, borderRadius:3, fontSize:11, background:T.bgInput, color:T.text, textAlign:'right' }}/>
                              <span>mm</span>
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:T.textMuted }}>
                              <span>Joint:</span>
                              <select value={(cat.defaults && cat.defaults.jointStyle) || 'butt'}
                                      onChange={function(e){ updFamilyDefault(familyKey, 'jointStyle', e.target.value); }}
                                      style={{ padding:'2px 4px', border:'1px solid '+T.border, borderRadius:3, fontSize:11, background:T.bgInput, color:T.text, fontWeight: (cat.defaults && cat.defaults.jointStyle === 'mitre') ? 700 : 400 }}>
                                <option value="butt">Butt (straight)</option>
                                <option value="mitre">Mitre 45°</option>
                              </select>
                            </div>
                            <div style={{ fontSize:11, color:T.textMuted }}>SKUs: <b style={{ color:T.text }}>{items.length}</b></div>
                            {cat.isCustomOrder && (
                              <span title="Family-level custom-order flag" style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 8px', background:'#fff3cd', border:'1px solid #f0c14b', borderRadius:4, fontWeight:700, fontSize:9, letterSpacing:0.6, color:'#7a4d00', textTransform:'uppercase' }}>
                                ⚑ Custom Order
                              </span>
                            )}
                          </div>
                        </div>
                        </div>
                      )}

                      {/* Empty-state skeleton — appears for both never-loaded
                          factory families AND newly created user families
                          before they have any items. Encourages adding rows. */}
                      {!cat && (
                        <div style={{ marginTop:14, padding:'24px 18px', background:T.bgPanel, border:'1px dashed '+T.border, borderRadius:8, fontSize:12, color:T.textMuted, textAlign:'center' }}>
                          <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
                          <div style={{ fontWeight:700, color:T.text, marginBottom:4 }}>No catalog loaded for {familyKey}</div>
                          <div style={{ fontSize:11, maxWidth:480, margin:'0 auto', lineHeight:1.5 }}>
                            Use "Add new family" above to seed an empty family with this key, then add rows from there.
                          </div>
                        </div>
                      )}

                      {/* Items table — full edit, per-row image, delete + add */}
                      {cat && (
                        <div style={{ background:'white', border:'1px solid '+T.border, borderRadius:6, overflow:'hidden', marginTop:10 }}>
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead>
                              <tr>
                                <th style={Object.assign({}, thSty, { width:64 })}>Image</th>
                                <th style={thSty}>Colour</th>
                                <th style={thSty}>Colour family</th>
                                <th style={thSty}>SKU</th>
                                <th style={thSty}>Code</th>
                                <th style={thRight}>Bar length</th>
                                <th style={thRight}>Price ex GST</th>
                                <th style={thRight}>$/m ex</th>
                                <th style={thRight}>Stock</th>
                                <th style={thSty}>Avail.</th>
                                {isReveal && <th style={thRight} title="Per-row override for the rip width auto-pick. Defaults to family width when blank.">Rip W</th>}
                                <th style={Object.assign({}, thSty, { width:32 })}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map(function(it, idx){
                                var inputId = 'imgupload-' + familyKey + '-' + idx;
                                return (
                                  <tr key={it.id || idx} style={{ borderBottom:'1px solid #f0f0f0' }}>
                                    {/* Image cell — click thumb (or blank box) to upload */}
                                    <td style={Object.assign({}, tdSty, { padding:4 })}>
                                      <input type="file" accept="image/png,image/jpeg" id={inputId} style={{ display:'none' }}
                                             onChange={function(e){
                                               var f = e.target.files && e.target.files[0];
                                               if (f) uploadItemImage(familyKey, idx, f);
                                               e.target.value = '';
                                             }}/>
                                      <label htmlFor={inputId} title={it.image ? 'Click to replace image' : 'Click to upload PNG/JPEG'}
                                             style={{ display:'block', width:48, height:48, background:'#f4f4f4', border:'1px solid '+T.border, borderRadius:3, cursor:'pointer', overflow:'hidden', position:'relative' }}>
                                        {it.image ? (
                                          <img src={it.image} alt={it.colour || 'item'} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                                        ) : (
                                          <span style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, color:'#9aa' }}>＋</span>
                                        )}
                                      </label>
                                      {it.image && (
                                        <div style={{ marginTop:2, textAlign:'center' }}>
                                          <button onClick={function(){ if (confirm('Remove this image?')) updItem(familyKey, idx, 'image', null); }}
                                                  style={{ background:'transparent', border:'none', color:'#dc2626', fontSize:9, cursor:'pointer', padding:0 }}>
                                            remove
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td style={tdSty}>
                                      <input type="text" value={it.colour || ''}
                                             onChange={function(e){ updItem(familyKey, idx, 'colour', e.target.value); }}
                                             style={Object.assign({}, inpSty, { fontWeight:600 })}/>
                                    </td>
                                    <td style={tdSty}>
                                      <select value={it.colourFamily || 'plain'}
                                              onChange={function(e){ updItem(familyKey, idx, 'colourFamily', e.target.value); }}
                                              style={Object.assign({}, inpSty, { fontSize:11 })}>
                                        <option value="plain">Plain</option>
                                        <option value="turner_oak">Turner Oak</option>
                                        <option value="aludec">Aludec</option>
                                        <option value="other">Other</option>
                                      </select>
                                    </td>
                                    <td style={tdSty}>
                                      <input type="text" value={it.sku || ''}
                                             onChange={function(e){ updItem(familyKey, idx, 'sku', e.target.value); }}
                                             style={Object.assign({}, inpSty, { fontFamily:'monospace', fontSize:10 })}/>
                                    </td>
                                    <td style={tdSty}>
                                      <input type="text" value={it.code || ''}
                                             onChange={function(e){ updItem(familyKey, idx, 'code', e.target.value); }}
                                             style={Object.assign({}, inpSty, { fontFamily:'monospace', fontSize:10 })}/>
                                    </td>
                                    <td style={tdRight}>
                                      <input type="number" value={it.lengthMm || 0}
                                             onChange={function(e){ updItem(familyKey, idx, 'lengthMm', +e.target.value); }}
                                             style={Object.assign({}, inpSty, { width:74, textAlign:'right', fontFamily:'monospace' })}/>
                                    </td>
                                    <td style={tdRight}>
                                      <input type="number" step="0.01" value={typeof it.priceExBar === 'number' ? it.priceExBar : 0}
                                             onChange={function(e){ updItem(familyKey, idx, 'priceExBar', +e.target.value); }}
                                             style={Object.assign({}, inpSty, { width:80, textAlign:'right' })}/>
                                    </td>
                                    <td style={Object.assign({}, tdRight, { color:T.textMuted, fontSize:11, fontFamily:'monospace' })}>
                                      ${typeof it.priceExPerMeter === 'number' ? it.priceExPerMeter.toFixed(3) : '—'}
                                    </td>
                                    <td style={tdRight}>
                                      <input type="number" value={it.stockQty == null ? '' : it.stockQty}
                                             placeholder="—"
                                             onChange={function(e){
                                               var v = e.target.value === '' ? null : +e.target.value;
                                               updItem(familyKey, idx, 'stockQty', v);
                                             }}
                                             style={Object.assign({}, inpSty, { width:60, textAlign:'right' })}/>
                                    </td>
                                    <td style={tdSty}>
                                      <select value={it.availability || 'available'}
                                              onChange={function(e){ updItem(familyKey, idx, 'availability', e.target.value); }}
                                              title="discontinued = hidden from survey-mode dropdown; coming_soon = shown with [coming soon] flag"
                                              style={Object.assign({}, inpSty, { fontSize:10 })}>
                                        <option value="available">Available</option>
                                        <option value="coming_soon">Coming soon</option>
                                        <option value="discontinued">Discontinued</option>
                                      </select>
                                    </td>
                                    {isReveal && (
                                      <td style={tdRight}>
                                        <input type="number" value={it.widthMm == null ? '' : it.widthMm}
                                               placeholder={(cat.crossSection && cat.crossSection.widthMm) || '—'}
                                               title="Per-SKU rip width override. Blank = uses family width. The auto-pick logic in survey mode reads this when present."
                                               onChange={function(e){
                                                 var v = e.target.value === '' ? null : +e.target.value;
                                                 updItem(familyKey, idx, 'widthMm', v);
                                               }}
                                               style={Object.assign({}, inpSty, { width:60, textAlign:'right', fontFamily:'monospace' })}/>
                                      </td>
                                    )}
                                    <td style={Object.assign({}, tdSty, { textAlign:'center', padding:4 })}>
                                      <button onClick={function(){ deleteItem(familyKey, idx); }}
                                              title="Delete this row"
                                              style={{ background:'transparent', border:'1px solid '+T.borderLight, color:'#dc2626', borderRadius:3, padding:'2px 6px', fontSize:11, cursor:'pointer' }}>
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {/* Add-row footer */}
                              <tr>
                                <td colSpan={isReveal ? 12 : 11} style={{ padding:8, background:'#fafafa' }}>
                                  <button onClick={function(){ addItem(familyKey); }}
                                          style={{ padding:'5px 12px', fontSize:11, fontWeight:600, background:T.bgInput, border:'1px dashed '+T.border, color:T.accent, borderRadius:4, cursor:'pointer' }}>
                                    ＋ Add row
                                  </button>
                                  <span style={{ fontSize:10, color:T.textMuted, marginLeft:10 }}>
                                    {items.length === 0 ? 'No SKUs yet — add the first row to start.' : 'Adds a blank row pre-filled with the previous row\'s bar length and colour family.'}
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>;
                  })}

                  <div style={{ marginTop:8, fontSize:10, color:T.textMuted, lineHeight:1.6 }}>
                    <div>Per-meter price recalculates automatically when you edit Price ex GST or Bar length. Use "Recalc per-m" to force a refresh across all rows in a family.</div>
                    <div>Survey-mode dropdowns read directly from these catalogs — your edits, additions, and deletions appear immediately. Items marked <i>discontinued</i> are hidden; <i>coming soon</i> items are flagged.</div>
                    {settingsPath === 'catalog-reveals' && (
                      <div style={{ marginTop:6, padding:'6px 10px', background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:4, color:'#9a3412' }}>
                        <b>Reveals:</b> the In-Line / Stepped / No-Reveal logic in survey mode reads from <code>cat.crossSection.widthMm</code> per family (or the per-row <i>Rip W</i> override if set) plus Window Depth and Frame Depth. Auto-pick selects the smallest SKU wider than the calculated rip width.
                      </div>
                    )}
                  </div>
                </div>;
              }

              if (settingsPath === 'crm-connection') {
                // Pull current stored credentials into local state for editing.
                var curUrl  = (typeof localStorage !== 'undefined' && localStorage.getItem('spartan_supabase_url')) || '';
                var curKey  = (typeof localStorage !== 'undefined' && localStorage.getItem('spartan_supabase_anon_key')) || '';
                var curCrmOrigin = (typeof localStorage !== 'undefined' && localStorage.getItem('spartan_crm_origin')) || 'https://spaartan.tech';
                var curCadUrl = (typeof localStorage !== 'undefined' && localStorage.getItem('spartan_cad_url')) || 'https://cad.spaartan.tech';
                var isConfigured = sbConfigured();
                // Are we currently using the hardcoded defaults, or an override?
                var usingDefaults = !curUrl && !curKey;
                var effectiveUrl = curUrl || SPARTAN_DEFAULT_SUPABASE_URL || '';
                var effectiveKeyPreview = curKey
                  ? (curKey.slice(0, 12) + '…' + curKey.slice(-8))
                  : (SPARTAN_DEFAULT_SUPABASE_ANON_KEY
                      ? (SPARTAN_DEFAULT_SUPABASE_ANON_KEY.slice(0, 12) + '…' + SPARTAN_DEFAULT_SUPABASE_ANON_KEY.slice(-8))
                      : '');
                var linkStatus = crmLink
                  ? (crmLink.configurationMissing ? '⚠ Linked via URL, but Supabase not configured'
                    : crmLink.notFound ? '⚠ URL references unknown entity'
                    : crmLink.error ? '⚠ ' + crmLink.error
                    : '✓ Linked to ' + crmLink.type + ' ' + crmLink.id + ' (mode: ' + (crmLink.mode||'design') + ')')
                  : '(running standalone — not opened from CRM)';
                return <div style={{ padding:24, overflowY:'auto', maxHeight:'100%', maxWidth:720 }}>
                  <div style={{ fontSize:16, fontWeight:700, color:T.text, marginBottom:4 }}>CRM Connection</div>
                  <div style={{ fontSize:11, color:T.textMuted, marginBottom:20 }}>
                    Links Spartan CAD to Spartan CRM via shared Supabase. When configured, opening CAD from
                    the CRM preloads customer context, auto-saves designs to Supabase, and triggers CRM
                    realtime updates. See SPARTANCAD_CRM_INTEGRATION.md §1.3.
                  </div>

                  <div style={{ marginBottom:20, padding:12, background: isConfigured ? '#dcfce7' : '#fef3c7', border:'1px solid '+(isConfigured ? '#86efac' : '#fcd34d'), borderRadius:6, fontSize:12 }}>
                    <div style={{ fontWeight:600, marginBottom:4, color: isConfigured ? '#14532d' : '#78350f' }}>
                      Status: {isConfigured ? '✓ Connected to Supabase' : '⚠ Not configured'}
                    </div>
                    <div style={{ color: isConfigured ? '#166534' : '#92400e' }}>{linkStatus}</div>
                    {isConfigured && <div style={{ color: '#166534', marginTop:4, fontFamily:'monospace', fontSize:10 }}>
                      {effectiveUrl} · key {effectiveKeyPreview}
                      {usingDefaults
                        ? <span style={{ marginLeft:6, padding:'1px 6px', background:'#bbf7d0', borderRadius:3, fontSize:9 }}>BUILT-IN DEFAULT</span>
                        : <span style={{ marginLeft:6, padding:'1px 6px', background:'#fed7aa', borderRadius:3, fontSize:9, color:'#9a3412' }}>OVERRIDE (localStorage)</span>
                      }
                    </div>}
                    {pendingWrites > 0 && <div style={{ marginTop:6, color:'#92400e', fontSize:11 }}>
                      {pendingWrites} write(s) queued locally — will flush on next successful save.
                    </div>}
                  </div>

                  <div style={{ padding:10, background:'#eef2ff', border:'1px solid #c7d2fe', borderRadius:5, fontSize:11, color:'#3730a3', marginBottom:18 }}>
                    <strong>Production credentials are built in.</strong> CAD ships with the Spartan production
                    Supabase pre-configured, so it syncs to the CRM immediately on first launch — no setup needed.
                    Only use the fields below to point CAD at a different Supabase instance (e.g. staging,
                    development). Leave them blank to use the built-in production default.
                  </div>

                  <div style={{ marginBottom:18 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:4 }}>Supabase project URL <span style={{ fontWeight:400, color:T.textMuted, fontSize:11 }}>(override)</span></div>
                    <div style={{ fontSize:11, color:T.textMuted, marginBottom:6 }}>Leave blank to use built-in default (<code style={{ fontSize:10 }}>{SPARTAN_DEFAULT_SUPABASE_URL}</code>).</div>
                    <input type="url" defaultValue={curUrl} id="sbUrlInput" placeholder={SPARTAN_DEFAULT_SUPABASE_URL}
                      style={{ width:'100%', padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                  </div>

                  <div style={{ marginBottom:18 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:4 }}>Supabase publishable / anon key <span style={{ fontWeight:400, color:T.textMuted, fontSize:11 }}>(override)</span></div>
                    <div style={{ fontSize:11, color:T.textMuted, marginBottom:6 }}>Safe to expose (RLS enforces access). Leave blank to use built-in default.</div>
                    <textarea defaultValue={curKey} id="sbKeyInput" placeholder={'(using built-in default ' + effectiveKeyPreview + ')'}
                      style={{ width:'100%', padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:11, fontFamily:'monospace', background:T.bgInput, color:T.text, minHeight:64, resize:'vertical' }}/>
                  </div>

                  <div style={{ marginBottom:18 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:4 }}>CRM origin (for postMessage)</div>
                    <div style={{ fontSize:11, color:T.textMuted, marginBottom:6 }}>When CAD is opened from a CRM window, "design saved" notifications are posted to this origin. Default: <code>https://spaartan.tech</code></div>
                    <input type="url" defaultValue={curCrmOrigin} id="crmOriginInput"
                      style={{ width:'100%', padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                  </div>

                  <div style={{ marginBottom:22 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:4 }}>CAD deployment URL</div>
                    <div style={{ fontSize:11, color:T.textMuted, marginBottom:6 }}>The URL that the CRM's "Open Spartan CAD" button should open. This is stored in localStorage so it can be changed per environment (prod / staging). Default: <code>https://cad.spaartan.tech</code></div>
                    <input type="url" defaultValue={curCadUrl} id="cadUrlInput"
                      style={{ width:'100%', padding:'8px 10px', border:'1px solid '+T.border, borderRadius:4, fontSize:12, fontFamily:'monospace', background:T.bgInput, color:T.text }}/>
                  </div>

                  <div style={{ display:'flex', gap:10, marginBottom:18 }}>
                    <button onClick={function(){
                      var u = document.getElementById('sbUrlInput').value.trim();
                      var k = document.getElementById('sbKeyInput').value.trim();
                      var o = document.getElementById('crmOriginInput').value.trim();
                      var c = document.getElementById('cadUrlInput').value.trim();
                      try {
                        if (u) localStorage.setItem('spartan_supabase_url', u); else localStorage.removeItem('spartan_supabase_url');
                        if (k) localStorage.setItem('spartan_supabase_anon_key', k); else localStorage.removeItem('spartan_supabase_anon_key');
                        if (o) localStorage.setItem('spartan_crm_origin', o); else localStorage.removeItem('spartan_crm_origin');
                        if (c) localStorage.setItem('spartan_cad_url', c); else localStorage.removeItem('spartan_cad_url');
                        sbReset();
                        setCrmConfigured(sbConfigured());
                        alert('CRM connection saved. Reload the page to apply the new Supabase credentials.');
                      } catch (e) { alert('Save failed: ' + e.message); }
                    }} style={{ padding:'8px 16px', background:'#c41230', border:'none', borderRadius:4, color:'white', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      Save credentials
                    </button>
                    <button onClick={async function(){
                      var u = document.getElementById('sbUrlInput').value.trim();
                      var k = document.getElementById('sbKeyInput').value.trim();
                      if (!u || !k) { alert('Please fill in URL and anon key first.'); return; }
                      if (typeof supabase === 'undefined' || !supabase.createClient) {
                        alert('Supabase SDK not loaded — check network.'); return;
                      }
                      try {
                        var client = supabase.createClient(u, k);
                        var { data, error } = await client.from('designs').select('id').limit(1);
                        if (error) throw error;
                        alert('✓ Connection OK. Found ' + (data ? data.length : 0) + ' design row(s) in your Supabase.');
                      } catch (e) {
                        alert('✗ Connection failed: ' + (e && e.message || e));
                      }
                    }} style={{ padding:'8px 16px', background:'white', border:'1px solid '+T.border, borderRadius:4, color:T.text, fontSize:12, fontWeight:500, cursor:'pointer' }}>
                      Test connection
                    </button>
                    {pendingWrites > 0 && <button onClick={async function(){
                      var r = await flushPendingWrites();
                      setPendingWrites(pendingCount());
                      alert('Flushed ' + r.flushed + ' queued write(s). ' + r.failed + ' still pending.');
                    }} style={{ padding:'8px 16px', background:'white', border:'1px solid '+T.border, borderRadius:4, color:T.text, fontSize:12, fontWeight:500, cursor:'pointer' }}>
                      Flush queue ({pendingWrites})
                    </button>}
                  </div>

                  <details style={{ marginTop:24, background:T.bgPanel, border:'1px solid '+T.border, borderRadius:6, padding:12 }}>
                    <summary style={{ fontWeight:600, fontSize:12, color:T.text, cursor:'pointer' }}>How to set this up on the CRM side</summary>
                    <div style={{ fontSize:11, color:T.textMuted, marginTop:10, lineHeight:1.6 }}>
                      <p style={{ marginBottom:8 }}><b>1. Run the migrations in Supabase.</b> From the spec §2.1, apply the CREATE TABLE statements for <code>designs</code>, <code>design_items</code>, <code>check_measures</code>, <code>design_signatures</code>, <code>cad_pricing_rates</code> plus the ALTER TABLE additions for <code>leads</code>, <code>deals</code>, <code>jobs</code>. Create the storage buckets <code>cad-designs</code>, <code>cad-signatures</code>, <code>check-measure-photos</code>.</p>
                      <p style={{ marginBottom:8 }}><b>2. Add CAD domain to Supabase allowed origins.</b> Project settings → Authentication → URL Configuration → add <code>{curCadUrl}</code>.</p>
                      <p style={{ marginBottom:8 }}><b>3. Update CRM <code>openCadDesigner</code>.</b> Per §3.1, change the CRM's "Open Spartan CAD" button to build the URL with <code>?type=X&id=Y&mode=Z&return=W</code> params and <code>window.open(...)</code>.</p>
                      <p style={{ marginBottom:8 }}><b>4. Add CRM message listener.</b> Per §3.2, add <code>window.addEventListener('message', ...)</code> to catch <code>source: 'spartancad'</code> events for stage transitions and toasts.</p>
                      <p style={{ marginBottom:8 }}><b>5. Add CRM realtime subscriptions.</b> Per §3.3, subscribe to <code>designs</code>, <code>design_items</code>, <code>design_signatures</code>, <code>check_measures</code>.</p>
                      <p style={{ marginBottom:0 }}>The current session of CAD handles the writes, offline queueing, postMessage, and URL handoff on our side — the above is the matching CRM-side work.</p>
                    </div>
                  </details>
                </div>;
              }

              return <div style={{ padding:40, textAlign:'center', color:T.textMuted }}>Select a section</div>;
            })()}
          </div>
        </div>
      </div>}
    </div>
  );
}

