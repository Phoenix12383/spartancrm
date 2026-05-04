// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08f-sales-deal-transitions.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Deal type picker, won/lost/unwind transitions, reasons.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────

defineAction('transitions-close-deal-type-picker', function(target, ev) {
  closeDealTypePicker();
});

defineAction('transitions-close-deal-type-picker-modal-bg', function(target, ev) {
  if (ev.target === target) closeDealTypePicker();
});

defineAction('transitions-set-deal-type-residential', function(target, ev) {
  var dealId = target.dataset.dealId;
  setDealType(dealId, 'residential');
});

defineAction('transitions-set-deal-type-commercial', function(target, ev) {
  var dealId = target.dataset.dealId;
  setDealType(dealId, 'commercial');
});

defineAction('transitions-select-won-quote', function(target, ev) {
  var quoteId = target.value;
  selectWonQuote(quoteId);
});

defineAction('transitions-won-quote-label-click', function(target, ev) {
  ev.stopPropagation();
});

defineAction('transitions-view-won-deal-quote', function(target, ev) {
  ev.stopPropagation();
  var dealId = target.dataset.dealId;
  var quoteId = target.dataset.quoteId;
  viewDealQuote(dealId, quoteId);
});

defineAction('transitions-cancel-won-quote-selection-modal-bg', function(target, ev) {
  if (ev.target === target) cancelWonQuoteSelection();
});

defineAction('transitions-cancel-won-quote-selection', function(target, ev) {
  cancelWonQuoteSelection();
});

defineAction('transitions-confirm-won-quote-selection', function(target, ev) {
  confirmWonQuoteSelection();
});

defineAction('transitions-cancel-unwind-deal-modal-bg', function(target, ev) {
  if (ev.target === target) cancelUnwindDealWon();
});

defineAction('transitions-cancel-unwind-deal', function(target, ev) {
  cancelUnwindDealWon();
});

defineAction('transitions-confirm-unwind-deal', function(target, ev) {
  confirmUnwindDealWon();
});

defineAction('transitions-cancel-deal-won-modal-bg', function(target, ev) {
  if (ev.target === target) cancelDealWon();
});

defineAction('transitions-confirm-deal-won-cod', function(target, ev) {
  confirmDealWon('cod');
});

defineAction('transitions-confirm-deal-won-zip', function(target, ev) {
  confirmDealWon('zip');
});

defineAction('transitions-cancel-deal-won', function(target, ev) {
  cancelDealWon();
});

defineAction('transitions-cancel-lost-transition-modal-bg', function(target, ev) {
  if (ev.target === target) cancelLostTransition();
});

defineAction('transitions-cancel-lost-transition', function(target, ev) {
  cancelLostTransition();
});

defineAction('transitions-set-lost-reason-draft', function(target, ev) {
  var reasonId = target.value;
  setLostReasonDraft(reasonId);
});

defineAction('transitions-set-lost-competitor-draft', function(target, ev) {
  setLostCompetitorDraft(target.value);
});

defineAction('transitions-set-lost-details-draft', function(target, ev) {
  setLostDetailsDraft(target.value);
});

defineAction('transitions-confirm-lost-transition', function(target, ev) {
  confirmLostTransition();
});

// ────────────────────────────────────────────────────────────────────────────

function moveDealToStage(dealId, stageId, opts) {
  opts = opts || {};
  const { deals } = getState();
  const deal = deals.find(d => d.id === dealId);
  if (!deal) return;
  const pl = PIPELINES.find(p => p.id === deal.pid);
  const stage = pl ? pl.stages.find(s => s.id === stageId) : null;
  // Step 4 §1: programmatic stage change to a won stage must route through the
  // quote-selection gate unless we're being called from inside the commit path.
  if (stage && stage.isWon && !opts.skipWonGate) {
    _requestWonTransition(dealId, stageId, { source: opts.source || 'stage-change' });
    return;
  }
  // Brief 1: programmatic stage change to a Lost stage must route through the
  // reason-capture modal. Skip if the deal is already lost (re-entry on drag-
  // and-drop within the Lost lane shouldn't re-prompt).
  if (stage && stage.isLost && !opts.skipLostGate && !deal.lost) {
    _requestLostTransition(dealId, stageId, { source: opts.source || 'stage-change' });
    return;
  }
  const act = {
    id: 'a' + Date.now(), type: 'stage',
    text: 'Stage changed to: ' + (stage ? stage.name : stageId),
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: '',
  };
  var _wd = (stage && stage.isWon) ? new Date().toISOString().slice(0, 10) : (deal.wonDate || null);
  // Brief 4 Phase 2: track stage entry timestamps so the commission engine's
  // age-penalty calculation can derive daysToWin from the relevant
  // "active sales engagement" stage entry (Quote Sent / Proposal Sent in
  // the seed pipelines). Most-recent entry wins on re-entry — matches the
  // intended semantics where a deal that bounces back into Quote Sent
  // restarts its age clock for penalty purposes. Pre-Phase-2 deals
  // without history fall back to deal.created in the calc engine.
  var _stageHistory = Object.assign({}, deal.stageHistory || {});
  _stageHistory[stageId] = new Date().toISOString();
  setState({
    deals: deals.map(d => d.id === dealId
      ? {
        ...d, sid: stageId,
        won: !!(stage && stage.isWon),
        lost: !!(stage && stage.isLost),
        wonDate: _wd,
        stageHistory: _stageHistory,
        activities: [act, ...(d.activities || [])]
      }
      : d)
  });
  dbUpdate('deals', dealId, { sid: stageId, won: !!(stage && stage.isWon), lost: !!(stage && stage.isLost), won_date: _wd, stage_history: _stageHistory });
  dbInsert('activities', actToDb(act, 'deal', dealId));
  if (stage && stage.isWon) { addToast('🎉 Deal Won!', 'success'); }
  // Audit (Brief 2 Phase 2). The Won + Lost transitions write their own
  // audit entries via _commitWon / confirmLostTransition, so this only fires
  // for ordinary mid-pipeline stage moves.
  if (typeof appendAuditEntry === 'function' && !(stage && stage.isWon) && !(stage && stage.isLost)) {
    appendAuditEntry({
      entityType:'deal', entityId:dealId, action:'deal.stage_changed',
      summary:'Stage changed to ' + (stage ? stage.name : stageId),
      before:{ sid:deal.sid }, after:{ sid:stageId },
      metadata:{ source: opts.source || 'stage-change' },
      branch: deal.branch || null,
    });
  }
}

