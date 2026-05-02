// ─────────────────────────────────────────────────────────────────────────────
// SPARTAN CRM — 02a-mock-factory-data.js
// Populates localStorage with realistic factory orders + frames so the
// Production Board, station queue pages, and kanban all have data to show.
//
// Called once at startup (safe to call again — it guards against duplicates).
// Exposed: loadMockFactoryData()   call from console to reset/reload
// ─────────────────────────────────────────────────────────────────────────────

function loadMockFactoryData() {
  var now   = new Date();
  var d     = function(offset) { var x = new Date(now); x.setDate(x.getDate() + offset); return x.toISOString().slice(0,10); };
  var ts    = function(i)      { return 'fi_mock_' + i; };

  // ── Mock factory orders ────────────────────────────────────────────────────
  var orders = [
    { id:'fo_mock_1', crmJobId:'job_mock_1', jid:'J-2024-041', customer:'Sarah & Tom Mitchell',
      address:'14 Birchwood Ave, Hawthorn VIC 3122', suburb:'Hawthorn', branch:'VIC',
      value:28400, installDate:d(12), notes:'Double-storey. Scaffold booked.', status:'in_production',
      frameCount:7, paymentMethod:'bank_transfer', glassStatus:'ordered', profileStatus:'ordered',
      created:new Date(now - 8*86400000).toISOString() },
    { id:'fo_mock_2', crmJobId:'job_mock_2', jid:'J-2024-042', customer:'Prestige Constructions',
      address:'Unit 3, 88 Chapel St, South Yarra VIC 3141', suburb:'South Yarra', branch:'VIC',
      value:61200, installDate:d(19), notes:'Commercial fitout. 3 floors.', status:'in_production',
      frameCount:14, paymentMethod:'progress_claim', glassStatus:'ordered', profileStatus:'ordered',
      created:new Date(now - 5*86400000).toISOString() },
    { id:'fo_mock_3', crmJobId:'job_mock_3', jid:'J-2024-043', customer:'David & Lee Nguyen',
      address:'7 Rosewood Cres, Glen Waverley VIC 3150', suburb:'Glen Waverley', branch:'VIC',
      value:14900, installDate:d(7), notes:'Urgent — reno handover date fixed.', status:'in_production',
      frameCount:4, paymentMethod:'cod', glassStatus:'ordered', profileStatus:'ordered',
      created:new Date(now - 3*86400000).toISOString() },
    { id:'fo_mock_4', crmJobId:'job_mock_4', jid:'J-2024-039', customer:'Oaklands Retirement Village',
      address:'120 Oaks Blvd, Ferntree Gully VIC 3156', suburb:'Ferntree Gully', branch:'VIC',
      value:44700, installDate:d(28), notes:'Staged delivery — 5 units per week.', status:'materials_ordered',
      frameCount:11, paymentMethod:'purchase_order', glassStatus:'ordered', profileStatus:'not_ordered',
      created:new Date(now - 11*86400000).toISOString() },
  ];

  // ── Station time builder ───────────────────────────────────────────────────
  // Returns a stationTimes object for a frame of given width × height.
  function makeTimes(w, h, isLarge) {
    var s = isLarge ? 1.4 : 1.0;
    return {
      S1_saw:    Math.round((12 + w/200) * s),   // profile saw
      S2_steel:  Math.round((8  + h/300) * s),   // steel saw
      S4A_cnc:   Math.round((14 + w/250) * s),   // CNC milling
      S4B_screw: Math.round((6)          * s),   // screw ports
      S_weld:    Math.round((18 + w/180) * s),   // welding
      S_clean:   Math.round((5)          * s),   // clean-up
      S5_hw:     Math.round((20 + w/200) * s),   // hardware fit
      S6_reveal: Math.round((12)         * s),   // reveals / trims
      S7_fly:    Math.round((8)          * s),   // flyscreen
      S_qc:      Math.round((6)          * s),   // QC check
      S_disp:    Math.round((5)          * s),   // pack & dispatch
    };
  }

  // ── Mock frames ───────────────────────────────────────────────────────────
  // Spread realistically across all 6 stations + a couple of rework items.
  var frames = [
    // J-2024-041 (Mitchell) — 7 frames spread across stations
    { id:ts(1),  orderId:'J-2024-041', name:'W01', productType:'casement_window',   widthMm:1200, heightMm:1050, colour:'monument',    colourInt:'surfmist',     glassSpec:'lowe_4_12_4', station:'cutting',  rework:false, customer:'Sarah & Tom Mitchell', suburb:'Hawthorn',      due:d(12) },
    { id:ts(2),  orderId:'J-2024-041', name:'W02', productType:'awning_window',      widthMm:900,  heightMm:600,  colour:'monument',    colourInt:'surfmist',     glassSpec:'lowe_4_12_4', station:'cutting',  rework:false, customer:'Sarah & Tom Mitchell', suburb:'Hawthorn',      due:d(12) },
    { id:ts(3),  orderId:'J-2024-041', name:'W03', productType:'fixed_window',       widthMm:1800, heightMm:1200, colour:'monument',    colourInt:'surfmist',     glassSpec:'dgu_6_12_6', station:'milling',  rework:false, customer:'Sarah & Tom Mitchell', suburb:'Hawthorn',      due:d(12) },
    { id:ts(4),  orderId:'J-2024-041', name:'W04', productType:'tilt_turn_window',   widthMm:800,  heightMm:1400, colour:'monument',    colourInt:'surfmist',     glassSpec:'lowe_4_12_4', station:'welding',  rework:false, customer:'Sarah & Tom Mitchell', suburb:'Hawthorn',      due:d(12) },
    { id:ts(5),  orderId:'J-2024-041', name:'D01', productType:'french_door',         widthMm:1800, heightMm:2100, colour:'monument',    colourInt:'surfmist',     glassSpec:'dgu_6_12_6', station:'hardware', rework:false, customer:'Sarah & Tom Mitchell', suburb:'Hawthorn',      due:d(12) },
    { id:ts(6),  orderId:'J-2024-041', name:'D02', productType:'hinged_door',         widthMm:920,  heightMm:2100, colour:'monument',    colourInt:'surfmist',     glassSpec:'dgu_4_16_4', station:'reveals',  rework:false, customer:'Sarah & Tom Mitchell', suburb:'Hawthorn',      due:d(12) },
    { id:ts(7),  orderId:'J-2024-041', name:'W05', productType:'sliding_window',      widthMm:1500, heightMm:900,  colour:'monument',    colourInt:'surfmist',     glassSpec:'lowe_4_12_4', station:'dispatch', rework:false, customer:'Sarah & Tom Mitchell', suburb:'Hawthorn',      due:d(12) },

    // J-2024-042 (Prestige) — 14 frames, heavy load, some rework
    { id:ts(8),  orderId:'J-2024-042', name:'W01', productType:'fixed_window',       widthMm:2400, heightMm:1500, colour:'white_body',  colourInt:'white_body',   glassSpec:'dgu_6_12_6', station:'cutting',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(9),  orderId:'J-2024-042', name:'W02', productType:'fixed_window',       widthMm:2400, heightMm:1500, colour:'white_body',  colourInt:'white_body',   glassSpec:'dgu_6_12_6', station:'cutting',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(10), orderId:'J-2024-042', name:'W03', productType:'casement_window',    widthMm:1000, heightMm:1200, colour:'white_body',  colourInt:'white_body',   glassSpec:'lowe_4_12_4', station:'cutting',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(11), orderId:'J-2024-042', name:'W04', productType:'casement_window',    widthMm:1000, heightMm:1200, colour:'white_body',  colourInt:'white_body',   glassSpec:'lowe_4_12_4', station:'milling',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(12), orderId:'J-2024-042', name:'W05', productType:'awning_window',      widthMm:1200, heightMm:600,  colour:'white_body',  colourInt:'white_body',   glassSpec:'lowe_4_12_4', station:'milling',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(13), orderId:'J-2024-042', name:'W06', productType:'awning_window',      widthMm:1200, heightMm:600,  colour:'white_body',  colourInt:'white_body',   glassSpec:'lowe_4_12_4', station:'milling',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(14), orderId:'J-2024-042', name:'W07', productType:'tilt_turn_window',   widthMm:900,  heightMm:1400, colour:'white_body',  colourInt:'white_body',   glassSpec:'lowe_6_12_6', station:'welding',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(15), orderId:'J-2024-042', name:'W08', productType:'tilt_turn_window',   widthMm:900,  heightMm:1400, colour:'white_body',  colourInt:'white_body',   glassSpec:'lowe_6_12_6', station:'welding',  rework:true,  customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(16), orderId:'J-2024-042', name:'D01', productType:'lift_slide_door',    widthMm:3600, heightMm:2400, colour:'white_body',  colourInt:'white_body',   glassSpec:'dgu_6_12_6', station:'welding',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(17), orderId:'J-2024-042', name:'D02', productType:'lift_slide_door',    widthMm:3600, heightMm:2400, colour:'white_body',  colourInt:'white_body',   glassSpec:'dgu_6_12_6', station:'hardware', rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(18), orderId:'J-2024-042', name:'D03', productType:'bifold_door',        widthMm:2700, heightMm:2100, colour:'white_body',  colourInt:'white_body',   glassSpec:'dgu_4_16_4', station:'hardware', rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(19), orderId:'J-2024-042', name:'W09', productType:'fixed_window',       widthMm:1800, heightMm:1200, colour:'white_body',  colourInt:'white_body',   glassSpec:'dgu_6_12_6', station:'reveals',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(20), orderId:'J-2024-042', name:'W10', productType:'fixed_window',       widthMm:1800, heightMm:1200, colour:'white_body',  colourInt:'white_body',   glassSpec:'dgu_6_12_6', station:'reveals',  rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },
    { id:ts(21), orderId:'J-2024-042', name:'W11', productType:'sliding_window',     widthMm:1500, heightMm:900,  colour:'white_body',  colourInt:'white_body',   glassSpec:'lowe_4_12_4', station:'dispatch', rework:false, customer:'Prestige Constructions', suburb:'South Yarra',  due:d(19) },

    // J-2024-043 (Nguyen) — 4 frames, urgent (due in 7 days)
    { id:ts(22), orderId:'J-2024-043', name:'W01', productType:'awning_window',      widthMm:1050, heightMm:750,  colour:'surfmist',    colourInt:'surfmist',     glassSpec:'dgu_4_12_4', station:'hardware', rework:false, customer:'David & Lee Nguyen', suburb:'Glen Waverley',  due:d(7) },
    { id:ts(23), orderId:'J-2024-043', name:'W02', productType:'awning_window',      widthMm:1050, heightMm:750,  colour:'surfmist',    colourInt:'surfmist',     glassSpec:'dgu_4_12_4', station:'reveals',  rework:false, customer:'David & Lee Nguyen', suburb:'Glen Waverley',  due:d(7) },
    { id:ts(24), orderId:'J-2024-043', name:'D01', productType:'french_door',         widthMm:1500, heightMm:2100, colour:'surfmist',    colourInt:'surfmist',     glassSpec:'dgu_4_16_4', station:'reveals',  rework:true,  customer:'David & Lee Nguyen', suburb:'Glen Waverley',  due:d(7) },
    { id:ts(25), orderId:'J-2024-043', name:'W03', productType:'fixed_window',       widthMm:2100, heightMm:1200, colour:'surfmist',    colourInt:'surfmist',     glassSpec:'lowe_4_12_4', station:'dispatch', rework:false, customer:'David & Lee Nguyen', suburb:'Glen Waverley',  due:d(7) },
  ];

  // Stamp station history and stationTimes onto each frame
  var stationOrder = ['cutting','milling','welding','hardware','reveals','dispatch'];
  frames = frames.map(function(f) {
    var isLarge = (f.widthMm * f.heightMm) > 1500000;
    var times   = makeTimes(f.widthMm, f.heightMm, isLarge);
    var stnIdx  = stationOrder.indexOf(f.station);
    var hist    = [];
    for (var i = 0; i <= stnIdx; i++) {
      hist.push({ station: stationOrder[i], at: new Date(now - (stnIdx - i) * 3600000 * 4).toISOString() });
    }
    return Object.assign({}, f, {
      stationTimes: times,
      productionMinutes: Object.values ? Object.values(times).reduce(function(s,v){return s+v;},0) : 90,
      stationHistory: hist,
    });
  });

  // Guard: remove any existing mock data before inserting fresh set
  var existingOrders = (typeof getFactoryOrders === 'function') ? getFactoryOrders() : [];
  var existingItems  = (typeof getFactoryItems  === 'function') ? getFactoryItems()  : [];

  var cleanOrders = existingOrders.filter(function(o){ return o.id.indexOf('fo_mock_') !== 0; });
  var cleanItems  = existingItems.filter(function(i){  return i.id.indexOf('fi_mock_') !== 0; });

  localStorage.setItem('spartan_factory_orders', JSON.stringify(cleanOrders.concat(orders)));
  localStorage.setItem('spartan_factory_items',  JSON.stringify(cleanItems.concat(frames)));

  console.log('[MockFactory] Loaded ' + orders.length + ' orders, ' + frames.length + ' frames across 6 stations.');
  if (typeof renderPage === 'function') renderPage();
}

// Auto-load once if no factory data exists yet
(function() {
  try {
    var existing = JSON.parse(localStorage.getItem('spartan_factory_items') || '[]');
    if (existing.length === 0) loadMockFactoryData();
  } catch(e) {}
})();

window.loadMockFactoryData = loadMockFactoryData;
