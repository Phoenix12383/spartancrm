// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11a-email-compose.js
// Extracted from 11-email-page.js on 2026-05-02 as part of monolith breakup.
// ═════════════════════════════════════════════════════════════════════════════


// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
defineAction('email-compose-toggle-merge-picker', function(target, ev) {
  mergePickerOpen = !mergePickerOpen;
  renderPage();
});

defineAction('email-compose-insert-merge-field', function(target, ev) {
  const key = target.dataset.mergeFieldKey;
  insertMergeField(key);
});

defineAction('email-compose-close', function(target, ev) {
  emailCloseCompose();
});

defineAction('email-compose-update-to', function(target, ev) {
  getState().emailComposeData.to = target.value;
});

defineAction('email-compose-update-cc', function(target, ev) {
  getState().emailComposeData.cc = target.value;
});

defineAction('email-compose-update-bcc', function(target, ev) {
  getState().emailComposeData.bcc = target.value;
});

defineAction('email-compose-update-subject', function(target, ev) {
  getState().emailComposeData.subject = target.value;
});

defineAction('email-compose-body-input', function(target, ev) {
  _ecOnInput();
});

defineAction('email-compose-use-template', function(target, ev) {
  const templateId = target.dataset.templateId;
  const tmpl = getAllTemplates().find(x => x.id === templateId);
  if (tmpl) emailUseTemplate(tmpl);
});

defineAction('email-compose-more-templates', function(target, ev) {
  setState({emailFolder:'templates', emailComposing:true});
});

defineAction('email-compose-edit-signature', function(target, ev) {
  setState({page:'profile'});
});

defineAction('email-compose-send-via-gmail', function(target, ev) {
  emailSendOrLog(false);
});

defineAction('email-compose-log-and-save', function(target, ev) {
  emailSendOrLog(true);
});

defineAction('email-compose-discard', function(target, ev) {
  emailCloseCompose();
});


// Initial-load body normaliser. Drafts saved before Phase 2 are plain text
// (newlines as \n). Drafts saved after Phase 2 are HTML. Convert the
// first into safe HTML so it renders correctly on reopen; sanitise the
// second through the Phase 1 allow-list either way for security.
function _composerInitialBody(body) {
  if (body == null) return '';
  body = String(body);
  if (body === '') return '';
  if (body.indexOf('<') === -1) {
    return _escHtml(body).replace(/\r?\n/g, '<br>');
  }
  return _sanitizeHtml(body);
}

function toggleMergePicker() { mergePickerOpen = !mergePickerOpen; renderPage(); }

// Brief 6 Phase 2: insert a merge-field token at the caret in the
// contenteditable composer. Falls back to legacy textarea behaviour if
// `ec_body` happens to be a textarea (defensive — should never happen
// after Phase 2 ships).
function insertMergeField(key) {
  var el = document.getElementById('ec_body');
  if (!el) return;
  var tag = '{{' + key + '}}';
  if (el.tagName === 'TEXTAREA') {
    var start = el.selectionStart || el.value.length;
    el.value = el.value.slice(0, start) + tag + el.value.slice(start);
    getState().emailComposeData.body = el.value;
    el.focus();
    el.selectionStart = el.selectionEnd = start + tag.length;
  } else {
    // Contenteditable path. document.execCommand('insertText') inserts at
    // the caret + advances the cursor — which is exactly what we want for
    // a merge-field token. Refocus first so the insert lands in the editor
    // rather than in the merge picker button.
    el.focus();
    try { document.execCommand('insertText', false, tag); } catch (e) {
      // Older browser without insertText support — fall back to manual
      // range insertion.
      var sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(tag));
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.innerHTML += tag;
      }
    }
    _ecOnInput();
  }
  mergePickerOpen = false;
  renderPage();
}


function renderMergeFieldBar() {
  return '<div style="padding:6px 20px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;gap:8px;position:relative">'
    +'<button data-action="email-compose-toggle-merge-picker" style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #c41230;background:#fff5f6;cursor:pointer;font-family:inherit;color:#c41230;font-weight:600;white-space:nowrap">{{ }} Insert Field</button>'
    +(mergePickerOpen ? '<div style="position:absolute;top:32px;left:20px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.12);z-index:200;width:280px;max-height:320px;overflow-y:auto;padding:8px">'
      +'<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;padding:4px 8px">Click to insert</div>'
      + MERGE_FIELDS.map(function(f) {
        return '<button data-action="email-compose-insert-merge-field" data-merge-field-key="' + f.key + '" style="width:100%;text-align:left;padding:7px 10px;border:none;background:none;cursor:pointer;font-family:inherit;font-size:12px;border-radius:6px;display:flex;justify-content:space-between;align-items:center" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'none\'">'
          +'<span style="font-weight:600;color:#374151">{{' + f.key + '}}</span>'
          +'<span style="font-size:11px;color:#9ca3af">' + f.label + '</span>'
          +'</button>';
      }).join('')
      +'</div>' : '')
    +'<span style="font-size:10px;color:#9ca3af;flex:1">Fields auto-fill with contact/deal data when you send</span>'
    +'</div>';
}