function _dealTypeBadge(d) {
  if (!d) return '';
  var t = d.dealType;
  if (t !== 'residential' && t !== 'commercial') return Badge('Untyped', 'gray');
  var label = t === 'commercial' ? 'Commercial' : 'Residential';
  return Badge(label, t === 'commercial' ? 'purple' : 'blue');
}

function _dealTypeStripeColor(d) {
  if (!d) return 'transparent';
  if (d.dealType === 'commercial') return '#6d28d9';
  if (d.dealType === 'residential') return '#1d4ed8';
  return 'transparent'; // legacy (pre-backfill) deals get no stripe
}

function openDealTypePicker(dealId) {
  var d = (getState().deals || []).find(function (x) { return x.id === dealId; });
  if (!d) return;
  if (typeof canEditDeal === 'function' && !canEditDeal(d)) {
    addToast('Only the deal owner or an admin can change the deal type', 'error');
    return;
  }
  _pendingDealTypePicker = dealId;
  renderPage();
}

function closeDealTypePicker() {
  _pendingDealTypePicker = null;
  renderPage();
}

function setDealType(dealId, newType) {
  if (newType !== 'residential' && newType !== 'commercial') return;
  var d = (getState().deals || []).find(function (x) { return x.id === dealId; });
  if (!d) { _pendingDealTypePicker = null; renderPage(); return; }
  if (typeof canEditDeal === 'function' && !canEditDeal(d)) {
    addToast('Only the deal owner or an admin can change the deal type', 'error');
    _pendingDealTypePicker = null;
    renderPage();
    return;
  }
  if (d.dealType === newType) { _pendingDealTypePicker = null; renderPage(); return; }

  var oldType = d.dealType || null;
  var oldLabel = oldType === 'commercial' ? 'Commercial' : (oldType === 'residential' ? 'Residential' : 'Untyped');
  var newLabel = newType === 'commercial' ? 'Commercial' : 'Residential';

  var user = (typeof getCurrentUser === 'function' ? getCurrentUser() : null) || { name: 'Unknown' };
  var now = new Date();
  var actObj = {
    id: 'a' + Date.now(),
    type: 'edit',
    subject: user.name + ' changed deal type',
    text: 'Type: "' + oldLabel + '" → "' + newLabel + '"',
    by: user.name,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 5),
    done: false,
    changes: [{ field: 'dealType', label: 'Type', from: oldLabel, to: newLabel }],
  };

  var updated = Object.assign({}, d, { dealType: newType });
  updated.activities = [actObj].concat(d.activities || []);
  setState({
    deals: getState().deals.map(function (x) { return x.id === dealId ? updated : x; }),
  });

  // Persist. dbUpdate sends just the deal_type column (snake_case) — the
  // rest of the row is unchanged; this avoids round-tripping through
  // dealToDb which would re-send everything.
  try { dbUpdate('deals', dealId, { deal_type: newType }); } catch (e) {}
  try { dbInsert('activities', actToDb(actObj, 'deal', dealId)); } catch (e) {}

  // Audit (Brief 2 Phase 2 pattern). Distinct metadata.source so the
  // Audit page filter can isolate type-picker edits from drawer edits.
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType: 'deal', entityId: dealId, action: 'deal.field_edited',
      summary: 'Changed type on "' + (updated.title || dealId) + '" — ' + oldLabel + ' → ' + newLabel,
      before: { dealType: oldType },
      after:  { dealType: newType },
      metadata: { source: 'dealtype-picker' },
      branch: updated.branch || null,
    });
  }

  _pendingDealTypePicker = null;
  addToast('Deal type set to ' + newLabel, 'success');
  renderPage();
}

