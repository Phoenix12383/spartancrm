// ═══════════════════════════════════════════════════════════════════════════
// CHECK MEASURE (REPLACEMENT) GENERATOR
// Fillable surveyor's form — matches Spartan's production Check Measure PDF.
// Width/Height/etc are real <input> elements; Top/Left/Right/Bottom trim
// fields are <select> dropdowns populated from TRIM_DICTIONARY below.
// User fills in the browser, prints or downloads the result.
// ═══════════════════════════════════════════════════════════════════════════

const TRIM_DICTIONARY = [
  // WIP30: defaultCatalogFamily on a dictionary entry tells computeTrimCuts
  // which catalog to use for bar-length lookup when the surveyor picks a
  // generic dictionary code instead of a specific catalog SKU. The cuts will
  // still aggregate under the dictionary code (e.g. '30 T'), but FFD can
  // pack against the catalog's bar length (using the first available item
  // as the reference). When the surveyor later picks a specific SKU, the
  // cuts move to that SKU's bucket. This keeps the dictionary useful as a
  // "I don't care about colour yet, just spec the profile" shortcut.
  { group: 'PVC Trims (Standard finishing)', options: [
    { code: '30 T',     label: '30mm x 7mm Flat Trim',                          defaultCatalogFamily: 'coverMouldings' },
    { code: '50 T',     label: '50mm x 7mm Flat Trim',                          defaultCatalogFamily: 'coverMouldings50' },
    { code: '180 T',    label: '180mm x 80mm x 6mm Trim',                       defaultCatalogFamily: 'angleTrims180' },
    { code: '20x20 T',  label: '20mm x 20mm x 3mm Angle (90°)',                 defaultCatalogFamily: 'angleTrims20' },
  ]},
  { group: 'PVC Flanges (+window depth required)', options: [
    { code: '30 FL',    label: '30mm x 8mm Flange (+10–12mm depth)',            defaultCatalogFamily: 'flange30' },
    { code: '50 FL',    label: '50mm x 12mm Flange (+14–16mm depth)',           defaultCatalogFamily: 'flange50' },
  ]},
  { group: 'Primed Timber — Single Bevel (SB)', options: [
    { code: '92x18 SB', label: '92mm x 18mm Single Bevel',                      defaultCatalogFamily: 'architraves92SB' },
    { code: '66x18 SB', label: '66mm x 18mm Single Bevel',                      defaultCatalogFamily: 'architraves66SB' },
    { code: '44x18 SB', label: '44mm x 18mm Single Bevel',                      defaultCatalogFamily: 'architraves44SB' },
  ]},
  { group: 'Primed Timber — Lambs Tongue (LT)', options: [
    { code: '92x18 LT', label: '92mm x 18mm Lambs Tongue',                      defaultCatalogFamily: 'architraves92LT' },
    { code: '66x18 LT', label: '66mm x 18mm Lambs Tongue',                      defaultCatalogFamily: 'architraves66LT' },
  ]},
  { group: 'Primed Timber — Bullnose (BN)', options: [
    { code: '92x18 BN', label: '92mm x 18mm Bullnose',                          defaultCatalogFamily: 'architraves92BN' },
    { code: '66x18 BN', label: '66mm x 18mm Bullnose',                          defaultCatalogFamily: 'architraves66BN' },
  ]},
  { group: 'Primed Timber — Colonial (COL)', options: [
    { code: '92x18 COL', label: '92mm x 18mm Colonial' },
    { code: '66x18 COL', label: '66mm x 18mm Colonial',                         defaultCatalogFamily: 'architraves66COL' },
    { code: '44x18 COL', label: '44mm x 18mm Colonial' },
  ]},
  { group: 'Hardwood (Tas Oak DAR)', options: [
    { code: '110x19 HW', label: '110mm x 19mm Hardwood DAR',                     defaultCatalogFamily: 'hardwood110' },
    { code: '90x19 HW', label: '90mm x 19mm Hardwood DAR',                       defaultCatalogFamily: 'hardwood90' },
    { code: '65x19 HW', label: '65mm x 19mm Hardwood DAR',                       defaultCatalogFamily: 'hardwood65' },
    { code: '42x19 HW', label: '42mm x 19mm Hardwood DAR',                       defaultCatalogFamily: 'hardwood42' },
    { code: '30x12 HW', label: '30mm x 12mm Hardwood Cover Strip' },
  ]},
  { group: 'Quads (Beading)', options: [
    { code: '12 Q',     label: '12mm x 12mm Primed Quad (Pine)',                  defaultCatalogFamily: 'quads12' },
    { code: '18 Q',     label: '18mm x 18mm Primed Quad (Pine)',                  defaultCatalogFamily: 'quads18' },
    { code: '18 TQ',    label: '18mm x 18mm Pine Tri Quad (triangular)',          defaultCatalogFamily: 'quads18Tri' },
    { code: '12 Q HW',  label: '12mm x 12mm Hardwood Quad' },
    { code: '19 Q HW',  label: '19mm x 19mm Hardwood Quad' },
  ]},
  { group: 'Special', options: [
    { code: 'SA',       label: 'Special Architrave (photo + dims to Ascora)' },
  ]},
];

