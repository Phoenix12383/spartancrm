// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — js/modules/factory/34-factory-station-pages.js
// Operator-facing station queue pages — one per factory station.
//
// Each page shows the frame queue at that station with full CAD data:
//   - Frame dimensions, product type, colour, glass spec
//   - Station time budget (minutes) from the CAD stationTimes payload
//   - Move to next station / complete buttons
//
// Station flow: cutting → milling → welding → hardware → reveals → dispatch
//
// Data sources:
//   - getStationQueue(stationId)     factory items at this station (localStorage)
//   - FACTORY_STATIONS_FROM_MANUAL   station definitions + cadKeys
//   - CadTimingContract              station time helpers (from 26-cad-timing-contract.js)
//
// Globals exposed:
//   renderStationPage(stationId)    generic renderer — used by all 6 routes
//   renderStnCutting / renderStnMilling / renderStnWelding /
//   renderStnHardware / renderStnReveals / renderStnDispatch
// ═════════════════════════════════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────────────────────────────────

function _stnEsc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _stnProductLabel(productType) {
  var MAP = {
    awning_window:'Awning Window', casement_window:'Casement Window',
    tilt_turn_window:'Tilt & Turn', fixed_window:'Fixed Window',
    sliding_window:'Sliding Window', french_door:'French Door',
    hinged_door:'Hinged Door', bifold_door:'Bifold Door',
    lift_slide_door:'Lift & Slide', smart_slide_door:'Smart Slide',
    vario_slide_door:'Vario Slide', stacker_door:'Stacker Door',
  };
  return MAP[productType] || (productType || 'Frame');
}

function _stnColourLabel(c) {
  if (!c) return '—';
  return c.replace(/_/g,' ').replace(/\b\w/g, function(l){ return l.toUpperCase(); });
}

function _stnGlassLabel(g) {
  if (!g) return '—';
  var MAP = {
    'dgu_4_12_4':'4/12/4 DGU','dgu_4_16_4':'4/16/4 DGU','dgu_6_12_6':'6/12/6 DGU',
    'lowe_4_12_4':'4/12/4 Low-E','lowe_6_12_6':'6/12/6 Low-E',
    'sgp_6':'6mm SGP','lam_6_6':'6.38 Lam',
  };
  return MAP[g] || g.replace(/_/g,' ').toUpperCase();
}

// Gets station time minutes for a factory item at a given set of CAD station keys.
// Reads from item.stationTimes (set at push-to-factory time).
function _stnMinutes(item, cadKeys) {
  if (!item || !item.stationTimes || !cadKeys) return 0;
  return cadKeys.reduce(function(sum, k) {
    return sum + (Number(item.stationTimes[k]) || 0);
  }, 0);
}

function _stnFmtMins(min) {
  if (!min || min <= 0) return '—';
  var m = Math.round(min);
  var h = Math.floor(m / 60);
  var rem = m % 60;
  if (h === 0) return rem + 'm';
  return h + 'h ' + (rem > 0 ? rem + 'm' : '');
}

// ── Core renderer ─────────────────────────────────────────────────────────────