function renderDealTypePickerModal() {
  if (!_pendingDealTypePicker) return '';
  var d = (getState().deals || []).find(function (x) { return x.id === _pendingDealTypePicker; });
  if (!d) return '';
  var cur = d.dealType;
  var resOn = cur === 'residential';
  var comOn = cur === 'commercial';
  return '' +
    '<div class="modal-bg" data-action="transitions-close-deal-type-picker-modal-bg">' +
      '<div class="modal" style="max-width:480px">' +
        '<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">' +
          '<h3 style="margin:0;font-size:16px;font-weight:700">Change deal type</h3>' +
          '<button data-action="transitions-close-deal-type-picker" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>' +
        '</div>' +
        '<div style="padding:22px;display:flex;flex-direction:column;gap:12px">' +
          '<div style="font-size:12px;color:#6b7280;line-height:1.4">Current: ' + _dealTypeBadge(d) + '. Pick a new type to apply immediately — the change is recorded in the deal\'s activity timeline and the audit log.</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
            '<button data-action="transitions-set-deal-type-residential" data-deal-id="' + d.id + '" style="cursor:pointer;border:2px solid ' + (resOn ? '#1d4ed8' : '#e5e7eb') + ';border-radius:10px;padding:14px;background:' + (resOn ? '#eff6ff' : '#fff') + ';transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px;text-align:left;font-family:inherit">' +
              '<span style="font-size:13px;font-weight:700;color:#1a1a1a">Residential' + (resOn ? ' <span style="font-weight:500;color:#1d4ed8">· current</span>' : '') + '</span>' +
              '<span style="font-size:11px;color:#6b7280;line-height:1.35">Single home, owner-occupied</span>' +
            '</button>' +
            '<button data-action="transitions-set-deal-type-commercial" data-deal-id="' + d.id + '" style="cursor:pointer;border:2px solid ' + (comOn ? '#6d28d9' : '#e5e7eb') + ';border-radius:10px;padding:14px;background:' + (comOn ? '#f5f3ff' : '#fff') + ';transition:border-color .12s,background .12s;display:flex;flex-direction:column;gap:4px;text-align:left;font-family:inherit">' +
              '<span style="font-size:13px;font-weight:700;color:#1a1a1a">Commercial' + (comOn ? ' <span style="font-weight:500;color:#6d28d9">· current</span>' : '') + '</span>' +
              '<span style="font-size:11px;color:#6b7280;line-height:1.35">Builder, body corp, rental, retail</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end">' +
          '<button class="btn-w" data-action="transitions-close-deal-type-picker">Cancel</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function _findWonStageId(deal) {
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  if (!pl) return null;
  var ws = (pl.stages || []).find(function (s) { return s.isWon; });
  return ws ? ws.id : null;
}

function _findFallbackStageId(deal) {
  // First non-won non-lost stage by ord — used when preWonStageId is null on unwind.
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  if (!pl) return deal.sid;
  var candidates = (pl.stages || [])
    .filter(function (s) { return !s.isWon && !s.isLost; })
    .sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); });
  return candidates.length ? candidates[0].id : deal.sid;
}

function _requestWonTransition(dealId, targetStageId, opts) {
  opts = opts || {};
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  // Resolve target stage — fall back to the pipeline's won stage if caller didn't pass one.
  var resolvedStageId = targetStageId || _findWonStageId(deal);
  if (!resolvedStageId) { addToast('No won stage configured for this pipeline', 'error'); return; }

  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];
  if (quotes.length === 0) {
    addToast('A quote must be designed in CAD before this deal can be won', 'error');
    return;
  }
  if (quotes.length === 1) {
    // Single-quote case: skip the radio modal but still require confirmation.
    var q = quotes[0];
    var label = (q.label || 'Quote 1') + ' ($' + Math.round(q.totalPrice || 0).toLocaleString()
      + ', ' + (q.frameCount || (q.projectItems || []).length) + ' frame'
      + ((q.frameCount || (q.projectItems || []).length) === 1 ? '' : 's') + ')';
    if (!confirm('Mark deal as Won with ' + label + '?')) return;
    _commitWon(dealId, resolvedStageId, q.id);
    return;
  }
  // 2+ quotes: default to active quote, fall back to first.
  var defaultId = (deal.activeQuoteId && quotes.some(function (q) { return q.id === deal.activeQuoteId; }))
    ? deal.activeQuoteId : quotes[0].id;
  _pendingWonQuoteSelection = { dealId: dealId, targetStageId: resolvedStageId, selectedQuoteId: defaultId };
  renderPage();
}

function selectWonQuote(quoteId) {
  if (!_pendingWonQuoteSelection) return;
  _pendingWonQuoteSelection.selectedQuoteId = quoteId;
  renderPage();
}

function cancelWonQuoteSelection() {
  _pendingWonQuoteSelection = null;
  renderPage();
}

function confirmWonQuoteSelection() {
  var pend = _pendingWonQuoteSelection;
  if (!pend || !pend.selectedQuoteId) return;
  _pendingWonQuoteSelection = null;
  _commitWon(pend.dealId, pend.targetStageId, pend.selectedQuoteId);
}