function emailOpenCompose(to, toName, subject, body, dealId, contactId, leadId, templateId, replyToId) {
  const clean = v => (!v || v==='null' || v==='undefined') ? null : v;
  setState({
    emailComposing: true,
    emailComposeData: {
      to:to||'', toName:toName||'', subject:subject||'', body:body||'', cc:'', bcc:'',
      dealId:clean(dealId), contactId:clean(contactId), leadId:clean(leadId),
      templateId:clean(templateId), replyToId:clean(replyToId)
    },
    emailFolder: getState().emailFolder||'inbox',
  });
  renderPage();
}


function emailCloseCompose() {
  setState({emailComposing:false});
}


function emailSendOrLog(skipGmail) {
  const s = getState();
  const d = s.emailComposeData;
  if (!d.to) { addToast('Enter a recipient','error'); return; }
  if (!d.subject && !d.body) { addToast('Add a subject or body','error'); return; }

  // Brief 6 Phase 4: append the per-state signature to the body that's
  // actually sent + logged. The composer's signature preview was visual-
  // only pre-Phase-4 — without this append, recipients never saw the
  // signature even though Phase 3 let users configure it. Resolve the
  // state from the linked deal so users get their per-state signature
  // (e.g. a Sydney rep emailing a NSW deal gets the NSW signature).
  const _dealForSig = d.dealId ? (s.deals || []).find(function(x){ return x.id === d.dealId; }) : null;
  const _sigState = _dealForSig ? (_dealForSig.state || '') : '';
  const _signatureHtml = (typeof getSignature === 'function') ? getSignature(_sigState) : '';
  // Wrap signature in a separator div so it's visually distinct from the
  // body. Two <br>s match the typical "blank line + signature" rhythm.
  const fullBody = (d.body || '') + (_signatureHtml ? '<br><br>' + _signatureHtml : '');

  const newMsg = {
    id: 'es'+Date.now(),
    to: d.to, toName: d.toName || d.to,
    subject: d.subject, body: fullBody,
    date: new Date().toISOString().slice(0,10),
    time: new Date().toTimeString().slice(0,5),
    opened: false, openedAt: null, clicked: false, opens: 0,
    dealId: d.dealId, contactId: d.contactId, leadId: d.leadId,
    templateId: d.templateId, status: 'sent',
    replyToId: d.replyToId || null,
  };

  setState({
    emailSent: [newMsg, ...s.emailSent],
    emailComposing: false,
    emailFolder: 'sent',
    emailSelectedId: newMsg.id,
  });

  // Also log to entity activity. Stores fullBody (body + signature) so
  // the activity timeline reflects what was actually sent, not just what
  // the user typed in the composer.
  if (d.dealId || d.contactId || d.leadId) {
    const entityId   = d.dealId || d.contactId || d.leadId;
    const entityType = d.dealId ? 'deal' : d.contactId ? 'contact' : 'lead';
    saveActivityToEntity(entityId, entityType, {
      id: 'a'+Date.now(), type:'email',
      subject: d.subject, text: fullBody,
      preview: fullBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100),
      opens: 0, opened: false, openedAt: null,
      date: newMsg.date, time: newMsg.time,
      by: s.gmailUser ? s.gmailUser.name : (getCurrentUser()||{name:'Admin'}).name,
      done: false, dueDate: '',
    });
  }

  // Try Gmail send if connected
  if (!skipGmail && s.gmailConnected && s.gmailToken) {
    gmailSend(d.to, d.subject, fullBody, d.cc, d.dealId||d.contactId||d.leadId||'', d.dealId?'deal':d.contactId?'contact':'lead');
    return;
  }
  addToast('Email logged ✓', 'success');
  renderPage();
}


function emailMarkRead(id) {
  setState({
    emailInbox: getState().emailInbox.map(m=>m.id===id?{...m,read:true}:m),
    emailSelectedId: id,
  });
}


function emailSelectSent(id) { setState({emailSelectedId:id, emailFolder:'sent'}); }


