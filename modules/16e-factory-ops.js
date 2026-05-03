// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 16e-factory-ops.js
// Stage 1 Factory Operations UI
//   renderJobsToReview()   → /jobsreview
//   renderQCPage()         → /factoryqc
//   renderBayManagement()  → /baymanagement
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
defineAction('ops-dismiss-hold-modal', function(target, ev) {
  if (ev.target === target) {
    _holdTargetId = null;
    renderPage();
  }
});

defineAction('ops-cancel-hold', function(target, ev) {
  _holdTargetId = null;
  renderPage();
});

defineAction('ops-apply-hold', function(target, ev) {
  applyHold();
});

defineAction('ops-back-to-dashboard', function(target, ev) {
  navigateTo('factorydash');
});

defineAction('ops-show-hold-modal-job', function(target, ev) {
  var jobId = target.dataset.jobId;
  showHoldModal(jobId, 'job');
});

defineAction('ops-bounce-to-sales', function(target, ev) {
  var jobId = target.dataset.jobId;
  bounceToSales(jobId);
});

defineAction('ops-start-review', function(target, ev) {
  var jobId = target.dataset.jobId;
  setState({ factoryReviewJobId: jobId });
  _reviewTab = 'frames';
  renderPage();
});

defineAction('ops-release-hold-job', function(target, ev) {
  var jobId = target.dataset.jobId;
  releaseHold(jobId, 'job');
});

defineAction('ops-back-from-review', function(target, ev) {
  setState({ factoryReviewJobId: null });
  renderPage();
});

defineAction('ops-select-review-tab', function(target, ev) {
  var tabId = target.dataset.tabId;
  _reviewTab = tabId;
  renderPage();
});

defineAction('ops-send-to-factory', function(target, ev) {
  var jobId = target.dataset.jobId;
  pushJobToFactory(jobId);
  setState({ factoryReviewJobId: null });
});

defineAction('ops-view-full-job', function(target, ev) {
  var jobId = target.dataset.jobId;
  navigateTo('jobs', { jobDetailId: jobId });
});

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

defineAction('ops-select-bay', function(target, ev) {
  var bayId = target.dataset.bayId;
  _baySelectedId = bayId;
  renderPage();
});

defineAction('ops-assign-frame-to-bay', function(target, ev) {
  var frameId = target.dataset.frameId;
  var bayId = target.value;
  if (bayId) {
    bayAssignFrame(frameId, bayId);
    target.value = '';
  }
});

defineAction('ops-back-from-bay', function(target, ev) {
  _baySelectedId = null;
  renderPage();
});

defineAction('ops-assign-frame-to-bay-detail', function(target, ev) {
  var frameId = target.value;
  var bayId = target.dataset.bayId;
  if (frameId) {
    bayAssignFrame(frameId, bayId);
    target.value = '';
  }
});

defineAction('ops-toggle-bay-checklist', function(target, ev) {
  var bayId = target.dataset.bayId;
  var idx = parseInt(target.dataset.idx, 10);
  bayToggleChecklist(bayId, idx);
});

defineAction('ops-close-bay', function(target, ev) {
  var bayId = target.dataset.bayId;
  bayClose(bayId);
});

// ── Module state ─────────────────────────────────────────────────────────────
var _reviewTab = 'frames';
var _qcActiveFrameId = null;
var _holdTargetId = null;
var _holdTargetType = null;  // 'job' | 'order'
var _baySelectedId = null;

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

// ── Bay closure items (Operations Manual §5.11) ───────────────────────────────
var BAY_CLOSURE_ITEMS = [
  'All frames physically in bay and frame count confirmed',
  'Fly screens paired to matching frames',
  'Architraves staged per job in labelled bags',
  'Trims staged per job in labelled bags',
  'Glazing beads in labelled bag per frame',
  'Corner hinges in bag per job',
  'Drain caps in bag per frame',
  'Striker plates in bag per frame',
];

// ── Persistence ───────────────────────────────────────────────────────────────
function getQCStore() {
  try { return JSON.parse(localStorage.getItem('spartan_qc') || '{}'); } catch(e) { return {}; }
}
function saveQCStore(d) { localStorage.setItem('spartan_qc', JSON.stringify(d)); }

function getBays() {
  try {
    var bays = JSON.parse(localStorage.getItem('spartan_bays') || '[]');
    if (!bays.length) {
      bays = Array.from({length: 8}, function(_, i) {
        return { id: 'bay_' + (i + 1), number: i + 1, orders: [], closedAt: null, checklist: {} };
      });
      localStorage.setItem('spartan_bays', JSON.stringify(bays));
    }
    return bays;
  } catch(e) { return []; }
}
function saveBays(bays) { localStorage.setItem('spartan_bays', JSON.stringify(bays)); }

// ── Hold / Variation ──────────────────────────────────────────────────────────
function showHoldModal(id, type) {
  _holdTargetId = id;
  _holdTargetType = type || 'order';
  renderPage();
}

function applyHold() {
  var reason = (document.getElementById('hold_reason') || {}).value || '';
  if (!reason.trim()) { addToast('Hold reason is required', 'error'); return; }
  var now = new Date().toISOString();
  if (_holdTargetType === 'job') {
    var jobs = (getState().jobs || []).map(function(j) {
      return j.id === _holdTargetId ? Object.assign({}, j, { factoryHold: true, factoryHoldReason: reason, factoryHoldAt: now }) : j;
    });
    setState({ jobs: jobs });
  } else {
    var orders = getFactoryOrders().map(function(o) {
      return o.id === _holdTargetId ? Object.assign({}, o, { onHold: true, holdReason: reason, holdAt: now }) : o;
    });
    saveFactoryOrders(orders);
  }
  _holdTargetId = null;
  addToast('Placed on hold', 'warning');
  renderPage();
}

