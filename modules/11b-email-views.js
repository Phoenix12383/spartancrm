// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11b-email-views.js
// Extracted from 11-email-page.js on 2026-05-02 as part of monolith breakup.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-02) ────────
defineAction('email-views-mark-read', function(target, ev) {
  const msgId = target.dataset.emailId;
  emailMarkRead(msgId);
});

defineAction('email-views-select-sent', function(target, ev) {
  const msgId = target.dataset.emailId;
  emailSelectSent(msgId);
});

defineAction('email-views-reply', function(target, ev) {
  const msgId = target.dataset.emailId;
  replyToEmail(msgId);
});

defineAction('email-views-forward', function(target, ev) {
  const msgId = target.dataset.emailId;
  forwardEmail(msgId);
});

defineAction('email-views-download-attachment', function(target, ev) {
  const msgId = target.dataset.emailId;
  const idx = target.dataset.attachmentIdx;
  downloadEmailAttachmentByIdx(msgId, idx);
});

defineAction('email-views-quick-reply', function(target, ev) {
  const msgId = target.dataset.emailId;
  quickReplyEmail(msgId);
});

defineAction('email-views-goto-deal', function(target, ev) {
  const dealId = target.dataset.dealId;
  setState({dealDetailId: dealId, page: 'deals'});
});

defineAction('email-views-goto-contact', function(target, ev) {
  const contactId = target.dataset.contactId;
  setState({contactDetailId: contactId, page: 'contacts'});
});

defineAction('email-views-goto-lead', function(target, ev) {
  const leadId = target.dataset.leadId;
  setState({leadDetailId: leadId, page: 'leads'});
});

defineAction('email-views-select-tracking', function(target, ev) {
  const msgId = target.dataset.emailId;
  setState({emailSelectedId: msgId, emailFolder: 'tracking'});
});

