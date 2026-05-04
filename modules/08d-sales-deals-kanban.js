// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/08d-sales-deals-kanban.js
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Deals kanban board, stage management, DnD.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────

defineAction('kanban-close-modal', function(target, ev) {
  closeKanbanModal();
});

defineAction('kanban-prob-label-update', function(target, ev) {
  document.getElementById('ke_prob_label').textContent = target.value + '%';
});

defineAction('kanban-col-select', function(target, ev) {
  const color = target.dataset.color;
  document.getElementById('ke_col').value = color;
  target.parentElement.querySelectorAll('button').forEach(b => b.style.outline = 'none');
  target.style.outline = '3px solid #1a1a1a';
});

defineAction('kanban-move-stage-earlier', function(target, ev) {
  moveStage(target.dataset.stageId, -1);
});

defineAction('kanban-move-stage-later', function(target, ev) {
  moveStage(target.dataset.stageId, 1);
});

defineAction('kanban-delete-stage', function(target, ev) {
  deleteStage(target.dataset.stageId);
});

defineAction('kanban-save-stage', function(target, ev) {
  if (target.dataset.isNew === 'true') saveNewStage();
  else saveStageEdit();
});

defineAction('kanban-deal-full-view', function(target, ev) {
  setState({ dealDetailId: target.dataset.dealId });
  closeKanbanModal();
});

defineAction('kanban-email-from-deal', function(target, ev) {
  ev.stopPropagation();
  emailFromDeal(target.dataset.dealId);
});

defineAction('kanban-mark-deal-won', function(target, ev) {
  markDealWon(target.dataset.dealId);
  closeKanbanModal();
});

defineAction('kanban-mark-deal-lost', function(target, ev) {
  markDealLost(target.dataset.dealId);
  closeKanbanModal();
});

defineAction('kanban-delete-deal', function(target, ev) {
  if (confirm('Delete this deal?')) {
    const dealId = target.dataset.dealId;
    dbDelete('deals', dealId);
    setState({ deals: getState().deals.filter(d => d.id !== dealId) });
    closeKanbanModal();
    addToast('Deal deleted', 'warning');
  }
});

defineAction('kanban-save-deal-quick-edit', function(target, ev) {
  saveDealKanbanQuickEdit();
});

defineAction('kanban-switch-pipeline', function(target, ev) {
  dPipeline = target.dataset.pipelineId;
  renderPage();
});

defineAction('kanban-toggle-filter', function(target, ev) {
  kFilterOpen = !kFilterOpen;
  renderPage();
});

defineAction('kanban-filter-owner', function(target, ev) {
  kFilterOwners = target.value ? [target.value] : [];
  renderPage();
});

defineAction('kanban-filter-min-value', function(target, ev) {
  kFilterValMin = target.value;
  renderPage();
});

defineAction('kanban-filter-max-value', function(target, ev) {
  kFilterValMax = target.value;
  renderPage();
});

defineAction('kanban-filter-source', function(target, ev) {
  kFilterSource = target.value ? [target.value] : [];
  renderPage();
});

defineAction('kanban-clear-all-filters', function(target, ev) {
  kFilterOwners = [];
  kFilterStages = [];
  kFilterSource = [];
  kFilterValMin = '';
  kFilterValMax = '';
  renderPage();
});

defineAction('kanban-open-new-stage', function(target, ev) {
  openNewStageModal();
});

defineAction('kanban-select-mobile-stage', function(target, ev) {
  _mobileDealStageId = target.dataset.stageId;
  renderPage();
});

defineAction('kanban-open-deal-detail-mobile', function(target, ev) {
  setState({ dealDetailId: target.dataset.dealId });
});

defineAction('kanban-open-deal-quick-edit-mobile', function(target, ev) {
  ev.stopPropagation();
  openDealEdit(target.dataset.dealId);
});

defineAction('kanban-email-deal-mobile', function(target, ev) {
  ev.stopPropagation();
  emailFromDeal(target.dataset.dealId);
});

defineAction('kanban-open-stage-edit', function(target, ev) {
  openStageEdit(target.dataset.stageId);
});

defineAction('kanban-open-deal-detail', function(target, ev) {
  setState({ dealDetailId: target.dataset.dealId });
});

defineAction('kanban-open-deal-quick-edit', function(target, ev) {
  ev.stopPropagation();
  openDealEdit(target.dataset.dealId);
});

defineAction('kanban-email-deal', function(target, ev) {
  ev.stopPropagation();
  emailFromDeal(target.dataset.dealId);
});

// ──────────────────────────────────────────────────────────────────────────

function openStageEdit(stageId) {
  const pl = PIPELINES.find(p => p.id === dPipeline);
  const st = pl ? pl.stages.find(s => s.id === stageId) : null;
  if (!st) return;
  kanbanEditModal = { type: 'stage', data: { ...st, pid: dPipeline } };
  renderPage();
}