function releaseHold(id, type) {
  if (type === 'job') {
    var jobs = (getState().jobs || []).map(function(j) {
      return j.id === id ? Object.assign({}, j, { factoryHold: false, factoryHoldReason: null }) : j;
    });
    setState({ jobs: jobs });
  } else {
    var orders = getFactoryOrders().map(function(o) {
      return o.id === id ? Object.assign({}, o, { onHold: false, holdReason: null }) : o;
    });
    saveFactoryOrders(orders);
  }
  addToast('Hold released', 'success');
  renderPage();
}

function bounceToSales(jobId) {
  if (!confirm('Return this job to Sales for revision?\n\nThe job will be removed from the production queue and the Sales Manager will be notified.')) return;
  var jobs = (getState().jobs || []).map(function(j) {
    return j.id === jobId
      ? Object.assign({}, j, { productionStatus: null, finalSignedAt: null, bouncedFromFactory: true, bouncedAt: new Date().toISOString(), factoryHold: false })
      : j;
  });
  setState({ jobs: jobs, factoryReviewJobId: null });
  addToast('Job returned to Sales for revision', 'warning');
  renderPage();
}

function _renderHoldModal() {
  if (!_holdTargetId) return '';
  return '<div class="modal-bg" data-action="ops-dismiss-hold-modal">'
    + '<div class="modal" style="max-width:420px">'
    + '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    + '<h3 style="margin:0;font-size:16px;font-weight:700">⏸ Place on Hold</h3>'
    + '<button data-action="ops-cancel-hold" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1">×</button>'
    + '</div>'
    + '<div style="padding:24px">'
    + '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Reason <span style="color:#ef4444">*</span></label>'
    + '<textarea id="hold_reason" placeholder="e.g. Waiting on client colour confirmation, glass supplier delay…" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;min-height:90px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>'
    + '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">'
    + '<button data-action="ops-cancel-hold" class="btn-w" style="font-size:12px">Cancel</button>'
    + '<button data-action="ops-apply-hold" class="btn-r" style="font-size:12px">⏸ Confirm Hold</button>'
    + '</div></div></div></div>';
}

// ═════════════════════════════════════════════════════════════════════════════
// JOBS TO REVIEW
// ═════════════════════════════════════════════════════════════════════════════

function renderJobsToReview() {
  var reviewJobId = getState().factoryReviewJobId;
  if (reviewJobId) return _renderJobReviewDetail(reviewJobId);

  var jobs = getState().jobs || [];
  var contacts = getState().contacts || [];
  var orders = getFactoryOrders();
  var awaitingProd = jobs.filter(function(j) {
    return j.finalSignedAt
      && !j.productionStatus
      && !j.factoryHold
      && j.status !== 'h_completed_standard'
      && j.status !== 'i_cancelled';
  });
  var heldJobs = jobs.filter(function(j) {
    return j.finalSignedAt && j.factoryHold && j.status !== 'h_completed_standard';
  });

  var h = '<div style="margin-bottom:20px;display:flex;align-items:center;gap:12px">'
    + '<button data-action="ops-back-to-dashboard" style="background:none;border:none;cursor:pointer;color:#6b7280;padding:4px 8px;font-size:18px;border-radius:6px">←</button>'
    + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">📋 Jobs to Review</h2>'
    + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Review signed-off designs before releasing to the factory floor</p></div>'
    + '</div>';

  if (!awaitingProd.length && !heldJobs.length) {
    return '<div>' + h
      + '<div class="card" style="padding:60px;text-align:center;color:#9ca3af">'
      + '<div style="font-size:48px;margin-bottom:12px">✅</div>'
      + '<div style="font-size:16px;font-weight:600;color:#374151;margin-bottom:6px">All caught up</div>'
      + '<div style="font-size:13px">No jobs awaiting production review.</div>'
      + '</div>' + _renderHoldModal() + '</div>';
  }

  // KPI row
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">';
  [{l:'Awaiting Review',v:awaitingProd.length,c:'#c41230'},{l:'On Hold',v:heldJobs.length,c:'#f59e0b'},{l:'In Factory',v:orders.filter(function(o){return o.status!=='dispatched';}).length,c:'#3b82f6'}]
    .forEach(function(k) {
      h += '<div class="card" style="padding:14px 18px;border-left:4px solid ' + k.c + '"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">' + k.l + '</div>'
        + '<div style="font-size:26px;font-weight:800;font-family:Syne,sans-serif;color:' + k.c + ';margin-top:4px">' + k.v + '</div></div>';
    });
  h += '</div>';

  // Awaiting review list
  if (awaitingProd.length) {
    h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
      + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">⚡ Awaiting Review (' + awaitingProd.length + ')</h4></div>';
    awaitingProd.forEach(function(j, i) {
      var c = contacts.find(function(ct) { return ct.id === j.contactId; });
      var frames = (j.cadFinalData || j.cadSurveyData || j.cadData || {}).projectItems || [];
      var daysSigned = j.finalSignedAt ? Math.floor((Date.now() - new Date(j.finalSignedAt)) / 86400000) : 0;
      var urgency = daysSigned > 3 ? '#ef4444' : daysSigned > 1 ? '#f59e0b' : '#22c55e';
      h += '<div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid #f9fafb;' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<div style="width:4px;height:40px;background:' + urgency + ';border-radius:2px;flex-shrink:0"></div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">'
        + '<span style="font-size:15px;font-weight:800;color:#c41230;font-family:Syne,sans-serif">' + (j.jobNumber || j.id) + '</span>'
        + '<span style="font-size:13px;font-weight:600;color:#374151">' + (c ? c.fn + ' ' + c.ln : '—') + '</span>'
        + '</div>'
        + '<div style="font-size:12px;color:#6b7280;display:flex;gap:12px">'
        + '<span>📍 ' + (j.suburb || '—') + '</span>'
        + '<span>💰 $' + Number(j.val || 0).toLocaleString() + '</span>'
        + '<span>🪟 ' + frames.length + ' frames</span>'
        + '<span style="color:' + urgency + ';font-weight:600">Signed ' + daysSigned + 'd ago</span>'
        + (j.bouncedFromFactory ? ' <span style="color:#7c3aed;font-weight:600">↩ Previously bounced</span>' : '')
        + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;flex-shrink:0">'
        + '<button data-action="ops-show-hold-modal-job" data-job-id="' + j.id + '" class="btn-w" style="font-size:11px;padding:5px 10px">⏸ Hold</button>'
        + '<button data-action="ops-bounce-to-sales" data-job-id="' + j.id + '" style="font-size:11px;padding:5px 10px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600">↩ Bounce</button>'
        + '<button data-action="ops-start-review" data-job-id="' + j.id + '" class="btn-r" style="font-size:11px;padding:5px 14px;font-weight:700">Review →</button>'
        + '</div></div>';
    });
    h += '</div>';
  }

  // On Hold list
  if (heldJobs.length) {
    h += '<div class="card" style="padding:0;overflow:hidden">'
      + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;background:#fffbeb"><h4 style="font-size:14px;font-weight:700;margin:0;color:#92400e">⏸ On Hold (' + heldJobs.length + ')</h4></div>';
    heldJobs.forEach(function(j, i) {
      var c = contacts.find(function(ct) { return ct.id === j.contactId; });
      h += '<div style="display:flex;align-items:center;gap:14px;padding:12px 20px;' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<div style="flex:1"><span style="font-weight:700;color:#c41230">' + (j.jobNumber || j.id) + '</span>'
        + ' <span style="color:#374151">' + (c ? c.fn + ' ' + c.ln : '') + '</span>'
        + '<div style="font-size:11px;color:#f59e0b;font-weight:600;margin-top:2px">Reason: ' + (j.factoryHoldReason || '—') + '</div></div>'
        + '<button data-action="ops-release-hold-job" data-job-id="' + j.id + '" style="font-size:11px;padding:5px 12px;background:#d1fae5;color:#065f46;border:1px solid #6ee7b7;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:600">▶ Release</button>'
        + '</div>';
    });
    h += '</div>';
  }

  return '<div>' + h + _renderHoldModal() + '</div>';
}

