// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16e-factory-ops.js
// Factory QC checklist (Operations Manual §5.10).
//
//   renderQCPage()  → /factoryqc
//
// History: this file previously also hosted Jobs-to-Review, Bay Management,
// and Hold/Variation flows. Those were removed 2026-05-04 per
// FACTORY-CRM-CONTRACT.md (Jobs-to-Review and Bay Mgmt are out of contract
// scope; Hold/Variation belongs in Job CRM, per §1 "everything downstream of
// dispatch lives in Job CRM"). The localStorage key `spartan_bays` is left
// in place for now — historical data is retained.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions ────────────────────────────────────────────────
defineAction('ops-start-qc', function(target, ev) {
  var frameId = target.dataset.frameId;
  _qcActiveFrameId = frameId;
  renderPage();
});

defineAction('ops-back-from-qc', function(target, ev) {
  _qcActiveFrameId = null;
  renderPage();
});

defineAction('ops-qc-tick', function(target, ev) {
  var frameId = target.dataset.frameId;
  var idx = parseInt(target.dataset.idx, 10);
  qcTick(frameId, idx);
});

defineAction('ops-qc-fail', function(target, ev) {
  var frameId = target.dataset.frameId;
  var idx = parseInt(target.dataset.idx, 10);
  qcFail(frameId, idx);
});

defineAction('ops-qc-pass', function(target, ev) {
  var frameId = target.dataset.frameId;
  qcPass(frameId);
});

// ── Module state ─────────────────────────────────────────────────────────────
var _qcActiveFrameId = null;

// ── QC checklist items (Operations Manual §5.10 — 11 items) ──────────────────
var QC_CHECKLIST_ITEMS = [
  'Window dimensions match Final Sign-Off dimensions',
  'Colour correct — exterior + interior, no scratches or marks',
  'Hardware fitted — all items per bundle, locks engage, handles smooth',
  'Trims present — correct colour, length, and count in job pile',
  'Reveals present and correct',
  'Architraves present and correct',
  'Fly screens present, fit-checked against frame, correct mesh type',
  'Opening / closing — every sash opens and closes smoothly, locks engage',
  'Drainage holes clear — drain caps not yet fitted',
  'Gaskets seated — EPDM gaskets in place, no displacements',
  'No scratches or defects on any visible surface',
];

// ── QC store (per-frame ticks + failures, keyed by frame id) ─────────────────
function getQCStore() {
  try { return JSON.parse(localStorage.getItem('spartan_qc') || '{}'); } catch(e) { return {}; }
}
function saveQCStore(d) { localStorage.setItem('spartan_qc', JSON.stringify(d)); }

