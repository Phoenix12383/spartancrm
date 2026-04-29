// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 99-init.js
// Extracted from original index.html lines 16969-17059
// See CONTRACT.md for shared globals this module depends on / exposes.
// ═════════════════════════════════════════════════════════════════════════════

// Snapshot the currently-focused input so a full innerHTML rerender can
// restore focus, caret position, and scroll offsets. Without this, a realtime
// event fired while the user is typing (e.g. leads search while the map
// refreshes) kicks the cursor out mid-keystroke.
function _captureFocus(){
  var a = document.activeElement;
  if (!a || a === document.body) return null;
  var tag = (a.tagName||'').toLowerCase();
  if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !a.isContentEditable) return null;
  var sel = null;
  try {
    if (typeof a.selectionStart === 'number') {
      sel = { start: a.selectionStart, end: a.selectionEnd, dir: a.selectionDirection };
    }
  } catch(e) {}
  // Brief 6 Phase 2: contenteditable elements (the email composer) have no
  // selectionStart/End — caret position is tracked via Selection/Range. We
  // capture an absolute character offset from the start of the editor so it
  // survives the innerHTML rerender. Restored by _restoreFocus walking text
  // nodes until it finds the matching offset. Multi-character selections
  // record both ends; collapsed cursors record one offset.
  var ceOffset = null;
  if (a.isContentEditable && a.id) {
    try {
      var winSel = window.getSelection();
      if (winSel && winSel.rangeCount > 0) {
        var range = winSel.getRangeAt(0);
        // Snapshot start + end as character offsets from the editor root.
        var startRange = range.cloneRange();
        startRange.setStart(a, 0);
        var endRange = range.cloneRange();
        endRange.setStart(a, 0);
        ceOffset = {
          start: startRange.toString().length - (range.toString().length),
          end:   endRange.toString().length,
        };
      }
    } catch(e) {}
  }
  return {
    id: a.id || null,
    name: a.getAttribute ? a.getAttribute('name') : null,
    tag: tag,
    type: a.type || null,
    placeholder: a.getAttribute ? a.getAttribute('placeholder') : null,
    sel: sel,
    ceOffset: ceOffset,
    scrollTop: a.scrollTop,
    scrollLeft: a.scrollLeft,
  };
}
// CONTRACT: every input rendered by a page under renderPage() must have a
// stable `id` (preferred) or `name` attribute so focus / caret / scroll can be
// restored after the innerHTML rerender triggered by oninput handlers. The
// tag + placeholder fallback below is a safety net for forgotten ids — it is
// fragile (breaks on duplicate placeholders) and must not be relied on.
function _restoreFocus(snap){
  if (!snap) return;
  var el = null;
  if (snap.id) el = document.getElementById(snap.id);
  if (!el && snap.name) {
    try { el = document.querySelector(snap.tag + '[name="' + snap.name.replace(/"/g,'\\"') + '"]'); } catch(e){}
  }
  // Last-resort fallback: unique match by tag + placeholder.
  // We intentionally drop the [type="..."] segment because many inputs in this
  // codebase omit an explicit type attribute (default = "text"), and including
  // it in the selector makes the fallback miss the element that was just focused.
  if (!el && snap.placeholder) {
    try {
      var sel = snap.tag + '[placeholder="' + snap.placeholder.replace(/"/g,'\\"') + '"]';
      var matches = document.querySelectorAll(sel);
      if (matches.length === 1) el = matches[0];
    } catch(e){}
  }
  if (!el) return;
  try { el.focus({preventScroll:true}); } catch(e) { try { el.focus(); } catch(e2){} }
  if (snap.sel && typeof el.setSelectionRange === 'function') {
    try { el.setSelectionRange(snap.sel.start, snap.sel.end, snap.sel.dir || 'none'); } catch(e){}
  }
  // Brief 6 Phase 2: restore contenteditable caret by walking text nodes to
  // locate the saved character offsets. Walks once for both endpoints.
  if (snap.ceOffset && el.isContentEditable) {
    try {
      var startOff = Math.max(0, snap.ceOffset.start | 0);
      var endOff   = Math.max(startOff, snap.ceOffset.end | 0);
      var range = document.createRange();
      var startNode = null, startNodeOff = 0;
      var endNode = null, endNodeOff = 0;
      var consumed = 0;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      while (walker.nextNode()) {
        var node = walker.currentNode;
        var len = node.nodeValue ? node.nodeValue.length : 0;
        if (!startNode && consumed + len >= startOff) {
          startNode = node;
          startNodeOff = startOff - consumed;
        }
        if (!endNode && consumed + len >= endOff) {
          endNode = node;
          endNodeOff = endOff - consumed;
          break;
        }
        consumed += len;
      }
      // Fallback: saved offsets are past the current text length (rare —
      // usually means the editor contents shrank between capture and
      // restore, e.g. setState replaced body with shorter content). Land
      // the caret at the END so the user can keep typing without jumping
      // back to the start.
      if (!startNode) { range.selectNodeContents(el); range.collapse(false); }
      else {
        range.setStart(startNode, startNodeOff);
        range.setEnd(endNode || startNode, endNode ? endNodeOff : startNodeOff);
      }
      var winSel = window.getSelection();
      winSel.removeAllRanges();
      winSel.addRange(range);
    } catch(e) {}
  }
  if (typeof snap.scrollTop === 'number') el.scrollTop = snap.scrollTop;
  if (typeof snap.scrollLeft === 'number') el.scrollLeft = snap.scrollLeft;
}

function renderPage(){
  // Capacitor wrapper: lock crmMode to 'sales' and bounce any non-sales page
  // to the dashboard. The module bar is hidden so the UI can't switch modes,
  // but defensive routing here also catches programmatic navigations from
  // notification handlers, deep links, or stale state on first paint.
  if (typeof isNativeWrapper === 'function' && isNativeWrapper()) {
    var _wst = getState();
    var _wpatch = null;
    if (_wst.crmMode && _wst.crmMode !== 'sales') (_wpatch = _wpatch || {}).crmMode = 'sales';
    if (_wst.page && SALES_WRAPPER_PAGES.indexOf(_wst.page) < 0) {
      (_wpatch = _wpatch || {}).page = 'dashboard';
      _wpatch.dealDetailId = null;
      _wpatch.leadDetailId = null;
      _wpatch.contactDetailId = null;
      _wpatch.jobDetailId = null;
    }
    if (_wpatch) { setState(_wpatch); return; }   // setState retriggers renderPage via subscribe
  }
  var _focusSnap = _captureFocus();
  const {page,sidebarOpen,dealDetailId,leadDetailId,contactDetailId,jobDetailId}=getState();
  const offset=sidebarOpen?220:64;
  const pageRenderers={
    dashboard:renderDashboard,contacts:renderContacts,leads:renderLeads,deals:renderDeals,won:renderWonPage,jobs:renderJobsPage,jobdashboard:renderJobDashboard,weeklyrev:renderWeeklyRevenue,finalsignoff:renderFinalSignOff,schedule:renderInstallSchedule,capacity:renderCapacityPlanning,cmmap:renderCMMapPage,jobsettings:renderJobSettings,factorydash:renderFactoryDash,prodqueue:renderProdQueue,prodboard:renderProdBoard,factorybom:renderFactoryBOM,factorycap:renderFactoryCapacity,factorydispatch:renderFactoryDispatch,accdash:renderAccDash,accoutstanding:renderAccOutstanding,acccashflow:renderAccCashFlow,accrecon:renderAccRecon,accbills:renderAccBills,accweekly:renderAccWeekly,accbranch:renderAccBranch,accxero:renderAccXero,servicelist:renderServiceList,servicemap:renderServiceMap,svcschedule:renderSvcSchedule,calendar:renderCalendarPage,invoicing:renderInvoicingPage,commission:renderCommissionPage,
    email:renderEmailPage,phone:renderPhonePage,reports:renderReports,map:renderMapPage,settings:renderSettings,profile:renderProfilePage,
    audit:typeof renderAuditPage === 'function' ? renderAuditPage : renderDashboard,
  };
  const effectivePage=jobDetailId?'jobs':dealDetailId?'deals':leadDetailId?'leads':contactDetailId?'contacts':page;
  const fn=pageRenderers[effectivePage]||renderDashboard;

  document.getElementById('app').innerHTML=`
    ${typeof renderIncomingCallBanner === 'function' ? renderIncomingCallBanner() : ''}
    ${typeof renderActiveCallPanel === 'function' ? renderActiveCallPanel() : ''}
    ${renderModuleBar()}
    ${renderSidebar()}
    ${renderTopBar()}
    <main style="margin-left:${offset}px;margin-top:${56 + MODULE_BAR_HEIGHT}px;padding:24px;min-height:calc(100vh - ${56 + MODULE_BAR_HEIGHT}px);transition:margin-left .2s;background:#f2f2f2">
      <div style="${effectivePage==='email' ? 'width:100%' : 'max-width:1400px;margin:0 auto'}">
        ${fn()}
      </div>
    </main>
    <div id="toasts" style="position:fixed;bottom:24px;right:24px;z-index:200;display:flex;flex-direction:column;gap:8px"></div>
    ${_pendingWonDealId ? renderPaymentMethodModal() : ''}
    ${_pendingWonQuoteSelection ? renderWonQuoteSelectionModal() : ''}
    ${_pendingUnwindDealId ? renderUnwindDealModal() : ''}
    ${typeof _pendingLostTransition !== 'undefined' && _pendingLostTransition ? renderLostReasonModal() : ''}
    ${typeof _pendingDealTypePicker !== 'undefined' && _pendingDealTypePicker ? renderDealTypePickerModal() : ''}
    ${typeof _pendingPayRun !== 'undefined' && _pendingPayRun ? renderPayRunModal() : ''}
    ${typeof _pendingPayRunVoid !== 'undefined' && _pendingPayRunVoid ? renderVoidPayRunModal() : ''}
    ${typeof _pendingPayRunDetailId !== 'undefined' && _pendingPayRunDetailId ? renderPayRunDetailModal() : ''}
  `;
  _restoreFocus(_focusSnap);
  renderToasts();
  // Lock body scroll while any modal is open so the background page doesn't
  // scroll behind the modal. Re-evaluated every render — closing a modal (next
  // renderPage) restores normal scroll. iOS edge case (virtual keyboard
  // pushing the viewport) isn't handled — known limitation, document later.
  if (document.querySelector('.modal-bg')) {
    document.body.style.overflow = 'hidden';
  } else if (document.body.style.overflow === 'hidden') {
    document.body.style.overflow = '';
  }
  // Remount persistent DOM (map elements) so they aren't destroyed and
  // re-initialised on every render. Each function no-ops if its slot isn't
  // present on the current page.
  if (typeof mountLeadsGoogleMap === 'function') mountLeadsGoogleMap();
  if (typeof mountScheduleGoogleMap === 'function') mountScheduleGoogleMap();
  if (typeof mountInlineGoogleMap === 'function') mountInlineGoogleMap();
  if (typeof mountServiceGoogleMap === 'function') mountServiceGoogleMap();
  if (typeof mountCMGoogleMap === 'function') mountCMGoogleMap();
  setTimeout(function(){ _activeAutocompletes={}; attachAllAutocomplete(); }, 100);
}

// keyboard shortcut: "/" focuses search
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){const s=getState();if(s.emailComposing)emailCloseCompose();else if(kanbanEditModal){kanbanEditModal=null;renderPage();}else if(s.jobDetailId)setState({jobDetailId:null});else if(s.dealDetailId)setState({dealDetailId:null});else if(s.leadDetailId)setState({leadDetailId:null});else if(s.contactDetailId)setState({contactDetailId:null});}
  if(e.key==='/'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLTextAreaElement)){
    e.preventDefault();
    const el=document.getElementById('topSearch');
    if(el)el.focus();
  }
});