// ── 5-tab review detail ───────────────────────────────────────────────────────
function _renderJobReviewDetail(jobId) {
  var job = (getState().jobs || []).find(function(j) { return j.id === jobId; });
  if (!job) { setState({ factoryReviewJobId: null }); return renderJobsToReview(); }

  var contacts = getState().contacts || [];
  var c = contacts.find(function(ct) { return ct.id === job.contactId; });
  var cadData = job.cadFinalData || job.cadSurveyData || job.cadData || {};
  var frames = cadData.projectItems || [];

  var TABS = [
    { id: 'frames',   label: '🪟 Frame List (' + frames.length + ')' },
    { id: 'materials',label: '📦 Materials & BOM' },
    { id: 'orders',   label: '📋 Proposed Orders' },
    { id: 'capacity', label: '⏱ Capacity & Schedule' },
    { id: 'payment',  label: '💳 Customer & Payment' },
  ];

  var invoices = (getState().invoices || []).filter(function(inv) { return inv.jobId === jobId; });
  var cmInv = invoices.find(function(inv) { return (inv.type || '').includes('cm') || (inv.type || '').includes('progress'); });
  var cmPaid = cmInv && cmInv.status === 'Paid';

  var h = '<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px">'
    + '<button data-action="ops-back-from-review" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">← Back</button>'
    + '<div style="flex:1">'
    + '<h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">' + (job.jobNumber || job.id) + (c ? ' — ' + c.fn + ' ' + c.ln : '') + '</h2>'
    + '<p style="color:#6b7280;font-size:12px;margin:4px 0 0">' + (job.suburb || '') + ' · $' + Number(job.val || 0).toLocaleString() + ' · ' + frames.length + ' frames</p>'
    + '</div></div>';

  // Tabs
  h += '<div style="display:flex;border-bottom:2px solid #e5e7eb;margin-bottom:16px;overflow-x:auto;gap:0">';
  TABS.forEach(function(t) {
    var active = _reviewTab === t.id;
    h += '<button data-action="ops-select-review-tab" data-tab-id="' + t.id + '" style="padding:10px 14px;border:none;background:none;cursor:pointer;font-size:12px;font-weight:' + (active ? '700' : '500') + ';color:' + (active ? '#c41230' : '#6b7280') + ';border-bottom:3px solid ' + (active ? '#c41230' : 'transparent') + ';margin-bottom:-2px;white-space:nowrap;font-family:inherit">' + t.label + '</button>';
  });
  h += '</div>';

  if (_reviewTab === 'frames')    h += _reviewTabFrames(frames);
  else if (_reviewTab === 'materials') h += _reviewTabMaterials(frames);
  else if (_reviewTab === 'orders')   h += _reviewTabOrders(job, frames);
  else if (_reviewTab === 'capacity') h += _reviewTabCapacity(job, frames);
  else if (_reviewTab === 'payment')  h += _reviewTabPayment(job, c, invoices);

  // Sticky action bar
  h += '<div style="position:sticky;bottom:16px;z-index:10;display:flex;gap:8px;flex-wrap:wrap;margin-top:20px;padding:14px 18px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 4px 20px #0000001a">';
  if (!cmPaid && cmInv) {
    h += '<div style="width:100%;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#b91c1c;margin-bottom:4px">⚠ <strong>45% progress claim not paid.</strong> You can still send to factory but this is flagged for the Director.</div>';
  }
  h += '<button data-action="ops-send-to-factory" data-job-id="' + job.id + '" class="btn-r" style="padding:9px 22px;font-weight:700;font-size:13px">🏭 Send to Factory</button>'
    + '<button data-action="ops-show-hold-modal-job" data-job-id="' + job.id + '" class="btn-w" style="padding:9px 14px;font-size:12px">⏸ Hold</button>'
    + '<button data-action="ops-bounce-to-sales" data-job-id="' + job.id + '" style="padding:9px 14px;background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit">↩ Bounce to Sales</button>'
    + '<button data-action="ops-view-full-job" data-job-id="' + job.id + '" style="padding:9px 14px;background:none;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;color:#374151;font-family:inherit">📁 View Full Job</button>'
    + '</div>';

  return '<div>' + h + _renderHoldModal() + '</div>';
}

