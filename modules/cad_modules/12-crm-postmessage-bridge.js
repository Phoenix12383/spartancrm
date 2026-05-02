// ═══════════════════════════════════════════════════════════════════════════
// CRM ↔ CAD v2.0 POSTMESSAGE BRIDGE
// Contract: SPARTAN_CAD_CRM_INTEGRATION_CONTRACT.md §3. CRM spec §2.
//
// The bridge has three pieces:
//   1. CAD_VERSION       — sent in spartan-cad-ready, read by CRM on init ack.
//   2. __cadBridge       — module-level object the React component wires
//                          its callbacks into on mount. Lets the top-level
//                          message listener dispatch into React state without
//                          forward-ref gymnastics.
//   3. handleCrmMessage  — the dispatcher. Registered once at top-level so
//                          it catches spartan-cad-init even if CRM fires it
//                          before React has mounted; in that case `lastInit`
//                          stashes the payload and the effect replays it.
//
// M1 scope: spartan-cad-init, spartan-cad-ready, spartan-cad-request-save,
// spartan-cad-save, spartan-cad-save-error, spartan-cad-close. Save payload
// is deliberately minimal — totals are zeros, PDFs omitted. Time estimation
// lands in M2, quote model in M3, survey in M4, final locking in M5.
var CAD_VERSION = '2.0.0-WIP28';
var __cadBridge = {
  onInit: null,          // set by React mount; receives init payload
  onRequestSave: null,   // set by React mount; builds save payload
  lastInit: null,        // pre-mount init payload, replayed on mount
};

// Posts to the CRM parent frame. Same-origin blob-URL iframe architecture
// (contract §1), so '*' is acceptable for targetOrigin in M1. Production
// hardening may narrow this to a stored origin in a later milestone.
function postToCrm(msg) {
  try {
    if (typeof window === 'undefined') return false;
    var target = (window.parent && window.parent !== window) ? window.parent : null;
    if (!target) return false;
    target.postMessage(msg, '*');
    return true;
  } catch (e) { return false; }
}

// Dispatches CRM → CAD messages. Switches on event.data.type per contract §3.
// Unknown types are silently ignored (defensive — the browser hosts many
// non-CRM postMessage traffic: React DevTools, extensions, etc.).
function handleCrmMessage(event) {
  var data = event && event.data;
  if (!data || typeof data !== 'object' || !data.type) return;
  switch (data.type) {
    case 'spartan-cad-init':
      __cadBridge.lastInit = data;
      if (__cadBridge.onInit) {
        try { __cadBridge.onInit(data); } catch (e) {}
      }
      postToCrm({ type: 'spartan-cad-ready', version: CAD_VERSION });
      break;
    case 'spartan-cad-request-save':
      if (__cadBridge.onRequestSave) {
        try { __cadBridge.onRequestSave(); }
        catch (e) {
          postToCrm({ type: 'spartan-cad-save-error',
                      reason: 'Save builder threw: ' + (e && e.message || String(e)) });
        }
      } else {
        postToCrm({ type: 'spartan-cad-save-error',
                    reason: 'CAD not ready — React has not mounted' });
      }
      break;
    default:
      // spartan-cad-ready, spartan-cad-save, spartan-cad-save-error,
      // spartan-cad-close are CAD → CRM messages and will hit this handler
      // only if something is misrouted. Silently drop.
      break;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', handleCrmMessage);
  window.postToCrm = postToCrm;
  window.handleCrmMessage = handleCrmMessage;
  window.__cadBridge = __cadBridge;
  window.CAD_VERSION = CAD_VERSION;
}