function _commitWon(dealId, targetStageId, selectedQuoteId) {
  var st0 = getState();
  var deal = (st0.deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];
  var selectedQuote = quotes.find(function (q) { return q.id === selectedQuoteId; });
  if (!selectedQuote) { addToast('Selected quote not found', 'error'); return; }

  // Capture the pre-won stage so unwind can restore it. If the deal is already
  // sitting on the won stage for some reason, fall back to a sensible non-won stage.
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  var currentStage = pl ? (pl.stages || []).find(function (s) { return s.id === deal.sid; }) : null;
  var preWonStageId = (currentStage && currentStage.isWon) ? _findFallbackStageId(deal) : deal.sid;

  var todayStr = new Date().toISOString().slice(0, 10);
  var wonPrice = (typeof selectedQuote.totalPrice === 'number') ? selectedQuote.totalPrice : (deal.val || 0);

  // Build the new cadData mirror to match the won quote (same shape as setActiveDealQuote writes).
  var newCadData = {
    projectItems: selectedQuote.projectItems || [],
    totalPrice: selectedQuote.totalPrice || 0,
    savedAt: selectedQuote.savedAt || null,
    quoteNumber: selectedQuote.quoteNumber || '',
    projectName: (deal.cadData && deal.cadData.projectName) || deal.title || '',
    // (v3.1) Carry the time totals onto the cadData mirror so that the
    // deal-to-job conversion below can seed job.estimatedInstallMinutes
    // etc. directly without re-reading the won quote separately.
    totals: selectedQuote.totals || null
  };

  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: 'Deal won with ' + (selectedQuote.label || 'Quote') + ' ($' + Math.round(wonPrice).toLocaleString() + ')',
    date: todayStr,
    time: new Date().toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name,
    done: false, dueDate: '',
  };

  setState({
    deals: st0.deals.map(function (d) {
      if (d.id !== dealId) return d;
      return Object.assign({}, d, {
        wonQuoteId: selectedQuoteId,
        won: true,
        lost: false,
        wonDate: todayStr,
        sid: targetStageId,
        activeQuoteId: selectedQuoteId,
        val: wonPrice,
        preWonStageId: preWonStageId,
        cadData: newCadData,
        activities: [act, ...(d.activities || [])]
      });
    })
  });

  dbUpdate('deals', dealId, {
    won_quote_id: selectedQuoteId,
    won: true,
    lost: false,
    won_date: todayStr,
    active_quote_id: selectedQuoteId,
    sid: targetStageId,
    val: wonPrice,
    pre_won_stage_id: preWonStageId,
    cad_data: newCadData
  });
  dbInsert('activities', actToDb(act, 'deal', dealId));

  // Audit (Brief 2 Phase 2).
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType:'deal', entityId:dealId, action:'deal.won_marked',
      summary:'Deal won: ' + (deal.title||'') + ' \u2014 $' + Math.round(wonPrice).toLocaleString(),
      before:{ sid: deal.sid, won: false },
      after:{ sid: targetStageId, won: true, wonDate: todayStr, wonQuoteId: selectedQuoteId, val: wonPrice },
      metadata:{ quoteLabel: selectedQuote.label || null, quoteNumber: selectedQuote.quoteNumber || null },
      branch: deal.branch || null,
    });
  }

  // Brief 4 Phase 3: accrue commission on Won. accrueCommission is
  // idempotent \u2014 re-running on an already-accrued deal is a no-op so a
  // setState replay or Won-button double-click can't promote state
  // inadvertently. If the rep's effective realisation gate is 'won'
  // (default), accrueCommission also auto-realises so the deal is
  // immediately payable via toggleCommissionPaid. The post-update deal
  // record (with won/wonDate/val/wonQuoteId set) is passed so the rule
  // lookup uses the correct rep+branch context.
  if (typeof accrueCommission === 'function') {
    var _accrueDeal = Object.assign({}, deal, {
      won: true,
      wonDate: todayStr,
      wonQuoteId: selectedQuoteId,
      val: wonPrice,
    });
    try { accrueCommission(_accrueDeal); } catch (e) { /* defensive \u2014 never block the won flow */ }
  }

  addToast('\ud83c\udf89 Deal Won!', 'success');

  // Chain into the existing payment-method modal. confirmDealWon() now only
  // needs to persist paymentMethod + create the job — the won state is already written.
  _pendingWonDealId = dealId;
  renderPage();
}

function markDealWon(dealId) {
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  // Step 4: route through the gate. It handles zero/one/two+ quote cases and
  // chains into the payment-method modal on confirmation.
  var wonStageId = _findWonStageId(deal);
  _requestWonTransition(dealId, wonStageId, { source: 'mark-button' });
}

function confirmDealWon(paymentMethod) {
  var dealId = _pendingWonDealId;
  _pendingWonDealId = null;
  var modal = document.getElementById('payMethodModal');
  if (modal) modal.style.display = 'none';
  if (!dealId) return;

  // At this point _commitWon has already run — the deal is already won, at the
  // won stage, with wonQuoteId set. All that's left is persisting the payment
  // method and kicking off job creation.
  setState({ deals: getState().deals.map(function (d) { return d.id === dealId ? Object.assign({}, d, { paymentMethod: paymentMethod }) : d; }) });
  dbUpdate('deals', dealId, { payment_method: paymentMethod });
  addToast('Payment method: ' + (paymentMethod === 'zip' ? 'Zip Money' : 'COD'), 'info');

  var updatedDeal = getState().deals.find(function (d) { return d.id === dealId; });
  if (updatedDeal && !updatedDeal.jobRef) {
    createJobFromWonDeal(updatedDeal, paymentMethod);
  }
}

function cancelDealWon() {
  _pendingWonDealId = null;
  var modal = document.getElementById('payMethodModal');
  if (modal) modal.style.display = 'none';
}