function _reviewTabFrames(frames) {
  if (!frames.length) return '<div class="card" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:32px;margin-bottom:8px">🪟</div>No frame data — Final Design CAD save has not been recorded for this job yet.</div>';
  var h = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">';
  frames.forEach(function(f, i) {
    var times = f.stationTimes || {};
    var totalMin = Object.values(times).reduce(function(s, v) { return s + (v || 0); }, 0);
    var ptype = formatProductType(f.productType, 'unknown');
    h += '<div class="card" style="padding:14px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'
      + '<span style="font-size:14px;font-weight:800;color:#c41230;font-family:Syne,sans-serif">' + (f.name || 'Frame ' + (i + 1)) + '</span>'
      + '<span style="font-size:9px;background:#f1f5f9;color:#475569;padding:2px 7px;border-radius:20px;text-transform:capitalize">' + ptype + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#374151;margin-bottom:8px;display:flex;flex-direction:column;gap:3px">'
      + '<div style="font-weight:600">' + (f.widthMm || f.width || '?') + ' × ' + (f.heightMm || f.height || '?') + ' mm</div>'
      + '<div style="color:#6b7280">' + (f.colour || '—') + (f.colourInt && f.colourInt !== f.colour ? ' / ' + f.colourInt + ' int' : '') + '</div>'
      + '<div style="color:#6b7280">' + (f.glassSpec || '—').replace(/_/g, ' ') + '</div>'
      + (f.profileSystem ? '<div style="color:#9ca3af;font-size:11px">' + f.profileSystem.replace(/_/g, ' ') + '</div>' : '')
      + '</div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:6px;border-top:1px solid #f0f0f0">'
      + (totalMin ? '<span style="font-size:11px;color:#3b82f6;font-weight:600">⏱ ' + totalMin + ' min</span>' : '<span style="font-size:11px;color:#d1d5db">No timing data</span>')
      + (f.installationType ? '<span style="font-size:10px;color:#9ca3af">' + f.installationType + '</span>' : '')
      + '</div></div>';
  });
  h += '</div>';
  return h;
}

function _reviewTabMaterials(frames) {
  var totalPerim = frames.reduce(function(s, f) {
    return s + 2 * (((f.widthMm || f.width || 0) + (f.heightMm || f.height || 0)) / 1000);
  }, 0);
  var totalGlassM2 = frames.reduce(function(s, f) {
    return s + ((f.widthMm || f.width || 0) / 1000) * ((f.heightMm || f.height || 0) / 1000);
  }, 0);
  var n = frames.length;

  var rows = [
    { cat: '🔲 Aluplast Profile',     req: (totalPerim * 1.1).toFixed(1) + ' m',  buf: '5%',  total: (totalPerim * 1.1 * 1.05).toFixed(1) + ' m' },
    { cat: '🔩 Steel Reinforcement',  req: (totalPerim * 0.8).toFixed(1) + ' m',  buf: '5%',  total: (totalPerim * 0.8 * 1.05).toFixed(1) + ' m' },
    { cat: '🪟 Glass IGUs',           req: totalGlassM2.toFixed(2) + ' m²',       buf: '0%',  total: totalGlassM2.toFixed(2) + ' m²' },
    { cat: '🪵 Timber Reveals',       req: (totalPerim * 1.2).toFixed(1) + ' m',  buf: '10%', total: (totalPerim * 1.2 * 1.10).toFixed(1) + ' m' },
    { cat: '🔧 Hardware Bundles',     req: n + ' kits',                             buf: '0%',  total: n + ' kits' },
    { cat: '📐 Glazing Beads',        req: (totalPerim * 0.9).toFixed(1) + ' m',  buf: '8%',  total: (totalPerim * 0.9 * 1.08).toFixed(1) + ' m' },
    { cat: '🪲 Fly Screen Profile',   req: Math.ceil(n * 0.7) + ' frames',         buf: '3%',  total: Math.ceil(n * 0.7 * 1.03) + ' frames' },
  ];

  var h = '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
    + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:13px;font-weight:700;margin:0">Estimated Material Requirements (CAD-derived)</h4></div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr><th class="th">Material</th><th class="th">Raw Requirement</th><th class="th">Miscut Buffer</th><th class="th">Order Quantity</th><th class="th">Stock Coverage</th></tr></thead><tbody>';
  rows.forEach(function(r, i) {
    h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
      + '<td class="td">' + r.cat + '</td>'
      + '<td class="td">' + r.req + '</td>'
      + '<td class="td" style="color:#f59e0b;font-weight:600">' + r.buf + '</td>'
      + '<td class="td" style="font-weight:700">' + r.total + '</td>'
      + '<td class="td" style="color:#9ca3af;font-size:11px">Available in Stage 2 Stock Module</td>'
      + '</tr>';
  });
  h += '</tbody></table>'
    + '<div style="padding:12px 16px;font-size:11px;color:#9ca3af;border-top:1px solid #f0f0f0">Stock vs requirement comparison unlocks when the Stock Module is configured (Stage 2).</div>'
    + '</div>';
  return h;
}