// close dropdowns on outside click
document.addEventListener('click', e=>{
  if(!e.target.closest('#branchDrop')&&!e.target.closest('[onclick*="toggleBranchDrop"]')) hideBranchDrop();
  if(!e.target.closest('#notifDrop')&&!e.target.closest('[onclick*="toggleNotifDrop"]')) hideNotifDrop();
  if(!e.target.closest('#profileDrop')&&!e.target.closest('[onclick*="toggleProfileDrop"]')){ profileDropOpen=false; var pd=document.getElementById('profileDrop'); if(pd) pd.style.display='none'; }
  const sd=document.getElementById('searchDrop');
  if(sd&&!e.target.closest('#topSearch')&&!sd.contains(e.target)) sd.style.display='none';
  // Close colour pickers
  if(!e.target.closest('[id^=colorPicker_]')&&!e.target.closest('[onclick*=stOpenColorPicker]')){
    document.querySelectorAll('[id^=colorPicker_]').forEach(el=>el.style.display='none');
  }
});

// Hang up any in-flight Twilio call when the rep closes the tab. Without
// this, an active call can stay alive on Twilio's side until their idle
// timeout, which leaves a "hanging" billed call and a stale call_logs row.
window.addEventListener('beforeunload', function() {
  if (typeof twilioHangup === 'function') { try { twilioHangup(); } catch(e){} }
  if (typeof twilioDestroy === 'function') { try { twilioDestroy(); } catch(e){} }
});