function buildTrimOptionsHtml() {
  var html = '<option value="">— Select trim —</option>';
  TRIM_DICTIONARY.forEach(function(grp) {
    html += '<optgroup label="' + _esc(grp.group) + '">';
    grp.options.forEach(function(opt) {
      html += '<option value="' + _esc(opt.code) + '">' + _esc(opt.code) + ' : ' + _esc(opt.label) + '</option>';
    });
    html += '</optgroup>';
  });
  return html;
}

// ─── WIP29: React-side trim option builder ──────────────────────────────────
// Returns an array of <optgroup>/<option> React elements suitable for inlining
// into a <select>{buildTrimOptionEls()}</select>. Mirrors buildTrimOptionsHtml
// but for JSX use. Kept identical groupings/codes so the printed template and
// the in-app survey form share one canonical vocabulary (per WIP29 plan §5).
// WIP30 (revised): unified trim dropdown — TRIM_DICTIONARY codes (legacy/general
// vocabulary) + every catalog family in pricingConfig.trims (specific SKUs with
// colour). Catalog item ids are GUARANTEED disjoint from dictionary codes
// (catalog ids look like '12x286_aludec_jetblack_5850'; dictionary codes look
// like '30 T'), so a single string field on the measurement state can hold
// either kind of value. No prices in labels — Phoenix's instruction.
//
// catalogs: pricingConfig.trims (a map of family→catalog) or null. When null,
// only the legacy TRIM_DICTIONARY appears.
function buildTrimOptionEls(catalogs) {
  var els = [React.createElement('option', { key:'_blank', value:'' }, '— Select trim —')];
  // Legacy dictionary first — broad vocabulary, surveyors used to picking from these.
  TRIM_DICTIONARY.forEach(function(grp, gi) {
    var opts = grp.options.map(function(opt) {
      return React.createElement('option', { key: opt.code, value: opt.code }, opt.code + ' : ' + opt.label);
    });
    els.push(React.createElement('optgroup', { key:'g'+gi, label: grp.group }, opts));
  });
  // Catalog SKUs (specific orderable products with colour). One optgroup per
  // (family × colourFamily) combination — e.g. "Cover Mouldings — Aludec".
  // 'discontinued' items filtered. 'coming_soon' marked with a [coming soon]
  // suffix (HTML <option> doesn't support italic styling reliably).
  if (catalogs && typeof catalogs === 'object') {
    var familyKeys = Object.keys(catalogs);
    var humanFamilyLabel = function(famKey, cat) {
      // Examples: 'coverMouldings' → 'Cover Mouldings'.
      if (cat && cat.description) return cat.description;
      return famKey.replace(/([A-Z])/g, ' $1').replace(/^./, function(c){return c.toUpperCase();}).trim();
    };
    var humanColourFamily = { plain: 'Plain', turner_oak: 'Turner Oak', aludec: 'Aludec' };
    familyKeys.forEach(function(famKey, fIdx) {
      var cat = catalogs[famKey];
      if (!cat || !cat.items || !cat.items.length) return;
      var famLabel = humanFamilyLabel(famKey, cat);
      // Bucket by colourFamily within the catalog, preserving insertion order.
      var subOrder = [];
      var bySub = {};
      cat.items.forEach(function(it) {
        if (it.availability === 'discontinued') return;
        var sub = it.colourFamily || 'other';
        if (!bySub[sub]) { bySub[sub] = []; subOrder.push(sub); }
        bySub[sub].push(it);
      });
      subOrder.forEach(function(sub, sIdx) {
        var opts = bySub[sub].map(function(it) {
          var soon = it.availability === 'coming_soon';
          var promo = it.promo;
          var flags = (soon ? ' [coming soon]' : '') + (promo ? ' (promo)' : '');
          // No price — per Phoenix's instruction. Just colour name + flags.
          var lbl = it.colour + flags;
          return React.createElement('option', { key: it.id, value: it.id }, lbl);
        });
        var label = famLabel + ' — ' + (humanColourFamily[sub] || sub);
        els.push(React.createElement('optgroup', { key:'cat-'+fIdx+'-'+sIdx, label: label }, opts));
      });
    });
  }
  return els;
}