function _reviewTabOrders(job, frames) {
  var installDate = job.installDate || null;
  var glassDelivery = installDate ? new Date(new Date(installDate).getTime() - 86400000).toLocaleDateString('en-AU') : 'Day before install';
  var totalPerim = frames.reduce(function(s, f) {
    return s + 2 * (((f.widthMm || f.width || 0) + (f.heightMm || f.height || 0)) / 1000);
  }, 0);
  var glassSpecs = {};
  frames.forEach(function(f) {
    var spec = (f.glassSpec || 'standard').replace(/_/g, ' ');
    var m2 = ((f.widthMm || f.width || 0) / 1000) * ((f.heightMm || f.height || 0) / 1000);
    if (!glassSpecs[spec]) glassSpecs[spec] = { count: 0, m2: 0 };
    glassSpecs[spec].count++;
    glassSpecs[spec].m2 += m2;
  });

  var h = '';

  // Glass
  h += '<div class="card" style="padding:16px;margin-bottom:10px;border-left:4px solid #3b82f6">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:8px">🪟 Glass Order → Install Site (3-week lead)</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px"><thead><tr><th class="th">Spec</th><th class="th">Frames</th><th class="th">Area m²</th></tr></thead><tbody>';
  Object.keys(glassSpecs).forEach(function(spec) {
    h += '<tr><td class="td">' + spec + '</td><td class="td">' + glassSpecs[spec].count + '</td><td class="td">' + glassSpecs[spec].m2.toFixed(2) + '</td></tr>';
  });
  h += '</tbody></table>'
    + '<div style="font-size:12px;display:flex;gap:20px;flex-wrap:wrap;color:#374151">'
    + '<span>📍 Deliver to: <strong>' + (job.suburb || 'install address') + '</strong></span>'
    + '<span>📅 Target delivery: <strong>' + glassDelivery + '</strong></span>'
    + '</div></div>';

  // Aluplast
  h += '<div class="card" style="padding:16px;margin-bottom:10px;border-left:4px solid #7c3aed">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:6px">📦 Aluplast Profile → Factory (14-day lead)</div>'
    + '<div style="font-size:12px;color:#374151"><strong>' + (totalPerim * 1.1 * 1.05).toFixed(1) + ' m</strong> profile (raw ' + (totalPerim * 1.1).toFixed(1) + ' m + 5% miscut buffer)</div>'
    + '<div style="font-size:11px;color:#6b7280;margin-top:4px">Supplier: Aluplast Australia · sales@aluplast.com.au</div>'
    + '</div>';

  // Timber
  h += '<div class="card" style="padding:16px;margin-bottom:10px;border-left:4px solid #92400e">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:6px">🪵 Timber → Factory (5–7 day lead)</div>'
    + '<div style="font-size:12px;color:#374151"><strong>' + (totalPerim * 1.2 * 1.10).toFixed(1) + ' m</strong> reveals/architraves/trims (raw ' + (totalPerim * 1.2).toFixed(1) + ' m + 10% buffer)</div>'
    + '<div style="font-size:11px;color:#6b7280;margin-top:4px">Batched with pending timber orders.</div>'
    + '</div>';

  return h;
}