// Reply / Forward / Expand wrappers — take only the msg id and look up the
// full message from state. Avoids having to JS-string-escape subjects, bodies,
// and sender names when interpolating them into inline onclick handlers.
function replyToEmail(msgId) {
  var s = getState();
  var msg = [...s.emailInbox, ...s.emailSent, ...s.emailDrafts].find(m => m.id === msgId);
  if (!msg) return;
  emailOpenCompose(msg.from || '', msg.fromName || msg.from || '',
    'Re: ' + (msg.subject || ''), '',
    msg.dealId || null, msg.contactId || null, msg.leadId || null, null, msg.id);
}

function forwardEmail(msgId) {
  var s = getState();
  var msg = [...s.emailInbox, ...s.emailSent, ...s.emailDrafts].find(m => m.id === msgId);
  if (!msg) return;
  emailOpenCompose('', '', 'Fwd: ' + (msg.subject || ''),
    '---------- Forwarded message ----------\n' + (msg.body || ''),
    msg.dealId || null, msg.contactId || null, msg.leadId || null, null, null);
}


function emailUseTemplate(tmpl) {
  var s = getState();
  var entityId = s.emailComposeData.dealId || s.emailComposeData.leadId || s.emailComposeData.contactId || s.dealDetailId || s.leadDetailId || s.contactDetailId || '';
  var entityType = s.emailComposeData.dealId || s.dealDetailId ? 'deal' : s.emailComposeData.leadId || s.leadDetailId ? 'lead' : s.emailComposeData.contactId || s.contactDetailId ? 'contact' : '';
  var ctx = buildMergeContext(entityId, entityType);
  var filled = emailFillTemplate(tmpl, ctx);
  setState({
    emailComposing: true,
    emailComposeData: {...s.emailComposeData, subject:filled.subject, body:filled.body, templateId:tmpl.id},
  });
}





// ── Simple email shortcut functions (avoid complex inline onclick) ────────────


function quickReplyEmail(msgId) {
  const el = document.getElementById('quickReply_'+msgId);
  const txt = el ? el.value.trim() : '';
  if (!txt) { addToast('Write a reply first','error'); return; }
  const msg = [...getState().emailInbox,...getState().emailSent].find(m=>m.id===msgId);
  if (!msg) return;
  const replyTo = getState().emailInbox.find(m=>m.id===msgId) ? msg.from : msg.to;
  const replyName = getState().emailInbox.find(m=>m.id===msgId) ? (msg.fromName||msg.from) : (msg.toName||msg.to);
  emailOpenCompose(replyTo, replyName, 'Re: '+(msg.subject||''), txt, msg.dealId||null, msg.contactId||null, msg.leadId||null, null, msgId);
  setState({page:'email'});
}