function openNewStageModal() {
  kanbanEditModal = { type: 'newStage', data: { name: '', prob: 50, col: '#94a3b8', pid: dPipeline } };
  renderPage();
}

function openDealEdit(dealId) {
  const d = getState().deals.find(x => x.id === dealId);
  if (!d) return;
  kanbanEditModal = { type: 'deal', data: { ...d } };
  renderPage();
}

function closeKanbanModal() { kanbanEditModal = null; renderPage(); }

function saveStageEdit() {
  const d = kanbanEditModal.data;
  const name = document.getElementById('ke_name')?.value.trim();
  const prob = parseInt(document.getElementById('ke_prob')?.value || '50');
  const col = document.getElementById('ke_col')?.value || '#94a3b8';
  if (!name) { addToast('Stage name required', 'error'); return; }
  PIPELINES.forEach(pl => {
    if (pl.id !== d.pid) return;
    pl.stages = pl.stages.map(s => s.id === d.id ? { ...s, name, prob, col } : s);
  });
  kanbanEditModal = null;
  addToast('Stage updated', 'success');
  renderPage();
}

function saveNewStage() {
  const name = document.getElementById('ke_name')?.value.trim();
  const prob = parseInt(document.getElementById('ke_prob')?.value || '50');
  const col = document.getElementById('ke_col')?.value || '#94a3b8';
  if (!name) { addToast('Stage name required', 'error'); return; }
  const newId = 's' + Date.now();
  const pl = PIPELINES.find(p => p.id === dPipeline);
  if (!pl) return;
  const mid = pl.stages.filter(s => !s.isWon && !s.isLost);
  const won = pl.stages.filter(s => s.isWon);
  const lost = pl.stages.filter(s => s.isLost);
  mid.push({ id: newId, name, prob, col, ord: mid.length + 1 });
  pl.stages = [...mid.map((s, i) => ({ ...s, ord: i + 1 })), ...won, ...lost];
  kanbanEditModal = null;
  addToast('"' + name + '" stage added', 'success');
  renderPage();
}

function deleteStage(stageId) {
  const pl = PIPELINES.find(p => p.id === dPipeline);
  if (!pl) return;
  const count = getState().deals.filter(d => d.sid === stageId).length;
  if (count > 0) { addToast('Move ' + count + ' deal(s) out first', 'error'); return; }
  pl.stages = pl.stages.filter(s => s.id !== stageId);
  kanbanEditModal = null;
  addToast('Stage deleted', 'warning');
  renderPage();
}

function moveStage(stageId, dir) {
  const pl = PIPELINES.find(p => p.id === dPipeline);
  if (!pl) return;
  const mid = pl.stages.filter(s => !s.isWon && !s.isLost);
  const idx = mid.findIndex(s => s.id === stageId);
  if (idx < 0) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= mid.length) return;
  [mid[idx], mid[ni]] = [mid[ni], mid[idx]];
  pl.stages = [...mid.map((s, i) => ({ ...s, ord: i + 1 })), ...pl.stages.filter(s => s.isWon), ...pl.stages.filter(s => s.isLost)];
  renderPage();
}

function saveDealKanbanQuickEdit() {
  const d = kanbanEditModal.data;
  const title = document.getElementById('de_title')?.value.trim();
  const valEl = document.getElementById('de_val');
  const valErr = document.getElementById('de_val_err');
  const valV = validateDealValue(valEl ? valEl.value : '');
  if (valErr) { valErr.style.display = valV.ok ? 'none' : 'block'; valErr.textContent = valV.error; }
  if (!valV.ok) { addToast(valV.error, 'error'); return; }
  const val = valV.normalized;
  const sid = document.getElementById('de_stage')?.value;
  const rep = document.getElementById('de_rep')?.value;
  const street = document.getElementById('de_street')?.value.trim() || '';
  const suburb = document.getElementById('de_suburb')?.value.trim();
  const state = document.getElementById('de_state')?.value || '';
  const postcode = document.getElementById('de_postcode')?.value.trim() || '';
  const closeDate = document.getElementById('de_close')?.value;
  if (!title) { addToast('Title required', 'error'); return; }
  // Snapshot before-state for audit. Capture only the fields the form can edit.
  var beforeState = { title:d.title, val:d.val, sid:d.sid, rep:d.rep, street:d.street, suburb:d.suburb, state:d.state, postcode:d.postcode, closeDate:d.closeDate };
  setState({
    deals: getState().deals.map(deal =>
      deal.id === d.id ? {
        ...deal, title, val: val, sid: sid || deal.sid,
        rep: rep || deal.rep, street: street, suburb: suburb || deal.suburb, state: state || deal.state, postcode: postcode, closeDate: closeDate || deal.closeDate
      } : deal
    )
  });
  dbUpdate('deals', d.id, { title: title, val: val, sid: sid || d.sid, rep: rep || d.rep, street: street, suburb: suburb || d.suburb, postcode: postcode, close_date: closeDate || d.closeDate || null });
  // Audit the edit. Stage changes flow through moveDealToStage, so the sid
  // delta here is rare (the dropdown does include stage, so it's possible)
  // but it'll show up in the before/after.
  if (typeof appendAuditEntry === 'function') {
    var afterState = { title:title, val:val, sid:sid||d.sid, rep:rep||d.rep, street:street, suburb:suburb||d.suburb, state:state||d.state, postcode:postcode, closeDate:closeDate||d.closeDate };
    var changedFields = Object.keys(afterState).filter(function(k){ return String(beforeState[k]||'') !== String(afterState[k]||''); });
    if (changedFields.length > 0) {
      appendAuditEntry({
        entityType:'deal', entityId:d.id, action:'deal.field_edited',
        summary:'Edited "' + title + '" — ' + changedFields.length + ' field' + (changedFields.length!==1?'s':''),
        before:beforeState, after:afterState,
        metadata:{ source:'kanban-quick-edit' },
        branch:d.branch||null,
      });
    }
  }
  kanbanEditModal = null;
  addToast('Deal updated', 'success');
  renderPage();
}