function renderWonQuoteSelectionModal() {
  var pend = _pendingWonQuoteSelection;
  if (!pend) return '';
  var deal = (getState().deals || []).find(function (d) { return d.id === pend.dealId; });
  if (!deal) return '';
  var quotes = Array.isArray(deal.quotes) ? deal.quotes : [];

  var rowsHtml = quotes.map(function (q) {
    var sel = q.id === pend.selectedQuoteId;
    var frameCount = (typeof q.frameCount === 'number') ? q.frameCount : (q.projectItems || []).length;
    var savedAtStr = q.savedAt ? new Date(q.savedAt).toLocaleDateString('en-AU') : '\u2014';
    var isActive = deal.activeQuoteId === q.id;
    var rowBg = sel ? '#f0fdf4' : '#ffffff';
    var rowBorder = sel ? '#86efac' : '#e5e7eb';
    return '<label style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:' + rowBg + ';border:1px solid ' + rowBorder + ';border-radius:8px;margin-bottom:8px;cursor:pointer" data-action="transitions-won-quote-label-click">'
      + '<input type="radio" name="wonQuote" value="' + q.id + '" ' + (sel ? 'checked' : '') + ' data-on-change="transitions-select-won-quote" style="margin-top:3px;accent-color:#c41230">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-size:13px;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:8px">'
      + (q.label || 'Quote')
      + (isActive ? '<span style="font-size:9px;color:#6b7280;font-weight:500">(currently active)</span>' : '')
      + '</div>'
      + '<div style="font-size:12px;color:#6b7280;margin-top:3px">' + frameCount + ' frame' + (frameCount === 1 ? '' : 's') + ' \u00b7 $' + Math.round(q.totalPrice || 0).toLocaleString() + '</div>'
      + '<div style="font-size:11px;color:#9ca3af;margin-top:2px">Saved: ' + savedAtStr
      + '  <a href="javascript:void(0)" data-action="transitions-view-won-deal-quote" data-deal-id="' + deal.id + '" data-quote-id="' + q.id + '" style="color:#c41230;text-decoration:none;margin-left:10px">View design \u2192</a>'
      + '</div>'
      + '</div>'
      + '</label>';
  }).join('');

  var canContinue = !!pend.selectedQuoteId;
  return '<div id="wonQuoteModal" class="modal-bg" style="display:flex" data-action="transitions-cancel-won-quote-selection-modal-bg">'
    + '<div class="modal" style="max-width:520px">'
    + '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0">'
    + '<h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin:0">Which quote did the customer accept?</h3>'
    + '<p style="color:#6b7280;font-size:12px;margin:6px 0 0">Once confirmed, this choice is locked and drives job creation.</p>'
    + '</div>'
    + '<div class="modal-body" style="padding:18px 24px">' + rowsHtml + '</div>'
    + '<div style="padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb">'
    + '<button data-action="transitions-cancel-won-quote-selection" class="btn-g" style="font-size:12px">Cancel</button>'
    + '<button data-action="transitions-confirm-won-quote-selection" ' + (canContinue ? '' : 'disabled')
    + ' style="padding:7px 18px;border:none;border-radius:8px;background:' + (canContinue ? '#c41230' : '#e5e7eb') + ';color:' + (canContinue ? '#fff' : '#9ca3af')
    + ';font-size:12px;font-weight:700;cursor:' + (canContinue ? 'pointer' : 'not-allowed') + ';font-family:inherit">Continue</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function unwindDealWon(dealId) {
  var cu = getCurrentUser() || {};
  if (cu.role !== 'admin') { addToast('Admin only', 'error'); return; }
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;
  if (!deal.won) { addToast('Deal is not won', 'error'); return; }
  _pendingUnwindDealId = dealId;
  renderPage();
  // Focus the confirm input after render for a good UX.
  setTimeout(function () {
    var el = document.getElementById('unwindConfirmInput');
    if (el) el.focus();
  }, 50);
}

function cancelUnwindDealWon() {
  _pendingUnwindDealId = null;
  renderPage();
}

function confirmUnwindDealWon() {
  var dealId = _pendingUnwindDealId;
  if (!dealId) return;
  var el = document.getElementById('unwindConfirmInput');
  var typed = el ? (el.value || '') : '';
  if (typed !== 'UNWIND') { addToast('Type UNWIND exactly to confirm', 'error'); return; }

  // Brief 4 Phase 4: cancellation reason is required so the clawback
  // audit entry has context. Free text — typically "Customer cancelled",
  // "Pricing dispute", "Wrong product", etc.
  var reasonEl = document.getElementById('unwindReasonInput');
  var reason = reasonEl ? String(reasonEl.value || '').trim() : '';
  if (!reason) { addToast('Cancellation reason is required', 'error'); return; }

  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) { _pendingUnwindDealId = null; renderPage(); return; }
  var restoreStageId = deal.preWonStageId || _findFallbackStageId(deal);
  var cu = getCurrentUser() || { name: 'Admin' };

  // Snapshot pre-unwind values for the clawback (before-state) and audit.
  // Brief 4 Phase 4: also snapshot the commission BEFORE unwinding, since
  // the unwind clears wonQuoteId and calcDealCommission would then fall
  // back to activeQuoteId — possibly producing a different multiplier.
  var prevWonDate = deal.wonDate;
  var prevWonQuoteId = deal.wonQuoteId;
  var prevVal = deal.val;
  var prevCommission = 0;
  if (typeof calcDealCommission === 'function') {
    try { prevCommission = calcDealCommission(deal).commission || 0; } catch (e) {}
  }

  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: 'Deal unwound from Won by ' + cu.name + ' — ' + reason,
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    by: cu.name, done: false, dueDate: '',
  };

  setState({
    deals: getState().deals.map(function (d) {
      if (d.id !== dealId) return d;
      return Object.assign({}, d, {
        wonQuoteId: null,
        won: false,
        wonDate: null,
        preWonStageId: null,
        sid: restoreStageId,
        // Intentionally do NOT touch activeQuoteId or quotes[] — the rep can
        // still see what was previously won. Job (if any) is NOT deleted.
        activities: [act, ...(d.activities || [])]
      });
    })
  });

  dbUpdate('deals', dealId, {
    sid: restoreStageId,
    won_quote_id: null,
    won: false,
    won_date: null,
    pre_won_stage_id: null
  });
  dbInsert('activities', actToDb(act, 'deal', dealId));

  // Brief 4 Phase 4: clawback the commission. We pass the snapshotted
  // wonDate + commission so the helper doesn't need to read from state
  // (which has already been mutated to the unwound shape). This avoids
  // a setState dance and keeps the render count to one.
  var clawback = null;
  if (typeof clawbackCommission === 'function') {
    try {
      clawback = clawbackCommission(dealId, reason, {
        wonDate: prevWonDate,
        commissionOverride: prevCommission,
      });
    } catch (e) {}
  }

  // Brief 2 Phase 2 + Brief 4 Phase 4: cancellation audit entry. The
  // clawback function writes its own commission.clawed_back entry for
  // the money math; this one captures the deal-level cancellation event.
  if (typeof appendAuditEntry === 'function') {
    try {
      appendAuditEntry({
        entityType: 'deal', entityId: dealId,
        action: 'deal.won_unwound',
        summary: 'Won deal cancelled: ' + (deal.title || dealId) + ' — ' + reason,
        before: { won: true, wonDate: prevWonDate, wonQuoteId: prevWonQuoteId, sid: deal.sid, val: prevVal },
        after:  { won: false, wonDate: null, wonQuoteId: null, sid: restoreStageId, val: prevVal },
        metadata: {
          reason: reason,
          clawbackTier: clawback ? clawback.tier : null,
          clawedBackAmount: clawback ? clawback.clawedBackAmount : null,
          alreadyClawed: clawback ? clawback.alreadyClawed : false,
        },
        branch: deal.branch || null,
      });
    } catch (e) {}
  }

  _pendingUnwindDealId = null;
  // Toast surfaces the clawback outcome so admin sees the math
  // immediately. For 'skipped' tier the message is just "unwound";
  // for 'partial' / 'full' it shows the dollar amount clawed back.
  var toastMsg = 'Deal unwound from Won';
  if (clawback && clawback.tier === 'full') {
    toastMsg += ' — full clawback ($' + clawback.clawedBackAmount.toFixed(2) + ')';
  } else if (clawback && clawback.tier === 'partial') {
    toastMsg += ' — partial clawback (kept ' + clawback.keepPct + '%, clawed $' + clawback.clawedBackAmount.toFixed(2) + ')';
  } else if (clawback && clawback.tier === 'skipped') {
    toastMsg += ' — clawback skipped (' + clawback.daysSinceWon + ' days since won)';
  }
  addToast(toastMsg, 'warning');
  renderPage();
}