// subscribe to state changes and re-render
subscribe(()=>{if(getCurrentUser()){renderPage();renderToasts();}});

// initial render
// Startup
if(!getCurrentUser()){
  renderLoginScreen();
} else {
  // Show loading, then load from Supabase
  document.getElementById('app').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:12px"><div style="width:40px;height:40px;border:3px solid #e5e7eb;border-top-color:#c41230;border-radius:50%;animation:spin 0.8s linear infinite"></div><div style="font-family:Syne,sans-serif;font-weight:700;color:#1a1a1a">SPARTAN CRM</div><div style="font-size:12px;color:#9ca3af" id="loadStatus">Connecting to database\u2026</div><button onclick="localStorage.removeItem(\'spartan_current_user\');location.reload()" style="margin-top:20px;padding:6px 16px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-size:11px;color:#6b7280;font-family:inherit">Sign Out & Return to Login</button></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';

  // Init Supabase
  var sbReady = initSupabase();
  if (sbReady) {
    var el = document.getElementById('loadStatus');
    if (el) el.textContent = 'Loading data\u2026';
    dbLoadAll().then(function(ok) {
      var el2 = document.getElementById('loadStatus');
      if (ok) {
        if (el2) el2.textContent = 'Data loaded \u2014 launching\u2026';
        setupRealtime();
      } else {
        if (el2) el2.textContent = 'Using offline cache\u2026';
      }
      setTimeout(function(){ renderPage(); gmailInit(); autoRestoreGmail(); if(typeof twilioInit==='function')twilioInit(); setTimeout(loadGoogleMaps, 500); }, 300);
    }).catch(function(e) {
      console.error('[Spartan] Startup error:', e);
      renderPage();
      gmailInit();
      autoRestoreGmail();
      if (typeof twilioInit === 'function') twilioInit();
      setTimeout(loadGoogleMaps, 500);
    });
  } else {
    // Supabase not available — run in offline mode
    console.warn('[Spartan] Running offline — Supabase JS not loaded');
    var el = document.getElementById('loadStatus');
    if (el) el.textContent = 'Offline mode \u2014 launching\u2026';
    setTimeout(function(){ renderPage(); gmailInit(); autoRestoreGmail(); if(typeof twilioInit==='function')twilioInit(); setTimeout(loadGoogleMaps, 500); }, 300);
  }
}