function renderKanbanModal() {
  if (!kanbanEditModal) return '';
  const { type, data } = kanbanEditModal;
  const COLS = ['#94a3b8', '#60a5fa', '#818cf8', '#a78bfa', '#f472b6',
    '#fb923c', '#facc15', '#4ade80', '#34d399', '#22d3ee',
    '#c41230', '#ef4444', '#f59e0b', '#22c55e'];

  if (type === 'stage' || type === 'newStage') {
    const isNew = type === 'newStage';
    return `<div class="modal-bg" data-action="kanban-close-modal" onclick="if(event.target===this)event.currentTarget.dispatchEvent(new CustomEvent('action', {bubbles:true,detail:{action:'kanban-close-modal'}}))">
      <div class="modal" style="max-width:400px">
        <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">${isNew ? 'Add Stage' : 'Edit Stage'}</h3>
          <button data-action="kanban-close-modal" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">×</button>
        </div>
        <div style="padding:20px;display:flex;flex-direction:column;gap:16px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">Stage Name *</label>
            <input id="ke_name" class="inp" value="${isNew ? '' : data.name}" placeholder="e.g. Site Survey" style="font-size:14px">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:6px">
              Win Probability: <span id="ke_prob_label">${data.prob}%</span>
            </label>
            <input type="range" id="ke_prob" min="0" max="100" value="${data.prob}"
              data-on-input="kanban-prob-label-update"
              style="width:100%;accent-color:#c41230">
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:8px">Colour</label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              ${COLS.map(c => `<button data-action="kanban-col-select" data-color="${c}"
                style="width:28px;height:28px;border-radius:50%;background:${c};border:none;cursor:pointer;outline:${data.col === c ? '3px solid #1a1a1a' : 'none'};outline-offset:2px"></button>`).join('')}
              <input type="color" id="ke_col" value="${data.col}" style="width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;padding:0;background:none">
            </div>
          </div>
          ${!isNew ? `
          <div style="display:flex;gap:8px">
            <button data-action="kanban-move-stage-earlier" data-stage-id="${data.id}" class="btn-w" style="font-size:12px;flex:1">↑ Earlier</button>
            <button data-action="kanban-move-stage-later" data-stage-id="${data.id}"  class="btn-w" style="font-size:12px;flex:1">↓ Later</button>
          </div>
          <div style="border-top:1px dashed #fee2e2;padding-top:12px">
            <button data-action="kanban-delete-stage" data-stage-id="${data.id}" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Delete stage…</button>
          </div>`: ''}
        </div>
        <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:flex-end;gap:8px">
          <button data-action="kanban-close-modal" class="btn-w">Cancel</button>
          <button data-action="kanban-save-stage" data-is-new="${isNew ? 'true' : 'false'}" class="btn-r">${isNew ? 'Add' : 'Save'}</button>
        </div>
      </div>
    </div>`;
  }

  if (type === 'deal') {
    const pl = PIPELINES.find(p => p.id === dPipeline);
    const allStages = pl ? pl.stages.filter(s => !s.isLost) : [];
    const c = getState().contacts.find(x => x.id === data.cid);
    const REPS = ['James Wilson', 'Sarah Chen', 'Emma Brown', 'Michael Torres', 'David Kim'];
    return `<div class="modal-bg" data-action="kanban-close-modal" onclick="if(event.target===this)event.currentTarget.dispatchEvent(new CustomEvent('action', {bubbles:true,detail:{action:'kanban-close-modal'}}))">
      <div class="modal" style="max-width:460px">
        <div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
          <h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">Edit Deal</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <button data-action="kanban-deal-full-view" data-deal-id="${data.id}" class="btn-w" style="font-size:12px">Full view →</button>
            <button data-action="kanban-close-modal" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px">×</button>
          </div>
        </div>
        <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Title *</label>
            <input id="de_title" class="inp" value="${data.title}" style="font-size:14px;font-weight:500">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Value ($)</label>
              <input id="de_val" type="number" min="0" step="any" class="inp" value="${data.val}">
              <div id="de_val_err" class="err-msg" style="color:#dc2626;font-size:11px;margin-top:4px;display:none"></div>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Stage</label>
              <select id="de_stage" class="sel">
                ${allStages.map(s => `<option value="${s.id}" ${data.sid === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Owner</label>
              <select id="de_rep" class="sel">
                ${REPS.map(r => `<option value="${r}" ${data.rep === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Close Date</label>
              <input id="de_close" type="date" class="inp" value="${data.closeDate || ''}">
            </div>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Street Address</label>
            <input id="de_street" class="inp" value="${data.street || ''}" placeholder="Start typing address…" autocomplete="off">
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Suburb</label>
              <input id="de_suburb" class="inp" value="${data.suburb || ''}" placeholder="e.g. Richmond">
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">State</label>
              <select id="de_state" class="sel">${['VIC', 'NSW', 'QLD', 'SA', 'WA', 'ACT', 'TAS', 'NT'].map(s => `<option ${data.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
            </div>
            <div>
              <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px">Postcode</label>
              <input id="de_postcode" class="inp" value="${data.postcode || ''}" placeholder="3121">
            </div>
          </div>
          ${c ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb">
            <div style="width:30px;height:30px;background:#c41230;border-radius:50%;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${avatar(c.fn + ' ' + c.ln)}</div>
            <div><div style="font-size:13px;font-weight:600">${c.fn} ${c.ln}</div><div style="font-size:11px;color:#6b7280">${c.email || ''}</div></div>
            <button data-action="kanban-email-from-deal" data-deal-id="${data.id}" style="margin-left:auto;padding:5px 10px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-family:inherit">✉️ Email</button>
          </div>`: ''}
          <div style="display:flex;gap:8px;padding-top:6px;border-top:1px solid #f0f0f0">
            <button data-action="kanban-mark-deal-won" data-deal-id="${data.id}" style="flex:1;padding:9px;border:1px solid #86efac;background:#f0fdf4;color:#15803d;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600">✓ Won</button>
            <button data-action="kanban-mark-deal-lost" data-deal-id="${data.id}" style="flex:1;padding:9px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;border-radius:8px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600">✗ Lost</button>
          </div>
        </div>
        <div style="padding:14px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:space-between">
          <button data-action="kanban-delete-deal" data-deal-id="${data.id}" style="font-size:12px;color:#b91c1c;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Delete</button>
          <div style="display:flex;gap:8px">
            <button data-action="kanban-close-modal" class="btn-w">Cancel</button>
            <button data-action="kanban-save-deal-quick-edit" class="btn-r">Save</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  return '';
}

function highlightCol(stageId) {
  // Only update if this is a new column
  if (dragOverStage === stageId) return;
  if (dragOverStage) unhighlightCol(dragOverStage);
  dragOverStage = stageId;
  const el = document.getElementById('col_' + stageId);
  if (el) {
    el.style.background = '#eff6ff';
    el.style.borderColor = '#3b82f6';
    el.style.borderStyle = 'dashed';
  }
}

function unhighlightCol(stageId) {
  dragOverStage = null;
  const el = document.getElementById('col_' + stageId);
  if (el) {
    el.style.background = '#f8f9fa';
    el.style.borderColor = 'transparent';
    el.style.borderStyle = 'solid';
  }
}

function unhighlightAllCols() {
  dragOverStage = null;
  try {
    document.querySelectorAll('[id^="col_"]').forEach(el => {
      if (el && el.style) {
        el.style.background = '#f8f9fa';
        el.style.borderColor = 'transparent';
        el.style.borderStyle = 'solid';
      }
    });
  } catch (e) { }
}

function renderDeals() {
  const { deals, contacts, modal, dealDetailId } = getState();
  if (dealDetailId) return renderDealDetail() + (getState().editingDealId ? renderEditDealDrawer() : '');

  // Native wrapper: full mobile deals layout (pipeline switcher, filter
  // panel, stage tab strip, swipeable horizontal columns). Desktop kanban
  // is unchanged below.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    return renderDealsMobile();
  }

  const pl = PIPELINES.find(p => p.id === dPipeline);
  // Include the lost stage as a visible "Not Proceeding" column. It lives at
  // ord:6 so it naturally sits at the right next to Won.
  const stages = pl.stages.sort((a, b) => a.ord - b.ord);
  const pDeals = deals.filter(d => d.pid === dPipeline);
  // Pipeline value and the "X open" headline must exclude both Won and Not
  // Proceeding — otherwise Not Proceeding deals inflate the numbers.
  const totalVal = pDeals.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
  const byStage = {};
  stages.forEach(s => byStage[s.id] = []);
  pDeals.forEach(d => { if (byStage[d.sid]) byStage[d.sid].push(d); });

  const allOwners = [...new Set(deals.map(d => d.rep))];
  const allSources = [...new Set(getState().contacts.map(c => c.source))].filter(Boolean);
  const activeFilters = kFilterOwners.length + kFilterStages.length + kFilterSource.length + (kFilterValMin ? 1 : 0) + (kFilterValMax ? 1 : 0);
  const matchesFilter = d => {
    if (kFilterOwners.length > 0 && !kFilterOwners.includes(d.rep)) return false;
    if (kFilterStages.length > 0 && !kFilterStages.includes(d.sid)) return false;
    if (kFilterValMin !== '' && d.val < parseFloat(kFilterValMin)) return false;
    if (kFilterValMax !== '' && d.val > parseFloat(kFilterValMax)) return false;
    if (kFilterSource.length > 0) { const c = getState().contacts.find(x => x.id === d.cid); if (!c || !kFilterSource.includes(c.source)) return false; }
    return true;
  };

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
    <div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 2px;font-family:Syne,sans-serif">Deals</h1>
      <p style="color:#6b7280;font-size:13px;margin:0">${pDeals.filter(d => !d.won && !d.lost).length} open · ${fmt$(totalVal)} pipeline</p>
    </div>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="display:flex;background:#f3f4f6;border-radius:10px;padding:3px;gap:2px">
        ${PIPELINES.map(p => `<button data-action="kanban-switch-pipeline" data-pipeline-id="${p.id}" style="padding:5px 14px;border-radius:8px;border:none;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:${dPipeline === p.id ? '#fff' : 'transparent'};color:${dPipeline === p.id ? '#1a1a1a' : '#6b7280'};box-shadow:${dPipeline === p.id ? '0 1px 4px rgba(0,0,0,.1)' : 'none'}">${p.name}</button>`).join('')}
      </div>
      <button data-action="kanban-open-new-stage" class="btn-w" style="font-size:12px;gap:5px">${Icon({ n: 'plus', size: 13 })} Stage</button>
      <button onclick="openNewDealModal()" class="btn-r" style="font-size:13px;gap:6px">${Icon({ n: 'plus', size: 15 })} New Deal</button>
    </div>
  </div>

  <!-- Filter bar -->
  <div class="card" style="padding:10px 14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <button data-action="kanban-toggle-filter" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #e5e7eb;border-radius:20px;background:#fff;font-size:12px;cursor:pointer;font-family:inherit;font-weight:500">
        ${Icon({ n: 'filter', size: 13 })} Filters${activeFilters > 0 ? ` <span style="background:#c41230;color:#fff;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${activeFilters}</span>` : ''}
      </button>
      ${kFilterOpen ? `
        <select data-on-change="kanban-filter-owner" style="border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <option value="">All Owners</option>
          ${allOwners.map(o => `<option value="${o}" ${kFilterOwners.includes(o) ? 'selected' : ''}>${o.split(' ')[0]}</option>`).join('')}
        </select>
        <div style="display:flex;align-items:center;gap:5px">
          <input id="dealValueMinInput" type="number" placeholder="Min $" value="${kFilterValMin}" data-on-input="kanban-filter-min-value" style="width:90px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <span style="color:#9ca3af">–</span>
          <input id="dealValueMaxInput" type="number" placeholder="Max $" value="${kFilterValMax}" data-on-input="kanban-filter-max-value" style="width:90px;border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
        </div>
        <select data-on-change="kanban-filter-source" style="border:1px solid #e5e7eb;border-radius:8px;font-size:12px;padding:5px 8px;font-family:inherit">
          <option value="">All Sources</option>
          ${allSources.map(s => `<option value="${s}" ${kFilterSource.includes(s) ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        ${activeFilters > 0 ? `<button data-action="kanban-clear-all-filters" style="font-size:12px;color:#c41230;background:none;border:none;cursor:pointer;font-family:inherit;font-weight:500">Clear all</button>` : ''}
      `: ''}
    </div>
  </div>

  ${(typeof isNativeWrapper === 'function' && isNativeWrapper()) ? (function(){
    // Mobile: stage chip selector + vertical deal list. Drag/drop kept
    // intact on each card markup but is functionally inert on touch — moving
    // a deal between stages on mobile uses the ✎ quick-edit modal instead.
    const sel = (_mobileDealStageId && byStage[_mobileDealStageId]) ? _mobileDealStageId : stages[0].id;
    const sd = (byStage[sel] || []);
    const stage = stages.find(s => s.id === sel) || stages[0];
    const stVal = sd.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
    return `
    <div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:4px">
      ${stages.map(st => {
        const c = (byStage[st.id]||[]).length;
        const a = st.id === sel;
        return `<button data-action="kanban-select-mobile-stage" data-stage-id="${st.id}" style="flex-shrink:0;padding:6px 12px;border-radius:16px;border:1px solid ${a ? st.col : '#e5e7eb'};background:${a ? st.col : '#fff'};color:${a ? '#fff' : '#1a1a1a'};font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${st.name}<span style="background:${a ? 'rgba(255,255,255,.25)' : '#e5e7eb'};color:${a ? '#fff' : '#6b7280'};border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px">${c}</span></button>`;
      }).join('')}
    </div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:8px;padding-left:2px">${sd.length} deal${sd.length===1?'':'s'} · ${fmt$(stVal)}</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${sd.length === 0 ? '<div style="text-align:center;padding:30px 20px;color:#9ca3af;font-size:13px;background:#f8f9fa;border-radius:10px">No deals in this stage</div>' : sd.map(d => {
        const c = contacts.find(x => x.id === d.cid);
        const passes = matchesFilter(d);
        const sent = getState().emailSent.filter(m => m.dealId === d.id || (c && m.to === c.email));
        const opened = sent.filter(m => m.opened);
        const isNP = !!stage.isLost;
        return `<div data-action="kanban-open-deal-detail-mobile" data-deal-id="${d.id}" style="background:#fff;border-radius:10px;padding:12px;border:1px solid #e5e7eb;border-left:3px solid ${_dealTypeStripeColor(d)};cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.06);opacity:${activeFilters > 0 && !passes ? .3 : (isNP ? .7 : 1)};position:relative">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:5px">
            <div style="font-size:13px;font-weight:600;line-height:1.3;color:#1a1a1a;flex:1">${d.title}</div>
            <button data-action="kanban-open-deal-quick-edit-mobile" data-deal-id="${d.id}" style="width:24px;height:24px;border-radius:5px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;line-height:1" title="Quick edit">✎</button>
          </div>
          ${c ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:7px">
            <div style="width:16px;height:16px;background:#c41230;border-radius:50%;color:#fff;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn + ' ' + c.ln)}</div>
            <span style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.fn} ${c.ln}</span>
          </div>` : ''}
          <div style="font-size:15px;font-weight:800;color:#1a1a1a;font-family:Syne,sans-serif;margin-bottom:6px">${fmt$(d.val)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="display:flex;align-items:center;gap:4px">
              ${Badge(d.branch, 'gray')}
              ${d.age > 7 ? `<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 6px;border-radius:10px;font-weight:600">🔥${d.age}d</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:4px">
              ${sent.length > 0 ? `<span style="font-size:10px;color:${opened.length > 0 ? '#15803d' : '#9ca3af'};background:${opened.length > 0 ? '#f0fdf4' : '#f3f4f6'};padding:1px 6px;border-radius:10px">👁${opened.length}/${sent.length}</span>` : ''}
              <button data-action="kanban-email-deal-mobile" data-deal-id="${d.id}" style="width:26px;height:26px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:12px" title="Email">✉️</button>
            </div>
          </div>
          ${d.closeDate ? `<div style="margin-top:7px;font-size:10px;color:#9ca3af">📅 ${d.closeDate}</div>` : ''}
          ${d.won ? `<div style="position:absolute;top:8px;right:36px;background:#22c55e;color:#fff;border-radius:20px;font-size:9px;font-weight:700;padding:2px 7px">WON</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    `;
  })() : `
  <!-- Kanban board (desktop) -->
  <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:16px;align-items:flex-start">
    ${stages.map(st => {
    const sd = (byStage[st.id] || []);
    // Column $ total: exclude won AND lost so the number reflects live pipe.
    // (For the Not Proceeding column itself this naturally shows $0 since
    // its deals all have lost:true — the column is visible but calls out
    // that nothing in it is counted toward the pipeline.)
    const stVal = sd.filter(d => !d.won && !d.lost).reduce((s, d) => s + d.val, 0);
    const isNP = !!st.isLost;
    const colBg = isNP ? '#fef2f2' : '#f8f9fa';
    return `<div id="col_${st.id}" style="flex-shrink:0;width:236px;display:flex;flex-direction:column;border-radius:12px;background:${colBg};border:2px solid transparent;transition:background .15s,border-color .15s;min-height:460px${isNP ? ';opacity:0.92' : ''}"
        ondragover="event.preventDefault();highlightCol('${st.id}')"
        ondragleave="if(!event.currentTarget.contains(event.relatedTarget))unhighlightCol('${st.id}')"
        ondrop="dropDeal('${st.id}')">

        <div style="padding:12px 12px 6px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:7px;flex:1;min-width:0">
            <div style="width:10px;height:10px;border-radius:50%;background:${st.col};flex-shrink:0"></div>
            <span style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${st.name}</span>
            <span style="background:#e5e7eb;color:#6b7280;border-radius:10px;font-size:10px;font-weight:700;padding:1px 6px;flex-shrink:0">${sd.length}</span>
          </div>
          <button data-action="kanban-open-stage-edit" data-stage-id="${st.id}" title="Edit stage"
            style="width:24px;height:24px;border-radius:6px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1"
            onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='transparent'">⋯</button>
        </div>
        <div style="padding:0 10px 6px;font-size:11px;color:#9ca3af;font-weight:500">${fmt$(stVal)}</div>

        <div style="flex:1;padding:0 8px 8px;display:flex;flex-direction:column;gap:7px">
          ${sd.length === 0 ? `<div style="height:70px;border:2px dashed #e2e8f0;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:12px">Drop here</div>` : ''}
          ${sd.map(d => {
      const c = contacts.find(x => x.id === d.cid);
      const passes = matchesFilter(d);
      const sent = getState().emailSent.filter(m => m.dealId === d.id || (c && m.to === c.email));
      const opened = sent.filter(m => m.opened);
      return `<div
              draggable="true"
              ondragstart="dragDeal='${d.id}';event.dataTransfer.effectAllowed='move';event.currentTarget.style.opacity='0.45';event.currentTarget.style.cursor='grabbing'"
              ondragend="event.currentTarget.style.opacity='1';if(!dragDeal){return;}dragDeal=null;dragOverStage=null;unhighlightAllCols();renderPage()"
              data-action="kanban-open-deal-detail" data-deal-id="${d.id}"
              style="background:#fff;border-radius:10px;padding:12px;border:1px solid #e5e7eb;border-left:3px solid ${_dealTypeStripeColor(d)};cursor:grab;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:box-shadow .15s,transform .1s;opacity:${activeFilters > 0 && !passes ? .3 : (isNP ? .7 : 1)};position:relative;user-select:none"
              onmouseover="if(!dragDeal){this.style.boxShadow='0 4px 14px rgba(0,0,0,.12)';this.style.transform='translateY(-1px)';}"
              onmouseout="this.style.boxShadow='0 1px 3px rgba(0,0,0,.06)';this.style.transform=''">

              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:5px">
                <div style="font-size:13px;font-weight:600;line-height:1.3;color:#1a1a1a;flex:1">${d.title}</div>
                <button data-action="kanban-open-deal-quick-edit" data-deal-id="${d.id}"
                  style="width:20px;height:20px;border-radius:5px;border:none;background:transparent;cursor:pointer;color:#9ca3af;font-size:14px;flex-shrink:0;display:flex;align-items:center;justify-content:center;padding:0;line-height:1"
                  onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'" title="Quick edit">✎</button>
              </div>

              ${c ? `<div style="display:flex;align-items:center;gap:5px;margin-bottom:7px">
                <div style="width:16px;height:16px;background:#c41230;border-radius:50%;color:#fff;font-size:6px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${avatar(c.fn + ' ' + c.ln)}</div>
                <span style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.fn} ${c.ln}</span>
              </div>`: ''}

              <div style="font-size:15px;font-weight:800;color:#1a1a1a;font-family:Syne,sans-serif;margin-bottom:8px">${fmt$(d.val)}</div>

              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="display:flex;align-items:center;gap:4px">
                  ${Badge(d.branch, 'gray')}
                  ${d.age > 7 ? `<span style="font-size:10px;background:#fef3c7;color:#b45309;padding:1px 6px;border-radius:10px;font-weight:600">🔥${d.age}d</span>` : ''}
                </div>
                <div style="display:flex;align-items:center;gap:4px">
                  ${sent.length > 0 ? `<span class="etrack" style="font-size:10px;color:${opened.length > 0 ? '#15803d' : '#9ca3af'};background:${opened.length > 0 ? '#f0fdf4' : '#f3f4f6'};padding:1px 6px;border-radius:10px;cursor:default">👁${opened.length}/${sent.length}<div class="etrack-tip" style="text-align:left">${sent.map(m => '<div style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,.1)"><div style="font-weight:600;font-size:11px">' + (m.subject || 'Email') + '</div><div style="color:#9ca3af;font-size:10px">Sent: ' + (m.date || '') + '</div><div style="font-size:10px;margin-top:2px;' + (m.opened ? 'color:#4ade80' : 'color:#fbbf24') + '">' + (m.opened ? '✓ Opened' + (m.openedAt ? ' · ' + m.openedAt : '') : '✗ Not opened') + '</div></div>').join('')}</div></span>` : ''}
                  <button data-action="kanban-email-deal" data-deal-id="${d.id}"
                    style="width:22px;height:22px;border-radius:6px;background:#ede9fe;border:none;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center" title="Email">✉️</button>
                </div>
              </div>
              ${d.closeDate ? `<div style="margin-top:7px;font-size:10px;color:#9ca3af">📅 ${d.closeDate}</div>` : ''}
              ${d.won ? `<div style="position:absolute;top:8px;right:30px;background:#22c55e;color:#fff;border-radius:20px;font-size:9px;font-weight:700;padding:2px 7px">WON</div>` : ''}
            </div>`;
    }).join('')}
        </div>
      </div>`;
  }).join('')}

    <!-- Add Stage button -->
    <div style="flex-shrink:0;width:210px">
      <button data-action="kanban-open-new-stage"
        style="width:100%;height:56px;border:2px dashed #d1d5db;border-radius:12px;background:transparent;cursor:pointer;font-family:inherit;font-size:13px;color:#9ca3af;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s"
        onmouseover="this.style.borderColor='#c41230';this.style.color='#c41230';this.style.background='#fff5f6'"
        onmouseout="this.style.borderColor='#d1d5db';this.style.color='#9ca3af';this.style.background='transparent'">
        ${Icon({ n: 'plus', size: 15 })} Add Stage
      </button>
    </div>
  </div>
  `}

  ${kanbanEditModal ? renderKanbanModal() : ''}
  ${modal && modal.type === 'newDeal' ? renderNewDealModal() : ''}`;
}

function dropDeal(stageId) {
  if (!dragDeal) return;
  const s = getState();
  const deal = s.deals.find(d => d.id === dragDeal);
  if (!deal || deal.sid === stageId) { dragDeal = null; dragOverStage = null; return; }
  const pl = PIPELINES.find(p => p.id === dPipeline);
  const st = pl ? pl.stages.find(s => s.id === stageId) : null;
  // Step 4 §1: drag-to-won column must route through the quote-selection gate.
  if (st && st.isWon) {
    var _draggedId = dragDeal;
    dragDeal = null; dragOverStage = null; unhighlightAllCols();
    _requestWonTransition(_draggedId, stageId, { source: 'kanban-drag' });
    return;
  }
  // Brief 1: Lost transition must capture a reason. Gate through the modal
  // BEFORE moving the deal — cancelling leaves the deal in its current stage.
  // Cleanup of drag globals + col highlighting must happen before the modal
  // opens, otherwise the kanban col stays highlighted and the next drag
  // misbehaves.
  if (st && st.isLost) {
    var _draggedId = dragDeal;
    dragDeal = null; dragOverStage = null; unhighlightAllCols();
    _requestLostTransition(_draggedId, stageId, { source: 'kanban-drag' });
    return;
  }
  const act = {
    id: 'a' + Date.now(), type: 'stage', text: 'Moved to: ' + (st ? st.name : stageId),
    date: new Date().toISOString().slice(0, 10), time: new Date().toTimeString().slice(0, 5),
    by: (getCurrentUser() || { name: 'Admin' }).name, done: false, dueDate: ''
  };
  var _did = dragDeal;
  setState({
    deals: s.deals.map(d => d.id === dragDeal
      ? {
        ...d, sid: stageId,
        won: !!(st && st.isWon),
        lost: !!(st && st.isLost),
        wonDate: (st && st.isWon) ? new Date().toISOString().slice(0, 10) : (d.wonDate || null),
        activities: [act, ...(d.activities || [])]
      } : d)
  });
  dbUpdate('deals', _did, { sid: stageId, won: !!(st && st.isWon), lost: !!(st && st.isLost), won_date: (st && st.isWon) ? new Date().toISOString().slice(0, 10) : null });
  dbInsert('activities', actToDb(act, 'deal', _did));
  // Audit ordinary mid-pipeline drags. Won / Lost drag paths return early
  // above and gate through their own audit-emitting flows.
  if (typeof appendAuditEntry === 'function' && !(st && st.isWon) && !(st && st.isLost)) {
    appendAuditEntry({
      entityType:'deal', entityId:_did, action:'deal.stage_changed',
      summary:'Stage changed to ' + (st ? st.name : stageId),
      before:{ sid: deal.sid }, after:{ sid: stageId },
      metadata:{ source:'kanban-drag' },
      branch: deal.branch || null,
    });
  }
  dragDeal = null; dragOverStage = null; unhighlightAllCols();
  if (st && st.isWon) addToast('🎉 Deal Won!', 'success');
  else addToast('Moved to ' + (st ? st.name : stageId), 'info');
  renderPage();
}