// ─── WIP29: blank-state factories ───────────────────────────────────────────
// makeBlankFrameMeasurement is the default shape of a per-frame entry in
// measurementsByFrameId. Existing M4a/M4b fields (measuredWidthMm,
// measuredHeightMm, siteNotes, photos) are preserved verbatim so the
// pre-WIP29 hydration/save paths remain compatible. New fields are
// initialised to '' (string, falsy) so React inputs treat them as
// uncontrolled→controlled-ready and emission can null-coerce them.
//
// Trim values are stored as 8 flat keys (trimInternalTop/.../trimExternalBottom)
// to keep React updates simple (single-key spread). The wire shape collapses
// these into nested { trimInternal, trimExternal } objects on save — see
// onRequestSave's surveyMeasurements builder.
function makeBlankFrameMeasurement(frame) {
  // When a frame is supplied, pre-populate handleHeightOffsetMm from the
  // design-time handleHeightMm so the surveyor sees what the salesperson
  // intended. The surveyor can override on-site; the override flows through
  // to the milling computation. Format: '+100', '-100', or '' for default.
  var hhSeed = '';
  if (frame && typeof frame.handleHeightMm === 'number' && frame.handleHeightMm !== 0) {
    hhSeed = (frame.handleHeightMm > 0 ? '+' : '') + String(frame.handleHeightMm);
  }
  return {
    // existing M4a/M4b
    measuredWidthMm: null,
    measuredHeightMm: null,
    siteNotes: '',
    photos: [],
    // WIP29 — per-frame CM fields
    handleColourInternal: '',     // 'black' | 'white' | 'silver' | ''
    handleColourExternal: '',
    handleHeightOffsetMm: hhSeed, // text — supports +/- prefix; emitted as number. Pre-filled from frame.handleHeightMm when supplied.
    windowDepthMm: '',            // text — emitted as number
    revealType: '',               // 'inline' | 'stepped' | 'noreveal' | ''
    trimInternalTop: '',
    trimInternalLeft: '',
    trimInternalRight: '',
    trimInternalBottom: '',
    trimExternalTop: '',
    trimExternalLeft: '',
    trimExternalRight: '',
    trimExternalBottom: '',
    // WIP30 — "all sides same" toggles per surface. When true, the four
    // side dropdowns are kept in sync (any change to any side propagates
    // to all four). UI convenience; persisted so the toggle state survives
    // save/reload.
    trimInternalAllSame: false,
    trimExternalAllSame: false,
    designChange: '',             // 'yes' | 'no' | '' (state) → bool|null on wire
    frostedGlass: '',
    tasOakThreshold: '',
  };
}

// makeBlankSiteChecklist is the default shape of the project-level site
// checklist (one per save, not per frame). Mirrors the 7 sections of the
// printed Check Measure template's site pages (generateCheckMeasureHTML,
// pages "siteP1" + "siteP2"). Field names use camelCase; checkboxes are
// booleans, radio groups are strings ('' = unset), text fields are strings.
function makeBlankSiteChecklist() {
  return {
    // §1 Access & Logistics
    ascoraUploaded: '',           // 'yes' | 'no' | ''
    parking2Vans: false,
    truck32m: false,
    cornerCheck: false,
    stairsInvolved: '',           // 'no' | 'yes' | ''
    accessStraightforward: '',    // 'yes' | 'no' | ''
    accessNotes: '',
    // §2 Existing Conditions
    frameMaterialAluminium: false,
    frameMaterialTimber: false,
    frameMaterialSteel: false,
    wallBrickVeneer: false,
    wallDoubleBrick: false,
    wallWeatherboard: false,
    wallRenderedBrick: false,
    structuralAlteration: '',     // 'direct' | 'enlargement' | ''
    structuralNotes: '',
    sillChecked: false,
    lintelChecked: false,
    // §3 Measurements
    tolerance20mm: false,
    squarenessChecked: false,
    frameLiftRequired: '',        // 'no' | 'yes' | ''
    frameLiftMm: '',
    // §4 Interiors
    blindsFitBack: '',            // 'yes' | 'no' | ''
    kitchenTapsClash: false,
    alarmSensorsPresent: false,
    // §5 Preparation
    photosTaken: false,
    wasteVanLoad: false,
    wasteSkipBin: false,
    skipBinSpace: '',             // 'yes' | 'no' | ''
    // §6 Resourcing
    heavyLifting: '',             // 'standard' | 'heavy' | ''
    estDays: '',
    staffRequired: '',
    // §7 Notes
    notes: '',
  };
}