function renderUnwindDealModal() {
  var dealId = _pendingUnwindDealId;
  if (!dealId) return '';
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return '';
  var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
  var restoreStageId = deal.preWonStageId || _findFallbackStageId(deal);
  var restoreStage = pl ? (pl.stages || []).find(function (s) { return s.id === restoreStageId; }) : null;
  var restoreStageName = restoreStage ? restoreStage.name : restoreStageId;

  // Find associated job (if any) via jobRef → job.jobNumber.
  var job = null;
  if (deal.jobRef) {
    job = (getState().jobs || []).find(function (j) { return j.jobNumber === deal.jobRef; });
  }

  var jobWarning = job
    ? '<div style="margin-top:10px;padding:10px 12px;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;font-size:12px;color:#92400e">'
    + '\u26a0 Job <b>' + (job.jobNumber || '') + '</b> has already been created from this deal. '
    + 'Unwinding will NOT delete the job \u2014 you\u2019ll need to handle it manually on the Jobs page.'
    + '</div>'
    : '';

  // Brief 4 Phase 4: clawback preview. Show the user what's about to
  // happen to commission BEFORE they confirm. previewClawbackForDeal is
  // a pure-read helper that returns {tier, keepPct, daysSinceWon,
  // originalCommission, clawedBackAmount, remainingCommission} without
  // mutating state.
  var clawbackBlock = '';
  if (typeof previewClawbackForDeal === 'function') {
    var preview = previewClawbackForDeal(deal);
    if (preview && preview.originalCommission > 0) {
      var tierColor = preview.tier === 'full' ? '#b91c1c' : preview.tier === 'partial' ? '#92400e' : '#15803d';
      var tierBg    = preview.tier === 'full' ? '#fee2e2' : preview.tier === 'partial' ? '#fef9c3' : '#f0fdf4';
      var tierLabel = preview.tier === 'full' ? 'Full clawback' : preview.tier === 'partial' ? 'Partial clawback (' + preview.keepPct + '% kept)' : 'No clawback (over threshold)';
      var fmt = function (n) { return '$' + n.toFixed(2); };
      clawbackBlock = '<div style="margin-top:14px;padding:12px 14px;background:' + tierBg + ';border:1px solid ' + tierColor + '40;border-radius:8px">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        +   '<div style="font-size:12px;font-weight:700;color:' + tierColor + '">\ud83d\udcb0 ' + tierLabel + '</div>'
        +   '<div style="font-size:11px;color:#6b7280">' + preview.daysSinceWon + ' days since won</div>'
        + '</div>'
        + '<div style="font-size:11px;color:#374151;line-height:1.5">'
        +   'Original commission: <b>' + fmt(preview.originalCommission) + '</b><br>'
        +   (preview.tier === 'skipped'
              ? 'Commission preserved in full \u2014 deal won more than ' + (preview.policy.partialClawbackUnderDays || 90) + ' days ago.'
              : 'Clawing back: <b>' + fmt(preview.clawedBackAmount) + '</b> \u00b7 Remaining: <b>' + fmt(preview.remainingCommission) + '</b>')
        + '</div></div>';
    }
  }

  return '<div id="unwindDealModal" class="modal-bg" style="display:flex" data-action="transitions-cancel-unwind-deal-modal-bg">'
    + '<div class="modal" style="max-width:520px;padding:0;overflow:hidden">'
    + '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0">'
    + '<h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin:0;color:#b91c1c">\u26a0 Unwind won state</h3>'
    + '</div>'
    + '<div style="padding:20px 24px">'
    + '<div style="font-size:13px;color:#374151;line-height:1.5">This will clear the won quote and move the deal back to <b>' + restoreStageName + '</b>.</div>'
    + jobWarning
    + clawbackBlock
    + '<div style="margin-top:16px;font-size:12px;font-weight:600;color:#374151;margin-bottom:4px">Cancellation reason <span style="color:#dc2626">*</span></div>'
    + '<input id="unwindReasonInput" type="text" autocomplete="off" placeholder="e.g. Customer cancelled, Pricing dispute" style="width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:inherit;font-size:13px">'
    + '<div style="margin-top:16px;font-size:12px;color:#6b7280">Type <code style="background:#f3f4f6;padding:1px 5px;border-radius:3px;font-weight:700;color:#b91c1c">UNWIND</code> to confirm:</div>'
    + '<input id="unwindConfirmInput" type="text" autocomplete="off" style="margin-top:6px;width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-family:monospace;font-size:13px" placeholder="UNWIND">'
    + '</div>'
    + '<div style="padding:14px 24px;border-top:1px solid #f0f0f0;display:flex;justify-content:flex-end;gap:8px;background:#f9fafb">'
    + '<button data-action="transitions-cancel-unwind-deal" class="btn-g" style="font-size:12px">Cancel</button>'
    + '<button data-action="transitions-confirm-unwind-deal" style="padding:7px 18px;border:none;border-radius:8px;background:#b91c1c;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Unwind</button>'
    + '</div>'
    + '</div>'
    + '</div>';
}

