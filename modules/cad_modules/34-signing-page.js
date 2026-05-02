// ═══════════════════════════════════════════════════════════════════════════
// SIGNING PAGE — anonymous customer-facing route (spec §6.5)
// Mounted when the app detects ?sign=<token> in the URL. Four display states:
//   1. not-found        → token didn't match any signature row
//   2. expired          → expires_at < now
//   3. already-signed   → status === 'signed' (thank-you + document link)
//   4. active           → PDF preview + draw/type signature + submit
// Uses a plain <canvas> for the signature pad (no library) with pointer +
// touch events and DPR scaling for crisp lines on mobile.
// ═══════════════════════════════════════════════════════════════════════════

function SigningPage(props) {
  var token = props.token;
  var signature = props.signature;
  var busy = props.busy;
  var onSubmit = props.onSubmit;

  var canvasRef = useRef(null);
  var [mode, setMode] = useState('draw'); // 'draw' | 'type'
  var [typedName, setTypedName] = useState('');
  var [hasDrawn, setHasDrawn] = useState(false);
  var [agreed, setAgreed] = useState(false);

  // ─── Signature pad: plain canvas + pointer events ───────────────────────
  // Wired on mount / mode switch to 'draw'. HiDPI-scaled so lines are sharp
  // on retina/mobile displays. Handles pointer AND touch for iPad/tablets.
  useEffect(function() {
    if (mode !== 'draw') return;
    var c = canvasRef.current;
    if (!c) return;
    var dpr = window.devicePixelRatio || 1;
    var rect = c.getBoundingClientRect();
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    var drawing = false, lastX = 0, lastY = 0;
    function xy(e) {
      var r = c.getBoundingClientRect();
      var t = e.touches && e.touches[0];
      return [
        (t ? t.clientX : e.clientX) - r.left,
        (t ? t.clientY : e.clientY) - r.top
      ];
    }
    function down(e) {
      e.preventDefault();
      drawing = true;
      var p = xy(e); lastX = p[0]; lastY = p[1];
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = xy(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
      lastX = p[0]; lastY = p[1];
      setHasDrawn(true);
    }
    function up() { drawing = false; }
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointerleave', up);
    c.addEventListener('touchstart', down, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', up);
    return function() {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointerleave', up);
      c.removeEventListener('touchstart', down);
      c.removeEventListener('touchmove', move);
      c.removeEventListener('touchend', up);
    };
  }, [mode]);

  function clearPad() {
    var c = canvasRef.current; if (!c) return;
    var ctx = c.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    setHasDrawn(false);
  }

  // Render typed name to a dataURL in handwriting-style font so we have a
  // visual signature image even when the user types rather than draws.
  function renderTypedSignature(name) {
    var cnv = document.createElement('canvas');
    cnv.width = 600; cnv.height = 140;
    var cx = cnv.getContext('2d');
    cx.fillStyle = '#fff';
    cx.fillRect(0, 0, cnv.width, cnv.height);
    cx.fillStyle = '#111';
    cx.font = 'italic 56px "Brush Script MT", "Lucida Handwriting", "Segoe Script", cursive';
    cx.textBaseline = 'middle';
    cx.fillText(name || '', 24, cnv.height / 2);
    return cnv.toDataURL('image/png');
  }

  function getSignatureDataUrl() {
    if (mode === 'type') return renderTypedSignature(typedName.trim());
    var c = canvasRef.current; if (!c) return '';
    return c.toDataURL('image/png');
  }

  function handleSubmit() {
    var name = typedName.trim();
    if (!name) { alert('Please type your full legal name.'); return; }
    if (mode === 'draw' && !hasDrawn) { alert('Please draw your signature, or switch to Type.'); return; }
    if (!agreed) { alert('Please tick the agreement box to continue.'); return; }
    onSubmit(name, getSignatureDataUrl());
  }

  // ─── Shared chrome ──────────────────────────────────────────────────────
  var page = { minHeight: '100vh', background: '#f4f4f4', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '24px 16px', overflow: 'auto' };
  var card = { maxWidth: 820, margin: '0 auto', background: '#fff', borderRadius: 8, boxShadow: '0 2px 16px rgba(0,0,0,0.08)', overflow: 'hidden' };
  var header = { padding: '20px 28px', borderBottom: '1px solid #eee', background: '#111', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
  var h1 = { fontSize: 20, fontWeight: 700, letterSpacing: 0.3 };
  var sub = { fontSize: 12, opacity: 0.7, marginTop: 4 };
  var body = { padding: '24px 28px' };

  // ─── State 1: not found ─────────────────────────────────────────────────
  if (signature === null || signature === undefined) {
    // `null` means load completed with no match; `undefined` means still loading.
    if (signature === undefined) {
      return <div style={page}><div style={card}>
        <div style={header}><div><div style={h1}>Spartan Double Glazing</div><div style={sub}>Loading signature request…</div></div></div>
        <div style={body}><div style={{ padding: 40, textAlign: 'center', color: '#666' }}>Please wait…</div></div>
      </div></div>;
    }
    return <div style={page}><div style={card}>
      <div style={header}><div><div style={h1}>Signature link not found</div><div style={sub}>Token: {token}</div></div></div>
      <div style={body}>
        <div style={{ padding: 20, background: '#fff4f4', border: '1px solid #f5c0c0', borderRadius: 6, color: '#8a1f1f' }}>
          We couldn't find a signature request matching this link. It may have been cancelled or the URL may be incorrect.
        </div>
        <div style={{ marginTop: 20, fontSize: 13, color: '#666' }}>
          If you believe this is an error, please contact Spartan Double Glazing directly and we'll resend your document.
        </div>
      </div>
    </div></div>;
  }

  // ─── State 2: expired ───────────────────────────────────────────────────
  var expiresAt = signature.expires_at ? new Date(signature.expires_at) : null;
  if (expiresAt && expiresAt < new Date() && signature.status !== 'signed') {
    return <div style={page}><div style={card}>
      <div style={header}><div><div style={h1}>Signature link expired</div><div style={sub}>This link expired on {expiresAt.toLocaleDateString()}</div></div></div>
      <div style={body}>
        <div style={{ padding: 20, background: '#fff8e8', border: '1px solid #e8d590', borderRadius: 6, color: '#7a5a10' }}>
          For your security, signature links expire after 14 days. Please contact Spartan Double Glazing to have a fresh link sent to you.
        </div>
      </div>
    </div></div>;
  }

  // ─── State 3: already signed ────────────────────────────────────────────
  if (signature.status === 'signed') {
    return <div style={page}><div style={card}>
      <div style={header}>
        <div><div style={h1}>Signed — thank you</div><div style={sub}>Signed on {signature.signed_at ? new Date(signature.signed_at).toLocaleString() : '—'} by {signature.signed_name || '—'}</div></div>
        <div style={{ fontSize: 28 }}>✓</div>
      </div>
      <div style={body}>
        <div style={{ padding: 16, background: '#eaf7ec', border: '1px solid #b5d9b9', borderRadius: 6, color: '#205828', marginBottom: 20 }}>
          Your signed document has been sent to Spartan Double Glazing. A copy has also been emailed to you.
        </div>
        {signature.document_url && <div style={{ padding: 12, border: '1px solid #e0e0e0', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Your signed quote</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>PDF document</div>
          </div>
          <a href={signature.document_url} target="_blank" rel="noopener noreferrer" style={{ padding: '8px 14px', background: '#111', color: '#fff', textDecoration: 'none', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>Download ↓</a>
        </div>}
      </div>
    </div></div>;
  }

  // ─── State 4: active signing ────────────────────────────────────────────
  return <div style={page}><div style={card}>
    <div style={header}>
      <div>
        <div style={h1}>Spartan Double Glazing</div>
        <div style={sub}>Please review and sign your document below</div>
      </div>
      {signature.sent_to_email && <div style={{ fontSize: 11, opacity: 0.65, textAlign: 'right' }}>
        Sent to<br/><strong style={{ opacity: 1 }}>{signature.sent_to_email}</strong>
      </div>}
    </div>
    <div style={body}>
      {/* Document preview */}
      {signature.document_url ? (
        <div style={{ border: '1px solid #ddd', borderRadius: 4, marginBottom: 24, overflow: 'hidden', background: '#fafafa' }}>
          <div style={{ padding: '8px 12px', background: '#f0f0f0', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: '#555' }}>Document preview</span>
            <a href={signature.document_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc', textDecoration: 'none', fontSize: 12 }}>Open in new tab ↗</a>
          </div>
          <iframe src={signature.document_url} style={{ width: '100%', height: 520, border: 'none' }} title="Document to sign"/>
        </div>
      ) : (
        <div style={{ padding: 16, background: '#f8f8f8', border: '1px dashed #ccc', borderRadius: 4, marginBottom: 24, color: '#777', fontSize: 13, textAlign: 'center' }}>
          Document preview unavailable. Contact Spartan Double Glazing if you need to review before signing.
        </div>
      )}

      {/* Typed legal name (required for both modes — spec §6.5) */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#333' }}>Your full legal name <span style={{ color: '#c41230' }}>*</span></label>
        <input
          type="text"
          value={typedName}
          onChange={function(e) { setTypedName(e.target.value); }}
          placeholder="e.g. Jane Elizabeth Smith"
          style={{ width: '100%', padding: '10px 14px', fontSize: 15, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit' }}
        />
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '1px solid #ddd' }}>
        <div onClick={function() { setMode('draw'); }} style={{ padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: mode === 'draw' ? 700 : 500, borderBottom: mode === 'draw' ? '2px solid #111' : '2px solid transparent', color: mode === 'draw' ? '#111' : '#777', marginBottom: -1 }}>Draw signature</div>
        <div onClick={function() { setMode('type'); }} style={{ padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: mode === 'type' ? 700 : 500, borderBottom: mode === 'type' ? '2px solid #111' : '2px solid transparent', color: mode === 'type' ? '#111' : '#777', marginBottom: -1 }}>Type signature</div>
      </div>

      {mode === 'draw' ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ position: 'relative', border: '1px solid #ccc', borderRadius: 4, background: '#fff', height: 180 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}/>
            {!hasDrawn && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: 14, pointerEvents: 'none', fontStyle: 'italic' }}>Sign here with your finger, stylus, or mouse</div>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#888' }}>{hasDrawn ? 'Signature captured' : 'Awaiting signature'}</span>
            <button onClick={clearPad} style={{ padding: '6px 12px', background: '#f4f4f4', border: '1px solid #ccc', borderRadius: 4, fontSize: 12, cursor: 'pointer' }}>Clear</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: '32px 20px', border: '1px solid #ccc', borderRadius: 4, background: '#fff', minHeight: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: '"Brush Script MT", "Lucida Handwriting", "Segoe Script", cursive', fontSize: 48, color: '#111', fontStyle: 'italic' }}>
              {typedName.trim() || <span style={{ color: '#bbb', fontSize: 16, fontStyle: 'italic', fontFamily: 'inherit' }}>Type your name above to see signature preview</span>}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>Your typed name above will appear as your signature.</div>
        </div>
      )}

      {/* Agreement checkbox */}
      <div style={{ marginTop: 20, padding: 14, background: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 4 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, color: '#333', lineHeight: 1.5 }}>
          <input type="checkbox" checked={agreed} onChange={function(e) { setAgreed(e.target.checked); }} style={{ marginTop: 3, accentColor: '#111', width: 16, height: 16, flexShrink: 0 }}/>
          <span>
            I have reviewed the document and confirm that the details are correct. I understand that by signing I am entering into a binding agreement with Spartan Double Glazing Pty Ltd under the terms shown. I acknowledge my IP address and signature will be recorded as evidence of signing.
          </span>
        </label>
      </div>

      {/* Submit */}
      <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button
          onClick={handleSubmit}
          disabled={busy}
          style={{
            padding: '12px 28px',
            background: busy ? '#888' : '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? 'not-allowed' : 'pointer',
            minWidth: 180,
          }}
        >{busy ? 'Submitting…' : 'Sign & Submit'}</button>
      </div>

      <div style={{ marginTop: 28, fontSize: 11, color: '#999', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: 16 }}>
        Spartan Double Glazing Pty Ltd · ABN registered in Australia · secured signing page
      </div>
    </div>
  </div></div>;
}

