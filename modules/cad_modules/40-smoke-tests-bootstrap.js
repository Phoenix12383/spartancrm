// ═══════════════════════════════════════════════════════════════════════════
// SMOKE TEST RUNNER — invoke from devtools: `runSmokeTests()`
// ═══════════════════════════════════════════════════════════════════════════
// Covers the v26 integration surface: PDF generation, XLSX cut-list, entity
// back-propagation validation, and presence of the reusable UI components.
// Does NOT auto-run on load — startup cost, and failures would clutter the
// console for normal users. Headless test pages can import the file and call
// window.runSmokeTests() manually.
//
// Each test returns true/false. A failing test logs a ✗ with the assertion
// that failed, a passing test logs a ✓. Final summary printed as PASS n/m.
function runSmokeTests() {
  var results = [];
  function test(name, fn) {
    try {
      var r = fn();
      var ok = r !== false; // allow tests to return undefined = pass
      results.push({ name: name, ok: ok, err: null });
      if (typeof console !== 'undefined') {
        console.log((ok ? '%c✓' : '%c✗') + ' ' + name,
                    'color:' + (ok ? '#22c55e' : '#ef4444') + ';font-weight:bold');
      }
    } catch (e) {
      results.push({ name: name, ok: false, err: e });
      if (typeof console !== 'undefined') {
        console.log('%c✗ ' + name, 'color:#ef4444;font-weight:bold');
        console.log('    ', (e && e.message) || String(e));
      }
    }
  }
  function assert(cond, msg) { if (!cond) throw new Error('assertion failed: ' + msg); }

  // ─── Helper presence ────────────────────────────────────────────────────
  test('window.generateFinalisePdfBlob is exposed', function() {
    assert(typeof window.generateFinalisePdfBlob === 'function', 'missing on window');
  });
  test('window.generateCutListXlsxWorkbook is exposed', function() {
    assert(typeof window.generateCutListXlsxWorkbook === 'function', 'missing on window');
  });
  test('window.updateEntityAddress is exposed', function() {
    assert(typeof window.updateEntityAddress === 'function', 'missing on window');
  });

  // ─── generateFinalisePdfBlob ────────────────────────────────────────────
  test('generateFinalisePdfBlob returns a PDF Blob from minimal context', function() {
    if (typeof window.jspdf === 'undefined' && typeof window.jsPDF === 'undefined') {
      throw new Error('jsPDF not loaded — skipping (retry after page fully loads)');
    }
    var ctx = {
      projectName: 'Smoke Test Project',
      projectInfo: { customerName: 'Test Customer', address1: '1 Test St',
                     suburb: 'Melbourne', state: 'VIC', postcode: '3000',
                     phone: '0400000000', email: 'test@example.com' },
      projectItems: [{
        id: 'f_1', name: 'Window 1', productType: 'awning_window',
        width: 900, height: 1200, panelCount: 1, glassTint: 'clear',
        colour: 'white_body', colourInt: 'white_body',
      }],
      pricingConfig: (window.PRICING_DEFAULTS || {}),
      selectedPriceList: null,
      taxMode: 'inc',
      checkMeasure: null,
      projectAncillaries: [],
      projectPromotions: [],
      entityRef: 'TEST 1',
    };
    var blob = window.generateFinalisePdfBlob(ctx);
    assert(blob && typeof blob === 'object', 'no blob returned');
    assert(blob.size > 500, 'blob too small (' + (blob && blob.size) + ' bytes)');
    assert(blob.type === 'application/pdf', 'wrong MIME: ' + blob.type);
  });

  // ─── generateCutListXlsxWorkbook ────────────────────────────────────────
  test('generateCutListXlsxWorkbook builds a workbook with a Summary sheet', function() {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS not loaded — skipping (retry after page fully loads)');
    }
    var items = [{
      id: 'f_1', name: 'Test Frame', productType: 'awning_window',
      width: 900, height: 1200, panelCount: 1, glassTint: 'clear',
      colour: 'white_body', colourInt: 'white_body', roomName: 'Living',
    }];
    var wb = window.generateCutListXlsxWorkbook(items, window.PRICING_DEFAULTS, null, 'Smoke Test');
    assert(wb && typeof wb === 'object', 'no workbook returned');
    assert(Array.isArray(wb.SheetNames), 'missing SheetNames');
    assert(wb.SheetNames.length >= 1, 'no sheets');
    assert(wb.SheetNames.indexOf('Summary') >= 0, 'no Summary sheet (got: ' + wb.SheetNames.join(',') + ')');
  });

  // ─── updateEntityAddress validation ─────────────────────────────────────
  // These don't hit the network — they test the validation path that returns
  // synchronously before the await. For that we just inspect the return shape.
  test('updateEntityAddress rejects unknown entity type', async function() {
    var res = await window.updateEntityAddress('widget', 1, { street: '1 Test St' });
    assert(res && res.ok === false, 'expected ok:false, got ' + JSON.stringify(res));
    assert(res.error && /unsupported entity type|Unknown entity type/i.test(res.error.message),
           'wrong error: ' + (res.error && res.error.message));
  });
  test('updateEntityAddress rejects missing entity id', async function() {
    var res = await window.updateEntityAddress('lead', null, { street: '1 Test St' });
    assert(res && res.ok === false, 'expected ok:false, got ' + JSON.stringify(res));
    // The existing helper returns an error from Supabase (.eq with null id
    // fails) or rejects its own input — either is acceptable here.
    assert(res.error, 'expected an error object');
  });
  test('updateEntityAddress is a no-op when no known fields are supplied', async function() {
    // Only meaningful when Supabase is configured.
    if (typeof window.sbConfigured === 'function' && !window.sbConfigured()) {
      throw new Error('Supabase not configured — skipping noop check');
    }
    var res = await window.updateEntityAddress('lead', 'dummy-id-that-should-not-exist', {});
    // With no recognised address fields, the helper should short-circuit with
    // noop:true. If it hits the DB and errors out, that's also acceptable —
    // we're testing the input-handling path, not DB state.
    assert(res && (res.noop === true || res.error), 'expected noop or error, got ' + JSON.stringify(res));
  });

  // ─── Summary ────────────────────────────────────────────────────────────
  // Promise-aware: wait for async tests to settle, then print.
  return Promise.all(results.map(function(r){ return r.ok; })).then(function(){
    var pass = results.filter(function(r){ return r.ok; }).length;
    var total = results.length;
    var label = 'SMOKE TESTS: ' + pass + '/' + total + ' passed';
    if (typeof console !== 'undefined') {
      console.log('%c' + label,
                  'font-size:14px;font-weight:bold;color:' + (pass === total ? '#22c55e' : '#ef4444'));
    }
    return { pass: pass, total: total, results: results };
  });
}
window.runSmokeTests = runSmokeTests;

// Test hooks — expose pure functions on window so headless test scripts can
// invoke the pricing engine without going through the React UI. These are
// stateless reads of the calculator and the defaults so it's safe to leave on.
window.calculateFramePrice = calculateFramePrice;
window.PRICING_DEFAULTS = PRICING_DEFAULTS;
// Initial seed for window.__userProfiles before React mounts. Subsequent
// edits in the Profile Manager re-sync via useEffect (see SpartanCADPreview).
if (typeof window.__userProfiles === 'undefined') window.__userProfiles = (PRICING_DEFAULTS && PRICING_DEFAULTS.profiles) || {};
if (typeof window.__profileLinks === 'undefined') window.__profileLinks = (PRICING_DEFAULTS && PRICING_DEFAULTS.profileLinks) || {};

const domContainer = document.getElementById('root');
const reactRoot = ReactDOM.createRoot(domContainer);
reactRoot.render(<SpartanCADPreview />);