function renderPaymentMethodModal() {
  return '<div id="payMethodModal" class="modal-bg" style="display:flex" data-action="transitions-cancel-deal-won-modal-bg">'
    + '<div class="modal" style="max-width:420px;padding:0;overflow:hidden">'
    + '<div style="padding:20px 24px;border-bottom:1px solid #f0f0f0"><h3 style="font-family:Syne,sans-serif;font-weight:800;font-size:18px;margin:0">\ud83c\udf89 Deal Won! Select Payment Method</h3>'
    + '<p style="color:#6b7280;font-size:13px;margin:6px 0 0">This determines the invoicing structure for the job.</p></div>'
    + '<div style="padding:24px;display:flex;flex-direction:column;gap:12px">'
    // COD option
    + '<div data-action="transitions-confirm-deal-won-cod" style="display:flex;align-items:center;gap:14px;padding:18px 20px;border:2px solid #22c55e;border-radius:12px;cursor:pointer;background:#f0fdf4" onmouseover="this.style.background=\'#dcfce7\'" onmouseout="this.style.background=\'#f0fdf4\'">'
    + '<div style="width:48px;height:48px;border-radius:12px;background:#22c55e;color:#fff;font-size:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800">\ud83d\udcb5</div>'
    + '<div><div style="font-size:15px;font-weight:700;color:#15803d">COD \u2014 Cash on Delivery</div>'
    + '<div style="font-size:12px;color:#6b7280;margin-top:2px">Standard 4-stage invoicing: 5% deposit \u2192 45% CM \u2192 45% pre-install \u2192 5% completion</div></div></div>'
    // Zip option
    + '<div data-action="transitions-confirm-deal-won-zip" style="display:flex;align-items:center;gap:14px;padding:18px 20px;border:2px solid #a855f7;border-radius:12px;cursor:pointer;background:#faf5ff" onmouseover="this.style.background=\'#f3e8ff\'" onmouseout="this.style.background=\'#faf5ff\'">'
    + '<div style="width:48px;height:48px;border-radius:12px;background:#a855f7;color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:800">ZIP</div>'
    + '<div><div style="font-size:15px;font-weight:700;color:#7c3aed">Zip Money \u2014 Finance</div>'
    + '<div style="font-size:12px;color:#6b7280;margin-top:2px">20% deposit invoice raised. Remaining 80% funded by Zip Money. Weekly cap: $20,000.</div></div></div>'
    + '</div>'
    + '<div style="padding:12px 24px;border-top:1px solid #f0f0f0;text-align:right"><button data-action="transitions-cancel-deal-won" class="btn-g" style="font-size:12px">Cancel</button></div>'
    + '</div></div>';
}

function getLostReasons() {
  try {
    var raw = localStorage.getItem('spartan_lost_reasons');
    if (!raw) return DEFAULT_LOST_REASONS.slice();
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_LOST_REASONS.slice();
  } catch (e) { return DEFAULT_LOST_REASONS.slice(); }
}

function saveLostReasons(arr) {
  try { localStorage.setItem('spartan_lost_reasons', JSON.stringify(arr || [])); } catch (e) {}
}

function lostReasonLabelFor(deal) {
  if (!deal) return 'Not specified';
  if (deal.lostReasonId) {
    var match = getLostReasons().find(function (r) { return r.id === deal.lostReasonId; });
    if (match) return match.label;
  }
  return deal.lostReason || 'Not specified';
}

function _requestLostTransition(dealId, targetStageId, opts) {
  opts = opts || {};
  var deal = (getState().deals || []).find(function (d) { return d.id === dealId; });
  if (!deal) return;

  // If already lost, no-op (don't re-prompt for reason on a deal that's
  // already in a Lost stage with a recorded reason).
  if (deal.lost) {
    addToast('Deal is already marked as Not Proceeding', 'info');
    return;
  }

  // If targetStageId not provided, find the pipeline's Lost stage.
  if (!targetStageId) {
    var pl = PIPELINES.find(function (p) { return p.id === deal.pid; });
    var lostStage = pl ? pl.stages.find(function (s) { return s.isLost; }) : null;
    if (!lostStage) {
      addToast('No Lost stage configured on this pipeline', 'error');
      return;
    }
    targetStageId = lostStage.id;
  }

  _pendingLostTransition = {
    dealId: dealId,
    targetStageId: targetStageId,
    source: opts.source || 'unknown',
    selectedReasonId: '',
    competitorName: '',
    details: '',
  };
  renderPage();
}

function cancelLostTransition() {
  _pendingLostTransition = null;
  renderPage();
}

function setLostReasonDraft(reasonId) {
  if (!_pendingLostTransition) return;
  _pendingLostTransition.selectedReasonId = reasonId;
  renderPage();
}

function setLostCompetitorDraft(value) {
  if (_pendingLostTransition) _pendingLostTransition.competitorName = value;
}

function setLostDetailsDraft(value) {
  if (_pendingLostTransition) _pendingLostTransition.details = value;
}