function _reviewTabCapacity(job, frames) {
  var stations = typeof FACTORY_STATIONS_FROM_MANUAL !== 'undefined' ? FACTORY_STATIONS_FROM_MANUAL : [];
  var stationMins = {};
  stations.forEach(function(s) { stationMins[s.id] = 0; });
  frames.forEach(function(f) {
    var times = f.stationTimes || {};
    stations.forEach(function(s) {
      (s.cadKeys || []).forEach(function(k) { stationMins[s.id] += (times[k] || 0); });
    });
  });
  var totalMins = Object.values(stationMins).reduce(function(s, v) { return s + v; }, 0);
  var bottleneckStation = stations.reduce(function(max, s) {
    var pct = (s.cap || 1) > 0 ? stationMins[s.id] / ((s.cap || 1) * 60) : 0;
    var maxPct = (max.cap || 1) > 0 ? stationMins[max.id || ''] / ((max.cap || 1) * 60) : 0;
    return pct > maxPct ? s : max;
  }, stations[0] || {});

  var h = '<div class="card" style="padding:16px;margin-bottom:12px">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:12px">Station Time Requirements</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    + '<thead><tr><th class="th">Station</th><th class="th">Total Minutes</th><th class="th">Hours</th><th class="th">Days @ Capacity</th></tr></thead><tbody>';
  stations.forEach(function(s, i) {
    var mins = stationMins[s.id] || 0;
    var capMins = (s.cap || 8) * 60;
    var days = capMins > 0 ? (mins / capMins).toFixed(1) : '—';
    var isBottleneck = bottleneckStation && s.id === bottleneckStation.id && mins > 0;
    h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + (isBottleneck ? ';background:#fff7ed' : '') + '">'
      + '<td class="td">' + (s.icon || '') + ' ' + s.name + (isBottleneck ? ' <span style="font-size:9px;background:#f59e0b;color:#fff;padding:1px 5px;border-radius:3px">BOTTLENECK</span>' : '') + '</td>'
      + '<td class="td" style="font-weight:600">' + mins + '</td>'
      + '<td class="td">' + (typeof formatMinutesAsHours === 'function' ? formatMinutesAsHours(mins, 'decimal') : (mins / 60).toFixed(1) + 'h') + '</td>'
      + '<td class="td" style="color:#6b7280">' + days + '</td>'
      + '</tr>';
  });
  h += '</tbody></table></div>';

  h += '<div class="card" style="padding:14px 18px;display:flex;gap:24px;flex-wrap:wrap">'
    // Hero-stat display intentionally uses verbose " hrs" suffix (not the
    // contract's 'h'); kept hand-rolled to preserve the Total Production
    // visual. Calculation is the same as formatMinutesAsHours(_,'decimal').
    + '<div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">Total Production</div><div style="font-size:18px;font-weight:800;color:#374151;font-family:Syne,sans-serif">' + totalMins + ' min <span style="font-size:13px;font-weight:500">(' + (totalMins / 60).toFixed(1) + ' hrs · ' + (typeof formatMinutesAsDays === 'function' ? formatMinutesAsDays(totalMins) : Math.ceil(totalMins / 480 * 2) / 2) + 'd)</span></div></div>'
    + (job.installDate ? '<div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.06em">Customer Install Date</div><div style="font-size:18px;font-weight:800;color:#374151;font-family:Syne,sans-serif">' + new Date(job.installDate).toLocaleDateString('en-AU') + '</div></div>' : '')
    + '</div>';
  return h;
}

function _reviewTabPayment(job, contact, invoices) {
  var depInv = invoices.find(function(inv) { return (inv.type || '').includes('dep'); });
  var cmInv  = invoices.find(function(inv) { return (inv.type || '').includes('cm') || (inv.type || '').includes('progress'); });

  var h = '<div class="card" style="padding:16px;margin-bottom:12px">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:12px">Customer Details</div>';
  if (contact) {
    h += '<div style="display:flex;gap:12px;align-items:center;padding:12px;background:#f9fafb;border-radius:8px;margin-bottom:12px">'
      + '<div style="width:44px;height:44px;background:#c41230;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:15px">' + (contact.fn[0] || '') + (contact.ln ? contact.ln[0] : '') + '</div>'
      + '<div><div style="font-weight:700;font-size:14px">' + contact.fn + ' ' + contact.ln + '</div>'
      + '<div style="font-size:12px;color:#6b7280">' + (contact.email || '—') + (contact.phone ? ' · ' + contact.phone : '') + '</div>'
      + (contact.suburb ? '<div style="font-size:12px;color:#9ca3af">' + contact.suburb + '</div>' : '')
      + '</div></div>';
  }

  var rows = [
    { label: '5% Deposit', inv: depInv, gate: false },
    { label: '45% Progress Claim', inv: cmInv, gate: true, gateLabel: 'Gates Send to Factory' },
  ];
  rows.forEach(function(row) {
    var paid = row.inv && row.inv.status === 'Paid';
    var col = paid ? '#22c55e' : row.gate ? '#ef4444' : '#f59e0b';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid #f0f0f0">'
      + '<div><div style="font-size:13px;font-weight:600">' + row.label + '</div>'
      + (row.gate ? '<div style="font-size:10px;color:#9ca3af">' + row.gateLabel + '</div>' : '')
      + '</div>'
      + '<span style="font-size:12px;font-weight:700;color:' + col + '">'
      + (paid ? '✅ Paid' : row.inv ? '⏳ Invoiced — unpaid ($' + Number(row.inv.total || 0).toLocaleString() + ')' : '— Not yet invoiced')
      + '</span></div>';
  });

  h += '</div>';
  return h;
}

// ═════════════════════════════════════════════════════════════════════════════
// QC CHECKLIST PAGE
// ═════════════════════════════════════════════════════════════════════════════

function renderQCPage() {
  var items = getFactoryItems();
  var qcStore = getQCStore();

  if (_qcActiveFrameId) return '<div>' + _renderQCChecklist(_qcActiveFrameId, items, qcStore) + '</div>';

  // Frames eligible for QC: at reveals or dispatch station, not yet QC passed
  var eligible = items.filter(function(i) { return (i.station === 'reveals' || i.station === 'dispatch') && !i.qcPassedAt; });
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
    h += '<div class="card" style="padding:40px;text-align:center;color:#9ca3af"><div style="font-size:36px;margin-bottom:8px">✅</div><div style="font-size:14px;font-weight:600;color:#374151;margin-bottom:4px">No frames awaiting QC</div><div style="font-size:12px">Frames appear here when they reach the Reveals or Dispatch station.</div></div>';
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
    return i.id === frameId ? Object.assign({}, i, { qcPassedAt: new Date().toISOString(), station: 'dispatch' }) : i;
  });
  saveFactoryItems(updated);
  _qcActiveFrameId = null;
  addToast('QC passed — frame moved to Dispatch bay queue', 'success');
  renderPage();
}

window.qcTick = qcTick;
window.qcFail = qcFail;
window.qcPass = qcPass;

// ═════════════════════════════════════════════════════════════════════════════
// BAY MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