// ── Email list ────────────────────────────────────────────────────────────────
function renderEmailList(msgs, folder, selectedId) {
  if (msgs.length===0) return `<div style="padding:40px;text-align:center;color:#9ca3af;font-size:13px">No emails here</div>`;
  return msgs.map(msg=>{
    const isInbox = folder==='inbox';
    const name = isInbox ? (msg.fromName||msg.from) : (msg.toName||msg.to);
    const isSelected = msg.id === selectedId;
    const isUnread = isInbox && !msg.read;
    const hasAttach = msg.attachments && msg.attachments.length > 0;
    const bodyPreview = (msg.body||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
    const subjShort = msg.subject ? msg.subject.slice(0,30) : '';
    return `<div data-action="${isInbox?'email-views-mark-read':'email-views-select-sent'}" data-email-id="${msg.id}"
      style="padding:14px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:${isSelected?'#fff5f6':isUnread?'#fafeff':'#fff'};border-left:3px solid ${isSelected?'#c41230':'transparent'}"
      onmouseover="this.style.background='${isSelected?'#fff5f6':'#f9fafb'}'" onmouseout="this.style.background='${isSelected?'#fff5f6':isUnread?'#fafeff':'#fff'}'">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
        <div style="font-size:13px;font-weight:${isUnread?700:500};color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${_escHtml(name)}</div>
        <div style="font-size:11px;color:#9ca3af;flex-shrink:0;margin-left:6px">${_escHtml(msg.time)}</div>
      </div>
      <div style="font-size:12px;font-weight:${isUnread?600:400};color:${isUnread?'#374151':'#6b7280'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:3px">${_escHtml(msg.subject)}</div>
      <div style="font-size:11px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_escHtml(bodyPreview)}…</div>
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        ${msg.dealId?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">Deal</span>`:''}
        ${msg.leadId?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#ede9fe;color:#6d28d9;font-weight:600">Lead</span>`:''}
        ${msg.contactId?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#dcfce7;color:#15803d;font-weight:600">Contact</span>`:''}
        ${hasAttach?`<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:#e0f2fe;color:#0369a1;font-weight:600">\ud83d\udcce ${msg.attachments.length}</span>`:''}        ${folder==='sent'&&msg.opened?`<span class="etrack" style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f0fdf4;color:#15803d;display:inline-flex;align-items:center;gap:3px">👁 ${msg.opens||1}×<span class="etrack-tip">📧 <strong>${_escHtml(subjShort)}</strong><br>👁 Opened ${msg.opens||1} time${(msg.opens||1)!==1?'s':''}<br>📅 ${_escHtml(msg.openedAt||msg.date||'')}<br>👤 ${_escHtml(msg.toName||msg.to||'')}</span></span>`:folder==='sent'&&!msg.opened?`<span class="etrack" style="font-size:10px;padding:1px 6px;border-radius:10px;background:#f3f4f6;color:#9ca3af">Not opened<span class="etrack-tip">📧 <strong>${_escHtml(subjShort)}</strong><br>❌ Not yet opened<br>📅 Sent: ${_escHtml(msg.date||'')}<br>👤 To: ${_escHtml(msg.toName||msg.to||'')}</span></span>`:''}
        ${isUnread?`<div style="width:7px;height:7px;border-radius:50%;background:#c41230;margin-left:auto;flex-shrink:0;margin-top:2px"></div>`:''}
      </div>
    </div>`;
  }).join('');
}


// ── Email detail view ─────────────────────────────────────────────────────────
function renderEmailDetail(msg) {
  const {deal, contact, lead} = emailGetLinkedEntity(msg);
  const isInbox = getState().emailInbox.find(m=>m.id===msg.id);
  const name = isInbox ? (msg.fromName||msg.from) : (msg.toName||msg.to);
  const emailAddr = isInbox ? msg.from : msg.to;
  const initial = _escHtml((name||'?')[0].toUpperCase());

  return `
  <div style="padding:24px;max-width:720px">
    <!-- Email header -->
    <div style="margin-bottom:20px">
      <h2 style="font-size:18px;font-weight:700;margin:0 0 12px;line-height:1.3;font-family:Syne,sans-serif">${_escHtml(msg.subject)}</h2>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="width:36px;height:36px;border-radius:50%;background:#c41230;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${initial}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600">${_escHtml(name)}</div>
          <div style="font-size:12px;color:#6b7280">${_escHtml(emailAddr)} · ${_escHtml(msg.date||'')} ${_escHtml(msg.time||'')}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${isInbox?`<button data-action="email-views-reply" data-email-id="${msg.id}" class="btn-w" style="font-size:12px;gap:5px">${Icon({n:'arr',size:13})} Reply</button>`:''}
          ${isInbox?`<button data-action="email-views-forward" data-email-id="${msg.id}" class="btn-w" style="font-size:12px">Forward</button>`:''}
          ${!isInbox&&!msg.opened?`<span style="font-size:12px;color:#9ca3af;padding:5px 10px;background:#f3f4f6;border-radius:20px">Not opened</span>`:!isInbox&&msg.opened?`<span style="font-size:12px;color:#15803d;padding:5px 10px;background:#f0fdf4;border-radius:20px">✓ Opened ${msg.opens}×</span>`:''}
        </div>
      </div>
    </div>

    <!-- Tracking info (sent only) -->
    ${!isInbox&&msg.opened?`
    <div style="padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:10px;margin-bottom:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-size:22px">👁</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:#15803d">Opened ${msg.opens}× time${msg.opens!==1?'s':''}</div>
            <div style="font-size:12px;color:#16a34a">Last opened: ${_escHtml(msg.openedAt||msg.date||'')}</div>
          </div>
          ${msg.clicked?`<div style="display:flex;align-items:center;gap:6px;padding:4px 12px;background:#dbeafe;border-radius:20px"><span>🔗</span><span style="font-size:12px;font-weight:600;color:#1d4ed8">Link clicked</span></div>`:''}
        </div>
      </div>
    </div>`:!isInbox?`
    <div style="padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between">
      <div style="display:flex;align-items:center;gap:8px;color:#9ca3af;font-size:13px"><span>👁</span> Not yet opened</div>
    </div>`:''}

    <!-- Linked entities -->
    ${deal||contact||lead?`
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${deal?`<div data-action="email-views-goto-deal" data-deal-id="${deal.id}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dbeafe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#1d4ed8" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${Icon({n:'deals',size:13})} ${_escHtml(deal.title)}</div>`:''}
      ${contact?`<div data-action="email-views-goto-contact" data-contact-id="${contact.id}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dcfce7;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#15803d" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${Icon({n:'contacts',size:13})} ${_escHtml(contact.fn)} ${_escHtml(contact.ln)}</div>`:''}
      ${lead?`<div data-action="email-views-goto-lead" data-lead-id="${lead.id}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#ede9fe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#6d28d9" onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">${Icon({n:'leads',size:13})} ${_escHtml(lead.fn)} ${_escHtml(lead.ln)}</div>`:''}
    </div>`:''}

    <!-- Email body — escaped to prevent HTML injection (broken tags in inbound
         HTML emails would otherwise collapse the surrounding layout). -->
    <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;font-size:14px;line-height:1.8;color:#374151;font-family:'DM Sans',sans-serif;border:1px solid #f0f0f0;overflow:hidden">${_sanitizeEmailBody(msg.body||'')}</div>

    <!-- Attachments -->
    ${(msg.attachments && msg.attachments.length > 0) ? `
    <div style="margin-top:12px">
      <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px">\ud83d\udcce ${msg.attachments.length} Attachment${msg.attachments.length!==1?'s':''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${msg.attachments.map(function(att, idx){
          var icon = att.mimeType && att.mimeType.includes('image') ? '\ud83d\uddbc' : att.mimeType && att.mimeType.includes('pdf') ? '\ud83d\udcc4' : att.name && att.name.match(/\.(xlsx?|csv)$/i) ? '\ud83d\udcca' : '\ud83d\udcc1';
          var sizeStr = att.size > 1048576 ? (att.size/1048576).toFixed(1)+'MB' : att.size > 1024 ? Math.round(att.size/1024)+'KB' : att.size+'B';
          // Pass msg.id + attachment index through the handler so the lookup
          // can resolve the attachment from state — no need to escape names/ids
          // for JS-string context.
          return '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;cursor:pointer;max-width:250px" data-action="email-views-download-attachment" data-email-id="'+msg.id+'" data-attachment-idx="'+idx+'">' +
            '<span style="font-size:18px">'+icon+'</span>' +
            '<div style="min-width:0"><div style="font-size:12px;font-weight:600;color:#0369a1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_escHtml(att.name)+'</div>' +
            '<div style="font-size:10px;color:#6b7280">'+sizeStr+'</div></div></div>';
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Quick reply -->
    ${isInbox?`
    <div style="margin-top:20px;border:1.5px solid #e5e7eb;border-radius:12px;overflow:hidden">
      <div style="padding:10px 16px;background:#f9fafb;border-bottom:1px solid #f0f0f0;font-size:12px;color:#6b7280">Reply to ${_escHtml(msg.fromName||msg.from)}</div>
      <textarea id="quickReply_${msg.id}" rows="4" placeholder="Write a reply…" style="width:100%;padding:14px 16px;border:none;outline:none;font-size:13px;font-family:inherit;resize:none;color:#1a1a1a"></textarea>
      <div style="padding:10px 16px;background:#f9fafb;border-top:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;gap:6px">
          <button data-action="email-views-reply" data-email-id="${msg.id}" class="btn-w" style="font-size:12px">Expand</button>
        </div>
        <button data-action="email-views-quick-reply" data-email-id="${msg.id}" class="btn-r" style="font-size:12px;gap:6px">${Icon({n:'send',size:13})} Send Reply</button>
      </div>
    </div>`:''}
  </div>`;
}


// ── Tracking list ─────────────────────────────────────────────────────────────
function renderEmailTrackingList() {
  const sent = getState().emailSent;
  const sorted = [...sent].sort((a,b)=>b.date>a.date?1:-1);
  const openRate = sent.length>0?Math.round(sent.filter(m=>m.opened).length/sent.length*100):0;
  return `
    <div style="padding:10px 12px;border-bottom:1px solid #f0f0f0;background:#fff">
      <div style="display:flex;gap:12px;font-size:12px">
        <span style="color:#15803d;font-weight:600">📬 ${openRate}% open rate</span>
        <span style="color:#6b7280">${sent.length} emails sent</span>
        <span style="color:#0369a1">${sent.filter(m=>m.clicked).length} link clicks</span>
      </div>
    </div>
    ${sorted.map(m=>{
      const isSelected = getState().emailSelectedId===m.id;
      return `<div data-action="email-views-select-tracking" data-email-id="${m.id}"
        style="padding:12px 16px;border-bottom:1px solid #f0f0f0;cursor:pointer;background:${isSelected?'#fff5f6':'#fff'};border-left:3px solid ${isSelected?'#c41230':'transparent'}"
        onmouseover="this.style.background='${isSelected?'#fff5f6':'#f9fafb'}'" onmouseout="this.style.background='${isSelected?'#fff5f6':'#fff'}'">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <div style="font-size:12px;font-weight:600;color:#1a1a1a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${_escHtml(m.toName||m.to)}</div>
          <span style="font-size:11px;color:#9ca3af">${_escHtml(m.date)}</span>
        </div>
        <div style="font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:5px">${_escHtml(m.subject)}</div>
        <div style="display:flex;gap:6px">
          ${m.opened?`<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f0fdf4;color:#15803d;font-weight:600;display:inline-flex;align-items:center;gap:3px">👁 ${m.opens}× opened</span>`:
            `<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#f3f4f6;color:#9ca3af">👁 Not yet opened</span>`}
          ${m.clicked?`<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#dbeafe;color:#1d4ed8;font-weight:600">🔗 Clicked</span>`:''}
          ${m.templateId?`<span style="font-size:10px;padding:1px 7px;border-radius:10px;background:#ede9fe;color:#6d28d9">Template</span>`:''}
        </div>
      </div>`;
    }).join('')}`;
}


// ── Tracking detail ───────────────────────────────────────────────────────────
function renderEmailTrackingDetail(msg) {
  if (!msg) return renderEmailEmpty();
  const {deal, contact, lead} = emailGetLinkedEntity(msg);
  return `
  <div style="padding:24px;max-width:700px">
    <div style="margin-bottom:20px">
      <h2 style="font-size:17px;font-weight:700;margin:0 0 4px;font-family:Syne,sans-serif">${_escHtml(msg.subject)}</h2>
      <div style="font-size:12px;color:#6b7280">To: ${_escHtml(msg.toName||msg.to)} · ${_escHtml(msg.date||'')} ${_escHtml(msg.time||'')}</div>
    </div>

    <!-- Tracking stats -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">
      ${[
        ['Opens', msg.opens, msg.opened?'#15803d':'#9ca3af', msg.opened?'✓':'—'],
        ['Last opened', msg.openedAt||'—', '#374151', ''],
        ['Links clicked', msg.clicked?'Yes':'No', msg.clicked?'#0369a1':'#9ca3af', ''],
      ].map(([l,v,col])=>`
        <div style="padding:12px 16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;text-align:center">
          <div style="font-size:20px;font-weight:800;color:${col};font-family:Syne,sans-serif">${_escHtml(v)}</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">${_escHtml(l)}</div>
        </div>`).join('')}
    </div>

    <!-- Linked -->
    ${deal||contact||lead?`
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      ${deal?`<div data-action="email-views-goto-deal" data-deal-id="${deal.id}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dbeafe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#1d4ed8">${Icon({n:'deals',size:13})} ${_escHtml(deal.title)}</div>`:''}
      ${contact?`<div data-action="email-views-goto-contact" data-contact-id="${contact.id}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#dcfce7;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#15803d">${Icon({n:'contacts',size:13})} ${_escHtml(contact.fn)} ${_escHtml(contact.ln)}</div>`:''}
      ${lead?`<div data-action="email-views-goto-lead" data-lead-id="${lead.id}" style="display:flex;align-items:center;gap:8px;padding:6px 12px;background:#ede9fe;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;color:#6d28d9">${Icon({n:'leads',size:13})} ${_escHtml(lead.fn)} ${_escHtml(lead.ln)}</div>`:''}
    </div>`:''}

    <!-- Email body (escaped for same reasons as renderEmailDetail) -->
    <div style="background:#f9fafb;border-radius:12px;padding:20px 24px;font-size:13px;line-height:1.8;color:#374151;border:1px solid #f0f0f0;overflow:hidden">${_sanitizeEmailBody(msg.body||'')}</div>
  </div>`;
}


// Look up an attachment by msg id + attachment index and hand it off to the
// existing downloader. Keeps onclick handlers small and avoids having to
// JS-string-escape filenames that contain quotes/special characters.
function downloadEmailAttachmentByIdx(msgId, idx) {
  var s = getState();
  var msg = [...s.emailInbox, ...s.emailSent, ...s.emailDrafts].find(m => m.id === msgId);
  if (!msg || !msg.attachments || !msg.attachments[idx]) return;
  var att = msg.attachments[idx];
  if (typeof downloadGmailAttachment === 'function') {
    downloadGmailAttachment(att.messageId, att.attachmentId, att.name || 'attachment');
  }
}


// ── Helpers ───────────────────────────────────────────────────────────────────
function emailGetLinkedEntity(msg) {
  const s = getState();
  let deal = null, contact = null, lead = null;
  if (msg.dealId)    deal    = s.deals.find(d=>d.id===msg.dealId);
  if (msg.contactId) contact = s.contacts.find(c=>c.id===msg.contactId);
  if (msg.leadId)    lead    = s.leads.find(l=>l.id===msg.leadId);
  // Auto-match by email if not explicitly linked
  if (!contact && !lead) {
    const emailAddr = msg.from || msg.to;
    contact = s.contacts.find(c=>c.email===emailAddr);
    if (!contact) lead = s.leads.find(l=>l.email===emailAddr);
  }
  if (!deal && contact) deal = s.deals.find(d=>d.cid===contact.id);
  return {deal, contact, lead};
}