// ── QC list page ─────────────────────────────────────────────────────────────
function renderQCPage() {
  var items = getFactoryItems();
  var qcStore = getQCStore();

  if (_qcActiveFrameId) return '<div>' + _renderQCChecklist(_qcActiveFrameId, items, qcStore) + '</div>';

  // Frames eligible for QC: parked at the QC station (moved up from Hardware)
  // and not yet checklist-passed. Pre-2026-05-04 the filter used legacy ids
  // ('reveals' / 'dispatch') that the current FACTORY_STATIONS list doesn't
  // contain — the QC tab silently showed zero rows for any data created with
  // the 7-station naming. The legacy ids were renamed by the station-id
  // migration in 16-factory-crm.js so this filter now matches reality.
  var eligible = items.filter(function(i) { return i.station === 'qc' && !i.qcPassedAt; });
  var passed   = items.filter(function(i) { return !!i.qcPassedAt; });
  var failed   = eligible.filter(function(i) { return qcStore[i.id] && (qcStore[i.id].failures || []).length > 0; });

  var h = '<div style="margin-bottom:20px"><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">✅ QC Checklist</h2>'
    + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">11-item forced checklist — every item must pass before a frame reaches Dispatch</p></div>';

  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">';
  [{l:'Awaiting QC',v:eligible.length,c:'#ef4444'},{l:'With Failures',v:failed.length,c:'#f59e0b'},{l:'QC Passed',v:passed.length,c:'#22c55e'},{l:'Total Frames',v:items.length,c:'#3b82f6'}]
    .forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div><div style="font-size:24px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
  h += '</div>';

  if (!eligible.length) {
    h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:36px;margin-bottom:8px">✅</div><div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px">No frames awaiting QC</div><div style="font-size:12px">Frames appear here when they reach the QC station on the production board.</div></div>';
  } else {
    h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
      + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">Frames Awaiting QC (' + eligible.length + ')</h4></div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr>'
      + '<th class="th">Frame</th><th class="th">Job</th><th class="th">Product</th><th class="th">Dimensions</th><th class="th">Station</th><th class="th">Status</th><th class="th"></th>'
      + '</tr></thead><tbody>';
    eligible.forEach(function(item, i) {
      var entry = qcStore[item.id] || {};
      var failCount = (entry.failures || []).length;
      var tickCount = Object.keys(entry.ticks || {}).filter(function(k) { return entry.ticks[k]; }).length;
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + (failCount ? ';background:#fef2f2' : '') + '">'
        + '<td class="td" style="font-weight:700;color:#c41230">' + (item.name || item.id) + '</td>'
        + '<td class="td">' + (item.jobRef || '—') + '</td>'
        + '<td class="td">' + formatProductType(item.productType, '—') + '</td>'
        + '<td class="td">' + (item.widthMm || item.width || '?') + '×' + (item.heightMm || item.height || '?') + '</td>'
        + '<td class="td"><span class="bdg" style="font-size:10px">' + item.station + '</span></td>'
        + '<td class="td">' + (failCount ? '<span style="color:#ef4444;font-weight:600">⚠ ' + failCount + ' fail(s)</span>' : tickCount ? '<span style="color:#f59e0b;font-weight:600">' + tickCount + '/' + QC_CHECKLIST_ITEMS.length + ' checked</span>' : '<span style="color:#9ca3af">Pending</span>') + '</td>'
        + '<td class="td"><button data-action="ops-start-qc" data-frame-id="' + item.id + '" class="btn-r" style="font-size:10px;padding:4px 12px">Run QC →</button></td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
  }

  if (passed.length) {
    h += '<div class="card" style="padding:14px 16px"><div style="font-size:12px;font-weight:700;margin-bottom:8px">Recently Passed</div><div style="display:flex;flex-direction:column;gap:5px">';
    passed.slice(-6).reverse().forEach(function(item) {
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;padding:7px 10px;background:#f0fdf4;border-radius:6px">'
        + '<span style="font-weight:600;color:#c41230">' + (item.name || item.id) + '</span>'
        + '<span style="color:#6b7280">' + (item.jobRef || '') + '</span>'
        + '<span style="color:#22c55e;font-weight:600">✅ ' + (item.qcPassedAt ? new Date(item.qcPassedAt).toLocaleTimeString('en-AU', {hour:'2-digit',minute:'2-digit'}) : '') + '</span>'
        + '</div>';
    });
    h += '</div></div>';
  }
  return '<div>' + h + '</div>';
}

// ── QC checklist (per-frame) ─────────────────────────────────────────────────
function _renderQCChecklist(frameId, items, qcStore) {
  var frame = items.find(function(i) { return i.id === frameId; });
  if (!frame) { _qcActiveFrameId = null; return renderQCPage(); }
  var entry = qcStore[frameId] || { ticks: {}, failures: [], startedAt: new Date().toISOString() };
  var tickCount = Object.keys(entry.ticks || {}).filter(function(k) { return entry.ticks[k]; }).length;
  var allTicked = tickCount === QC_CHECKLIST_ITEMS.length;
  var failCount = (entry.failures || []).length;
  var pct = Math.round(tickCount / QC_CHECKLIST_ITEMS.length * 100);

  var h = '<div style="max-width:620px;margin:0 auto">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
    + '<button data-action="ops-back-from-qc" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">← Back</button>'
    + '<div><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif">QC: ' + (frame.name || frameId) + '</div>'
    + '<div style="font-size:12px;color:#6b7280">' + (frame.jobRef || '') + ' · ' + formatProductType(frame.productType) + ' · ' + (frame.widthMm || frame.width || '?') + '×' + (frame.heightMm || frame.height || '?') + 'mm</div>'
    + '</div></div>'
    + '<div style="margin-bottom:6px;height:8px;background:#f0f0f0;border-radius:4px"><div style="height:100%;background:' + (allTicked ? '#22c55e' : pct > 50 ? '#f59e0b' : '#c41230') + ';border-radius:4px;width:' + pct + '%;transition:width .3s"></div></div>'
    + '<div style="font-size:12px;color:#6b7280;margin-bottom:16px">' + tickCount + ' / ' + QC_CHECKLIST_ITEMS.length + ' items checked' + (failCount ? ' · <span style="color:#ef4444;font-weight:600">' + failCount + ' failure(s)</span>' : '') + '</div>';

  QC_CHECKLIST_ITEMS.forEach(function(label, idx) {
    var ticked = !!(entry.ticks || {})[idx];
    var failure = (entry.failures || []).find(function(f) { return f.item === idx; });
    h += '<div style="display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid ' + (failure ? '#fecaca' : ticked ? '#bbf7d0' : '#e5e7eb') + ';border-radius:8px;margin-bottom:6px;background:' + (failure ? '#fef2f2' : ticked ? '#f0fdf4' : '#fff') + '">'
      + '<button data-action="ops-qc-tick" data-frame-id="' + frameId + '" data-idx="' + idx + '" style="width:26px;height:26px;border-radius:50%;border:2px solid ' + (ticked ? '#22c55e' : '#d1d5db') + ';background:' + (ticked ? '#22c55e' : '#fff') + ';cursor:pointer;flex-shrink:0;font-size:13px;color:#fff;display:flex;align-items:center;justify-content:center;font-family:inherit">' + (ticked ? '✓' : '') + '</button>'
      + '<div style="flex:1">'
      + '<div style="font-size:13px;color:' + (failure ? '#b91c1c' : ticked ? '#15803d' : '#374151') + ';font-weight:' + (ticked ? '600' : '400') + '">' + (idx + 1) + '. ' + label + '</div>'
      + (failure ? '<div style="font-size:11px;color:#b91c1c;margin-top:3px">❌ ' + failure.category + (failure.notes ? ': ' + failure.notes : '') + '</div>' : '')
      + '</div>'
      + (!ticked && !failure ? '<button data-action="ops-qc-fail" data-frame-id="' + frameId + '" data-idx="' + idx + '" style="padding:4px 10px;border:1px solid #fca5a5;background:#fee2e2;color:#b91c1c;border-radius:6px;cursor:pointer;font-size:10px;font-weight:600;flex-shrink:0;font-family:inherit">Fail ✗</button>' : '')
      + '</div>';
  });

  h += '<div style="margin-top:20px">'
    + (allTicked
      ? '<button data-action="ops-qc-pass" data-frame-id="' + frameId + '" style="width:100%;padding:14px;background:#22c55e;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;font-family:inherit">✅ QC Pass — Advance to Dispatch</button>'
      : '<div style="padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;text-align:center;font-size:13px;color:#9ca3af">All ' + QC_CHECKLIST_ITEMS.length + ' items must be checked before passing</div>')
    + '</div></div>';
  return h;
}

// ── QC mutators ──────────────────────────────────────────────────────────────
function qcTick(frameId, idx) {
  var d = getQCStore();
  if (!d[frameId]) d[frameId] = { ticks: {}, failures: [], startedAt: new Date().toISOString() };
  d[frameId].ticks[idx] = !d[frameId].ticks[idx];
  if (d[frameId].ticks[idx]) {
    d[frameId].failures = (d[frameId].failures || []).filter(function(f) { return f.item !== idx; });
  }
  saveQCStore(d);
  renderPage();
}

function qcFail(frameId, idx) {
  var cat = prompt('Failure category:\n1. Human Error\n2. Machine\n3. Supplier\n4. Design\n\nEnter number (1–4):', '1');
  var catMap = {'1':'Human Error','2':'Machine','3':'Supplier','4':'Design'};
  var category = catMap[cat] || 'Human Error';
  var notes = prompt('Notes (optional — describe the specific defect):') || '';
  var d = getQCStore();
  if (!d[frameId]) d[frameId] = { ticks: {}, failures: [], startedAt: new Date().toISOString() };
  d[frameId].failures = (d[frameId].failures || []).filter(function(f) { return f.item !== idx; });
  d[frameId].failures.push({ item: idx, category: category, notes: notes, at: new Date().toISOString() });
  d[frameId].ticks[idx] = false;
  saveQCStore(d);
  renderPage();
}

function qcPass(frameId) {
  var items = getFactoryItems();
  var updated = items.map(function(i) {
    return i.id === frameId ? Object.assign({}, i, { qcPassedAt: new Date().toISOString(), station: 'packing' }) : i;
  });
  saveFactoryItems(updated);
  _qcActiveFrameId = null;
  addToast('QC passed — frame moved to Dispatch bay queue', 'success');
  renderPage();
}

// ── Window exports ───────────────────────────────────────────────────────────
window.qcTick = qcTick;
window.qcFail = qcFail;
window.qcPass = qcPass;
window.renderQCPage = renderQCPage;