function renderBayManagement() {
  var bays  = getBays();
  var items = getFactoryItems();
  var orders = getFactoryOrders();

  if (_baySelectedId) {
    var selBay = bays.find(function(b) { return b.id === _baySelectedId; });
    if (selBay) return '<div>' + _renderBayDetail(selBay, bays, items, orders) + _renderHoldModal() + '</div>';
  }

  var dispatchReady = items.filter(function(i) { return i.station === 'dispatch' && i.qcPassedAt && !i.bayId; });
  var inBay = items.filter(function(i) { return !!i.bayId; });

  var h = '<div style="margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">'
    + '<div><h2 style="font-family:Syne,sans-serif;font-weight:800;font-size:24px;margin:0">🚛 Bay Management</h2>'
    + '<p style="color:#6b7280;font-size:13px;margin:4px 0 0">Assign QC-passed frames to dispatch bays, run bay closure checklists</p></div>'
    + '</div>';

  // KPI strip
  var openBays   = bays.filter(function(b) { return !b.closedAt && inBay.filter(function(i){return i.bayId===b.id;}).length>0; }).length;
  var closedBays = bays.filter(function(b) { return !!b.closedAt; }).length;
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">';
  [{l:'Unassigned (QC Passed)',v:dispatchReady.length,c:'#f59e0b'},{l:'In Bays',v:inBay.length,c:'#3b82f6'},{l:'Bays Active',v:openBays,c:'#a855f7'},{l:'Bays Closed',v:closedBays,c:'#22c55e'}]
    .forEach(function(k){h+='<div class="card" style="padding:14px 18px;border-left:4px solid '+k.c+'"><div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase">'+k.l+'</div><div style="font-size:24px;font-weight:800;font-family:Syne,sans-serif;color:'+k.c+';margin-top:4px">'+k.v+'</div></div>';});
  h += '</div>';

  // Bay grid
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px">';
  bays.forEach(function(bay) {
    var bayItems = items.filter(function(i) { return i.bayId === bay.id; });
    var jobRefs = [];
    bayItems.forEach(function(i) { if (i.jobRef && !jobRefs.includes(i.jobRef)) jobRefs.push(i.jobRef); });
    var closed = !!bay.closedAt;
    var col = closed ? '#22c55e' : bayItems.length > 0 ? '#3b82f6' : '#d1d5db';
    h += '<div class="card" style="padding:14px;border-left:4px solid ' + col + ';cursor:pointer;transition:box-shadow .15s" onmouseenter="this.style.boxShadow=\'0 4px 12px #0000001a\'" onmouseleave="this.style.boxShadow=\'\'" data-action="ops-select-bay" data-bay-id="' + bay.id + '">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">'
      + '<span style="font-size:14px;font-weight:800;font-family:Syne,sans-serif">Bay ' + bay.number + '</span>'
      + (closed ? '<span style="font-size:9px;background:#22c55e;color:#fff;padding:2px 6px;border-radius:10px">CLOSED</span>' : bayItems.length > 0 ? '<span style="font-size:9px;background:#3b82f620;color:#3b82f6;padding:2px 6px;border-radius:10px;border:1px solid #3b82f640">ACTIVE</span>' : '<span style="font-size:9px;color:#d1d5db">EMPTY</span>')
      + '</div>'
      + '<div style="font-size:22px;font-weight:800;color:' + col + ';font-family:Syne,sans-serif">' + bayItems.length + '</div>'
      + '<div style="font-size:10px;color:#6b7280">frames</div>'
      + (jobRefs.length ? '<div style="font-size:10px;color:#374151;margin-top:4px;font-weight:600">' + jobRefs.join(', ') + '</div>' : '')
      + '</div>';
  });
  h += '</div>';

  // Unassigned frames
  if (dispatchReady.length) {
    h += '<div class="card" style="padding:0;overflow:hidden">'
      + '<div style="padding:14px 20px;border-bottom:1px solid #f0f0f0"><h4 style="font-size:14px;font-weight:700;margin:0">📦 QC-Passed — Awaiting Bay Assignment (' + dispatchReady.length + ')</h4></div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Frame</th><th class="th">Job</th><th class="th">Product</th><th class="th">Dimensions</th><th class="th">Assign to Bay</th></tr></thead><tbody>';
    dispatchReady.forEach(function(item, i) {
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-weight:700;color:#c41230">' + (item.name || item.id) + '</td>'
        + '<td class="td">' + (item.jobRef || '—') + '</td>'
        + '<td class="td">' + formatProductType(item.productType) + '</td>'
        + '<td class="td">' + (item.widthMm || item.width || '?') + '×' + (item.heightMm || item.height || '?') + '</td>'
        + '<td class="td"><select data-action="ops-assign-frame-to-bay" data-frame-id="' + item.id + '" style="border:1px solid #e5e7eb;border-radius:6px;padding:4px 8px;font-size:11px;font-family:inherit"><option value="">Assign to bay…</option>'
        + bays.filter(function(b) { return !b.closedAt; }).map(function(b) { return '<option value="' + b.id + '">Bay ' + b.number + '</option>'; }).join('')
        + '</select></td>'
        + '</tr>';
    });
    h += '</tbody></table></div>';
  }

  return '<div>' + h + '</div>';
}