// ── Composer ──────────────────────────────────────────────────────────────────
function renderEmailComposer() {
  const s = getState();
  const d = s.emailComposeData;
  const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(d.to)}`;

  // Brief 6 Phase 3: derive the AU state from the linked deal (if any) so
  // getSignature(state) picks the right per-state signature. When the
  // composer is opened standalone or for a contact/lead without a deal,
  // sigState is '' and the lookup falls back to default.
  const _dealForSig = d.dealId ? (s.deals || []).find(function(x){ return x.id === d.dealId; }) : null;
  const sigState = _dealForSig ? (_dealForSig.state || '') : '';

  return `
  <div style="display:flex;flex-direction:column;height:100%">
    <!-- Composer header -->
    <div style="padding:14px 20px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fafafa">
      <div style="font-size:14px;font-weight:700;font-family:Syne,sans-serif">New Message</div>
      <div style="display:flex;gap:6px;align-items:center">
        ${s.gmailConnected?`<div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#15803d;background:#f0fdf4;padding:3px 8px;border-radius:10px;border:1px solid #86efac">
          <div style="width:6px;height:6px;border-radius:50%;background:#22c55e"></div>Gmail Ready
        </div>`:''}
        <button data-action="email-compose-close" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:20px;line-height:1;padding:4px">×</button>
      </div>
    </div>

    <!-- Fields -->
    <div style="border-bottom:1px solid #f0f0f0">
      ${[['To','to','email'],['Cc','cc','email'],['Bcc','bcc','email']].map(([label,field,type])=>`
        <div style="display:flex;align-items:center;padding:0 20px;border-bottom:1px solid #f9fafb">
          <span style="font-size:12px;color:#9ca3af;width:36px;flex-shrink:0">${label}</span>
          <input id="ec_${field}" type="${type}" value="${_escHtml(d[field]||'')}" data-on-input="email-compose-update-${field}"
            style="flex:1;border:none;outline:none;font-size:13px;font-family:inherit;padding:10px 0;background:transparent;color:#1a1a1a">
        </div>`).join('')}
      <div style="display:flex;align-items:center;padding:0 20px">
        <span style="font-size:12px;color:#9ca3af;width:36px;flex-shrink:0">Subj</span>
        <input id="ec_subject" type="text" value="${_escHtml(d.subject||'')}" data-on-input="email-compose-update-subject"
          style="flex:1;border:none;outline:none;font-size:13px;font-family:inherit;font-weight:500;padding:10px 0;background:transparent;color:#1a1a1a" placeholder="Subject">
      </div>
    </div>

    <!-- Templates quick-pick -->
    <div style="padding:8px 20px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;gap:8px;overflow-x:auto">
      <span style="font-size:11px;color:#9ca3af;white-space:nowrap;font-weight:500">Templates:</span>
      ${getAllTemplates().slice(0,5).map(t=>`<button data-action="email-compose-use-template" data-template-id="${t.id}" style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-family:inherit;white-space:nowrap;color:#374151" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='#fff'">${_escHtml(t.name)}</button>`).join('')}
      <button data-action="email-compose-more-templates" style="font-size:11px;padding:3px 10px;border-radius:20px;border:1px solid #e5e7eb;background:#fff;cursor:pointer;font-family:inherit;white-space:nowrap;color:#6b7280">More…</button>
    </div>

    <!-- Merge fields picker -->
    ${renderMergeFieldBar()}

    <!-- Brief 6 Phase 2: composer rich-text toolbar. Shared markup with
         signature editors (Phase 3) — see RteToolbar() definition. -->
    ${RteToolbar('ec_body')}
    <!-- Placeholder CSS for any contenteditable carrying data-placeholder.
         Class-based so the same rule covers the composer + every signature
         editor without per-instance scoping. -->
    <style>.rte-editable:empty:before{content:attr(data-placeholder);color:#9ca3af;pointer-events:none}</style>

    <!-- Body — contenteditable (Brief 6 Phase 2). Initial content is
         normalised through _composerInitialBody so legacy plain-text
         drafts get their newlines converted to <br>, and HTML drafts
         get sanitised through the Phase 1 allow-list. -->
    <div id="ec_body" class="rte-editable" contenteditable="true"
      data-placeholder="Write your email here… Use {{firstName}}, {{dealTitle}} etc. to auto-fill"
      data-on-input="email-compose-body-input"
      style="flex:1;padding:16px 20px;border:none;outline:none;font-size:14px;font-family:inherit;line-height:1.8;color:#1a1a1a;background:#fff;min-height:240px;overflow-y:auto;word-break:break-word">${_composerInitialBody(d.body||'')}</div>

    <!-- Signature — Brief 6 Phase 3. Pulls the right signature for the
         deal's state via state-aware getSignature(state). When the
         composer is opened standalone (no entity), state is undefined
         and the fallback chain lands on default. Renders sanitised HTML
         so logos / formatting / inline images appear correctly. The
         "Edit signature" button deep-links to Profile rather than
         offering an inline editor — Profile owns the per-state
         configuration, and the composer's space is already tight. -->
    <div style="padding:8px 20px 10px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.6">
      <div style="font-size:11px;color:#9ca3af;margin-bottom:4px;display:flex;justify-content:space-between;align-items:center">
        <span>Signature${sigState ? ' · ' + sigState : ' · default'}</span>
        <button data-action="email-compose-edit-signature" style="font-size:10px;color:#3b82f6;background:none;border:none;cursor:pointer;font-family:inherit;padding:0">Edit in Profile →</button>
      </div>
      <div>${_sanitizeHtml(getSignature(sigState))}</div>
    </div>

    <!-- Footer actions -->
    <div style="padding:10px 20px;border-top:1px solid #f0f0f0;background:#fafafa;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
      <div style="display:flex;gap:6px;align-items:center">
        ${s.gmailConnected?`<button data-action="email-compose-send-via-gmail" class="btn-r" style="font-size:13px;gap:6px">${Icon({n:'send',size:13})} Send via Gmail</button>`:
          `<button data-action="email-compose-log-and-save" class="btn-r" style="font-size:13px;gap:6px">${Icon({n:'send',size:13})} Log & Save</button>
           <a href="${gmailUrl}" target="_blank" class="btn-w" style="font-size:12px;text-decoration:none">Open in Gmail ↗</a>`}
        <button data-action="email-compose-discard" class="btn-w" style="font-size:12px">Discard</button>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <label style="cursor:pointer">
          <input type="file" multiple style="display:none">
          <span class="btn-g" style="font-size:12px;padding:5px 10px">📎 Attach</span>
        </label>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:#6b7280;cursor:pointer">
          <input type="checkbox" checked style="accent-color:#c41230"> Track opens
        </label>
      </div>
    </div>
  </div>`;
}