function renderStationPage(stationId) {
  var stations = FACTORY_STATIONS_FROM_MANUAL;
  var stnIdx   = stations.findIndex(function(s){ return s.id === stationId; });
  if (stnIdx < 0) return '<div class="card" style="padding:40px;color:#ef4444">Unknown station: ' + _stnEsc(stationId) + '</div>';

  var stn     = stations[stnIdx];
  var nextStn = stnIdx < stations.length - 1 ? stations[stnIdx + 1] : null;
  var items   = (typeof getStationQueue === 'function') ? getStationQueue(stationId) : [];
  var cadKeys = stn.cadKeys || [];

  // Totals
  var totalMins = items.reduce(function(s, it){ return s + _stnMinutes(it, cadKeys); }, 0);

  // ── Header ──
  var h = '<div style="margin-bottom:20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">'
    + '<div style="font-size:32px">' + stn.icon + '</div>'
    + '<div>'
    + '<h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">' + _stnEsc(stn.name) + '</h2>'
    + '<p style="color:#6b7280;font-size:12px;margin:3px 0 0">Role: ' + _stnEsc(stn.role)
    + (nextStn ? ' &nbsp;·&nbsp; Next: ' + nextStn.icon + ' ' + _stnEsc(nextStn.name) : ' &nbsp;·&nbsp; Final station')
    + '</p></div></div>';

  // ── Stat tiles ──
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">'
    + _stnTile('Frames in Queue', items.length, '#3b82f6')
    + _stnTile('Total Time Budget', _stnFmtMins(totalMins), '#f59e0b')
    + _stnTile('Capacity', items.length + '/' + stn.cap, items.length > stn.cap * 0.8 ? '#ef4444' : '#22c55e')
    + '</div>';

  // ── Station time bar chart (mini) ──
  if (cadKeys.length > 0 && totalMins > 0) {
    h += '<div class="card" style="padding:12px 16px;margin-bottom:16px;display:flex;gap:16px;align-items:center">'
      + '<div style="font-size:11px;font-weight:700;color:#6b7280;white-space:nowrap">Station Times:</div>';
    cadKeys.forEach(function(k){
      var keyMins = items.reduce(function(s, it){ return s + (it.stationTimes ? (Number(it.stationTimes[k]) || 0) : 0); }, 0);
      var name = (typeof CAD_STATION_NAMES !== 'undefined' ? CAD_STATION_NAMES[k] : k) || k;
      h += '<div style="text-align:center">'
        + '<div style="font-size:14px;font-weight:800;font-family:Syne,sans-serif;color:#1f2937">' + _stnFmtMins(keyMins) + '</div>'
        + '<div style="font-size:9px;color:#9ca3af">' + _stnEsc(name) + '</div>'
        + '</div>';
    });
    h += '</div>';
  }

  // ── Frame queue ──
  if (items.length === 0) {
    h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af">'
      + '<div style="font-size:36px;margin-bottom:8px">' + stn.icon + '</div>'
      + 'No frames in queue at ' + _stnEsc(stn.name) + '.</div>';
    return '<div>' + h + '</div>';
  }

  h += '<div class="card" style="padding:0;overflow:hidden">'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr>'
    + '<th class="th">Frame</th>'
    + '<th class="th">Job</th>'
    + '<th class="th">Customer</th>'
    + '<th class="th">Product</th>'
    + '<th class="th">Size</th>'
    + '<th class="th">Colour</th>'
    + '<th class="th">Glass</th>'
    + '<th class="th">Time Budget</th>'
    + '<th class="th">Due</th>'
    + '<th class="th"></th>'
    + '</tr></thead><tbody>';

  items.forEach(function(it, i) {
    var mins    = _stnMinutes(it, cadKeys);
    var rework  = it.rework ? '<span style="color:#ef4444;font-weight:700;font-size:9px"> ⚠ REWORK</span>' : '';
    var dueStr  = it.due ? new Date(it.due).toLocaleDateString('en-AU') : '—';
    var timeCol = mins > 60 ? '#f59e0b' : mins > 0 ? '#22c55e' : '#d1d5db';

    h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + (it.rework ? ';border-left:3px solid #ef4444' : '') + '">'
      + '<td class="td" style="font-weight:700;color:#c41230">' + _stnEsc(it.name) + rework + '</td>'
      + '<td class="td" style="font-weight:600">' + _stnEsc(it.orderId || '—') + '</td>'
      + '<td class="td">' + _stnEsc(it.customer || '—') + (it.suburb ? '<br><span style="color:#9ca3af;font-size:10px">' + _stnEsc(it.suburb) + '</span>' : '') + '</td>'
      + '<td class="td">' + _stnEsc(_stnProductLabel(it.productType)) + '</td>'
      + '<td class="td" style="font-family:monospace;font-size:11px">' + (it.widthMm || '?') + ' × ' + (it.heightMm || '?') + '</td>'
      + '<td class="td"><div>' + _stnEsc(_stnColourLabel(it.colour)) + '</div>'
      + (it.colourInt && it.colourInt !== it.colour ? '<div style="color:#9ca3af;font-size:10px">Int: ' + _stnEsc(_stnColourLabel(it.colourInt)) + '</div>' : '')
      + '</td>'
      + '<td class="td">' + _stnEsc(_stnGlassLabel(it.glassSpec)) + '</td>'
      + '<td class="td" style="font-weight:700;color:' + timeCol + '">' + _stnFmtMins(mins) + '</td>'
      + '<td class="td" style="color:' + (_isDueSoon(it.due) ? '#ef4444' : '#374151') + ';font-weight:' + (_isDueSoon(it.due) ? '700' : '400') + '">' + dueStr + '</td>'
      + '<td class="td">'
      + (nextStn
        ? '<button onclick="assignToStation(\'' + it.id + '\',\'' + nextStn.id + '\')" class="btn-r" style="font-size:10px;padding:4px 12px;white-space:nowrap">'
          + nextStn.icon + ' → ' + _stnEsc(nextStn.name) + '</button>'
        : '<button onclick="completeStation(\'' + it.id + '\')" style="padding:4px 12px;border:none;border-radius:6px;background:#22c55e;color:#fff;font-size:10px;font-weight:600;cursor:pointer">✅ Complete</button>'
      )
      + '</td></tr>';
  });

  h += '</tbody></table></div>';
  return '<div>' + h + '</div>';
}

function _stnTile(label, value, color) {
  return '<div class="card" style="padding:14px 18px;border-left:4px solid ' + color + '">'
    + '<div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + label + '</div>'
    + '<div style="font-size:22px;font-weight:800;font-family:Syne,sans-serif;color:' + color + ';margin-top:4px">' + value + '</div>'
    + '</div>';
}

function _isDueSoon(dueDateStr) {
  if (!dueDateStr) return false;
  var diff = (new Date(dueDateStr) - new Date()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 3;
}

// ── Per-station entry points ──────────────────────────────────────────────────

function renderStnCutting()  { return renderStationPage('cutting'); }
function renderStnMilling()  { return renderStationPage('milling'); }
function renderStnWelding()  { return renderStationPage('welding'); }
function renderStnHardware() { return renderStationPage('hardware'); }
function renderStnReveals()  { return renderStationPage('reveals'); }
function renderStnDispatch() { return renderStationPage('dispatch'); }

window.renderStationPage  = renderStationPage;
window.renderStnCutting   = renderStnCutting;
window.renderStnMilling   = renderStnMilling;
window.renderStnWelding   = renderStnWelding;
window.renderStnHardware  = renderStnHardware;
window.renderStnReveals   = renderStnReveals;
window.renderStnDispatch  = renderStnDispatch;