function confirmLostTransition() {
  var p = _pendingLostTransition;
  if (!p) return;
  if (!p.selectedReasonId) {
    addToast('Pick a reason first', 'error');
    return;
  }

  var s = getState();
  var deal = (s.deals || []).find(function (d) { return d.id === p.dealId; });
  if (!deal) { _pendingLostTransition = null; return; }

  var reasons = getLostReasons();
  var reason = reasons.find(function (r) { return r.id === p.selectedReasonId; }) || { id: p.selectedReasonId, label: p.selectedReasonId };
  var competitor = p.competitorName.trim();
  var details = p.details.trim();
  var oldSid = deal.sid;
  var nowDate = new Date().toISOString().slice(0, 10);
  var nowTime = new Date().toTimeString().slice(0, 5);
  var byUser = (getCurrentUser() || { name: 'Admin' }).name;

  // Activity-timeline entry. Mirrors the dropDeal pattern.
  var summaryParts = ['Deal lost — ' + reason.label];
  if (competitor) summaryParts.push('(' + competitor + ')');
  if (details) summaryParts.push(': ' + details);
  var act = {
    id: 'a' + Date.now(),
    type: 'stage',
    text: summaryParts.join(' '),
    date: nowDate,
    time: nowTime,
    by: byUser,
    done: false,
    dueDate: '',
  };

  setState({
    deals: s.deals.map(function (d) {
      if (d.id !== p.dealId) return d;
      return Object.assign({}, d, {
        sid: p.targetStageId,
        won: false,
        lost: true,
        wonDate: null,
        lostReasonId: reason.id,
        lostReason: reason.label, // legacy field — kept for backwards compat with old reports
        lostCompetitor: competitor || null,
        lostDetails: details || null,
        activities: [act].concat(d.activities || []),
      });
    }),
  });

  // Persist to Supabase. Columns may not exist yet — Supabase will error on
  // the missing columns and the rest of the local state still saves. Schema
  // migration is a separate task per the brief.
  dbUpdate('deals', p.dealId, {
    sid: p.targetStageId,
    won: false,
    lost: true,
    won_date: null,
    lost_reason: reason.label,
    lost_reason_id: reason.id,
    lost_competitor: competitor || null,
    lost_details: details || null,
  });
  dbInsert('activities', actToDb(act, 'deal', p.dealId));

  // Audit (Brief 2 Phase 1 primitive)
  if (typeof appendAuditEntry === 'function') {
    appendAuditEntry({
      entityType: 'deal',
      entityId: p.dealId,
      action: 'deal.lost_marked',
      summary: 'Deal lost: ' + reason.label + (competitor ? ' — ' + competitor : ''),
      before: { sid: oldSid, lost: false },
      after: {
        sid: p.targetStageId,
        lost: true,
        lostReasonId: reason.id,
        lostCompetitor: competitor || null,
        lostDetails: details || null,
      },
      metadata: { source: p.source },
      branch: deal.branch || null,
    });
  }

  _pendingLostTransition = null;
  addToast('Deal marked as Not Proceeding — ' + reason.label, 'warning');
  renderPage();
}

function renderLostReasonModal() {
  if (!_pendingLostTransition) return '';
  var p = _pendingLostTransition;
  var reasons = getLostReasons().filter(function (r) { return r.active; });
  var showCompetitor = p.selectedReasonId === 'competitor';

  return ''
    + '<div class="modal-bg" data-action="transitions-cancel-lost-transition-modal-bg">'
    +   '<div class="modal" style="max-width:480px">'
    +     '<div class="modal-header">'
    +       '<h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">Why was this deal lost?</h3>'
    +       '<button data-action="transitions-cancel-lost-transition" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>'
    +     '</div>'
    +     '<div class="modal-body" style="display:flex;flex-direction:column;gap:14px">'
    +       '<div style="display:flex;flex-direction:column;gap:6px">'
    +         reasons.map(function (r) {
                var checked = p.selectedReasonId === r.id;
                return '<label for="lr_reason_' + r.id + '" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:1.5px solid ' + (checked ? '#c41230' : '#e5e7eb') + ';background:' + (checked ? '#fff5f6' : '#fff') + ';border-radius:10px;cursor:pointer;font-size:13px;font-weight:' + (checked ? '600' : '400') + '">'
                  + '<input type="radio" id="lr_reason_' + r.id + '" name="lr_reason" value="' + r.id + '" ' + (checked ? 'checked' : '') + ' data-on-change="transitions-set-lost-reason-draft" style="accent-color:#c41230">'
                  + '<span>' + (r.label || r.id) + '</span>'
                  + '</label>';
              }).join('')
    +       '</div>'
    +       (showCompetitor ? (''
              + '<div>'
              +   '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Competitor name</label>'
              +   '<input id="lr_competitor" class="inp" value="' + (p.competitorName || '').replace(/"/g, '&quot;') + '" placeholder="e.g. ABC Windows" data-on-input="transitions-set-lost-competitor-draft" style="font-size:13px">'
              + '</div>'
            ) : '')
    +       '<div>'
    +         '<label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Optional details</label>'
    +         '<textarea id="lr_details" class="inp" rows="3" placeholder="Anything else worth noting…" data-on-input="transitions-set-lost-details-draft" style="font-size:13px;resize:vertical;border-radius:8px;padding:8px 10px">' + (p.details || '').replace(/</g, '&lt;') + '</textarea>'
    +       '</div>'
    +     '</div>'
    +     '<div class="modal-footer">'
    +       '<button data-action="transitions-cancel-lost-transition" class="btn-w" style="font-size:13px">Cancel</button>'
    +       '<button data-action="transitions-confirm-lost-transition" class="btn-r" style="font-size:13px;background:#dc2626;border-color:#dc2626">Mark as Not Proceeding</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

function markDealLost(dealId) {
  _requestLostTransition(dealId, null, { source: 'mark-button' });
}

function convertDealToJob(dealId) {
  var deal = getState().deals.find(function (d) { return d.id === dealId; });
  if (deal) createJobFromWonDeal(deal);
}
