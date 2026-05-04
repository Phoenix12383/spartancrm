// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 08-sales-crm.js (ORCHESTRATOR)
// Extracted from 08-sales-crm.js on 2026-05-02 as part of monolith breakup.
// Shared globals, shared helpers used by 2+ sub-modules.
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 08-sales-crm.js
// Extracted from original index.html lines 3086-6587
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ── MOBILE: TODAY HOME SCREEN ─────────────────────────────────────────────────
// Black hero strip + 2×2 stat grid + Today's appointments + Recent open deals.
// Designed for the Capacitor wrapper; rendered via renderDashboard() when
// isNativeWrapper() is true. Layout follows SpartanSalesMobile.jsx's TodayScreen
// pattern but uses our brand red (#c41230) and existing data shapes.
// ─────────────────────────────────────────────────────────────────────────────
// PIPEDRIVE-REPLACEMENT PHASE 9: mobile detail tab state
// ─────────────────────────────────────────────────────────────────────────────
// Single global tab id, persists across renders within the session. Survives
// renderPage triggered by a realtime echo. Reset to 'activity' is a manual
// thing the user does — bouncing between deals keeps the last tab.
//
// Six tabs: activity / notes / email / sms / files / person.
var _mobileEntityTab = 'activity';
// Desktop detail-view tab (activity / notes / call / sms / email / files).
// Shared between renderEntityDetail (08e) and the inline onclick handlers it
// emits; declared here in the orchestrator so it's defined before any 08x
// sub-module reads it on first render. Reassigned without `var` in
// 10-integrations.js and 08e on tab clicks / detail-id changes.
var detailTab = 'activity';

// ─────────────────────────────────────────────────────────────────────────────
// Top-level state restored 2026-05-04 — these were declared in the pre-split
// 08-sales-crm.js (let/const) and dropped during the 2026-05-02 monolith
// split, but every one is still actively referenced across 08a-h. Using
// `var` (not `let`/`const`) so inline event handlers in template strings —
// e.g. `ondragstart="schDragEntryId='${en.id}'"`, `onclick="detailTab='..';
// renderPage()"` — can resolve the names via the window scope chain.
// ─────────────────────────────────────────────────────────────────────────────

// Schedule-activity modal (08e renderEntityDetail + 08h scheduler)
var schedActivityModal = false;
var schedActivityData = { type: 'call', title: '', date: '', time: '09:00', duration: 30, entityId: '', entityType: '', notes: '' };

// Mobile deal kanban filter (08a, 08d)
var _mobileDealStageId = null;

// Contacts page filters (08a, 08c)
var cSearch = '', cBranch = 'all', cType = 'all';

// Deals kanban + drag-drop (08a, 08d)
var dPipeline = 'p1', dragDeal = null, dragOverStage = null;

// Kanban filter chips (08a)
var kFilterOwners = [], kFilterStages = [], kFilterSource = [], kFilterValMin = '', kFilterValMax = '', kFilterOpen = false;

// Scheduler view + drag scheduling + modal (08h)
var schView = 'week';
var schOffset = 0;
var schDayOffset = 0;
var schInstFilter = 'all';
var schDragEntryId = null;
var schModalOpen = false;
var schModalData = { jid: '', date: '', startTime: '08:00', durationH: 4, staffRequired: 2, assignedIds: [] };

// Scheduler mock data (08h)
var SCH_BASE_DATE = '2024-11-18';
var INSTALLER_PROFILES = [];
var SCHED_ENTRIES = [
  { id: 'se1',  jid: 'j1', instId: 'i1', date: '2024-11-05', startTime: '07:00', durationH: 8 },
  { id: 'se2',  jid: 'j1', instId: 'i2', date: '2024-11-05', startTime: '07:00', durationH: 8 },
  { id: 'se3',  jid: 'j2', instId: 'i1', date: '2024-11-20', startTime: '07:30', durationH: 10 },
  { id: 'se4',  jid: 'j2', instId: 'i3', date: '2024-11-20', startTime: '07:30', durationH: 10 },
  { id: 'se5',  jid: 'j2', instId: 'i4', date: '2024-11-21', startTime: '07:30', durationH: 10 },
  { id: 'se6',  jid: 'j4', instId: 'i1', date: '2024-11-25', startTime: '07:30', durationH: 12 },
  { id: 'se7',  jid: 'j4', instId: 'i3', date: '2024-11-25', startTime: '07:30', durationH: 12 },
  { id: 'se8',  jid: 'j4', instId: 'i4', date: '2024-11-26', startTime: '07:30', durationH: 12 },
  { id: 'se9',  jid: 'j3', instId: 'i2', date: '2024-11-19', startTime: '08:00', durationH: 6 },
  { id: 'se10', jid: 'j8', instId: 'i1', date: '2024-11-14', startTime: '07:00', durationH: 8 },
  { id: 'se11', jid: 'j8', instId: 'i2', date: '2024-11-14', startTime: '07:00', durationH: 8 },
];
var _pendingMobileEmail = null;          // { entityId, entityType, to, subject, body, sending }
var _pendingMobileNote = null;          // { entityId, entityType, text }
var _pendingMobileSchedule = null;
var _inlineEmailDrafts = {}; // { [entityId]: {subject, body} }
var _inlineSmsDrafts = {}; // { [entityId]: { body } }
var _pendingWonDealId = null;                  // payment-method phase (existing)
var _pendingWonQuoteSelection = null;          // {dealId, targetStageId, selectedQuoteId}
var _pendingUnwindDealId = null;               // unwind admin modal
var _pendingLostTransition = null;
var _pendingDealTypePicker = null;
var DEFAULT_LOST_REASONS = [
  { id: 'price',        label: 'Price',         active: true },
  { id: 'competitor',   label: 'Competitor',    active: true },
  { id: 'timing',       label: 'Timing',        active: true },
  { id: 'ghosted',      label: 'Ghosted',       active: true },
  { id: 'scope_changed', label: 'Scope changed', active: true },
  { id: 'other',        label: 'Other',         active: true },
];
let kanbanEditModal = null;


// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers used by multiple sub-modules
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

function _nextActivityChipState(entity) {
  if (!entity) return { tone: 'none', label: '+ Schedule', hint: null };
  var iso = entity.nextActivityAt;
  if (!iso) return { tone: 'none', label: '+ Schedule', hint: null };

  var when;
  try { when = new Date(iso); } catch(e) { return { tone: 'none', label: '+ Schedule', hint: null }; }
  if (isNaN(when.getTime())) return { tone: 'none', label: '+ Schedule', hint: null };

  var typeId = entity.nextActivityType || 'call';
  var meta = (typeof getActivityType === 'function') ? getActivityType(typeId) : null;
  var icon = (meta && meta.icon) || '📌';
  var typeLabel = (meta && meta.label) || (typeId.charAt(0).toUpperCase() + typeId.slice(1));

  var now = new Date();
  var endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Format helpers — relative-day prefix + 12h time so the chip stays compact
  // ("Call today 3pm", "Call Tue 9am", "Overdue Call · 2d").
  function fmt12(dt) {
    var h = dt.getHours(); var m = dt.getMinutes();
    var ap = h >= 12 ? 'pm' : 'am'; var h12 = h % 12 || 12;
    return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ap;
  }
  function dayWord(dt) {
    var sameDay = dt.toDateString() === now.toDateString();
    if (sameDay) return 'today';
    var tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (dt.toDateString() === tomorrow.toDateString()) return 'tomorrow';
    var diffDays = Math.round((dt - now) / 86400000);
    if (diffDays > 0 && diffDays < 7) return dt.toLocaleDateString('en-AU', { weekday: 'short' });
    return dt.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  if (when < now) {
    // Overdue — show "2d" or "1h" since due, no time-of-day.
    var diffMs = now - when;
    var diffDays = Math.floor(diffMs / 86400000);
    var diffHrs = Math.floor(diffMs / 3600000);
    var ago = diffDays >= 1 ? diffDays + 'd' : diffHrs + 'h';
    return { tone: 'overdue', label: icon + ' ' + typeLabel + ' · ' + ago, hint: typeId };
  }
  if (when <= endOfToday) {
    return { tone: 'today', label: icon + ' ' + typeLabel + ' today ' + fmt12(when), hint: typeId };
  }
  return { tone: 'future', label: icon + ' ' + typeLabel + ' ' + dayWord(when) + ' ' + fmt12(when), hint: typeId };
}

function renderNextActivityChip(entity, entityType, opts) {
  if (!entity || !entityType) return '';
  opts = opts || {};
  var s = _nextActivityChipState(entity);
  var palette = {
    overdue: { bg: '#fef2f2', border: '#fca5a5', col: '#b91c1c' },
    today:   { bg: '#fffbeb', border: '#fcd34d', col: '#b45309' },
    future:  { bg: '#ecfdf5', border: '#86efac', col: '#15803d' },
    none:    { bg: '#f9fafb', border: '#e5e7eb', col: '#9ca3af' },
  };
  var p = palette[s.tone];
  var idEsc = String(entity.id).replace(/'/g, "\\'");
  // stopPropagation so tapping the chip on a card doesn't also trigger the
  // card's "open detail" onclick.
  var handler = "event.stopPropagation();openMobileSchedule('" + idEsc + "','" + entityType + "'" + (s.hint ? ",'" + s.hint + "'" : '') + ")";
  var size = opts.size === 'sm' ? '10px;padding:3px 8px' : '11px;padding:4px 10px';
  return '<button onclick="' + handler + '" style="display:inline-flex;align-items:center;gap:4px;border:1px solid ' + p.border + ';background:' + p.bg + ';color:' + p.col + ';border-radius:14px;font-size:' + size + ';font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis">' + s.label + '</button>';
}

function _renderInlineRowActions(phone, entityId, entityType, contactName) {
  if (!phone) return '';
  var idEsc = String(entityId).replace(/'/g, "\\'");
  var nameEsc = String(contactName || '').replace(/'/g, "\\'");
  var phoneEsc = String(phone).replace(/'/g, "\\'");
  var smsHref = 'sms:' + String(phone).replace(/[^\d+]/g, '');
  var btnStyle = 'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;font-size:14px;text-decoration:none;flex-shrink:0';
  // Call button → twilioCall (which routes to dialViaTwilioBridge on native).
  var call = '<button onclick="event.stopPropagation();twilioCall(\'' + phoneEsc + '\',\'' + idEsc + '\',\'' + entityType + '\',\'' + nameEsc + '\')" style="' + btnStyle + ';background:#dcfce7;color:#15803d" title="Call">📞</button>';
  // SMS opens the device's native SMS composer — same pattern as the action
  // bar's SMS button on the detail screen.
  var sms = '<a href="' + smsHref + '" onclick="event.stopPropagation()" style="' + btnStyle + ';background:#dbeafe;color:#1d4ed8" title="SMS">💬</a>';
  return '<div style="display:flex;gap:6px;flex-shrink:0">' + call + sms + '</div>';
}

function maybePromptNextActivity(entityId, entityType, hint) {
  if (typeof isNativeWrapper !== 'function' || !isNativeWrapper()) return;
  if (!entityId || !entityType) return;
  // Don't stack on top of an already-open modal (e.g. user just scheduled
  // something else). The pending-state guard prevents that.
  if (typeof _pendingMobileSchedule !== 'undefined' && _pendingMobileSchedule) return;
  setTimeout(function() {
    if (typeof openMobileSchedule === 'function') {
      openMobileSchedule(entityId, entityType, hint || null);
    }
  }, 350);
}

function getEntityActivities(entityId, entityType) {
  const s = getState();
  if (entityType === 'deal') {
    const d = s.deals.find(x => x.id === entityId);
    return d ? (d.activities || []) : [];
  }
  if (entityType === 'lead') {
    const l = s.leads.find(x => x.id === entityId);
    return l ? (l.activities || []) : [];
  }
  if (entityType === 'contact') {
    // Merge contact-level activities with activities from all linked deals/leads
    const contactActs = (s.contactActivities || {})[entityId] || [];
    const contact = s.contacts.find(c => c.id === entityId);
    if (!contact) return contactActs;
    const dealActs = s.deals
      .filter(d => d.cid === entityId)
      .flatMap(d => (d.activities || []).map(a => ({ ...a, _source: 'deal', _dealTitle: d.title })));
    const leadActs = s.leads
      .filter(l => l.email === contact.email && contact.email)
      .flatMap(l => (l.activities || []).map(a => ({ ...a, _source: 'lead', _leadName: l.fn + ' ' + l.ln })));
    return [...contactActs, ...dealActs, ...leadActs].sort((a, b) => b.date > a.date ? 1 : -1);
  }
  return [];
}

function saveActivityToEntity(entityId, entityType, actObj) {
  const s = getState();
  if (entityType === 'deal') {
    setState({ deals: s.deals.map(d => d.id === entityId ? { ...d, activities: [actObj, ...(d.activities || [])] } : d) });
    const d = s.deals.find(x => x.id === entityId);
    if (d && d.cid) mirrorActivityToContact(d.cid, { ...actObj, _source: 'deal' });
  } else if (entityType === 'lead') {
    setState({ leads: s.leads.map(l => l.id === entityId ? { ...l, activities: [actObj, ...(l.activities || [])] } : l) });
  } else if (entityType === 'contact') {
    const ca = { ...(s.contactActivities || {}) };
    ca[entityId] = [actObj, ...(ca[entityId] || [])];
    setState({ contactActivities: ca });
  }
  dbInsert('activities', actToDb(actObj, entityType, entityId));
}

function mirrorActivityToContact(contactId, actObj) {
  const s = getState();
  const ca = { ...(s.contactActivities || {}) };
  // Don't double-store if it already has the same id
  if ((ca[contactId] || []).find(a => a.id === actObj.id)) return;
  ca[contactId] = [actObj, ...(ca[contactId] || [])];
  setState({ contactActivities: ca });
}

function _escAttr(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _escText(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
