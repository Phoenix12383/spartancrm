// ═══════════════════════════════════════════════════════════════════════════
// SPARTAN DEBUG — pipeline diagnostics with hard-fail visibility.
//
// The 3D rebuild's first principle: never silently fall back to a procedural
// shape. When any stage of the parser → canonicaliser → resolver → extruder
// pipeline fails, we surface it loudly with a red banner that names the
// stage, the profile id, and the reason. The render either succeeds with the
// real DXF geometry or it fails visibly — no more "looks like a generic box"
// mystery.
//
// Public surface:
//   window.SpartanDebug                 — read-only snapshot of last events
//   SpartanDebug.report(stage, payload) — record an event
//   SpartanDebug.fail(stage, error, ctx)— record a failure (auto-banner)
//   SpartanDebug.clear()                — clear current banner state
//   SpartanDebug.assert(cond, msg, ctx) — throw + report if cond is falsy
//   SpartanDebugBanner                  — React component for the app shell
//
// Wire-up: add <SpartanDebugBanner /> near the top of the main app render
// (39-main-app.js, inside SpartanCADPreview's outer container).
// ═══════════════════════════════════════════════════════════════════════════

var SpartanDebug = (function() {
  // ── State ─────────────────────────────────────────────────────────────
  // Per-stage last result. Each stage clears its predecessors when it
  // succeeds, so a stale failure from an earlier upload doesn't linger.
  var state = {
    pipeline: 'profile-render',
    lastParse:        null, // { profileId, ok, ms, entities, error }
    lastCanonicalise: null, // { profileId, ok, ms, transforms, error, validation }
    lastResolve:      null, // { productType, slot, resolvedKey, ok, error }
    lastBuild:        null, // { profileId, member, lengthMm, vertices, ok, error }
    lastSceneSwap:    null, // { meshesAdded, meshesDisposed, ok }
    activeError:      null, // { stage, message, profileId?, productType?, ts }
  };

  var STAGES = ['lastParse', 'lastCanonicalise', 'lastResolve', 'lastBuild', 'lastSceneSwap'];

  // ── Event bus ─────────────────────────────────────────────────────────
  // Custom events let React subscribe via useEffect without polling.
  var EVT = 'spartan-debug-update';
  function emit() {
    if (typeof window === 'undefined') return;
    try { window.dispatchEvent(new CustomEvent(EVT, { detail: state })); } catch (e) {}
  }

  // ── Reporting ─────────────────────────────────────────────────────────
  function report(stage, payload) {
    if (STAGES.indexOf(stage) === -1) {
      console.warn('[SpartanDebug] unknown stage:', stage);
      return;
    }
    var entry = Object.assign({ ok: true, ts: Date.now() }, payload || {});
    state[stage] = entry;
    // A successful stage clears any active error from itself or earlier
    // stages — but NOT later stages (a successful parse doesn't fix a
    // failed extrude).
    if (entry.ok && state.activeError) {
      var failedIdx = STAGES.indexOf(state.activeError.stage);
      var thisIdx = STAGES.indexOf(stage);
      if (failedIdx <= thisIdx) state.activeError = null;
    }
    emit();
  }

  function fail(stage, error, ctx) {
    var msg = (error && error.message) || String(error || 'unknown error');
    var entry = Object.assign({
      ok: false,
      ts: Date.now(),
      error: msg,
      stack: (error && error.stack) || null,
    }, ctx || {});
    if (STAGES.indexOf(stage) !== -1) state[stage] = entry;
    state.activeError = Object.assign({ stage: stage, message: msg, ts: entry.ts }, ctx || {});
    // Also surface in console with a tag so devtools filtering works.
    console.error('[SpartanDebug] ' + stage + ' failed: ' + msg, ctx || {});
    emit();
  }

  function clear() {
    state.activeError = null;
    emit();
  }

  function assert(cond, msg, ctx) {
    if (cond) return;
    var err = new Error(msg);
    fail((ctx && ctx.stage) || 'lastBuild', err, ctx);
    throw err;
  }

  // ── Snapshot accessor ─────────────────────────────────────────────────
  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  return {
    report: report,
    fail: fail,
    clear: clear,
    assert: assert,
    snapshot: snapshot,
    _state: state,         // back-door for tests
    _eventName: EVT,
  };
})();

// Pin to window so non-React code paths (workers, raw scripts) can poke at it.
if (typeof window !== 'undefined') {
  window.SpartanDebug = SpartanDebug;
}

// ═══════════════════════════════════════════════════════════════════════════
// SpartanDebugBanner — React component for the app shell.
//
// Renders nothing when there's no active error. When a pipeline stage fails,
// shows a red banner with the stage, profile id (if known), and message. The
// banner has a "Copy diagnostics" button that puts the full SpartanDebug
// snapshot on the clipboard — useful for support tickets.
//
// Drop one instance near the top of the main app render. It's keyed off the
// custom event so it updates in real time.
// ═══════════════════════════════════════════════════════════════════════════
function SpartanDebugBanner() {
  var initial = (typeof window !== 'undefined' && window.SpartanDebug)
    ? window.SpartanDebug._state.activeError : null;
  var st = useState(initial);
  var err = st[0], setErr = st[1];

  useEffect(function() {
    function handler(e) {
      var detail = e && e.detail;
      setErr(detail ? detail.activeError : null);
    }
    window.addEventListener(SpartanDebug._eventName, handler);
    return function() { window.removeEventListener(SpartanDebug._eventName, handler); };
  }, []);

  if (!err) return null;

  var STAGE_LABELS = {
    lastParse:        'DXF parse',
    lastCanonicalise: 'Canonicalise',
    lastResolve:      'Resolve profile',
    lastBuild:        'Build geometry',
    lastSceneSwap:    'Scene update',
  };
  var stageLabel = STAGE_LABELS[err.stage] || err.stage;

  function copyDiagnostics() {
    try {
      var snap = SpartanDebug.snapshot();
      var text = JSON.stringify(snap, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
    } catch (e) { console.error('Copy failed', e); }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: '#dc2626', color: '#fff',
      padding: '10px 16px', fontSize: 13, fontFamily: 'system-ui, sans-serif',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      <span style={{ fontSize: 18 }}>⚠</span>
      <span style={{ fontWeight: 600 }}>{stageLabel} failed:</span>
      <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}>{err.message}</span>
      {err.profileId && <span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.85 }}>profile: {err.profileId}</span>}
      {err.productType && <span style={{ fontFamily: 'monospace', fontSize: 11, opacity: 0.85 }}>product: {err.productType}</span>}
      <button onClick={copyDiagnostics} style={{
        background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
        padding: '4px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
      }}>Copy diagnostics</button>
      <button onClick={function() { SpartanDebug.clear(); }} style={{
        background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
        padding: '4px 10px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
      }}>Dismiss</button>
    </div>
  );
}

// Build-hash stamp so "I deployed but cache is stale" is debuggable. Bump
// on every meaningful change to the rebuild modules.
if (typeof window !== 'undefined') {
  window.SpartanCAD = window.SpartanCAD || {};
  window.SpartanCAD.rebuildVersion = '3D-REBUILD-v1.0';
  window.SpartanCAD.rebuildHash = 'rebuild-' + Date.now().toString(36);
}
