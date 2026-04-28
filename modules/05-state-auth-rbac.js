// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 05-state-auth-rbac.js
// Extracted from original index.html lines 1984-2393
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED AUDIT LOG (Module 01 — primitive only, Brief 2 Phase 1)
// ══════════════════════════════════════════════════════════════════════════════
//
// Forensic record of who changed what, when, on any entity. Single localStorage
// key `spartan_audit_log` holds an array of entries, capped at 5000 entries
// (oldest pruned on overflow with a `system.audit_pruned` marker entry left
// behind so the gap is visible).
//
// This phase ships only the primitive: append, query, filter. No UI yet (that's
// Phase 3) and no wiring into existing call sites yet (that's Phase 2). The
// helper is safe to call from any code path including during boot — guards
// against missing getCurrentUser() with a 'system' fallback.
//
// Entry shape:
//   id          'aud_' + Date.now() + '_' + 6-char random
//   timestamp   ISO string (server-trustable enough; clock skew is fine)
//   userId      from getCurrentUser() or 'system' if no user context
//   userName    same source
//   entityType  'deal' | 'contact' | 'lead' | 'job' | 'invoice' |
//               'user' | 'settings' | 'commission' | 'rbac' |
//               'integration' | 'system'
//   entityId    string or null (some actions like settings have no entity)
//   action      key from AUDIT_ACTIONS
//   summary     single human-readable line for the UI table
//   before      object snapshot of changed fields, or null
//   after       object snapshot of changed fields, or null
//   metadata    action-specific extras: {source:'drag'}, {competitor:'X'}, etc.
//   branch      copied from current user or entity for state scoping

// Canonical action vocabulary. Adding a new audit action requires adding its
// key here first so the UI knows how to render it. Keys are dot-prefixed by
// entity type for grep-ability.
var AUDIT_ACTIONS = Object.freeze({
  // Deal lifecycle
  'deal.stage_changed':       'Stage changed',
  'deal.field_edited':        'Deal edited',
  'deal.won_marked':          'Deal won',
  'deal.lost_marked':         'Deal lost',
  'deal.won_unwound':         'Won deal cancelled',
  'deal.quote_selected':      'Won quote selected',
  // Contact + lead
  'contact.field_edited':     'Contact edited',
  'contact.created':          'Contact created',
  'lead.field_edited':        'Lead edited',
  'lead.created':             'Lead created',
  'lead.converted':           'Lead converted to deal',
  // Job + invoice
  'job.field_edited':         'Job edited',
  'job.status_changed':       'Job status changed',
  'job.cad_saved':            'CAD design saved',
  'job.final_signed':         'Final design signed',
  'job.cm_completed':         'Check measure completed',
  'invoice.created':          'Invoice created',
  'invoice.sent':             'Invoice sent',
  'invoice.paid':             'Invoice paid',
  // Users + RBAC
  'user.created':             'User created',
  'user.role_changed':        'User role changed',
  'user.activated':           'User activated',
  'user.deactivated':         'User deactivated',
  'user.login':               'User logged in',
  'user.permissions_changed': 'User permissions changed',
  'rbac.role_changed':        'Role permissions changed',
  // Settings
  'settings.template_edited': 'Email/SMS template edited',
  'settings.signature_edited': 'Email signature edited',
  'settings.status_edited':   'Custom status edited',
  'settings.field_edited':    'Custom field edited',
  'settings.tag_edited':      'Tag edited',
  'settings.lost_reason_edited': 'Lost reasons edited',
  'settings.phone_edited':    'Phone & IVR settings edited',
  // Commission
  'commission.rules_updated': 'Commission rules updated',
  'commission.accrued':       'Commission accrued',
  'commission.realised':      'Commission realised',
  'commission.paid':          'Commission marked paid',
  'commission.unpaid':        'Commission marked unpaid',
  'commission.clawed_back':   'Commission clawed back',
  'commission.pay_run_finalised':  'Pay run finalised',
  'commission.pay_run_voided':     'Pay run voided',
  'commission.pay_run_backfilled': 'Pay run backfilled',
  // Integrations
  'integration.connected':      'Integration connected',
  'integration.disconnected':   'Integration disconnected',
  'integration.credential_changed': 'Integration credentials changed',
  // System / housekeeping
  'system.audit_pruned':           'Audit log pruned',
  'system.commission_state_migrated': 'Commission state migrated',
  'system.dealtype_backfilled':    'Deal type backfilled',
});

var AUDIT_LOG_KEY = 'spartan_audit_log';
var AUDIT_LOG_CAP = 5000;
var AUDIT_PRUNE_BATCH = 1000;

