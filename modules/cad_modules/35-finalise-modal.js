// ═══════════════════════════════════════════════════════════════════════════
// FINALISE MODAL (spec §6.3) — generates the quote PDF and fires the signature
// request. Shown over the dashboard when the user clicks "Finalise & Send".
// Two states: configure (form) and result (signing URL + copy button).
// ═══════════════════════════════════════════════════════════════════════════

function FinaliseModal(props) {
  var busy = props.busy;
  var result = props.result;
  var projectInfo = props.projectInfo || {};
  var crmLink = props.crmLink;
  var frameCount = props.frameCount;
  var onClose = props.onClose;
  var onSend = props.onSend;

  var [recipient, setRecipient] = useState(projectInfo.email || '');
  var [subject, setSubject] = useState('Your quote from Spartan Double Glazing');
  var [body, setBody] = useState(
    'Hi ' + (projectInfo.customerName ? projectInfo.customerName.split(' ')[0] : 'there') + ',\n\n' +
    'Thank you for choosing Spartan Double Glazing. Please review your quote and sign via the secure link below. ' +
    'This link will remain valid for 14 days.\n\n' +
    'If you have any questions please don\'t hesitate to get in touch.\n\n' +
    'Kind regards,\nSpartan Double Glazing'
  );
  var [copied, setCopied] = useState(false);

  function validEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || ''); }

  function handleCopy() {
    if (!result || !result.signingUrl) return;
    try {
      navigator.clipboard.writeText(result.signingUrl);
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 2000);
    } catch (e) {
      // Fallback — select-and-copy via a temp textarea
      var ta = document.createElement('textarea');
      ta.value = result.signingUrl;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(function() { setCopied(false); }, 2000);
    }
  }

  var overlay = {
    position: 'fixed', inset: 0, zIndex: 10000,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  };
  var card = {
    background: '#fff', borderRadius: 8, width: '100%', maxWidth: 560,
    maxHeight: '90vh', overflow: 'auto',
    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
  };
  var header = {
    padding: '16px 22px', borderBottom: '1px solid #eee',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  var body_ = { padding: '20px 22px' };
  var footer = {
    padding: '14px 22px', borderTop: '1px solid #eee',
    display: 'flex', justifyContent: 'flex-end', gap: 10,
  };

  var label = { display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 };
  var input = { width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #ccc', borderRadius: 4, fontFamily: 'inherit', color: '#111', boxSizing: 'border-box' };
  var textarea = Object.assign({}, input, { minHeight: 120, resize: 'vertical', lineHeight: 1.5 });
  var btn = { padding: '9px 18px', fontSize: 13, border: '1px solid #ccc', background: '#f8f8f8', borderRadius: 4, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' };
  var btnPrimary = Object.assign({}, btn, { background: '#111', color: '#fff', border: '1px solid #111', fontWeight: 600 });

  // ─── Result state (after send) ─────────────────────────────────────────
  if (result) {
    return <div style={overlay}>
      <div style={card}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Signature Request Sent ✓</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>Customer will receive an email shortly</div>
          </div>
          <div onClick={onClose} style={{ cursor: 'pointer', fontSize: 20, color: '#999', padding: 4 }}>✕</div>
        </div>
        <div style={body_}>
          <div style={{ padding: 14, background: '#eaf7ec', border: '1px solid #b5d9b9', borderRadius: 4, marginBottom: 16, color: '#205828', fontSize: 13 }}>
            Sent to <strong>{result.recipient}</strong>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={label}>Signing link (fallback for SMS / copy)</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={result.signingUrl || ''} style={Object.assign({}, input, { fontFamily: 'monospace', fontSize: 11 })}/>
              <button onClick={handleCopy} style={Object.assign({}, btn, { minWidth: 80, whiteSpace: 'nowrap' })}>
                {copied ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
          </div>
          {result.pdfUrl && <div style={{ marginBottom: 6 }}>
            <div style={label}>Generated quote PDF</div>
            <a href={result.pdfUrl} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 12, color: '#0066cc', wordBreak: 'break-all' }}>
              {result.pdfUrl} ↗
            </a>
          </div>}
          <div style={{ fontSize: 11, color: '#888', marginTop: 16, lineHeight: 1.5 }}>
            The design status has been moved to <strong>awaiting_signature</strong>. The CRM will update its pipeline stage and send the notification email automatically.
          </div>
        </div>
        <div style={footer}>
          <button onClick={onClose} style={btnPrimary}>Done</button>
        </div>
      </div>
    </div>;
  }

  // ─── Configure state (form) ────────────────────────────────────────────
  var canSend = !busy && frameCount > 0 && validEmail(recipient) && crmLink && crmLink.design;

  return <div style={overlay}>
    <div style={card}>
      <div style={header}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Finalise & Send for Signature</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{frameCount} frame{frameCount !== 1 ? 's' : ''} · spec §6.3</div>
        </div>
        <div onClick={busy ? null : onClose} style={{ cursor: busy ? 'not-allowed' : 'pointer', fontSize: 20, color: '#999', padding: 4 }}>✕</div>
      </div>
      <div style={body_}>
        {frameCount === 0 && <div style={{ padding: 12, background: '#fff4f4', border: '1px solid #f5c0c0', borderRadius: 4, marginBottom: 16, color: '#8a1f1f', fontSize: 12 }}>
          No frames in this design. Add frames before sending for signature.
        </div>}
        {(!crmLink || !crmLink.design) && <div style={{ padding: 12, background: '#fff4f4', border: '1px solid #f5c0c0', borderRadius: 4, marginBottom: 16, color: '#8a1f1f', fontSize: 12 }}>
          CAD is running standalone — this design isn't linked to a CRM record. Open this design from the CRM to send for signature.
        </div>}
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Recipient Email <span style={{ color: '#c41230' }}>*</span></label>
          <input type="email" value={recipient} onChange={function(e){ setRecipient(e.target.value); }}
            placeholder="customer@example.com" style={input} disabled={busy}/>
          {recipient && !validEmail(recipient) && <div style={{ fontSize: 10, color: '#c41230', marginTop: 4 }}>Please enter a valid email address.</div>}
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Subject</label>
          <input type="text" value={subject} onChange={function(e){ setSubject(e.target.value); }} style={input} disabled={busy}/>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={label}>Email Body</label>
          <textarea value={body} onChange={function(e){ setBody(e.target.value); }} style={textarea} disabled={busy}/>
        </div>
        <div style={{ padding: 12, background: '#f7fafd', border: '1px solid #dae4ee', borderRadius: 4, fontSize: 12, color: '#345068', lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>When you click Send, CAD will:</div>
          <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
            <li>Generate a quote PDF with all frames, totals and T&Cs</li>
            <li>Upload it to secure storage and create a signing link (14-day expiry)</li>
            <li>Set the design status to <strong>awaiting_signature</strong></li>
            <li>Send the email payload back to the CRM which handles delivery</li>
          </ul>
        </div>
      </div>
      <div style={footer}>
        <button onClick={onClose} style={btn} disabled={busy}>Cancel</button>
        <button
          onClick={function(){ onSend(recipient.trim(), subject, body); }}
          style={Object.assign({}, btnPrimary, { opacity: canSend ? 1 : 0.5, cursor: canSend ? 'pointer' : 'not-allowed' })}
          disabled={!canSend}
        >
          {busy ? 'Sending…' : 'Generate & Send →'}
        </button>
      </div>
    </div>
  </div>;
}

