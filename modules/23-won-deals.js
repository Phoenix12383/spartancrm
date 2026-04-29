// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 23-won-deals.js
// Extracted from original index.html lines 15286-15461
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// WON DEALS PAGE
// ══════════════════════════════════════════════════════════════════════════════
let wonFilterBranch = 'all';
let wonFilterRep = 'all';
let wonFilterPipeline = 'all';
let wonFilterRange = 'all';
// Brief 5 Phase 4: dealType filter (residential/commercial/all). 'all' is
// the same shape as the other wonFilter* defaults so we don't need a
// migration. 'untyped' isn't a value here — Phase 3 backfill should
// have eliminated nulls before this filter is even rendered.
let wonFilterDealType = 'all';
let wonSearch = '';
let wonSortCol = 'wonDate';
let wonSortDir = 'desc';

function wonToggleSort(col) {
  if (wonSortCol === col) wonSortDir = wonSortDir === 'asc' ? 'desc' : 'asc';
  else { wonSortCol = col; wonSortDir = col === 'wonDate' ? 'desc' : 'asc'; }
  renderPage();
}

// ── MOBILE: WON DEALS — vertical card list ────────────────────────────────────
function renderWonMobile() {
  var contacts = getState().contacts || [];
  var allWon = (getState().deals || []).filter(function(d){ return d.won; });
  var now = new Date();
  var thisMonth = now.getMonth();
  var thisYear = now.getFullYear();
  var filtered = allWon.slice();
  if (wonFilterRange === 'thisMonth') filtered = filtered.filter(function(d){ if (!d.wonDate) return false; var wd = new Date(d.wonDate + 'T12:00:00'); return wd.getMonth() === thisMonth && wd.getFullYear() === thisYear; });
  else if (wonFilterRange === 'lastMonth') { var lm = thisMonth === 0 ? 11 : thisMonth - 1; var ly = thisMonth === 0 ? thisYear - 1 : thisYear; filtered = filtered.filter(function(d){ if (!d.wonDate) return false; var wd = new Date(d.wonDate + 'T12:00:00'); return wd.getMonth() === lm && wd.getFullYear() === ly; }); }
  else if (wonFilterRange === 'thisQuarter') { var q = Math.floor(thisMonth / 3); filtered = filtered.filter(function(d){ if (!d.wonDate) return false; var wd = new Date(d.wonDate + 'T12:00:00'); return Math.floor(wd.getMonth() / 3) === q && wd.getFullYear() === thisYear; }); }
  else if (wonFilterRange === 'thisYear') filtered = filtered.filter(function(d){ if (!d.wonDate) return false; var wd = new Date(d.wonDate + 'T12:00:00'); return wd.getFullYear() === thisYear; });
  if (wonSearch) {
    var qSearch = wonSearch.toLowerCase();
    filtered = filtered.filter(function(d){
      var c = contacts.find(function(x){ return x.id === d.cid; });
      var cName = c ? (c.fn + ' ' + c.ln).toLowerCase() : '';
      return (d.title||'').toLowerCase().indexOf(qSearch) >= 0 || cName.indexOf(qSearch) >= 0 || (d.suburb||'').toLowerCase().indexOf(qSearch) >= 0;
    });
  }
  filtered.sort(function(a, b){ return (b.wonDate || '').localeCompare(a.wonDate || ''); });
  function fmtK(n) {
    var v = Number(n) || 0;
    if (v >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M';
    if (v >= 1000) return '$' + Math.round(v/1000) + 'k';
    return '$' + v.toFixed(0);
  }
  function _esc(s) { return String(s||'').replace(/'/g, "\\'"); }
  function _attrEsc(s) { return String(s||'').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  var totalVal = filtered.reduce(function(s, d){ return s + (d.val || 0); }, 0);
  function wonCard(d) {
    var c = contacts.find(function(x){ return x.id === d.cid; });
    var name = c ? (c.fn + ' ' + c.ln) : (d.title || 'Deal');
    return '<button onclick="setState({dealDetailId:\'' + _esc(d.id) + '\'})" style="width:100%;background:#fff;border-radius:12px;padding:12px;border:none;cursor:pointer;text-align:left;font-family:inherit;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:8px;border-left:3px solid #22c55e">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;color:#0a0a0a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</div>' +
          '<div style="font-size:11px;color:#6b7280;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (d.suburb || '—') + (d.branch ? ' · ' + d.branch : '') + '</div>' +
        '</div>' +
        '<div style="text-align:right;flex-shrink:0">' +
          '<div style="font-size:14px;font-weight:800;font-family:Syne,sans-serif;color:#0a0a0a">' + fmtK(d.val) + '</div>' +
          (d.wonDate ? '<div style="font-size:10px;color:#22c55e;font-weight:700;margin-top:1px">✓ ' + d.wonDate + '</div>' : '') +
        '</div>' +
      '</div>' +
      (d.rep ? '<div style="font-size:10px;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:8px;margin-top:8px">👤 ' + d.rep + '</div>' : '') +
    '</button>';
  }
  return '' +
    '<div style="margin:-12px -12px 12px;background:#fff;padding:12px 16px;border-bottom:1px solid #f0f0f0">' +
      '<div style="margin-bottom:10px">' +
        '<h1 style="font-size:18px;font-weight:800;margin:0;color:#0a0a0a;font-family:Syne,sans-serif">Won Deals</h1>' +
        '<div style="font-size:11px;color:#6b7280;margin-top:2px">' + filtered.length + ' deal' + (filtered.length===1?'':'s') + ' · ' + fmtK(totalVal) + '</div>' +
      '</div>' +
      '<input value="' + _attrEsc(wonSearch) + '" oninput="wonSearch=this.value;renderPage()" placeholder="Search name, suburb…" style="width:100%;padding:8px 12px;background:#f3f4f6;border:none;border-radius:8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:8px" />' +
      '<div style="display:flex;gap:4px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:2px">' +
        [{id:'all',label:'All'},{id:'thisMonth',label:'This month'},{id:'lastMonth',label:'Last month'},{id:'thisQuarter',label:'This Q'},{id:'thisYear',label:'YTD'}].map(function(r){
          var on = wonFilterRange === r.id;
          return '<button onclick="wonFilterRange=\'' + r.id + '\';renderPage()" style="flex-shrink:0;padding:5px 12px;border-radius:14px;border:1px solid ' + (on ? '#c41230' : '#e5e7eb') + ';background:' + (on ? '#c41230' : '#fff') + ';color:' + (on ? '#fff' : '#6b7280') + ';font-size:11px;font-weight:' + (on ? 700 : 600) + ';cursor:pointer;font-family:inherit;white-space:nowrap">' + r.label + '</button>';
        }).join('') +
      '</div>' +
    '</div>' +
    (filtered.length === 0
      ? '<div style="padding:40px 20px;text-align:center;background:#fff;border-radius:12px;color:#9ca3af;font-size:13px;font-style:italic">No won deals in this view</div>'
      : filtered.map(wonCard).join(''));
}

function renderWonPage() {
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) return renderWonMobile();
  var deals = getState().deals.filter(function(d){ return d.won; });
  var contacts = getState().contacts;
  var now = new Date();
  var thisMonth = now.getMonth();
  var thisYear = now.getFullYear();

  // Date range filter
  if (wonFilterRange !== 'all') {
    deals = deals.filter(function(d) {
      if (!d.wonDate) return false;
      var wd = new Date(d.wonDate + 'T12:00:00');
      if (wonFilterRange === 'thisMonth') return wd.getMonth() === thisMonth && wd.getFullYear() === thisYear;
      if (wonFilterRange === 'lastMonth') { var lm = thisMonth === 0 ? 11 : thisMonth - 1; var ly = thisMonth === 0 ? thisYear - 1 : thisYear; return wd.getMonth() === lm && wd.getFullYear() === ly; }
      if (wonFilterRange === 'thisQuarter') { var q = Math.floor(thisMonth / 3); return Math.floor(wd.getMonth() / 3) === q && wd.getFullYear() === thisYear; }
      if (wonFilterRange === 'thisYear') return wd.getFullYear() === thisYear;
      if (wonFilterRange === 'last6') return wd.getTime() > Date.now() - 180 * 24 * 3600000;
      return true;
    });
  }

  // Filters
  if (wonFilterBranch !== 'all') deals = deals.filter(function(d){ return d.branch === wonFilterBranch; });
  if (wonFilterRep !== 'all') deals = deals.filter(function(d){ return d.rep === wonFilterRep; });
  if (wonFilterPipeline !== 'all') deals = deals.filter(function(d){ return d.pid === wonFilterPipeline; });
  if (wonFilterDealType !== 'all') deals = deals.filter(function(d){ return d.dealType === wonFilterDealType; });
  if (wonSearch) {
    var q = wonSearch.toLowerCase();
    deals = deals.filter(function(d) {
      var c = contacts.find(function(x){ return x.id === d.cid; });
      var cName = c ? (c.fn + ' ' + c.ln).toLowerCase() : '';
      return d.title.toLowerCase().indexOf(q) >= 0 || cName.indexOf(q) >= 0 || (d.suburb || '').toLowerCase().indexOf(q) >= 0;
    });
  }

  // Sort
  deals.sort(function(a, b) {
    var av, bv;
    if (wonSortCol === 'wonDate') { av = a.wonDate || ''; bv = b.wonDate || ''; }
    else if (wonSortCol === 'val') { av = a.val || 0; bv = b.val || 0; }
    else if (wonSortCol === 'title') { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
    else if (wonSortCol === 'rep') { av = (a.rep || '').toLowerCase(); bv = (b.rep || '').toLowerCase(); }
    else if (wonSortCol === 'branch') { av = a.branch || ''; bv = b.branch || ''; }
    else { av = a.wonDate || ''; bv = b.wonDate || ''; }
    if (av < bv) return wonSortDir === 'asc' ? -1 : 1;
    if (av > bv) return wonSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // KPIs
  var allWon = getState().deals.filter(function(d){ return d.won; });
  var totalVal = allWon.reduce(function(s, d){ return s + (d.val || 0); }, 0);
  var totalCount = allWon.length;
  var avgVal = totalCount > 0 ? totalVal / totalCount : 0;
  var monthWon = allWon.filter(function(d){ if (!d.wonDate) return false; var wd = new Date(d.wonDate + 'T12:00:00'); return wd.getMonth() === thisMonth && wd.getFullYear() === thisYear; });
  var monthVal = monthWon.reduce(function(s, d){ return s + (d.val || 0); }, 0);
  var prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  var prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;
  var prevWon = allWon.filter(function(d){ if (!d.wonDate) return false; var wd = new Date(d.wonDate + 'T12:00:00'); return wd.getMonth() === prevMonth && wd.getFullYear() === prevYear; });
  var prevVal = prevWon.reduce(function(s, d){ return s + (d.val || 0); }, 0);
  var monthChange = prevVal > 0 ? Math.round((monthVal - prevVal) / prevVal * 100) : (monthVal > 0 ? 100 : 0);
  var filteredVal = deals.reduce(function(s, d){ return s + (d.val || 0); }, 0);

  // Unique reps
  var reps = [];
  allWon.forEach(function(d){ if (d.rep && reps.indexOf(d.rep) < 0) reps.push(d.rep); });

  var sortIcon = function(col) {
    if (wonSortCol !== col) return '<span style="opacity:.3;font-size:10px">\u2195</span>';
    return wonSortDir === 'asc' ? '<span style="color:#c41230;font-size:10px">\u2191</span>' : '<span style="color:#c41230;font-size:10px">\u2193</span>';
  };

  return '<div>'
    // Header
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">'
    +'<div><h1 style="font-size:22px;font-weight:800;margin:0;font-family:Syne,sans-serif">\ud83c\udfc6 Won Deals</h1>'
    +'<p style="font-size:13px;color:#6b7280;margin:4px 0 0">' + totalCount + ' deals won \u00b7 ' + fmt$(totalVal) + ' total revenue</p></div>'
    +'</div>'

    // KPIs
    +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px">'
    +'<div class="card" style="padding:16px;text-align:center"><div style="font-size:24px;font-weight:800;color:#15803d;font-family:Syne,sans-serif">' + fmt$(monthVal) + '</div><div style="font-size:12px;color:#6b7280;margin-top:4px">This Month</div>'
    +(monthChange !== 0 ? '<div style="font-size:11px;font-weight:600;margin-top:4px;color:' + (monthChange > 0 ? '#15803d' : '#dc2626') + '">' + (monthChange > 0 ? '\u2191' : '\u2193') + ' ' + Math.abs(monthChange) + '% vs last month</div>' : '')
    +'</div>'
    +'<div class="card" style="padding:16px;text-align:center"><div style="font-size:24px;font-weight:800;color:#c41230;font-family:Syne,sans-serif">' + deals.length + '</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Filtered Deals</div></div>'
    +'<div class="card" style="padding:16px;text-align:center"><div style="font-size:24px;font-weight:800;color:#374151;font-family:Syne,sans-serif">' + fmt$(filteredVal) + '</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Filtered Value</div></div>'
    +'<div class="card" style="padding:16px;text-align:center"><div style="font-size:24px;font-weight:800;color:#374151;font-family:Syne,sans-serif">' + fmt$(avgVal) + '</div><div style="font-size:12px;color:#6b7280;margin-top:4px">Average Deal</div></div>'
    +'</div>'

    // Filters
    +'<div class="card" style="padding:14px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
    +'<input id="wonSearchInput" oninput="wonSearch=this.value;renderPage()" value="' + wonSearch + '" class="inp" placeholder="Search deals..." style="flex:1;min-width:180px;font-size:13px">'
    +'<select class="sel" style="width:auto;font-size:12px" onchange="wonFilterBranch=this.value;renderPage()">'
    +'<option value="all"' + (wonFilterBranch === 'all' ? ' selected' : '') + '>All Branches</option>'
    +'<option value="VIC"' + (wonFilterBranch === 'VIC' ? ' selected' : '') + '>VIC</option>'
    +'<option value="ACT"' + (wonFilterBranch === 'ACT' ? ' selected' : '') + '>ACT</option>'
    +'<option value="SA"' + (wonFilterBranch === 'SA' ? ' selected' : '') + '>SA</option>'
    +'</select>'
    +'<select class="sel" style="width:auto;font-size:12px" onchange="wonFilterRep=this.value;renderPage()">'
    +'<option value="all"' + (wonFilterRep === 'all' ? ' selected' : '') + '>All Reps</option>'
    + reps.map(function(r){ return '<option value="' + r + '"' + (wonFilterRep === r ? ' selected' : '') + '>' + r + '</option>'; }).join('')
    +'</select>'
    +'<select class="sel" style="width:auto;font-size:12px" onchange="wonFilterPipeline=this.value;renderPage()">'
    +'<option value="all"' + (wonFilterPipeline === 'all' ? ' selected' : '') + '>All Pipelines</option>'
    + PIPELINES.map(function(p){ return '<option value="' + p.id + '"' + (wonFilterPipeline === p.id ? ' selected' : '') + '>' + p.name + '</option>'; }).join('')
    +'</select>'
    // Brief 5 Phase 4: deal-type filter (All / Residential / Commercial).
    +'<select class="sel" style="width:auto;font-size:12px" onchange="wonFilterDealType=this.value;renderPage()">'
    +'<option value="all"' + (wonFilterDealType === 'all' ? ' selected' : '') + '>All Types</option>'
    +'<option value="residential"' + (wonFilterDealType === 'residential' ? ' selected' : '') + '>Residential</option>'
    +'<option value="commercial"' + (wonFilterDealType === 'commercial' ? ' selected' : '') + '>Commercial</option>'
    +'</select>'
    +'<select class="sel" style="width:auto;font-size:12px" onchange="wonFilterRange=this.value;renderPage()">'
    +'<option value="all"' + (wonFilterRange === 'all' ? ' selected' : '') + '>All Time</option>'
    +'<option value="thisMonth"' + (wonFilterRange === 'thisMonth' ? ' selected' : '') + '>This Month</option>'
    +'<option value="lastMonth"' + (wonFilterRange === 'lastMonth' ? ' selected' : '') + '>Last Month</option>'
    +'<option value="thisQuarter"' + (wonFilterRange === 'thisQuarter' ? ' selected' : '') + '>This Quarter</option>'
    +'<option value="last6"' + (wonFilterRange === 'last6' ? ' selected' : '') + '>Last 6 Months</option>'
    +'<option value="thisYear"' + (wonFilterRange === 'thisYear' ? ' selected' : '') + '>This Year</option>'
    +'</select>'
    +'</div>'

    // Table
    +'<div class="card" style="overflow:hidden;padding:0">'
    +'<table style="width:100%;border-collapse:collapse">'
    +'<thead><tr>'
    +'<th class="th" onclick="wonToggleSort(\'title\')" style="cursor:pointer">Deal ' + sortIcon('title') + '</th>'
    +'<th class="th" onclick="wonToggleSort(\'contact\')" style="cursor:pointer">Contact</th>'
    +'<th class="th" onclick="wonToggleSort(\'val\')" style="cursor:pointer;text-align:right">Value ' + sortIcon('val') + '</th>'
    +'<th class="th" onclick="wonToggleSort(\'wonDate\')" style="cursor:pointer">Won Date ' + sortIcon('wonDate') + '</th>'
    +'<th class="th" onclick="wonToggleSort(\'rep\')" style="cursor:pointer">Rep ' + sortIcon('rep') + '</th>'
    +'<th class="th" onclick="wonToggleSort(\'branch\')" style="cursor:pointer">Branch ' + sortIcon('branch') + '</th>'
    +'<th class="th">Type</th>'
    +'<th class="th">Pipeline</th>'
    +'</tr></thead>'
    +'<tbody>'
    + (deals.length === 0
      ? '<tr><td colspan="8" style="padding:40px;text-align:center;color:#9ca3af;font-size:13px"><div style="font-size:28px;margin-bottom:8px">\ud83c\udfc6</div>No won deals' + (wonSearch || wonFilterBranch !== 'all' || wonFilterRep !== 'all' || wonFilterRange !== 'all' || wonFilterDealType !== 'all' ? ' matching your filters' : ' yet') + '</td></tr>'
      : deals.map(function(d) {
        var c = contacts.find(function(x){ return x.id === d.cid; });
        var cName = c ? c.fn + ' ' + c.ln : '\u2014';
        var cEmail = c ? c.email || '' : '';
        var pl = PIPELINES.find(function(p){ return p.id === d.pid; });
        var plName = pl ? pl.name : '';
        var wonDateFmt = d.wonDate || '\u2014';
        if (d.wonDate) {
          try { var wd = new Date(d.wonDate + 'T12:00:00'); wonDateFmt = wd.toLocaleDateString('en-AU', {day:'numeric',month:'short',year:'numeric'}); } catch(e){}
        }
        return '<tr style="cursor:pointer" onclick="setState({dealDetailId:\'' + d.id + '\',page:\'deals\'})" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'\'">'
          +'<td class="td"><div style="display:flex;align-items:center;gap:8px"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e;flex-shrink:0"></div><div><div style="font-size:13px;font-weight:600;color:#111">' + d.title + '</div>' + (d.suburb ? '<div style="font-size:11px;color:#9ca3af">' + d.suburb + '</div>' : '') + '</div></div></td>'
          +'<td class="td"><div style="font-size:13px;color:#374151">' + cName + '</div>' + (cEmail ? '<div style="font-size:11px;color:#9ca3af">' + cEmail + '</div>' : '') + '</td>'
          +'<td class="td" style="text-align:right;font-weight:700;color:#15803d;font-size:14px;font-family:Syne,sans-serif">' + fmt$(d.val) + '</td>'
          +'<td class="td" style="font-size:12px;color:#374151">' + wonDateFmt + '</td>'
          +'<td class="td" style="font-size:12px;color:#6b7280">' + (d.rep || '\u2014') + '</td>'
          +'<td class="td"><span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:#f3f4f6;color:#6b7280">' + (d.branch || '\u2014') + '</span></td>'
          +'<td class="td">' + (typeof _dealTypeBadge === 'function' ? _dealTypeBadge(d) : '') + '</td>'
          +'<td class="td" style="font-size:12px;color:#6b7280">' + plName + '</td>'
          +'</tr>';
      }).join(''))
    +'</tbody></table></div>'

    // Footer
    +'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:0 4px">'
    +'<div style="font-size:12px;color:#9ca3af">Showing ' + deals.length + ' of ' + totalCount + ' won deals</div>'
    +'</div>'
    +'</div>';
}