function _renderBayDetail(bay, bays, items, orders) {
  var bayItems = items.filter(function(i) { return i.bayId === bay.id; });
  var checklist = bay.checklist || {};
  var allTicked = BAY_CLOSURE_ITEMS.every(function(_, idx) { return checklist[idx]; });

  var h = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">'
    + '<button data-action="ops-back-from-bay" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:18px;padding:4px 8px;border-radius:6px">← Bays</button>'
    + '<h3 style="font-size:20px;font-weight:800;font-family:Syne,sans-serif;margin:0">Bay ' + bay.number + '</h3>'
    + (bay.closedAt ? '<span style="color:#22c55e;font-size:12px;font-weight:600">✅ Closed ' + new Date(bay.closedAt).toLocaleString('en-AU') + '</span>' : '')
    + '</div>';

  // Frame manifest
  h += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">'
    + '<div style="padding:12px 16px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">'
    + '<h4 style="font-size:13px;font-weight:700;margin:0">Frame Manifest (' + bayItems.length + ')</h4>'
    + (!bay.closedAt ? '<select data-action="ops-assign-frame-to-bay-detail" data-bay-id="' + bay.id + '" style="border:1px solid #e5e7eb;border-radius:6px;padding:4px 8px;font-size:11px;font-family:inherit"><option value="">+ Add frame…</option>'
      + items.filter(function(i){return i.station==='dispatch'&&i.qcPassedAt&&!i.bayId;}).map(function(i){return '<option value="'+i.id+'">'+(i.name||i.id)+' ('+( i.jobRef||'')+') </option>';}).join('')
      + '</select>' : '')
    + '</div>';
  if (!bayItems.length) {
    h += '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px">No frames assigned yet.</div>';
  } else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th class="th">Frame</th><th class="th">Job</th><th class="th">Product</th><th class="th">Dimensions</th><th class="th">QC</th></tr></thead><tbody>';
    bayItems.forEach(function(item, i) {
      h += '<tr style="' + (i % 2 ? 'background:#fafafa' : '') + '">'
        + '<td class="td" style="font-weight:700;color:#c41230">' + (item.name || item.id) + '</td>'
        + '<td class="td">' + (item.jobRef || '—') + '</td>'
        + '<td class="td">' + formatProductType(item.productType) + '</td>'
        + '<td class="td">' + (item.widthMm || item.width || '?') + '×' + (item.heightMm || item.height || '?') + '</td>'
        + '<td class="td">' + (item.qcPassedAt ? '<span style="color:#22c55e;font-weight:600">✅ Passed</span>' : '<span style="color:#f59e0b">⏳ Pending</span>') + '</td>'
        + '</tr>';
    });
    h += '</tbody></table>';
  }
  h += '</div>';

  // Closure checklist
  if (!bay.closedAt) {
    h += '<div class="card" style="padding:16px">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:6px">🔒 Bay Closure Checklist</div>'
      + '<div style="font-size:12px;color:#6b7280;margin-bottom:12px">Every item must be ticked before the bay can be closed. Software-locked.</div>';
    BAY_CLOSURE_ITEMS.forEach(function(label, idx) {
      var ticked = !!checklist[idx];
      h += '<div data-action="ops-toggle-bay-checklist" data-bay-id="' + bay.id + '" data-idx="' + idx + '" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid ' + (ticked ? '#bbf7d0' : '#e5e7eb') + ';border-radius:8px;margin-bottom:6px;background:' + (ticked ? '#f0fdf4' : '#fff') + ';cursor:pointer;user-select:none">'
        + '<div style="width:22px;height:22px;border-radius:50%;border:2px solid ' + (ticked ? '#22c55e' : '#d1d5db') + ';background:' + (ticked ? '#22c55e' : '#fff') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#fff">' + (ticked ? '✓' : '') + '</div>'
        + '<span style="font-size:13px;color:' + (ticked ? '#15803d' : '#374151') + ';font-weight:' + (ticked ? '600' : '400') + '">' + (idx + 1) + '. ' + label + '</span>'
        + '</div>';
    });
    h += '<div style="margin-top:14px">'
      + (allTicked && bayItems.length > 0
        ? '<button data-action="ops-close-bay" data-bay-id="' + bay.id + '" style="width:100%;padding:14px;background:#22c55e;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">🚛 Close Bay — Notify Install Crew</button>'
        : '<div style="padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;text-align:center;font-size:12px;color:#9ca3af">Tick all ' + BAY_CLOSURE_ITEMS.length + ' items and ensure at least 1 frame is assigned</div>')
      + '</div></div>';
  }

  return h;
}

function bayAssignFrame(frameId, bayId) {
  if (!bayId || !frameId) return;
  var items = getFactoryItems();
  saveFactoryItems(items.map(function(i) {
    return i.id === frameId ? Object.assign({}, i, { bayId: bayId }) : i;
  }));
  addToast('Frame assigned to bay', 'success');
  renderPage();
}

function bayToggleChecklist(bayId, idx) {
  var bays = getBays();
  saveBays(bays.map(function(b) {
    if (b.id !== bayId) return b;
    var cl = Object.assign({}, b.checklist || {});
    cl[idx] = !cl[idx];
    return Object.assign({}, b, { checklist: cl });
  }));
  renderPage();
}

function bayClose(bayId) {
  if (!confirm('Close Bay ' + bayId.replace('bay_', '') + ' and notify the install crew?\n\nThis cannot be undone.')) return;
  var bays = getBays();
  saveBays(bays.map(function(b) {
    return b.id === bayId ? Object.assign({}, b, { closedAt: new Date().toISOString() }) : b;
  }));
  _baySelectedId = null;
  addToast('Bay closed — install crew notified ✅', 'success');
  renderPage();
}

window.bayAssignFrame   = bayAssignFrame;
window.bayToggleChecklist = bayToggleChecklist;
window.bayClose         = bayClose;
window.showHoldModal    = showHoldModal;
window.applyHold        = applyHold;
window.releaseHold      = releaseHold;
window.bounceToSales    = bounceToSales;
window.renderJobsToReview = renderJobsToReview;
window.renderQCPage       = renderQCPage;
window.renderBayManagement = renderBayManagement;