function generateCheckMeasureHTML(ctx) {
  var items = ctx.items || [];
  var s = ctx.appSettings;
  var co = s.company || {};
  var projectName = ctx.projectName || 'Project';
  var logoSrc = ctx.logoSrc || '';

  var today = new Date();
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateStr = today.getDate() + ' ' + months[today.getMonth()] + ' ' + today.getFullYear();

  // Dictionary split into two pages for readability (matches original PDF)
  var dictHalf1 = TRIM_DICTIONARY.slice(0, 3); // PVC Trims, PVC Flanges, Primed Timber SB
  var dictHalf2 = TRIM_DICTIONARY.slice(3);    // LT, BN, COL, HW, Q, SA

  // Total pages: 2 dictionary + N frames + 2 site checklist
  var totalPages = 2 + items.length + 2;
  var trimOpts = buildTrimOptionsHtml();

  function pageHeader(pageN, title) {
    var logoHtml = logoSrc ? '<img src="'+_esc(logoSrc)+'" style="height:78px;width:auto;" alt="Spartan"/>' : '<div style="width:90px;height:78px;"></div>';
    return '<div class="page-header">'
      + '<div class="logo-col">'+logoHtml+'</div>'
      + '<div class="header-meta">'
      +   '<div style="font-size:20px;font-weight:700;">'+_esc(title || 'Check Measure (Replacement)')+'</div>'
      +   '<table style="font-size:10px;margin-top:4px;border-collapse:collapse;margin-left:auto;">'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Date</td><td style="padding:1px 0;font-weight:700;">'+_esc(dateStr)+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Page</td><td style="padding:1px 0;font-weight:700;">'+pageN+' of '+totalPages+'</td></tr>'
      +     '<tr><td style="padding:1px 8px 1px 0;color:#555;text-align:right;">Items</td><td style="padding:1px 0;font-weight:700;">'+items.length+'</td></tr>'
      +   '</table>'
      +   '<div class="project-pill">'+_esc(projectName)+'</div>'
      + '</div>'
      + '</div>'
      + '<div class="company-strip">'
      +   '<div>'+_esc(co.address1 || '')+(co.address2?' / '+_esc(co.address2):'')+(co.address3?' / '+_esc(co.address3):'')+'</div>'
      +   '<div>'+_esc(co.phone || '')+'</div>'
      +   '<div>'+_esc(co.email || '')+'</div>'
      +   '<div>'+_esc(co.website || '')+'</div>'
      +   '<div style="color:#555;margin-top:4px;">'+_esc(co.abnVic || co.abn || '')+' (VIC Branch) / '+_esc(co.abnAct || '')+' (ACT Branch) / '+_esc(co.abnSa || '')+' (SA Branch)</div>'
      + '</div>';
  }

  function renderDictionarySection(section) {
    var html = '<div style="margin:8px 0 4px 0;font-weight:700;font-size:11px;">' + _esc(section.group) + '</div>';
    section.options.forEach(function(opt) {
      html += '<div style="margin:3px 0;font-size:10px;"><span style="display:inline-block;min-width:90px;font-weight:700;font-family:monospace;">' + _esc(opt.code) + '</span> : ' + _esc(opt.label) + '</div>';
    });
    return html;
  }

  var pages = [];

  // ─── PAGE 1: Ascora upload + Dictionary (part 1) ───
  var p1 = pageHeader(1) + '<div class="page-body">'
    + '<div style="margin:16px 0 10px 0;font-size:11px;font-weight:700;">I HAVE MANUALLY UPLOADED THIS CHECK MEASURE INTO ASCORA ON THE DAY OF MEASURE.</div>'
    + '<div style="margin:8px 0 18px 0;font-size:11px;">'
    +   '<label style="margin-right:24px;"><input type="radio" name="ascoraUpload" value="yes"/> YES</label>'
    +   '<label><input type="radio" name="ascoraUpload" value="no"/> NO</label>'
    + '</div>'
    + '<div style="margin-top:14px;font-weight:700;font-size:13px;">SURVEYOR TRIM &amp; ARCHITRAVE DICTIONARY</div>'
    + '<div style="margin:4px 0 14px 0;font-size:10px;color:#555;">Instructions: Use the <b>CODE</b> when recording measurements to ensure the correct material is ordered.</div>'
    + dictHalf1.map(renderDictionarySection).join('')
    + '</div>';
  pages.push(p1);

  // ─── PAGE 2: Dictionary (part 2) ───
  var p2 = pageHeader(2) + '<div class="page-body">'
    + '<div style="margin-top:14px;">'
    + dictHalf2.map(renderDictionarySection).join('')
    + '</div></div>';
  pages.push(p2);

  // ─── FRAME PAGES: one fillable form per frame ───
  items.forEach(function(f, i) {
    var pageN = 3 + i;
    var prodMeta = PRODUCTS.find(function(p){return p.id===f.productType;});
    var prodLabel = prodMeta ? prodMeta.label : f.productType;
    var colourMeta = COLOURS.find(function(c){return c.id===f.colour;});
    var colourLabel = colourMeta ? colourMeta.label : (f.colour || 'White');
    var colourIntMeta = COLOURS.find(function(c){return c.id===(f.colourInt || f.colour);});
    var colourIntLabel = colourIntMeta ? colourIntMeta.label : colourLabel;
    var glassMeta = GLASS_OPTIONS.find(function(g){return g.id===f.glassSpec;});
    var glassLabel = glassMeta ? glassMeta.label : (f.glassSpec || '4/12/4');
    var glassDesc = glassMeta ? glassMeta.desc : '';
    var badges = hardwareBadges(f);
    var hardwareCol = f.hardwareColour === 'black' ? 'Black' : f.hardwareColour === 'silver' ? 'Silver' : 'White';
    var fid = 'f'+i; // prefix for input names so each frame's fields are unique

    // Left column — fillable measurement form
    var leftCol = ''
      + '<div style="font-weight:700;font-size:13px;margin-bottom:10px;">Frame '+(i+1)+'</div>'
      + '<table class="cm-table">'
      +   '<tr><td class="cm-lbl">Width</td><td class="cm-val">:&nbsp;<input type="text" name="'+fid+'_w" class="cm-in" placeholder="mm"/></td></tr>'
      +   '<tr><td class="cm-lbl">Height</td><td class="cm-val">:&nbsp;<input type="text" name="'+fid+'_h" class="cm-in" placeholder="mm"/></td></tr>'
      +   '<tr><td class="cm-lbl">Handle Colour</td><td class="cm-val">Internal:&nbsp;<input type="text" name="'+fid+'_hci" class="cm-in cm-in-sm"/> / External:&nbsp;<input type="text" name="'+fid+'_hce" class="cm-in cm-in-sm"/></td></tr>'
      +   '<tr><td class="cm-lbl">Handle Height<br/><span style="font-weight:400;font-size:9px;color:#666;">Tilt &amp; Turn / Sliding Only<br/>(e.g. -100 for lower / +100 for higher)</span></td><td class="cm-val"><input type="text" name="'+fid+'_hh" class="cm-in"/></td></tr>'
      +   '<tr><td class="cm-lbl">Window Depth</td><td class="cm-val"><input type="text" name="'+fid+'_wd" class="cm-in"/></td></tr>'
      +   '<tr><td class="cm-lbl">Reveal Type</td><td class="cm-val">'
      +     '<label style="margin-right:12px;"><input type="radio" name="'+fid+'_rv" value="inline"/> In-Line</label>'
      +     '<label style="margin-right:12px;"><input type="radio" name="'+fid+'_rv" value="stepped"/> Stepped</label>'
      +     '<label><input type="radio" name="'+fid+'_rv" value="noreveal"/> No Reveal</label>'
      +   '</td></tr>'
      +   '<tr><td class="cm-lbl" style="padding-top:10px;">Internal<br/><span style="font-size:9px;color:#666;font-weight:400;">(select trim)</span></td><td class="cm-val" style="padding-top:10px;">'
      +     '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:10px;">'
      +       '<div>Top:</div>    <div><select class="cm-sel" name="'+fid+'_it">'+trimOpts+'</select></div>'
      +       '<div>Left:</div>   <div><select class="cm-sel" name="'+fid+'_il">'+trimOpts+'</select></div>'
      +       '<div>Right:</div>  <div><select class="cm-sel" name="'+fid+'_ir">'+trimOpts+'</select></div>'
      +       '<div>Bottom:</div> <div><select class="cm-sel" name="'+fid+'_ib">'+trimOpts+'</select></div>'
      +     '</div>'
      +   '</td></tr>'
      +   '<tr><td class="cm-lbl" style="padding-top:10px;">External<br/><span style="font-size:9px;color:#666;font-weight:400;">(select trim)</span></td><td class="cm-val" style="padding-top:10px;">'
      +     '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:10px;">'
      +       '<div>Top:</div>    <div><select class="cm-sel" name="'+fid+'_et">'+trimOpts+'</select></div>'
      +       '<div>Left:</div>   <div><select class="cm-sel" name="'+fid+'_el">'+trimOpts+'</select></div>'
      +       '<div>Right:</div>  <div><select class="cm-sel" name="'+fid+'_er">'+trimOpts+'</select></div>'
      +       '<div>Bottom:</div> <div><select class="cm-sel" name="'+fid+'_eb">'+trimOpts+'</select></div>'
      +     '</div>'
      +   '</td></tr>'
      +   '<tr><td class="cm-lbl" style="padding-top:10px;">Design Change</td><td class="cm-val" style="padding-top:10px;">'
      +     '<label style="margin-right:12px;"><input type="radio" name="'+fid+'_dc" value="yes"/> YES</label>'
      +     '<label><input type="radio" name="'+fid+'_dc" value="no"/> NO</label>'
      +   '</td></tr>'
      +   '<tr><td class="cm-lbl">Frosted Glass</td><td class="cm-val">'
      +     '<label style="margin-right:12px;"><input type="radio" name="'+fid+'_fg" value="yes"/> YES</label>'
      +     '<label><input type="radio" name="'+fid+'_fg" value="no"/> NO</label>'
      +   '</td></tr>'
      +   '<tr><td class="cm-lbl">Tasmanian Oak Threshold</td><td class="cm-val">'
      +     '<label style="margin-right:12px;"><input type="radio" name="'+fid+'_tot" value="yes"/> YES</label>'
      +     '<label><input type="radio" name="'+fid+'_tot" value="no"/> NO</label>'
      +     '<div style="font-size:9px;color:#c41230;margin-top:3px;">(If YES, deduct 20mm from Height)</div>'
      +   '</td></tr>'
      + '</table>';

    // Right column — CAD spec summary (reference only, non-editable)
    var rightCol = ''
      + '<div style="text-align:center;margin-bottom:10px;">'
      +   viewWithDimensions(f, 'back')
      +   '<div style="margin-top:4px;">'+badges.map(function(b){return renderBadge(b.code);}).join('')+'</div>'
      + '</div>'
      + '<div class="info-block"><div class="info-title">Frame</div>'
      +   '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:6px;">'
      +     '<div style="width:30px;height:30px;border:2px solid #1a1a1a;box-sizing:border-box;flex-shrink:0;"></div>'
      +     '<div><div style="font-weight:700;font-size:10px;">'+_esc(prodLabel)+' uPVC Windows</div><div style="font-size:9px;color:#333;">'+_esc(prodLabel)+' '+(f.panelCount||1)+'x1</div></div>'
      +   '</div>'
      +   '<div style="display:flex;gap:14px;flex-wrap:wrap;">'
      +     '<div style="display:flex;gap:6px;align-items:center;"><div style="width:14px;height:14px;border-radius:50%;background:'+(colourMeta?colourMeta.hex:'#F2F0EC')+';border:1px solid #999;"></div><div><div style="font-size:8px;font-weight:700;">External</div><div style="font-size:8px;">'+_esc(colourLabel)+' Body</div></div></div>'
      +     '<div style="display:flex;gap:6px;align-items:center;"><div style="width:14px;height:14px;border-radius:50%;background:'+(colourIntMeta?colourIntMeta.hex:'#F2F0EC')+';border:1px solid #999;"></div><div><div style="font-size:8px;font-weight:700;">Internal</div><div style="font-size:8px;">'+_esc(colourIntLabel)+' Body</div></div></div>'
      +   '</div>'
      + '</div>'
      + '<div class="info-block"><div class="info-title">Glazing</div>'
      +   '<div style="display:flex;gap:8px;align-items:flex-start;">'
      +     '<div style="width:18px;height:18px;border-radius:50%;background:#dae6ef;border:1px solid #999;margin-top:2px;flex-shrink:0;"></div>'
      +     '<div style="font-size:9px;line-height:1.4;"><div style="font-weight:700;">'+_esc(glassLabel)+'</div>'+(glassDesc?'<div style="color:#555;">'+_esc(glassDesc)+'</div>':'')+'<div style="color:#555;">Black Spacer Bar</div></div>'
      +   '</div>'
      + '</div>'
      + '<div class="info-block"><div class="info-title">Hardware</div>'
      +   badges.map(function(b){
          return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">'+renderBadge(b.code)+'<div style="font-size:9px;"><div style="font-weight:700;">'+_esc(b.label)+'</div><div style="color:#555;">'+_esc(b.label)+(b.code==='TW'?' '+hardwareCol:'')+'</div></div></div>';
        }).join('')
      + '</div>';

    var body = pageHeader(pageN) + '<div class="page-body">'
      + '<div style="display:grid;grid-template-columns:1fr 280px;gap:20px;margin-top:10px;">'
      +   '<div>'+leftCol+'</div>'
      +   '<div>'+rightCol+'</div>'
      + '</div>'
      + '</div>';
    pages.push(body);
  });

  // ─── SITE CHECKLIST PAGE 1 (Access, Existing Conditions, Measurements) ───
  var siteP1N = 3 + items.length;
  var sitePage1 = pageHeader(siteP1N) + '<div class="page-body" style="font-size:10px;line-height:1.5;">'
    + '<div class="cm-h1">1. ACCESS &amp; LOGISTICS (The "Fully Welded" Factor)</div>'
    + '<div style="font-style:italic;color:#c41230;margin:2px 0 8px 0;">*** uPVC frames are rigid and do not flat-pack ***</div>'
    + '<div class="cm-h2">VEHICLE &amp; PARKING:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Adequate parking for 2x Large Vans (2.4m High)</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Access available for 3.2m Truck (if required)</label>'
    + '<div class="cm-h2">MOVEMENT PATH:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> "Corner Check": Welded frames fit through gate/hallway?</label>'
    + '<div class="cm-chk"><b>Stairs Involved?</b></div>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> NO</label>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> YES (Internal / External)</label>'
    + '<div class="cm-h2">SITE ACCESSIBILITY:</div>'
    + '<div class="cm-chk"><b>Is access straightforward?</b></div>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> YES</label>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> NO (Details below):</label>'
    + '<textarea class="cm-notes" rows="3"></textarea>'

    + '<div class="cm-h1" style="margin-top:16px;">2. EXISTING CONDITIONS &amp; STRUCTURE</div>'
    + '<div class="cm-h2">CURRENT FRAME MATERIAL:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Aluminium</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Timber</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Steel <span style="color:#c41230;">(WARNING: Requires Grinding. Extra labour allowed?)</span></label>'
    + '<div class="cm-h2">WALL CONSTRUCTION:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Brick Veneer</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Double Brick</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Weatherboard / Cladding</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Rendered Brick <span style="color:#c41230;">(WARNING: Render will chip. Client notified?)</span></label>'
    + '<div class="cm-h2">STRUCTURAL ALTERATIONS:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Direct Replacement (No structural change)</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Opening Enlargement / Cut-out (Details below):</label>'
    + '<textarea class="cm-notes" rows="2"></textarea>'
    + '<div class="cm-h2">THE OPENING:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Sill Condition: Is brick sill level/flat? (If NO, allow grinding/packing)</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Lintel Check: Is steel bar/brickwork rusting or sagging?</label>'

    + '<div class="cm-h1" style="margin-top:16px;">3. MEASUREMENTS &amp; TOLERANCES</div>'
    + '<div class="cm-h2">SIZING CHECKS:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Tolerance: 20mm Minimum allowed on H &amp; W?</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Squareness: Checked diagonals? (If &gt;10mm out, increase tolerance)</label>'
    + '<div class="cm-h2">FLOORING LEVELS:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Frame Lift: Lift required for future flooring (Tiles/Timber)?</label>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> NO</label>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> YES &nbsp;<input type="text" class="cm-in cm-in-sm" style="width:80px;"/> mm Lift</label>'
    + '</div>';
  pages.push(sitePage1);

  // ─── SITE CHECKLIST PAGE 2 (Interiors, Prep, Resourcing, Notes) ───
  var siteP2N = 4 + items.length;
  var sitePage2 = pageHeader(siteP2N) + '<div class="page-body" style="font-size:10px;line-height:1.5;">'
    + '<div class="cm-h1">4. INTERIORS &amp; CLASH DETECTION</div>'
    + '<div class="cm-h2">WINDOW COVERINGS:</div>'
    + '<div class="cm-chk"><b>Blinds/Shutters: Will existing Shutters/Blinds fit back in?</b></div>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> YES</label>'
    + '<label class="cm-chk" style="padding-left:20px;"><input type="checkbox"/> NO (Handles clash. Client to remove/replace)</label>'
    + '<div class="cm-h2">OBSTRUCTIONS:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Kitchen Taps: Will new sash hit the tap?</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Alarm Sensors: Reed switches present? (Client to remove)</label>'

    + '<div class="cm-h1" style="margin-top:16px;">5. PREPARATION &amp; DOCUMENTATION</div>'
    + '<div class="cm-h2">PHOTOGRAPHY (MANDATORY):</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Photos taken of EVERY window? (Upload to Ascora)</label>'
    + '<div style="padding-left:22px;font-size:9px;color:#555;">(Must show obstructions, difficult sills, &amp; access path)</div>'
    + '<div class="cm-h2">WASTE MANAGEMENT:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Van Load (Standard removal)</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Skip Bin Required &nbsp;(Is there space on site? '
    +   '<label><input type="checkbox"/> YES</label> &nbsp; <label><input type="checkbox"/> NO</label>)</label>'

    + '<div class="cm-h1" style="margin-top:16px;">6. RESOURCING ESTIMATE</div>'
    + '<div class="cm-h2">HEAVY LIFTING:</div>'
    + '<label class="cm-chk"><input type="checkbox"/> Standard Lift</label>'
    + '<label class="cm-chk"><input type="checkbox"/> Heavy/Oversized (Requires extra manpower/glass suckers)</label>'
    + '<div class="cm-h2">ESTIMATES:</div>'
    + '<div style="margin:6px 0;">Est. Days to Complete:&nbsp; <input type="text" class="cm-in" style="width:120px;"/></div>'
    + '<div style="margin:6px 0;">Staff Required:&nbsp; <input type="text" class="cm-in" style="width:120px;"/></div>'

    + '<div class="cm-h1" style="margin-top:16px;">7. SITE NOTES / SKETCHES</div>'
    + '<div style="font-size:9px;color:#555;margin-bottom:4px;">(Detail any brickwork issues, out-of-square openings, or client warnings)</div>'
    + '<textarea class="cm-notes" rows="12"></textarea>'
    + '</div>';
  pages.push(sitePage2);

  // ─── STYLES ───
  var styles = '<style>'
    + '* { box-sizing: border-box; }'
    + 'body { margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color:#222; background:#f0f0f0; }'
    + '.page { width:210mm; min-height:297mm; background:#fff; margin:10px auto; padding:14mm; page-break-after:always; position:relative; box-shadow:0 2px 8px rgba(0,0,0,0.12); }'
    + '.page:last-child { page-break-after:auto; }'
    + '.page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; }'
    + '.logo-col { flex:0 0 auto; }'
    + '.header-meta { text-align:right; }'
    + '.project-pill { margin-top:18px; background:#e8e8e8; padding:10px 18px; font-weight:700; font-size:12px; display:inline-block; }'
    + '.company-strip { margin-top:14px; font-size:10px; line-height:1.5; }'
    + '.page-body { margin-top:6px; }'
    + '.info-block { background:#f5f5f5; padding:10px 12px; margin:6px 0; border-radius:4px; }'
    + '.info-title { font-weight:700; font-size:11px; margin-bottom:6px; }'
    // Check-measure-specific
    + '.cm-table { width:100%; border-collapse:collapse; }'
    + '.cm-table td { padding:6px 4px; vertical-align:top; font-size:11px; }'
    + '.cm-lbl { font-weight:700; width:180px; color:#222; }'
    + '.cm-val { }'
    + '.cm-in { border:none; border-bottom:1px solid #666; padding:2px 4px; font-size:11px; font-family:inherit; background:transparent; width:180px; outline:none; }'
    + '.cm-in:focus { border-bottom-color:#c41230; background:#fffbeb; }'
    + '.cm-in-sm { width:100px; }'
    + '.cm-sel { border:1px solid #bbb; padding:3px 6px; font-size:10px; font-family:inherit; background:#fff; border-radius:3px; min-width:220px; outline:none; }'
    + '.cm-sel:focus { border-color:#c41230; }'
    + '.cm-h1 { font-weight:700; font-size:12px; margin:6px 0 4px 0; border-bottom:1px solid #ccc; padding-bottom:2px; }'
    + '.cm-h2 { font-weight:700; font-size:10px; margin:8px 0 3px 0; color:#333; }'
    + '.cm-chk { display:block; margin:3px 0; font-size:10px; cursor:pointer; }'
    + '.cm-chk input[type=checkbox] { margin-right:6px; }'
    + '.cm-notes { width:100%; font-family:inherit; font-size:10px; padding:6px 8px; border:1px solid #bbb; border-radius:3px; resize:vertical; margin-top:4px; }'
    + '.cm-notes:focus { border-color:#c41230; outline:none; background:#fffbeb; }'
    + '@media print {'
    + '  body { background:#fff; }'
    + '  .page { margin:0; box-shadow:none; width:auto; min-height:auto; padding:14mm; }'
    + '  input:focus, select:focus, textarea:focus { outline:none !important; background:transparent !important; }'
    + '  .cm-in, .cm-notes { border-color:#666 !important; }'
    + '  .cm-sel { -webkit-appearance:none; appearance:none; border:none; border-bottom:1px solid #666; border-radius:0; padding-right:4px; }'
    + '}'
    + '@page { size: A4; margin:0; }'
    + '</style>';

  return '<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Check Measure - '+_esc(projectName)+'</title>'+styles+'</head><body>'
    + pages.map(function(p){return '<div class="page">'+p+'</div>';}).join('')
    + '</body></html>';
}