// Read the full audit log from localStorage. Always returns an array (never
// null) so callers can chain .filter without guards.
function _readAuditLog() {
  try {
    var raw = localStorage.getItem(AUDIT_LOG_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function _writeAuditLog(arr) {
  try { localStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(arr)); } catch (e) {}
}

// Public — append a single audit entry. Fills in id/timestamp/userId/userName
// from current context. Mirrors to Supabase if `_sb` is available; failure to
// mirror is logged once but never throws. Returns the persisted entry so the
// caller can reference its id (e.g. for later correlation).
function appendAuditEntry(entry) {
  if (!entry || !entry.action) return null;

  var cu = (typeof getCurrentUser === 'function') ? (getCurrentUser() || {}) : {};
  var nowIso = new Date().toISOString();
  var rand = Math.random().toString(36).slice(2, 8);

  var fullEntry = {
    id:         entry.id || ('aud_' + Date.now() + '_' + rand),
    timestamp:  entry.timestamp || nowIso,
    userId:     entry.userId || cu.id || 'system',
    userName:   entry.userName || cu.name || 'System',
    entityType: entry.entityType || null,
    entityId:   entry.entityId || null,
    action:     entry.action,
    summary:    entry.summary || (AUDIT_ACTIONS[entry.action] || entry.action),
    before:     (entry.before === undefined) ? null : entry.before,
    after:      (entry.after === undefined) ? null : entry.after,
    metadata:   entry.metadata || null,
    branch:     entry.branch || cu.branch || null,
  };

  var log = _readAuditLog();

  // Retention: if the log would exceed the cap, drop the oldest batch and
  // leave a marker entry behind so the gap is visible in the timeline. The
  // marker is recorded BEFORE the new entry so it sits chronologically with
  // the deletion event.
  if (log.length >= AUDIT_LOG_CAP) {
    var removed = log.splice(0, AUDIT_PRUNE_BATCH);
    var firstTs = (removed[0] && removed[0].timestamp) || '';
    var lastTs  = (removed[removed.length - 1] && removed[removed.length - 1].timestamp) || '';
    var pruneMarker = {
      id:         'aud_' + Date.now() + '_prune_' + Math.random().toString(36).slice(2, 6),
      timestamp:  nowIso,
      userId:     'system',
      userName:   'System',
      entityType: 'system',
      entityId:   null,
      action:     'system.audit_pruned',
      summary:    'Pruned ' + removed.length + ' oldest audit entries (' + firstTs.slice(0,10) + ' → ' + lastTs.slice(0,10) + ')',
      before:     null,
      after:     { droppedCount: removed.length, fromTimestamp: firstTs, toTimestamp: lastTs },
      metadata:   null,
      branch:     null,
    };
    log.push(pruneMarker);
    if (typeof dbInsert === 'function' && typeof _sb !== 'undefined' && _sb) {
      try { dbInsert('audit_log', _auditEntryToDb(pruneMarker)); } catch (e) {}
    }
  }

  log.push(fullEntry);
  _writeAuditLog(log);

  // Mirror to Supabase. Soft dependency — table may not exist yet (the
  // SQL migration ships in Phase 2/3), in which case dbInsert errors get
  // swallowed once via the existing _dbWarnOnce helper in 01-persistence.js.
  if (typeof dbInsert === 'function' && typeof _sb !== 'undefined' && _sb) {
    try { dbInsert('audit_log', _auditEntryToDb(fullEntry)); } catch (e) {}
  }

  return fullEntry;
}

// snake_case mapping for Supabase. Mirrors the actToDb / dealToDb pattern
// from 01-persistence.js. Keep in sync with the SQL schema in Phase 2/3.
function _auditEntryToDb(e) {
  return {
    id:          e.id,
    timestamp:   e.timestamp,
    user_id:     e.userId,
    user_name:   e.userName,
    entity_type: e.entityType,
    entity_id:   e.entityId,
    action:      e.action,
    summary:     e.summary,
    before:      e.before,
    after:       e.after,
    metadata:    e.metadata,
    branch:      e.branch,
  };
}

// Public — query the audit log. Optional filter shape:
//   {entityType, entityId, userId, action, from, to}
// `from` / `to` are ISO date strings (inclusive on both ends). Returns
// entries newest-first. With no filter, returns everything (capped by the
// log itself, not by the call).
function getAuditLog(filter) {
  filter = filter || {};
  var log = _readAuditLog();
  var out = log.filter(function(e) {
    if (filter.entityType && e.entityType !== filter.entityType) return false;
    if (filter.entityId && e.entityId !== filter.entityId) return false;
    if (filter.userId && e.userId !== filter.userId) return false;
    if (filter.action && e.action !== filter.action) return false;
    if (filter.from && e.timestamp < filter.from) return false;
    if (filter.to && e.timestamp > filter.to) return false;
    return true;
  });
  // Newest first
  out.sort(function(a, b) { return (b.timestamp || '').localeCompare(a.timestamp || ''); });
  return out;
}

// Public — convenience wrapper for the inline audit timeline on entity
// detail views. Equivalent to getAuditLog({entityType, entityId}).
function getAuditForEntity(entityType, entityId) {
  return getAuditLog({ entityType: entityType, entityId: entityId });
}

// ── Audit page UI (Brief 2 Phase 3) ─────────────────────────────────────────
// Module-local filter + pagination state. Lives outside _state because audit
// browsing is a transient admin activity — survives renderPage rebuilds via
// the input-id focus-restoration mechanism in 99-init.js.
var auditPageFilter = { entityType: '', userId: '', action: '', dateFrom: '', dateTo: '', search: '' };
var auditPageNum = 0;
var auditPageExpanded = {};
var _auditSearchTimer = null;

var AUDIT_ENTITY_TYPES = ['deal', 'contact', 'lead', 'job', 'invoice', 'user', 'settings', 'commission', 'integration', 'system'];
var AUDIT_PAGE_SIZE = 50;

function setAuditFilter(field, value) {
  auditPageFilter[field] = value;
  auditPageNum = 0; // any filter change resets pagination
  if (field === 'search') {
    // Debounce keystrokes — full-page rerender on every char is wasteful.
    if (_auditSearchTimer) clearTimeout(_auditSearchTimer);
    _auditSearchTimer = setTimeout(function () { renderPage(); }, 300);
  } else {
    renderPage();
  }
}
function clearAuditFilters() {
  auditPageFilter = { entityType: '', userId: '', action: '', dateFrom: '', dateTo: '', search: '' };
  auditPageNum = 0;
  renderPage();
}
function setAuditPage(n) {
  auditPageNum = Math.max(0, n);
  renderPage();
}
function toggleAuditExpand(entryId) {
  auditPageExpanded[entryId] = !auditPageExpanded[entryId];
  renderPage();
}

// CSV export — matches the columns the table renders. Quotes/escapes per RFC 4180.
function exportAuditCsv() {
  var entries = _filteredAuditEntries();
  var rows = [['Timestamp','User','Entity Type','Entity ID','Action','Summary','Branch','Before','After','Metadata']];
  entries.forEach(function (e) {
    rows.push([
      e.timestamp || '',
      e.userName || '',
      e.entityType || '',
      e.entityId || '',
      AUDIT_ACTIONS[e.action] || e.action || '',
      e.summary || '',
      e.branch || '',
      e.before == null ? '' : JSON.stringify(e.before),
      e.after == null ? '' : JSON.stringify(e.after),
      e.metadata == null ? '' : JSON.stringify(e.metadata),
    ]);
  });
  var csv = rows.map(function (r) {
    return r.map(function (cell) {
      var s = String(cell == null ? '' : cell);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'spartan-audit-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  if (typeof addToast === 'function') addToast('Audit log exported (' + entries.length + ' rows)', 'success');
}

// Internal — apply current filters to the audit log. Used by both the table
// and the CSV export so they always agree.
function _filteredAuditEntries() {
  var f = auditPageFilter;
  var q = (f.search || '').toLowerCase().trim();
  return getAuditLog({
    entityType: f.entityType || undefined,
    userId: f.userId || undefined,
    action: f.action || undefined,
    from: f.dateFrom || undefined,
    to: f.dateTo ? (f.dateTo + 'T23:59:59.999Z') : undefined,
  }).filter(function (e) {
    if (!q) return true;
    var hay = ((e.summary || '') + ' ' + (e.entityId || '') + ' ' + (e.userName || '')).toLowerCase();
    return hay.indexOf(q) >= 0;
  });
}

// Resolve an entity reference to a click-through URL. Returns an onclick
// string or '' if the entity type doesn't have a detail page.
function _auditEntityNav(entityType, entityId) {
  if (!entityType || !entityId) return '';
  if (entityType === 'deal') return "setState({dealDetailId:'" + entityId + "',page:'deals'})";
  if (entityType === 'lead') return "setState({leadDetailId:'" + entityId + "',page:'leads'})";
  if (entityType === 'contact') return "setState({contactDetailId:'" + entityId + "',page:'contacts'})";
  if (entityType === 'job') return "setState({jobDetailId:'" + entityId + "',page:'jobs'})";
  return '';
}

function renderAuditPage() {
  if (!hasPermission('system.audit_log')) {
    return '<div style="max-width:540px;margin:80px auto;text-align:center"><div style="font-size:42px;margin-bottom:8px">🔒</div><h2 style="font-size:18px;font-weight:700;margin:0 0 8px">No audit access</h2><p style="font-size:13px;color:#6b7280;margin:0">Ask an admin to grant the <code>system.audit_log</code> permission to your role.</p></div>';
  }

  var allFiltered = _filteredAuditEntries();
  var totalEntries = allFiltered.length;
  var totalPages = Math.max(1, Math.ceil(totalEntries / AUDIT_PAGE_SIZE));
  if (auditPageNum >= totalPages) auditPageNum = totalPages - 1;
  var pageStart = auditPageNum * AUDIT_PAGE_SIZE;
  var pageEntries = allFiltered.slice(pageStart, pageStart + AUDIT_PAGE_SIZE);

  // Distinct user list for the filter dropdown — pulled from the log itself
  // so deactivated/deleted users still show up if they have historical entries.
  var userOpts = {};
  getAuditLog().forEach(function (e) {
    if (e.userId) userOpts[e.userId] = e.userName || e.userId;
  });
  var users = Object.keys(userOpts).map(function (id) { return { id: id, name: userOpts[id] }; })
    .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

  var hasFilters = !!(auditPageFilter.entityType || auditPageFilter.userId || auditPageFilter.action || auditPageFilter.dateFrom || auditPageFilter.dateTo || auditPageFilter.search);

  var filterBar = ''
    + '<div class="card" style="padding:14px 16px;margin-bottom:14px">'
    +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:10px">'
    +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Entity type</label>'
    +       '<select class="sel" id="audit_entity_type" onchange="setAuditFilter(\'entityType\',this.value)">'
    +         '<option value="">All</option>'
    +         AUDIT_ENTITY_TYPES.map(function (t) { return '<option value="' + t + '"' + (auditPageFilter.entityType === t ? ' selected' : '') + '>' + t + '</option>'; }).join('')
    +       '</select></div>'
    +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">User</label>'
    +       '<select class="sel" id="audit_user" onchange="setAuditFilter(\'userId\',this.value)">'
    +         '<option value="">All</option>'
    +         users.map(function (u) { return '<option value="' + u.id + '"' + (auditPageFilter.userId === u.id ? ' selected' : '') + '>' + (u.name || u.id) + '</option>'; }).join('')
    +       '</select></div>'
    +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Action</label>'
    +       '<select class="sel" id="audit_action" onchange="setAuditFilter(\'action\',this.value)">'
    +         '<option value="">All</option>'
    +         Object.keys(AUDIT_ACTIONS).sort().map(function (k) { return '<option value="' + k + '"' + (auditPageFilter.action === k ? ' selected' : '') + '>' + AUDIT_ACTIONS[k] + ' (' + k + ')</option>'; }).join('')
    +       '</select></div>'
    +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">From</label>'
    +       '<input class="inp" id="audit_from" type="date" value="' + (auditPageFilter.dateFrom || '') + '" onchange="setAuditFilter(\'dateFrom\',this.value)"></div>'
    +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">To</label>'
    +       '<input class="inp" id="audit_to" type="date" value="' + (auditPageFilter.dateTo || '') + '" onchange="setAuditFilter(\'dateTo\',this.value)"></div>'
    +     '<div><label style="font-size:11px;color:#6b7280;display:block;margin-bottom:4px">Search summary</label>'
    +       '<input class="inp" id="audit_search" type="search" placeholder="Free text…" value="' + (auditPageFilter.search || '').replace(/"/g, '&quot;') + '" oninput="setAuditFilter(\'search\',this.value)"></div>'
    +   '</div>'
    +   '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#6b7280">'
    +     '<div>' + totalEntries + ' entr' + (totalEntries === 1 ? 'y' : 'ies') + (hasFilters ? ' (filtered)' : '') + '</div>'
    +     '<div style="display:flex;gap:8px">'
    +       (hasFilters ? '<button class="btn-w" onclick="clearAuditFilters()" style="font-size:12px">Clear filters</button>' : '')
    +       '<button class="btn-w" onclick="exportAuditCsv()" style="font-size:12px">⬇ Export CSV</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';

  // Table
  var rows = pageEntries.map(function (e) {
    var nav = _auditEntityNav(e.entityType, e.entityId);
    var entityCell = e.entityType
      ? (nav ? '<a href="javascript:void(0)" onclick="' + nav + '" style="color:#c41230;text-decoration:none;font-weight:500">' + e.entityType + (e.entityId ? '/' + e.entityId.slice(0, 12) : '') + '</a>'
              : '<span style="color:#6b7280">' + e.entityType + (e.entityId ? '/' + e.entityId.slice(0, 12) : '') + '</span>')
      : '<span style="color:#9ca3af">—</span>';
    var actionLabel = AUDIT_ACTIONS[e.action] || e.action;
    var ts = (e.timestamp || '').replace('T', ' ').slice(0, 19);
    var hasDiff = e.before != null || e.after != null;
    var expanded = auditPageExpanded[e.id];
    var diffRow = (hasDiff && expanded) ? ''
      + '<tr><td colspan="6" style="padding:0;background:#f9fafb;border-bottom:1px solid #e5e7eb">'
      +   '<div style="padding:14px 18px;display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:11px">'
      +     '<div><div style="font-weight:700;color:#b91c1c;margin-bottom:4px">BEFORE</div><pre style="background:#fff;padding:10px;border-radius:6px;border:1px solid #e5e7eb;overflow-x:auto;margin:0;font-family:monospace;font-size:11px;max-height:200px;overflow-y:auto">' + (e.before == null ? '(none)' : _escTextForAudit(JSON.stringify(e.before, null, 2))) + '</pre></div>'
      +     '<div><div style="font-weight:700;color:#15803d;margin-bottom:4px">AFTER</div><pre style="background:#fff;padding:10px;border-radius:6px;border:1px solid #e5e7eb;overflow-x:auto;margin:0;font-family:monospace;font-size:11px;max-height:200px;overflow-y:auto">' + (e.after == null ? '(none)' : _escTextForAudit(JSON.stringify(e.after, null, 2))) + '</pre></div>'
      +   '</div>'
      +   (e.metadata ? '<div style="padding:0 18px 14px;font-size:11px;color:#6b7280">Metadata: <code style="background:#fff;padding:2px 6px;border-radius:4px;border:1px solid #e5e7eb">' + _escTextForAudit(JSON.stringify(e.metadata)) + '</code></div>' : '')
      + '</td></tr>'
      : '';
    return ''
      + '<tr style="border-bottom:1px solid #f0f0f0">'
      +   '<td class="td" style="font-family:monospace;font-size:11px;white-space:nowrap;color:#6b7280">' + ts + '</td>'
      +   '<td class="td" style="font-size:12px">' + (e.userName || '—') + '</td>'
      +   '<td class="td" style="font-size:12px">' + entityCell + '</td>'
      +   '<td class="td" style="font-size:12px;font-weight:500">' + actionLabel + '</td>'
      +   '<td class="td" style="font-size:12px;color:#1a1a1a">' + (e.summary || '').replace(/</g, '&lt;') + '</td>'
      +   '<td class="td" style="text-align:right">' + (hasDiff
            ? '<button onclick="toggleAuditExpand(\'' + e.id + '\')" class="btn-g" style="font-size:11px;padding:3px 8px">' + (expanded ? '▾ Hide' : '▸ Show') + '</button>'
            : '<span style="color:#9ca3af;font-size:11px">—</span>') + '</td>'
      + '</tr>'
      + diffRow;
  }).join('');

  var emptyState = pageEntries.length === 0
    ? '<tr><td colspan="6" style="padding:60px 20px;text-align:center;color:#9ca3af;font-size:13px">No entries' + (hasFilters ? ' match the current filters' : ' yet') + '.</td></tr>'
    : '';

  // Pagination
  var paginator = ''
    + '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid #f0f0f0;font-size:12px;color:#6b7280">'
    +   '<div>Showing ' + (pageEntries.length === 0 ? 0 : (pageStart + 1)) + '–' + (pageStart + pageEntries.length) + ' of ' + totalEntries + '</div>'
    +   '<div style="display:flex;align-items:center;gap:8px">'
    +     '<button class="btn-w" onclick="setAuditPage(' + (auditPageNum - 1) + ')" ' + (auditPageNum === 0 ? 'disabled' : '') + ' style="font-size:11px;padding:4px 10px">← Prev</button>'
    +     '<span>Page ' + (auditPageNum + 1) + ' of ' + totalPages + '</span>'
    +     '<button class="btn-w" onclick="setAuditPage(' + (auditPageNum + 1) + ')" ' + (auditPageNum >= totalPages - 1 ? 'disabled' : '') + ' style="font-size:11px;padding:4px 10px">Next →</button>'
    +   '</div>'
    + '</div>';

  return ''
    + '<div style="margin-bottom:18px"><h1 style="font-size:24px;font-weight:800;margin:0;font-family:Syne,sans-serif">📋 Audit Log</h1>'
    +   '<p style="font-size:13px;color:#6b7280;margin:2px 0 0">Forensic record of every state change. Most recent first.</p></div>'
    + filterBar
    + '<div class="card" style="overflow:hidden">'
    +   '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:900px">'
    +     '<thead><tr>'
    +       '<th class="th">Timestamp</th>'
    +       '<th class="th">User</th>'
    +       '<th class="th">Entity</th>'
    +       '<th class="th">Action</th>'
    +       '<th class="th">Summary</th>'
    +       '<th class="th" style="text-align:right">Diff</th>'
    +     '</tr></thead>'
    +     '<tbody>' + (rows || emptyState) + '</tbody>'
    +   '</table></div>'
    +   paginator
    + '</div>';
}

function _escTextForAudit(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ══════════════════════════════════════════════════════════════════════════════
// END Unified Audit Log
// ══════════════════════════════════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────────────────────────────
// ROLE-BASED ACCESS CONTROL (RBAC)
var ALL_ROLES = [
  {id:'admin',label:'Admin',desc:'Full access to everything'},
  {id:'sales_manager',label:'Sales Manager',desc:'Sales + Jobs full, Factory/Accounts view'},
  {id:'sales_rep',label:'Sales Rep',desc:'Sales CRM (own data), view Jobs'},
  {id:'production_manager',label:'Production Manager',desc:'Factory + Jobs full, view Sales'},
  {id:'production_staff',label:'Production Staff',desc:'Factory floor only'},
  {id:'installer',label:'Installer',desc:'Assigned jobs only — CM, Install, Service'},
  {id:'accounts',label:'Accounts',desc:'Full Accounts, Invoicing, read-only elsewhere'},
  {id:'service_staff',label:'Service Staff',desc:'Service CRM full, view Jobs'},
  {id:'viewer',label:'Viewer',desc:'Read-only access'},
];

// Module + page permission matrix per role
// 'full' = read+write, 'view' = read-only, false = hidden
var DEFAULT_PERMISSIONS = {
  admin:              {sales:true,jobs:true,factory:true,accounts:true,service:true,
    pages:['*']},
  sales_manager:      {sales:true,jobs:true,factory:'view',accounts:'view',service:true,
    pages:['dashboard','contacts','leads','deals','won','calendar','email','phone','map','reports','settings','invoicing','commission',
      'jobdashboard','jobs','finalsignoff','schedule','capacity','cmmap','weeklyrev','jobsettings',
      'factorydash','prodqueue','factorycap',
      'accdash','accoutstanding','acccashflow',
      'servicelist','servicemap','svcschedule']},
  sales_rep:          {sales:true,jobs:'view',factory:false,accounts:false,service:false,
    pages:['dashboard','contacts','leads','deals','won','calendar','email','phone','map','commission',
      'jobdashboard','jobs']},
  production_manager: {sales:'view',jobs:true,factory:true,accounts:'view',service:false,
    pages:['dashboard','contacts',
      'jobdashboard','jobs','finalsignoff','schedule','capacity','weeklyrev','jobsettings',
      'factorydash','prodqueue','prodboard','factorybom','factorycap','factorydispatch',
      'accdash','accbills','accweekly']},
  production_staff:   {sales:false,jobs:'view',factory:true,accounts:false,service:false,
    pages:['factorydash','prodqueue','prodboard','factorybom','factorycap','factorydispatch',
      'jobdashboard','jobs']},
  installer:          {sales:false,jobs:true,factory:false,accounts:false,service:true,
    pages:['jobdashboard','jobs','schedule','cmmap',
      'servicelist','svcschedule']},
  accounts:           {sales:'view',jobs:'view',factory:'view',accounts:true,service:'view',
    pages:['dashboard','contacts','deals',
      'jobdashboard','jobs','weeklyrev','invoicing',
      'factorydash','prodqueue',
      'accdash','accoutstanding','accbills','accweekly','acccashflow','accrecon','accbranch','accxero',
      'servicelist']},
  service_staff:      {sales:false,jobs:'view',factory:false,accounts:false,service:true,
    pages:['jobdashboard','jobs',
      'servicelist','servicemap','svcschedule']},
  viewer:             {sales:'view',jobs:'view',factory:'view',accounts:'view',service:'view',
    pages:['dashboard','contacts','leads','deals',
      'jobdashboard','jobs','schedule','weeklyrev',
      'factorydash','prodqueue','factorycap',
      'accdash','accoutstanding','acccashflow','accbranch',
      'servicelist']},
};

function getRolePermissions(){
  try{var s=localStorage.getItem('spartan_permissions');if(s)return JSON.parse(s);}catch(e){}
  return JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS));
}
function saveRolePermissions(p){localStorage.setItem('spartan_permissions',JSON.stringify(p));}


function canEdit(moduleKey){
  var cu=getCurrentUser();if(!cu)return false;
  if(cu.role==='admin')return true;
  var perms=getRolePermissions();
  var rp=perms[cu.role];if(!rp)return false;
  return rp[moduleKey]===true;
}

function isAdmin(){var cu=getCurrentUser();return cu&&cu.role==='admin';}

// USER AUTH SYSTEM
// serviceStates: AU states a sales rep/manager can service. Used by the
// "Unassigned lead" claim flow so a rep can pick up any unowned lead whose
// state is in this list. Defaults to [branch] for branch-bound staff and to
// all AU states for admin/accounts (branch='All'). Admin can edit per user.
var ALL_AU_STATES = ['VIC','NSW','QLD','SA','WA','ACT','TAS','NT'];
const DEFAULT_USERS=[
{id:'u0',name:'Admin',email:'admin@spartandoubleglazing.com.au',role:'admin',branch:'All',phone:'1300 912 161',initials:'AD',active:true,pw:'spartan2026',serviceStates:ALL_AU_STATES.slice()},
];

// Effective service-states list for a user — tolerates legacy users stored in
// localStorage before the serviceStates field existed. Admins and branch='All'
// users service every state; everyone else falls back to their branch.
function getUserStates(u) {
  if (!u) return [];
  if (Array.isArray(u.serviceStates) && u.serviceStates.length) return u.serviceStates;
  if (u.role === 'admin' || u.branch === 'All') return ALL_AU_STATES.slice();
  return u.branch ? [u.branch] : [];
}
function getUsers(){const s=localStorage.getItem('spartan_users');if(s)return JSON.parse(s);localStorage.setItem('spartan_users',JSON.stringify(DEFAULT_USERS));return[...DEFAULT_USERS];}
// Diff-aware save: snapshot the previously-persisted JSON for each user, then
// only upsert the rows whose serialised form actually changed. Without this,
// editing one user re-upserts the entire users table, generating N writes +
// N realtime echoes per change (each of which fires a full-page rerender).
function saveUsers(u){
  var prev = {};
  try {
    (JSON.parse(localStorage.getItem('spartan_users')||'[]'))
      .forEach(function(x){ prev[x.id] = JSON.stringify(x); });
  } catch(e) {}
  localStorage.setItem('spartan_users', JSON.stringify(u));
  if(!_sb) return;
  u.forEach(function(x){
    var snap = JSON.stringify(x);
    if (prev[x.id] === snap) return;
    dbUpsert('users',{id:x.id,email:x.email,name:x.name,role:x.role,branch:x.branch,phone:x.phone,initials:x.initials,active:x.active!==false,custom_perms:x.customPerms||null,service_states:x.serviceStates||null,google_pic:x.googlePic||null,pw:x.pw||'spartan2026'});
  });
}
function getCurrentUser(){const uid=localStorage.getItem('spartan_current_user');if(!uid)return null;return getUsers().find(u=>u.id===uid&&u.active);}

// Per-rep colour override stored in localStorage (keyed by rep name so it
// survives user-id changes). Kept out of the Supabase users table until we
// can add a column there; backwards-compatible with the hardcoded REP_BASES
// default colours.
function _repColourMap() {
  try { return JSON.parse(localStorage.getItem('spartan_rep_colours') || '{}'); }
  catch(e) { return {}; }
}
function getRepColor(repName) {
  if (!repName) return '#9ca3af';
  var map = _repColourMap();
  if (map[repName]) return map[repName];
  // Fallback to REP_BASES default so existing reps keep their pin colour
  // until an admin sets a custom one.
  if (typeof REP_BASES !== 'undefined') {
    var rep = REP_BASES.find(function(r){ return r.name === repName; });
    if (rep && rep.col) return rep.col;
  }
  return '#9ca3af';
}
function setRepColor(repName, color) {
  if (!repName || !color) return;
  var map = _repColourMap();
  map[repName] = color;
  try { localStorage.setItem('spartan_rep_colours', JSON.stringify(map)); }
  catch(e) {}
}
function setCurrentUser(id){localStorage.setItem('spartan_current_user',id);}
function logout(){localStorage.removeItem('spartan_current_user');location.reload();}

// Edit permission — owner or admin can edit. An unassigned lead (owner=='')
// is claimable by any active sales_rep / sales_manager whose serviceStates
// list includes the lead's state — this is the "available pool" flow.
function canEditLead(lead) {
  var u = getCurrentUser();
  if (!u || !lead) return false;
  if (u.role === 'admin') return true;
  if (lead.owner && lead.owner === u.name) return true;
  if (!lead.owner && (u.role === 'sales_rep' || u.role === 'sales_manager')) {
    var states = getUserStates(u);
    if (lead.state && states.indexOf(lead.state) >= 0) return true;
  }
  return false;
}
function canEditContact(contact) {
  var u = getCurrentUser();
  if (!u || !contact) return false;
  if (u.role === 'admin') return true;
  // Contacts use `rep` as the owner field; treat it the same way.
  return !!contact.rep && contact.rep === u.name;
}
function canEditDeal(deal) {
  var u = getCurrentUser();
  if (!u || !deal) return false;
  if (u.role === 'admin') return true;
  // Deals use `rep` as the owner field.
  return !!deal.rep && deal.rep === u.name;
}

// ── Validation: email + Australian phone ────────────────────────────────────
// Returns {ok, error, normalized}. `normalized` is the canonical form we
// persist — empty string inputs return ok:true with normalized:'' so optional
// fields stay optional.
function validateEmail(raw) {
  var s = (raw || '').trim();
  if (!s) return { ok: true, error: '', normalized: '' };
  // Reasonable RFC-ish check — not exhaustive but catches the common typos.
  var ok = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/.test(s);
  return ok ? { ok: true, error: '', normalized: s }
            : { ok: false, error: 'Invalid email format', normalized: s };
}
// Accepts common AU formats for mobile (04xx / +614xx) and landline
// (02/03/07/08 area codes, with or without parens, spaces or dashes).
// Normalises to `+61 4xx xxx xxx` for mobile, `+61 x xxxx xxxx` for landline.
function validateAuPhone(raw) {
  var s = (raw || '').trim();
  if (!s) return { ok: true, error: '', normalized: '' };
  var digits = s.replace(/[^0-9+]/g, '');
  // Strip leading country code variants to a canonical "0X..." form.
  var local;
  if (/^\+61/.test(digits)) local = '0' + digits.slice(3);
  else if (/^0061/.test(digits)) local = '0' + digits.slice(4);
  else if (/^61/.test(digits) && digits.length === 11) local = '0' + digits.slice(2);
  else local = digits;
  // Mobile: 10 digits, starts with 04
  if (/^04\d{8}$/.test(local)) {
    return { ok: true, error: '', normalized: '+61 ' + local.slice(1,4) + ' ' + local.slice(4,7) + ' ' + local.slice(7) };
  }
  // Landline: 10 digits, starts with 02/03/07/08
  if (/^0[2378]\d{8}$/.test(local)) {
    return { ok: true, error: '', normalized: '+61 ' + local.slice(1,2) + ' ' + local.slice(2,6) + ' ' + local.slice(6) };
  }
  return { ok: false, error: 'Invalid AU phone (expected 04xx xxx xxx or (0x) xxxx xxxx)', normalized: s };
}

// Deal/lead monetary value. Blank is treated as $0 (legitimate for warranty /
// goodwill jobs). Negatives are rejected — they've previously been written to
// the DB by accident via the native number input's down-arrow.
function validateDealValue(raw) {
  var s = (raw == null ? '' : String(raw)).trim();
  if (!s) return { ok: true, error: '', normalized: 0 };
  var n = Number(s);
  if (!isFinite(n)) return { ok: false, error: 'Value must be a number', normalized: 0 };
  if (n < 0) return { ok: false, error: 'Value must be $0 or greater', normalized: 0 };
  return { ok: true, error: '', normalized: n };
}

// ══════════════════════════════════════════════════════════════════════════════
// ROLE-BASED ACCESS CONTROL — Permissions per role, customizable by Admin
// ══════════════════════════════════════════════════════════════════════════════
var ALL_ROLES = [
  {id:'admin',label:'Admin',desc:'Full access — everything'},
  {id:'sales_manager',label:'Sales Manager',desc:'Sales + Jobs overview + limited Accounts'},
  {id:'sales_rep',label:'Sales Rep',desc:'Own leads, deals, contacts. Limited Job view'},
  {id:'accounts',label:'Accounts',desc:'Accounts, invoicing, reconciliation. View jobs/sales'},
  {id:'production_manager',label:'Production Manager',desc:'Factory CRM, Job production, limited financials'},
  {id:'production_staff',label:'Production Staff',desc:'Factory floor only — no financials'},
  {id:'installer',label:'Installer',desc:'Assigned jobs, check measure, schedule. No financials'},
  {id:'service_staff',label:'Service Staff',desc:'Service CRM, limited Job/Sales view'},
  {id:'viewer',label:'Viewer',desc:'Read-only access to allowed modules'},
];

// Permission keys: module.page or module.action
var ALL_PERMISSIONS = [
  // Sales CRM
  {key:'sales.dashboard',label:'Sales Dashboard',module:'Sales CRM',group:'sales'},
  {key:'sales.contacts',label:'Contacts',module:'Sales CRM',group:'sales'},
  {key:'sales.leads',label:'Leads',module:'Sales CRM',group:'sales'},
  {key:'sales.deals',label:'Deals & Pipeline',module:'Sales CRM',group:'sales'},
  {key:'sales.calendar',label:'Calendar',module:'Sales CRM',group:'sales'},
  {key:'sales.invoicing',label:'Invoicing',module:'Sales CRM',group:'sales'},
  {key:'sales.commission',label:'Commission',module:'Sales CRM',group:'sales'},
  {key:'sales.reports',label:'Reports',module:'Sales CRM',group:'sales'},
  {key:'sales.settings',label:'Sales Settings',module:'Sales CRM',group:'sales'},
  // Job CRM
  {key:'jobs.dashboard',label:'Job Dashboard',module:'Job CRM',group:'jobs'},
  {key:'jobs.list',label:'Jobs List',module:'Job CRM',group:'jobs'},
  {key:'jobs.signoff',label:'Final Sign Off',module:'Job CRM',group:'jobs'},
  {key:'jobs.schedule',label:'Install Schedule',module:'Job CRM',group:'jobs'},
  {key:'jobs.planner',label:'Smart Planner',module:'Job CRM',group:'jobs'},
  {key:'jobs.cmmap',label:'CM Schedule Map',module:'Job CRM',group:'jobs'},
  {key:'jobs.revenue',label:'Weekly Revenue',module:'Job CRM',group:'jobs'},
  {key:'jobs.checkmeasure',label:'Perform Check Measure',module:'Job CRM',group:'jobs'},
  // Factory CRM
  {key:'factory.dashboard',label:'Factory Dashboard',module:'Factory CRM',group:'factory'},
  {key:'factory.queue',label:'Production Queue',module:'Factory CRM',group:'factory'},
  {key:'factory.board',label:'Production Board',module:'Factory CRM',group:'factory'},
  {key:'factory.bom',label:'BOM & Cut Sheets',module:'Factory CRM',group:'factory'},
  {key:'factory.capacity',label:'Capacity Planner',module:'Factory CRM',group:'factory'},
  {key:'factory.dispatch',label:'Dispatch',module:'Factory CRM',group:'factory'},
  // Accounts
  {key:'accounts.dashboard',label:'Accounts Dashboard',module:'Accounts',group:'accounts'},
  {key:'accounts.outstanding',label:'Outstanding',module:'Accounts',group:'accounts'},
  {key:'accounts.bills',label:'Supplier Bills',module:'Accounts',group:'accounts'},
  {key:'accounts.weekly',label:'Weekly In vs Out',module:'Accounts',group:'accounts'},
  {key:'accounts.cashflow',label:'Cash Flow',module:'Accounts',group:'accounts'},
  {key:'accounts.recon',label:'Reconciliation',module:'Accounts',group:'accounts'},
  {key:'accounts.branch',label:'Branch P&L',module:'Accounts',group:'accounts'},
  {key:'accounts.xero',label:'Xero Integration',module:'Accounts',group:'accounts'},
  // Service CRM
  {key:'service.list',label:'Service Calls',module:'Service CRM',group:'service'},
  {key:'service.map',label:'Service Scheduler',module:'Service CRM',group:'service'},
  {key:'service.openings',label:'Install Openings',module:'Service CRM',group:'service'},
  // Phone (Twilio Voice + SMS)
  {key:'phone.access',label:'Phone & Voice Calls',module:'Phone',group:'phone'},
  {key:'phone.sms',label:'Send SMS',module:'Phone',group:'phone'},
  {key:'phone.recordings.own',label:'Listen to own call recordings',module:'Phone',group:'phone'},
  {key:'phone.recordings.team',label:'Listen to team call recordings',module:'Phone',group:'phone'},
  {key:'phone.recordings.all',label:'Listen to all call recordings',module:'Phone',group:'phone'},
  {key:'phone.admin',label:'Manage phone & IVR settings',module:'Phone',group:'phone'},
  // System
  {key:'system.audit_log',label:'View global audit log',module:'System',group:'system'},
  // Data visibility
  {key:'data.view_values',label:'See job values & pricing',module:'Data Access',group:'data'},
  {key:'data.view_margins',label:'See profit margins & costs',module:'Data Access',group:'data'},
  {key:'data.edit_jobs',label:'Edit job details',module:'Data Access',group:'data'},
  {key:'data.manage_users',label:'Manage users & roles',module:'Data Access',group:'data'},
  {key:'data.cad_edit',label:'Edit CAD designs (original)',module:'Data Access',group:'data'},
];

// Default permissions per role
var DEFAULT_ROLE_PERMS = {
  admin: ALL_PERMISSIONS.map(function(p){return p.key;}), // everything
  sales_manager: ['sales.dashboard','sales.contacts','sales.leads','sales.deals','sales.calendar','sales.invoicing','sales.commission','sales.reports','sales.settings',
    'jobs.dashboard','jobs.list','jobs.signoff','jobs.schedule','jobs.planner','jobs.cmmap','jobs.revenue',
    'accounts.dashboard','accounts.outstanding',
    'service.list',
    'phone.access','phone.sms','phone.recordings.team','phone.recordings.own',
    'data.view_values','data.view_margins','data.edit_jobs','data.cad_edit'],
  sales_rep: ['sales.dashboard','sales.contacts','sales.leads','sales.deals','sales.calendar','sales.commission',
    'jobs.dashboard','jobs.list',
    'phone.access','phone.sms','phone.recordings.own',
    'data.view_values'],
  accounts: ['accounts.dashboard','accounts.outstanding','accounts.bills','accounts.weekly','accounts.cashflow','accounts.recon','accounts.branch','accounts.xero',
    'sales.invoicing','sales.dashboard',
    'jobs.dashboard','jobs.list','jobs.revenue',
    'phone.access','phone.sms','phone.recordings.own',
    'data.view_values','data.view_margins'],
  production_manager: ['factory.dashboard','factory.queue','factory.board','factory.bom','factory.capacity','factory.dispatch',
    'jobs.dashboard','jobs.list','jobs.schedule',
    'phone.access',
    'data.view_values','data.edit_jobs'],
  production_staff: ['factory.dashboard','factory.queue','factory.board','factory.bom','factory.dispatch'],
  installer: ['jobs.list','jobs.schedule','jobs.cmmap','jobs.checkmeasure',
    'phone.access'],
  service_staff: ['service.list','service.map','service.openings',
    'jobs.dashboard','jobs.list',
    'phone.access','phone.sms','phone.recordings.own'],
  viewer: ['sales.dashboard','jobs.dashboard','factory.dashboard','accounts.dashboard','service.list'],
};

// Map page routes to permission keys
var PAGE_PERM_MAP = {
  dashboard:'sales.dashboard',contacts:'sales.contacts',leads:'sales.leads',deals:'sales.deals',
  won:'sales.deals',calendar:'sales.calendar',invoicing:'sales.invoicing',commission:'sales.commission',
  reports:'sales.reports',settings:'sales.settings',email:'sales.deals',phone:'phone.access',map:'sales.deals',profile:'sales.dashboard',
  jobdashboard:'jobs.dashboard',jobs:'jobs.list',finalsignoff:'jobs.signoff',schedule:'jobs.schedule',
  capacity:'jobs.planner',cmmap:'jobs.cmmap',weeklyrev:'jobs.revenue',jobsettings:'sales.settings',
  factorydash:'factory.dashboard',prodqueue:'factory.queue',prodboard:'factory.board',
  factorybom:'factory.bom',factorycap:'factory.capacity',factorydispatch:'factory.dispatch',
  accdash:'accounts.dashboard',accoutstanding:'accounts.outstanding',accbills:'accounts.bills',
  accweekly:'accounts.weekly',acccashflow:'accounts.cashflow',accrecon:'accounts.recon',
  accbranch:'accounts.branch',accxero:'accounts.xero',
  servicelist:'service.list',servicemap:'service.map',svcschedule:'service.openings',
  audit:'system.audit_log',
};

function getUserPerms(user) {
  if (!user) return [];
  if (user.role === 'admin') return ALL_PERMISSIONS.map(function(p){return p.key;});
  // Check for custom permissions override
  if (user.customPerms && Array.isArray(user.customPerms)) return user.customPerms;
  return DEFAULT_ROLE_PERMS[user.role] || [];
}

function hasPermission(permKey) {
  var cu = getCurrentUser();
  if (!cu) return false;
  if (cu.role === 'admin') return true;
  var perms = getUserPerms(cu);
  return perms.indexOf(permKey) >= 0;
}

function canAccessPage(pageKey) {
  var cu = getCurrentUser();
  if (!cu) return false;
  if (cu.role === 'admin') return true;
  var permKey = PAGE_PERM_MAP[pageKey];
  if (!permKey) return true; // unmapped pages default allow
  return hasPermission(permKey);
}

function canAccessModule(moduleKey) {
  var cu = getCurrentUser();
  if (!cu) return false;
  if (cu.role === 'admin') return true;
  var perms = getUserPerms(cu);
  return perms.some(function(p){return p.startsWith(moduleKey+'.');});
}

function canSeeValues() { return hasPermission('data.view_values'); }
function canSeeMargins() { return hasPermission('data.view_margins'); }
function canEditJobs() { return hasPermission('data.edit_jobs'); }
function canManageUsers() { return hasPermission('data.manage_users'); }
function renderLoginScreen(){
document.getElementById('app').innerHTML='<div class="login-bg"><div class="login-card"><div style="text-align:center;margin-bottom:28px"><img src="data:image/png;base64,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" style="width:56px;height:56px;border-radius:14px;margin:0 auto 14px;display:block;object-fit:contain" alt="Spartan DG"><h1 style="font-family:Syne,sans-serif;font-weight:800;font-size:22px;margin:0">SPARTAN CRM</h1><p style="font-size:13px;color:#6b7280;margin:4px 0 0">Double Glazing \u00b7 Sign in</p></div><div id="loginErr" style="display:none;padding:10px;background:#fee2e2;border:1px solid #fecaca;border-radius:8px;color:#b91c1c;font-size:12px;margin-bottom:14px;text-align:center"></div><div style="margin-bottom:14px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Email</label><input id="loginEmail" class="inp" type="email" placeholder="you@spartandoubleglazing.com.au" autofocus></div><div style="margin-bottom:20px"><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Password</label><input id="loginPw" class="inp" type="password" placeholder="Enter password" onkeydown="if(event.key===\'Enter\')doLogin()"></div><button onclick="doLogin()" class="btn-r" style="width:100%;justify-content:center;padding:10px;font-size:14px">Sign In</button><div style="display:flex;align-items:center;gap:12px;margin:16px 0"><div style="flex:1;height:1px;background:#e5e7eb"></div><span style="font-size:11px;color:#9ca3af;white-space:nowrap">or</span><div style="flex:1;height:1px;background:#e5e7eb"></div></div><button onclick="googleSignInForLogin()" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;justify-content:center;gap:10px" onmouseover="this.style.background=\'#f9fafb\'" onmouseout="this.style.background=\'#fff\'"><svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>Sign in with Google</button></div></div>';
}
function doLogin(){
var e=document.getElementById('loginEmail').value.trim().toLowerCase();
var p=document.getElementById('loginPw').value;
var u=getUsers().find(function(x){return x.email.toLowerCase()===e&&x.pw===p&&x.active;});
if(!u){var el=document.getElementById('loginErr');el.textContent='Invalid email/password or account deactivated.';el.style.display='block';return;}
// Audit successful login. We don't audit failures by design — that would
// give an attacker an oracle to enumerate valid usernames.
if (typeof appendAuditEntry === 'function') {
  appendAuditEntry({
    entityType: 'user',
    entityId: u.id,
    action: 'user.login',
    summary: u.name + ' signed in',
    userId: u.id,
    userName: u.name,
    branch: u.branch || null,
  });
}
setCurrentUser(u.id);location.reload();
}
var adminEditingUser = null;
// Draft form state for the Add/Edit User modal. Mirrors the inputs so a full
// renderPage() (notif timer, realtime echo, toast lifecycle, …) can rebuild
// the modal HTML without dropping unsaved typing. Seeded on open from the
// user being edited, mutated by oninput/onchange handlers, cleared on close.
var adminEditDraft = null;

function _seedAdminDraftFromUser(u){
  u = u || {};
  var role = u.role || 'sales_rep';
  return {
    name: u.name || '',
    email: u.email || '',
    role: role,
    branch: u.branch || 'VIC',
    phone: u.phone || '',
    pw: '',
    color: getRepColor(u.name||'') || '#c41230',
    customPerms: (u.customPerms || DEFAULT_ROLE_PERMS[role] || []).slice(),
    serviceStates: getUserStates(u).slice(),
  };
}
function adminAddUser(){
  adminEditingUser = 'new';
  adminEditDraft = _seedAdminDraftFromUser({role:'sales_rep',branch:'VIC'});
  renderPage();
}
function adminEditUser(uid){
  adminEditingUser = uid;
  adminEditDraft = _seedAdminDraftFromUser(getUsers().find(function(x){return x.id===uid;}));
  renderPage();
}
function adminCloseModal(){ adminEditingUser = null; adminEditDraft = null; renderPage(); }
function adminDraftSet(field, value){ if(adminEditDraft) adminEditDraft[field] = value; }
function adminDraftTogglePerm(key, on){
  if(!adminEditDraft) return;
  var arr = adminEditDraft.customPerms || [];
  var idx = arr.indexOf(key);
  if(on && idx<0) arr.push(key);
  else if(!on && idx>=0) arr.splice(idx,1);
  adminEditDraft.customPerms = arr;
}
function adminDraftToggleSvcState(st, on){
  if(!adminEditDraft) return;
  var arr = adminEditDraft.serviceStates || [];
  var idx = arr.indexOf(st);
  if(on && idx<0) arr.push(st);
  else if(!on && idx>=0) arr.splice(idx,1);
  adminEditDraft.serviceStates = arr;
}
function adminSaveUser(){
  var d = adminEditDraft;
  if(!d){return;}
  var name = (d.name||'').trim();
  var email = (d.email||'').trim();
  var role = d.role;
  var branch = d.branch;
  var phone = (d.phone||'').trim();
  var color = d.color || '';
  if(!name||!email){addToast('Name and email required','error');return;}
  // Persist the rep colour in localStorage. Keyed by name rather than id so
  // the same colour follows the rep even if their user id changes.
  if (color) setRepColor(name, color);
  // Collapse customPerms to null when they match the role defaults exactly,
  // so role-default changes still flow through to this user.
  var customPerms = (d.customPerms || []).slice();
  var defaults = DEFAULT_ROLE_PERMS[role] || [];
  if (customPerms.length === defaults.length && customPerms.every(function(p){return defaults.indexOf(p)>=0;})) customPerms = null;
  var serviceStates = (d.serviceStates || []).slice();
  var users = getUsers();
  if(adminEditingUser==='new'){
    var pw = d.pw;
    if(!pw){addToast('Password required for new user','error');return;}
    if(users.find(function(u){return u.email.toLowerCase()===email.toLowerCase();})){addToast('Email already in use','error');return;}
    var newUser = {id:'u'+Date.now(),name:name,email:email,role:role,branch:branch,phone:phone,initials:name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase(),active:true,pw:pw};
    if (customPerms) newUser.customPerms = customPerms;
    if (serviceStates) newUser.serviceStates = serviceStates;
    users.push(newUser);
    saveUsers(users);addToast(name+' added','success');
    if (typeof appendAuditEntry === 'function') {
      appendAuditEntry({
        entityType:'user', entityId:newUser.id, action:'user.created',
        summary:'Created user: '+name+' ('+role+')',
        after:{ name:name, email:email, role:role, branch:branch, active:true, customPerms:customPerms, serviceStates:serviceStates },
        branch:branch,
      });
    }
  } else {
    var u = users.find(function(x){return x.id===adminEditingUser;});
    if(!u)return;
    // Capture before-state for audit. Snapshot the fields that can change.
    var beforeSnapshot = { name:u.name, email:u.email, role:u.role, branch:u.branch, customPerms:u.customPerms||null, serviceStates:u.serviceStates||null, active:u.active!==false };
    var roleChanged = u.role !== role;
    u.name=name;u.email=email;u.role=role;u.branch=branch;u.phone=phone;
    u.initials=name.split(' ').map(function(w){return w[0];}).join('').slice(0,2).toUpperCase();
    if (customPerms) u.customPerms = customPerms; else delete u.customPerms;
    if (serviceStates) u.serviceStates = serviceStates; else delete u.serviceStates;
    if (d.pw) u.pw = d.pw;
    saveUsers(users);addToast(name+' updated','success');
    if (typeof appendAuditEntry === 'function') {
      var afterSnapshot = { name:u.name, email:u.email, role:u.role, branch:u.branch, customPerms:u.customPerms||null, serviceStates:u.serviceStates||null, active:u.active!==false };
      // Action key reflects the most significant change. Role change wins
      // because it has the largest blast radius for permissions.
      var actionKey = roleChanged ? 'user.role_changed' : 'user.permissions_changed';
      var summaryParts = [];
      if (roleChanged) summaryParts.push('role: '+beforeSnapshot.role+' → '+role);
      if (beforeSnapshot.branch !== branch) summaryParts.push('branch: '+(beforeSnapshot.branch||'—')+' → '+branch);
      var summary = name + (summaryParts.length ? ' — '+summaryParts.join(', ') : ' updated');
      appendAuditEntry({
        entityType:'user', entityId:u.id, action:actionKey,
        summary:summary,
        before:beforeSnapshot, after:afterSnapshot,
        branch:branch,
      });
    }
  }
  adminEditingUser=null; adminEditDraft=null; renderPage();
}
function adminToggleUser(uid){var us=getUsers();var u=us.find(function(x){return x.id===uid;});if(!u)return;if(u.id===(getCurrentUser()||{}).id){addToast('Cannot deactivate yourself','error');return;}var wasActive=u.active;u.active=!u.active;saveUsers(us);addToast(u.name+(u.active?' activated':' deactivated'));if(typeof appendAuditEntry==='function'){appendAuditEntry({entityType:'user',entityId:u.id,action:u.active?'user.activated':'user.deactivated',summary:(u.active?'Activated':'Deactivated')+' user: '+u.name,before:{active:wasActive},after:{active:u.active},branch:u.branch||null});}renderPage();}
function adminChangeRole(uid,nr){var us=getUsers();var u=us.find(function(x){return x.id===uid;});if(!u)return;u.role=nr;saveUsers(us);addToast(u.name+' role: '+nr);renderPage();}
function adminChangeBranch(uid,nb){var us=getUsers();var u=us.find(function(x){return x.id===uid;});if(!u)return;u.branch=nb;saveUsers(us);renderPage();}
function adminDeleteUser(uid){if(!confirm('Permanently delete this user? This cannot be undone.'))return;saveUsers(getUsers().filter(function(u){return u.id!==uid;}));if(typeof dbDelete==='function')dbDelete('users',uid);addToast('User deleted','warning');adminEditingUser=null;renderPage();}
function renderAdminUserModal(){
  var isNew = adminEditingUser === 'new';
  // The draft is the source of truth while the modal is open. If it isn't
  // seeded yet (defensive — adminAddUser/adminEditUser always seed it before
  // opening), bail out so we don't render with undefined values.
  if (!adminEditDraft) return '';
  var d = adminEditDraft;
  var existingUser = isNew ? null : getUsers().find(function(u){return u.id===adminEditingUser;});
  // If we're editing a user who has since been deleted (another tab, realtime
  // echo), close silently — matches the original behavior.
  if (!isNew && !existingUser) return '';
  var titleName = isNew ? '' : existingUser.name;
  var deletableId = (!isNew && existingUser && existingUser.id !== (getCurrentUser()||{}).id) ? existingUser.id : null;
  return '<div class="modal-bg" onclick="if(event.target===this)adminCloseModal()"><div class="modal" style="max-width:480px">'
  +'<div style="padding:18px 22px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center"><h3 style="margin:0;font-size:16px;font-weight:700;font-family:Syne,sans-serif">'+(isNew?'Add New User':'Edit User: '+_escAttr(titleName))+'</h3><button onclick="adminCloseModal()" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:22px;line-height:1">\u00d7</button></div>'
  +'<div class="modal-body" style="display:flex;flex-direction:column;gap:14px">'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Full Name *</label><input class="inp" id="au_name" value="'+_escAttr(d.name)+'" placeholder="Jane Smith" oninput="adminDraftSet(\'name\',this.value)"></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Email *</label><input class="inp" id="au_email" value="'+_escAttr(d.email)+'" type="email" placeholder="jane@spartandg.com.au" oninput="adminDraftSet(\'email\',this.value)"></div></div>'
  +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Role</label><select class="sel" id="au_role" onchange="adminDraftSet(\'role\',this.value)">'
  +'<option value="admin"'+(d.role==='admin'?' selected':'')+'>Admin</option>'
  +'<option value="sales_manager"'+(d.role==='sales_manager'?' selected':'')+'>Sales Manager</option>'
  +'<option value="sales_rep"'+(d.role==='sales_rep'?' selected':'')+'>Sales Rep</option>'
  +'<option value="production_manager"'+(d.role==='production_manager'?' selected':'')+'>Production Manager</option>'
  +'<option value="production_staff"'+(d.role==='production_staff'?' selected':'')+'>Production Staff</option>'
  +'<option value="installer"'+(d.role==='installer'?' selected':'')+'>Installer</option>'
  +'<option value="accounts"'+(d.role==='accounts'?' selected':'')+'>Accounts</option>'
  +'<option value="service_staff"'+(d.role==='service_staff'?' selected':'')+'>Service Staff</option>'
  +'<option value="viewer"'+(d.role==='viewer'?' selected':'')+'>Viewer</option></select></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Branch</label><select class="sel" id="au_branch" onchange="adminDraftSet(\'branch\',this.value)">'
  +'<option value="All"'+(d.branch==='All'?' selected':'')+'>All</option>'
  +'<option value="VIC"'+(d.branch==='VIC'?' selected':'')+'>VIC</option>'
  +'<option value="ACT"'+(d.branch==='ACT'?' selected':'')+'>ACT</option>'
  +'<option value="SA"'+(d.branch==='SA'?' selected':'')+'>SA</option></select></div></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Phone</label><input class="inp" id="au_phone" value="'+_escAttr(d.phone)+'" placeholder="+61 4xx xxx xxx" oninput="adminDraftSet(\'phone\',this.value)"></div>'
  +function(){
    // Service states — AU states this user can claim unassigned leads from.
    // Shown for all roles (harmless for non-sales) so admin can configure
    // coverage for e.g. a sales-manager doubling up as a claims-handler.
    var cur = d.serviceStates || [];
    return '<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Service States <span style="font-size:10px;color:#9ca3af;font-weight:400">(can claim unassigned leads in these states)</span></label>'
      +'<div style="display:flex;flex-wrap:wrap;gap:4px">'
      +ALL_AU_STATES.map(function(st){
        var on = cur.indexOf(st) >= 0;
        return '<label style="display:flex;align-items:center;gap:4px;font-size:11px;padding:3px 9px;border-radius:6px;cursor:pointer;background:'+(on?'#fef2f2':'#f3f4f6')+';border:1px solid '+(on?'#fca5a5':'#e5e7eb')+'"><input type="checkbox" class="svcstate-cb" data-st="'+st+'" '+(on?'checked':'')+' onchange="adminDraftToggleSvcState(\''+st+'\',this.checked)" style="accent-color:#c41230;width:12px;height:12px">'+st+'</label>';
      }).join('')
      +'</div></div>';
  }()
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Map pin colour</label>'
  +'<div style="display:flex;align-items:center;gap:10px">'
  +'<input type="color" id="au_color" value="'+_escAttr(d.color||'#c41230')+'" style="width:50px;height:34px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;padding:2px" onchange="adminDraftSet(\'color\',this.value)" oninput="adminDraftSet(\'color\',this.value)">'
  +'<span style="font-size:11px;color:#6b7280">Used on the Leads / Schedule / Calendar maps for this rep\u2019s pins.</span>'
  +'</div></div>'
  +'<div><label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">'+(isNew?'Password *':'New Password (blank = keep current)')+'</label><input class="inp" id="au_pw" type="password" value="'+_escAttr(d.pw)+'" placeholder="'+(isNew?'Set password':'Leave blank to keep')+'" oninput="adminDraftSet(\'pw\',this.value)"></div>'
  +'<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div style="font-size:12px;font-weight:600;color:#0369a1">Role Permissions</div><button onclick="document.getElementById(\'permEditor\').style.display=document.getElementById(\'permEditor\').style.display===\'block\'?\'none\':\'block\'" style="font-size:10px;padding:3px 8px;border:1px solid #bae6fd;border-radius:4px;background:#fff;cursor:pointer;color:#0369a1;font-weight:600">Customise \u25bc</button></div><div style="font-size:11px;color:#475569;line-height:1.7"><strong>Admin:</strong> Full access<br><strong>Sales Manager:</strong> Sales + Jobs + limited Accounts<br><strong>Sales Rep:</strong> Own leads, deals, contacts<br><strong>Production Manager:</strong> Factory + Jobs production<br><strong>Production Staff:</strong> Factory floor only<br><strong>Installer:</strong> Assigned jobs, CM, schedule<br><strong>Accounts:</strong> All financials, read-only ops<br><strong>Service Staff:</strong> Service CRM + view Jobs<br><strong>Viewer:</strong> Read-only</div>'
  +'<div id="permEditor" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #bae6fd">'
  +'<div style="font-size:10px;font-weight:700;color:#0369a1;margin-bottom:6px;text-transform:uppercase">Custom Permission Overrides (Admin Only)</div>'
  +function(){var groups={};ALL_PERMISSIONS.forEach(function(p){if(!groups[p.module])groups[p.module]=[];groups[p.module].push(p);});var perms=d.customPerms||[];var html='';Object.entries(groups).forEach(function(g){html+='<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;color:#374151;margin-bottom:3px">'+g[0]+'</div><div style="display:flex;flex-wrap:wrap;gap:3px">';g[1].forEach(function(p){var on=perms.indexOf(p.key)>=0;html+='<label style="display:flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:4px;cursor:pointer;background:'+(on?'#dcfce7':'#f3f4f6')+';border:1px solid '+(on?'#86efac':'#e5e7eb')+'"><input type="checkbox" class="perm-cb" data-perm="'+p.key+'" '+(on?'checked':'')+' onchange="adminDraftTogglePerm(\''+p.key+'\',this.checked)" style="accent-color:#22c55e;width:12px;height:12px">'+p.label+'</label>';});html+='</div></div>';});return html;}()
  +'</div></div>'
  +'</div>'
  +'<div style="padding:16px 22px;border-top:1px solid #f0f0f0;background:#f9fafb;border-radius:0 0 16px 16px;display:flex;justify-content:'+(isNew?'flex-end':'space-between')+';gap:10px">'
  +(deletableId?'<button onclick="adminDeleteUser(\''+deletableId+'\')" style="padding:8px 14px;border:1px solid #fca5a5;border-radius:8px;background:#fef2f2;color:#b91c1c;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600">Delete User</button>':'<div></div>')
  +'<div style="display:flex;gap:8px"><button class="btn-w" onclick="adminCloseModal()">Cancel</button><button class="btn-r" onclick="adminSaveUser()">'+(isNew?'Create User':'Save Changes')+'</button></div>'
  +'</div></div></div>';
}

let _state = {
  page: 'dashboard',
  crmMode: 'sales', // 'sales' or 'jobs'
  branch: 'all',
  sidebarOpen: true,
  deals: JSON.parse(JSON.stringify(DEALS)).map(d=>{
    const seed=DEAL_ACTIVITIES_SEED[d.id];
    return seed?{...d,activities:JSON.parse(JSON.stringify(seed))}:{...d,activities:[]};
  }),
  contacts: JSON.parse(JSON.stringify(CONTACTS)),
  notifs: JSON.parse(JSON.stringify(NOTIFS)),
  toasts: [],
  panel: null,
  modal: null,
  dealDetailId: null,
  leadDetailId: null,
  contactDetailId: null,
  contactActivities: {}, // keyed by contactId, shared across deals/leads/contacts
  // Twilio Voice (stage 2). activeCall is null when the rep isn't on a call;
  // when set, the active-call banner renders. callLogs is loaded from
  // public.call_logs by dbLoadAll and kept fresh by the realtime subscription.
  activeCall: null,
  callLogs: [],
  // Stage 3 — set when an inbound call is ringing this rep's browser. The
  // incoming-call banner reads this to render the Answer/Decline UI.
  // Cleared on accept (promotes to activeCall), decline, or auto-timeout.
  incomingCall: null,
  // Stage 4 — Twilio SMS. smsLogs is a flat array of all messages (in/out)
  // loaded by dbLoadAll, kept fresh by realtime. The SMS tab in detail panels
  // filters this by entity_id. smsTemplates is the saved template library.
  smsLogs: [],
  smsTemplates: [],
  // Stage 6 — Phone & IVR admin-editable settings. Singleton row in
  // public.phone_settings. Loaded by dbLoadAll, kept fresh by realtime so
  // changes by an admin in another tab propagate within ~1s.
  phoneSettings: null,
  leads: JSON.parse(JSON.stringify(LEADS_DATA)),
  leadFilter: 'All',
  leadSearch: '',
  dealFields: JSON.parse(JSON.stringify(DEFAULT_DEAL_FIELDS)),
  leadFields: JSON.parse(JSON.stringify(DEFAULT_LEAD_FIELDS)),
  contactFields: JSON.parse(JSON.stringify(DEFAULT_CONTACT_FIELDS)),
  dealStatuses:    JSON.parse(JSON.stringify(DEFAULT_DEAL_STATUSES)),
  leadStatuses:    JSON.parse(JSON.stringify(DEFAULT_LEAD_STATUSES)),
  contactStatuses: JSON.parse(JSON.stringify(DEFAULT_CONTACT_STATUSES)),
  dealFieldValues: {},
  leadFieldValues: {},
  contactFieldValues: {},
  gmailConnected: false,
  gmailUser: null,       // {email, name, picture}
  gmailToken: null,      // OAuth access token
  emailThreads: {},      // keyed by contactEmail → array of thread summaries
  emailInbox: JSON.parse(JSON.stringify(EMAIL_INBOX_SEED)),
  emailSent:  JSON.parse(JSON.stringify(EMAIL_SENT_SEED)),
  emailDrafts: [],
  emailSelectedId: null, // currently viewed email id
  emailFolder: 'inbox',  // inbox|sent|drafts|templates
  emailComposing: false,
  emailComposeData: {to:'',subject:'',body:'',cc:'',bcc:'',templateId:null,replyToId:null},
  // Jobs module
  jobs: [],
  jobWindows: [],
  jobDetailId: null,
  jobDetailTab: 'overview',
  jobListFilter: 'All',
  jobListSearch: '',
  jobShowHeldOnly: false,
  jobFields: JSON.parse(JSON.stringify(DEFAULT_JOB_FIELDS)),
  jobFieldValues: {},
  jobSortCol: 'created',
  jobSortDir: 'desc',
  // Install schedule
  installers: JSON.parse(localStorage.getItem('spartan_installers')||'[]'),
  scheduleWeekOffset: 0, // 0 = this week, -1 = last week, +1 = next week
  weeklyTargets: {VIC:175000, ACT:100000, SA:75000, TAS:50000},
  // Service CRM
  serviceCalls: JSON.parse(localStorage.getItem('spartan_service_calls')||'[]'),
  serviceDetailId: null,
  // Edit drawers (lead/contact/deal) — holds the id of the entity being
  // edited, or null when the drawer is closed.
  editingLeadId: null,
  editingContactId: null,
  editingDealId: null,
};
let _listeners = [];
const subscribe = fn => { _listeners.push(fn); return ()=>{ _listeners = _listeners.filter(l=>l!==fn); }; };
const getState = () => _state;
var _dbSyncTimer = null;
// setState(patch, opts)
//   opts.skipSync  — when true, don't push the patch back to Supabase. Callers
//                    that are loading FROM Supabase (dbLoadAll, realtime echo)
//                    must pass this, otherwise every load triggers a full
//                    re-upsert, which echoes back as another realtime event,
//                    which triggers another load — infinite feedback loop that
//                    constantly wipes the DOM and kicks focus out of inputs.
const setState = (patch, opts) => {
  opts = opts || {};
  // Capture the pre-patch state so the debounced sync can diff against it and
  // upsert ONLY the records that actually changed — critical because callers
  // like saveActivityToEntity pass setState({leads: leads.map(...)}), which
  // returns a fresh array where unchanged leads keep their original object
  // reference. Without this diff, a one-lead change upsert-storms the whole
  // table (N writes + N realtime echoes + N dbLoadAll cycles).
  var prevState = _state;
  // Skip listener notifications when every patch value is reference-equal to
  // the existing state. Guards against cascading re-renders when a caller
  // passes an unchanged slice.
  var changed = false;
  for (var k in patch) {
    if (patch[k] !== _state[k]) { changed = true; break; }
  }
  _state = {..._state, ...patch};
  if (changed) _listeners.forEach(l=>l());
  if (opts.skipSync) return;
  // Sync changed data to Supabase (debounced). Upsert only the records whose
  // object reference changed — for arrays built with .map, the unchanged
  // entries keep the same reference, so this is an O(changed) filter.
  if (_sb && (patch.contacts || patch.leads || patch.deals || patch.jobs)) {
    clearTimeout(_dbSyncTimer);
    _dbSyncTimer = setTimeout(function() {
      function _upsertChanged(patchArr, prevArr, tableName, toDb) {
        if (!Array.isArray(patchArr)) return;
        var prevById = {};
        (prevArr || []).forEach(function(r){ if (r && r.id) prevById[r.id] = r; });
        patchArr.forEach(function(r) {
          if (!r || !r.id) return;
          if (r !== prevById[r.id]) dbUpsert(tableName, toDb(r));
        });
      }
      _upsertChanged(patch.contacts, prevState.contacts, 'contacts', contactToDb);
      _upsertChanged(patch.leads,    prevState.leads,    'leads',    leadToDb);
      _upsertChanged(patch.deals,    prevState.deals,    'deals',    dealToDb);
      _upsertChanged(patch.jobs,     prevState.jobs,     'jobs',     jobToDb);
    }, 500);
  }
};
const addToast = (msg, type='success') => {
  const id = Date.now().toString();
  setState({toasts:[..._state.toasts,{id,msg,type}]});
  setTimeout(()=>setState({toasts:_state.toasts.filter(t=>t.id!==id)}), 3500);
};

